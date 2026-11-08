import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {prepareDatabase,root} from './harness.mjs';
import {Engine} from '../../erp/apps/api/engine.ts';
import {createApiModule} from '../../erp/apps/api/http.ts';
import {SiteIdentityFlow} from '../../erp/apps/api/site-identity-flow.ts';
import {installSiteIdentityPages} from '../../erp/apps/api/site-identity-pages.ts';
import {hashPassword,hashToken,csrfFor,sealSecret} from '../../erp/apps/api/auth.ts';
import {identityCommands} from '../../erp/packages/domain/identity.ts';
import {createKnabaVpsServer} from '../../corporate-site/vps/server.mjs';
import {createCredentialsUser,createSessionForUser,destroySession} from '../../corporate-site/vps/auth.mjs';
import {parsePeerConfig,digest} from '../../corporate-site/vps/site-identity-protocol.mjs';
import {peerRequest} from '../../erp/packages/integrations/site-identity-protocol.mjs';

const require=createRequire(new URL('../../erp/package.json',import.meta.url));
const {NestFactory}=require('@nestjs/core'),express=require('express'),OTPAuth=require('otpauth');
const password='Synthetic-F2-current-password-2026',encryptionKey='SYNTHETIC_F2_SECRET_SEALING_KEY_0123456789';
let db,passwordHash,sourceSha;
before(async()=>{db=await prepareDatabase();passwordHash=await hashPassword(password);sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();},{timeout:60000});
after(async()=>{await db?.close();});
const check=(name,fn)=>test('F2 '+name,{timeout:30000},fn);
const success=(result,step='request')=>{assert.ok([200,201].includes(result.status),step+' rejected: '+(result.body?.code??result.status));return result.body;};
const denied=(result,status,code)=>{
 assert.equal(result.status,status,'request must fail through the expected guard');
 assert.equal(result.body?.code,code,'an unrelated error must not count as an authorization denial');
};
const count=async(company,table,clause='')=>(await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE company_id=$1 ${clause}`,[company])).rows[0].n;
async function unusedPort(){const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;}

/** Actual Nest routes + PostgreSQL + VPS server/SQLite + signed loopback HTTP.
 * Cookies are supplied by the test HTTP client; this is not browser/Strict-cookie
 * or production TLS/provider acceptance. All identities, credentials and faults
 * below are isolated synthetic fixtures, never live accounts.
 */
async function fixture(t,{siteEmail='user-b@example.test',siteId}={}){
 const company='identity_f2_'+randomUUID(),dir=await mkdtemp(join(tmpdir(),'knaba-f2-http-'));
 const hooks={beforeQuery:null,afterQuery:null,beforePeer:null,afterPeer:null,redeems:0};
 const proxy={
  query:async(sql,params)=>{const result=await db.query(sql,params);if(hooks.afterQuery)await hooks.afterQuery(sql,params,result,null);return result;},
  transaction:(companyId,actorId,operation,timeout,readOnly)=>db.transaction(companyId,actorId,async tx=>{
   const original=tx.query.bind(tx);
   tx.query=async(sql,params=[])=>{if(hooks.beforeQuery)await hooks.beforeQuery(sql,params,tx,original);const result=await original(sql,params);if(hooks.afterQuery)await hooks.afterQuery(sql,params,result,original);return result;};
   return operation(tx);
  },timeout,readOnly)
 };
 await db.transaction(company,'SYNTHETIC_SETUP',async tx=>{
  await tx.add('company',{name:'Synthetic F2 company',active:true},company);
  for(const id of ['user-a','user-b']){await tx.add('user',{name:'Synthetic '+id,email:id+'@example.test',active:true,roles:['CLIENT'],permissions:['identity.self'],siteIds:[],warehouseIds:[],synthetic:true},id);
   await tx.query('INSERT INTO auth_credentials(company_id,user_id,password_hash) VALUES($1,$2,$3)',[company,id,passwordHash]);}
 });
 const runtime={db:proxy,engine:new Engine(proxy,'TEST'),companyId:company,appMode:'TEST',buildSha:sourceSha,encryptionKey,publicOrigin:undefined};
 Object.assign(runtime.engine.registry,identityCommands);
 let peer=null,app,site;
 runtime.siteIdentity=new SiteIdentityFlow(proxy,runtime.engine,runtime,()=>peer,async(...args)=>{
  if(args[2].endsWith('/redeem'))hooks.redeems++;
  if(hooks.beforePeer)await hooks.beforePeer(...args);
  const result=await peerRequest(...args);if(hooks.afterPeer)await hooks.afterPeer(args,result);return result;
 });
 t.after(async()=>{
  try{site?.server.closeAllConnections();await site?.close();}
  finally{try{app?.getHttpServer()?.closeAllConnections();await app?.close();}finally{await rm(dir,{recursive:true,force:true});}}
 });
 app=await NestFactory.create(createApiModule(runtime),{bodyParser:false,logger:false});
 const server=app.getHttpAdapter().getInstance();
 installSiteIdentityPages(server);
 app.use(express.json({limit:'8kb',verify:(req,_res,bytes)=>{req.rawBody=bytes;}}));
 await app.init();await app.listen(0,'127.0.0.1');
 const erpOrigin='http://127.0.0.1:'+app.getHttpServer().address().port;
 runtime.publicOrigin=erpOrigin;
 const sitePort=await unusedPort(),siteOrigin='http://127.0.0.1:'+sitePort;
 site=await createKnabaVpsServer({dbPath:join(dir,'site.sqlite'),staticRoot:join(root,'corporate-site/dist/client'),workerPath:new URL('../../corporate-site/dist/server/index.js',import.meta.url).href,
  origin:siteOrigin,localTest:true,host:'127.0.0.1',port:sitePort,oidcConfig:{},erpIntakeEnvironment:{},erpIntakeSchedulerFactory:()=>({stop:async()=>{}}),siteIdentityConfig:()=>peer});
 const base={companyId:company,issuer:'https://synthetic-site.example.test/identity-v1',audience:'knaba-f2-erp',version:1,active:true,erpOrigin,siteOrigin,
  keyId:'knaba-federation-f2-test',secret:randomBytes(32).toString('base64url')};
 peer=parsePeerConfig(base,{localTest:true});
 const siteUser=createCredentialsUser(site.db,siteEmail,'Synthetic-site-password-2026');
 if(siteId){site.db.prepare('UPDATE vps_users SET id=? WHERE id=?').run(siteId,siteUser.id);siteUser.id=siteId;}
 const now=new Date().toISOString();
 site.db.prepare('INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES(?,?,?,?,?,?,?,?,?,1,?)')
  .run(siteUser.id,'Synthetic site account',siteEmail,'client','client','approved','synthetic-v1',now,now,'synthetic-f2-fixture');
 const siteSession=createSessionForUser(site.db,siteUser.id);let siteCookie='__Host-knaba-session='+siteSession.token,siteCsrf='';
 async function wire(origin,path,body,headers={}){const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(10000)});return {status:response.status,body:await response.json(),headers:response.headers};}
 async function login(id='user-a'){const result=await wire(erpOrigin,'/api/v1/auth/login',{email:id+'@example.test',password});const value=success(result,'ERP login');return {id,cookie:result.headers.get('set-cookie').split(';')[0],csrf:value.csrfToken};}
 const a=await login();
 const erp=(path,body,identity=a,headers={})=>wire(erpOrigin,'/api/v1/'+path,body,{Cookie:identity.cookie,'x-csrf-token':identity.csrf,...headers});
 const siteCall=(path,body,headers={})=>wire(siteOrigin,path,body,{Cookie:siteCookie,'x-csrf-token':siteCsrf,'x-knaba-request':'site-identity-v1',...headers});
 async function siteState(){const result=success(await siteCall('/auth/site-identity/session'),'site session');siteCsrf=result.csrfToken;return result;}
 await siteState();
 async function begin(identity=a,extra={}){const result=success(await erp('auth/site-links/challenges',{password,...extra},identity),'begin');return new URLSearchParams(new URL(result.redirectUrl).hash.slice(1)).get('link');}
 async function consent(challengeToken){const preview=success(await siteCall('/auth/site-identity/preview',{challengeToken}),'site preview');
  const result=success(await siteCall('/auth/site-identity/consent',{challengeToken,previewProof:preview.previewProof,confirmed:true}),'site consent');
  return new URLSearchParams(new URL(result.redirectUrl).hash.slice(1)).get('grant');}
 async function prepared(identity=a){const challengeToken=await begin(identity),grantToken=await consent(challengeToken),input={challengeToken,grantToken};
  const preview=success(await erp('auth/site-links/preview',input,identity),'ERP preview');return {input,preview,confirm:()=>erp('auth/site-links/confirm',{...input,confirmed:true},identity)};}
 return {company,site,siteUser,siteSession,a,hooks,runtime,erpOrigin,siteOrigin,erp,siteCall,siteState,login,begin,consent,prepared,
  get peer(){return peer;},setPeer(patch){peer=patch===null?null:parsePeerConfig({...peer,...patch},{localTest:true});},
  setSiteCookie(value){siteCookie=value;},
  async bindings(){return (await db.query('SELECT * FROM site_identity_bindings WHERE company_id=$1 ORDER BY generation',[company])).rows;},
  async currentCredential(){return (await db.query('SELECT * FROM auth_credentials WHERE company_id=$1 AND user_id=$2',[company,'user-a'])).rows[0];},
  siteAudits(action){return site.db.prepare('SELECT count(*) AS n FROM portal_audit WHERE action=?').get(action).n;}
 };
}

check('links the two explicitly confirmed accounts despite a different equal-email ERP account; no grants or sessions are created',async t=>{
 const f=await fixture(t),before=(await db.query("SELECT id,data FROM aggregates WHERE company_id=$1 AND kind='user' ORDER BY id",[f.company])).rows;
 const pending=await f.prepared();assert.equal(pending.preview.user.id,'user-a');assert.equal(pending.preview.site.subject,f.siteUser.id);assert.equal(pending.preview.site.email,'user-b@example.test');
 const result=success(await pending.confirm(),'confirm');assert.equal(result.binding.status,'ACTIVE');assert.equal(result.binding.generation,1);
 assert.equal((await f.bindings())[0].user_id,'user-a');assert.equal(await count(f.company,'auth_sessions'),1);assert.equal(await count(f.company,'aggregates',"AND kind='customer_membership'"),0);
 assert.deepEqual((await db.query("SELECT id,data FROM aggregates WHERE company_id=$1 AND kind='user' ORDER BY id",[f.company])).rows,before);
 assert.equal(f.siteAudits('site_identity.consented'),1);assert.equal(f.siteAudits('site_identity.redeemed'),1);
 const stored=JSON.stringify((await db.query('SELECT * FROM site_identity_challenges WHERE company_id=$1',[f.company])).rows);
 for(const secret of [pending.input.challengeToken,pending.input.grantToken,password,f.siteSession.token,f.peer.secret])assert.equal(stored.includes(secret),false,'raw credential must not be persisted');
 assert.equal(success(await f.erp('auth/site-links/status',pending.input)).binding.id,result.binding.id);
});

check('neutral GET pages serve no private account data and never mutate or consume a challenge',async t=>{
 const f=await fixture(t);
 for(const [origin,path]of [[f.erpOrigin,'/account/site-link/'],[f.siteOrigin,'/account/erp/']]){
  const response=await fetch(origin+path,{signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);assert.equal(response.headers.get('referrer-policy'),'no-referrer');const body=await response.text();
  assert.ok(body.includes('KNABA DE'));assert.ok(!body.includes(f.siteUser.id)&&!body.includes('user-a@example.test'));
 }
 assert.equal(await count(f.company,'site_identity_challenges'),0);assert.equal((await f.bindings()).length,0);
 const get=await fetch(f.erpOrigin+'/api/v1/auth/site-links/confirm',{signal:AbortSignal.timeout(10000)});assert.equal(get.status,404);await get.body?.cancel();
});

check('requires cookie CSRF, password and human credentials; caller-selected company or device/guest authority is rejected',async t=>{
 const f=await fixture(t);
 for(const [body,headers,status,code]of [
  [{password},{'x-csrf-token':'wrong'},403,'ACCESS_DENIED'],
  [{password},{Origin:'https://foreign.example.test'},403,'ACCESS_DENIED'],
  [{password},{Authorization:'Bearer '+randomBytes(32).toString('base64url')},401,'NEEDS_REAUTH'],
  [{password,companyId:'foreign'},{},400,'VALIDATION_ERROR'],
  [{password:'incorrect'},{},401,'NEEDS_REAUTH']
 ])denied(await f.erp('auth/site-links/challenges',body,f.a,headers),status,code);
 const guestToken=randomBytes(32).toString('base64url');
 await db.transaction(f.company,'SYNTHETIC_SETUP',async tx=>{await tx.add('user',{active:true,guest:true,roles:['GUEST','CLIENT']},'guest');await tx.query('INSERT INTO auth_sessions(token_hash,user_id,company_id,expires_at,mfa_verified) VALUES($1,$2,$3,clock_timestamp()+interval \'1 hour\',false)',[hashToken(guestToken),'guest',f.company]);});
 denied(await f.erp('auth/site-links/challenges',{password},{cookie:'knaba_session='+guestToken,csrf:csrfFor(guestToken)}),401,'NEEDS_REAUTH');
 assert.equal(await count(f.company,'site_identity_challenges'),0);
});

check('rejects another ERP session/target, cross-challenge grant substitution and missing explicit confirmation',async t=>{
 const f=await fixture(t),first=await f.prepared(),other=await f.login('user-b');
 denied(await f.erp('auth/site-links/confirm',{...first.input,confirmed:true},other),403,'ACCESS_DENIED');
 // Unsigned peer refusal is deliberately exposed as dependency failure; its
 // response body is not trusted as an authenticated ERP authorization result.
 const second=await f.prepared();denied(await f.erp('auth/site-links/confirm',{challengeToken:first.input.challengeToken,grantToken:second.input.grantToken,confirmed:true}),503,'DEPENDENCY_UNAVAILABLE');
 denied(await f.erp('auth/site-links/confirm',first.input),400,'VALIDATION_ERROR');
 assert.equal((await f.bindings()).length,0);success(await first.confirm());assert.equal((await f.bindings()).length,1);
});

check('ERP logout before site consent invalidates the original challenge even with a new login',async t=>{
 const f=await fixture(t),challengeToken=await f.begin();success(await f.erp('auth/logout',{}));
 const fresh=await f.login();denied(await f.siteCall('/auth/site-identity/preview',{challengeToken}),503,'DEPENDENCY_UNAVAILABLE');
 denied(await f.erp('auth/site-links/preview',{challengeToken,grantToken:randomUUID()+'.'+randomBytes(32).toString('base64url')},fresh),403,'ACCESS_DENIED');
 assert.equal((await f.bindings()).length,0);
});

check('site logout before redemption denies the binding and leaves ERP challenge unconsumed',async t=>{
 const f=await fixture(t),pending=await f.prepared();destroySession(f.site.db,'__Host-knaba-session='+f.siteSession.token);
 denied(await pending.confirm(),503,'DEPENDENCY_UNAVAILABLE');assert.equal((await f.bindings()).length,0);
 assert.equal((await db.query('SELECT status FROM site_identity_challenges WHERE company_id=$1',[f.company])).rows[0].status,'PREVIEWED');
});

check('profile suspension or changed profile revision between preview and confirmation is denied',async t=>{
 const f=await fixture(t),pending=await f.prepared();f.site.db.prepare("UPDATE profiles SET status='suspended',version=version+1 WHERE id=?").run(f.siteUser.id);
 denied(await pending.confirm(),503,'DEPENDENCY_UNAVAILABLE');assert.equal((await f.bindings()).length,0);
 f.site.db.prepare("UPDATE profiles SET status='approved',version=version+1 WHERE id=?").run(f.siteUser.id);
 denied(await pending.confirm(),503,'DEPENDENCY_UNAVAILABLE');assert.equal((await f.bindings()).length,0);
});

check('current ERP password rotation revokes the original session and prevents final confirmation',async t=>{
 const f=await fixture(t),pending=await f.prepared();const actor=await f.runtime.engine.getActor('user-a',f.company);
 await f.runtime.engine.execute(actor,'user.password.rotate',{input:{currentPassword:password,newPassword:'Synthetic-new-password-2026'},idempotency_key:randomUUID()});
 denied(await pending.confirm(),401,'NEEDS_REAUTH');assert.equal((await f.bindings()).length,0);
});

check('credential revision changing after scrypt input is read cannot create a fresh challenge',async t=>{
 const f=await fixture(t);let changed=false;
 f.hooks.afterQuery=async(sql,_params,_result,original)=>{
  if(!original&&!changed&&sql==='SELECT password_hash,totp_secret FROM auth_credentials WHERE company_id=$1 AND user_id=$2'){
   changed=true;await db.query('UPDATE auth_credentials SET password_hash=$3 WHERE company_id=$1 AND user_id=$2',[f.company,'user-a',await hashPassword('Synthetic-rotated-during-proof-2026')]);
  }
 };
 denied(await f.erp('auth/site-links/challenges',{password}),401,'NEEDS_REAUTH');assert.equal(changed,true);assert.equal(await count(f.company,'site_identity_challenges'),0);
});

check('privileged link proof requires fresh MFA; a consumed TOTP cannot begin another challenge',async t=>{
 const f=await fixture(t),secret='JBSWY3DPEHPK3PXP';
 await db.transaction(f.company,'SYNTHETIC_SETUP',async tx=>{const user=await tx.get('user','user-a');await tx.save(user,{...user.data,roles:['OWNER'],mfaRequired:true});await tx.query('UPDATE auth_credentials SET totp_secret=$3 WHERE company_id=$1 AND user_id=$2',[f.company,'user-a',sealSecret(secret,encryptionKey)]);});
 denied(await f.erp('auth/site-links/challenges',{password}),401,'NEEDS_REAUTH');
 const otp=new OTPAuth.TOTP({issuer:'KNABA DE',algorithm:'SHA1',digits:6,period:30,secret:OTPAuth.Secret.fromBase32(secret)}).generate();
 success(await f.erp('auth/site-links/challenges',{password,otp}));denied(await f.erp('auth/site-links/challenges',{password,otp}),401,'NEEDS_REAUTH');
 assert.equal(await count(f.company,'site_identity_challenges'),1);
});

check('simultaneous confirmations yield one binding and one audit with an exact replay receipt',async t=>{
 const f=await fixture(t),pending=await f.prepared(),results=await Promise.all([pending.confirm(),pending.confirm()]);const bodies=results.map(result=>success(result));
 assert.equal(new Set(bodies.map(body=>body.binding.id)).size,1);assert.deepEqual(bodies.map(body=>body.replayed).sort(),[false,true]);
 assert.equal(await count(f.company,'audit_log',"AND action='SITE_IDENTITY_LINK_RECORDED'"),1);assert.equal(f.siteAudits('site_identity.redeemed'),1);assert.equal(f.hooks.redeems,1);
});

check('PostgreSQL-raised synthetic 40001 after site redemption retries the same grant and commits exactly once',async t=>{
 const f=await fixture(t),pending=await f.prepared();let injected=false;
 f.hooks.afterQuery=async(sql,_params,_result,original)=>{if(original&&!injected&&sql.includes("'SITE_IDENTITY_LINK_RECORDED'")){injected=true;await original("DO $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_SERIALIZATION_RETRY' USING ERRCODE='40001'; END $$");}};
 success(await pending.confirm());assert.equal(injected,true);assert.equal(f.hooks.redeems,2);assert.equal((await f.bindings()).length,1);
 assert.equal(await count(f.company,'audit_log',"AND action='SITE_IDENTITY_LINK_RECORDED'"),1);assert.equal(f.siteAudits('site_identity.redeemed'),1);
});

check('real audit SQL failure rolls back binding and challenge; the durable site grant can retry safely',async t=>{
 const f=await fixture(t),pending=await f.prepared();let injected=false;
 f.hooks.beforeQuery=async(sql,_params,_tx,original)=>{if(!injected&&sql.includes("'SITE_IDENTITY_LINK_RECORDED'")){injected=true;await original('SELECT 1 / 0');}};
 denied(await pending.confirm(),500,'INTERNAL_ERROR');assert.equal(injected,true);assert.equal((await f.bindings()).length,0);assert.equal(f.siteAudits('site_identity.redeemed'),1);
 assert.equal((await db.query('SELECT status FROM site_identity_challenges WHERE company_id=$1',[f.company])).rows[0].status,'PREVIEWED');
 success(await pending.confirm());assert.equal((await f.bindings()).length,1);assert.equal(f.siteAudits('site_identity.redeemed'),1);
});

check('subsecond configuration expiry is retained exactly in the consent snapshot',async t=>{
 const f=await fixture(t);const expiry=Math.floor(Date.now()/1000)*1000+12_437;f.setPeer({expiresAt:new Date(expiry).toISOString()});
 const pending=await f.prepared();assert.equal(pending.preview.expiresAt,expiry);success(await pending.confirm());
});

check('known short site-session expiry between redeem and ERP commit rolls the binding back',async t=>{
 const f=await fixture(t);f.site.db.prepare('UPDATE vps_sessions SET expires_at=? WHERE token_hash=?').run(Math.floor(Date.now()/1000)+3,digest(f.siteSession.token));
 const pending=await f.prepared();let delayed=false;
 f.hooks.afterPeer=async(args,result)=>{if(args[2].endsWith('/redeem')){delayed=true;await delay(Math.max(0,result.expiresAt-Date.now()+25));}};
 denied(await pending.confirm(),400,'CALLBACK_EXPIRED');assert.equal(delayed,true);assert.equal((await f.bindings()).length,0);
 assert.equal(await count(f.company,'audit_log',"AND action='SITE_IDENTITY_LINK_RECORDED'"),0);
});

check('trust/key rotation after online redemption denies and rolls back ERP state',async t=>{
 const f=await fixture(t),pending=await f.prepared();f.hooks.afterPeer=async args=>{if(args[2].endsWith('/redeem'))f.setPeer({secret:randomBytes(32).toString('base64url')});};
 denied(await pending.confirm(),403,'ACCESS_DENIED');assert.equal((await f.bindings()).length,0);
});

check('lost HTTP acknowledgement recovers the committed binding without another write, even if the peer is disabled',async t=>{
 const f=await fixture(t),pending=await f.prepared();let committed=false;
 const proxy=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await fetch(f.erpOrigin+'/api/v1/auth/site-links/confirm',{
  method:'POST',headers:{Origin:f.erpOrigin,Cookie:f.a.cookie,'content-type':'application/json','x-csrf-token':f.a.csrf},body:Buffer.concat(chunks),signal:AbortSignal.timeout(10000)});const result=await response.json();assert.equal(result.binding.status,'ACTIVE');committed=true;res.destroy();}catch{res.destroy();}});
 proxy.listen(0,'127.0.0.1');await once(proxy,'listening');t.after(()=>{proxy.closeAllConnections();return new Promise(resolve=>proxy.close(resolve));});
 await assert.rejects(fetch('http://127.0.0.1:'+proxy.address().port+'/lost',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...pending.input,confirmed:true}),signal:AbortSignal.timeout(10000)}));
 assert.equal(committed,true);f.setPeer({active:false});const result=success(await f.erp('auth/site-links/status',pending.input));assert.equal(result.binding.status,'ACTIVE');
 assert.equal((await f.bindings()).length,1);assert.equal(f.hooks.redeems,1);
});

check('unlink reauthenticates the owner, works with disabled authority, and rejects stale concurrent versions',async t=>{
 const f=await fixture(t),pending=await f.prepared(),linked=success(await pending.confirm()).binding;f.setPeer({active:false});
 denied(await f.erp('auth/site-links/unlink',{id:linked.id,expectedVersion:1,password:'wrong'}),401,'NEEDS_REAUTH');
 const results=await Promise.all([f.erp('auth/site-links/unlink',{id:linked.id,expectedVersion:1,password}),f.erp('auth/site-links/unlink',{id:linked.id,expectedVersion:1,password})]);
 assert.equal(results.filter(result=>result.status<400).length,1);assert.equal(results.filter(result=>result.status===409).length,1);
 assert.equal((await f.bindings())[0].status,'REVOKED');assert.equal(await count(f.company,'audit_log',"AND action='SITE_IDENTITY_LINK_REVOKED'"),1);
});

check('same-user relink appends a fresh generation and cannot retarget the retained site principal',async t=>{
 const f=await fixture(t),first=success(await (await f.prepared()).confirm()).binding;
 success(await f.erp('auth/site-links/unlink',{id:first.id,expectedVersion:1,password}));
 const other=await f.login('user-b'),foreign=await f.prepared(other);denied(await foreign.confirm(),403,'ACCESS_DENIED');
 const second=success(await (await f.prepared()).confirm()).binding;assert.equal(second.generation,2);assert.notEqual(second.id,first.id);
 const rows=await f.bindings();assert.deepEqual(rows.map(row=>row.status),['REVOKED','ACTIVE']);assert.equal(rows[1].predecessor_id,first.id);assert.equal(rows[1].user_id,'user-a');
 await assert.rejects(db.query("DELETE FROM site_identity_bindings WHERE company_id=$1 AND id=$2",[f.company,first.id]),error=>error.code==='23514');
});

check('replaying frozen F1 migration cannot remove F2 generation/receipt immutability',async t=>{
 const f=await fixture(t),linked=success(await (await f.prepared()).confirm()).binding;
 const old=await readFile(new URL('../../erp/tests/fixtures/site-identity-pre-f2.sql',import.meta.url),'utf8');
 assert.equal(digest(old),'4c7f7bfc396baf87ba21cbdbb79f54ec7539ede080140bcf45989626efeabf4f','rollback must use the unchanged F1 migration from a670ff0');
 t.after(()=>db.migrate());await db.migrate(old);
 for(const expression of ['generation=generation+1','predecessor_id=gen_random_uuid()','f2_challenge_id=NULL'])
  await assert.rejects(db.query(`UPDATE site_identity_bindings SET status='REVOKED',version=2,revoked_at=clock_timestamp(),revoked_by='user-a',${expression} WHERE company_id=$1 AND id=$2`,[f.company,linked.id]),error=>error.code==='23514'&&error.message==='SITE_IDENTITY_F2_RECEIPT_IMMUTABLE');
 assert.equal((await f.bindings())[0].status,'ACTIVE');
});

check('same site/user identifiers in two companies remain independent and foreign-company cookies never cross the boundary',async t=>{
 const a=await fixture(t,{siteId:'same-synthetic-site-id'}),b=await fixture(t,{siteId:'same-synthetic-site-id'}),pending=await a.prepared();
 denied(await b.erp('auth/site-links/confirm',{...pending.input,confirmed:true},a.a),401,'NEEDS_REAUTH');
 denied(await b.erp('auth/site-links/confirm',{...pending.input,confirmed:true},b.a),403,'ACCESS_DENIED');
 success(await pending.confirm());success(await (await b.prepared()).confirm());
 assert.equal((await a.bindings())[0].user_id,'user-a');assert.equal((await b.bindings())[0].user_id,'user-a');assert.notEqual(a.company,b.company);
});

check('long valid site email metadata does not become an identity join or an accidental 200-character rejection',async t=>{
 const email='x'.repeat(215)+'@example.test',f=await fixture(t,{siteEmail:email});const pending=await f.prepared();assert.equal(pending.preview.site.email,email);success(await pending.confirm());assert.equal((await f.bindings())[0].user_id,'user-a');
});
