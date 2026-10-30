/** KNABA VPS trusted dual-operator authorization. Browser/email alone cannot promote the developer. */
import {normalizeEmail} from './auth.mjs';
export function hasOwnerAuthority(db,{userId,ownerEmail,developerEmail=''}) {
  if(typeof userId!=='string'||!userId||typeof ownerEmail!=='string'||!ownerEmail)return false;
  let owner,developer='';
  try {owner=normalizeEmail(ownerEmail);if(developerEmail)developer=normalizeEmail(developerEmail);}catch{return false;}
  const user=db.prepare('SELECT id,email,disabled FROM vps_users WHERE id=?').get(userId);
  if(!user||user.disabled)return false;
  if(user.email===owner)return true;
  if(!developer||developer===owner||user.email!==developer)return false;
  return Boolean(db.prepare("SELECT 1 FROM vps_staff_grants WHERE user_id=? AND email=? AND purpose='developer' AND active=1").get(user.id,developer));
}
export function isProtectedStaffAddress(email,ownerEmail,developerEmail='') {
  const address=normalizeEmail(email);
  return address===normalizeEmail(ownerEmail)||
    Boolean(developerEmail && address===normalizeEmail(developerEmail));
}
