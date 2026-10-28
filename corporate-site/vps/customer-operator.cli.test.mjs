import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalDatabase} from './database.mjs';
import {createOwner,createSessionForUser,readSession} from './auth.mjs';
import {activateOwnerInvite} from './owner-invite.mjs';
import {hasOwnerAuthority} from './admin-access.mjs';

test('owner server: private developer enrollment and revocation survive separate CLI processes',()=>{
 const folder=mkdtempSync(join(tmpdir(),'knaba-handover-test-'));
 const file=join(folder,'state.sqlite');
 const owner='owner@example.test',developer='developer@example.test';
 const base={...process.env,OWNER_EMAIL:owner,KNABA_DEVELOPER_EMAIL:developer,
   KNABA_PUBLIC_ORIGIN:'https://owner-server.example',KNABA_DB_PATH:file};
 try{
  let {db}=openLocalDatabase(file);
  const real=createOwner(db,owner,'synthetic-owner-password-long');
  db.close();
  const call=action=>spawnSync(process.execPath,[new URL('./manage.mjs',import.meta.url).pathname,action],{
    env:base,encoding:'utf8',timeout:15000
  });
  const issued=call('invite-developer');
  assert.equal(issued.status,0,issued.stderr);
  const notification=JSON.parse(issued.stdout);
  assert.equal(notification.issued,true);
  assert.equal(statSync(notification.secretFile).mode & 0o777,0o600);
  const secret=JSON.parse(readFileSync(notification.secretFile,'utf8'));
  assert.equal(secret.to,developer);
  assert.match(secret.activationUrl,/^https:\/\/owner-server\.example\/activate-developer\/#token=/);
  const token=new URL(secret.activationUrl).hash.slice('#token='.length);
  ({db}=openLocalDatabase(file,{allowMigrations:false}));
  const staff=activateOwnerInvite(db,{token,email:developer,
    password:'synthetic-dev-password-2026',confirmed:'synthetic-dev-password-2026',attested:true,purpose:'developer'});
  assert.equal(hasOwnerAuthority(db,{userId:staff.id,ownerEmail:owner,developerEmail:developer}),true);
  const session=createSessionForUser(db,staff.id);
  db.close();
  const revoked=call('revoke-developer');
  assert.equal(revoked.status,0,revoked.stderr);
  assert.equal(JSON.parse(revoked.stdout).revoked,true);
  ({db}=openLocalDatabase(file,{allowMigrations:false}));
  assert.equal(hasOwnerAuthority(db,{userId:staff.id,ownerEmail:owner,developerEmail:developer}),false);
  assert.equal(readSession(db,'__Host-knaba-session='+session.token),null);
  assert.equal(hasOwnerAuthority(db,{userId:real.id,ownerEmail:owner,developerEmail:developer}),true);
  db.close();
  assert.equal(JSON.parse(call('revoke-developer').stdout).revoked,false);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
