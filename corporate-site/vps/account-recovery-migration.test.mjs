import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createSessionForUser,readSession} from './auth.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const source=readFileSync(new URL('./account-recovery.sql',import.meta.url),'utf8');
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'knaba-recovery-migration-')),path=join(dir,'state.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));return {dir,path};}
function priorDatabase(path){
  const {db}=openLocalDatabase(path);
  const user=createCredentialsUser(db,'synthetic@example.test','synthetic-original-password'),session=createSessionForUser(db,user.id);
  const history=db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all();
  const consentReceipt=db.prepare("SELECT * FROM vps_auth_migrations WHERE name='001_site_identity_consents'").get();
  db.exec("DROP TRIGGER vps_account_tokens_user_revoke;DROP TRIGGER vps_account_tokens_profile_revoke;DROP TRIGGER vps_account_tokens_profile_delete;DROP TABLE vps_account_tokens;DELETE FROM vps_auth_migrations WHERE name='002_account_recovery'");
  db.close();return {user,history,consentReceipt,cookie:'__Host-knaba-session='+session.token};
}

test('normal startup rejects missing002 before any write to an existing001 database',t=>{
  const {path}=fixture(t),prior=priorDatabase(path),before=hash(readFileSync(path));
  assert.throws(()=>openLocalDatabase(path,{allowMigrations:false}),/Pending VPS auth migration account-recovery/);
  assert.equal(hash(readFileSync(path)),before);
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='vps_account_tokens'").get(),undefined);
    assert.equal(db.prepare('SELECT id FROM vps_users').get().id,prior.user.id);
    assert.deepEqual(db.prepare("SELECT * FROM vps_auth_migrations WHERE name='001_site_identity_consents'").get(),prior.consentReceipt);
  }finally{db.close();}
});

test('explicit002 migration is additive and idempotent and preserves001, historical receipts and sessions',t=>{
  const {path}=fixture(t),prior=priorDatabase(path);let opened=openLocalDatabase(path);
  try{
    assert.deepEqual(opened.db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all(),prior.history);
    assert.deepEqual(opened.db.prepare("SELECT * FROM vps_auth_migrations WHERE name='001_site_identity_consents'").get(),prior.consentReceipt);
    assert.equal(opened.db.prepare("SELECT sha256 FROM vps_auth_migrations WHERE name='002_account_recovery'").get().sha256,hash(source));
    assert.ok(readSession(opened.db,prior.cookie));
    assert.ok(opened.db.prepare("SELECT 1 FROM sqlite_master WHERE name='vps_site_identity_consents_update_guard'").get());
    assert.equal(opened.db.prepare("SELECT 1 FROM sqlite_master WHERE name='vps_account_settings'").get(),undefined,'no unrelated profile-settings schema');
  }finally{opened.db.close();}
  opened=openLocalDatabase(path,{allowMigrations:false});
  try{
    assert.equal(opened.db.prepare('SELECT count(*) AS n FROM vps_auth_migrations').get().n,2);
    assert.equal(opened.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(opened.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{opened.db.close();}
});

test('changed recovery receipt, absent table/index/revocation guards and invalid migration order fail closed',t=>{
  for(const mutation of [
    "UPDATE vps_auth_migrations SET sha256='changed' WHERE name='002_account_recovery'",
    'DROP TABLE vps_account_tokens','DROP INDEX vps_account_tokens_expiry',
    'DROP TRIGGER vps_account_tokens_user_revoke','DROP TRIGGER vps_account_tokens_profile_revoke','DROP TRIGGER vps_account_tokens_profile_delete',
    "DELETE FROM vps_auth_migrations WHERE name='001_site_identity_consents'"
  ]){
    const {path}=fixture(t),opened=openLocalDatabase(path);opened.db.exec(mutation);opened.db.close();
    const before=hash(readFileSync(path));
    assert.throws(()=>openLocalDatabase(path,{allowMigrations:false}),/checksum|Missing|Incomplete/);
    assert.equal(hash(readFileSync(path)),before);
  }
});

test('unrecorded recovery schema is not silently adopted by an explicit upgrade',t=>{
  const {path}=fixture(t),opened=openLocalDatabase(path);
  opened.db.exec("DELETE FROM vps_auth_migrations WHERE name='002_account_recovery'");opened.db.close();
  const before=hash(readFileSync(path));
  assert.throws(()=>openLocalDatabase(path,{allowMigrations:true}),/Unrecorded VPS account recovery schema/);
  assert.equal(hash(readFileSync(path)),before);
});

test('backup and restore retain both auth receipts, sessions and recovery revocation guards',async t=>{
  const {dir,path}=fixture(t),prior=priorDatabase(path),opened=openLocalDatabase(path),target=join(dir,'restore.sqlite');
  try{await backup(opened.db,target);}finally{opened.db.close();}
  const restored=openLocalDatabase(target,{allowMigrations:false});
  try{
    assert.ok(readSession(restored.db,prior.cookie));
    assert.deepEqual(restored.db.prepare("SELECT * FROM vps_auth_migrations WHERE name='001_site_identity_consents'").get(),prior.consentReceipt);
    assert.equal(restored.db.prepare("SELECT sha256 FROM vps_auth_migrations WHERE name='002_account_recovery'").get().sha256,hash(source));
    for(const name of ['vps_account_tokens_user_revoke','vps_account_tokens_profile_revoke','vps_account_tokens_profile_delete'])
      assert.ok(restored.db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name));
    assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(restored.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{restored.db.close();}
});
