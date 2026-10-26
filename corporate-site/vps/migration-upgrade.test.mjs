import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openLocalDatabase} from './database.mjs';
import {inspectMigrationSequence} from './migration-guard.mjs';

const source=new URL('../drizzle/',import.meta.url);
const sqlNames=()=>inspectMigrationSequence(source.pathname).names;
function fixture(run){
 const dir=mkdtempSync(join(tmpdir(),'knaba-upgrade-'));
 const file=join(dir,'synthetic.sqlite');
 const baseline=(count)=>{
  const path=join(dir,'baseline-'+count);mkdirSync(join(path,'meta'),{recursive:true});
  const names=sqlNames().slice(0,count);
  for(const name of names)copyFileSync(new URL(name,source),join(path,name));
  const journal=JSON.parse(readFileSync(new URL('meta/_journal.json',source),'utf8'));
  journal.entries=journal.entries.slice(0,count);
  writeFileSync(join(path,'meta/_journal.json'),JSON.stringify(journal));return path;
 };
 try{return run({dir,file,baseline});}finally{rmSync(dir,{recursive:true,force:true});}
}
const rows=db=>db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all().map(r=>({...r}));
test('canonical combined sequence preserves bridge 0005 and appends owner 0006 with journal',()=>{
 const {names,journalEntries}=inspectMigrationSequence(source.pathname);
 assert.equal(names.length,7);assert.equal(journalEntries,7);
 assert.deepEqual(names.slice(-2),['0005_assistant_erp_bridge.sql','0006_owner_invite.sql']);
 const prior=JSON.parse(readFileSync(new URL('meta/0005_snapshot.json',source),'utf8'));
 const custom=JSON.parse(readFileSync(new URL('meta/0006_snapshot.json',source),'utf8'));
 assert.equal(custom.prevId,prior.id);assert.notEqual(custom.id,prior.id);
 // Custom VPS-only table is deliberately not an ORM-managed D1 auth model.
 assert.deepEqual(custom.tables,prior.tables);
});
test('fresh actual SQLite contains bridge and owner tables and passes integrity',()=>fixture(({file})=>{
 const {db,migrations}=openLocalDatabase(file);
 try{
  assert.equal(migrations.length,7);
  for(const name of ['assistant_erp_requests','vps_owner_invites'])
   assert.equal(db.prepare('SELECT count(*) AS n FROM sqlite_master WHERE type=\'table\' AND name=?').get(name).n,1);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
}));
for(const count of [5,6])test('actual baseline '+count+' upgrades once and retains prior receipts/data',()=>fixture(({file,baseline})=>{
 let current=openLocalDatabase(file,{migrationDirectory:baseline(count)});
 const before=rows(current.db);
 current.db.exec("CREATE TABLE qa_sentinel(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO qa_sentinel VALUES(1,'synthetic preserved')");current.db.close();
 current=openLocalDatabase(file);
 try{
  assert.equal(rows(current.db).length,7);assert.deepEqual(rows(current.db).slice(0,count),before);
  assert.equal(current.db.prepare('SELECT value FROM qa_sentinel').get().value,'synthetic preserved');
  current.db.prepare('INSERT INTO vps_owner_invites VALUES(?,?,?,?,?)').run('synthetic-hash','owner@example.test',1000,2000,null);
 }finally{current.db.close();}
 current=openLocalDatabase(file,{allowMigrations:false});
 try{
  assert.equal(rows(current.db).length,7);assert.deepEqual(rows(current.db).slice(0,count),before);
  assert.equal(current.db.prepare('SELECT count(*) AS n FROM vps_owner_invites').get().n,1);
 }finally{current.db.close();}
}));
test('alternate historical 0005 owner ledger fails closed without creating bridge',()=>fixture(({file,baseline})=>{
 const {db}=openLocalDatabase(file,{migrationDirectory:baseline(5)});
 db.prepare('INSERT INTO vps_schema_migrations VALUES(?,?,?)').run('0005_owner_invite.sql','a'.repeat(64),'historical');
 db.exec("CREATE TABLE qa_keep(value TEXT);INSERT INTO qa_keep VALUES('preserved')");db.close();
 assert.throws(()=>openLocalDatabase(file),/Unrecognized applied migration: 0005_owner_invite.sql/);
 const read=new DatabaseSync(file,{readOnly:true});
 try{
  assert.equal(read.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='assistant_erp_requests'").get().n,0);
  assert.equal(read.prepare('SELECT value FROM qa_keep').get().value,'preserved');
  assert.equal(rows(read).length,6);
 }finally{read.close();}
}));
test('all applied checksums are checked before any earlier pending SQL runs',()=>fixture(({file,baseline})=>{
 const {db}=openLocalDatabase(file,{migrationDirectory:baseline(1)});
 db.prepare('INSERT INTO vps_schema_migrations VALUES(?,?,?)').run('0004_dusty_hiroim.sql','0'.repeat(64),'historical');db.close();
 assert.throws(()=>openLocalDatabase(file),/Migration checksum changed: 0004_dusty_hiroim.sql/);
 const read=new DatabaseSync(file,{readOnly:true});try{assert.equal(rows(read).length,2);}finally{read.close();}
}));
test('pending migration is refused when allowMigrations=false',()=>fixture(({file,baseline})=>{
 const old=openLocalDatabase(file,{migrationDirectory:baseline(6)});const prior=rows(old.db);old.db.close();
 assert.throws(()=>openLocalDatabase(file,{allowMigrations:false}),/Pending schema migration/);
 const read=new DatabaseSync(file,{readOnly:true});try{assert.deepEqual(rows(read),prior);}finally{read.close();}
}));
test('duplicate source ordinal is rejected before creating SQLite or parent directory',()=>fixture(({dir,baseline})=>{
 const path=baseline(6);writeFileSync(join(path,'0005_owner_invite.sql'),'SELECT 1;');
 const file=join(dir,'not-created','state.sqlite');
 assert.throws(()=>openLocalDatabase(file,{migrationDirectory:path}),/MIGRATION_ORDER_COLLISION:0005/);
 assert.equal(existsSync(join(dir,'not-created')),false);
}));
test('journal cannot silently reverse the SQL application order',()=>fixture(({baseline})=>{
 const path=baseline(6),p=join(path,'meta/_journal.json');const j=JSON.parse(readFileSync(p,'utf8'));
 [j.entries[4].tag,j.entries[5].tag]=[j.entries[5].tag,j.entries[4].tag];
 writeFileSync(p,JSON.stringify(j));assert.throws(()=>inspectMigrationSequence(path),/JOURNAL_SQL_ORDER_MISMATCH/);
}));
test('journal timestamps must be finite and strictly increasing',()=>fixture(({baseline})=>{
 const path=baseline(6),p=join(path,'meta/_journal.json');const j=JSON.parse(readFileSync(p,'utf8'));
 j.entries[5].when=j.entries[4].when;writeFileSync(p,JSON.stringify(j));
 assert.throws(()=>inspectMigrationSequence(path),/INVALID_MIGRATION_JOURNAL_TIMESTAMP/);
}));

test('online synthetic SQLite backup restores the complete migration ledger and preserved data',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'knaba-upgrade-backup-'));
 let live,restored;
 try{
  live=openLocalDatabase(join(dir,'source.sqlite'));
  live.db.prepare('INSERT INTO vps_owner_invites VALUES(?,?,?,?,?)').run('qa-backup-hash','owner@example.test',100,200,null);
  const prior=rows(live.db);
  await backup(live.db,join(dir,'restore.sqlite'));
  restored=openLocalDatabase(join(dir,'restore.sqlite'),{allowMigrations:false});
  assert.deepEqual(rows(restored.db),prior);
  assert.equal(restored.db.prepare('SELECT token_hash FROM vps_owner_invites').get().token_hash,'qa-backup-hash');
  assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(restored.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{restored?.db.close();live?.db.close();rmSync(dir,{recursive:true,force:true});}
});
