/** Self-service VPS accounts. Every mutation is scoped to a current local session or one-use capability. */
import {createHash,randomBytes,scryptSync} from 'node:crypto';
import {normalizeEmail,readSession,verifyCredentialPassword} from './auth.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const locales=['de','en','pl','lt','ru','uk'];
const tokenLifetime=1800;
const maxListedSessions=100;
const accepted=()=>({accepted:true});
const time=()=>Math.floor(Date.now()/1000);
const sessionHandle=tokenHash=>hash('account-session-handle|'+tokenHash);
const secret=()=>randomBytes(32).toString('base64url');
const iso=()=>new Date().toISOString();

export class AccountSettingsError extends Error{
  constructor(code){super('Account action unavailable: '+code);this.name='AccountSettingsError';this.code=code;}
}
const fail=code=>{throw new AccountSettingsError(code);};
function transaction(db,work,{readOnly=false}={}){
  db.exec(readOnly?'BEGIN':'BEGIN IMMEDIATE');
  try{const result=work();db.exec('COMMIT');return result;}
  catch(error){db.exec('ROLLBACK');throw error;}
}
function audit(db,userId,action,actorId=userId){
  db.prepare('INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
    .run(randomBytes(18).toString('base64url'),actorId,action,userId,iso());
}
function profileFor(db,user){
  return db.prepare('SELECT name,email,role,status,version FROM profiles WHERE id=?').get(user.id)??null;
}
function eligible(user,profile){
  return Boolean(user&&!user.disabled&&(!profile||
    (profile.email.toLowerCase()===user.email&&['pending','approved'].includes(profile.status))));
}
function currentAccount(db,cookieHeader){
  const session=readSession(db,cookieHeader);
  if(!session)fail('unauthenticated');
  const user=db.prepare('SELECT id,email,salt,password_hash,disabled FROM vps_users WHERE id=?').get(session.id);
  const profile=profileFor(db,user);
  if(!eligible(user,profile))fail('unauthenticated');
  return {user,profile,session};
}
function normalizedProtected(protectedEmails){
  if(!Array.isArray(protectedEmails))fail('unavailable');
  try{return protectedEmails.filter(value=>value!==''&&value!==null&&value!==undefined).map(normalizeEmail);}
  catch{fail('unavailable');}
}
function emailBlock(db,user,protectedEmails){
  const protectedAddresses=normalizedProtected(protectedEmails);
  if(protectedAddresses.includes(user.email)||
    db.prepare("SELECT 1 FROM vps_staff_grants WHERE user_id=? AND purpose='developer'").get(user.id))return 'protected';
  if(db.prepare('SELECT 1 FROM vps_oidc_links WHERE user_id=?').get(user.id))return 'oidc';
  return null;
}
function fingerprint(user,profile){
  // Profile version binds role/status revocations as well as credentials. A changed
  // profile requires requesting a fresh link; reapproval cannot revive an old one.
  return hash(JSON.stringify(['account-credential-v1',user.id,user.email,user.salt,user.password_hash,
    profile?.version??null,profile?.role??null,profile?.status??null]));
}
function settingsSnapshot(db,account,protectedEmails){
  const {user,profile,session}=account;
  const settings=db.prepare('SELECT name,phone,company,address,locale,time_zone,version FROM vps_account_settings WHERE user_id=?').get(user.id);
  const tokenHash=hash(session.token),now=time();
  const sessions=db.prepare('SELECT token_hash,created_at,expires_at FROM vps_sessions WHERE user_id=? AND expires_at>? ORDER BY (token_hash=?) DESC,created_at DESC,token_hash LIMIT ?')
    .all(user.id,now,tokenHash,maxListedSessions);
  const count=Number(db.prepare('SELECT count(*) AS n FROM vps_sessions WHERE user_id=? AND expires_at>?').get(user.id,now).n);
  const blocked=emailBlock(db,user,protectedEmails);
  return {
    id:user.id,email:user.email,name:profile?.name??settings?.name??'',phone:settings?.phone??'',
    company:settings?.company??'',address:settings?.address??'',locale:settings?.locale??'de',
    timeZone:settings?.time_zone??'Europe/Berlin',version:settings?.version??0,
    role:profile?.role??null,status:profile?.status??'unregistered',
    emailChangeAllowed:blocked===null,emailChangeBlockedReason:blocked,
    sessions:sessions.map(row=>({id:sessionHandle(row.token_hash),createdAt:row.created_at,
      expiresAt:row.expires_at,current:row.token_hash===tokenHash})),
    sessionCount:count,sessionsLimited:count>sessions.length
  };
}

export function readAccountSettings(db,{cookieHeader,protectedEmails=[]}={}){
  return transaction(db,()=>settingsSnapshot(db,currentAccount(db,cookieHeader),protectedEmails),{readOnly:true});
}

function field(value,max,{min=0}={}){
  if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f-\u009f]/.test(value))fail('validation');
  const clean=value.trim();
  if(clean.length<min)fail('validation');
  return clean;
}
function normalizedSettings(values){
  const names=['name','phone','company','address','locale','timeZone','version'];
  if(!values||typeof values!=='object'||Array.isArray(values)||
    Object.keys(values).length!==names.length||names.some(name=>!Object.hasOwn(values,name)))fail('validation');
  if(!Number.isSafeInteger(values.version)||values.version<0||values.version>=Number.MAX_SAFE_INTEGER)fail('validation');
  const result={name:field(values.name,160,{min:2}),phone:field(values.phone,40),
    company:field(values.company,160),address:field(values.address,500),
    locale:field(values.locale,2,{min:2}),timeZone:field(values.timeZone,100,{min:1}),version:values.version};
  if(!locales.includes(result.locale))fail('validation');
  try{new Intl.DateTimeFormat('en',{timeZone:result.timeZone}).format(0);}catch{fail('validation');}
  return result;
}

export function updateAccountSettings(db,{cookieHeader,values}={}){
  const next=normalizedSettings(values);
  return transaction(db,()=>{
    const {user,profile}=currentAccount(db,cookieHeader);
    const previous=db.prepare('SELECT version FROM vps_account_settings WHERE user_id=?').get(user.id);
    if((previous?.version??0)!==next.version)fail('conflict');
    const stamp=iso();
    if(previous){
      const write=db.prepare('UPDATE vps_account_settings SET name=?,phone=?,company=?,address=?,locale=?,time_zone=?,version=version+1,updated_at=? WHERE user_id=? AND version=?')
        .run(next.name,next.phone,next.company,next.address,next.locale,next.timeZone,stamp,user.id,next.version);
      if(write.changes!==1)fail('conflict');
    }else{
      db.prepare('INSERT INTO vps_account_settings(user_id,name,phone,company,address,locale,time_zone,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)')
        .run(user.id,next.name,next.phone,next.company,next.address,next.locale,next.timeZone,stamp,stamp);
    }
    if(profile&&profile.name!==next.name){
      const write=db.prepare('UPDATE profiles SET name=?,updated_at=?,version=version+1,last_mutation=? WHERE id=? AND lower(email)=? AND version=?')
        .run(next.name,stamp,secret(),user.id,user.email,profile.version);
      if(write.changes!==1)fail('conflict');
    }
    audit(db,user.id,'account.profile.updated');
    return {saved:true,version:next.version+1};
  });
}

export function revokeAccountSessions(db,{cookieHeader,target}={}){
  if(typeof target!=='string'||(!['all','others'].includes(target)&&!/^[a-f0-9]{64}$/.test(target)))fail('validation');
  return transaction(db,()=>{
    const {user,session}=currentAccount(db,cookieHeader);
    const currentHash=hash(session.token);
    let changed,currentRevoked=false;
    if(target==='all'){
      changed=db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(user.id);
      currentRevoked=true;
    }else if(target==='others'){
      changed=db.prepare('DELETE FROM vps_sessions WHERE user_id=? AND token_hash<>?').run(user.id,currentHash);
    }else{
      // Only handles of this user's currently displayed sessions are addressable.
      const own=db.prepare('SELECT token_hash FROM vps_sessions WHERE user_id=? AND expires_at>? ORDER BY (token_hash=?) DESC,created_at DESC,token_hash LIMIT ?')
        .all(user.id,time(),currentHash,maxListedSessions);
      const found=own.find(row=>sessionHandle(row.token_hash)===target);
      if(!found)fail('conflict');
      changed=db.prepare('DELETE FROM vps_sessions WHERE user_id=? AND token_hash=?').run(user.id,found.token_hash);
      currentRevoked=found.token_hash===currentHash;
    }
    audit(db,user.id,target==='all'?'account.sessions.revoked_all':'account.sessions.revoked');
    return {revoked:Number(changed.changes),currentRevoked};
  });
}

function limit(db,scope,subject,{max,seconds},now=time()){
  const bucket=Math.floor(now/seconds);
  const key='account:'+hash(JSON.stringify([scope,subject,bucket]));
  return Boolean(db.prepare('INSERT INTO vps_login_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 WHERE attempts<? RETURNING attempts')
    .get(key,(bucket+1)*seconds,max));
}
function prune(db){
  const now=time();
  db.prepare('DELETE FROM vps_account_tokens WHERE token_hash IN (SELECT token_hash FROM vps_account_tokens WHERE expires_at<=? LIMIT 100)').run(now);
  db.prepare("DELETE FROM vps_login_limits WHERE key IN (SELECT key FROM vps_login_limits WHERE key LIKE 'account:%' AND expires_at<=? LIMIT 100)").run(now);
}
function readyMailer(mail,{scheduled=false}={}){
  if(!mail?.enabled||typeof mail.send!=='function'||!Number.isSafeInteger(mail.dailyLimit)||mail.dailyLimit<1||mail.dailyLimit>100||
    (scheduled&&typeof mail.schedule!=='function'))fail('unavailable');
}
function emailAddress(value){try{return normalizeEmail(value);}catch{fail('validation');}}
function language(value){if(!locales.includes(value))fail('validation');return value;}
function credentialToken(db,{kind,user,profile,session=null,targetEmail=user.email}){
  const token=secret(),tokenHash=hash(token),now=time();
  db.prepare('INSERT INTO vps_account_tokens(token_hash,kind,user_id,previous_email,target_email,credential_hash,session_hash,issued_at,expires_at,delivery_state) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(tokenHash,kind,user.id,user.email,targetEmail,fingerprint(user,profile),session?hash(session.token):null,now,now+tokenLifetime,'pending');
  audit(db,user.id,kind==='password_reset'?'credential.reset_requested':'account.email_change.requested',kind==='password_reset'?'system:account-recovery':user.id);
  return {token,tokenHash,kind,userId:user.id};
}
function validToken(db,capability,{protectedEmails=[]}={}){
  const token=db.prepare('SELECT * FROM vps_account_tokens WHERE token_hash=? AND kind=?').get(capability.tokenHash,capability.kind);
  if(!token||token.expires_at<=time()||token.issued_at>time()||token.expires_at>token.issued_at+tokenLifetime)return null;
  const user=db.prepare('SELECT id,email,salt,password_hash,disabled FROM vps_users WHERE id=?').get(token.user_id);
  const profile=user?profileFor(db,user):null;
  if(!eligible(user,profile)||user.email!==token.previous_email||fingerprint(user,profile)!==token.credential_hash)return null;
  if(token.kind==='email_change'){
    if(emailBlock(db,user,protectedEmails)||normalizedProtected(protectedEmails).includes(token.target_email))return null;
    if(!token.session_hash||!db.prepare('SELECT 1 FROM vps_sessions WHERE token_hash=? AND user_id=? AND expires_at>?')
      .get(token.session_hash,user.id,time()))return null;
  }else if(token.target_email!==user.email||token.session_hash!==null)return null;
  return {token,user,profile};
}
async function deliver(db,capability,{mail,locale,protectedEmails=[]}){
  const address=transaction(db,()=>{
    const current=validToken(db,capability,{protectedEmails});
    if(!current||!mail.enabled||current.token.delivery_state!=='pending'){
      db.prepare('DELETE FROM vps_account_tokens WHERE token_hash=?').run(capability.tokenHash);return null;
    }
    db.prepare("UPDATE vps_account_tokens SET delivery_state='sending' WHERE token_hash=?").run(capability.tokenHash);
    return current.token.target_email;
  });
  if(!address)return {status:'cancelled'};
  let receipt;
  try{
    receipt=await mail.send({kind:capability.kind,email:address,token:capability.token,locale,
      idempotencyKey:'knaba-account-'+capability.tokenHash});
  }catch{receipt={status:'unknown'};}
  return transaction(db,()=>{
    const current=validToken(db,capability,{protectedEmails});
    if(!current||!mail.enabled){
      db.prepare('DELETE FROM vps_account_tokens WHERE token_hash=?').run(capability.tokenHash);return {status:'cancelled'};
    }
    const status=['accepted','unknown'].includes(receipt?.status)?receipt.status:'failed';
    if(status==='failed')db.prepare('DELETE FROM vps_account_tokens WHERE token_hash=?').run(capability.tokenHash);
    else db.prepare('UPDATE vps_account_tokens SET delivery_state=? WHERE token_hash=?').run(status,capability.tokenHash);
    return {status};
  });
}

/** The HTTP response is identical for absent, inactive, capped and eligible accounts. */
export async function requestPasswordReset(db,{email,clientKey,locale='de',mail}={}){
  const address=emailAddress(email);language(locale);readyMailer(mail,{scheduled:true});
  if(typeof clientKey!=='string'||!clientKey||clientKey.length>200||/[\u0000-\u001f\u007f]/.test(clientKey))fail('validation');
  const capability=transaction(db,()=>{
    prune(db);
    if(!limit(db,'reset-source',clientKey,{max:10,seconds:900})||
      !limit(db,'reset-address',address,{max:3,seconds:3600})||
      !limit(db,'reset-global','request',{max:120,seconds:3600}))return null;
    const user=db.prepare('SELECT id,email,salt,password_hash,disabled FROM vps_users WHERE email=?').get(address);
    const profile=user?profileFor(db,user):null;
    if(!eligible(user,profile)||!limit(db,'email-budget','delivery',{max:mail.dailyLimit,seconds:86400}))return null;
    // A public request cannot cancel a link that its owner has already received.
    return credentialToken(db,{kind:'password_reset',user,profile});
  });
  if(capability){
    if(!mail.schedule(()=>deliver(db,capability,{mail,locale})))
      transaction(db,()=>db.prepare('DELETE FROM vps_account_tokens WHERE token_hash=?').run(capability.tokenHash));
  }
  return accepted();
}

export async function requestEmailChange(db,{cookieHeader,email,currentPassword,locale='de',protectedEmails=[],mail}={}){
  const address=emailAddress(email);language(locale);readyMailer(mail);
  if(typeof currentPassword!=='string'||currentPassword.length<1||currentPassword.length>256)fail('validation');
  // Persist the attempt limit even if credentials or target validation fail.
  const actor=transaction(db,()=>{
    const account=currentAccount(db,cookieHeader);prune(db);
    if(!limit(db,'email-change',account.user.id,{max:5,seconds:900}))return null;
    return {id:account.user.id,email:account.user.email};
  });
  if(!actor)fail('limited');
  const capability=transaction(db,()=>{
    const {user,profile,session}=currentAccount(db,cookieHeader);
    if(user.id!==actor.id||user.email!==actor.email)fail('unauthenticated');
    const blocked=emailBlock(db,user,protectedEmails);
    if(blocked)fail(blocked);
    if(normalizedProtected(protectedEmails).includes(address))fail('protected');
    if(address===user.email||!verifyCredentialPassword(user,currentPassword))fail('validation');
    if(db.prepare('SELECT 1 FROM vps_users WHERE email=? AND id<>?').get(address,user.id)||
      db.prepare('SELECT 1 FROM profiles WHERE lower(email)=? AND id<>?').get(address,user.id))fail('conflict');
    if(!limit(db,'email-budget','delivery',{max:mail.dailyLimit,seconds:86400}))fail('limited');
    db.prepare("DELETE FROM vps_account_tokens WHERE user_id=? AND kind='email_change'").run(user.id);
    return credentialToken(db,{kind:'email_change',user,profile,session,targetEmail:address});
  });
  const result=await deliver(db,capability,{mail,locale,protectedEmails});
  if(result.status==='cancelled')fail('unauthenticated');
  if(result.status==='failed')fail('unavailable');
  return accepted();
}

export function consumeAccountToken(db,{kind,token,newPassword,confirmed,protectedEmails=[]}={}){
  if(!['password_reset','email_change'].includes(kind)||typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))fail('validation');
  if(kind==='password_reset'&&(typeof newPassword!=='string'||newPassword.length<8||newPassword.length>256||newPassword!==confirmed))fail('validation');
  const capability={kind,tokenHash:hash(token)};
  return transaction(db,()=>{
    const current=validToken(db,capability,{protectedEmails});
    if(!current||!['accepted','unknown'].includes(current.token.delivery_state))fail('validation');
    const {user,profile}=current;
    if(kind==='password_reset'){
      if(verifyCredentialPassword(user,newPassword))fail('validation');
      const salt=randomBytes(16).toString('hex');
      const passwordHash=scryptSync(newPassword,Buffer.from(salt,'hex'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex');
      const changed=db.prepare('UPDATE vps_users SET salt=?,password_hash=? WHERE id=? AND email=? AND disabled=0 AND salt=? AND password_hash=?')
        .run(salt,passwordHash,user.id,user.email,user.salt,user.password_hash);
      if(changed.changes!==1)fail('conflict');
    }else{
      const address=current.token.target_email;
      if(db.prepare('SELECT 1 FROM vps_users WHERE email=? AND id<>?').get(address,user.id)||
        db.prepare('SELECT 1 FROM profiles WHERE lower(email)=? AND id<>?').get(address,user.id))fail('conflict');
      const changed=db.prepare('UPDATE vps_users SET email=? WHERE id=? AND email=? AND disabled=0 AND salt=? AND password_hash=?')
        .run(address,user.id,user.email,user.salt,user.password_hash);
      if(changed.changes!==1)fail('conflict');
      if(profile){
        const changedProfile=db.prepare('UPDATE profiles SET email=?,updated_at=?,version=version+1,last_mutation=? WHERE id=? AND lower(email)=? AND version=?')
          .run(address,iso(),secret(),user.id,user.email,profile.version);
        if(changedProfile.changes!==1)fail('conflict');
      }
    }
    // Capability redemption, credential change, session revocation and audit are
    // one transaction. Every outstanding capability for this user is invalidated.
    db.prepare('DELETE FROM vps_account_tokens WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(user.id);
    audit(db,user.id,kind==='password_reset'?'credential.reset':'account.email.changed');
    return {changed:true};
  });
}
