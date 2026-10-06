import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { WorkerRunner, type OutboxJob, serviceId } from '../apps/worker/runner.ts';
import type { Database } from '../apps/api/database.ts';
import type { Engine } from '../apps/api/engine.ts';
import type { Data, Entity } from '../packages/domain/core.ts';

const fixedTime = new Date('2026-10-06T18:00:00.000Z');
const company = 'synthetic-retention-tenant';

/** Database boundary double: verifies orchestration, never claims to execute PostgreSQL. */
function workerBoundary() {
  const trace: { operation: string; companyId?: string; params?: unknown[] }[] = [];
  const users: Entity[] = [];
  const points: { companyId: string; expiresAt: string; id: string }[] = [];
  let failGuard = false;
  let failPurge = false;
  let waitPurge: Promise<void> | undefined;
  let queued = true;
  const job: OutboxJob = { id: 'safe-noop-event', company_id: company, type: 'unknown.safe-event', data: {}, attempts: 1, lease_token: 'synthetic-lease', leased_until: new Date(fixedTime.getTime() + 120_000) };
  const tx = {
    companyId: company,
    list: async (kind: string) => {
      trace.push({ operation: `read:${kind}` });
      if (kind === 'user') return users;
      if (kind === 'order') return [{ id: 'approved-order', data: { siteId: 'site', customerId: 'customer', status: 'IN_PROGRESS' } }];
      return [];
    },
    add: async (kind: string, data: Data, id: string) => {
      trace.push({ operation: `write:${kind}` });
      const entity = { id, kind, companyId: company, version: 1, data, createdAt: fixedTime.toISOString(), updatedAt: fixedTime.toISOString() };
      users.push(entity);
      return entity;
    },
    query: async (_sql: string, params: unknown[]) => {
      trace.push({ operation: 'scheduled-business-event', companyId: String(params[1]), params });
      return { rows: [] };
    },
  };
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.startsWith('SELECT knaba_assert_gps_storage_safe')) {
        trace.push({ operation: 'storage-safety-guard' });
        if (failGuard) throw new Error('GPS_LEGACY_STORAGE_UNSAFE');
        return { rows: [] };
      }
      if (sql.startsWith('SELECT knaba_purge_gps')) {
        trace.push({ operation: 'purge', params });
        if (failPurge) throw new Error('RETENTION_DATABASE_FAILURE');
        await waitPurge;
        // Read the function's batch bound and time/company arguments at the adapter boundary.
        const limit = Number(sql.match(/timestamptz,(\d+),/)?.[1]);
        expect(limit).toBe(500);
        const purgeTime = String(params?.[0]);
        const purgeCompany = String(params?.[1]);
        let removed = 0;
        for (let i = points.length - 1; i >= 0 && removed < limit; i--) {
          if (points[i]!.companyId === purgeCompany && points[i]!.expiresAt <= purgeTime) {
            points.splice(i, 1);
            removed++;
          }
        }
        return { rows: [{ purged: removed }] };
      }
      if (sql.includes('RETURNING o.*')) {
        trace.push({ operation: 'claim-outbox', params });
        if (queued) { queued = false; return { rows: [job] }; }
        return { rows: [] };
      }
      if (sql.includes('UPDATE outbox SET status=')) {
        trace.push({ operation: 'finish-outbox', params });
        return { rows: [{ id: job.id }] };
      }
      throw new Error('UNEXPECTED_SQL_IN_BOUNDARY_DOUBLE');
    },
    transaction: async (companyId: string, _actor: string, handler: (transaction: typeof tx) => Promise<unknown>) => {
      trace.push({ operation: 'transaction', companyId });
      expect(companyId).toBe(company);
      return handler(tx);
    },
  };
  const runner = new WorkerRunner(db as unknown as Database, {} as Engine, { companyId: company, appMode: 'TEST', now: () => fixedTime });
  return { runner, trace, users, points, guardFails: (value: boolean) => { failGuard = value; }, purgeFails: (value: boolean) => { failPurge = value; }, deferPurge: (value: Promise<void> | undefined) => { waitPurge = value; } };
}

describe('worker privacy gate orchestration (CPU boundary doubles)', () => {
  it('unsafe legacy GPS storage prevents service account creation and all business writes', async () => {
    const boundary = workerBoundary();
    boundary.guardFails(true);
    await expect(boundary.runner.initialize()).rejects.toThrow('GPS_LEGACY_STORAGE_UNSAFE');
    expect(boundary.trace.map(t => t.operation)).toEqual(['storage-safety-guard']);
    expect(boundary.users).toHaveLength(0);
  });

  it('verified storage permits only the disabled-credential worker service account bootstrap', async () => {
    const boundary = workerBoundary();
    await boundary.runner.initialize();
    expect(boundary.trace[0]!.operation).toBe('storage-safety-guard');
    expect(boundary.users).toHaveLength(1);
    expect(boundary.users[0]).toMatchObject({ id: serviceId, data: { roles: ['SERVICE_ACCOUNT'], credentialDisabled: true, siteIds: [], customerIds: [], warehouseIds: [] } });
    expect(boundary.users[0]!.data.permissions).not.toContain('location.history.read');
    await boundary.runner.initialize();
    expect(boundary.users).toHaveLength(1);
  });

  it('expires only this company in one bounded batch before scheduled reports or queued business effects', async () => {
    const boundary = workerBoundary();
    for (let n = 0; n < 503; n++) boundary.points.push({ companyId: company, expiresAt: '2026-10-06T17:59:59.999Z', id: `expired-${n}` });
    boundary.points.push({ companyId: company, expiresAt: '2026-10-06T18:00:00.001Z', id: 'still-lawful' });
    boundary.points.push({ companyId: 'other-company', expiresAt: '2026-01-01T00:00:00.000Z', id: 'foreign-point' });
    await expect(boundary.runner.tick()).resolves.toEqual({ processed: 1 });
    expect(boundary.trace[0]).toEqual({ operation: 'purge', params: [fixedTime.toISOString(), company] });
    expect(boundary.trace.filter(t => t.operation === 'purge')).toHaveLength(1);
    expect(boundary.points.filter(p => p.companyId === company && p.id.startsWith('expired-'))).toHaveLength(3);
    expect(boundary.points.map(p => p.id)).toContain('still-lawful');
    expect(boundary.points.map(p => p.id)).toContain('foreign-point');
    const operations = boundary.trace.map(t => t.operation);
    expect(operations.indexOf('scheduled-business-event')).toBeGreaterThan(operations.indexOf('purge'));
    expect(operations.indexOf('claim-outbox')).toBeGreaterThan(operations.indexOf('scheduled-business-event'));
    expect(boundary.trace.find(t => t.operation === 'finish-outbox')!.params?.[0]).toBe('SUCCEEDED');
  });

  it('retention failure prevents scheduling, outbox claims and success; next tick can recover', async () => {
    const boundary = workerBoundary();
    boundary.purgeFails(true);
    await expect(boundary.runner.tick()).rejects.toThrow('RETENTION_DATABASE_FAILURE');
    expect(boundary.trace.map(t => t.operation)).toEqual(['purge']);
    boundary.purgeFails(false);
    await expect(boundary.runner.tick()).resolves.toEqual({ processed: 1 });
    expect(boundary.trace.filter(t => t.operation === 'scheduled-business-event')).toHaveLength(1);
    expect(boundary.trace.filter(t => t.operation === 'claim-outbox')).toHaveLength(1);
    expect(boundary.trace.filter(t => t.operation === 'finish-outbox')).toHaveLength(1);
  });

  it('an overlapping tick cannot bypass a pending purge and stop prevents new retention/business work', async () => {
    const boundary = workerBoundary();
    let release!: () => void;
    boundary.deferPurge(new Promise<void>(resolve => { release = resolve; }));
    const active = boundary.runner.tick();
    await expect(boundary.runner.tick()).resolves.toEqual({ processed: 0 });
    expect(boundary.trace.map(t => t.operation)).toEqual(['purge']);
    release();
    await active;
    boundary.runner.stop();
    const operationCount = boundary.trace.length;
    await expect(boundary.runner.tick()).resolves.toEqual({ processed: 0 });
    expect(boundary.trace).toHaveLength(operationCount);
  });
});

const temporaryDirectories: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

/** Runs the unmodified restore entrypoint with explicit mocked PostgreSQL/pg_restore adapters. */
async function mockRestore(scenario: { guardError?: boolean; corruptBlob?: boolean; wrongCounts?: boolean; purgeCounts?: unknown[]; defaultPurge?: unknown }) {
  const directory = await mkdtemp(join(tmpdir(), 'knaba-restore-orchestration-'));
  temporaryDirectories.push(directory);
  const journal = join(directory, 'journal.jsonl');
  const fixture = join(directory, 'fixture.json');
  const preload = join(directory, 'preload.mjs');
  const dump = Buffer.from('synthetic dump bytes, not a PostgreSQL archive');
  const blob = Buffer.from('synthetic private image bytes');
  const originalCounts = [{ schema: 'public', table: 'aggregates', count: '1' }, { schema: 'public', table: 'private_blobs', count: '1' }];
  await writeFile(join(directory, 'database.dump'), dump);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ format: 'KNABA_DE_ENCRYPTED_BACKUP_V1', sourceIdentityHash: createHash('sha256').update('source.test:5432/source_db').digest('hex'), dumpSha256: createHash('sha256').update(dump).digest('hex'), tableCounts: originalCounts, privateBlobs: [{ company_id: company, key: 'synthetic-blob', sha256: createHash('sha256').update(blob).digest('hex'), byte_size: blob.length }], storageMode: 'POSTGRES_PRIVATE_BLOB_FALLBACK' }));
  await writeFile(fixture, JSON.stringify({ ...scenario, originalCounts, blobBase64: blob.toString('base64'), blobHash: createHash('sha256').update(blob).digest('hex') }));
  const stateModule = `
    import {readFileSync,appendFileSync} from 'node:fs';
    export const scenario=JSON.parse(readFileSync(process.env.KNABA_QA_SCENARIO,'utf8'));
    export const log=(operation,data={})=>appendFileSync(process.env.KNABA_QA_JOURNAL,JSON.stringify({operation,...data})+'\\n');
  `;
  const stateUrl = `data:text/javascript,${encodeURIComponent(stateModule)}`;
  const pgModule = `
    import {scenario,log} from ${JSON.stringify(stateUrl)};
    let purges=0;
    export class Client {
      async connect(){log('connect');}
      async end(){log('disconnect');}
      async query(sql,params){
        if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'){log(sql);return {rows:[]};}
        if(sql.startsWith('SELECT knaba_assert_gps_storage_safe')){log('guard');if(scenario.guardError)throw new Error('GPS_LEGACY_STORAGE_UNSAFE');return {rows:[]};}
        if(sql.startsWith('SELECT knaba_purge_gps')){log('purge',{sql});const n=purges++;return {rows:[{purged:n<(scenario.purgeCounts??[]).length?scenario.purgeCounts[n]:scenario.defaultPurge??0}]};}
        if(sql.startsWith('SELECT content,sha256 FROM private_blobs')){log('verify-original-blob');return {rows:[{content:Buffer.from(scenario.corruptBlob?'corrupt':scenario.blobBase64,scenario.corruptBlob?'utf8':'base64'),sha256:scenario.blobHash}]};}
        if(sql.includes('SELECT count(*)::text AS count FROM aggregates')){log('verify-media-references');return {rows:[{count:'0'}]};}
        if(sql.startsWith('SET LOCAL')){log('timeout');return {rows:[]};}
        log('apply-current-migration');return {rows:[]};
      }
    }
  `;
  const toolsModule = `
    import {scenario,log} from ${JSON.stringify(stateUrl)};
    let counts=0;
    export function fail(code){throw new Error(code);}
    export function databaseIdentity(value){const u=new URL(value);return u.hostname.toLowerCase()+':'+(u.port||'5432')+u.pathname;}
    export async function pgCommand(binary,args,url,options){log('mock-pg-restore',{binary,args});}
    export async function tableCounts(){log(counts===0?'verify-empty-target':'verify-original-counts');return counts++===0?[]:scenario.wrongCounts?[]:scenario.originalCounts;}
  `;
  await writeFile(preload, `import {registerHooks} from 'node:module';
    const pg=${JSON.stringify(`data:text/javascript,${encodeURIComponent(pgModule)}`)}, tools=${JSON.stringify(`data:text/javascript,${encodeURIComponent(toolsModule)}`)};
    registerHooks({resolve(specifier,context,nextResolve){if(specifier==='pg')return {url:pg,shortCircuit:true};if(specifier.endsWith('/pg-tools.mjs'))return {url:tools,shortCircuit:true};return nextResolve(specifier,context);}});
  `);
  // File-backed stdio avoids the managed environment's forbidden pipe sockets.
  const stdoutPath = join(directory, 'stdout.txt'), stderrPath = join(directory, 'stderr.txt');
  const stdoutFd = openSync(stdoutPath, 'w'), stderrFd = openSync(stderrPath, 'w');
  let result: ReturnType<typeof spawnSync>;
  try {
    result = spawnSync(process.execPath, ['--import', preload, 'scripts/restore-db.mjs', directory, '--confirm-empty'], { cwd: process.cwd(), timeout: 15_000, stdio: ['ignore', stdoutFd, stderrFd], env: { ...process.env, RESTORE_DATABASE_URL: 'postgres://synthetic:synthetic@target.test:5432/empty_synthetic_db', KNABA_QA_SCENARIO: fixture, KNABA_QA_JOURNAL: journal } });
  } finally { closeSync(stdoutFd); closeSync(stderrFd); }
  expect(result.error).toBeUndefined();
  const events = (await readFile(journal, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { operation: string; sql?: string });
  return { ...result, stdout: await readFile(stdoutPath, 'utf8'), stderr: await readFile(stderrPath, 'utf8'), events };
}

describe('restore privacy orchestration (mock PG transport; not a database restore proof)', () => {
  it('verifies original row/blob integrity before migration, drains bounded batches, then commits and reports success', async () => {
    const result = await mockRestore({ purgeCounts: [500, 2, 0] });
    expect(result.status).toBe(0);
    const steps = result.events.map(e => e.operation);
    expect(steps.indexOf('verify-original-counts')).toBeLessThan(steps.indexOf('BEGIN'));
    expect(steps.indexOf('verify-original-blob')).toBeLessThan(steps.indexOf('BEGIN'));
    expect(steps.indexOf('verify-media-references')).toBeLessThan(steps.indexOf('BEGIN'));
    expect(steps.indexOf('apply-current-migration')).toBeLessThan(steps.indexOf('guard'));
    expect(steps.indexOf('guard')).toBeLessThan(steps.indexOf('purge'));
    expect(result.events.filter(e => e.operation === 'purge')).toHaveLength(3);
    expect(result.events.filter(e => e.operation === 'purge').every(e => e.sql?.includes('now(),500,NULL'))).toBe(true);
    expect(steps.indexOf('COMMIT')).toBeGreaterThan(steps.lastIndexOf('purge'));
    expect(steps).not.toContain('ROLLBACK');
    expect(result.stdout).toContain('502 expired GPS points purged before access');
  });

  it('unsafe restored legacy storage rolls back and never purges or announces success', async () => {
    const result = await mockRestore({ guardError: true });
    expect(result.status).toBe(1);
    expect(result.events.map(e => e.operation)).toContain('ROLLBACK');
    expect(result.events.map(e => e.operation)).not.toContain('purge');
    expect(result.events.map(e => e.operation)).not.toContain('COMMIT');
    expect(result.stderr).toContain('FAILED: GPS_LEGACY_STORAGE_UNSAFE');
    expect(result.stdout).not.toContain('PASSED');
  });

  it.each([null, -1, 501, 'NaN', '1.2'])('invalid purge result %s fails closed instead of committing restoration', async count => {
    const result = await mockRestore({ purgeCounts: [count] });
    expect(result.status).toBe(1);
    expect(result.events.map(e => e.operation)).toContain('ROLLBACK');
    expect(result.events.map(e => e.operation)).not.toContain('COMMIT');
    expect(result.stderr).toContain('FAILED: RESTORE_GPS_PURGE_RESULT_INVALID');
    expect(result.stdout).not.toContain('PASSED');
  });

  it('a never-drained expiry backlog is bounded and rolls back without false success', async () => {
    const result = await mockRestore({ defaultPurge: 500 });
    expect(result.status).toBe(1);
    expect(result.events.filter(e => e.operation === 'purge')).toHaveLength(1000);
    expect(result.events.map(e => e.operation)).toContain('ROLLBACK');
    expect(result.events.map(e => e.operation)).not.toContain('COMMIT');
    expect(result.stderr).toContain('FAILED: RESTORE_GPS_PURGE_BATCH_LIMIT');
    expect(result.stdout).not.toContain('PASSED');
  });

  it.each([{ wrongCounts: true, error: 'RESTORED_TABLE_COUNTS_MISMATCH' }, { corruptBlob: true, error: 'RESTORED_PRIVATE_BLOB_CHECKSUM_MISMATCH' }])('original backup corruption $error prevents migration and safety-phase commit', async scenario => {
    const result = await mockRestore(scenario);
    expect(result.status).toBe(1);
    expect(result.events.map(e => e.operation)).not.toContain('BEGIN');
    expect(result.events.map(e => e.operation)).not.toContain('apply-current-migration');
    expect(result.events.map(e => e.operation)).not.toContain('COMMIT');
    expect(result.stderr).toContain(`FAILED: ${scenario.error}`);
    expect(result.stdout).not.toContain('PASSED');
  });
});
