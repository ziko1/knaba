import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createKnabaVpsServer} from './server.mjs';
import {createOwner} from './auth.mjs';
import {issueAccountInvite} from './account-invite.mjs';

const origin='https://knaba.de';
const ownerEmail='owner@example.test';
const ownerPass='knaba-owner-synthetic-password-2026';
const workerPass='knaba-worker-synthetic-password-2026';
test('VPS HTTP: secure owner invite -> pending worker -> owner approval -> scoped portal', async()=>{
  const directory=await mkdtemp(join(tmpdir(),'knaba-http-registration-'));
  let service;
  try{
    service=await createKnabaVpsServer({
      dbPath:join(directory,'state.sqlite'),ownerEmail,host:'127.0.0.1',port:0,localTest:true,
      staticRoot:new URL('../dist/client/',import.meta.url).pathname,
      workerPath:new URL('../dist/server/index.js',import.meta.url).href
    });
    createOwner(service.db,ownerEmail,ownerPass);
    const at=(path,opts={})=>fetch('http://127.0.0.1:'+service.port+path,{
      redirect:'manual',...opts,headers:{Host:'knaba.de',...opts.headers}
    });
    const form=(body,more={})=>({
      method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded',...more},
      body:new URLSearchParams(body)
    });
    const json=(body,cookie)=>({
      method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin',
        'X-Knaba-Request':'portal-v1','Content-Type':'application/json',Cookie:cookie},
      body:JSON.stringify(body)
    });
    const page=await at('/register/');
    assert.equal(page.status,200);
    assert.match(page.headers.get('cache-control'),/no-store/);
    assert.equal(page.headers.get('x-robots-tag'),'noindex,nofollow');
    assert.equal(page.headers.get('referrer-policy'),'no-referrer');
    assert.equal(page.headers.get('x-frame-options'),'DENY');
    assert.match(await page.text(),/history\.replaceState/);
    assert.equal((await at('/register/?token=test')).status,400);
    assert.equal((await at('/invite-user/')).status,401);
    assert.equal((await at('/invite-user/',form({email:'worker@example.test',role:'worker'}))).status,401);
    assert.equal((await at('/register/',form({
      token:'x'.repeat(43),email:'worker@example.test',name:'Worker Test',
      password:workerPass,password_confirm:workerPass,privacy:'on'
    }))).status,422);
    const ownerLogin=await at('/login/',form({email:ownerEmail,password:ownerPass,return_to:'/studio/'}));
    assert.equal(ownerLogin.status,303);
    const ownerCookie=ownerLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await at('/invite-user/',{headers:{Cookie:ownerCookie}})).status,200);
    assert.equal((await at('/invite-user/',form(
      {email:'worker@example.test',role:'worker'},{Cookie:ownerCookie,Origin:'https://evil.test'}
    ))).status,403);
    assert.equal((await at('/invite-user/',form(
      {email:'worker@example.test',role:'owner'},{Cookie:ownerCookie}
    ))).status,422);
    const invited=await at('/invite-user/',form(
      {email:'worker@example.test',role:'worker'},{Cookie:ownerCookie}
    ));
    assert.equal(invited.status,200);
    assert.match(invited.headers.get('cache-control'),/no-store/);
    const content=await invited.text();
    const token=content.match(/register\/#token=([A-Za-z0-9_-]{43})/)?.[1];
    assert.ok(token,content.slice(0,800));
    assert.equal(service.db.prepare('SELECT count(*) AS n FROM vps_users').get().n,1);
    const submit={
      token,email:'worker@example.test',name:'Synthetic Worker',
      password:workerPass,password_confirm:workerPass,privacy:'on'
    };
    assert.equal((await at('/register/',form(submit,{Origin:'https://evil.test'}))).status,403);
    assert.equal((await at('/register/',form({...submit,password_confirm:'mismatch'}))).status,422);
    assert.equal((await at('/register/',form({...submit,role:'owner'}))).status,422);
    const registered=await at('/register/',form(submit));
    assert.equal(registered.status,303);
    assert.equal(registered.headers.get('location'),'/login/?return_to=%2Fkonto%2F');
    assert.equal((await at('/register/',form(submit))).status,422);
    const worker=service.db.prepare('SELECT id FROM vps_users WHERE email=?').get(submit.email);
    assert.ok(worker);
    const workerLogin=await at('/login/',form({
      email:'worker@example.test',password:workerPass,return_to:'/konto/'
    }));
    assert.equal(workerLogin.status,303);
    const workerCookie=workerLogin.headers.get('set-cookie').split(';')[0];
    const before=(await (await at('/api/portal/session',{headers:{Cookie:workerCookie}})).json());
    assert.equal(before.role,'pending');
    assert.equal(before.profile.requestedRole,'worker');
    assert.equal(before.profile.role,null);
    assert.equal((await at('/api/crm/contacts',{headers:{Cookie:workerCookie}})).status,403);
    assert.equal((await at('/api/portal/roles',json({userId:worker.id,role:'admin',status:'approved',version:1},workerCookie))).status,403);
    const approved=await at('/api/portal/roles',json({
      userId:worker.id,role:'worker',status:'approved',version:1
    },ownerCookie));
    assert.equal(approved.status,200,await approved.clone().text());
    const after=await (await at('/api/portal/session',{headers:{Cookie:workerCookie}})).json();
    assert.equal(after.role,'worker');
    assert.equal(after.profile.status,'approved');
    assert.equal((await at('/api/crm/contacts',{headers:{Cookie:workerCookie}})).status,403);
    assert.equal((await at('/api/portal/dashboard',{headers:{Cookie:workerCookie}})).status,200);
    assert.equal((await at('/account/password/',{headers:{Cookie:workerCookie}})).status,200,
      'existing signed-in account needs an authenticated secret-rotation form');

    const ownerId=service.db.prepare('SELECT id FROM vps_users WHERE email=?').get(ownerEmail).id;
    issueAccountInvite(service.db,{
      issuerId:ownerId,ownerEmail,email:'revoke-case@example.test',role:'client'
    });
    const revoked=await at('/invite-user/revoke/',form(
      {email:'revoke-case@example.test'},{Cookie:ownerCookie}
    ));
    assert.equal(revoked.status,200,'owner must be able to cancel an unused invitation');

    assert.match(revoked.headers.get('cache-control'),/no-store/);
    assert.equal((await at('/invite-user/revoke/',form(
      {email:'revoke-case@example.test'},{Cookie:workerCookie}
    ))).status,403);
    assert.equal((await at('/invite-user/revoke/',form(
      {email:'revoke-case@example.test'},{Cookie:ownerCookie,Origin:'https://bad.example'}
    ))).status,403);
    assert.equal((await at('/invite-user/revoke/',form(
      {email:'revoke-case@example.test',role:'owner'},{Cookie:ownerCookie}
    ))).status,422);
    assert.ok(service.db.prepare(
      'SELECT used_at FROM vps_account_invites WHERE email=?'
    ).get('revoke-case@example.test').used_at);
  } finally{
    if(service)await service.close();
    await rm(directory,{recursive:true,force:true});
  }
});
