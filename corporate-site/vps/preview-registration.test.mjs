import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createKnabaVpsServer} from './server.mjs';
import {issueOwnerInvite} from './owner-invite.mjs';

test('preview self-registration has a private, no-store invitation-only page',async()=>{
  const root=await mkdtemp(join(tmpdir(),'knaba-register-red-'));
  const instance=await createKnabaVpsServer({
    dbPath:join(root,'site.sqlite'), localTest:true,
    previewOwnerEmail:'tester@example.test',
    origin:'https://kneba.vsp.rest',
    staticRoot:new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href,
    host:'127.0.0.1',port:0
  });
  try{
    const result=await fetch('http://127.0.0.1:'+instance.port+'/register/',{redirect:'manual',headers:{Host:'kneba.vsp.rest'}});
    assert.equal(result.status,200,'registration page must exist');
    assert.match(result.headers.get('cache-control')||'',/no-store/);
    assert.match(await result.text(),/Passwort bestätigen/);
  }finally{await instance.close();await rm(root,{recursive:true,force:true});}
});


test('invited developer registers without impersonating the legal KNABA owner',async()=>{
  const root=await mkdtemp(join(tmpdir(),'knaba-register-e2e-'));
  const developer='preview-tester@example.test';
  const legalOwner='official-owner@example.test';
  const password='synthetic-long-password-for-preview-2026';
  const app=await createKnabaVpsServer({
    dbPath:join(root,'db.sqlite'),localTest:true,
    ownerEmail:legalOwner,previewOwnerEmail:developer,
    origin:'https://kneba.vsp.rest',
    staticRoot:new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href,
    host:'127.0.0.1',port:0
  });
  const url='http://127.0.0.1:'+app.port;
  const submit=(body,origin='https://kneba.vsp.rest')=>fetch(url+'/register/',{
    method:'POST',redirect:'manual',
    headers:{Host:'kneba.vsp.rest',Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  const form=(token,email=developer,attested='on',pass=password,confirmed=pass)=>
    new URLSearchParams({token,email,password:pass,password_confirm:confirmed,attested});
  try{
    assert.equal((await fetch(url+'/readyz',{headers:{Host:'kneba.vsp.rest'}})).status,503);
    const invite=issueOwnerInvite(app.db,developer);
    const get=await fetch(url+'/register/',{headers:{Host:'kneba.vsp.rest'}});
    assert.equal(get.status,200);
    const html=await get.text();
    assert.doesNotMatch(html,/preview-tester@example\.test/);
    assert.doesNotMatch(html,new RegExp(invite.token));
    assert.match(get.headers.get('x-robots-tag'),/noindex/);
    assert.match(get.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.equal((await fetch(url+'/register/?token='+invite.token,{headers:{Host:'kneba.vsp.rest'}})).status,400);
    assert.equal((await submit(form(invite.token),'https://other.example')).status,403);
    assert.equal((await submit(form(invite.token,legalOwner))).status,401);
    assert.equal((await submit(form('X'.repeat(43)))).status,401);
    assert.equal((await submit(form(invite.token,developer,'off'))).status,422);
    assert.equal((await submit(form(invite.token,developer,'on','tiny','tiny'))).status,422);
    assert.equal((await submit(form(invite.token,developer,'on',password,'mismatch'))).status,422);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM vps_users').get().n,0);
    const activated=await submit(form(invite.token));
    assert.equal(activated.status,303);
    assert.equal(activated.headers.get('location'),'/login/?return_to=%2Fadmin%2F');
    assert.equal((await submit(form(invite.token))).status,401);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM vps_users WHERE email=?').get(legalOwner).n,0);
    assert.equal((await fetch(url+'/readyz',{headers:{Host:'kneba.vsp.rest'}})).status,503,
      'legal owner readiness must not be falsely activated by preview developer');
    const login=await fetch(url+'/login/',{method:'POST',redirect:'manual',
      headers:{Host:'kneba.vsp.rest',Origin:'https://kneba.vsp.rest','Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({email:developer,password,return_to:'/admin/'})});
    assert.equal(login.status,303);
    const cookie=login.headers.get('set-cookie');
    assert.match(cookie,/HttpOnly/); assert.match(cookie,/SameSite=Strict/);
    const session=await fetch(url+'/api/portal/session',{headers:{Host:'kneba.vsp.rest',Cookie:cookie.split(';')[0]}});
    assert.equal(session.status,200);
    assert.equal((await session.json()).role,'owner','preview identity should be admitted only in the test origin');
    assert.equal((await fetch(url+'/api/crm/contacts',{headers:{Host:'kneba.vsp.rest',Cookie:cookie.split(';')[0]}})).status,200);
    const forged=await fetch(url+'/api/portal/session',{headers:{Host:'kneba.vsp.rest',
      'oai-authenticated-user-email':developer,'oai-authenticated-user-id':'attacker'}});
    assert.equal((await forged.json()).role,'anonymous');
  }finally{await app.close();await rm(root,{recursive:true,force:true});}
});

test('official domain never exposes preview self-enrolment',async()=>{
  const root=await mkdtemp(join(tmpdir(),'knaba-register-official-'));
  const app=await createKnabaVpsServer({
    dbPath:join(root,'db.sqlite'),localTest:true,previewOwnerEmail:'tester@example.test',
    origin:'https://knaba.de',
    staticRoot:new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href,
    host:'127.0.0.1',port:0
  });
  try{
    const res=await fetch('http://127.0.0.1:'+app.port+'/register/',{headers:{Host:'knaba.de'}});
    assert.equal(res.status,404);
  }finally{await app.close();await rm(root,{recursive:true,force:true});}
});

test('preview registration throttles repeated invalid claims without issuing accounts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'knaba-register-throttle-'));
  const app=await createKnabaVpsServer({
    dbPath:join(root,'db.sqlite'),localTest:true,previewOwnerEmail:'tester@example.test',
    origin:'https://kneba.vsp.rest',
    staticRoot:new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href,
    host:'127.0.0.1',port:0
  });
  try{
    const body=new URLSearchParams({token:'X'.repeat(43),email:'tester@example.test',
      password:'very-long-synthetic-password',password_confirm:'very-long-synthetic-password',attested:'on'});
    let last;
    for(let i=0;i<11;i++)last=await fetch('http://127.0.0.1:'+app.port+'/register/',{
      method:'POST',redirect:'manual',
      headers:{Host:'kneba.vsp.rest',Origin:'https://kneba.vsp.rest','Content-Type':'application/x-www-form-urlencoded'},
      body});
    assert.equal(last.status,429);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM vps_users').get().n,0);
  }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
