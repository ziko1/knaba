import {createHash,createHmac,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {openLocalDatabase} from './database.mjs';

/**
 * KNABA VSP SQLite -> existing KNABA ERP PostgreSQL HMAC integration API.
 * Separate manual/opt-in publisher, NOT an HTTP route or an automatic site hook.
 * Only a source reference and immutable envelope fingerprint persist in SQLite.
 */
export class BridgeError extends Error {
  constructor(code){super(code);this.code=code;this.name='BridgeError';}
}
const fail=(code)=>{throw new BridgeError(code);};
const source='knaba_site';
const endpointPath='/api/v1/integrations/'+source+'/events';
const safeString=(x,n)=>typeof x==='string'&&x.length>0&&x.length<=n;
const seconds=(ms)=>Math.floor(ms/1000);
const fingerprint=(b)=>createHash('sha256').update(b).digest('hex');
const ISO=(s)=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
const MAX_ATTEMPTS=5;

/** Do not read a lead or claim any row until all runtime owner/provider gates pass. */
export function parseBridgeConfig(env={}){
  if(env.KNABA_ERP_BRIDGE_ENABLED!=='true'||env.KNABA_ERP_TRANSFER_APPROVED!=='true')
    fail('BRIDGE_DISABLED');
  if(!safeString(env.KNABA_ERP_URL,2000)||!safeString(env.KNABA_ERP_ALLOWED_ORIGIN,1000)||
     !safeString(env.KNABA_ERP_KEY_ID,64)||!safeString(env.KNABA_ERP_SECRET,4096)||
     env.KNABA_ERP_SECRET.length<32||!/^[A-Za-z0-9_-]{1,64}$/.test(env.KNABA_ERP_KEY_ID)||
     !/^\d{4}-\d{2}-\d{2}$/.test(env.KNABA_ERP_APPROVED_PRIVACY_VERSION??''))
    fail('BRIDGE_CONFIGURATION_INVALID');
  let endpoint;
  try{endpoint=new URL(env.KNABA_ERP_URL);}
  catch{fail('BRIDGE_CONFIGURATION_INVALID');}
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.hash||endpoint.search||
     endpoint.pathname!==endpointPath||endpoint.origin!==env.KNABA_ERP_ALLOWED_ORIGIN||
     endpoint.hostname==='localhost'||endpoint.hostname.endsWith('.localhost')||
     endpoint.hostname.endsWith('.local')||endpoint.hostname==='127.0.0.1'||
     endpoint.hostname==='::1'||endpoint.hostname.startsWith('[')||/^\d+\.\d+\.\d+\.\d+$/.test(endpoint.hostname))
    fail('BRIDGE_CONFIGURATION_INVALID');
  let mapping;
  try{mapping=JSON.parse(env.KNABA_ERP_SERVICE_MAP_JSON??'');}
  catch{fail('BRIDGE_CONFIGURATION_INVALID');}
  if(!mapping||typeof mapping!=='object'||Array.isArray(mapping)||Object.keys(mapping).length===0||
     Object.keys(mapping).length>100||
     Object.entries(mapping).some(([slug,id])=>!/^[-a-z0-9_]{1,100}$/.test(slug)||
       ['__proto__','prototype','constructor'].includes(slug)||!safeString(id,100)))
    fail('BRIDGE_CONFIGURATION_INVALID');
  return Object.freeze({endpoint:endpoint.href,keyId:env.KNABA_ERP_KEY_ID,
    secret:env.KNABA_ERP_SECRET,privacyVersion:env.KNABA_ERP_APPROVED_PRIVACY_VERSION,
    serviceMap:Object.freeze({...mapping})});
}

function buildEnvelope(row,config){
  if(row.status==='cancelled')fail('SOURCE_CANCELLED');
  if(row.privacy_version!==config.privacyVersion)fail('PRIVACY_VERSION_NOT_APPROVED');
  if(!safeString(row.id,100)||!ISO(row.created_at)||!safeString(row.contact_name,200)||
     !safeString(row.email,254)||!row.email.includes('@')||!safeString(row.service,100)||
     !safeString(config.serviceMap[row.service],100)||!safeString(row.object_type,4000)||
     !safeString(row.postcode,10)||!safeString(row.frequency,4000))
    fail('SOURCE_MAPPING_INVALID');
  const area=typeof row.area==='string'&&/^\d{1,7}$/.test(row.area)&&Number(row.area)>0
    &&Number(row.area)<=1_000_000?Number(row.area):undefined;
  if(row.area&&row.area.trim()&&area===undefined)fail('SOURCE_MAPPING_INVALID');
  const address=[row.postcode,row.address].filter(x=>safeString(x,4000)).join(', ');
  const facts={propertyType:row.object_type,desiredPeriod:row.frequency,address,
    ...(row.frequency==='Regelmäßig'?{recurring:true}:row.frequency==='Einmalig'?{recurring:false}:{}),
    ...(area!==undefined?{area:String(area)+' m²',quantityMilli:area*1000,measurementSource:'CUSTOMER_STATED'}:{})};
  const contact={name:row.contact_name,email:row.email,
    ...(safeString(row.phone,40)&&row.phone.trim()?{phone:row.phone.trim()}:{})};
  // Never copy the free-text customer message, staff assignment, payment or GPS.
  return {schema_version:'1',event_id:row.id,event_type:'lead.upsert',source,
    occurred_at:row.created_at,external_id:row.id,
    payload:{contact,serviceIds:[config.serviceMap[row.service]],language:'DE',facts,source:{}}};
}
const claimSql="UPDATE site_erp_outbox SET status='LEASED',attempts=attempts+1,lease_token=?,lease_until=?,updated_at=? "+
  "WHERE id=(SELECT id FROM site_erp_outbox WHERE attempts<"+MAX_ATTEMPTS+" AND "+
  "((status='PENDING' AND next_attempt_at<=?) OR (status='LEASED' AND lease_until<=?)) "+
  "ORDER BY created_at,id LIMIT 1) AND attempts<"+MAX_ATTEMPTS+" "+
  "RETURNING id,request_id,attempts,lease_token,envelope_sha256";
function settle(db,claim,changes,nowMs){
  const now=new Date(nowMs).toISOString();
  const values={status:changes.status,last_error:changes.error??'',last_http_status:changes.http??null,
    next_attempt_at:changes.nextAttempt??0,erp_effect_id:changes.effectId??null};
  const update=db.prepare("UPDATE site_erp_outbox SET status=?,last_error=?,last_http_status=?,next_attempt_at=?,erp_effect_id=?, "+
    "lease_until=0,lease_token=NULL,updated_at=?,completed_at=? "+
    "WHERE id=? AND status='LEASED' AND lease_token=?").run(values.status,values.last_error,
    values.last_http_status,values.next_attempt_at,values.erp_effect_id,now,
    ['APPLIED','REVIEW','BLOCKED'].includes(values.status)?now:null,claim.id,claim.lease_token);
  return update.changes===1?values.status:'STALE';
}
async function readBoundedReceipt(response){
  const reader=response.body?.getReader();if(!reader)return null;
  const chunks=[];let length=0;
  try{for(;;){const part=await reader.read();if(part.done)break;
    length+=part.value.byteLength;
    if(length>8192){await reader.cancel();return null;}
    chunks.push(Buffer.from(part.value));
  }}catch{return null;}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{return null;}
}
/** Processes AT MOST ONE row. Never dispatches when activation, mapping or consent is unknown. */
export async function deliverPendingLead(db,env={},transport=fetch,nowMs=Date.now()){
  const config=parseBridgeConfig(env);
  if(!Number.isSafeInteger(nowMs)||nowMs<0)fail('BRIDGE_CONFIGURATION_INVALID');
  const now=seconds(nowMs),leaseToken=randomUUID();
  const claim=db.prepare(claimSql).get(leaseToken,now+60,new Date(nowMs).toISOString(),now,now);
  if(!claim)return {status:'IDLE'};
  let envelopeBytes;
  try{
    const row=db.prepare('SELECT * FROM cleaning_requests WHERE id=?').get(claim.request_id);
    if(!row)fail('SOURCE_MISSING');
    envelopeBytes=Buffer.from(JSON.stringify(buildEnvelope(row,config)),'utf8');
    if(envelopeBytes.length>262144)fail('SOURCE_MAPPING_INVALID');
  }catch(error){
    return {status:settle(db,claim,{status:'BLOCKED',error:error instanceof BridgeError?error.code:'SOURCE_MAPPING_INVALID'},nowMs)};
  }
  const digest=fingerprint(envelopeBytes);
  if(claim.envelope_sha256&&claim.envelope_sha256!==digest)
    return {status:settle(db,claim,{status:'BLOCKED',error:'ENVELOPE_CHANGED'},nowMs)};
  const fp=db.prepare("UPDATE site_erp_outbox SET envelope_sha256=? WHERE id=? AND status='LEASED' AND lease_token=? "+
    "AND (envelope_sha256 IS NULL OR envelope_sha256=?)").run(digest,claim.id,claim.lease_token,digest);
  if(fp.changes!==1)return {status:'STALE'};
  const stamp=String(now),signature='sha256='+createHmac('sha256',config.secret).update(stamp+'.').update(envelopeBytes).digest('hex');
  let response,payload,http;
  try{
    response=await transport(config.endpoint,{method:'POST',redirect:'error',
      headers:{'Content-Type':'application/json','x-knaba-key-id':config.keyId,'x-knaba-timestamp':stamp,'x-knaba-signature':signature},
      body:envelopeBytes,signal:AbortSignal.timeout(10000)});
    http=response.status;
    if(response.ok)payload=await readBoundedReceipt(response);
  }catch{http=undefined;}
  if(http>=200&&http<300&&payload&&payload.event_id===claim.id&&payload.status==='APPLIED'&&
     safeString(payload.effect_id,200))
    return {status:settle(db,claim,{status:'APPLIED',http,effectId:payload.effect_id},nowMs)};
  if(http>=200&&http<300&&payload&&payload.event_id===claim.id&&payload.status==='QUARANTINED')
    return {status:settle(db,claim,{status:'REVIEW',error:'ERP_QUARANTINED',http},nowMs)};
  if(http!==undefined&&http>=400&&http<500&&http!==429)
    return {status:settle(db,claim,{status:'BLOCKED',error:'ERP_REJECTED',http},nowMs)};
  // A lost response might follow an ERP ACID commit. Reusing the identical
  // event ID and payload SHA is safe; never mint another event or alter money.
  if(claim.attempts>=MAX_ATTEMPTS)
    return {status:settle(db,claim,{status:'BLOCKED',error:'MAX_RETRIES',http},nowMs)};
  const delay=Math.min(15*2**claim.attempts,300);
  return {status:settle(db,claim,{status:'PENDING',error:'PROVIDER_OUTCOME_UNKNOWN',http,nextAttempt:now+delay},nowMs)};
}

/** Explicit operator command only. Never imported or auto-run by the website. */
async function main(){
  if(process.argv.length!==3||process.argv[2]!=='--once')fail('BRIDGE_DISABLED');
  const dbPath=process.env.KNABA_DB_PATH;
  if(!safeString(dbPath,2000)||!dbPath.startsWith('/'))fail('BRIDGE_CONFIGURATION_INVALID');
  // Check gates before even opening a local database or applying any migrations.
  parseBridgeConfig(process.env);
  const {db}=openLocalDatabase(dbPath,{allowMigrations:false});
  try{const result=await deliverPendingLead(db,process.env);console.log('KNABA_ERP_BRIDGE',result.status);}
  finally{db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{
    console.error('KNABA_ERP_BRIDGE',error instanceof BridgeError?error.code:'DEPENDENCY_UNAVAILABLE');
    process.exitCode=1;
  });
}
