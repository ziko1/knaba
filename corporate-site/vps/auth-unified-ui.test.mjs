import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createKnabaVpsServer} from './server.mjs';

test('KNABA shared auth entrypoint: localized sign-in, invite onboarding and no role elevation', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-auth-ui-'));
  let app;
  try{
    app=await createKnabaVpsServer({
      dbPath:join(dir,'site.sqlite'),host:'127.0.0.1',port:0,localTest:true,
      ownerEmail:'owner@example.test',
      staticRoot:new URL('../dist/client/',import.meta.url).pathname,
      workerPath:new URL('../dist/server/index.js',import.meta.url).href
    });
    const get=path=>fetch('http://127.0.0.1:'+app.port+path,{
      redirect:'manual',headers:{Host:'knaba.de'}
    });
    const ua=await get('/login/?lang=uk&return_to=%2Fkonto%2F');
    assert.equal(ua.status,200);
    const u=await ua.text();
    assert.match(u,/<html lang="uk"/);
    assert.match(u,/Увійти/);
    assert.match(u,/minlength="8" maxlength="256"/);
    assert.match(u,/href="\/register\/\?lang=uk"/);
    assert.match(u,/href="\/kontakt\/"/);
    assert.match(u,/action="\/login\/\?lang=uk"/);
    const de=await(await get('/login/?lang=%3Cscript%3E')).text();
    assert.match(de,/<html lang="de"/);
    assert.doesNotMatch(de,/<script>/);
    // No account enumeration; a localized failed login offers a safe next action.
    const unknown=await fetch('http://127.0.0.1:'+app.port+'/login/?lang=uk',{
      method:'POST',redirect:'manual',
      headers:{Host:'knaba.de',Origin:'https://knaba.de','Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({
        email:'not-a-user@example.test',password:'synthetic-only',
        return_to:'/konto/'
      })
    });
    assert.equal(unknown.status,401);
    const errorPage=await unknown.text();
    assert.match(errorPage,/Не вдалося увійти/);
    assert.match(errorPage,/href="\/register\/\?lang=uk"/);
    assert.doesNotMatch(errorPage,/not-a-user@example\.test/);
    const ru=await(await get('/register/?lang=ru')).text();
    assert.match(ru,/<html lang="ru"/);
    assert.match(ru,/Клиент/);
    assert.match(ru,/name="token"/);
    assert.match(ru,/link\.hash/);
    assert.match(ru,/<button[^>]*disabled[^>]*>/);
    const en=await(await get('/register/?lang=en')).text();
    assert.match(en,/<html lang="en"/);
    assert.match(en,/8–256/);
    assert.equal((await get('/register/?token=fake')).status,400);
    const submit=await fetch('http://127.0.0.1:'+app.port+'/register/?lang=uk',{
      method:'POST',redirect:'manual',
      headers:{Host:'knaba.de',Origin:'https://knaba.de','Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({token:'x'.repeat(43),name:'Not Authorized',
        email:'worker@example.test',password:'synthetic-secret-long-enough',
        password_confirm:'synthetic-secret-long-enough',privacy:'on',role:'owner'})
    });
    assert.equal(submit.status,422);
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM vps_users').get().n,0);
  }finally{
    if(app)await app.close();
    await rm(dir,{recursive:true,force:true});
  }
});
