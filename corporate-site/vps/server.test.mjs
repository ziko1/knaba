import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backup } from 'node:sqlite';
import { request as httpRequest } from 'node:http';
import { createKnabaVpsServer } from './server.mjs';
import { createOwner } from './auth.mjs';

const origin='https://knaba.de';
// Authentication remains tested against original knaba.de origin fixture;
// static build canonical independently follows the explicit selected release.
const buildMode=process.env.KNABA_RELEASE_MODE;
if (!['official','vsp'].includes(buildMode)) throw Error('Explicit release mode required for server QA');
const buildCanonical=`rel="canonical" href="${buildMode==='vsp'?'https://kneba.vsp.rest':'https://knaba.de'}/"`;
const owner='owner@example.test';
const password='synthetic-only-not-a-real-password-2026';
test('official VPS: trusted auth, unchanged public site, scoped CRM, publish, restart and backup',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-vps-test-'));
  const dbPath=join(dir,'state.sqlite'),backupPath=join(dir,'backup.sqlite');
  const make=()=>createKnabaVpsServer({
    dbPath,ownerEmail:owner,localTest:true,
    staticRoot:new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href,
    host:'127.0.0.1',port:0
  });
  let app=await make();
  let restarted=false;
  const fetchAt=(path,options={})=>fetch('http://127.0.0.1:'+app.port+path,{
    redirect:'manual',...options,headers:{Host:'knaba.de',...options.headers}
  });
  const bodyHeaders={Origin:origin,'Sec-Fetch-Site':'same-origin','X-Knaba-Request':'portal-v1','Content-Type':'application/json'};
  try{
    assert.deepEqual(app.migrations.length,5);
    assert.equal((await fetchAt('/readyz')).status,503);
    createOwner(app.db,owner,password);
    assert.equal((await fetchAt('/readyz')).status,200);
    const site=await fetchAt('/');
    assert.equal(site.status,200);
    assert.match(await site.text(),/knaba.de/);
    assert.equal((await fetchAt('/studio/')).status,200);
    assert.equal((await fetchAt('/crm/')).status,200);
    assert.match((await fetchAt('/crm/')).headers.get('X-Robots-Tag'),/noindex/);
    assert.equal((await fetchAt('/illustrations/hero-cleaning.svg')).status,200);
    assert.equal((await fetchAt('/.git/config')).status,404);
    const wrongHostStatus=await new Promise((resolve,reject)=>{
      const call=httpRequest({host:'127.0.0.1',port:app.port,path:'/',headers:{Host:'evil.example'}},reply=>{
        reply.resume();reply.on('end',()=>resolve(reply.statusCode));
      });call.on('error',reject);call.end();
    });
    assert.equal(wrongHostStatus,421);

    // A public user may never impersonate the old Sites identity gateway.
    const fake=await fetchAt('/api/portal/session',{headers:{
      'oai-authenticated-user-id':'test-owner','oai-authenticated-user-email':owner
    }});
    assert.equal((await fake.json()).role,'anonymous');
    assert.equal((await fetchAt('/api/crm/contacts')).status,401);
    assert.equal((await fetchAt('/api/studio/page?page=%2F')).status,401);

    const form=new URLSearchParams({email:owner,password,return_to:'/studio/'});
    const badOrigin=await fetchAt('/login/',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/x-www-form-urlencoded'},body:form});
    assert.equal(badOrigin.status,403);
    const failed=await fetchAt('/login/',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:owner,password:'wrong pw',return_to:'/studio/'})});
    assert.equal(failed.status,401);
    const signed=await fetchAt('/login/',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:form});
    assert.equal(signed.status,303);
    assert.equal(signed.headers.get('location'),'/studio/');
    const cookie=signed.headers.get('set-cookie').split(';')[0];
    assert.match(cookie,/__Host-knaba-session=/);
    assert.match(signed.headers.get('set-cookie'),/HttpOnly/);
    const logged=await fetchAt('/api/portal/session',{headers:{Cookie:cookie}});
    assert.equal((await logged.json()).role,'owner');
    assert.equal((await fetchAt('/api/crm/contacts',{headers:{Cookie:cookie}})).status,200);

    const data={page:'/',version:0,entries:[{selector:'#main > section:nth-of-type(1) > p:nth-of-type(1)',kind:'text',value:'Sauber und sicher'}]};
    const publishHeaders={...bodyHeaders,Cookie:cookie};
    const saved=await fetchAt('/api/studio/draft',{method:'POST',headers:publishHeaders,body:JSON.stringify(data)});
    assert.equal(saved.status,200,await saved.text());
    let pub=await (await fetchAt('/api/studio/published?page=%2F')).json();
    assert.equal(pub.version,0);
    const pubReply=await fetchAt('/api/studio/publish',{method:'POST',headers:publishHeaders,body:JSON.stringify({page:'/',version:1,confirm:'PUBLISH'})});
    assert.equal(pubReply.status,200,await pubReply.text());
    pub=await (await fetchAt('/api/studio/published?page=%2F')).json();
    assert.equal(pub.version,1);
    assert.equal(pub.entries[0].value,'Sauber und sicher');
    assert.equal((await fetchAt('/api/studio/publish',{method:'POST',headers:bodyHeaders,body:JSON.stringify({page:'/',version:1,confirm:'PUBLISH'})})).status,401);

    // A saved draft must not affect crawlers until an explicit owner publish.
    const actualParagraph='#main > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > p:nth-of-type(1)';
    const actualLink='#main > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > a:nth-of-type(1)';
    const seoDraft={page:'/',version:1,entries:[...data.entries,
      {selector:'@title',kind:'text',value:'KnaBa · Neuer & sicherer Titel'},
      {selector:'@description',kind:'text',value:'Offizielle Beratung für Gebäudereinigung & Bauhelfer.'},
      {selector:actualParagraph,kind:'text',value:'Sauber und sicher für Bauprojekte & Büros'},
      {selector:actualLink,kind:'href',value:'/leistungen/baureinigung/'}
    ]};
    const saveSeo=await fetchAt('/api/studio/draft',{method:'POST',headers:publishHeaders,body:JSON.stringify(seoDraft)});
    assert.equal(saveSeo.status,200,await saveSeo.text());
    const beforeSeo=await (await fetchAt('/')).text();
    assert.ok(!beforeSeo.includes('<title>KnaBa · Neuer &amp; sicherer Titel</title>'));
    assert.equal((await fetchAt('/api/studio/publish',{method:'POST',headers:publishHeaders,
      body:JSON.stringify({page:'/',version:2,confirm:'PUBLISH'})})).status,200);
    const rendered=await (await fetchAt('/')).text();
    assert.ok(rendered.includes('<title>KnaBa · Neuer &amp; sicherer Titel</title>'));
    assert.ok(rendered.includes('Sauber und sicher für Bauprojekte &amp; Büros'));
    assert.ok(rendered.includes('href="/leistungen/baureinigung/"'));
    assert.ok(rendered.includes('content="Offizielle Beratung für Gebäudereinigung &amp; Bauhelfer."'));
    assert.ok(rendered.includes(buildCanonical), "Publishing must preserve selected build canonical");
    const privateSeo=await (await fetchAt('/studio/')).text();
    assert.ok(!privateSeo.includes('<title>KnaBa · Neuer'));

    await backup(app.db,backupPath);
    await app.close();
    app=await make();restarted=true;
    assert.equal((await (await fetchAt('/api/studio/published?page=%2F')).json()).version,2);
    const persistedHtml=await (await fetchAt('/')).text();
    assert.ok(persistedHtml.includes('<title>KnaBa · Neuer &amp; sicherer Titel</title>'));
    assert.ok(persistedHtml.includes('Sauber und sicher für Bauprojekte &amp; Büros'));
    assert.equal((await (await fetchAt('/api/portal/session',{headers:{Cookie:cookie}})).json()).role,'owner');

    const logout=await fetchAt('/logout/',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded',Cookie:cookie},body:new URLSearchParams({return_to:'/'})});
    assert.equal(logout.status,303);
    assert.equal((await (await fetchAt('/api/portal/session',{headers:{Cookie:cookie}})).json()).role,'anonymous');

    // Prove the backup can be restored into a separate file without mutating live data.
    const restoredPath=join(dir,'restored.sqlite');
    await copyFile(backupPath,restoredPath);
    const {openLocalDatabase}=await import('./database.mjs');
    const recovered=openLocalDatabase(restoredPath);
    const stored=recovered.db.prepare("SELECT published_version FROM studio_pages WHERE page_path='/'").get();
    assert.equal(stored.published_version,2);
    recovered.db.close();
  } finally{
    await app.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
});

test('VSP origin: exact Host and TLS only, no cross-domain redirects or spoofed identity',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'knaba-vsp-host-test-'));
  const dbPath=join(dir,'state.sqlite');
  const create=(localTest)=>createKnabaVpsServer({
    dbPath,ownerEmail:'',origin:'https://kneba.vsp.rest',localTest,
    staticRoot:new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href,
    host:'127.0.0.1',port:0
  });
  let seed=null,app=null;
  const probe=(path,headers={})=>new Promise((resolve,reject)=>{
    const request=httpRequest({
      hostname:'127.0.0.1',port:app.port,path,
      headers:{Host:'kneba.vsp.rest','X-Forwarded-Proto':'https',...headers}
    },response=>{
      const chunks=[];
      response.on('data',c=>chunks.push(c));
      response.on('end',()=>resolve({
        status:response.statusCode,
        location:response.headers.location,
        body:Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.on('error',reject);request.end();
  });
  try{
    seed=await create(true);
    await seed.close();seed=null;
    app=await create(false);
    assert.equal((await probe('/')).status,200);
    assert.equal((await probe('/studio/')).status,200);
    assert.equal((await probe('/healthz')).status,200);
    assert.equal((await probe('/readyz')).status,503);
    assert.equal((await probe('/api/crm/contacts')).status,401);
    assert.equal((await probe('/',{Host:'knaba.de'})).status,421);
    assert.equal((await probe('/',{Host:'www.knaba.de'})).status,421);
    assert.equal((await probe('/',{Host:'kneba.vsp.rest.evil.test'})).status,421);
    assert.equal((await probe('/',{'X-Forwarded-Proto':'http'})).status,421);
    const visitor=await probe('/api/portal/session',{
      'oai-authenticated-user-id':'forged-owner','oai-authenticated-user-email':'owner@example.test'
    });
    assert.equal(visitor.status,200);
    assert.equal(JSON.parse(visitor.body).role,'anonymous');
  } finally {
    await seed?.close().catch(()=>{});
    await app?.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
});
