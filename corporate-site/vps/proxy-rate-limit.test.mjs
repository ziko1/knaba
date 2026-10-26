import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createKnabaVpsServer} from './server.mjs';
import {createOwner} from './auth.mjs';

// Real HTTP + built worker + isolated SQLite; no live data or provider dispatch.
for(const trustProxy of [false,true])test(`visitor lead limits obey configured proxy trust (${trustProxy})`,async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-proxy-leads-'));
  const origin='https://kneba.vsp.rest';
  const app=await createKnabaVpsServer({dbPath:join(dir,'test.sqlite'),origin,localTest:true,
    trustedProxyIps:trustProxy?['127.0.0.1']:[],
    staticRoot:new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href,host:'127.0.0.1',port:0});
  let sequence=0;
  const submit=async(forwarded)=>{
    const body={service:'baureinigung',objectType:'Baustelle',postcode:'10315',area:'200',frequency:'Einmalig',
      message:'Synthetic disposable rate-limit verification.',name:'Synthetic QA',email:`test${sequence++}@example.test`,
      phone:'',website:'',privacyAccepted:true,idempotencyKey:crypto.randomUUID()};
    const reply=await fetch(`http://127.0.0.1:${app.port}/api/leads`,{method:'POST',headers:{
      Host:'kneba.vsp.rest',Origin:origin,'Sec-Fetch-Site':'same-origin','X-Knaba-Request':'portal-v1',
      'Content-Type':'application/json','X-Forwarded-For':forwarded,'CF-Connecting-IP':`203.0.113.${sequence}`,
    },body:JSON.stringify(body)});
    return {status:reply.status,body:await reply.text()};
  };
  try{
    for(let n=0;n<20;n++){
      const result=await submit('198.51.100.1');assert.equal(result.status,201,result.body);
    }
    // Changing a forged prefix or cf-connecting-ip cannot evade an exhausted bucket.
    assert.equal((await submit('203.0.113.99, 198.51.100.1')).status,429);
    assert.equal((await submit('198.51.100.2')).status,trustProxy?201:429);
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM cleaning_requests').get().n,trustProxy?21:20);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('login limits share the verified visitor identity and reject forged prefixes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-proxy-login-'));
  const origin='https://kneba.vsp.rest',owner='qa-owner@example.test';
  const password='synthetic-proxy-test-only-not-production';
  const app=await createKnabaVpsServer({dbPath:join(dir,'test.sqlite'),origin,localTest:true,ownerEmail:owner,
    trustedProxyIps:['127.0.0.1'],staticRoot:new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href,host:'127.0.0.1',port:0});
  const login=async(forwarded,value)=>{
    const reply=await fetch(`http://127.0.0.1:${app.port}/login/`,{redirect:'manual',method:'POST',headers:{
      Host:'kneba.vsp.rest',Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/x-www-form-urlencoded',
      'X-Forwarded-For':forwarded,
    },body:new URLSearchParams({email:owner,password:value,return_to:'/konto/'})});
    await reply.text();return reply.status;
  };
  try{
    createOwner(app.db,owner,password);
    for(let n=0;n<5;n++)assert.equal(await login('198.51.100.1','incorrect-password'),401);
    assert.equal(await login('203.0.113.99, 198.51.100.1',password),401);
    assert.equal(await login('198.51.100.2',password),303);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
