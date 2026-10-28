import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createKnabaVpsServer} from './server.mjs';
import {createCredentialsUser} from './auth.mjs';

const origin='https://knaba.example.test';
const pass='synthetic-partner-only-password';
const form=values=>({
 method:'POST',headers:{Host:'knaba.example.test',Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams(values)
});
const json=(values,cookie)=>({
 method:'POST',headers:{Host:'knaba.example.test',Origin:origin,'Sec-Fetch-Site':'same-origin',
 'X-Knaba-Request':'portal-v1','Content-Type':'application/json',Cookie:cookie},
 body:JSON.stringify(values)
});
test('approved partner creates and tracks ONLY own project inquiries; never worker notes or CRM',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'knaba-partner-inquiry-'));let app;
 try{
  app=await createKnabaVpsServer({
   dbPath:join(dir,'state.sqlite'),ownerEmail:'owner@example.test',origin,
   host:'127.0.0.1',port:0,localTest:true,oidcConfig:{},
   staticRoot:new URL('../dist/client/',import.meta.url).pathname,
   workerPath:new URL('../dist/server/index.js',import.meta.url).href
  });
  const owner=createCredentialsUser(app.db,'owner@example.test',pass);
  const partner=createCredentialsUser(app.db,'partner@example.test',pass);
  const outsider=createCredentialsUser(app.db,'other-partner@example.test',pass);
  const client=createCredentialsUser(app.db,'client@example.test',pass);
  const worker=createCredentialsUser(app.db,'worker@example.test',pass);
  const now=new Date().toISOString();
  const add=app.db.prepare("INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,?,?,?,?,?,?,1,?)");
  for(const [user,role] of [[partner,'partner'],[outsider,'partner'],[client,'client'],[worker,'worker']]){
   add.run(user.id,'Synthetic '+role,user.email,role,role,'approved','2026-10-24',now,now,'synthetic-test');
  }
  const at=(path,opts={})=>fetch('http://127.0.0.1:'+app.port+path,{
   redirect:'manual',...opts,headers:{Host:'knaba.example.test',...opts.headers}
  });
  const login=async(email)=>{
   const r=await at('/login/',form({email,password:pass,return_to:'/konto/'}));
   assert.equal(r.status,303,'login '+email);
   return r.headers.get('set-cookie').split(';')[0];
  };
  const ownerCookie=await login(owner.email),partnerCookie=await login(partner.email),
    outsiderCookie=await login(outsider.email),clientCookie=await login(client.email),
    workerCookie=await login(worker.email);
  const body={service:'baureinigung',objectType:'Baustelle',postcode:'10115',
   area:'30',frequency:'Einmalig',message:'Synthetic partner building handover inquiry',
   address:'QA example only',idempotencyKey:'partner-inquiry-000001',privacyAccepted:true};
  const first=await at('/api/portal/requests',json(body,partnerCookie));
  assert.equal(first.status,201,await first.clone().text());
  const record=(await first.json()).request;
  assert.equal(record.clientId,partner.id);
  const replay=await at('/api/portal/requests',json(body,partnerCookie));
  assert.equal(replay.status,200);
  assert.equal((await replay.json()).request.id,record.id);
  const partnerDashboard=await(at('/api/portal/dashboard',{headers:{Cookie:partnerCookie}})).then(r=>r.json());
  assert.equal(partnerDashboard.session.role,'partner');
  assert.deepEqual(partnerDashboard.profiles,[]);
  assert.equal(partnerDashboard.requests.length,1);
  assert.equal(partnerDashboard.requests[0].id,record.id);
  assert.equal((await at('/api/crm/contacts',{headers:{Cookie:partnerCookie}})).status,403);
  assert.equal((await at('/api/portal/roles',json({userId:partner.id,role:'admin',status:'approved',version:1},partnerCookie))).status,403);
  for(const cookie of [outsiderCookie,clientCookie,workerCookie]){
   const dash=await(at('/api/portal/dashboard',{headers:{Cookie:cookie}})).then(r=>r.json());
   assert.equal(dash.requests.length,0);
  }
  const patch=(cookie,patch)=>at('/api/portal/requests/'+record.id,{
   method:'PATCH',headers:{Host:'knaba.example.test',Origin:origin,
    'X-Knaba-Request':'portal-v1','Content-Type':'application/json',Cookie:cookie},
   body:JSON.stringify(patch)
  });
  assert.equal((await patch(outsiderCookie,{version:record.version,status:'cancelled'})).status,404);
  app.db.prepare('UPDATE cleaning_requests SET worker_note=? WHERE id=?').run('CONFIDENTIAL_INTERNAL_WORKER_NOTE',record.id);
  const refreshed=await(at('/api/portal/dashboard',{headers:{Cookie:partnerCookie}})).then(r=>r.json());
  assert.ok(!('workerNote' in refreshed.requests[0]));
  assert.ok(!JSON.stringify(refreshed).includes('CONFIDENTIAL_INTERNAL_WORKER_NOTE'));
  assert.equal((await patch(partnerCookie,{version:record.version,assignedWorkerId:worker.id})).status,422);
  const own=await patch(partnerCookie,{version:record.version,status:'cancelled'});
  assert.equal(own.status,200,await own.clone().text());
  assert.equal((await own.json()).request.status,'cancelled');
  app.db.prepare('UPDATE profiles SET status=? WHERE id=?').run('suspended',partner.id);
  const blocked=await at('/api/portal/requests',json({...body,idempotencyKey:'partner-inquiry-000002'},partnerCookie));
  assert.equal(blocked.status,403);
  const ownerDashboard=await(at('/api/portal/dashboard',{headers:{Cookie:ownerCookie}})).then(r=>r.json());
  assert.equal(ownerDashboard.requests.length,1);
 }finally{if(app)await app.close();await rm(dir,{recursive:true,force:true});}
});
