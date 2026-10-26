import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {assert,DomainError,type Actor,type CommandContext,type CommandRegistry,type Data,type Entity} from '../../packages/domain/core.ts';
import {buildPrivacyErasurePlan,revalidatePrivacyErasurePlan,verifyPrivacyErasure,erasureHash,type ErasureAction,type ErasureBlobCheck,type ErasureSnapshot,type PrivacyErasurePlan} from '../../packages/domain/privacy-erasure.ts';
import type {PrivateBlobStore} from '../../packages/storage/index.ts';
import {Database,PgTransaction} from './database.ts';

export interface PrivacyErasureEngine {actorIn(tx:PgTransaction,userId:string):Promise<Actor>;}
const LIMIT=25_001;
const entity=(r:any):Entity=>({companyId:r.company_id,kind:r.kind,id:r.id,version:r.version,data:r.data,createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()});
const transaction=(c:CommandContext):PgTransaction=>{assert(c.tx instanceof PgTransaction,'MISSING_CONFIGURATION',{reason:'TRANSACTIONAL_PRIVACY_ADAPTER_REQUIRED'});return c.tx;};

/** All sources, including historical derivatives, are read under the company lock. */
export async function loadPrivacyErasureSnapshot(tx:PgTransaction,requestId:string):Promise<ErasureSnapshot>{
 const [a,v,r,o,w]=await Promise.all([
  tx.query('SELECT * FROM aggregates WHERE company_id=$1 ORDER BY kind,id LIMIT $2',[tx.companyId,LIMIT]),
  tx.query('SELECT * FROM aggregate_revisions WHERE company_id=$1 ORDER BY kind,id,version LIMIT $2',[tx.companyId,LIMIT]),
  tx.query('SELECT * FROM command_receipts WHERE company_id=$1 ORDER BY actor_id,idempotency_key LIMIT $2',[tx.companyId,LIMIT]),
  tx.query('SELECT * FROM outbox WHERE company_id=$1 ORDER BY id LIMIT $2',[tx.companyId,LIMIT]),
  tx.query('SELECT * FROM webhook_inbox WHERE company_id=$1 ORDER BY provider,event_id LIMIT $2',[tx.companyId,LIMIT])
 ]);
 assert([a,v,r,o,w].every(result=>result.rows.length<LIMIT),'VALIDATION_ERROR',{reason:'ERASURE_SNAPSHOT_LIMIT'});
 const aggregates=a.rows.map(entity),request=aggregates.find(row=>row.kind==='privacy_request'&&row.id===requestId);
 assert(request,'NOT_FOUND_SAFE');const legalApproval=aggregates.find(row=>row.kind==='legal_approval'&&row.id===request.data.legalApprovalId);assert(legalApproval,'NEEDS_APPROVAL');
 return {companyId:tx.companyId,request,legalApproval,policies:aggregates.filter(row=>row.kind==='retention_policy'),holds:aggregates.filter(row=>row.kind==='legal_hold'),aggregates,
  revisions:v.rows.map(row=>({companyId:row.company_id,kind:row.kind,id:row.id,version:row.version,data:row.data,createdAt:new Date(row.created_at).toISOString()})),
  receipts:r.rows.map(row=>({companyId:row.company_id,actorId:row.actor_id,idempotencyKey:row.idempotency_key,command:row.command,result:row.result})),
  outbox:o.rows.map(row=>({companyId:row.company_id,id:row.id,type:row.type,data:row.data,status:row.status})),
  webhookInbox:w.rows.map(row=>({companyId:row.company_id,provider:row.provider,eventId:row.event_id,payload:row.payload}))};
}
async function serverNow(tx:PgTransaction){return new Date((await tx.query('SELECT clock_timestamp() AS now')).rows[0].now).toISOString();}
async function currentAuthority(tx:PgTransaction,engine:PrivacyErasureEngine,actor:Actor){const fresh=await engine.actorIn(tx,actor.userId);fresh.mfaVerified=actor.mfaVerified;return {actor:fresh,now:await serverNow(tx)};}
function changed(){throw new DomainError('VERSION_CONFLICT',{reason:'ERASURE_PREIMAGE_CHANGED'});}
function same(value:unknown,action:ErasureAction){if(erasureHash(value)!==action.expectedDataHash)changed();}
function storageIdentity(storage:PrivateBlobStore){assert(typeof storage.identity==='string'&&/^[a-f0-9]{64}$/.test(storage.identity),'MISSING_CONFIGURATION',{reason:'S3_ERASURE_NAMESPACE_IDENTITY_REQUIRED'});return storage.identity;}

async function applyRedaction(tx:PgTransaction,action:ErasureAction,plan:PrivacyErasurePlan){
 assert(action.companyId===tx.companyId,'ACCESS_DENIED');
 let result:any;
 if(action.type==='REDACT_AGGREGATE'){
  const current=await tx.get(action.kind!,action.id);assert(current.version===action.version,'VERSION_CONFLICT');same(current.data,action);
  await tx.save(current,action.replacement!,current.version);return;
 }
 if(action.type==='REDACT_REVISION'){
  const row=(await tx.query('SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind=$2 AND id=$3 AND version=$4 FOR UPDATE',[tx.companyId,action.kind,action.id,action.version])).rows[0];assert(row,'VERSION_CONFLICT');same(row.data,action);
  await tx.query('SELECT knaba_permit_privacy_revision($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',[tx.companyId,plan.requestId,plan.planHash,action.kind,action.id,action.version,JSON.stringify(row.data),JSON.stringify(action.replacement)]);
  result=await tx.query('UPDATE aggregate_revisions SET data=$1 WHERE company_id=$2 AND kind=$3 AND id=$4 AND version=$5 AND data=$6::jsonb RETURNING id',[JSON.stringify(action.replacement),tx.companyId,action.kind,action.id,action.version,JSON.stringify(row.data)]);
 }else if(action.type==='REDACT_RECEIPT'){
  const row=(await tx.query('SELECT result FROM command_receipts WHERE company_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE',[tx.companyId,action.actorId,action.id])).rows[0];assert(row,'VERSION_CONFLICT');same(row.result,action);
  result=await tx.query('UPDATE command_receipts SET result=$1 WHERE company_id=$2 AND actor_id=$3 AND idempotency_key=$4 AND result=$5::jsonb RETURNING idempotency_key',[JSON.stringify(action.replacement),tx.companyId,action.actorId,action.id,JSON.stringify(row.result)]);
 }else if(action.type==='CANCEL_OUTBOX'){
  const row=(await tx.query('SELECT data,status FROM outbox WHERE company_id=$1 AND id=$2 FOR UPDATE',[tx.companyId,action.id])).rows[0];assert(row,'VERSION_CONFLICT');same({data:row.data,status:row.status},action);
  result=await tx.query("UPDATE outbox SET data=$1,status='CANCELLED',lease_token=NULL,leased_until=NULL,finished_at=clock_timestamp(),last_error='PRIVACY_ERASURE' WHERE company_id=$2 AND id=$3 AND data=$4::jsonb AND status=$5 RETURNING id",[JSON.stringify(action.replacement),tx.companyId,action.id,JSON.stringify(row.data),row.status]);
 }else if(action.type==='REDACT_WEBHOOK'){
  const row=(await tx.query('SELECT payload FROM webhook_inbox WHERE company_id=$1 AND provider=$2 AND event_id=$3 FOR UPDATE',[tx.companyId,action.provider,action.id])).rows[0];assert(row,'VERSION_CONFLICT');same(row.payload,action);
  result=await tx.query('UPDATE webhook_inbox SET payload=$1 WHERE company_id=$2 AND provider=$3 AND event_id=$4 AND payload=$5::jsonb RETURNING event_id',[JSON.stringify(action.replacement),tx.companyId,action.provider,action.id,JSON.stringify(row.payload)]);
 }else throw new DomainError('INVALID_STATE');
 assert(result.rows.length===1,'VERSION_CONFLICT');
}

async function deletePostgresBlob(tx:PgTransaction,action:ErasureAction,subjectUserId:string):Promise<ErasureBlobCheck>{
 // Both the current and legacy private tables belong to the same transaction.
 const [media,legacy]=await Promise.all([
  tx.query('SELECT sha256,owner_id FROM media_blobs WHERE company_id=$1 AND id=$2 FOR UPDATE',[tx.companyId,action.id]),
  tx.query('SELECT sha256 FROM private_blobs WHERE company_id=$1 AND key=$2 FOR UPDATE',[tx.companyId,action.id])]);
 assert([...media.rows,...legacy.rows].every(row=>row.sha256===action.expectedBlobSha256),'VERSION_CONFLICT',{reason:'ERASURE_BLOB_CHANGED'});
 assert(media.rows.every(row=>row.owner_id===subjectUserId),'NEEDS_APPROVAL',{reason:'ERASURE_BLOB_OWNER_CHANGED'});
 await tx.query('DELETE FROM media_blobs WHERE company_id=$1 AND id=$2',[tx.companyId,action.id]);await tx.query('DELETE FROM private_blobs WHERE company_id=$1 AND key=$2',[tx.companyId,action.id]);
 const present=(await tx.query('SELECT 1 FROM media_blobs WHERE company_id=$1 AND id=$2 UNION ALL SELECT 1 FROM private_blobs WHERE company_id=$1 AND key=$2',[tx.companyId,action.id])).rows.length>0;
 return {companyId:tx.companyId,id:action.id,result:present?'PRESENT':'NOT_FOUND'};
}
function summary(plan:PrivacyErasurePlan,planId:string){return {planId,planHash:plan.planHash,requestId:plan.requestId,expiresAt:plan.expiresAt,categories:plan.categories,actionCounts:Object.fromEntries([...new Set(plan.actions.map(a=>a.type))].map(type=>[type,plan.actions.filter(a=>a.type===type).length])),retained:plan.retained,sourceDataDeleted:false,externalCopiesStatus:'PENDING',independentConfirmationRequired:true};}

export function createPrivacyErasureCommands(_db:Database,engine:PrivacyErasureEngine,storage:PrivateBlobStore):CommandRegistry{return {
 'privacy.erasure.preview':{permission:'privacy.review',highRisk:true,schema:z.object({requestId:z.string().min(1).max(200)}).strict(),handler:async(c,i)=>{
  const tx=transaction(c),authority=await currentAuthority(tx,engine,c.actor),snapshot=await loadPrivacyErasureSnapshot(tx,i.requestId),plan=buildPrivacyErasurePlan(snapshot,authority);
  // Finish an earlier provider journal before replacing its authoritative plan
  // binding; otherwise the new preview would strand durable blob deletion jobs.
  assert(!(await tx.query("SELECT 1 FROM privacy_blob_deletions WHERE company_id=$1 AND request_id=$2 AND status='PENDING' LIMIT 1",[tx.companyId,plan.requestId])).rows.length,'NEEDS_APPROVAL',{reason:'PENDING_PRIOR_SOURCE_BLOB_VERIFICATION'});
  const row=await tx.add('privacy_erasure_plan',{requestId:plan.requestId,subjectUserId:plan.subjectUserId,plan,createdBy:authority.actor.userId,createdAt:authority.now,previewMfaVerified:true,state:'PREVIEW_READY'});return summary(plan,row.id);
 }},
 'privacy.erasure.confirm':{permission:'privacy.review',highRisk:true,schema:z.object({planId:z.string().min(1).max(200),confirmedHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),handler:async(c,i)=>{
  const tx=transaction(c),authority=await currentAuthority(tx,engine,c.actor),row=await tx.get('privacy_erasure_plan',i.planId);assert(row.data.state==='PREVIEW_READY','INVALID_STATE');assert(row.data.createdBy!==authority.actor.userId,'SELF_APPROVAL_DENIED');
  const snapshot=await loadPrivacyErasureSnapshot(tx,row.data.requestId),plan=revalidatePrivacyErasurePlan(row.data.plan,snapshot,authority,i.confirmedHash),blobChecks:ErasureBlobCheck[]=[];
  // SQL permits bind to this approved plan and independent current executor.
  await tx.save(row,{...row.data,state:'EXECUTING',confirmedBy:authority.actor.userId,confirmedAt:authority.now,confirmationMfaVerified:true});
  for(const action of plan.actions.filter(a=>a.type!=='DELETE_BLOB'))await applyRedaction(tx,action,plan);
  for(const action of plan.actions.filter(a=>a.type==='DELETE_BLOB'))if(storage.provider==='POSTGRES')blobChecks.push(await deletePostgresBlob(tx,action,plan.subjectUserId));else{
   // A provider switch must not leave old PostgreSQL copies behind.
   await deletePostgresBlob(tx,action,plan.subjectUserId);
   const id=randomUUID();await tx.query("INSERT INTO privacy_blob_deletions(id,company_id,request_id,plan_hash,blob_key,expected_sha256,subject_user_id,provider_identity,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING')",[id,tx.companyId,plan.requestId,plan.planHash,action.id,action.expectedBlobSha256,plan.subjectUserId,storageIdentity(storage)]);
   await tx.event('privacy.blob_delete',{deletionId:id});blobChecks.push({companyId:tx.companyId,id:action.id,result:'UNVERIFIED'});
  }
  const after=await loadPrivacyErasureSnapshot(tx,plan.requestId),verification=verifyPrivacyErasure(plan,after,blobChecks),pending=blobChecks.some(check=>check.result==='UNVERIFIED');
  assert(verification.checks.filter(check=>check.type!=='DELETE_BLOB').every(check=>check.verified),'INVALID_STATE',{reason:'ERASURE_VERIFICATION_FAILED'});
  if(!pending)assert(verification.checks.every(check=>check.verified),'INVALID_STATE',{reason:'ERASURE_BLOB_VERIFICATION_FAILED'});
  const awaitingQuiescence=verification.retained.some(record=>record.reason==='IN_FLIGHT_PROCESSOR_REQUIRES_QUIESCENCE');
  const result={...verification,liveSourceStatus:awaitingQuiescence?'AWAITING_QUIESCENCE':pending?'PENDING_EXTERNAL_BLOB_DELETION':verification.liveSourceStatus,sourceDataDeleted:!awaitingQuiescence&&!pending&&verification.sourceDataDeleted,pendingBlobDeletion:pending,requestFulfilled:false,fullLegalDsarFulfillment:false};
  const manifest={version:plan.version,companyId:plan.companyId,requestId:plan.requestId,subjectUserId:plan.subjectUserId,planHash:plan.planHash,actions:plan.actions.map(({expectedDataHash,expectedBlobSha256,...a})=>a),executedAt:authority.now,executedBy:authority.actor.userId,liveResult:result};
  await tx.query('INSERT INTO privacy_erasure_manifests(company_id,request_id,plan_hash,manifest,manifest_sha256) VALUES($1,$2,$3,$4,$5)',[tx.companyId,plan.requestId,plan.planHash,JSON.stringify(manifest),erasureHash(manifest)]);
  await tx.add('privacy_erasure_execution',{requestId:plan.requestId,subjectUserId:plan.subjectUserId,executedBy:authority.actor.userId,executedAt:authority.now,...result});
  await tx.save(snapshot.request,{...snapshot.request.data,state:awaitingQuiescence?'AWAITING_ERASURE_EXECUTION':pending?'LIVE_ERASURE_PENDING_BLOB_VERIFICATION':result.sourceDataDeleted?'LIVE_SCOPE_ERASURE_VERIFIED_EXTERNAL_PENDING':'NO_ELIGIBLE_LIVE_SCOPE',sourceDataDeleted:result.sourceDataDeleted,liveSourceStatus:result.liveSourceStatus,pendingBlobDeletion:pending,erasurePlanHash:plan.planHash,externalCopiesStatus:'PENDING',requestFulfilled:false},snapshot.request.version);
  const latest=await tx.get('privacy_erasure_plan',row.id);await tx.save(latest,{...latest.data,state:pending?'PENDING_BLOB_VERIFICATION':'EXECUTED',result},latest.version);
  await tx.event('privacy.live_erasure_executed',{requestId:plan.requestId,planHash:plan.planHash,liveSourceStatus:result.liveSourceStatus,sourceDataDeleted:result.sourceDataDeleted,requestFulfilled:false});
  await tx.query('INSERT INTO audit_log(company_id,actor_id,action,aggregate_kind,aggregate_id,detail) VALUES($1,$2,$3,$4,$5,$6)',[tx.companyId,authority.actor.userId,'PRIVACY_LIVE_ERASURE','privacy_request',plan.requestId,JSON.stringify({planHash:plan.planHash,redactions:plan.actions.filter(a=>a.type!=='DELETE_BLOB').length,blobDeletes:plan.actions.filter(a=>a.type==='DELETE_BLOB').length,pendingExternal:pending,requestFulfilled:false})]);
  return result;
 }}
};}

/** Durable S3 worker operation. Metadata is already tombstoned; only verified absence is success. */
export async function processPrivacyBlobDeletion(db:Database,_engine:PrivacyErasureEngine,storage:PrivateBlobStore,job:{company_id:string;data:Data}){
 assert(storage.provider==='S3','MISSING_CONFIGURATION');
 return db.transaction(job.company_id,'PRIVACY_ERASURE_WORKER',async tx=>{
  const row=(await tx.query('SELECT * FROM privacy_blob_deletions WHERE company_id=$1 AND id=$2 FOR UPDATE',[job.company_id,job.data.deletionId])).rows[0];assert(row,'NOT_FOUND_SAFE');assert(row.provider_identity===storageIdentity(storage),'VERSION_CONFLICT',{reason:'ERASURE_STORAGE_NAMESPACE_CHANGED'});if(row.status==='VERIFIED_NOT_FOUND')return {verified:true};
  const snapshot=await loadPrivacyErasureSnapshot(tx,row.request_id),now=Date.parse(await serverNow(tx));
  assert(snapshot.request.data.erasurePlanHash===row.plan_hash&&snapshot.request.data.subjectUserId===row.subject_user_id,'VERSION_CONFLICT');
  assert(snapshot.legalApproval.data.status==='APPROVED'&&snapshot.legalApproval.data.active===true&&Date.parse(snapshot.legalApproval.data.expiresAt)>now&&snapshot.legalApproval.version===snapshot.request.data.legalApprovalVersion,'NEEDS_APPROVAL');
  for(const hold of snapshot.holds.filter(h=>h.data.state==='ACTIVE'&&h.data.subjectUserId===row.subject_user_id)){
   assert(Array.isArray(hold.data.categories)&&Number.isFinite(Date.parse(hold.data.expiresAt))&&Number.isFinite(Date.parse(hold.data.createdAt)),'LEGAL_HOLD_BLOCKS_ERASURE',{reason:'MALFORMED_ACTIVE_HOLD_REQUIRES_REVIEW'});
   assert(!(Date.parse(hold.data.expiresAt)>now&&hold.data.categories.includes('MEDIA')),'LEGAL_HOLD_BLOCKS_ERASURE');
  }
  const storedPlan=snapshot.aggregates.find(p=>p.kind==='privacy_erasure_plan'&&p.data.plan?.planHash===row.plan_hash);assert(storedPlan,'INVALID_STATE');const plan=storedPlan.data.plan as PrivacyErasurePlan;
  const privacyMetadata=new Set(['privacy_erasure_plan','privacy_erasure_execution','privacy_erasure_completion','privacy_request','privacy_erasure_evidence']);
  const key=row.blob_key;assert(![...snapshot.aggregates,...snapshot.revisions].some(r=>!privacyMetadata.has(r.kind)&&!r.data.privacyErasedAt&&JSON.stringify(r.data).includes(JSON.stringify(key))),'NEEDS_APPROVAL',{reason:'BLOB_NEW_REFERENCE_REQUIRES_REVIEW'});
  assert(plan.legalApprovalId===snapshot.legalApproval.id&&plan.legalApprovalVersion===snapshot.legalApproval.version&&snapshot.legalApproval.data.scope?.erasureCategories?.includes('MEDIA'),'NEEDS_APPROVAL');
  for(const version of plan.policyVersions){const policy=snapshot.policies.find(p=>p.id===version.id);assert(policy?.version===version.version&&policy.data.state==='APPROVED'&&policy.data.legalApprovalId===plan.legalApprovalId&&policy.data.legalApprovalVersion===plan.legalApprovalVersion,'NEEDS_APPROVAL');}
  try{const before=await storage.get(job.company_id,key);assert(before.sha256===row.expected_sha256,'VERSION_CONFLICT',{reason:'ERASURE_BLOB_CHANGED'});assert(before.ownerId===row.subject_user_id,'NEEDS_APPROVAL',{reason:'ERASURE_BLOB_OWNER_CHANGED'});await storage.delete(job.company_id,key);}catch(error){if(!(error instanceof DomainError)||error.code!=='NOT_FOUND_SAFE')throw error;}
  try{await storage.get(job.company_id,key);throw new DomainError('PROVIDER_UNAVAILABLE',{reason:'ERASURE_BLOB_STILL_PRESENT'});}catch(error){if(!(error instanceof DomainError)||error.code!=='NOT_FOUND_SAFE')throw error;}
  await tx.query("UPDATE privacy_blob_deletions SET status='VERIFIED_NOT_FOUND',verified_at=clock_timestamp(),attempts=attempts+1 WHERE company_id=$1 AND id=$2",[job.company_id,row.id]);
  const remaining=(await tx.query("SELECT id FROM privacy_blob_deletions WHERE company_id=$1 AND request_id=$2 AND plan_hash=$3 AND status<>'VERIFIED_NOT_FOUND'",[job.company_id,row.request_id,row.plan_hash])).rows;
  if(!remaining.length){
   const journals=(await tx.query("SELECT blob_key,status FROM privacy_blob_deletions WHERE company_id=$1 AND request_id=$2 AND plan_hash=$3",[job.company_id,row.request_id,row.plan_hash])).rows;
   const checks:ErasureBlobCheck[]=journals.map(j=>({companyId:job.company_id,id:j.blob_key,result:j.status==='VERIFIED_NOT_FOUND'?'NOT_FOUND':'UNVERIFIED'}));
   // Every provider object is rechecked; a stale journal alone is never evidence.
   for(const check of checks){try{await storage.get(job.company_id,check.id);check.result='PRESENT';}catch(error){if(!(error instanceof DomainError)||error.code!=='NOT_FOUND_SAFE')throw error;check.result='NOT_FOUND';}}
   const verification=verifyPrivacyErasure(plan,await loadPrivacyErasureSnapshot(tx,row.request_id),checks);assert(verification.checks.every(c=>c.verified),'INVALID_STATE',{reason:'ERASURE_VERIFICATION_FAILED'});
   const awaitingQuiescence=verification.retained.some(record=>record.reason==='IN_FLIGHT_PROCESSOR_REQUIRES_QUIESCENCE'),result={...verification,sourceDataDeleted:!awaitingQuiescence&&verification.sourceDataDeleted,liveSourceStatus:awaitingQuiescence?'AWAITING_QUIESCENCE':verification.liveSourceStatus,pendingBlobDeletion:false};
   const request=await tx.get('privacy_request',row.request_id);await tx.save(request,{...request.data,state:awaitingQuiescence?'AWAITING_ERASURE_EXECUTION':result.sourceDataDeleted?'LIVE_SCOPE_ERASURE_VERIFIED_EXTERNAL_PENDING':'NO_ELIGIBLE_LIVE_SCOPE',sourceDataDeleted:result.sourceDataDeleted,liveSourceStatus:result.liveSourceStatus,pendingBlobDeletion:false,externalCopiesStatus:'PENDING',requestFulfilled:false});
   await tx.save(storedPlan,{...storedPlan.data,state:'EXECUTED',result});
   await tx.add('privacy_erasure_completion',{requestId:row.request_id,subjectUserId:row.subject_user_id,verifiedAt:await serverNow(tx),...result});
   await tx.event('privacy.blobs_erased',{requestId:row.request_id,planHash:row.plan_hash,sourceDataDeleted:result.sourceDataDeleted,requestFulfilled:false});
  }
  return {verified:true,requestFulfilled:false};
 });
}
