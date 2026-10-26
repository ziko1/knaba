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
export function createOwner(db,email,password){
  const address=normalizeEmail(email);
  if(typeof password!=='string'||password.length<16||password.length>256)
    throw Error('An owner passphrase must be 16 to 256 characters long.');
  const salt=randomBytes(16).toString('hex');
  const digest=scryptSync(password,Buffer.from(salt,'hex'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex');
  const existing=db.prepare('SELECT id FROM vps_users WHERE lower(email)=?').get(address);
  if(existing)throw Error('Owner already exists. Use a separately reviewed reset procedure.');
  const id=randomBytes(18).toString('base64url');
  db.prepare('INSERT INTO vps_users (id,email,salt,password_hash,created_at) VALUES (?,?,?,?,?)')
    .run(id,address,salt,digest,new Date().toISOString());
  return {id,email:address};
}
function validPassword(row,password){
  const attempt=scryptSync(password,Buffer.from(row.salt,'hex'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return timingSafeEqual(attempt,Buffer.from(row.password_hash,'hex'));
}
export function createLogin(db,{email,password,clientKey}){
  const address=normalizeEmail(email);
  const now=Math.floor(Date.now()/1000);
  const bucket=Math.floor(now/900);
  const key=hash(address+'|'+String(clientKey).slice(0,100)+'|'+bucket);
  const state=db.prepare(
    'INSERT INTO vps_login_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 WHERE attempts<5 RETURNING attempts'
  ).get(key,(bucket+1)*900);
  if(!state)return null;
  const row=db.prepare('SELECT id,email,salt,password_hash,disabled FROM vps_users WHERE email=?').get(address);
  if(!row || row.disabled || !validPassword(row,password))return null;
  return createSession(db,{id:row.id,email:row.email});
}
/** Create a session only after a validated login, verified registration or verified OIDC claim. */
export function createSession(db,{id,email}){
  if(typeof id!=='string'||!id||typeof email!=='string'||!email)throw Error('Verified identity required');
  const now=Math.floor(Date.now()/1000);
  const token=randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO vps_sessions(token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)')
    .run(hash(token),id,now,now+maxAgeSeconds);
  return {token,user:{id,email}};
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
