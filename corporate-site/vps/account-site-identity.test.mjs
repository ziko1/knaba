import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createSessionForUser,rotateCredentials} from './auth.mjs';
import {updateAccountSettings,revokeAccountSessions,requestPasswordReset,requestEmailChange,consumeAccountToken,AccountSettingsError} from './account-settings.mjs';
import {createAccountMailer} from './account-mail.mjs';
import {createSiteConsentAuthority} from './site-identity-consent.mjs';
import {parsePeerConfig,FederationError,trustFingerprint,transportFingerprint} from './site-identity-protocol.mjs';

const password='synthetic-current-authority-password';
const replacement='synthetic-new-authority-password';
const peer=parsePeerConfig({companyId:'company-a',issuer:'https://site.example/identity',audience:'knaba-erp:company-a',
  version:1,active:true,erpOrigin:'https://erp.example',siteOrigin:'https://site.example',
  keyId:'knaba-federation-account-fixture',secret:Buffer.alloc(32,19).toString('base64url')});
function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'knaba-account-authority-')),path=join(directory,'state.sqlite');
  const {db}=openLocalDatabase(path),messages=[];
  const mail=createAccountMailer({origin:peer.siteOrigin,environment:{KNABA_ACCOUNT_EMAIL_ENABLED:'approved',KNABA_ACCOUNT_EMAIL_FROM:'test@example.test',RESEND_API_KEY:'synthetic-key',KNABA_ACCOUNT_EMAIL_DAILY_LIMIT:'100'},
    transport:async(_url,options)=>{messages.push(JSON.parse(options.body));return Response.json({id:'synthetic_receipt_123'});}});
  t.after(async()=>{await mail.close();db.close();rmSync(directory,{recursive:true,force:true});});
  const authority=createSiteConsentAuthority(db,{config:()=>peer,developerEmail:'',sessionsEnabled:()=>true});
  const session=user=>({...user,cookie:'__Host-knaba-session='+createSessionForUser(db,user.id).token});
  const user=()=>{
    const entry=createCredentialsUser(db,randomUUID()+'@example.test',password),stamp=new Date().toISOString();
    db.prepare("INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,'client','client','approved','fixture',?,?,1,?)")
      .run(entry.id,'Original Name',entry.email,stamp,stamp,randomUUID());
    return session(entry);
  };
  const proof=user=>{
    const current=authority.current(user.cookie);
    return {companyId:peer.companyId,issuer:peer.issuer,audience:peer.audience,subject:current.subject,
      sessionDigest:current.sessionDigest,profileVersion:current.profileVersion,profileFingerprint:current.profileFingerprint,
      trustFingerprint:trustFingerprint(peer),transportFingerprint:transportFingerprint(peer)};
  };
  return {db,mail,messages,authority,user,session,proof};
}
const inactive=(authority,proof)=>assert.throws(()=>authority.introspectSession(proof),error=>error instanceof FederationError&&error.code==='ACCESS_DENIED');
const values=(name,version=0)=>({name,version,phone:'+49 000000',company:'Personal display company',address:'',locale:'uk',timeZone:'Europe/Kyiv'});
const token=message=>new URL(message.text.match(/https:\/\/\S+/)[0]).hash.slice('#token='.length);

test('personal preferences keep current authority; a profile rename invalidates its prior fingerprint',t=>{
  const f=fixture(t),user=f.user(),other=f.user(),proof=f.proof(user),unrelated=f.proof(other);
  updateAccountSettings(f.db,{cookieHeader:user.cookie,values:values('Original Name')});
  assert.equal(f.authority.introspectSession(proof).active,true);
  updateAccountSettings(f.db,{cookieHeader:user.cookie,values:values('Updated Name',1)});
  inactive(f.authority,proof);
  assert.equal(f.authority.introspectSession(f.proof(user)).active,true);
  assert.equal(f.authority.introspectSession(unrelated).active,true);
});

test('session revocations immediately invalidate only the affected existing F4 proofs',t=>{
  const f=fixture(t),user=f.user(),second=f.session(user),other=f.user();
  const current=f.proof(user),revoked=f.proof(second),unrelated=f.proof(other);
  revokeAccountSessions(f.db,{cookieHeader:user.cookie,target:'others'});
  inactive(f.authority,revoked);assert.equal(f.authority.introspectSession(current).active,true);
  assert.equal(f.authority.introspectSession(unrelated).active,true);
  revokeAccountSessions(f.db,{cookieHeader:user.cookie,target:'all'});
  inactive(f.authority,current);assert.equal(f.authority.introspectSession(unrelated).active,true);
});

test('current-password rotation invalidates all old proofs and fresh login cannot rebind an old digest',t=>{
  const f=fixture(t),user=f.user(),second=f.session(user),other=f.user();
  const old=[f.proof(user),f.proof(second)],unrelated=f.proof(other);
  assert.equal(rotateCredentials(f.db,{userId:user.id,currentPassword:password,newPassword:replacement,confirmed:replacement,cookieHeader:user.cookie}),true);
  for(const proof of old)inactive(f.authority,proof);
  assert.equal(f.authority.introspectSession(f.proof(f.session(user))).active,true);
  for(const proof of old)inactive(f.authority,proof);
  assert.equal(f.authority.introspectSession(unrelated).active,true);
});

test('mailbox-proven password reset and email change invalidate prior F4 session authority',async t=>{
  const f=fixture(t),other=f.user(),unrelated=f.proof(other);
  for(const kind of ['password_reset','email_change']){
    const user=f.user(),proof=f.proof(user);
    if(kind==='password_reset'){
      await requestPasswordReset(f.db,{email:user.email,clientKey:user.id,locale:'uk',mail:f.mail});await f.mail.drain();
    }else await requestEmailChange(f.db,{cookieHeader:user.cookie,email:'changed-'+user.email,currentPassword:password,locale:'uk',mail:f.mail,protectedEmails:[]});
    assert.equal(f.authority.introspectSession(proof).active,true,'request alone does not change authority');
    consumeAccountToken(f.db,{kind,token:token(f.messages.at(-1)),newPassword:replacement,confirmed:replacement});
    inactive(f.authority,proof);
    assert.equal(f.authority.introspectSession(unrelated).active,true);
  }
});

test('an account transaction rejected by audit leaves the existing authority unchanged',t=>{
  const f=fixture(t),user=f.user(),proof=f.proof(user);
  f.db.exec("CREATE TRIGGER synthetic_account_audit_abort BEFORE INSERT ON portal_audit WHEN NEW.action='account.profile.updated' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
  assert.throws(()=>updateAccountSettings(f.db,{cookieHeader:user.cookie,values:values('Rejected Name')}),/synthetic audit failure/);
  assert.equal(f.authority.introspectSession(proof).active,true);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM vps_account_settings').get().n,0);
});

test('deleting and recreating the same profile cannot resurrect a delivered recovery capability',async t=>{
  const f=fixture(t),user=f.user();
  await requestPasswordReset(f.db,{email:user.email,clientKey:user.id,locale:'uk',mail:f.mail});await f.mail.drain();
  const capability=token(f.messages.at(-1)),profile=f.db.prepare('SELECT * FROM profiles WHERE id=?').get(user.id);
  f.db.prepare('DELETE FROM profiles WHERE id=?').run(user.id);
  f.db.prepare('INSERT INTO profiles('+Object.keys(profile).join(',')+') VALUES ('+Object.keys(profile).map(()=>'?').join(',')+')').run(...Object.values(profile));
  assert.throws(()=>consumeAccountToken(f.db,{kind:'password_reset',token:capability,newPassword:replacement,confirmed:replacement}),error=>error instanceof AccountSettingsError&&error.code==='validation');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM vps_account_tokens').get().n,0);
});
