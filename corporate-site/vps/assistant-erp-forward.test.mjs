import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectMigrationSequence} from './migration-guard.mjs';
import {openLocalDatabase} from './database.mjs';

const source=new URL('../drizzle/',import.meta.url).pathname;
test('site ledger preserves reviews and owner invites before adding isolated ERP outbox migration',()=>{
  const {names,journalEntries}=inspectMigrationSequence(source);
  assert.equal(journalEntries,8);
  assert.deepEqual(names.slice(5),['0005_public_reviews.sql','0006_owner_invite.sql','0007_assistant_erp_bridge.sql']);
});
test('new isolated SQLite includes a unique ERP outbox with no automatic sends',()=>{
  const dir=mkdtempSync(join(tmpdir(),'knaba-erp-bridge-synthetic-'));
  try{
    const {db,migrations}=openLocalDatabase(join(dir,'db.sqlite'));
    try{
      assert.equal(migrations.length,8);
      assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='assistant_erp_requests'").get().n,1);
      for(const index of ['assistant_erp_event','assistant_erp_external','assistant_erp_conversation','assistant_erp_due'])
        assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='index' AND name=?").get(index).n,1);
      assert.equal(db.prepare('SELECT count(*) n FROM assistant_erp_requests').get().n,0);
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    }finally{db.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
