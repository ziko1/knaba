import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {backup} from 'node:sqlite';
import {setImmediate as settle} from 'node:timers/promises';
import {createKnabaVpsServer} from './server.mjs';

const staticRoot=new URL('../dist/client/',import.meta.url).pathname;
test('VPS scheduler gates private configuration, prevents overlap and waits before DB close',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-erp-scheduler-'));
  const workerPath=pathToFileURL(join(dir,'worker.mjs')).href;
  await writeFile(join(dir,'worker.mjs'),`export const calls=[];export let finish;
export default {fetch:async()=>new Response('ok'),scheduled(_event,env,ctx){
  calls.push(env);ctx.waitUntil(new Promise(resolve=>{finish=resolve}));
}};`);
  const fake=await import(workerPath);
  const make=erpBindings=>createKnabaVpsServer({dbPath:join(dir,crypto.randomUUID()+'.sqlite'),staticRoot,workerPath,localTest:true,host:'127.0.0.1',port:0,erpBindings});
  let app;
  t.mock.timers.enable({apis:['setInterval']});
  try{
    app=await make({ASSISTANT_ERP_ENABLED:'true'});
    t.mock.timers.tick(90000);await settle();assert.equal(fake.calls.length,0);
    await app.close();app=null;
    app=await make({ASSISTANT_ERP_ENABLED:'approved',ASSISTANT_ERP_SECRET:'test-only',OWNER_EMAIL:'attacker@example.test',DB:'override',UNRELATED_SECRET:'must-not-copy'});
    t.mock.timers.tick(30000);await settle();assert.equal(fake.calls.length,1);
    assert.equal(fake.calls[0].ASSISTANT_ERP_SECRET,'test-only');
    assert.equal(fake.calls[0].OWNER_EMAIL,'');assert.equal(typeof fake.calls[0].DB.prepare,'function');
    assert.equal(fake.calls[0].UNRELATED_SECRET,undefined);
    t.mock.timers.tick(90000);await settle();assert.equal(fake.calls.length,1,'No overlapping scheduler invocation');
    let closed=false;const closing=app.close().then(()=>{closed=true});await settle();
    assert.equal(closed,false,'Database stays open while scheduled work runs');
    assert.equal(app.db.prepare('SELECT 1 AS n').get().n,1);
    fake.finish();await closing;app=null;
    t.mock.timers.tick(90000);await settle();assert.equal(fake.calls.length,1,'No work after shutdown');
  }finally{t.mock.timers.reset();fake.finish?.();if(app)await app.close();await rm(dir,{recursive:true,force:true});}
});

test('isolated SQLite backup/restore preserves confirmed queue and disabled restart never dispatches',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-erp-restore-'));
  const dbPath=join(dir,'state.sqlite'),saved=join(dir,'backup.sqlite');
  const workerPath=new URL('../dist/server/index.js',import.meta.url).href;
  const make=()=>createKnabaVpsServer({dbPath,staticRoot,workerPath,localTest:true,host:'127.0.0.1',port:0});
  let app=await make();let outbound=0;
  const fetchMock=t.mock.method(globalThis,'fetch',async()=>{outbound++;throw Error('External traffic forbidden in restore test');});
  t.mock.timers.enable({apis:['setInterval']});
  try{
    app.db.prepare("INSERT INTO assistant_conversations(id,token_hash,locale,status,privacy_version,created_at,updated_at) VALUES ('restore','hash','de','human','privacy-v1','2026-10-25','2026-10-25')").run();
    app.db.prepare("INSERT INTO assistant_messages(id,conversation_id,sender,content,request_key,created_at) VALUES ('message','restore','customer','Preserve history','key','2026-10-25')").run();
    app.db.prepare("INSERT INTO assistant_erp_requests(id,conversation_id,scope_hash,snapshot_json,envelope_json,preview_hash,version,state,preview_expires_at,consent_at,event_id,external_id,created_at,updated_at) VALUES ('request','restore','scope','{\"name\":\"Synthetic\"}','{\"event_id\":\"stable-event\"}','preview',1,'QUEUED',1,1,'stable-event','stable-external',1,1)").run();
    const before=app.db.prepare('SELECT * FROM assistant_erp_requests').all();
    await backup(app.db,saved);await app.close();app=null;
    await copyFile(saved,dbPath);app=await make();
    assert.deepEqual(app.db.prepare('SELECT * FROM assistant_erp_requests').all(),before);
    assert.equal(app.db.prepare('SELECT content FROM assistant_messages').get().content,'Preserve history');
    assert.equal(app.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(app.db.prepare('PRAGMA foreign_key_check').all(),[]);
    t.mock.timers.tick(300000);await settle();assert.equal(outbound,0);
    assert.equal(app.db.prepare('SELECT state FROM assistant_erp_requests').get().state,'QUEUED');
  }finally{t.mock.timers.reset();fetchMock.mock.restore();if(app)await app.close();await rm(dir,{recursive:true,force:true});}
});
