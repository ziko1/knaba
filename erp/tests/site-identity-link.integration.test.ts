import 'reflect-metadata';
import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {NestFactory} from '@nestjs/core';
import express from 'express';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {AuthService,csrfFor,hashPassword,hashToken} from '../apps/api/auth.ts';
import {createApiModule} from '../apps/api/http.ts';
import {FederationAuthorities} from '../apps/api/site-federation-config.ts';
import {federationRawBody} from '../apps/api/site-federation-ingress.ts';
import {validationInputBudgetMiddleware} from '../apps/api/validation-budget.ts';
import {FEDERATION_ERP_PATH,FEDERATION_SITE_PATH,makeFederationRequest,makeFederationResponse,verifyFederationRequest,verifyFederationResponse,type FederationAction} from '../packages/integrations/site-federation-protocol.mjs';
import {federationAuthorityFixture} from './fixtures/site-federation.ts';

const postgres=process.env.DATABASE_URL?describe:describe.skip;
const password='Synthetic dual-session password 2026!',sourceSubject='immutable-vps-user',sourceRef='s'.repeat(43),sourceFingerprint='f'.repeat(64);
postgres('F2 dual-session link through real signed HTTP and PostgreSQL',()=>{
 let db:Database,passwordHash:string;const cleanup:Array<()=>Promise<void>>=[];
 beforeAll(async()=>{expect(process.env.APP_MODE).toBe('TEST');db=new Database();await db.migrate();passwordHash=await hashPassword(password);});
 afterEach(async()=>{vi.restoreAllMocks();await Promise.all(cleanup.splice(0).map(fn=>fn()));});afterAll(async()=>{await db?.close();});
 async function fixture(){
  const company='f2-link-'+randomUUID(),config=federationAuthorityFixture(company),engine=new Engine(db,'TEST');let registry=new FederationAuthorities([config],company,'TEST');
  const options={companyId:company,appMode:'TEST',publicOrigin:'https://erp.example.invalid'},auth=new AuthService(db,engine,options);
  await db.transaction(company,'SYNTHETIC_SETUP',async tx=>{await tx.add('company',{name:'Synthetic company'},company);for(const id of ['erp-a','erp-b'])await tx.add('user',{active:true,name:id,email:'shared@example.invalid',roles:['EMPLOYEE'],permissions:['identity.self'],siteIds:[],warehouseIds:[],customerIds:[],synthetic:true},id);await tx.query('INSERT INTO auth_credentials(company_id,user_id,password_hash) VALUES($1,$2,$3)',[company,'erp-a',passwordHash]);});
  const session=await auth.createSession('erp-a'),source={subject:sourceSubject,sessionRef:sourceRef,epoch:1,securityFingerprint:sourceFingerprint,sourcePolicyVersion:1,reauthAt:new Date().toISOString(),sessionExpiresAt:new Date(Date.now()+3600000).toISOString(),siteLabel:'Synthetic site account'};
  let afterIntrospection:(()=>Promise<void>)|undefined,sourceActive=true,sourceCalls=0;
  const sourceApp=express();sourceApp.post(FEDERATION_SITE_PATH,express.raw({type:'application/json',limit:32768}),async(req,res)=>{
   try{const request=verifyFederationRequest(config,'ERP_TO_SITE',req.headers,req.body);expect(request.envelope.action).toBe('INTROSPECT');expect(request.envelope.payload).toMatchObject({subject:source.subject,sessionRef:source.sessionRef,purpose:'LINK_CONFIRM'});sourceCalls++;
    const value=sourceActive?{active:true,...source,generation:request.generation}:{active:false};const response=makeFederationResponse(config,request,value);
    await afterIntrospection?.();res.status(response.status).set(response.headers).send(response.body);
   }catch{res.status(500).json({error:'Synthetic source failure'});}
  });
  const sourceServer=createServer(sourceApp);await new Promise<void>(resolve=>sourceServer.listen(0,'127.0.0.1',resolve));cleanup.push(()=>new Promise<void>((resolve,reject)=>{sourceServer.closeAllConnections();sourceServer.close(error=>error?reject(error):resolve());}));
  const localSource=`http://127.0.0.1:${(sourceServer.address() as AddressInfo).port}`;
  const siteFetch:typeof fetch=async(url,init)=>{expect(String(url)).toBe(config.siteOrigin+FEDERATION_SITE_PATH);return fetch(localSource+FEDERATION_SITE_PATH,init);};
  const app=await NestFactory.create(createApiModule({...options,db,engine,buildSha:'0'.repeat(40),federationAuthorities:()=>registry,federationFetch:siteFetch}),{bodyParser:false,logger:false});
  app.use(FEDERATION_ERP_PATH,federationRawBody());app.use(express.json({limit:'64kb'}));app.use(validationInputBudgetMiddleware);await app.listen(0,'127.0.0.1');cleanup.push(()=>app.close());
  const base=await app.getUrl();let generation=0,revision=0;
  const authority=async(action:FederationAction,payload:Record<string,unknown>,operationId=randomUUID(),gen=action==='BOOTSTRAP_AUTHORITY'?0:generation)=>{
   const wire=makeFederationRequest(config,'SITE_TO_ERP',action,payload,{operationId,generation:gen});const response=await fetch(base+FEDERATION_ERP_PATH,{method:'POST',headers:wire.headers,body:wire.body}),bytes=Buffer.from(await response.arrayBuffer());
   const body=verifyFederationResponse(config,wire.context,response.status,response.headers,bytes) as any;if(body.current){generation=body.current.generation;revision=body.current.revision;}return {status:response.status,body};
  };
  const setup=await authority('BOOTSTRAP_AUTHORITY',{instanceId:randomUUID()});expect(setup.status).toBe(200);expect((await authority('RECONCILE_PAGE',{cursor:null,snapshotRevision:null})).status).toBe(200);expect((await authority('ACTIVATE_AUTHORITY',{snapshotRevision:revision})).status).toBe(200);
  expect((await authority('REGISTER_SESSION',{subject:source.subject,sessionRef:source.sessionRef,epoch:source.epoch,securityFingerprint:source.securityFingerprint,sessionExpiresAt:source.sessionExpiresAt,sourcePolicyVersion:source.sourcePolicyVersion})).status).toBe(200);
  const headers=(token=session.token)=>({'content-type':'application/json',origin:options.publicOrigin,cookie:`knaba_session=${token}`,'x-csrf-token':csrfFor(token)});
  const web=async(path='',body?:unknown,token=session.token)=>fetch(base+'/api/v1/account/site-links'+path,{method:body===undefined?'GET':'POST',headers:headers(token),...body===undefined?{}:{body:JSON.stringify(body)}});
  const issue=async()=>{const response=await web('/challenge',{authorityId:config.authorityId,password});expect(response.status).toBe(201);return response.json() as Promise<any>;};
  const claim=async(code:string,patch:Record<string,unknown>={})=>authority('CLAIM',{code,subject:source.subject,sessionRef:source.sessionRef,epoch:source.epoch,securityFingerprint:source.securityFingerprint,sourcePolicyVersion:source.sourcePolicyVersion,reauthAt:source.reauthAt,siteLabel:source.siteLabel,...patch});
  const pending=async()=>{const response=await web();expect(response.status).toBe(200);return (await response.json()).challenge;};
  const confirm=(row:any,token=session.token)=>web(`/challenges/${row.id}/confirm`,{expectedVersion:row.version,subject:row.subject},token);
  return {company,config,auth,session,source,web,authority,issue,claim,pending,confirm,headers,sourceCalls:()=>sourceCalls,disable:()=>{registry=new FederationAuthorities();},enable:()=>{registry=new FederationAuthorities([config],company,'TEST');sourceActive=true;},inactive:()=>{sourceActive=false;},afterIntrospection:(hook:()=>Promise<void>)=>{afterIntrospection=hook;}};
 }
 const count=async(company:string,table:string)=>Number((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE company_id=$1`,[company])).rows[0].n);

 it('requires both current sessions and final ERP confirmation, stores only hashes and never grants sessions or roles',async()=>{
  const f=await fixture(),users=(await db.query("SELECT id,data FROM aggregates WHERE company_id=$1 AND kind='user' ORDER BY id",[f.company])).rows,sessionCount=await count(f.company,'auth_sessions');
  const issued=await f.issue();expect(issued.code).toMatch(/^KNABA-LINK-[A-Za-z0-9_-]{43}$/);expect(issued.siteUrl).toBe(f.config.siteOrigin+'/account/erp-link/');expect(issued.siteUrl).not.toContain(issued.code);
  const inspected=await f.authority('INSPECT_CHALLENGE',{code:issued.code});expect(inspected.body.receipt.result).toMatchObject({challengeId:issued.id,erpUserLabel:'erp-a'});
  expect((await f.claim(issued.code)).status).toBe(200);expect(await count(f.company,'site_identity_bindings')).toBe(0);
  const pending=await f.pending();expect(pending).toMatchObject({state:'CLAIMED',subject:sourceSubject,siteLabel:f.source.siteLabel});const result=await f.confirm(pending);expect(result.status).toBe(201);
  expect(await result.json()).toMatchObject({binding:{state:'ACTIVE',subject:sourceSubject},challenge:{state:'CONFIRMED'}});
  const binding=(await db.query('SELECT * FROM site_identity_bindings WHERE company_id=$1',[f.company])).rows[0];expect(binding.user_id).toBe('erp-a');expect(binding.site_user_id).toBe(sourceSubject);expect(await count(f.company,'auth_sessions')).toBe(sessionCount);
  expect((await db.query("SELECT id,data FROM aggregates WHERE company_id=$1 AND kind='user' ORDER BY id",[f.company])).rows).toEqual(users);
  expect(await count(f.company,'command_receipts')).toBe(0);
  for(const table of ['site_identity_link_challenges','site_federation_operations','audit_log','site_identity_bindings']){const rows=(await db.query(`SELECT * FROM ${table} WHERE company_id=$1`,[f.company])).rows;const serialized=JSON.stringify(rows);expect(serialized).not.toContain(issued.code);expect(serialized).not.toContain(password);expect(serialized).not.toContain(f.session.token);}
  expect((await f.authority('LINK_STATUS',{subject:sourceSubject,sessionRef:sourceRef,epoch:1,securityFingerprint:sourceFingerprint,sourcePolicyVersion:1})).body.receipt.result.bindings).toEqual([{bindingId:binding.id,state:'ACTIVE',version:1}]);
 });
 it('requires the original ERP cookie, not another current session for the same user',async()=>{
  const f=await fixture(),issued=await f.issue();expect((await f.claim(issued.code)).status).toBe(200);const pending=await f.pending(),other=await f.auth.createSession('erp-a');
  expect((await f.confirm(pending,other.token)).status).toBe(401);expect(f.sourceCalls()).toBe(0);expect(await count(f.company,'site_identity_bindings')).toBe(0);expect((await f.confirm(pending)).status).toBe(201);
 });
 it('denies a source fence committed after fresh online introspection but before binding commit',async()=>{
  const f=await fixture(),issued=await f.issue();await f.claim(issued.code);const pending=await f.pending();let fenced=false;
  f.afterIntrospection(async()=>{const result=await f.authority('FENCE',{subject:sourceSubject,scope:'SESSION',sessionRefs:[sourceRef],intentHash:'a'.repeat(64)});expect(result.status).toBe(200);fenced=true;});
  const response=await f.confirm(pending);expect(fenced).toBe(true);expect(response.status).toBe(401);expect(await count(f.company,'site_identity_bindings')).toBe(0);expect((await f.pending()).state).toBe('CLAIMED');
 });
 it('denies original ERP logout committed during online source I/O without issuing private success',async()=>{
  const f=await fixture(),issued=await f.issue();await f.claim(issued.code);const pending=await f.pending();let revoked=false;
  f.afterIntrospection(async()=>{await db.transaction(f.company,'SYNTHETIC_LOGOUT',async tx=>{await tx.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE company_id=$1 AND token_hash=$2',[f.company,hashToken(f.session.token)]);revoked=true;});});
  const response=await f.confirm(pending);expect(revoked).toBe(true);expect(response.status).toBe(401);expect(await response.json()).toMatchObject({code:'NEEDS_REAUTH'});expect(await count(f.company,'site_identity_bindings')).toBe(0);
 });
 it('denies credential/profile changes or disabled trust after claim even when the session row stays valid',async()=>{
  for(const change of ['credential','role','trust'] as const){
   const f=await fixture(),issued=await f.issue();await f.claim(issued.code);const pending=await f.pending();
   let changed=false;f.afterIntrospection(async()=>{if(change==='trust'){f.disable();changed=true;return;}await db.transaction(f.company,'SYNTHETIC_SECURITY_CHANGE',async tx=>{if(change==='credential')await tx.query('UPDATE auth_credentials SET password_hash=$3 WHERE company_id=$1 AND user_id=$2',[f.company,'erp-a','synthetic-replaced-verifier']);else{const user=await tx.get('user','erp-a');await tx.save(user,{...user.data,roles:['CLIENT']},user.version);}});changed=true;});
   const response=await f.confirm(pending);expect(changed).toBe(true);expect(response.status).toBeGreaterThanOrEqual(400);expect(await count(f.company,'site_identity_bindings')).toBe(0);
  }
 });
 it('fails closed for source pending denial and never treats a claim as permission',async()=>{
  const f=await fixture(),issued=await f.issue();await f.claim(issued.code);f.inactive();const response=await f.confirm(await f.pending());expect(f.sourceCalls()).toBe(1);expect(response.status).toBe(401);expect(await count(f.company,'site_identity_bindings')).toBe(0);
 });
 it('consumes the one-use proof once under concurrent confirms and never creates duplicate audit effects',async()=>{
  const f=await fixture(),issued=await f.issue();await f.claim(issued.code);const row=await f.pending();
  const responses=await Promise.all([f.confirm(row),f.confirm(row)]);expect(responses.filter(r=>r.status===201)).toHaveLength(1);expect(responses.filter(r=>r.status===409)).toHaveLength(1);expect(await count(f.company,'site_identity_bindings')).toBe(1);
  expect((await db.query("SELECT id FROM audit_log WHERE company_id=$1 AND action='SITE_IDENTITY_LINK_CONFIRMED'",[f.company])).rows).toHaveLength(1);
  expect((await f.claim(issued.code)).status).toBe(409);
 });
 it('self-unlinks with fresh ERP proof while source/trust is unavailable and preserves F1 terminal unlink',async()=>{
  const f=await fixture(),issued=await f.issue();await f.claim(issued.code);const confirmed=await f.confirm(await f.pending()),result=await confirmed.json();expect(confirmed.status).toBe(201);const before=f.sourceCalls();f.disable();f.inactive();
  const unlinked=await f.web(`/bindings/${result.binding.id}/unlink`,{expectedVersion:1,password});expect(unlinked.status).toBe(201);expect(await unlinked.json()).toMatchObject({state:'REVOKED',version:2});expect(f.sourceCalls()).toBe(before);
  expect((await f.web(`/bindings/${result.binding.id}/unlink`,{expectedVersion:2,password})).status).toBe(409);expect((await db.query('SELECT status FROM site_identity_bindings WHERE company_id=$1',[f.company])).rows[0].status).toBe('REVOKED');
  f.enable();const next=await f.issue();expect((await f.claim(next.code)).status).toBe(409);expect(await count(f.company,'site_identity_bindings')).toBe(1);
 });
 it('bounds inspection attempts and challenge issuance without retaining raw code in durable receipts',async()=>{
  const f=await fixture(),issued=await f.issue();for(let i=0;i<10;i++)expect((await f.authority('INSPECT_CHALLENGE',{code:issued.code})).status).toBe(200);
  expect((await f.authority('INSPECT_CHALLENGE',{code:issued.code})).status).toBe(429);await f.issue();await f.issue();expect((await f.web('/challenge',{authorityId:f.config.authorityId,password})).status).toBe(429);
  expect(await count(f.company,'site_identity_link_challenges')).toBe(3);expect((await db.query("SELECT id FROM site_identity_link_challenges WHERE company_id=$1 AND state='ISSUED'",[f.company])).rows).toHaveLength(1);
 });
 it('does not resolve or claim another company challenge even with the same issuer, user labels and signed key',async()=>{
  const first=await fixture(),other=await fixture(),issued=await first.issue();
  expect((await other.authority('INSPECT_CHALLENGE',{code:issued.code})).status).toBe(409);expect((await other.claim(issued.code)).status).toBe(409);
  expect((await first.pending()).state).toBe('ISSUED');expect(await count(first.company,'site_identity_bindings')).toBe(0);expect(await count(other.company,'site_identity_bindings')).toBe(0);
 });
 it('rolls back binding, proof consumption and audit if the real SQL deadline expires after the F1 write',async()=>{
  const f=await fixture(),original=await f.issue(),id=randomUUID(),code='KNABA-LINK-'+randomBytes(32).toString('base64url'),hash=createHash('sha256').update('KNABA-SITE-LINK-v1\0'+code).digest('hex');
  await db.query(`WITH instant AS (SELECT clock_timestamp() AS now) INSERT INTO site_identity_link_challenges(company_id,id,authority_id,user_id,session_hash,code_hash,credential_fingerprint,config_fingerprint,state,created_at,expires_at) SELECT c.company_id,$3,c.authority_id,c.user_id,c.session_hash,$4,c.credential_fingerprint,c.config_fingerprint,'ISSUED',instant.now-interval '4 minutes 58 seconds',instant.now+interval '2 seconds' FROM site_identity_link_challenges c CROSS JOIN instant WHERE c.company_id=$1 AND c.id=$2`,[f.company,original.id,id,hash]);
  expect((await f.claim(code)).status).toBe(200);let wrote=false;const transaction=db.transaction.bind(db);
  vi.spyOn(db,'transaction').mockImplementation(((company:any,actor:any,callback:any,timeout:any,readOnly:any)=>transaction(company,actor,async tx=>{const query=tx.query.bind(tx);tx.query=async(statement:string,params?:any[])=>{const result=await query(statement,params);if(company===f.company&&statement.includes('INSERT INTO site_identity_bindings')){wrote=true;await query('SELECT pg_sleep(2.1)');}return result;};return callback(tx);},timeout,readOnly)) as typeof db.transaction);
  const response=await f.confirm({id,version:2,subject:sourceSubject});expect(wrote).toBe(true);expect(response.status).toBe(409);expect(await count(f.company,'site_identity_bindings')).toBe(0);
  expect((await db.query('SELECT state FROM site_identity_link_challenges WHERE company_id=$1 AND id=$2',[f.company,id])).rows[0].state).toBe('CLAIMED');expect((await db.query("SELECT id FROM audit_log WHERE company_id=$1 AND action='SITE_IDENTITY_LINK_CONFIRMED'",[f.company])).rows).toHaveLength(0);
 });
 it('protects original challenge ownership and the claimed source principal against direct retarget or deletion',async()=>{
  const f=await fixture(),issued=await f.issue();await f.claim(issued.code);
  for(const statement of ["UPDATE site_identity_link_challenges SET user_id='erp-b' WHERE company_id=$1 AND id=$2","UPDATE site_identity_link_challenges SET source_subject='other-source' WHERE company_id=$1 AND id=$2","DELETE FROM site_identity_link_challenges WHERE company_id=$1 AND id=$2"]){await expect(db.query(statement,[f.company,issued.id])).rejects.toMatchObject({code:'23514'});}
  expect((await f.pending()).subject).toBe(sourceSubject);
 });
});
