import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createSessionForUser,readSession,rotateCredentials,verifyCredentialPassword} from './auth.mjs';
import {updateAccountSettings,readAccountSettings} from './account-settings.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const password='synthetic-before-account-migration';
const replacement='synthetic-after-account-migration';
const source=readFileSync(new URL('./account-settings.sql',import.meta.url));
function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'knaba-account-migration-')),path=join(directory,'account.sqlite');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  return {directory,path};
}
function removeAccountMigration(db){
  // Reconstruct the predecessor: consent 001 and historical Drizzle receipts
  // remain; no account objects or account receipt existed before this change.
  db.exec("DROP TRIGGER vps_account_tokens_user_revoke;DROP TRIGGER vps_account_tokens_profile_revoke;DROP TRIGGER vps_account_tokens_profile_delete;DROP TABLE vps_account_tokens;DROP TABLE vps_account_settings;DELETE FROM vps_auth_migrations WHERE name='002_account_settings'");
}
function unchangedRefusal(path,pattern){
  const before=hash(readFileSync(path));
  for(const allowMigrations of [false,true]){
    assert.throws(()=>openLocalDatabase(path,{allowMigrations}),pattern);
    assert.equal(hash(readFileSync(path)),before,'refusal must precede writes');
  }
}

test('account migration 002 follows consent 001 without changing existing receipts, users or sessions',t=>{
  const {path}=fixture(t);let {db}=openLocalDatabase(path);
  const user=createCredentialsUser(db,'retained@example.test',password),session=createSessionForUser(db,user.id);
  const cookie='__Host-knaba-session='+session.token;
  removeAccountMigration(db);
  const previous={auth:db.prepare('SELECT * FROM vps_auth_migrations ORDER BY name').all(),
    schema:db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all(),
    users:db.prepare('SELECT * FROM vps_users').all(),sessions:db.prepare('SELECT * FROM vps_sessions').all()};
  db.close();const before=hash(readFileSync(path));
  assert.throws(()=>openLocalDatabase(path,{allowMigrations:false}),/Pending VPS auth migration account-settings/);
  assert.equal(hash(readFileSync(path)),before);
  ({db}=openLocalDatabase(path,{allowMigrations:true}));
  try{
    assert.deepEqual(db.prepare("SELECT * FROM vps_auth_migrations WHERE name='001_site_identity_consents'").all(),previous.auth);
    assert.deepEqual(db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all(),previous.schema);
    assert.deepEqual(db.prepare('SELECT * FROM vps_users').all(),previous.users);
    assert.deepEqual(db.prepare('SELECT * FROM vps_sessions').all(),previous.sessions);
    assert.equal(db.prepare("SELECT sha256 FROM vps_auth_migrations WHERE name='002_account_settings'").get().sha256,hash(source));
    assert.equal(readSession(db,cookie).id,user.id);
  }finally{db.close();}
  const applied=hash(readFileSync(path));
  ({db}=openLocalDatabase(path,{allowMigrations:false}));db.close();
  assert.equal(hash(readFileSync(path)),applied,'a repeated startup must not replay migrations');
});

test('account receipt drift, unknown migration, missing predecessor and missing objects fail closed before writes',t=>{
  const mutations=[
    "UPDATE vps_auth_migrations SET sha256='changed' WHERE name='002_account_settings'",
    "INSERT INTO vps_auth_migrations VALUES('003_unknown','unknown','now')",
    "DELETE FROM vps_auth_migrations WHERE name='001_site_identity_consents'",
    'DROP TABLE vps_account_settings',
    'DROP INDEX vps_account_tokens_user',
    'DROP INDEX vps_account_tokens_expiry',
    'DROP TRIGGER vps_account_tokens_user_revoke',
    'DROP TRIGGER vps_account_tokens_profile_revoke',
    'DROP TRIGGER vps_account_tokens_profile_delete'
  ];
  for(const mutation of mutations){
    const {path}=fixture(t),{db}=openLocalDatabase(path);db.exec(mutation);db.close();
    unchangedRefusal(path,/checksum changed|Unrecognized|Incomplete|Missing/);
  }
});

test('unrecorded account schema from another branch is not adopted by applying a new receipt',t=>{
  const {path}=fixture(t),{db}=openLocalDatabase(path);
  db.exec("DELETE FROM vps_auth_migrations WHERE name='002_account_settings'");db.close();
  unchangedRefusal(path,/Unrecorded VPS account settings schema/);
});

test('SQLite backup restores migrated settings and latest credentials without resurrecting revoked sessions',async t=>{
  const {directory,path}=fixture(t),{db}=openLocalDatabase(path),restore=join(directory,'restore.sqlite');
  const user=createCredentialsUser(db,'backed-up@example.test',password),session=createSessionForUser(db,user.id);
  const cookie='__Host-knaba-session='+session.token;
  updateAccountSettings(db,{cookieHeader:cookie,values:{name:'Backup Account',phone:'',company:'',address:'',locale:'uk',timeZone:'Europe/Kyiv',version:0}});
  assert.equal(rotateCredentials(db,{userId:user.id,currentPassword:password,newPassword:replacement,confirmed:replacement,cookieHeader:cookie}),true);
  const receipts=db.prepare('SELECT * FROM vps_auth_migrations ORDER BY name').all();
  try{await backup(db,restore);}finally{db.close();}
  const restored=openLocalDatabase(restore,{allowMigrations:false}).db;
  try{
    assert.deepEqual(restored.prepare('SELECT * FROM vps_auth_migrations ORDER BY name').all(),receipts);
    assert.equal(readSession(restored,cookie),null);
    const credentials=restored.prepare('SELECT * FROM vps_users WHERE id=?').get(user.id);
    assert.equal(verifyCredentialPassword(credentials,password),false);
    assert.equal(verifyCredentialPassword(credentials,replacement),true);
    const fresh=createSessionForUser(restored,user.id);
    const settings=readAccountSettings(restored,{cookieHeader:'__Host-knaba-session='+fresh.token});
    assert.equal(settings.name,'Backup Account');assert.equal(settings.locale,'uk');assert.equal(settings.version,1);
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{restored.close();}
});
