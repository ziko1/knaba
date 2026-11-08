import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {prepareDatabase,root} from './harness.mjs';
import {Engine} from '../../erp/apps/api/engine.ts';
import {createApiModule} from '../../erp/apps/api/http.ts';
import {SiteIdentityFlow} from '../../erp/apps/api/site-identity-flow.ts';
import {SiteSessionAuthority,siteSessionSecurityFingerprint} from '../../erp/apps/api/site-session-authority.ts';
import {hashPassword,hashToken,csrfFor,sealSecret} from '../../erp/apps/api/auth.ts';
import {identityCommands} from '../../erp/packages/domain/identity.ts';
import {quoteCustomerProjection} from '../../erp/packages/domain/commerce.ts';
import {PostgresPrivateBlobStore} from '../../erp/packages/storage/index.ts';
import {createKnabaVpsServer} from '../../corporate-site/vps/server.mjs';
import {createCredentialsUser,createSessionForUser,destroySession,rotateCredentials} from '../../corporate-site/vps/auth.mjs';
import {createSiteConsentAuthority} from '../../corporate-site/vps/site-identity-consent.mjs';
import {parsePeerConfig,digest,trustFingerprint,transportFingerprint} from '../../corporate-site/vps/site-identity-protocol.mjs';
import {peerRequest} from '../../erp/packages/integrations/site-identity-protocol.mjs';

const require=createRequire(new URL('../../erp/package.json',import.meta.url));
const {NestFactory}=require('@nestjs/core'),express=require('express'),OTPAuth=require('otpauth'),{build}=require('esbuild');
const password='Synthetic-F4B-ERP-password-2026',sitePassword='Synthetic-F4B-site-password-2026';
const encryptionKey='SYNTHETIC_F4B_CREDENTIAL_SEALING_KEY_2026';
const privateBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yR7sAAAAASUVORK5CYII=','base64');
const command='notification.read',notice='notice-user-a';
let db,passwordHash,rotatedPasswordHash,sourceSha,readerDir,OldAuthService,oldEncryptionKey,environmentConfigured=false;
const rotatedPassword='Synthetic-F4B-post-commit-password-2026';

before(async()=>{
 db=await prepareDatabase();passwordHash=await hashPassword(password);rotatedPasswordHash=await hashPassword(rotatedPassword);
 sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 oldEncryptionKey=process.env.AUTH_ENCRYPTION_KEY;process.env.AUTH_ENCRYPTION_KEY=encryptionKey;environmentConfigured=true;
 const source=await readFile(new URL('../../erp/tests/fixtures/auth-pre-site-sessions.ts.txt',import.meta.url),'utf8');
 assert.equal(digest(source),'37e71f16003b937478dd12db0893fde3a9774f7042a4fb7e1c7a924a4796b987');
 readerDir=await mkdtemp(join(tmpdir(),'knaba-f4b-old-reader-'));const output=join(readerDir,'reader.mjs');
 // The unchanged old source is bundled with its existing dependencies. This is
 // an exact old-reader test, not a claim about a complete deployed rollback.
 await build({stdin:{contents:source,loader:'ts',sourcefile:'auth-pre-site-sessions.ts',resolveDir:join(root,'erp/apps/api')},
  bundle:true,platform:'node',target:'node24',format:'esm',outfile:output,
  banner:{js:"import {createRequire as frozenCreateRequire} from 'node:module';const require=frozenCreateRequire(import.meta.url);"},logLevel:'silent'});
 ({AuthService:OldAuthService}=await import(pathToFileURL(output).href));
},{timeout:60000});
after(async()=>{
 try{await db?.close();if(readerDir)await rm(readerDir,{recursive:true,force:true});}
 finally{if(environmentConfigured){if(oldEncryptionKey===undefined)delete process.env.AUTH_ENCRYPTION_KEY;else process.env.AUTH_ENCRYPTION_KEY=oldEncryptionKey;}}
});
const check=(name,fn)=>test('F4-B '+name,{timeout:30000},fn);
const success=(result,step='request')=>{assert.ok([200,201].includes(result.status),step+' rejected: '+(result.body?.code??result.status));return result.body;};
const denied=(result,status=401,code='NEEDS_REAUTH')=>{assert.equal(result.status,status);assert.equal(result.body?.code,code);};
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function bounded(promise,label){let timeout;try{return await Promise.race([promise,new Promise((_resolve,reject)=>{timeout=setTimeout(()=>reject(Error('SYNTHETIC_BARRIER_TIMEOUT: '+label)),8000);})]);}finally{clearTimeout(timeout);}}
async function unusedPort(){const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;}

/** Actual Nest/Auth/Engine + PostgreSQL + VPS/SQLite + signed loopback HTTP.
 * Provisioning below deliberately inserts hashed synthetic F4-B rows. There is
 * no issuer, browser login exchange, provider or production TLS acceptance here.
 * Missing PostgreSQL/builds fail prepareDatabase; there is no SQL skip mode.
 */
async function fixture(t){
 const company='site_sessions_'+randomUUID(),dir=await mkdtemp(join(tmpdir(),'knaba-f4b-http-'));
 const flags={erp:true,site:true},wire=[],gates=[],controllers=[];
 let peer=null,sitePeer=null,app,site;
 const engine=new Engine(db,'TEST'),store=new PostgresPrivateBlobStore(db);
 Object.assign(engine.registry,identityCommands);
 const runtime={db,engine,storage:store,companyId:company,appMode:'TEST',buildSha:sourceSha,encryptionKey,publicOrigin:undefined};
 runtime.siteSessions=new SiteSessionAuthority(db,company,()=>peer,()=>flags.erp,async(...args)=>{
  const result=await peerRequest(...args);wire.push({path:args[2],input:args[3],result});return result;
 });
 const linkOptions={companyId:company,appMode:'TEST',encryptionKey,publicOrigin:undefined};
 runtime.siteIdentity=new SiteIdentityFlow(db,engine,linkOptions,()=>peer);
 t.after(async()=>{
  for(const release of gates)release();for(const controller of controllers)controller.abort();
  try{site?.server.closeAllConnections();await site?.close();}
  finally{try{app?.getHttpServer()?.closeAllConnections();await app?.close();}finally{await rm(dir,{recursive:true,force:true});}}
 });
 await db.transaction(company,'SYNTHETIC_F4B_SETUP',async tx=>{
  await tx.add('company',{name:'Synthetic F4-B company',active:true},company);
  await tx.add('site',{name:'Synthetic F4-B site',active:true},'site');
  for(const id of ['user-a','user-b','owner']){
   await tx.add('user',{name:'Synthetic '+id,email:id+'@example.test',active:true,roles:id==='owner'?['OWNER']:['EMPLOYEE'],
    permissions:['chat.read','identity.self','media.read','media.upload'],siteIds:['site'],warehouseIds:[],synthetic:true},id);
   await tx.query('INSERT INTO auth_credentials(company_id,user_id,password_hash) VALUES($1,$2,$3)',[company,id,passwordHash]);
   await tx.add('notification',{recipient_id:id,title:'Synthetic private notice for '+id,channel:'WEB',status:'WEB_AVAILABLE'},'notice-'+id);
  }
  const blobKey=company+'-private-file';
  await store.put({id:blobKey,companyId:company,ownerId:'user-a',bytes:privateBytes,mimeType:'image/png'},tx);
  await tx.add('media_asset',{uploadedBy:'user-a',siteId:'site',blobKey,mimeType:'image/png',visibility:'INTERNAL',state:'UPLOADED'},'private-file');
 });
 app=await NestFactory.create(createApiModule(runtime),{bodyParser:false,logger:false});
 app.use(express.json({limit:'8kb',verify:(req,_res,bytes)=>{req.rawBody=bytes;}}));
 await app.init();await app.listen(0,'127.0.0.1');
 const erpOrigin='http://127.0.0.1:'+app.getHttpServer().address().port;runtime.publicOrigin=erpOrigin;linkOptions.publicOrigin=erpOrigin;
 const sitePort=await unusedPort(),siteOrigin='http://127.0.0.1:'+sitePort;
 peer=parsePeerConfig({companyId:company,issuer:'https://synthetic-f4b.example.test/identity-v1',audience:'knaba-f4b-erp',version:1,active:true,erpOrigin,siteOrigin,
  keyId:'knaba-federation-f4b-test',secret:randomBytes(32).toString('base64url')},{localTest:true});sitePeer=peer;
 async function startSite(){
  site=await createKnabaVpsServer({dbPath:join(dir,'site.sqlite'),staticRoot:join(root,'corporate-site/dist/client'),workerPath:new URL('../../corporate-site/dist/server/index.js',import.meta.url).href,
   origin:siteOrigin,localTest:true,host:'127.0.0.1',port:sitePort,oidcConfig:{},erpIntakeEnvironment:{},erpIntakeSchedulerFactory:()=>({stop:async()=>{}}),
   siteIdentityConfig:()=>sitePeer,siteIdentitySessionsEnabled:()=>flags.site});
 }
 await startSite();
 const siteUser=createCredentialsUser(site.db,'synthetic-site-user@example.test',sitePassword),now=new Date().toISOString();
 site.db.prepare('INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES(?,?,?,?,?,?,?,?,?,1,?)')
  .run(siteUser.id,'Synthetic site account',siteUser.email,'client','client','approved','synthetic-v1',now,now,'synthetic-f4b-fixture');
 const siteSession=createSessionForUser(site.db,siteUser.id),siteCookie='__Host-knaba-session='+siteSession.token;let siteCsrf='';
 async function request(origin,path,body,headers={}){
  const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body===undefined?{}:{'content-type':'application/json'}),...headers},
   body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(12000)});
  const bytes=Buffer.from(await response.arrayBuffer());let value={};try{value=JSON.parse(bytes.toString());}catch{/* Binary replies are asserted as exact bytes. */}
  return {status:response.status,body:value,headers:response.headers,bytes,text:bytes.toString()};
 }
 async function login(id='user-a',currentPassword=password){
  const result=await request(erpOrigin,'/api/v1/auth/login',{email:id+'@example.test',password:currentPassword}),body=success(result,'local ERP login');
  const match=/knaba_session=([^;]+)/.exec(result.headers.get('set-cookie')??'');assert.ok(match);assert.equal(typeof body.csrfToken,'string');
  return {userId:id,token:match[1],cookie:'knaba_session='+match[1],csrf:body.csrfToken};
 }
 const local=await login();
 const erp=(path,body,identity=local,headers={})=>request(erpOrigin,'/api/v1/'+path,body,{Cookie:identity.cookie,'x-csrf-token':identity.csrf,...headers});
 const siteCall=(path,body)=>request(siteOrigin,path,body,{Cookie:siteCookie,'x-csrf-token':siteCsrf,'x-knaba-request':'site-identity-v1'});
 siteCsrf=success(await siteCall('/auth/site-identity/session'),'current site account').csrfToken;
 async function link(){
  const begin=success(await erp('auth/site-links/challenges',{password}),'F2 begin');
  const challengeToken=new URLSearchParams(new URL(begin.redirectUrl).hash.slice(1)).get('link');
  const preview=success(await siteCall('/auth/site-identity/preview',{challengeToken}),'F2 site preview');
  const consent=success(await siteCall('/auth/site-identity/consent',{challengeToken,previewProof:preview.previewProof,confirmed:true}),'F2 site consent');
  const grantToken=new URLSearchParams(new URL(consent.redirectUrl).hash.slice(1)).get('grant'),input={challengeToken,grantToken};
  success(await erp('auth/site-links/preview',input),'F2 ERP preview');
  return success(await erp('auth/site-links/confirm',{...input,confirmed:true}),'F2 confirmation').binding;
 }
 const linked=await link();
 async function provision(overrides={}){
  const binding=(await db.query("SELECT * FROM site_identity_bindings WHERE company_id=$1 AND user_id='user-a' AND status='ACTIVE'",[company])).rows[0];assert.ok(binding);
  const current=createSiteConsentAuthority(site.db,{config:()=>sitePeer,sessionsEnabled:()=>flags.site}).current(siteCookie);
  const user=(await db.query("SELECT version FROM aggregates WHERE company_id=$1 AND kind='user' AND id='user-a'",[company])).rows[0];
  const credential=(await db.query("SELECT password_hash,totp_secret FROM auth_credentials WHERE company_id=$1 AND user_id='user-a'",[company])).rows[0];
  const token=randomBytes(32).toString('base64url'),created=new Date(),effectiveSiteExpiry=Math.min(current.expiresAt,peer.expiresAt?Date.parse(peer.expiresAt):Infinity);
  const data={company_id:company,id:randomUUID(),token_hash:hashToken(token),user_id:'user-a',user_version:user.version,security_fingerprint:siteSessionSecurityFingerprint(credential),
   binding_id:binding.id,binding_version:binding.version,binding_generation:binding.generation,issuer:peer.issuer,audience:peer.audience,subject:current.subject,
   site_session_digest:current.sessionDigest,site_profile_version:current.profileVersion,site_profile_fingerprint:current.profileFingerprint,site_expires_at:new Date(effectiveSiteExpiry),
   trust_version:peer.version,trust_fingerprint:trustFingerprint(peer),transport_fingerprint:transportFingerprint(peer),mfa_verified:false,mfa_verified_at:null,
   created_at:created,expires_at:new Date(Math.min(created.getTime()+1800000,effectiveSiteExpiry)),...overrides};
  const names=Object.keys(data),values=Object.values(data);
  const row=(await db.query(`INSERT INTO site_auth_sessions(${names.join(',')}) VALUES(${names.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,values)).rows[0];
  assert.equal((await db.query('SELECT token_hash FROM auth_sessions WHERE token_hash=$1',[hashToken(token)])).rows.length,0,'fixture must not provision the local namespace');
  return {userId:data.user_id,token,cookie:'knaba_session='+token,csrf:csrfFor(token),row};
 }
 const federated=await provision();
 function gate(){const entered=deferred(),released=deferred();const release=()=>released.resolve();gates.push(release);return {entered:entered.promise,release,pause:async()=>{entered.resolve();await bounded(released.promise,'release');}};}
 function controller(){const value=new AbortController();controllers.push(value);return value;}
 const envelope=(key=randomUUID())=>({command,input:{notification_id:notice},expected_version:1,idempotency_key:key});
 async function effects(){return (await db.query("SELECT (SELECT count(*)::int FROM command_receipts WHERE company_id=$1 AND actor_id='user-a' AND command='notification.read') AS receipts,(SELECT count(*)::int FROM audit_log WHERE company_id=$1 AND actor_id='user-a' AND action='COMMAND:notification.read') AS audits",[company])).rows[0];}
 async function state(){return (await db.query("SELECT version,data FROM aggregates WHERE company_id=$1 AND kind='notification' AND id=$2",[company,notice])).rows[0];}
 async function unchanged(){const row=await state();assert.equal(row.version,1);assert.equal(row.data.read_at,undefined);assert.deepEqual(await effects(),{receipts:0,audits:0});}
 return {company,engine,store,runtime,httpServer:app.getHttpServer(),erpOrigin,siteOrigin,siteUser,siteSession,siteCookie,local,federated,linked,flags,wire,erp,login,provision,link,gate,controller,envelope,effects,state,unchanged,
  get site(){return site;},get peer(){return peer;},
  setPeer(patch,{siteOnly=false}={}){const next=parsePeerConfig({...peer,...patch},{localTest:true});if(!siteOnly)peer=next;sitePeer=next;},
  async stopSite(){site.server.closeAllConnections();await site.close();},restartSite:startSite,
  async sessions(userId='user-a'){
   return {local:(await db.query('SELECT revoked_at FROM auth_sessions WHERE company_id=$1 AND user_id=$2',[company,userId])).rows,
    federated:(await db.query('SELECT revoked_at FROM site_auth_sessions WHERE company_id=$1 AND user_id=$2',[company,userId])).rows};
  }
 };
}

check('signed current-site authority authorizes scoped reads and one atomic write; fresh local login recovers its receipt',async t=>{
 const f=await fixture(t),me=success(await f.erp('me',undefined,f.federated));assert.equal(me.actor.userId,'user-a');assert.equal(me.actor.companyId,f.company);
 for(const privateKey of ['siteDescriptorHash','site_session_digest','profileFingerprint','transportFingerprint','token_hash'])assert.equal(JSON.stringify(me).includes(privateKey),false);
 const rows=success(await f.erp('entities/notification',undefined,f.federated));assert.ok(JSON.stringify(rows).includes(notice));assert.equal(JSON.stringify(rows).includes('notice-user-b'),false);
 const body=f.envelope(),first=success(await f.erp('commands',body,f.federated));assert.equal(first.notification_id,notice);assert.equal(first.version,2);
 assert.deepEqual(success(await f.erp('commands',body,f.federated)),first);assert.deepEqual(await f.effects(),{receipts:1,audits:1});
 assert.ok(f.wire.length>2);for(const entry of f.wire){assert.equal(entry.path,'/auth/site-identity/introspect-session');assert.equal(entry.result.active,true);assert.equal(Object.keys(entry.result).length,12);}
 destroySession(f.site.db,f.siteCookie);denied(await f.erp('commands',body,f.federated),503,'DEPENDENCY_UNAVAILABLE');
 const fresh=await f.login();assert.deepEqual(success(await f.erp('commands',body,fresh)),first);assert.deepEqual(await f.effects(),{receipts:1,audits:1});
 denied(await f.erp('commands',body,await f.login('user-b')),404,'NOT_FOUND_SAFE');assert.deepEqual(await f.effects(),{receipts:1,audits:1});
});

check('default-off federation and the exact old AuthService reader deny the token while local login stays usable',async t=>{
 const f=await fixture(t);success(await f.erp('me',undefined,f.federated));
 const disabled=new SiteSessionAuthority(db,f.company,()=>f.peer);await assert.rejects(disabled.authenticate(hashToken(f.federated.token)),error=>error.code==='MISSING_CONFIGURATION');
 const reader=new OldAuthService(db,f.engine,{companyId:f.company,appMode:'TEST'}),request={get:name=>name==='cookie'?f.federated.cookie:undefined};
 await assert.rejects(reader.authenticate(request),error=>error.code==='NEEDS_REAUTH');
 denied(await f.erp('me',undefined,f.federated,{authorization:'Bearer '+f.federated.token}));
 denied(await f.erp('me',undefined,f.federated,{Cookie:'knaba_guest='+f.federated.token}));
 denied(await f.erp('auth/site-links/challenges',{password},f.federated));
 f.flags.erp=false;denied(await f.erp('me',undefined,f.federated),422,'MISSING_CONFIGURATION');success(await f.erp('me'));success(await f.erp('auth/site-links'));
 f.flags.erp=true;f.flags.site=false;denied(await f.erp('me',undefined,f.federated),503,'DEPENDENCY_UNAVAILABLE');success(await f.erp('me'));
});

check('foreign-company cookies, another ERP target and another site session cannot substitute for the stored provenance',async t=>{
 const f=await fixture(t),other=await fixture(t);success(await other.erp('me',undefined,other.federated));
 denied(await other.erp('me',undefined,f.federated));
 const wrongTarget=await f.provision({user_id:'user-b'});denied(await f.erp('me',undefined,wrongTarget));
 const second=createCredentialsUser(f.site.db,'other-site@example.test',sitePassword),now=new Date().toISOString();
 f.site.db.prepare('INSERT INTO profiles(id,name,email,requested_role,role,status,privacy_version,created_at,updated_at,version,last_mutation) VALUES(?,?,?,?,?,?,?,?,?,1,?)')
  .run(second.id,'Other synthetic approved user',second.email,'client','client','approved','synthetic-v1',now,now,'synthetic-other-user');
 const secondSession=createSessionForUser(f.site.db,second.id);
 assert.equal(createSiteConsentAuthority(f.site.db,{config:()=>f.peer}).current('__Host-knaba-session='+secondSession.token).subject,second.id);
 const swapped=await f.provision({site_session_digest:digest(secondSession.token)});denied(await f.erp('me',undefined,swapped),503,'DEPENDENCY_UNAVAILABLE');
 success(await f.erp('me',undefined,f.federated));
});

for(const [label,mutate] of [
 ['logout',async f=>{destroySession(f.site.db,f.siteCookie);createSessionForUser(f.site.db,f.siteUser.id);}],
 ['password rotation',async f=>{assert.equal(rotateCredentials(f.site.db,{userId:f.siteUser.id,currentPassword:sitePassword,newPassword:'Synthetic-F4B-new-site-password',confirmed:'Synthetic-F4B-new-site-password'}),true);}],
 ['disabled account',async f=>{f.site.db.prepare('UPDATE vps_users SET disabled=1 WHERE id=?').run(f.siteUser.id);}],
 ['profile version change',async f=>{f.site.db.prepare('UPDATE profiles SET version=version+1,last_mutation=? WHERE id=?').run('synthetic-profile-change',f.siteUser.id);}],
 ['suspended profile',async f=>{f.site.db.prepare("UPDATE profiles SET status='suspended' WHERE id=?").run(f.siteUser.id);}],
 ['expired original site session',async f=>{f.site.db.prepare('UPDATE vps_sessions SET expires_at=? WHERE token_hash=?').run(Math.floor(Date.now()/1000)-1,digest(f.siteSession.token));}]
])check('site '+label+' invalidates the original federated session without fallback or a write',async t=>{
 const f=await fixture(t);success(await f.erp('me',undefined,f.federated));await mutate(f);
 denied(await f.erp('commands',f.envelope(),f.federated),503,'DEPENDENCY_UNAVAILABLE');await f.unchanged();success(await f.erp('me'));
});

for(const [label,patch,status,code] of [
 ['peer disable',{active:false},422,'MISSING_CONFIGURATION'],
 ['trust version',{version:2},401,'NEEDS_REAUTH'],
 ['issuer',{issuer:'https://other-synthetic.example.test/identity-v1'},401,'NEEDS_REAUTH'],
 ['audience',{audience:'other-synthetic-audience'},401,'NEEDS_REAUTH'],
 ['transport key',{keyId:'knaba-federation-rotated-test',secret:randomBytes(32).toString('base64url')},401,'NEEDS_REAUTH']
])check(label+' change cannot refresh an old federated snapshot',async t=>{
 const f=await fixture(t);success(await f.erp('me',undefined,f.federated));f.setPeer(patch);
 denied(await f.erp('commands',f.envelope(),f.federated),status,code);await f.unchanged();success(await f.erp('me'));
});

check('DB-clock expiry and future-created metadata reject premature or expired sessions',async t=>{
 const f=await fixture(t);success(await f.erp('me',undefined,f.federated));const now=Date.now();
 const expired=await f.provision({created_at:new Date(now-60000),expires_at:new Date(now-1000)});denied(await f.erp('me',undefined,expired));
 const future=await f.provision({created_at:new Date(now+60000),expires_at:new Date(now+120000)});denied(await f.erp('me',undefined,future));
 assert.equal(await f.runtime.siteSessions.forLogout(hashToken(future.token)),undefined);
 success(await f.erp('me',undefined,f.federated));
});

for(const [label,mutate] of [
 ['ERP user version',async f=>db.transaction(f.company,'SYNTHETIC_PRE_F4B_WRITER',async tx=>{const user=await tx.get('user','user-a');await tx.save(user,{...user.data,roles:['CLIENT']});})],
 ['ERP password',async f=>db.query("UPDATE auth_credentials SET password_hash=$2 WHERE company_id=$1 AND user_id='user-a'",[f.company,await hashPassword('Synthetic-F4B-rollback-password')])],
 ['ERP TOTP credential',async f=>db.query("UPDATE auth_credentials SET totp_secret=$2 WHERE company_id=$1 AND user_id='user-a'",[f.company,sealSecret('JBSWY3DPEHPK3PXP',encryptionKey)])]
])check(label+' changes by a synthetic old writer deny an otherwise unrevoked federated row',async t=>{
 // Explicit old-writer SQL fixture, not execution of an entire old deployment.
 const f=await fixture(t);success(await f.erp('me',undefined,f.federated));await mutate(f);
 assert.equal((await f.sessions()).federated[0].revoked_at,null);
 denied(await f.erp('commands',f.envelope(),f.federated));await f.unchanged();
});

check('site revocation after authentication but before the business transaction prevents any effect',async t=>{
 const f=await fixture(t),pause=f.gate(),original=f.engine.execute.bind(f.engine);
 f.engine.execute=async(...args)=>{await pause.pause();return original(...args);};
 const pending=f.erp('commands',f.envelope(),f.federated);await bounded(pause.entered,'authenticated command before SQL');
 destroySession(f.site.db,f.siteCookie);pause.release();denied(await pending,503,'DEPENDENCY_UNAVAILABLE');await f.unchanged();
});

for(const [label,mutate,status,code] of [
 ['site logout',async f=>destroySession(f.site.db,f.siteCookie),503,'DEPENDENCY_UNAVAILABLE'],
 ['session authority disable',async f=>{f.flags.erp=false;},422,'MISSING_CONFIGURATION'],
 ['real peer outage',async f=>f.stopSite(),503,'DEPENDENCY_UNAVAILABLE']
])check(label+' after domain writes rolls back the effect, audit and receipt before COMMIT',async t=>{
 const f=await fixture(t),pause=f.gate(),definition=f.engine.registry[command];
 f.engine.registry[command]={...definition,handler:async(ctx,input)=>{const result=await definition.handler(ctx,input);await pause.pause();return result;}};
 const pending=f.erp('commands',f.envelope(),f.federated);await bounded(pause.entered,'domain write before final authority check');await mutate(f);pause.release();
 denied(await pending,status,code);await f.unchanged();
 assert.equal((await db.query("SELECT id FROM audit_log WHERE company_id=$1 AND action='UPDATE' AND aggregate_kind='notification' AND aggregate_id=$2",[f.company,notice])).rows.length,0);
});

check('lost authority after COMMIT suppresses the response but retains one recoverable effect',async t=>{
 const f=await fixture(t),pause=f.gate(),original=f.engine.execute.bind(f.engine);let once=true;
 f.engine.execute=async(...args)=>{const result=await original(...args);if(once){once=false;await pause.pause();}return result;};
 const body=f.envelope(),pending=f.erp('commands',body,f.federated);await bounded(pause.entered,'committed write before response');
 assert.deepEqual(await f.effects(),{receipts:1,audits:1});await f.stopSite();pause.release();denied(await pending,503,'DEPENDENCY_UNAVAILABLE');
 const receipt=success(await f.erp('commands',body,await f.login()));assert.equal(receipt.notification_id,notice);assert.equal(receipt.version,2);assert.deepEqual(await f.effects(),{receipts:1,audits:1});
});

for(const [label,mutate] of [['site revocation',async f=>destroySession(f.site.db,f.siteCookie)],['peer outage',async f=>f.stopSite()]])
check('private file bytes and headers are withheld after '+label+' during actual blob I/O',async t=>{
 const f=await fixture(t),control=await f.erp('media/private-file/file',undefined,f.federated);assert.equal(control.status,200);assert.deepEqual(control.bytes,privateBytes);const etag=control.headers.get('etag');assert.ok(etag);
 const pause=f.gate(),original=f.store.get.bind(f.store);let once=true;
 f.store.get=async(...args)=>{const result=await original(...args);if(once){once=false;await pause.pause();}return result;};
 const pending=f.erp('media/private-file/file',undefined,f.federated);await bounded(pause.entered,'private bytes read');await mutate(f);pause.release();const result=await pending;
 denied(result,503,'DEPENDENCY_UNAVAILABLE');assert.equal(result.bytes.equals(privateBytes),false);assert.notEqual(result.headers.get('etag'),etag);assert.equal(result.headers.get('content-disposition'),null);assert.match(result.headers.get('content-type'),/application\/json/);
});

check('SSE rereads site authority after data reads and suppresses the revoked update',async t=>{
 const f=await fixture(t),pause=f.gate(),original=f.engine.readEntities.bind(f.engine);let once=true;
 f.engine.readEntities=async(actor,kind)=>{const rows=await original(actor,kind);if(once&&kind==='notification'){once=false;await pause.pause();}return rows;};
 const controller=f.controller(),stream=await fetch(f.erpOrigin+'/api/v1/events',{headers:{Cookie:f.federated.cookie},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});
 assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/^text\/event-stream/);
 await bounded(pause.entered,'SSE read before send');destroySession(f.site.db,f.siteCookie);pause.release();const text=await bounded(stream.text(),'SSE close');
 assert.ok(text.includes('event: access_revoked'));assert.equal(text.includes('event: update'),false);assert.equal(text.includes(notice),false);controller.abort();
});

check('outage-safe federated logout revokes exactly the presented session and returns only the minimal ACK',async t=>{
 const f=await fixture(t),other=await f.provision();success(await f.erp('me',undefined,f.federated));await f.stopSite();
 denied(await f.erp('me',undefined,f.federated),503,'DEPENDENCY_UNAVAILABLE');
 denied(await f.erp('auth/logout',{},f.federated,{'x-csrf-token':'wrong'}),403,'ACCESS_DENIED');
 assert.deepEqual(success(await f.erp('auth/logout',{},f.federated)),{ok:true});denied(await f.erp('me',undefined,f.federated));
 const rows=(await db.query('SELECT token_hash,revoked_at FROM site_auth_sessions WHERE company_id=$1',[f.company])).rows;
 assert.ok(rows.find(row=>row.token_hash===hashToken(f.federated.token)).revoked_at);assert.equal(rows.find(row=>row.token_hash===hashToken(other.token)).revoked_at,null);
 assert.equal((await db.query("SELECT id FROM audit_log WHERE company_id=$1 AND action='SITE_SESSION_LOGOUT'",[f.company])).rows.length,1);
 success(await f.erp('me'));denied(await f.erp('me',undefined,other),503,'DEPENDENCY_UNAVAILABLE');
});

for(const name of ['user.roles','user.disable','user.password.rotate','user.mfa.configure'])
check('actual '+name+' revokes local and federated namespaces atomically',async t=>{
 const f=await fixture(t),extraLocal=await f.login(),extraFederated=await f.provision();success(await f.erp('me',undefined,f.federated));
 const owner=await f.login('owner');let identity=owner,input,expected_version;
 if(name==='user.roles'){input={userId:'user-a',roles:['EMPLOYEE'],permissions:[],siteIds:['site'],warehouseIds:[],reason:'Synthetic F4-B role replacement'};expected_version=1;}
 if(name==='user.disable'){input={userId:'user-a',reason:'Synthetic F4-B account disable'};expected_version=1;}
 if(name==='user.password.rotate'){identity=f.federated;input={currentPassword:password,newPassword:'Synthetic-F4B-new-ERP-password-2026'};}
 if(name==='user.mfa.configure'){identity=f.federated;const secret='JBSWY3DPEHPK3PXP';input={currentPassword:password,secret,otp:new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(secret)}).generate()};}
 const result=success(await f.erp('commands',{command:name,input,...(expected_version?{expected_version}:{}),idempotency_key:randomUUID()},identity));
 if(identity===f.federated)assert.deepEqual(result,{ok:true,reauthenticationRequired:true});
 const rows=await f.sessions();assert.ok(rows.local.length>=2&&rows.federated.length===2);assert.ok([...rows.local,...rows.federated].every(row=>row.revoked_at));
 for(const session of [f.local,extraLocal,f.federated,extraFederated])denied(await f.erp('me',undefined,session));
 success(await f.erp('me',undefined,owner));
 assert.equal((await db.query('SELECT idempotency_key FROM command_receipts WHERE company_id=$1 AND command=$2',[f.company,name])).rows.length,1);
});

check('fresh local F2 unlink works during peer outage; append-only relink never revives the old session',async t=>{
 const f=await fixture(t);success(await f.erp('me',undefined,f.federated));
 denied(await f.erp('auth/site-links/unlink',{id:f.linked.id,expectedVersion:1,password},f.federated));
 await f.stopSite();const revoked=success(await f.erp('auth/site-links/unlink',{id:f.linked.id,expectedVersion:1,password})).binding;assert.equal(revoked.status,'REVOKED');
 assert.ok((await f.sessions()).federated.every(row=>row.revoked_at));denied(await f.erp('me',undefined,f.federated));
 await f.restartSite();const linked=await f.link();assert.equal(linked.generation,2);assert.notEqual(linked.id,f.linked.id);
 const bindings=(await db.query('SELECT id,predecessor_id,status FROM site_identity_bindings WHERE company_id=$1 ORDER BY generation',[f.company])).rows;
 assert.deepEqual(bindings.map(row=>row.status),['REVOKED','ACTIVE']);assert.equal(bindings[1].predecessor_id,bindings[0].id);
 denied(await f.erp('me',undefined,f.federated));success(await f.erp('me',undefined,await f.provision()));
});

check('SQL provenance and terminal revocation survive the byte-exact pre-F4-B migration replay',async t=>{
 const f=await fixture(t),old=await readFile(new URL('../../erp/tests/fixtures/site-session-pre-f4b.sql',import.meta.url),'utf8');
 assert.equal(digest(old),'0bef6ffb4afc43ca35d20dfecba174ffd3da626b715fb3026587c72d6b94852f');t.after(()=>db.migrate());await db.migrate(old);
 for(const expression of ["user_id='user-b'","subject='other-site-subject'",'binding_generation=binding_generation+1',"transport_fingerprint=repeat('0',64)",'expires_at=expires_at+interval \'1 minute\'','mfa_verified=true,mfa_verified_at=created_at'])
  await assert.rejects(db.query(`UPDATE site_auth_sessions SET ${expression} WHERE company_id=$1 AND id=$2`,[f.company,f.federated.row.id]),error=>error.code==='23514'&&error.message==='SITE_SESSION_PROVENANCE_IMMUTABLE');
 success(await f.erp('me',undefined,f.federated));success(await f.erp('auth/logout',{},f.federated));
 for(const expression of ['revoked_at=NULL','revoked_at=clock_timestamp()'])
  await assert.rejects(db.query(`UPDATE site_auth_sessions SET ${expression} WHERE company_id=$1 AND id=$2`,[f.company,f.federated.row.id]),error=>error.code==='23514'&&error.message==='SITE_SESSION_REVOCATION_TERMINAL');
 denied(await f.erp('me',undefined,f.federated));
});

check('actual old-schema to current-schema upgrade preserves local credentials, sessions and binding history',async()=>{
 const old=await readFile(new URL('../../erp/tests/fixtures/site-session-pre-f4b.sql',import.meta.url),'utf8');
 assert.equal(digest(old),'0bef6ffb4afc43ca35d20dfecba174ffd3da626b715fb3026587c72d6b94852f');
 const current=await readFile(new URL('../../erp/infra/001_init.sql',import.meta.url),'utf8');
 const schema='f4b_upgrade_'+randomUUID().replaceAll('-',''),company='synthetic-upgrade-company',userId='legacy-user';
 assert.match(schema,/^f4b_upgrade_[a-f0-9]{32}$/);
 const client=await db.pool.connect();let began=false;
 try{
  await client.query('BEGIN');began=true;
  await client.query(`CREATE SCHEMA "${schema}"`);
  // Both migrations execute on this same connection. Public is deliberately
  // absent, so the already migrated bridge database cannot satisfy a lookup or
  // receive a table, function, trigger, seed row or migration receipt here.
  await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
  assert.deepEqual((await client.query('SELECT current_schemas(false) AS names')).rows[0].names,[schema,'pg_catalog']);
  await client.query(old);
  assert.equal((await client.query("SELECT to_regclass('site_auth_sessions') AS table_id")).rows[0].table_id,null);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM schema_migrations WHERE version='005_site_session_authority'")).rows[0].n,0);
  const created=new Date(Date.now()-60000),expires=new Date(Date.now()+1800000),sealed=sealSecret('JBSWY3DPEHPK3PXP',encryptionKey);
  await client.query('INSERT INTO aggregates(company_id,kind,id,version,data,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6)',
   [company,'company',company,1,JSON.stringify({name:'Synthetic legacy company',active:true}),created]);
  await client.query('INSERT INTO aggregates(company_id,kind,id,version,data,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6)',
   [company,'user',userId,7,JSON.stringify({name:'Synthetic legacy user',email:'legacy@example.test',active:true,roles:['EMPLOYEE'],siteIds:['legacy-site']}),created]);
  await client.query('INSERT INTO auth_credentials(company_id,user_id,password_hash,totp_secret,totp_last_counter) VALUES($1,$2,$3,$4,$5)',[company,userId,passwordHash,sealed,42]);
  for(const revoked of [false,true]){
   await client.query('INSERT INTO auth_sessions(token_hash,user_id,company_id,expires_at,mfa_verified,revoked_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [digest(randomBytes(32)),userId,company,expires,true,revoked?new Date(created.getTime()+1000):null,created]);
   const bindingId=randomUUID(),subject=revoked?'legacy-revoked-site-user':'legacy-active-site-user';
   await client.query(`INSERT INTO site_identity_bindings(company_id,id,issuer,audience,subject,site_user_id,user_id,trust_version,trust_fingerprint,proof_reference,created_by,created_at)
    VALUES($1,$2,$3,$4,$5,$5,$6,1,$7,$8,$6,$9)`,
    [company,bindingId,'https://synthetic-upgrade.example.test/identity-v1','knaba-legacy-upgrade',subject,userId,digest('synthetic-legacy-trust'),digest('synthetic-legacy-proof-'+subject),created]);
   if(revoked)await client.query("UPDATE site_identity_bindings SET status='REVOKED',version=2,revoked_by=$3,revoked_at=$4 WHERE company_id=$1 AND id=$2",[company,bindingId,userId,new Date(created.getTime()+1000)]);
  }
  const snapshot=async()=>({
   users:(await client.query('SELECT * FROM aggregates ORDER BY company_id,kind,id')).rows,
   credentials:(await client.query('SELECT * FROM auth_credentials ORDER BY company_id,user_id')).rows,
   sessions:(await client.query('SELECT * FROM auth_sessions ORDER BY token_hash')).rows,
   bindings:(await client.query('SELECT * FROM site_identity_bindings ORDER BY company_id,id')).rows
  });
  const before=await snapshot(),versions=(await client.query('SELECT * FROM schema_migrations ORDER BY version')).rows;
  assert.equal(before.users.length,2);assert.equal(before.credentials.length,1);assert.equal(before.sessions.length,2);assert.equal(before.bindings.length,2);
  assert.deepEqual(before.bindings.map(row=>row.status).sort(),['ACTIVE','REVOKED']);
  await client.query(current);
  assert.deepEqual(await snapshot(),before,'upgrade must preserve complete old rows, including credential bytes, timestamps, scope, revoked sessions and tombstones');
  const after=(await client.query('SELECT * FROM schema_migrations ORDER BY version')).rows;
  assert.deepEqual(after.filter(row=>row.version!=='005_site_session_authority'),versions);
  assert.equal(after.filter(row=>row.version==='005_site_session_authority').length,1);
  const table=(await client.query("SELECT n.nspname AS schema_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=to_regclass('site_auth_sessions')")).rows;
  assert.deepEqual(table,[{schema_name:schema}]);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM site_auth_sessions')).rows[0].n,0,'migration must not invent federated sessions from old local sessions');
  const references=(await client.query("SELECT n.nspname AS schema_name FROM pg_constraint c JOIN pg_class r ON r.oid=c.confrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE c.conrelid=to_regclass('site_auth_sessions') AND c.contype='f'")).rows;
  assert.equal(references.length,2);assert.ok(references.every(row=>row.schema_name===schema),'new foreign keys must remain in the isolated schema');
  await client.query('SELECT knaba_assert_gps_storage_safe($1::text)',[company]);
 }finally{
  try{if(began){await client.query('ROLLBACK');assert.equal((await client.query('SELECT to_regnamespace($1) AS schema_id',[schema])).rows[0].schema_id,null,'rollback must remove the entire owned schema');}}
  finally{client.release();}
 }
});

/** Synthetic already accepted commercial records; dispatch.reserve and
 * dispatch.assign below still use the canonical HTTP/Engine handlers. This
 * fixture does not claim a customer acceptance, MFA or production approval. */
async function seedSelfDispatch(tx,company){
 const owner=await tx.get('user','user-a');
 const beforeUser=await tx.save(owner,{...owner.data,roles:['OWNER','OPERATIONS_MANAGER'],siteIds:[]});
 const business=await tx.get('company',company);await tx.save(business,{...business.data,operatingMode:'TEST'});
 await tx.add('customer',{name:'Synthetic dispatch customer',active:true},'dispatch-customer');
 const site=await tx.get('site','site');await tx.save(site,{...site.data,customerId:'dispatch-customer'});
 await tx.add('employee',{userId:'user-a',active:true,skills:[],absences:[]},'dispatch-self-employee');
 await tx.add('service',{name:'Synthetic dispatch service',active:true,unit:'UNIT'},'dispatch-service');
 const scope='Synthetic accepted self-dispatch scope',tax={mode:'VAT',rateBps:1900,display:'GROSS',testOnly:true};
 await tx.add('lead',{status:'CUSTOMER_ACCEPTED_PENDING_OPERATIONS',review_state:'NONE',customerId:'dispatch-customer',currentQuoteId:'dispatch-quote',siteId:'site'},'dispatch-lead');
 const quote=await tx.add('quote',{status:'ACCEPTED',orderId:'dispatch-order',leadId:'dispatch-lead',customerId:'dispatch-customer',quoteVersion:1,acceptanceId:'dispatch-acceptance',
  scope,included:[],excluded:[],pricingModel:'TIME_MATERIAL',certainty:'CONTRACT_PRICE',currency:'EUR',
  lines:[{serviceId:'dispatch-service',serviceName:'Synthetic dispatch service',quantityMilli:1000,unit:'UNIT',rateCents:1000,netCents:1000,included:[],rounding:'PER_LINE_HALF_UP'}],
  subtotalNetCents:1000,discountCents:0,totalNetCents:1000,totalTaxCents:190,totalGrossCents:1190,tax,
  expiresAt:new Date(Date.now()+86400000).toISOString(),priceBookId:'dispatch-book',priceBookVersion:1},'dispatch-quote');
 const {version,status,sentAt,acceptedAt,portalPublishedAt,delivery,...commercialSnapshot}=quoteCustomerProjection(quote);
 await tx.add('quote_acceptance',{quoteId:quote.id,quoteVersion:1,orderId:'dispatch-order',customerId:'dispatch-customer',commercialSnapshot,immutable:true},'dispatch-acceptance');
 await tx.add('order',{customerId:'dispatch-customer',leadId:'dispatch-lead',quoteId:quote.id,quoteVersion:1,dispatchId:'dispatch-request',status:'CONFIRMED',
  responsibleUserId:'user-a',scope,baseNetCents:1000,approvedChangesNetCents:0,finalNetCents:1000,currency:'EUR',tax,pricingModel:'TIME_MATERIAL',scheduleVersion:0},'dispatch-order');
 await tx.add('dispatch_request',{orderId:'dispatch-order',customerId:'dispatch-customer',status:'PENDING'},'dispatch-request');
 return beforeUser;
}
async function selfDispatchFixture(t){
 const f=await fixture(t),beforeUser=await db.transaction(f.company,'SYNTHETIC_DISPATCH_SETUP',tx=>seedSelfDispatch(tx,f.company));
 f.federated=await f.provision();
 const startAt=new Date(Date.now()+3600000).toISOString(),endAt=new Date(Date.now()+7200000).toISOString();
 const reservation=success(await f.erp('commands',{command:'dispatch.reserve',input:{orderId:'dispatch-order',employeeIds:['dispatch-self-employee'],startAt,endAt},idempotency_key:randomUUID()}),'actual dispatch.reserve');
 const body={command:'dispatch.assign',input:{orderId:'dispatch-order',reservationId:reservation.id,siteId:'site'},expected_version:1,idempotency_key:randomUUID()};
 const snapshot=async()=>(await db.query('SELECT kind,id,version,data FROM aggregates WHERE company_id=$1 ORDER BY kind,id',[f.company])).rows;
 const authorityRows=async()=>({credentials:(await db.query('SELECT * FROM auth_credentials WHERE company_id=$1 ORDER BY user_id',[f.company])).rows,
  bindings:(await db.query('SELECT * FROM site_identity_bindings WHERE company_id=$1 ORDER BY id',[f.company])).rows,
  sessions:(await db.query('SELECT * FROM site_auth_sessions WHERE company_id=$1 ORDER BY id',[f.company])).rows,
  history:(await db.query('SELECT (SELECT count(*)::int FROM audit_log WHERE company_id=$1) AS audits,(SELECT count(*)::int FROM outbox WHERE company_id=$1) AS outbox',[f.company])).rows[0]});
 const baseline=await snapshot(),authorityBaseline=await authorityRows();
 const effects=async()=>(await db.query("SELECT (SELECT count(*)::int FROM command_receipts WHERE company_id=$1 AND command='dispatch.assign') AS receipts,(SELECT count(*)::int FROM audit_log WHERE company_id=$1 AND action='COMMAND:dispatch.assign') AS audits,(SELECT count(*)::int FROM outbox WHERE company_id=$1 AND type='dispatch.assigned') AS assigned,(SELECT count(*)::int FROM aggregates WHERE company_id=$1 AND kind='crew_assignment') AS crews,(SELECT count(*)::int FROM aggregates WHERE company_id=$1 AND kind='task') AS tasks",[f.company])).rows[0];
 const unchanged=async()=>{assert.deepEqual(await snapshot(),baseline);assert.deepEqual(await authorityRows(),authorityBaseline);assert.deepEqual(await effects(),{receipts:0,audits:0,assigned:0,crews:0,tasks:0});};
 return {f,beforeUser,reservation,body,snapshot,effects,unchanged};
}
const oneDispatch={receipts:1,audits:1,assigned:1,crews:1,tasks:1};

check('self-dispatch preserves the canonical result, commits once, revokes old FS and recovers through fresh local login',async t=>{
 const d=await selfDispatchFixture(t),{f}=d,original=f.engine.execute.bind(f.engine);let enteredBusiness=false,ordinaryDenied=false;
 f.engine.execute=async(...args)=>{
  const result=await original(...args);
  if(!ordinaryDenied){await assert.rejects(db.transaction(f.company,'user-a',async()=>{enteredBusiness=true;}),error=>error.code==='NEEDS_REAUTH');ordinaryDenied=true;}
  return result;
 };
 const result=success(await f.erp('commands',d.body,f.federated));assert.deepEqual(Object.keys(result).sort(),['assignment','order']);
 assert.equal(result.order.id,'dispatch-order');assert.equal(result.assignment.data.orderId,result.order.id);assert.equal(result.order.data.assignmentId,result.assignment.id);
 assert.deepEqual(result.assignment.data.employeeIds,['dispatch-self-employee']);assert.equal(result.assignment.data.assignedBy,'user-a');
 assert.equal(enteredBusiness,false);assert.equal(ordinaryDenied,true);assert.deepEqual(await d.effects(),oneDispatch);
 const after=(await d.snapshot()).find(row=>row.kind==='user'&&row.id==='user-a');assert.equal(after.version,d.beforeUser.version+1);assert.deepEqual(after.data,{...d.beforeUser.data,siteIds:['site']});
 assert.ok((await f.sessions()).federated.every(row=>row.revoked_at));denied(await f.erp('me',undefined,f.federated));denied(await f.erp('commands',d.body,f.federated));
 assert.equal(JSON.stringify(result).includes('SELF_DISPATCH_SCOPE_EXPANSION'),false);assert.equal(JSON.stringify(result).includes('afterUserHash'),false);
 assert.deepEqual(success(await f.erp('commands',d.body,await f.login())),result);assert.deepEqual(await d.effects(),oneDispatch);
});

for(const variant of ['enriched result','another persisted order and assignment'])
check('self-dispatch rejects '+variant+' and rolls back its complete effect',async t=>{
 const d=await selfDispatchFixture(t),{f}=d,definition=f.engine.registry['dispatch.assign'];
 f.engine.registry['dispatch.assign']={...definition,handler:async(ctx,input)=>{
  const result=await definition.handler(ctx,input);
  if(variant==='enriched result')return {...result,privatePayload:'SYNTHETIC_DISALLOWED_EXTRA'};
  // Controlled faulty-handler result: both substituted entities really exist
  // in this transaction and match the same company/site/actor/own employee.
  // Only binding to parsed orderId/reservationId can distinguish this pair.
  const order=await ctx.tx.add('order',{...result.order.data,assignmentId:'substituted-assignment'},'substituted-order');
  const assignment=await ctx.tx.add('crew_assignment',{...result.assignment.data,orderId:order.id},'substituted-assignment');
  return {order,assignment};
 }};
 const result=await f.erp('commands',d.body,f.federated);denied(result);assert.equal(result.text.includes('SYNTHETIC_DISALLOWED_EXTRA'),false);await d.unchanged();
});

check('self-dispatch does not accept a second user version increment even if all other data match',async t=>{
 const d=await selfDispatchFixture(t),{f}=d,definition=f.engine.registry['dispatch.assign'];
 f.engine.registry['dispatch.assign']={...definition,handler:async(ctx,input)=>{const result=await definition.handler(ctx,input);const user=await ctx.tx.get('user','user-a');await ctx.tx.save(user,{...user.data});return result;}};
 denied(await f.erp('commands',d.body,f.federated));await d.unchanged();
});

const dispatchChanges=[
 {label:'post-user snapshot',status:401,code:'NEEDS_REAUTH',sql:true,apply:async(f,tx)=>tx.query("UPDATE aggregates SET data=jsonb_set(data,'{name}',to_jsonb($3::text)) WHERE company_id=$1 AND kind='user' AND id=$2",[f.company,'user-a','Synthetic changed post-user name'])},
 {label:'ERP credential',status:401,code:'NEEDS_REAUTH',sql:true,apply:async(f,tx)=>tx.query("UPDATE auth_credentials SET password_hash=$2 WHERE company_id=$1 AND user_id='user-a'",[f.company,rotatedPasswordHash])},
 {label:'binding revocation',status:401,code:'NEEDS_REAUTH',sql:true,apply:async(f,tx)=>tx.query("UPDATE site_identity_bindings SET status='REVOKED',version=version+1,revoked_at=clock_timestamp(),revoked_by='user-a' WHERE company_id=$1 AND id=$2",[f.company,f.linked.id])},
 {label:'session configuration disable',status:422,code:'MISSING_CONFIGURATION',apply:async f=>{f.flags.erp=false;}},
 {label:'site session revocation',status:503,code:'DEPENDENCY_UNAVAILABLE',apply:async f=>destroySession(f.site.db,f.siteCookie)},
 {label:'actual peer outage',status:503,code:'DEPENDENCY_UNAVAILABLE',apply:async f=>f.stopSite()}
];
for(const change of dispatchChanges){
 check('self-dispatch final pre-COMMIT check rejects '+change.label+' without retaining its receipt',async t=>{
  const d=await selfDispatchFixture(t),{f}=d,authority=f.runtime.siteSessions,verify=authority.verifySelfDispatchIn.bind(authority);let checks=0;
  authority.verifySelfDispatchIn=async(tx,...args)=>{
   // The first check validates the completed capability. The second is the
   // final transaction guard. SQL faults use that same real transaction to
   // avoid pretending a concurrent writer can bypass its held company lock.
   if(++checks===2)await change.apply(f,tx);
   return verify(tx,...args);
  };
  denied(await f.erp('commands',d.body,f.federated),change.status,change.code);assert.equal(checks,2);await d.unchanged();
 });
 check('self-dispatch response guard suppresses '+change.label+' after COMMIT while preserving exact recovery',async t=>{
  const d=await selfDispatchFixture(t),{f}=d,pause=f.gate(),execute=f.engine.execute.bind(f.engine);let once=true,committed;
  f.engine.execute=async(...args)=>{const result=await execute(...args);if(once){once=false;committed=result;await pause.pause();}return result;};
  const pending=f.erp('commands',d.body,f.federated);await bounded(pause.entered,'self-dispatch committed before response');assert.deepEqual(await d.effects(),oneDispatch);
  if(change.sql)await db.transaction(f.company,'SYNTHETIC_POST_COMMIT_MUTATION',tx=>change.apply(f,tx));else await change.apply(f);
  pause.release();const blocked=await pending;denied(blocked,change.status,change.code);assert.equal(blocked.body.order,undefined);assert.equal(blocked.body.assignment,undefined);
  assert.deepEqual(await d.effects(),oneDispatch);assert.ok((await f.sessions()).federated.every(row=>row.revoked_at));denied(await f.erp('me',undefined,f.federated));
  const local=await f.login('user-a',change.label==='ERP credential'?rotatedPassword:password);
  assert.deepEqual(success(await f.erp('commands',d.body,local)),committed);assert.deepEqual(await d.effects(),oneDispatch);
 });
}

check('disconnect during the last self-dispatch verification rolls back before COMMIT',async t=>{
 const d=await selfDispatchFixture(t),{f}=d,pause=f.gate(),authority=f.runtime.siteSessions,verify=authority.verifySelfDispatchIn.bind(authority),finished=deferred(),closed=deferred();
 let checks=0;authority.verifySelfDispatchIn=async(...args)=>{await verify(...args);if(++checks===2)await pause.pause();};
 const execute=f.engine.execute.bind(f.engine);f.engine.execute=async(...args)=>{try{return await execute(...args);}finally{finished.resolve();}};
 const label=randomUUID(),observe=(req,res)=>{if(req.headers['x-synthetic-close']===label)res.once('close',()=>closed.resolve());};
 f.httpServer.on('request',observe);t.after(()=>f.httpServer.removeListener('request',observe));const controller=f.controller();
 const pending=fetch(f.erpOrigin+'/api/v1/commands',{method:'POST',headers:{Origin:f.erpOrigin,'content-type':'application/json',Cookie:f.federated.cookie,'x-csrf-token':f.federated.csrf,'x-synthetic-close':label},
  body:JSON.stringify(d.body),signal:controller.signal}).then(()=>false,()=>true);
 await bounded(pause.entered,'last self-dispatch verification');controller.abort();assert.equal(await pending,true);await bounded(closed.promise,'actual response close');pause.release();
 await bounded(finished.promise,'self-dispatch rollback after disconnect');assert.equal(checks,2);await d.unchanged();
});
