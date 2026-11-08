import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createSessionForUser,createLogin,readSession,rotateCredentials,destroySession} from './auth.mjs';
import {sourceFingerprint,sourceLabel} from './federation-snapshot.mjs';
import {SourceFederationCoordinator} from './federation-source.mjs';
import {sessionReference,makeFederationRequest,verifyFederationResponse} from '../../erp/packages/integrations/site-federation-protocol.mjs';
import {testAuthority} from './federation-test-authority.mjs';
import {createAccountMailer} from './account-mail.mjs';
import {readAccountSettings,revokeAccountSessions,requestPasswordReset,requestEmailChange,consumeAccountToken} from './account-settings.mjs';
import {beginOidc,completeOidc,createOidcSession} from './oidc.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const password='synthetic-password-not-a-secret';
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function fixture(t,{enrolled=true}={}){
  const directory=mkdtempSync(join(tmpdir(),'knaba-federation-source-'));
  const path=join(directory,'auth.sqlite'),db=openLocalDatabase(path).db;
  const state={directory,path,db,coordinator:null};
  t.after(()=>{state.coordinator?.close();state.db.close();rmSync(directory,{recursive:true,force:true});});
  const user=createCredentialsUser(db,'synthetic@example.test',password);
  db.prepare(`INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation)
    VALUES(?,?,?,'client','client','approved','2026-10-28','2026-11-08','2026-11-08',1,'fixture')`).run(user.id,'Synthetic User',user.email);
  const session=createSessionForUser(db,user.id),tokenHash=sha(session.token),cookie='__Host-knaba-session='+session.token;
  const authority=await testAuthority(t),{config,ledger}=authority,ref=sessionReference(config.issuer,user.id,tokenHash);
  if(enrolled){
    const fp=sourceFingerprint(db,user.id,config,{});
    ledger.principals.set(user.id,{kind:'PRINCIPAL',subject:user.id,epoch:1,minimumEpoch:1,state:'ACTIVE',securityFingerprint:fp,sourcePolicyVersion:1,version:1,fenceOperationId:null});
    ledger.sessions.set(ref,{kind:'SESSION',subject:user.id,sessionRef:ref,epoch:1,securityFingerprint:fp,expiresAt:new Date((Math.floor(Date.now()/1000)+43_200)*1000).toISOString(),state:'ACTIVE',version:1});
  }
  state.coordinator=new SourceFederationCoordinator({db,authorities:[config],fetchImpl:authority.fetchImpl});
  await state.coordinator.initialize();
  return Object.assign(state,{user,session,tokenHash,cookie,ref,...authority});
}
function revokePlan(f){return {subject:f.user.id,kind:'REVOKE_SESSION',scope:'SESSION',sessionHashes:[f.tokenHash],pureRevocation:true,
  authorize:()=>Boolean(readSession(f.db,f.cookie)),apply:()=>({revoked:Number(f.db.prepare('DELETE FROM vps_sessions WHERE token_hash=?').run(f.tokenHash).changes)})};}

test('P is durable and denies the current source session before an outbound negative lookup completes',async t=>{
  const f=await fixture(t,{enrolled:false}),entered=defer(),release=defer();
  f.ledger.before=async wire=>{if(wire.envelope.action==='LOOKUP_PRINCIPAL'){entered.resolve();await release.promise;}};
  const pending=f.coordinator.mutate(revokePlan(f));
  await entered.promise;
  const row=f.db.prepare('SELECT state FROM vps_federation_operations').get();
  assert.equal(row.state,'PENDING_DENY');assert.equal(f.db.isTransaction,false);
  try{
    assert.equal(readSession(f.db,f.cookie)===null,true);
    await assert.rejects(f.coordinator.enroll(f.user.id,f.tokenHash,f.config.authorityId),{code:'NEEDS_REAUTH'});
    assert.equal(f.ledger.requests.some(x=>x.action==='REGISTER_SESSION'),false);
  }finally{release.resolve();await pending;}
});

test('one signed FENCE commit precedes the local delete and its completed ACK',async t=>{
  const f=await fixture(t),order=[];
  f.ledger.after=wire=>{if(wire.envelope.action==='FENCE'){order.push('L');assert.ok(f.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(f.tokenHash));}};
  const plan=revokePlan(f),apply=plan.apply;plan.apply=()=>{order.push('C');assert.equal(f.ledger.sessions.get(f.ref).state,'REVOKED');return apply();};
  assert.deepEqual(await f.coordinator.mutate(plan),{revoked:1});
  assert.deepEqual(order,['L','C']);assert.equal(f.db.prepare('SELECT state FROM vps_federation_operations').get().state,'COMPLETE');
});

test('lost fence ACK keeps P locally denied and retries stable intent with a fresh transport nonce',async t=>{
  const f=await fixture(t);let lost=false;
  f.ledger.after=(wire,res)=>{if(!lost&&wire.envelope.action==='FENCE'){lost=true;res.destroy();return false;}};
  await assert.rejects(f.coordinator.mutate(revokePlan(f)),{code:'FEDERATION_PENDING'});
  assert.equal(readSession(f.db,f.cookie),null);
  assert.ok(f.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(f.tokenHash));
  f.ledger.after=null;
  const results=await f.coordinator.resumePending();assert.equal(results[0].state,'COMPLETE');
  const calls=f.ledger.requests.filter(x=>x.action==='FENCE');assert.equal(calls.length,2);
  assert.equal(calls[0].operationId,calls[1].operationId);assert.equal(calls[0].digest,calls[1].digest);assert.notEqual(calls[0].nonce,calls[1].nonce);
  assert.equal(f.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(f.tokenHash),undefined);
});

test('a lost RAM grant candidate is fenced on restart but never replayed or reported as applied',async t=>{
  const f=await fixture(t);let down=true;
  f.ledger.before=wire=>{if(down&&wire.envelope.action==='FENCE')throw Object.assign(Error(),{code:'FEDERATION_UNAVAILABLE'});};
  const plan={subject:f.user.id,kind:'ROLE_CHANGE',scope:'PRINCIPAL',pureRevocation:false,authorize:()=>Boolean(readSession(f.db,f.cookie)),
    apply:()=>{f.db.prepare("UPDATE profiles SET role='admin',version=version+1 WHERE id=?").run(f.user.id);return {changed:true};}};
  await assert.rejects(f.coordinator.mutate(plan),{code:'FEDERATION_PENDING'});
  down=false;f.coordinator.close();f.coordinator=new SourceFederationCoordinator({db:f.db,authorities:[f.config],fetchImpl:f.fetchImpl});await f.coordinator.initialize();
  const results=await f.coordinator.resumePending();assert.equal(results[0].state,'REENTRY_REQUIRED');
  assert.equal(f.db.prepare('SELECT role FROM profiles WHERE id=?').get(f.user.id).role,'client');
  assert.equal(f.db.prepare('SELECT outcome FROM vps_federation_operations').get().outcome,'REENTRY_REQUIRED');
  assert.equal(f.ledger.principals.get(f.user.id).state,'FENCED');
  assert.equal(f.db.prepare('SELECT count(*) n FROM vps_sessions WHERE user_id=?').get(f.user.id).n,0);
});

test('post-fence local CAS failure rolls back its write and permanently revokes the old local session',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.coordinator.mutate({subject:f.user.id,kind:'ROLE_CHANGE',scope:'PRINCIPAL',authorize:()=>true,
    apply:()=>{f.db.prepare("UPDATE profiles SET role='admin' WHERE id=?").run(f.user.id);throw Error('synthetic CAS conflict');}}),{code:'REENTRY_REQUIRED'});
  assert.equal(f.db.prepare('SELECT role FROM profiles WHERE id=?').get(f.user.id).role,'client');
  assert.equal(f.ledger.principals.get(f.user.id).state,'FENCED');assert.equal(readSession(f.db,f.cookie),null);
  const op=f.db.prepare('SELECT * FROM vps_federation_operations').get();assert.equal(op.state,'ABORTED_FENCED');
  assert.ok(!JSON.stringify(op).includes(password));assert.ok(!JSON.stringify(op).includes(f.session.token));
});

test('source name edits preserve the security fingerprint but role changes require a coordinator',async t=>{
  const f=await fixture(t),before=f.coordinator.fingerprint(f.user.id,f.config);
  f.db.prepare("UPDATE profiles SET name='Changed display label',version=version+1 WHERE id=?").run(f.user.id);
  assert.equal(f.coordinator.fingerprint(f.user.id,f.config),before);
  assert.throws(()=>f.db.prepare("UPDATE profiles SET role='admin' WHERE id=?").run(f.user.id),/FEDERATION_COORDINATOR_REQUIRED/);
});

test('password rotation fences all old refs before exact new credentials and returns only after epoch activation',async t=>{
  const f=await fixture(t),changed='new-synthetic-password-not-a-secret';
  assert.equal(await rotateCredentials(f.db,{userId:f.user.id,cookieHeader:f.cookie,currentPassword:password,newPassword:changed,confirmed:changed}),true);
  assert.equal(readSession(f.db,f.cookie)===null,true);assert.equal(f.ledger.principals.get(f.user.id).epoch,2);
  assert.equal(createLogin(f.db,{email:f.user.email,password,clientKey:'synthetic-old'}),null);
  const next=await createLogin(f.db,{email:f.user.email,password:changed,clientKey:'synthetic-new'});
  assert.ok(next?.token);assert.notEqual(next.token,f.session.token);
  const ref=sessionReference(f.config.issuer,f.user.id,sha(next.token));
  assert.equal(f.ledger.sessions.get(ref).epoch,2);assert.equal(f.ledger.sessions.get(f.ref).epoch,1);
  assert.equal(f.db.prepare('SELECT state FROM vps_federation_sessions WHERE session_ref=?').get(f.ref).state,'REVOKED');
});

test('first enrolment persists REGISTERING before network and rejects the late register after source logout',async t=>{
  const f=await fixture(t,{enrolled:false}),entered=defer(),release=defer();
  f.coordinator.reauthenticate(f.user.id,f.tokenHash,password);
  f.ledger.before=async wire=>{if(wire.envelope.action==='REGISTER_SESSION'){
    assert.equal(f.db.prepare('SELECT state FROM vps_federation_sessions WHERE session_ref=?').get(f.ref).state,'REGISTERING');
    entered.resolve();await release.promise;
  }};
  const enrolling=f.coordinator.enroll(f.user.id,f.tokenHash,f.config.authorityId);
  // Attach a rejection observer before releasing the independently held request.
  const rejected=assert.rejects(enrolling);
  await entered.promise;
  const original=revokePlan(f);original.authorize=()=>true;
  await f.coordinator.mutate(original);
  release.resolve();await rejected;
  assert.equal(f.ledger.sessions.get(f.ref).state,'REVOKED');assert.equal(readSession(f.db,f.cookie)===null,true);
});

test('dual-session claim keeps code in RAM and source introspection becomes inactive immediately at P',async t=>{
  const f=await fixture(t,{enrolled:false});
  const inspection=await f.coordinator.inspectLink({subject:f.user.id,tokenHash:f.tokenHash,authorityId:f.config.authorityId,code:f.code});
  assert.ok(!JSON.stringify(inspection).includes(f.code));
  const claimed=await f.coordinator.claimLink({subject:f.user.id,tokenHash:f.tokenHash,inspectionId:inspection.inspectionId,password,confirmed:true});
  const p=f.ledger.principals.get(f.user.id);
  const payload={subject:f.user.id,sessionRef:f.ref,epoch:p.epoch,securityFingerprint:p.securityFingerprint,sourcePolicyVersion:1,challengeId:claimed.challengeId,purpose:'LINK_CONFIRM'};
  const probe=()=>{
    const request=makeFederationRequest(f.config,'ERP_TO_SITE','INTROSPECT',payload,{generation:f.ledger.generation});
    const reply=f.coordinator.introspect(request.headers,request.body);
    return verifyFederationResponse(f.config,request.context,reply.status,reply.headers,reply.body);
  };
  assert.equal(probe().active,true);
  assert.equal(f.coordinator.inspections.size,0);
  const stored=JSON.stringify(f.db.prepare('SELECT * FROM vps_federation_claims').all());
  assert.ok(!stored.includes(f.code)&&!stored.includes(password)&&!stored.includes(f.session.token));
  const entered=defer(),release=defer();
  f.ledger.before=async wire=>{if(wire.envelope.action==='LOOKUP_PRINCIPAL'){entered.resolve();await release.promise;}};
  const logout=destroySession(f.db,f.cookie);await entered.promise;
  try{assert.deepEqual(probe(),{active:false});}finally{release.resolve();await logout;}
});

test('a restored pre-enrolment backup reconciles the permanent PG ref tombstone before use',async t=>{
  const f=await fixture(t,{enrolled:false}),backup=join(f.directory,'before-enrolment.sqlite');
  f.db.prepare('VACUUM INTO ?').run(backup);
  f.coordinator.reauthenticate(f.user.id,f.tokenHash,password);await f.coordinator.enroll(f.user.id,f.tokenHash,f.config.authorityId);
  await destroySession(f.db,f.cookie);assert.equal(f.ledger.sessions.get(f.ref).state,'REVOKED');
  f.coordinator.close();f.db.close();
  const restored=join(f.directory,'restored.sqlite');copyFileSync(backup,restored);f.db=openLocalDatabase(restored).db;
  f.coordinator=new SourceFederationCoordinator({db:f.db,authorities:[f.config],fetchImpl:f.fetchImpl});
  await f.coordinator.initialize();
  assert.equal(readSession(f.db,f.cookie)===null,true);
  assert.equal(f.db.prepare('SELECT count(*) n FROM vps_sessions WHERE token_hash=?').get(f.tokenHash).n,0);
  assert.equal(f.db.prepare('SELECT state FROM vps_federation_sessions WHERE session_ref=?').get(f.ref).state,'REVOKED');
});

test('a restored old credential fingerprint stays recovery-required and cannot activate itself',async t=>{
  const f=await fixture(t),backup=join(f.directory,'old-credentials.sqlite');f.db.prepare('VACUUM INTO ?').run(backup);
  const changed='new-source-credential-synthetic';
  await rotateCredentials(f.db,{userId:f.user.id,cookieHeader:f.cookie,currentPassword:password,newPassword:changed,confirmed:changed});
  f.coordinator.close();f.db.close();const restored=join(f.directory,'restored.sqlite');copyFileSync(backup,restored);f.db=openLocalDatabase(restored).db;
  f.coordinator=new SourceFederationCoordinator({db:f.db,authorities:[f.config],fetchImpl:f.fetchImpl});await f.coordinator.initialize();
  assert.equal(f.db.prepare('SELECT state FROM vps_federation_principals WHERE subject=?').get(f.user.id).state,'RECOVERY_REQUIRED');
  await assert.rejects(createLogin(f.db,{email:f.user.email,password,clientKey:'restore-synthetic'}));
  assert.equal(f.ledger.principals.get(f.user.id).epoch,2);
  assert.equal(f.ledger.requests.filter(x=>x.action==='ACTIVATE_EPOCH').length,1);
});

test('asynchronous mutation callbacks cannot carry a SQLite permit across await',async t=>{
  const f=await fixture(t),release=defer();let continuation;
  const pending=f.coordinator.mutate({subject:f.user.id,kind:'ROLE_CHANGE',scope:'PRINCIPAL',authorize:()=>true,
    apply:()=>{continuation=(async()=>{await release.promise;f.db.prepare("UPDATE profiles SET role='admin' WHERE id=?").run(f.user.id);return true;})();return continuation;}});
  await assert.rejects(pending,{code:'REENTRY_REQUIRED'});
  const denied=assert.rejects(continuation,/FEDERATION_COORDINATOR_REQUIRED/);release.resolve();await denied;
  assert.equal(f.db.prepare('SELECT role FROM profiles WHERE id=?').get(f.user.id).role,'client');
});

test('a permitted 160-character profile label fits the strict 120-unit ERP transport without splitting Unicode',async t=>{
  const f=await fixture(t);
  f.db.prepare('UPDATE profiles SET name=? WHERE id=?').run('A'.repeat(160),f.user.id);
  assert.equal(sourceLabel(f.db,f.user.id).length,120);
  f.db.prepare('UPDATE profiles SET name=? WHERE id=?').run('A'.repeat(119)+'😀'+ 'B'.repeat(10),f.user.id);
  const label=sourceLabel(f.db,f.user.id);assert.ok(label.length<=120);assert.ok(!/[\uD800-\uDBFF]$/.test(label));
});

test('all configured companies must commit their fences before a target mutation can finish',async t=>{
  const f=await fixture(t),other=await testAuthority(t,{authorityId:'synthetic-second',companyId:'second-company'});
  const fingerprint=sourceFingerprint(f.db,f.user.id,other.config,{});
  other.ledger.principals.set(f.user.id,{...structuredClone(f.ledger.principals.get(f.user.id)),securityFingerprint:fingerprint});
  other.ledger.sessions.set(f.ref,{...structuredClone(f.ledger.sessions.get(f.ref)),securityFingerprint:fingerprint});
  f.coordinator.close();
  const fetchImpl=(url,options)=>options.headers['x-knaba-federation-authority']===other.config.authorityId?other.fetchImpl(url,options):f.fetchImpl(url,options);
  f.coordinator=new SourceFederationCoordinator({db:f.db,authorities:[f.config,other.config],fetchImpl});await f.coordinator.initialize();
  let available=false;other.ledger.before=wire=>{if(!available&&wire.envelope.action==='FENCE')throw Object.assign(Error(),{code:'FEDERATION_UNAVAILABLE'});};
  await assert.rejects(f.coordinator.mutate(revokePlan(f)),{code:'FEDERATION_PENDING'});
  assert.equal(f.ledger.sessions.get(f.ref).state,'REVOKED');assert.equal(other.ledger.sessions.get(f.ref).state,'ACTIVE');
  assert.equal(f.db.prepare('SELECT count(*) n FROM vps_sessions WHERE token_hash=?').get(f.tokenHash).n,1);
  assert.equal(readSession(f.db,f.cookie)===null,true);
  available=true;const result=await f.coordinator.resumePending();assert.equal(result[0].state,'COMPLETE');
  assert.equal(other.ledger.sessions.get(f.ref).state,'REVOKED');assert.equal(f.db.prepare('SELECT count(*) n FROM vps_sessions WHERE token_hash=?').get(f.tokenHash).n,0);
});

test('expired original grant authorization fences but cannot perform C or activate an epoch',async t=>{
  const f=await fixture(t);let clock=Date.now();f.coordinator.now=()=>clock;
  f.ledger.after=wire=>{if(wire.envelope.action==='FENCE')clock+=300_001;};
  await assert.rejects(f.coordinator.mutate({subject:f.user.id,kind:'ROLE_CHANGE',scope:'PRINCIPAL',authorize:()=>true,
    apply:()=>{f.db.prepare("UPDATE profiles SET role='admin' WHERE id=?").run(f.user.id);return true;}}),{code:'REENTRY_REQUIRED'});
  assert.equal(f.db.prepare('SELECT role FROM profiles WHERE id=?').get(f.user.id).role,'client');
  assert.equal(f.ledger.requests.filter(x=>x.action==='ACTIVATE_EPOCH').length,0);
  assert.equal(f.db.prepare('SELECT state FROM vps_federation_operations').get().state,'ABORTED_FENCED');
});

test('unacknowledged registration recovery reads current state and fences an unknown ref without replaying a grant',async t=>{
  const f=await fixture(t,{enrolled:false});f.coordinator.reauthenticate(f.user.id,f.tokenHash,password);
  let first=true;f.ledger.before=wire=>{if(first&&wire.envelope.action==='REGISTER_SESSION'){first=false;throw Object.assign(Error(),{code:'FEDERATION_UNAVAILABLE'});}};
  await assert.rejects(f.coordinator.enroll(f.user.id,f.tokenHash,f.config.authorityId));
  assert.equal(readSession(f.db,f.cookie)===null,true);
  const recovery=await f.coordinator.resumeRegistrations();assert.equal(recovery[0].state,'REVOKED');
  assert.equal(f.ledger.sessions.get(f.ref).state,'REVOKED');
  assert.equal(f.ledger.requests.filter(x=>x.action==='REGISTER_SESSION').length,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM vps_sessions WHERE user_id=?').get(f.user.id).n,0);
});

for(const target of ['all','others','handle'])test('the existing account '+target+' session action fences exactly the target scope',async t=>{
  const f=await fixture(t),second=await createLogin(f.db,{email:f.user.email,password,clientKey:'second'});
  const secondHash=sha(second.token),secondRef=sessionReference(f.config.issuer,f.user.id,secondHash);
  const secondHandle=readAccountSettings(f.db,{cookieHeader:f.cookie}).sessions.find(row=>!row.current).id;
  const answer=await revokeAccountSessions(f.db,{cookieHeader:f.cookie,target:target==='handle'?secondHandle:target});
  assert.equal(answer.currentRevoked,target==='all');assert.equal(f.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(secondHash),undefined);
  assert.equal(Boolean(readSession(f.db,f.cookie)),target!=='all');
  const fence=f.ledger.requests.filter(row=>row.action==='FENCE').at(-1);
  if(target==='all'){
    assert.equal(fence.payload.scope,'PRINCIPAL');assert.equal(f.ledger.principals.get(f.user.id).minimumEpoch,2);
  }else{
    assert.equal(fence.payload.scope,'SESSION');assert.deepEqual(fence.payload.sessionRefs,[secondRef]);
    assert.equal(f.ledger.sessions.get(f.ref).state,'ACTIVE');assert.equal(f.ledger.sessions.get(secondRef).state,'REVOKED');
  }
});

function localMailer(t){
  const messages=[],mail=createAccountMailer({origin:'https://site.example.test',
    environment:{KNABA_ACCOUNT_EMAIL_ENABLED:'approved',KNABA_ACCOUNT_EMAIL_FROM:'Synthetic <accounts@example.test>',RESEND_API_KEY:'synthetic-no-provider-access',KNABA_ACCOUNT_EMAIL_DAILY_LIMIT:'100'},
    transport:async(_url,options)=>{messages.push(JSON.parse(options.body));return Response.json({id:'synthetic-local-only'});}});
  t.after(()=>mail.close());return {mail,messages};
}
const deliveredToken=messages=>new URL(messages.at(-1).text.match(/https:\/\/\S+/)[0]).hash.slice('#token='.length);

for(const kind of ['password_reset','email_change'])test('actual '+kind+' redemption consumes one capability only after all fences and preserves immutable identity',async t=>{
  const f=await fixture(t),{mail,messages}=localMailer(t),newPassword='new-synthetic-password-2026';
  if(kind==='password_reset')await requestPasswordReset(f.db,{email:f.user.email,clientKey:'synthetic-ip',locale:'uk',mail});
  else await requestEmailChange(f.db,{cookieHeader:f.cookie,email:'changed@example.test',currentPassword:password,locale:'uk',mail});
  await mail.drain();const token=deliveredToken(messages),original=f.db.prepare('SELECT * FROM vps_users WHERE id=?').get(f.user.id);
  let fenced=false;
  f.ledger.before=wire=>{if(wire.envelope.action==='FENCE'){
    assert.equal(readSession(f.db,f.cookie),null);
    assert.deepEqual(f.db.prepare('SELECT * FROM vps_users WHERE id=?').get(f.user.id),original,'C has not run before the authority fence');fenced=true;
  }};
  assert.deepEqual(await consumeAccountToken(f.db,{kind,token,newPassword,confirmed:newPassword}),{changed:true});assert.equal(fenced,true);
  const current=f.db.prepare('SELECT * FROM vps_users WHERE id=?').get(f.user.id),profile=f.db.prepare('SELECT * FROM profiles WHERE id=?').get(f.user.id);
  assert.equal(current.id,original.id);assert.equal(profile.role,'client');assert.equal(profile.status,'approved');assert.equal(readSession(f.db,f.cookie),null);
  assert.equal(f.ledger.principals.get(f.user.id).epoch,2);assert.equal(f.ledger.principals.get(f.user.id).state,'ACTIVE');
  assert.throws(()=>consumeAccountToken(f.db,{kind,token,newPassword,confirmed:newPassword}),{code:'validation'});
  const metadata=JSON.stringify({operations:f.db.prepare('SELECT * FROM vps_federation_operations').all(),fences:f.db.prepare('SELECT * FROM vps_federation_fences').all()});
  for(const secret of [password,newPassword,token,f.session.token,current.salt,current.password_hash])assert.ok(!metadata.includes(secret));
  assert.ok(await createLogin(f.db,{email:current.email,password:kind==='password_reset'?newPassword:password,clientKey:'after-change'}));
});

test('a reset candidate lost after an unknown fence ACK requires re-entry and never reports password change',async t=>{
  const f=await fixture(t),{mail,messages}=localMailer(t),newPassword='lost-synthetic-password-2026';
  await requestPasswordReset(f.db,{email:f.user.email,clientKey:'synthetic-ip',mail});await mail.drain();const token=deliveredToken(messages);
  const before=f.db.prepare('SELECT salt,password_hash FROM vps_users WHERE id=?').get(f.user.id);let drop=true;
  f.ledger.after=(wire,res)=>{if(drop&&wire.envelope.action==='FENCE'){drop=false;res.destroy();return false;}};
  await assert.rejects(consumeAccountToken(f.db,{kind:'password_reset',token,newPassword,confirmed:newPassword}),{code:'FEDERATION_PENDING'});
  const results=await f.coordinator.resumePending();assert.equal(results[0].state,'REENTRY_REQUIRED');
  assert.deepEqual(f.db.prepare('SELECT salt,password_hash FROM vps_users WHERE id=?').get(f.user.id),before);
  assert.equal(f.db.prepare('SELECT outcome FROM vps_federation_operations').get().outcome,'REENTRY_REQUIRED');
  assert.equal(f.db.prepare('SELECT count(*) n FROM vps_account_tokens WHERE user_id=?').get(f.user.id).n,0);
  assert.equal(readSession(f.db,f.cookie),null);assert.equal(f.ledger.requests.filter(row=>row.action==='ACTIVATE_EPOCH').length,0);
  await assert.rejects(createLogin(f.db,{email:f.user.email,password,clientKey:'lost-change-reentry'}),{code:'REENTRY_REQUIRED'});
  // A new bounded capability authorizes a new candidate; it cannot replay the
  // discarded password or treat the previous operation as successfully applied.
  await requestPasswordReset(f.db,{email:f.user.email,clientKey:'synthetic-ip-new',mail});await mail.drain();
  const freshToken=deliveredToken(messages),freshPassword='fresh-synthetic-password-2026';assert.notEqual(freshToken,token);
  assert.deepEqual(await consumeAccountToken(f.db,{kind:'password_reset',token:freshToken,newPassword:freshPassword,confirmed:freshPassword}),{changed:true});
  const outcomes=f.db.prepare('SELECT state,outcome FROM vps_federation_operations ORDER BY created_at').all();
  assert.deepEqual(outcomes.map(row=>({...row})),[{state:'COMPLETE',outcome:'CHANGE_NOT_APPLIED'},{state:'COMPLETE',outcome:'APPLIED'}]);
  assert.equal(await createLogin(f.db,{email:f.user.email,password:newPassword,clientKey:'discarded-password'}),null);
  assert.ok(await createLogin(f.db,{email:f.user.email,password:freshPassword,clientKey:'fresh-password'}));
});

test('OIDC session issuance has no fresh-password exemption for an enrolled target',async t=>{
  const f=await fixture(t),before=f.db.prepare('SELECT * FROM vps_sessions').all();
  await assert.rejects(createOidcSession(f.db,{userId:f.user.id,linkSessionHash:null,expiresAt:Date.now()+300000}),{code:'NEEDS_REAUTH'});
  assert.deepEqual(f.db.prepare('SELECT * FROM vps_sessions').all(),before);
  assert.equal(f.ledger.requests.filter(row=>row.action==='REGISTER_SESSION').length,0);
});

const oidcConfig={synthetic:{issuer:'https://oidc.example.test',clientId:'synthetic-client',clientSecret:'synthetic-local-only',
  authorizationEndpoint:'https://oidc.example.test/authorize',tokenEndpoint:'https://oidc.example.test/token',jwksEndpoint:'https://oidc.example.test/keys'}};
test('pending source denial reaches the OIDC raw live-link-session check before outbound provider traffic',async t=>{
  const f=await fixture(t),entered=defer(),release=defer();
  f.ledger.before=async wire=>{if(wire.envelope.action==='LOOKUP_PRINCIPAL'){entered.resolve();await release.promise;}};
  const operation=f.coordinator.mutate(revokePlan(f));await entered.promise;
  assert.ok(f.db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=?').get(f.tokenHash),'the old local session still exists during P');
  assert.throws(()=>beginOidc(f.db,{provider:'synthetic',config:oidcConfig,origin:'https://site.example.test',privacyAccepted:true,linkUserId:f.user.id,linkSessionToken:f.session.token}),{code:'invalid_state'});
  assert.equal(f.db.prepare('SELECT count(*) n FROM vps_oidc_states').get().n,0);release.resolve();await operation;
});

test('a verified new provider identity cannot attach to a federated password account without the missing fresh-provider contract',async t=>{
  const f=await fixture(t),now=Date.now(),started=beginOidc(f.db,{provider:'synthetic',config:oidcConfig,origin:'https://site.example.test',privacyAccepted:true,linkUserId:f.user.id,linkSessionToken:f.session.token,now});
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),key={...publicKey.export({format:'jwk'}),kid:'fixture',use:'sig',alg:'RS256'};
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:key.kid,typ:'JWT'})).toString('base64url');
  const claims={iss:oidcConfig.synthetic.issuer,aud:oidcConfig.synthetic.clientId,sub:'new-synthetic-provider-subject',email:f.user.email,email_verified:true,
    nonce:new URL(started.redirect).searchParams.get('nonce'),iat:Math.floor(now/1000),exp:Math.floor(now/1000)+300};
  const bytes=header+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url'),jwt=bytes+'.'+sign('RSA-SHA256',Buffer.from(bytes),privateKey).toString('base64url');
  let calls=0;const fetchImpl=async url=>{calls++;if(url===oidcConfig.synthetic.tokenEndpoint)return Response.json({id_token:jwt});if(url===oidcConfig.synthetic.jwksEndpoint)return Response.json({keys:[key]});throw Error('Unexpected synthetic provider target');};
  await assert.rejects(completeOidc(f.db,{provider:'synthetic',config:oidcConfig,origin:'https://site.example.test',code:'synthetic-code',state:started.state,
    cookie:'__Host-knaba-oidc='+started.state,now,fetchImpl}),{code:'link_required'});
  assert.equal(calls,2);assert.equal(f.db.prepare('SELECT count(*) n FROM vps_oidc_links WHERE user_id=?').get(f.user.id).n,0);
  assert.equal(f.db.prepare('SELECT role FROM profiles WHERE id=?').get(f.user.id).role,'client');
});

test('an inspection made before logout cannot claim under a new session for the same immutable user',async t=>{
  const f=await fixture(t),inspection=await f.coordinator.inspectLink({subject:f.user.id,tokenHash:f.tokenHash,authorityId:f.config.authorityId,code:f.code});
  await destroySession(f.db,f.cookie);const replacement=await createLogin(f.db,{email:f.user.email,password,clientKey:'same-user-relogin'});
  await assert.rejects(f.coordinator.claimLink({subject:f.user.id,tokenHash:sha(replacement.token),inspectionId:inspection.inspectionId,password,confirmed:true}),{code:'NEEDS_REAUTH'});
  assert.equal(f.ledger.requests.filter(row=>row.action==='CLAIM').length,0);assert.notEqual(replacement.token,f.session.token);
});

test('an introspection packet that expires while waiting for an actual SQLite writer lock cannot issue a source proof',async t=>{
  const f=await fixture(t,{enrolled:false}),inspection=await f.coordinator.inspectLink({subject:f.user.id,tokenHash:f.tokenHash,authorityId:f.config.authorityId,code:f.code});
  const claim=await f.coordinator.claimLink({subject:f.user.id,tokenHash:f.tokenHash,inspectionId:inspection.inspectionId,password,confirmed:true});
  const principal=f.ledger.principals.get(f.user.id),worker=new Worker(`
    const {parentPort,workerData}=require('node:worker_threads');
    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync(workerData.path);db.exec('BEGIN IMMEDIATE');parentPort.postMessage('locked');
    setTimeout(()=>{db.exec('ROLLBACK');db.close();},1000);
  `,{eval:true,workerData:{path:f.path},execArgv:[]});
  t.after(()=>worker.terminate());const [locked]=await once(worker,'message');assert.equal(locked,'locked');
  const issuedAt=Date.now()-59500;
  const request=makeFederationRequest(f.config,'ERP_TO_SITE','INTROSPECT',{subject:f.user.id,sessionRef:f.ref,epoch:principal.epoch,
    securityFingerprint:principal.securityFingerprint,sourcePolicyVersion:1,challengeId:claim.challengeId,purpose:'LINK_CONFIRM'},
    {generation:f.ledger.generation,now:issuedAt});
  const transaction=f.coordinator.transaction;let atTransaction;
  f.coordinator.transaction=(work,options)=>transaction(()=>{atTransaction=Date.now();return work();},options);
  const reply=f.coordinator.introspect(request.headers,request.body);
  assert.ok(atTransaction-issuedAt>60000,'the real SQLite wait crossed the 60-second request boundary');
  assert.equal(reply.status,401);
  assert.deepEqual(verifyFederationResponse(f.config,request.context,reply.status,reply.headers,reply.body),{ok:false,error:{code:'FEDERATION_AUTH_FAILED'}});
  assert.equal(f.db.prepare('SELECT 1 FROM vps_federation_nonces WHERE nonce_hash=?').get(sha('KNABA-FEDERATION-NONCE-v1\0'+request.context.nonce)),undefined);
  assert.equal(f.db.prepare('SELECT count(*) n FROM vps_federation_inbound_operations').get().n,0);
});
