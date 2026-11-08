import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {prepareDatabase} from './harness.mjs';
import {federationPair,within,erpPassword,sitePassword,replacementPassword} from './federation-harness.mjs';

// These cases deliberately have no skip mode. The shared bridge gate requires
// actual loopback PostgreSQL 17.6+, dedicated synthetic DB and a matching build.
let db;
before(async()=>{db=await prepareDatabase();},{timeout:60000});
after(async()=>{await db?.close();});
const check=(name,fn)=>test(name,{timeout:60000},fn);

check('F2 real VPS/SQLite and built ERP/HTTP/PG require dual confirmation and preserve terminal unlink',async t=>{
  const f=await federationPair(t,db),beforeUsers=await f.row('aggregates',"AND kind='user'"),beforeSessions=await f.row('auth_sessions');
  const {issued,pending}=await f.claimCurrent();
  assert.equal(pending.state,'CLAIMED');assert.equal(pending.subject,f.user.id);assert.equal((await f.row('site_identity_bindings')).length,0);
  const confirmed=await f.confirm(pending);assert.equal(confirmed.status,201);const result=await confirmed.json();
  assert.equal(result.binding.state,'ACTIVE');assert.equal(result.binding.subject,f.user.id);
  const bindings=await f.row('site_identity_bindings');assert.equal(bindings.length,1);assert.equal(bindings[0].user_id,f.erpUser);assert.equal(bindings[0].site_user_id,f.user.id);
  assert.deepEqual(await f.row('aggregates',"AND kind='user'"),beforeUsers);assert.deepEqual(await f.row('auth_sessions'),beforeSessions);
  assert.equal(f.site.db.prepare('SELECT count(*) n FROM vps_users').get().n,2);
  const sourceStatus=await f.siteAt('/account/erp-link/');assert.equal(sourceStatus.status,200);
  assert.ok(f.relay.wire.some(w=>w.action==='INTROSPECT'&&w.sourceActive&&w.delivered));
  const observedStatus=f.relay.wire.filter(w=>w.action==='LINK_STATUS').length;assert.ok(observedStatus>=1);
  await f.assertNoSecrets(issued.code);assert.deepEqual(f.relay.errors,[]);

  await f.stopSite();const wireBeforeUnlink=f.relay.wire.length;
  const unlinked=await f.erpWeb('/bindings/'+result.binding.id+'/unlink',{expectedVersion:1,password:erpPassword});
  assert.equal(unlinked.status,201);assert.deepEqual(await unlinked.json(),{id:result.binding.id,state:'REVOKED',version:2});
  assert.equal(f.relay.wire.length,wireBeforeUnlink,'self-unlink must not call an unavailable source');
  await f.restartSite();
  const next=await f.issue(),inspection=await f.inspect(next.code),relink=await f.claim(inspection);
  assert.equal(relink.status,409);const terminal=await f.row('site_identity_bindings');
  assert.equal(terminal.length,1);assert.equal(terminal[0].status,'REVOKED');assert.equal(terminal[0].version,2);
  assert.equal((await f.row('audit_log',"AND action='SITE_IDENTITY_LINK_RECORDED'")).length,1);
  assert.equal((await f.row('audit_log',"AND action='SITE_IDENTITY_LINK_REVOKED'")).length,1);
});

for(const kind of ['logout','credential'])check('F2 actual source '+kind+' P→L→C rejects an already computed active proof before ERP binding commit',async t=>{
  const f=await federationPair(t,db),{issued,pending}=await f.claimCurrent();
  const pause=f.relay.pauseNext('INTROSPECT','ERP_TO_SITE');
  const confirming=f.confirm(pending),proof=await within(pause.entered);
  assert.equal(proof.status,200);assert.equal(proof.sourceActive,true,'race must start with a genuinely active signed source response');
  const credentialBefore=f.site.db.prepare('SELECT password_hash FROM vps_users WHERE id=?').get(f.user.id).password_hash;
  try{
    const fence=f.relay.pauseNext('FENCE','SITE_TO_ERP','before');
    const mutating=kind==='logout'?f.sitePost('/logout/',{return_to:'/konto/'}):f.sitePost('/account/password/',{current:sitePassword,new:replacementPassword,confirm:replacementPassword});
    try{
      await within(fence.entered);
      assert.equal(f.currentSiteUser(),null,'durable P must deny source use before L reaches ERP');
      assert.ok(f.site.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(f.siteTokenHash),'C must wait for the ledger ACK');
      assert.equal(f.site.db.prepare('SELECT state FROM vps_federation_operations WHERE subject=? ORDER BY created_at DESC LIMIT 1').get(f.user.id).state,'PENDING_DENY');
      const old=(await f.row('site_federation_sessions','AND session_ref=$2',[f.ref]))[0];assert.equal(old.state,'ACTIVE');
      assert.equal(Number((await f.row('site_federation_principals'))[0].minimum_epoch),1);
    }finally{fence.release();}
    const response=await mutating;
    assert.equal(response.status,303,'source mutation must complete before releasing the old proof');
    assert.equal(f.site.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(f.siteTokenHash),undefined);
    assert.equal(f.currentSiteUser(),null);
    const operation=f.site.db.prepare('SELECT state FROM vps_federation_operations WHERE subject=? ORDER BY created_at DESC LIMIT 1').get(f.user.id);assert.equal(operation.state,'COMPLETE');
    const sessions=await f.row('site_federation_sessions','AND session_ref=$2',[f.ref]);assert.equal(sessions.length,1);
    if(kind==='logout')assert.equal(sessions[0].state,'REVOKED');
    else{
      const principal=(await f.row('site_federation_principals'))[0];assert.equal(Number(principal.epoch),2);assert.equal(Number(principal.minimum_epoch),2);assert.equal(principal.state,'ACTIVE');
      assert.equal(f.site.db.prepare('SELECT password_hash FROM vps_users WHERE id=?').get(f.user.id).password_hash!==credentialBefore,true,'actual source credential replacement must have committed');
    }
  }finally{pause.release();}
  const denied=await confirming;assert.equal(denied.status,401);assert.deepEqual(await denied.json(),{code:'NEEDS_REAUTH',details:{}});
  const delivered=await within(pause.finished);assert.equal(delivered.delivered,true);assert.equal(delivered.callerClosedBeforeReply,false,'must prove ledger rejection, not a transport timeout');
  assert.equal((await f.row('site_identity_bindings')).length,0);await f.assertNoSecrets(issued.code);assert.deepEqual(f.relay.errors,[]);
});

check('F2 lost actual FENCE ACK remains locally pending and retries one durable intent with a fresh nonce',async t=>{
  const f=await federationPair(t,db),{issued}=await f.claimCurrent(),drop=f.relay.dropResponses('FENCE','SITE_TO_ERP');
  const response=await f.sitePost('/logout/',{return_to:'/konto/'});assert.equal(response.status,503);
  assert.ok(response.headers.getSetCookie().some(value=>value.startsWith('__Host-knaba-session=')&&value.includes('Max-Age=0')));
  assert.ok(f.site.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(f.siteTokenHash),'PENDING must not be described as completed local mutation');
  assert.equal(f.currentSiteUser(),null);assert.equal((await f.row('site_federation_sessions','AND session_ref=$2',[f.ref]))[0].state,'REVOKED');
  const pending=f.site.db.prepare('SELECT operation_id,state FROM vps_federation_operations WHERE subject=?').get(f.user.id);assert.equal(pending.state,'PENDING_DENY');
  drop.clear();const recovery=await f.coordinator.resumePending();assert.ok(recovery.some(row=>row.operationId===pending.operation_id&&row.state==='COMPLETE'));
  assert.equal(f.site.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(f.siteTokenHash),undefined);
  const calls=f.relay.wire.filter(w=>w.action==='FENCE');assert.ok(calls.length>=2);
  assert.equal(new Set(calls.map(w=>w.operationId)).size,1);assert.equal(new Set(calls.map(w=>w.bodyHash)).size,1);assert.equal(new Set(calls.map(w=>w.nonce)).size,calls.length);
  assert.equal((await f.row('site_federation_operations',"AND action='FENCE'")).length,1);
  assert.equal((await f.row('audit_log',"AND action='FEDERATION_FENCE'")).length,1);
  assert.equal((await f.row('site_identity_bindings')).length,0);await f.assertNoSecrets(issued.code);assert.deepEqual(f.relay.errors,[]);
});

check('F2 delayed first REGISTER cannot escape an actual unknown-session tombstone after source recovery',async t=>{
  const f=await federationPair(t,db),issued=await f.issue(),inspection=await f.inspect(issued.code);
  const pause=f.relay.pauseNext('REGISTER_SESSION','SITE_TO_ERP','before'),claiming=f.claim(inspection);
  const registration=await within(pause.entered);assert.equal((await f.row('site_federation_sessions')).length,0);
  assert.equal(f.site.db.prepare('SELECT state FROM vps_federation_sessions WHERE session_ref=?').get(f.ref).state,'REGISTERING');
  // The real 3 s transport deadline expires while the original signed packet is
  // delayed in the relay. No application response or ledger result is fabricated.
  const unavailable=await within(claiming);assert.equal(unavailable.status,503);
  const recovered=await f.coordinator.resumeRegistrations();assert.ok(recovered.some(row=>row.state==='REVOKED'));
  const tombstone=(await f.row('site_federation_sessions','AND session_ref=$2',[f.ref]))[0];
  assert.equal(tombstone.state,'REVOKED');assert.equal(tombstone.epoch,null);assert.equal(tombstone.security_fingerprint,null);
  assert.equal(f.site.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(f.siteTokenHash),undefined);
  pause.release();const late=await within(pause.finished);assert.equal(late.status,401);assert.equal(late.errorCode,'ACCESS_DENIED');
  const freshRetry=await f.authority('REGISTER_SESSION',registration.registration);assert.equal(freshRetry.status,401);assert.equal(freshRetry.body.error.code,'ACCESS_DENIED');
  assert.equal((await f.row('site_federation_sessions','AND session_ref=$2',[f.ref]))[0].state,'REVOKED');
  assert.equal((await f.row('site_identity_bindings')).length,0);assert.deepEqual(f.relay.errors,[]);
});

check('F2 a pre-enrollment SQLite restore reconciles the external authority and cannot revive an old source session',async t=>{
  const f=await federationPair(t,db),{pending}=await f.claimCurrent();
  const before=Number((await f.row('site_federation_authorities'))[0].generation);
  assert.equal((await f.sitePost('/logout/',{return_to:'/konto/'})).status,303);
  await f.restoreBeforeEnrollment();
  const authority=(await f.row('site_federation_authorities'))[0];assert.equal(Number(authority.generation),before+1);assert.equal(authority.phase,'ACTIVE');
  assert.equal(f.site.db.prepare('SELECT generation,phase FROM vps_federation_authorities').get().generation,before+1);
  assert.equal(f.currentSiteUser(),null);assert.equal(f.site.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(f.siteTokenHash),undefined);
  const tombstone=(await f.row('site_federation_sessions','AND session_ref=$2',[f.ref]))[0];assert.equal(tombstone.state,'REVOKED');
  const oldProof=await f.confirm(pending);assert.equal(oldProof.status,401);assert.equal((await f.row('site_identity_bindings')).length,0);
  assert.equal((await f.siteAt('/account/erp-link/')).status,303);
  assert.ok(f.relay.wire.filter(w=>w.action==='BOOTSTRAP_AUTHORITY').length===2);assert.deepEqual(f.relay.errors,[]);
});

check('F2 two actual companies cannot consume each other’s code even with equal immutable source IDs and signing keys',async t=>{
  const subjectId='shared-synthetic-'+randomUUID(),a=await federationPair(t,db,{subjectId}),b=await federationPair(t,db,{subjectId});
  const issued=await a.issue();
  const wrong=await b.sitePost('/account/erp-link/inspect/',{authority:b.config.authorityId,code:issued.code});assert.equal(wrong.status,409);
  assert.equal(b.relay.wire.at(-1).action,'INSPECT_CHALLENGE');assert.equal(b.relay.wire.at(-1).errorCode,'FEDERATION_CONFLICT');
  assert.equal((await a.row('site_identity_link_challenges'))[0].inspect_count,0);assert.equal((await b.row('site_identity_link_challenges')).length,0);
  assert.equal((await a.row('site_identity_bindings')).length,0);assert.equal((await b.row('site_identity_bindings')).length,0);
  const inspection=await a.inspect(issued.code);assert.equal((await a.claim(inspection)).status,200);
  const confirm=await a.confirm(await a.pending());assert.equal(confirm.status,201);
  assert.equal((await a.row('site_identity_bindings'))[0].company_id,a.company);assert.equal((await b.row('site_identity_bindings')).length,0);
  assert.deepEqual(a.relay.errors,[]);assert.deepEqual(b.relay.errors,[]);
});
