import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPartnerOrder, listPartnerOrders } from '../apps/api/partner-orders.ts';

type Backend = 'SQLite fixture' | 'PostgreSQL temporary table';
type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, any>> }>;
const backends: Backend[] = ['SQLite fixture', 'PostgreSQL temporary table'];

for (const backend of backends) {
  const enabled = backend === 'SQLite fixture' || (process.env.APP_MODE === 'TEST' && !!process.env.DATABASE_URL);
  describe.skipIf(!enabled)(`partner order scope / ${backend}`, () => {
    let query: Query, close: () => Promise<void>;
    const updatedAt = '2026-01-01T00:00:00.000Z';
    const a = () => ({ companyId: 'tenant-a', query });
    const b = () => ({ companyId: 'tenant-b', query });
    beforeAll(async () => {
      if (backend === 'SQLite fixture') {
        const db = new DatabaseSync(':memory:');
        close = async () => db.close();
        query = async (sql, params = []) => {
          const bindings = Object.fromEntries(params.map((p, i) => [String(i + 1), p as SQLInputValue]));
          return { rows: db.prepare(sql).all(bindings) };
        };
      } else {
        const db = new Client({ connectionString: process.env.DATABASE_URL });
        await db.connect();
        close = () => db.end();
        query = (sql, params) => db.query(sql, params);
      }
      // The PostgreSQL fixture shadows any application table for this connection
      // only. Both engines execute the production SELECT; neither runs migrations.
      await query(`CREATE TEMP TABLE aggregates (
        company_id TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL,
        data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(company_id, kind, id))`);
      async function seed(tenant: string, kind: string, id: string, data: object) {
        await query('INSERT INTO aggregates(company_id,kind,id,data,updated_at) VALUES($1,$2,$3,$4,$5)',
          [tenant, kind, id, JSON.stringify(data), updatedAt]);
      }
      const mine = { customerId: '42', status: 'CONFIRMED', payroll: 'hidden', billing: { balance: 73 }, apiToken: 'synthetic-hidden' };
      await seed('tenant-a', 'order', '01', mine);
      await seed('tenant-a', 'order', '02', { ...mine, customer_id: '42', status: 'IN_PROGRESS' });
      await seed('tenant-a', 'order', '03', { ...mine, status: { privateField: true } });
      await seed('tenant-a', 'order', 'foreign-customer', { ...mine, customerId: 'customer-b' });
      await seed('tenant-a', 'order', 'conflicting', { ...mine, customer_id: 'customer-b' });
      await seed('tenant-a', 'order', 'numeric', { ...mine, customerId: 42 });
      await seed('tenant-a', 'order', 'unlinked', { customer_id: '42' });
      await seed('tenant-a', 'quote', 'wrong-kind', mine);
      await seed('tenant-b', 'order', '01', { ...mine, status: 'PAUSED' });
      await seed('tenant-b', 'order', 'only-in-b', mine);
    });
    afterAll(async () => { await close?.(); });

    it('uses both tenant and counterparty on each list page and projects only public fields', async () => {
      const first = await listPartnerOrders(a(), '42', { limit: 2 });
      expect(first).toEqual({ items: [
        { id: '01', status: 'CONFIRMED', updatedAt },
        { id: '02', status: 'IN_PROGRESS', updatedAt },
      ], nextAfter: '02' });
      expect(await listPartnerOrders(a(), '42', { after: first.nextAfter!, limit: 2 })).toEqual({
        items: [{ id: '03', status: 'UNKNOWN', updatedAt }], nextAfter: null,
      });
      expect((await listPartnerOrders(b(), '42')).items.map(row => row.id)).toEqual(['01', 'only-in-b']);
      expect((await listPartnerOrders(a(), 'customer-b')).items.map(row => row.id)).toEqual(['foreign-customer']);
    });

    it('uses tenant scope on detail even with identical counterparty and order identifiers', async () => {
      expect(await getPartnerOrder(a(), '42', '01')).toEqual({ id: '01', status: 'CONFIRMED', updatedAt });
      expect(await getPartnerOrder(b(), '42', '01')).toEqual({ id: '01', status: 'PAUSED', updatedAt });
    });

    it('gives the same safe denial for hidden, malformed, nonexistent and cross-tenant records', async () => {
      for (const id of ['foreign-customer', 'conflicting', 'numeric', 'unlinked', 'wrong-kind', 'absent', 'only-in-b']) {
        await expect(getPartnerOrder(a(), '42', id)).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE', details: {} });
      }
      await expect(getPartnerOrder(a(), 'customer-b', '01')).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    });

    it('rejects an unbound owner, invalid cursors and invalid page sizes before reading', async () => {
      for (const limit of [0, 101, 1.5]) {
        await expect(listPartnerOrders(a(), '42', { limit })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      }
      await expect(listPartnerOrders(a(), '42', { after: 'bad\u0000id' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(listPartnerOrders(a(), '')).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
      await expect(getPartnerOrder(a(), '', '01')).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    });
  });
}
