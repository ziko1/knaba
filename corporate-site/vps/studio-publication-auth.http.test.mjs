import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createKnabaVpsServer} from './server.mjs';
import {createOwner} from './auth.mjs';

for(const revoke of ['disable','logout'])test(`Studio VPS rejects ${revoke} during page inspection before any publication`,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'knaba-studio-revoke-'));
  const dbPath=join(directory,'state.sqlite'),workerPath=join(directory,'inspected-worker.mjs');
  // Trusted test wrapper uses real compiled Worker and real raw build asset.
  // The only injection is a concurrent administrator/session change while
  // publication awaits the asset, before its final authorization transaction.
  const sql=revoke==='disable'?'UPDATE vps_users SET disabled=1':'DELETE FROM vps_sessions';
  await writeFile(workerPath,`import worker from ${JSON.stringify(new URL('../dist/server/index.js',import.meta.url).href)};
import {openLocalDatabase} from ${JSON.stringify(new URL('./database.mjs',import.meta.url).href)};
export default {fetch(request,env,ctx){return worker.fetch(request,{...env,ASSETS:{fetch:async assetRequest=>{
  const asset=await env.ASSETS.fetch(assetRequest);
  const {db}=openLocalDatabase(${JSON.stringify(dbPath)},{allowMigrations:false});try{db.exec(${JSON.stringify(sql)});}finally{db.close();}
  return asset;
}}},ctx);}};
`);
  let app;
  try{
    app=await createKnabaVpsServer({dbPath,ownerEmail:'owner@example.test',localTest:true,host:'127.0.0.1',port:0,
      staticRoot:new URL('../dist/client/',import.meta.url).pathname,workerPath:pathToFileURL(workerPath).href});
    createOwner(app.db,'owner@example.test','Synthetic-owner-password-2026');
    const at=(path,options={})=>fetch(`http://127.0.0.1:${app.port}${path}`,{redirect:'manual',...options,headers:{Host:'knaba.de',...options.headers}});
    const login=await at('/login/',{method:'POST',headers:{Origin:'https://knaba.de','Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({email:'owner@example.test',password:'Synthetic-owner-password-2026',return_to:'/studio/'})});
    assert.equal(login.status,303);
    const cookie=login.headers.getSetCookie()[0].split(';')[0];
    const post=body=>({method:'POST',headers:{Cookie:cookie,Origin:'https://knaba.de','X-KnaBa-Request':'portal-v1','Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await at('/api/studio/draft',post({page:'/',version:0,entries:[{selector:'@title',kind:'text',value:'Do not publish revoked draft'}]}))).status,200);
    const response=await at('/api/studio/publish',post({page:'/',version:1,confirm:'PUBLISH'}));
    assert.equal(response.status,403,await response.clone().text());
    assert.equal((await response.json()).error.code,'forbidden');
    assert.equal(app.db.prepare('SELECT published_version FROM studio_pages WHERE page_path=?').get('/').published_version,0);
    assert.equal(app.db.prepare("SELECT count(*) AS n FROM studio_revisions WHERE action='published'").get().n,0);
  }finally{if(app)await app.close();await rm(directory,{recursive:true,force:true});}
});
