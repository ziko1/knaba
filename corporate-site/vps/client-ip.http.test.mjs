import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {createKnabaVpsServer} from './server.mjs';
import {openLocalDatabase} from './database.mjs';
import {createOwner} from './auth.mjs';

const origin='https://knaba.de',owner='proxy-test@example.test';
const password='synthetic-proxy-test-password-2026';
async function fixture(trustedProxyIps=''){
  const dir=await mkdtemp(join(tmpdir(),'knaba-proxy-ip-'));
  const dbPath=join(dir,'test.sqlite');
  const initialized=openLocalDatabase(dbPath,{allowMigrations:true});
  createOwner(initialized.db,owner,password);
  initialized.db.close();
  const options={dbPath,ownerEmail:owner,origin,localTest:false,trustedProxyIps,
    staticRoot:new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href,host:'127.0.0.1',port:0};
  let app=await createKnabaVpsServer(options);
  const post=(path,headers,body)=>new Promise((resolve,reject)=>{
    const call=httpRequest({host:'127.0.0.1',port:app.port,path,method:'POST',headers},response=>{
      const chunks=[];
      response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>resolve({status:response.statusCode,text:async()=>Buffer.concat(chunks).toString()}));
      response.on('error',reject);
    });
    call.on('error',reject);call.end(body);
  });
  return {
    get db(){return app.db;},
    async request(path,client,body,extra={}){
      return post(path,{Host:'knaba.de',Origin:origin,'Sec-Fetch-Site':'same-origin','X-Knaba-Request':'portal-v1',
          'X-Forwarded-Proto':'https','Content-Type':'application/json',
          ...(client===undefined?{}:{'CF-Connecting-IP':client}),...extra},JSON.stringify(body));
    },
    async login(client,attempt=password){
      return post('/login/',{Host:'knaba.de',Origin:origin,'Sec-Fetch-Site':'same-origin','X-Forwarded-Proto':'https',
          'CF-Connecting-IP':client,'Content-Type':'application/x-www-form-urlencoded'},
        new URLSearchParams({email:owner,password:attempt,return_to:'/konto/'}).toString());
    },
    async restart(){await app.close();app=await createKnabaVpsServer(options);},
    async close(){await app.close();await rm(dir,{recursive:true,force:true});}
  };
}
const lead=()=>({service:'baureinigung',objectType:'Baustelle',postcode:'10115',area:'30',
  frequency:'Einmalig',message:'Synthetic proxy isolation check',name:'Synthetic Visitor',
  email:randomUUID()+'@example.test',phone:'',website:'',privacyAccepted:true,idempotencyKey:randomUUID()});
const status=async(response,expected)=>assert.equal(response.status,expected,await response.text());

test('trusted peer gives independent durable lead buckets at the unchanged 20/hour limit',async()=>{
  const app=await fixture('127.0.0.1');
  try{
    for(let i=0;i<20;i++)await status(await app.request('/api/leads','192.0.2.1',lead()),201);
    await status(await app.request('/api/leads','::ffff:192.0.2.1',lead()),429);
    await status(await app.request('/api/leads','192.0.2.2',lead()),201);
    await app.restart();
    await status(await app.request('/api/leads','192.0.2.1',lead()),429);
    assert.deepEqual(app.db.prepare("SELECT count FROM portal_rate_limits WHERE key LIKE 'lead-ip:%' ORDER BY count").all().map(row=>row.count),[1,20]);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM cleaning_requests').get().n,21);
  }finally{await app.close();}
});
test('trusted peer separates chat buckets without bypassing production CAPTCHA',async()=>{
  const app=await fixture('127.0.0.1');
  try{
    const body={locale:'de',privacyAccepted:true,website:''};
    for(let i=0;i<10;i++)await status(await app.request('/api/assistant/conversations','192.0.2.1',body),503);
    await status(await app.request('/api/assistant/conversations','192.0.2.1',body),429);
    await status(await app.request('/api/assistant/conversations','192.0.2.2',body),503);
    assert.deepEqual(app.db.prepare("SELECT count FROM portal_rate_limits WHERE key LIKE 'assistant:%' ORDER BY count").all().map(row=>row.count),[1,10]);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM assistant_conversations').get().n,0);
  }finally{await app.close();}
});
test('login uses the same trusted visitor IP and preserves five-attempt limit',async()=>{
  const app=await fixture('127.0.0.1');
  try{
    for(let i=0;i<5;i++)await status(await app.login('192.0.2.1','wrong-password'),401);
    await status(await app.login('::ffff:192.0.2.1'),401);
    await status(await app.login('192.0.2.2'),303);
  }finally{await app.close();}
});
test('direct untrusted clients cannot rotate headers to evade lead or login limits',async()=>{
  const app=await fixture('172.20.0.1');
  try{
    for(let i=0;i<20;i++)await status(await app.request('/api/leads','198.51.100.'+(i+1),lead(),{
      'X-Forwarded-For':'203.0.113.'+(i+1),'X-Real-IP':'203.0.113.'+(i+1),Forwarded:'for=203.0.113.'+(i+1)
    }),201);
    await status(await app.request('/api/leads','198.51.100.99',lead()),429);
    for(let i=0;i<5;i++)await status(await app.login('198.51.100.'+(i+1),'wrong-password'),401);
    await status(await app.login('198.51.100.99'),401);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM portal_rate_limits WHERE key LIKE 'lead-ip:%'").get().n,1);
  }finally{await app.close();}
});
test('trusted malformed and multiple IP headers keep one fallback bucket',async()=>{
  const app=await fixture('127.0.0.1');
  try{
    const malformed=[undefined,'unknown','192.0.2.1, 198.51.100.1','[2001:db8::1]','192.0.2.1:80'];
    for(let i=0;i<20;i++)await status(await app.request('/api/leads',malformed[i%malformed.length],lead()),201);
    await status(await app.request('/api/leads','broken',lead()),429);
    await status(await app.request('/api/leads','192.0.2.2',lead()),201);
  }finally{await app.close();}
});
test('invalid proxy configuration is rejected before a database is created',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-proxy-invalid-'));
  const dbPath=join(dir,'never-created.sqlite');
  try{
    await assert.rejects(createKnabaVpsServer({dbPath,trustedProxyIps:'*',localTest:true,
      staticRoot:new URL('../dist/client/',import.meta.url).pathname,
      workerPath:new URL('../dist/server/index.js',import.meta.url).href}),/Invalid KNABA_TRUSTED_PROXY_IPS configuration/);
    await assert.rejects(stat(dbPath),{code:'ENOENT'});
  }finally{await rm(dir,{recursive:true,force:true});}
});
