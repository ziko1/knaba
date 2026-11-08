import 'reflect-metadata';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {NestFactory} from '@nestjs/core';
import type {INestApplication} from '@nestjs/common';
import express from 'express';
import * as OTPAuth from 'otpauth';
import {Database,type PgTransaction} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {createApiModule,type ApiRuntime} from '../apps/api/http.ts';
import {hashPassword,hashToken,openSecret} from '../apps/api/auth.ts';
import {PostgresPrivateBlobStore} from '../packages/storage/index.ts';
import type {Data} from '../packages/domain/core.ts';

// Actual Nest HTTP, AuthService, Engine, PostgreSQL and private PostgreSQL blobs.
// Wrappers below introduce controlled race barriers/faults; they do not replace
// credential validation, SQL transactions or domain command implementations.
// Local missing PostgreSQL is NOT_RUN. A CI invocation cannot silently skip it.
const ci=!!process.env.CI&&process.env.CI!=='false';
if(ci&&!process.env.DATABASE_URL)throw new Error('REQUEST_AUTHORITY_CI_REQUIRES_ACTUAL_POSTGRESQL');
const postgres=process.env.DATABASE_URL?describe:describe.skip;
const password='Synthetic-request-authority-password-2026';
const encryptionKey='SYNTHETIC_REQUEST_AUTHORITY_SEALING_KEY_2026';
const command='notification.read';
type Identity={userId:string;token:string;cookie:string;csrf:string};
type Reply={status:number;body:Data;headers:Headers;text:string};

function deferred(){
 let resolve!:()=>void;
 const promise=new Promise<void>(done=>{resolve=()=>done();});
 return {promise,resolve};
}
async function bounded<T>(promise:Promise<T>,label:string,milliseconds=8000):Promise<T>{
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<never>((_resolve,reject)=>{
  timeout=setTimeout(()=>reject(new Error('SYNTHETIC_BARRIER_TIMEOUT: '+label)),milliseconds);
 })]);}finally{if(timeout)clearTimeout(timeout);}
}
function gate(){
 const entered=deferred(),released=deferred();
 return {entered:entered.promise,release:()=>released.resolve(),pause:async()=>{entered.resolve();await bounded(released.promise,'release');}};
}
function success(response:Reply){
 expect([200,201].includes(response.status),'expected success; status='+response.status+' code='+String(response.body.code)).toBe(true);
 return response.body;
}
function rejected(response:Reply,code='NEEDS_REAUTH',status=401){
 expect(response.status).toBe(status);expect(response.body.code).toBe(code);
}

postgres('F4-A actual PostgreSQL and Nest request authority fences',()=>{
 let db:Database,engine:Engine,app:INestApplication|undefined,store:PostgresPrivateBlobStore;
 let company:string,origin:string,alice:Identity,passwordHash:string;
 let savedEncryptionKey:string|undefined;
 let releaseAll:Array<()=>void>,closeControllers:AbortController[];
 let responseClosed:Map<string,ReturnType<typeof deferred>>;
 const privateBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yR7sAAAAASUVORK5CYII=','base64');
 const notification=(userId='alice')=>'notice-'+userId;
 const newGate=()=>{const value=gate();releaseAll.push(value.release);return value;};
 const newController=()=>{const value=new AbortController();closeControllers.push(value);return value;};

 beforeAll(async()=>{
  expect(process.env.APP_MODE).toBe('TEST');
  const target=new URL(process.env.DATABASE_URL!);
  expect(['postgres:','postgresql:'].includes(target.protocol)).toBe(true);
  expect(['127.0.0.1','localhost'].includes(target.hostname)).toBe(true);
  expect(/^\/knaba_(ci|test|bridge_ci|bridge_test)$/.test(target.pathname)).toBe(true);
  savedEncryptionKey=process.env.AUTH_ENCRYPTION_KEY;
  process.env.AUTH_ENCRYPTION_KEY=encryptionKey;
  db=new Database();await db.migrate();passwordHash=await hashPassword(password);
 });
 beforeEach(async()=>{
  releaseAll=[];closeControllers=[];responseClosed=new Map();
  company='request-authority-'+randomUUID();engine=new Engine(db,'TEST');store=new PostgresPrivateBlobStore(db);
  await db.transaction(company,'SYNTHETIC_REQUEST_AUTHORITY_SETUP',async tx=>{
   await tx.add('company',{name:'Synthetic request authority company',synthetic:true},company);
   await tx.add('site',{name:'Synthetic request authority site',active:true},'site');
   for(const userId of ['alice','bob']){
    await tx.add('user',{name:'Synthetic '+userId,email:userId+'@example.test',active:true,roles:['EMPLOYEE'],
     permissions:['chat.read','identity.self','media.read','media.upload'],siteIds:['site'],warehouseIds:[],synthetic:true},userId);
    await tx.query('INSERT INTO auth_credentials(company_id,user_id,password_hash) VALUES($1,$2,$3)',[company,userId,passwordHash]);
    await tx.add('notification',{recipient_id:userId,title:'Synthetic private notice for '+userId,channel:'WEB',status:'WEB_AVAILABLE'},notification(userId));
   }
   const blobKey=company+'-private-file';
   await store.put({id:blobKey,companyId:company,ownerId:'alice',bytes:privateBytes,mimeType:'image/png'},tx);
   await tx.add('media_asset',{uploadedBy:'alice',siteId:'site',blobKey,mimeType:'image/png',visibility:'INTERNAL',state:'UPLOADED'},'private-file');
  });
  const runtime:ApiRuntime={db,engine,storage:store,companyId:company,appMode:'TEST',buildSha:'SYNTHETIC_REQUEST_AUTHORITY',
   encryptionKey,publicOrigin:undefined};
  app=await NestFactory.create(createApiModule(runtime),{bodyParser:false,logger:false});
  app.use((req:express.Request,res:express.Response,next:express.NextFunction)=>{
   const label=req.get('x-synthetic-close');
   if(label){const observed=responseClosed.get(label);if(observed)res.once('close',()=>observed.resolve());}
   next();
  });
  app.use(express.json({limit:'8kb',verify:(req,_res,bytes)=>{(req as express.Request&{rawBody?:Buffer}).rawBody=bytes;}}));
  await app.init();await app.listen(0,'127.0.0.1');
  origin='http://127.0.0.1:'+app.getHttpServer().address().port;runtime.publicOrigin=origin;
  alice=await login('alice');
 });
 afterEach(async()=>{
  for(const release of releaseAll??[])release();
  for(const controller of closeControllers??[])controller.abort();
  if(app){app.getHttpServer().closeAllConnections();await app.close();app=undefined;}
 });
 afterAll(async()=>{
  try{await db?.close();}finally{
   if(savedEncryptionKey===undefined)delete process.env.AUTH_ENCRYPTION_KEY;
   else process.env.AUTH_ENCRYPTION_KEY=savedEncryptionKey;
  }
 });

 async function request(path:string,body?:Data,identity?:Identity,headers:Record<string,string>={},signal?:AbortSignal):Promise<Reply>{
  const response=await fetch(origin+'/api/v1/'+path,{method:body===undefined?'GET':'POST',redirect:'manual',
   headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),
    ...(identity?{Cookie:identity.cookie,'x-csrf-token':identity.csrf}:{}),...headers},
   body:body===undefined?undefined:JSON.stringify(body),signal:signal??AbortSignal.timeout(12000)});
  const text=await response.text();
  let value:Data={};try{value=JSON.parse(text);}catch{/* Binary payloads are asserted separately. */}
  return {status:response.status,body:value,headers:response.headers,text};
 }
 async function login(userId='alice',currentPassword=password):Promise<Identity>{
  const response=await request('auth/login',{email:userId+'@example.test',password:currentPassword}),body=success(response);
  const match=/knaba_session=([^;]+)/.exec(response.headers.get('set-cookie')??'');
  expect(Boolean(match),'login must issue a real ERP session cookie').toBe(true);
  expect(typeof body.csrfToken==='string').toBe(true);
  return {userId,token:match![1]!,cookie:'knaba_session='+match![1],csrf:body.csrfToken};
 }
 const envelope=(userId='alice',key=randomUUID())=>({command,input:{notification_id:notification(userId)},expected_version:1,idempotency_key:key});
 const read=(identity=alice,key=randomUUID())=>request('commands',envelope(identity.userId,key),identity);
 async function state(userId='alice'){
  return (await db.query('SELECT version,data FROM aggregates WHERE company_id=$1 AND kind=$2 AND id=$3',[company,'notification',notification(userId)])).rows[0];
 }
 async function effects(userId='alice'){
  return (await db.query("SELECT (SELECT count(*)::int FROM command_receipts WHERE company_id=$1 AND actor_id=$2 AND command='notification.read') AS receipts,(SELECT count(*)::int FROM audit_log WHERE company_id=$1 AND actor_id=$2 AND action='COMMAND:notification.read') AS audits",[company,userId])).rows[0];
 }
 async function unchanged(userId='alice'){
  expect((await state(userId)).version).toBe(1);expect((await state(userId)).data.read_at).toBeUndefined();
  expect(await effects(userId)).toEqual({receipts:0,audits:0});
 }
 function pauseBeforeCommand(){
  const paused=newGate(),original=engine.execute.bind(engine);let once=true;
  engine.execute=async(actor,name,input)=>{
   if(once&&name===command){once=false;await paused.pause();}
   return original(actor,name,input);
  };
  return paused;
 }
 async function issueDevice(extraPermissions:string[]=[]){
  const token=randomBytes(32).toString('base64url');
  await db.transaction(company,'SYNTHETIC_DEVICE_SETUP',async tx=>{
   if(extraPermissions.length){const user=await tx.get('user','alice');await tx.save(user,{...user.data,permissions:[...user.data.permissions,...extraPermissions]});}
   await tx.add('device',{active:true,employeeId:'alice',platform:'ANDROID',credentialType:'OPAQUE_BEARER',
    tokenHash:hashToken(token),tokenExpiresAt:new Date(Date.now()+3600000).toISOString(),synthetic:true},'device');
  });
  return {token,headers:{Authorization:'Bearer '+token}};
 }

 it('keeps canonical command receipt recovery available to a fresh same-user session, with exactly one effect',async()=>{
  const key=randomUUID(),first=success(await read(alice,key));
  expect(first).toMatchObject({notification_id:notification(),version:2});expect(await effects()).toEqual({receipts:1,audits:1});
  expect(success(await request('auth/logout',{},alice))).toEqual({ok:true});
  rejected(await read(alice,key));
  const fresh=await login();expect(fresh.token===alice.token).toBe(false);
  expect(success(await read(fresh,key))).toEqual(first);expect(await effects()).toEqual({receipts:1,audits:1});
  expect((await state()).version).toBe(2);
  const stored=JSON.stringify((await db.query('SELECT result,authorization_hash FROM command_receipts WHERE company_id=$1',[company])).rows);
  for(const credential of [alice.token,fresh.token,hashToken(alice.token),hashToken(fresh.token)])expect(stored.includes(credential)).toBe(false);
 });

 it('rejects logout in the gap between cookie authentication and the actual command transaction',async()=>{
  const paused=pauseBeforeCommand(),pending=read();
  await bounded(paused.entered,'authenticated command');
  expect(success(await request('auth/logout',{},alice))).toEqual({ok:true});
  paused.release();rejected(await pending);await unchanged();
 });

 it('checks the original session before returning a cached command receipt',async()=>{
  const key=randomUUID();success(await read(alice,key));const paused=pauseBeforeCommand(),pending=read(alice,key);
  await bounded(paused.entered,'receipt replay');
  success(await request('auth/logout',{},alice));paused.release();rejected(await pending);
  expect(await effects()).toEqual({receipts:1,audits:1});expect((await state()).version).toBe(2);
 });

 it('rejects logout after authentication but before an entity page reads private rows',async()=>{
  const paused=newGate(),original=engine.readEntitiesPage.bind(engine);let once=true;
  engine.readEntitiesPage=async(...args)=>{if(once){once=false;await paused.pause();}return original(...args);};
  const pending=request('entities/notification',undefined,alice);
  await bounded(paused.entered,'authenticated entity page');success(await request('auth/logout',{},alice));
  paused.release();const response=await pending;rejected(response);
  expect(response.text.includes('Synthetic private notice')).toBe(false);await unchanged();
 });

 it('does not adopt the proof of a concurrent same-user session or revoke that other session',async()=>{
  const other=await login(),paused=pauseBeforeCommand(),pending=read(alice);
  await bounded(paused.entered,'first session command');
  const page=success(await request('entities/notification',undefined,other));expect(Array.isArray(page.items)).toBe(true);
  success(await request('auth/logout',{},alice));paused.release();rejected(await pending);
  expect(success(await request('me',undefined,other)).actor.userId).toBe('alice');await unchanged();
 });

 it('refuses an otherwise real user substituted after authentication',async()=>{
  const original=engine.execute.bind(engine);
  engine.execute=(actor,name,input)=>original({...actor,userId:'bob'},name,{...input,input:{notification_id:notification('bob')}});
  rejected(await read());await unchanged('alice');await unchanged('bob');
 });

 it('refuses an otherwise valid foreign-company transaction after authentication',async()=>{
  const foreign=company+'-foreign';
  await db.transaction(foreign,'SYNTHETIC_FOREIGN_COMPANY',async tx=>{
   await tx.add('company',{synthetic:true},foreign);
   await tx.add('user',{active:true,roles:['EMPLOYEE'],permissions:['chat.read'],siteIds:[],synthetic:true},'alice');
   await tx.add('notification',{recipient_id:'alice',title:'Synthetic foreign notice'},notification());
  });
  const original=engine.execute.bind(engine);
  engine.execute=(actor,name,input)=>original({...actor,companyId:foreign},name,input);
  rejected(await read());await unchanged();
  expect((await db.query('SELECT version FROM aggregates WHERE company_id=$1 AND kind=$2 AND id=$3',[foreign,'notification',notification()])).rows[0].version).toBe(1);
  expect((await db.query('SELECT idempotency_key FROM command_receipts WHERE company_id=$1',[foreign])).rows).toHaveLength(0);
 });

 it('rolls back a real command effect when the known session expires before the final guard',async()=>{
  const paused=newGate(),definition=engine.registry[command]!;
  engine.registry[command]={...definition,handler:async(ctx,input)=>{const result=await definition.handler(ctx,input);await paused.pause();return result;}};
  const expiresAt=Date.now()+3000;
  await db.query('UPDATE auth_sessions SET expires_at=$3 WHERE company_id=$1 AND token_hash=$2',[company,hashToken(alice.token),new Date(expiresAt).toISOString()]);
  const pending=read();await bounded(paused.entered,'effect before session expiry');
  await delay(Math.max(0,expiresAt-Date.now()+35));paused.release();rejected(await pending);await unchanged();
 });

 it('does not grant a minimal-ACK bypass to an arbitrary SQL revocation inside an ordinary command',async()=>{
  const definition=engine.registry[command]!;
  engine.registry[command]={...definition,handler:async(ctx,input)=>{
   await definition.handler(ctx,input);
   await (ctx.tx as PgTransaction).query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE company_id=$1 AND token_hash=$2',[company,hashToken(alice.token)]);
   return {ok:true};
  }};
  rejected(await read());await unchanged();
  expect((await db.query('SELECT revoked_at FROM auth_sessions WHERE company_id=$1 AND token_hash=$2',[company,hashToken(alice.token)])).rows[0].revoked_at).toBeNull();
  expect(success(await request('me',undefined,alice)).actor.userId).toBe('alice');
 });

 it('commits canonical own-password rotation and returns only the explicit reauthentication acknowledgement',async()=>{
  const other=await login(),nextPassword='Synthetic-request-authority-new-password-2026';
  const response=await request('commands',{command:'user.password.rotate',input:{currentPassword:password,newPassword:nextPassword},idempotency_key:randomUUID()},alice);
  expect(success(response)).toEqual({ok:true,reauthenticationRequired:true});
  rejected(await request('me',undefined,alice));rejected(await request('me',undefined,other));
  rejected(await request('auth/login',{email:'alice@example.test',password}));
  const fresh=await login('alice',nextPassword);expect(success(await request('me',undefined,fresh)).actor.userId).toBe('alice');
  expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='identity.password_rotated'",[company])).rows).toHaveLength(1);
  expect((await db.query("SELECT idempotency_key FROM command_receipts WHERE company_id=$1 AND command='user.password.rotate'",[company])).rows).toHaveLength(1);
 });

 it('commits canonical own-MFA configuration without returning the secret or permitting the old session',async()=>{
  const secret='JBSWY3DPEHPK3PXP',otp=new OTPAuth.TOTP({issuer:'KNABA DE',algorithm:'SHA1',digits:6,period:30,secret:OTPAuth.Secret.fromBase32(secret)}).generate();
  const response=await request('commands',{command:'user.mfa.configure',input:{currentPassword:password,secret,otp},idempotency_key:randomUUID()},alice);
  expect(success(response)).toEqual({ok:true,reauthenticationRequired:true});expect(response.text.includes(secret)).toBe(false);
  const credential=(await db.query('SELECT totp_secret,totp_last_counter FROM auth_credentials WHERE company_id=$1 AND user_id=$2',[company,'alice'])).rows[0];
  expect(credential.totp_secret===secret).toBe(false);expect(openSecret(credential.totp_secret,encryptionKey)===secret).toBe(true);
  expect(Number(credential.totp_last_counter)).toBeGreaterThan(0);rejected(await request('me',undefined,alice));
  expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='identity.mfa_configured'",[company])).rows).toHaveLength(1);
 });

 for(const change of ['revoked','rotated'] as const)it('rejects an authenticated device '+change+' before the generic command transaction',async()=>{
  const deviceToken=randomBytes(32).toString('base64url');
  await db.transaction(company,'SYNTHETIC_DEVICE_SETUP',tx=>tx.add('device',{active:true,employeeId:'alice',platform:'ANDROID',credentialType:'OPAQUE_BEARER',
   tokenHash:hashToken(deviceToken),tokenExpiresAt:new Date(Date.now()+3600000).toISOString(),synthetic:true},'device'));
  const paused=pauseBeforeCommand(),pending=request('commands',envelope(),undefined,{Authorization:'Bearer '+deviceToken});
  await bounded(paused.entered,'authenticated device command');
  await db.transaction(company,'SYNTHETIC_DEVICE_CHANGE',async tx=>{
   const device=await tx.get('device','device');
   await tx.save(device,{...device.data,...(change==='revoked'?{active:false,revokedAt:new Date().toISOString()}:{tokenHash:hashToken(randomBytes(32).toString('base64url'))})});
  });
  paused.release();rejected(await pending);await unchanged();
 });

 it('commits canonical bearer self-revocation with its exact receipt, denies the old bearer and permits same-user cookie recovery',async()=>{
  const device=await issueDevice(['device.manage']);
  const body={command:'device.revoke',input:{deviceId:'device',reason:'Synthetic own-device retirement'},expected_version:1,idempotency_key:randomUUID()};
  const first=success(await request('commands',body,undefined,device.headers));
  expect(first).toMatchObject({kind:'device',id:'device',companyId:company,version:2,data:{employeeId:'alice',active:false,revocationReason:body.input.reason}});
  expect(first.data.tokenHash).toBe(hashToken(device.token));expect(typeof first.data.revokedAt).toBe('string');
  rejected(await request('me',undefined,undefined,device.headers));
  rejected(await request('commands',body,undefined,device.headers));
  expect(success(await request('commands',body,alice))).toEqual(first);
  expect((await db.query("SELECT result FROM command_receipts WHERE company_id=$1 AND command='device.revoke'",[company])).rows).toEqual([{result:first}]);
  expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='device.revoked'",[company])).rows).toHaveLength(1);
 });

 it('preserves canonical bearer device.bind while retiring the old credential and recovering the exact new-device receipt once',async()=>{
  const device=await issueDevice(['device.self']),enrollmentToken=randomBytes(32).toString('base64url');
  await db.transaction(company,'SYNTHETIC_DEVICE_ENROLLMENT',async tx=>{
   await tx.add('device_enrollment',{employeeId:'alice',tokenHash:hashToken(enrollmentToken),expiresAt:new Date(Date.now()+60000).toISOString(),consumedAt:null},'enrollment');
   await tx.add('shift',{employeeId:'alice',deviceId:'device',state:'ACTIVE'},'active-shift');
  });
  const body={command:'device.bind',input:{enrollmentId:'enrollment',token:enrollmentToken,platform:'IOS',deviceName:'Synthetic replacement device',publicKey:'SYNTHETIC_PUBLIC_KEY_FOR_LEGACY_BIND'},idempotency_key:randomUUID()};
  const first=success(await request('commands',body,undefined,device.headers));
  expect(first).toMatchObject({kind:'device',companyId:company,version:1,data:{employeeId:'alice',active:true,platform:'IOS',publicKey:body.input.publicKey}});
  expect(typeof first.id).toBe('string');expect(first.id).not.toBe('device');
  const stored=await db.transaction(company,'SYNTHETIC_DEVICE_ASSERTIONS',async tx=>({
   old:await tx.get('device','device'),enrollment:await tx.get('device_enrollment','enrollment'),shift:await tx.get('shift','active-shift')
  }));
  expect(stored.old).toMatchObject({version:2,data:{active:false,revocationReason:'REPLACED'}});
  expect(stored.enrollment.data.deviceId).toBe(first.id);expect(typeof stored.enrollment.data.consumedAt).toBe('string');
  expect(stored.shift.data.deviceId).toBe(first.id);
  rejected(await request('me',undefined,undefined,device.headers));
  rejected(await request('commands',body,undefined,device.headers));
  expect(success(await request('commands',body,alice))).toEqual(first);
  expect((await db.query("SELECT result FROM command_receipts WHERE company_id=$1 AND command='device.bind'",[company])).rows).toEqual([{result:first}]);
  expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='device.bound'",[company])).rows).toHaveLength(1);
  expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='device.revoked'",[company])).rows).toHaveLength(1);
 });

 it('rolls back retirement and all command effects when a handler enriches the exact allowed device result',async()=>{
  const device=await issueDevice(['device.manage']),definition=engine.registry['device.revoke']!;
  engine.registry['device.revoke']={...definition,handler:async(ctx,input)=>({...await definition.handler(ctx,input),privatePayload:'SYNTHETIC_DISALLOWED_EXTRA'})};
  const response=await request('commands',{command:'device.revoke',input:{deviceId:'device',reason:'Synthetic rejected retirement'},expected_version:1,idempotency_key:randomUUID()},undefined,device.headers);
  rejected(response);expect(response.text.includes('SYNTHETIC_DISALLOWED_EXTRA')).toBe(false);
  const row=(await db.query("SELECT version,data FROM aggregates WHERE company_id=$1 AND kind='device' AND id='device'",[company])).rows[0];
  expect(row.version).toBe(1);expect(row.data.active).toBe(true);expect(row.data.revokedAt).toBeUndefined();
  expect((await db.query("SELECT idempotency_key FROM command_receipts WHERE company_id=$1 AND command='device.revoke'",[company])).rows).toHaveLength(0);
  expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='device.revoked'",[company])).rows).toHaveLength(0);
  expect(success(await request('me',undefined,undefined,device.headers)).actor.userId).toBe('alice');
 });

 it('rejects bearer-only cookie logout without claiming or performing device revocation',async()=>{
  const device=await issueDevice();
  const response=await request('auth/logout',{},undefined,device.headers);
  rejected(response);expect(response.headers.get('set-cookie')).toBeNull();
  expect(success(await request('me',undefined,undefined,device.headers)).actor.userId).toBe('alice');
  expect(success(await request('me',undefined,alice)).actor.userId).toBe('alice');
 });

 it('does not send private blob bytes after logout during the actual storage read',async()=>{
  const control=await fetch(origin+'/api/v1/media/private-file/file',{headers:{Cookie:alice.cookie},signal:AbortSignal.timeout(8000)});
  expect(control.status).toBe(200);expect(Buffer.from(await control.arrayBuffer()).equals(privateBytes)).toBe(true);
  const paused=newGate(),original=store.get.bind(store);let once=true;
  store.get=async(...args)=>{const result=await original(...args);if(once){once=false;await paused.pause();}return result;};
  const pending=request('media/private-file/file',undefined,alice);
  await bounded(paused.entered,'actual private blob read');success(await request('auth/logout',{},alice));
  paused.release();const response=await pending;rejected(response);expect(Buffer.from(response.text).equals(privateBytes)).toBe(false);
 });

 it('rechecks client-copy selection after actual role replacement while an original bearer file read is paused',async()=>{
  const device=await issueDevice(),clientBytes=Buffer.from('SYNTHETIC_REDACTED_CLIENT_COPY');
  const rawKey=company+'-approved-raw',clientKey=company+'-approved-client';
  await db.transaction(company,'SYNTHETIC_CLIENT_COPY_SETUP',async tx=>{
   const owner=await tx.get('user','bob');await tx.save(owner,{...owner.data,roles:['OWNER'],permissions:['identity.manage','role.manage','scope.company']});
   await tx.add('customer',{name:'Synthetic customer',active:true},'customer');
   const site=await tx.get('site','site');await tx.save(site,{...site.data,customerId:'customer'});
   await tx.add('customer_membership',{userId:'alice',customerId:'customer',active:true,permissions:['VIEW'],siteIds:['site']},'membership');
   await store.put({id:rawKey,companyId:company,ownerId:'bob',bytes:privateBytes,mimeType:'image/png'},tx);
   await store.put({id:clientKey,companyId:company,ownerId:'bob',bytes:clientBytes,mimeType:'image/png'},tx);
   await tx.add('media_asset',{uploadedBy:'bob',siteId:'site',blobKey:rawKey,clientBlobKey:clientKey,mimeType:'image/png',visibility:'CLIENT_AFTER_APPROVAL',state:'APPROVED_FOR_CLIENT'},'approved-file');
  });
  const owner=await login('bob');
  const control=await fetch(origin+'/api/v1/media/approved-file/file',{headers:device.headers,signal:AbortSignal.timeout(8000)});
  expect(control.status).toBe(200);expect(Buffer.from(await control.arrayBuffer()).equals(privateBytes)).toBe(true);
  const rawFileETag=control.headers.get('etag');expect(rawFileETag).not.toBeNull();
  const paused=newGate(),original=store.get.bind(store);let once=true;
  store.get=async(...args)=>{const result=await original(...args);if(once&&args[1]===rawKey){once=false;await paused.pause();}return result;};
  const pending=request('media/approved-file/file',undefined,undefined,device.headers);
  await bounded(paused.entered,'original approved-file read');
  const changed=success(await request('commands',{command:'user.roles',input:{userId:'alice',roles:['CLIENT'],permissions:[],siteIds:['site'],warehouseIds:[],reason:'Synthetic role reduction during file I/O'},expected_version:1,idempotency_key:randomUUID()},owner));
  expect(changed.roles).toEqual(['CLIENT']);paused.release();
  const blocked=await pending;rejected(blocked,'NOT_FOUND_SAFE',404);expect(blocked.headers.get('etag')).not.toBe(rawFileETag);
  expect(blocked.headers.get('content-disposition')).toBeNull();
  expect(blocked.headers.get('content-type')).toContain('application/json');
  const permitted=await fetch(origin+'/api/v1/media/approved-file/file',{headers:device.headers,signal:AbortSignal.timeout(8000)});
  expect(permitted.status).toBe(200);expect(Buffer.from(await permitted.arrayBuffer()).equals(clientBytes)).toBe(true);
 });

 it('does not leak either SSE slot when final session checks reject two opening handshakes',async()=>{
  const original=db.transaction.bind(db);let opening:ReturnType<typeof gate>|undefined;
  db.transaction=async<T>(companyId:string,actorId:string,fn:(tx:PgTransaction)=>Promise<T>,timeoutMs?:number,readOnly=false):Promise<T>=>{
   const result=await original(companyId,actorId,fn,timeoutMs,readOnly);
   // The baseline authority fingerprint has committed and released its company
   // lock before this barrier. Logout can therefore finish without a deadlock.
   if(opening&&readOnly&&companyId===company&&actorId==='alice'&&typeof result==='string'&&/^[a-f0-9]{64}$/.test(result)){
    const paused=opening;opening=undefined;await paused.pause();
   }
   return result;
  };
  try{
   for(let attempt=0;attempt<2;attempt++){
    const session=attempt===0?alice:await login(),paused=newGate();opening=paused;
    const pending=request('events',undefined,session);
    await bounded(paused.entered,'SSE initial fingerprint');success(await request('auth/logout',{},session));
    paused.release();rejected(await pending);
   }
   const session=await login(),controller=newController();
   try{
    const stream=await fetch(origin+'/api/v1/events',{headers:{Cookie:session.cookie},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
    expect(stream.status).toBe(200);expect(stream.headers.get('content-type')?.startsWith('text/event-stream')).toBe(true);
   }finally{controller.abort();}
  }finally{db.transaction=original;}
 });

 it('suppresses an SSE update read before logout and closes the actual connection',async()=>{
  const paused=newGate(),original=engine.readEntities.bind(engine);let once=true;
  engine.readEntities=async(actor,kind)=>{const rows=await original(actor,kind);if(once&&kind==='notification'){once=false;await paused.pause();}return rows;};
  const controller=newController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
   const stream=await fetch(origin+'/api/v1/events',{headers:{Cookie:alice.cookie},signal:controller.signal});
   expect(stream.status).toBe(200);expect(stream.headers.get('content-type')?.startsWith('text/event-stream')).toBe(true);
   await bounded(paused.entered,'SSE private read');success(await request('auth/logout',{},alice));paused.release();
   const text=await bounded(stream.text(),'SSE closure');
   expect(text.includes('event: access_revoked')).toBe(true);expect(text.includes('event: update')).toBe(false);
   expect(text.includes(notification())).toBe(false);
  }finally{clearTimeout(timeout);controller.abort();paused.release();}
 });

 it('rolls back an unfinished command after the client disconnects instead of retaining a detached request authority',async()=>{
  const paused=newGate(),definition=engine.registry[command]!,finished=deferred();
  engine.registry[command]={...definition,handler:async(ctx,input)=>{const result=await definition.handler(ctx,input);await paused.pause();return result;}};
  const original=engine.execute.bind(engine);engine.execute=async(...args)=>{try{return await original(...args);}finally{finished.resolve();}};
  const controller=newController(),label=randomUUID(),closed=deferred();responseClosed.set(label,closed);
  const pending=request('commands',envelope(),alice,{'x-synthetic-close':label},controller.signal).then(()=>false,()=>true);
  await bounded(paused.entered,'command before client cancellation');controller.abort();
  expect(await pending).toBe(true);await bounded(closed.promise,'actual HTTP close');paused.release();
  await bounded(finished.promise,'transaction rollback after close');await unchanged();
 });
});
