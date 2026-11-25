import { z } from 'zod';
import { assert, DomainError, type Actor } from '../../packages/domain/core.ts';
import { loadPartnerBinding } from '../../packages/domain/partner-access.ts';
import {
  FederationError, peerRequest, requireActive, transportFingerprint, trustFingerprint, type FederationPeer,
} from '../../packages/integrations/site-identity-protocol.mjs';
import type { DatabaseLike, SqlTransaction } from './auth.ts';
import { authoritySnapshotHash, registerResponseAuthorityCheck } from './request-authority.ts';
import { getPartnerOrder, listPartnerOrders } from './partner-orders.ts';

const partnerSessionPath = '/auth/site-identity/introspect-partner-session';
const pageQuery = z.object({
  limit: z.string().regex(/^(?:[1-9]\d?|100)$/).transform(Number).optional(),
  after: z.string().min(1).max(100).optional(),
}).strict();
const emptyQuery = z.object({}).strict();
const siteReceipt = z.object({
  active: z.literal(true), companyId: z.string(), issuer: z.string(), audience: z.string(),
  subject: z.string(), sessionDigest: z.string(), profileVersion: z.number().int().positive(),
  profileFingerprint: z.string(), trustFingerprint: z.string(), transportFingerprint: z.string(),
  checkedAt: z.number().int().safe(), expiresAt: z.number().int().safe(),
}).strict();
const freshnessMs = 3000;

async function scopeIn(tx: SqlTransaction, actor: Actor) {
  const { companyId, userId } = actor;
  assert('companyId' in tx && tx.companyId === companyId && 'actorId' in tx && tx.actorId === userId, 'ACCESS_DENIED');
  const user = await tx.get('user', userId);
  assert(user.companyId === companyId && user.data.active === true && user.data.guest !== true
    && Array.isArray(user.data.roles) && user.data.roles.length === 1 && user.data.roles[0] === 'PARTNER', 'ACCESS_DENIED');
  const grant = await tx.get('partner_access', userId);
  const { bindingId, customerId } = grant.data;
  assert(grant.companyId === companyId && grant.data.active === true && grant.data.userVersion === user.version
    && typeof bindingId === 'string' && typeof customerId === 'string' && customerId.length > 0, 'ACCESS_DENIED');
  const customer = await tx.get('customer', customerId);
  assert(customer.companyId === companyId && customer.data.active === true, 'ACCESS_DENIED');
  const binding = await loadPartnerBinding(tx, companyId, userId, bindingId);
  const { trustVersion, ...siteSession } = binding;
  return { bindingId, customerId, grantVersion: grant.version, trustVersion, siteSession: { companyId, ...siteSession } };
}

export class PartnerCabinetAuthority {
  constructor(private readonly config: () => FederationPeer | null, private readonly enabled: () => boolean,
    private readonly transport: typeof peerRequest = peerRequest) {}

  private peer() {
    assert(this.enabled(), 'MISSING_CONFIGURATION');
    try { return requireActive(this.config()); }
    catch (error) {
      if (error instanceof FederationError) throw new DomainError('MISSING_CONFIGURATION');
      throw error;
    }
  }

  async orders(db: DatabaseLike, actor: Actor, query: unknown, orderId?: string) {
    assert(actor.roles.length === 1 && actor.roles[0] === 'PARTNER'
      && actor.permissions.includes('partner.orders.read'), 'ACCESS_DENIED');
    const page = orderId === undefined ? pageQuery.parse(query) : emptyQuery.parse(query);
    const { companyId, userId } = actor;
    const before = await db.transaction(companyId, userId, tx => scopeIn(tx, actor), 5000, true);
    const peer = this.peer();
    const expected = before.siteSession;
    const scopeHash = authoritySnapshotHash(before);
    const expectedEcho = authoritySnapshotHash(expected);
    assert(peer.companyId === companyId && peer.issuer === expected.issuer && peer.audience === expected.audience
      && peer.version === before.trustVersion && trustFingerprint(peer) === expected.trustFingerprint
      && transportFingerprint(peer) === expected.transportFingerprint, 'NEEDS_REAUTH');

    const attest = async () => {
      const started = Date.now();
      let response: unknown;
      try { response = await this.transport(peer, 'site', partnerSessionPath, expected); }
      catch (error) {
        if (error instanceof FederationError && error.code === 'ACCESS_DENIED') throw new DomainError('NEEDS_REAUTH');
        throw new DomainError('DEPENDENCY_UNAVAILABLE');
      }
      if (response && typeof response === 'object' && Object.keys(response).length === 1 && Reflect.get(response, 'active') === false) {
        throw new DomainError('NEEDS_REAUTH');
      }
      const receipt = siteReceipt.safeParse(response);
      assert(receipt.success, 'DEPENDENCY_UNAVAILABLE');
      const { active, checkedAt, expiresAt, ...echo } = receipt.data;
      assert(active && authoritySnapshotHash(echo) === expectedEcho && checkedAt >= started - 1000
        && checkedAt <= Date.now() + 1000, 'DEPENDENCY_UNAVAILABLE');
      return Math.min(expiresAt, checkedAt + freshnessMs, started + freshnessMs);
    };
    const stillCurrent = (deadline: number) => assert(Date.now() < deadline
      && transportFingerprint(this.peer()) === expected.transportFingerprint, 'NEEDS_REAUTH');
    const verifyGrant = async (tx: SqlTransaction, deadline: number) => {
      const current = await scopeIn(tx, actor);
      assert(authoritySnapshotHash(current) === scopeHash, 'NEEDS_REAUTH');
      stillCurrent(deadline);
    };

    const deadline = await attest();
    stillCurrent(deadline);
    const readOrders = async (tx: SqlTransaction) => {
      assert(tx.query, 'MISSING_CONFIGURATION');
      const reader = { companyId, query: tx.query.bind(tx) };
      return orderId === undefined ? listPartnerOrders(reader, before.customerId, page) : getPartnerOrder(reader, before.customerId, orderId);
    };
    const result = await db.transaction(companyId, userId, async tx => {
      await verifyGrant(tx, deadline);
      return readOrders(tx);
    }, 5000, true);
    stillCurrent(deadline);
    const projection = authoritySnapshotHash(result);
    registerResponseAuthorityCheck(async () => {
      stillCurrent(deadline);
      const finalDeadline = await attest();
      return async tx => {
        await verifyGrant(tx, finalDeadline);
        // Ownership can change without changing the user's grant or session.
        assert(authoritySnapshotHash(await readOrders(tx)) === projection, 'VERSION_CONFLICT');
        stillCurrent(finalDeadline);
      };
    });
    return result;
  }
}
