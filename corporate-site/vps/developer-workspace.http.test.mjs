import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createKnabaVpsServer} from './server.mjs';
import {createCredentialsUser} from './auth.mjs';

const origin='https://workspace.example.test';
const password='Synthetic-test-only-2026';
const requestBody={service:'baureinigung',objectType:'Baustelle',postcode:'10115',area:'20',frequency:'Einmalig',message:'Synthetic test request without a real address',address:'TEST ONLY',privacyAccepted:true};

test('developer role workspaces persist separately and cannot read or change company records',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'knaba-workspaces-'));
  let app;
  const options={dbPath:join(directory,'site.sqlite'),ownerEmail:'owner@example.test',developerEmail:'developer@example.test',origin,
    host:'127.0.0.1',port:0,localTest:true,oidcConfig:{},staticRoot:new URL('../dist/client/',import.meta.url).pathname,
    workerPath:new URL('../dist/server/index.js',import.meta.url).href};
  try{
    app=await createKnabaVpsServer(options);
    const owner=createCredentialsUser(app.db,options.ownerEmail,password);
    const developer=createCredentialsUser(app.db,options.developerEmail,password);
    const client=createCredentialsUser(app.db,'actual-client@example.test',password);
    const now=new Date().toISOString();
    app.db.prepare("INSERT INTO vps_staff_grants(user_id,email,purpose,active,enrolled_at) VALUES (?,?,'developer',1,?)").run(developer.id,developer.email,now);
    app.db.prepare("INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES (?,?,?,'client','client','approved','test',?,?,1,'fixture')").run(client.id,'Company client fixture',client.email,now,now);
    const at=(path,options={})=>fetch('http://127.0.0.1:'+app.port+path,{redirect:'manual',...options,headers:{Host:new URL(origin).host,...options.headers}});
    const jar={};
    function capture(response){for(const value of response.headers.getSetCookie()){const part=value.split(';')[0];const split=part.indexOf('=');jar[part.slice(0,split)]=part.slice(split+1);}}
    const cookie=()=>Object.entries(jar).map(([key,value])=>key+'='+value).join('; ');
    const post=(body,session=cookie(),extra={})=>({method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','X-KnaBa-Request':'portal-v1','Content-Type':'application/json',Cookie:session,...extra},body:JSON.stringify(body)});
    async function login(email){return at('/login/?lang=uk',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password,return_to:'/konto/'})});}
    const signedClient=await login(client.email);
    assert.equal(signedClient.headers.get('location'),'/konto/?lang=uk');
    const clientCookie=signedClient.headers.getSetCookie()[0].split(';')[0];
    const existing=await at('/api/portal/requests',post({...requestBody,idempotencyKey:'company-request-000001'},clientCookie));
    assert.equal(existing.status,201,await existing.clone().text());
    const companyRequest=(await existing.json()).request;
    const companySnapshot=()=>JSON.stringify({profiles:app.db.prepare('SELECT * FROM profiles ORDER BY id').all(),requests:app.db.prepare('SELECT * FROM cleaning_requests ORDER BY id').all(),audit:app.db.prepare('SELECT * FROM portal_audit ORDER BY id').all()});
    const before=companySnapshot();
    const signed=await login(developer.email);
    assert.equal(signed.status,303);
    assert.equal(signed.headers.get('location'),'/admin/?lang=uk');
    capture(signed);
    const status=await at('/api/developer/workspace',{headers:{Cookie:cookie()}});
    assert.equal(status.status,200);
    assert.equal((await status.json()).isolated,true);
    assert.equal((await at('/api/developer/workspace',{headers:{Cookie:clientCookie}})).status,404);
    assert.equal((await at('/api/developer/workspace')).status,404);
    assert.equal((await at('/invite-user/',{headers:{Cookie:cookie()}})).status,403);
    assert.equal((await at('/access-requests/',{headers:{Cookie:cookie()}})).status,403);
    const who=await (await at('/api/portal/session',{headers:{Cookie:cookie()}})).json();
    assert.equal(who.role,'owner');
    assert.notEqual(who.user.id,owner.id);
    assert.notEqual(who.user.id,developer.id);
    const dash=await (await at('/api/portal/dashboard',{headers:{Cookie:cookie()}})).json();
    assert.ok(dash.requests.length>0);
    assert.ok(!JSON.stringify(dash).includes(companyRequest.id));
    assert.ok(!JSON.stringify(dash).includes(client.email));
    const publicBefore=await (await at('/')).text();
    const testTitle='TEST WORKSPACE ONLY — not a company publication';
    const draft=await at('/api/studio/draft',post({page:'/',version:0,entries:[{selector:'@title',kind:'text',value:testTitle}]}));
    assert.equal(draft.status,200,await draft.clone().text());
    const published=await at('/api/studio/publish',post({page:'/',version:1,confirm:'PUBLISH'}));
    assert.equal(published.status,200,await published.clone().text());
    const privatePage=await at('/',{headers:{Cookie:cookie()}});
    assert.equal(privatePage.headers.get('cache-control'),'private, no-store');
    assert.equal(privatePage.headers.get('vary'),'Cookie');
    assert.ok((await privatePage.text()).includes(testTitle));
    const publicAfter=await at('/');
    assert.equal(publicAfter.headers.get('vary'),'Cookie');
    assert.equal(await publicAfter.text(),publicBefore);
    assert.equal(app.db.prepare('SELECT count(*) n FROM studio_pages').get().n,0);
    const attack=await at('/api/portal/roles',post({userId:client.id,role:'admin',status:'approved',version:1}));
    assert.equal(attack.status,404);
    assert.equal((await at('/api/developer/workspace',post({role:'client'},cookie(),{Origin:'https://evil.example'}))).status,403);
    assert.equal((await at('/api/developer/workspace',post({role:'client',userId:client.id}))).status,422);
    assert.equal((await at('/api/developer/workspace',post({role:'superowner'}))).status,422);
    const chosen=await at('/api/developer/workspace?lang=uk',post({role:'client'}));
    assert.equal(chosen.status,200);
    assert.equal((await chosen.json()).redirect,'/konto/?lang=uk');capture(chosen);
    const own=await at('/api/portal/requests',post({...requestBody,idempotencyKey:'developer-request-000001'}));
    assert.equal(own.status,201,await own.clone().text());
    const ownId=(await own.json()).request.id;
    const replay=await at('/api/portal/requests',post({...requestBody,idempotencyKey:'developer-request-000001'}));
    assert.equal((await replay.json()).request.id,ownId);
    assert.equal(app.db.prepare('SELECT 1 FROM cleaning_requests WHERE id=?').get(ownId),undefined);
    const privatePatch=await at('/api/portal/requests/'+companyRequest.id,{...post({version:1,status:'cancelled'}),method:'PATCH'});
    assert.equal(privatePatch.status,404);
    const forged=await at('/api/portal/session',{headers:{Cookie:cookie(),'oai-authenticated-user-id':owner.id,'oai-authenticated-user-email':owner.email}});
    assert.equal((await forged.json()).role,'client');
    for(const role of ['worker','partner','bauleiter','admin','pending','suspended','owner']){
      const response=await at('/api/developer/workspace',post({role}));assert.equal(response.status,200);capture(response);
      const session=await (await at('/api/portal/session',{headers:{Cookie:cookie()}})).json();assert.equal(session.role,role);
      if(role==='worker'){
        assert.equal((await at('/login/?lang=uk',{headers:{Cookie:cookie()}})).headers.get('location'),'/konto/?lang=uk');
        const jobs=await (await at('/api/portal/dashboard',{headers:{Cookie:cookie()}})).json();
        const sample=jobs.requests.find(request=>request.id.endsWith('-sample'));
        assert.ok(sample.scheduledAt,'synthetic sample is a workable scheduled job');
        const started=await at('/api/portal/requests/'+sample.id,{...post({version:sample.version,status:'in_progress',workerNote:'TEST worker started sample'}),method:'PATCH'});
        assert.equal(started.status,200,await started.clone().text());
        const updated=await (await at('/api/portal/dashboard',{headers:{Cookie:cookie()}})).json();
        assert.equal(updated.requests.find(request=>request.id===sample.id).workerNote,'TEST worker started sample');
      }
    }
    const goodCookie=cookie();
    const forgedCookie=goodCookie.replace(/__Host-knaba-workspace=[^;]+/,'__Host-knaba-workspace=owner.'+'x'.repeat(43));
    assert.equal((await at('/api/portal/session',{headers:{Cookie:forgedCookie}})).status,403);
    assert.equal((await at('/api/leads',post({...requestBody,name:'Test',email:'test@example.test',phone:'',idempotencyKey:'forged-workspace-0001'},forgedCookie))).status,403);
    const expired='__Host-knaba-workspace='+jar['__Host-knaba-workspace'];
    assert.equal((await at('/api/leads',post({...requestBody,idempotencyKey:'expired-workspace-001'},expired))).status,401);
    assert.equal((await at('/join/',{method:'POST',headers:{Cookie:expired,Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({name:'Test',email:'test@example.test',intent:'client',privacy:'on'})})).status,401);
    assert.equal(companySnapshot(),before,'all company request/profile/audit records remain byte-for-byte unchanged');
    assert.ok((await readdir(join(directory,'developer-workspaces'))).some(name=>name.endsWith('.sqlite')));
    await app.close();app=await createKnabaVpsServer(options);
    const persisted=await (await at('/api/portal/dashboard',{headers:{Cookie:goodCookie}})).json();
    assert.ok(persisted.requests.some(request=>request.id===ownId),'test records survive server restart');
    assert.equal(companySnapshot(),before);
    app.db.prepare('UPDATE vps_staff_grants SET active=0 WHERE user_id=?').run(developer.id);
    assert.equal((await at('/api/portal/session',{headers:{Cookie:goodCookie}})).status,403);
    assert.equal((await at('/api/developer/workspace',{headers:{Cookie:goodCookie}})).status,403);
    assert.equal((await at('/api/portal/requests',post({...requestBody,idempotencyKey:'revoked-developer-001'},goodCookie))).status,403);
    assert.equal((await login(developer.email)).status,403);
    assert.equal(companySnapshot(),before);
  }finally{if(app)await app.close();await rm(directory,{recursive:true,force:true});}
});
