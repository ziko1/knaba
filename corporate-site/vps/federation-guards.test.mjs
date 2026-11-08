import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {openLocalDatabase} from './database.mjs';
import {installFederationSchema} from './federation-schema.mjs';
import {createCredentialsUser,createSessionForUser} from './auth.mjs';
import {bindFederationCoordinator,federationMutation,securityTransaction} from './federation-state.mjs';
import {updateExistingOwner} from './owner-maintenance.mjs';

function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'knaba-federation-guards-'));
  const path=join(directory,'auth.sqlite'),db=openLocalDatabase(path).db;
  t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
  installFederationSchema(db);
  const user=createCredentialsUser(db,'subject@example.test','synthetic-password-only');
  const other=createCredentialsUser(db,'other@example.test','synthetic-password-only');
  const session=createSessionForUser(db,user.id);
  db.prepare("INSERT INTO vps_staff_grants VALUES(?,?,'developer',1,'2026-11-08')").run(user.id,user.email);
  db.prepare(`INSERT INTO vps_federation_authorities(authority_id,company_id,issuer,config_fingerprint,
    policy_version,phase,instance_id,bootstrap_operation_id,updated_at) VALUES('fixture','company','https://site.example.test',?,1,'ACTIVE','instance','bootstrap',0)`).run('a'.repeat(64));
  db.prepare(`INSERT INTO vps_federation_principals(authority_id,subject,epoch,minimum_epoch,
    source_policy_version,state) VALUES('fixture',?,1,1,1,'ACTIVE')`).run(user.id);
  return {db,path,user,other,session};
}

test('legacy SQL cannot change an enrolled target and leaves the transaction unchanged',t=>{
  const {db,user}=fixture(t);
  db.exec('BEGIN IMMEDIATE');
  assert.throws(()=>db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(user.id),/FEDERATION_COORDINATOR_REQUIRED/);
  db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT disabled FROM vps_users WHERE id=?').get(user.id).disabled,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_sessions WHERE user_id=?').get(user.id).n,1);
});

test('a connection without the current guard implementation fails closed on a protected target',t=>{
  const {path,user}=fixture(t),oldConnection=new DatabaseSync(path);
  try{assert.throws(()=>oldConnection.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(user.id),/no such function|FEDERATION_COORDINATOR_REQUIRED/);}
  finally{oldConnection.close();}
});

test('unrelated unregistered targets retain normal local operation',t=>{
  const {db,other}=fixture(t);
  db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(other.id);
  assert.equal(db.prepare('SELECT disabled FROM vps_users WHERE id=?').get(other.id).disabled,1);
});

test('a current connection and registered SQL functions alone never grant a mutation permit',t=>{
  const {db,user}=fixture(t),permits=bindFederationCoordinator(db,{});t.after(()=>permits.close());
  assert.throws(()=>securityTransaction(db,()=>db.prepare('UPDATE vps_staff_grants SET active=0 WHERE user_id=?').run(user.id)),/FEDERATION_COORDINATOR_REQUIRED/);
  assert.equal(db.prepare('SELECT active FROM vps_staff_grants WHERE user_id=?').get(user.id).active,1);
});

test('one fenced transaction cannot mutate another target, borrow another operation, or retain a permit after rollback',t=>{
  const {db,user,other}=fixture(t),permits=bindFederationCoordinator(db,{});t.after(()=>permits.close());
  const operationId=randomUUID();
  db.prepare(`INSERT INTO vps_federation_operations(operation_id,subject,kind,scope,session_hashes,intent_hash,
    witness_json,pure_revocation,state,created_at,authorization_expires_at)
    VALUES(?,?,'PROFILE_ACCESS','PRINCIPAL','[]',?,'{}',0,'FENCED',0,300000)`).run(operationId,user.id,'a'.repeat(64));
  assert.throws(()=>permits.commit(operationId,user.id,()=>true),{code:'FEDERATION_COORDINATOR_REQUIRED'});
  assert.throws(()=>securityTransaction(db,()=>permits.commit(randomUUID(),user.id,()=>true)),{code:'FEDERATION_COORDINATOR_REQUIRED'});
  assert.throws(()=>securityTransaction(db,()=>permits.commit(operationId,other.id,()=>true)),{code:'FEDERATION_COORDINATOR_REQUIRED'});
  assert.throws(()=>securityTransaction(db,()=>permits.commit(operationId,user.id,()=>{
    db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(user.id);
    db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(other.id);
  })),/FEDERATION_COORDINATOR_REQUIRED/);
  assert.equal(db.prepare('SELECT disabled FROM vps_users WHERE id=?').get(user.id).disabled,0,'first write rolled back with rejected cross-target write');
  assert.equal(db.prepare('SELECT disabled FROM vps_users WHERE id=?').get(other.id).disabled,0);
  assert.throws(()=>securityTransaction(db,()=>permits.commit(operationId,user.id,()=>federationMutation(db,{
    subject:user.id,apply:()=>db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(user.id)
  }))),{code:'FEDERATION_COORDINATOR_REQUIRED'});
  assert.throws(()=>db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(user.id),/FEDERATION_COORDINATOR_REQUIRED/);
});

test('offline owner maintenance refuses enrolled targets without touching users, sessions, grants or audit',t=>{
  const {db,user}=fixture(t),before={users:db.prepare('SELECT * FROM vps_users').all(),sessions:db.prepare('SELECT * FROM vps_sessions').all(),grants:db.prepare('SELECT * FROM vps_staff_grants').all()};
  assert.throws(()=>updateExistingOwner(db,{currentEmail:user.email,newEmail:'new-owner@example.test',name:'New Name',identityVerified:true},{ownerEmail:user.email}),/FEDERATION_COORDINATOR_REQUIRED/);
  assert.deepEqual(db.prepare('SELECT * FROM vps_users').all(),before.users);
  assert.deepEqual(db.prepare('SELECT * FROM vps_sessions').all(),before.sessions);
  assert.deepEqual(db.prepare('SELECT * FROM vps_staff_grants').all(),before.grants);
  assert.equal(db.prepare('SELECT count(*) AS n FROM portal_audit').get().n,0);
});

test('actual revoke-developer CLI refuses an enrolled target and preserves unrelated baseline revocation',t=>{
  const {db,path,user,other}=fixture(t);
  const run=(owner,developer)=>spawnSync(process.execPath,['vps/manage.mjs','revoke-developer'],{
    cwd:new URL('../',import.meta.url),encoding:'utf8',env:{...process.env,KNABA_DB_PATH:path,OWNER_EMAIL:owner.email,KNABA_DEVELOPER_EMAIL:developer.email}
  });
  const denied=run(other,user);assert.notEqual(denied.status,0);assert.match(denied.stderr,/FEDERATION_COORDINATOR_REQUIRED/);
  assert.equal(db.prepare('SELECT active FROM vps_staff_grants WHERE user_id=?').get(user.id).active,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_sessions WHERE user_id=?').get(user.id).n,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM portal_audit').get().n,0);
  db.prepare("INSERT INTO vps_staff_grants VALUES(?,?,'developer',1,'2026-11-08')").run(other.id,other.email);
  createSessionForUser(db,other.id);
  const allowed=run(user,other);assert.equal(allowed.status,0);assert.deepEqual(JSON.parse(allowed.stdout),{revoked:true});
  assert.equal(db.prepare('SELECT active FROM vps_staff_grants WHERE user_id=?').get(other.id).active,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_sessions WHERE user_id=?').get(other.id).n,0);
  assert.equal(db.prepare('SELECT active FROM vps_staff_grants WHERE user_id=?').get(user.id).active,1);
});
