import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backup} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openLocalDatabase} from './database.mjs';
import {inspectMigrationSequence} from './migration-guard.mjs';

test('0012 adds private conversations without rewriting historical data or migration receipts',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'knaba-message-upgrade-'));
  let live,restored;
  try {
    const source=new URL('../drizzle/',import.meta.url),baseline=join(dir,'baseline');
    mkdirSync(join(baseline,'meta'),{recursive:true});
    const oldNames=inspectMigrationSequence(source.pathname).names.filter(name=>!name.startsWith('0012_'));
    for(const name of oldNames)copyFileSync(new URL(name,source),join(baseline,name));
    const journal=JSON.parse(readFileSync(new URL('meta/_journal.json',source),'utf8'));
    journal.entries=journal.entries.filter(entry=>entry.idx<12);
    writeFileSync(join(baseline,'meta/_journal.json'),JSON.stringify(journal));
    const file=join(dir,'synthetic.sqlite');
    live=openLocalDatabase(file,{migrationDirectory:baseline});
    live.db.exec("INSERT INTO profiles VALUES('synthetic-worker','Synthetic Worker','worker@example.test','worker','worker','approved','2026-10-28','2026-10-28T00:00:00Z','2026-10-28T00:00:00Z',1,'seed'); INSERT INTO portal_audit VALUES('seed-event','synthetic-worker','profile.registered','synthetic-worker','2026-10-28T00:00:00Z')");
    const ledger=live.db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all().map(row=>({...row}));
    const profile=live.db.prepare('SELECT * FROM profiles').all().map(row=>({...row}));
    const audit=live.db.prepare('SELECT * FROM portal_audit').all().map(row=>({...row}));
    live.db.close();live=undefined;
    assert.throws(()=>openLocalDatabase(file,{allowMigrations:false}),/Pending schema migration 0012_portal_messages/);
    live=openLocalDatabase(file);
    assert.deepEqual(live.db.prepare('SELECT * FROM profiles').all().map(row=>({...row})),profile);
    assert.deepEqual(live.db.prepare('SELECT * FROM portal_audit').all().map(row=>({...row})),audit);
    assert.deepEqual(live.db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all().slice(0,12).map(row=>({...row})),ledger);
    assert.equal(live.db.prepare('SELECT count(*) AS n FROM portal_conversations').get().n,0);
    live.db.exec("INSERT INTO portal_conversations VALUES('synthetic-thread','synthetic-worker','worker',NULL,'direct','2026-10-28T00:00:00Z','2026-10-28T00:00:00Z')");
    live.db.prepare('INSERT INTO portal_messages(id,conversation_id,author_id,author_name,author_role,body,idempotency_key,payload_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run('synthetic-message','synthetic-thread','synthetic-worker','Synthetic Worker','worker','Synthetic test message','synthetic_retry_001','synthetic-hash','2026-10-28T00:00:00Z');
    await backup(live.db,join(dir,'restore.sqlite'));
    restored=openLocalDatabase(join(dir,'restore.sqlite'),{allowMigrations:false});
    assert.equal(restored.db.prepare('SELECT body FROM portal_messages').get().body,'Synthetic test message');
    assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(restored.db.prepare('PRAGMA foreign_key_check').all(),[]);
    live.db.close();live=openLocalDatabase(file,{allowMigrations:false});
    assert.equal(live.db.prepare('SELECT count(*) AS n FROM vps_schema_migrations').get().n,13);
    assert.equal(live.db.prepare('SELECT count(*) AS n FROM portal_messages').get().n,1);
  } finally {
    restored?.db.close();live?.db.close();rmSync(dir,{recursive:true,force:true});
  }
});
