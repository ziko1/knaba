import {z} from 'zod';
import {SEARCHABLE_SOURCES,TRADE_CATEGORIES} from './lead-agent-catalog.ts';

const cents=z.number().int().nonnegative().max(100_000_000);
const boundedWords=z.array(z.string().trim().min(1).max(80)).max(20);
export const profileSchema=z.object({
  name:z.string().trim().min(2).max(100),
  sources:z.array(z.enum(SEARCHABLE_SOURCES)).min(1).max(2).refine(v=>new Set(v).size===v.length),
  categories:z.array(z.enum(['painting','drywall','flooring','cleaning','landscaping','construction','moving','installation'])).max(8),
  includeWords:boundedWords.default([]),excludeWords:boundedWords.default([]),
  nutsCodes:z.array(z.string().regex(/^DE(?:300|40[0-9A-Z]{0,2})$/)).min(1).max(20).default(['DE300']),
  postcodes:z.array(z.string().regex(/^\d{5}$/)).max(100).default([]),
  center:z.object({latitude:z.number().min(50).max(54),longitude:z.number().min(11).max(15.5)}).strict().default({latitude:52.52,longitude:13.405}),
  radiusKm:z.number().int().min(1).max(200).default(50),
  unknownLocation:z.enum(['REVIEW','EXCLUDE']).default('REVIEW'),
  minimumBudgetCents:cents.nullable().default(null),maximumBudgetCents:cents.nullable().default(null),
  unknownBudget:z.enum(['REVIEW','EXCLUDE']).default('REVIEW'),
  maximumAgeDays:z.number().int().min(1).max(90).default(30),
  minimumScore:z.number().int().min(0).max(100).default(35),
  scheduleEnabled:z.boolean().default(false),intervalMinutes:z.number().int().min(60).max(10080).default(180),
  mode:z.enum(['DISCOVER','DRAFTS']).default('DRAFTS'),
  laborCostPerHourCents:cents.default(3000),sellRatePerHourCents:cents.default(4500),
  minimumMarginBps:z.number().int().min(0).max(9000).default(2000),
  vatBps:z.number().int().min(0).max(3000).nullable().default(null)
}).strict().superRefine((p,c)=>{if(p.minimumBudgetCents!==null&&p.maximumBudgetCents!==null&&p.minimumBudgetCents>p.maximumBudgetCents)c.addIssue({code:'custom',path:['maximumBudgetCents'],message:'Maximum must be at least minimum'});});
export type SearchProfile=z.infer<typeof profileSchema>;
export const opportunitySchema=z.object({
  source:z.enum(SEARCHABLE_SOURCES),externalId:z.string().min(1).max(250),
  title:z.string().min(1).max(500),description:z.string().max(16000),url:z.string().url().max(2000),
  publishedAt:z.string().datetime().nullable(),deadlineAt:z.string().datetime().nullable(),
  location:z.string().max(400).nullable(),postcode:z.string().regex(/^\d{5}$/).nullable(),
  nutsCodes:z.array(z.string().max(10)).max(30),cpvCodes:z.array(z.string().regex(/^\d{8}$/)).max(100),
  coordinates:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).strict().nullable(),
  budgetCents:cents.nullable(),budgetBasis:z.enum(['NET','GROSS','UNKNOWN']),currency:z.literal('EUR'),
  kind:z.enum(['TENDER','AWARD','PRIOR_INFORMATION','UNKNOWN']),
  availability:z.enum(['OPEN_NOTICE','CANCELLED','UNKNOWN']),
  procedureId:z.string().max(250).nullable(),
  noticeType:z.string().max(150).nullable()
}).strict();
export type Opportunity=z.infer<typeof opportunitySchema>;
export interface MatchResult {eligible:boolean;score:number;reasons:string[];review:string[];distanceKm:number|null;budgetMatches:boolean|null;}

const normalized=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('de-DE');
export function distanceKm(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}) {
  const rad=(v:number)=>v*Math.PI/180,lat=rad(b.latitude-a.latitude),lon=rad(b.longitude-a.longitude);
  const haversine=Math.min(1,Math.max(0,Math.sin(lat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(lon/2)**2));
  return Math.round(6371*2*Math.atan2(Math.sqrt(haversine),Math.sqrt(1-haversine))*10)/10;
}
export function evaluateOpportunity(input:Opportunity,profile:SearchProfile,now:string):MatchResult {
  const reasons:string[]=[],review:string[]=[];let eligible=true,score=30;
  const reject=(reason:string)=>{eligible=false;reasons.push(reason);};
  const text=normalized(input.title+' '+input.description);
  if(input.kind!=='TENDER')reject('NOT_AN_OPEN_TENDER');
  if(input.availability==='CANCELLED')reject('CANCELLED');
  if(input.availability==='UNKNOWN')review.push('AVAILABILITY_UNCONFIRMED');
  if(input.deadlineAt&&Date.parse(input.deadlineAt)<=Date.parse(now))reject('DEADLINE_PASSED');
  if(!input.deadlineAt)review.push('DEADLINE_UNKNOWN');
  if(!input.publishedAt)review.push('PUBLICATION_DATE_UNKNOWN');
  else if(Date.parse(now)-Date.parse(input.publishedAt)>profile.maximumAgeDays*86400000)reject('TOO_OLD');
  if(profile.excludeWords.some(w=>text.includes(normalized(w))))reject('EXCLUDED_KEYWORD');
  if(profile.includeWords.length&&!profile.includeWords.some(w=>text.includes(normalized(w))))reject('INCLUDE_KEYWORD_MISSING');
  if(profile.includeWords.some(w=>text.includes(normalized(w)))){score+=20;reasons.push('KEYWORD_MATCH');}
  if(profile.categories.length){
    const matched=TRADE_CATEGORIES.filter(c=>profile.categories.includes(c.id)).some(c=>c.words.some(w=>text.includes(normalized(w)))||c.cpv.some(code=>input.cpvCodes.some(found=>found.startsWith(code.replace(/0+$/,'')))));
    if(!matched)reject('TRADE_MISMATCH');else {score+=25;reasons.push('TRADE_MATCH');}
  }
  const distance=input.coordinates?distanceKm(profile.center,input.coordinates):null;
  if(distance!==null){if(distance>profile.radiusKm)reject('OUTSIDE_RADIUS');else {score+=15;reasons.push('WITHIN_RADIUS');}}
  else {if(profile.unknownLocation==='EXCLUDE')reject('DISTANCE_UNKNOWN');else review.push('DISTANCE_UNKNOWN');}
  if(profile.postcodes.length){if(input.postcode&&!profile.postcodes.includes(input.postcode))reject('POSTCODE_MISMATCH');else if(!input.postcode){if(profile.unknownLocation==='EXCLUDE')reject('POSTCODE_UNKNOWN');else review.push('POSTCODE_UNKNOWN');}}
  if(input.nutsCodes.length){if(!input.nutsCodes.some(code=>profile.nutsCodes.some(n=>code.startsWith(n)||n.startsWith(code))))reject('REGION_MISMATCH');else {score+=10;reasons.push('REGION_MATCH');}}
  else review.push('REGION_UNKNOWN');
  let budgetMatches:boolean|null=null;
  // Profiles express NET project budgets, never hourly rates or estimated tender values in another basis.
  if(input.budgetCents!==null&&input.budgetBasis==='NET'){
    budgetMatches=(profile.minimumBudgetCents===null||input.budgetCents>=profile.minimumBudgetCents)&&(profile.maximumBudgetCents===null||input.budgetCents<=profile.maximumBudgetCents);
    if(!budgetMatches)reject('BUDGET_MISMATCH');else {score+=15;reasons.push('NET_BUDGET_MATCH');}
  }else if(profile.unknownBudget==='EXCLUDE')reject('NET_BUDGET_UNKNOWN');else review.push('NET_BUDGET_UNKNOWN');
  score=Math.min(100,score);if(score<profile.minimumScore)reject('BELOW_MINIMUM_SCORE');
  return {eligible,score,reasons:[...new Set(reasons)],review:[...new Set(review)],distanceKm:distance,budgetMatches};
}

export const estimateSchema=z.object({laborMinutes:z.number().int().min(1).max(600000),people:z.number().int().min(1).max(100),materialCents:cents,travelCents:cents,platformFeeCents:cents.nullable(),otherCents:cents,quantityVerified:z.boolean().default(false)}).strict();
export type EstimateInput=z.infer<typeof estimateSchema>;
const ceil=(a:bigint,b:bigint)=>(a+b-1n)/b;
const bounded=(v:bigint)=>{if(v>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('PRICE_OVERFLOW');return Number(v);};
export function estimatePrice(profile:SearchProfile,input:EstimateInput){
  const minutes=BigInt(input.laborMinutes)*BigInt(input.people);
  const laborCost=ceil(minutes*BigInt(profile.laborCostPerHourCents),60n);
  if(input.platformFeeCents===null)return {status:'INCOMPLETE' as const,reason:'PLATFORM_FEE_UNKNOWN',laborCostCents:bounded(laborCost),netCents:null,grossCents:null,marginBps:null};
  const extras=BigInt(input.materialCents)+BigInt(input.travelCents)+BigInt(input.platformFeeCents)+BigInt(input.otherCents);
  const cost=laborCost+extras;
  const floor=ceil(cost*10000n,BigInt(10000-profile.minimumMarginBps));
  const byRate=ceil(minutes*BigInt(profile.sellRatePerHourCents),60n)+extras;
  const net=byRate>floor?byRate:floor;
  const tax=profile.vatBps===null?null:(net*BigInt(profile.vatBps)+5000n)/10000n;
  return {status:'ESTIMATE' as const,reason:input.quantityVerified?'REQUIRES_ERP_QUOTE_APPROVAL':'QUANTITY_UNVERIFIED',laborCostCents:bounded(laborCost),totalCostCents:bounded(cost),netCents:bounded(net),grossCents:tax===null?null:bounded(net+tax),vatCents:tax===null?null:bounded(tax),marginBps:net===0n?null:Number((net-cost)*10000n/net),currency:'EUR',binding:false};
}
