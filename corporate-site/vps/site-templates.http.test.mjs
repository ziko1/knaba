import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createKnabaVpsServer} from './server.mjs';
import {createOwner} from './auth.mjs';

test('real owner HTTP session uploads, previews, publishes, restarts and rolls back design without changing content',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'knaba-template-http-'));
  const owner='template-owner@example.test',password='Synthetic-template-test-only-2026';
  const options={dbPath:join(directory,'site.sqlite'),ownerEmail:owner,localTest:true,
    staticRoot:new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href,host:'127.0.0.1',port:0};
  let app=await createKnabaVpsServer(options),cookie='';
  const read=(path,method='GET',body,overrides={})=>fetch('http://127.0.0.1:'+app.port+path,{
    method,redirect:'manual',headers:{Host:'knaba.de',Cookie:cookie,...(body===undefined?{}:{Origin:'https://knaba.de','Sec-Fetch-Site':'same-origin','X-Knaba-Request':'portal-v1','Content-Type':'application/json'}),...overrides},body:body===undefined?undefined:JSON.stringify(body)});
  const api=async(path='',body)=>{const response=await read('/api/studio/templates'+path,body===undefined?'GET':'POST',body);assert.equal(response.status,200,await response.clone().text());return response.json();};
  try{
    const ownerRecord=createOwner(app.db,owner,password);
    assert.equal((await read('/api/studio/templates')).status,401);
    assert.equal((await read('/api/studio/templates','GET',undefined,{'oai-authenticated-user-id':ownerRecord.id,'oai-authenticated-user-email':owner})).status,401,'Caller headers cannot forge owner identity');
    const login=await fetch('http://127.0.0.1:'+app.port+'/login/',{method:'POST',redirect:'manual',headers:{Host:'knaba.de',Origin:'https://knaba.de','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:owner,password,return_to:'/studio/'})});
    assert.equal(login.status,303);cookie=login.headers.get('set-cookie').split(';')[0];
    const shell=await read('/studio/templates/');assert.equal(shell.status,200);assert.match(await shell.text(),/data-catalogue/);
    const initial=await api(),before=await (await read('/')).text();assert.equal(initial.templates.length,3);
    assert.doesNotMatch(before,/data-knaba-template=/);
    const archive=await read('/api/studio/templates/example');assert.equal(archive.status,200);
    const uploaded=await api('/upload',{zip:Buffer.from(await archive.arrayBuffer()).toString('base64')});
    const selected=await api('/select',{digest:uploaded.template.digest,version:initial.version});
    assert.equal(await (await read('/')).text(),before,'Draft remains private');
    const preview=await read('/api/studio/templates/preview?digest='+uploaded.template.digest+'&page=/uk/');
    assert.equal(preview.status,200);assert.match(preview.headers.get('content-security-policy'),/script-src 'none'/);assert.doesNotMatch(await preview.text(),/<script[\s>]/i);
    const payload={digest:uploaded.template.digest,version:selected.version,confirm:'PUBLISH',idempotencyKey:crypto.randomUUID()};
    assert.equal((await read('/api/studio/templates/activate','POST',payload,{Origin:'https://evil.example.test'})).status,403);
    const published=await api('/activate',payload),html=await (await read('/')).text();
    assert.match(html,/data-knaba-template="my-knaba-design"/);assert.match(html,/data-public-design="vivid"/);
    assert.equal(html.match(/<h1\b[\s\S]*?<\/h1>/)?.[0],before.match(/<h1\b[\s\S]*?<\/h1>/)?.[0]);
    assert.equal((await api('/activate',payload)).version,published.version,'HTTP replay creates no extra publication');
    assert.equal((await (await read('/','HEAD')).text()),'');
    assert.doesNotMatch(await (await read('/studio/')).text(),/data-knaba-template=/,'Private editor is not restyled');
    const keepTables=['cleaning_requests','profiles','studio_pages'];
    const keep=keepTables.map(table=>app.db.prepare('SELECT * FROM '+table+' ORDER BY 1').all());
    await app.close();app=await createKnabaVpsServer(options);
    assert.match(await (await read('/')).text(),/data-knaba-template="my-knaba-design"/,'Publication survives restart');
    const restored=await api('/rollback',{revision:0,version:published.version,confirm:'ROLLBACK',idempotencyKey:crypto.randomUUID()});
    assert.equal(restored.activeDigest,null);assert.equal(await (await read('/')).text(),before);
    assert.deepEqual(keepTables.map(table=>app.db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()),keep);
    app.db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(ownerRecord.id);
    assert.equal((await read('/api/studio/templates','POST',{})).status,401,'Revoked credentials cannot mutate');
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
