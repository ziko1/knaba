import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalDatabase} from './database.mjs';
import {readSession} from './auth.mjs';
import {openLocalDatabase as openLegacy} from './fixtures/federation-legacy-dc54/vps/database.mjs';
import {createCredentialsUser,createSessionForUser,readSession as readLegacySession} from './fixtures/federation-legacy-dc54/vps/auth.mjs';

const fixtureRoot=new URL('./fixtures/federation-legacy-dc54/',import.meta.url);
const legacyMigrations=new URL('drizzle/',fixtureRoot);
const canonicalMigrations=new URL('../drizzle/',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('legacy startup fixture pins exact dc54 source and all eighteen canonical migration inputs',()=>{
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',fixtureRoot),'utf8'));
  assert.equal(manifest.commit,'dc54f109c52e3b8f8a2e506821a6eb322b5417c4');
  assert.equal(manifest.files.length,22);
  for(const file of manifest.files){
    const bytes=readFileSync(new URL(file.path,fixtureRoot));
    assert.equal(bytes.length,file.bytes,file.path);assert.equal(sha(bytes),file.sha256,file.path);
    if(file.path.endsWith('.sql'))assert.deepEqual(readFileSync(new URL(file.path.slice(8),canonicalMigrations)),bytes,file.path);
  }
  const journal=JSON.parse(readFileSync(new URL('meta/_journal.json',legacyMigrations),'utf8'));
  assert.equal(journal.entries.length,18);assert.equal(journal.entries[17].tag,'0017_assistant_requests');
});

test('0018 is a no-op compatibility marker with the complete unchanged Assistant0017 schema snapshot',()=>{
  const previous=JSON.parse(readFileSync(new URL('meta/0017_snapshot.json',canonicalMigrations),'utf8'));
  const current=JSON.parse(readFileSync(new URL('meta/0018_snapshot.json',canonicalMigrations),'utf8'));
  assert.equal(Object.keys(current.tables).length,23);assert.notEqual(current.id,previous.id);assert.equal(current.prevId,previous.id);
  const withoutIds=({id,prevId,...schema})=>schema;
  assert.deepEqual(withoutIds(current),withoutIds(previous));
  const sql=readFileSync(new URL('0018_federation_runtime_barrier.sql',canonicalMigrations),'utf8');
  assert.equal(sql.replace(/^--.*$/gm,'').trim(),'SELECT 1;');
});

test('0018 refuses actual dc54 startup before a legacy cookie reader can bypass durable pending deny',t=>{
  const directory=mkdtempSync(join(tmpdir(),'knaba-federation-rollback-')),path=join(directory,'auth.sqlite');
  let current,legacy;t.after(()=>{current?.db.close();legacy?.db.close();rmSync(directory,{recursive:true,force:true});});
  // Start with the actual latest pre-F2 binary and its Assistant0017 ledger.
  legacy=openLegacy(path,{migrationDirectory:legacyMigrations});
  const user=createCredentialsUser(legacy.db,'rollback-fixture@example.test','synthetic-password-only');
  const session=createSessionForUser(legacy.db,user.id),cookie='__Host-knaba-session='+session.token;
  const receipts=legacy.db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all();
  assert.equal(receipts.length,18);assert.equal(receipts[17].filename,'0017_assistant_requests.sql');
  legacy.db.close();legacy=null;
  // Reproduce the read bypass with only F2 metadata, before the canonical barrier.
  current=openLocalDatabase(path,{migrationDirectory:legacyMigrations});
  current.db.prepare(`INSERT INTO vps_federation_operations(operation_id,subject,kind,scope,session_hashes,
    intent_hash,witness_json,pure_revocation,state,created_at,authorization_expires_at)
    VALUES(?,?,'REVOKE_SESSION','SESSION',?,?,'{}',1,'PENDING_DENY',0,300000)`)
    .run(randomUUID(),user.id,JSON.stringify([sha(session.token)]),'a'.repeat(64));
  assert.equal(readSession(current.db,cookie),null);
  legacy=openLegacy(path,{migrationDirectory:legacyMigrations,allowMigrations:false});
  assert.equal(readLegacySession(legacy.db,cookie)?.id,user.id,'metadata-only old startup really bypasses the pending read deny');
  legacy.db.close();legacy=null;
  const oldSessions=current.db.prepare('SELECT * FROM vps_sessions').all();
  const oldUsers=current.db.prepare('SELECT * FROM vps_users').all();
  current.db.close();current=null;
  current=openLocalDatabase(path);
  assert.equal(readSession(current.db,cookie),null);
  assert.deepEqual(current.db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename LIMIT 18').all(),receipts);
  assert.deepEqual(current.db.prepare('SELECT * FROM vps_sessions').all(),oldSessions);
  assert.deepEqual(current.db.prepare('SELECT * FROM vps_users').all(),oldUsers);
  for(const allowMigrations of [false,true]){
    assert.throws(()=>{
      const opened=openLegacy(path,{migrationDirectory:legacyMigrations,allowMigrations});
      opened.db.close();
    },/Unrecognized applied migration: 0018_federation_runtime_barrier\.sql/);
  }
  assert.equal(current.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
