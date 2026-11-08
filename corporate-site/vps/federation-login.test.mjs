import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openLocalDatabase} from './database.mjs';
import {createSourceFederation} from './federation-entry.mjs';
import {readSession,destroySession} from './auth.mjs';
import {loginFixture,loginTestPassword,loginSha} from './federation-login-test-fixture.mjs';

const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};
test('F3 source policy is explicitly disabled by default even when F2 is active',async t=>{
  const f=await loginFixture(t,{enabled:false});assert.equal(f.coordinator.login.enabled,false);
  await assert.rejects(f.inspect(),{code:'FEDERATION_CONFIGURATION'});
  assert.equal(f.ledger.requests.some(row=>row.action.startsWith('LOGIN_')),false);
});
test('source approval requires password, exact current session and explicit confirmation; never grants a role',async t=>{
  const f=await loginFixture(t),value=await f.inspect(),role=f.db.prepare('SELECT role FROM profiles WHERE id=?').get(f.user.id).role;
  await assert.rejects(f.coordinator.login.approve({subject:f.user.id,tokenHash:f.tokenHash,inspectionId:value.inspection.inspectionId,password:loginTestPassword,confirmed:false}),{code:'NEEDS_REAUTH'});
  await assert.rejects(f.coordinator.login.approve({subject:f.other.id,tokenHash:f.otherHash,inspectionId:value.inspection.inspectionId,password:loginTestPassword,confirmed:true}),{code:'NEEDS_REAUTH'});
  assert.equal(f.ledger.requests.some(row=>row.action==='LOGIN_APPROVE'),false);
  const result=await f.approve(value);assert.equal(result.state,'SOURCE_APPROVED');assert.equal(result.returnUrl,value.request.returnUrl);
  assert.equal(f.db.prepare('SELECT role FROM profiles WHERE id=?').get(f.user.id).role,role);
  const proof=f.proof(f.input(value.request));assert.equal(proof.value.active,true);
  assert.ok(Date.parse(proof.value.validUntil)-Date.parse(proof.value.checkedAt)<=10000);
  assert.equal(proof.value.reauthAt,value.request.source.reauthAt);
});
test('durable approval contains hashes and immutable intent but no password, site cookie or ERP credential',async t=>{
  const f=await loginFixture(t),value=await f.inspect();await f.approve(value);
  const row=f.db.prepare('SELECT * FROM vps_federation_login_approvals').get(),serialized=JSON.stringify(row);
  for(const secret of [loginTestPassword,f.session.token,'K3C.','KF3.'])assert.ok(!serialized.includes(secret));
  assert.equal(row.payload_digest,loginSha(row.payload_json));assert.equal(row.state,'APPROVED');
  assert.throws(()=>f.db.prepare('UPDATE vps_federation_login_approvals SET subject=?').run(f.other.id),/FEDERATION_LOGIN_IMMUTABLE/);
  assert.throws(()=>f.db.prepare("UPDATE vps_federation_login_approvals SET state='CLAIMING'").run(),/FEDERATION_LOGIN_CONFLICT/);
});
test('online proof echoes every exact request, source and policy field and fails closed on substitution',async t=>{
  const f=await loginFixture(t),value=await f.inspect();await f.approve(value);const input=f.input(value.request,'SESSION_USE');
  assert.equal(f.proof(input).value.erpSessionId,input.erpSessionId);
  for(const [key,replacement] of Object.entries({requestId:randomUUID(),requestBinding:loginSha('other'),subject:f.other.id,
    sessionRef:'Z'.repeat(43),epoch:2,securityFingerprint:loginSha('other'),sourcePolicyVersion:2,loginPolicyVersion:2,
    loginPolicyFingerprint:loginSha('other'),sourceLoginPolicyFingerprint:loginSha('other')}))
    assert.deepEqual(f.proof({...input,[key]:replacement}).value,{active:false},key);
  assert.equal(f.proof({...input,role:'admin'}).response.status,400);
  assert.equal(f.proof({...input,erpSessionId:'not-a-session'}).response.status,400);
});
test('nonce replay cannot reuse a valid source proof',async t=>{
  const f=await loginFixture(t),value=await f.inspect();await f.approve(value);const input=f.input(value.request),first=f.proof(input);
  assert.equal(first.value.active,true);const replay=f.proof(input,first.packet);assert.equal(replay.response.status,409);assert.equal(replay.value.error.code,'FEDERATION_REPLAY');
});
test('SESSION_USE requires the original active source session but not repeated five-minute password prompts',async t=>{
  const f=await loginFixture(t),value=await f.inspect();await f.approve(value);
  f.db.prepare('DELETE FROM vps_federation_reauth WHERE token_hash=?').run(f.tokenHash);
  assert.deepEqual(f.proof(f.input(value.request)).value,{active:false});
  assert.equal(f.proof(f.input(value.request,'SESSION_USE')).value.active,true);
  await destroySession(f.db,'__Host-knaba-session='+f.session.token);
  assert.deepEqual(f.proof(f.input(value.request,'SESSION_USE')).value,{active:false});
});
test('source P immediately suppresses a new proof while the global session fence is awaiting its ACK',async t=>{
  const f=await loginFixture(t),value=await f.inspect();await f.approve(value);const entered=defer(),release=defer();
  f.ledger.before=async wire=>{if(wire.envelope.action==='FENCE'){entered.resolve();await release.promise;}};
  const pending=destroySession(f.db,'__Host-knaba-session='+f.session.token);await entered.promise;
  try{assert.deepEqual(f.proof(f.input(value.request,'SESSION_USE')).value,{active:false});assert.equal(readSession(f.db,'__Host-knaba-session='+f.session.token),null);}
  finally{release.resolve();await pending;}
});
test('a lost approval ACK retries the exact operation with a new nonce, then reads current owned status',async t=>{
  const f=await loginFixture(t),value=await f.inspect();let dropped=false;
  f.ledger.after=(wire,res)=>{if(wire.envelope.action==='LOGIN_APPROVE'&&!dropped){dropped=true;res.destroy();return false;}};
  await assert.rejects(f.approve(value),{code:'FEDERATION_UNAVAILABLE'});
  assert.equal(f.db.prepare('SELECT state FROM vps_federation_login_approvals').get().state,'CLAIMING');
  assert.deepEqual(f.proof(f.input(value.request)).value,{active:false});
  f.ledger.after=null;assert.equal((await f.status(value.request)).state,'SOURCE_APPROVED');
  const calls=f.ledger.requests.filter(r=>r.action==='LOGIN_APPROVE');assert.equal(calls.length,2);
  assert.equal(calls[0].operationId,calls[1].operationId);assert.equal(calls[0].digest,calls[1].digest);assert.notEqual(calls[0].nonce,calls[1].nonce);
  assert.equal(f.ledger.requests.at(-1).action,'LOGIN_STATUS');assert.equal(f.proof(f.input(value.request)).value.active,true);
});
test('a missing approval effect is recovered only by explicit same-intent retry within the original window',async t=>{
  const f=await loginFixture(t),value=await f.inspect();let fail=true;
  f.ledger.before=wire=>{if(wire.envelope.action==='LOGIN_APPROVE'&&fail)throw Error('Synthetic network unavailable before effect');};
  await assert.rejects(f.approve(value));assert.equal(value.request.state,'BROWSER_BOUND');
  fail=false;assert.equal((await f.status(value.request)).state,'SOURCE_APPROVED');
  const calls=f.ledger.requests.filter(r=>r.action==='LOGIN_APPROVE');assert.equal(calls.length,2);assert.equal(calls[0].digest,calls[1].digest);
});
test('historical successful approval receipt never overrides a current cancellation during recovery',async t=>{
  const f=await loginFixture(t),value=await f.inspect();let dropped=false;
  f.ledger.after=(wire,res)=>{if(wire.envelope.action==='LOGIN_APPROVE'&&!dropped){dropped=true;res.destroy();return false;}};
  await assert.rejects(f.approve(value));f.ledger.after=null;
  value.request.state='CANCELLED';value.request.version++;f.ledger.revision++;
  assert.equal((await f.status(value.request)).state,'CANCELLED');
  assert.equal(f.db.prepare('SELECT state FROM vps_federation_login_approvals').get().state,'DENIED');
  assert.deepEqual(f.proof(f.input(value.request)).value,{active:false});
});
test('wrong password consumes no approval and cannot be replaced by a previous source login proof',async t=>{
  const f=await loginFixture(t),value=await f.inspect();f.coordinator.reauthenticate(f.user.id,f.tokenHash,loginTestPassword);
  await assert.rejects(f.coordinator.login.approve({subject:f.user.id,tokenHash:f.tokenHash,inspectionId:value.inspection.inspectionId,password:'wrong',confirmed:true}),{code:'NEEDS_REAUTH'});
  assert.equal(f.db.prepare('SELECT count(*) n FROM vps_federation_login_approvals').get().n,0);
  assert.equal(f.ledger.requests.some(r=>r.action==='LOGIN_APPROVE'),false);
});
test('another account cannot read or retry a durable request after an unknown ACK',async t=>{
  const f=await loginFixture(t),value=await f.inspect();await f.approve(value);const before=f.ledger.requests.length;
  await assert.rejects(f.coordinator.login.status({subject:f.other.id,tokenHash:f.otherHash,authorityId:f.config.authorityId,requestId:value.request.requestId}),{code:'NEEDS_REAUTH'});
  assert.equal(f.ledger.requests.length,before);
});
test('a delayed approval response cannot restore source authority after logout',async t=>{
  const f=await loginFixture(t),value=await f.inspect(),entered=defer(),release=defer();
  f.ledger.after=async wire=>{if(wire.envelope.action==='LOGIN_APPROVE'){entered.resolve();await release.promise;}};
  const pending=f.approve(value),denied=assert.rejects(pending,{code:'NEEDS_REAUTH'});await entered.promise;
  await destroySession(f.db,'__Host-knaba-session='+f.session.token);release.resolve();await denied;
  assert.equal(f.db.prepare('SELECT state FROM vps_federation_login_approvals').get().state,'CLAIMING');
  assert.deepEqual(f.proof(f.input(value.request)).value,{active:false});
});
test('source login policy cannot be rebound in a running generation',async t=>{
  const f=await loginFixture(t),value=await f.inspect();await f.approve(value);
  f.environment.KNABA_FEDERATION_LOGIN_JSON=JSON.stringify({enabled:false});
  assert.throws(()=>f.proof(f.input(value.request)),{code:'FEDERATION_CONFIGURATION'});
  assert.equal(f.coordinator.ready,false);assert.equal(f.db.prepare('SELECT phase FROM vps_federation_authorities').get().phase,'RECONCILING');
});
test('restart establishes a new ledger generation and old source approvals remain unusable',async t=>{
  const f=await loginFixture(t),value=await f.inspect();await f.approve(value);const generation=f.ledger.generation;
  f.coordinator.close();f.coordinator=await createSourceFederation({db:f.db,environment:f.environment,origin:f.config.siteOrigin,mode:'TEST',ownerPolicy:{},fetchImpl:f.fetchImpl});
  assert.ok(f.ledger.generation>generation);assert.deepEqual(f.proof(f.input(value.request,'SESSION_USE')).value,{active:false});
});
test('F3 schema installation is explicitly gated and canonical SQL history stays unchanged',async t=>{
  const f=await loginFixture(t),names=f.db.prepare('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename').all();
  f.db.exec('DROP TABLE vps_federation_login_schema');
  assert.throws(()=>openLocalDatabase(f.path,{allowMigrations:false}),/Pending VPS auth migration federation-login/);
  const reopened=openLocalDatabase(f.path,{allowMigrations:true});
  assert.deepEqual(reopened.db.prepare('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename').all(),names);reopened.db.close();
});
