import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { Database, PgTransaction } from '../apps/api/database.ts';
import { Engine } from '../apps/api/engine.ts';
import type { Actor } from '../packages/domain/core.ts';

const binding = '393b0912-8afe-41b7-a236-25886f508ef5';
const input = { userId: 'partner', customerId: 'customer', bindingId: binding };
const tables = ['auth_sessions', 'site_auth_sessions'] as const;

// SQLite-only transaction fixture. Exercises the command registry, SQL predicates,
// aggregate revisions, receipts and rollback without installing ERP schema.
describe('owner partner grant/revoke through the command engine', () => {
  let db: DatabaseSync, engine: Engine, owner: Actor;
  const tx = (company = 'A') => {
    const client = { query: async (sql: string, params: string[] = []) => {
      const statement = db.prepare(sql.replaceAll("'true'::jsonb", "'true'"));
      const args = Object.fromEntries(params.map((v, i) => ['$' + (i + 1), v]));
      const rows = statement.all(args);
      for (const row of rows) {
        for (const name of ['data', 'result']) if (typeof row[name] === 'string') row[name] = JSON.parse(row[name]);
      }
      return { rows };
    }};
    return new PgTransaction(client as unknown as PoolClient, company, 'owner');
  };
  const grant = (key: string, version?: number, data = input, actor = owner) =>
    engine.execute(actor, 'partner.access.grant', { input: data, idempotency_key: key, expected_version: version });
  const revoke = (key: string, version: number) =>
    engine.execute(owner, 'partner.access.revoke', { input: { userId: 'partner' }, idempotency_key: key, expected_version: version });
  function sessions(table: typeof tables[number], company: string) {
    return db.prepare('SELECT revoked_at FROM ' + table + ' WHERE company_id=? AND user_id=?').get(company, 'partner')?.revoked_at;
  }
  beforeEach(async () => {
    db = new DatabaseSync(':memory:');
    db.function('clock_timestamp', () => new Date().toISOString());
    db.function('now', () => new Date().toISOString());
    db.exec(`
      CREATE TABLE aggregates(company_id,kind,id,data,version INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(company_id,kind,id));
      CREATE TABLE aggregate_revisions(company_id,kind,id,version,data,actor_id);
      CREATE TABLE audit_log(company_id,actor_id,action,aggregate_kind,aggregate_id,detail);
      CREATE TABLE outbox(id,company_id,type,data);
      CREATE TABLE command_receipts(company_id,actor_id,idempotency_key,command,input_hash,result,authorization_hash,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(company_id,actor_id,idempotency_key));
      CREATE TABLE site_identity_bindings(company_id,id,user_id,issuer,audience,subject,site_user_id,status,
        expires_at,trust_version,trust_fingerprint,proof_reference,f2_challenge_id);
      CREATE TABLE site_identity_challenges(company_id,id,user_id,binding_id,site_subject,issuer,audience,
        trust_fingerprint,proof_reference,status,site_session_digest,site_profile_version,site_profile_fingerprint,transport_fingerprint);
    `);
    for (const table of tables) db.exec('CREATE TABLE ' + table + '(company_id,user_id,revoked_at)');
    for (const company of ['A', 'B']) {
      const t = tx(company);
      await t.add('user', { active: true, roles: ['OWNER'] }, 'owner');
      await t.add('user', { active: true, roles: ['PARTNER'] }, 'partner');
      await t.add('customer', { active: true }, 'customer');
      await t.add('device', { active: true, employeeId: 'partner' }, 'device');
      for (const table of tables) db.prepare('INSERT INTO ' + table + ' VALUES(?,?,NULL)').run(company, 'partner');
      db.prepare("INSERT INTO site_identity_bindings VALUES(?,?,'partner','issuer','aud','s','s','ACTIVE',NULL,1,'trust','proof','challenge')").run(company, binding);
      db.prepare("INSERT INTO site_identity_challenges VALUES(?,'challenge','partner',?,'s','issuer','aud','trust','proof','CONSUMED','site-session',1,'profile','transport')").run(company, binding);
    }
    engine = new Engine({ transaction: async <T>(company: string, _actor: string, run: (t: PgTransaction) => Promise<T>) => {
      db.exec('BEGIN');
      try { const result = await run(tx(company)); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }} as Database, 'TEST');
    owner = { ...await engine.getActor('owner', 'A'), mfaVerified: true, mfaVerifiedAt: new Date().toISOString() };
  });
  afterEach(() => db.close());

  const status = (actor = owner) => engine.execute(actor, 'partner.access.status', {
    input: { userId: 'partner' }, idempotency_key: 'read-same-status',
  });

  it('reads the current assignment across sessions without relying on an earlier command receipt', async () => {
    const noGrant = { userId: 'partner', active: false, version: null, customerId: null };
    expect(await status()).toEqual(noGrant);
    await grant('grant-for-recovery');
    const current = await status();
    expect(current).toEqual({ userId: 'partner', active: true, version: 1, customerId: 'customer' });
    expect(await status({ ...owner, companyId: 'B' })).toEqual(noGrant);

    db.exec("UPDATE site_identity_bindings SET status='REVOKED' WHERE company_id='A'");
    await revoke('revoke-recovered-version', current.version);
    expect(await status()).toEqual({ userId: 'partner', active: false, version: 2, customerId: 'customer' });
    expect(db.prepare("SELECT * FROM command_receipts WHERE command = 'partner.access.status'").all()).toEqual([]);
  });

  it('requires a current owner with fresh MFA to read an assignment', async () => {
    await expect(status({ ...owner, mfaVerifiedAt: '2000-01-01' })).rejects.toMatchObject({ code: 'NEEDS_REAUTH' });
    const user = await tx().get('user', 'owner');
    await tx().save(user, { active: true, roles: ['DIRECTOR'], permissions: ['partner.access.manage'] });
    await expect(status()).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });

  it('revokes target credentials in A, leaves equal IDs in B intact and records just one grant', async () => {
    const ack = await grant('grant-original');
    expect(ack).toEqual({ userId: 'partner', version: 1 });
    expect(await grant('grant-original')).toEqual(ack);
    expect(await grant('grant-unchanged', 1)).toEqual(ack);
    expect((await tx().get('partner_access', 'partner')).data).toEqual({ active: true, bindingId: binding, customerId: 'customer', userVersion: 1 });
    for (const table of tables) {
      expect(sessions(table, 'A')).toBeTypeOf('string');
      expect(sessions(table, 'B')).toBeNull();
    }
    expect((await tx().get('device', 'device')).data.active).toBe(false);
    expect((await tx('B').get('device', 'device')).data.active).toBe(true);
    expect(await tx('B').list('partner_access')).toEqual([]);
    expect(db.prepare('SELECT type FROM outbox').all()).toEqual([{ type: 'partner.access.granted' }]);
  });

  it('revokes after the site link disappears and resists stale grant or stale-version retries', async () => {
    await grant('grant-before-revoke');
    for (const table of tables) db.exec("UPDATE " + table + " SET revoked_at=NULL WHERE company_id='A'");
    db.exec("UPDATE site_identity_bindings SET status='REVOKED' WHERE company_id='A'");
    await expect(revoke('wrong-rev', 2)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(await revoke('revoke-without-site', 1)).toEqual({ userId: 'partner', version: 2 });
    await grant('grant-before-revoke'); // Historical receipt is only an acknowledgement.
    expect((await tx().get('partner_access', 'partner')).data.active).toBe(false);
    for (const table of tables) expect(sessions(table, 'A')).toBeTypeOf('string');
    db.exec("UPDATE site_identity_bindings SET status='ACTIVE' WHERE company_id='A'");
    await expect(grant('stale-regrant', 1)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect((await tx().get('partner_access', 'partner')).version).toBe(2);
  });

  it('pins the live user version and does not transfer a previous grant to a changed identity', async () => {
    await grant('grant-before-role');
    const user = await tx().get('user', 'partner');
    await tx().save(user, { ...user.data, roles: ['CLIENT'] });
    await expect(grant('grant-client', 1)).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    const changed = await tx().get('user', 'partner');
    await tx().save(changed, { ...changed.data, roles: ['PARTNER'] });
    expect((await tx().get('partner_access', 'partner')).data.userVersion).toBe(1);
    expect(await grant('grant-refresh', 1)).toEqual({ userId: 'partner', version: 2 });
    expect((await tx().get('partner_access', 'partner')).data.userVersion).toBe(3);
  });

  it.each([
    ["DELETE FROM site_identity_bindings WHERE company_id='A'"],
    ["UPDATE site_identity_challenges SET status='OPEN' WHERE company_id='A'"],
    ["UPDATE site_identity_challenges SET user_id='other' WHERE company_id='A'"],
    ["UPDATE site_identity_challenges SET proof_reference='other' WHERE company_id='A'"],
    ["UPDATE site_identity_challenges SET site_subject='other' WHERE company_id='A'"],
    ["UPDATE site_identity_bindings SET expires_at='2000-01-01' WHERE company_id='A'"],
    ["DELETE FROM aggregates WHERE company_id='A' AND kind='customer'"],
    ["UPDATE aggregates SET data='{}' WHERE company_id='A' AND kind='customer'"],
    [`UPDATE aggregates SET data='{"active":"false"}' WHERE company_id='A' AND kind='customer'`],
    ["UPDATE aggregates SET data='{ \"active\": true, \"roles\": [\"PARTNER\",\"OWNER\"] }' WHERE company_id='A' AND kind='user' AND id='partner'"],
    ["UPDATE aggregates SET data='{ \"active\": true, \"guest\": true, \"roles\": [\"PARTNER\"] }' WHERE company_id='A' AND kind='user' AND id='partner'"],
  ])('rejects a missing, ambiguous or foreign proof while B still has matching identifiers (%s)', async statement => {
    db.exec(statement);
    await expect(grant('grant-invalid-proof')).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(await tx().list('partner_access')).toEqual([]);
  });

  it('revokes device credentials crossing the partner role boundary in either direction', async () => {
    const change = (role: string, key: string) => engine.execute(owner, 'user.roles', {
      input: { userId: 'partner', roles: [role], siteIds: [], reason: 'Synthetic role change' }, idempotency_key: key,
    });
    await change('EMPLOYEE', 'change-to-employee');
    expect((await tx().get('device', 'device')).data.active).toBe(false);
    await tx().add('device', { active: true, employeeId: 'partner' }, 'replacement');
    await change('PARTNER', 'change-to-partner');
    expect((await tx().get('device', 'replacement')).data.active).toBe(false);
    expect((await tx('B').get('device', 'device')).data.active).toBe(true);
  });

  it('requires owner and fresh MFA even when the management permission was added directly', async () => {
    await expect(grant('no-fresh-mfa', undefined, input, { ...owner, mfaVerifiedAt: '2000-01-01' })).rejects.toMatchObject({ code: 'NEEDS_REAUTH' });
    const u = await tx().get('user', 'owner');
    await tx().save(u, { active: true, roles: ['DIRECTOR'], permissions: ['partner.access.manage'] });
    await expect(grant('spoof-owner')).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(await tx().list('partner_access')).toEqual([]);
  });

  it('rolls back the grant, earlier session update and receipt if another namespace cannot be revoked', async () => {
    db.exec("CREATE TRIGGER simulated_outage BEFORE UPDATE ON site_auth_sessions BEGIN SELECT RAISE(ABORT,'fixture outage'); END;");
    await expect(grant('retry-after-recovery')).rejects.toThrow('fixture outage');
    expect(await tx().list('partner_access')).toEqual([]);
    expect(sessions('auth_sessions', 'A')).toBeNull();
    expect(db.prepare('SELECT * FROM outbox').all()).toEqual([]);
    expect(db.prepare('SELECT * FROM command_receipts').all()).toEqual([]);
    db.exec('DROP TRIGGER simulated_outage');
    expect(await grant('retry-after-recovery')).toEqual({ userId: 'partner', version: 1 });
  });
});
