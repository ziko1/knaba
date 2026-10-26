import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectMigrationSequence} from './migration-guard.mjs';

function fixture(run){
 const dir=mkdtempSync(join(tmpdir(),'knaba-migration-sequence-'));
 mkdirSync(join(dir,'meta'));
 const names=['0000_baseline.sql','0005_assistant_erp_bridge.sql'];
 for(const name of names)writeFileSync(join(dir,name),'SELECT 1;');
 const journal={version:'7',dialect:'sqlite',entries:names.map((name,idx)=>({
   idx,version:'6',when:1792800000000+idx,tag:name.slice(0,-4),breakpoints:true
 }))};
 writeFileSync(join(dir,'meta/_journal.json'),JSON.stringify(journal));
 try{run(dir,journal);}finally{rmSync(dir,{recursive:true,force:true});}
}
test('verified unique SQL filenames match Drizzle journal without changing DB',()=>{
 fixture(dir=>assert.deepEqual(inspectMigrationSequence(dir),{
   names:['0000_baseline.sql','0005_assistant_erp_bridge.sql'],journalEntries:2
 }));
});
test('parallel owner invite and ERP both numbered 0005 are rejected before migration',()=>{
 fixture(dir=>{
  writeFileSync(join(dir,'0005_owner_invite.sql'),'SELECT 2;');
  assert.throws(()=>inspectMigrationSequence(dir),/MIGRATION_ORDER_COLLISION:0005/);
 });
});
test('new SQL absent from journal is blocked rather than silently skipped on D1',()=>{
 fixture(dir=>{
  writeFileSync(join(dir,'0006_owner_invite.sql'),'SELECT 2;');
  assert.throws(()=>inspectMigrationSequence(dir),/UNJOURNALED_MIGRATION:0006_owner_invite.sql/);
 });
});
test('journal entries without corresponding SQL and malformed journal fail closed',()=>{
 fixture((dir,journal)=>{
  const p=join(dir,'meta/_journal.json');
  writeFileSync(p,JSON.stringify({...journal,entries:[...journal.entries,{idx:2,tag:'0006_missing'}]}));
  assert.throws(()=>inspectMigrationSequence(dir),/JOURNAL_REFERENCES_MISSING_SQL/);
  writeFileSync(p,'{not-json');
  assert.throws(()=>inspectMigrationSequence(dir),/INVALID_MIGRATION_JOURNAL/);
 });
});
test('duplicate journal order cannot imply two applied steps',()=>{
 fixture((dir,journal)=>{
  const p=join(dir,'meta/_journal.json');
  journal.entries[1].idx=0;
  writeFileSync(p,JSON.stringify(journal));
  assert.throws(()=>inspectMigrationSequence(dir),/INVALID_MIGRATION_JOURNAL_ORDER/);
 });
});
test('symlinked SQL is not followed during preflight',()=>{
 fixture(dir=>{
  writeFileSync(join(dir,'innocent.txt'),'SELECT 1;');
  symlinkSync(join(dir,'innocent.txt'),join(dir,'0006_unsafe.sql'));
  assert.throws(()=>inspectMigrationSequence(dir),/INVALID_MIGRATION_FILE/);
 });
});
test('canonical database opens only after source guard, before SQLite creation',()=>{
 const source=readFileSync(new URL('./database.mjs',import.meta.url),'utf8');
 const guardPos=source.indexOf('const {names}=inspectMigrationSequence(location);');
 const openPos=source.indexOf('const db=new DatabaseSync(path)');
 assert.ok(guardPos>=0&&openPos>guardPos);
 assert.equal(source.includes('readdirSync(location).filter('),false);
});
