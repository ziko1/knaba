import { randomBytes,createHash,scryptSync,timingSafeEqual } from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const maxAgeSeconds=12*3600;
const cookieName='__Host-knaba-session';
export const emailFormat=/^[a-z0-9.!#$%&'*+/=?^_{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
export function normalizeEmail(input){
  const s=typeof input==='string'?input.trim().toLowerCase():'';
  if(s.length>320||!emailFormat.test(s))throw Error('Invalid owner email.');
  return s;
}
export function createCredentialsUser(db,email,password){
  const address=normalizeEmail(email);
  if(typeof password!=='string'||password.length<8||password.length>256)
    throw Error('A passphrase must be 8 to 256 characters long.');
  const existing=db.prepare('SELECT id FROM vps_users WHERE lower(email)=?').get(address);
  if(existing)throw Error('Account already exists.');
  const salt=randomBytes(16).toString('hex');
  const digest=scryptSync(password,Buffer.from(salt,'hex'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex');
  const id=randomBytes(18).toString('base64url');
  db.prepare('INSERT INTO vps_users (id,email,salt,password_hash,created_at) VALUES (?,?,?,?,?)')
    .run(id,address,salt,digest,new Date().toISOString());
  return {id,email:address};
}
export function createOwner(db,email,password){
  return createCredentialsUser(db,email,password);
}
function validPassword(row,password){
  const attempt=scryptSync(password,Buffer.from(row.salt,'hex'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return timingSafeEqual(attempt,Buffer.from(row.password_hash,'hex'));
}
export function createLogin(db,{email,password,clientKey}){
  const address=normalizeEmail(email);
  const now=Math.floor(Date.now()/1000);
  const bucket=Math.floor(now/900);
  const remote=String(clientKey).slice(0,100);
  // Stop rotating email addresses around the per-identity five-attempt cap.
  // The server supplies its validated client-IP resolution. An untrusted peer
  // or invalid proxy header falls back to the socket address; limits stay on.
  const sourceKey=hash('source|'+remote+'|'+bucket);
  const sourceState=db.prepare(
    'INSERT INTO vps_login_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 WHERE attempts<60 RETURNING attempts'
  ).get(sourceKey,(bucket+1)*900);
  if(!sourceState)return null;
  const key=hash(address+'|'+remote+'|'+bucket);
  const state=db.prepare(
    'INSERT INTO vps_login_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 WHERE attempts<5 RETURNING attempts'
  ).get(key,(bucket+1)*900);
  if(!state)return null;
  const row=db.prepare('SELECT id,email,salt,password_hash,disabled FROM vps_users WHERE email=?').get(address);
  if(!row || row.disabled || !validPassword(row,password))return null;
  return createSessionForUser(db,row.id);
}
/** Only the server may mint a session for an already-verified user ID. */
export function createSessionForUser(db,userId){
  const row=db.prepare('SELECT id,email,disabled FROM vps_users WHERE id=?').get(userId);
  if(!row||row.disabled)throw Error('Inactive account');
  const token=randomBytes(32).toString('base64url'),now=Math.floor(Date.now()/1000);
  db.prepare('INSERT INTO vps_sessions(token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)')
    .run(hash(token),row.id,now,now+maxAgeSeconds);
  return {token,user:{id:row.id,email:row.email}};
}
export function readSession(db,cookieHeader){
  if(typeof cookieHeader!=='string'||cookieHeader.length>4096)return null;
  const piece=cookieHeader.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='));
  const token=piece?.slice(cookieName.length+1);
  if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  const user=db.prepare('SELECT u.id,u.email,u.disabled,s.expires_at FROM vps_sessions s JOIN vps_users u ON u.id=s.user_id WHERE s.token_hash=?')
    .get(hash(token));
  if(!user||user.disabled||user.expires_at<=Math.floor(Date.now()/1000))return null;
  return {id:user.id,email:user.email,token};
}
export function destroySession(db,cookieHeader){
  const auth=readSession(db,cookieHeader);
  if(auth)db.prepare('DELETE FROM vps_sessions WHERE token_hash=?').run(hash(auth.token));
}
export function sessionCookie(token,{secure=true}={}){
  return cookieName+'='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+maxAgeSeconds+(secure?'; Secure':'');
}
export function expiredCookie({secure=true}={}){
  return cookieName+'=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+(secure?'; Secure':'');
}

/** Rotate only a logged-in user's own secret; revoke every prior session. */
export function rotateCredentials(db,{userId,currentPassword,newPassword,confirmed}){
  if(typeof userId!=='string'||!userId||
     typeof currentPassword!=='string'||currentPassword.length>256||
     typeof newPassword!=='string'||newPassword.length<8||newPassword.length>256||
     newPassword!==confirmed||newPassword===currentPassword)return false;
  const now=Math.floor(Date.now()/1000),bucket=Math.floor(now/900);
  const key=hash('change-credential|'+userId+'|'+bucket);
  const limit=db.prepare(
    'INSERT INTO vps_login_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 WHERE attempts<5 RETURNING attempts'
  ).get(key,(bucket+1)*900);
  if(!limit)return false;
  const row=db.prepare('SELECT salt,password_hash,disabled FROM vps_users WHERE id=?').get(userId);
  if(!row||row.disabled||!validPassword(row,currentPassword))return false;
  const salt=randomBytes(16).toString('hex');
  const next=scryptSync(newPassword,Buffer.from(salt,'hex'),64,
    {N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex');
  db.exec('BEGIN IMMEDIATE');
  try{
    const saved=db.prepare(
      'UPDATE vps_users SET salt=?,password_hash=? WHERE id=? AND disabled=0 AND salt=? AND password_hash=?'
    ).run(salt,next,userId,row.salt,row.password_hash);
    if(saved.changes!==1){db.exec('ROLLBACK');return false;}
    db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(userId);
    db.prepare('INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
      .run(randomBytes(18).toString('base64url'),userId,'credential.rotated',
        userId,new Date().toISOString());
    db.exec('COMMIT');
    return true;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
