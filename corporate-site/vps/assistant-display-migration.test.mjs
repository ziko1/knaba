import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {openLocalDatabase} from './database.mjs';
import {inspectMigrationSequence} from './migration-guard.mjs';

const source=new URL('../drizzle/',import.meta.url);
test('0016 preserves legacy history and records only an immutable first owner-message display',()=>{
  const dir=mkdtempSync(join(tmpdir(),'knaba-display-upgrade-')),file=join(dir,'state.sqlite'),baseline=join(dir,'baseline');let current;
  try{
    mkdirSync(join(baseline,'meta'),{recursive:true});
    const names=inspectMigrationSequence(source.pathname).names;assert.equal(names[16],'0016_assistant_display_receipts.sql');
    for(const name of names.slice(0,16))copyFileSync(new URL(name,source),join(baseline,name));
    const journal=JSON.parse(readFileSync(new URL('meta/_journal.json',source),'utf8'));journal.entries=journal.entries.slice(0,16);
    writeFileSync(join(baseline,'meta/_journal.json'),JSON.stringify(journal));
    current=openLocalDatabase(file,{migrationDirectory:baseline});
    const priorReceipts=current.db.prepare('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename').all();
    const tables=current.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const conversation=randomUUID(),created=new Date().toISOString(),messages=['owner','owner','customer','assistant'].map(sender=>({id:randomUUID(),sender}));
    current.db.prepare("INSERT INTO assistant_conversations(id,token_hash,token_expires_at,locale,status,privacy_version,created_at,updated_at) VALUES(?,?,?,'uk','human','test',?,?)")
      .run(conversation,'a'.repeat(64),new Date(Date.now()+86400000).toISOString(),created,created);
    for(const message of messages)current.db.prepare("INSERT INTO assistant_messages(id,conversation_id,sender,content,request_key,created_at) VALUES(?,?,?,'Historical message',?,?)").run(message.id,conversation,message.sender,message.id,created);
    current.db.close();current=null;
    assert.throws(()=>openLocalDatabase(file,{allowMigrations:false}),/Pending schema migration 0016_assistant_display_receipts.sql/);
    current=openLocalDatabase(file);
    assert.deepEqual(current.db.prepare('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename LIMIT 16').all(),priorReceipts);
    assert.deepEqual(current.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all(),tables);
    const rows=current.db.prepare('SELECT * FROM assistant_messages').all();assert.equal(rows.length,4);
    assert.ok(rows.every(row=>row.content==='Historical message'&&row.guest_displayed_at===null));
    const first='2026-11-08T10:00:00.123Z';
    current.db.prepare('UPDATE assistant_messages SET guest_displayed_at=? WHERE id=?').run(first,messages[0].id);
    current.db.prepare('UPDATE assistant_messages SET guest_displayed_at=? WHERE id=?').run(first,messages[0].id);
    for(const value of [null,'2026-11-08T09:00:00.123Z','2026-11-08T11:00:00.123Z'])assert.throws(()=>current.db.prepare('UPDATE assistant_messages SET guest_displayed_at=? WHERE id=?').run(value,messages[0].id),/assistant_display_receipt_immutable/);
    for(const value of ['not-a-date','2026-02-30T00:00:00.000Z'])assert.throws(()=>current.db.prepare('UPDATE assistant_messages SET guest_displayed_at=? WHERE id=?').run(value,messages[1].id),/assistant_display_receipt_invalid/);
    for(const message of messages.slice(2))assert.throws(()=>current.db.prepare('UPDATE assistant_messages SET guest_displayed_at=? WHERE id=?').run(first,message.id),/assistant_display_receipt_invalid/);
    assert.throws(()=>current.db.prepare("UPDATE assistant_messages SET sender='customer' WHERE id=?").run(messages[0].id),/assistant_display_receipt_(?:immutable|invalid)/);
    assert.equal(current.db.prepare('SELECT updated_at FROM assistant_conversations WHERE id=?').get(conversation).updated_at,created);
    assert.equal(current.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(current.db.prepare('PRAGMA foreign_key_check').all(),[]);
    current.db.close();current=null;current=openLocalDatabase(file,{allowMigrations:false});
    assert.equal(current.db.prepare('SELECT guest_displayed_at FROM assistant_messages WHERE id=?').get(messages[0].id).guest_displayed_at,first);
    assert.equal(current.db.prepare("SELECT COUNT(*) AS n FROM vps_schema_migrations WHERE filename='0016_assistant_display_receipts.sql'").get().n,1);
  }finally{current?.db.close();rmSync(dir,{recursive:true,force:true});}
});

test('0016 metadata preserves all 22 tables and adds only the nullable display receipt column',()=>{
  const previous=JSON.parse(readFileSync(new URL('meta/0015_snapshot.json',source),'utf8'));
  const current=JSON.parse(readFileSync(new URL('meta/0016_snapshot.json',source),'utf8'));
  assert.equal(Object.keys(current.tables).length,22);assert.deepEqual(Object.keys(current.tables).sort(),Object.keys(previous.tables).sort());
  for(const [name,table] of Object.entries(previous.tables))if(name!=='assistant_messages')assert.deepEqual(current.tables[name],table,name);
  const oldColumns=previous.tables.assistant_messages.columns,columns=current.tables.assistant_messages.columns;
  for(const [name,column] of Object.entries(oldColumns))assert.deepEqual(columns[name],column);
  assert.deepEqual(Object.keys(columns).filter(name=>!oldColumns[name]),['guest_displayed_at']);
  assert.equal(columns.guest_displayed_at.notNull,false);assert.equal(current.prevId,previous.id);
  const sql=readFileSync(new URL('0016_assistant_display_receipts.sql',source),'utf8');assert.doesNotMatch(sql,/\b(?:DROP|DELETE)\b/i);
});
