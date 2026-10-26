import type {D1Database,WorkerEnv} from './types';
import type {ErpLeadDiagnostics,ErpLeadErrorCode,ErpLeadInput,ErpLeadReceipt,ErpLeadState,ErpLeadView,ErpPublicConfig,ErpService} from '../src/lib/assistant-erp-contract';

const PREVIEW_MS=10*60_000;
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const SOURCE=/^[a-z][a-z0-9_-]{0,63}$/;
const KEY=/^[A-Za-z0-9_-]{1,64}$/;
const LOCALES=['de','en','uk','ru'] as const;
type Row=Record<string,unknown>;
export type ErpConfig={origin:string;endpoint:string;source:string;siteId:string;companyId:string;keyId:string;secret:string;mappingVersion:string;services:ErpService[]};
export class ErpFault extends Error {
  constructor(readonly status:number,readonly code:string){super(code);}
}
function fail(status:number,code:string):never{throw new ErpFault(status,code);}
function plain(value:unknown):value is Row{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function bounded(value:unknown,max:number,required=false):string{
  if(value===undefined&&!required)return '';
  if(typeof value!=='string'||value.length>max||CONTROL.test(value)||required&&!value.trim())fail(422,'erp_validation');
  return value.trim();
}
function only(value:Row,names:string[]){if(Object.keys(value).some(k=>!names.includes(k)))fail(422,'erp_validation');}
function serverText(value:unknown,max=100):string{return bounded(value,max,true);}
/** Configuration is an operator-controlled allowlist, never values from a request. */
export function getErpConfig(env:WorkerEnv):ErpConfig|null{
  if(env.ASSISTANT_ERP_ENABLED!=='approved')return null;
  try{
    const origin=serverText(env.ASSISTANT_ERP_ORIGIN,2048),url=new URL(origin);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.origin!==origin)return null;
    const source=serverText(env.ASSISTANT_ERP_SOURCE,64),keyId=serverText(env.ASSISTANT_ERP_KEY_ID,64);
    if(!SOURCE.test(source)||!KEY.test(keyId))return null;
    const secret=env.ASSISTANT_ERP_SECRET;if(typeof secret!=='string'||secret.length<32||secret.length>4096||CONTROL.test(secret))return null;
    const raw=JSON.parse(serverText(env.ASSISTANT_ERP_SERVICES_JSON,100_000));
    if(!Array.isArray(raw)||raw.length<1||raw.length>100)return null;
    const services:ErpService[]=raw.map(item=>{
      if(!plain(item))fail(422,'erp_config');only(item,['id','label']);
      if(!plain(item.label))fail(422,'erp_config');only(item.label,[...LOCALES]);
      const rawLabel=item.label;
      const label=Object.fromEntries(LOCALES.map(locale=>[locale,serverText(rawLabel[locale],200)])) as ErpService['label'];
      return {id:serverText(item.id),label};
    });
    if(new Set(services.map(s=>s.id)).size!==services.length)return null;
    return {origin,endpoint:`${origin}/api/v1/integrations/${source}/events`,source,keyId,secret,
      siteId:serverText(env.ASSISTANT_ERP_SITE_ID),companyId:serverText(env.ASSISTANT_ERP_COMPANY_ID),
      mappingVersion:serverText(env.ASSISTANT_ERP_MAPPING_VERSION),services};
  }catch{return null;}
}
export function publicErpConfig(env:WorkerEnv):ErpPublicConfig{
  const config=getErpConfig(env);return config?{enabled:true,services:config.services}:{enabled:false,services:[]};
}
async function hash(value:string):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function erpScopeHash(config:ErpConfig):Promise<string>{
  return hash(JSON.stringify([config.origin,config.source,config.siteId,config.companyId,config.keyId,config.mappingVersion,config.services.map(s=>s.id).sort()]));
}
function configured(env:WorkerEnv){return getErpConfig(env)??fail(503,'erp_unavailable');}
function now(value:number){if(!Number.isSafeInteger(value)||value<=0)fail(422,'erp_validation');return value;}
function normalize(input:unknown,config:ErpConfig):ErpLeadInput{
  if(!plain(input))fail(422,'erp_validation');only(input,['name','email','phone','serviceId','condition','desiredPeriod']);
  const normalized={name:bounded(input.name,80,true),email:bounded(input.email,254).toLowerCase(),phone:bounded(input.phone,35),
    serviceId:bounded(input.serviceId,100,true),condition:bounded(input.condition,1000),desiredPeriod:bounded(input.desiredPeriod,200)};
  if(!normalized.email&&!normalized.phone)fail(422,'erp_contact_required');
  if(normalized.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email))fail(422,'erp_validation');
  if(normalized.phone&&!/^\+?[0-9().\s-]{5,35}$/.test(normalized.phone))fail(422,'erp_validation');
  if(!config.services.some(service=>service.id===normalized.serviceId))fail(422,'erp_service_unavailable');
  return normalized;
}
async function conversation(db:D1Database,id:string):Promise<Row>{
  const row=await db.prepare('SELECT id,locale,status FROM assistant_conversations WHERE id=?').bind(id).first<Row>();
  if(!row)fail(404,'not_found');if(row.status==='closed')fail(409,'closed');
  if(!LOCALES.includes(row.locale as typeof LOCALES[number]))fail(422,'erp_locale');
  return row;
}
async function request(db:D1Database,id:string){return db.prepare('SELECT * FROM assistant_erp_requests WHERE conversation_id=?').bind(id).first<Row>();}
function view(row:Row):ErpLeadView{
  return {state:row.state as ErpLeadState,version:Number(row.version),previewHash:String(row.preview_hash),preview:JSON.parse(String(row.snapshot_json)) as ErpLeadInput,
    expiresAt:Number(row.preview_expires_at),updatedAt:Number(row.updated_at),cancelRequested:row.revoked_at!==null};
}
export async function getErpLead(db:D1Database,conversationId:string):Promise<ErpLeadView|null>{const row=await request(db,conversationId);return row?view(row):null;}

const DIAGNOSTIC_STATES:readonly ErpLeadState[]=['DRAFT','QUEUED','SENDING','RETRY','APPLIED','QUARANTINED','BLOCKED','CANCELLED','UNKNOWN'];
const DIAGNOSTIC_ERRORS:readonly ErpLeadErrorCode[]=['lease_expired','approval_or_scope_changed','authority_changed_before_send','transport_unknown','invalid_receipt','provider_transient','provider_rejected','cancel_raced_transport'];
function diagnosticReceipt(raw:unknown,eventId:string):ErpLeadReceipt|null{
  if(typeof raw!=='string'||raw.length>4096)return null;
  try{
    const receipt:unknown=JSON.parse(raw);
    if(!plain(receipt)||receipt.event_id!==eventId||typeof receipt.duplicate!=='boolean')return null;
    const validId=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/u.test(value);
    if(receipt.status==='APPLIED'&&validId(receipt.effect_id))return {status:'APPLIED',duplicate:receipt.duplicate,effectId:receipt.effect_id};
    if(receipt.status==='QUARANTINED'&&validId(receipt.quarantine_id))return {status:'QUARANTINED',duplicate:receipt.duplicate,quarantineId:receipt.quarantine_id};
  }catch{/* Malformed stored/provider data must not escape the owner allowlist. */}
  return null;
}
/** Caller must authenticate the owner. Never reuse this projection for guest routes. */
export async function getErpLeadDiagnostics(db:D1Database,conversationId:string):Promise<ErpLeadDiagnostics|null>{
  const row=await db.prepare('SELECT state,event_id,attempts,last_error,receipt_json FROM assistant_erp_requests WHERE conversation_id=?').bind(conversationId).first<Row>();
  if(!row||!DIAGNOSTIC_STATES.includes(row.state as ErpLeadState)||typeof row.event_id!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(row.event_id)||!Number.isSafeInteger(row.attempts)||Number(row.attempts)<0)return null;
  return {state:row.state as ErpLeadState,eventId:row.event_id,attempts:Number(row.attempts),
    lastError:DIAGNOSTIC_ERRORS.includes(row.last_error as ErpLeadErrorCode)?row.last_error as ErpLeadErrorCode:null,
    receipt:diagnosticReceipt(row.receipt_json,row.event_id)};
}

/** Root handler authenticates the scoped conversation before this function. SQL rechecks closure. */
export async function previewErpLead(db:D1Database,env:WorkerEnv,conversationId:string,input:unknown,nowMs=Date.now()):Promise<ErpLeadView>{
  const time=now(nowMs),config=configured(env),conv=await conversation(db,conversationId),snapshot=normalize(input,config),snapshotJson=JSON.stringify(snapshot),scopeHash=await erpScopeHash(config);
  const previous=await request(db,conversationId);
  if(previous&&!['DRAFT','CANCELLED'].includes(String(previous.state)))fail(409,'erp_request_locked');
  if(previous&&Number(previous.attempts)>0)fail(409,'erp_request_locked');
  if(previous?.state==='DRAFT'&&previous.snapshot_json===snapshotJson&&previous.scope_hash===scopeHash&&Number(previous.preview_expires_at)>time)return view(previous);
  const version=previous?Number(previous.version)+1:1,eventId=crypto.randomUUID();
  const externalId='site_'+await hash(JSON.stringify([config.companyId,config.siteId,conversationId]));
  const envelope={schema_version:'1',event_id:eventId,event_type:'lead.upsert',source:config.source,occurred_at:new Date(time).toISOString(),external_id:externalId,
    payload:{contact:{name:snapshot.name,...snapshot.email?{email:snapshot.email}:{},...snapshot.phone?{phone:snapshot.phone}:{}},serviceIds:[snapshot.serviceId],language:String(conv.locale).toUpperCase(),
      facts:{...snapshot.condition?{condition:snapshot.condition}:{},...snapshot.desiredPeriod?{desiredPeriod:snapshot.desiredPeriod}:{}},source:{}}};
  const envelopeJson=JSON.stringify(envelope),previewHash=await hash(JSON.stringify([version,scopeHash,snapshotJson,envelopeJson]));
  let result;
  if(previous){
    result=await db.prepare("UPDATE assistant_erp_requests SET scope_hash=?,snapshot_json=?,envelope_json=?,preview_hash=?,version=?,state='DRAFT',preview_expires_at=?,consent_at=NULL,revoked_at=NULL,event_id=?,external_id=?,next_attempt_at=0,lease_token=NULL,lease_until=NULL,receipt_json=NULL,last_error=NULL,updated_at=? WHERE conversation_id=? AND version=? AND state IN ('DRAFT','CANCELLED') AND attempts=0 AND EXISTS (SELECT 1 FROM assistant_conversations WHERE id=? AND status!='closed')")
      .bind(scopeHash,snapshotJson,envelopeJson,previewHash,version,time+PREVIEW_MS,eventId,externalId,time,conversationId,previous.version,conversationId).run();
  }else{
    result=await db.prepare("INSERT OR IGNORE INTO assistant_erp_requests (id,conversation_id,scope_hash,snapshot_json,envelope_json,preview_hash,version,state,preview_expires_at,event_id,external_id,created_at,updated_at) SELECT ?,?,?,?,?,?,1,'DRAFT',?,?,?,?,? WHERE EXISTS (SELECT 1 FROM assistant_conversations WHERE id=? AND status!='closed')")
      .bind(crypto.randomUUID(),conversationId,scopeHash,snapshotJson,envelopeJson,previewHash,time+PREVIEW_MS,eventId,externalId,time,time,conversationId).run();
  }
  const current=await request(db,conversationId);
  if(!result.meta?.changes){
    if(current?.state==='DRAFT'&&current.snapshot_json===snapshotJson&&current.scope_hash===scopeHash&&Number(current.preview_expires_at)>time)return view(current);
    fail(409,'erp_conflict');
  }
  return view(current!);
}
export async function confirmErpLead(db:D1Database,env:WorkerEnv,conversationId:string,input:unknown,nowMs=Date.now()):Promise<ErpLeadView>{
  const time=now(nowMs),config=configured(env);await conversation(db,conversationId);
  if(!plain(input))fail(422,'erp_validation');only(input,['version','previewHash','confirmed']);
  if(!Number.isSafeInteger(input.version)||Number(input.version)<1||typeof input.previewHash!=='string'||!/^[a-f0-9]{64}$/.test(input.previewHash)||input.confirmed!==true)fail(422,'erp_confirmation_required');
  const scopeHash=await erpScopeHash(config),row=await request(db,conversationId);
  if(!row)fail(404,'not_found');
  if(row.version!==input.version||row.preview_hash!==input.previewHash||row.scope_hash!==scopeHash)fail(409,'erp_preview_changed');
  if(row.revoked_at!==null)fail(409,'erp_revoked');
  if(row.state!=='DRAFT'){
    if(row.consent_at!==null)return view(row);
    fail(409,'erp_conflict');
  }
  if(Number(row.preview_expires_at)<=time)fail(409,'erp_preview_expired');
  const result=await db.prepare("UPDATE assistant_erp_requests SET state='QUEUED',consent_at=?,next_attempt_at=?,updated_at=? WHERE conversation_id=? AND version=? AND preview_hash=? AND scope_hash=? AND state='DRAFT' AND revoked_at IS NULL AND preview_expires_at>? AND EXISTS (SELECT 1 FROM assistant_conversations WHERE id=? AND status!='closed')")
    .bind(time,time,time,conversationId,input.version,input.previewHash,scopeHash,time,conversationId).run();
  const current=await request(db,conversationId);
  if(!result.meta?.changes&&!(current?.consent_at!==null&&current?.revoked_at===null&&current?.preview_hash===input.previewHash&&current?.version===input.version&&current?.state!=='DRAFT'))fail(409,'erp_conflict');
  return view(current!);
}
/** Revocation is durable. Any previously attempted send may already have committed remotely. */
export async function cancelErpLead(db:D1Database,conversationId:string,nowMs=Date.now()):Promise<ErpLeadView|null>{
  const time=now(nowMs);
  // Claiming/signing is not an attempt: the dispatcher atomically checks this revocation
  // before incrementing attempts and starting transport. Retire only never-used leases.
  await db.prepare("UPDATE assistant_erp_requests SET revoked_at=COALESCE(revoked_at,?),state=CASE WHEN state IN ('APPLIED','QUARANTINED') THEN state WHEN attempts>0 OR state='UNKNOWN' THEN 'UNKNOWN' ELSE 'CANCELLED' END,lease_token=CASE WHEN attempts=0 AND state IN ('DRAFT','QUEUED','SENDING','RETRY','BLOCKED','CANCELLED') THEN NULL ELSE lease_token END,lease_until=CASE WHEN attempts=0 AND state IN ('DRAFT','QUEUED','SENDING','RETRY','BLOCKED','CANCELLED') THEN NULL ELSE lease_until END,updated_at=? WHERE conversation_id=?")
    .bind(time,time,conversationId).run();
  return getErpLead(db,conversationId);
}
