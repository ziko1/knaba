/**
 * Source-only, human-delivered account onboarding for KNABA VPS.
 * Owner may issue a one-use email/role-scoped capability; issuance does not
 * prove mailbox ownership or grant operational role permissions.
 * Client and worker profile approval stays in the existing portal.
 */
import {randomBytes,createHash} from 'node:crypto';
import {normalizeEmail,createCredentialsUser} from './auth.mjs';
import {hasOwnerAuthority,isProtectedStaffAddress} from './admin-access.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const tokenPattern=/^[A-Za-z0-9_-]{43}$/;
const inviteTtlMs=7*24*60*60*1000;
const dailyLimit=20;
export class AccountInviteError extends Error {
  constructor(message){super(message);this.name='AccountInviteError';}
}
function validateTime(now){
  if(!Number.isSafeInteger(now)||now<=0)throw new AccountInviteError('Invalid request time');
}
function transaction(db,operation){
  db.exec('BEGIN IMMEDIATE');
  try {const value=operation();db.exec('COMMIT');return value;}
  catch(error){db.exec('ROLLBACK');throw error;}
}
function validEmail(input){
  try{return normalizeEmail(input);}
  catch{throw new AccountInviteError('Invalid email');}
}
function ownerIdentity(db,issuerId,ownerEmail,developerEmail=''){
  if(typeof issuerId!=='string'||!issuerId)throw new AccountInviteError('Owner session required');
  const expected=validEmail(ownerEmail);
  if(!hasOwnerAuthority(db,{userId:issuerId,ownerEmail:expected,developerEmail}))
    throw new AccountInviteError('Owner session required');
  return db.prepare('SELECT id,email FROM vps_users WHERE id=?').get(issuerId);
}
export function issueAccountInvite(db,{issuerId,ownerEmail,developerEmail='',email,role,identityVerified=false,now=Date.now()}){
  validateTime(now);
  if(!['client','worker','partner'].includes(role))throw new AccountInviteError('Unsupported account role');
  if(identityVerified!==true)throw new AccountInviteError('Owner identity verification attestation required');
  const address=validEmail(email);
  const expected=validEmail(ownerEmail);
  if(isProtectedStaffAddress(address,expected,developerEmail))throw new AccountInviteError('Operator account is managed separately');
  const token=randomBytes(32).toString('base64url');
  const expiresAt=now+inviteTtlMs;
  transaction(db,()=>{
    ownerIdentity(db,issuerId,expected,developerEmail);
    if(db.prepare('SELECT 1 FROM vps_users WHERE email=?').get(address))
      throw new AccountInviteError('Account already exists');
    const today=db.prepare('SELECT count(*) AS total FROM vps_account_invites WHERE issued_by=? AND issued_at>?')
      .get(issuerId,now-24*60*60*1000).total;
    if(today>=dailyLimit)throw new AccountInviteError('Invitation daily limit reached');
    // Rotation invalidates a previously lost token before creating another.
    db.prepare('UPDATE vps_account_invites SET used_at=? WHERE email=? AND used_at IS NULL')
      .run(now,address);
    const tokenHash=hash(token);
    db.prepare('INSERT INTO vps_account_invites (token_hash,email,requested_role,issued_by,issued_at,expires_at) VALUES (?,?,?,?,?,?)')
      .run(tokenHash,address,role,issuerId,now,expiresAt);
    // Audit only the owner's assertion. It is not proof of mailbox or identity ownership.
    // The digest cannot be exchanged for the invitation bearer capability.
    db.prepare('INSERT INTO portal_audit(id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
      .run(randomBytes(18).toString('base64url'),issuerId,
        'account.invite.owner-attested',tokenHash,new Date(now).toISOString());
  });
  return {token,email:address,role,expiresAt};
}
export function acceptAccountInvite(db,{token,email,name,password,confirmed,privacyAccepted,ownerEmail,developerEmail='',now=Date.now()}){
  validateTime(now);
  const address=validEmail(email);
  const expected=validEmail(ownerEmail);
  if(isProtectedStaffAddress(address,expected,developerEmail))throw new AccountInviteError('Protected operator identity');
  if(typeof token!=='string'||!tokenPattern.test(token))throw new AccountInviteError('Invalid or expired invitation');
  if(typeof name!=='string'||name.trim().length<2||name.trim().length>160||
    /[\u0000-\u001f\u007f<>]/.test(name))throw new AccountInviteError('Invalid full name');
  if(privacyAccepted!==true)throw new AccountInviteError('Privacy confirmation is required');
  if(typeof password!=='string'||password.length<8||password.length>256||
     password!==confirmed)throw new AccountInviteError('Invalid password confirmation');
  return transaction(db,()=>{
    const invite=db.prepare('SELECT email,requested_role,issued_by,expires_at,used_at FROM vps_account_invites WHERE token_hash=?')
      .get(hash(token));
    if(!invite||invite.used_at!==null||invite.expires_at<=now||invite.email!==address)
      throw new AccountInviteError('Invalid or expired invitation');
    ownerIdentity(db,invite.issued_by,expected,developerEmail);
    if(!['client','worker','partner'].includes(invite.requested_role))
      throw new AccountInviteError('Invalid account role');
    if(db.prepare('SELECT 1 FROM vps_users WHERE email=?').get(address))
      throw new AccountInviteError('Account already exists');
    const user=createCredentialsUser(db,address,password);
    const time=new Date(now).toISOString();
    const mutation=randomBytes(18).toString('base64url');
    db.prepare('INSERT INTO profiles (id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,NULL,?,?,?,?,1,?)')
      .run(user.id,name.trim(),address,invite.requested_role,'pending','2026-10-28',time,time,mutation);
    db.prepare('INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
      .run(randomBytes(18).toString('base64url'),user.id,'profile.invited',user.id,time);
    const consumed=db.prepare('UPDATE vps_account_invites SET used_at=?,used_by=? WHERE token_hash=? AND used_at IS NULL')
      .run(now,user.id,hash(token));
    if(consumed.changes!==1)throw new AccountInviteError('Invalid or expired invitation');
    return {...user,role:invite.requested_role,status:'pending'};
  });
}

/** Revoke only this owner's still-open invitation for an exact recipient. */
export function revokeAccountInvite(db,{issuerId,ownerEmail,developerEmail='',email,now=Date.now()}){
  validateTime(now);
  const address=validEmail(email);
  return transaction(db,()=>{
    ownerIdentity(db,issuerId,ownerEmail,developerEmail);
    const pending=db.prepare(
      'SELECT token_hash FROM vps_account_invites WHERE email=? AND issued_by=? AND used_at IS NULL AND issued_at<=? AND expires_at>? ORDER BY issued_at DESC LIMIT 1'
    ).get(address,issuerId,now,now);
    if(!pending)return false;
    const changed=db.prepare('UPDATE vps_account_invites SET used_at=? WHERE token_hash=? AND used_at IS NULL')
      .run(now,pending.token_hash);
    if(changed.changes!==1)return false;
    db.prepare('INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
      .run(randomBytes(18).toString('base64url'),issuerId,'account.invite.revoked',
        pending.token_hash,new Date(now).toISOString());
    return true;
  });
}
