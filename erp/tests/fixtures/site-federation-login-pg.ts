import 'reflect-metadata';
import express from 'express';
import {expect} from 'vitest';
import {NestFactory} from '@nestjs/core';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {randomUUID} from 'node:crypto';
import {Database} from '../../apps/api/database.ts';
import {Engine} from '../../apps/api/engine.ts';
import {AuthService,csrfFor,sealSecret} from '../../apps/api/auth.ts';
import {createApiModule} from '../../apps/api/http.ts';
import {FederationAuthorities} from '../../apps/api/site-federation-config.ts';
import {SiteIdentityBindings} from '../../apps/api/site-identity-bindings.ts';
import {federationRawBody} from '../../apps/api/site-federation-ingress.ts';
import {validationInputBudgetMiddleware} from '../../apps/api/validation-budget.ts';
import {identityCommands} from '../../packages/domain/identity.ts';
import {PostgresPrivateBlobStore} from '../../packages/storage/index.ts';
import {FEDERATION_ERP_PATH,FEDERATION_SITE_PATH,makeFederationRequest,makeFederationResponse,verifyFederationRequest,verifyFederationResponse,type FederationAction} from '../../packages/integrations/site-federation-protocol.mjs';
import {normalizeFederationLoginPolicy,normalizeSourceLoginPolicy,sourceLoginPolicyFingerprint,parseFederationLoginIntrospection,pkceS256,type FederationLoginPolicy} from '../../packages/integrations/site-federation-login-protocol.mjs';
import {federationAuthorityFixture} from './site-federation.ts';

export const syntheticLoginPassword='Synthetic F3 ERP password 2026!';
export const syntheticLoginSecret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const encryptionKey='synthetic-f3-encryption-key-32-characters';
export function responseCookie(response:Response,name:string){const header=response.headers.getSetCookie().find(value=>value.startsWith(name+'='));return header?decodeURIComponent(header.slice(name.length+1).split(';')[0]!):undefined;}
export async function createFederationLoginPgFixture(db:Database,passwordHash:string,cleanup:Array<()=>Promise<void>>,patch:{mode?:string;roles?:string[];mfa?:boolean}={}){
 const company='f3-login-'+randomUUID(),config=federationAuthorityFixture(company),mode=patch.mode??'TEST',engine=new Engine(db,mode);Object.assign(engine.registry,identityCommands);
 const authorities=new FederationAuthorities([config],company,'TEST');
 let policy:FederationLoginPolicy|null=normalizeFederationLoginPolicy({enabled:true,policyVersion:1,authorizationIssuer:config.erpOrigin+'/auth/federation',authorityIds:[config.authorityId],clients:[{clientId:'web',kind:'WEB',platform:'WEB',label:'KNABA Web',returnPath:'/console'},{clientId:'android',kind:'NATIVE',platform:'ANDROID',label:'KNABA Android',redirectUri:'https://app.example.invalid/auth/android'}]},{erpOrigin:config.erpOrigin,authorityIds:[config.authorityId],appMode:mode});
 const options={companyId:company,appMode:mode,publicOrigin:config.erpOrigin,encryptionKey},auth=new AuthService(db,engine,options),storage=new PostgresPrivateBlobStore(db);
 await db.transaction(company,'SYNTHETIC_F3_SETUP',async tx=>{
  await tx.add('company',{name:'Synthetic F3 company'},company);
  await tx.add('user',{active:true,name:'Synthetic ERP actor',email:'f3-user@example.invalid',roles:patch.roles??['EMPLOYEE'],permissions:['identity.self','scope.company','device.manage','media.read'],siteIds:[],warehouseIds:[],customerIds:[]},'erp-user');
  await tx.add('user',{active:true,name:'Different ERP actor',email:'other-f3@example.invalid',roles:['EMPLOYEE'],permissions:['identity.self'],siteIds:[],warehouseIds:[],customerIds:[]},'erp-other');
  await tx.query('INSERT INTO auth_credentials(company_id,user_id,password_hash,totp_secret,totp_last_counter) VALUES($1,$2,$3,$4,-1)',[company,'erp-user',passwordHash,patch.mfa?sealSecret(syntheticLoginSecret,encryptionKey):null]);
 });
 const source={active:true,outage:false,calls:0,proofMs:10000,afterProof:undefined as undefined|((input:any)=>Promise<void>),approved:new Map<string,any>(),
  subject:'immutable-f3-site-user',sessionRef:'s'.repeat(43),epoch:1,securityFingerprint:'f'.repeat(64),sourcePolicyVersion:1,sessionExpiresAt:new Date(Date.now()+12*3600000).toISOString(),reauthAt:new Date().toISOString(),siteLabel:'Synthetic site account',
  sourceLoginPolicyFingerprint:sourceLoginPolicyFingerprint(normalizeSourceLoginPolicy({enabled:true,authorityIds:[config.authorityId],policyVersion:1},{authorityIds:[config.authorityId]})!)};
 const sourceApp=express();sourceApp.post(FEDERATION_SITE_PATH,express.raw({type:'application/json',limit:32768}),async(req,res)=>{
  try{
   const wire=verifyFederationRequest(config,'ERP_TO_SITE',req.headers,req.body);expect(wire.envelope.action).toBe('INTROSPECT');
   const input=parseFederationLoginIntrospection(wire.envelope.payload),approved=source.approved.get(input.requestId);source.calls++;
   if(source.outage){res.status(503).end();return;}
   const now=Date.now(),active=source.active&&approved&&approved.requestBinding===input.requestBinding&&input.subject===source.subject&&input.sessionRef===source.sessionRef&&input.sourceLoginPolicyFingerprint===source.sourceLoginPolicyFingerprint;
   const result=active?{active:true,...input,generation:wire.generation,checkedAt:new Date(now).toISOString(),validUntil:new Date(now+source.proofMs).toISOString(),sessionExpiresAt:source.sessionExpiresAt,reauthAt:source.reauthAt}:{active:false};
   const signed=makeFederationResponse(config,wire,result);await source.afterProof?.(input);res.status(signed.status).set(signed.headers).send(signed.body);
  }catch{res.status(500).json({code:'SYNTHETIC_SOURCE_FAILURE'});}
 });
 const server:Server=createServer(sourceApp);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));cleanup.push(()=>new Promise<void>((resolve,reject)=>{server.closeAllConnections();server.close(e=>e?reject(e):resolve());}));
 const sourceBase='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 const federationFetch:typeof fetch=async(url,init)=>{expect(String(url)).toBe(config.siteOrigin+FEDERATION_SITE_PATH);return fetch(sourceBase+FEDERATION_SITE_PATH,init);};
 const app=await NestFactory.create(createApiModule({...options,db,engine,storage,buildSha:'0'.repeat(40),federationAuthorities:()=>authorities,federationLoginPolicy:()=>policy,federationFetch}),{bodyParser:false,logger:false});
 app.use(FEDERATION_ERP_PATH,federationRawBody());app.use(express.json({limit:'32kb'}));app.use(validationInputBudgetMiddleware);await app.listen(0,'127.0.0.1');cleanup.push(()=>app.close());
 const base=await app.getUrl();let generation=0,revision=0;
 const authority=async(action:FederationAction,payload:Record<string,unknown>,operationId:string=randomUUID(),gen=action==='BOOTSTRAP_AUTHORITY'?0:generation)=>{
  const wire=makeFederationRequest(config,'SITE_TO_ERP',action,payload,{operationId,generation:gen});const response=await fetch(base+FEDERATION_ERP_PATH,{method:'POST',headers:wire.headers,body:wire.body}),bytes=Buffer.from(await response.arrayBuffer());
  const body=verifyFederationResponse(config,wire.context,response.status,response.headers,bytes) as any;if(body.current){generation=body.current.generation;revision=body.current.revision;}return {status:response.status,body};
 };
 expect((await authority('BOOTSTRAP_AUTHORITY',{instanceId:randomUUID()})).status).toBe(200);expect((await authority('RECONCILE_PAGE',{cursor:null,snapshotRevision:null})).status).toBe(200);expect((await authority('ACTIVATE_AUTHORITY',{snapshotRevision:revision})).status).toBe(200);
 expect((await authority('REGISTER_SESSION',{subject:source.subject,sessionRef:source.sessionRef,epoch:source.epoch,securityFingerprint:source.securityFingerprint,sessionExpiresAt:source.sessionExpiresAt,sourcePolicyVersion:source.sourcePolicyVersion})).status).toBe(200);
 const bindings=new SiteIdentityBindings(db,company,()=>authorities.bindingTrust());
 // Accepted F2 binding is fixture precondition. The source HTTP adapter is synthetic;
 // root's runtime↔runtime suite supplies the real VPS password/coordinator proof.
 const binding=await db.transaction(company,'erp-user',tx=>bindings.recordVerifiedLinkIn(tx,{issuer:config.issuer,audience:config.erpAudience,subject:source.subject},'a'.repeat(64)));
 const web=async(path:string,body?:unknown,cookies='',csrf?:string,headers:Record<string,string>={})=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',origin:config.erpOrigin,...(cookies?{cookie:cookies}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const sourceRef=()=>({subject:source.subject,sessionRef:source.sessionRef,epoch:source.epoch,securityFingerprint:source.securityFingerprint,sourcePolicyVersion:source.sourcePolicyVersion});
 const start=async(kind:'WEB'|'NATIVE'='WEB',parentCookie='',key:string=randomUUID())=>{
  const verifier='v'.repeat(43),state='s'.repeat(43),input=kind==='WEB'?{authorityId:config.authorityId,clientId:'web'}:{authorityId:config.authorityId,clientId:'android',redirectUri:'https://app.example.invalid/auth/android',state,codeChallenge:pkceS256(verifier),codeChallengeMethod:'S256'};
  const response=await web('/api/v1/auth/federation/start',input,parentCookie,undefined,{'idempotency-key':key});expect(response.status).toBe(200);const initial=await response.json();
  const bound=await web('/api/v1/auth/federation/requests/'+initial.requestId+'/bind',{},parentCookie);expect(bound.status).toBe(200);const flow=responseCookie(bound,'__Host-knaba-federation-flow')!;expect(flow).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return {id:initial.requestId,flow,cookie:(parentCookie?parentCookie+'; ':'')+'__Host-knaba-federation-flow='+flow,csrf:csrfFor(flow),verifier,state,kind,key,input,initial};
 };
 const approve=async(pending:Awaited<ReturnType<typeof start>>,operationId:string=randomUUID())=>{
  const inspected=await authority('LOGIN_INSPECT',{requestId:pending.id});expect(inspected.status).toBe(200);const inspection=inspected.body.receipt.result;
  const payload={requestId:pending.id,requestBinding:inspection.requestBinding,expectedVersion:inspection.version,...sourceRef(),reauthAt:source.reauthAt,sessionExpiresAt:source.sessionExpiresAt,siteLabel:source.siteLabel,
   loginPolicyVersion:inspection.loginPolicyVersion,loginPolicyFingerprint:inspection.loginPolicyFingerprint,sourceLoginPolicyFingerprint:source.sourceLoginPolicyFingerprint};
  const approved=await authority('LOGIN_APPROVE',payload,operationId);expect(approved.status).toBe(200);source.approved.set(pending.id,{requestBinding:inspection.requestBinding});return {payload,operationId,...approved.body.receipt.result};
 };
 const status=async(pending:Awaited<ReturnType<typeof start>>)=>{const response=await web('/api/v1/auth/federation/requests/'+pending.id,undefined,pending.cookie);expect(response.status).toBe(200);return response.json();};
 const prepare=async(kind:'WEB'|'NATIVE'='WEB',cookie='')=>{const pending=await start(kind,cookie),approved=await approve(pending),state=await status(pending);return {...pending,approved,version:state.version};};
 const confirm=(pending:Awaited<ReturnType<typeof prepare>>,otp?:string,cookie=pending.cookie)=>web('/api/v1/auth/federation/requests/'+pending.id+'/confirm',{expectedVersion:pending.version,confirmed:true,...(otp?{otp}:{})},cookie,pending.csrf);
 const redeem=(code:string,verifier='v'.repeat(43),extra:Record<string,unknown>={})=>web('/api/v1/auth/federation/token',{grantType:'authorization_code',clientId:'android',redirectUri:'https://app.example.invalid/auth/android',code,codeVerifier:verifier,...extra});
 const fence=()=>authority('FENCE',{subject:source.subject,scope:'SESSION',sessionRefs:[source.sessionRef],intentHash:'e'.repeat(64)});
 return {company,config,auth,engine,storage,source,base,authority,bindings,binding,start,approve,prepare,status,confirm,redeem,web,fence,sourceRef,disablePolicy:()=>{policy=null;}};
}
