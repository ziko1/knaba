import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {prepareDatabase} from './harness.mjs';
import {federationPair,within,sitePassword,erpPassword} from './federation-harness.mjs';
import {pkceS256} from '../../erp/packages/integrations/site-federation-login-protocol.mjs';

// No skip mode or synthetic SQL implementation. This gate needs the actual
// PostgreSQL instance plus the current built ERP and packaged VPS artifacts.
let db;
before(async()=>{db=await prepareDatabase();},{timeout:60000});after(async()=>{await db?.close();});
const check=(name,run)=>test(name,{timeout:60000},run);
const cookie=(response,name)=>response.headers.getSetCookie().find(value=>value.startsWith(name+'='))?.split(';')[0];
const sha=value=>createHash('sha256').update(value).digest('hex');
const accepted=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
async function linked(t,options={}){
  const f=await federationPair(t,db,{federationLogin:true,...options}),{pending}=await f.claimCurrent();
  const link=await accepted(await f.confirm(pending),201);return Object.assign(f,{binding:link.binding});
}
async function start(f,{native=false,browserCookie=f.erpCookie}={}){
  const verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url');
  const client=f.loginPolicy.clients.find(row=>row.kind===(native?'NATIVE':'WEB'));
  const input={authorityId:f.config.authorityId,clientId:client.clientId,...(native?{redirectUri:client.redirectUri,state,codeChallenge:pkceS256(verifier),codeChallengeMethod:'S256'}:{})};
  const started=await accepted(await f.erpAt('/api/v1/auth/federation/start',{body:input,cookie:native?'':browserCookie,csrf:'',headers:{'Idempotency-Key':randomUUID()}}));
  assert.equal(started.authorizationUrl,f.config.erpOrigin+'/auth/federation/authorize?request_id='+started.requestId);
  const bound=await f.erpAt('/api/v1/auth/federation/requests/'+started.requestId+'/bind',{body:{},cookie:browserCookie,csrf:''});await accepted(bound);
  const flowCookie=cookie(bound,'__Host-knaba-federation-flow');assert.ok(flowCookie);assert.match(bound.headers.get('set-cookie'),/SameSite=Lax/);
  const combined=[browserCookie,flowCookie].filter(Boolean).join('; ');
  const status=()=>f.erpAt('/api/v1/auth/federation/requests/'+started.requestId,{cookie:combined,csrf:''}).then(value=>accepted(value));
  const pending=await status();assert.equal(pending.state,'BROWSER_BOUND');
  assert.equal(pending.sourceAuthorizationUrl,f.config.siteOrigin+'/account/erp-login/?authority_id='+f.config.authorityId+'&request_id='+started.requestId);
  return {id:started.requestId,client,native,verifier,state,cookie:combined,status};
}
async function approve(f,flow){
  const inspected=await f.sitePost('/account/erp-login/continue/',{authorityId:f.config.authorityId,requestId:flow.id});assert.equal(inspected.status,200);
  const html=await inspected.text(),inspectionId=html.match(/name="inspectionId" value="([a-f0-9-]{36})"/)?.[1];assert.ok(inspectionId);
  const approved=await f.sitePost('/account/erp-login/approve/',{inspectionId,current:sitePassword,confirmed:'yes'});
  return approved;
}
async function ready(f,flow){
  const approval=await approve(f,flow);assert.equal(approval.status,303);assert.equal(approval.headers.get('location'),f.config.erpOrigin+'/auth/federation/return?request_id='+flow.id);
  const current=await flow.status();assert.equal(current.state,'SOURCE_APPROVED');assert.equal(current.erpUserLabel,'Synthetic ERP user');return current;
}
const confirm=(f,flow,current)=>f.erpAt('/api/v1/auth/federation/requests/'+flow.id+'/confirm',{cookie:flow.cookie,csrf:current.csrfToken,body:{expectedVersion:current.version,confirmed:true}});
const redeem=(f,flow,code,verifier=flow.verifier)=>f.erpAt('/api/v1/auth/federation/token',{cookie:'',csrf:'',body:{grantType:'authorization_code',clientId:flow.client.clientId,redirectUri:flow.client.redirectUri,code,codeVerifier:verifier}});
async function noSecrets(f,values){
  const secrets=[...new Set(values.flatMap(value=>/^(KF3|K3C)\.[A-Za-z0-9_-]{43}$/.test(value)?[value,value.slice(4)]:[value]))];
  for(const table of ['site_federation_login_requests','site_federation_session_authorities','site_federation_operations','audit_log','auth_sessions']){
    const serialized=JSON.stringify(await f.row(table));for(const value of secrets)assert.equal(serialized.includes(value),false,'NO_RAW_SECRET_IN_'+table);
  }
  for(const table of ['vps_federation_login_approvals','vps_federation_inbound_operations']){
    const serialized=JSON.stringify(f.site.db.prepare('SELECT * FROM '+table).all());for(const value of secrets)assert.equal(serialized.includes(value),false,'NO_RAW_SECRET_IN_'+table);
  }
}
check('F3 actual WEB login retains current ERP roles and requires a mandatory source session lineage',async t=>{
  const f=await linked(t),users=await f.row('aggregates',"AND kind='user'"),flow=await start(f),current=await ready(f,flow);
  const completed=await confirm(f,flow,current),result=await accepted(completed),sessionCookie=cookie(completed,'knaba_session');
  assert.ok(sessionCookie?.startsWith('knaba_session=KF3.'));assert.match(completed.headers.get('set-cookie'),/SameSite=Strict/);
  assert.equal(result.returnPath,'/console');assert.equal(result.actor.userId,f.erpUser);assert.deepEqual(result.actor.roles,['EMPLOYEE']);
  assert.deepEqual(await f.row('aggregates',"AND kind='user'"),users);
  const lineage=await f.row('site_federation_session_authorities');assert.equal(lineage.length,1);assert.equal(lineage[0].request_id,flow.id);assert.equal(lineage[0].binding_id,f.binding.id);
  assert.equal((await accepted(await f.erpAt('/api/v1/me',{cookie:sessionCookie,csrf:''}))).actor.userId,f.erpUser);
  await noSecrets(f,[sessionCookie.slice('knaba_session='.length),sitePassword,erpPassword]);
  await db.query('DELETE FROM site_federation_session_authorities WHERE company_id=$1 AND id=$2',[f.company,lineage[0].id]);
  assert.equal((await f.erpAt('/api/v1/me',{cookie:sessionCookie,csrf:''})).status,401,'missing child must never fall back to a legacy auth_sessions row');
  assert.equal((await f.erpAt('/api/v1/me')).status,200);assert.deepEqual(f.relay.errors,[]);
});
check('F3 actual native PKCE code rejects a wrong verifier and permits exactly one concurrent redemption',async t=>{
  const f=await linked(t),flow=await start(f,{native:true}),current=await ready(f,flow),confirmed=await confirm(f,flow,current),value=await accepted(confirmed);
  assert.equal(confirmed.headers.getSetCookie().some(value=>value.startsWith('knaba_session=')),false,'native browser must not receive an ERP application session');
  const responseUrl=new URL(value.authorizationResponseUrl),code=responseUrl.searchParams.get('code');assert.match(code,/^K3C\.[A-Za-z0-9_-]{43}$/);
  assert.equal(responseUrl.origin+responseUrl.pathname,flow.client.redirectUri);assert.equal(responseUrl.searchParams.get('state'),flow.state);assert.equal(responseUrl.searchParams.get('iss'),f.loginPolicy.authorizationIssuer);
  assert.equal((await redeem(f,flow,code,randomBytes(32).toString('base64url'))).status,401);assert.equal((await f.row('site_federation_session_authorities')).length,0);
  const results=await Promise.all([redeem(f,flow,code),redeem(f,flow,code)]);assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);
  const success=results.find(row=>row.status===200),sessionCookie=cookie(success,'knaba_session');assert.ok(sessionCookie?.startsWith('knaba_session=KF3.'));
  assert.equal((await f.row('site_federation_session_authorities')).length,1);assert.equal((await f.erpAt('/api/v1/me',{cookie:sessionCookie,csrf:''})).status,200);
  await noSecrets(f,[code,flow.verifier,sessionCookie.slice('knaba_session='.length)]);assert.deepEqual(f.relay.errors,[]);
});
check('F3 actual lost approval ACK recovers one durable intent before any ERP session is issued',async t=>{
  const f=await linked(t),flow=await start(f),dropped=f.relay.dropResponses('LOGIN_APPROVE','SITE_TO_ERP');
  assert.equal((await approve(f,flow)).status,503);assert.equal((await f.row('site_federation_session_authorities')).length,0);
  assert.equal(f.site.db.prepare('SELECT state FROM vps_federation_login_approvals WHERE request_id=?').get(flow.id).state,'CLAIMING');
  dropped.clear();const recovered=await f.sitePost('/account/erp-login/status/',{authorityId:f.config.authorityId,requestId:flow.id});assert.equal(recovered.status,303);
  const calls=f.relay.wire.filter(row=>row.action==='LOGIN_APPROVE');assert.equal(calls.length,2);assert.equal(new Set(calls.map(row=>row.operationId)).size,1);assert.equal(new Set(calls.map(row=>row.bodyHash)).size,1);assert.equal(new Set(calls.map(row=>row.nonce)).size,2);
  assert.equal((await f.row('site_federation_operations',"AND action='LOGIN_APPROVE'")).length,1);
  const current=await flow.status();assert.equal(current.state,'SOURCE_APPROVED');await accepted(await confirm(f,flow,current));assert.equal((await f.row('site_federation_session_authorities')).length,1);assert.deepEqual(f.relay.errors,[]);
});
check('F3 actual source logout rejects an already computed issue proof before the ERP session commit',async t=>{
  const f=await linked(t),flow=await start(f),current=await ready(f,flow),pause=f.relay.pauseNext('INTROSPECT','ERP_TO_SITE');
  const completing=confirm(f,flow,current),proof=await within(pause.entered);assert.equal(proof.sourceActive,true);
  try{assert.equal((await f.sitePost('/logout/',{return_to:'/konto/'})).status,303);assert.equal(f.currentSiteUser(),null);}
  finally{pause.release();}
  assert.equal((await completing).status,401);const delivered=await within(pause.finished);assert.equal(delivered.delivered,true);assert.equal(delivered.callerClosedBeforeReply,false);
  assert.equal((await f.row('site_federation_session_authorities')).length,0);assert.equal((await f.erpAt('/api/v1/me')).status,200);assert.deepEqual(f.relay.errors,[]);
});
check('F3 actual source outage fails closed while local logout completes without source RPC',async t=>{
  const f=await linked(t),flow=await start(f),current=await ready(f,flow),completed=await confirm(f,flow,current),value=await accepted(completed),sessionCookie=cookie(completed,'knaba_session');
  assert.ok(sessionCookie);await f.stopSite();const denied=await f.erpAt('/api/v1/me',{cookie:sessionCookie,csrf:''});assert.ok([401,503].includes(denied.status));
  assert.deepEqual(f.relay.errors,[{code:'SYNTHETIC_RELAY_FAILURE',message:'SYNTHETIC_RELAY_TARGET_NOT_STARTED'}]);
  const before=f.relay.wire.length,errorsBefore=structuredClone(f.relay.errors),logout=await f.erpAt('/api/v1/auth/logout',{cookie:sessionCookie,csrf:value.csrfToken,body:{}});assert.equal(logout.status,201);
  assert.equal(f.relay.wire.length,before);assert.deepEqual(f.relay.errors,errorsBefore);assert.equal(cookie(logout,'knaba_session'),'knaba_session=');
  const hash=sha(sessionCookie.slice('knaba_session='.length)),parents=await f.row('auth_sessions','AND token_hash=$2',[hash]),children=await f.row('site_federation_session_authorities','AND token_hash=$2',[hash]);
  assert.equal(parents.length,1);assert.ok(parents[0].revoked_at);assert.equal(children.length,1);assert.equal(children[0].state,'REVOKED');assert.ok(children[0].revoked_at);
  assert.equal((await f.erpAt('/api/v1/me',{cookie:sessionCookie,csrf:''})).status,401);assert.equal(f.relay.wire.length,before);assert.deepEqual(f.relay.errors,errorsBefore);
});
check('F3 actual self-device mint needs local ERP credentials and terminal unlink revokes the derived session',async t=>{
  const f=await linked(t,{permissions:['identity.self','device.manage','device.self']}),flow=await start(f),current=await ready(f,flow),completed=await confirm(f,flow,current),value=await accepted(completed),sessionCookie=cookie(completed,'knaba_session');
  const command={input:{employeeId:f.erpUser},idempotency_key:randomUUID()};
  const rejected=await f.erpAt('/api/v1/commands/device.enroll',{cookie:sessionCookie,csrf:value.csrfToken,body:command});assert.equal(rejected.status,403);assert.equal((await rejected.json()).code,'LOCAL_ERP_REAUTH_REQUIRED');
  assert.equal((await f.row('aggregates',"AND kind='device_enrollment'")).length,0);
  const local=await f.erpAt('/api/v1/commands/device.enroll',{body:command});assert.equal(local.status,201);assert.equal((await f.row('aggregates',"AND kind='device_enrollment'")).length,1);
  assert.equal((await f.erpWeb('/bindings/'+f.binding.id+'/unlink',{expectedVersion:1,password:erpPassword})).status,201);
  assert.equal((await f.erpAt('/api/v1/me',{cookie:sessionCookie,csrf:''})).status,401);assert.deepEqual(f.relay.errors,[]);
});
check('F3 actual source restart fences old derived sessions while a local ERP password session remains valid',async t=>{
  const f=await linked(t),flow=await start(f),current=await ready(f,flow),completed=await confirm(f,flow,current);await accepted(completed);const sessionCookie=cookie(completed,'knaba_session');
  const before=Number((await f.row('site_federation_authorities'))[0].generation);await f.restartSite();assert.equal(Number((await f.row('site_federation_authorities'))[0].generation),before+1);
  assert.equal((await f.erpAt('/api/v1/me',{cookie:sessionCookie,csrf:''})).status,401);assert.equal((await f.erpAt('/api/v1/me')).status,200);assert.deepEqual(f.relay.errors,[]);
});
check('F3 actual two-company native code cannot be redeemed by the other configured authority',async t=>{
  const a=await linked(t),b=await linked(t),flow=await start(a,{native:true}),current=await ready(a,flow),value=await accepted(await confirm(a,flow,current));
  const code=new URL(value.authorizationResponseUrl).searchParams.get('code');assert.ok(code);
  assert.equal((await redeem(b,flow,code)).status,409);assert.equal((await b.row('site_federation_session_authorities')).length,0);
  await accepted(await redeem(a,flow,code));assert.equal((await a.row('site_federation_session_authorities')).length,1);assert.deepEqual(a.relay.errors,[]);assert.deepEqual(b.relay.errors,[]);
});
