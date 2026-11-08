import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {DomainError} from '../domain/core.ts';
import {TRADE_CATEGORIES,SEARCHABLE_SOURCES} from '../domain/lead-agent-catalog.ts';
import {opportunitySchema,profileSchema,type Opportunity,type SearchProfile} from '../domain/lead-agent-model.ts';

export const BERLIN_FEED='https://www.berlin.de/vergabeplattform/veroeffentlichungen/bekanntmachungen/feed.rss';
export const TED_SEARCH='https://api.ted.europa.eu/v3/notices/search';
const MAX_BYTES=2_000_000;
const MAX_ITEMS=200;
const values=(v:unknown):string[]=>Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,200):typeof v==='string'?[v]:[];
const text=(v:unknown,max=16000):string=>typeof v==='string'?v.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const localized=(v:any,max=16000):string=>text(typeof v==='string'?v:(v?.deu??v?.eng??Object.values(v??{}).find(x=>typeof x==='string'||Array.isArray(x))),max)||text(values(v?.deu??v?.eng).join(' '),max);
function sourceError(code:string){return new DomainError('LEAD_SOURCE_UNAVAILABLE',{reason:code});}
function safeLink(value:unknown,hosts:string[]){
  if(typeof value!=='string')throw sourceError('INVALID_SOURCE_URL');
  const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!hosts.includes(u.hostname))throw sourceError('INVALID_SOURCE_URL');
  u.hash='';return u.toString();
}
const iso=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
/** Only accept one unambiguous Europe/Berlin local time, including DST transitions. */
export function berlinDateTime(year:number,month:number,day:number,hour=0,minute=0):string|null {
  if(year<2000||year>2100||month<1||month>12||day<1||day>31||hour<0||hour>23||minute<0||minute>59)return null;
  const intended=[year,month,day,hour,minute];
  const format=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const matches=[60,120].map(offset=>new Date(Date.UTC(year,month-1,day,hour,minute)-offset*60000)).filter(date=>{
    const parts=Object.fromEntries(format.formatToParts(date).map(p=>[p.type,p.value]));
    return ['year','month','day','hour','minute'].every((k,i)=>Number(parts[k])===intended[i]);
  });
  return matches.length===1?matches[0].toISOString():null;
}
function germanDate(value:string,withTime:boolean){const m=value.match(withTime?/(\d{2})\.(\d{2})\.(\d{4}),?\s*(\d{2}):(\d{2})/:/(\d{2})\.(\d{2})\.(\d{4})/);return m?berlinDateTime(Number(m[3]),Number(m[2]),Number(m[1]),Number(m[4]??0),Number(m[5]??0)):null;}
export function parseBerlinFeed(xml:string):Opportunity[]{
  if(Buffer.byteLength(xml)>MAX_BYTES||/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)||XMLValidator.validate(xml)!==true)throw sourceError('INVALID_RSS');
  const parsed=new XMLParser({ignoreAttributes:true,parseTagValue:false,processEntities:true,trimValues:true,isArray:name=>name==='item'}).parse(xml);
  if(!parsed?.rss?.channel||!Object.prototype.hasOwnProperty.call(parsed.rss.channel,'title'))throw sourceError('INVALID_RSS');
  const rows=parsed.rss.channel.item??[];
  if(!Array.isArray(rows)||rows.length>1000)throw sourceError('INVALID_RSS');
  const result:Opportunity[]=[];
  for(const row of rows.slice(0,MAX_ITEMS)){
    const title=text(row.title,500),raw=typeof row.description==='string'?row.description:'';
    if(!title||!row.link)throw sourceError('RSS_SCHEMA_CHANGED');
    const description=text(raw),url=safeLink(row.link,['meinauftrag.rib.de','www.berlin.de']);
    const location=text(raw.match(/Ausführungsort:\s*([^<\r\n]+)/i)?.[1],400)||null;
    const postcode=location?.match(/\b\d{5}\b/)?.[0]??null;
    const deadlineFragment=raw.match(/(?:Ablauf (?:der )?(?:Angebotsfrist|Teilnahmefrist)|Eröffnungstermin):\s*([^<\r\n]+)/i)?.[1]??'';
    const publicationFragment=raw.match(/Online seit:\s*([^<\r\n]+)/i)?.[1]??'';
    const berlin=location!==null&&/\bBerlin\b/i.test(location);
    result.push(opportunitySchema.parse({source:'berlin_vergabe',externalId:String(row.guid??url).slice(0,250),title,description,url,publishedAt:germanDate(publicationFragment,false),deadlineAt:germanDate(deadlineFragment,true),location,postcode,nutsCodes:berlin?['DE300']:[],cpvCodes:[],coordinates:null,budgetCents:null,budgetBasis:'UNKNOWN',currency:'EUR',kind:'TENDER',availability:/^Aufhebung\b/i.test(title)?'CANCELLED':'OPEN_NOTICE',procedureId:null,noticeType:'BERLIN_RSS_CURRENT_NOTICES'}));
  }
  return result;
}

export const TED_FIELDS=['publication-number','notice-title','title-proc','description-proc','publication-date','notice-type','form-type','place-of-performance','place-of-performance-city-proc','place-of-performance-post-code-proc','classification-cpv','deadline-receipt-tender-date-lot','deadline-receipt-tender-time-lot','deadline-receipt-request-date-lot','deadline-receipt-request-time-lot','procedure-identifier'];
export function tedQuery(input:SearchProfile,now:string){
  const p=profileSchema.parse(input),since=new Date(Date.parse(now)-p.maximumAgeDays*86400000).toISOString().slice(0,10).replaceAll('-','');
  // No user-supplied query language: region and category codes come from validated, bounded inputs.
  const regions=p.nutsCodes.map(n=>n.length<5?n+'*':n);
  const codes=[...new Set(TRADE_CATEGORIES.filter(c=>p.categories.includes(c.id)).flatMap(c=>[...c.cpv]))];
  const cpv=codes.length?` AND classification-cpv IN (${codes.map(code=>code.replace(/0+$/,'')+'*').join(' ')})`:'';
  return `place-of-performance IN (${regions.join(' ')}) AND notice-type IN (cn-standard cn-social subco cn-desg pin-cfc-standard pin-cfc-social qu-sy) AND publication-date >= ${since}${cpv} SORT BY publication-date DESC`;
}
function tedDeadline(row:any){
  const dates=values(row['deadline-receipt-tender-date-lot']).length?values(row['deadline-receipt-tender-date-lot']):values(row['deadline-receipt-request-date-lot']);
  const times=values(row['deadline-receipt-tender-date-lot']).length?values(row['deadline-receipt-tender-time-lot']):values(row['deadline-receipt-request-time-lot']);
  // Multiple lots have individual deadlines. Never present one lot's deadline as the entire procedure's deadline.
  if(dates.length!==1||times.length!==1)return null;
  const d=dates[0].match(/^(\d{4}-\d\d-\d\d)(Z|[+-]\d\d:\d\d)?$/),t=times[0].match(/^(\d\d:\d\d(?::\d\d(?:\.\d+)?)?)(Z|[+-]\d\d:\d\d)?$/);
  if(!d||!t||!t[2]&&!d[2])return null;
  return iso(`${d[1]}T${t[1]}${t[2]??d[2]}`);
}
export function parseTedResponse(body:unknown):{items:Opportunity[];total:number;timedOut:boolean}{
  const data=body as any;
  if(!data||!Array.isArray(data.notices)||data.notices.length>MAX_ITEMS||!Number.isSafeInteger(data.totalNoticeCount)||data.totalNoticeCount<0||typeof data.timedOut!=='boolean')throw sourceError('TED_SCHEMA_CHANGED');
  const items=data.notices.map((r:any):Opportunity=>{
    const id=String(r['publication-number']??'');if(!/^\d{1,9}-\d{4}$/.test(id))throw sourceError('TED_SCHEMA_CHANGED');
    const noticeType=text(r['notice-type'],150),form=text(r['form-type'],50);
    // The documented API may omit form-type even when requested. Its notice-type is authoritative.
    const competition=['cn-standard','cn-social','subco','cn-desg','pin-cfc-standard','pin-cfc-social','qu-sy'];
    const kind=competition.includes(noticeType)?'TENDER':noticeType.startsWith('can-')?'AWARD':noticeType?'UNKNOWN':form==='competition'?'TENDER':form==='result'?'AWARD':form==='planning'?'PRIOR_INFORMATION':'UNKNOWN';
    const date=r['publication-date'];
    const publishedAt=iso(date)??(typeof date==='string'&&/^\d{4}-\d\d-\d\d(?:Z|[+-]\d\d:\d\d)?$/.test(date)?iso(date.slice(0,10)+'T00:00:00'+(date.slice(10)||'Z')):null);
    return opportunitySchema.parse({source:'ted',externalId:id,title:localized(r['title-proc']??r['notice-title'],500),description:localized(r['description-proc']),url:`https://ted.europa.eu/de/notice/-/detail/${id}`,publishedAt,deadlineAt:tedDeadline(r),location:values(r['place-of-performance-city-proc']).join(', ').slice(0,400)||null,postcode:values(r['place-of-performance-post-code-proc']).find(p=>/^\d{5}$/.test(p))??null,nutsCodes:values(r['place-of-performance']).filter(p=>/^DE[0-9][0-9A-Z]{0,2}$/.test(p)).slice(0,30),cpvCodes:values(r['classification-cpv']).filter(c=>/^\d{8}$/.test(c)).slice(0,100),coordinates:null,budgetCents:null,budgetBasis:'UNKNOWN',currency:'EUR',kind,availability:kind==='TENDER'?'OPEN_NOTICE':'UNKNOWN',procedureId:text(r['procedure-identifier'],250)||null,noticeType:noticeType||null});
  });
  return {items,total:data.totalNoticeCount,timedOut:data.timedOut};
}

export type SourceBatch={source:string;items:Opportunity[];status:'SUCCESS'|'FAILED'|'PARTIAL'|'BLOCKED';reason?:string;truncated?:boolean};
export type LeadFetch=typeof fetch;
async function boundedFetch(url:string,init:RequestInit,request:LeadFetch){
  if(![BERLIN_FEED,TED_SEARCH].includes(url))throw sourceError('EGRESS_DENIED');
  const timer=AbortSignal.timeout(20000);
  const response=await request(url,{...init,redirect:'error',credentials:'omit',signal:timer,headers:{Accept:url===TED_SEARCH?'application/json':'application/rss+xml, application/xml, text/xml','User-Agent':'KNABA-LeadAgent/1.0 (+https://knaba.de)',...init.headers}});
  if(!response.ok){await response.body?.cancel();throw sourceError(response.status===429?'RATE_LIMITED':`HTTP_${response.status}`);}
  const type=response.headers.get('content-type')??'';
  if(url===TED_SEARCH?!/application\/json/i.test(type):!/(?:rss\+xml|application\/xml|text\/xml)/i.test(type)){await response.body?.cancel();throw sourceError('UNEXPECTED_CONTENT_TYPE');}
  if(Number(response.headers.get('content-length')??0)>MAX_BYTES){await response.body?.cancel();throw sourceError('RESPONSE_TOO_LARGE');}
  const reader=response.body?.getReader();if(!reader)throw sourceError('EMPTY_RESPONSE');
  const chunks:Uint8Array[]=[];let bytes=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES)throw sourceError('RESPONSE_TOO_LARGE');chunks.push(value);}}
  finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}
export async function searchLeadSource(source:string,input:SearchProfile,now:string,request:LeadFetch=fetch):Promise<SourceBatch>{
  if(!SEARCHABLE_SOURCES.includes(source as any))return {source,items:[],status:'BLOCKED',reason:'SOURCE_PERMISSION_OR_ADAPTER_MISSING'};
  try{
    if(source==='berlin_vergabe')return {source,items:parseBerlinFeed(await boundedFetch(BERLIN_FEED,{method:'GET'},request)),status:'SUCCESS',truncated:true};
    const profile=profileSchema.parse(input),query=tedQuery(profile,now),items:Opportunity[]=[];
    let total=0;
    for(let page=1;page<=2;page++){
      const raw=await boundedFetch(TED_SEARCH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,fields:TED_FIELDS,page,limit:100,scope:'ACTIVE',onlyLatestVersions:true,paginationMode:'PAGE_NUMBER'})},request);
      const result=parseTedResponse(JSON.parse(raw));total=result.total;items.push(...result.items);
      if(result.timedOut)return {source,items,status:'PARTIAL',reason:'PROVIDER_TIMED_OUT',truncated:true};
      if(items.length>=total||result.items.length<100)break;
    }
    const unique=[...new Map(items.map(item=>[item.externalId,item])).values()];
    return {source,items:unique,status:'SUCCESS',truncated:total>items.length};
  }catch(error){return {source,items:[],status:'FAILED',reason:error instanceof DomainError?String(error.details.reason??error.code):error instanceof Error&&error.name==='TimeoutError'?'TIMEOUT':'SOURCE_RESPONSE_INVALID'};}
}
