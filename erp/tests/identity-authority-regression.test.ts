import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { AuthService, hashToken, opaqueToken, type DatabaseLike, type EngineLike, type SqlTransaction } from '../apps/api/auth.js';
import { commerceCommands } from '../packages/domain/commerce.js';
import { assert, type Actor, type CommandContext, type Data, type Entity } from '../packages/domain/core.js';

const now = '2026-11-08T12:00:00.000Z';
const companyId = 'identity-regression-company';
const manager: Actor = {
  userId: 'manager', companyId, roles: ['DIRECTOR'], permissions: ['customer.manage'],
  siteIds: ['site-a'], customerIds: [], warehouseIds: [], mfaVerified: true
};

/** Explicit in-memory transaction fixture; these checks do not claim SQL acceptance. */
class Memory implements DatabaseLike, SqlTransaction {
  companyId = companyId;
  rows = new Map<string, Entity>();
  events: { type: string; data: Data }[] = [];
  writes = 0;
  seq = 0;
  put(kind: string, id: string, data: Data, company = this.companyId) {
    const row: Entity = { id, kind, companyId: company, version: 1, data: structuredClone(data), createdAt: now, updatedAt: now };
    this.rows.set(`${company}:${kind}:${id}`, row);
    return row;
  }
  async get<T extends Data = Data>(kind: string, id: string): Promise<Entity<T>> {
    const row = this.rows.get(`${this.companyId}:${kind}:${id}`);
    assert(row, 'NOT_FOUND_SAFE');
    return structuredClone(row) as Entity<T>;
  }
  async list<T extends Data = Data>(kind: string): Promise<Entity<T>[]> {
    return [...this.rows.values()].filter(row => row.companyId === this.companyId && row.kind === kind).map(row => structuredClone(row) as Entity<T>);
  }
  async add<T extends Data = Data>(kind: string, data: T, id = `row-${++this.seq}`): Promise<Entity<T>> {
    assert(!this.rows.has(`${this.companyId}:${kind}:${id}`), 'VERSION_CONFLICT');
    this.writes++;
    return structuredClone(this.put(kind, id, data)) as Entity<T>;
  }
  async save<T extends Data = Data>(row: Entity, data: T, expectedVersion = row.version): Promise<Entity<T>> {
    const current = await this.get(row.kind, row.id);
    assert(current.version === expectedVersion, 'VERSION_CONFLICT');
    const saved = { ...current, version: current.version + 1, data: structuredClone(data) };
    this.rows.set(`${this.companyId}:${row.kind}:${row.id}`, saved);
    this.writes++;
    return structuredClone(saved) as Entity<T>;
  }
  async event(type: string, data: Data) { this.events.push({ type, data: structuredClone(data) }); }
  async query(): Promise<{ rows: Data[] }> { throw new Error('Unexpected SQL in identity CPU fixture'); }
  async transaction<T>(company: string, _actorId: string, fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const before = { rows: structuredClone(this.rows), events: structuredClone(this.events), writes: this.writes, seq: this.seq };
    const previousCompany = this.companyId;
    this.companyId = company;
    try { return await fn(this); }
    catch (error) { Object.assign(this, before); throw error; }
    finally { this.companyId = previousCompany; }
  }
}

function membershipFixture(identity: Data = {}, user: Data = {}) {
  const db = new Memory();
  db.put('customer', 'customer-a', { active: true, name: 'Synthetic customer A' });
  db.put('site', 'site-a', { active: true, customerId: 'customer-a' });
  db.put('site', 'site-b', { active: true, customerId: 'customer-b' });
  db.put('user', 'client-a', { active: true, roles: ['CLIENT'], email: 'same@example.test', ...user });
  db.put('user', 'client-b', { active: true, roles: ['CLIENT'], email: 'same@example.test' });
  db.put('contact_identity', 'proof-a', { userId: 'client-a', type: 'EMAIL', value: 'same@example.test', verified: true, active: true, ...identity });
  const input = { customerId: 'customer-a', userId: 'client-a', siteIds: ['site-a'], permissions: ['VIEW'], verifiedIdentityId: 'proof-a' };
  const invoke = (name: string, input: Data, actor = manager) => db.transaction(companyId, actor.userId, async tx => {
    const command = commerceCommands[name]!;
    const context: CommandContext = {
      tx, actor, now, idempotencyKey: 'membership-regression',
      requireSite: id => { assert(actor.permissions.includes('scope.company') || actor.siteIds.includes(id), 'ACCESS_DENIED'); },
      requireOwn: id => { assert(id === actor.userId, 'ACCESS_DENIED'); }
    };
    return command.handler(context, command.schema.parse(input));
  });
  return {
    db, input,
    run: (extra: Data = {}, actor = manager) => invoke('customer.membership.grant', { ...input, ...extra }, actor),
    revoke: (id: string, actor = manager) => invoke('customer.membership.revoke', { id, reason: 'Synthetic scoped access revocation' }, actor)
  };
}

describe('customer membership requires current proof of the exact target identity (CPU)', () => {
  it('grants only the explicitly requested customer/site permissions to the exact verified user', async () => {
    const f = membershipFixture({ startsAt: now, expiresAt: '2026-11-08T12:00:01.000Z' });
    const membership = await f.run();
    expect(membership.companyId).toBe(companyId);
    expect(membership.data).toMatchObject({ userId: 'client-a', customerId: 'customer-a', siteIds: ['site-a'], permissions: ['VIEW'], active: true, verifiedIdentityId: 'proof-a' });
    expect((await f.db.get('user', 'client-a')).data.roles).toEqual(['CLIENT']);
    expect(await f.db.list('customer_membership')).toHaveLength(1);
    expect(f.db.events).toEqual([{ type: 'customer.membership_granted', data: { membershipId: membership.id, userId: 'client-a', customerId: 'customer-a' } }]);
  });

  it.each([
    ['revoked camel-case proof', { revokedAt: now }],
    ['revoked snake-case proof', { revoked_at: now }],
    ['false canonical revocation marker', { revokedAt: false }],
    ['zero canonical revocation marker', { revokedAt: 0 }],
    ['empty canonical revocation marker', { revokedAt: '' }],
    ['false legacy revocation marker', { revoked_at: false }],
    ['zero legacy revocation marker', { revoked_at: 0 }],
    ['empty legacy revocation marker', { revoked_at: '' }],
    ['expired proof', { expiresAt: '2026-11-08T11:59:59.000Z' }],
    ['expiry boundary', { expiresAt: now }],
    ['expired snake-case proof', { expires_at: now }],
    ['invalid expiry', { expiresAt: 'not-a-date' }],
    ['empty expiry', { expiresAt: '' }],
    ['invalid secondary expiry alias', { expiresAt: '2027-01-01T00:00:00.000Z', expires_at: 'not-a-date' }],
    ['not-yet-valid proof', { startsAt: '2026-11-08T12:00:01.000Z' }],
    ['not-yet-valid snake-case proof', { starts_at: '2026-11-08T12:00:01.000Z' }],
    ['invalid start', { startsAt: 'not-a-date' }],
    ['unverified proof', { verified: false }],
    ['truthy non-boolean proof', { verified: 'true' }],
    ['inactive proof', { active: false }],
    ['malformed active proof', { active: 'true' }],
    ['null active proof', { active: null }]
  ])('rejects %s without creating or reviving a membership', async (_name, identity) => {
    const f = membershipFixture(identity);
    f.db.put('customer_membership', 'revoked-membership', { userId: 'client-a', customerId: 'customer-a', active: false, revokedAt: now, permissions: ['VIEW'], siteIds: ['site-a'] });
    const before = structuredClone(f.db.rows);
    await expect(f.run()).rejects.toMatchObject({ code: 'NEEDS_REAUTH' });
    expect(f.db.rows).toEqual(before);
    expect(f.db.writes).toBe(0);
    expect(f.db.events).toEqual([]);
  });

  it('retains a previously verified untimed identity without inventing a required expiry', async () => {
    const f = membershipFixture({ active: undefined, revokedAt: null, revoked_at: null });
    await expect(f.run()).resolves.toMatchObject({ data: { userId: 'client-a', active: true } });
  });

  it.each([
    ['disabled user', { active: false }],
    ['missing active flag', { active: undefined }],
    ['truthy non-boolean active flag', { active: 'true' }]
  ])('rejects a %s even if the contact proof is verified', async (_name, user) => {
    const f = membershipFixture({}, user);
    await expect(f.run()).rejects.toMatchObject({ code: 'NEEDS_REAUTH' });
    expect(await f.db.list('customer_membership')).toEqual([]);
    expect(f.db.writes).toBe(0);
  });

  it('rejects a missing or foreign-company target user before creating any grant', async () => {
    const f = membershipFixture();
    f.db.rows.delete(`${companyId}:user:client-a`);
    f.db.put('user', 'client-a', { active: true, roles: ['CLIENT'], email: 'same@example.test' }, 'other-company');
    await expect(f.run()).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(await f.db.list('customer_membership')).toEqual([]);
    expect(f.db.writes).toBe(0);
  });

  it('does not equate two users merely because both have the same email', async () => {
    const f = membershipFixture({ userId: 'client-b' });
    await expect(f.run()).rejects.toMatchObject({ code: 'NEEDS_REAUTH' });
    expect(f.db.writes).toBe(0);
    expect(f.db.events).toEqual([]);
  });

  it('rejects a contact proof from another company and a site from another customer', async () => {
    const foreign = membershipFixture();
    foreign.db.rows.delete(`${companyId}:contact_identity:proof-a`);
    foreign.db.put('contact_identity', 'proof-a', { userId: 'client-a', verified: true, active: true }, 'other-company');
    await expect(foreign.run()).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    const wrongSite = membershipFixture();
    await expect(wrongSite.run({ siteIds: ['site-b'] }, { ...manager, siteIds: ['site-b'] })).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(foreign.db.writes + wrongSite.db.writes).toBe(0);
  });

  it('requires a new explicit current proof to restore a revoked membership', async () => {
    const f = membershipFixture();
    f.db.put('customer_membership', 'old-grant', { userId: 'client-a', customerId: 'customer-a', siteIds: [], permissions: ['VIEW', 'ACCEPT_QUOTE'], active: false, revokedAt: now });
    const restored = await f.run({}, { ...manager, permissions: [...manager.permissions, 'scope.company'] });
    expect(restored).toMatchObject({ id: 'old-grant', version: 2, data: { userId: 'client-a', siteIds: ['site-a'], permissions: ['VIEW'], active: true } });
    expect(restored.data.revokedAt).toBeUndefined();
    expect(await f.db.list('customer_membership')).toHaveLength(1);
  });
});

describe('customer membership administration stays inside the manager site scope (CPU)', () => {
  const companyManager: Actor = { ...manager, permissions: [...manager.permissions, 'scope.company'] };

  it('denies a grant for an unassigned site even when it belongs to the requested customer', async () => {
    const f = membershipFixture();
    f.db.put('site', 'unassigned-site', { customerId: 'customer-a', active: true });
    await expect(f.run({ siteIds: ['unassigned-site'] })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.db.writes).toBe(0);
    expect(f.db.events).toEqual([]);
  });

  it('denies an unrestricted customer-wide grant by a manager scoped to one site', async () => {
    const f = membershipFixture();
    await expect(f.run({ siteIds: [] })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.db.writes).toBe(0);
  });

  it('preserves explicit company-wide authority for an unrestricted customer grant', async () => {
    const f = membershipFixture();
    await expect(f.run({ siteIds: [] }, companyManager)).resolves.toMatchObject({ data: { siteIds: [], customerId: 'customer-a', userId: 'client-a', active: true } });
    expect(f.db.writes).toBe(1);
  });

  it.each([{ siteIds: [] }, { siteIds: ['site-a', 'unassigned-site'] }])('cannot replace a broader existing grant with a narrow input: $siteIds', async ({ siteIds }) => {
    const f = membershipFixture();
    f.db.put('customer_membership', 'existing-grant', { userId: 'client-a', customerId: 'customer-a', siteIds, permissions: ['VIEW'], active: true });
    const before = structuredClone(f.db.rows);
    await expect(f.run()).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.db.rows).toEqual(before);
    expect(f.db.writes).toBe(0);
  });

  it('checks a legacy subject grant before replacement and never leaves its broader authority behind', async () => {
    const f = membershipFixture();
    f.db.put('customer_membership', 'legacy-grant', { user_id: 'client-a', customerId: 'customer-a', siteIds: [], permissions: ['VIEW'], active: true });
    const before = structuredClone(f.db.rows);
    await expect(f.run()).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.db.rows).toEqual(before);
    expect(f.db.writes).toBe(0);
    const replacement = await f.run({}, companyManager);
    expect(replacement).toMatchObject({ id: 'legacy-grant', version: 2, data: { userId: 'client-a', siteIds: ['site-a'] } });
    expect(replacement.data.user_id).toBeUndefined();
    expect(await f.db.list('customer_membership')).toHaveLength(1);
  });

  it('replaces one current legacy grant inside the assigned site without creating a duplicate', async () => {
    const f = membershipFixture();
    f.db.put('customer_membership', 'legacy-grant', { user_id: 'client-a', customerId: 'customer-a', siteIds: ['site-a'], permissions: ['VIEW'], active: true });
    await expect(f.run()).resolves.toMatchObject({ id: 'legacy-grant', version: 2, data: { userId: 'client-a', siteIds: ['site-a'] } });
    expect(await f.db.list('customer_membership')).toHaveLength(1);
  });

  it.each([{ userId: 'client-a', user_id: 'client-b' }, { userId: 'client-b', user_id: 'client-a' }])('denies replacement of conflicting subject aliases: %j', async subject => {
    const f = membershipFixture();
    f.db.put('customer_membership', 'ambiguous-grant', { ...subject, customerId: 'customer-a', siteIds: ['site-a'], permissions: ['VIEW'], active: true });
    const before = structuredClone(f.db.rows);
    await expect(f.run({}, companyManager)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(f.db.rows).toEqual(before);
    expect(f.db.writes).toBe(0);
  });

  it('denies an ambiguous multi-row replacement instead of choosing only one grant', async () => {
    const f = membershipFixture();
    for (const [id, subject] of [['canonical', { userId: 'client-a' }], ['legacy', { user_id: 'client-a' }]] as const) {
      f.db.put('customer_membership', id, { ...subject, customerId: 'customer-a', siteIds: ['site-a'], permissions: ['VIEW'], active: true });
    }
    const before = structuredClone(f.db.rows);
    await expect(f.run({}, companyManager)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(f.db.rows).toEqual(before);
    expect(f.db.writes).toBe(0);
  });

  it('revokes a legacy subject by explicit row ID with its exact user in the audit event', async () => {
    const f = membershipFixture();
    f.db.put('customer_membership', 'legacy-grant', { user_id: 'client-a', customerId: 'customer-a', siteIds: ['site-a'], permissions: ['VIEW'], active: true });
    await expect(f.revoke('legacy-grant')).resolves.toMatchObject({ data: { user_id: 'client-a', active: false, revokedAt: now } });
    expect(f.db.events).toEqual([{ type: 'customer.membership_revoked', data: { membershipId: 'legacy-grant', userId: 'client-a', customerId: 'customer-a' } }]);
  });

  it('allows a scoped manager to revoke a membership entirely within their assigned site', async () => {
    const f = membershipFixture(), membership = await f.run();
    const revoked = await f.revoke(membership.id);
    expect(revoked).toMatchObject({ id: membership.id, data: { active: false, revokedBy: manager.userId, revokedAt: now, siteIds: ['site-a'] } });
    expect(f.db.events.at(-1)).toMatchObject({ type: 'customer.membership_revoked', data: { membershipId: membership.id, customerId: 'customer-a', userId: 'client-a' } });
  });

  it.each([{ siteIds: [] }, { siteIds: ['unassigned-site'] }, { siteIds: ['site-a', 'unassigned-site'] }])('denies revocation outside the full assigned site scope: $siteIds', async ({ siteIds }) => {
    const f = membershipFixture();
    f.db.put('customer_membership', 'protected-grant', { userId: 'client-a', customerId: 'customer-a', siteIds, permissions: ['VIEW'], active: true });
    const before = structuredClone(f.db.rows);
    await expect(f.revoke('protected-grant')).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.db.rows).toEqual(before);
    expect(f.db.writes).toBe(0);
    expect(f.db.events).toEqual([]);
  });

  it('preserves company-wide revocation, including an unrestricted legacy membership', async () => {
    const f = membershipFixture();
    f.db.put('customer_membership', 'global-grant', { userId: 'client-a', customerId: 'customer-a', permissions: ['VIEW'], active: true });
    await expect(f.revoke('global-grant', companyManager)).resolves.toMatchObject({ data: { active: false, revokedAt: now } });
  });
});

function deviceFixture() {
  const db = new Memory(), token = opaqueToken();
  const principal: Actor = { userId: 'employee', companyId, roles: ['EMPLOYEE'], permissions: ['shift.read'], siteIds: ['site-a'], customerIds: [], warehouseIds: [] };
  db.put('user', principal.userId, { active: true, roles: principal.roles });
  const valid = { employeeId: principal.userId, active: true, tokenHash: hashToken(token), tokenExpiresAt: new Date(Date.now() + 3600000).toISOString() };
  db.put('device', 'device-a', valid);
  const getActor = vi.fn(async (userId: string, company: string) => db.transaction(company, userId, async tx => {
    const user = await tx.get('user', userId);
    assert(user.data.active === true, 'ACCESS_DENIED');
    return { ...principal, userId, companyId: company, roles: user.data.roles, mfaVerified: true };
  }));
  const engine: EngineLike = { registry: {}, execute: async () => undefined, readEntities: async () => [], getActor };
  const auth = new AuthService(db, engine, { companyId, appMode: 'TEST' });
  const req = { get: (name: string) => name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined } as Request;
  return { db, valid, token, req, auth, getActor };
}

describe('device bearer revocation is enforced before generic API authentication (CPU)', () => {
  it.each([{}, { revokedAt: null, revoked_at: null }])('authenticates a current same-company device with markers %j, live actor roles and no MFA elevation', async markers => {
    const f = deviceFixture();
    f.db.put('device', 'device-a', { ...f.valid, ...markers });
    const first = await f.auth.authenticate(f.req);
    expect(first).toMatchObject({ actor: { userId: 'employee', companyId, roles: ['EMPLOYEE'], mfaVerified: false }, device: { id: 'device-a' }, csrfToken: null });
    f.db.put('user', 'employee', { active: true, roles: ['TEAM_LEADER'] });
    expect((await f.auth.authenticate(f.req)).actor.roles).toEqual(['TEAM_LEADER']);
    f.db.put('user', 'employee', { active: false, roles: ['TEAM_LEADER'] });
    await expect(f.auth.authenticate(f.req)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });

  it('denies revoked, invalid, expired or non-active devices before resolving the actor', async () => {
    const f = deviceFixture();
    for (const invalid of [
      { revokedAt: new Date().toISOString() }, { revoked_at: new Date().toISOString() },
      { active: false }, { active: undefined }, { active: 'true' },
      { tokenExpiresAt: undefined }, { tokenExpiresAt: null }, { tokenExpiresAt: '' },
      { tokenExpiresAt: 'invalid' }, { tokenExpiresAt: new Date().toISOString() },
      { tokenExpiresAt: new Date(Date.now() - 1000).toISOString() }
    ]) {
      f.db.put('device', 'device-a', { ...f.valid, ...invalid });
      await expect(f.auth.authenticate(f.req)).rejects.toMatchObject({ code: 'NEEDS_REAUTH' });
    }
    expect(f.getActor).not.toHaveBeenCalled();
    expect(f.db.writes).toBe(0);
  });

  it.each([{ revokedAt: false }, { revokedAt: 0 }, { revokedAt: '' }, { revoked_at: false }, { revoked_at: 0 }, { revoked_at: '' }])('denies a malformed explicit device revocation marker %j before resolving the actor', async marker => {
    const f = deviceFixture();
    f.db.put('device', 'device-a', { ...f.valid, ...marker });
    await expect(f.auth.authenticate(f.req)).rejects.toMatchObject({ code: 'NEEDS_REAUTH' });
    expect(f.getActor).not.toHaveBeenCalled();
    expect(f.db.writes).toBe(0);
  });

  it('rejects the old token immediately after device revocation and token replacement', async () => {
    const f = deviceFixture();
    await expect(f.auth.authenticate(f.req)).resolves.toMatchObject({ actor: { userId: 'employee' } });
    f.db.put('device', 'device-a', { ...f.valid, revokedAt: new Date().toISOString() });
    await expect(f.auth.authenticate(f.req)).rejects.toMatchObject({ code: 'NEEDS_REAUTH' });
    f.db.put('device', 'device-a', { ...f.valid, tokenHash: hashToken(opaqueToken()) });
    await expect(f.auth.authenticate(f.req)).rejects.toMatchObject({ code: 'NEEDS_REAUTH' });
    expect(f.getActor).toHaveBeenCalledTimes(1);
  });

  it('cannot use an otherwise valid token from a different company', async () => {
    const f = deviceFixture();
    f.db.rows.delete(`${companyId}:device:device-a`);
    f.db.put('device', 'device-a', f.valid, 'other-company');
    await expect(f.auth.authenticate(f.req)).rejects.toMatchObject({ code: 'NEEDS_REAUTH' });
    expect(f.getActor).not.toHaveBeenCalled();
  });
});
