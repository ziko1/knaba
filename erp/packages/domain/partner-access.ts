import { z } from 'zod';
import { freshMfa, sql, type SqlTransaction } from '../../apps/api/auth.ts';
import { assert, DomainError, id, type CommandContext, type CommandRegistry, type Entity } from './core.ts';
import { revokePartnerDevices, revokeUserSessions } from './identity.ts';

interface PartnerBinding {
  issuer: string;
  audience: string;
  subject: string;
  sessionDigest: string;
  profileVersion: number;
  profileFingerprint: string;
  trustVersion: number;
  trustFingerprint: string;
  transportFingerprint: string;
}

/** The consumed F2 receipt identifies the site session to introspect. It never
 * establishes that the site profile is currently an approved partner. */
export async function loadPartnerBinding(
  tx: SqlTransaction, companyId: string, userId: string, bindingId: string
): Promise<PartnerBinding> {
  assert('companyId' in tx && tx.companyId === companyId, 'ACCESS_DENIED');
  const { rows } = await sql(tx, `SELECT b.issuer, b.audience, b.subject,
      c.site_session_digest AS "sessionDigest", c.site_profile_version AS "profileVersion",
      c.site_profile_fingerprint AS "profileFingerprint", b.trust_version AS "trustVersion",
      b.trust_fingerprint AS "trustFingerprint", c.transport_fingerprint AS "transportFingerprint"
    FROM site_identity_bindings b
    JOIN site_identity_challenges c ON c.company_id=b.company_id AND c.id=b.f2_challenge_id
      AND c.binding_id=b.id AND c.user_id=b.user_id AND c.site_subject=b.subject
      AND c.issuer=b.issuer AND c.audience=b.audience AND c.trust_fingerprint=b.trust_fingerprint
      AND c.proof_reference=b.proof_reference AND c.status='CONSUMED'
    WHERE b.company_id=$1 AND b.user_id=$2 AND b.id=$3 AND b.site_user_id=b.subject
      AND b.status='ACTIVE' AND (b.expires_at IS NULL OR b.expires_at>clock_timestamp())`,
    [companyId, userId, bindingId]);
  assert(rows.length === 1, 'NOT_FOUND_SAFE');
  return rows[0];
}

async function requireOwner(c: CommandContext, target: string) {
  assert(c.actor.roles.includes('OWNER') && c.actor.permissions.includes('partner.access.manage')
    && c.actor.userId !== target, 'ACCESS_DENIED');
  assert(freshMfa(c.actor.mfaVerified, c.actor.mfaVerifiedAt, Date.parse(c.now)), 'NEEDS_REAUTH');
  const owner = await c.tx.get('user', c.actor.userId);
  assert(owner.companyId === c.actor.companyId && owner.data.active === true
    && Array.isArray(owner.data.roles) && owner.data.roles.includes('OWNER'), 'ACCESS_DENIED');
}

async function currentGrant(c: CommandContext, userId: string): Promise<Entity | undefined> {
  try {
    return await c.tx.get('partner_access', userId);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND_SAFE') return undefined;
    throw error;
  }
}

// Responses acknowledge a specific command revision. Access always consults the current row.
export const partnerAccessCommands: CommandRegistry = {
  'partner.access.grant': {
    permission: 'partner.access.manage',
    highRisk: true,
    schema: z.object({ userId: id, customerId: id, bindingId: z.string().uuid() }).strict(),
    async handler(c, { userId, customerId, bindingId }) {
      await requireOwner(c, userId);
      const user = await c.tx.get('user', userId);
      assert(user.companyId === c.actor.companyId && user.data.active === true && user.data.guest !== true && Array.isArray(user.data.roles)
        && user.data.roles.length === 1 && user.data.roles[0] === 'PARTNER', 'NOT_FOUND_SAFE');
      const customer = await c.tx.get('customer', customerId);
      assert(customer.companyId === c.actor.companyId && customer.data.active === true, 'NOT_FOUND_SAFE');
      await loadPartnerBinding(c.tx, c.actor.companyId, userId, bindingId);
      const existing = await currentGrant(c, userId);
      assert(c.expectedVersion === existing?.version, 'VERSION_CONFLICT');
      const data = { active: true, customerId, bindingId, userVersion: user.version };
      if (existing?.data.active === true && existing.data.customerId === customerId
        && existing.data.bindingId === bindingId && existing.data.userVersion === user.version) {
        return { userId, version: existing.version };
      }
      const grant = existing ? await c.tx.save(existing, data, existing.version) : await c.tx.add('partner_access', data, userId);
      await revokeUserSessions(c.tx, userId, c.actor.companyId);
      await revokePartnerDevices(c, userId);
      await c.tx.event('partner.access.granted', { userId, version: grant.version });
      return { userId, version: grant.version };
    },
  },
  'partner.access.revoke': {
    permission: 'partner.access.manage',
    highRisk: true,
    schema: z.object({ userId: id }).strict(),
    async handler(c, { userId }) {
      await requireOwner(c, userId);
      // Reduction remains possible after losing the site, user role or customer.
      const existing = await c.tx.get('partner_access', userId);
      assert(c.expectedVersion === existing.version, 'VERSION_CONFLICT');
      if (existing.data.active === false) return { userId, version: existing.version };
      const grant = await c.tx.save(existing, { ...existing.data, active: false }, existing.version);
      await revokeUserSessions(c.tx, userId, c.actor.companyId);
      await revokePartnerDevices(c, userId);
      await c.tx.event('partner.access.revoked', { userId, version: grant.version });
      return { userId, version: grant.version };
    },
  },
};
