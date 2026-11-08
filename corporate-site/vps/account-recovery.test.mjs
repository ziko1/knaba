import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createLogin,createSessionForUser,readSession,rotateCredentials,verifyCredentialPassword} from './auth.mjs';
import {createAccountMailer} from './account-mail.mjs';
import {AccountRecoveryError,requestPasswordReset,consumePasswordReset} from './account-recovery.mjs';

const password='synthetic-recovery-original-2026',newPassword='synthetic-recovery-replacement-2026';
const digest=value=>createHash('sha256').update(value).digest('hex');
const cookie=session=>'__Host-knaba-session='+session.token;
const code=expected=>error=>error instanceof AccountRecoveryError&&error.code===expected;
function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'knaba-recovery-')),path=join(directory,'synthetic.sqlite');
  const state={path,db:openLocalDatabase(path).db};
  t.after(()=>{state.db.close();rmSync(directory,{recursive:true,force:true});});
  return state;
}
function enroll(db,email='person@example.test',{profile=true,status='approved',role='client'}={}){
  const user=createCredentialsUser(db,email,password);
  if(profile)db.prepare('INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,?,?,?,?,?,1,?)')
    .run(user.id,'Synthetic Person',email,'client',role,status,'2026-10-28','2026-11-08T00:00:00Z','2026-11-08T00:00:00Z','synthetic-initial');
  return {...user,cookieHeader:cookie(createSessionForUser(db,user.id))};
}
function mailFixture(t,{dailyLimit=100,transport}={}){
  const messages=[];
  const environment={KNABA_ACCOUNT_EMAIL_ENABLED:'approved',KNABA_ACCOUNT_EMAIL_FROM:'KnaBa <accounts@example.test>',
    RESEND_API_KEY:'synthetic-test-key-not-real',KNABA_ACCOUNT_EMAIL_DAILY_LIMIT:String(dailyLimit)};
  const mail=createAccountMailer({environment,origin:'https://knaba.example.test',
    transport:transport??(async(_url,options)=>{messages.push(JSON.parse(options.body));return Response.json({id:'synthetic_receipt_123'});})});
  t.after(()=>mail.close());
  return {mail,messages,environment};
}
function tokenFrom(message){return new URL(message.text.match(/https:\/\/\S+/)[0]).hash.slice('#token='.length);}
async function resetToken(db,user,mail,messages,extra={}){
  assert.deepEqual(await requestPasswordReset(db,{email:user.email,clientKey:'synthetic-ip',locale:'uk',mail,...extra}),{accepted:true});
  await mail.drain();return tokenFrom(messages.at(-1));
}
const redeem=(db,token,extra={})=>consumePasswordReset(db,{token,newPassword,confirmed:newPassword,...extra});

test('recovery responds before provider I/O and is uniform for absent, disabled and suspended accounts',async t=>{
  const {db}=fixture(t),user=enroll(db),suspended=enroll(db,'suspended@example.test',{status:'suspended'}),disabled=enroll(db,'disabled@example.test');
  db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(disabled.id);
  let release,entered=false;
  const pending=new Promise(resolve=>{release=resolve;});
  const {mail}=mailFixture(t,{transport:async()=>{entered=true;await pending;return Response.json({id:'synthetic_receipt_123'});}});
  try{
    const result=await requestPasswordReset(db,{email:user.email,clientKey:'one',mail});
    assert.deepEqual(result,{accepted:true});assert.equal(entered,false);
    await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,true);
    for(const email of ['absent@example.test',suspended.email,disabled.email])
      assert.deepEqual(await requestPasswordReset(db,{email,clientKey:email,mail}),result);
    assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,1);
  }finally{release();await mail.drain();}
});

test('only hashed capabilities persist; one redemption changes the password and revokes all own sessions atomically',async t=>{
  const state=fixture(t),{db}=state,user=enroll(db),other=enroll(db,'other@example.test');
  const secondSession=cookie(createSessionForUser(db,user.id));
  const beforeProfile=db.prepare('SELECT * FROM profiles WHERE id=?').get(user.id);
  const otherCredentials=db.prepare('SELECT * FROM vps_users WHERE id=?').get(other.id);
  const {mail,messages}=mailFixture(t);
  const first=await resetToken(db,user,mail,messages),second=await resetToken(db,user,mail,messages);
  assert.notEqual(first,second);assert.match(first,/^[A-Za-z0-9_-]{43}$/);
  const stored=db.prepare('SELECT * FROM vps_account_tokens').all();
  assert.equal(stored.length,2);assert.ok(!JSON.stringify(stored).includes(first));assert.ok(!JSON.stringify(stored).includes(password));
  assert.ok(stored.some(row=>row.token_hash===digest(first)));
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM portal_audit').all()).includes(first));
  const url=new URL(messages[0].text.match(/https:\/\/\S+/)[0]);assert.equal(url.pathname,'/reset-password/');assert.equal(url.searchParams.get('token'),null);
  // Reopening uses the durable capability; no mail provider call or memory token store is needed.
  state.db.close();state.db=openLocalDatabase(state.path,{allowMigrations:false}).db;
  assert.deepEqual(redeem(state.db,first),{changed:true});
  assert.equal(readSession(state.db,user.cookieHeader),null);assert.equal(readSession(state.db,secondSession),null);assert.ok(readSession(state.db,other.cookieHeader));
  assert.equal(state.db.prepare('SELECT count(*) AS n FROM vps_sessions WHERE user_id=?').get(user.id).n,0,'no automatic sign-in');
  assert.equal(createLogin(state.db,{email:user.email,password,clientKey:'old-login'}),null);
  assert.ok(createLogin(state.db,{email:user.email,password:newPassword,clientKey:'new-login'}));
  assert.deepEqual(state.db.prepare('SELECT * FROM profiles WHERE id=?').get(user.id),beforeProfile);
  assert.deepEqual(state.db.prepare('SELECT * FROM vps_users WHERE id=?').get(other.id),otherCredentials);
  for(const token of [first,second])assert.throws(()=>redeem(state.db,token,{newPassword:newPassword+'2',confirmed:newPassword+'2'}),code('validation'));
  assert.equal(state.db.prepare('SELECT count(*) AS n FROM vps_account_tokens WHERE user_id=?').get(user.id).n,0);
  assert.equal(state.db.prepare("SELECT count(*) AS n FROM portal_audit WHERE action='credential.reset' AND actor_id=? AND entity_id=?").get(user.id,user.id).n,1);
});

test('malformed, pending, sending, expired and wrong-kind capabilities cannot change credentials',async t=>{
  t.mock.method(Date,'now',()=>1800000000000);
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t),token=await resetToken(db,user,mail,messages);
  for(const bad of [null,'',token+'x','!'.repeat(43)])assert.throws(()=>redeem(db,bad),code('validation'));
  for(const delivery of ['pending','sending']){
    db.prepare('UPDATE vps_account_tokens SET delivery_state=?').run(delivery);
    assert.throws(()=>redeem(db,token),code('validation'));
  }
  db.prepare("UPDATE vps_account_tokens SET delivery_state='accepted',kind='email_change',session_hash=?")
    .run(db.prepare('SELECT token_hash FROM vps_sessions WHERE user_id=?').get(user.id).token_hash);
  assert.throws(()=>redeem(db,token),code('validation'));
  db.prepare("UPDATE vps_account_tokens SET kind='password_reset',session_hash=NULL").run();
  t.mock.method(Date,'now',()=>1800001800000);
  assert.throws(()=>redeem(db,token),code('validation'));
  assert.ok(createLogin(db,{email:user.email,password,clientKey:'still-original'}));
});

test('mismatched, oversize, too short and reused passwords leave the capability usable',async t=>{
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t),token=await resetToken(db,user,mail,messages);
  for(const next of ['', 'short', 'x'.repeat(257), password])assert.throws(()=>redeem(db,token,{newPassword:next,confirmed:next}),code('validation'));
  assert.throws(()=>redeem(db,token,{confirmed:'mismatch'}),code('validation'));
  assert.deepEqual(redeem(db,token),{changed:true});
});

test('disabled/re-enabled, suspended/re-approved and role-changed accounts cannot revive a link',async t=>{
  const {db}=fixture(t),{mail,messages}=mailFixture(t);
  for(const cause of ['disabled','suspended','role']){
    const user=enroll(db,cause+'@example.test'),token=await resetToken(db,user,mail,messages,{clientKey:cause});
    if(cause==='disabled'){
      db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(user.id);
      db.prepare('UPDATE vps_users SET disabled=0 WHERE id=?').run(user.id);
    }else if(cause==='suspended'){
      db.prepare("UPDATE profiles SET status='suspended' WHERE id=?").run(user.id);
      db.prepare("UPDATE profiles SET status='approved' WHERE id=?").run(user.id);
    }else{
      db.prepare("UPDATE profiles SET role='worker' WHERE id=?").run(user.id);
      db.prepare("UPDATE profiles SET role='client' WHERE id=?").run(user.id);
    }
    assert.throws(()=>redeem(db,token),code('validation'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens WHERE user_id=?').get(user.id).n,0);
  }
});

test('existing known-password rotation invalidates recovery links without changing its auth contract',async t=>{
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t),token=await resetToken(db,user,mail,messages);
  assert.equal(rotateCredentials(db,{userId:user.id,currentPassword:password,newPassword,confirmed:newPassword}),true);
  assert.throws(()=>redeem(db,token,{newPassword:newPassword+'2',confirmed:newPassword+'2'}),code('validation'));
  assert.ok(createLogin(db,{email:user.email,password:newPassword,clientKey:'rotation-current'}));
});

test('deleting and recreating the identical profile cannot revive its earlier recovery capability',async t=>{
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t),token=await resetToken(db,user,mail,messages);
  const original=db.prepare('SELECT * FROM profiles WHERE id=?').get(user.id),names=Object.keys(original);
  db.prepare('DELETE FROM profiles WHERE id=?').run(user.id);
  db.prepare('INSERT INTO profiles('+names.join(',')+') VALUES ('+names.map(()=>'?').join(',')+')').run(...Object.values(original));
  assert.deepEqual(db.prepare('SELECT * FROM profiles WHERE id=?').get(user.id),original);
  assert.throws(()=>redeem(db,token),code('validation'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens WHERE user_id=?').get(user.id).n,0);
});

test('credential and profile changes before dispatch or during delivery invalidate the mail capability',async t=>{
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t);
  await requestPasswordReset(db,{email:user.email,clientKey:'before-dispatch',mail});
  db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(user.id);await mail.drain();assert.equal(messages.length,0);
  db.prepare('UPDATE vps_users SET disabled=0 WHERE id=?').run(user.id);
  const during=mailFixture(t,{transport:async(_url,options)=>{
    messages.push(JSON.parse(options.body));db.prepare("UPDATE profiles SET status='suspended' WHERE id=?").run(user.id);
    return Response.json({id:'synthetic_receipt_123'});
  }});
  await requestPasswordReset(db,{email:user.email,clientKey:'during-dispatch',mail:during.mail});await during.mail.drain();
  assert.equal(messages.length,1);assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,0);
});

test('unknown delivery is redeemable once; explicit delivery rejection discards the capability without retry',async t=>{
  const {db}=fixture(t),user=enroll(db);let calls=0,token;
  const unknown=mailFixture(t,{transport:async(_url,options)=>{calls++;token=tokenFrom(JSON.parse(options.body));throw Error('synthetic response lost');}});
  await requestPasswordReset(db,{email:user.email,clientKey:'unknown',mail:unknown.mail});await unknown.mail.drain();
  assert.equal(calls,1);assert.equal(db.prepare('SELECT delivery_state FROM vps_account_tokens').get().delivery_state,'unknown');
  assert.deepEqual(redeem(db,token),{changed:true});
  const rejected=mailFixture(t,{transport:async()=>{calls++;return new Response('',{status:403});}});
  await requestPasswordReset(db,{email:user.email,clientKey:'rejected',mail:rejected.mail});await rejected.mail.drain();
  assert.equal(calls,2);assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,0);
});

test('capped source cannot exhaust the global request budget for an unrelated caller',async t=>{
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t);
  for(let i=0;i<140;i++)assert.deepEqual(await requestPasswordReset(db,{email:'missing'+i+'@example.test',clientKey:'capped-source',mail}),{accepted:true});
  await requestPasswordReset(db,{email:user.email,clientKey:'unrelated-source',mail});await mail.drain();
  assert.equal(messages.length,1);assert.equal(messages[0].to[0],user.email);
});

test('per-address and daily delivery limits persist across database and mailer restarts',async t=>{
  const state=fixture(t),user=enroll(state.db),other=enroll(state.db,'other@example.test');
  const {mail,messages}=mailFixture(t,{dailyLimit:1});await resetToken(state.db,user,mail,messages);
  state.db.close();state.db=openLocalDatabase(state.path,{allowMigrations:false}).db;
  const restarted=mailFixture(t,{dailyLimit:1});
  assert.deepEqual(await requestPasswordReset(state.db,{email:other.email,clientKey:'other-source',mail:restarted.mail}),{accepted:true});await restarted.mail.drain();
  assert.equal(restarted.messages.length,0);
  const more=mailFixture(t);
  for(let i=0;i<5;i++){
    assert.deepEqual(await requestPasswordReset(state.db,{email:user.email,clientKey:'source-'+i,mail:more.mail}),{accepted:true});await more.mail.drain();
  }
  assert.equal(more.messages.length,2,'initial request plus two more is the per-address cap');
});

test('disabled or invalid mail configuration cannot issue a token, and rejected schedules do not retain one',async t=>{
  const {db}=fixture(t),user=enroll(db);
  const disabled=createAccountMailer({environment:{},origin:'https://knaba.example.test',transport:()=>{throw Error('must not send');}});
  await assert.rejects(requestPasswordReset(db,{email:user.email,clientKey:'one',mail:disabled}),code('unavailable'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,0);
  const rejected={enabled:true,dailyLimit:100,send:()=>{throw Error('must not send');},schedule:()=>false};
  assert.deepEqual(await requestPasswordReset(db,{email:user.email,clientKey:'one',mail:rejected}),{accepted:true});
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,0);
  assert.deepEqual(await requestPasswordReset(db,{email:user.email,clientKey:'two',mail:{...rejected,schedule:()=>{throw Error('synthetic full queue');}}}),{accepted:true});
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,0);
  await disabled.close();
});

test('audit failure rolls back password change, token consumption and every session revocation',async t=>{
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t),token=await resetToken(db,user,mail,messages);
  const before=db.prepare('SELECT salt,password_hash FROM vps_users WHERE id=?').get(user.id);
  db.exec("CREATE TRIGGER synthetic_abort_audit BEFORE INSERT ON portal_audit BEGIN SELECT RAISE(ABORT,'synthetic audit unavailable'); END");
  assert.throws(()=>redeem(db,token),/synthetic audit unavailable/);
  assert.deepEqual(db.prepare('SELECT salt,password_hash FROM vps_users WHERE id=?').get(user.id),before);
  assert.ok(readSession(db,user.cookieHeader));assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,1);
  db.exec('DROP TRIGGER synthetic_abort_audit');assert.deepEqual(redeem(db,token),{changed:true});
});

test('pending and credentials-only accounts recover without approval, role creation or identity reassignment',async t=>{
  const {db}=fixture(t),{mail,messages}=mailFixture(t);
  for(const [email,options] of [['pending@example.test',{status:'pending',role:null}],['owner@example.test',{profile:false}]]){
    const user=enroll(db,email,options),before=db.prepare('SELECT * FROM profiles WHERE id=?').get(user.id);
    const token=await resetToken(db,user,mail,messages,{clientKey:email});assert.deepEqual(redeem(db,token),{changed:true});
    assert.equal(db.prepare('SELECT email FROM vps_users WHERE id=?').get(user.id).email,email);
    assert.deepEqual(db.prepare('SELECT * FROM profiles WHERE id=?').get(user.id),before);
  }
});

test('credential verifier rejects invalid input and malformed stored hashes without throwing or expensive hashing',()=>{
  for(const [row,candidate] of [[null,'password'],[{salt:'bad',password_hash:'bad'},'password'],[{},null],[{},'x'.repeat(257)]])
    assert.equal(verifyCredentialPassword(row,candidate),false);
});
