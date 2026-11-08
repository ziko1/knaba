import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {LocalD1} from './database.mjs';

test('Studio authorization is checked inside write transaction and rejected atomically',async()=>{
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE sample (value TEXT)');
  try{
    const d1=new LocalD1(db);
    let checked=false;
    const result=await d1.authorizedBatch([d1.prepare("INSERT INTO sample VALUES ('must not commit')")],()=>{
      checked=true;assert.throws(()=>db.exec('BEGIN IMMEDIATE'),/transaction/i);return false;
    });
    assert.equal(checked,true);assert.equal(result,null);
    assert.equal(db.prepare('SELECT count(*) AS n FROM sample').get().n,0);
    const accepted=await d1.authorizedBatch([d1.prepare("INSERT INTO sample VALUES ('permitted')")],()=>true);
    assert.equal(accepted[0].meta.changes,1);
    assert.equal(db.prepare('SELECT value FROM sample').get().value,'permitted');
  }finally{db.close();}
});

test('isolated Studio workspace holds primary authority lock and rolls back rejected/errors',async()=>{
  const authority=new DatabaseSync(':memory:'),workspace=new DatabaseSync(':memory:');
  workspace.exec('CREATE TABLE sample (value TEXT)');
  try{
    const d1=new LocalD1(workspace);
    const guard=()=>{
      assert.throws(()=>authority.exec('BEGIN IMMEDIATE'),/transaction/i);
      assert.throws(()=>workspace.exec('BEGIN IMMEDIATE'),/transaction/i);return true;
    };
    await d1.authorizedBatch([d1.prepare("INSERT INTO sample VALUES ('accepted')")],guard,authority);
    authority.exec('BEGIN IMMEDIATE; ROLLBACK');workspace.exec('BEGIN IMMEDIATE; ROLLBACK');
    await assert.rejects(d1.authorizedBatch([d1.prepare('INSERT INTO absent_table VALUES (1)')],guard,authority),/absent_table/);
    authority.exec('BEGIN IMMEDIATE; ROLLBACK');workspace.exec('BEGIN IMMEDIATE; ROLLBACK');
    assert.equal(workspace.prepare('SELECT count(*) AS n FROM sample').get().n,1);
    assert.equal(await d1.authorizedBatch([d1.prepare("INSERT INTO sample VALUES ('denied')")],()=>false,authority),null);
    assert.equal(workspace.prepare('SELECT count(*) AS n FROM sample').get().n,1);
  }finally{authority.close();workspace.close();}
});
