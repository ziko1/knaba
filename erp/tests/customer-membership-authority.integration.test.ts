import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Database } from '../apps/api/database.ts';
import { Engine } from '../apps/api/engine.ts';
import { authorityFingerprint } from '../apps/api/authority-fingerprint.ts';
import type { Actor, Data } from '../packages/domain/core.ts';

const postgres = process.env.DATABASE_URL ? describe : describe.skip;
// Actual PostgreSQL storage/transactions, synthetic company per test. Absence of
// DATABASE_URL is NOT_RUN for these cases; CPU fixtures do not replace this proof.
postgres('PostgreSQL current customer membership and stale authority', () => {
  let db: Database, engine: Engine, company: string, now: string, future: string, stale: Actor;
  beforeAll(async () => { expect(process.env.APP_MODE).toBe('TEST'); db = new Database(); await db.migrate(); engine = new Engine(db, 'TEST'); });
  beforeEach(async () => {
    company = 'membership-authority-' + randomUUID(); now = new Date().toISOString(); future = new Date(Date.now() + 86_400_000).toISOString();
    await db.transaction(company, 'SYNTHETIC_MEMBERSHIP_SETUP', async tx => {
      await tx.add('user', { active: true, roles: ['CLIENT'], siteIds: [], warehouseIds: [], email: 'client@example.test', synthetic: true }, 'client');
      await tx.add('user', { active: true, roles: ['CLIENT'], siteIds: [], warehouseIds: [], email: 'client@example.test', synthetic: true }, 'other-client');
      await tx.add('customer', { name: 'Synthetic customer', active: true }, 'customer');
      for (const id of ['site-a', 'site-b']) {
        await tx.add('site', { name: 'Synthetic ' + id, customerId: 'customer', active: true }, id);
        await tx.add('issue', { customerId: 'customer', siteId: id, state: 'OPEN', description: 'Synthetic ' + id + ' issue', photoIds: [] }, 'issue-' + id);
      }
      await tx.add('customer_membership', { userId: 'client', customerId: 'customer', siteIds: ['site-a'], permissions: ['VIEW'], active: true }, 'membership');
    });
    stale = await engine.getActor('client', company);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => { await db?.close(); });
  async function patch(data: Data) {
    await db.transaction(company, 'SYNTHETIC_MEMBERSHIP_CHANGE', async tx => {
      const member = await tx.get('customer_membership', 'membership'); await tx.save(member, { ...member.data, ...data });
    });
  }
  const readFingerprint = () => db.transaction(company, 'client', tx => authorityFingerprint(tx, engine, stale, new Date().toISOString()), 10000, true);
  const counts = async () => Promise.all(['aggregate_revisions', 'command_receipts', 'audit_log', 'outbox'].map(async table =>
    (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE company_id=$1`, [company])).rows[0].n));

  it('a legacy revocation defeats stale customerIds and a valid membership in another company with equal identifiers', async () => {
    await db.transaction(company + '-other', 'SYNTHETIC_OTHER_COMPANY', async tx => {
      await tx.add('user', { active: true, roles: ['CLIENT'], email: 'client@example.test' }, 'client');
      await tx.add('customer_membership', { userId: 'client', customerId: 'customer', siteIds: [], permissions: ['VIEW'], active: true }, 'membership');
    });
    const before = await readFingerprint();
    await patch({ userId: undefined, user_id: 'client', revoked_at: now });
    const effects = await counts();
    expect(stale.customerIds).toEqual(['customer']);
    expect((await engine.getActor('client', company)).customerIds).toEqual([]);
    expect(await db.transaction(company, 'client', tx => engine.customerAccess(tx, stale, 'customer', 'site-a'), 10000, true)).toBe(false);
    await expect(engine.execute(stale, 'issue.get', { input: { id: 'issue-site-a' }, idempotency_key: 'revoked-issue' })).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(await readFingerprint()).not.toBe(before);
    expect(await counts()).toEqual(effects);
  });

  it('conflicting persisted user aliases authorize neither equal-email account', async () => {
    await patch({ user_id: 'other-client' });
    const effects = await counts();
    for (const userId of ['client', 'other-client']) {
      const actor = await engine.getActor(userId, company);
      expect(actor.customerIds).toEqual([]);
      await expect(engine.execute(actor, 'customer.portal', { input: { customerId: 'customer' }, idempotency_key: 'ambiguous-' + userId })).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    }
    expect(await counts()).toEqual(effects);
  });

  it('earlier secondary expiry invalidates a real receipt with unchanged rows and unchanged customerIds', async () => {
    const clock = Date.parse(now), deadline = new Date(clock + 1000).toISOString();
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(clock);
    await patch({ siteIds: ['site-b'], expiresAt: future, expires_at: deadline });
    await db.transaction(company, 'SYNTHETIC_STABLE_SCOPE', tx => tx.add('customer_membership', { user_id: 'client', customerId: 'customer', siteIds: ['site-a'], permissions: ['VIEW'], active: true }, 'stable-view'));
    const before = await readFingerprint(), envelope = { input: { id: 'issue-site-b' }, idempotency_key: 'expiring-receipt' };
    await expect(engine.execute(stale, 'issue.get', envelope)).resolves.toMatchObject({ id: 'issue-site-b' });
    const effects = await counts(), rows = await db.transaction(company, 'client', tx => tx.list('customer_membership'), 10000, true);
    vi.setSystemTime(new Date(deadline));
    expect((await engine.getActor('client', company)).customerIds).toEqual(['customer']);
    expect(await readFingerprint()).not.toBe(before);
    await expect(engine.execute(stale, 'issue.get', envelope)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await expect(engine.execute(stale, 'issue.get', { ...envelope, idempotency_key: 'fresh-after-expiry' })).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(await db.transaction(company, 'client', tx => tx.list('customer_membership'), 10000, true)).toEqual(rows);
    expect(await counts()).toEqual(effects);
  });

  it('a scoped manager sees only assigned customer sites/orders/reports while explicit company scope remains compatible', async () => {
    await db.transaction(company, 'SYNTHETIC_PORTAL_SCOPE_SETUP', async tx => {
      await tx.add('user', { active: true, roles: ['OPERATIONS_MANAGER'], siteIds: ['site-a'], warehouseIds: [] }, 'manager');
      await tx.add('user', { active: true, roles: ['OWNER', 'DIRECTOR'], siteIds: [], warehouseIds: [] }, 'company-manager');
      await tx.add('customer', { name: 'Synthetic unassigned customer' }, 'other-customer');
      await tx.add('site', { name: 'Synthetic other customer site', customerId: 'other-customer' }, 'other-site');
      for (const [id, siteId] of [['allowed', 'site-a'], ['unassigned', 'site-b'], ['unbound', undefined]] as const) {
        await tx.add('order', { customerId: 'customer', siteId, status: 'CONFIRMED', billing: { invoicedCents: 0, paidCents: 0 } }, 'order-' + id);
        if (siteId) await tx.add('report', { customerId: 'customer', siteId, state: 'PUBLISHED', currentVersionId: 'published-' + id, publishedAt: now }, 'report-' + id);
      }
    });
    const manager = await engine.getActor('manager', company);
    expect(manager.permissions).not.toContain('scope.company');
    expect(await db.transaction(company, 'manager', async tx => engine.visible(tx, manager, await tx.get('site', 'site-b')), 10000, true)).toBe(false);
    const scoped = await engine.execute(manager, 'customer.portal', { input: { customerId: 'customer' }, idempotency_key: 'scoped-portal' });
    expect(scoped.sites.map((row: Data) => row.id)).toEqual(['site-a']);
    expect(scoped.orders.map((row: Data) => row.id)).toEqual(['order-allowed']);
    expect(scoped.reports.map((row: Data) => row.id)).toEqual(['report-allowed']);
    const effects = await counts();
    for (const [key, input] of [['other', { customerId: 'other-customer' }], ['unassigned', { customerId: 'customer', siteId: 'site-b' }]] as const) {
      await expect(engine.execute(manager, 'customer.portal', { input, idempotency_key: 'denied-' + key })).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    }
    expect(await counts()).toEqual(effects);
    const companyManager = await engine.getActor('company-manager', company);
    expect(companyManager.permissions).toContain('scope.company');
    const wide = await engine.execute(companyManager, 'customer.portal', { input: { customerId: 'customer' }, idempotency_key: 'company-portal' });
    expect(wide.sites.map((row: Data) => row.id).sort()).toEqual(['site-a', 'site-b']);
    expect(wide.orders.map((row: Data) => row.id).sort()).toEqual(['order-allowed', 'order-unassigned', 'order-unbound']);
    expect(wide.reports.map((row: Data) => row.id).sort()).toEqual(['report-allowed', 'report-unassigned']);
  });
});
