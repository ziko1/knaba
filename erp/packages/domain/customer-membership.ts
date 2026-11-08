import type { Actor, Entity } from './core.ts';

const supplied = (value: unknown) => value !== undefined && value !== null;
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const identifiers = (value: unknown) => !supplied(value) || Array.isArray(value) && value.every(identifier);

/** Resolve a tenant-bound subject without preferring one conflicting alias.
 * This also supports discovery of revoked rows; it is not an access decision.
 */
export function customerMembershipUserId(membership: Entity, companyId: string): string | undefined {
  if (membership.kind !== 'customer_membership' || membership.companyId !== companyId) return undefined;
  const { userId, user_id } = membership.data;
  if (supplied(userId) && !identifier(userId) || supplied(user_id) && !identifier(user_id)) return undefined;
  if (supplied(userId) && supplied(user_id) && userId !== user_id) return undefined;
  return userId ?? user_id ?? undefined;
}

/** Current customer authority shared by API, commands and delivery projections.
 * Untimed legacy grants and absent/empty site lists retain their existing meaning.
 * Every supplied time bound must hold; a second alias can only restrict access.
 * Do not use this filter to discover historical privacy/erasure subjects.
 */
export function currentCustomerMembership(membership: Entity, actor: Pick<Actor, 'companyId' | 'userId'>, nowISO: string): boolean {
  const d = membership.data, now = Date.parse(nowISO);
  if (customerMembershipUserId(membership, actor.companyId) !== actor.userId || !identifier(actor.userId) ||
      d.active !== true || supplied(d.revokedAt) || supplied(d.revoked_at) || !Number.isFinite(now) ||
      !identifier(d.customerId) || !identifiers(d.siteIds) || !identifiers(d.permissions)) return false;
  const bound = (value: unknown, start: boolean) => {
    if (!supplied(value)) return true;
    if (typeof value !== 'string') return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && (start ? time <= now : time > now);
  };
  return bound(d.startsAt, true) && bound(d.starts_at, true) && bound(d.expiresAt, false) && bound(d.expires_at, false);
}
