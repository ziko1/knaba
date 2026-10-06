import {createHash} from 'node:crypto';
import {z} from 'zod';
import {assert,DomainError,type Actor,type CommandContext,type CommandRegistry,type Data,type Entity,type Transaction} from '../domain/core.ts';
import {canonicalReportJson} from '../domain/resources.ts';
import {internalAssistantKind,internalAssistantProviderContextSchema,internalJson,parseInternalDraftProposal,type InternalAssistantKind,type InternalAssistantProviderContext,type InternalAssistantProviderResult} from './internal-assistant-provider.ts';
import type {DeepSeekAnswerPolicy,SupportedLanguage} from './deepseek.ts';

const id=z.string().min(1).max(100),version=z.number().int().positive().safe();
const ids=(max:number)=>z.array(id).max(max).refine(v=>new Set(v).size===v.length);
const selectedContext=z.object({locationIds:ids(100).default([]),assigneeIds:ids(50).default([]),taskIds:ids(100).default([]),materialIds:ids(100).default([]),orderIds:ids(20).default([]),reportIds:ids(20).default([])}).strict();
const requestInput=z.object({messageId:id,messageVersion:version,channelId:id,configId:id,configVersion:version,kind:internalAssistantKind,siteIds:ids(10).refine(v=>v.length>0),context:selectedContext.default({})}).strict();
interface Reference {kind:string;id:string;version:number;}
export interface InternalAssistantHost<T extends Transaction=Transaction>{
 transaction:<R>(companyId:string,actorId:string,fn:(tx:T)=>Promise<R>,timeoutMs?:number)=>Promise<R>;
 actorIn:(tx:T,userId:string)=>Promise<Actor>;
 visible:(tx:T,actor:Actor,entity:Entity)=>Promise<boolean>;
 context:(tx:T,actor:Actor,key:string,version:number|undefined,now:string,permission:string)=>CommandContext;
 registry:CommandRegistry;
 now?:()=>Date;
 mode:'DEMO'|'TEST'|'PRODUCTION';
 assertWorkerLease?:(tx:T)=>Promise<void>;
}
const permissions:Record<InternalAssistantKind,string>={TASK_BATCH:'task.create',REPORT:'report.create',MATERIAL_REQUEST:'inventory.request'};
const roles=['OWNER','DIRECTOR','OPERATIONS_MANAGER','INTERNAL_BAULEITER','TEAM_LEADER'];
const kinds=['COMPANY_GENERAL','COMPANY_ANNOUNCEMENTS','TEAM','SITE_INTERNAL','TASK_THREAD'];
// JSONB preserves values and array order, but changes object-key order. Validate
// the same bounded plain JSON before hashing its canonical representation so a
// persisted unchanged review is stable; semantic edits still invalidate it.
const digest=(data:unknown)=>{internalJson(data,196608);return createHash('sha256').update(canonicalReportJson(data)).digest('hex');};
const key=(...values:string[])=>createHash('sha256').update(values.join('\u0000')).digest('hex');
const clock=(host:InternalAssistantHost<any>)=>(host.now?.()??new Date()).toISOString();
function internal(actor:Actor,kind:InternalAssistantKind){assert(!actor.roles.some(r=>['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST'].includes(r))&&actor.roles.some(r=>roles.includes(r))&&actor.permissions.includes('assistant.read')&&actor.permissions.includes('chat.read')&&actor.permissions.includes(permissions[kind]),'ACCESS_DENIED');}
async function optional(tx:Transaction,kind:string,entityId:string){try{return await tx.get(kind,entityId);}catch(error){if(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE')return undefined;throw error;}}
function same(e:Entity,companyId:string){assert(e.companyId===companyId,'NOT_FOUND_SAFE');return e;}
async function source<T extends Transaction>(tx:T,actor:Actor,d:Data,host:InternalAssistantHost<T>,now:string){
 internal(actor,d.kind);const channel=same(await tx.get('channel',d.channelId),actor.companyId),message=same(await tx.get('message',d.messageId),actor.companyId),config=same(await tx.get('assistant_config',d.configId),actor.companyId);
 assert(kinds.includes(channel.data.type)&&!channel.data.confidential&&channel.data.visibility!=='CONFIDENTIAL','ACCESS_DENIED');
 const member=channel.data.members?.find((m:Data)=>m.user_id===actor.userId&&m.active!==false&&!m.revoked_at&&!m.revokedAt&&!m.left_at&&!m.leftAt&&!m.removed_at&&!m.removedAt&&(!m.expires_at||Date.parse(m.expires_at)>Date.parse(now))&&(!m.expiresAt||Date.parse(m.expiresAt)>Date.parse(now)));
 assert(member&&!member.external&&message.data.channel_id===channel.id&&message.data.author_id===actor.userId&&!message.data.deleted_at&&!message.data.deletedAt&&message.data.source==='HUMAN'&&message.createdAt>=(member.history_from??member.joined_at??''),'ACCESS_DENIED');
 assert(message.data.message_version===d.messageVersion&&config.data.status==='ACTIVE'&&config.data.configVersion===d.configVersion,'VERSION_CONFLICT');
 assert(typeof message.data.text==='string'&&message.data.text.length>0&&message.data.text.length<=4000,'VALIDATION_ERROR');
 if(d.channelVersion)assert(channel.version===d.channelVersion&&message.version===d.messageEntityVersion&&config.version===d.configEntityVersion,'VERSION_CONFLICT');
 assert(await host.visible(tx,actor,channel)&&await host.visible(tx,actor,message),'ACCESS_DENIED');
 let channelSite=channel.data.site_id;if(channel.data.task_id){const task=same(await tx.get('task',channel.data.task_id),actor.companyId);assert(await host.visible(tx,actor,task),'ACCESS_DENIED');channelSite=task.data.siteId;}
 assert(!channelSite||d.siteIds.every((s:string)=>s===channelSite),'ACCESS_DENIED');
 return {actor,channel,message,config};
}
async function snapshot<T extends Transaction>(tx:T,actor:Actor,d:Data,host:InternalAssistantHost<T>,now:string){
 const base=await source(tx,actor,d,host,now),refs:Reference[]=[];
 const reference=(e:Entity)=>{refs.push({kind:e.kind,id:e.id,version:e.version});return e;};reference(base.channel);reference(base.message);reference(base.config);reference(same(await tx.get('user',actor.userId),actor.companyId));
 const permission=permissions[d.kind as InternalAssistantKind],ctx=host.context(tx,actor,'internal-assistant-context',undefined,now,permission);
 const get=async(kind:string,entityId:string)=>{const e=reference(same(await tx.get(kind,entityId),actor.companyId));assert(await host.visible(tx,actor,e),'ACCESS_DENIED');return e;};
 const scoped=async(siteId:string)=>{assert(d.siteIds.includes(siteId),'ACCESS_DENIED');ctx.requireSite(siteId);};
 const context:InternalAssistantProviderContext={sites:[],locations:[],assignees:[],tasks:[],materials:[],orders:[],reportRefs:[]};
 for(const siteId of d.siteIds){ctx.requireSite(siteId);const s=await get('site',siteId);assert(s.data.active!==false,'INVALID_STATE');context.sites.push({id:s.id,code:String(s.data.code),name:String(s.data.name)});}
 const chosen=selectedContext.parse(d.context??d.contextIds??{});
 for(const locationId of chosen.locationIds){const n=await get('location',locationId);await scoped(n.data.siteId);assert(n.data.active===true,'INVALID_STATE');const path:string[]=[],seen=new Set<string>();let cursor:Entity|undefined=n;
  while(cursor){assert(!seen.has(cursor.id)&&seen.size<20,'INVALID_STATE');seen.add(cursor.id);assert(cursor.data.siteId===n.data.siteId&&cursor.data.active===true,'INVALID_STATE');path.unshift(`${cursor.data.code} · ${cursor.data.floorLabelDe??cursor.data.name}`);cursor=cursor.data.parentId?await get('location',cursor.data.parentId):undefined;}
  context.locations.push({id:n.id,siteId:n.data.siteId,path,...n.data.floorLabelDe?{floorLabelDe:n.data.floorLabelDe}:{}});
 }
 if(chosen.assigneeIds.length)assert(actor.permissions.includes('task.assign'),'ACCESS_DENIED');
 for(const assigneeId of chosen.assigneeIds){const u=await get('user',assigneeId);assert(u.data.active!==false&&!u.data.roles?.some((r:string)=>['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST'].includes(r)),'ACCESS_DENIED');const siteIds=d.siteIds.filter((s:string)=>(u.data.siteIds??[]).includes(s));assert(siteIds.length,'ACCESS_DENIED');context.assignees.push({id:u.id,label:u.data.businessCode??u.data.employeeCode??u.data.displayName??u.data.name??u.id,siteIds});}
 for(const taskId of chosen.taskIds){const t=await get('task',taskId);await scoped(t.data.siteId);context.tasks.push({id:t.id,siteId:t.data.siteId,...t.data.locationId?{locationId:t.data.locationId}:{},title:t.data.title,state:t.data.state});}
 for(const materialId of chosen.materialIds){assert(actor.permissions.includes('inventory.read'),'ACCESS_DENIED');const m=await get('material',materialId);assert(m.data.active!==false,'INVALID_STATE');const units=[...new Set([m.data.baseUnit,...(m.data.conversions??[]).map((c:Data)=>c.unit)])].filter(u=>['ml','l','g','kg','pcs','pair','package'].includes(u)) as InternalAssistantProviderContext['materials'][number]['units'];assert(units.length,'INVALID_STATE');context.materials.push({id:m.id,label:m.data.name??m.data.sku??m.id,units});}
 for(const orderId of chosen.orderIds){const o=await get('order',orderId);await scoped(o.data.siteId);context.orders.push({id:o.id,siteId:o.data.siteId,customerId:o.data.customerId});reference(same(await tx.get('customer',o.data.customerId),actor.companyId));}
 for(const reportId of chosen.reportIds){const r=await get('report',reportId);await scoped(r.data.siteId);context.reportRefs.push({id:r.id,siteId:r.data.siteId,...r.data.inputSnapshot?.documentType?{documentType:r.data.inputSnapshot.documentType}:{}});}
 internalJson(context);internalAssistantProviderContextSchema.parse(context);
 const references=[...new Map(refs.map(r=>[r.kind+':'+r.id,r])).values()].sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id));
 const contextHash=digest({context,references,sourceText:base.message.data.text,sourceVersion:base.message.data.message_version,kind:d.kind,roles:actor.roles,permissions:actor.permissions});
 return {...base,context,references,contextHash};
}
async function invoke<T extends Transaction>(host:InternalAssistantHost<T>,tx:T,actor:Actor,name:string,input:unknown,commandKey:string,now:string){const def=host.registry[name];assert(def&&!def.highRisk&&actor.permissions.includes(def.permission),'ACCESS_DENIED');const ctx=host.context(tx,actor,commandKey,undefined,now,def.permission);assert(ctx.tx===tx&&ctx.actor.userId===actor.userId&&ctx.actor.companyId===actor.companyId&&ctx.actor.permissions.includes(def.permission),'ACCESS_DENIED');return def.handler(ctx,def.schema.parse(input));}
function view(draft:Entity){return {draftId:draft.id,draftVersion:draft.version,requestId:draft.data.requestId,kind:draft.data.kind,status:draft.data.state,previewHash:draft.data.previewHash,source:{messageId:draft.data.messageId,messageVersion:draft.data.messageVersion,channelId:draft.data.channelId},needsClarification:draft.data.state==='NEEDS_CLARIFICATION',clarification:draft.data.proposal.clarification,preview:draft.data.preview,requiresUserConfirmation:draft.data.state==='DRAFT',sideEffectsExecuted:draft.data.state==='CONFIRMED',result:draft.data.result??null};}
const reviewHash=(d:Data)=>digest({preview:d.preview,canonicalInput:d.canonicalInput,canonicalPreviewHash:d.canonicalPreviewHash,proposal:d.proposal});
async function ownDraft<T extends Transaction>(tx:T,actor:Actor,draftId:string,host:InternalAssistantHost<T>,now:string){const draft=same(await tx.get('internal_assistant_draft',draftId),actor.companyId);assert(draft.data.ownerUserId===actor.userId,'ACCESS_DENIED');const request=same(await tx.get('internal_assistant_request',draft.data.requestId),actor.companyId);assert(request.data.ownerUserId===actor.userId,'ACCESS_DENIED');const current=await snapshot(tx,actor,request.data,host,now);assert(current.contextHash===draft.data.contextHash,'VERSION_CONFLICT');assert(reviewHash(draft.data)===draft.data.previewHash,'VERSION_CONFLICT');return {draft,request,current};}

export function createInternalAssistantCommands<T extends Transaction>(host:InternalAssistantHost<T>):CommandRegistry {
 return {
 'internal_assistant.request':{permission:'assistant.read',schema:requestInput,handler:async(ctx,input)=>{const tx=ctx.tx as T,actor=await host.actorIn(tx,ctx.actor.userId),now=ctx.now;assert(actor.companyId===ctx.actor.companyId,'ACCESS_DENIED');const current=await snapshot(tx,actor,input,host,now);const requestId=key('internal-assistant-request',actor.companyId,actor.userId,ctx.idempotencyKey);const previous=await optional(tx,'internal_assistant_request',requestId);if(previous){assert(previous.data.inputHash===digest(input),'VERSION_CONFLICT');return previous;}
   const request=await tx.add('internal_assistant_request',{...input,contextIds:input.context,contextHash:current.contextHash,inputHash:digest(input),ownerUserId:actor.userId,user_id:actor.userId,sourceMessageId:input.messageId,channelVersion:current.channel.version,messageEntityVersion:current.message.version,configEntityVersion:current.config.version,status:'PENDING',category:'INTERNAL_DRAFT',createdAt:now},requestId);await tx.event('internal_assistant.requested',{requestId:request.id,ownerUserId:actor.userId,category:'INTERNAL_DRAFT'});return request; }},
 'internal_assistant.preview':{permission:'assistant.read',schema:z.object({draftId:id}).strict(),handler:async(ctx,input)=>{const actor=await host.actorIn(ctx.tx as T,ctx.actor.userId);const {draft}=await ownDraft(ctx.tx as T,actor,input.draftId,host,ctx.now);return view(draft);}},
 'internal_assistant.confirm':{permission:'assistant.read',schema:z.object({draftId:id,expectedVersion:version,previewHash:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)}).strict(),handler:async(ctx,input)=>{
   const tx=ctx.tx as T,actor=await host.actorIn(tx,ctx.actor.userId);const {draft,request,current}=await ownDraft(tx,actor,input.draftId,host,ctx.now);assert(draft.data.previewHash===input.previewHash,'VERSION_CONFLICT');if(draft.data.state==='CONFIRMED')return draft.data.result;
   assert(draft.version===input.expectedVersion,'VERSION_CONFLICT');assert(draft.data.state==='DRAFT'&&request.data.status==='READY','INVALID_STATE');const proposal=parseInternalDraftProposal(draft.data.proposal,{kind:draft.data.kind,context:current.context,text:current.message.data.text});assert(!proposal.needsClarification,'NEEDS_APPROVAL');let name:string,inputCommand:Data;
   if(proposal.kind==='TASK_BATCH'){if(proposal.input!.tasks.some(t=>t.assigneeIds.length))assert(actor.permissions.includes('task.assign'),'ACCESS_DENIED');name='task.bulk.commit';inputCommand={...draft.data.canonicalInput,previewHash:draft.data.canonicalPreviewHash,confirmed:true};}
   else {name=proposal.kind==='REPORT'?'report.create':'request.create';inputCommand=draft.data.canonicalInput;}
   const result=await invoke(host,tx,actor,name,inputCommand,key('internal-assistant-confirm',actor.companyId,draft.id),ctx.now);const resultEntities=Array.isArray(result)?result:[result];const receipt={draftId:draft.id,command:name,entityIds:resultEntities.map((r:Entity)=>r.id),result:resultEntities.map((r:Entity)=>({id:r.id,kind:r.kind,version:r.version,state:r.data.state})),sideEffectsExecuted:true,automaticPublication:false};
   await tx.save(draft,{...draft.data,state:'CONFIRMED',result:receipt,confirmedBy:actor.userId,confirmedAt:ctx.now},draft.version);await tx.save(request,{...request.data,status:'CONFIRMED',confirmedAt:ctx.now});await tx.event('internal_assistant.confirmed',{requestId:request.id,draftId:draft.id,ownerUserId:actor.userId,command:name,entityIds:receipt.entityIds});return receipt;
 }},
 };
}
/** Claim before provider I/O, making RUNNING visible to privacy quiescence. A
 * crashed/uncertain provider round must not be automatically invoked again. */
export async function prepareInternalAssistant<T extends Transaction>(companyId:string,requestId:string,host:InternalAssistantHost<T>){
 assert(host.assertWorkerLease,'MISSING_CONFIGURATION');return host.transaction(companyId,'INTERNAL_ASSISTANT_WORKER',async tx=>{await host.assertWorkerLease!(tx);const request=same(await tx.get('internal_assistant_request',requestId),companyId);if(['READY','NEEDS_CLARIFICATION','FAILED','CONFIRMED'].includes(request.data.status))return {done:true as const,request};assert(request.data.status==='PENDING','PROVIDER_OUTCOME_UNKNOWN');const actor=await host.actorIn(tx,request.data.ownerUserId),current=await snapshot(tx,actor,request.data,host,clock(host));assert(current.contextHash===request.data.contextHash,'VERSION_CONFLICT');
  const claimed=await tx.save(request,{...request.data,status:'RUNNING',startedAt:clock(host)});await host.assertWorkerLease!(tx);
  const language=(['DE','UK','RU','PL','LT','EN'].includes(current.message.data.language)?current.message.data.language:'DE') as SupportedLanguage;
  const policy:DeepSeekAnswerPolicy={model:current.config.data.model,timeoutMs:current.config.data.timeoutMs,tone:current.config.data.tone,addressMode:current.config.data.addressForm,humanHours:current.config.data.humanHours};
  return {done:false as const,request:claimed,config:current.config,contextHash:current.contextHash,providerInput:{text:current.message.data.text,language,kind:request.data.kind as InternalAssistantKind,context:current.context,policy,synthetic:['DEMO','TEST'].includes(host.mode)&&current.config.data.testOnly===true}};
 },10000);
}
/** Recheck after budget/approval reservation and immediately before provider I/O.
 * No cached actor, provider-side authorization or previously approved context is
 * sufficient if permissions, source or legal transfer approval have changed. */
export async function revalidateInternalAssistant<T extends Transaction>(companyId:string,requestId:string,contextHash:string,host:InternalAssistantHost<T>):Promise<void>{
 assert(host.assertWorkerLease,'MISSING_CONFIGURATION');await host.transaction(companyId,'INTERNAL_ASSISTANT_WORKER',async tx=>{
  await host.assertWorkerLease!(tx);const request=same(await tx.get('internal_assistant_request',requestId),companyId);assert(request.data.status==='RUNNING','INVALID_STATE');assert(request.data.providerOutcome!=='UNKNOWN','PROVIDER_OUTCOME_UNKNOWN');
  const actor=await host.actorIn(tx,request.data.ownerUserId),now=clock(host),current=await snapshot(tx,actor,request.data,host,now);assert(current.contextHash===contextHash&&request.data.contextHash===contextHash,'VERSION_CONFLICT');
  assert(current.config.data.provider==='DEEPSEEK','PROVIDER_DISABLED');const synthetic=['DEMO','TEST'].includes(host.mode)&&current.config.data.testOnly===true;
  if(!synthetic){assert(current.config.data.transferApprovalId,'NEEDS_APPROVAL');const approval=same(await tx.get('legal_approval',current.config.data.transferApprovalId),companyId);assert(approval.data.subject==='AI_TRANSFER'&&approval.data.status==='APPROVED'&&approval.data.active!==false&&(!approval.data.expiresAt||Date.parse(approval.data.expiresAt)>Date.parse(now)),'NEEDS_APPROVAL');}
  await host.assertWorkerLease!(tx);
 },10000);
}
/** An uncertain actual provider outcome cannot become privacy-quiescent FAILED.
 * Loss of the worker lease prevents this write as well; the existing RUNNING
 * marker remains until a separately evidenced outcome can be reconciled. */
export async function markInternalAssistantUnknown<T extends Transaction>(companyId:string,requestId:string,reason:string,host:InternalAssistantHost<T>):Promise<void>{
 assert(host.assertWorkerLease&&/^[A-Z_]{3,100}$/.test(reason),'VALIDATION_ERROR');await host.transaction(companyId,'INTERNAL_ASSISTANT_WORKER',async tx=>{
  await host.assertWorkerLease!(tx);const request=same(await tx.get('internal_assistant_request',requestId),companyId);if(['READY','NEEDS_CLARIFICATION','CONFIRMED'].includes(request.data.status))return;assert(request.data.status==='RUNNING','INVALID_STATE');
  if(request.data.providerOutcome==='UNKNOWN'&&request.data.error===reason)return;
  await tx.save(request,{...request.data,status:'RUNNING',providerOutcome:'UNKNOWN',error:reason,unknownAt:clock(host)});await tx.event('internal_assistant.outcome_unknown',{requestId:request.id,ownerUserId:request.data.ownerUserId,error:reason,category:'INTERNAL_DRAFT'});await host.assertWorkerLease!(tx);
 },10000);
}
export async function persistInternalAssistantDraft<T extends Transaction>(companyId:string,requestId:string,contextHash:string,result:InternalAssistantProviderResult,host:InternalAssistantHost<T>){
 assert(host.assertWorkerLease,'MISSING_CONFIGURATION');return host.transaction(companyId,'INTERNAL_ASSISTANT_WORKER',async tx=>{await host.assertWorkerLease!(tx);const request=same(await tx.get('internal_assistant_request',requestId),companyId),actor=await host.actorIn(tx,request.data.ownerUserId),now=clock(host),current=await snapshot(tx,actor,request.data,host,now);assert(current.contextHash===contextHash&&contextHash===request.data.contextHash,'VERSION_CONFLICT');
  const proposal=parseInternalDraftProposal(result.proposal,{kind:request.data.kind,context:current.context,text:current.message.data.text});assert(typeof result.provider==='string'&&result.provider.length>0&&result.provider.length<=100&&result.model===current.config.data.model,'AI_INVALID_JSON');if(result.usage)assert([result.usage.input_tokens,result.usage.output_tokens,result.usage.cost_cents].every(v=>Number.isSafeInteger(v)&&v>=0),'AI_INVALID_JSON');
  const draftId=key('internal-assistant-draft',companyId,request.id),previous=await optional(tx,'internal_assistant_draft',draftId);if(previous){assert(previous.data.contextHash===contextHash&&digest(previous.data.proposal)===digest(proposal),'VERSION_CONFLICT');return view(previous);}assert(request.data.status==='RUNNING','INVALID_STATE');
  let canonicalInput:Data|null=null,canonicalPreviewHash:string|null=null,preview:Data;
  if(proposal.needsClarification)preview={kind:proposal.kind,clarification:proposal.clarification,originalText:current.message.data.text,sideEffectsExecuted:false};
  else if(proposal.kind==='TASK_BATCH'){
   const tasks=proposal.input!.tasks.map(({sourceQuote,...t})=>({...t,billingScope:'INTERNAL',clientVisible:false,checklist:t.checklist.map(c=>({...c,checked:false}))}));canonicalInput={batchKey:draftId,tasks};const checked=await invoke(host,tx,actor,'task.bulk.preview',canonicalInput,key('internal-assistant-batch-preview',draftId),now);assert(checked.canCommit,'VALIDATION_ERROR');canonicalPreviewHash=checked.previewHash;
   preview={kind:proposal.kind,tasks:proposal.input!.tasks.map(t=>({...t,fullPath:current.context.locations.find(n=>n.id===t.locationId)!.path,executors:t.assigneeIds.map(id=>current.context.assignees.find(w=>w.id===id)),billingScope:'INTERNAL',clientVisible:false})),sideEffectsExecuted:false};
  }else {canonicalInput=proposal.input as Data;const name=proposal.kind==='REPORT'?'report.create':'request.create';host.registry[name]!.schema.parse(canonicalInput);preview={kind:proposal.kind,input:canonicalInput,sideEffectsExecuted:false,stateAfterConfirmation:'DRAFT'};}
  const data={ownerUserId:actor.userId,user_id:actor.userId,requestId:request.id,channelId:request.data.channelId,messageId:request.data.messageId,sourceMessageId:request.data.messageId,messageVersion:request.data.messageVersion,configId:request.data.configId,configVersion:request.data.configVersion,kind:request.data.kind,siteIds:request.data.siteIds,contextHash,referenceVersions:current.references,proposal,canonicalInput,canonicalPreviewHash,preview,previewHash:reviewHash({preview,canonicalInput,canonicalPreviewHash,proposal}),state:proposal.needsClarification?'NEEDS_CLARIFICATION':'DRAFT',provider:result.provider,model:result.model,usage:result.usage??null,createdAt:now};
  internalJson(data,196608);const draft=await tx.add('internal_assistant_draft',data,draftId);await tx.save(request,{...request.data,status:proposal.needsClarification?'NEEDS_CLARIFICATION':'READY',draftId:draft.id,completedAt:now});await tx.event('internal_assistant.draft_prepared',{requestId:request.id,draftId:draft.id,ownerUserId:actor.userId,kind:request.data.kind});await host.assertWorkerLease!(tx);return view(draft);
 },10000);
}
export async function failInternalAssistant<T extends Transaction>(companyId:string,requestId:string,reason:string,host:InternalAssistantHost<T>){assert(host.assertWorkerLease&&/^[A-Z_]{3,100}$/.test(reason),'VALIDATION_ERROR');return host.transaction(companyId,'INTERNAL_ASSISTANT_WORKER',async tx=>{await host.assertWorkerLease!(tx);const request=await tx.get('internal_assistant_request',requestId);if(['READY','NEEDS_CLARIFICATION','CONFIRMED'].includes(request.data.status))return;assert(request.data.providerOutcome!=='UNKNOWN','PROVIDER_OUTCOME_UNKNOWN');await tx.save(request,{...request.data,status:'FAILED',error:reason,completedAt:clock(host)});await tx.event('internal_assistant.failed',{requestId:request.id,ownerUserId:request.data.ownerUserId,error:reason});await host.assertWorkerLease!(tx);},10000);}

/** Raw aggregate reads obey the same current source/snapshot authority as the
 * reviewed draft. Ownership alone never retains internal facts after role,
 * membership, site, source, config or referenced business records change.
 * No provider, command handler, event, receipt or storage write is performed. */
export async function internalAssistantVisible<T extends Transaction>(tx:T,actor:Actor,entity:Entity,host:InternalAssistantHost<T>,now:string):Promise<boolean>{
 if(!['internal_assistant_request','internal_assistant_draft'].includes(entity.kind)||entity.companyId!==actor.companyId||entity.data.ownerUserId!==actor.userId)return false;
 try{
  const current=await host.actorIn(tx,actor.userId);assert(current.companyId===actor.companyId,'ACCESS_DENIED');
  const stored=same(await tx.get(entity.kind,entity.id),current.companyId);assert(stored.data.ownerUserId===current.userId&&stored.version===entity.version,'ACCESS_DENIED');
  if(stored.kind==='internal_assistant_draft'){await ownDraft(tx,current,stored.id,host,now);return true;}
  const sourceSnapshot=await snapshot(tx,current,stored.data,host,now);assert(sourceSnapshot.contextHash===stored.data.contextHash,'VERSION_CONFLICT');return true;
 }catch{return false;}
}
