import {randomUUID} from 'node:crypto';
import type {Request} from 'express';
import {z} from 'zod';
import {expect,vi} from 'vitest';
import {assert,type Actor,type Data,type Entity} from '../../packages/domain/core.ts';
import {AuthService,csrfFor,hashToken,type DatabaseLike,type SqlTransaction} from '../../apps/api/auth.ts';
import {Engine} from '../../apps/api/engine.ts';
import {FederationAuthorities} from '../../apps/api/site-federation-config.ts';
import {SiteFederationLogins} from '../../apps/api/site-federation-login.ts';
import {siteLinkCredentialFingerprint} from '../../apps/api/site-link-reauth.ts';
import {authorityFingerprint,makeFederationResponse,verifyFederationRequest} from '../../packages/integrations/site-federation-protocol.mjs';
import {normalizeFederationLoginPolicy,federationLoginPolicyFingerprint,normalizeSourceLoginPolicy,sourceLoginPolicyFingerprint,type FederationLoginPolicy} from '../../packages/integrations/site-federation-login-protocol.mjs';
import {federationAuthorityFixture} from './site-federation.ts';

/** SQL/clock double only. Production AuthService/ledger/F1/Engine/fences and signed transport stay real. */
export class FederatedSessionMemory implements DatabaseLike,SqlTransaction {
 companyId='f3-memory';actorId='erp-user';inTransaction=false;clockOffset=0;queries=0;receiptReads=0;effects=0;
 entities=new Map<string,Entity>();authSessions=new Map<string,Data>();children=new Map<string,Data>();requests=new Map<string,Data>();receipts=new Map<string,Data>();credentials=new Map<string,Data>();
 binding!:Data;authority!:Data;principal!:Data;sourceSession!:Data;events:Data[]=[];audits:Data[]=[];
 now(){return Date.now()+this.clockOffset;}
 put(kind:string,id:string,data:Data){const row:Entity={companyId:this.companyId,kind,id,version:1,data:structuredClone(data),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};this.entities.set(kind+':'+id,row);return row;}
 async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{const row=this.entities.get(kind+':'+id);assert(row,'NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;}
 async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{return [...this.entities.values()].filter(e=>e.kind===kind).map(e=>structuredClone(e) as Entity<T>);}
 async listPage<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{return this.list<T>(kind);}
 async add<T extends Data=Data>(kind:string,data:T,id=randomUUID()):Promise<Entity<T>>{this.effects++;return this.put(kind,id,data) as Entity<T>;}
 async save<T extends Data=Data>(e:Entity,data:T):Promise<Entity<T>>{const next={...e,version:e.version+1,data:structuredClone(data)};this.entities.set(e.kind+':'+e.id,next);return next as Entity<T>;}
 async event(type:string,data:Data){this.events.push({type,data});}
 async transaction<T>(companyId:string,actorId:string,fn:(tx:SqlTransaction)=>Promise<T>):Promise<T>{
  expect(companyId).toBe(this.companyId);assert(!this.inTransaction,'INVALID_STATE');
  const saved=structuredClone({entities:this.entities,authSessions:this.authSessions,children:this.children,requests:this.requests,receipts:this.receipts,credentials:this.credentials,binding:this.binding,authority:this.authority,principal:this.principal,sourceSession:this.sourceSession,events:this.events,audits:this.audits,effects:this.effects});
  this.inTransaction=true;const previous=this.actorId;this.actorId=actorId;
  try{return await fn(this);}catch(error){Object.assign(this,saved);throw error;}finally{this.inTransaction=false;this.actorId=previous;}
 }
 async query(statement:string,p:any[]=[]):Promise<{rows:any[]}>{
  this.queries++;const result=(rows:any[])=>({rows:structuredClone(rows)});
  if(statement==='SELECT clock_timestamp() AS now')return result([{now:new Date(this.now()).toISOString()}]);
  if(statement.startsWith('SELECT * FROM site_federation_login_requests')){
   const row=statement.includes('code_hash=$2')?[...this.requests.values()].find(r=>r.company_id===p[0]&&r.code_hash===p[1]):statement.includes('start_key_hash=$2')?[...this.requests.values()].find(r=>r.company_id===p[0]&&r.start_key_hash===p[1]):this.requests.get(p[1]);return result(row&&row.company_id===p[0]?[row]:[]);
  }
  if(statement.startsWith('SELECT count(*)::integer AS count FROM site_federation_login_requests'))return result([{count:[...this.requests.values()].filter(r=>r.company_id===p[0]&&['CREATED','BROWSER_BOUND','SOURCE_APPROVED','CODE_ISSUED'].includes(r.state)&&Date.parse(r.expires_at)>this.now()).length}]);
  if(statement.startsWith('INSERT INTO site_federation_login_requests')){this.requests.set(p[1],{company_id:p[0],id:p[1],start_key_hash:p[2],input_hash:p[3],authority_id:p[4],request_binding:p[5],request_data:JSON.parse(p[6]),flow_hash:null,source_data:null,state:'CREATED',version:1,inspect_count:0,code_hash:null,code_expires_at:null,erp_mfa_at:null,result_session_id:null,created_at:p[7],expires_at:p[8]});return result([]);}
  if(statement.startsWith('UPDATE site_federation_login_requests')){
   const row=this.requests.get(p[1]);if(!row||row.company_id!==p[0])return result([]);
   if(statement.includes('inspect_count=inspect_count+1')){row.inspect_count++;return result([]);}
   if(statement.includes("state='BROWSER_BOUND'")){if(row.state!=='CREATED')return result([]);row.flow_hash=p[2];row.state='BROWSER_BOUND';}
   else if(statement.includes("state='SOURCE_APPROVED'")){row.source_data=JSON.parse(p[2]);row.state='SOURCE_APPROVED';}
   else if(statement.includes("state='CODE_ISSUED'")){row.erp_mfa_at=p[2];row.code_hash=p[3];row.code_expires_at=p[4];row.state='CODE_ISSUED';}
   else if(statement.includes("state='COMPLETE'")){row.state='COMPLETE';if(statement.includes('erp_mfa_at=$3')){row.erp_mfa_at=p[2];row.result_session_id=p[3];}else row.result_session_id=p[2];}
   else if(statement.includes("state='CANCELLED'"))row.state='CANCELLED';else throw Error('Unsupported synthetic login transition');
   row.version++;return result([row]);
  }
  if(statement.startsWith('INSERT INTO auth_sessions')){this.authSessions.set(p[0],{token_hash:p[0],user_id:p[1],company_id:p[2],expires_at:p[3],mfa_verified:p[4],created_at:new Date(this.now()).toISOString(),revoked_at:null});return result([]);}
  if(statement.startsWith('INSERT INTO site_federation_session_authorities')){this.children.set(p[3],{company_id:p[0],id:p[1],user_id:p[2],token_hash:p[3],request_id:p[4],binding_id:p[5],binding_version:p[6],authority_data:JSON.parse(p[7]),expires_at:p[8],created_at:new Date(this.now()).toISOString(),state:'ACTIVE',version:1,revoked_at:null});return result([]);}
  if(statement.startsWith('SELECT s.*,a.expires_at')){
   const child=this.children.get(p[1]),auth=this.authSessions.get(p[1]),request=child?this.requests.get(child.request_id):undefined;
   return result(child&&auth&&child.company_id===p[0]&&auth.company_id===p[0]&&child.user_id===auth.user_id&&request?.state==='COMPLETE'&&request.result_session_id===child.id?[{...child,auth_expires_at:auth.expires_at,auth_revoked_at:auth.revoked_at,mfa_verified:auth.mfa_verified}]:[]);
  }
  if(statement.startsWith('SELECT')&&statement.includes('FROM auth_sessions')){
   const row=this.authSessions.get(p[0]);return result(row&&row.company_id===p[1]&&(!p[2]||p[2]===row.user_id)&&!row.revoked_at&&Date.parse(row.expires_at)>this.now()?[row]:[]);
  }
  if(statement.startsWith('SELECT * FROM site_federation_authorities'))return result(this.authority?.company_id===p[0]&&this.authority.authority_id===p[1]?[this.authority]:[]);
  if(statement.startsWith('SELECT * FROM site_federation_principals'))return result(this.principal?.company_id===p[0]&&this.principal.authority_id===p[1]&&this.principal.subject===p[2]?[this.principal]:[]);
  if(statement.startsWith('SELECT * FROM site_federation_sessions'))return result(this.sourceSession?.company_id===p[0]&&this.sourceSession.authority_id===p[1]&&this.sourceSession.session_ref===p[2]?[this.sourceSession]:[]);
  if(statement.startsWith('SELECT * FROM site_identity_bindings'))return result(this.binding?.company_id===p[0]&&this.binding.issuer===p[1]&&this.binding.subject===p[2]&&this.binding.audience===p[3]&&this.binding.status==='ACTIVE'&&(!this.binding.expires_at||Date.parse(this.binding.expires_at)>this.now())?[this.binding]:[]);
  if(statement.startsWith('SELECT password_hash,totp_secret'))return result(p[0]===this.companyId&&this.credentials.has(p[1])?[this.credentials.get(p[1])]:[]);
  if(statement.startsWith('UPDATE auth_credentials SET totp_last_counter')){const row=this.credentials.get(p[1]);if(row&&p[0]===this.companyId&&row.totp_last_counter<p[2]){row.totp_last_counter=p[2];return result([{user_id:p[1]}]);}return result([]);}
  if(statement.startsWith('UPDATE auth_sessions SET revoked_at=clock_timestamp()')){const row=this.authSessions.get(p[1]);if(row&&row.company_id===p[0]&&!row.revoked_at)row.revoked_at=new Date(this.now()).toISOString();return result([]);}
  if(statement.startsWith('UPDATE site_federation_session_authorities SET')){const row=this.children.get(p[1]);if(row&&row.company_id===p[0]&&row.state==='ACTIVE'){row.state='REVOKED';row.version++;row.revoked_at=new Date(this.now()).toISOString();}return result([]);}
  if(statement.startsWith('SELECT command,input_hash')){this.receiptReads++;const row=this.receipts.get(JSON.stringify(p));return result(row?[row]:[]);}
  if(statement.startsWith('INSERT INTO command_receipts')){this.receipts.set(JSON.stringify(p.slice(0,3)),{command:p[3],input_hash:p[4],result:JSON.parse(p[5]),authorization_hash:p[6],created_at:new Date(this.now()).toISOString()});return result([]);}
  if(statement.startsWith('INSERT INTO audit_log')){this.audits.push({parameters:structuredClone(p)});return result([]);}
  throw Error('Unexpected F3 session fixture SQL: '+statement.slice(0,100));
 }
}
export function federatedSessionFixture(){
 const db=new FederatedSessionMemory(),config=federationAuthorityFixture(db.companyId),authorities=new FederationAuthorities([config],db.companyId,'TEST');
 let policy:FederationLoginPolicy|null=normalizeFederationLoginPolicy({enabled:true,policyVersion:1,authorizationIssuer:config.erpOrigin+'/auth/federation',authorityIds:[config.authorityId],clients:[{clientId:'web',kind:'WEB',platform:'WEB',label:'KNABA Web',returnPath:'/console'},{clientId:'android',kind:'NATIVE',platform:'ANDROID',label:'KNABA Android',redirectUri:'https://app.example.test/auth/android'}]}, {erpOrigin:config.erpOrigin,authorityIds:[config.authorityId],appMode:'TEST'});
 const user=db.put('user','erp-user',{active:true,roles:['EMPLOYEE'],permissions:['identity.self','scope.company','device.manage'],siteIds:[]}),credential={password_hash:'synthetic-verifier-not-used-for-password-login',totp_secret:null,totp_last_counter:-1};db.credentials.set(user.id,credential);
 const subject='immutable-site-user',sourceRef='s'.repeat(43),fingerprint='f'.repeat(64),sourceExpiry=new Date(Date.now()+12*3600000).toISOString(),requestId=randomUUID(),sessionId=randomUUID(),bindingId=randomUUID(),token='KF3.'+'k'.repeat(43),tokenHash=hashToken(token),expiresAt=new Date(Date.now()+8*3600000).toISOString();
 const trust=authorities.bindingTrust().require(db.companyId,{issuer:config.issuer,audience:config.erpAudience,subject},new Date());
 db.authority={company_id:db.companyId,authority_id:config.authorityId,config_fingerprint:authorityFingerprint(config),generation:1,revision:1,phase:'ACTIVE',policy_version:1,issuer:config.issuer,audience:config.erpAudience};
 db.principal={company_id:db.companyId,authority_id:config.authorityId,subject,epoch:1,minimum_epoch:1,state:'ACTIVE',security_fingerprint:fingerprint,source_policy_version:1,version:1,fence_operation_id:null};
 db.sourceSession={company_id:db.companyId,authority_id:config.authorityId,subject,session_ref:sourceRef,epoch:1,security_fingerprint:fingerprint,expires_at:sourceExpiry,state:'ACTIVE',version:1};
 db.binding={company_id:db.companyId,id:bindingId,issuer:config.issuer,audience:config.erpAudience,subject,site_user_id:subject,user_id:user.id,status:'ACTIVE',version:1,trust_version:1,trust_fingerprint:trust.fingerprint,expires_at:null,created_at:new Date().toISOString(),revoked_at:null};
 const data={subject,sessionRef:sourceRef,epoch:1,securityFingerprint:fingerprint,sourcePolicyVersion:1,generation:1,reauthAt:new Date().toISOString(),sessionExpiresAt:sourceExpiry,siteLabel:'Synthetic site actor',loginPolicyVersion:1,loginPolicyFingerprint:federationLoginPolicyFingerprint(policy!),sourceLoginPolicyFingerprint:sourceLoginPolicyFingerprint(normalizeSourceLoginPolicy({enabled:true,authorityIds:[config.authorityId],policyVersion:1},{authorityIds:[config.authorityId]})!),bindingId,bindingVersion:1,bindingTrustFingerprint:trust.fingerprint,userId:user.id,erpCredentialFingerprint:siteLinkCredentialFingerprint(user,credential),requestId,requestBinding:'b'.repeat(64),authorityId:config.authorityId,sourceIssuer:config.issuer,authorityConfigFingerprint:authorityFingerprint(config),clientId:'web',clientKind:'WEB',platform:'WEB',redirectUri:null,erpMfaAt:null};
 db.authSessions.set(tokenHash,{company_id:db.companyId,user_id:user.id,token_hash:tokenHash,expires_at:expiresAt,revoked_at:null,mfa_verified:false,created_at:new Date().toISOString()});
 db.children.set(tokenHash,{company_id:db.companyId,id:sessionId,user_id:user.id,token_hash:tokenHash,request_id:requestId,binding_id:bindingId,binding_version:1,authority_data:data,state:'ACTIVE',version:1,created_at:new Date().toISOString(),expires_at:expiresAt,revoked_at:null});
 db.requests.set(requestId,{id:requestId,company_id:db.companyId,state:'COMPLETE',result_session_id:sessionId});
 const source={active:true,outage:false,calls:0,mutate:undefined as undefined|((response:any)=>void)};
 const fetchImpl=(async(url:any,options:any)=>{
  expect(db.inTransaction).toBe(false);expect(String(url)).toBe(config.siteOrigin+'/api/federation/introspect');source.calls++;
  if(source.outage)throw Error('Synthetic source outage');
  const wire=verifyFederationRequest(config,'ERP_TO_SITE',options.headers,Buffer.from(options.body));expect(wire.envelope.action).toBe('INTROSPECT');
  const checkedAt=Date.now(),response:any=source.active?{active:true,...wire.envelope.payload,generation:1,checkedAt:new Date(checkedAt).toISOString(),validUntil:new Date(checkedAt+10000).toISOString(),sessionExpiresAt:sourceExpiry,reauthAt:data.reauthAt}:{active:false};source.mutate?.(response);
  const signed=makeFederationResponse(config,wire,response);return new Response(signed.body,{status:signed.status,headers:signed.headers});
 }) as typeof fetch;
 const engine=new Engine(db as any,'TEST');engine.registry['federated.probe']={permission:'identity.self',schema:z.object({}).strict(),handler:async c=>{await c.tx.add('f3_effect',{safe:'committed'});return {private:'protected'};}};
 const auth=new AuthService(db,engine,{companyId:db.companyId,appMode:'TEST',publicOrigin:config.erpOrigin,encryptionKey:'synthetic-f3-memory-encryption-key-32-chars'}),logins=new SiteFederationLogins(auth,()=>authorities,()=>policy,fetchImpl);
 const headers:Record<string,string>={cookie:'knaba_session='+token,origin:config.erpOrigin,'x-csrf-token':csrfFor(token)};
 const request=()=>({get:(name:string)=>headers[name.toLowerCase()],ip:'127.0.0.1',query:{}} as unknown as Request);
 const res:any={cookie:vi.fn(),clearCookie:vi.fn(),headersSent:false};
 return {db,auth,engine,logins,config,authorities,source,headers,request,res,token,tokenHash,sessionId,requestId,data,expiresAt,policy:()=>policy,fetchImpl,disablePolicy:()=>{policy=null;}};
}
