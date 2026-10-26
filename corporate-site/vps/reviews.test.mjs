import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createKnabaVpsServer} from './server.mjs';
import {createOwner} from './auth.mjs';

test('real VPS review flow preserves idempotency, trusted owner moderation, privacy and restart durability',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-review-vps-'));
  const owner='synthetic-owner@example.test',password='local-review-test-passphrase-never-production';
  const origin='https://kneba.vsp.rest';
  const make=()=>createKnabaVpsServer({dbPath:join(dir,'state.sqlite'),ownerEmail:owner,origin,localTest:true,
    staticRoot:new URL('../dist/client/',import.meta.url).pathname,workerPath:new URL('../dist/server/index.js',import.meta.url).href,host:'127.0.0.1',port:0});
  let app=await make();
  const get=(path,options={})=>fetch('http://127.0.0.1:'+app.port+path,{redirect:'manual',...options,headers:{Host:'kneba.vsp.rest',...options.headers}});
  const headers={Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-KnaBa-Request':'portal-v1','Idempotency-Key':'synthetic-review-key-20261025'};
  const payload={displayName:'Synthetic integration test',email:'private-review@example.test',company:'Test only',relationship:'partner',text:'Synthetic review for isolated verification only. Never a real testimonial.',consent:true,website:''};
  try{
    assert.equal(app.migrations.length,9);
    assert.equal((await get('/api/reviews/manage',{headers:{'oai-authenticated-user-id':'forged','oai-authenticated-user-email':owner}})).status,401);
    assert.deepEqual(await (await get('/api/reviews')).json(),{reviews:[],total:0});
    const submitted=await get('/api/reviews',{method:'POST',headers,body:JSON.stringify(payload)});
    assert.equal(submitted.status,201,await submitted.clone().text());
    assert.equal((await get('/api/reviews',{method:'POST',headers,body:JSON.stringify(payload)})).status,200);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM public_reviews').get().count,1);
    assert.deepEqual(await (await get('/api/reviews')).json(),{reviews:[],total:0});
    createOwner(app.db,owner,password);
    const login=await get('/login/',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:owner,password,return_to:'/studio/'})});
    assert.equal(login.status,303);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const managed=await (await get('/api/reviews/manage',{headers:{Cookie:cookie}})).json();
    assert.equal(managed.reviews.length,1);
    const review=managed.reviews[0];
    assert.equal(review.email,payload.email);assert.equal(review.status,'pending');
    const publish=await get('/api/reviews/'+review.id,{method:'PATCH',headers:{...headers,Cookie:cookie},body:JSON.stringify({version:1,status:'published'})});
    assert.equal(publish.status,200,await publish.clone().text());
    let publicData=await (await get('/api/reviews')).json();
    assert.equal(publicData.reviews.length,1);assert.equal(publicData.reviews[0].text,payload.text);
    assert.ok(!JSON.stringify(publicData).includes(payload.email));
    assert.equal((await get('/api/reviews/'+review.id,{method:'PATCH',headers:{...headers,Cookie:cookie,Origin:'https://evil.invalid'},body:JSON.stringify({version:2,status:'hidden'})})).status,403);
    assert.equal((await get('/api/reviews/'+review.id,{method:'PATCH',headers:{...headers,Cookie:cookie},body:JSON.stringify({version:1,status:'hidden'})})).status,409);
    await app.close();app=await make();
    assert.equal((await (await get('/api/reviews')).json()).reviews.length,1);
    assert.equal((await get('/api/reviews/'+review.id,{method:'PATCH',headers:{...headers,Cookie:cookie},body:JSON.stringify({version:2,status:'hidden'})})).status,200);
    publicData=await (await get('/api/reviews')).json();assert.deepEqual(publicData,{reviews:[],total:0});
    assert.equal(app.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM portal_audit WHERE action LIKE 'review.%'").get().count,3);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
