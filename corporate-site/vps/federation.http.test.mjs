import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request as httpRequest} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {createKnabaVpsServer} from './server.mjs';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createSessionForUser} from './auth.mjs';
import {federationCoordinator} from './federation-state.mjs';
import {federationWords} from './federation-ui.mjs';
import {sourceFingerprint} from './federation-snapshot.mjs';
import {testAuthority} from './federation-test-authority.mjs';
import {sessionReference,makeFederationRequest,verifyFederationResponse} from '../../erp/packages/integrations/site-federation-protocol.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const origin='https://site.example.test',password='synthetic-site-password-2026';
async function fixture(t,{enabled=true,enrolled=false}={}){
  const directory=await mkdtemp(join(tmpdir(),'knaba-federation-http-')),dbPath=join(directory,'auth.sqlite');
  const setup=openLocalDatabase(dbPath),owner=createCredentialsUser(setup.db,'owner@example.test',password);
  const user=createCredentialsUser(setup.db,'client@example.test',password),other=createCredentialsUser(setup.db,'other@example.test',password);
  for(const subject of [user,other])setup.db.prepare(`INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation)
    VALUES(?,?,?,'client','client','approved','2026-10-28','2026-11-08','2026-11-08',1,'fixture')`).run(subject.id,'Synthetic '+subject.id.slice(0,4),subject.email);
  const sessions=Object.fromEntries(Object.entries({owner,user,other}).map(([key,subject])=>[key,createSessionForUser(setup.db,subject.id)]));
  const cookies=Object.fromEntries(Object.entries(sessions).map(([key,session])=>[key,'__Host-knaba-session='+session.token]));
  const authority=await testAuthority(t),{config,ledger}=authority,ownerPolicy={ownerEmail:owner.email,ownerUserId:owner.id,developerEmail:''};
  if(enrolled){
    const fingerprint=sourceFingerprint(setup.db,user.id,config,ownerPolicy),ref=sessionReference(config.issuer,user.id,sha(sessions.user.token));
    ledger.principals.set(user.id,{kind:'PRINCIPAL',subject:user.id,epoch:1,minimumEpoch:1,state:'ACTIVE',securityFingerprint:fingerprint,sourcePolicyVersion:1,version:1,fenceOperationId:null});
    ledger.sessions.set(ref,{kind:'SESSION',subject:user.id,sessionRef:ref,epoch:1,securityFingerprint:fingerprint,expiresAt:new Date((Math.floor(Date.now()/1000)+43_200)*1000).toISOString(),state:'ACTIVE',version:1});
  }
  setup.db.close();let app;
  try{
    app=await createKnabaVpsServer({dbPath,origin,ownerEmail:owner.email,ownerUserId:owner.id,host:'127.0.0.1',port:0,localTest:false,
      staticRoot:new URL('../dist/client/',import.meta.url).pathname,workerPath:new URL('../dist/server/index.js',import.meta.url).href,
      accountEmailEnvironment:{},erpIntakeEnvironment:{},federationEnvironment:enabled?{KNABA_FEDERATION_ENABLED:'approved',KNABA_FEDERATION_AUTHORITIES:JSON.stringify([config])}:{},
      federationFetch:authority.fetchImpl});
  }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const at=(path,{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{
    const request=httpRequest({host:'127.0.0.1',port:app.port,path,method,headers:{Host:'site.example.test','X-Forwarded-Proto':'https',...headers}},response=>{
      const chunks=[];response.on('data',part=>chunks.push(part));response.on('error',reject);response.on('end',()=>{
        const headers=new Headers();for(let i=0;i<response.rawHeaders.length;i+=2)headers.append(response.rawHeaders[i],response.rawHeaders[i+1]);
        resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers}));
      });
    });request.on('error',reject);request.setTimeout(15_000,()=>request.destroy(Error('Synthetic federation timeout')));request.end(body);
  });
  const post=(path,values,cookie=cookies.user,extra={})=>at(path,{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/x-www-form-urlencoded',Cookie:cookie,...extra},body:new URLSearchParams(values).toString()});
  const get=(path,cookie=cookies.user)=>at(path,{headers:cookie?{Cookie:cookie}:{}});
  const role=(input,cookie=cookies.owner)=>at('/api/portal/roles',{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin',Cookie:cookie,'Content-Type':'application/json','X-Knaba-Request':'portal-v1'},body:JSON.stringify(input)});
  return {app,at,post,get,role,owner,user,other,sessions,cookies,...authority};
}
const inspectionId=html=>html.match(/name="inspectionId" value="([a-f0-9-]{36})"/)?.[1];

test('F2 is disabled by default without outbound authority traffic and never exposes an introspection endpoint',async t=>{
  const f=await fixture(t,{enabled:false});
  assert.equal((await f.get('/account/erp-link/')).status,503);
  assert.equal((await f.at('/api/federation/introspect',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
  assert.equal(f.ledger.requests.length,0);
  const settings=await(await f.get('/account/settings/')).text();assert.ok(!settings.includes('/account/erp-link/'));
});

test('packaged VPS link flow requires both-account confirmation and signs a current source proof',async t=>{
  const f=await fixture(t);
  f.app.db.prepare('UPDATE profiles SET name=? WHERE id=?').run('A'.repeat(160),f.user.id);
  const inspected=await f.post('/account/erp-link/inspect/?lang=uk',{authority:f.config.authorityId,code:f.code});assert.equal(inspected.status,200);
  const html=await inspected.text(),id=inspectionId(html);assert.ok(id);assert.match(html,/Synthetic ERP User/);assert.match(html,/Synthetic Company/);assert.ok(html.includes(f.user.email));
  assert.ok(!html.includes(f.code)&&!html.includes(password));assert.match(html,/name="confirmed" value="yes" required/);
  const claimed=await f.post('/account/erp-link/claim/?lang=uk',{inspectionId:id,current:password,confirmed:'yes'});assert.equal(claimed.status,200);
  assert.equal(f.ledger.requests.find(row=>row.action==='CLAIM').payload.siteLabel,'A'.repeat(120));
  assert.equal(f.app.db.prepare('SELECT name FROM profiles WHERE id=?').get(f.user.id).name.length,160,'stored profile is unchanged');
  const claimHtml=await claimed.text();assert.ok(claimHtml.includes(federationWords('uk').waiting));assert.match(claimHtml,/href="https:\/\/erp\.example\.test\/account\/site-links"/);
  const claim=[...f.ledger.challenges.values()][0],p=f.ledger.principals.get(f.user.id),ref=sessionReference(f.config.issuer,f.user.id,sha(f.sessions.user.token));
  const request=makeFederationRequest(f.config,'ERP_TO_SITE','INTROSPECT',{subject:f.user.id,sessionRef:ref,epoch:p.epoch,securityFingerprint:p.securityFingerprint,
    sourcePolicyVersion:1,challengeId:claim.challengeId,purpose:'LINK_CONFIRM'},{generation:f.ledger.generation});
  const response=await f.at('/api/federation/introspect',{method:'POST',headers:request.headers,body:request.body}),bytes=Buffer.from(await response.arrayBuffer());
  const proof=verifyFederationResponse(f.config,request.context,response.status,response.headers,bytes);
  assert.equal(proof.active,true);assert.equal(proof.subject,f.user.id);assert.equal(proof.sessionRef,ref);
  assert.equal(proof.siteLabel,'A'.repeat(120));
  assert.ok(!bytes.toString().includes(f.sessions.user.token));assert.equal(response.headers.get('set-cookie'),null);
  const replay=await f.at('/api/federation/introspect',{method:'POST',headers:request.headers,body:request.body});assert.equal(replay.status,409);
  assert.match(response.headers.get('cache-control'),/no-store/);
});

test('private link and reauthentication pages preserve all six locales without secrets in returned forms',async t=>{
  const f=await fixture(t);
  for(const lang of ['de','en','pl','lt','ru','uk']){
    const response=await f.get('/account/erp-link/?lang='+lang),html=await response.text();assert.equal(response.status,200);
    assert.ok(html.includes('<html lang="'+lang+'"'));assert.ok(html.includes(federationWords(lang).title));
    assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('x-frame-options'),'DENY');
    const reauth=await f.get('/account/erp-link/reauth/?lang='+lang),body=await reauth.text();assert.equal(reauth.status,200);
    assert.ok(body.includes(federationWords(lang).reauthTitle));assert.ok(!body.includes(password));assert.doesNotMatch(body,/<input[^>]+type="password"[^>]+value=/);
  }
});

test('a second current account cannot claim an inspection made by the first account',async t=>{
  const f=await fixture(t),page=await f.post('/account/erp-link/inspect/',{authority:f.config.authorityId,code:f.code});
  const id=inspectionId(await page.text());assert.ok(id);
  const response=await f.post('/account/erp-link/claim/',{inspectionId:id,current:password,confirmed:'yes'},f.cookies.other);
  assert.equal(response.status,403);assert.equal(f.ledger.requests.filter(x=>x.action==='CLAIM').length,0);
  assert.equal(f.app.db.prepare('SELECT count(*) n FROM vps_federation_claims').get().n,0);
});

test('CSRF, duplicate fields, secret URLs, and missing explicit confirmation cannot send a claim',async t=>{
  const f=await fixture(t);
  assert.equal((await f.post('/account/erp-link/inspect/',{authority:f.config.authorityId,code:f.code},f.cookies.user,{Origin:'https://attacker.example.test'})).status,403);
  assert.equal((await f.get('/account/erp-link/?code='+f.code)).status,400);
  assert.equal((await f.post('/account/erp-link/inspect/',[['authority',f.config.authorityId],['code',f.code],['code',f.code]])).status,422);
  const page=await f.post('/account/erp-link/inspect/',{authority:f.config.authorityId,code:f.code}),id=inspectionId(await page.text());
  assert.equal((await f.post('/account/erp-link/claim/',{inspectionId:id,current:password,confirmed:'no'})).status,403);
  assert.equal(f.ledger.requests.filter(x=>x.action==='CLAIM').length,0);
});

test('real owner setRole fences the target principal independent of the initiator enrollment',async t=>{
  const f=await fixture(t,{enrolled:true}),input={userId:f.user.id,role:'client',status:'suspended',version:1};
  const stale=await f.role(input);assert.equal(stale.status,403);assert.equal((await stale.json()).error.code,'reauth_required');
  assert.equal(f.ledger.requests.filter(x=>x.action==='FENCE').length,0);
  assert.equal((await f.post('/account/erp-link/reauth/',{current:password},f.cookies.owner)).status,200);
  const changed=await f.role(input);assert.equal(changed.status,200);assert.equal((await changed.json()).profile.status,'suspended');
  assert.equal(f.ledger.principals.get(f.user.id).state,'FENCED');
  assert.equal(f.app.db.prepare('SELECT count(*) n FROM vps_sessions WHERE user_id=?').get(f.user.id).n,0);
  assert.equal(f.ledger.principals.has(f.owner.id),false);
});

test('a logout with unknown global ACK clears the browser cookie but returns explicit pending, never success',async t=>{
  const f=await fixture(t,{enrolled:true});let once=true;
  f.ledger.after=(wire,res)=>{if(once&&wire.envelope.action==='FENCE'){once=false;res.destroy();return false;}};
  const reply=await f.post('/logout/?lang=en',{return_to:'/konto/'});assert.equal(reply.status,503);
  const html=await reply.text();assert.ok(html.includes(federationWords('en').pending));assert.ok(!html.includes(federationWords('en').disabled));
  assert.match(reply.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal(f.app.db.prepare('SELECT state FROM vps_federation_operations').get().state,'PENDING_DENY');
  const results=await federationCoordinator(f.app.db).resumePending();assert.equal(results[0].state,'COMPLETE');
  assert.equal(f.app.db.prepare('SELECT count(*) n FROM vps_sessions WHERE user_id=?').get(f.user.id).n,0);
});

test('same-session reauthentication does not grant a role or accept a different supplied user ID',async t=>{
  const f=await fixture(t);
  const bad=await f.post('/account/erp-link/reauth/',{current:password,userId:f.owner.id});assert.equal(bad.status,422);
  const good=await f.post('/account/erp-link/reauth/',{current:password});assert.equal(good.status,200);
  assert.equal(f.app.db.prepare('SELECT role FROM profiles WHERE id=?').get(f.user.id).role,'client');
  assert.equal(f.app.db.prepare('SELECT user_id FROM vps_federation_reauth').get().user_id,f.user.id);
  assert.equal(f.ledger.requests.filter(x=>['REGISTER_SESSION','CLAIM','FENCE'].includes(x.action)).length,0);
});

test('a failed federation issuance returns structured JSON to the existing login dialog without setting a cookie',async t=>{
  const f=await fixture(t,{enrolled:true});
  f.ledger.before=wire=>{if(wire.envelope.action==='LOOKUP_PRINCIPAL')throw Object.assign(Error('synthetic unavailable'),{code:'FEDERATION_UNAVAILABLE'});};
  const reply=await f.post('/login/',{email:f.user.email,password,return_to:'/konto/'},'',{Accept:'application/json'});
  assert.equal(reply.status,503);assert.match(reply.headers.get('content-type'),/^application\/json/);
  assert.deepEqual(await reply.json(),{error:{code:'federation_pending'}});
  assert.equal(reply.headers.get('set-cookie'),null);assert.match(reply.headers.get('cache-control'),/no-store/);
});

test('authenticated malformed introspection returns a nonce-bound signed error and never calls ERP',async t=>{
  const f=await fixture(t),before=f.ledger.requests.length;
  const request=makeFederationRequest(f.config,'ERP_TO_SITE','INTROSPECT',{unexpected:'private-field'},{generation:f.ledger.generation});
  const response=await f.at('/api/federation/introspect',{method:'POST',headers:request.headers,body:request.body});
  assert.equal(response.status,400);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.deepEqual(verifyFederationResponse(f.config,request.context,response.status,response.headers,bytes),{ok:false,error:{code:'VALIDATION_ERROR'}});
  assert.equal(f.ledger.requests.length,before);assert.ok(!bytes.toString().includes('private-field'));
  const base={subject:f.user.id,sessionRef:'a'.repeat(43),epoch:1,securityFingerprint:'b'.repeat(64),sourcePolicyVersion:1,challengeId:randomUUID(),purpose:'LINK_CONFIRM'};
  for(const invalid of [{subject:'contains space'},{subject:'a'.repeat(129)},{subject:'é'.repeat(65)},{epoch:2147483648},{epoch:1.5}]){
    const packet=makeFederationRequest(f.config,'ERP_TO_SITE','INTROSPECT',{...base,...invalid},{generation:f.ledger.generation});
    const rejected=await f.at('/api/federation/introspect',{method:'POST',headers:packet.headers,body:packet.body});
    assert.equal(rejected.status,400,JSON.stringify(invalid));
    assert.deepEqual(verifyFederationResponse(f.config,packet.context,rejected.status,rejected.headers,Buffer.from(await rejected.arrayBuffer())),{ok:false,error:{code:'VALIDATION_ERROR'}});
  }
  for(const valid of [{subject:'a'.repeat(128)},{subject:'é'.repeat(64)},{epoch:2147483647}]){
    const packet=makeFederationRequest(f.config,'ERP_TO_SITE','INTROSPECT',{...base,...valid},{generation:f.ledger.generation});
    const inactive=await f.at('/api/federation/introspect',{method:'POST',headers:packet.headers,body:packet.body});
    assert.equal(inactive.status,200);assert.deepEqual(verifyFederationResponse(f.config,packet.context,inactive.status,inactive.headers,Buffer.from(await inactive.arrayBuffer())),{active:false});
  }
  assert.equal(f.ledger.requests.length,before);
});

test('an owner session revoked while the target fence is in flight cannot apply a profile grant',async t=>{
  const f=await fixture(t,{enrolled:true});
  assert.equal((await f.post('/account/erp-link/reauth/',{current:password},f.cookies.owner)).status,200);
  let changed=false;
  f.ledger.before=wire=>{if(!changed&&wire.envelope.action==='FENCE'&&wire.envelope.payload.subject===f.user.id){
    changed=true;f.app.db.prepare('DELETE FROM vps_sessions WHERE token_hash=?').run(sha(f.sessions.owner.token));
  }};
  const response=await f.role({userId:f.user.id,role:'admin',status:'approved',version:1});
  assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:{code:'forbidden'}},'the existing response fence withholds target details from the revoked actor');
  assert.equal(f.app.db.prepare('SELECT role FROM profiles WHERE id=?').get(f.user.id).role,'client');
  assert.equal(f.app.db.prepare('SELECT state,outcome FROM vps_federation_operations WHERE subject=?').get(f.user.id).state,'ABORTED_FENCED');
  assert.equal(f.app.db.prepare('SELECT count(*) n FROM vps_sessions WHERE user_id=?').get(f.user.id).n,0);
  assert.equal(f.ledger.requests.filter(row=>row.action==='ACTIVATE_EPOCH').length,0);
});
