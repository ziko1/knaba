import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createKnabaVpsServer} from './server.mjs';
import {createOwner} from './auth.mjs';

for(const path of ['/api/portal/erp-intake','/api/portal/erp-intake/'])test('actual owner cookie is rechecked after queue metadata reads: '+path,async()=>{
  const folder=await mkdtemp(join(tmpdir(),'knaba-erp-owner-')),owner='owner@example.test',password='synthetic-only-owner-status-password-2026';
  let app;
  try{
    app=await createKnabaVpsServer({dbPath:join(folder,'state.sqlite'),ownerEmail:owner,localTest:true,
      staticRoot:new URL('../dist/client/',import.meta.url).pathname,workerPath:new URL('../dist/server/index.js',import.meta.url).href,
      erpIntakeEnvironment:{},host:'127.0.0.1',port:0});
    createOwner(app.db,owner,password);
    const read=(route,options={})=>fetch('http://127.0.0.1:'+app.port+route,{redirect:'manual',...options,headers:{Host:'knaba.de',...options.headers}});
    assert.equal((await read(path,{headers:{'oai-authenticated-user-id':'forged','oai-authenticated-user-email':owner}})).status,401);
    const login=await read('/login/',{method:'POST',headers:{Origin:'https://knaba.de','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:owner,password,return_to:'/konto/'})});
    assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
    const before=await read(path,{headers:{Cookie:cookie}});assert.equal(before.status,200);assert.equal((await before.json()).limit,50);
    const originalPrepare=app.db.prepare.bind(app.db);let revoked=false;
    app.db.prepare=sql=>{
      const statement=originalPrepare(sql);
      if(/^SELECT\b/.test(sql)&&sql.includes('FROM site_erp_outbox'))return new Proxy(statement,{get(target,key){
        if(key==='all')return(...args)=>{const rows=target.all(...args);if(!revoked){originalPrepare('DELETE FROM vps_sessions').run();revoked=true;}return rows;};
        const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
      }});
      return statement;
    };
    try{
      const denied=await read(path,{headers:{Cookie:cookie}});assert.equal(revoked,true);assert.equal(denied.status,403);
      const body=await denied.json();assert.equal(body.error.code,'forbidden');assert.equal(body.rows,undefined);assert.equal(body.counts,undefined);
    }finally{app.db.prepare=originalPrepare;}
    assert.equal((await read(path,{headers:{Cookie:cookie}})).status,401);
  }finally{if(app)await app.close();await rm(folder,{recursive:true,force:true});}
});
