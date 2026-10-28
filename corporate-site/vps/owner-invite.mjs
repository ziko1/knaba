/**
 * First-owner verified-email invitation. The emailed value is a single-use,
 * 256-bit bearer capability, NOT a reusable login password or session.
 *
 * No table can grant owner privileges until the recipient opens the invitation,
 * attests authorization and sets a separate secret over TLS.
 */
import {randomBytes,createHash} from 'node:crypto';
import {createOwner,normalizeEmail} from './auth.mjs';

const INVITE_LIFETIME_MS=2*60*60*1000;
const tokenFormat=/^[A-Za-z0-9_-]{43}$/;
const digest=value=>createHash('sha256').update(value).digest('hex');

export class OwnerInviteError extends Error{
  constructor(message){super(message);this.name='OwnerInviteError';}
}

const transaction=(db,operation)=>{
  db.exec('BEGIN IMMEDIATE');
  try {
    const result=operation();
    db.exec('COMMIT');
    return result;
  }catch(error){
    db.exec('ROLLBACK');
    throw error;
  }
};

export function issueOwnerInvite(db,email,{now=Date.now()}={}){
  const address=normalizeEmail(email);
  if(!Number.isSafeInteger(now)||now<1)throw new OwnerInviteError('Invalid invitation clock.');
  const owner=db.prepare('SELECT id FROM vps_users WHERE email=?').get(address);
  if(owner)throw new OwnerInviteError('Owner already exists; use a separately authorized recovery flow.');
  const token=randomBytes(32).toString('base64url');
  const issuedAt=now;
  const expiresAt=now+INVITE_LIFETIME_MS;
  transaction(db,()=>{
    // Exact address scope; re-issuing invalidates an older lost/stale email.
    db.prepare('UPDATE vps_owner_invites SET used_at=? WHERE email=? AND used_at IS NULL')
      .run(now,address);
    db.prepare('INSERT INTO vps_owner_invites(token_hash,email,issued_at,expires_at,used_at) VALUES (?,?,?,?,NULL)')
      .run(digest(token),address,issuedAt,expiresAt);
  });
  return {email:address,token,expiresAt};
}

export function activateOwnerInvite(db,{token,email,password,confirmed,attested,purpose='owner',now=Date.now()}){
  const address=normalizeEmail(email);
  if(!['owner','developer'].includes(purpose))throw new OwnerInviteError('Unsupported operator purpose.');
  if(!Number.isSafeInteger(now)||now<1)throw new OwnerInviteError('Invalid activation time.');
  if(attested!==true)throw new OwnerInviteError('Business owner authorization must be confirmed.');
  if(typeof password!=='string'||password.length<8||password.length>256)
    throw new OwnerInviteError('Password must contain 8 to 256 characters.');
  if(password!==confirmed)throw new OwnerInviteError('Password confirmation does not match.');
  if(typeof token!=='string'||!tokenFormat.test(token))
    throw new OwnerInviteError('Invalid or expired invitation.');
  return transaction(db,()=>{
    const entry=db.prepare('SELECT email,expires_at,used_at FROM vps_owner_invites WHERE token_hash=?')
      .get(digest(token));
    if(!entry||entry.email.toLowerCase()!==address||entry.used_at!==null||entry.expires_at<=now)
      throw new OwnerInviteError('Invalid or expired invitation.');
    const owner=createOwner(db,address,password);
    if(purpose==='developer'){
      db.prepare("INSERT INTO vps_staff_grants (user_id,email,purpose,active,enrolled_at) VALUES (?,?,'developer',1,?)")
        .run(owner.id,address,new Date(now).toISOString());
      db.prepare('INSERT INTO portal_audit(id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
        .run(randomBytes(18).toString('base64url'),owner.id,'developer.enrolled',owner.id,new Date(now).toISOString());
    }
    const updated=db.prepare('UPDATE vps_owner_invites SET used_at=? WHERE token_hash=? AND used_at IS NULL')
      .run(now,digest(token));
    if(updated.changes!==1)throw new OwnerInviteError('Invitation already used.');
    return owner;
  });
}
