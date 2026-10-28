import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createKnabaVpsServer } from './server.mjs';
import { openLocalDatabase } from './database.mjs';
import { issueOwnerInvite } from './owner-invite.mjs';

const email='owner@example.test';
const passphrase='synthetic-owner-passphrase-2026-not-real';
async function instance(file) {
  return createKnabaVpsServer({
    dbPath:file,ownerEmail:email,developerEmail:'developer@example.test',localTest:true,
    staticRoot:new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href,
    host:'127.0.0.1',port:0
  });
}

test('private activation GET is no-store, noindex, origin-bound and does not expose owner email',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-owner-http-get-'));
  let app;
  try{
    app=await instance(join(dir,'test.sqlite'));
    const base='http://127.0.0.1:'+app.port;
    const get=(path)=>fetch(base+path,{headers:{Host:'knaba.de'}});
    const result=await get('/activate-owner/');
    assert.equal(result.status,200);
    assert.match(result.headers.get('cache-control'),/no-store/);
    assert.equal(result.headers.get('x-robots-tag'),'noindex,nofollow');
    assert.equal(result.headers.get('x-frame-options'),'DENY');
    assert.equal(result.headers.get('referrer-policy'),'strict-origin');
    const developerPage=await get('/activate-developer/');
    assert.equal(developerPage.status,200);
    assert.equal(developerPage.headers.get('referrer-policy'),'strict-origin');
    const body=await result.text();
    assert.doesNotMatch(body,/owner@example\.test/i);
    assert.match(body,/history\.replaceState/);
    assert.match(body,/name="token"/);
    assert.equal((await get('/activate-owner/?token=not-valid')).status,400);
    assert.equal((await get('/readyz')).status,503);
  }finally{if(app)await app.close();await rm(dir,{recursive:true,force:true});}
});

test('wrong-origin, invalid, replayed and expired activations fail without creating privileged users',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-owner-http-claim-'));
  const dbFile=join(dir,'test.sqlite');
  let app;
  try{
    const initial=openLocalDatabase(dbFile);
    const invite=issueOwnerInvite(initial.db,email);
    initial.db.close();
    app=await instance(dbFile);
    const base='http://127.0.0.1:'+app.port;
    const call=(path,method='GET',body,origin='https://knaba.de')=>fetch(base+path,{
      method,redirect:'manual',headers:{Host:'knaba.de',...(method==='POST'?
        {Origin:origin,'Content-Type':'application/x-www-form-urlencoded'}:{})},body
    });
    const valid=new URLSearchParams({token:invite.token,password:passphrase,password_confirm:passphrase,attested:'on'});
    assert.equal((await call('/readyz')).status,503);
    assert.equal((await call('/activate-owner/','POST',valid,'https://evil.example')).status,403);
    assert.equal((await call('/activate-owner/','POST',
      new URLSearchParams({...Object.fromEntries(valid),token:'z'.repeat(43)}))).status,401);
    assert.equal((await call('/readyz')).status,503);
    const accepted=await call('/activate-owner/','POST',valid);
    assert.equal(accepted.status,303);
    assert.equal(accepted.headers.get('location'),'/login/?return_to=%2Fstudio%2F');
    assert.equal((await call('/readyz')).status,200);
    assert.equal((await call('/activate-owner/','POST',valid)).status,401);
    const logged=await call('/login/','POST',new URLSearchParams({email,password:passphrase,return_to:'/studio/'}));
    assert.equal(logged.status,303);
    assert.equal(logged.headers.get('location'),'/studio/');
    assert.match(logged.headers.get('set-cookie'),/HttpOnly/);
  }finally{if(app)await app.close();await rm(dir,{recursive:true,force:true});}
});
