import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openLocalDatabase} from './database.mjs';
const source=readFileSync(new URL('./site-identity-consents.sql',import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'knaba-f2-migration-')),path=join(dir,'state.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));return {dir,path};}
function oldDatabase(path){const {db}=openLocalDatabase(path);db.exec('DROP TABLE vps_site_identity_consents;DROP TABLE vps_auth_migrations');db.prepare('INSERT INTO vps_users(id,email,salt,password_hash,created_at) VALUES(?,?,?,?,?)').run('synthetic-user','synthetic@example.test','test-salt','test-hash','2026-01-01T00:00:00.000Z');const old=db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all().map(row=>({...row}));db.close();return old;}

test('F2 SQLite auth upgrade requires reviewed migrations before any startup write',t=>{
 const {path}=fixture(t);oldDatabase(path);const before=hash(readFileSync(path));
 assert.throws(()=>openLocalDatabase(path,{allowMigrations:false}),/Pending VPS auth migration site-identity-consents/);
 assert.equal(hash(readFileSync(path)),before);const db=new DatabaseSync(path,{readOnly:true});
 try{assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='vps_site_identity_consents'").get(),undefined);assert.equal(db.prepare('SELECT count(*) AS n FROM vps_users').get().n,1);}finally{db.close();}
});
test('F2 upgrade is additive and idempotent, preserving historical Drizzle receipts and account IDs',t=>{
 const {path}=fixture(t),previous=oldDatabase(path);let opened=openLocalDatabase(path);
 try{assert.deepEqual(opened.db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all().map(row=>({...row})),previous);
  const receipt=opened.db.prepare('SELECT name,sha256 FROM vps_auth_migrations').get();assert.deepEqual({...receipt},{name:'001_site_identity_consents',sha256:hash(source)});
  assert.equal(opened.db.prepare('SELECT id FROM vps_users').get().id,'synthetic-user');}finally{opened.db.close();}
 opened=openLocalDatabase(path,{allowMigrations:false});try{assert.equal(opened.db.prepare('SELECT count(*) AS n FROM vps_auth_migrations').get().n,1);}finally{opened.db.close();}
});
test('changed auth receipt, unknown migration or missing trigger fails closed',t=>{
 for(const mutation of ["UPDATE vps_auth_migrations SET sha256='changed'","INSERT INTO vps_auth_migrations VALUES('unknown','x','now')","DROP TRIGGER vps_site_identity_consents_update_guard"]){
  const {path}=fixture(t),opened=openLocalDatabase(path);opened.db.exec(mutation);opened.db.close();assert.throws(()=>openLocalDatabase(path,{allowMigrations:false}),/checksum|Unrecognized|Missing/);
 }
});
test('an unrecorded preexisting consent table is never silently adopted or overwritten',t=>{
 const {path}=fixture(t),opened=openLocalDatabase(path);opened.db.exec('DROP TABLE vps_auth_migrations');opened.db.close();
 assert.throws(()=>openLocalDatabase(path,{allowMigrations:true}),/Unrecorded VPS site identity schema/);
});
test('SQLite backup restores auth migration receipt and guard alongside existing accounts',async t=>{
 const {dir,path}=fixture(t);oldDatabase(path);const opened=openLocalDatabase(path),saved=join(dir,'restore.sqlite');
 try{await backup(opened.db,saved);}finally{opened.db.close();}
 const restored=openLocalDatabase(saved,{allowMigrations:false});try{
  assert.equal(restored.db.prepare('SELECT id FROM vps_users').get().id,'synthetic-user');
  assert.equal(restored.db.prepare('SELECT sha256 FROM vps_auth_migrations').get().sha256,hash(source));
  assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(restored.db.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.ok(restored.db.prepare("SELECT 1 FROM sqlite_master WHERE name='vps_site_identity_consents_update_guard'").get());
 }finally{restored.db.close();}
});
