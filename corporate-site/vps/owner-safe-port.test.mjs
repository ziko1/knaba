import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectMigrationSequence } from './migration-guard.mjs';
import { openLocalDatabase } from './database.mjs';

const ownerEmail = 'owner@example.test';
const passphrase = 'synthetic-only-2026-owner-passphrase-strong';

async function fixture(work) {
  const dir = await mkdtemp(join(tmpdir(), 'knaba-owner-safe-'));
  const path = join(dir, 'knaba.sqlite');
  try {
    const { db, migrations } = openLocalDatabase(path);
    try {
      assert.equal(migrations.length, 10);
      assert.equal(migrations[5], '0005_public_reviews.sql');
      assert.equal(migrations[6], '0006_owner_invite.sql');
      assert.equal(migrations[7], '0007_account_invites.sql');
      return await work(db, { dir, path });
    } finally { db.close(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('current review migration is preserved and owner invite migration is forward-only ordinal 0006', () => {
  const { names } = inspectMigrationSequence(fileURLToPath(new URL('../drizzle/', import.meta.url)));
  assert.equal(names[5], '0005_public_reviews.sql');
  assert.equal(names[6], '0006_owner_invite.sql');
});

test('owner invitation exists as a separate, non-public VPS module', () => {
  assert.ok(existsSync(new URL('./owner-invite.mjs', import.meta.url)), 'missing safe owner invitation module');
});

test('one-use activation requires verified email scope, strong password, attestation and valid expiry', async () => {
  const { issueOwnerInvite, activateOwnerInvite } = await import('./owner-invite.mjs');
  await fixture(db => {
    const now = 1790000000000;
    const invite = issueOwnerInvite(db, ownerEmail, { now });
    assert.match(invite.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(invite.expiresAt, now + 2 * 60 * 60_000);
    const raw = db.prepare('SELECT * FROM vps_owner_invites').get();
    assert.ok(raw.token_hash && !JSON.stringify(raw).includes(invite.token));
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n, 0);
    const args = {token:invite.token, email:ownerEmail, password:passphrase, confirmed:passphrase, attested:true, now:now+200};
    assert.throws(() => activateOwnerInvite(db, {...args, attested:false}));
    assert.throws(() => activateOwnerInvite(db, {...args, email:'other@example.test'}));
    assert.throws(() => activateOwnerInvite(db, {...args, password:'short', confirmed:'short'}));
    assert.throws(() => activateOwnerInvite(db, {...args, confirmed:'wrong'}));
    assert.throws(() => activateOwnerInvite(db, {...args, now:invite.expiresAt}));
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n, 0);
    assert.equal(activateOwnerInvite(db,args).email,ownerEmail);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users WHERE email=?').get(ownerEmail).n, 1);
    assert.throws(() => activateOwnerInvite(db,args), /already|expired|invalid|exists/i);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n, 1);
  });
});

test('a newer invitation invalidates an older one without changing any current user', async () => {
  const { issueOwnerInvite, activateOwnerInvite } = await import('./owner-invite.mjs');
  await fixture(db => {
    const now = 1790000000000;
    const old = issueOwnerInvite(db, ownerEmail, { now });
    const next = issueOwnerInvite(db, ownerEmail, { now:now+1000 });
    assert.notEqual(old.token, next.token);
    const args = {email:ownerEmail,password:passphrase,confirmed:passphrase,attested:true,now:now+1100};
    assert.throws(() => activateOwnerInvite(db,{...args,token:old.token}), /invalid|expired/i);
    assert.equal(db.prepare('SELECT count(*) n FROM vps_users').get().n,0);
  });
});

test('invitation CLI fails closed and stores the bearer URL only in a private 0600 file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'knaba-owner-cli-safe-'));
  const path = join(dir, 'knaba.sqlite');
  try {
    const current = openLocalDatabase(path);current.db.close();
    const run = (origin,owner=ownerEmail) => spawnSync(process.execPath,
      [new URL('./manage.mjs',import.meta.url).pathname,'invite-owner'],
      {encoding:'utf8',timeout:15000,env:{...process.env,KNABA_DB_PATH:path,OWNER_EMAIL:owner,KNABA_PUBLIC_ORIGIN:origin}});
    assert.notEqual(run('http://other.example').status,0);
    assert.equal(statSync(path).isFile(),true);
    const valid = run('https://kneba.vsp.rest');
    assert.equal(valid.status,0,valid.stderr);
    assert.doesNotMatch(valid.stdout,/#token=[A-Za-z0-9_-]{43}|activationUrl|\\"to\\"/);
    const notice=JSON.parse(valid.stdout);
    assert.equal(notice.issued,true);
    assert.ok(notice.secretFile?.startsWith(join(dir,'owner-invites')+'/'));
    assert.equal(statSync(notice.secretFile).mode & 0o777,0o600);
    const privateData=JSON.parse(await readFile(notice.secretFile,'utf8'));
    assert.equal(privateData.to,ownerEmail);
    assert.match(privateData.activationUrl,/^https:\/\/kneba\.vsp\.rest\/activate-owner\/#token=[A-Za-z0-9_-]{43}$/);
    const opened=openLocalDatabase(path,{allowMigrations:false});
    try {
      assert.equal(opened.db.prepare('SELECT count(*) n FROM vps_owner_invites WHERE used_at IS NULL').get().n,1);
      assert.equal(opened.db.prepare('SELECT count(*) n FROM vps_users').get().n,0);
    }finally{opened.db.close();}
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('owner and developer one-use activation accept eight-character secrets, not seven',async()=>{
  const {issueOwnerInvite,activateOwnerInvite}=await import('./owner-invite.mjs');
  await fixture(db=>{
    const one=issueOwnerInvite(db,'qa8-owner@example.test');
    assert.throws(()=>activateOwnerInvite(db,{token:one.token,email:'qa8-owner@example.test',password:'Qa9!bcd',confirmed:'Qa9!bcd',attested:true,purpose:'owner'}));
    assert.ok(activateOwnerInvite(db,{token:one.token,email:'qa8-owner@example.test',password:'Qa9!bcde',confirmed:'Qa9!bcde',attested:true,purpose:'owner'}).id);
    const dev=issueOwnerInvite(db,'qa8-developer@example.test');
    assert.ok(activateOwnerInvite(db,{token:dev.token,email:'qa8-developer@example.test',password:'Qa9!bcde',confirmed:'Qa9!bcde',attested:true,purpose:'developer'}).id);
    assert.equal(db.prepare("SELECT count(*) n FROM vps_staff_grants WHERE active=1 AND purpose='developer'").get().n,1);
    assert.throws(()=>activateOwnerInvite(db,{token:dev.token,email:'qa8-developer@example.test',password:'Qa9!bcde',confirmed:'Qa9!bcde',attested:true,purpose:'developer'}));
  });
});
