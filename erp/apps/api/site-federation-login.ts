import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import type {Request,Response} from 'express';
import {z} from 'zod';
import {assert,DomainError,type Actor} from '../../packages/domain/core.ts';
import {sourceReferenceSchema,federationUuid} from '../../packages/domain/site-federation-ledger.ts';
import {authorityFingerprint,canonicalJson,FederationProtocolError,type FederationAuthority,type VerifiedFederationRequest} from '../../packages/integrations/site-federation-protocol.mjs';
import {FEDERATION_LOGIN_ACTIONS,FEDERATION_LOGIN_PENDING_MS,FEDERATION_LOGIN_CODE_MS,federationLoginPolicyFingerprint,federationLoginRequestBinding,parseFederationLoginAction,parseFederationLoginActionResult,parseFederationLoginStart,parseFederationLoginToken,pkceS256,type FederationLoginAction} from '../../packages/integrations/site-federation-login-protocol.mjs';
import {AuthService,csrfFor,hashToken,opaqueToken,openSecret,parseCookies,RateLimiter,requireCsrf,sameOrigin,SESSION_COOKIE,sql,validateTotp,type SqlTransaction} from './auth.ts';
import {PgTransaction} from './database.ts';
import {FederationAuthorities} from './site-federation-config.ts';
import {currentLoginPolicy,type FederationLoginPolicyProvider} from './site-federation-login-config.ts';
import {iso,loginRequestDataSchema,loginSourceDataSchema,type LoginRequestData,type LoginRequestRow,type LoginSourceData} from './site-federation-login-model.ts';
import {SiteFederatedSessions,FEDERATION_FLOW_COOKIE} from './site-federated-sessions.ts';
import type {FederationCurrent} from './site-federation-ledger.ts';
import {siteLinkCredentialFingerprint,siteLinkUserEligible} from './site-link-reauth.ts';
import {assertRequestAuthority,refreshRequestAuthority,setResponseAuthorityCheck} from './request-authority.ts';

const privileged=new Set(['OWNER','DIRECTOR','OPERATIONS_MANAGER','ACCOUNTANT','BOT_ADMIN','DISPATCHER']);
const confirmSchema=z.object({expectedVersion:z.number().int().positive(),confirmed:z.literal(true),otp:z.string().regex(/^\d{6}$/).optional()}).strict();
const cancelSchema=z.object({expectedVersion:z.number().int().positive()}).strict();
const sha=(domain:string,value:string)=>createHash('sha256').update(domain+'\0'+value).digest('hex');
const flowHash=(value:string)=>sha('KNABA-F3-FLOW-v1',value),codeHash=(value:string)=>sha('KNABA-F3-CODE-v1',value);
const readStates=new Set(['BROWSER_BOUND','SOURCE_APPROVED','CODE_ISSUED']);
function checked<T>(fn:()=>T):T {try{return fn();}catch(error){if(error instanceof FederationProtocolError)throw new DomainError('VALIDATION_ERROR');throw error;}}
function cloneRequest(req:Request):Request {const clone=Object.create(req);clone.get=(name:string)=>name.toLowerCase()==='authorization'?undefined:req.get(name);return clone;}

/** One first-party authorization ceremony; all source calls are outside company locks. */
export class SiteFederationLogins {
 readonly sessions:SiteFederatedSessions;
 private readonly limiter=new RateLimiter(30,60000);
 private readonly mfaLimiter=new RateLimiter(5,60000);
 private readonly redemptionLimiter=new RateLimiter(10,60000);
 constructor(private readonly auth:AuthService,private readonly authorities:()=>FederationAuthorities,private readonly policyProvider:FederationLoginPolicyProvider,fetchImpl?:typeof fetch){
  this.sessions=new SiteFederatedSessions(auth,authorities,policyProvider,fetchImpl);auth.federation=this.sessions;
 }
 handles(request:VerifiedFederationRequest){return FEDERATION_LOGIN_ACTIONS.includes(request.envelope.action as FederationLoginAction);}
 private rate(req:Request,action:string){this.limiter.check(hashToken(action+'\0'+(req.ip??'unknown')));}
 private browser(req:Request){sameOrigin(req,this.auth.options.publicOrigin);assert(req.get('origin')===this.auth.options.publicOrigin,'ACCESS_DENIED');}
 private rawFlow(req:Request){const token=parseCookies(req.get('cookie'))[FEDERATION_FLOW_COOKIE];assert(token&&/^[A-Za-z0-9_-]{43}$/.test(token),'NEEDS_REAUTH');return token;}
 private flowMutation(req:Request){this.browser(req);const token=this.rawFlow(req);requireCsrf(req,token,this.auth.options.publicOrigin);return token;}
 private data(row:LoginRequestRow){return loginRequestDataSchema.parse(row.request_data);}
 private source(row:LoginRequestRow){return loginSourceDataSchema.parse(row.source_data);}
 private async rowIn(tx:SqlTransaction,id:string){federationUuid.parse(id);const row=(await sql(tx,'SELECT * FROM site_federation_login_requests WHERE company_id=$1 AND id=$2',[this.auth.options.companyId,id])).rows[0] as LoginRequestRow|undefined;assert(row,'FEDERATION_CONFLICT');return row;}
 private configuration(row:LoginRequestRow){const d=this.data(row);return this.sessions.configuration(row.authority_id,d.authorityConfigFingerprint,d.loginPolicyFingerprint);}
 private async pendingIn(tx:SqlTransaction,row:LoginRequestRow){const now=await this.sessions.clock(tx);assert(readStates.has(row.state)&&Date.parse(iso(row.expires_at))>Date.parse(now),'FEDERATION_CONFLICT');this.configuration(row);return now;}
 private async flowRowIn(tx:SqlTransaction,id:string,token:string){const row=await this.rowIn(tx,id);assert(row.flow_hash===flowHash(token),'NEEDS_REAUTH');return row;}
 private returnUrl(requestId:string,config:FederationAuthority){return config.erpOrigin+'/auth/federation/return?request_id='+requestId;}
 private sourceUrl(requestId:string,config:FederationAuthority){const target=new URL('/account/erp-login/',config.siteOrigin);target.searchParams.set('authority_id',config.authorityId);target.searchParams.set('request_id',requestId);return target.toString();}
 private async companyLabelIn(tx:SqlTransaction,companyId:string){
  const company=await tx.get('company',companyId).catch(error=>{if(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE')return undefined;throw error;});
  const name=typeof company?.data.name==='string'?company.data.name.replace(/[\u0000-\u001f\u007f]/g,' ').trim():'';
  return (name||companyId).slice(0,120);
 }
 private async auditIn(tx:SqlTransaction,row:LoginRequestRow,action:string,userId='AUTH_FEDERATED'){
  await sql(tx,`INSERT INTO audit_log(company_id,actor_id,action,aggregate_kind,aggregate_id,detail) VALUES($1,$2,$3,'site_federation_login_request',$4,$5)`,[row.company_id,userId,action,row.id,JSON.stringify({version:row.version,clientId:this.data(row).clientId})]);
 }
 publicConfiguration(){
  const policy=this.policyProvider();if(!policy)return {enabled:false as const};
  return {enabled:true as const,authorizationIssuer:policy.authorizationIssuer,
   authorities:policy.authorityIds.map(authorityId=>{const config=this.authorities().require(authorityId);return {authorityId,label:new URL(config.siteOrigin).hostname,siteOrigin:config.siteOrigin};}),
   clients:policy.clients.map(client=>({clientId:client.clientId,kind:client.kind,platform:client.platform,label:client.label,...(client.kind==='NATIVE'?{redirectUri:client.redirectUri}:{})}))};
 }
 async start(req:Request,raw:unknown){
  this.rate(req,'start');const policy=currentLoginPolicy(this.policyProvider),input=checked(()=>parseFederationLoginStart(raw,policy)),client=policy.clients.find(c=>c.clientId===input.clientId)!;
  const config=this.authorities().require(input.authorityId);assert(config.companyId===this.auth.options.companyId,'ACCESS_DENIED');
  const key=req.get('idempotency-key');assert(typeof key==='string'&&/^[\x20-\x7e]{8,200}$/.test(key),'VALIDATION_ERROR');
  let parent:Awaited<ReturnType<AuthService['authenticate']>>|undefined;let parentToken:string|undefined;
  if(client.kind==='WEB'){this.browser(req);parentToken=parseCookies(req.get('cookie'))[SESSION_COOKIE];if(parentToken)parent=await this.auth.authenticate(cloneRequest(req));}
  else sameOrigin(req,this.auth.options.publicOrigin);
  const fingerprint=federationLoginPolicyFingerprint(policy),data:LoginRequestData={authorityConfigFingerprint:authorityFingerprint(config),loginPolicyFingerprint:fingerprint,
   clientId:client.clientId,clientKind:client.kind,platform:client.platform,clientLabel:client.label,authorizationIssuer:policy.authorizationIssuer,
   redirectUri:client.kind==='NATIVE'?client.redirectUri:null,codeChallenge:'codeChallenge'in input?input.codeChallenge:null,nativeState:'state'in input?input.state:null,returnPath:client.kind==='WEB'?client.returnPath:null,
   parentSessionHash:parentToken?hashToken(parentToken):null,parentSessionPresent:!!parentToken};
  const keyHash=sha('KNABA-F3-START-v1',key),inputHash=sha('KNABA-F3-START-INPUT-v1',canonicalJson({input,parentSessionHash:data.parentSessionHash,parentSessionPresent:data.parentSessionPresent}));
  return this.auth.db.transaction(config.companyId,parent?.actor.userId??'AUTH_FEDERATED_START',async tx=>{
   if(parent)await assertRequestAuthority(tx,parent.actor);
   const existing=(await sql(tx,'SELECT * FROM site_federation_login_requests WHERE company_id=$1 AND start_key_hash=$2',[config.companyId,keyHash])).rows[0] as LoginRequestRow|undefined;
   if(existing){assert(existing.input_hash===inputHash&&['CREATED','BROWSER_BOUND','SOURCE_APPROVED','CODE_ISSUED'].includes(existing.state)&&Date.parse(iso(existing.expires_at))>Date.parse(await this.sessions.clock(tx)),'FEDERATION_CONFLICT');this.configuration(existing);return {requestId:existing.id,authorizationUrl:policy.authorizationIssuer+'/authorize?request_id='+existing.id,expiresAt:iso(existing.expires_at)};}
   const count=(await sql(tx,`SELECT count(*)::integer AS count FROM site_federation_login_requests WHERE company_id=$1 AND state IN('CREATED','BROWSER_BOUND','SOURCE_APPROVED','CODE_ISSUED') AND expires_at>clock_timestamp()`,[config.companyId])).rows[0];assert(Number(count?.count??0)<256,'RATE_LIMITED');
   const now=await this.sessions.clock(tx),expiresAt=new Date(Date.parse(now)+FEDERATION_LOGIN_PENDING_MS).toISOString(),id=randomUUID();
   const binding=federationLoginRequestBinding({companyId:config.companyId,authorityId:config.authorityId,requestId:id,clientId:client.clientId,kind:client.kind,platform:client.platform,
    redirectUri:data.redirectUri,codeChallenge:data.codeChallenge,stateHash:data.nativeState?hashToken(data.nativeState):null,expiresAt,loginPolicyFingerprint:fingerprint});
   await sql(tx,`INSERT INTO site_federation_login_requests(company_id,id,start_key_hash,input_hash,authority_id,request_binding,request_data,state,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'CREATED',$8,$9)`,[config.companyId,id,keyHash,inputHash,config.authorityId,binding,JSON.stringify(data),now,expiresAt]);
   currentLoginPolicy(this.policyProvider,fingerprint);this.authorities().require(config.authorityId,data.authorityConfigFingerprint);if(parent)await assertRequestAuthority(tx,parent.actor);
   return {requestId:id,authorizationUrl:policy.authorizationIssuer+'/authorize?request_id='+id,expiresAt};
  },10000);
 }
 async bind(req:Request,res:Response,id:string,raw:unknown){
  this.browser(req);z.object({}).strict().parse(raw);this.rate(req,'bind');const previous=parseCookies(req.get('cookie'))[FEDERATION_FLOW_COOKIE],candidate=opaqueToken();
  const result=await this.auth.db.transaction(this.auth.options.companyId,'AUTH_FEDERATED_BIND',async tx=>{
   const row=await this.rowIn(tx,id);this.configuration(row);assert(Date.parse(iso(row.expires_at))>Date.parse(await this.sessions.clock(tx)),'FEDERATION_CONFLICT');
   if(row.state!=='CREATED'){assert(previous&&row.flow_hash===flowHash(previous)&&readStates.has(row.state),'NEEDS_REAUTH');return {row,token:previous,newCookie:false};}
   const saved=(await sql(tx,`UPDATE site_federation_login_requests SET flow_hash=$3,state='BROWSER_BOUND',version=version+1 WHERE company_id=$1 AND id=$2 AND state='CREATED' RETURNING *`,[row.company_id,row.id,flowHash(candidate)])).rows[0] as LoginRequestRow;assert(saved,'FEDERATION_CONFLICT');return {row:saved,token:candidate,newCookie:true};
  },10000);
  if(result.newCookie)res.cookie(FEDERATION_FLOW_COOKIE,result.token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:Math.max(0,Date.parse(iso(result.row.expires_at))-Date.now())});
  return {requestId:id,state:result.row.state,version:result.row.version,expiresAt:iso(result.row.expires_at)};
 }
 private async parent(req:Request,data:LoginRequestData){
  if(data.clientKind==='NATIVE')return undefined;
  const token=parseCookies(req.get('cookie'))[SESSION_COOKIE];assert(!!token===data.parentSessionPresent&&(!token||hashToken(token)===data.parentSessionHash),'NEEDS_REAUTH');
  if(!token)return undefined;return (await this.auth.authenticate(cloneRequest(req))).actor;
 }
 private async currentPendingIn(tx:SqlTransaction,row:LoginRequestRow,parent?:Actor){
  await this.pendingIn(tx,row);const data=this.data(row),source=this.source(row);
  if(parent)await assertRequestAuthority(tx,parent);
  const current=await this.sessions.currentSourceIn(tx,row.authority_id,data.authorityConfigFingerprint,source);
  return {data,source,current};
 }
 async status(req:Request,id:string){
  const token=this.rawFlow(req);this.rate(req,'status');
  const snapshot=await this.auth.db.transaction(this.auth.options.companyId,'AUTH_FEDERATED_STATUS',async tx=>{const row=await this.flowRowIn(tx,id,token);if(row.source_data&&readStates.has(row.state)&&Date.parse(iso(row.expires_at))>Date.parse(await this.sessions.clock(tx)))await this.currentPendingIn(tx,row);return {row,companyLabel:await this.companyLabelIn(tx,row.company_id)};},10000,true),row=snapshot.row,data=this.data(row),{config}=this.configuration(row);
  const parent=await this.parent(req,data),live=readStates.has(row.state)&&Date.parse(iso(row.expires_at))>Date.now();
  let privateLabels:Record<string,unknown>={};
  if(live&&row.source_data){
   const source=this.source(row),proof=await this.sessions.sourceProof(row.authority_id,data.authorityConfigFingerprint,source,row.id,row.request_binding);
   privateLabels=await this.auth.db.transaction(row.company_id,source.userId,async tx=>{
    const latest=await this.flowRowIn(tx,id,token);assert(latest.version===row.version,'VERSION_CONFLICT');const current=await this.currentPendingIn(tx,latest,parent);
    await this.sessions.assertProofIn(tx,proof,{requestId:id,requestBinding:row.request_binding,source});
    return {erpUserLabel:String(current.current.user.data.name??current.current.user.data.displayName??current.current.user.id).slice(0,120),siteLabel:source.siteLabel,
     requiresErpMfa:Boolean(current.current.credential.totp_secret||current.current.user.data.mfaRequired===true||this.auth.options.appMode==='PRODUCTION'&&current.current.user.data.roles?.some((r:string)=>privileged.has(r)))};
   },10000,true);
   this.pendingEgress(req,row,token,parent);
  }
  return {requestId:row.id,state:live||!readStates.has(row.state)?row.state:'EXPIRED',version:row.version,expiresAt:iso(row.expires_at),
   client:{clientId:data.clientId,kind:data.clientKind,platform:data.platform,label:data.clientLabel,...(data.clientKind==='NATIVE'?{redirectUri:data.redirectUri}:{})},
   authorizationIssuer:data.authorizationIssuer,...(data.clientKind==='NATIVE'?{callbackState:data.nativeState}:{}),companyLabel:snapshot.companyLabel,
   ...(row.state!=='CREATED'?{sourceAuthorizationUrl:this.sourceUrl(row.id,config)}:{}),...privateLabels,csrfToken:csrfFor(token)};
 }
 private pendingEgress(req:Request,pinned:LoginRequestRow,flowToken:string,parent?:Actor,expectedCodeHash?:string){
  setResponseAuthorityCheck(req,async()=>{
   const data=this.data(pinned),source=this.source(pinned);if(parent)await refreshRequestAuthority(parent);
   const proof=await this.sessions.sourceProof(pinned.authority_id,data.authorityConfigFingerprint,source,pinned.id,pinned.request_binding);
   await this.auth.db.transaction(pinned.company_id,source.userId,async tx=>{
    const row=await this.flowRowIn(tx,pinned.id,flowToken);assert(row.version===pinned.version&&row.state===pinned.state,'NEEDS_REAUTH');await this.currentPendingIn(tx,row,parent);
    if(expectedCodeHash)assert(row.code_hash===expectedCodeHash&&row.code_expires_at&&Date.parse(iso(row.code_expires_at))>Date.parse(await this.sessions.clock(tx)),'NEEDS_REAUTH');
    await this.sessions.assertProofIn(tx,proof,{requestId:row.id,requestBinding:row.request_binding,source});
   },10000,true);
  });
 }
 async cancel(req:Request,res:Response,id:string,raw:unknown){
  const token=this.flowMutation(req),input=cancelSchema.parse(raw);this.rate(req,'cancel');
  const row=await this.auth.db.transaction(this.auth.options.companyId,'AUTH_FEDERATED_CANCEL',async tx=>{
   const current=await this.flowRowIn(tx,id,token);if(current.state==='CANCELLED')return current;
   assert(readStates.has(current.state)&&current.version===input.expectedVersion,'VERSION_CONFLICT');
   const saved=(await sql(tx,`UPDATE site_federation_login_requests SET state='CANCELLED',version=version+1 WHERE company_id=$1 AND id=$2 RETURNING *`,[current.company_id,current.id])).rows[0] as LoginRequestRow;
   await this.auditIn(tx,saved,'FEDERATION_LOGIN_CANCELLED');return saved;
  },10000);
  res.clearCookie(FEDERATION_FLOW_COOKIE,{httpOnly:true,secure:true,sameSite:'lax',path:'/'});return {requestId:id,state:'CANCELLED' as const,version:row.version};
 }
 private sessionMeta(row:LoginRequestRow,mfaAt:string|null){
  const data=this.data(row),source=this.source(row),{config}=this.configuration(row);
  return {...source,requestId:row.id,requestBinding:row.request_binding,authorityId:row.authority_id,sourceIssuer:config.issuer,
   authorityConfigFingerprint:data.authorityConfigFingerprint,clientId:data.clientId,clientKind:data.clientKind,platform:data.platform,redirectUri:data.redirectUri,erpMfaAt:mfaAt};
 }
 async confirm(req:Request,res:Response,id:string,raw:unknown){
  const token=this.flowMutation(req),input=confirmSchema.parse(raw);this.rate(req,'confirm');
  const snapshot=await this.auth.db.transaction(this.auth.options.companyId,'AUTH_FEDERATED_CONFIRM',async tx=>{
   const row=await this.flowRowIn(tx,id,token);await this.pendingIn(tx,row);assert(row.state==='SOURCE_APPROVED'&&row.version===input.expectedVersion,'VERSION_CONFLICT');await this.currentPendingIn(tx,row);return row;
  },10000,true);
  const data=this.data(snapshot),source=this.source(snapshot),parent=await this.parent(req,data);
  this.mfaLimiter.check(hashToken(snapshot.company_id+'\0'+source.userId));
  const proof=await this.sessions.sourceProof(snapshot.authority_id,data.authorityConfigFingerprint,source,id,snapshot.request_binding);
  if(parent)await refreshRequestAuthority(parent);
  const outcome=await this.auth.db.transaction(snapshot.company_id,source.userId,async tx=>{
   const row=await this.flowRowIn(tx,id,token);assert(row.state==='SOURCE_APPROVED'&&row.version===input.expectedVersion,'VERSION_CONFLICT');
   const {current}=await this.currentPendingIn(tx,row,parent);
   await this.sessions.assertProofIn(tx,proof,{requestId:id,requestBinding:row.request_binding,source});
   let mfaAt:string|null=null;
   if(current.credential.totp_secret){
    const counter=validateTotp(openSecret(current.credential.totp_secret,this.auth.options.encryptionKey),input.otp??'',Date.parse(current.now));assert(counter!==null,'NEEDS_REAUTH');
    const consumed=await sql(tx,'UPDATE auth_credentials SET totp_last_counter=$3 WHERE company_id=$1 AND user_id=$2 AND totp_last_counter<$3 RETURNING user_id',[row.company_id,source.userId,counter]);assert(consumed.rows.length===1,'NEEDS_REAUTH');mfaAt=current.now;
   }else assert(current.user.data.mfaRequired!==true&&(this.auth.options.appMode!=='PRODUCTION'||!current.user.data.roles?.some((r:string)=>privileged.has(r))),'NEEDS_REAUTH');
   if(data.clientKind==='WEB'){
    const session=await this.sessions.issueIn(tx,this.sessionMeta(row,mfaAt),proof);
    const saved=(await sql(tx,`UPDATE site_federation_login_requests SET state='COMPLETE',version=version+1,erp_mfa_at=$3,result_session_id=$4 WHERE company_id=$1 AND id=$2 RETURNING *`,[row.company_id,row.id,mfaAt,session.id])).rows[0] as LoginRequestRow;
    await this.auditIn(tx,saved,'FEDERATION_WEB_SESSION_ISSUED',source.userId);if(parent)await assertRequestAuthority(tx,parent);
    await this.sessions.currentSourceIn(tx,row.authority_id,data.authorityConfigFingerprint,source);await this.sessions.assertProofIn(tx,proof,{requestId:id,requestBinding:row.request_binding,source});
    return {kind:'WEB' as const,session,returnPath:data.returnPath!};
   }
   const code='K3C.'+opaqueToken(),expiresAt=new Date(Math.min(Date.parse(current.now)+FEDERATION_LOGIN_CODE_MS,Date.parse(iso(row.expires_at)))).toISOString();
   const saved=(await sql(tx,`UPDATE site_federation_login_requests SET state='CODE_ISSUED',version=version+1,erp_mfa_at=$3,code_hash=$4,code_expires_at=$5 WHERE company_id=$1 AND id=$2 RETURNING *`,[row.company_id,row.id,mfaAt,codeHash(code),expiresAt])).rows[0] as LoginRequestRow;
   await this.auditIn(tx,saved,'FEDERATION_NATIVE_CODE_ISSUED',source.userId);
   await this.sessions.currentSourceIn(tx,row.authority_id,data.authorityConfigFingerprint,source);await this.sessions.assertProofIn(tx,proof,{requestId:id,requestBinding:row.request_binding,source});
   return {kind:'NATIVE' as const,code,row:saved};
  },10000);
  if(outcome.kind==='WEB')return {...await this.sessions.response(req,res,outcome.session,true),returnPath:outcome.returnPath};
  const responseUrl=new URL(data.redirectUri!);responseUrl.searchParams.set('code',outcome.code);responseUrl.searchParams.set('state',data.nativeState!);responseUrl.searchParams.set('iss',data.authorizationIssuer);
  this.pendingEgress(req,outcome.row,token,undefined,codeHash(outcome.code));
  return {requestId:id,state:'CODE_ISSUED' as const,version:outcome.row.version,authorizationResponseUrl:responseUrl.toString()};
 }
 async redeem(req:Request,res:Response,raw:unknown){
  const input=checked(()=>parseFederationLoginToken(raw));sameOrigin(req,this.auth.options.publicOrigin);this.rate(req,'token');this.redemptionLimiter.check(codeHash(input.code));
  const policy=currentLoginPolicy(this.policyProvider),client=policy.clients.find(c=>c.clientId===input.clientId);
  assert(client?.kind==='NATIVE'&&client.redirectUri===input.redirectUri,'FEDERATION_CONFLICT');
  const snapshot=await this.auth.db.transaction(this.auth.options.companyId,'AUTH_FEDERATED_TOKEN',async tx=>{
   const row=(await sql(tx,'SELECT * FROM site_federation_login_requests WHERE company_id=$1 AND code_hash=$2',[this.auth.options.companyId,codeHash(input.code)])).rows[0] as LoginRequestRow|undefined;
   assert(row,'FEDERATION_CONFLICT');await this.pendingIn(tx,row);const data=this.data(row),now=Date.parse(await this.sessions.clock(tx));
   assert(row.state==='CODE_ISSUED'&&row.code_expires_at&&Date.parse(iso(row.code_expires_at))>now&&data.clientKind==='NATIVE'&&data.clientId===input.clientId&&data.redirectUri===input.redirectUri,'FEDERATION_CONFLICT');
   const expected=Buffer.from(data.codeChallenge!),actual=Buffer.from(pkceS256(input.codeVerifier));assert(expected.length===actual.length&&timingSafeEqual(expected,actual),'NEEDS_REAUTH');await this.currentPendingIn(tx,row);return row;
  },10000,true);
  const data=this.data(snapshot),source=this.source(snapshot),proof=await this.sessions.sourceProof(snapshot.authority_id,data.authorityConfigFingerprint,source,snapshot.id,snapshot.request_binding);
  const session=await this.auth.db.transaction(snapshot.company_id,source.userId,async tx=>{
   const row=await this.rowIn(tx,snapshot.id),now=await this.pendingIn(tx,row);
   assert(row.state==='CODE_ISSUED'&&row.version===snapshot.version&&row.code_hash===codeHash(input.code)&&row.code_expires_at&&Date.parse(iso(row.code_expires_at))>Date.parse(now),'FEDERATION_CONFLICT');
   await this.currentPendingIn(tx,row);await this.sessions.assertProofIn(tx,proof,{requestId:row.id,requestBinding:row.request_binding,source});
   const minted=await this.sessions.issueIn(tx,this.sessionMeta(row,row.erp_mfa_at?iso(row.erp_mfa_at):null),proof);
   const saved=(await sql(tx,`UPDATE site_federation_login_requests SET state='COMPLETE',version=version+1,result_session_id=$3 WHERE company_id=$1 AND id=$2 RETURNING *`,[row.company_id,row.id,minted.id])).rows[0] as LoginRequestRow;
   await this.auditIn(tx,saved,'FEDERATION_NATIVE_SESSION_ISSUED',source.userId);await this.sessions.currentSourceIn(tx,row.authority_id,data.authorityConfigFingerprint,source);
   await this.sessions.assertProofIn(tx,proof,{requestId:row.id,requestBinding:row.request_binding,source});return minted;
  },10000);
  return this.sessions.response(req,res,session,false);
 }
 async authority(request:VerifiedFederationRequest){
  assert(this.handles(request),'ACCESS_DENIED');currentLoginPolicy(this.policyProvider);
  return this.sessions.ledger.handle(request,(tx,r,c,current)=>this.sourceAction(tx,r,c,current));
 }
 private async sourceAction(tx:SqlTransaction,request:VerifiedFederationRequest,config:FederationAuthority,current:FederationCurrent){
  const action=request.envelope.action as FederationLoginAction,input=checked(()=>parseFederationLoginAction(action,request.envelope.payload));
  const row=await this.rowIn(tx,input.requestId);assert(row.authority_id===config.authorityId,'FEDERATION_CONFLICT');const data=this.data(row),{policy}=this.configuration(row);
  if(action==='LOGIN_STATUS'){
   assert(row.source_data&&row.request_binding===input.requestBinding,'FEDERATION_CONFLICT');const source=this.source(row);
   for(const key of ['subject','sessionRef','epoch','securityFingerprint','sourcePolicyVersion'] as const)assert(input[key]===source[key],'FEDERATION_CONFLICT');
   await this.sessions.currentSourceIn(tx,row.authority_id,data.authorityConfigFingerprint,source);
   const now=await this.sessions.clock(tx);return checked(()=>parseFederationLoginActionResult(action,{requestId:row.id,state:readStates.has(row.state)&&Date.parse(iso(row.expires_at))<=Date.parse(now)?'EXPIRED':row.state,version:row.version,expiresAt:iso(row.expires_at)}));
  }
  const now=await this.pendingIn(tx,row);assert(row.state==='BROWSER_BOUND','FEDERATION_CONFLICT');
  if(action==='LOGIN_INSPECT'){
   assert(row.inspect_count<10,'RATE_LIMITED');await sql(tx,'UPDATE site_federation_login_requests SET inspect_count=inspect_count+1 WHERE company_id=$1 AND id=$2',[row.company_id,row.id]);
   const companyLabel=await this.companyLabelIn(tx,config.companyId);
   return checked(()=>parseFederationLoginActionResult(action,{requestId:row.id,requestBinding:row.request_binding,version:row.version,expiresAt:iso(row.expires_at),companyLabel,
    client:{clientId:data.clientId,kind:data.clientKind,platform:data.platform,label:data.clientLabel},returnUrl:this.returnUrl(row.id,config),loginPolicyVersion:policy.policyVersion,loginPolicyFingerprint:data.loginPolicyFingerprint}));
  }
  assert(row.version===input.expectedVersion&&row.request_binding===input.requestBinding&&input.loginPolicyVersion===policy.policyVersion&&input.loginPolicyFingerprint===data.loginPolicyFingerprint,'FEDERATION_CONFLICT');
  assert(Date.parse(input.reauthAt)<=Date.parse(now)+5000&&Date.parse(now)-Date.parse(input.reauthAt)<FEDERATION_LOGIN_PENDING_MS,'NEEDS_REAUTH');
  const ref=sourceReferenceSchema.parse({subject:input.subject,sessionRef:input.sessionRef,epoch:input.epoch,securityFingerprint:input.securityFingerprint,sourcePolicyVersion:input.sourcePolicyVersion});
  const ledger=await this.sessions.ledger.currentSourceIn(tx,config,current.generation,ref);assert(ledger.session?.expiresAt===input.sessionExpiresAt,'FEDERATION_CONFLICT');
  const binding=await this.sessions.bindings.resolveIn(tx as PgTransaction,{issuer:config.issuer,audience:config.erpAudience,subject:input.subject});
  const user=await tx.get('user',binding.userId);siteLinkUserEligible(user,this.auth.options.appMode);
  const credential=(await sql(tx,'SELECT password_hash,totp_secret FROM auth_credentials WHERE company_id=$1 AND user_id=$2',[config.companyId,binding.userId])).rows[0];
  const source=loginSourceDataSchema.parse({...ref,generation:current.generation,reauthAt:input.reauthAt,sessionExpiresAt:input.sessionExpiresAt,siteLabel:input.siteLabel,
   loginPolicyVersion:input.loginPolicyVersion,loginPolicyFingerprint:input.loginPolicyFingerprint,sourceLoginPolicyFingerprint:input.sourceLoginPolicyFingerprint,
   bindingId:binding.id,bindingVersion:binding.version,bindingTrustFingerprint:binding.trustFingerprint,userId:binding.userId,erpCredentialFingerprint:siteLinkCredentialFingerprint(user,credential)});
  const saved=(await sql(tx,`UPDATE site_federation_login_requests SET source_data=$3,state='SOURCE_APPROVED',version=version+1 WHERE company_id=$1 AND id=$2 RETURNING *`,[row.company_id,row.id,JSON.stringify(source)])).rows[0] as LoginRequestRow;
  await this.sessions.currentSourceIn(tx,config.authorityId,data.authorityConfigFingerprint,source);
  return checked(()=>parseFederationLoginActionResult(action,{requestId:row.id,state:'SOURCE_APPROVED',version:saved.version,expiresAt:iso(saved.expires_at),returnUrl:this.returnUrl(row.id,config)}));
 }
}
