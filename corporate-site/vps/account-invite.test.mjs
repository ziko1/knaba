import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openLocalDatabase} from './database.mjs';
import {createOwner,createLogin,readSession} from './auth.mjs';
import {issueAccountInvite,acceptAccountInvite,AccountInviteError} from './account-invite.mjs';

const ownerEmail='owner@example.test';
const ownerPassword='owner-2026-synthetic-strong-passphrase';
const newPassword='invited-2026-synthetic-strong-passphrase';
function fixture(work) {
  const path=mkdtempSync(join(tmpdir(),'knaba-auth-'));
  const {db,migrations}=openLocalDatabase(join(path,'test.sqlite'));
  try{
    const owner=createOwner(db,ownerEmail,ownerPassword);
    return work({db,owner,migrations});
  } finally{db.close();rmSync(path,{recursive:true,force:true});}
}
function issue(db,owner,opts={}){
  return issueAccountInvite(db,{issuerId:owner.id,ownerEmail,email:'new@example.test',role:'client',identityVerified:true,...opts});
}
function register(db,token,opts={}){
  return acceptAccountInvite(db,{token,email:'new@example.test',name:'Test User',password:newPassword,
    confirmed:newPassword,privacyAccepted:true,ownerEmail,...opts});
}

test('new invitation is additive, 256-bit, hash-only and never creates a user',()=>{
  fixture(({db,owner,migrations})=>{
    assert.equal(migrations[7],'0007_account_invites.sql');assert.equal(migrations.at(-1),'0008_access_requests.sql');
    const invite=issue(db,owner,{now:1800000000000});
    assert.match(invite.token,/^[A-Za-z0-9_-]{43}$/);
    const stored=db.prepare('SELECT * FROM vps_account_invites').get();
    assert.equal(stored.email,'new@example.test');
    assert.equal(stored.requested_role,'client');
    assert.ok(!JSON.stringify(stored).includes(invite.token));
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n,1);
    assert.ok(invite.expiresAt>1800000000000);
  });
});
test('only configured owner may issue limited, email-scoped client/worker invitations',()=>{
  fixture(({db,owner})=>{
    const other=createOwner(db,'nonowner@example.test','another-synthetic-strong-passphrase');
    assert.throws(()=>issueAccountInvite(db,{issuerId:other.id,ownerEmail,email:'new@example.test',role:'worker'}),AccountInviteError);
    for(const role of ['owner','admin','partner','suspended']) {
      assert.throws(()=>issue(db,owner,{role}),AccountInviteError);
    }
    assert.throws(()=>issue(db,owner,{email:ownerEmail}),AccountInviteError);
    assert.throws(()=>issue(db,owner,{email:'INVALID'}),AccountInviteError);
    const issued=issue(db,owner,{role:'worker',now:1800000000000});
    assert.equal(db.prepare('SELECT requested_role role FROM vps_account_invites WHERE token_hash IS NOT NULL').get().role,'worker');
    const next=issue(db,owner,{role:'worker',now:1800000001000});
    assert.notEqual(issued.token,next.token);
    assert.throws(()=>register(db,issued.token,{now:1800000001100}),/invalid|expired|used/i);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n,2);
  });
});
test('registration rejects replay, mismatch, invalid consent/password and expiry atomically',()=>{
  fixture(({db,owner})=>{
    const invite=issue(db,owner,{now:1800000000000});
    assert.throws(()=>register(db,invite.token,{email:'wrong@example.test',now:1800000001000}),AccountInviteError);
    assert.throws(()=>register(db,invite.token,{privacyAccepted:false,now:1800000001000}),AccountInviteError);
    assert.throws(()=>register(db,invite.token,{password:'short',confirmed:'short',now:1800000001000}),AccountInviteError);
    assert.throws(()=>register(db,invite.token,{confirmed:'wrong password',now:1800000001000}),AccountInviteError);
    assert.throws(()=>register(db,invite.token,{name:'',now:1800000001000}),AccountInviteError);
    assert.throws(()=>register(db,invite.token,{now:invite.expiresAt}),AccountInviteError);
    assert.equal(db.prepare('SELECT count(*) n FROM profiles').get().n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n,1);
    const accepted=register(db,invite.token,{now:1800000001000});
    assert.equal(accepted.email,'new@example.test');
    assert.equal(accepted.role,'client');
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n,2);
    const profile=db.prepare('SELECT role,status,requested_role,privacy_version FROM profiles WHERE id=?').get(accepted.id);
    assert.deepEqual({role:profile.role,status:profile.status,requested_role:profile.requested_role},
      {role:null,status:'pending',requested_role:'client'});
    assert.ok(profile.privacy_version);
    assert.equal(db.prepare('SELECT count(*) n FROM portal_audit WHERE entity_id=? AND action=?').get(accepted.id,'profile.invited').n,1);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_sessions').get().n,0);
    assert.throws(()=>register(db,invite.token,{now:1800000002000}),AccountInviteError);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n,2);
  });
});
test('worker enrollment is pending and credentials authenticate without privilege grant',()=>{
  fixture(({db,owner})=>{
    const invite=issue(db,owner,{role:'worker'});
    const accepted=register(db,invite.token);
    const p=db.prepare('SELECT requested_role,role,status FROM profiles WHERE id=?').get(accepted.id);
    assert.deepEqual({...p},{requested_role:'worker',role:null,status:'pending'});
    assert.equal(createLogin(db,{email:'new@example.test',password:'incorrect',clientKey:'synthetic'}),null);
    const logged=createLogin(db,{email:accepted.email,password:newPassword,clientKey:'synthetic'});
    assert.ok(logged?.token);
    assert.equal(readSession(db,'__Host-knaba-session='+logged.token).id,accepted.id);
  });
});
test('invitation issuance is bounded, neither unlimited nor extendable by past used tokens',()=>{
  fixture(({db,owner})=>{
    const now=1800000000000;
    for(let i=0;i<20;i++)issue(db,owner,{email:'person'+i+'@example.test',now:now+i});
    assert.throws(()=>issue(db,owner,{email:'last@example.test',now:now+100}),AccountInviteError);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_account_invites').get().n,20);
  });
});

test('explicit owner revocation makes an issued invitation unusable before registration',async()=>{
  const invites=await import('./account-invite.mjs');
  assert.equal(typeof invites.revokeAccountInvite,'function','missing owner revocation');
  fixture(({db,owner})=>{
    const now=1800000000000;
    const issued=issue(db,owner,{now});
    assert.equal(invites.revokeAccountInvite(db,{
      issuerId:owner.id,ownerEmail,email:'new@example.test',now:now+100
    }),true);
    assert.throws(()=>register(db,issued.token,{now:now+200}),/invalid|expired|used/i);
    assert.equal(invites.revokeAccountInvite(db,{
      issuerId:owner.id,ownerEmail,email:'new@example.test',now:now+300
    }),false);
    const replacement=issue(db,owner,{now:now+400});
    assert.equal(register(db,replacement.token,{now:now+500}).status,'pending');
  });
});

test('owner identity attestation is required before a one-use invitation and produces audit without plaintext token',()=>{
 fixture(({db,owner})=>{
  assert.throws(()=>issueAccountInvite(db,{
   issuerId:owner.id,ownerEmail,email:'pending@example.test',role:'worker'
  }),/attestation|verification|confirm/i);
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_account_invites').get().n,0);
  const result=issueAccountInvite(db,{
   issuerId:owner.id,ownerEmail,email:'pending@example.test',role:'worker',identityVerified:true
  });
  assert.match(result.token,/^[A-Za-z0-9_-]{43}$/);
  const row=db.prepare(
   "SELECT actor_id,entity_id FROM portal_audit WHERE action='account.invite.owner-attested'"
  ).get();
  assert.equal(row?.actor_id,owner.id);
  assert.match(row.entity_id,/^[a-f0-9]{64}$/);
  assert.equal(row.entity_id,db.prepare('SELECT token_hash FROM vps_account_invites WHERE email=?')
    .get('pending@example.test').token_hash);
  assert.notEqual(row.entity_id,result.token);
 });
});
