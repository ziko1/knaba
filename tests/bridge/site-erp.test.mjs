import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash,randomUUID} from 'node:crypto';
import {fixture,form,prepareDatabase} from './harness.mjs';

let db;
before(async()=>{db=await prepareDatabase();},{timeout:60000});
after(async()=>{await db?.close();});
const check=(name,fn)=>test(name,{timeout:30000},fn);

async function accepted(f,input=form()){
  const response=await f.post(input);
  assert.ok([200,201].includes(response.status),'anonymous intake must be durably accepted');
  const body=await response.json();assert.equal(body.received,true);assert.equal(typeof body.id,'string');
  return {body,input};
}

async function assistantTicket(f){
  const response=await f.assistant('/api/assistant/conversations',{body:{locale:'uk',privacyAccepted:true,website:''}});
  assert.equal(response.status,201);const ticket=await response.json();assert.equal(typeof ticket.token,'string');return ticket;
}
function assistantForm(){const {address,...input}=form();return {...input,transferAccepted:true};}

check('explicit assistant conversion crosses actual VPS/SQLite/signed HTTP/PostgreSQL once and preserves its scoped origin after restart',async t=>{
  const f=await fixture(t,db),ticket=await assistantTicket(f),path=`/api/assistant/conversations/${ticket.id}/requests`,input=assistantForm();
  const denied=await f.assistant(path,{body:{...input,transferAccepted:false},ticket});assert.equal(denied.status,422);assert.equal(f.queue().length,0);
  const responses=await Promise.all(Array.from({length:5},()=>f.assistant(path,{body:input,ticket})));
  for(const response of responses)assert.ok([200,201].includes(response.status),await response.clone().text());
  const receipts=await Promise.all(responses.map(response=>response.json()));assert.equal(new Set(receipts.map(receipt=>receipt.id)).size,1);
  const id=receipts[0].id;assert.equal(receipts[0].request.erpTransfer.status,'PENDING');assert.equal(f.queue().length,1);
  const link=f.site.db.prepare('SELECT * FROM assistant_request_links').get();assert.equal(link.request_id,id);assert.equal(link.conversation_id,ticket.id);
  const wire=await f.envelope(f.queue()[0]),payload=JSON.parse(wire).payload;
  assert.equal(payload.language,'UK');assert.deepEqual(payload.source,{});
  assert.equal(payload.facts.address,input.postcode);
  for(const value of [ticket.id,ticket.token,input.message,'conversationId','transferAccepted'])assert.ok(!wire.includes(value));
  assert.equal((await f.dispatch()).applied,1);assert.equal(f.wire.length,1);
  const leads=await f.rows('lead');assert.equal(leads.length,1);assert.equal(leads[0].id,f.queue()[0].erp_effect_id);assert.equal(leads[0].company_id,f.company);
  assert.deepEqual(leads[0].data.createdSource,{channel:'WEB',integrationSource:f.source,externalId:id});
  assert.equal((await f.rows('user')).length,1);assert.equal((await f.rows('employee')).length,0);
  assert.equal(f.site.db.prepare('SELECT count(*) AS n FROM profiles').get().n,0);assert.equal(f.site.db.prepare('SELECT count(*) AS n FROM vps_users').get().n,0);
  await f.restart();
  const context=await f.assistant(`/api/assistant/conversations/${ticket.id}/request-context`,{ticket});assert.equal(context.status,200);
  const body=await context.json();assert.deepEqual(body.requests.map(row=>({id:row.id,status:row.erpTransfer.status})),[{id,status:'APPLIED'}]);
  assert.ok(!JSON.stringify(body).includes(input.message));assert.ok(!JSON.stringify(body).includes(leads[0].id));
  const retry=await f.assistant(path,{body:input,ticket});assert.equal(retry.status,200);assert.equal((await retry.json()).id,id);
  assert.equal((await f.rows('integration_event')).length,1);assert.equal((await f.outbox('lead.created')).length,1);
  assert.equal(f.site.db.prepare('SELECT count(*) AS n FROM assistant_request_links').get().n,1);
});

check('assistant withdrawal is capability-scoped and prevents a not-yet-sent real ERP effect',async t=>{
  const f=await fixture(t,db),ticket=await assistantTicket(f),foreign=await assistantTicket(f);
  const response=await f.assistant(`/api/assistant/conversations/${ticket.id}/requests`,{ticket,body:assistantForm()});
  assert.equal(response.status,201);const created=await response.json(),path=`/api/assistant/conversations/${ticket.id}/requests/${created.id}/cancel`;
  assert.equal((await f.assistant(path,{ticket:foreign,body:{version:1}})).status,404);
  assert.equal((await f.assistant(`/api/assistant/conversations/${ticket.id}/request-context`,{ticket:foreign})).status,404);
  const cancelled=await f.assistant(path,{ticket,body:{version:1}});assert.equal(cancelled.status,200);assert.equal((await cancelled.json()).request.status,'cancelled');
  assert.equal((await f.dispatch()).blocked,1);assert.equal(f.queue()[0].status,'BLOCKED');assert.equal(f.wire.length,0);
  assert.equal((await f.rows('lead')).length,0);assert.equal((await f.rows('integration_event')).length,0);
  await f.restart();
  const context=await (await f.assistant(`/api/assistant/conversations/${ticket.id}/request-context`,{ticket})).json();
  assert.equal(context.requests[0].status,'cancelled');assert.equal(context.requests[0].erpTransfer.status,'BLOCKED');
  assert.equal(f.site.db.prepare('SELECT count(*) AS n FROM portal_audit').get().n,2);
});

check('actual HTTP intake applies only the trusted mapping and creates no identity or privilege',async t=>{
  const f=await fixture(t,db,{scheduled:true});
  const denied=await f.post(form({tenantId:'foreign-company',userId:f.owner,roles:['OWNER'],serviceIds:['foreign-service']}));
  assert.equal(denied.status,422);
  assert.equal(f.queue().length,0);assert.equal((await f.rows('lead')).length,0);
  const {body,input}=await accepted(f);
  const queued=f.queue();assert.equal(queued.length,1);assert.equal(queued[0].status,'PENDING');
  assert.equal(queued[0].request_id,body.id);assert.equal((await f.rows('lead')).length,0);
  const bytes=await f.envelope(queued[0]),envelope=JSON.parse(bytes);
  assert.equal(queued[0].envelope_sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(queued[0].delivery_scope_sha256,(await f.config()).bindingHash);
  assert.equal(envelope.source,f.source);assert.equal(envelope.external_id,body.id);
  assert.equal(envelope.target_company_id,f.company);
  assert.deepEqual(envelope.payload.serviceIds,[f.service]);
  assert.equal(envelope.payload.facts?.restrictions,undefined);
  assert.ok(!JSON.stringify(envelope).includes(input.message));
  assert.equal(envelope.payload.facts.address,input.postcode+', '+input.address);
  assert.equal(queued[0].payload_json,undefined);
  await f.tick();
  const stored=f.queue()[0];assert.equal(stored.status,'APPLIED');assert.equal(stored.payload_json,undefined);
  const leads=await f.rows('lead');assert.equal(leads.length,1);
  assert.equal(leads[0].company_id,f.company);assert.equal(leads[0].data.ownerUserId,f.owner);
  assert.deepEqual(leads[0].data.serviceIds,[f.service]);
  assert.deepEqual(leads[0].data.createdSource,{channel:'WEB',integrationSource:f.source,externalId:body.id});
  assert.equal(leads[0].data.marketingConsent,false);assert.equal(leads[0].data.status,'NEW');
  assert.equal(stored.erp_effect_id,leads[0].id);
  assert.equal((await f.rows('user')).length,1);assert.equal((await f.rows('employee')).length,0);
  assert.equal(f.site.db.prepare('SELECT count(*) AS n FROM profiles').get().n,0);
  assert.equal(f.site.db.prepare('SELECT count(*) AS n FROM vps_users').get().n,0);
  assert.equal((await f.rows('integration_event')).length,1);assert.equal((await f.rows('integration_record')).length,1);
  assert.equal((await f.outbox('lead.created')).length,1);
  const audit=await db.query("SELECT count(*)::int AS n FROM audit_log WHERE company_id=$1 AND aggregate_kind='lead' AND aggregate_id=$2",[f.company,leads[0].id]);
  assert.equal(audit.rows[0].n,1);assert.equal(f.wire.length,1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM aggregates WHERE company_id<>$1 AND kind='lead' AND data->'createdSource'->>'externalId'=$2",[f.company,body.id])).rows[0].n,0);
  const status=await f.ownerStatus();assert.equal(status.rows[0].status,'APPLIED');assert.equal(status.rows[0].erp_effect_id,leads[0].id);
  assert.ok(!JSON.stringify(status).includes(input.email));assert.ok(!JSON.stringify(status).includes(input.message));
  assert.equal(status.rows[0].payload_json,undefined);
  await f.restart();
  assert.deepEqual(await f.ownerStatus({reuseCookie:true}),status);
  await f.rejectRevokedOwner();
});

check('concurrent intake and drainers produce one durable ERP effect; identical replay returns its receipt',async t=>{
  const f=await fixture(t,db),input=form();
  const responses=await Promise.all(Array.from({length:5},()=>f.post(input)));
  for(const response of responses)assert.ok([200,201].includes(response.status));
  const receipts=await Promise.all(responses.map(response=>response.json()));
  assert.equal(new Set(receipts.map(body=>body.id)).size,1);assert.equal(f.queue().length,1);
  const original=JSON.parse(await f.envelope(f.queue()[0]));
  await Promise.all([f.dispatch(),f.dispatch()]);
  assert.equal(f.queue()[0].status,'APPLIED');assert.equal(f.queue()[0].attempts,1);
  assert.equal(f.wire.length,1);
  const replay=await f.sendEnvelope(original);
  assert.equal(replay.status,'APPLIED');assert.equal(replay.duplicate,true);
  assert.equal(replay.effectId,f.queue()[0].erp_effect_id);
  assert.equal((await f.rows('lead')).length,1);assert.equal((await f.rows('integration_event')).length,1);
  assert.equal((await f.outbox('lead.created')).length,1);
  const conflict=await f.post({...input,message:'Changed submission under the same intake key'});
  assert.equal(conflict.status,409);assert.equal(f.queue().length,1);
});

check('response loss after real ERP commit survives site restart and retries the exact event once',async t=>{
  const f=await fixture(t,db);await accepted(f);
  const before=f.queue()[0],beforeEnvelope=await f.envelope(before),requests=[];
  // A real HTTP fault proxy forwards to the actual ERP and waits for its
  // committed receipt, then destroys only the caller-facing connection.
  const fault=createServer(async(req,res)=>{
    try{
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=Buffer.concat(chunks);requests.push(body.toString('utf8'));
      const response=await f.loopbackFetch((await f.config()).endpoint,{method:'POST',redirect:'manual',headers:req.headers,body});
      assert.ok(response.ok);await response.text();res.destroy();
    }catch{res.destroy();}
  });
  fault.listen(0,'127.0.0.1');await once(fault,'listening');
  t.after(()=>new Promise(resolve=>fault.close(resolve)));
  const lost=await f.dispatch({fetch:(_url,options)=>fetch(`http://127.0.0.1:${fault.address().port}/lost-receipt`,options)});
  assert.equal(lost.retried,1);assert.equal(f.queue()[0].status,'PENDING');
  assert.equal((await f.rows('lead')).length,1);assert.equal((await f.outbox('lead.created')).length,1);
  await f.restart();
  const persisted=f.queue()[0];assert.equal(persisted.id,before.id);assert.equal(await f.envelope(persisted),beforeEnvelope);
  assert.equal(persisted.envelope_sha256,before.envelope_sha256);assert.equal(persisted.attempts,1);
  // Advance only the durable retry schedule; HMAC time remains the actual clock.
  f.site.db.prepare('UPDATE site_erp_outbox SET next_attempt_at=0 WHERE id=?').run(before.id);
  assert.equal((await f.dispatch()).applied,1);assert.equal(f.queue()[0].attempts,2);
  assert.equal(f.queue()[0].payload_json,undefined);assert.equal((await f.rows('lead')).length,1);
  assert.equal((await f.rows('integration_event')).length,1);assert.equal((await f.outbox('lead.created')).length,1);
  assert.equal(requests[0],beforeEnvelope);
  assert.equal(new Set(f.wire.map(entry=>entry.eventId)).size,1);
  assert.equal(new Set(f.wire.map(entry=>entry.bodyHash)).size,1);
});

check('a conflicting authenticated event produces real ERP quarantine and never overwrites the first lead',async t=>{
  const f=await fixture(t,db);await accepted(f);
  const original=JSON.parse(await f.envelope(f.queue()[0]));
  const conflicting={...original,payload:{...original.payload,contact:{...original.payload.contact,name:'Earlier authenticated synthetic contact'}}};
  const first=await f.sendEnvelope(conflicting);assert.equal(first.status,'APPLIED');
  const result=await f.dispatch();assert.equal(result.quarantined,1);assert.equal(result.applied,0);
  const row=f.queue()[0];assert.equal(row.status,'REVIEW');assert.equal(row.payload_json,undefined);
  const quarantines=await f.rows('integration_quarantine');assert.equal(quarantines.length,1);
  assert.equal(quarantines[0].data.eventId,row.id);assert.equal(quarantines[0].data.reason,'EVENT_ID_PAYLOAD_CONFLICT');
  const leads=await f.rows('lead');assert.equal(leads.length,1);assert.equal(leads[0].id,first.effectId);
  assert.equal(leads[0].data.contact.name,'Earlier authenticated synthetic contact');
  assert.equal((await f.outbox('lead.created')).length,1);
});

check('current ERP actor revocation quarantines queued intake without a business or identity effect',async t=>{
  const f=await fixture(t,db,{scheduled:true});await accepted(f);
  await db.transaction(f.company,'SYNTHETIC_REVOCATION',async tx=>{
    const owner=await tx.get('user',f.owner);await tx.save(owner,{...owner.data,active:false});
  });
  await f.tick();
  const row=f.queue()[0];assert.equal(row.status,'REVIEW');assert.equal((await f.rows('integration_quarantine'))[0].data.reason,'INTEGRATION_OWNER_UNAVAILABLE');
  assert.equal((await f.rows('lead')).length,0);assert.equal((await f.outbox('lead.created')).length,0);
  assert.equal((await f.rows('integration_event'))[0].data.status,'QUARANTINED');
  assert.equal((await f.rows('user')).length,1);assert.equal((await f.rows('user'))[0].data.active,false);
  const status=await f.ownerStatus();assert.equal(status.rows[0].status,'REVIEW');assert.ok(status.rows[0].last_error);
  assert.equal(status.rows[0].erp_effect_id,null);
});

check('unmapped service and changed site mapping fail closed before any ERP HTTP request',async t=>{
  const f=await fixture(t,db);
  await accepted(f,form({service:'glasreinigung'}));
  assert.equal(f.queue()[0].status,'BLOCKED');assert.equal(f.queue()[0].payload_json,undefined);
  await accepted(f);assert.equal(f.queue().filter(row=>row.status==='PENDING').length,1);
  f.env.KNABA_ERP_BRIDGE_ENABLED='0';
  const disabled=await f.dispatch();assert.equal(disabled.disabled,true);assert.equal(f.wire.length,0);
  assert.equal(f.queue().filter(row=>row.status==='PENDING').length,1);
  f.env.KNABA_ERP_BRIDGE_ENABLED='true';f.env.KNABA_ERP_MAPPING_VERSION='synthetic-v2';
  const changed=await f.dispatch();assert.equal(changed.blocked,1);assert.equal(f.wire.length,0);
  assert.equal(f.queue().filter(row=>row.status==='BLOCKED').length,2);
  assert.equal((await f.rows('lead')).length,0);assert.equal((await f.rows('integration_event')).length,0);
});

check('SQLite queue failure rolls back intake and audit; retry commits one complete bridge transaction',async t=>{
  const f=await fixture(t,db),input=form();
  f.site.db.exec("CREATE TRIGGER synthetic_bridge_failure BEFORE INSERT ON site_erp_outbox BEGIN SELECT RAISE(ABORT,'synthetic queue failure'); END");
  const failed=await f.post(input);assert.ok(failed.status>=500);
  assert.equal(f.site.db.prepare('SELECT count(*) AS n FROM cleaning_requests').get().n,0);
  assert.equal(f.queue().length,0);
  assert.equal(f.site.db.prepare("SELECT count(*) AS n FROM portal_audit WHERE action='request.created'").get().n,0);
  assert.equal((await f.rows('lead')).length,0);
  f.site.db.exec('DROP TRIGGER synthetic_bridge_failure');
  await accepted(f,input);assert.equal((await f.dispatch()).applied,1);
  assert.equal(f.queue().length,1);assert.equal((await f.rows('lead')).length,1);
  assert.equal((await f.outbox('lead.created')).length,1);
});

check('expired lease recovery fences stale settlement while two real deliveries create one ERP lead',async t=>{
  const f=await fixture(t,db);await accepted(f);
  let release,committed;
  const held=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{committed=resolve;});
  const first=f.dispatch({fetch:async(...args)=>{
    const response=await f.loopbackFetch(...args);committed();await held;return response;
  }});
  try{
  await Promise.race([started,first.then(()=>assert.fail('First HTTP delivery ended before ERP commit'))]);
  assert.equal((await f.rows('lead')).length,1);
  const leased=f.queue()[0];assert.equal(leased.status,'LEASED');assert.ok(leased.lease_token);
  // Model process downtime with an expired durable claim, without waiting a
  // real lease interval or changing production timeout/retry settings.
  f.site.db.prepare('UPDATE site_erp_outbox SET lease_until=0 WHERE id=?').run(leased.id);
  const recovered=await f.dispatch();assert.equal(recovered.applied,1);
  const settled=f.queue()[0];assert.equal(settled.status,'APPLIED');assert.equal(settled.attempts,2);
  release();await first;
  assert.deepEqual(f.queue()[0],settled);
  assert.equal((await f.rows('lead')).length,1);assert.equal((await f.rows('integration_event')).length,1);
  assert.equal((await f.outbox('lead.created')).length,1);
  assert.equal(f.wire.length,2);assert.equal(new Set(f.wire.map(entry=>entry.bodyHash)).size,1);
  }finally{release();await first;}
});

check('same-company credential rotation preserves replay; different-company credentials cannot redirect queued intake',async t=>{
  const f=await fixture(t,db);await accepted(f);
  const original=JSON.parse(await f.envelope(f.queue()[0]));
  assert.equal((await f.dispatch()).applied,1);
  const applied=f.queue()[0];
  await f.rotateReceiver();
  const replay=await f.sendEnvelope(original);
  assert.equal(replay.status,'APPLIED');assert.equal(replay.duplicate,true);assert.equal(replay.effectId,applied.erp_effect_id);
  assert.equal((await f.rows('lead')).length,1);assert.equal((await f.outbox('lead.created')).length,1);

  await accepted(f);
  const target='bridge_foreign_'+randomUUID();
  await f.rotateReceiver({targetCompany:target});
  const result=await f.dispatch();assert.equal(result.blocked,1);assert.equal(result.applied,0);
  const blocked=f.queue().find(row=>row.status==='BLOCKED');assert.ok(blocked);assert.equal(blocked.payload_json,undefined);
  assert.equal((await f.rows('lead')).length,1);assert.equal((await f.rows('integration_event')).length,1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM aggregates WHERE company_id=$1 AND kind IN('lead','integration_event','integration_record','integration_quarantine')",[target])).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM outbox WHERE company_id=$1 AND type IN('lead.created','integration.quarantined')",[target])).rows[0].n,0);
});
