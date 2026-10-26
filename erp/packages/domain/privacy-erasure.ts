import {createHash} from 'node:crypto';
import {assert,type Actor,type Data,type Entity} from './core.ts';

/** Planning/verification only. A trusted persistence adapter must execute the approved actions. */
export const ERASURE_PLAN_VERSION='knaba-chat-media-erasure-v1';
const DAY=86_400_000,PREVIEW_TTL=600_000,MAX_RECORDS=25_000,MAX_ACTIONS=2_000;
export type ErasureCategory='CHAT'|'MEDIA';
export interface RevisionRecord {companyId:string;kind:string;id:string;version:number;data:Data;createdAt?:string;}
export interface ReceiptRecord {companyId:string;actorId:string;idempotencyKey:string;command:string;result:unknown;}
export interface ErasureOutboxRecord {companyId:string;id:string;type:string;data:Data;status:string;}
export interface ErasureWebhookRecord {companyId:string;provider:string;eventId:string;payload:unknown;}
export interface ErasureSnapshot {
 companyId:string;request:Entity;legalApproval:Entity;policies:Entity[];holds:Entity[];
 aggregates:Entity[];revisions:RevisionRecord[];receipts:ReceiptRecord[];
 outbox:ErasureOutboxRecord[];webhookInbox:ErasureWebhookRecord[];
}
export interface ErasureAuthority {actor:Actor;now:string;}
export interface ErasureAction {
 type:'REDACT_AGGREGATE'|'REDACT_REVISION'|'REDACT_RECEIPT'|'CANCEL_OUTBOX'|'REDACT_WEBHOOK'|'DELETE_BLOB';
 companyId:string;id:string;kind?:string;version?:number;actorId?:string;provider?:string;
 expectedDataHash:string;expectedBlobSha256?:string;replacement?:Data;
 category:ErasureCategory;reason:'SOURCE'|'DERIVED';
}
export interface RetainedErasureRecord {kind:string;id:string;category:ErasureCategory;reason:'LEGAL_HOLD'|'NOT_EXPIRED'|'BUSINESS_RECORD_LINK_REQUIRES_REVIEW'|'SHARED_BLOB_REQUIRES_REVIEW'|'INVALID_RETENTION_DATE'|'UNVERIFIED_BLOB_REFERENCE'|'IN_FLIGHT_PROCESSOR_REQUIRES_QUIESCENCE';}
export interface PrivacyErasurePlan {
 version:typeof ERASURE_PLAN_VERSION;companyId:string;subjectUserId:string;requestId:string;requestVersion:number;
 createdAt:string;expiresAt:string;legalApprovalId:string;legalApprovalVersion:number;
 categories:ErasureCategory[];policyVersions:{id:string;version:number;category:ErasureCategory;days:number}[];
 actions:ErasureAction[];retained:RetainedErasureRecord[];snapshotHash:string;planHash:string;
 sourceDataDeleted:false;externalCopiesStatus:'PENDING';
}
export interface ErasureBlobCheck {companyId:string;id:string;result:'NOT_FOUND'|'PRESENT'|'UNVERIFIED';}
const canonical=(v:any):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
export const erasureHash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const cat=(value:string)=>value==='MESSAGES'?'CHAT':value;
const routerKinds=new Set(['whatsapp_router_session','whatsapp_router_action','whatsapp_router_response']);
/** Lease/sequence/review facts have no approved metadata-erasure class yet. */
export const GPS_DEVICE_METADATA_KINDS=Object.freeze(['device_event_review','device_event_cursor','device_boot_cursor','tracking_session'] as const);
const gpsDeviceMetadataKinds=new Set<string>(GPS_DEVICE_METADATA_KINDS);
const subject=(e:Entity)=>e.kind==='message'?(e.data.author_id??e.data.authorId):e.kind==='conversation_input'||routerKinds.has(e.kind)?e.data.user_id:e.data.uploadedBy;
const sourceKinds=new Set(['message','media_asset','media_upload','media_client_edit','conversation_input',...routerKinds]);
const derivedKinds=new Set(['message_version','message_copy_preview','translation','translation_request','delivery','callback','channel_activity','search_index','knowledge_index','conversation_input','notification','assistant_lead_draft','assistant_tool_call','internal_assistant_request','internal_assistant_draft',...routerKinds]);
const processorKinds=new Set(['ai_usage']);
const protectedKinds=new Set(['report','report_version','report_artifact','official_payslip','payroll_calculation','payout','payout_receipt','payout_reconciliation','payroll_approval','payroll_lock','task','task_batch','material_request','material_request_batch','task_review','worklog','defect','issue','quote','order','lead','decision','customer_acknowledgment','privacy_export','legal_approval','manual_device_event',...GPS_DEVICE_METADATA_KINDS]);
const referenceKeys=new Set(['id','messageId','message_id','sourceMessageId','source_message_id','messageIds','sourceMessageIds','sources','copied_from','mediaId','media_id','mediaIds','photoIds','attachment_ids','uploadId','blobKey','clientBlobKey','sourceClientBlobKey','clientEditId','key','translationId','translation_id','requestId','request_id','deliveryId','delivery_id','input_id','session_id','response_id','router_response_id','router_action_id','claimed_input_id','text_choices','event_id','eventId','provider_event_id','draftId','draft_id','leadId','lead_id']);
// Confirmation receipts/events are canonical business evidence, never private draft caches.
const erasableReceipt=(command:string)=>/^(message|translation|callback|delivery|media|assistant|channel\.messages|public\.chat|whatsapp)\./.test(command)||/^internal_assistant\.(request|preview)$/.test(command);
const erasableOutbox=(type:string)=>/^(message|translation|delivery|notification|assistant|whatsapp|conversation|media)\./.test(type)||/^internal_assistant\.(requested|draft_prepared|failed)$/.test(type);
function references(value:unknown,ids:Set<string>):boolean {
 if(!value||typeof value!=='object')return false;
 if(Array.isArray(value))return value.some(v=>typeof v==='object'&&references(v,ids));
 const object=value as Data;if(object.source==='AI'&&typeof object.reply_to_id==='string'&&ids.has(object.reply_to_id))return true;
 return Object.entries(value).some(([key,v])=>referenceKeys.has(key)&&(typeof v==='string'&&ids.has(v)||Array.isArray(v)&&v.some(item=>typeof item==='string'&&ids.has(item)))||v!==null&&typeof v==='object'&&references(v,ids));
}
function referenceTokens(value:unknown,tokens=new Set<string>()):Set<string>{
 if(!value||typeof value!=='object')return tokens;
 if(Array.isArray(value)){for(const item of value)if(item&&typeof item==='object')referenceTokens(item,tokens);return tokens;}
 const object=value as Data;if(object.source==='AI'&&typeof object.reply_to_id==='string')tokens.add(object.reply_to_id);
 for(const [name,item] of Object.entries(value)){if(referenceKeys.has(name)){if(typeof item==='string')tokens.add(item);if(Array.isArray(item))for(const entry of item)if(typeof entry==='string')tokens.add(entry);}if(item&&typeof item==='object')referenceTokens(item,tokens);}return tokens;
}
/** A cancelled lease cannot retract source data already held by an asynchronous provider. */
function inFlightChains(s:ErasureSnapshot,candidates:Entity[]):{held:Set<string>;component:Map<string,string>}{
 const nodes=candidates.filter(r=>sourceKinds.has(r.kind)||derivedKinds.has(r.kind)),parents=new Map(nodes.map(r=>[`${r.kind}:${r.id}`,`${r.kind}:${r.id}`])),aliases=new Map<string,string[]>();
 const identity=(r:{kind:string;id:string})=>`${r.kind}:${r.id}`;
 const find=(key:string):string=>{let root=key;while(parents.get(root)!==root)root=parents.get(root)!;while(key!==root){const next=parents.get(key)!;parents.set(key,root);key=next;}return root;};
 const union=(a:string,b:string)=>{const left=find(a),right=find(b);if(left!==right)parents.set(right,left);};
 const history=new Map<string,Data[]>();for(const revision of s.revisions.filter(r=>r.companyId===s.companyId)){const id=identity(revision);history.set(id,[...(history.get(id)??[]),revision.data]);}
 for(const row of nodes){const id=identity(row),data=[row.data,...(history.get(id)??[])];for(const alias of new Set([row.id,...data.flatMap(d=>[d.blobKey,d.clientBlobKey,d.sourceClientBlobKey,d.provider_event_id,d.input?.id]).filter((v):v is string=>typeof v==='string')]))aliases.set(alias,[...(aliases.get(alias)??[]),id]);}
 for(const identities of aliases.values())for(const id of identities.slice(1))union(identities[0]!,id);
 const linked=(data:unknown)=>new Set([...referenceTokens(data)].flatMap(token=>aliases.get(token)??[]));
 for(const row of nodes)for(const data of [row.data,...(history.get(identity(row))??[])])for(const other of linked(data))union(identity(row),other);
 const held=new Set<string>(),jobs=new Map<string,Set<string>>();
 for(const outbox of s.outbox.filter(o=>o.companyId===s.companyId)){const ids=linked(outbox.data);jobs.set(outbox.id,ids);if(outbox.status==='RUNNING')for(const id of ids)held.add(find(id));}
 for(const row of nodes)if(row.kind==='delivery'&&row.data.status==='SENDING'||row.kind==='translation'&&['RUNNING','SENDING','PROCESSING','IN_FLIGHT'].includes(row.data.status)||row.kind==='whatsapp_router_response'&&row.data.status==='SENDING'||row.kind==='whatsapp_router_action'&&row.data.status==='CLAIMED')held.add(find(identity(row)));
 // A terminal outbox lease does not prove that a provider call has returned.
 // Current terminal request state is authoritative; historical RUNNING alone
 // must not retain a completed request forever. A nonterminal reset is unsafe.
 for(const row of nodes.filter(r=>r.kind==='internal_assistant_request')){
  const current=row.data.status,started=current==='RUNNING'||(history.get(identity(row))??[]).some(d=>d.status==='RUNNING');
  if(started&&!['READY','NEEDS_CLARIFICATION','FAILED','CONFIRMED'].includes(current))held.add(find(identity(row)));
 }
 for(const usage of ownRows(s).filter(r=>r.kind==='ai_usage'&&r.data.status==='RUNNING'))for(const id of new Set([...linked(usage.data),...(jobs.get(usage.data.event_id)??[])]))held.add(find(id));
 return {held:new Set(nodes.filter(r=>held.has(find(identity(r)))).map(identity)),component:new Map(nodes.map(row=>[identity(row),find(identity(row))]))};
}
function blobReferences(e:{data:Data}){return [e.data.blobKey,e.data.clientBlobKey,e.data.sourceClientBlobKey].filter((v):v is string=>typeof v==='string'&&v.length>0);}
function ownRows(s:ErasureSnapshot){return s.aggregates.filter(e=>e.companyId===s.companyId);}
export interface GpsMetadataRetentionRecord {
 kind:typeof GPS_DEVICE_METADATA_KINDS[number];id:string;version:number;storage:'CURRENT'|'REVISION';
 lineage:'SAME_SUBJECT_SERVER_LEASE'|'UNVERIFIED_LEASE';trackingSessionId?:string;
 coordinateStorageStatus:'COORDINATE_FREE'|'UNSAFE_COORDINATE_COPY_REQUIRES_REVIEW';
}
const coordinateKeys=new Set(['latitude','longitude','accuracyM','lat','lng','lon','coordinates']);
function containsCoordinateCopy(value:unknown):boolean {
 if(!value||typeof value!=='object')return false;
 if(Array.isArray(value))return value.some(containsCoordinateCopy);
 return Object.entries(value).some(([name,item])=>coordinateKeys.has(name)||containsCoordinateCopy(item));
}
/**
 * Internal planning inventory, not a subject-access authorization or deletion plan.
 * The caller must load an authorized company snapshot. Emit only explicit own-subject
 * identities; a matching linked lease never imports another employee's rows or data.
 * Raw point expiry is separately enforced by knaba_purge_gps. The target provides no
 * approved TTL for lease/sequence/review evidence, so these records stay preserved.
 */
export function buildGpsMetadataRetentionInventory(s:Pick<ErasureSnapshot,'companyId'|'aggregates'|'revisions'>,subjectUserId:string){
 assert(typeof s.companyId==='string'&&s.companyId.length>0&&typeof subjectUserId==='string'&&subjectUserId.length>0,'VALIDATION_ERROR');
 assert(s.aggregates.length+s.revisions.length<=MAX_RECORDS,'VALIDATION_ERROR',{reason:'ERASURE_SNAPSHOT_LIMIT'});
 const own=[...s.aggregates.map(row=>({row,storage:'CURRENT' as const})),...s.revisions.map(row=>({row,storage:'REVISION' as const}))].filter(({row})=>row.companyId===s.companyId&&gpsDeviceMetadataKinds.has(row.kind)&&row.data.employeeId===subjectUserId);
 const currentLeases=new Map(s.aggregates.filter(r=>r.companyId===s.companyId&&r.kind==='tracking_session').map(r=>[r.id,r]));
 const historyLeases=new Map<string,RevisionRecord[]>();
 for(const row of s.revisions)if(row.companyId===s.companyId&&row.kind==='tracking_session')historyLeases.set(row.id,[...(historyLeases.get(row.id)??[]),row]);
 const records:GpsMetadataRetentionRecord[]=own.map(({row,storage})=>{
  const leaseId=row.kind==='tracking_session'?row.id:row.data.trackingSessionId;
  // Prefer current authority; historical source ownership must agree too. A
  // missing/reassigned lease is unverified and cannot broaden the inventory.
  const current=currentLeases.get(leaseId),history=historyLeases.get(leaseId)??[];
  const candidates=current?[current]:history;
  const matching=candidates.length>0&&candidates.every(lease=>lease.data.source==='SERVER'&&lease.data.employeeId===subjectUserId&&typeof lease.data.deviceId==='string'&&lease.data.deviceId.length>0&&lease.data.deviceId===row.data.deviceId&&['shiftId','policyVersionId'].every(name=>row.data[name]===undefined||row.data[name]===lease.data[name]));
  const lineage=matching&&history.every(lease=>lease.data.source==='SERVER'&&lease.data.employeeId===subjectUserId)?'SAME_SUBJECT_SERVER_LEASE':'UNVERIFIED_LEASE';
  return {kind:row.kind as GpsMetadataRetentionRecord['kind'],id:row.id,version:row.version,storage,lineage,...(lineage==='SAME_SUBJECT_SERVER_LEASE'?{trackingSessionId:leaseId}:{}),coordinateStorageStatus:containsCoordinateCopy(row.data)?'UNSAFE_COORDINATE_COPY_REQUIRES_REVIEW':'COORDINATE_FREE'};
 });
 records.sort((a,b)=>(a.kind+'\0'+a.id+'\0'+a.storage).localeCompare(b.kind+'\0'+b.id+'\0'+b.storage)||a.version-b.version);
 return {companyId:s.companyId,subjectUserId,retentionDecision:'PRESERVE_PENDING_APPROVED_METADATA_CLASS' as const,rawCoordinateDeletion:'SEPARATE_DEDICATED_GPS_PURGE' as const,records,sourceDataDeleted:false as const,requestFulfilled:false as const,fullLegalDsarFulfillment:false as const};
}
function key(e:{kind?:string;id:string;version?:number;actorId?:string;provider?:string}){return [e.kind??'',e.id,e.version??'',e.actorId??'',e.provider??''].join('\u0000');}
function authorize(s:ErasureSnapshot,a:ErasureAuthority){
 const now=Date.parse(a.now);assert(Number.isFinite(now),'VALIDATION_ERROR');
 assert(a.actor.companyId===s.companyId&&a.actor.roles.includes('OWNER')&&a.actor.permissions.includes('privacy.review')&&a.actor.permissions.includes('scope.company')&&a.actor.mfaVerified===true,'NEEDS_REAUTH');
 const r=s.request;assert(r.companyId===s.companyId&&r.kind==='privacy_request'&&r.data.type==='ERASURE'&&r.data.state==='AWAITING_ERASURE_EXECUTION','INVALID_STATE');
 assert(typeof r.data.subjectUserId==='string'&&r.data.subjectUserId!==a.actor.userId,'SELF_APPROVAL_DENIED');
 assert(ownRows(s).some(e=>e.kind==='user'&&e.id===r.data.subjectUserId),'NOT_FOUND_SAFE');
 assert(r.data.categories?.length>0&&r.data.categories.every((c:string)=>['CHAT','MESSAGES','MEDIA'].includes(c)),'NEEDS_APPROVAL',{reason:'ONLY_CHAT_MEDIA_ERASURE_SUPPORTED'});
 const legal=s.legalApproval;assert(legal.companyId===s.companyId&&legal.id===r.data.legalApprovalId&&legal.version===r.data.legalApprovalVersion&&legal.data.subject==='PRIVACY'&&legal.data.status==='APPROVED'&&legal.data.active===true&&legal.data.evidenceReference?.length>=8&&Date.parse(legal.data.approvedAt)<=now&&Date.parse(legal.data.expiresAt)>now,'NEEDS_APPROVAL');
 const categories=[...new Set(r.data.categories.map(cat))].sort() as ErasureCategory[];
 assert(categories.every(c=>legal.data.scope?.erasureCategories?.map(cat).includes(c)),'NEEDS_APPROVAL',{reason:'EXPLICIT_ERASURE_SCOPE_REQUIRED'});
 const policies=categories.map(category=>{
  const matches=s.policies.filter(p=>p.companyId===s.companyId&&p.kind==='retention_policy'&&p.data.state==='APPROVED'&&cat(p.data.category)===category&&p.data.legalApprovalId===legal.id&&p.data.legalApprovalVersion===legal.version&&typeof p.data.approvedBy==='string'&&p.data.approvedBy!==p.data.createdBy&&Number.isFinite(Date.parse(p.data.approvedAt))&&Date.parse(p.data.approvedAt)<=now);
  assert(matches.length===1,'NEEDS_APPROVAL',{reason:'ONE_CURRENT_APPROVED_RETENTION_POLICY_REQUIRED',category});
  const p=matches[0]!,bounds=legal.data.scope?.retentionProfiles?.[category],days=p.data.retentionDays;
  assert(Number.isSafeInteger(days)&&days>=0&&days<=36500&&bounds&&Number.isSafeInteger(bounds.minDays)&&Number.isSafeInteger(bounds.maxDays)&&days>=bounds.minDays&&days<=bounds.maxDays&&p.data.minDays===bounds.minDays&&p.data.maxDays===bounds.maxDays,'NEEDS_APPROVAL');return {id:p.id,version:p.version,category,days};
 });
 assert(s.aggregates.length+s.revisions.length+s.receipts.length+s.outbox.length+s.webhookInbox.length<=MAX_RECORDS,'VALIDATION_ERROR',{reason:'ERASURE_SNAPSHOT_LIMIT'});
 for(const hold of s.holds.filter(h=>h.companyId===s.companyId&&h.data.state==='ACTIVE'))assert(hold.kind==='legal_hold'&&typeof hold.data.subjectUserId==='string'&&Array.isArray(hold.data.categories)&&hold.data.categories.length>0&&hold.data.categories.every((c:unknown)=>typeof c==='string')&&Number.isFinite(Date.parse(hold.data.expiresAt)),'NEEDS_APPROVAL',{reason:'MALFORMED_ACTIVE_LEGAL_HOLD_REQUIRES_REVIEW'});
 return {now,categories,policies,subjectUserId:r.data.subjectUserId as string};
}
function safeReplacement(kind:string,e:Data,requestId:string,at:string):Data {
 // Deliberately exclude body, captions, original/revised source text, keys and nested snapshots.
 const keep=['siteId','site_id','taskId','task_id','channel_id','channelId','author_id','authorId','uploadedBy','employeeId','message_id','messageId','message_version','translation_id','recipient_id','language','stage','visibility','reply_to_id','copied_from'];
 const result:Data=Object.fromEntries(keep.filter(k=>['string','number','boolean'].includes(typeof e[k])).map(k=>[k,e[k]]));
 Object.assign(result,{privacyErasedAt:at,privacyErasureRequestId:requestId,state:'ERASED',status:'CANCELLED'});
 if(kind==='message'){result.text='';result.deleted_at=at;result.attachment_ids=[];result.revisions=[];}
 return result;
}
function fingerprint(s:ErasureSnapshot){
 const rows=ownRows(s).filter(e=>sourceKinds.has(e.kind)||derivedKinds.has(e.kind)||protectedKinds.has(e.kind)||processorKinds.has(e.kind));
 const map=(rows:any[])=>rows.map(e=>({key:key(e),hash:erasureHash(e)})).sort((a,b)=>a.key.localeCompare(b.key));
 return erasureHash({rows:map(rows),approval:s.legalApproval,policies:map(s.policies.filter(e=>e.companyId===s.companyId)),holds:map(s.holds.filter(e=>e.companyId===s.companyId)),revisions:map(s.revisions.filter(e=>e.companyId===s.companyId&&(sourceKinds.has(e.kind)||derivedKinds.has(e.kind)||protectedKinds.has(e.kind)||processorKinds.has(e.kind)))),receipts:map(s.receipts.filter(e=>e.companyId===s.companyId&&erasableReceipt(e.command)).map(r=>({...r,id:r.idempotencyKey}))),outbox:map(s.outbox.filter(e=>e.companyId===s.companyId&&erasableOutbox(e.type))),webhooks:map(s.webhookInbox.filter(e=>e.companyId===s.companyId).map(e=>({...e,id:e.eventId})))});
}
function build(s:ErasureSnapshot,a:ErasureAuthority,createdAt:string):PrivacyErasurePlan {
 const authority=authorize(s,a),rows=ownRows(s),created=Date.parse(createdAt);assert(Number.isFinite(created)&&created<=authority.now,'VALIDATION_ERROR');
 // Orphan immutable revisions still contain source data. Their source age is required;
 // absence of a trustworthy timestamp must block redaction rather than invent an age.
 const candidates=[...rows];for(const revision of s.revisions.filter(r=>r.companyId===s.companyId&&(sourceKinds.has(r.kind)||derivedKinds.has(r.kind))))if(!candidates.some(e=>e.kind===revision.kind&&e.id===revision.id)){
  const versions=s.revisions.filter(r=>r.companyId===s.companyId&&r.kind===revision.kind&&r.id===revision.id),latest=versions.reduce((a,b)=>a.version>b.version?a:b);
  const timestamps=versions.map(r=>Date.parse(r.createdAt??'')).filter(Number.isFinite);
  candidates.push({...latest,createdAt:timestamps.length?new Date(Math.min(...timestamps)).toISOString():'',updatedAt:''});
 }
 const retained:RetainedErasureRecord[]=[],selected=new Map<string,{row:Entity;category:ErasureCategory}>(),flights=inFlightChains(s,candidates),blockedComponents=new Map<string,ErasureCategory>();
 const protectors=[...rows.filter(e=>protectedKinds.has(e.kind)),...s.revisions.filter(e=>e.companyId===s.companyId&&protectedKinds.has(e.kind))];
 // Confirmed business intake is retained for review; unconfirmed private tool
 // drafts remain erasable copies. A lead/order itself is never blindly redacted.
 const businessLeadIds=new Set(protectors.filter(p=>p.kind==='lead').map(p=>p.id));
 for(const cache of [...rows,...s.revisions.filter(r=>r.companyId===s.companyId)])if(cache.kind==='assistant_lead_draft'&&cache.data.state==='CONFIRMED'&&typeof cache.data.leadId==='string'&&businessLeadIds.has(cache.data.leadId))protectors.push({...cache,data:{...cache.data,id:cache.id}});
 // A user-confirmed internal draft records business intent even when the
 // resulting task/report/material request has moved or is not in this snapshot.
 const confirmedInternal=[...rows,...s.revisions.filter(r=>r.companyId===s.companyId)].filter(r=>r.kind==='internal_assistant_draft'&&r.data.state==='CONFIRMED'||r.kind==='internal_assistant_request'&&r.data.status==='CONFIRMED').map(r=>({...r,data:{...r.data,id:r.id}}));
 protectors.push(...confirmedInternal);
 const businessComponents=new Set<string>();
 for(const row of candidates)if(confirmedInternal.some(p=>references(p.data,new Set([row.id,...blobReferences(row)])))){
  const component=flights.component.get(`${row.kind}:${row.id}`);if(component)businessComponents.add(component);
 }
 const retain=(row:Entity,category:ErasureCategory,reason:RetainedErasureRecord['reason'])=>retained.push({kind:row.kind,id:row.id,category,reason});
 for(const row of candidates.filter(e=>sourceKinds.has(e.kind)&&subject(e)===authority.subjectUserId&&!e.data.privacyErasedAt)){
  const category:ErasureCategory=['message','conversation_input'].includes(row.kind)||routerKinds.has(row.kind)?'CHAT':'MEDIA';if(!authority.categories.includes(category))continue;
  const holds=s.holds.filter(h=>h.companyId===s.companyId&&h.data.subjectUserId===authority.subjectUserId&&h.data.state==='ACTIVE'&&Date.parse(h.data.expiresAt)>authority.now&&h.data.categories?.map(cat).includes(category));
  if(holds.length){retain(row,category,'LEGAL_HOLD');continue;}
  const date=Date.parse(row.createdAt),policy=authority.policies.find(p=>p.category===category)!;
  if(!Number.isFinite(date)){retain(row,category,'INVALID_RETENTION_DATE');continue;}
  if(date>created-policy.days*DAY){retain(row,category,'NOT_EXPIRED');continue;}
  if(flights.held.has(`${row.kind}:${row.id}`)){retain(row,category,'IN_FLIGHT_PROCESSOR_REQUIRES_QUIESCENCE');blockedComponents.set(flights.component.get(`${row.kind}:${row.id}`)!,category);continue;}
  if(businessComponents.has(flights.component.get(`${row.kind}:${row.id}`)??'')){retain(row,category,'BUSINESS_RECORD_LINK_REQUIRES_REVIEW');continue;}
  const ids=new Set([row.id,...blobReferences(row)]);
  if(protectors.some(p=>references(p.data,ids))){retain(row,category,'BUSINESS_RECORD_LINK_REQUIRES_REVIEW');continue;}
  selected.set(`${row.kind}:${row.id}`,{row,category});
 }
 for(const row of candidates){const category=blockedComponents.get(flights.component.get(`${row.kind}:${row.id}`)??'');if(category&&!retained.some(r=>r.kind===row.kind&&r.id===row.id)){retain(row,category,'IN_FLIGHT_PROCESSOR_REQUIRES_QUIESCENCE');selected.delete(`${row.kind}:${row.id}`);}}
 // A retained/current asset sharing an upload/blob makes that blob ineligible, including revisions.
 for(let changed=true;changed;){changed=false;for(const [identity,{row,category}] of selected){if(category!=='MEDIA')continue;const ids=new Set(blobReferences(row));if(row.kind==='media_upload')ids.add(row.id);
  const shared=candidates.some(other=>['media_asset','media_upload','media_client_edit'].includes(other.kind)&&other.id!==row.id&&!selected.has(`${other.kind}:${other.id}`)&&(blobReferences(other).some(b=>ids.has(b))||typeof other.data.uploadId==='string'&&ids.has(other.data.uploadId)));
  if(shared){selected.delete(identity);retain(row,category,'SHARED_BLOB_REQUIRES_REVIEW');changed=true;}
 }}
 const selectedMessages=new Set([...selected.values()].filter(v=>v.category==='CHAT').map(v=>v.row.id));
 for(let changed=true;changed;){changed=false;for(const row of candidates)if(row.kind==='message'&&!selectedMessages.has(row.id)&&[row,...s.revisions.filter(r=>r.companyId===s.companyId&&r.kind===row.kind&&r.id===row.id)].some(version=>typeof version.data.copied_from==='string'&&selectedMessages.has(version.data.copied_from)||version.data.source==='AI'&&typeof version.data.reply_to_id==='string'&&selectedMessages.has(version.data.reply_to_id))){
  assert(!protectors.some(p=>references(p.data,new Set([row.id]))),'NEEDS_APPROVAL',{reason:'ERASURE_DERIVED_BUSINESS_REFERENCE_REQUIRES_REVIEW'});
  assert(!s.holds.some(h=>h.companyId===s.companyId&&h.data.subjectUserId===subject(row)&&h.data.state==='ACTIVE'&&Date.parse(h.data.expiresAt)>authority.now&&h.data.categories?.map(cat).includes('CHAT')),'NEEDS_APPROVAL',{reason:'DERIVED_COPY_LEGAL_HOLD'});
  selectedMessages.add(row.id);selected.set(`message:${row.id}`,{row,category:'CHAT'});changed=true;
 }}
 const actions:ErasureAction[]=[],allIds=new Set([...selected.values()].map(v=>v.row.id)),rowActions=new Map<string,ErasureAction>();
 const addRow=(row:Entity,category:ErasureCategory,reason:'SOURCE'|'DERIVED')=>{const action:ErasureAction={type:'REDACT_AGGREGATE',companyId:s.companyId,id:row.id,kind:row.kind,version:row.version,expectedDataHash:erasureHash(row.data),replacement:safeReplacement(row.kind,row.data,s.request.id,createdAt),category,reason};rowActions.set(`${row.kind}:${row.id}`,action);if(rows.some(r=>r.kind===row.kind&&r.id===row.id))actions.push(action);};
 for(const {row,category} of selected.values())addRow(row,category,subject(row)===authority.subjectUserId?'SOURCE':'DERIVED');
 for(let changed=true;changed;){changed=false;for(const row of candidates)if(derivedKinds.has(row.kind)&&!allIds.has(row.id)&&[row,...s.revisions.filter(r=>r.companyId===s.companyId&&r.kind===row.kind&&r.id===row.id)].some(version=>references(version.data,allIds))){
  const category:ErasureCategory=[row,...s.revisions.filter(r=>r.companyId===s.companyId&&r.kind===row.kind&&r.id===row.id)].some(version=>references(version.data,selectedMessages))?'CHAT':'MEDIA';allIds.add(row.id);addRow(row,category,'DERIVED');changed=true;
 }}
 assert(!protectors.some(p=>references(p.data,allIds)),'NEEDS_APPROVAL',{reason:'ERASURE_DERIVED_BUSINESS_REFERENCE_REQUIRES_REVIEW'});
 for(const r of s.revisions.filter(r=>r.companyId===s.companyId)){const source=rowActions.get(`${r.kind}:${r.id}`);if(source)actions.push({type:'REDACT_REVISION',companyId:s.companyId,id:r.id,kind:r.kind,version:r.version,expectedDataHash:erasureHash(r.data),replacement:safeReplacement(r.kind,r.data,s.request.id,createdAt),category:source.category,reason:!rows.some(row=>row.kind===r.kind&&row.id===r.id)&&source.reason==='SOURCE'?'SOURCE':'DERIVED'});}
 const eventIds=new Set(candidates.filter(r=>r.kind==='conversation_input'&&rowActions.has(`${r.kind}:${r.id}`)).flatMap(r=>[r.data.provider_event_id,r.data.input?.id]).filter((v):v is string=>typeof v==='string'));
 for(const eventId of eventIds)allIds.add(eventId);for(const value of selected.values())for(const blobId of blobReferences(value.row))allIds.add(blobId);
 assert(!s.receipts.some(r=>r.companyId===s.companyId&&!erasableReceipt(r.command)&&!r.command.startsWith('privacy.')&&references(r.result,allIds)),'NEEDS_APPROVAL',{reason:'BUSINESS_RECEIPT_SOURCE_REFERENCE_REQUIRES_REVIEW'});
 assert(!s.outbox.some(o=>o.companyId===s.companyId&&!erasableOutbox(o.type)&&!o.type.startsWith('privacy.')&&references(o.data,allIds)),'NEEDS_APPROVAL',{reason:'BUSINESS_OUTBOX_SOURCE_REFERENCE_REQUIRES_REVIEW'});
 for(const r of s.receipts.filter(r=>r.companyId===s.companyId))if(erasableReceipt(r.command)&&references(r.result,allIds))actions.push({type:'REDACT_RECEIPT',companyId:s.companyId,id:r.idempotencyKey,actorId:r.actorId,expectedDataHash:erasureHash(r.result),replacement:{privacyErasureRequestId:s.request.id,status:'SOURCE_ERASED',replayDenied:true},category:r.command.startsWith('media.')?'MEDIA':'CHAT',reason:'DERIVED'});
 for(const o of s.outbox.filter(o=>o.companyId===s.companyId))if(erasableOutbox(o.type)&&references(o.data,allIds))actions.push({type:'CANCEL_OUTBOX',companyId:s.companyId,id:o.id,expectedDataHash:erasureHash({data:o.data,status:o.status}),replacement:{privacyErasureRequestId:s.request.id,status:'SOURCE_ERASED'},category:o.type.startsWith('media.')?'MEDIA':'CHAT',reason:'DERIVED'});
 for(const w of s.webhookInbox.filter(w=>w.companyId===s.companyId))if(eventIds.has(w.eventId))actions.push({type:'REDACT_WEBHOOK',companyId:s.companyId,id:w.eventId,provider:w.provider,expectedDataHash:erasureHash(w.payload),replacement:{privacyErasureRequestId:s.request.id,event_id:w.eventId,status:'SOURCE_ERASED'},category:'CHAT',reason:'DERIVED'});
 const blobActions=new Map<string,ErasureAction>();
 for(const {row,category} of selected.values())if(category==='MEDIA')for(const version of [row,...s.revisions.filter(r=>r.companyId===s.companyId&&r.kind===row.kind&&r.id===row.id)])for(const name of ['blobKey','clientBlobKey','sourceClientBlobKey']){
  const blobId=version.data[name];if(typeof blobId!=='string'||!blobId)continue;const hash=version.data[name==='blobKey'?'sha256':name==='clientBlobKey'?'clientSha256':'sourceClientSha256'];
  assert(typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash),'NEEDS_APPROVAL',{reason:'UNVERIFIED_BLOB_REFERENCE',id:row.id});
  const unselected=[...rows,...s.revisions.filter(r=>r.companyId===s.companyId)].some(other=>!other.kind.startsWith('privacy_')&&!rowActions.has(`${other.kind}:${other.id}`)&&references(other.data,new Set([blobId])));
  assert(!unselected&&!protectors.some(p=>references(p.data,new Set([blobId]))),'NEEDS_APPROVAL',{reason:'SHARED_BLOB_REQUIRES_REVIEW'});
  const previous=blobActions.get(blobId);assert(!previous||previous.expectedBlobSha256===hash,'VERSION_CONFLICT');blobActions.set(blobId,{type:'DELETE_BLOB',companyId:s.companyId,id:blobId,expectedDataHash:hash,expectedBlobSha256:hash,category:'MEDIA',reason:'DERIVED'});
 }
 actions.push(...blobActions.values());actions.sort((a,b)=>(a.type+'\0'+key(a)).localeCompare(b.type+'\0'+key(b)));retained.sort((a,b)=>(a.kind+'\0'+a.id).localeCompare(b.kind+'\0'+b.id));
 assert(actions.length<=MAX_ACTIONS,'VALIDATION_ERROR',{reason:'ERASURE_ACTION_LIMIT'});
 const partial:Omit<PrivacyErasurePlan,'planHash'>={version:ERASURE_PLAN_VERSION,companyId:s.companyId,subjectUserId:authority.subjectUserId,requestId:s.request.id,requestVersion:s.request.version,createdAt,expiresAt:new Date(created+PREVIEW_TTL).toISOString(),legalApprovalId:s.legalApproval.id,legalApprovalVersion:s.legalApproval.version,categories:authority.categories,policyVersions:authority.policies,actions,retained,snapshotHash:fingerprint(s),sourceDataDeleted:false,externalCopiesStatus:'PENDING'};
 return {...partial,planHash:erasureHash(partial)};
}
export function buildPrivacyErasurePlan(snapshot:ErasureSnapshot,authority:ErasureAuthority){return build(snapshot,authority,authority.now);}
export function assertPrivacyErasurePlanHash(plan:PrivacyErasurePlan){const {planHash,...data}=plan;assert(plan.version===ERASURE_PLAN_VERSION&&planHash===erasureHash(data),'VERSION_CONFLICT',{reason:'ERASURE_PLAN_TAMPERED'});}
export function revalidatePrivacyErasurePlan(plan:PrivacyErasurePlan,snapshot:ErasureSnapshot,authority:ErasureAuthority,confirmedHash:string){
 assertPrivacyErasurePlanHash(plan);assert(confirmedHash===plan.planHash&&Date.parse(authority.now)<Date.parse(plan.expiresAt),'VERSION_CONFLICT',{reason:'ERASURE_PREVIEW_EXPIRED_OR_CHANGED'});
 const current=build(snapshot,authority,plan.createdAt);assert(current.planHash===plan.planHash,'VERSION_CONFLICT',{reason:'ERASURE_SOURCE_OR_AUTHORITY_CHANGED'});return current;
}
export function verifyPrivacyErasure(plan:PrivacyErasurePlan,after:ErasureSnapshot,blobChecks:ErasureBlobCheck[]){
 assertPrivacyErasurePlanHash(plan);assert(after.companyId===plan.companyId,'ACCESS_DENIED');
 const checks:{type:string;id:string;verified:boolean}[]=plan.actions.map(action=>{
  let payload:unknown,exists=false,extra=true;
  if(action.type==='REDACT_AGGREGATE'){const row=after.aggregates.find(r=>r.companyId===plan.companyId&&r.kind===action.kind&&r.id===action.id);exists=!!row;payload=row?.data;}
  if(action.type==='REDACT_REVISION'){const row=after.revisions.find(r=>r.companyId===plan.companyId&&r.kind===action.kind&&r.id===action.id&&r.version===action.version);exists=!!row;payload=row?.data;}
  if(action.type==='REDACT_RECEIPT'){const row=after.receipts.find(r=>r.companyId===plan.companyId&&r.actorId===action.actorId&&r.idempotencyKey===action.id);exists=!!row;payload=row?.result;}
  if(action.type==='CANCEL_OUTBOX'){const row=after.outbox.find(r=>r.companyId===plan.companyId&&r.id===action.id);exists=!!row;payload=row?.data;extra=!row||row.status==='CANCELLED';}
  if(action.type==='REDACT_WEBHOOK'){const row=after.webhookInbox.find(r=>r.companyId===plan.companyId&&r.provider===action.provider&&r.eventId===action.id);exists=!!row;payload=row?.payload;}
  if(action.type==='DELETE_BLOB'){const results=blobChecks.filter(c=>c.companyId===plan.companyId&&c.id===action.id);return {type:action.type,id:action.id,verified:results.length===1&&results[0]!.result==='NOT_FOUND'};}
  return {type:action.type,id:action.id,verified:(!exists||erasureHash(payload)===erasureHash(action.replacement))&&extra};
 });
 // Enumerating the original actions is insufficient: a retry can introduce a fresh
 // historical revision or queued copy. Discover all remaining linked live copies.
 const ids=new Set(plan.actions.map(a=>a.id)),targets=new Set(plan.actions.filter(a=>a.type==='REDACT_AGGREGATE'||a.type==='REDACT_REVISION').map(a=>`${a.kind}:${a.id}`));
 const rows=after.aggregates.filter(r=>r.companyId===plan.companyId);
 for(let changed=true;changed;){changed=false;for(const row of [...rows,...after.revisions.filter(r=>r.companyId===plan.companyId)])if((sourceKinds.has(row.kind)||derivedKinds.has(row.kind))&&(targets.has(`${row.kind}:${row.id}`)||references(row.data,ids))){
  if(!ids.has(row.id)){ids.add(row.id);changed=true;}targets.add(`${row.kind}:${row.id}`);
 }}
 const privacySafe=(kind:string,data:Data)=>data.privacyErasureRequestId===plan.requestId&&erasureHash(data)===erasureHash(safeReplacement(kind,data,plan.requestId,plan.createdAt));
 for(const row of [...rows,...after.revisions.filter(r=>r.companyId===plan.companyId)])if(targets.has(`${row.kind}:${row.id}`)&&!privacySafe(row.kind,row.data))checks.push({type:'UNREDACTED_LINKED_HISTORY_OR_COPY',id:row.id,verified:false});
 for(const receipt of after.receipts)if(receipt.companyId===plan.companyId&&erasableReceipt(receipt.command)&&references(receipt.result,ids))checks.push({type:'UNREDACTED_LINKED_RECEIPT',id:receipt.idempotencyKey,verified:false});
 for(const outbox of after.outbox)if(outbox.companyId===plan.companyId&&erasableOutbox(outbox.type)&&references(outbox.data,ids))checks.push({type:'UNREDACTED_LINKED_OUTBOX',id:outbox.id,verified:false});
 for(const webhook of after.webhookInbox)if(webhook.companyId===plan.companyId&&plan.actions.some(a=>a.type==='REDACT_WEBHOOK'&&a.id===webhook.eventId)&&!(typeof webhook.payload==='object'&&webhook.payload!==null&&erasureHash(webhook.payload)===erasureHash({privacyErasureRequestId:plan.requestId,event_id:webhook.eventId,status:'SOURCE_ERASED'})))checks.push({type:'UNREDACTED_LINKED_WEBHOOK',id:webhook.eventId,verified:false});
 const failed=checks.filter(c=>!c.verified),purged=plan.actions.filter(a=>a.reason==='SOURCE').length>0&&failed.length===0;
 return {planHash:plan.planHash,liveSourceStatus:failed.length?'VERIFICATION_FAILED':!purged?'NO_ELIGIBLE_LIVE_SCOPE':plan.retained.length?'PARTIALLY_PURGED_LIVE_SCOPE':'PURGED_PLANNED_LIVE_SCOPE',sourceDataDeleted:purged,requestFulfilled:false,fullLegalDsarFulfillment:false,checks,retained:plan.retained,externalCopies:[{class:'BACKUPS',status:'PENDING_POLICY_EXPIRY_OR_APPROVED_RESTORE_REDACTION'},{class:'PROCESSOR_COPIES',status:'PENDING_PROVIDER_CONFIRMATION'},{class:'DELIVERED_DEVICE_COPIES',status:'NOT_REMOTELY_ERASABLE'}]};
}

/** Persistence/SQL requirements for the root-owned execution adapter. No statements are run here. */
export const PRIVACY_ERASURE_EXECUTION_CONCERNS=[
 'Acquire the existing company advisory transaction lock; fetch fresh actor, approval, policy, holds and complete candidate/derivative snapshot; revalidate exact confirmed hash and 10-minute preview TTL.',
 'Every mutation must constrain company_id and complete target identity, compare preimage hash/version, and preserve idempotency input hashes, actor/command identity and privacy-safe audit counts.',
 'aggregate_revisions has revisions_immutable trigger: use a narrowly authorized privacy-only redaction function/trigger branch with approved request/plan bindings. Never globally disable immutable history or rewrite TIME/PAYROLL/AUDIT/report snapshots.',
 'Redact current aggregates and every historical revision, mapped command receipt result, queued outbox payload and mapped webhook raw payload; cancel queued/running deliveries before any resumed worker can resend erased content.',
 'Stage external S3 blob deletion through an idempotent deletion journal; metadata tombstones deny access immediately. Revalidate holds/shared report/blob references before deletion and verify storage NOT_FOUND after completion. Unknown provider outcome is pending, not success.',
 'Keep a restore-time erasure manifest/tombstone replay gate for backups; source purge does not claim backup, provider or already-delivered device deletion. Never report full DSAR fulfillment from this bounded CHAT/MEDIA plan.',
 'Preserve device event review/sequence cursors and server tracking-lease current/history facts until a separately approved metadata retention class is provided. They are not CHAT/MEDIA sources; raw GPS expiry must not delete lease-audit or payroll evidence.',
] as const;
