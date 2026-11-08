import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {backup} from 'node:sqlite';
import {openLocalDatabase} from './database.mjs';
import {createOwner,createSessionForUser,readSession} from './auth.mjs';
import {inspectMigrationSequence} from './migration-guard.mjs';

const source=new URL('../drizzle/',import.meta.url);
test('0015 upgrades legacy capabilities once, preserves history and rejects malformed timestamps',()=>{
  const dir=mkdtempSync(join(tmpdir(),'knaba-assistant-upgrade-'));
  const file=join(dir,'state.sqlite'),baseline=join(dir,'baseline');
  let current;
  try{
    mkdirSync(join(baseline,'meta'),{recursive:true});
    const names=inspectMigrationSequence(source.pathname).names;
    assert.equal(names[15],'0015_assistant_access.sql');
    for(const name of names.slice(0,15))copyFileSync(new URL(name,source),join(baseline,name));
    const journal=JSON.parse(readFileSync(new URL('meta/_journal.json',source),'utf8'));
    journal.entries=journal.entries.slice(0,15);
    writeFileSync(join(baseline,'meta/_journal.json'),JSON.stringify(journal));
    current=openLocalDatabase(file,{migrationDirectory:baseline});
    const receipts=current.db.prepare('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename').all();
    const authReceipts=current.db.prepare('SELECT * FROM vps_auth_migrations ORDER BY name').all();
    const owner=createOwner(current.db,'migration-owner@example.test','Synthetic-migration-password-2026');
    const session=createSessionForUser(current.db,owner.id),cookie='__Host-knaba-session='+session.token;
    current.db.prepare('INSERT INTO vps_account_settings(user_id,name,locale,time_zone,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)')
      .run(owner.id,'Retained settings','uk','Europe/Kyiv','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
    const account=current.db.prepare('SELECT * FROM vps_account_settings WHERE user_id=?').get(owner.id);
    current.db.prepare('INSERT INTO vps_owner_details(owner_id,display_name,updated_at) VALUES(?,?,?)')
      .run(owner.id,'Historical owner','2026-01-01T00:00:00.000Z');
    current.db.prepare("INSERT INTO vps_access_requests(id,name,email,intent,privacy_version,created_at,expires_at) VALUES('preserved-access','Historic request','request@example.test','client','test',1,2)").run();
    const created=['2026-11-08T12:34:56.789Z','2026-01-01T00:00:00.000Z','not-a-date','2026-02-30T00:00:00.000Z',
      '2026-11-08T12:34:56Z','2026-11-08T13:34:56.789+01:00'];
    const conversations=created.map(createdAt=>({id:randomUUID(),createdAt}));
    for(const conversation of conversations){
      current.db.prepare("INSERT INTO assistant_conversations(id,token_hash,locale,status,privacy_version,created_at,updated_at) VALUES(?,?,'uk','human','test',?,?)")
        .run(conversation.id,'a'.repeat(64),conversation.createdAt,conversation.createdAt);
      current.db.prepare("INSERT INTO assistant_messages(id,conversation_id,sender,kind,content,request_key,created_at) VALUES(?,?,'customer','text','Preserved private history','historical-key',?)")
        .run(randomUUID(),conversation.id,conversation.createdAt);
    }
    current.db.close();current=null;
    const priorBytes=createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.throws(()=>openLocalDatabase(file,{allowMigrations:false}),/Pending schema migration 0015_assistant_access.sql/);
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),priorBytes);
    current=openLocalDatabase(file);
    assert.deepEqual(current.db.prepare('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename LIMIT 15').all(),receipts);
    assert.deepEqual(current.db.prepare('SELECT * FROM vps_auth_migrations ORDER BY name').all(),authReceipts);
    assert.deepEqual(current.db.prepare('SELECT * FROM vps_account_settings WHERE user_id=?').get(owner.id),account);
    assert.equal(readSession(current.db,cookie).id,owner.id);
    assert.equal(current.db.prepare('SELECT COUNT(*) AS n FROM assistant_messages').get().n,created.length);
    assert.equal(current.db.prepare('SELECT display_name FROM vps_owner_details WHERE owner_id=?').get(owner.id).display_name,'Historical owner');
    assert.equal(current.db.prepare("SELECT name FROM vps_access_requests WHERE id='preserved-access'").get().name,'Historic request');
    for(const [index,conversation] of conversations.entries()){
      const row=current.db.prepare('SELECT created_at,token_expires_at,token_revoked_at,token_hash FROM assistant_conversations WHERE id=?').get(conversation.id);
      assert.equal(row.created_at,conversation.createdAt);
      assert.equal(row.token_hash,'a'.repeat(64));
      assert.equal(row.token_revoked_at,null);
      assert.equal(row.token_expires_at,index<2?new Date(Date.parse(conversation.createdAt)+7*86400000).toISOString():null);
      assert.throws(()=>current.db.prepare('UPDATE assistant_conversations SET token_expires_at=? WHERE id=?')
        .run('2099-01-01T00:00:00.000Z',conversation.id),/assistant_capability_expiry_immutable/);
    }
    assert.equal(current.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(current.db.prepare('PRAGMA foreign_key_check').all(),[]);
    const before=current.db.prepare('SELECT * FROM assistant_conversations ORDER BY id').all();
    current.db.close();current=null;
    current=openLocalDatabase(file,{allowMigrations:false});
    assert.deepEqual(current.db.prepare('SELECT * FROM assistant_conversations ORDER BY id').all(),before);
    assert.equal(current.db.prepare("SELECT COUNT(*) AS n FROM vps_schema_migrations WHERE filename='0015_assistant_access.sql'").get().n,1);
  }finally{
    if(current)current.db.close();
    rmSync(dir,{recursive:true,force:true});
  }
});

test('0015 preserves non-ORM tables in the Drizzle snapshot and adds only lifecycle columns',()=>{
  const previous=JSON.parse(readFileSync(new URL('meta/0014_snapshot.json',source),'utf8'));
  const current=JSON.parse(readFileSync(new URL('meta/0015_snapshot.json',source),'utf8'));
  for(const [name,table] of Object.entries(previous.tables)){
    if(name!=='assistant_conversations')assert.deepEqual(current.tables[name],table,name);
  }
  assert.deepEqual(Object.keys(current.tables).sort(),Object.keys(previous.tables).sort());
  const columns=current.tables.assistant_conversations.columns;
  for(const [name,column] of Object.entries(previous.tables.assistant_conversations.columns))assert.deepEqual(columns[name],column);
  assert.deepEqual(Object.keys(columns).filter(name=>!previous.tables.assistant_conversations.columns[name]).sort(),['token_expires_at','token_revoked_at']);
  const sql=readFileSync(new URL('0015_assistant_access.sql',source),'utf8');
  assert.doesNotMatch(sql,/\b(?:DROP|DELETE)\b/i);
});

test('SQLite restore retains capability expiry, irreversible revocation and account/F2 migration receipts',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'knaba-assistant-restore-')),file=join(directory,'state.sqlite'),saved=join(directory,'restore.sqlite');
  let current=openLocalDatabase(file);
  try{
    const id=randomUUID(),created=new Date().toISOString(),expires=new Date(Date.parse(created)+7*86400000).toISOString();
    current.db.prepare("INSERT INTO assistant_conversations(id,token_hash,token_expires_at,token_revoked_at,locale,status,privacy_version,created_at,updated_at) VALUES(?,'',?,?,'de','human','test',?,?)")
      .run(id,expires,created,created,created);
    const authReceipts=current.db.prepare('SELECT * FROM vps_auth_migrations ORDER BY name').all();
    const receipts=current.db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all();
    await backup(current.db,saved);current.db.close();current=null;
    current=openLocalDatabase(saved,{allowMigrations:false});
    assert.deepEqual(current.db.prepare('SELECT * FROM vps_auth_migrations ORDER BY name').all(),authReceipts);
    assert.deepEqual(current.db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all(),receipts);
    assert.deepEqual({...current.db.prepare('SELECT token_hash,token_expires_at,token_revoked_at FROM assistant_conversations WHERE id=?').get(id)},
      {token_hash:'',token_expires_at:expires,token_revoked_at:created});
    assert.throws(()=>current.db.prepare('UPDATE assistant_conversations SET token_revoked_at=NULL WHERE id=?').run(id),/assistant_capability_revocation_immutable/);
    assert.throws(()=>current.db.prepare('UPDATE assistant_conversations SET created_at=? WHERE id=?').run(expires,id),/assistant_capability_expiry_immutable/);
    assert.equal(current.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(current.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{if(current)current.db.close();rmSync(directory,{recursive:true,force:true});}
});
