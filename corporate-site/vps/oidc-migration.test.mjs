import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalDatabase} from './database.mjs';
import {createOwner,createSessionForUser} from './auth.mjs';

test('legacy VPS OIDC schema requires explicit migration and preserves state, sessions and Drizzle receipts',()=>{
  const directory=mkdtempSync(join(tmpdir(),'knaba-oidc-upgrade-')),path=join(directory,'state.sqlite');
  try{
    const baseline=openLocalDatabase(path);
    const owner=createOwner(baseline.db,'owner@example.test','synthetic-owner-password-2026');
    createSessionForUser(baseline.db,owner.id);
    baseline.db.exec(`DROP TABLE vps_oidc_states;
      CREATE TABLE vps_oidc_states(state_hash TEXT PRIMARY KEY NOT NULL,provider TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,intent TEXT NOT NULL,link_user_id TEXT REFERENCES vps_users(id),issued_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);`);
    baseline.db.prepare('INSERT INTO vps_oidc_states VALUES (?,?,?,?,?,?,?,?)')
      .run('synthetic-legacy-state','google','nonce','verifier','client',owner.id,1,2);
    const receipts=baseline.db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all().map(row=>({...row}));
    baseline.db.close();
    const before=readFileSync(path);
    assert.throws(()=>openLocalDatabase(path,{allowMigrations:false}),/Pending VPS auth migration oidc-link-session/);
    assert.deepEqual(readFileSync(path),before,'unapproved startup must not change the existing database');
    const upgraded=openLocalDatabase(path,{allowMigrations:true});
    try{
      const columns=upgraded.db.prepare('PRAGMA table_info(vps_oidc_states)').all();
      assert.equal(columns.filter(column=>column.name==='link_session_hash').length,1);
      assert.equal(upgraded.db.prepare('SELECT link_session_hash FROM vps_oidc_states').get().link_session_hash,null);
      assert.equal(upgraded.db.prepare('SELECT count(*) AS n FROM vps_sessions').get().n,1);
      assert.deepEqual(upgraded.db.prepare('SELECT * FROM vps_schema_migrations ORDER BY filename').all().map(row=>({...row})),receipts);
      assert.equal(upgraded.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      assert.deepEqual(upgraded.db.prepare('PRAGMA foreign_key_check').all(),[]);
    }finally{upgraded.db.close();}
    const second=openLocalDatabase(path,{allowMigrations:false});second.db.close();
    const read=new DatabaseSync(path,{readOnly:true});
    try{assert.equal(read.prepare('SELECT count(*) AS n FROM vps_oidc_states').get().n,1);}finally{read.close();}
  }finally{rmSync(directory,{recursive:true,force:true});}
});
