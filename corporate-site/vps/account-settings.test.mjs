import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createLogin,createSessionForUser,readSession,rotateCredentials} from './auth.mjs';
import {createAccountMailer} from './account-mail.mjs';
import {AccountSettingsError,readAccountSettings,updateAccountSettings,revokeAccountSessions,
  requestPasswordReset,requestEmailChange,consumeAccountToken} from './account-settings.mjs';

const password='synthetic-account-password-2026';
const newPassword='changed-synthetic-password-2026';
const protectedEmails=['owner@example.test','developer@example.test'];
const digest=value=>createHash('sha256').update(value).digest('hex');
const cookie=session=>'__Host-knaba-session='+session.token;
const code=expected=>error=>error instanceof AccountSettingsError&&error.code===expected;
function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'knaba-settings-'));
  const path=join(directory,'synthetic.sqlite');
  const state={path,db:openLocalDatabase(path).db};
  t.after(()=>{state.db.close();rmSync(directory,{recursive:true,force:true});});
  return state;
}
function enroll(db,email='person@example.test',{profile=true,status='approved',role='client'}={}){
  const user=createCredentialsUser(db,email,password);
  if(profile)db.prepare('INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,?,?,?,?,?,1,?)')
    .run(user.id,'Synthetic Person',email,'client',role,status,'2026-10-28','2026-11-08T00:00:00Z','2026-11-08T00:00:00Z','synthetic-initial');
  const session=createSessionForUser(db,user.id);
  return {...user,session,cookieHeader:cookie(session)};
}
function values(version=0,extra={}){
  return {name:'Updated Synthetic User',phone:'+49 30 1234567',company:'Synthetic Company',
    address:'Synthetic Street 12, Berlin',locale:'uk',timeZone:'Europe/Kyiv',version,...extra};
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
  const result=await requestPasswordReset(db,{email:user.email,clientKey:'synthetic-ip',locale:'uk',mail,...extra});
  assert.deepEqual(result,{accepted:true});await mail.drain();return tokenFrom(messages.at(-1));
}

test('settings defaults are read-only and do not invent a portal role or profile',t=>{
  const {db}=fixture(t),user=enroll(db,'owner@example.test',{profile:false});
  const snapshot=readAccountSettings(db,{cookieHeader:user.cookieHeader,protectedEmails});
  assert.equal(snapshot.version,0);assert.equal(snapshot.name,'');assert.equal(snapshot.locale,'de');
  assert.equal(snapshot.timeZone,'Europe/Berlin');assert.equal(snapshot.role,null);assert.equal(snapshot.status,'unregistered');
  assert.equal(snapshot.emailChangeAllowed,false);assert.equal(snapshot.emailChangeBlockedReason,'protected');
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_settings').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM profiles').get().n,0);
});

test('profile settings persist after reopening SQLite and preserve authority, stable ID and all other users',t=>{
  const state=fixture(t),user=enroll(state.db),other=enroll(state.db,'other@example.test',{role:'worker'});
  const untouched=state.db.prepare('SELECT * FROM profiles WHERE id=?').get(other.id);
  const prior=state.db.prepare('SELECT * FROM profiles WHERE id=?').get(user.id);
  assert.deepEqual(updateAccountSettings(state.db,{cookieHeader:user.cookieHeader,values:values()}),{saved:true,version:1});
  state.db.close();state.db=openLocalDatabase(state.path,{allowMigrations:false}).db;
  const saved=readAccountSettings(state.db,{cookieHeader:user.cookieHeader,protectedEmails});
  for(const [name,value] of Object.entries(values(1)))assert.equal(saved[name],value);
  assert.equal(saved.id,user.id);assert.equal(saved.email,user.email);
  const profile=state.db.prepare('SELECT * FROM profiles WHERE id=?').get(user.id);
  for(const key of ['role','status','requested_role','privacy_version','created_at','email'])assert.equal(profile[key],prior[key]);
  assert.equal(profile.name,values().name);assert.equal(profile.version,prior.version+1);
  assert.deepEqual(state.db.prepare('SELECT * FROM profiles WHERE id=?').get(other.id),untouched);
  assert.equal(state.db.prepare('SELECT count(*) AS n FROM portal_audit WHERE action=?').get('account.profile.updated').n,1);
});

test('profile input rejects extra identity fields, invalid timezones, oversized data and control characters without writes',t=>{
  const {db}=fixture(t),user=enroll(db);
  const invalid=[values(0,{role:'owner'}),values(0,{userId:'someone-else'}),values(0,{email:'owner@example.test'}),
    values(-1),values(Number.MAX_SAFE_INTEGER),values(0,{timeZone:'Planet/Unknown'}),values(0,{locale:'fr'}),
    values(0,{name:'A'}),values(0,{phone:'\nsecret'}),values(0,{address:'x'.repeat(501)}),values(0,{company:'a\u0000b'})];
  for(const input of invalid)assert.throws(()=>updateAccountSettings(db,{cookieHeader:user.cookieHeader,values:input}),code('validation'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_settings').get().n,0);
  assert.equal(db.prepare('SELECT name FROM profiles WHERE id=?').get(user.id).name,'Synthetic Person');
});

test('two stale forms cannot overwrite each other and current settings can be updated',t=>{
  const {db}=fixture(t),user=enroll(db);
  updateAccountSettings(db,{cookieHeader:user.cookieHeader,values:values(0,{name:'First Edit'})});
  assert.throws(()=>updateAccountSettings(db,{cookieHeader:user.cookieHeader,values:values(0,{name:'Stale Edit'})}),code('conflict'));
  assert.equal(readAccountSettings(db,{cookieHeader:user.cookieHeader,protectedEmails}).name,'First Edit');
  updateAccountSettings(db,{cookieHeader:user.cookieHeader,values:values(1,{name:'Second Edit'})});
  assert.equal(readAccountSettings(db,{cookieHeader:user.cookieHeader,protectedEmails}).version,2);
});

test('revoked, expired, disabled and suspended sessions cannot read or mutate settings',t=>{
  const {db}=fixture(t);
  assert.throws(()=>readAccountSettings(db,{}),code('unauthenticated'));
  for(const cause of ['revoked','expired','disabled','suspended','email_mismatch']){
    const user=enroll(db,cause+'@example.test');
    if(cause==='revoked')db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(user.id);
    if(cause==='expired')db.prepare('UPDATE vps_sessions SET expires_at=0 WHERE user_id=?').run(user.id);
    if(cause==='disabled')db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(user.id);
    if(cause==='suspended')db.prepare("UPDATE profiles SET status='suspended' WHERE id=?").run(user.id);
    if(cause==='email_mismatch')db.prepare("UPDATE profiles SET email='mismatch@example.test' WHERE id=?").run(user.id);
    assert.throws(()=>readAccountSettings(db,{cookieHeader:user.cookieHeader,protectedEmails}),code('unauthenticated'));
    assert.throws(()=>updateAccountSettings(db,{cookieHeader:user.cookieHeader,values:values()}),code('unauthenticated'));
  }
});

test('session handles disclose no cookie/hash and cannot revoke another user session',t=>{
  const {db}=fixture(t),user=enroll(db),other=enroll(db,'other@example.test');
  const another=createSessionForUser(db,user.id);
  const snapshot=readAccountSettings(db,{cookieHeader:user.cookieHeader,protectedEmails});
  assert.equal(snapshot.sessions.length,2);assert.equal(snapshot.sessions[0].current,true);
  for(const session of [user.session,another]){
    assert.ok(!JSON.stringify(snapshot).includes(session.token));
    assert.ok(!JSON.stringify(snapshot).includes(digest(session.token)));
  }
  const foreign=readAccountSettings(db,{cookieHeader:other.cookieHeader,protectedEmails}).sessions[0].id;
  assert.throws(()=>revokeAccountSessions(db,{cookieHeader:user.cookieHeader,target:foreign}),code('conflict'));
  assert.ok(readSession(db,other.cookieHeader));
  const handle=snapshot.sessions.find(item=>!item.current).id;
  assert.deepEqual(revokeAccountSessions(db,{cookieHeader:user.cookieHeader,target:handle}),{revoked:1,currentRevoked:false});
  assert.equal(readSession(db,cookie(another)),null);assert.ok(readSession(db,user.cookieHeader));
  assert.ok(readSession(db,other.cookieHeader));
});

test('sign out other sessions preserves current, and sign out all only revokes the acting account',t=>{
  const {db}=fixture(t),user=enroll(db),other=enroll(db,'other@example.test');
  createSessionForUser(db,user.id);createSessionForUser(db,user.id);
  assert.deepEqual(revokeAccountSessions(db,{cookieHeader:user.cookieHeader,target:'others'}),{revoked:2,currentRevoked:false});
  assert.ok(readSession(db,user.cookieHeader));
  assert.deepEqual(revokeAccountSessions(db,{cookieHeader:user.cookieHeader,target:'all'}),{revoked:1,currentRevoked:true});
  assert.equal(readSession(db,user.cookieHeader),null);assert.ok(readSession(db,other.cookieHeader));
});

test('recovery returns before provider I/O and has identical public responses for absent and inactive accounts',async t=>{
  const {db}=fixture(t),user=enroll(db),suspended=enroll(db,'suspended@example.test',{status:'suspended'});
  let release,entered=false;
  const pending=new Promise(resolve=>{release=resolve;});
  const {mail}=mailFixture(t,{transport:async()=>{entered=true;await pending;return Response.json({id:'synthetic_receipt_123'});}});
  const result=await requestPasswordReset(db,{email:user.email,clientKey:'one',mail});
  assert.deepEqual(result,{accepted:true});assert.equal(entered,false,'mail starts only after public response can be sent');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,true);
  assert.deepEqual(await requestPasswordReset(db,{email:'absent@example.test',clientKey:'two',mail}),result);
  assert.deepEqual(await requestPasswordReset(db,{email:suspended.email,clientKey:'three',mail}),result);
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,1);
  release();await mail.drain();
});

test('recovery stores only hashed capability and redemption changes password once, revokes all sessions and preserves roles',async t=>{
  const {db}=fixture(t),user=enroll(db),other=enroll(db,'other@example.test');
  const {mail,messages}=mailFixture(t);
  const first=await resetToken(db,user,mail,messages);
  const second=await resetToken(db,user,mail,messages);
  assert.notEqual(first,second);assert.match(first,/^[A-Za-z0-9_-]{43}$/);
  const stored=db.prepare('SELECT * FROM vps_account_tokens').all();
  assert.equal(stored.length,2);assert.ok(!JSON.stringify(stored).includes(first));
  assert.ok(!JSON.stringify(stored).includes(password));assert.ok(stored.some(row=>row.token_hash===digest(first)));
  const url=new URL(messages[0].text.match(/https:\/\/\S+/)[0]);
  assert.equal(url.pathname,'/reset-password/');assert.equal(url.searchParams.get('token'),null);
  assert.deepEqual(consumeAccountToken(db,{kind:'password_reset',token:first,newPassword,confirmed:newPassword}),{changed:true});
  assert.equal(readSession(db,user.cookieHeader),null);assert.ok(readSession(db,other.cookieHeader));
  assert.equal(createLogin(db,{email:user.email,password,clientKey:'old-login'}),null);
  assert.ok(createLogin(db,{email:user.email,password:newPassword,clientKey:'new-login'}));
  assert.deepEqual({...db.prepare('SELECT role,status FROM profiles WHERE id=?').get(user.id)},{role:'client',status:'approved'});
  for(const token of [first,second])assert.throws(()=>consumeAccountToken(db,{kind:'password_reset',token,newPassword:newPassword+'2',confirmed:newPassword+'2'}),code('validation'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens WHERE user_id=?').get(user.id).n,0);
});

test('expired, wrong-kind and unacknowledged capabilities never change credentials',async t=>{
  t.mock.method(Date,'now',()=>1800000000000);
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t);
  const token=await resetToken(db,user,mail,messages);
  assert.throws(()=>consumeAccountToken(db,{kind:'email_change',token,protectedEmails}),code('validation'));
  db.prepare("UPDATE vps_account_tokens SET delivery_state='sending'").run();
  assert.throws(()=>consumeAccountToken(db,{kind:'password_reset',token,newPassword,confirmed:newPassword}),code('validation'));
  db.prepare("UPDATE vps_account_tokens SET delivery_state='accepted'").run();
  t.mock.method(Date,'now',()=>1800001800000);
  assert.throws(()=>consumeAccountToken(db,{kind:'password_reset',token,newPassword,confirmed:newPassword}),code('validation'));
  assert.ok(createLogin(db,{email:user.email,password,clientKey:'still-original'}));
});

test('disabled/re-enabled and suspended/re-approved accounts cannot revive a recovery link',async t=>{
  const {db}=fixture(t),{mail,messages}=mailFixture(t);
  for(const cause of ['disabled','suspended']){
    const user=enroll(db,cause+'@example.test');
    const token=await resetToken(db,user,mail,messages,{clientKey:cause});
    if(cause==='disabled'){
      db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(user.id);
      db.prepare('UPDATE vps_users SET disabled=0 WHERE id=?').run(user.id);
    }else{
      db.prepare("UPDATE profiles SET status='suspended' WHERE id=?").run(user.id);
      db.prepare("UPDATE profiles SET status='approved' WHERE id=?").run(user.id);
    }
    assert.throws(()=>consumeAccountToken(db,{kind:'password_reset',token,newPassword,confirmed:newPassword}),code('validation'));
  }
});

test('password rotation invalidates recovery links and its HTTP session fence rejects revoked sessions',async t=>{
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t);
  const token=await resetToken(db,user,mail,messages);
  assert.equal(rotateCredentials(db,{userId:user.id,cookieHeader:user.cookieHeader,currentPassword:password,newPassword,confirmed:newPassword}),true);
  assert.throws(()=>consumeAccountToken(db,{kind:'password_reset',token,newPassword:newPassword+'2',confirmed:newPassword+'2'}),code('validation'));
  assert.equal(rotateCredentials(db,{userId:user.id,cookieHeader:user.cookieHeader,currentPassword:newPassword,newPassword:newPassword+'2',confirmed:newPassword+'2'}),false);
  assert.ok(createLogin(db,{email:user.email,password:newPassword,clientKey:'rotation-current'}));
});

test('mail capability is invalidated when authority changes before dispatch or during provider I/O',async t=>{
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t);
  await requestPasswordReset(db,{email:user.email,clientKey:'before-dispatch',mail});
  db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(user.id);
  await mail.drain();assert.equal(messages.length,0);
  db.prepare('UPDATE vps_users SET disabled=0 WHERE id=?').run(user.id);
  const second=mailFixture(t,{transport:async(_url,options)=>{
    messages.push(JSON.parse(options.body));
    db.prepare("UPDATE profiles SET status='suspended' WHERE id=?").run(user.id);
    return Response.json({id:'synthetic_receipt_123'});
  }});
  await requestPasswordReset(db,{email:user.email,clientKey:'during-dispatch',mail:second.mail});await second.mail.drain();
  assert.equal(messages.length,1);assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,0);
});

test('capped source cannot exhaust everyone else global request budget',async t=>{
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t);
  for(let i=0;i<140;i++)assert.deepEqual(await requestPasswordReset(db,{email:'missing'+i+'@example.test',clientKey:'capped-source',mail}),{accepted:true});
  await requestPasswordReset(db,{email:user.email,clientKey:'unrelated-source',mail});await mail.drain();
  assert.equal(messages.length,1);assert.equal(messages[0].to[0],user.email);
});

test('per-address and daily delivery limits persist and never disclose whether an account exists',async t=>{
  const {db}=fixture(t),user=enroll(db),other=enroll(db,'other@example.test');
  const {mail,messages}=mailFixture(t,{dailyLimit:1});
  await resetToken(db,user,mail,messages);
  assert.deepEqual(await requestPasswordReset(db,{email:other.email,clientKey:'other-source',mail}),{accepted:true});await mail.drain();
  assert.equal(messages.length,1);
  const more=mailFixture(t);
  for(let i=0;i<5;i++){
    assert.deepEqual(await requestPasswordReset(db,{email:user.email,clientKey:'source-'+i,mail:more.mail}),{accepted:true});await more.mail.drain();
  }
  assert.equal(more.messages.length,2,'initial request plus two more is the per-address cap');
});

test('email change waits for mailbox proof and preserves user ID, role and all unrelated records',async t=>{
  const {db}=fixture(t),user=enroll(db),other=enroll(db,'other@example.test'),{mail,messages}=mailFixture(t);
  const old= db.prepare('SELECT * FROM profiles WHERE id=?').get(user.id);
  assert.deepEqual(await requestEmailChange(db,{cookieHeader:user.cookieHeader,email:'new@example.test',currentPassword:password,locale:'uk',protectedEmails,mail}),{accepted:true});
  assert.equal(db.prepare('SELECT email FROM vps_users WHERE id=?').get(user.id).email,user.email);
  assert.ok(readSession(db,user.cookieHeader));
  const token=tokenFrom(messages[0]);assert.equal(new URL(messages[0].text.match(/https:\/\/\S+/)[0]).pathname,'/account/email/confirm/');
  assert.deepEqual(consumeAccountToken(db,{kind:'email_change',token,protectedEmails}),{changed:true});
  assert.equal(db.prepare('SELECT email FROM vps_users WHERE id=?').get(user.id).email,'new@example.test');
  const profile=db.prepare('SELECT * FROM profiles WHERE id=?').get(user.id);
  assert.equal(profile.email,'new@example.test');assert.equal(profile.id,user.id);
  for(const name of ['name','role','status','requested_role','privacy_version','created_at'])assert.equal(profile[name],old[name]);
  assert.equal(profile.version,old.version+1);assert.equal(readSession(db,user.cookieHeader),null);assert.ok(readSession(db,other.cookieHeader));
  assert.equal(createLogin(db,{email:user.email,password,clientKey:'old-address'}),null);
  assert.ok(createLogin(db,{email:'new@example.test',password,clientKey:'new-address'}));
  assert.throws(()=>consumeAccountToken(db,{kind:'email_change',token,protectedEmails}),code('validation'));
});

test('owner/developer addresses, OIDC identities and existing login addresses are not self-service email targets',async t=>{
  const {db}=fixture(t),user=enroll(db),owner=enroll(db,'owner@example.test',{profile:false}),{mail,messages}=mailFixture(t);
  await assert.rejects(requestEmailChange(db,{cookieHeader:owner.cookieHeader,email:'new-owner@example.test',currentPassword:password,protectedEmails,mail}),code('protected'));
  await assert.rejects(requestEmailChange(db,{cookieHeader:user.cookieHeader,email:'developer@example.test',currentPassword:password,protectedEmails,mail}),code('protected'));
  enroll(db,'taken@example.test');
  await assert.rejects(requestEmailChange(db,{cookieHeader:user.cookieHeader,email:'taken@example.test',currentPassword:password,protectedEmails,mail}),code('conflict'));
  await assert.rejects(requestEmailChange(db,{cookieHeader:user.cookieHeader,email:'new@example.test',currentPassword:'wrong-synthetic-password',protectedEmails,mail}),code('validation'));
  db.prepare('INSERT INTO vps_oidc_links(issuer,subject,user_id,linked_at) VALUES (?,?,?,?)').run('https://issuer.example.test','subject',user.id,'2026-11-08T00:00:00Z');
  const snapshot=readAccountSettings(db,{cookieHeader:user.cookieHeader,protectedEmails});
  assert.equal(snapshot.emailChangeAllowed,false);assert.equal(snapshot.emailChangeBlockedReason,'oidc');
  await assert.rejects(requestEmailChange(db,{cookieHeader:user.cookieHeader,email:'new@example.test',currentPassword:password,protectedEmails,mail}),code('oidc'));
  assert.equal(messages.length,0);assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,0);
});

test('revoking initiating email-change session before confirmation invalidates link despite another login session',async t=>{
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t);
  const second=createSessionForUser(db,user.id);
  await requestEmailChange(db,{cookieHeader:user.cookieHeader,email:'new@example.test',currentPassword:password,protectedEmails,mail});
  const token=tokenFrom(messages[0]);
  db.prepare('DELETE FROM vps_sessions WHERE token_hash=?').run(digest(user.session.token));
  assert.ok(readSession(db,cookie(second)));
  assert.throws(()=>consumeAccountToken(db,{kind:'email_change',token,protectedEmails}),code('validation'));
  assert.equal(db.prepare('SELECT email FROM vps_users WHERE id=?').get(user.id).email,user.email);
});

test('email delivery rechecks the exact session after provider I/O and refuses a newly claimed target',async t=>{
  const {db}=fixture(t),user=enroll(db);
  const {mail}=mailFixture(t,{transport:async()=>{
    db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(user.id);
    return Response.json({id:'synthetic_receipt_123'});
  }});
  await assert.rejects(requestEmailChange(db,{cookieHeader:user.cookieHeader,email:'new@example.test',currentPassword:password,protectedEmails,mail}),code('unauthenticated'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,0);
  const second=mailFixture(t),session=createSessionForUser(db,user.id);
  await requestEmailChange(db,{cookieHeader:cookie(session),email:'new@example.test',currentPassword:password,protectedEmails,mail:second.mail});
  const token=tokenFrom(second.messages[0]);enroll(db,'new@example.test');
  assert.throws(()=>consumeAccountToken(db,{kind:'email_change',token,protectedEmails}),code('conflict'));
  assert.equal(db.prepare('SELECT email FROM vps_users WHERE id=?').get(user.id).email,user.email);
});

test('audit failure rolls back both profile edits and full password-reset transaction',async t=>{
  const {db}=fixture(t),user=enroll(db),{mail,messages}=mailFixture(t);
  const token=await resetToken(db,user,mail,messages);
  const before=db.prepare('SELECT salt,password_hash FROM vps_users WHERE id=?').get(user.id);
  db.exec("CREATE TRIGGER synthetic_abort_audit BEFORE INSERT ON portal_audit BEGIN SELECT RAISE(ABORT,'synthetic audit unavailable'); END");
  assert.throws(()=>updateAccountSettings(db,{cookieHeader:user.cookieHeader,values:values()}),/synthetic audit unavailable/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_settings').get().n,0);
  assert.equal(db.prepare('SELECT name FROM profiles WHERE id=?').get(user.id).name,'Synthetic Person');
  assert.throws(()=>consumeAccountToken(db,{kind:'password_reset',token,newPassword,confirmed:newPassword}),/synthetic audit unavailable/);
  assert.deepEqual(db.prepare('SELECT salt,password_hash FROM vps_users WHERE id=?').get(user.id),before);
  assert.ok(readSession(db,user.cookieHeader));assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,1);
  db.exec('DROP TRIGGER synthetic_abort_audit');
  assert.deepEqual(consumeAccountToken(db,{kind:'password_reset',token,newPassword,confirmed:newPassword}),{changed:true});
});

test('existing database refuses missing account-auth migration before writing and upgrade preserves users/ledger',t=>{
  const state=fixture(t),user=enroll(state.db);
  const ledger=state.db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all();
  state.db.exec("DROP TRIGGER vps_account_tokens_user_revoke;DROP TRIGGER vps_account_tokens_profile_revoke;DROP TRIGGER vps_account_tokens_profile_delete;DROP TABLE vps_account_tokens;DROP TABLE vps_account_settings;DELETE FROM vps_auth_migrations WHERE name='002_account_settings'");
  state.db.close();
  assert.throws(()=>openLocalDatabase(state.path,{allowMigrations:false}),/Pending VPS auth migration account-settings/);
  const before=new DatabaseSync(state.path,{readOnly:true});
  assert.equal(before.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='vps_account_settings'").get().n,0);
  assert.equal(before.prepare('SELECT email FROM vps_users WHERE id=?').get(user.id).email,user.email);before.close();
  state.db=openLocalDatabase(state.path).db;
  assert.deepEqual(state.db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all(),ledger);
  assert.equal(state.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(state.db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.ok(readSession(state.db,user.cookieHeader));
});
