import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createKnabaVpsServer} from './server.mjs';
import {createOwner,createCredentialsUser} from './auth.mjs';
const email='owner@example.test',pass='synthetic-auth-check-2026';
test('public access request needs consent; no role elevation; owner-only review',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'knaba-request-'));let app;
 try{
  app=await createKnabaVpsServer({dbPath:join(dir,'db.sqlite'),ownerEmail:email,
   localTest:true,host:'127.0.0.1',port:0,
   staticRoot:new URL('../dist/client/',import.meta.url).pathname,
   workerPath:new URL('../dist/server/index.js',import.meta.url).href});
  createOwner(app.db,email,pass);
  const at=(path,opts={})=>fetch('http://127.0.0.1:'+app.port+path,{
   redirect:'manual',...opts,headers:{Host:'knaba.de',...opts.headers}});
  const post=(fields,extras={})=>({method:'POST',
   headers:{Origin:'https://knaba.de','Content-Type':'application/x-www-form-urlencoded',...extras},
   body:new URLSearchParams(fields)});
  const page=await at('/join/?lang=uk');
  assert.equal(page.status,200);
  assert.match(await page.text(),/Заявк|заявк/);
  const fields={name:'Тест Клієнт',email:'candidate@example.test',intent:'client',privacy:'on'};
  assert.equal((await at('/join/',post(fields,{Origin:'https://bad.example'}))).status,403);
  assert.equal((await at('/join/',post({...fields,intent:'owner'}))).status,422);
  assert.equal((await at('/join/',post({...fields,privacy:''}))).status,422);
  const accepted=await at('/join/',post(fields));
  assert.equal(accepted.status,202);
  assert.doesNotMatch(await accepted.text(),/candidate@example.test/);
  assert.equal((await at('/join/',post(fields))).status,202);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM vps_access_requests').get().n,1);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM vps_users').get().n,1);
  assert.equal((await at('/access-requests/')).status,401);
  createCredentialsUser(app.db,'worker@example.test','synthetic-worker-secret-2026');
  const coworker=await at('/login/',post({email:'worker@example.test',
   password:'synthetic-worker-secret-2026',return_to:'/konto/'}));
  assert.equal(coworker.status,303);
  const coworkerCookie=coworker.headers.get('set-cookie').split(';')[0];
  assert.equal((await at('/access-requests/',{headers:{Cookie:coworkerCookie}})).status,403);

  const logged=await at('/login/',post({email,password:pass,return_to:'/studio/'}));
  const cookie=logged.headers.get('set-cookie')?.split(';')[0];
  assert.equal(logged.status,303);
  const ownerList=await at('/access-requests/',{headers:{Cookie:cookie}});
  assert.equal(ownerList.status,200);
  const ownerMarkup=await ownerList.text();
  assert.match(ownerMarkup,/candidate@example.test/);
  assert.match(ownerMarkup,/Gültig bis:/,'owner needs deadline visibility before a request expires');
  assert.match(ownerMarkup,/<form method="post" action="\/invite-user\/">/);
  assert.match(ownerMarkup,/name="email" value="candidate@example.test"/);
  assert.match(ownerMarkup,/name="role" value="client"/);
  assert.match(ownerMarkup,/name="identity_verified" value="on" required/);
  assert.doesNotMatch(ownerMarkup,/name="role" value="owner"/);
  assert.equal(ownerList.headers.get('referrer-policy'),'no-referrer');
  const inviteReply=await at('/invite-user/',post({
    email:'candidate@example.test',role:'client',identity_verified:'on'
  },{Cookie:cookie}));
  assert.equal(inviteReply.status,200);
  const inviteMarkup=await inviteReply.text();
  assert.match(inviteMarkup,/register\/#token=[A-Za-z0-9_-]{43}/);
  assert.equal(app.db.prepare('SELECT requested_role FROM vps_account_invites WHERE email=?').get('candidate@example.test').requested_role,'client');
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM vps_users').get().n,2,
    'generating an owner invitation cannot create an applicant account');


 }finally{if(app)await app.close();await rm(dir,{recursive:true,force:true});}
});
