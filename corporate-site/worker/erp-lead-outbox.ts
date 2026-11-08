import type { InquiryData } from '../src/lib/inquiry.ts';
import type { D1Database,D1Statement,WorkerEnv } from './types';
import { erpBridgeApproved,erpLeadEnvelope,erpLeadHash,ErpLeadInputError,readErpLeadConfig,type ErpLeadSource } from './erp-lead-contract';
import { deliverErpLead,type ErpLeadDeliveryResult } from './erp-lead-transport';
export const ERP_LEAD_MAX_ATTEMPTS=5;
export const ERP_LEAD_MAX_AGE_MS=7*86400000;
export const ERP_LEAD_LEASE_MS=120000;
const delays=[60,300,900,3600];
const authorityKeys=['KNABA_ERP_BRIDGE_ENABLED','KNABA_ERP_TRANSFER_APPROVED','KNABA_ERP_URL','KNABA_ERP_ALLOWED_ORIGIN',
 'KNABA_ERP_COMPANY_ID','KNABA_ERP_KEY_ID','KNABA_ERP_SECRET','KNABA_ERP_MAPPING_VERSION','KNABA_ERP_SERVICE_MAP_JSON',
 'KNABA_ERP_APPROVED_PRIVACY_VERSION','KNABA_ERP_KEY_NOT_BEFORE','KNABA_ERP_KEY_NOT_AFTER'] as const;
type Status='PENDING'|'LEASED'|'APPLIED'|'REVIEW'|'BLOCKED'|'UNKNOWN';
interface OutboxRow {id:string;request_id:string;locale:string;source_json:string;envelope_sha256:string|null;delivery_scope_sha256:string|null;
 status:Status;attempts:number;lease_token:string|null;lease_until:number;created_at:string}
export interface ErpLeadAcceptedRequest {requestId:string;mutation:string;time:string;data:InquiryData;address:string;privacyVersion:string;clientId:string|null;locale:string;sourceJson:string}
export interface ErpLeadDrainResult {claimed:number;applied:number;quarantined:number;retried:number;blocked:number;deadLetter:number;disabled:boolean;outcomes:{id:string;status:Status;reason?:string}[]}
const safeReason=(v:string)=>/^[A-Z][A-Z0-9_]{0,79}$/.test(v)?v:'DELIVERY_REJECTED';
const expired=(row:OutboxRow,at:number)=>!Number.isFinite(Date.parse(row.created_at))||Date.parse(row.created_at)>at+60000||at-Date.parse(row.created_at)>=ERP_LEAD_MAX_AGE_MS;

/** Reference-only insertion in the same atomic request/audit batch. No delivery from HTTP. */
export async function createErpLeadOutboxStatement(db:D1Database,env:WorkerEnv,input:ErpLeadAcceptedRequest):Promise<D1Statement> {
 let digest:string|null=null,binding:string|null=null,status:Status='PENDING',reason='';
 if(erpBridgeApproved(env)&&input.clientId===null){
  const config=await readErpLeadConfig(env);
  if(!config){status='BLOCKED';reason='CONFIG_INVALID';}
  else try {
   const row:ErpLeadSource={id:input.requestId,client_id:null,status:'new',created_at:input.time,privacy_version:input.privacyVersion,
    service:input.data.service,contact_name:input.data.name,email:input.data.email,phone:input.data.phone,object_type:input.data.objectType,
    postcode:input.data.postcode,address:input.address,area:input.data.area,frequency:input.data.frequency};
   digest=await erpLeadHash(erpLeadEnvelope(config,row,{id:input.requestId,locale:input.locale,source_json:input.sourceJson}));binding=config.bindingHash;
  }catch(error){status='BLOCKED';reason=error instanceof ErpLeadInputError?error.code:'SOURCE_MAPPING_INVALID';}
 }
 return db.prepare(`INSERT INTO site_erp_outbox(id,request_id,locale,source_json,envelope_sha256,delivery_scope_sha256,status,last_error,created_at,updated_at,completed_at)
  SELECT id,id,?,?,?,?,?,?,created_at,created_at,? FROM cleaning_requests WHERE id=? AND last_mutation=? ON CONFLICT(request_id) DO NOTHING`)
  .bind(input.locale,status==='BLOCKED'?'{}':input.sourceJson,digest,binding,status,reason,status==='BLOCKED'?input.time:null,input.requestId,input.mutation);
}
function record(result:ErpLeadDrainResult,id:string,status:Status,reason='') {
 result.outcomes.push({id,status,...(reason?{reason}:{})});
 if(status==='PENDING')result.retried++;else if(status==='APPLIED')result.applied++;else if(status==='REVIEW')result.quarantined++;
 else if(status==='UNKNOWN')result.deadLetter++;else if(status==='BLOCKED')result.blocked++;
}
/** Local cleanup never needs transfer approval. No authority is inferred for legacy reference rows. */
async function maintain(db:D1Database,at:number,result:ErpLeadDrainResult) {
 const seconds=Math.floor(at/1000);
 await db.prepare("UPDATE site_erp_outbox SET source_json='{}' WHERE id IN (SELECT id FROM site_erp_outbox WHERE status NOT IN ('PENDING','LEASED') AND source_json<>'{}' ORDER BY created_at,id LIMIT 50)").run();
 const rows=(await db.prepare(`SELECT o.*,r.status AS source_status,r.client_id FROM site_erp_outbox o JOIN cleaning_requests r ON r.id=o.request_id
  WHERE (o.status='PENDING' OR (o.status='LEASED' AND o.lease_until<=?)) AND
   (o.envelope_sha256 IS NULL OR o.delivery_scope_sha256 IS NULL OR r.status='cancelled' OR r.client_id IS NOT NULL
    OR julianday(o.created_at) IS NULL OR julianday(o.created_at)<=julianday(?) OR julianday(o.created_at)>julianday(?))
  ORDER BY o.created_at,o.id LIMIT 50`).bind(seconds,new Date(at-ERP_LEAD_MAX_AGE_MS).toISOString(),new Date(at+60000).toISOString()).all<OutboxRow&{source_status:string;client_id:string|null}>()).results??[];
 for(const row of rows){
  const reason=!row.envelope_sha256||!row.delivery_scope_sha256?'MAPPING_NOT_PINNED':expired(row,at)?'EVENT_EXPIRED':row.client_id!==null?'ANONYMOUS_SOURCE_REQUIRED':'SOURCE_CANCELLED';
  const status=row.attempts>0?'UNKNOWN':'BLOCKED';
  const changed=await db.prepare(`UPDATE site_erp_outbox SET status=?,source_json='{}',lease_token=NULL,lease_until=0,last_error=?,updated_at=?,completed_at=?
   WHERE id=? AND (status='PENDING' OR (status='LEASED' AND lease_until<=?))`)
   .bind(status,reason,new Date(at).toISOString(),new Date(at).toISOString(),row.id,seconds).run();
  if(changed.meta?.changes)record(result,row.id,status,reason);
 }
}
export async function drainErpLeads(env:WorkerEnv,deps:{transport?:typeof deliverErpLead;now?:()=>number;limit?:1|3}={}):Promise<ErpLeadDrainResult> {
 const result:ErpLeadDrainResult={claimed:0,applied:0,quarantined:0,retried:0,blocked:0,deadLetter:0,disabled:false,outcomes:[]};
 if(!env.DB){result.disabled=true;return result;}
 const db=env.DB,now=deps.now??Date.now,send=deps.transport??deliverErpLead,at=now();
 if(!Number.isFinite(at))return result;
 await maintain(db,at,result);
 if(!erpBridgeApproved(env)){result.disabled=true;return result;}
 const due="((status='PENDING' AND next_attempt_at<=?) OR (status='LEASED' AND lease_until<=?))";
 const seconds=Math.floor(at/1000);
 const rows=(await db.prepare(`SELECT * FROM site_erp_outbox WHERE ${due} ORDER BY created_at,id LIMIT ${deps.limit===1?1:3}`).bind(seconds,seconds).all<OutboxRow>()).results??[];
 for(const candidate of rows){
  if(!erpBridgeApproved(env)){result.disabled=true;break;}
  const claimAt=now(),claimSecond=Math.floor(claimAt/1000),stamp=new Date(claimAt).toISOString();
  if(candidate.attempts>=ERP_LEAD_MAX_ATTEMPTS){
   const changed=await db.prepare(`UPDATE site_erp_outbox SET status='UNKNOWN',source_json='{}',lease_token=NULL,lease_until=0,last_error='MAX_RETRIES',updated_at=?,completed_at=? WHERE id=? AND ${due}`).bind(stamp,stamp,candidate.id,claimSecond,claimSecond).run();
   if(changed.meta?.changes)record(result,candidate.id,'UNKNOWN','MAX_RETRIES');continue;
  }
  const token=crypto.randomUUID();
  const row=await db.prepare(`UPDATE site_erp_outbox SET status='LEASED',attempts=attempts+1,lease_token=?,lease_until=?,updated_at=? WHERE id=? AND attempts<5 AND ${due} RETURNING *`)
   .bind(token,claimSecond+ERP_LEAD_LEASE_MS/1000,stamp,candidate.id,claimSecond,claimSecond).first<OutboxRow>();
  if(!row)continue;result.claimed++;
  let outcome:ErpLeadDeliveryResult,currentReason='CONFIG_CHANGED',attempted=false;
  const source=await db.prepare('SELECT * FROM cleaning_requests WHERE id=?').bind(row.request_id).first<ErpLeadSource>();
  const sourceSnapshot=JSON.stringify(source);
  const currentConfig=async()=>{
   const authority=authorityKeys.map(key=>env[key]),config=await readErpLeadConfig(env,now());
   if(!config||config.bindingHash!==row.delivery_scope_sha256)return null;
   if(expired(row,now())){currentReason='EVENT_EXPIRED';return null;}
   const current=await db.prepare(`SELECT r.* FROM site_erp_outbox o JOIN cleaning_requests r ON r.id=o.request_id WHERE o.id=? AND o.status='LEASED'
    AND o.lease_token=? AND o.lease_until>? AND r.client_id IS NULL AND r.status<>'cancelled' AND r.privacy_version=?`)
    .bind(row.id,token,Math.floor(now()/1000),config.privacyVersion).first<ErpLeadSource>();
   if(!current||JSON.stringify(current)!==sourceSnapshot){currentReason='SOURCE_OR_LEASE_UNAVAILABLE';return null;}
   if(Math.floor(now()/1000)>=row.lease_until||expired(row,now())){currentReason='LEASE_EXPIRED';return null;}
   if(authorityKeys.some((key,index)=>env[key]!==authority[index]))return null;
   return config;
  };
  try {
   const config=await currentConfig();
   if(!config||!source)outcome={status:'BLOCKED',reason:currentReason};
   else {
    const body=erpLeadEnvelope(config,source,row);
    if(await erpLeadHash(body)!==row.envelope_sha256)outcome={status:'BLOCKED',reason:'ENVELOPE_CHANGED'};
    else {attempted=true;outcome=await send(config,{eventId:row.id,body,bindingHash:row.delivery_scope_sha256!},{now,currentConfig});}
   }
   if(outcome.status==='BLOCKED'&&outcome.reason==='CONFIG_CHANGED')outcome={status:'BLOCKED',reason:currentReason};
  }catch(error){outcome=error instanceof ErpLeadInputError?{status:'BLOCKED',reason:error.code}:{status:'RETRY',reason:'TRANSPORT_ERROR'};}
  const settledAt=now(),settledSecond=Math.floor(settledAt/1000);
  let status:Status,reason='',effect:string|null=null,next=0;
  if(outcome.status==='APPLIED'){status='APPLIED';effect=outcome.effectId;}
  else if(outcome.status==='QUARANTINED'){status='REVIEW';reason='ERP_QUARANTINED';}
  else if(outcome.status==='BLOCKED'){status=candidate.attempts>0?'UNKNOWN':'BLOCKED';reason=safeReason(outcome.reason);}
  else if(row.attempts>=5||expired(row,settledAt)){status='UNKNOWN';reason=row.attempts>=5?'MAX_RETRIES':'EVENT_EXPIRED';}
  else {status='PENDING';reason=safeReason(outcome.reason);next=settledSecond+delays[row.attempts-1];}
  // Cancellation is observed in the settlement transaction, not in a separate stale SELECT.
  const cancelled="EXISTS (SELECT 1 FROM cleaning_requests r WHERE r.id=site_erp_outbox.request_id AND r.status='cancelled')";
  const cancelStatus=attempted||candidate.attempts>0?'UNKNOWN':'BLOCKED',cancelReason=attempted||candidate.attempts>0?'SOURCE_CANCELLED_AFTER_SEND':'SOURCE_CANCELLED';
  const updated=await db.prepare(`UPDATE site_erp_outbox SET status=CASE WHEN ${cancelled} THEN ? ELSE ? END,
   source_json=CASE WHEN ${cancelled} THEN '{}' ELSE ? END,next_attempt_at=?,lease_token=NULL,lease_until=0,erp_effect_id=?,
   last_error=CASE WHEN ${cancelled} THEN ? ELSE ? END,updated_at=?,completed_at=CASE WHEN ${cancelled} THEN ? ELSE ? END
   WHERE id=? AND status='LEASED' AND lease_token=? AND lease_until>? RETURNING status,last_error`)
   .bind(cancelStatus,status,status==='PENDING'?row.source_json:'{}',next,effect,cancelReason,reason,new Date(settledAt).toISOString(),new Date(settledAt).toISOString(),
    status==='PENDING'?null:new Date(settledAt).toISOString(),row.id,token,settledSecond).first<{status:Status;last_error:string}>();
  if(updated)record(result,row.id,updated.status,updated.last_error);
 }
 return result;
}
/** Owner authorization belongs to the route; never expose contact, attribution or credentials. */
export async function erpLeadOutboxStatus(db:D1Database){
 const rows=(await db.prepare('SELECT id,request_id,status,attempts,next_attempt_at,lease_until,created_at,updated_at,completed_at,erp_effect_id,last_error FROM site_erp_outbox ORDER BY created_at DESC,id DESC LIMIT 50').all()).results??[];
 const counts=(await db.prepare('SELECT status,count(*) AS count FROM site_erp_outbox GROUP BY status').all()).results??[];
 return {rows,counts,limit:50};
}
