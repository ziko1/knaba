import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {openLocalDatabase} from './database.mjs';
import {issueOwnerInvite,activateOwnerInvite} from './owner-invite.mjs';

const email='owner@example.test';
const password='synthetic-owner-password-2026-without-secrets';
async function fixture(run){
  const dir=await mkdtemp(join(tmpdir(),'knaba-invite-'));
  const {db,migrations}=openLocalDatabase(join(dir,'site.sqlite'));
  try{
    assert.equal(migrations.length,7);
    await run(db);
  }finally{db.close();await rm(dir,{recursive:true,force:true});}
}

test('invitation stores hash only, and verified one-time email claim creates a real owner',async()=>{
  await fixture(db=>{
    const now=1790000000000;
    const invite=issueOwnerInvite(db,email,{now});
    assert.match(invite.token,/^[A-Za-z0-9_-]{43}$/);
    assert.equal(invite.email,email);
    assert.equal(invite.expiresAt,now+2*3600000);
    const records=db.prepare('SELECT * FROM vps_owner_invites').all();
    assert.equal(records.length,1);
    assert.equal(records[0].token_hash.length,64);
    assert.ok(!JSON.stringify(records).includes(invite.token));
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n,0);
    assert.throws(()=>activateOwnerInvite(db,{token:invite.token,email,password,confirmed:'WRONG',attested:true,now:now+100}),/password/i);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n,0);
    assert.throws(()=>activateOwnerInvite(db,{token:'X'.repeat(43),email,password,confirmed:password,attested:true,now:now+101}),/invalid|expired/i);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n,0);
    const owner=activateOwnerInvite(db,{token:invite.token,email,password,confirmed:password,attested:true,now:now+150});
    assert.equal(owner.email,email);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users WHERE email=?').get(email).n,1);
    assert.equal(db.prepare('SELECT used_at FROM vps_owner_invites').get().used_at,now+150);
    assert.throws(()=>activateOwnerInvite(db,{token:invite.token,email,password,confirmed:password,attested:true,now:now+200}));
  });
});

test('a newer invitation revokes older token; expiration, email and attestation are enforced',async()=>{
  await fixture(db=>{
    const now=1790000000000;
    const previous=issueOwnerInvite(db,email,{now});
    const active=issueOwnerInvite(db,email,{now:now+3000});
    assert.notEqual(active.token,previous.token);
    const args={email,password,confirmed:password,attested:true,now:now+3500};
    assert.throws(()=>activateOwnerInvite(db,{...args,token:previous.token}));
    assert.throws(()=>activateOwnerInvite(db,{...args,token:active.token,email:'intruder@example.test'}));
    assert.throws(()=>activateOwnerInvite(db,{...args,token:active.token,attested:false}));
    assert.throws(()=>activateOwnerInvite(db,{...args,token:active.token,now:active.expiresAt+1}));
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n,0);
  });
});

test('request rejection never consumes a valid email claim or creates a partially initialized account',async()=>{
  await fixture(db=>{
    const now=1790000000000;
    const invite=issueOwnerInvite(db,email,{now});
    assert.throws(()=>activateOwnerInvite(db,{token:invite.token,email,password:'short',confirmed:'short',attested:true,now:now+1}));
    assert.equal(db.prepare('SELECT used_at FROM vps_owner_invites WHERE email=? ORDER BY issued_at DESC LIMIT 1').get(email).used_at,null);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n,0);
  });
});

test('operator CLI cannot provision preview access on another domain',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-preview-cli-'));
  const file=join(dir,'site.sqlite');
  const {db}=openLocalDatabase(file); db.close();
  const run=(origin)=>spawnSync(process.execPath,
    [new URL('./manage.mjs',import.meta.url).pathname,'invite-preview'],
    {encoding:'utf8',timeout:15000,env:{
      ...process.env, KNABA_DB_PATH:file,
      KNABA_PREVIEW_OWNER_EMAIL:email, KNABA_PUBLIC_ORIGIN:origin
    }});
  try{
    assert.notEqual(run('https://knaba.de').status,0);
    const created=run('https://kneba.vsp.rest');
    assert.equal(created.status,0,created.stderr);
    const manifest=JSON.parse(created.stdout);
    assert.equal(manifest.to,email);
    assert.match(manifest.activationUrl,
      /^https:\/\/kneba\.vsp\.rest\/register\/\#token=[A-Za-z0-9_-]{43}$/);
    const inspected=openLocalDatabase(file,{allowMigrations:false});
    assert.equal(inspected.db.prepare('SELECT count(*) n FROM vps_owner_invites WHERE used_at IS NULL').get().n,1);
    assert.equal(inspected.db.prepare('SELECT count(*) n FROM vps_users').get().n,0);
    inspected.db.close();
  }finally{await rm(dir,{recursive:true,force:true});}
});
