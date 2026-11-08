import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Engine } from '../apps/api/engine.ts';
import { authorityFingerprint } from '../apps/api/authority-fingerprint.ts';
import type { Database, PgTransaction } from '../apps/api/database.ts';
import type { SqlTransaction } from '../apps/api/auth.ts';
import { commerceCommands } from '../packages/domain/commerce.ts';
import { assert, DomainError, type Actor, type CommandContext, type Data, type Entity } from '../packages/domain/core.ts';

const NOW = '2026-11-08T12:00:00.000Z';
const FUTURE = '2026-11-09T12:00:00.000Z';
const companyId = 'membership-read-regression';
const stale: Actor = { userId: 'client', companyId, roles: ['CLIENT'], permissions: ['customer.read', 'issue.read'], siteIds: [], customerIds: ['customer'], warehouseIds: [] };

/** Clone-on-read fixture exercising the actual Engine/commerce/fingerprint code.
 * It is deliberately not a PostgreSQL implementation or a production data copy.
 */
class Memory implements SqlTransaction {
  companyId = companyId;
  rows = new Map<string, Entity>();
  receipts = new Map<string, Data>();
  writes = 0;
  put(kind: string, id: string, data: Data, company = this.companyId) {
    const row: Entity = { kind, id, data: structuredClone(data), companyId: company, version: 1, createdAt: NOW, updatedAt: NOW };
    this.rows.set(`${kind}:${id}`, row);
    return row;
  }
  async get<T extends Data = Data>(kind: string, id: string): Promise<Entity<T>> {
    const row = this.rows.get(`${kind}:${id}`);
    assert(row && row.companyId === this.companyId, 'NOT_FOUND_SAFE');
    return structuredClone(row) as Entity<T>;
  }
  async list<T extends Data = Data>(kind: string): Promise<Entity<T>[]> {
    // The foreign-company negative case checks the authorization consumer too;
    // real PgTransaction has its own additional company-scoped SQL predicate.
    return [...this.rows.values()].filter(row => row.kind === kind).map(row => structuredClone(row) as Entity<T>);
  }
  async add<T extends Data = Data>(kind: string, data: T, id = 'new-row'): Promise<Entity<T>> { this.writes++; return this.put(kind, id, data) as Entity<T>; }
  async save<T extends Data = Data>(row: Entity, data: T): Promise<Entity<T>> { this.writes++; const saved = this.put(row.kind, row.id, data, row.companyId); saved.version = row.version + 1; return saved as Entity<T>; }
  async event() { this.writes++; }
  async query(statement: string, params: any[] = []) {
    const key = JSON.stringify(params.slice(0, 3));
    if (statement.startsWith('SELECT command,input_hash')) return { rows: this.receipts.has(key) ? [structuredClone(this.receipts.get(key)!)] : [] };
    if (statement.startsWith('INSERT INTO command_receipts')) {
      assert(!this.receipts.has(key), 'IDEMPOTENCY_CONFLICT');
      this.receipts.set(key, { command: params[3], input_hash: params[4], result: JSON.parse(params[5]), authorization_hash: params[6], created_at: new Date().toISOString() });
      this.writes++; return { rows: [] };
    }
    if (statement.startsWith('INSERT INTO audit_log')) { this.writes++; return { rows: [] }; }
    throw new Error('Unexpected SQL in membership CPU fixture');
  }
  async transaction<T>(company: string, _actor: string, fn: (tx: PgTransaction) => Promise<T>): Promise<T> {
    assert(company === this.companyId, 'ACCESS_DENIED');
    const before = { rows: structuredClone(this.rows), receipts: structuredClone(this.receipts), writes: this.writes };
    try { return await fn(this as unknown as PgTransaction); }
    catch (error) { Object.assign(this, before); throw error; }
  }
}

function fixture(patch: Data = {}, membershipCompany = companyId) {
  const tx = new Memory(), engine = new Engine(tx as unknown as Database, 'TEST');
  tx.put('user', 'client', { active: true, roles: ['CLIENT'], siteIds: [], warehouseIds: [] });
  tx.put('customer', 'customer', { name: 'Synthetic customer', active: true });
  tx.put('site', 'site-a', { customerId: 'customer', name: 'Synthetic allowed site', active: true });
  tx.put('site', 'site-b', { customerId: 'customer', name: 'Synthetic other site', active: true });
  tx.put('issue', 'issue-a', { customerId: 'customer', siteId: 'site-a', state: 'OPEN', description: 'Synthetic client A issue', photoIds: [] });
  tx.put('issue', 'issue-b', { customerId: 'customer', siteId: 'site-b', state: 'OPEN', description: 'Synthetic client B issue', photoIds: [] });
  const member = tx.put('customer_membership', 'membership', { userId: 'client', customerId: 'customer', siteIds: ['site-a'], permissions: ['VIEW'], active: true, ...patch }, membershipCompany);
  const context = (): CommandContext => ({ tx, actor: stale, now: new Date().toISOString(), idempotencyKey: 'membership-read-test', requireSite: () => { throw new DomainError('ACCESS_DENIED'); }, requireOwn: id => assert(id === stale.userId, 'ACCESS_DENIED') });
  const command = (name: string, input: Data) => {
    const def = commerceCommands[name]!;
    return def.handler(context(), def.schema.parse(input));
  };
  return { tx, engine, member, command, pg: tx as unknown as PgTransaction, fingerprint: () => authorityFingerprint(tx, engine, stale, new Date().toISOString()) };
}

async function outcome(action: Promise<unknown>) {
  try { await action; return 'ALLOWED'; }
  catch (error) { if (error instanceof DomainError) return error.code; throw error; }
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { vi.useRealTimers(); });

describe('one current customer membership authority across Engine and domain reads (CPU)', () => {
  it.each([
    ['revoked legacy alias', { revoked_at: NOW }],
    ['malformed canonical expiry', { expiresAt: 'zz-not-a-date' }],
    ['expired offset timestamp', { expiresAt: '2026-11-08T13:00:00+02:00' }],
    ['expired legacy alias', { expires_at: NOW }],
    ['expired secondary alias', { expiresAt: FUTURE, expires_at: NOW }],
    ['invalid secondary alias', { expiresAt: FUTURE, expires_at: 'invalid' }],
    ['empty supplied expiry', { expiresAt: '' }],
    ['future canonical start', { startsAt: '2026-11-08T11:00:00-02:00' }],
    ['future legacy start', { starts_at: FUTURE }],
    ['future secondary start', { startsAt: NOW, starts_at: FUTURE }],
    ['malformed secondary start', { startsAt: NOW, starts_at: false }],
    ['conflicting subject aliases', { userId: 'client', user_id: 'other-client' }],
    ['inversely conflicting subject aliases', { userId: 'other-client', user_id: 'client' }],
    ['empty subject alias', { userId: '', user_id: 'client' }],
    ['inactive membership', { active: false }],
    ['canonical revocation', { revokedAt: NOW }],
    ['non-boolean active', { active: 'true' }],
    ['malformed revocation marker', { revoked_at: false }],
    ['malformed site scope', { siteIds: {} }],
    ['string site scope', { siteIds: 'site-a' }],
    ['string capability set', { permissions: 'VIEW' }],
    ['malformed customer subject', { customerId: false }]
  ])('denies %s in actor scope, generic API visibility, portal and issue reads', async (_name, patch) => {
    const f = fixture(patch), actor = await f.engine.actorIn(f.pg, 'client');
    const result = {
      customers: actor.customerIds,
      customerAccess: await f.engine.customerAccess(f.pg, stale, 'customer', 'site-a'),
      siteVisible: await f.engine.visible(f.pg, stale, await f.tx.get('site', 'site-a')),
      portal: await outcome(f.command('customer.portal', { customerId: 'customer', siteId: 'site-a' })),
      issue: await outcome(f.command('issue.get', { id: 'issue-a' }))
    };
    expect(result).toEqual({ customers: [], customerAccess: false, siteVisible: false, portal: 'NOT_FOUND_SAFE', issue: 'NOT_FOUND_SAFE' });
    expect(await f.fingerprint()).toBe(await fixture({ active: false }).fingerprint());
    expect(f.tx.writes).toBe(0);
  });

  it('rejects a foreign-company row even if user and customer identifiers are equal', async () => {
    const f = fixture({}, 'other-company');
    expect((await f.engine.actorIn(f.pg, 'client')).customerIds).toEqual([]);
    expect(await f.engine.customerAccess(f.pg, stale, 'customer', 'site-a')).toBe(false);
    await expect(f.command('customer.portal', { customerId: 'customer' })).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
  });

  it.each([
    ['canonical untimed', {}],
    ['legacy subject and null optional bounds', { userId: undefined, user_id: 'client', startsAt: null, expiresAt: null }],
    ['matching subject aliases and current timestamp aliases', { user_id: 'client', startsAt: NOW, starts_at: '2026-11-08T13:00:00+01:00', expiresAt: FUTURE, expires_at: '2026-11-09T13:00:00+01:00' }]
  ])('preserves %s membership without expanding its site scope', async (_name, patch) => {
    const f = fixture(patch);
    expect((await f.engine.actorIn(f.pg, 'client')).customerIds).toEqual(['customer']);
    expect(await f.engine.customerAccess(f.pg, stale, 'customer', 'site-a')).toBe(true);
    expect(await f.engine.customerAccess(f.pg, stale, 'customer', 'site-b')).toBe(false);
    const portal = await f.command('customer.portal', { customerId: 'customer' });
    expect(portal.sites.map((site: Data) => site.id)).toEqual(['site-a']);
    await expect(f.command('issue.get', { id: 'issue-a' })).resolves.toMatchObject({ id: 'issue-a' });
    await expect(f.command('issue.get', { id: 'issue-b' })).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
  });

  it('an invalid unrestricted row cannot widen another current scoped membership', async () => {
    const f = fixture({ siteIds: [], revoked_at: NOW });
    f.tx.put('customer_membership', 'allowed-scoped', { user_id: 'client', customerId: 'customer', active: true, siteIds: ['site-a'], permissions: ['VIEW'] });
    const portal = await f.command('customer.portal', { customerId: 'customer' });
    expect(portal.sites.map((site: Data) => site.id)).toEqual(['site-a']);
    expect(await f.engine.customerAccess(f.pg, stale, 'customer', 'site-b')).toBe(false);
  });

  it('stream and command receipt authority expire at the earliest alias without modifying stored data', async () => {
    const deadline = '2026-11-08T12:00:01.000Z';
    const f = fixture({ siteIds: ['site-b'], expiresAt: FUTURE, expires_at: deadline });
    f.tx.put('customer_membership', 'stable-view', { userId: 'client', customerId: 'customer', active: true, siteIds: ['site-a'], permissions: ['VIEW'] });
    const before = await f.fingerprint();
    const envelope = { input: { id: 'issue-b' }, idempotency_key: 'membership-expiry-receipt' };
    await expect(f.engine.execute(stale, 'issue.get', envelope)).resolves.toMatchObject({ id: 'issue-b' });
    const rows = structuredClone(f.tx.rows), writes = f.tx.writes;
    vi.setSystemTime(new Date(deadline));
    // customerIds is deliberately unchanged: the second VIEW grant stays valid.
    expect((await f.engine.actorIn(f.pg, 'client')).customerIds).toEqual(['customer']);
    expect(await f.fingerprint()).not.toBe(before);
    await expect(f.engine.execute(stale, 'issue.get', envelope)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await expect(f.engine.execute(stale, 'issue.get', { ...envelope, idempotency_key: 'membership-after-expiry' })).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(f.tx.rows).toEqual(rows);
    expect(f.tx.writes).toBe(writes);
    expect(f.tx.receipts.size).toBe(1);
  });
});

async function scopedPortalFixture(roles = ['OPERATIONS_MANAGER']) {
  const f = fixture();
  f.tx.put('user', 'manager', { active: true, roles, siteIds: ['site-a'], warehouseIds: [] });
  f.tx.put('customer', 'other-customer', { name: 'Synthetic unassigned customer' });
  f.tx.put('site', 'other-site', { customerId: 'other-customer', name: 'Synthetic other customer site' });
  for (const [id, siteId] of [['allowed', 'site-a'], ['unassigned', 'site-b'], ['unbound', undefined]] as const) {
    f.tx.put('order', 'order-' + id, { customerId: 'customer', siteId, status: 'CONFIRMED', billing: { invoicedCents: 0, paidCents: 0 } });
    if (siteId) f.tx.put('report', 'report-' + id, { customerId: 'customer', siteId, state: 'PUBLISHED', currentVersionId: 'published-' + id, publishedAt: NOW });
  }
  const actor = await f.engine.getActor('manager', companyId);
  const portal = (input: Data) => f.engine.execute(actor, 'customer.portal', { input, idempotency_key: 'manager-portal' });
  return { ...f, actor, portal };
}

describe('customer.portal follows the current internal manager site scope (CPU)', () => {
  it('returns only assigned sites, their orders and published reports; excludes unbound orders', async () => {
    const f = await scopedPortalFixture();
    expect(f.actor.permissions).not.toContain('scope.company');
    expect(await f.engine.visible(f.pg, f.actor, await f.tx.get('site', 'site-b'))).toBe(false);
    const portal = await f.portal({ customerId: 'customer' });
    expect(portal.sites.map((row: Data) => row.id)).toEqual(['site-a']);
    expect(portal.orders.map((row: Data) => row.id)).toEqual(['order-allowed']);
    expect(portal.reports.map((row: Data) => row.id)).toEqual(['report-allowed']);
  });

  it.each([{ customerId: 'other-customer' }, { customerId: 'other-customer', siteId: 'site-a' }])('denies an unassigned customer and mismatched customer/site input %j', async input => {
    const f = await scopedPortalFixture();
    expect(await f.engine.visible(f.pg, f.actor, await f.tx.get('site', 'other-site'))).toBe(false);
    await expect(f.portal(input)).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(f.tx.writes).toBe(0);
  });

  it('denies an explicit unassigned site belonging to an otherwise assigned customer', async () => {
    const f = await scopedPortalFixture();
    await expect(f.portal({ customerId: 'customer', siteId: 'site-b' })).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(f.tx.writes).toBe(0);
  });

  it('preserves explicit company-wide internal authority including unbound customer orders', async () => {
    // OWNER supplies company scope; DIRECTOR supplies customer.read. Neither
    // test nor handler invents a commercial-read permission for OWNER alone.
    const f = await scopedPortalFixture(['OWNER', 'DIRECTOR']);
    expect(f.actor.permissions).toContain('scope.company');
    const portal = await f.portal({ customerId: 'customer' });
    expect(portal.sites.map((row: Data) => row.id)).toEqual(['site-a', 'site-b']);
    expect(portal.orders.map((row: Data) => row.id)).toEqual(['order-allowed', 'order-unassigned', 'order-unbound']);
    expect(portal.reports.map((row: Data) => row.id)).toEqual(['report-allowed', 'report-unassigned']);
  });

  it('keeps a mixed OWNER and CLIENT subject limited to its explicit customer membership', async () => {
    const f = await scopedPortalFixture();
    f.tx.put('user', 'client', { active: true, roles: ['OWNER', 'CLIENT'], siteIds: ['site-b'], warehouseIds: [] });
    const mixed = await f.engine.getActor('client', companyId);
    expect(mixed.permissions).toContain('scope.company');
    const portal = await f.engine.execute(mixed, 'customer.portal', { input: { customerId: 'customer' }, idempotency_key: 'mixed-portal' });
    expect(portal.sites.map((row: Data) => row.id)).toEqual(['site-a']);
    expect(portal.orders.map((row: Data) => row.id)).toEqual(['order-allowed']);
    expect(portal.reports.map((row: Data) => row.id)).toEqual(['report-allowed']);
  });
});
