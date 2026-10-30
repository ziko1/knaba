import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createKnabaVpsServer} from './server.mjs';
import {createOwner} from './auth.mjs';
import {issueOwnerInvite,activateOwnerInvite} from './owner-invite.mjs';
import {hasOwnerAuthority} from './admin-access.mjs';
const origin='https://owner-server.example';
const owner='owner@example.test';
const developer='developer@example.test';
const pass='synthetic-strong-secret-2026';
const headers={Host:'owner-server.example'};
const form=(fields,cookie='')=>({
 method:'POST',headers:{...headers,Origin:origin,'Content-Type':'application/x-www-form-urlencoded',Cookie:cookie},
 body:new URLSearchParams(fields)
});
const json=(fields,cookie='')=>({
 method:'POST',headers:{...headers,Origin:origin,'Sec-Fetch-Site':'same-origin','X-Knaba-Request':'portal-v1',
 'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(fields)
});
test('customer host: owner handles real onboarding, developer has isolated test data, partner scope and grant revocation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'knaba-dual-admin-http-'));
 let service;
 try{
  service=await createKnabaVpsServer({dbPath:join(dir,'state.sqlite'),
   staticRoot:new URL('../dist/client/',import.meta.url).pathname,
   workerPath:new URL('../dist/server/index.js',import.meta.url).href,
   host:'127.0.0.1',port:0,localTest:true,origin,ownerEmail:owner,developerEmail:developer
  });
  const original=createOwner(service.db,owner,pass);
  const devInvite=issueOwnerInvite(service.db,developer);
  const enrolled=activateOwnerInvite(service.db,{token:devInvite.token,email:developer,
    password:pass,confirmed:pass,attested:true,purpose:'developer'});
  assert.equal(service.db.prepare('SELECT COUNT(*) n FROM vps_staff_grants').get().n,1);
  const at=(path,opts={})=>fetch('http://127.0.0.1:'+service.port+path,{
   redirect:'manual',...opts,headers:{...headers,...opts.headers}
  });
  const o=await at('/login/',form({email:owner,password:pass,return_to:'/admin/'}));
  const dev=await at('/login/',form({email:developer,password:pass,return_to:'/admin/'}));
  assert.equal(o.status,303);assert.equal(dev.status,303);
  const ownerCookie=o.headers.get('set-cookie').split(';')[0];
  const developerCookie=dev.headers.get('set-cookie').split(';')[0];
  assert.notEqual(ownerCookie,developerCookie);
  for(const c of [ownerCookie,developerCookie]){
   const who=await (await at('/api/portal/session',{headers:{Cookie:c}})).json();
   assert.equal(who.role,'owner');
   assert.equal((await at('/access-requests/',{headers:{Cookie:c}})).status,c===ownerCookie?200:403);
   assert.equal((await at('/api/crm/contacts',{headers:{Cookie:c}})).status,200);
  }
  const bad=await at('/join/',form({name:'Synthetic Partner',email:'partner@example.test',
    intent:'partner',privacy:'on'}));
  assert.equal(bad.status,202);
  const queue=await (await at('/access-requests/',{headers:{Cookie:ownerCookie}})).text();
  assert.match(queue,/partner@example\.test/);
  assert.match(queue,/value="partner"/);
  assert.equal((await at('/invite-user/',form({email:'partner@example.test',role:'partner',identity_verified:'on'},developerCookie))).status,403);
  const invited=await at('/invite-user/',form({email:'partner@example.test',role:'partner',identity_verified:'on'},ownerCookie));
  assert.equal(invited.status,200);
  const token=(await invited.text()).match(/register\/#token=([A-Za-z0-9_-]{43})/)?.[1];
  assert.ok(token);
  const signup=await at('/register/',form({token,email:'partner@example.test',name:'Synthetic Partner',
    password:pass,password_confirm:pass,privacy:'on',role:'owner'}));
  assert.equal(signup.status,422,'client-supplied role must never be honored');
  const registered=await at('/register/',form({token,email:'partner@example.test',name:'Synthetic Partner',
    password:pass,password_confirm:pass,privacy:'on'}));
  assert.equal(registered.status,303);
  const partnerLogin=await at('/login/',form({email:'partner@example.test',password:pass,return_to:'/konto/'}));
  assert.equal(partnerLogin.status,303);
  const partnerCookie=partnerLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await at('/api/portal/session',{headers:{Cookie:partnerCookie}})).json()).role,'pending');
  assert.equal((await at('/api/crm/contacts',{headers:{Cookie:partnerCookie}})).status,403);
  const partnerRow=service.db.prepare('SELECT id FROM vps_users WHERE email=?').get('partner@example.test');
  const approved=await at('/api/portal/roles',json({userId:partnerRow.id,role:'partner',status:'approved',version:1},ownerCookie));
  assert.equal(approved.status,200,await approved.clone().text());
  assert.equal((await (await at('/api/portal/session',{headers:{Cookie:partnerCookie}})).json()).role,'partner');
  const dash=await (await at('/api/portal/dashboard',{headers:{Cookie:partnerCookie}})).json();
  assert.deepEqual(dash.requests,[]);assert.deepEqual(dash.profiles,[]);
  assert.equal((await at('/api/portal/roles',json({userId:partnerRow.id,role:'admin',status:'approved',version:2},partnerCookie))).status,403);
  const unauthorized=await at('/api/portal/session',{headers:{
   'oai-authenticated-user-email':owner,'oai-authenticated-user-id':original.id
  }});
  assert.equal((await unauthorized.json()).role,'anonymous');
  assert.equal((await at('/auth/oidc/google/')).status,404,'provider is disabled without credentials');
  service.db.prepare('UPDATE vps_staff_grants SET active=0 WHERE user_id=?').run(enrolled.id);
  assert.equal(hasOwnerAuthority(service.db,{userId:enrolled.id,ownerEmail:owner,developerEmail:developer}),false);
  assert.equal((await at('/invite-user/',{headers:{Cookie:developerCookie}})).status,403);
  assert.equal((await at('/api/portal/session',{headers:{Cookie:developerCookie}})).status,403);
  assert.equal((await at('/api/crm/contacts',{headers:{Cookie:developerCookie}})).status,403);
  assert.equal((await at('/readyz')).status,200);
 }finally{if(service)await service.close();await rm(dir,{recursive:true,force:true});}
});
