import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLocalDatabase } from './database.mjs';
import { createOwner, createSessionForUser } from './auth.mjs';
import { hasOwnerAuthority } from './admin-access.mjs';
import { updateExistingOwner } from './owner-maintenance.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'knaba-owner-maintenance-'));
  const { db } = openLocalDatabase(join(directory, 'site.sqlite'));
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  const owner = createOwner(db, 'owner@example.test', 'strong-test-password-123');
  db.prepare('INSERT INTO profiles VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(owner.id, 'Old name', owner.email, 'client', 'client', 'approved', 'test', 'now', 'now', 1, 'test');
  return { db, owner };
}

test('offline owner update retains identity and password, revokes sessions and updates authority only with new server config', t => {
  const { db, owner } = fixture(t);
  const prior = db.prepare('SELECT password_hash,salt FROM vps_users WHERE id=?').get(owner.id);
  createSessionForUser(db, owner.id);
  db.prepare('INSERT INTO vps_oidc_links VALUES (?,?,?,?)').run('https://issuer.example.test', 'subject', owner.id, 'now');
  const result = updateExistingOwner(db, { currentEmail: owner.email, newEmail: 'changed@example.test', name: 'Same owner', identityVerified: true }, { ownerEmail: owner.email });
  assert.equal(result.identityPreserved, true);
  assert.deepEqual(db.prepare('SELECT password_hash,salt FROM vps_users WHERE id=?').get(owner.id), prior);
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_sessions').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM vps_oidc_links').get().n, 0);
  assert.equal(db.prepare('SELECT name FROM profiles WHERE id=?').get(owner.id).name, 'Same owner');
  assert.equal(hasOwnerAuthority(db, { userId: owner.id, ownerEmail: owner.email }), false);
  assert.equal(hasOwnerAuthority(db, { userId: owner.id, ownerEmail: 'changed@example.test' }), true);
  assert.equal(db.prepare("SELECT count(*) AS n FROM portal_audit WHERE action='owner.details_updated'").get().n, 1);
});

test('owner maintenance refuses another account, developer address, mismatched owner and absent attestation without mutations', t => {
  const { db, owner } = fixture(t);
  createOwner(db, 'client@example.test', 'strong-test-password-456');
  const input = { currentEmail: owner.email, newEmail: 'new@example.test', identityVerified: true };
  const options = { ownerEmail: owner.email, developerEmail: 'developer@example.test' };
  for (const patch of [{ newEmail: 'client@example.test' }, { newEmail: 'developer@example.test' }, { currentEmail: 'wrong@example.test' }, { identityVerified: false }, { injected: true }]) {
    assert.throws(() => updateExistingOwner(db, { ...input, ...patch }, options));
    assert.equal(db.prepare('SELECT email FROM vps_users WHERE id=?').get(owner.id).email, owner.email);
    assert.equal(db.prepare('SELECT count(*) AS n FROM portal_audit').get().n, 0);
  }
});

test('disabled or missing configured owner cannot be reassigned', t => {
  const { db, owner } = fixture(t);
  db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(owner.id);
  assert.throws(() => updateExistingOwner(db, { currentEmail: owner.email, newEmail: 'new@example.test', identityVerified: true }, { ownerEmail: owner.email }));
});
