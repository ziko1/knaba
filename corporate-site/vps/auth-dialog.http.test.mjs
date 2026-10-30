import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {createKnabaVpsServer} from './server.mjs';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createOwner} from './auth.mjs';

const origin='https://auth-dialog.example.test';
const ownerEmail='owner@example.test';
const password='synthetic-dialog-test-only-2026';

async function fixture(run,oidcConfig={}){
 const dir=await mkdtemp(join(tmpdir(),'knaba-auth-dialog-'));
 let app;
 try{
  const dbPath=join(dir,'state.sqlite');
  // Explicitly migrate only this disposable fixture. Production mode below
  // verifies the real secure-cookie/proxy path without a live database.
  const initial=openLocalDatabase(dbPath,{allowMigrations:true});
  createOwner(initial.db,ownerEmail,password);initial.db.close();
  app=await createKnabaVpsServer({dbPath,origin,ownerEmail,localTest:false,oidcConfig,
   staticRoot:new URL('../dist/client/',import.meta.url).pathname,
   workerPath:new URL('../dist/server/index.js',import.meta.url).href,host:'127.0.0.1',port:0});
  // Node fetch supplies the connection authority as Host. Use a real HTTP
  // request so the fixture can exercise the production proxy's exact Host,
  // including the explicit wrong-host denial below, without localTest bypasses.
  const at=(path,options={})=>new Promise((resolve,reject)=>{
   const outgoing=httpRequest({hostname:'127.0.0.1',port:app.port,path,method:options.method??'GET',
    headers:{Host:'auth-dialog.example.test','X-Forwarded-Proto':'https',...options.headers}},incoming=>{
     const chunks=[];
     incoming.on('data',chunk=>chunks.push(chunk));incoming.on('error',reject);
     incoming.on('end',()=>{
      const headers=new Headers();
      for(let index=0;index<incoming.rawHeaders.length;index+=2)headers.append(incoming.rawHeaders[index],incoming.rawHeaders[index+1]);
      resolve(new Response(Buffer.concat(chunks),{status:incoming.statusCode,headers}));
     });
    });
   outgoing.on('error',reject);
   outgoing.setTimeout(15000,()=>outgoing.destroy(new Error('Synthetic HTTP request timed out')));
   outgoing.end(options.body===undefined?undefined:String(options.body));
  });
  const login=(fields={},headers={})=>at('/login/?lang=uk',{method:'POST',
   headers:{Origin:origin,'Sec-Fetch-Site':'same-origin',Accept:'application/json',
    'Content-Type':'application/x-www-form-urlencoded',...headers},
   body:new URLSearchParams({email:ownerEmail,password,return_to:'/konto/?lang=uk',...fields})});
  const sessions=()=>Number(app.db.prepare('SELECT count(*) AS n FROM vps_sessions').get().n);
  await run({app,at,login,sessions});
 }finally{if(app)await app.close();await rm(dir,{recursive:true,force:true});}
}

test('JSON login returns navigation only and keeps the session exclusively in a secure HttpOnly cookie',async()=>fixture(async({app,at,login,sessions})=>{
 const response=await login();assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/^application\/json\b/);
 assert.match(response.headers.get('cache-control'),/no-store/);
 assert.equal(response.headers.get('location'),null);
 assert.equal(response.headers.get('access-control-allow-origin'),null);
 const body=await response.json();
 assert.deepEqual(body,{authenticated:true,returnTo:'/admin/?lang=uk'});
 const setCookie=response.headers.get('set-cookie');
 assert.match(setCookie,/^__Host-knaba-session=[A-Za-z0-9_-]{43};/);
 for(const attribute of ['Path=/','HttpOnly','SameSite=Strict','Secure'])assert.ok(setCookie.includes(attribute),attribute);
 assert.ok(!setCookie.includes('Domain='));
 const cookie=setCookie.split(';')[0],token=cookie.split('=')[1];
 assert.ok(!JSON.stringify(body).includes(token));assert.ok(!JSON.stringify(body).includes(ownerEmail));
 assert.equal(sessions(),1);
 assert.equal(app.db.prepare('SELECT token_hash FROM vps_sessions').get().token_hash,createHash('sha256').update(token).digest('hex'));
 const session=await (await at('/api/portal/session',{headers:{Cookie:cookie}})).json();
 assert.equal(session.role,'owner');assert.equal(session.user.email,ownerEmail);
 assert.ok(!JSON.stringify(session).includes(token));
}));

test('JSON negotiation does not bypass same-origin checks, the proxy boundary or the exact login form',async()=>fixture(async({at,login,sessions})=>{
 for(const headers of [{Origin:'https://evil.example.test'},{Origin:''},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'none'}]){
  const response=await login({},headers);assert.equal(response.status,403);
  assert.equal(response.headers.get('set-cookie'),null);
 }
 assert.equal((await login({}, {Host:'evil.example.test'})).status,421);
 assert.equal((await login({}, {'X-Forwarded-Proto':'http'})).status,421);
 const type=await login({}, {'Content-Type':'application/json'});assert.equal(type.status,415);
 const escalation=await login({role:'admin'});assert.equal(escalation.status,422);
 const duplicate=await at('/login/',{method:'POST',headers:{Origin:origin,Accept:'application/json',
  'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams([
   ['email',ownerEmail],['password',password],['return_to','/konto/'],['email','another@example.test']])});
 assert.equal(duplicate.status,422);assert.equal(duplicate.headers.get('set-cookie'),null);
 assert.equal(sessions(),0);
}));

test('unknown, wrong-password, disabled and rate-limited JSON logins share a generic failure without sessions',async()=>fixture(async({app,login,sessions})=>{
 const disabled=createCredentialsUser(app.db,'disabled@example.test',password);
 app.db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(disabled.id);
 const attempts=[{password:'wrong-password'},{email:'missing@example.test'},{email:disabled.email}];
 for(const fields of attempts){
  const response=await login(fields);assert.equal(response.status,401);
  assert.match(response.headers.get('content-type'),/^application\/json\b/);
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(response.headers.get('set-cookie'),null);
  assert.deepEqual(await response.json(),{error:{code:'invalid_credentials'}});
 }
 // Five total incorrect attempts for one identity exhaust the existing cap.
 for(let index=0;index<4;index++)assert.equal((await login({password:'wrong-password'})).status,401);
 const limited=await login();assert.equal(limited.status,401);
 assert.deepEqual(await limited.json(),{error:{code:'invalid_credentials'}});
 assert.equal(limited.headers.get('set-cookie'),null);assert.equal(sessions(),0);
}));

test('JSON return destinations reject external, protocol-relative and control-character paths',async()=>fixture(async({login})=>{
 for(const return_to of ['https://evil.example.test/private','//evil.example.test/private','/\\evil.example.test','/konto/\r\nLocation: https://evil.example.test']){
  const response=await login({return_to});assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{authenticated:true,returnTo:'/admin/?lang=uk'});
 }
 const response=await login({return_to:'/admin/?lang=ru&view=requests'});
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{authenticated:true,returnTo:'/admin/?lang=ru'});
}));

test('the existing HTML login and no-JavaScript redirect remain compatible',async()=>fixture(async({at,login})=>{
 const page=await at('/login/?lang=uk',{headers:{Accept:'text/html'}});
 assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/^text\/html\b/);
 assert.match(await page.text(),/<form method="post" action="\/login\/\?lang=uk">/);
 const bad=await login({password:'incorrect'}, {Accept:'text/html'});
 assert.equal(bad.status,401);assert.match(bad.headers.get('content-type'),/^text\/html\b/);
 assert.equal(bad.headers.get('set-cookie'),null);
 const success=await login({return_to:'/studio/'},{Accept:'text/html'});
 assert.equal(success.status,303);assert.equal(success.headers.get('location'),'/admin/?lang=uk&view=studio');
 assert.match(success.headers.get('set-cookie'),/HttpOnly/);
}));

test('JSON discovery exposes only configured provider names and never credentials or account state',async()=>fixture(async({at,sessions})=>{
 const response=await at('/login/?lang=en',{headers:{Accept:'application/json'}});
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^application\/json\b/);
 assert.match(response.headers.get('cache-control'),/no-store/);
 assert.equal(response.headers.get('set-cookie'),null);
 assert.deepEqual(await response.json(),{providers:['google']});
 assert.equal(sessions(),0);
},{google:{clientId:'synthetic-client-id',clientSecret:'synthetic-never-expose-provider-secret'},unsupported:{}}));

test('a cabinet URL cannot grant pending or suspended users access to privileged APIs',async()=>fixture(async({app,at,login})=>{
 const user=createCredentialsUser(app.db,'pending@example.test',password);
 const signed=await login({email:user.email,return_to:'/konto/?lang=uk&cabinet=admin'});
 assert.equal(signed.status,200);
 const body=await signed.json();assert.deepEqual(Object.keys(body).sort(),['authenticated','returnTo']);
 const cookie=signed.headers.get('set-cookie').split(';')[0];
 const read=path=>at(path,{headers:{Cookie:cookie}});
 let session=await (await read('/api/portal/session')).json();
 assert.equal(session.role,'pending');assert.equal(session.user.id,user.id);
 const registered=await at('/api/portal/register',{method:'POST',headers:{Cookie:cookie,Origin:origin,
  'Content-Type':'application/json','X-Knaba-Request':'portal-v1'},
  body:JSON.stringify({name:'Pending dialog fixture',requestedRole:'client',privacyAccepted:true})});
 assert.equal(registered.status,201,await registered.clone().text());
 assert.equal((await read('/api/crm/contacts')).status,403);
 assert.equal((await read('/api/studio/pages')).status,403);
 app.db.prepare("UPDATE profiles SET status='suspended' WHERE id=?").run(user.id);
 session=await (await read('/api/portal/session')).json();assert.equal(session.role,'suspended');
 assert.equal((await read('/api/crm/contacts')).status,403);
 assert.equal((await read('/api/studio/pages')).status,403);
}));
