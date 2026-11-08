import {randomUUID} from 'node:crypto';
import type {Request,Response} from 'express';
import {assert,DomainError,type Actor} from '../../packages/domain/core.ts';
import {sourceReferenceSchema} from '../../packages/domain/site-federation-ledger.ts';
import {authorityFingerprint,sendFederation} from '../../packages/integrations/site-federation-protocol.mjs';
import {parseFederationLoginIntrospection,parseFederationLoginIntrospectionResult,type FederationLoginIntrospection,type FederationLoginIntrospectionResult} from '../../packages/integrations/site-federation-login-protocol.mjs';
import {AuthService,csrfFor,freshMfa,hashToken,opaqueToken,requireCsrf,SESSION_COOKIE,sql,type FederatedAuthentication,type SqlTransaction} from './auth.ts';
import {Database,PgTransaction} from './database.ts';
import {FederationAuthorities} from './site-federation-config.ts';
import {currentLoginPolicy,type FederationLoginPolicyProvider} from './site-federation-login-config.ts';
import {federatedSessionDataSchema,iso,type FederatedSessionData,type FederatedSessionRow,type LoginSourceData} from './site-federation-login-model.ts';
import {SiteFederationLedger} from './site-federation-ledger.ts';
import {SiteIdentityBindings} from './site-identity-bindings.ts';
import {siteLinkCredentialFingerprint,siteLinkUserEligible} from './site-link-reauth.ts';
import {bindFederatedRequestAuthority,deferAuthorityResponseHeaders,rememberRequestAuthority,requestRevocationAcknowledgement} from './request-authority.ts';

type ActiveProof=Extract<FederationLoginIntrospectionResult,{active:true}>;
export const FEDERATED_SESSION_PATTERN=/^KF3\.[A-Za-z0-9_-]{43}$/;
export const FEDERATION_FLOW_COOKIE='__Host-knaba-federation-flow';

/** Online source decisions are RAM-only, request/phase-specific and never read inside SQL I/O. */
export class SiteFederatedSessions implements FederatedAuthentication {
 readonly ledger:SiteFederationLedger;
 readonly bindings:SiteIdentityBindings;
 constructor(private readonly auth:AuthService,private readonly authorities:()=>FederationAuthorities,private readonly policyProvider:FederationLoginPolicyProvider,private readonly fetchImpl?:typeof fetch){
  this.ledger=new SiteFederationLedger(auth.db,authorities);
  this.bindings=new SiteIdentityBindings(auth.db as Database,auth.options.companyId,()=>authorities().bindingTrust());
 }
 async clock(tx:SqlTransaction){return iso((await sql(tx,'SELECT clock_timestamp() AS now')).rows[0].now);}
 configuration(authorityId:string,authorityConfigFingerprint:string,loginPolicyFingerprint:string){
  const policy=currentLoginPolicy(this.policyProvider,loginPolicyFingerprint);assert(policy.authorityIds.includes(authorityId),'NEEDS_REAUTH');
  const config=this.authorities().require(authorityId,authorityConfigFingerprint);assert(config.companyId===this.auth.options.companyId,'NEEDS_REAUTH');return {policy,config};
 }
 async currentSourceIn(tx:SqlTransaction,authorityId:string,authorityConfigFingerprint:string,source:LoginSourceData){
  const {policy,config}=this.configuration(authorityId,authorityConfigFingerprint,source.loginPolicyFingerprint);
  assert(policy.policyVersion===source.loginPolicyVersion,'NEEDS_REAUTH');
  const current=await this.ledger.currentSourceIn(tx,config,source.generation,sourceReferenceSchema.parse({subject:source.subject,sessionRef:source.sessionRef,epoch:source.epoch,securityFingerprint:source.securityFingerprint,sourcePolicyVersion:source.sourcePolicyVersion}));
  assert(current.session?.expiresAt===source.sessionExpiresAt,'NEEDS_REAUTH');
  const binding=await this.bindings.resolveIn(tx as PgTransaction,{issuer:config.issuer,audience:config.erpAudience,subject:source.subject});
  assert(binding.id===source.bindingId&&binding.version===source.bindingVersion&&binding.userId===source.userId&&binding.trustFingerprint===source.bindingTrustFingerprint,'NEEDS_REAUTH');
  const user=await tx.get('user',source.userId);siteLinkUserEligible(user,this.auth.options.appMode);
  const credential=(await sql(tx,'SELECT password_hash,totp_secret,totp_last_counter FROM auth_credentials WHERE company_id=$1 AND user_id=$2',[config.companyId,source.userId])).rows[0];
  assert(siteLinkCredentialFingerprint(user,credential)===source.erpCredentialFingerprint,'NEEDS_REAUTH');
  const now=await this.clock(tx);this.configuration(authorityId,authorityConfigFingerprint,source.loginPolicyFingerprint);
  return {policy,config,binding,user,credential,now};
 }
 async sourceProof(authorityId:string,authorityConfigFingerprint:string,source:LoginSourceData,requestId:string,requestBinding:string,erpSessionId?:string):Promise<ActiveProof>{
  const {config}=this.configuration(authorityId,authorityConfigFingerprint,source.loginPolicyFingerprint);
  const input=parseFederationLoginIntrospection({purpose:erpSessionId?'SESSION_USE':'SESSION_ISSUE',requestId,requestBinding,
   subject:source.subject,sessionRef:source.sessionRef,epoch:source.epoch,securityFingerprint:source.securityFingerprint,sourcePolicyVersion:source.sourcePolicyVersion,
   loginPolicyVersion:source.loginPolicyVersion,loginPolicyFingerprint:source.loginPolicyFingerprint,sourceLoginPolicyFingerprint:source.sourceLoginPolicyFingerprint,
   ...(erpSessionId?{erpSessionId}:{})});
  let response:Awaited<ReturnType<typeof sendFederation>>;
  try{response=await sendFederation(config,'ERP_TO_SITE','INTROSPECT',input,{generation:source.generation,fetchImpl:this.fetchImpl});}
  catch{throw new DomainError('FEDERATION_UNAVAILABLE');}
  assert(response.status===200,'FEDERATION_UNAVAILABLE');
  let result:FederationLoginIntrospectionResult;try{result=parseFederationLoginIntrospectionResult(response.result);}catch{throw new DomainError('NEEDS_REAUTH');}assert(result.active,'NEEDS_REAUTH');
  for(const [key,value]of Object.entries(input))assert((result as any)[key]===value,'NEEDS_REAUTH');
  assert(result.generation===source.generation&&result.reauthAt===source.reauthAt&&result.sessionExpiresAt===source.sessionExpiresAt,'NEEDS_REAUTH');
  this.assertProofTime(result,Date.now());this.configuration(authorityId,authorityConfigFingerprint,source.loginPolicyFingerprint);return result;
 }
 assertProofTime(proof:ActiveProof,now:number){
  assert(Date.parse(proof.checkedAt)<=now+5000&&Date.parse(proof.validUntil)>now&&Date.parse(proof.validUntil)<=Date.parse(proof.checkedAt)+10000&&Date.parse(proof.sessionExpiresAt)>now,'NEEDS_REAUTH');
 }
 async assertProofIn(tx:SqlTransaction,proof:ActiveProof,input:{requestId:string;requestBinding:string;source:LoginSourceData;erpSessionId?:string}){
  const expected:Record<string,unknown>={purpose:input.erpSessionId?'SESSION_USE':'SESSION_ISSUE',requestId:input.requestId,requestBinding:input.requestBinding,
   subject:input.source.subject,sessionRef:input.source.sessionRef,epoch:input.source.epoch,securityFingerprint:input.source.securityFingerprint,sourcePolicyVersion:input.source.sourcePolicyVersion,
   loginPolicyVersion:input.source.loginPolicyVersion,loginPolicyFingerprint:input.source.loginPolicyFingerprint,sourceLoginPolicyFingerprint:input.source.sourceLoginPolicyFingerprint,
   generation:input.source.generation,reauthAt:input.source.reauthAt,sessionExpiresAt:input.source.sessionExpiresAt,...(input.erpSessionId?{erpSessionId:input.erpSessionId}:{})};
  for(const [key,value]of Object.entries(expected))assert((proof as any)[key]===value,'NEEDS_REAUTH');
  const now=Date.parse(await this.clock(tx));this.assertProofTime(proof,now);
  if(!input.erpSessionId)assert(Date.parse(proof.reauthAt)<=now+5000&&now-Date.parse(proof.reauthAt)<300000,'NEEDS_REAUTH');
 }
 private async rowIn(tx:SqlTransaction,tokenHash:string):Promise<FederatedSessionRow>{
  const row=(await sql(tx,`SELECT s.*,a.expires_at AS auth_expires_at,a.revoked_at AS auth_revoked_at,a.mfa_verified FROM site_federation_session_authorities s JOIN auth_sessions a ON a.token_hash=s.token_hash AND a.company_id=s.company_id AND a.user_id=s.user_id JOIN site_federation_login_requests r ON r.company_id=s.company_id AND r.id=s.request_id AND r.state='COMPLETE' AND r.result_session_id=s.id WHERE s.company_id=$1 AND s.token_hash=$2`,[this.auth.options.companyId,tokenHash])).rows[0] as FederatedSessionRow|undefined;
  assert(row&&row.state==='ACTIVE'&&row.revoked_at===null&&row.auth_revoked_at===null,'NEEDS_REAUTH');
  const now=Date.parse(await this.clock(tx));assert(Date.parse(iso(row.expires_at))>now&&Date.parse(iso(row.auth_expires_at))>now&&iso(row.expires_at)===iso(row.auth_expires_at),'NEEDS_REAUTH');return row;
 }
 private data(row:FederatedSessionRow){
  const parsed=federatedSessionDataSchema.safeParse(row.authority_data);assert(parsed.success,'NEEDS_REAUTH');const data=parsed.data;
  assert(data.userId===row.user_id&&data.requestId===row.request_id&&data.bindingId===row.binding_id&&data.bindingVersion===row.binding_version,'NEEDS_REAUTH');
  return data;
 }
 private async currentIn(tx:SqlTransaction,pinned:FederatedSessionRow,proof?:ActiveProof){
  const row=await this.rowIn(tx,pinned.token_hash),data=this.data(row),expected=this.data(pinned);
  assert(row.id===pinned.id&&row.version===pinned.version&&JSON.stringify(data)===JSON.stringify(expected),'NEEDS_REAUTH');
  const current=await this.currentSourceIn(tx,data.authorityId,data.authorityConfigFingerprint,data).catch(error=>{
   // Loss of the mandatory binding invalidates this credential. Ordinary F1
   // operations and business permission denials keep their existing 403 path.
   if(error instanceof DomainError&&error.code==='ACCESS_DENIED')throw new DomainError('NEEDS_REAUTH');
   throw error;
  });
  assert(data.sourceIssuer===current.config.issuer&&current.policy.clients.some(c=>c.clientId===data.clientId&&c.kind===data.clientKind&&c.platform===data.platform&&(c.kind==='WEB'?data.redirectUri===null:c.redirectUri===data.redirectUri)),'NEEDS_REAUTH');
  if(current.credential.totp_secret)assert(data.erpMfaAt!==null&&row.mfa_verified===true,'NEEDS_REAUTH');
  if(proof)await this.assertProofIn(tx,proof,{requestId:data.requestId,requestBinding:data.requestBinding,source:data,erpSessionId:row.id});
  return {row,data,current};
 }
 async authenticate(req:Request,token:string){
  assert(FEDERATED_SESSION_PATTERN.test(token),'NEEDS_REAUTH');const tokenHash=hashToken(token);
  const pinned=await this.auth.db.transaction(this.auth.options.companyId,'AUTH_FEDERATED',async tx=>{
   const row=await this.rowIn(tx,tokenHash);await this.currentIn(tx,row);return row;
  },10000,true);
  const data=this.data(pinned);let witness=await this.sourceProof(data.authorityId,data.authorityConfigFingerprint,data,data.requestId,data.requestBinding,pinned.id);
  const actor=await this.auth.db.transaction(pinned.company_id,pinned.user_id,async tx=>{
   await this.currentIn(tx,pinned,witness);assert(this.auth.engine.actorIn,'MISSING_CONFIGURATION');
   const actor=await this.auth.engine.actorIn(tx,pinned.user_id);
   await this.currentIn(tx,pinned,witness);return {...actor,mfaVerified:freshMfa(data.erpMfaAt!==null,data.erpMfaAt),mfaVerifiedAt:data.erpMfaAt??undefined};
  },10000,true);
  const bound=bindFederatedRequestAuthority(actor,{companyId:pinned.company_id,userId:pinned.user_id,tokenHash,sessionId:pinned.id},{
   refresh:async()=>{
    await this.auth.db.transaction(pinned.company_id,pinned.user_id,tx=>this.currentIn(tx,pinned),10000,true);
    witness=await this.sourceProof(data.authorityId,data.authorityConfigFingerprint,data,data.requestId,data.requestBinding,pinned.id);
   },
   currentIn:async tx=>{await this.currentIn(tx,pinned,witness);},
  });
  return {actor:rememberRequestAuthority(req,this.auth.db,bound),token,csrfToken:csrfFor(token),guest:false as const};
 }
 async issueIn(tx:SqlTransaction,meta:FederatedSessionData,proof:ActiveProof){
  const data=federatedSessionDataSchema.parse(meta),current=await this.currentSourceIn(tx,data.authorityId,data.authorityConfigFingerprint,data);
  await this.assertProofIn(tx,proof,{requestId:data.requestId,requestBinding:data.requestBinding,source:data});
  const now=Date.parse(current.now);
  if(current.credential.totp_secret)assert(data.erpMfaAt!==null&&Date.parse(data.erpMfaAt)<=now&&freshMfa(true,data.erpMfaAt,now),'NEEDS_REAUTH');
  else assert(data.erpMfaAt===null&&current.user.data.mfaRequired!==true&&(this.auth.options.appMode!=='PRODUCTION'||!current.user.data.roles?.some((r:string)=>['OWNER','DIRECTOR','OPERATIONS_MANAGER','ACCOUNTANT','BOT_ADMIN','DISPATCHER'].includes(r))),'NEEDS_REAUTH');
  const expiresAt=new Date(Math.min(now+8*3600000,Date.parse(data.sessionExpiresAt),current.binding.expiresAt?Date.parse(current.binding.expiresAt):Infinity)).toISOString();
  assert(Date.parse(expiresAt)>now,'NEEDS_REAUTH');const token='KF3.'+opaqueToken(),id=randomUUID(),tokenHash=hashToken(token);
  await sql(tx,'INSERT INTO auth_sessions(token_hash,user_id,company_id,expires_at,mfa_verified) VALUES($1,$2,$3,$4,$5)',[tokenHash,data.userId,this.auth.options.companyId,expiresAt,data.erpMfaAt!==null]);
  await sql(tx,`INSERT INTO site_federation_session_authorities(company_id,id,user_id,token_hash,request_id,binding_id,binding_version,authority_data,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[this.auth.options.companyId,id,data.userId,tokenHash,data.requestId,data.bindingId,data.bindingVersion,JSON.stringify(data),expiresAt]);
  await this.currentSourceIn(tx,data.authorityId,data.authorityConfigFingerprint,data);await this.assertProofIn(tx,proof,{requestId:data.requestId,requestBinding:data.requestBinding,source:data});
  return {id,token,expiresAt};
 }
 async response(req:Request,res:Response,session:{id:string;token:string;expiresAt:string},clearFlow:boolean){
  const authenticated=await this.authenticate(req,session.token),profile=await this.auth.profileSnapshot(authenticated.actor);
  deferAuthorityResponseHeaders(req,()=>{this.auth.cookie(res,session.token,false,session.expiresAt);if(clearFlow)res.clearCookie(FEDERATION_FLOW_COOKIE,{httpOnly:true,secure:true,sameSite:'lax',path:'/'});});
  return {...profile,mode:this.auth.options.appMode,csrfToken:authenticated.csrfToken,expiresAt:session.expiresAt};
 }
 /** Pure reduction remains available when the source, binding or login policy is unavailable. */
 async logout(req:Request,res:Response,token:string){
  assert(FEDERATED_SESSION_PATTERN.test(token),'NEEDS_REAUTH');requireCsrf(req,token,this.auth.options.publicOrigin);
  const tokenHash=hashToken(token);await this.auth.db.transaction(this.auth.options.companyId,'AUTH_FEDERATED_LOGOUT',async tx=>{
   await sql(tx,'UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE company_id=$1 AND token_hash=$2 AND revoked_at IS NULL',[this.auth.options.companyId,tokenHash]);
   await sql(tx,`UPDATE site_federation_session_authorities SET state='REVOKED',version=version+1,revoked_at=clock_timestamp() WHERE company_id=$1 AND token_hash=$2 AND state='ACTIVE'`,[this.auth.options.companyId,tokenHash]);
  },10000);
  res.clearCookie(SESSION_COOKIE,{httpOnly:true,secure:this.auth.options.appMode==='PRODUCTION'||(this.auth.options.cookieSecure??this.auth.options.publicOrigin?.startsWith('https:')===true),sameSite:'strict',path:'/'});
  return requestRevocationAcknowledgement(req);
 }
}
