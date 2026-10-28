/**
 * Unverified public access enquiries, not accounts.
 * Role comes ONLY from the owner's separate one-use account invitation and
 * approved profile. This module never provisions a user, credential or session.
 */
import {randomBytes,createHash} from 'node:crypto';
import {normalizeEmail} from './auth.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
export const ACCESS_REQUEST_TTL_DAYS=30;
const ttlMs=ACCESS_REQUEST_TTL_DAYS*24*3600*1000;
const validID=/^[A-Za-z0-9_-]{24}$/;
export class AccessRequestError extends Error{
  constructor(message,code='invalid'){super(message);this.name='AccessRequestError';this.code=code;}
}
function transaction(db,operation){
  db.exec('BEGIN IMMEDIATE');
  try{const value=operation();db.exec('COMMIT');return value;}
  catch(error){db.exec('ROLLBACK');throw error;}
}
function verifiedOwner(db,{ownerId,ownerEmail}){
  if(!ownerId||!ownerEmail)throw new AccessRequestError('Owner required','forbidden');
  const email=normalizeEmail(ownerEmail);
  const owner=db.prepare('SELECT id FROM vps_users WHERE id=? AND email=? AND disabled=0')
    .get(ownerId,email);
  if(!owner)throw new AccessRequestError('Owner required','forbidden');
  return owner;
}
function timeMs(now){
  if(!Number.isSafeInteger(now)||now<1)throw new AccessRequestError('Invalid time');
  return now;
}
function limit(db,key,expiresAt,max){
  return Boolean(db.prepare(
    'INSERT INTO vps_login_limits(key,attempts,expires_at) VALUES (?,1,?)'+
    ' ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 WHERE attempts<? RETURNING attempts'
  ).get(key,expiresAt,max));
}
export function submitAccessRequest(db,{name,email,intent,consented,peer,ownerEmail='',now=Date.now()}){
  timeMs(now);
  if(consented!==true || !['client','worker'].includes(intent))
    throw new AccessRequestError('Consent and valid request type required');
  if(typeof name!=='string'||name.trim().length<2||name.trim().length>160||
     /[<>\u0000-\u001f\u007f]/.test(name))
    throw new AccessRequestError('Invalid name');
  let address;
  try{address=normalizeEmail(email);}catch{throw new AccessRequestError('Invalid email');}
  const safeName=name.trim();
  const peerID=String(peer||'unknown').slice(0,100);
  const bucket=Math.floor(now/(15*60*1000));
  const day=Math.floor(now/(24*3600*1000));
  const sourceKey=hash('access-source:'+peerID+':'+bucket);
  const addressKey=hash('access-email:'+address+':'+day);
  return transaction(db,()=>{
    // This is a shared proxy TCP peer; never trust unvalidated client IP headers.
    // Cap cheap form abuse, but do not infer an individual user from the source.
    const sourceOk=limit(db,sourceKey,(bucket+1)*900,100);
    const addressOk=limit(db,addressKey,(day+1)*86400,3);
    if(!sourceOk||!addressOk)throw new AccessRequestError('Submission rate limited','limited');
    // Bound personal-data retention for old enquiries without touching accounts.
    db.prepare('DELETE FROM vps_access_requests WHERE expires_at<=?').run(now);
    if((ownerEmail&&address===normalizeEmail(ownerEmail)) ||
       db.prepare('SELECT 1 FROM vps_users WHERE email=?').get(address))
      return {accepted:true};
    const existing=db.prepare(
      "SELECT id FROM vps_access_requests WHERE email=? AND status='pending' AND expires_at>? LIMIT 1"
    ).get(address,now);
    if(existing)return {accepted:true};
    const id=randomBytes(18).toString('base64url');
    db.prepare(
      'INSERT INTO vps_access_requests'+
      '(id,name,email,intent,status,privacy_version,created_at,expires_at)'+
      " VALUES (?,?,?,?,'pending',?,?,?)"
    ).run(id,safeName,address,intent,'2026-10-26',now,now+ttlMs);
    db.prepare('INSERT INTO portal_audit(id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
      .run(randomBytes(18).toString('base64url'),'public','access.requested',id,new Date(now).toISOString());
    return {accepted:true};
  });
}
export function listAccessRequests(db,{ownerId,ownerEmail,now=Date.now()}){
  verifiedOwner(db,{ownerId,ownerEmail});
  timeMs(now);
  return db.prepare(
    "SELECT id,name,email,intent,created_at,expires_at FROM vps_access_requests"+
    " WHERE status='pending' AND expires_at>? ORDER BY created_at DESC,id DESC LIMIT 100"
  ).all(now);
}
export function markAccessRequestReviewed(db,{ownerId,ownerEmail,requestId,reviewed,now=Date.now()}){
  timeMs(now);
  if(reviewed!==true||typeof requestId!=='string'||!validID.test(requestId))
    throw new AccessRequestError('Invalid reviewed acknowledgement');
  return transaction(db,()=>{
    verifiedOwner(db,{ownerId,ownerEmail});
    const result=db.prepare(
      "UPDATE vps_access_requests SET status='handled',reviewed_at=?,reviewed_by=?"+
      " WHERE id=? AND status='pending' AND expires_at>?"
    ).run(now,ownerId,requestId,now);
    if(result.changes!==1)throw new AccessRequestError('Request not found');
    db.prepare('INSERT INTO portal_audit(id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
      .run(randomBytes(18).toString('base64url'),ownerId,'access.reviewed',requestId,new Date(now).toISOString());
    return true;
  });
}
