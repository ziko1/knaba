import {queueHandoffSla} from '../domain/handoff-calendar.ts';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { assert, DomainError, type Actor, type CommandContext, type CommandRegistry, type Data, type Entity, type Transaction } from '../domain/core.ts';

const id=z.string().trim().min(1).max(100);
const text=z.string().trim().min(1).max(1000);
const count=z.number().int().min(1).max(1_000_000_000);
const language=z.enum(['DE','UK','RU','PL','LT','EN']);
const ids=z.array(id).min(1).max(20).refine(v=>new Set(v).size===v.length);
const contact=z.object({name:text,email:z.string().email().max(200).optional(),phone:z.string().min(5).max(40).optional()}).strict().refine(v=>!!(v.email||v.phone));
const facts=z.object({customerType:z.enum(['B2B','B2C','B2G']).optional(),propertyType:text.optional(),condition:text.optional(),address:text.optional(),area:text.optional(),quantityMilli:count.optional(),desiredPeriod:text.optional(),recurring:z.boolean().optional(),access:text.optional(),restrictions:text.optional(),locations:z.array(text).max(10).optional(),photoIds:z.array(id).max(10).optional()}).strict();
const draftArguments=z.object({territory:text.max(200),customerId:id.optional(),contact,serviceIds:ids,facts:facts.default({}),language:language.default('DE')}).strict();
const toolArguments={
 searchApprovedServices:z.object({query:z.string().trim().max(200).default(''),limit:z.number().int().min(1).max(10).default(5)}).strict(),
 getServiceQuestions:z.object({serviceId:id}).strict(),
 calculateEstimate:z.object({territory:text.max(200),priceBookId:id,lines:z.array(z.object({serviceId:id,quantityMilli:count}).strict()).min(1).max(20).refine(v=>new Set(v.map(l=>l.serviceId)).size===v.length)}).strict(),
 saveLeadDraft:draftArguments,
 confirmLead:z.object({draftId:id}).strict(),
 requestSiteVisit:z.object({leadId:id,expectedVersion:z.number().int().positive(),reason:text}).strict(),
 requestHumanHandoff:z.object({reason:text,leadId:id.optional(),expectedVersion:z.number().int().positive().optional()}).strict(),
 getOwnOrderStatus:z.object({customerId:id,orderId:id}).strict(),
 getOwnPublishedReport:z.object({customerId:id,reportVersionId:id}).strict(),
 createOwnIssueDraft:z.object({siteId:id,orderId:id.optional(),locationId:id.optional(),taskId:id.optional(),photoIds:z.array(id).max(10).default([]),description:text,language:language.default('DE'),severity:z.enum(['LOW','NORMAL','HIGH','CRITICAL']).default('NORMAL')}).strict().refine(v=>!!(v.locationId||v.taskId||v.photoIds.length)),
};
export type AssistantToolName=keyof typeof toolArguments;
export const ASSISTANT_TOOL_NAMES=Object.freeze(Object.keys(toolArguments) as AssistantToolName[]);
export const ASSISTANT_TOOL_SCHEMAS=Object.freeze(toolArguments);
export interface AssistantToolCall {id:string;name:AssistantToolName;arguments:unknown;}
export interface AssistantToolResult {id:string;name:AssistantToolName;result:Data;}
export interface AssistantToolBinding {companyId:string;actorId:string;configId:string;configVersion:number;channelId:string;channelVersion:number;messageId:string;messageVersion:number;sourceChannel:'WEB'|'WHATSAPP';}
/** Implement transaction with a database statement/lock timeout as well as serialization.
 * context must apply the engine's permission-specific delegation scope. Never route
 * confirmAssistantLeadDraft from provider output: it is an authenticated USER action.
 */
export interface AssistantToolHost<T extends Transaction=Transaction> {
 transaction:<R>(companyId:string,actorId:string,fn:(tx:T)=>Promise<R>,timeoutMs:number)=>Promise<R>;
 actorIn:(tx:T,userId:string)=>Promise<Actor>;
 context:(tx:T,actor:Actor,key:string,expectedVersion:number|undefined,now:string,permission:string)=>CommandContext;
 visible:(tx:T,actor:Actor,entity:Entity)=>Promise<boolean>;
 registry:CommandRegistry;
 now?:()=>Date;
 monotonicNow?:()=>number;
}
const MAX_CALLS=6,MAX_RESULT_BYTES=16_384,MAX_BATCH_BYTES=32_768,MAX_TIME_MS=10_000;
const bindingSchema=z.object({companyId:id,actorId:id,configId:id,configVersion:z.number().int().positive(),channelId:id,channelVersion:z.number().int().positive(),messageId:id,messageVersion:z.number().int().positive(),sourceChannel:z.enum(['WEB','WHATSAPP'])}).strict();
const envelopeSchema=z.object({id,name:z.enum(ASSISTANT_TOOL_NAMES as [AssistantToolName,...AssistantToolName[]]),arguments:z.unknown()}).strict();
function canonical(value:unknown):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';const d=value as Data;return '{'+Object.keys(d).sort().filter(k=>d[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(d[k])).join(',')+'}';}
const hash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const key=(...v:string[])=>createHash('sha256').update(v.join('\u0000')).digest('hex');
const dataOf=(v:any):Data=>v?.data??v;
const external=(a:Actor)=>a.roles.some(r=>['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST'].includes(r));
function sameCompany(e:Entity,companyId:string){assert(e.companyId===companyId,'NOT_FOUND_SAFE');return e;}
async function optionalEntity(tx:Transaction,kind:string,entityId:string){try{return await tx.get(kind,entityId);}catch(error){if(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE')return undefined;throw error;}}
function trim(value:unknown,limit=1000){return typeof value==='string'?value.slice(0,limit):'';}
export function assistantToolCatalog(allowedTools:unknown){const allowed=z.array(z.enum(ASSISTANT_TOOL_NAMES as [AssistantToolName,...AssistantToolName[]])).max(10).parse(allowedTools);return allowed.map(name=>({name,schema:toolArguments[name]}));}
export function formatAssistantEUR(value:number){assert(Number.isSafeInteger(value)&&value>=0,'VALIDATION_ERROR');const n=BigInt(value);return `${n/100n},${String(n%100n).padStart(2,'0')} EUR`;}
/** This text goes directly to the customer after the model answer, never through model rewriting. */
export function renderAssistantEstimate(value:Data){for(const n of [value.totalNetCents,value.totalTaxCents,value.totalGrossCents])formatAssistantEUR(n);assert(value.currency==='EUR'&&value.status==='ESTIMATE_NOT_QUOTE'&&['NET','GROSS'].includes(value.tax?.display),'VALIDATION_ERROR');return `Unverbindliche Schätzung: ${formatAssistantEUR(value.tax.display==='GROSS'?value.totalGrossCents:value.totalNetCents)} ${value.tax.display==='GROSS'?'brutto':'netto'} (${formatAssistantEUR(value.totalNetCents)} netto; ${formatAssistantEUR(value.totalTaxCents)} Steuer). Kein verbindliches Angebot; Team und Termin sind noch nicht bestätigt.`;}
type Session<T extends Transaction>={tx:T;actor:Actor;config:Entity;channel:Entity;message:Entity;binding:AssistantToolBinding;now:string;check:()=>void;host:AssistantToolHost<T>};
async function membership<T extends Transaction>(s:Session<T>,customerId:string,siteId?:string){const rows=await s.tx.list('customer_membership');s.check();assert(rows.some(m=>m.companyId===s.actor.companyId&&m.data.userId===s.actor.userId&&m.data.customerId===customerId&&m.data.active===true&&!m.data.revokedAt&&(!m.data.expiresAt||Date.parse(m.data.expiresAt)>Date.parse(s.now))&&(m.data.permissions??[]).includes('VIEW')&&(!siteId||!(m.data.siteIds??[]).length||m.data.siteIds.includes(siteId))),'NOT_FOUND_SAFE');}
async function refresh<T extends Transaction>(tx:T,binding:AssistantToolBinding,host:AssistantToolHost<T>,check:()=>void):Promise<Session<T>> {
 check();const now=(host.now?.()??new Date()).toISOString(),actor=await host.actorIn(tx,binding.actorId);check();
 assert(actor.companyId===binding.companyId&&actor.userId===binding.actorId&&external(actor),'ACCESS_DENIED');
 const config=sameCompany(await tx.get('assistant_config',binding.configId),binding.companyId);check();
 assert(config.data.status==='ACTIVE'&&config.data.configVersion===binding.configVersion,'VERSION_CONFLICT');
 assert(config.data.pricingPolicy==='SERVER_PRICE_ONLY'&&config.data.contextPolicy==='ACL_FILTER_BEFORE_RETRIEVAL'&&config.data.handoffPolicy==='SUPPRESS_AI_UNTIL_AUTHORIZED_RETURN','MISSING_CONFIGURATION');
 assistantToolCatalog(config.data.tools);
 const channel=sameCompany(await tx.get('channel',binding.channelId),binding.companyId);check();
 assert(channel.version===binding.channelVersion,'VERSION_CONFLICT');assert(channel.data.handoff?.state==='AI_ACTIVE','AI_SUPPRESSED');
 assert(['PRIVATE_CUSTOMER_ASSISTANT','SITE_CLIENT'].includes(channel.data.type),'ACCESS_DENIED');
 assert(channel.data.type!=='PRIVATE_CUSTOMER_ASSISTANT'||channel.data.created_by===actor.userId,'ACCESS_DENIED');
 const member=channel.data.members?.find((m:Data)=>m.user_id===actor.userId&&!m.left_at&&!m.revoked_at&&!m.removed_at&&m.active!==false&&(!m.expires_at||Date.parse(m.expires_at)>Date.parse(now)));assert(member,'ACCESS_DENIED');
 const message=sameCompany(await tx.get('message',binding.messageId),binding.companyId);check();
 assert(message.data.message_version===binding.messageVersion,'VERSION_CONFLICT');
 assert(message.data.channel_id===channel.id&&message.data.author_id===actor.userId&&!message.data.deleted_at&&!message.data.deletedAt&&message.createdAt>=(member.history_from??member.joined_at??''),'ACCESS_DENIED');
 assert(await host.visible(tx,actor,channel)&&await host.visible(tx,actor,message),'ACCESS_DENIED');check();
 const s={tx,actor,config,channel,message,binding,now,check,host};
 if(channel.data.type==='SITE_CLIENT'){const site=sameCompany(await tx.get('site',channel.data.site_id??channel.data.siteId),binding.companyId);await membership(s,site.data.customerId,site.id);}
 if(channel.data.lead_id){const lead=sameCompany(await tx.get('lead',channel.data.lead_id),binding.companyId);assert(lead.data.ownerUserId===actor.userId&&lead.data.ownership==='AI_ACTIVE','AI_SUPPRESSED');}
 check();return s;
}
async function invoke<T extends Transaction>(s:Session<T>,name:string,input:unknown,callId:string,expectedVersion?:number){s.check();const definition=s.host.registry[name];assert(definition,'MISSING_CONFIGURATION',{command:name});const context=s.host.context(s.tx,s.actor,key('assistant',s.actor.companyId,s.actor.userId,s.channel.id,s.message.id,callId,name),expectedVersion,s.now,definition.permission);assert(context.tx===s.tx&&context.actor.userId===s.actor.userId&&context.actor.companyId===s.actor.companyId&&context.actor.permissions.includes(definition.permission),'ACCESS_DENIED');assert(!definition.highRisk,'ACCESS_DENIED');const result=await definition.handler(context,definition.schema.parse(input));s.check();return result;}
function territory(s:Session<any>,value:string){assert(Array.isArray(s.config.data.territories)&&s.config.data.territories.some((t:unknown)=>typeof t==='string'&&t.trim().toLocaleLowerCase()===value.trim().toLocaleLowerCase()),'NEEDS_APPROVAL',{reason:'TERRITORY_NOT_APPROVED'});}
async function approvedService<T extends Transaction>(s:Session<T>,serviceId:string){assert(s.config.data.allowedServiceIds?.includes(serviceId),'NOT_FOUND_SAFE');const service=sameCompany(await s.tx.get('service',serviceId),s.actor.companyId);s.check();assert(service.data.active===true&&service.data.approvedBy,'NOT_FOUND_SAFE');return service;}
async function ownLead<T extends Transaction>(s:Session<T>,leadId:string,expectedVersion?:number){const lead=sameCompany(await s.tx.get('lead',leadId),s.actor.companyId);s.check();assert(lead.data.ownerUserId===s.actor.userId&&lead.data.ownership==='AI_ACTIVE'&&s.channel.data.lead_id===lead.id,'NOT_FOUND_SAFE');if(lead.data.customerId)await membership(s,lead.data.customerId,lead.data.siteId);assert(expectedVersion===undefined||lead.version===expectedVersion,'VERSION_CONFLICT');return lead;}
async function ownDraft<T extends Transaction>(s:Session<T>,draftId:string){const draft=sameCompany(await s.tx.get('assistant_lead_draft',draftId),s.actor.companyId);s.check();assert(draft.data.ownerUserId===s.actor.userId&&draft.data.channelId===s.channel.id&&draft.data.configId===s.config.id&&draft.data.configVersion===s.config.data.configVersion,'NOT_FOUND_SAFE');assert(draft.data.previewHash===hash(draft.data.input),'VERSION_CONFLICT');const source=sameCompany(await s.tx.get('message',draft.data.messageId),s.actor.companyId);assert(source.data.message_version===draft.data.messageVersion,'VERSION_CONFLICT');assert(source.data.channel_id===s.channel.id&&source.data.author_id===s.actor.userId&&!source.data.deleted_at&&!source.data.deletedAt&&await s.host.visible(s.tx,s.actor,source),'ACCESS_DENIED');s.check();return draft;}
async function handoff<T extends Transaction>(s:Session<T>,reason:string,callId:string,lead?:Entity){
 assert(s.actor.permissions.includes('chat.write'),'ACCESS_DENIED');
 if(lead)await invoke(s,s.actor.permissions.includes('lead.manage_own')?'lead.own_handoff':'lead.handoff',{id:lead.id,reason,summaryDE:'Der Kunde benötigt menschliche Unterstützung. Originalnachricht und ungeklärte Angaben bleiben im privaten Dialog.',unresolved:[],documentIds:[]},callId,lead.version);
 s.check();const channel=await s.tx.get('channel',s.channel.id);assert(channel.version===s.channel.version&&channel.data.handoff?.state==='AI_ACTIVE','AI_SUPPRESSED');
 s.channel=await s.tx.save(channel,{...channel.data,handoff:{state:'HANDOFF_PENDING',owner_id:null,reason,requested_at:s.now,source_message_id:s.message.id}},channel.version);
 s.channel=await queueHandoffSla(s.tx,s.channel,s.now);
 const dedupe=key('assistant-handoff',s.channel.id,s.message.id,callId);
 if(!lead&&!(await s.tx.list('decision')).some(d=>d.data.dedupeKey===dedupe))await s.tx.add('decision',{status:'OPEN',ownerId:'UNASSIGNED',channelId:s.channel.id,sources:[s.message.id],reason,summaryDE:'Die private Kundenanfrage benötigt menschliche Unterstützung. Team und Termin sind nicht bestätigt.',actions:['APPROVE','RETURN','DELEGATE'],history:[],dedupeKey:dedupe});
 await s.tx.event('assistant.handoff_requested',{channelId:s.channel.id,actorId:s.actor.userId,messageId:s.message.id});s.check();
 return {status:'HANDOFF_PENDING',channelId:s.channel.id,aiSuppressed:true,teamConfirmed:false,scheduleConfirmed:false};
}
function preview(draft:Entity){return {draftId:draft.id,draftVersion:draft.version,previewHash:draft.data.previewHash,status:draft.data.state,requiresUserConfirmation:draft.data.state!=='CONFIRMED',leadId:draft.data.leadId??null,preview:draft.data.input};}
async function run<T extends Transaction>(s:Session<T>,call:AssistantToolCall,args:any):Promise<Data>{
 switch(call.name){
  case 'searchApprovedServices':{const available=await invoke(s,'service.list',{},call.id);assert(Array.isArray(available),'MISSING_CONFIGURATION');const allowed=[];for(const item of available){const d=dataOf(item);if(!s.config.data.allowedServiceIds.includes(item.id)||!d.approvedBy)continue;if(args.query&&!`${d.name} ${d.description}`.toLocaleLowerCase().includes(args.query.toLocaleLowerCase()))continue;allowed.push({id:item.id,version:item.version,name:trim(d.name),description:trim(d.description),unit:d.unit,included:(d.included??[]).slice(0,10).map((v:unknown)=>trim(v)),excluded:(d.excluded??[]).slice(0,10).map((v:unknown)=>trim(v)),requiresVisit:d.requiresVisit===true});if(allowed.length===args.limit)break;}return {services:allowed,allowedTerritories:s.config.data.territories.slice(0,20).map((v:unknown)=>trim(v,200))};}
  case 'getServiceQuestions':{await approvedService(s,args.serviceId);const q=await invoke(s,'service.questions',{id:args.serviceId},call.id);return {serviceId:args.serviceId,questions:(q.questions??[]).slice(0,10).map((v:unknown)=>trim(v,500)),unit:q.unit,measurementSource:'CUSTOMER_STATED'};}
  case 'calculateEstimate':{territory(s,args.territory);for(const line of args.lines)await approvedService(s,line.serviceId);const e=await invoke(s,'estimate.calculate',{priceBookId:args.priceBookId,lines:args.lines},call.id);const result={status:e.status,currency:e.currency,priceBookId:e.priceBookId,priceBookVersion:e.priceBookVersion,totalNetCents:e.totalNetCents,totalTaxCents:e.totalTaxCents,totalGrossCents:e.totalGrossCents,tax:{mode:e.tax.mode,rateBps:e.tax.rateBps,display:e.tax.display},lines:e.lines.map((l:Data)=>({serviceId:l.serviceId,quantityMilli:l.quantityMilli,unit:l.unit,rateCents:l.rateCents,netCents:l.netCents})),measurementSource:'CUSTOMER_STATED',teamConfirmed:false,scheduleConfirmed:false,source:'SERVER_PRICE_ENGINE'};return {...result,customerText:renderAssistantEstimate(result)};}
  case 'saveLeadDraft':{assert(s.actor.permissions.includes('lead.create'),'ACCESS_DENIED');territory(s,args.territory);for(const serviceId of args.serviceIds)await approvedService(s,serviceId);if(args.customerId)await membership(s,args.customerId);for(const photoId of args.facts.photoIds??[]){const photo=sameCompany(await s.tx.get('media_asset',photoId),s.actor.companyId);assert(photo.data.uploadedBy===s.actor.userId&&photo.data.visibility!=='CONFIDENTIAL'&&String(photo.data.mimeType).startsWith('image/')&&['RECEIVED','APPROVED_FOR_CLIENT'].includes(photo.data.state),'NOT_FOUND_SAFE');if(photo.data.siteId){const site=await s.tx.get('site',photo.data.siteId);await membership(s,site.data.customerId,site.id);}}const drafts=(await s.tx.list('assistant_lead_draft')).filter(d=>d.data.channelId===s.channel.id&&d.data.state==='DRAFT');assert(drafts.length<20,'RATE_LIMITED');const input={...args,facts:{...args.facts,...(args.facts.quantityMilli?{measurementSource:'CUSTOMER_STATED'}:{})}};const row=await s.tx.add('assistant_lead_draft',{ownerUserId:s.actor.userId,channelId:s.channel.id,messageId:s.message.id,messageVersion:s.binding.messageVersion,configId:s.config.id,configVersion:s.config.data.configVersion,sourceChannel:s.binding.sourceChannel,state:'DRAFT',input,previewHash:hash(input),createdAt:s.now});return preview(row);}
  case 'confirmLead':{assert(s.actor.permissions.includes('lead.create'),'ACCESS_DENIED');const draft=await ownDraft(s,args.draftId);if(draft.data.state==='CONFIRMED'){const lead=await ownLead(s,draft.data.leadId);return {draftId:draft.id,leadId:lead.id,status:lead.data.status,confirmedByUser:true,teamConfirmed:false,scheduleConfirmed:false};}return preview(draft);}
  case 'requestSiteVisit':{const lead=await ownLead(s,args.leadId,args.expectedVersion);const visit=await invoke(s,s.actor.permissions.includes('lead.manage_own')?'site_visit.own_create':'site_visit.create',{leadId:lead.id,reason:args.reason},call.id);const updated=await s.tx.get('lead',lead.id);const result=await handoff(s,args.reason,call.id,updated);return {...result,siteVisitId:visit.id,visitStatus:'REQUESTED',visitConfirmed:false};}
  case 'requestHumanHandoff':{const leadId=args.leadId??s.channel.data.lead_id;const lead=leadId?await ownLead(s,leadId,args.expectedVersion):undefined;return handoff(s,args.reason,call.id,lead);}
  case 'getOwnOrderStatus':{await membership(s,args.customerId);const portal=await invoke(s,'customer.portal',{customerId:args.customerId},call.id);const order=portal.orders.find((o:Data)=>o.id===args.orderId);assert(order,'NOT_FOUND_SAFE');return {order:{id:order.id,version:order.version,siteId:order.siteId??null,status:order.status,scope:trim(order.scope),pricingModel:order.pricingModel,confirmedStartAt:order.confirmedStartAt??null,confirmedEndAt:order.confirmedEndAt??null,scheduleVersion:order.scheduleVersion},asOf:portal.asOf};}
  case 'getOwnPublishedReport':{const report=sameCompany(await s.tx.get('report_version',args.reportVersionId),s.actor.companyId);assert(report.data.customerId===args.customerId&&report.data.immutable===true&&report.data.publishedAt,'NOT_FOUND_SAFE');await membership(s,args.customerId,report.data.siteId);const portal=await invoke(s,'customer.portal',{customerId:args.customerId,siteId:report.data.siteId},call.id);assert(portal.reports.some((r:Data)=>r.id===report.data.reportId),'NOT_FOUND_SAFE');return {reportVersionId:report.id,reportId:report.data.reportId,siteId:report.data.siteId,version:report.data.version,publishedAt:report.data.publishedAt,sha256:report.data.sha256,number:trim(report.data.snapshot?.number,100),language:'DE',descriptionDe:trim(report.data.snapshot?.descriptionDe,2000),privateDownloadRequired:true};}
  case 'createOwnIssueDraft':{const site=sameCompany(await s.tx.get('site',args.siteId),s.actor.companyId);await membership(s,site.data.customerId,site.id);const issue=await invoke(s,'issue.draft',{...args,externalKey:key('assistant-issue',s.channel.id,s.message.id,call.id)},call.id);const d=dataOf(issue);return {issueId:issue.id,number:d.number,state:d.state,siteId:d.siteId,requiresUserSubmission:true};}
 }
}
/** Provider output is a proposal. Validate all calls before any effect, then execute
 * sequentially in one serialized transaction; timeout/overflow throws roll it back.
 * Never race an uncancelled mutation against Promise.race.
 */
export async function dispatchAssistantTools<T extends Transaction>(rawBinding:AssistantToolBinding,rawCalls:unknown,host:AssistantToolHost<T>){
 const binding=bindingSchema.parse(rawBinding),envelopes=z.array(envelopeSchema).min(1).max(MAX_CALLS).parse(rawCalls);assert(new Set(envelopes.map(c=>c.id)).size===envelopes.length,'VALIDATION_ERROR');
 const calls=envelopes.map(c=>({...c,arguments:toolArguments[c.name].parse(c.arguments)}));
 const clock=host.monotonicNow??(()=>performance.now()),start=clock();const check=()=>assert(clock()-start<MAX_TIME_MS,'ASSISTANT_TOOL_TIMEOUT');
 return host.transaction(binding.companyId,binding.actorId,async tx=>{
  let s=await refresh(tx,binding,host,check);const results:AssistantToolResult[]=[];let bytes=0,stoppedForHandoff=false;
  for(const call of calls){s=await refresh(tx,binding,host,check);check();assert(s.config.data.tools.includes(call.name),'ACCESS_DENIED',{reason:'TOOL_NOT_ALLOWED'});
   if(['saveLeadDraft','confirmLead'].includes(call.name))assert(s.actor.permissions.includes('lead.create'),'ACCESS_DENIED');
   if(call.name==='createOwnIssueDraft')assert(s.actor.permissions.includes('issue.create'),'ACCESS_DENIED');
   const receiptId=key('assistant-tool',binding.companyId,binding.actorId,binding.channelId,binding.messageId,call.id),inputHash=hash({name:call.name,arguments:call.arguments});
   const previous=await optionalEntity(tx,'assistant_tool_call',receiptId);check();if(previous)assert(previous.data.inputHash===inputHash&&previous.data.configId===binding.configId&&previous.data.configVersion===binding.configVersion,'VERSION_CONFLICT');
   let result:Data;
   if(previous&&['saveLeadDraft','createOwnIssueDraft'].includes(call.name)){if(call.name==='saveLeadDraft')result=preview(await ownDraft(s,previous.data.result.draftId));else {const args=call.arguments as any,site=await tx.get('site',args.siteId);await membership(s,site.data.customerId,site.id);const issue=await invoke(s,'issue.get',{id:previous.data.result.issueId},call.id);const d=dataOf(issue);result={issueId:issue.id,number:d.number,state:d.state,siteId:d.siteId,requiresUserSubmission:d.state==='DRAFT'};}}
   else result=await run(s,call as AssistantToolCall,call.arguments);
   const size=Buffer.byteLength(JSON.stringify(result));bytes+=size;assert(size<=MAX_RESULT_BYTES&&bytes<=MAX_BATCH_BYTES,'ASSISTANT_TOOL_RESULT_LIMIT');check();
   if(!previous)await tx.add('assistant_tool_call',{ownerUserId:s.actor.userId,channelId:s.channel.id,messageId:s.message.id,configId:s.config.id,configVersion:s.config.data.configVersion,tool:call.name,inputHash,result,executedAt:s.now},receiptId);
   await tx.event('assistant.tool_executed',{actorId:s.actor.userId,channelId:s.channel.id,messageId:s.message.id,configId:s.config.id,configVersion:s.config.data.configVersion,tool:call.name,callId:call.id,inputHash,replayed:!!previous});check();
   results.push({id:call.id,name:call.name,result});
   if(result.aiSuppressed===true){stoppedForHandoff=true;break;}
  }
  check();return {results,stoppedForHandoff,configId:s.config.id,configVersion:s.config.data.configVersion,channelVersion:s.channel.version};
 },MAX_TIME_MS);
}
/** Only an authenticated, explicit customer preview-confirm action invokes this.
 * A model/tool argument cannot supply its own confirmation or change the preview.
 */
export async function confirmAssistantLeadDraft<T extends Transaction>(rawBinding:AssistantToolBinding,rawInput:{draftId:string;expectedVersion:number;previewHash:string},host:AssistantToolHost<T>){
 const binding=bindingSchema.parse(rawBinding),input=z.object({draftId:id,expectedVersion:z.number().int().positive(),previewHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(rawInput);
 const clock=host.monotonicNow??(()=>performance.now()),start=clock(),check=()=>assert(clock()-start<MAX_TIME_MS,'ASSISTANT_TOOL_TIMEOUT');
 return host.transaction(binding.companyId,binding.actorId,async tx=>{const s=await refresh(tx,binding,host,check);assert(s.actor.permissions.includes('lead.create'),'ACCESS_DENIED');const draft=await ownDraft(s,input.draftId);assert(draft.data.previewHash===input.previewHash,'VERSION_CONFLICT');if(draft.data.state==='CONFIRMED'){const lead=await ownLead(s,draft.data.leadId);return {draftId:draft.id,leadId:lead.id,status:lead.data.status,confirmedByUser:true};}assert(draft.data.state==='DRAFT'&&draft.version===input.expectedVersion,'VERSION_CONFLICT');const d=draftArguments.parse({...draft.data.input,facts:Object.fromEntries(Object.entries(draft.data.input.facts).filter(([k])=>k!=='measurementSource'))});territory(s,d.territory);for(const serviceId of d.serviceIds)await approvedService(s,serviceId);if(d.customerId)await membership(s,d.customerId);const sourceChannel=z.enum(['WEB','WHATSAPP']).parse(draft.data.sourceChannel);const lead=await invoke(s,'lead.create',{customerId:d.customerId,contact:d.contact,serviceIds:d.serviceIds,facts:{...d.facts,...(d.facts.quantityMilli?{measurementSource:'CUSTOMER_STATED'}:{})},language:d.language,source:{channel:sourceChannel},newRequest:true},`user-confirm:${draft.id}`);assert(lead.data.ownerUserId===s.actor.userId&&lead.data.ownership==='AI_ACTIVE','AI_SUPPRESSED');const channel=await tx.get('channel',s.channel.id);assert(!channel.data.lead_id||channel.data.lead_id===lead.id,'VERSION_CONFLICT');await tx.save(channel,{...channel.data,lead_id:lead.id},channel.version);await tx.save(draft,{...draft.data,state:'CONFIRMED',leadId:lead.id,confirmedBy:s.actor.userId,confirmedAt:s.now},draft.version);await tx.event('assistant.lead_confirmed',{actorId:s.actor.userId,channelId:s.channel.id,draftId:draft.id,leadId:lead.id,previewHash:input.previewHash});check();return {draftId:draft.id,leadId:lead.id,status:lead.data.status,confirmedByUser:true,teamConfirmed:false,scheduleConfirmed:false};},MAX_TIME_MS);
}
