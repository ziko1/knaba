import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {LocalD1} from './database.mjs';

test('current-session guard fences reads, direct writes, RETURNING and batches at execution',async()=>{
  const sql=new DatabaseSync(':memory:');
  sql.exec("CREATE TABLE sample(id TEXT PRIMARY KEY,value TEXT);INSERT INTO sample VALUES('existing','private')");
  try{
    let live=true,checks=0;
    const d1=new LocalD1(sql).withAuthorization(()=>{checks++;return live;});
    assert.deepEqual(await d1.prepare('SELECT value FROM sample').first('value'),'private');
    const returning=d1.prepare('INSERT INTO sample VALUES (?,?) RETURNING id').bind('returning','new');
    const write=d1.prepare('INSERT INTO sample VALUES (?,?)').bind('write','new');
    const batch=d1.prepare('INSERT INTO sample VALUES (?,?)').bind('batch','new');
    live=false;
    for(const action of [
      ()=>d1.prepare('SELECT * FROM sample').first(),()=>d1.prepare('SELECT * FROM sample').all(),
      ()=>returning.first(),()=>write.run(),()=>d1.batch([batch])
    ])await assert.rejects(async()=>action(),error=>error?.code==='session_revoked');
    assert.equal(checks,6);
    assert.deepEqual(sql.prepare('SELECT id FROM sample').all().map(row=>row.id),['existing']);
    assert.equal(sql.isTransaction,false);
    live=true;
    assert.equal((await returning.first()).id,'returning');
    assert.equal((await d1.batch([write]))[0].meta.changes,1);
  }finally{sql.close();}
});

test('isolated workspace session guard holds both authority and destination transactions',async()=>{
  const authority=new DatabaseSync(':memory:'),workspace=new DatabaseSync(':memory:');
  authority.exec('CREATE TABLE sessions(active INTEGER);INSERT INTO sessions VALUES(1)');
  workspace.exec('CREATE TABLE sample(value TEXT)');
  try{
    const scoped=new LocalD1(workspace).withAuthorization(()=>{
      assert.equal(authority.isTransaction,true);assert.equal(workspace.isTransaction,true);
      return authority.prepare('SELECT active FROM sessions').get().active===1;
    },authority);
    await scoped.prepare('INSERT INTO sample VALUES (?)').bind('allowed').run();
    authority.exec('UPDATE sessions SET active=0');
    await assert.rejects(async()=>scoped.prepare('INSERT INTO sample VALUES (?) RETURNING value').bind('denied').first(),error=>error?.code==='session_revoked');
    assert.deepEqual(workspace.prepare('SELECT value FROM sample').all().map(row=>row.value),['allowed']);
    assert.equal(authority.isTransaction,false);assert.equal(workspace.isTransaction,false);
  }finally{workspace.close();authority.close();}
});
