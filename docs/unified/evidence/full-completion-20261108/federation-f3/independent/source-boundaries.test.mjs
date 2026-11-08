import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loginFixture,loginTestPassword} from '../../../knaba-federation-login/corporate-site/vps/federation-login-test-fixture.mjs';
import {createSessionForUser,destroySession} from '../../../knaba-federation-login/corporate-site/vps/auth.mjs';
import {makeFederationRequest,verifyFederationResponse} from '../../../knaba-federation-login/erp/packages/integrations/site-federation-protocol.mjs';
import {openLocalDatabase as openLegacyDatabase} from './legacy-f2-b3cbb24/corporate-site/vps/database.mjs';
import {createSourceFederation as createLegacyFederation} from './legacy-f2-b3cbb24/corporate-site/vps/federation-entry.mjs';

// These probes use actual current source modules + SQLite + signed loopback HTTP,
// with the repository's explicitly synthetic ERP authority. They are NOT PG,
// actual ERP/F1, rendered-browser, provider, native, or live acceptance evidence.
const sha=value=>createHash('sha256').update(value).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const approvalCount=f=>f.ledger.requests.filter(x=>x.action==='LOGIN_APPROVE').length;

test('independent: immutable request deadline caps issue proof, not the original active-session use proof', {timeout:10000}, async t=>{
  const f=await loginFixture(t),request=f.createRequest();
  request.expiresAt=new Date(Date.now()+2500).toISOString();
  const value=await f.inspect(request);await f.approve(value);
  const row=f.db.prepare('SELECT * FROM vps_federation_login_approvals').get();
  assert.equal(row.issue_expires_at,request.expiresAt);
  const deadline=Date.parse(row.issue_expires_at);
  f.coordinator.now=()=>deadline-1;
  const near=f.proof(f.input(request)).value;
  assert.equal(near.active,true);assert.equal(Date.parse(near.validUntil),deadline);
  f.coordinator.now=()=>deadline;
  assert.deepEqual(f.proof(f.input(request)).value,{active:false});
  const use=f.proof(f.input(request,'SESSION_USE')).value;
  assert.equal(use.active,true);assert.equal(use.reauthAt,row.reauth_at);
  assert.equal(f.db.prepare('SELECT issue_expires_at FROM vps_federation_login_approvals').get().issue_expires_at,row.issue_expires_at);
});

test('independent: source-session end clamps use proof and denies exactly at expiry', {timeout:10000}, async t=>{
  const f=await loginFixture(t),end=(Math.floor(Date.now()/1000)+3)*1000;
  // This is still a non-enrolled source session; no federation permit is bypassed.
  f.db.prepare('UPDATE vps_sessions SET expires_at=? WHERE token_hash=?').run(end/1000,f.tokenHash);
  const value=await f.inspect();await f.approve(value);
  f.coordinator.now=()=>end-1;
  const near=f.proof(f.input(value.request,'SESSION_USE')).value;
  assert.equal(near.active,true);assert.equal(Date.parse(near.validUntil),end);assert.equal(Date.parse(near.sessionExpiresAt),end);
  f.coordinator.now=()=>end;
  assert.deepEqual(f.proof(f.input(value.request,'SESSION_USE')).value,{active:false});
});

test('independent: expired inspection produces no durable approval or approval RPC', {timeout:10000}, async t=>{
  const f=await loginFixture(t),request=f.createRequest();request.expiresAt=new Date(Date.now()+2000).toISOString();
  const value=await f.inspect(request);f.coordinator.now=()=>Date.parse(request.expiresAt);
  await assert.rejects(f.approve(value),{code:'NEEDS_REAUTH'});
  assert.equal(approvalCount(f),0);assert.equal(f.db.prepare('SELECT count(*) n FROM vps_federation_login_approvals').get().n,0);
});

test('independent: lost ACK cannot replay or renew an expired CLAIMING operation', {timeout:10000}, async t=>{
  const f=await loginFixture(t),request=f.createRequest();request.expiresAt=new Date(Date.now()+2500).toISOString();
  const value=await f.inspect(request);
  f.ledger.after=(wire,res)=>{if(wire.envelope.action==='LOGIN_APPROVE'){res.destroy();return false;}};
  await assert.rejects(f.approve(value),{code:'FEDERATION_UNAVAILABLE'});
  assert.equal(request.state,'SOURCE_APPROVED');assert.equal(approvalCount(f),1);
  const before=f.db.prepare('SELECT * FROM vps_federation_login_approvals').get();assert.equal(before.state,'CLAIMING');
  f.ledger.after=null;f.coordinator.now=()=>Date.parse(before.issue_expires_at);
  await assert.rejects(f.status(request),{code:'NEEDS_REAUTH'});
  assert.equal(approvalCount(f),1);assert.deepEqual(f.proof(f.input(request)).value,{active:false});
  assert.deepEqual(f.proof(f.input(request,'SESSION_USE')).value,{active:false});
  assert.deepEqual(f.db.prepare('SELECT * FROM vps_federation_login_approvals').get(),before);
});

test('independent: same-user replacement session cannot reuse approval or revive a revoked original session', {timeout:10000}, async t=>{
  const f=await loginFixture(t),value=await f.inspect();await f.approve(value);
  const replacement=await createSessionForUser(f.db,f.user.id,{passwordVerified:true}),tokenHash=sha(replacement.token);
  assert.notEqual(tokenHash,f.tokenHash);const before=f.ledger.requests.length;
  await assert.rejects(f.coordinator.login.status({subject:f.user.id,tokenHash,authorityId:f.config.authorityId,requestId:value.request.requestId}),{code:'NEEDS_REAUTH'});
  assert.equal(f.ledger.requests.length,before);
  assert.equal(f.proof(f.input(value.request,'SESSION_USE')).value.active,true);
  await destroySession(f.db,'__Host-knaba-session='+f.session.token);
  assert.deepEqual(f.proof(f.input(value.request,'SESSION_USE')).value,{active:false});
  assert.equal(f.coordinator.localSession(f.user.id,tokenHash)?.token_hash,tokenHash);
});

test('independent: late authenticated pre-cancellation status cannot overwrite a newer terminal local deny', {timeout:10000}, async t=>{
  const f=await loginFixture(t),value=await f.inspect();await f.approve(value);
  const captured=deferred(),release=deferred();t.after(()=>release.resolve());let delayed=false;
  f.coordinator.fetchImpl=async(url,options)=>{
    const response=await f.fetchImpl(url,options),action=JSON.parse(Buffer.from(options.body).toString()).action;
    if(action==='LOGIN_STATUS'&&!delayed){
      delayed=true;const body=Buffer.from(await response.arrayBuffer());
      const complete=new Response(body,{status:response.status,headers:response.headers});captured.resolve();await release.promise;return complete;
    }
    return response;
  };
  const oldResult=f.status(value.request).then(value=>({value}),error=>({error}));await captured.promise;
  value.request.state='CANCELLED';value.request.version++;f.ledger.revision++;
  assert.equal((await f.status(value.request)).state,'CANCELLED');
  const terminal=f.db.prepare('SELECT state,remote_version FROM vps_federation_login_approvals').get();assert.equal(terminal.state,'DENIED');
  release.resolve();const late=await oldResult;assert.equal(late.error?.code,'NEEDS_REAUTH');assert.equal(late.value,undefined);
  assert.deepEqual(f.db.prepare('SELECT state,remote_version FROM vps_federation_login_approvals').get(),terminal);
  assert.deepEqual(f.proof(f.input(value.request,'SESSION_USE')).value,{active:false});
});

test('independent: unauthenticated raw body and authenticated wrong action consume no proof nonce or effect', {timeout:10000}, async t=>{
  const f=await loginFixture(t),value=await f.inspect();await f.approve(value);const input=f.input(value.request);
  const count=()=>f.db.prepare('SELECT count(*) n FROM vps_federation_nonces').get().n;
  const before=count(),packet=makeFederationRequest(f.config,'ERP_TO_SITE','INTROSPECT',input,{generation:f.ledger.generation});
  assert.throws(()=>f.coordinator.introspect(packet.headers,Buffer.from('{broken JSON')),{code:'FEDERATION_AUTH_FAILED'});
  assert.equal(count(),before);
  const wrong=makeFederationRequest(f.config,'ERP_TO_SITE','LOGIN_STATUS',input,{generation:f.ledger.generation});
  const rejected=f.coordinator.introspect(wrong.headers,wrong.body);
  assert.equal(rejected.status,400);
  const result=verifyFederationResponse(f.config,wrong.context,rejected.status,new Headers(rejected.headers),rejected.body);
  assert.equal(result.error.code,'VALIDATION_ERROR');assert.equal(count(),before);
  assert.equal(f.proof(input,packet).value.active,true);assert.equal(count(),before+1);
});

test('independent: exact prior F2 binary opens additive schema but rejects both F3 proof purposes', {timeout:10000}, async t=>{
  const f=await loginFixture(t),value=await f.inspect();await f.approve(value);
  const oldGeneration=f.ledger.generation,priorRow=f.db.prepare('SELECT * FROM vps_federation_login_approvals').get();
  const priorLedger=f.db.prepare('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename').all();
  f.coordinator.close();const opened=openLegacyDatabase(f.path,{allowMigrations:false});
  t.after(()=>opened.db.close());
  f.coordinator=await createLegacyFederation({db:opened.db,environment:f.environment,origin:f.config.siteOrigin,mode:'TEST',ownerPolicy:{},fetchImpl:f.fetchImpl});
  assert.ok(f.ledger.generation>oldGeneration);assert.equal(f.coordinator.login,undefined);
  for(const purpose of ['SESSION_ISSUE','SESSION_USE']){
    const packet=makeFederationRequest(f.config,'ERP_TO_SITE','INTROSPECT',f.input(value.request,purpose),{generation:f.ledger.generation});
    const response=f.coordinator.introspect(packet.headers,packet.body);
    assert.equal(response.status,400);
    const result=verifyFederationResponse(f.config,packet.context,response.status,new Headers(response.headers),response.body);
    assert.equal(result.error.code,'VALIDATION_ERROR');assert.notEqual(result.active,true);
  }
  assert.deepEqual(opened.db.prepare('SELECT * FROM vps_federation_login_approvals').get(),priorRow);
  assert.deepEqual(opened.db.prepare('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename').all(),priorLedger);
});
