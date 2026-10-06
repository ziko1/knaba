import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
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
async function mockRestore(scenario: { guardError?: boolean; corruptBlob?: boolean; wrongCounts?: boolean; purgeCounts?: unknown[]; defaultPurge?: unknown; production?: boolean; missingLedger?: boolean; ledgerInsideBackup?: boolean; ledgerBadChecksum?: boolean; ledgerAgeMs?: number; ledgerWrongSource?: boolean; ledgerMissingCompany?: boolean; laterErasure?: boolean; restoredErasure?: boolean; syntheticHost?: string; privacyRequests?: number; permits?: number; postMigrationPermits?:number; corruptPrivacyProof?:boolean }) {
  const directory = await mkdtemp(join(tmpdir(), 'knaba-restore-orchestration-'));
  temporaryDirectories.push(directory);
  const journal = join(directory, 'journal.jsonl');
  const fixture = join(directory, 'fixture.json');
  const preload = join(directory, 'preload.mjs');
  const dump = Buffer.from('synthetic dump bytes, not a PostgreSQL archive');
  const blob = Buffer.from('synthetic private image bytes');
  const planHash='a'.repeat(64),sourceIdentityHash=createHash('sha256').update('source.test:5432/source_db').digest('hex');
  const erasureManifest={companyId:company,requestId:'privacy-request-1',planHash,actions:[{type:'REDACT_AGGREGATE',companyId:company,kind:'message',id:'source-message',version:1,replacement:{state:'ERASED',text:''}}]};
  const canonical=(value:any):string=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  const erasureRow={company_id:company,request_id:'privacy-request-1',plan_hash:planHash,manifest:erasureManifest,manifest_sha256:createHash('sha256').update(canonical(erasureManifest)).digest('hex')};
  const originalCounts = [{ schema: 'public', table: 'aggregates', count: '1' }, { schema: 'public', table: 'private_blobs', count: '1' }, {schema:'public',table:'privacy_blob_deletions',count:'0'}, {schema:'public',table:'privacy_erasure_manifests',count:scenario.restoredErasure?'1':'0'}, {schema:'public',table:'privacy_revision_permits',count:String(scenario.permits??0)}];
  await writeFile(join(directory, 'database.dump'), dump);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ format: 'KNABA_DE_ENCRYPTED_BACKUP_V1',createdAt:new Date(Date.now()-2*3600000).toISOString(),sourceIdentityHash, dumpSha256: createHash('sha256').update(dump).digest('hex'), tableCounts: originalCounts,privacyLedger:scenario.corruptPrivacyProof?{version:'KNABA_DE_PRIVACY_BACKUP_LEDGER_V1',schemaPresent:true,transientPermitsExcluded:true,permitsCount:'0',manifestsCount:'0',manifestsSha256:'0'.repeat(64),blobDeletionsCount:'0',blobDeletionsSha256:'0'.repeat(64)}:undefined, privateBlobs: [{ company_id: company, key: 'synthetic-blob', sha256: createHash('sha256').update(blob).digest('hex'), byte_size: blob.length }], storageMode: 'POSTGRES_PRIVATE_BLOB_FALLBACK' }));
  const ledgerDirectory=await mkdtemp(join(tmpdir(),'knaba-current-erasure-ledger-'));temporaryDirectories.push(ledgerDirectory);
  const ledgerPath=join(scenario.ledgerInsideBackup?directory:ledgerDirectory,'current-ledger.json');
  const ledgerBytes=JSON.stringify({format:'KNABA_DE_CURRENT_ERASURE_LEDGER_V1',exportedAt:new Date(Date.now()-(scenario.ledgerAgeMs??0)).toISOString(),sourceIdentityHash:scenario.ledgerWrongSource?'b'.repeat(64):sourceIdentityHash,companyIds:scenario.ledgerMissingCompany?['another-company']:[company],manifests:scenario.laterErasure||scenario.restoredErasure?[erasureRow]:[],blobDeletions:[]});
  await writeFile(ledgerPath,ledgerBytes,{mode:0o600});
  await writeFile(fixture, JSON.stringify({ ...scenario,originalCounts,company,erasureRow,blobBase64: blob.toString('base64'), blobHash: createHash('sha256').update(blob).digest('hex') }));
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
        if(sql.includes('information_schema.columns'))return {rows:[{table_name:'aggregates'},{table_name:'privacy_erasure_manifests'}]};
        if(sql.startsWith('SELECT DISTINCT company_id'))return {rows:[{company_id:scenario.company}]};
        if(sql.includes('AS privacy_request_count'))return {rows:[{privacy_request_count:String(scenario.privacyRequests??0)}]};
        if(sql.includes('AS permit_count')){log('verify-empty-privacy-permits');return {rows:[{permit_count:String(scenario.postMigrationPermits??scenario.permits??0)}]};}
        if(sql.startsWith('SELECT company_id,request_id,plan_hash,manifest,manifest_sha256')){log('verify-erasure-ledger');return {rows:scenario.restoredErasure?[scenario.erasureRow]:[]};}
        if(sql.startsWith('SELECT id,company_id,request_id,plan_hash,blob_key'))return {rows:[]};
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
    export function quotedIdentifier(value){return '"'+String(value).replaceAll('"','""')+'"';}
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
    result = spawnSync(process.execPath, ['--import', preload, 'scripts/restore-db.mjs', directory, '--confirm-empty'], { cwd: process.cwd(), timeout: 15_000, stdio: ['ignore', stdoutFd, stderrFd], env: { ...process.env,APP_MODE:'TEST',RESTORE_SYNTHETIC_ISOLATED:scenario.production?'false':'true',RESTORE_CURRENT_ERASURE_LEDGER_FILE:scenario.missingLedger?'':ledgerPath,RESTORE_CURRENT_ERASURE_LEDGER_SHA256:scenario.ledgerBadChecksum?'0'.repeat(64):createHash('sha256').update(ledgerBytes).digest('hex'),RESTORE_DATABASE_URL:`postgres://synthetic:synthetic@${scenario.syntheticHost??'127.0.0.1'}:5432/empty_synthetic_db`, KNABA_QA_SCENARIO: fixture, KNABA_QA_JOURNAL: journal } });
  } finally { closeSync(stdoutFd); closeSync(stderrFd); }
  expect(result.error).toBeUndefined();
  const events = (await readFile(journal, 'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { operation: string; sql?: string });
  return { ...result, stdout: await readFile(stdoutPath, 'utf8'), stderr: await readFile(stderrPath, 'utf8'), events };
}

describe('restore privacy orchestration (mock PG transport; not a database restore proof)', () => {
  it('production restoration requires an independent current ledger before touching the empty destination',async()=>{
    const result=await mockRestore({production:true,missingLedger:true});
    expect(result.status).toBe(1);expect(result.stderr).toContain('RESTORE_CURRENT_ERASURE_LEDGER_REQUIRED');
    expect(result.events.map(e=>e.operation)).not.toContain('mock-pg-restore');expect(result.stdout).not.toContain('PASSED');
  });
  it.each([
    {ledgerInsideBackup:true,error:'RESTORE_ERASURE_LEDGER_MUST_BE_INDEPENDENT'},
    {ledgerBadChecksum:true,error:'RESTORE_ERASURE_LEDGER_CHECKSUM_MISMATCH'},
    {ledgerAgeMs:3600001,error:'RESTORE_ERASURE_LEDGER_NOT_CURRENT'},
    {ledgerWrongSource:true,error:'RESTORE_ERASURE_LEDGER_INVALID'},
  ])('production ledger $error is rejected before restoring any data',async scenario=>{
    const result=await mockRestore({production:true,...scenario});expect(result.status).toBe(1);
    expect(result.stderr).toContain(scenario.error);expect(result.events.map(e=>e.operation)).not.toContain('mock-pg-restore');expect(result.stdout).not.toContain('PASSED');
  });
  it('all restored companies require coverage by the authoritative current ledger',async()=>{
    const result=await mockRestore({production:true,ledgerMissingCompany:true});expect(result.status).toBe(1);
    expect(result.stderr).toContain('RESTORE_ERASURE_LEDGER_COMPANY_COVERAGE_REQUIRED');expect(result.events.map(e=>e.operation)).not.toContain('apply-current-migration');
  });
  it('a later independently recorded erasure blocks an older backup without pretending to replay redaction',async()=>{
    const result=await mockRestore({production:true,laterErasure:true});expect(result.status).toBe(1);
    expect(result.stderr).toContain('RESTORE_ERASURE_RECONCILIATION_REQUIRED');expect(result.events.map(e=>e.operation)).not.toContain('apply-current-migration');
    expect(result.events.map(e=>e.operation)).not.toContain('COMMIT');expect(result.stdout).not.toContain('PASSED');
  });
  it('current canonical erasure manifest matching the restored durable ledger passes without external deletions',async()=>{
    const result=await mockRestore({production:true,restoredErasure:true});expect(result.status).toBe(0);
    expect(result.events.map(e=>e.operation)).toContain('verify-erasure-ledger');expect(result.events.map(e=>e.operation)).toContain('verify-empty-privacy-permits');
    expect(result.stdout).toContain('independent current authority matched');
  });
  it('durable privacy content proof is checked even when table counts and dump checksum match',async()=>{
    const result=await mockRestore({corruptPrivacyProof:true});expect(result.status).toBe(1);expect(result.stderr).toContain('RESTORED_PRIVACY_LEDGER_CHECKSUM_MISMATCH');
    expect(result.events.map(e=>e.operation)).not.toContain('apply-current-migration');expect(result.stdout).not.toContain('PASSED');
  });
  it('a transient permit appearing in the safety phase rolls back before any GPS purge or access success',async()=>{
    const result=await mockRestore({postMigrationPermits:1});expect(result.status).toBe(1);expect(result.stderr).toContain('PRIVACY_TRANSIENT_PERMITS_NOT_EMPTY');
    expect(result.events.map(e=>e.operation)).toContain('ROLLBACK');expect(result.events.map(e=>e.operation)).not.toContain('purge');expect(result.stdout).not.toContain('PASSED');
  });
  it.each([
    {syntheticHost:'target.test',error:'RESTORE_SYNTHETIC_REQUIRES_ISOLATED_LOOPBACK'},
    {privacyRequests:1,error:'RESTORE_SYNTHETIC_PRIVACY_HISTORY_FORBIDDEN'},
    {restoredErasure:true,error:'RESTORE_SYNTHETIC_PRIVACY_HISTORY_FORBIDDEN'},
    {permits:1,error:'PRIVACY_TRANSIENT_PERMITS_NOT_EMPTY'},
  ])('synthetic bypass fails closed for $error',async scenario=>{
    const result=await mockRestore(scenario);expect(result.status).toBe(1);expect(result.stderr).toContain(scenario.error);
    expect(result.events.map(e=>e.operation)).not.toContain('COMMIT');expect(result.stdout).not.toContain('PASSED');
  });
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

/** Executes the real backup CLI with a captured dump transport, never PostgreSQL. */
async function mockPrivacyBackup(scenario:{permits?:number;corruptManifest?:boolean;exporting?:boolean;existingExport?:boolean}={}){
  const directory=await mkdtemp(join(tmpdir(),'knaba-privacy-backup-'));temporaryDirectories.push(directory);
  const journal=join(directory,'journal.jsonl'),fixture=join(directory,'fixture.json'),preload=join(directory,'preload.mjs');
  const planHash='a'.repeat(64),payload={companyId:company,requestId:'request1',planHash,actions:[{type:'REDACT_AGGREGATE',replacement:{text:'',state:'ERASED'}}]};
  // Literal independent canonical form: object-key order in jsonb is irrelevant.
  const canonical='{"actions":[{"replacement":{"state":"ERASED","text":""},"type":"REDACT_AGGREGATE"}],"companyId":'+JSON.stringify(company)+',"planHash":'+JSON.stringify(planHash)+',"requestId":"request1"}';
  const manifests=[{company_id:company,request_id:'request1',plan_hash:planHash,manifest:scenario.corruptManifest?{...payload,actions:[{replacement:{text:'unredacted'}}]}:payload,manifest_sha256:createHash('sha256').update(canonical).digest('hex')}];
  const blobDeletions=[{id:'delete1',company_id:company,request_id:'request1',plan_hash:planHash,blob_key:'private-erased-object',expected_sha256:'b'.repeat(64),subject_user_id:'own-subject',provider_identity:'c'.repeat(64),status:'PENDING',attempts:1,created_at_epoch:'1790000000.000000',verified_at_epoch:null}];
  const counts=[{schema:'public',table:'aggregates',count:'2'},{schema:'public',table:'privacy_blob_deletions',count:'1'},{schema:'public',table:'privacy_erasure_manifests',count:'1'},{schema:'public',table:'privacy_revision_permits',count:String(scenario.permits??0)}];
  await writeFile(fixture,JSON.stringify({manifests,blobDeletions,counts,company}));
  const state=`import {readFileSync,appendFileSync} from 'node:fs';export const fixture=JSON.parse(readFileSync(process.env.KNABA_QA_SCENARIO,'utf8'));export const log=(operation,data={})=>appendFileSync(process.env.KNABA_QA_JOURNAL,JSON.stringify({operation,...data})+'\\n');`,stateUrl=`data:text/javascript,${encodeURIComponent(state)}`;
  const pg=`import {fixture,log} from ${JSON.stringify(stateUrl)};export class Client{async connect(){log('connect');}async end(){log('disconnect');}async query(sql){log('query',{sql});if(sql.startsWith('SELECT company_id,request_id,plan_hash,manifest,manifest_sha256'))return {rows:fixture.manifests};if(sql.startsWith('SELECT id,company_id,request_id,plan_hash,blob_key'))return {rows:fixture.blobDeletions};if(sql.includes('information_schema.columns'))return {rows:[{table_name:'aggregates'}]};if(sql.startsWith('SELECT DISTINCT company_id'))return {rows:[{company_id:'synthetic-other-company'},{company_id:fixture.company}]};if(sql==='SHOW server_version')return {rows:[{server_version:'17.6'}]};if(sql.startsWith('SELECT pg_export_snapshot'))return {rows:[{snapshot:'synthetic-consistent-snapshot'}]};return {rows:[]};}}`;
  const tools=`import {writeFileSync} from 'node:fs';import {fixture,log} from ${JSON.stringify(stateUrl)};export function fail(code){throw new Error(code);}export function databaseIdentity(value){const u=new URL(value);return u.hostname+':'+(u.port||'5432')+u.pathname;}export function quotedIdentifier(value){return '"'+value+'"';}export async function tableCounts(){return fixture.counts;}export async function pgCommand(binary,args,url,options){log('captured-dump',{binary,args});writeFileSync(options.outputFile,'synthetic dump, no PostgreSQL execution',{mode:384,flag:'wx'});}`;
  await writeFile(preload,`import {registerHooks} from 'node:module';const pg=${JSON.stringify(`data:text/javascript,${encodeURIComponent(pg)}`)},tools=${JSON.stringify(`data:text/javascript,${encodeURIComponent(tools)}`)};registerHooks({resolve(specifier,context,nextResolve){if(specifier==='pg')return {url:pg,shortCircuit:true};if(specifier.endsWith('/pg-tools.mjs'))return {url:tools,shortCircuit:true};return nextResolve(specifier,context);}});`);
  const outputFile=join(directory,'current.json');if(scenario.existingExport)await writeFile(outputFile,'preserve existing authority',{mode:0o600});
  const stdoutPath=join(directory,'stdout'),stderrPath=join(directory,'stderr'),out=openSync(stdoutPath,'w'),err=openSync(stderrPath,'w');
  let result:ReturnType<typeof spawnSync>;
  try{result=spawnSync(process.execPath,['--import',preload,'scripts/backup-db.mjs',...(scenario.exporting?['--export-current-erasure-ledger',outputFile]:[directory])],{cwd:process.cwd(),timeout:15000,stdio:['ignore',out,err],env:{...process.env,DATABASE_URL:'postgres://synthetic:synthetic@source.test:5432/source_db',S3_BUCKET:'',KNABA_QA_SCENARIO:fixture,KNABA_QA_JOURNAL:journal}});}finally{closeSync(out);closeSync(err);}
  expect(result.error).toBeUndefined();
  return {...result,stdout:await readFile(stdoutPath,'utf8'),stderr:await readFile(stderrPath,'utf8'),directory,outputFile,events:(await readFile(journal,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))};
}
describe('durable privacy backup capture (mock dump transport; not real backup proof)',()=>{
  it('exports the consistent snapshot and explicitly excludes transient preimages while checksumming both durable ledgers',async()=>{
    const result=await mockPrivacyBackup();expect(result.status).toBe(0);
    const dumped=result.events.find(e=>e.operation==='captured-dump');
    expect(dumped.args).toContain('--exclude-table-data=public.privacy_revision_permits');expect(dumped.args).toContain('--snapshot=synthetic-consistent-snapshot');
    const manifest=JSON.parse(await readFile(join(result.directory,'manifest.json'),'utf8'));
    expect(manifest.privacyLedger).toMatchObject({version:'KNABA_DE_PRIVACY_BACKUP_LEDGER_V1',transientPermitsExcluded:true,permitsCount:'0',manifestsCount:'1',blobDeletionsCount:'1'});
    expect(manifest.privacyLedger.manifestsSha256).toMatch(/^[a-f0-9]{64}$/);expect(manifest.privacyLedger.blobDeletionsSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.companyIds).toEqual(['synthetic-other-company',company].sort());expect(manifest.tableCounts.map((row:any)=>row.table)).toContain('privacy_blob_deletions');
  });
  it.each([{permits:1,error:'PRIVACY_TRANSIENT_PERMITS_NOT_EMPTY'},{corruptManifest:true,error:'PRIVACY_MANIFEST_INTEGRITY_FAILED'}])('unsafe $error aborts before any archive capture',async scenario=>{
    const result=await mockPrivacyBackup(scenario);expect(result.status).toBe(1);expect(result.stderr).toContain(scenario.error);expect(result.events.some(e=>e.operation==='captured-dump')).toBe(false);expect(result.stdout).not.toContain('PASSED');
    await expect(readFile(join(result.directory,'manifest.json'))).rejects.toMatchObject({code:'ENOENT'});
  });
  it('exports a fresh private independently hashable authority without any dump or transient data',async()=>{
    const result=await mockPrivacyBackup({exporting:true});expect(result.status).toBe(0);const bytes=await readFile(result.outputFile),current=JSON.parse(bytes.toString());
    expect(current.format).toBe('KNABA_DE_CURRENT_ERASURE_LEDGER_V1');expect(current.companyIds).toContain(company);expect(current.manifests).toHaveLength(1);expect(current.blobDeletions[0]).toMatchObject({status:'PENDING',provider_identity:'c'.repeat(64)});
    expect(current.blobDeletions[0]).not.toHaveProperty('attempts');expect(current).not.toHaveProperty('privacy_revision_permits');expect((await stat(result.outputFile)).mode&0o777).toBe(0o600);
    expect(result.stdout).toContain('sha256='+createHash('sha256').update(bytes).digest('hex'));expect(result.events.some(e=>e.operation==='captured-dump')).toBe(false);
  });
  it('never overwrites an existing authority export',async()=>{
    const result=await mockPrivacyBackup({exporting:true,existingExport:true});expect(result.status).toBe(1);expect(await readFile(result.outputFile,'utf8')).toBe('preserve existing authority');expect(result.stdout).not.toContain('PASSED');
  });
});
