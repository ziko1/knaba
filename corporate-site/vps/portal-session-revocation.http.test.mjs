import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createKnabaVpsServer} from './server.mjs';
import {createOwner,createCredentialsUser,rotateCredentials} from './auth.mjs';

const password='Synthetic-test-password-2026',origin='https://knaba.de';
async function fixture(work,{revoke=null,target='/api/portal/roles'}={}){
  const directory=await mkdtemp(join(tmpdir(),'knaba-session-fence-'));
  const dbPath=join(directory,'state.sqlite');
  let workerPath=new URL('../dist/server/index.js',import.meta.url).href,app;
  try{
    if(revoke){
      const wrapper=join(directory,'revocation-worker.mjs');
      const sql=revoke==='disable'?'UPDATE vps_users SET disabled=1':'DELETE FROM vps_sessions';
      await writeFile(wrapper,`import worker from ${JSON.stringify(workerPath)};
import {DatabaseSync} from 'node:sqlite';
export default {fetch(request,env,ctx){
  if(new URL(request.url).pathname!==${JSON.stringify(target)})return worker.fetch(request,env,ctx);
  let changed=false;
  const prepare=env.DB.prepare;
  const wrap=statement=>({
    ...statement,bind:(...values)=>wrap(statement.bind(...values)),
    first:async(...args)=>{
      const result=await statement.first(...args);
      if(!changed){changed=true;const db=new DatabaseSync(${JSON.stringify(dbPath)});
        try{db.exec(${JSON.stringify(sql)});}finally{db.close();}}
      return result;
    }
  });
  return worker.fetch(request,{...env,DB:{...env.DB,prepare:sql=>sql==='SELECT * FROM profiles WHERE id=?'?wrap(prepare(sql)):prepare(sql)}},ctx);
}};`);
      workerPath=pathToFileURL(wrapper).href;
    }
    app=await createKnabaVpsServer({dbPath,staticRoot:new URL('../dist/client/',import.meta.url).pathname,
      workerPath,ownerEmail:'owner@example.test',localTest:true,host:'127.0.0.1',port:0,oidcConfig:{}});
    const owner=createOwner(app.db,'owner@example.test',password);
    const client=createCredentialsUser(app.db,'client@example.test',password);
    const time=new Date().toISOString();
    app.db.prepare("INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,'client','client','approved','test',?,?,1,'test')")
      .run(client.id,'Synthetic client',client.email,time,time);
    const at=(path,options={})=>fetch(`http://127.0.0.1:${app.port}${path}`,{redirect:'manual',...options,headers:{Host:'knaba.de',...options.headers}});
    const login=async user=>{
      const response=await at('/login/',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({email:user.email,password,return_to:'/konto/'})});
      assert.equal(response.status,303);return response.headers.getSetCookie()[0].split(';')[0];
    };
    await work({app,at,login,owner,client});
  }finally{if(app)await app.close();await rm(directory,{recursive:true,force:true});}
}
const post=(cookie,body)=>({method:'POST',headers:{Cookie:cookie,Origin:origin,'X-KnaBa-Request':'portal-v1','Content-Type':'application/json'},body:JSON.stringify(body)});

for(const revoke of ['logout','disable'])test('owner role mutation rejects '+revoke+' after Worker captured identity',async()=>{
  await fixture(async({app,at,login,owner,client})=>{
    const cookie=await login(owner);
    const response=await at('/api/portal/roles',post(cookie,{userId:client.id,role:'admin',status:'approved',version:1}));
    assert.equal(response.status,403,await response.clone().text());
    assert.deepEqual({...app.db.prepare('SELECT role,version FROM profiles WHERE id=?').get(client.id)},{role:'client',version:1});
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM portal_audit').get().n,0);
  },{revoke});
});
test('client logout during request processing cannot create a request, audit or ERP outbox',async()=>{
  await fixture(async({app,at,login,client})=>{
    const cookie=await login(client);
    const response=await at('/api/portal/requests',post(cookie,{service:'baureinigung',objectType:'Baustelle',postcode:'10115',area:'50',frequency:'Einmalig',message:'Synthetic test',address:'Test',privacyAccepted:true,idempotencyKey:'synthetic-client-request-2026'}));
    assert.equal(response.status,403);
    for(const table of ['cleaning_requests','portal_audit','site_erp_outbox'])
      assert.equal(app.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
  },{revoke:'logout',target:'/api/portal/requests'});
});
test('owner logout during dashboard read returns no private records',async()=>{
  await fixture(async({at,login,owner})=>{
    const response=await at('/api/portal/dashboard',{headers:{Cookie:await login(owner)}});
    assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:{code:'forbidden'}});
  },{revoke:'logout',target:'/api/portal/dashboard'});
});
for(const revoke of ['logout','password'])test(revoke+' while HTTP request body is incomplete fences the subsequently completed mutation',async()=>{
  await fixture(async({app,login,owner,client})=>{
    const cookie=await login(owner),body=JSON.stringify({userId:client.id,role:'admin',status:'approved',version:1});
    let seenRequest;
    const accepted=new Promise(resolve=>{seenRequest=resolve;});
    app.server.once('request',seenRequest);
    const reply=new Promise((resolve,reject)=>{
      const request=httpRequest({host:'127.0.0.1',port:app.port,path:'/api/portal/roles',method:'POST',headers:{Host:'knaba.de',Cookie:cookie,Origin:origin,'X-KnaBa-Request':'portal-v1','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},response=>{
        response.resume();response.once('end',()=>resolve(response.statusCode));
      });
      request.once('error',reject);request.write(body.slice(0,1));
      accepted.then(()=>{
        if(revoke==='password')assert.equal(rotateCredentials(app.db,{userId:owner.id,currentPassword:password,newPassword:password+'-rotated',confirmed:password+'-rotated'}),true);
        else app.db.prepare('DELETE FROM vps_sessions WHERE user_id=?').run(owner.id);
        request.end(body.slice(1));
      }).catch(reject);
    });
    assert.equal(await reply,401);
    assert.equal(app.db.prepare('SELECT role FROM profiles WHERE id=?').get(client.id).role,'client');
    assert.deepEqual(app.db.prepare('SELECT action,entity_id FROM portal_audit').all().map(row=>({...row})),
      revoke==='password'?[{action:'credential.rotated',entity_id:owner.id}]:[]);
  });
});
test('VPS keeps owner privilege pinned when another subject later uses the same address',async()=>{
  await fixture(async({app,at,login,owner})=>{
    const original=await login(owner);
    assert.equal((await (await at('/api/portal/session',{headers:{Cookie:original}})).json()).role,'owner');
    app.db.prepare('UPDATE vps_users SET email=? WHERE id=?').run('former-owner@example.test',owner.id);
    const replacement=createCredentialsUser(app.db,'owner@example.test',password);
    const cookie=await login(replacement);
    assert.equal((await (await at('/api/portal/session',{headers:{Cookie:cookie}})).json()).role,'pending');
    assert.equal((await at('/invite-user/',{headers:{Cookie:cookie}})).status,403);
    assert.equal((await at('/api/studio/templates',{headers:{Cookie:cookie}})).status,403);
  });
});
