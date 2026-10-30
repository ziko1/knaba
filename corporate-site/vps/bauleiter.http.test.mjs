import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createKnabaVpsServer} from './server.mjs';
import {createOwner} from './auth.mjs';

const origin='https://bauleiter.example.test';
const password='synthetic-bauleiter-workflow-2026';
const ownerEmail='owner@example.test';

test('real VPS cookie sessions preserve pending approval and assigned Bauleiter scope through the full gateway',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'knaba-bauleiter-http-'));
 let app;
 try{
  app=await createKnabaVpsServer({dbPath:join(dir,'state.sqlite'),origin,ownerEmail,localTest:true,
   staticRoot:new URL('../dist/client/',import.meta.url).pathname,
   workerPath:new URL('../dist/server/index.js',import.meta.url).href,host:'127.0.0.1',port:0});
  createOwner(app.db,ownerEmail,password);
  const at=(path,options={})=>fetch('http://127.0.0.1:'+app.port+path,{redirect:'manual',...options,
   headers:{Host:'bauleiter.example.test',...options.headers}});
  const form=(fields,cookie='')=>({method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)});
  const json=(fields,cookie,method='POST')=>({method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-KnaBa-Request':'portal-v1'},body:JSON.stringify(fields)});
  const login=async email=>{
   const response=await at('/login/',form({email,password,return_to:'/konto/'}));
   assert.equal(response.status,303);return response.headers.get('set-cookie').split(';')[0];
  };
  const ownerCookie=await login(ownerEmail);
  const enroll=async(name,role)=>{
   const email=name+'@example.test';
   const issued=await at('/invite-user/',form({email,role,identity_verified:'on'},ownerCookie));
   assert.equal(issued.status,200);
   const token=(await issued.text()).match(/register\/#token=([A-Za-z0-9_-]{43})/)?.[1];assert.ok(token);
   const accepted=await at('/register/',form({email,name,password,password_confirm:password,privacy:'on',token}));
   assert.equal(accepted.status,303);
   const cookie=await login(email);
   const pending=await (await at('/api/portal/session',{headers:{Cookie:cookie}})).json();
   assert.equal(pending.role,'pending');assert.equal(pending.profile.requestedRole,role);
   assert.equal((await at('/api/portal/roles',json({userId:pending.user.id,role,status:'approved',version:1},cookie))).status,403);
   const approved=await at('/api/portal/roles',json({userId:pending.user.id,role,status:'approved',version:1},ownerCookie));
   assert.equal(approved.status,200,await approved.clone().text());
   assert.equal((await (await at('/api/portal/session',{headers:{Cookie:cookie}})).json()).role,role);
   return {cookie,id:pending.user.id};
  };
  const client=await enroll('client','client');
  const worker=await enroll('worker','worker');
  const first=await enroll('site-manager-one','bauleiter');
  const second=await enroll('site-manager-two','bauleiter');
  const created=await at('/api/portal/requests',json({service:'baureinigung',objectType:'Baustelle',postcode:'10315',area:'120',frequency:'Einmalig',message:'Synthetic construction cleanup request.',address:'Synthetic site',privacyAccepted:true,idempotencyKey:crypto.randomUUID()},client.cookie));
  assert.equal(created.status,201,await created.clone().text());
  let request=(await created.json()).request;
  const patch=async(cookie,body)=>{
   const response=await at('/api/portal/requests/'+request.id,json({version:request.version,...body},cookie,'PATCH'));
   assert.equal(response.status,200,await response.clone().text());request=(await response.json()).request;
  };
  await patch(ownerCookie,{assignedBauleiterId:first.id});
  let mine=await (await at('/api/portal/dashboard',{headers:{Cookie:first.cookie}})).json();
  assert.deepEqual(mine.requests.map(item=>item.id),[request.id]);
  assert.equal(mine.requests[0].email,undefined);assert.equal(mine.requests[0].phone,undefined);
  assert.deepEqual((await (await at('/api/portal/dashboard',{headers:{Cookie:second.cookie}})).json()).requests,[]);
  assert.equal((await at('/api/portal/requests/'+request.id,json({version:request.version,status:'reviewing'},second.cookie,'PATCH'))).status,404);
  await patch(first.cookie,{status:'reviewing'});
  await patch(first.cookie,{status:'scheduled',assignedWorkerId:worker.id,scheduledAt:'2026-11-01T10:00:00Z'});
  assert.equal((await (await at('/api/portal/dashboard',{headers:{Cookie:worker.cookie}})).json()).requests[0].id,request.id);
  assert.equal((await at('/api/crm/contacts',{headers:{Cookie:first.cookie}})).status,403);
  assert.equal((await at('/api/studio/pages',{headers:{Cookie:first.cookie}})).status,403);
  const forged=await (await at('/api/portal/session',{headers:{'oai-authenticated-user-id':first.id,'oai-authenticated-user-email':'site-manager-one@example.test'}})).json();
  assert.equal(forged.role,'anonymous');
  await patch(ownerCookie,{assignedBauleiterId:second.id});
  mine=await (await at('/api/portal/dashboard',{headers:{Cookie:first.cookie}})).json();assert.deepEqual(mine.requests,[]);assert.deepEqual(mine.profiles,[]);
  const paused=await at('/api/portal/roles',json({userId:second.id,role:'bauleiter',status:'suspended',version:2},ownerCookie));
  assert.equal(paused.status,200);
  assert.equal((await (await at('/api/portal/session',{headers:{Cookie:second.cookie}})).json()).role,'suspended');
  assert.equal((await at('/api/portal/requests/'+request.id,json({version:request.version,status:'in_progress'},second.cookie,'PATCH'))).status,403);
 }finally{if(app)await app.close();await rm(dir,{recursive:true,force:true});}
});
