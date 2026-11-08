/** One-use local password recovery. Mail is opt-in; no new identity or ERP grants. */
import {createHash,randomBytes,scryptSync} from 'node:crypto';
import {normalizeEmail,verifyCredentialPassword} from './auth.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const locales=['de','en','pl','lt','ru','uk'];
const tokenLifetime=1800;
const time=()=>Math.floor(Date.now()/1000);
export class AccountRecoveryError extends Error{
  constructor(code){super('Account recovery unavailable: '+code);this.name='AccountRecoveryError';this.code=code;}
}
const fail=code=>{throw new AccountRecoveryError(code);};
function transaction(db,work){
  db.exec('BEGIN IMMEDIATE');
  try{const value=work();db.exec('COMMIT');return value;}
  catch(error){db.exec('ROLLBACK');throw error;}
}
function audit(db,userId,action,actorId=userId){
  db.prepare('INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
    .run(randomBytes(18).toString('base64url'),actorId,action,userId,new Date().toISOString());
}
function profileFor(db,user){
  return db.prepare('SELECT email,role,status,version FROM profiles WHERE id=?').get(user.id)??null;
}
function eligible(user,profile){
  return Boolean(user&&!user.disabled&&(!profile||
    (profile.email.toLowerCase()===user.email&&['pending','approved'].includes(profile.status))));
}
function fingerprint(user,profile){
  // Reapproval or credential rotation must never revive an older capability.
  return hash(JSON.stringify(['account-credential-v1',user.id,user.email,user.salt,user.password_hash,
    profile?.version??null,profile?.role??null,profile?.status??null]));
}
function limit(db,scope,subject,{max,seconds},now=time()){
  const bucket=Math.floor(now/seconds),key='account:'+hash(JSON.stringify([scope,subject,bucket]));
  return Boolean(db.prepare('INSERT INTO vps_login_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 WHERE attempts<? RETURNING attempts')
    .get(key,(bucket+1)*seconds,max));
}
function prune(db){
  const now=time();
  db.prepare('DELETE FROM vps_account_tokens WHERE token_hash IN (SELECT token_hash FROM vps_account_tokens WHERE expires_at<=? LIMIT 100)').run(now);
  db.prepare("DELETE FROM vps_login_limits WHERE key IN (SELECT key FROM vps_login_limits WHERE key LIKE 'account:%' AND expires_at<=? LIMIT 100)").run(now);
}
function readyMailer(mail){
  if(!mail?.enabled||typeof mail.send!=='function'||typeof mail.schedule!=='function'||
    !Number.isSafeInteger(mail.dailyLimit)||mail.dailyLimit<1||mail.dailyLimit>100)fail('unavailable');
}
function validToken(db,tokenHash){
  const token=db.prepare("SELECT * FROM vps_account_tokens WHERE token_hash=? AND kind='password_reset'").get(tokenHash);
  const now=time();
  if(!token||token.expires_at<=now||token.issued_at>now||token.expires_at>token.issued_at+tokenLifetime)return null;
  const user=db.prepare('SELECT id,email,salt,password_hash,disabled FROM vps_users WHERE id=?').get(token.user_id);
  const profile=user?profileFor(db,user):null;
  if(!eligible(user,profile)||user.email!==token.previous_email||token.target_email!==user.email||
    token.session_hash!==null||fingerprint(user,profile)!==token.credential_hash)return null;
  return {token,user};
}
async function deliver(db,capability,{mail,locale}){
  const address=transaction(db,()=>{
    const current=validToken(db,capability.tokenHash);
    if(!current||!mail.enabled||current.token.delivery_state!=='pending'){
      db.prepare('DELETE FROM vps_account_tokens WHERE token_hash=?').run(capability.tokenHash);return null;
    }
    db.prepare("UPDATE vps_account_tokens SET delivery_state='sending' WHERE token_hash=?").run(capability.tokenHash);
    return current.token.target_email;
  });
  if(!address)return {status:'cancelled'};
  let receipt;
  try{
    receipt=await mail.send({kind:'password_reset',email:address,token:capability.token,locale,
      idempotencyKey:'knaba-account-'+capability.tokenHash});
  }catch{receipt={status:'unknown'};}
  return transaction(db,()=>{
    const current=validToken(db,capability.tokenHash);
    if(!current||!mail.enabled){
      db.prepare('DELETE FROM vps_account_tokens WHERE token_hash=?').run(capability.tokenHash);return {status:'cancelled'};
    }
    // Unknown delivery is never retried. A link that actually arrived remains
    // usable; confirmed provider rejection invalidates its capability.
    const status=['accepted','unknown'].includes(receipt?.status)?receipt.status:'failed';
    if(status==='failed')db.prepare('DELETE FROM vps_account_tokens WHERE token_hash=?').run(capability.tokenHash);
    else db.prepare('UPDATE vps_account_tokens SET delivery_state=? WHERE token_hash=?').run(status,capability.tokenHash);
    return {status};
  });
}

/** Identical response for absent, inactive, capped and eligible accounts, before provider I/O. */
export async function requestPasswordReset(db,{email,clientKey,locale='de',mail}={}){
  let address;
  try{address=normalizeEmail(email);}catch{fail('validation');}
  if(!locales.includes(locale)||typeof clientKey!=='string'||!clientKey||clientKey.length>200||
    /[\u0000-\u001f\u007f]/.test(clientKey))fail('validation');
  readyMailer(mail);
  const capability=transaction(db,()=>{
    prune(db);
    // Capped senders cannot consume the shared request or delivery budget.
    if(!limit(db,'reset-source',clientKey,{max:10,seconds:900})||
      !limit(db,'reset-address',address,{max:3,seconds:3600})||
      !limit(db,'reset-global','request',{max:120,seconds:3600}))return null;
    const user=db.prepare('SELECT id,email,salt,password_hash,disabled FROM vps_users WHERE email=?').get(address);
    const profile=user?profileFor(db,user):null;
    if(!eligible(user,profile)||!limit(db,'email-budget','delivery',{max:mail.dailyLimit,seconds:86400}))return null;
    const token=randomBytes(32).toString('base64url'),tokenHash=hash(token),now=time();
    // A new public request cannot cancel another link already received by its owner.
    db.prepare('INSERT INTO vps_account_tokens(token_hash,kind,user_id,previous_email,target_email,credential_hash,session_hash,issued_at,expires_at,delivery_state) VALUES (?,?,?,?,?,?,NULL,?,?,?)')
      .run(tokenHash,'password_reset',user.id,user.email,user.email,fingerprint(user,profile),now,now+tokenLifetime,'pending');
    audit(db,user.id,'credential.reset_requested','system:account-recovery');
    return {token,tokenHash};
  });
  if(capability){
    let scheduled=false;
    try{scheduled=mail.schedule(()=>deliver(db,capability,{mail,locale}))===true;}catch{/* Fail closed with the same public response. */}
    if(!scheduled)transaction(db,()=>db.prepare('DELETE FROM vps_account_tokens WHERE token_hash=?').run(capability.tokenHash));
  }
  return {accepted:true};
}

export function consumePasswordReset(db,{token,newPassword,confirmed}={}){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||typeof newPassword!=='string'||
    newPassword.length<8||newPassword.length>256||newPassword!==confirmed)fail('validation');
  const tokenHash=hash(token),initial=validToken(db,tokenHash);
  if(!initial||!['accepted','unknown'].includes(initial.token.delivery_state))fail('validation');
  if(verifyCredentialPassword(initial.user,newPassword))fail('validation');
  const salt=randomBytes(16).toString('hex');
  // Expensive hashing is outside the write lock. Revalidate current authority,
  // credential binding, delivery state and expiry after acquiring that lock.
  const next=scryptSync(newPassword,Buffer.from(salt,'hex'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex');
  return transaction(db,()=>{
    const current=validToken(db,tokenHash);
    if(!current||current.token.credential_hash!==initial.token.credential_hash||
      !['accepted','unknown'].includes(current.token.delivery_state))fail('validation');
    const {user}=current;
    const changed=db.prepare('UPDATE vps_users SET salt=?,password_hash=? WHERE id=? AND email=? AND disabled=0 AND salt=? AND password_hash=?')
      .run(salt,next,user.id,user.email,user.salt,user.password_hash);
    if(changed.changes!==1)fail('conflict');
    // All site sessions disappear in the same transaction as credential change,
    // capability consumption and audit. Existing F2/F4 online introspection
    // checks these sessions, so the old credentials cannot mint further ERP authority.
    db.prepare('DELETE FROM vps_account_tokens WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(user.id);
    audit(db,user.id,'credential.reset');
    return {changed:true};
  });
}
