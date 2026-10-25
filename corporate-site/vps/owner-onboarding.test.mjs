import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createKnabaVpsServer} from './server.mjs';
import {openLocalDatabase} from './database.mjs';
import {issueOwnerInvite} from './owner-invite.mjs';
test('owner activation landing is private and no-store',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-onboard-'));
  let server;
  try{
    server=await createKnabaVpsServer({
      dbPath:join(dir,'db.sqlite'),ownerEmail:'owner@example.test',localTest:true,
      staticRoot:new URL('../dist/client/',import.meta.url).pathname,
      workerPath:new URL('../dist/server/index.js',import.meta.url).href,
      host:'127.0.0.1',port:0
    });
    const response=await fetch('http://127.0.0.1:'+server.port+'/activate-owner/',{headers:{Host:'knaba.de'}});
    assert.equal(response.status,200);
    assert.match(response.headers.get('cache-control'),/no-store/);
    assert.equal(response.headers.get('x-frame-options'),'DENY');
  }finally{
    if(server)await server.close();
    await rm(dir,{recursive:true,force:true});
  }
});

test('one-time verified-email claim activates only after a valid same-origin form',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-owner-claim-'));
  const file=join(dir,'test.sqlite');
  const email='owner@example.test';
  const phrase='synthetic-only-long-passphrase-2026';
  let app;
  try{
    const initial=openLocalDatabase(file);
    const invitation=issueOwnerInvite(initial.db,email);
    initial.db.close();
    app=await createKnabaVpsServer({
      dbPath:file,ownerEmail:email,localTest:true,
      staticRoot:new URL('../dist/client/',import.meta.url).pathname,
      workerPath:new URL('../dist/server/index.js',import.meta.url).href,
      host:'127.0.0.1',port:0
    });
    const call=(route,method='GET',body,origin='https://knaba.de')=>fetch('http://127.0.0.1:'+app.port+route,{
      method,redirect:'manual',headers:{Host:'knaba.de',...(method==='POST'?{
        Origin:origin,'Content-Type':'application/x-www-form-urlencoded'
      }:{})},body
    });
    const form=new URLSearchParams({token:invitation.token,password:phrase,password_confirm:phrase,attested:'on'});
    assert.equal((await call('/readyz')).status,503);
    assert.equal((await call('/activate-owner/','POST',form,'https://different.example')).status,403);
    assert.equal((await call('/activate-owner/','POST',
      new URLSearchParams({token:'x'.repeat(43),password:phrase,password_confirm:phrase,attested:'on'}))).status,401);
    assert.equal((await call('/readyz')).status,503);
    const activated=await call('/activate-owner/','POST',form);
    assert.equal(activated.status,303);
    assert.match(activated.headers.get('location'),/^\/login\//);
    assert.equal((await call('/readyz')).status,200);
    assert.equal((await call('/activate-owner/','POST',form)).status,401);
    const logged=await call('/login/','POST',
      new URLSearchParams({email,password:phrase,return_to:'/studio/'}));
    assert.equal(logged.status,303);
    assert.equal(logged.headers.get('location'),'/studio/');
    assert.match(logged.headers.get('set-cookie'),/HttpOnly/);
  }finally{
    if(app)await app.close();
    await rm(dir,{recursive:true,force:true});
  }
});
