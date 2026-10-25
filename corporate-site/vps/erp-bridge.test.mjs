import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac,createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalDatabase} from './database.mjs';
import {parseBridgeConfig,deliverPendingLead} from './erp-bridge.mjs';

const NOW=Date.parse('2026-10-25T13:00:00Z');
const config=()=>({
  KNABA_ERP_BRIDGE_ENABLED:'true',
  KNABA_ERP_TRANSFER_APPROVED:'true',
  KNABA_ERP_APPROVED_PRIVACY_VERSION:'2026-10-24',
  KNABA_ERP_URL:'https://api.knaba.example.test/api/v1/integrations/knaba_site/events',
  KNABA_ERP_ALLOWED_ORIGIN:'https://api.knaba.example.test',
  KNABA_ERP_KEY_ID:'site_test_v1',
  KNABA_ERP_SECRET:'SYNTHETIC_ONLY_DO_NOT_USE_IN_LIVE_20261025',
  KNABA_ERP_SERVICE_MAP_JSON:JSON.stringify({bueroreinigung:'service_clean'}),
});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'knaba-bridge-'));
 const {db}=openLocalDatabase(join(dir,'site.sqlite'));
 const id=randomUUID(),at='2026-10-25T11:00:00.000Z';
 const request={
    id,service:'bueroreinigung',object_type:'Büro / Gewerbe',postcode:'10315',area:'200',
    frequency:'Regelmäßig',message:'Synthetic customer note that must NOT enter bridge.',
    contact_name:'Synthetic Visitor',email:'contact@example.test',phone:'',address:'Berlin',
    dedupe_scope:'synthetic',idempotency_key:'synthetic-idempotency-key',payload_hash:'synthetic-digest',
    privacy_version:'2026-10-24',created_at:at,updated_at:at,last_mutation:'synthetic-mutation'
 };
 db.prepare('INSERT INTO cleaning_requests (id,service,object_type,postcode,area,frequency,message,contact_name,email,phone,address,dedupe_scope,idempotency_key,payload_hash,privacy_version,created_at,updated_at,last_mutation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .run(...Object.values(request));
 db.prepare('INSERT INTO site_erp_outbox(id,request_id,created_at,updated_at) VALUES (?,?,?,?)').run(id,id,at,at);
 const row=()=>db.prepare('SELECT * FROM site_erp_outbox WHERE id=?').get(id);
 const finish=()=>{db.close();rmSync(dir,{recursive:true,force:true});};
 return {db,id,request,row,finish};
}

test('bridge disabled by default: no queue claim, no HTTP or credentials fallback',async()=>{
 const f=fixture();let calls=0;
 try{
   await assert.rejects(deliverPendingLead(f.db,{},async()=>{calls++;throw Error('FORBIDDEN')},NOW),{code:'BRIDGE_DISABLED'});
   assert.equal(calls,0);
   assert.equal(f.row().status,'PENDING');
   assert.equal(f.row().attempts,0);
 }finally{f.finish();}
});
test('approved pinned integration signs exact canonical HMAC and confirms only applied event',async()=>{
 const f=fixture();const env=config();let calls=0,bodyBefore;
 try{
   const sent=await deliverPendingLead(f.db,env,async(url,init)=>{
     calls++;assert.equal(url,env.KNABA_ERP_URL);assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
     const headers=init.headers,raw=Buffer.from(init.body),envelope=JSON.parse(raw.toString('utf8'));
     assert.equal(envelope.schema_version,'1');assert.equal(envelope.event_id,f.id);
     assert.equal(envelope.external_id,f.id);assert.equal(envelope.event_type,'lead.upsert');assert.equal(envelope.source,'knaba_site');
     assert.equal(envelope.occurred_at,f.request.created_at);
     assert.deepEqual(envelope.payload.serviceIds,['service_clean']);
     assert.equal(envelope.payload.contact.email,'contact@example.test');
     assert.equal(envelope.payload.contact.name,'Synthetic Visitor');
     assert.equal(envelope.payload.facts.propertyType,'Büro / Gewerbe');
     assert.equal(envelope.payload.facts.measurementSource,'CUSTOMER_STATED');
     assert.equal(envelope.payload.facts.quantityMilli,200000);
     assert.equal(envelope.payload.facts.recurring,true);
     assert.equal(raw.toString('utf8').includes(f.request.message),false);
     assert.equal(headers['x-knaba-key-id'],env.KNABA_ERP_KEY_ID);
     const signature='sha256='+createHmac('sha256',env.KNABA_ERP_SECRET).update(headers['x-knaba-timestamp']+'.').update(raw).digest('hex');
     assert.equal(headers['x-knaba-signature'],signature);
     bodyBefore=raw;
     return new Response(JSON.stringify({event_id:f.id,status:'APPLIED',effect_id:'erp-lead-1',duplicate:false}),{status:200});
   },NOW);
   assert.equal(sent.status,'APPLIED');
   assert.equal(calls,1);
   assert.equal(f.row().status,'APPLIED');
   assert.equal(f.row().erp_effect_id,'erp-lead-1');
   assert.equal(f.row().envelope_sha256,createHash('sha256').update(bodyBefore).digest('hex'));
   const idle=await deliverPendingLead(f.db,env,async()=>{calls++;throw Error('FORBIDDEN')},NOW+1000);
   assert.equal(idle.status,'IDLE');assert.equal(calls,1);
 }finally{f.finish();}
});
test('wrong privacy version, unknown service and forged endpoint cannot disclose contact',async()=>{
 for(const change of [
    {KNABA_ERP_APPROVED_PRIVACY_VERSION:'older'},
    {KNABA_ERP_SERVICE_MAP_JSON:'{}'},
    {KNABA_ERP_URL:'http://127.0.0.1/api/v1/integrations/knaba_site/events'},
    {KNABA_ERP_ALLOWED_ORIGIN:'https://other.example.test'},
    {KNABA_ERP_TRANSFER_APPROVED:'false'}
 ]){
   const f=fixture();let calls=0;
   try{
     const env={...config(),...change};
     let outcome;
     try{outcome=await deliverPendingLead(f.db,env,async()=>{calls++;throw Error('FORBIDDEN')},NOW);}
     catch(error){assert.ok(error.code==='BRIDGE_DISABLED'||error.code==='BRIDGE_CONFIGURATION_INVALID');}
     assert.equal(calls,0);
     assert.notEqual(f.row().status,'APPLIED');
     if(outcome)assert.ok(['BLOCKED','IDLE'].includes(outcome.status));
   }finally{f.finish();}
 }
});
test('ambiguous provider outcome can retry safely with identical event bytes and a new timestamp',async()=>{
 const f=fixture();const env=config();let attempts=0,first;
 try{
   const transport=async(_url,init)=>{
     attempts++;
     const raw=Buffer.from(init.body);
     if(attempts===1){first=raw;throw Error('simulated network timeout');}
     assert.deepEqual(raw,first);
     assert.equal(init.headers['x-knaba-timestamp'],String(Math.floor((NOW+400000)/1000)));
     const message=JSON.parse(raw.toString('utf8'));
     return new Response(JSON.stringify({event_id:message.event_id,status:'APPLIED',effect_id:'erp-lead-2',duplicate:true}),{status:200});
   };
   const uncertain=await deliverPendingLead(f.db,env,transport,NOW);
   assert.equal(uncertain.status,'PENDING');assert.equal(f.row().attempts,1);
   const beforeDue=await deliverPendingLead(f.db,env,transport,NOW+1000);
   assert.equal(beforeDue.status,'IDLE');assert.equal(attempts,1);
   const replay=await deliverPendingLead(f.db,env,transport,NOW+400000);
   assert.equal(replay.status,'APPLIED');assert.equal(f.row().attempts,2);assert.equal(attempts,2);
 }finally{f.finish();}
});
test('outbox marks valid ERP quarantine for human REVIEW, never APPLIED',async()=>{
 const f=fixture();
 try{
  const outcome=await deliverPendingLead(f.db,config(),async(_url,init)=>
    new Response(JSON.stringify({event_id:JSON.parse(init.body).event_id,status:'QUARANTINED',quarantine_id:'queue_1'}),{status:200}),NOW);
  assert.equal(outcome.status,'REVIEW');assert.equal(f.row().status,'REVIEW');assert.equal(f.row().erp_effect_id,null);
  assert.equal((await deliverPendingLead(f.db,config(),async()=>{throw Error('called')},NOW+2000)).status,'IDLE');
 }finally{f.finish();}
});
test('changed service mapping after ambiguous outcome is blocked before another send',async()=>{
 const f=fixture();let calls=0;
 try{
  await deliverPendingLead(f.db,config(),async()=>{calls++;throw Error('unknown')},NOW);
  const env={...config(),KNABA_ERP_SERVICE_MAP_JSON:JSON.stringify({bueroreinigung:'different_service'})};
  const outcome=await deliverPendingLead(f.db,env,async()=>{calls++;throw Error('FORBIDDEN')},NOW+400000);
  assert.equal(outcome.status,'BLOCKED');assert.equal(f.row().last_error,'ENVELOPE_CHANGED');
  assert.equal(calls,1);
 }finally{f.finish();}
});

test('deleting an unsent source request cascades the outbox reference for privacy erasure',async()=>{
 const f=fixture();let calls=0;
 try{
   f.db.prepare('DELETE FROM cleaning_requests WHERE id=?').run(f.id);
   assert.equal(f.row(),undefined);
   const result=await deliverPendingLead(f.db,config(),async()=>{calls++;throw Error('FORBIDDEN')},NOW);
   assert.equal(result.status,'IDLE');
   assert.equal(calls,0);
 }finally{f.finish();}
});
test('expired crash lease is recovered using one stable event identity',async()=>{
 const f=fixture();let calls=0;
 try{
   f.db.prepare("UPDATE site_erp_outbox SET status='LEASED',lease_token=?,lease_until=?,attempts=1 WHERE id=?").run('crashed-worker',Math.floor(NOW/1000)-5,f.id);
   const result=await deliverPendingLead(f.db,config(),async(_url,init)=>{
     calls++;
     const event=JSON.parse(init.body);
     assert.equal(event.event_id,f.id);
     return new Response(JSON.stringify({event_id:f.id,status:'APPLIED',effect_id:'erp-recovered'}),{status:200});
   },NOW);
   assert.equal(result.status,'APPLIED');
   assert.equal(f.row().attempts,2);
   assert.equal(f.row().erp_effect_id,'erp-recovered');
   assert.equal(calls,1);
 }finally{f.finish();}
});
test('forged or mismatched HTTP acknowledgement can never mark ERP receipt as applied',async()=>{
 const f=fixture();let calls=0;
 try{
   const result=await deliverPendingLead(f.db,config(),async()=>{
     calls++;
     return new Response(JSON.stringify({event_id:'wrong-event',status:'APPLIED',effect_id:'erp-forged'}),{status:200});
   },NOW);
   assert.equal(result.status,'PENDING');
   assert.equal(f.row().erp_effect_id,null);
   assert.equal(calls,1);
 }finally{f.finish();}
});
