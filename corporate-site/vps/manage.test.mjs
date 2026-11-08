import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openLocalDatabase} from './database.mjs';
import {inspectMigrationSequence} from './migration-guard.mjs';
const expectedMigrations=inspectMigrationSequence(new URL('../drizzle/',import.meta.url).pathname).names;
const run=(db,cmd)=>spawnSync(process.execPath,[new URL('./manage.mjs',import.meta.url).pathname,cmd],
  {env:{...process.env,KNABA_DB_PATH:db},encoding:'utf8',timeout:20000});
test('audit never bootstraps missing customer database',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-audit-'));
  try{
    const file=join(dir,'missing.sqlite');
    const r=run(file,'audit');
    assert.notEqual(r.status,0);
    await assert.rejects(stat(file),{code:'ENOENT'});
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('audit is genuinely read-only, migration count and integrity verified',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-audit-'));
  try{
    const file=join(dir,'existing.sqlite');
    const prepared=openLocalDatabase(file);
    assert.deepEqual(prepared.migrations,expectedMigrations);
    prepared.db.close();
    const before=createHash('sha256').update(await readFile(file)).digest('hex');
    const result=run(file,'audit');
    assert.equal(result.status,0,result.stderr);
    const parsed=JSON.parse(result.stdout);
    assert.equal(parsed.integrity,'ok');
    assert.deepEqual(parsed.migrations.map(row=>row.filename),expectedMigrations);
    assert.ok(parsed.tables.includes('studio_pages'));
    assert.ok(parsed.tables.includes('crm_contact_state'));
    const after=createHash('sha256').update(await readFile(file)).digest('hex');
    assert.equal(after,before);
  }finally{await rm(dir,{recursive:true,force:true});}
});
