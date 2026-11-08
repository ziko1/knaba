import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backup} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {openLocalDatabase} from './database.mjs';
import {inspectMigrationSequence} from './migration-guard.mjs';

const source=new URL('../drizzle/',import.meta.url);
test('0017 preserves legacy data without guessing origins, atomically links explicit requests and restores the graph',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'knaba-request-upgrade-')),file=join(dir,'state.sqlite'),baseline=join(dir,'baseline');let current,restored;
  try{
    mkdirSync(join(baseline,'meta'),{recursive:true});
    const names=inspectMigrationSequence(source.pathname).names;assert.equal(names[17],'0017_assistant_requests.sql');
    for(const name of names.slice(0,17))copyFileSync(new URL(name,source),join(baseline,name));
    const journal=JSON.parse(readFileSync(new URL('meta/_journal.json',source),'utf8'));journal.entries=journal.entries.slice(0,17);
    writeFileSync(join(baseline,'meta/_journal.json'),JSON.stringify(journal));
    current=openLocalDatabase(file,{migrationDirectory:baseline});
    const priorReceipts=current.db.prepare('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename').all();
    const conversation=randomUUID(),legacy=randomUUID(),created=new Date().toISOString();
    current.db.prepare("INSERT INTO assistant_conversations(id,token_hash,token_expires_at,locale,status,contact_email,privacy_version,created_at,updated_at) VALUES(?,?,?,'uk','human','synthetic@example.test','test',?,?)")
      .run(conversation,'a'.repeat(64),new Date(Date.now()+86400000).toISOString(),created,created);
    current.db.prepare(`INSERT INTO cleaning_requests(id,service,object_type,postcode,area,frequency,message,contact_name,email,phone,address,dedupe_scope,idempotency_key,payload_hash,privacy_version,created_at,updated_at,last_mutation)
      VALUES(?,'baureinigung','Baustelle','10115','100','Einmalig','Synthetic old message','Synthetic user','synthetic@example.test','','','public-old',?,'old-hash','test',?,?,?)`)
      .run(legacy,legacy,created,created,randomUUID());
    const legacyRow=current.db.prepare('SELECT * FROM cleaning_requests WHERE id=?').get(legacy);
    await backup(current.db,join(dir,'before.sqlite'));current.db.close();current=null;
    assert.throws(()=>openLocalDatabase(file,{allowMigrations:false}),/Pending schema migration 0017_assistant_requests.sql/);
    current=openLocalDatabase(file);
    assert.deepEqual(current.db.prepare('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename LIMIT 17').all(),priorReceipts);
    assert.deepEqual(current.db.prepare('SELECT * FROM cleaning_requests WHERE id=?').get(legacy),legacyRow);
    assert.equal(current.db.prepare('SELECT count(*) AS n FROM assistant_request_links').get().n,0);
    const id=randomUUID(),key=randomUUID(),mutation=randomUUID();
    const origin=()=>current.db.prepare('INSERT INTO assistant_request_links VALUES(?,?,?,?,?,?,?)').run(id,conversation,key,mutation,'explicit-test','["contact.email"]',created);
    assert.throws(origin,/FOREIGN KEY constraint failed/);assert.equal(current.db.prepare('SELECT count(*) AS n FROM assistant_request_links').get().n,0);
    current.db.exec('BEGIN IMMEDIATE');origin();
    const row={...legacyRow,id,dedupe_scope:'assistant:'+conversation,idempotency_key:key,last_mutation:mutation};
    current.db.prepare(`INSERT INTO cleaning_requests (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
    current.db.exec('COMMIT');
    assert.equal(current.db.prepare('SELECT request_id FROM assistant_request_links').get().request_id,id);
    for(const change of ["conversation_id='other'","request_key='other'","consent_fields_json='[]'","created_at='2000-01-01'"])
      assert.throws(()=>current.db.exec('UPDATE assistant_request_links SET '+change),/immutable/);
    assert.equal(current.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(current.db.prepare('PRAGMA foreign_key_check').all(),[]);
    await backup(current.db,join(dir,'after.sqlite'));restored=openLocalDatabase(join(dir,'after.sqlite'),{allowMigrations:false});
    assert.deepEqual(restored.db.prepare('SELECT * FROM assistant_request_links').all(),current.db.prepare('SELECT * FROM assistant_request_links').all());
    assert.deepEqual(restored.db.prepare('SELECT * FROM cleaning_requests ORDER BY id').all(),current.db.prepare('SELECT * FROM cleaning_requests ORDER BY id').all());
    assert.deepEqual(restored.db.prepare('PRAGMA foreign_key_check').all(),[]);restored.db.close();restored=null;
    // Reverting a binary cannot silently discard a newer ledger or the new request.
    assert.throws(()=>openLocalDatabase(file,{migrationDirectory:baseline,allowMigrations:false}),/Unrecognized applied migration: 0017_assistant_requests.sql/);
    restored=openLocalDatabase(join(dir,'before.sqlite'),{migrationDirectory:baseline,allowMigrations:false});
    assert.deepEqual(restored.db.prepare('SELECT * FROM cleaning_requests').all(),[legacyRow]);
    assert.deepEqual(restored.db.prepare('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename').all(),priorReceipts);
    assert.equal(current.db.prepare('SELECT count(*) AS n FROM cleaning_requests').get().n,2);
  }finally{restored?.db.close();current?.db.close();rmSync(dir,{recursive:true,force:true});}
});

test('0017 metadata adds exactly the origin table and leaves all prior schema definitions intact',()=>{
  const previous=JSON.parse(readFileSync(new URL('meta/0016_snapshot.json',source),'utf8'));
  const current=JSON.parse(readFileSync(new URL('meta/0017_snapshot.json',source),'utf8'));
  assert.equal(current.prevId,previous.id);assert.equal(Object.keys(current.tables).length,Object.keys(previous.tables).length+1);
  for(const [name,table] of Object.entries(previous.tables))assert.deepEqual(current.tables[name],table,name);
  assert.deepEqual(Object.keys(current.tables).filter(name=>!previous.tables[name]),['assistant_request_links']);
  const table=current.tables.assistant_request_links;
  assert.deepEqual(Object.keys(table.columns).sort(),['consent_fields_json','consent_version','conversation_id','created_at','mutation_id','request_id','request_key']);
  assert.equal(table.indexes.assistant_request_retry.isUnique,true);
  const sql=readFileSync(new URL('0017_assistant_requests.sql',source),'utf8');
  assert.match(sql,/DEFERRABLE INITIALLY DEFERRED/);assert.match(sql,/BEFORE UPDATE ON assistant_request_links/);
  assert.doesNotMatch(sql,/\b(?:DROP\s+TABLE|DELETE\s+FROM|ALTER\s+TABLE)\b/i);
});
