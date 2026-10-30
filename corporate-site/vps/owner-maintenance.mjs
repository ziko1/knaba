import { randomBytes } from 'node:crypto';
import { normalizeEmail } from './auth.mjs';

/** Offline operator maintenance for the SAME verified owner; never a public API. */
export function updateExistingOwner(db, input, { ownerEmail, developerEmail = '' } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['currentEmail', 'newEmail', 'name', 'identityVerified'].includes(key)) ||
      input.identityVerified !== true) throw Error('Verified same-owner maintenance input is required.');
  const current = normalizeEmail(ownerEmail);
  if (normalizeEmail(input.currentEmail) !== current) throw Error('Configured owner does not match the reviewed identity.');
  const next = normalizeEmail(input.newEmail);
  if (developerEmail && next === normalizeEmail(developerEmail)) throw Error('Owner and developer identities must remain separate.');
  if (input.name !== undefined && (typeof input.name !== 'string' ||
      !input.name.trim() || input.name.trim().length > 160 || /[\u0000-\u001f\u007f]/.test(input.name)))
    throw Error('Invalid owner display name.');
  db.exec('BEGIN IMMEDIATE');
  try {
    const owner = db.prepare('SELECT id, email FROM vps_users WHERE email=? AND disabled=0').get(current);
    if (!owner) throw Error('Existing active configured owner is required.');
    const collision = db.prepare('SELECT id FROM vps_users WHERE email=?').get(next);
    if (collision && collision.id !== owner.id) throw Error('Target address already belongs to another identity.');
    const now = new Date().toISOString();
    db.prepare('UPDATE vps_users SET email=? WHERE id=? AND email=? AND disabled=0').run(next, owner.id, current);
    db.prepare('UPDATE profiles SET email=?,name=coalesce(?,name),updated_at=?,version=version+1,last_mutation=? WHERE id=?')
      .run(next, input.name?.trim() ?? null, now, 'offline-owner-maintenance', owner.id);
    // Email changes never inherit a stale browser login, provider link or bearer invitation.
    db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(owner.id);
    db.prepare('DELETE FROM vps_oidc_links WHERE user_id=?').run(owner.id);
    db.prepare('DELETE FROM vps_oidc_states WHERE link_user_id=?').run(owner.id);
    db.prepare('UPDATE vps_owner_invites SET used_at=? WHERE email IN (?,?) AND used_at IS NULL')
      .run(Date.now(), current, next);
    db.prepare('INSERT INTO portal_audit(id,actor_id,action,entity_id,created_at) VALUES (?,?,?,?,?)')
      .run(randomBytes(18).toString('base64url'), owner.id, 'owner.details_updated', owner.id, now);
    db.exec('COMMIT');
    return { updated: true, identityPreserved: true, sessionsRevoked: true, serverEnvironmentUpdateRequired: next !== current };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
