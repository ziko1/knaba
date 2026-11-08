import {createHash} from 'node:crypto';
import {canonicalJson,securityFingerprint} from '../../erp/packages/integrations/site-federation-protocol.mjs';
import {authenticatedRole} from './role-destination.mjs';

const email=value=>typeof value==='string'?value.trim().toLowerCase():'';
export function sourceSecuritySnapshot(db,subject,config,ownerPolicy){
  const user=db.prepare('SELECT id,email,salt,password_hash,disabled FROM vps_users WHERE id=?').get(subject);
  if(!user)return null;
  const p=db.prepare('SELECT id,email,role,status FROM profiles WHERE id=?').get(subject);
  const grant=db.prepare('SELECT email,purpose,active FROM vps_staff_grants WHERE user_id=?').get(subject);
  return {v:1,issuer:config.issuer,subject,policyVersion:config.policyVersion,
    credential:{salt:user.salt,passwordHash:user.password_hash,disabled:Boolean(user.disabled)},email:email(user.email),
    profile:p?{id:p.id,email:email(p.email),role:p.role??null,status:p.status}:null,
    staffGrant:grant?{email:email(grant.email),purpose:grant.purpose,active:Boolean(grant.active)}:null,
    ownerPolicy:{ownerUserId:ownerPolicy.ownerUserId||null,ownerEmail:email(ownerPolicy.ownerEmail),developerEmail:email(ownerPolicy.developerEmail)},
    oidcLinks:db.prepare('SELECT issuer,subject,user_id AS userId FROM vps_oidc_links WHERE user_id=? ORDER BY issuer,subject,user_id').all(subject).map(row=>({...row}))};
}
export function sourceFingerprint(db,subject,config,ownerPolicy){
  const snapshot=sourceSecuritySnapshot(db,subject,config,ownerPolicy);
  return snapshot?securityFingerprint(snapshot):null;
}
export function sourceMutationWitness(db,subject,ownerPolicy){
  // CAS includes profile version; federation authority deliberately excludes display-name versions.
  const snapshot=sourceSecuritySnapshot(db,subject,{issuer:'https://local.invalid',policyVersion:1},ownerPolicy);
  const version=db.prepare('SELECT version FROM profiles WHERE id=?').get(subject)?.version??null;
  return createHash('sha256').update('KNABA-SOURCE-MUTATION-v1\0'+canonicalJson({snapshot,version})).digest('hex');
}
export function sourceEligible(db,subject,ownerPolicy){
  const user=db.prepare('SELECT id,email,salt,password_hash,disabled FROM vps_users WHERE id=?').get(subject);
  if(!user||user.disabled||!/^[a-f0-9]{32}$/.test(user.salt)||!/^[a-f0-9]{128}$/.test(user.password_hash))return false;
  if(email(user.email)===email(ownerPolicy.ownerEmail)&&(!ownerPolicy.ownerUserId||user.id!==ownerPolicy.ownerUserId))return false;
  return !['anonymous','pending','suspended'].includes(authenticatedRole(db,user,ownerPolicy));
}
export function sourceLabel(db,subject){
  const row=db.prepare('SELECT name FROM profiles WHERE id=?').get(subject);
  const name=typeof row?.name==='string'?row.name.trim():'';
  // The identity-link wire contract limits labels to 120 UTF-16 units. Keep the
  // stored profile intact and avoid splitting a surrogate pair at that boundary.
  if(!name||/[\u0000-\u001f\u007f]/.test(name))return 'KNABA '+subject.slice(0,12);
  return name.slice(0,120).replace(/[\uD800-\uDBFF]$/,'');
}
