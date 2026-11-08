import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request as httpRequest} from 'node:http';
import {createKnabaVpsServer} from './server.mjs';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createSessionForUser} from './auth.mjs';
import {testAuthority} from './federation-test-authority.mjs';
import {enableLoginTestAuthority,loginTestPassword} from './federation-login-test-fixture.mjs';
import {federationLoginWords} from './federation-login-ui.mjs';
import {roleDestination} from './role-destination.mjs';

async function fixture(t,{enabled=true}={}){
  const directory=await mkdtemp(join(tmpdir(),'knaba-f3-http-')),dbPath=join(directory,'auth.sqlite'),setup=openLocalDatabase(dbPath);
  const owner=createCredentialsUser(setup.db,'owner@example.test',loginTestPassword),user=createCredentialsUser(setup.db,'user@example.test',loginTestPassword),other=createCredentialsUser(setup.db,'other@example.test',loginTestPassword);
  for(const u of [user,other])setup.db.prepare(`INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation)
    VALUES(?,?,?,'client','client','approved','2026-10-28','2026-11-08','2026-11-08',1,'fixture')`).run(u.id,'Synthetic '+u.id.slice(0,4),u.email);
  const session=createSessionForUser(setup.db,user.id),otherSession=createSessionForUser(setup.db,other.id);
  const cookie='__Host-knaba-session='+session.token,otherCookie='__Host-knaba-session='+otherSession.token;setup.db.close();
  const authority=await testAuthority(t),login=enableLoginTestAuthority(authority),request=login.createRequest(),origin=authority.config.siteOrigin;
  const app=await createKnabaVpsServer({dbPath,origin,ownerEmail:owner.email,ownerUserId:owner.id,host:'127.0.0.1',port:0,localTest:false,
    staticRoot:new URL('../dist/client/',import.meta.url).pathname,workerPath:new URL('../dist/server/index.js',import.meta.url).href,
    accountEmailEnvironment:{},erpIntakeEnvironment:{},federationEnvironment:{KNABA_FEDERATION_ENABLED:'approved',KNABA_FEDERATION_AUTHORITIES:JSON.stringify([authority.config]),
      ...(enabled?{KNABA_FEDERATION_LOGIN_JSON:JSON.stringify({enabled:true,authorityIds:[authority.config.authorityId],policyVersion:1})}:{})},federationFetch:authority.fetchImpl});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const at=(path,{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{
    const req=httpRequest({host:'127.0.0.1',port:app.port,path,method,headers:{Host:'site.example.test','X-Forwarded-Proto':'https',...headers}},res=>{
      const parts=[];res.on('data',part=>parts.push(part));res.on('error',reject);res.on('end',()=>{
        const responseHeaders=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)responseHeaders.append(res.rawHeaders[i],res.rawHeaders[i+1]);
        resolve(new Response(Buffer.concat(parts),{status:res.statusCode,headers:responseHeaders}));
      });
    });req.on('error',reject);req.setTimeout(15000,()=>req.destroy(Error('Synthetic F3 HTTP timeout')));req.end(body);
  });
  const get=(path,currentCookie=cookie)=>at(path,{headers:currentCookie?{Cookie:currentCookie}:{}});
  const post=(path,fields,currentCookie=cookie,extra={})=>at(path,{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/x-www-form-urlencoded',...(currentCookie?{Cookie:currentCookie}:{}),...extra},body:new URLSearchParams(fields).toString()});
  const context={authorityId:authority.config.authorityId,requestId:request.requestId};
  const landing='/account/erp-login/?authority_id='+context.authorityId+'&request_id='+context.requestId;
  return {app,user,other,session,cookie,otherCookie,at,get,post,context,landing,request,...authority,...login};
}
const inspectionId=html=>html.match(/name="inspectionId" value="([a-f0-9-]{36})"/)?.[1];
test('F3 remains disabled on a packaged VPS with only F2 configured',async t=>{
  const f=await fixture(t,{enabled:false}),before=f.ledger.requests.length;
  assert.equal((await f.get(f.landing)).status,503);assert.equal((await f.post('/account/erp-login/continue/',f.context)).status,503);
  assert.equal(f.ledger.requests.length,before);
});
test('cross-site landing without a Strict cookie is nonauthorizing and resumes by a same-origin form',async t=>{
  const f=await fixture(t),before=f.ledger.requests.length,response=await f.get(f.landing,null),html=await response.text();
  assert.equal(response.status,200);assert.match(html,/action="\/account\/erp-login\/continue\//);assert.ok(!html.includes(f.user.email));
  assert.equal(f.ledger.requests.length,before);assert.equal(response.headers.get('set-cookie'),null);
  assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('x-frame-options'),'DENY');
  assert.equal(response.headers.get('referrer-policy'),'strict-origin');
  const continued=await f.post('/account/erp-login/continue/',f.context);assert.equal(continued.status,200);assert.ok(inspectionId(await continued.text()));
});
test('unauthenticated continuation offers a safe login return without trusting an arbitrary destination',async t=>{
  const f=await fixture(t),response=await f.post('/account/erp-login/continue/?lang=uk',f.context,null),html=await response.text();
  assert.equal(response.status,401);assert.ok(html.includes(federationLoginWords('uk').required));assert.ok(html.includes(encodeURIComponent(f.context.requestId)));
  const target=f.landing+'&lang=uk&role=admin&return_to=https://attacker.example.test';
  assert.equal(roleDestination('client',target,'uk'),f.landing+'&lang=uk');
  assert.equal(roleDestination('client',f.landing+'&authority_id=other','uk'),'/konto/?lang=uk');
});
test('packaged source UI checks company and app, then redirects only after current owned approval',async t=>{
  const f=await fixture(t),inspected=await f.post('/account/erp-login/continue/?lang=en',f.context),html=await inspected.text(),id=inspectionId(html);
  assert.equal(inspected.status,200);assert.ok(id);assert.ok(html.includes('Synthetic Company')&&html.includes('KNABA Web')&&html.includes(f.user.email));
  assert.match(html,/name="confirmed" value="yes" required/);assert.ok(!html.includes(loginTestPassword));
  const approved=await f.post('/account/erp-login/approve/?lang=en',{inspectionId:id,current:loginTestPassword,confirmed:'yes'});
  assert.equal(approved.status,303);assert.equal(approved.headers.get('location'),f.request.returnUrl);assert.equal(approved.headers.get('set-cookie'),null);
  assert.deepEqual(f.ledger.requests.filter(r=>r.action.startsWith('LOGIN_')).map(r=>r.action),['LOGIN_INSPECT','LOGIN_APPROVE','LOGIN_STATUS']);
  assert.equal(f.app.db.prepare('SELECT state FROM vps_federation_login_approvals').get().state,'APPROVED');
});
test('all six source login locales retain explicit confirmation and escaped server-owned labels',async t=>{
  const f=await fixture(t);f.request.client.label='<script>unsafe</script>';
  for(const lang of ['de','en','pl','lt','ru','uk']){
    const response=await f.post('/account/erp-login/continue/?lang='+lang,f.context),html=await response.text();
    assert.equal(response.status,200);assert.ok(html.includes('<html lang="'+lang+'"'));assert.ok(html.includes(federationLoginWords(lang).title));
    assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));assert.ok(!html.includes('<script>unsafe</script>'));
    assert.doesNotMatch(html,/<input[^>]+type="password"[^>]+value=/);assert.ok(!html.includes(f.session.token));
  }
});
test('CSRF, duplicated handles, injected roles and unconfirmed approval cannot reach ERP approval',async t=>{
  const f=await fixture(t);
  assert.equal((await f.post('/account/erp-login/continue/',f.context,f.cookie,{Origin:'https://attacker.example.test'})).status,403);
  assert.equal((await f.get(f.landing+'&request_id='+f.context.requestId)).status,400);
  assert.equal((await f.get(f.landing+'&code=secret')).status,400);
  assert.equal((await f.post('/account/erp-login/continue/',{...f.context,role:'admin'})).status,422);
  const inspected=await f.post('/account/erp-login/continue/',f.context),id=inspectionId(await inspected.text());
  assert.equal((await f.post('/account/erp-login/approve/',{inspectionId:id,current:loginTestPassword,confirmed:'yes'},f.otherCookie)).status,403);
  assert.equal((await f.post('/account/erp-login/approve/',{inspectionId:id,current:loginTestPassword,confirmed:'no'})).status,403);
  assert.equal(f.ledger.requests.some(r=>r.action==='LOGIN_APPROVE'),false);
});
test('unknown source approval ACK exposes a same-request recovery form and never a false success redirect',async t=>{
  const f=await fixture(t),inspected=await f.post('/account/erp-login/continue/',f.context),id=inspectionId(await inspected.text());let dropped=false;
  f.ledger.after=(wire,res)=>{if(wire.envelope.action==='LOGIN_APPROVE'&&!dropped){dropped=true;res.destroy();return false;}};
  const unknown=await f.post('/account/erp-login/approve/',{inspectionId:id,current:loginTestPassword,confirmed:'yes'}),html=await unknown.text();
  assert.equal(unknown.status,503);assert.equal(unknown.headers.get('location'),null);assert.match(html,/action="\/account\/erp-login\/status\//);
  assert.ok(!html.includes(loginTestPassword));f.ledger.after=null;
  assert.match(await(await f.get(f.landing)).text(),/action="\/account\/erp-login\/status\//);
  const recovered=await f.post('/account/erp-login/status/',f.context);assert.equal(recovered.status,303);assert.equal(recovered.headers.get('location'),f.request.returnUrl);
  const calls=f.ledger.requests.filter(r=>r.action==='LOGIN_APPROVE');assert.equal(calls.length,2);assert.equal(calls[0].digest,calls[1].digest);
});
test('signed but nonregistered ERP return URLs are rejected before the source password form',async t=>{
  const f=await fixture(t);f.request.returnUrl='https://attacker.example.test/auth/federation/return?request_id='+f.request.requestId;
  const response=await f.post('/account/erp-login/continue/',f.context);assert.equal(response.status,503);assert.equal(response.headers.get('location'),null);
  assert.equal(f.ledger.requests.some(r=>r.action==='LOGIN_APPROVE'),false);assert.ok(!inspectionId(await response.text()));
});
