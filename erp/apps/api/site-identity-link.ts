import {createHash,randomUUID} from 'node:crypto';
import type {Request} from 'express';
import {z} from 'zod';
import {assert,DomainError} from '../../packages/domain/core.ts';
import {federationEpoch,federationInstant,federationSubject,federationUuid,sourceReferenceSchema,type SourceReference} from '../../packages/domain/site-federation-ledger.ts';
import {authorityFingerprint,sendFederation,type FederationAuthority,type VerifiedFederationRequest} from '../../packages/integrations/site-federation-protocol.mjs';
import {AuthService,opaqueToken,RateLimiter,sql,type SqlTransaction} from './auth.ts';
import {Database,PgTransaction} from './database.ts';
import {FederationAuthorities} from './site-federation-config.ts';
import {SiteFederationLedger,type FederationCurrent} from './site-federation-ledger.ts';
import {SiteIdentityBindings} from './site-identity-bindings.ts';
import {SiteLinkReauthentication,siteLinkCredentialFingerprint,siteLinkCredentialSchema,siteLinkUserEligible} from './site-link-reauth.ts';

const codeSchema=z.string().regex(/^KNABA-LINK-[A-Za-z0-9_-]{43}$/);
const labelSchema=z.string().min(1).max(120).refine(value=>!/[\u0000-\u001f\u007f]/.test(value));
const codeHash=(code:string)=>createHash('sha256').update('KNABA-SITE-LINK-v1\0'+code).digest('hex');
const claimSchema=sourceReferenceSchema.extend({code:codeSchema,reauthAt:federationInstant,siteLabel:labelSchema}).strict();
const introspectionSchema=sourceReferenceSchema.extend({active:z.literal(true),generation:federationEpoch,reauthAt:federationInstant,sessionExpiresAt:federationInstant,siteLabel:labelSchema}).strict();
interface ChallengeRow {
 company_id:string;id:string;authority_id:string;user_id:string;session_hash:string;code_hash:string;credential_fingerprint:string;config_fingerprint:string;
 state:'ISSUED'|'CLAIMED'|'CONFIRMED'|'CANCELLED'|'EXPIRED';version:number;inspect_count:number;created_at:Date|string;expires_at:Date|string;
 source_subject:string|null;source_session_ref:string|null;source_epoch:number|null;source_security_fingerprint:string|null;source_policy_version:number|null;
 source_generation:number|null;source_reauth_at:Date|string|null;site_label:string|null;binding_id:string|null;
}
const instant=(value:Date|string)=>new Date(value).toISOString();
const reference=(row:ChallengeRow):SourceReference=>sourceReferenceSchema.parse({subject:row.source_subject,sessionRef:row.source_session_ref,epoch:row.source_epoch,securityFingerprint:row.source_security_fingerprint,sourcePolicyVersion:row.source_policy_version});
function status(row:ChallengeRow,now:string){return {id:row.id,authorityId:row.authority_id,state:row.state==='ISSUED'||row.state==='CLAIMED'?Date.parse(instant(row.expires_at))<=Date.parse(now)?'EXPIRED':row.state:row.state,version:row.version,expiresAt:instant(row.expires_at),subject:row.source_subject,siteLabel:row.site_label,bindingId:row.binding_id};}

/** F2 links existing identities only. This class cannot issue an ERP session. */
export class SiteIdentityLinks {
 readonly ledger:SiteFederationLedger;
 private readonly reauth:SiteLinkReauthentication;
 private readonly bindings:SiteIdentityBindings;
 private readonly claimLimiter=new RateLimiter(60,60000);
 constructor(private readonly auth:AuthService,private readonly authorities:()=>FederationAuthorities=()=>new FederationAuthorities(),private readonly fetchImpl?:typeof fetch){
  this.ledger=new SiteFederationLedger(auth.db,authorities);this.reauth=new SiteLinkReauthentication(auth);
  this.bindings=new SiteIdentityBindings(auth.db as Database,auth.options.companyId,()=>authorities().bindingTrust());
 }
 private async clock(tx:SqlTransaction){return instant((await sql(tx,'SELECT clock_timestamp() AS now')).rows[0].now);}
 private config(row:ChallengeRow){return this.authorities().require(row.authority_id,row.config_fingerprint);}
 private async rowIn(tx:SqlTransaction,id:string){federationUuid.parse(id);const row=(await sql(tx,'SELECT * FROM site_identity_link_challenges WHERE company_id=$1 AND id=$2',[this.auth.options.companyId,id])).rows[0] as ChallengeRow|undefined;assert(row,'FEDERATION_CONFLICT');return row;}
 private async pendingIn(tx:SqlTransaction,row:ChallengeRow,requirePending=true){
  const now=await this.clock(tx);assert(row.company_id===this.auth.options.companyId&&Date.parse(instant(row.expires_at))>Date.parse(now)&&(!requirePending||row.state==='ISSUED'||row.state==='CLAIMED'),'FEDERATION_CONFLICT');
  const session=(await sql(tx,'SELECT user_id FROM auth_sessions WHERE company_id=$1 AND user_id=$2 AND token_hash=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp()',[row.company_id,row.user_id,row.session_hash])).rows[0];assert(session,'NEEDS_REAUTH');
  const user=await tx.get('user',row.user_id);siteLinkUserEligible(user,this.auth.options.appMode);
  const credential=(await sql(tx,'SELECT password_hash,totp_secret FROM auth_credentials WHERE company_id=$1 AND user_id=$2',[row.company_id,row.user_id])).rows[0];assert(siteLinkCredentialFingerprint(user,credential)===row.credential_fingerprint,'NEEDS_REAUTH');
  this.config(row);return now;
 }
 private async auditIn(tx:SqlTransaction,row:ChallengeRow,action:string,actorId=row.user_id){await sql(tx,'INSERT INTO audit_log(company_id,actor_id,action,aggregate_kind,aggregate_id,detail) VALUES($1,$2,$3,\'site_identity_link_challenge\',$4,$5)',[row.company_id,actorId,action,row.id,JSON.stringify({state:row.state,version:row.version,authorityId:row.authority_id})]);}
 async list(req:Request){
  const web=await this.reauth.web(req);
  return this.auth.transaction(web.actor,async tx=>{
   siteLinkUserEligible(await tx.get('user',web.actor.userId),this.auth.options.appMode);
   const configs=this.authorities().list().filter(c=>c.companyId===web.actor.companyId);
   const rows=(await sql(tx,`SELECT id,issuer,audience,subject,status,version,created_at,revoked_at FROM site_identity_bindings WHERE company_id=$1 AND user_id=$2 ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END,created_at DESC LIMIT 64`,[web.actor.companyId,web.actor.userId])).rows;
   const challenge=(await sql(tx,'SELECT * FROM site_identity_link_challenges WHERE company_id=$1 AND user_id=$2 AND session_hash=$3 ORDER BY created_at DESC LIMIT 1',[web.actor.companyId,web.actor.userId,web.sessionHash])).rows[0] as ChallengeRow|undefined;
   return {enabled:configs.length>0,authorities:configs.map(c=>({id:c.authorityId,issuer:c.issuer,siteOrigin:c.siteOrigin})),bindings:rows.map(row=>({id:row.id,issuer:row.issuer,subject:row.subject,state:row.status,version:row.version,createdAt:instant(row.created_at),revokedAt:row.revoked_at?instant(row.revoked_at):null})),challenge:challenge?status(challenge,await this.clock(tx)):null};
  },10000,true);
 }
 async issue(req:Request,raw:unknown){
  const input=siteLinkCredentialSchema.extend({authorityId:z.string().min(1).max(64)}).strict().parse(raw),config=this.authorities().require(input.authorityId);
  assert(config.companyId===this.auth.options.companyId,'ACCESS_DENIED');
  const proof=await this.reauth.fresh(req,{password:input.password,...input.otp?{otp:input.otp}:{}});
  const code='KNABA-LINK-'+opaqueToken(),id=randomUUID(),fingerprint=authorityFingerprint(config);
  const result=await this.auth.transaction(proof.actor,async tx=>{
   const now=await this.reauth.currentIn(tx,proof);this.authorities().require(config.authorityId,fingerprint);
   const attempts=(await sql(tx,"SELECT count(*)::int AS n FROM site_identity_link_challenges WHERE company_id=$1 AND user_id=$2 AND created_at>clock_timestamp()-interval '10 minutes'",[proof.actor.companyId,proof.actor.userId])).rows[0].n;assert(attempts<3,'RATE_LIMITED');
   const count=(await sql(tx,"SELECT count(*)::int AS n FROM site_identity_bindings WHERE company_id=$1 AND user_id=$2 AND status='ACTIVE'",[proof.actor.companyId,proof.actor.userId])).rows[0].n;assert(count<32,'RATE_LIMITED');
   await sql(tx,"UPDATE site_identity_link_challenges SET state='CANCELLED',version=version+1 WHERE company_id=$1 AND user_id=$2 AND state IN ('ISSUED','CLAIMED')",[proof.actor.companyId,proof.actor.userId]);
   const expiresAt=new Date(Date.parse(proof.reauthAt)+300000).toISOString();
   const row=(await sql(tx,`INSERT INTO site_identity_link_challenges(company_id,id,authority_id,user_id,session_hash,code_hash,credential_fingerprint,config_fingerprint,state,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ISSUED',$9,$10) RETURNING *`,[proof.actor.companyId,id,config.authorityId,proof.actor.userId,proof.sessionHash,codeHash(code),proof.credentialFingerprint,fingerprint,now,expiresAt])).rows[0] as ChallengeRow;
   await this.auditIn(tx,row,'SITE_IDENTITY_LINK_CHALLENGE_ISSUED');await this.reauth.currentIn(tx,proof);this.authorities().require(config.authorityId,fingerprint);
   return {...status(row,await this.clock(tx)),siteUrl:config.siteOrigin+'/account/erp-link/'};
  },10000);
  return {...result,code};
 }
 async cancel(req:Request,id:string,raw:unknown){
  const input=z.object({expectedVersion:z.number().int().positive()}).strict().parse(raw),web=await this.reauth.web(req,true);
  return this.auth.transaction(web.actor,async tx=>{
   const row=await this.rowIn(tx,id);assert(row.user_id===web.actor.userId&&row.session_hash===web.sessionHash,'NEEDS_REAUTH');
   assert(row.version===input.expectedVersion&&(row.state==='ISSUED'||row.state==='CLAIMED'),'VERSION_CONFLICT');
   const saved=(await sql(tx,"UPDATE site_identity_link_challenges SET state='CANCELLED',version=version+1 WHERE company_id=$1 AND id=$2 RETURNING *",[row.company_id,row.id])).rows[0] as ChallengeRow;
   await this.auditIn(tx,saved,'SITE_IDENTITY_LINK_CHALLENGE_CANCELLED');return status(saved,await this.clock(tx));
  },10000);
 }
 async confirm(req:Request,id:string,raw:unknown){
  const input=z.object({expectedVersion:z.number().int().positive(),subject:federationSubject}).strict().parse(raw),web=await this.reauth.web(req,true);
  // Network is outside every SQL transaction. A later fence is checked again in
  // the final company transaction, including after proof consumption/F1 writes.
  const snapshot=await this.auth.transaction(web.actor,async tx=>{
   const row=await this.rowIn(tx,id);assert(row.user_id===web.actor.userId&&row.session_hash===web.sessionHash,'NEEDS_REAUTH');
   assert(row.state==='CLAIMED'&&row.version===input.expectedVersion&&row.source_subject===input.subject,'FEDERATION_CONFLICT');
   await this.pendingIn(tx,row);const config=this.config(row);await this.ledger.currentSourceIn(tx,config,row.source_generation!,reference(row));return {row,config};
  },10000,true);
  let response;try{response=await sendFederation(snapshot.config,'ERP_TO_SITE','INTROSPECT',{...reference(snapshot.row),challengeId:id,purpose:'LINK_CONFIRM'},{generation:snapshot.row.source_generation!,fetchImpl:this.fetchImpl});}catch{throw new DomainError('FEDERATION_UNAVAILABLE');}
  assert(response.status===200,'FEDERATION_UNAVAILABLE');const parsed=introspectionSchema.safeParse(response.result);assert(parsed.success,'NEEDS_REAUTH');const source=parsed.data;
  const expected=reference(snapshot.row);assert(Object.entries(expected).every(([key,value])=>source[key as keyof typeof source]===value)&&source.generation===snapshot.row.source_generation,'NEEDS_REAUTH');
  return this.auth.transaction(web.actor,async tx=>{
   const row=await this.rowIn(tx,id);assert(row.user_id===web.actor.userId&&row.session_hash===web.sessionHash&&row.state==='CLAIMED'&&row.version===input.expectedVersion&&row.source_subject===input.subject,'FEDERATION_CONFLICT');
   const now=await this.pendingIn(tx,row),config=this.config(row);
   assert(config.authorityId===snapshot.config.authorityId&&row.config_fingerprint===snapshot.row.config_fingerprint&&source.generation===row.source_generation,'NEEDS_REAUTH');
   const sourceFresh=()=>assert(Date.parse(source.reauthAt)>=Date.parse(instant(row.source_reauth_at!))&&Date.parse(source.reauthAt)<=Date.parse(now)+5000&&Date.parse(now)-Date.parse(source.reauthAt)<300000&&Date.parse(source.sessionExpiresAt)>Date.parse(now),'NEEDS_REAUTH');sourceFresh();
   const active=await this.ledger.currentSourceIn(tx,config,row.source_generation!,reference(row));assert(active.session.expiresAt===source.sessionExpiresAt,'NEEDS_REAUTH');
   const referenceHash=createHash('sha256').update('KNABA-SITE-LINK-CONSUMED-v1\0'+row.id+'\0'+row.code_hash+'\0'+response.context.nonce+'\0'+row.source_subject).digest('hex');
   const binding=await this.bindings.recordVerifiedLinkIn(tx as PgTransaction,{issuer:config.issuer,audience:config.erpAudience,subject:row.source_subject!},referenceHash);
   const saved=(await sql(tx,"UPDATE site_identity_link_challenges SET state='CONFIRMED',binding_id=$3,version=version+1 WHERE company_id=$1 AND id=$2 RETURNING *",[row.company_id,row.id,binding.id])).rows[0] as ChallengeRow;
   await this.auditIn(tx,saved,'SITE_IDENTITY_LINK_CONFIRMED');
   const finished=await this.pendingIn(tx,saved,false);assert(Date.parse(finished)-Date.parse(source.reauthAt)<300000&&Date.parse(source.sessionExpiresAt)>Date.parse(finished),'NEEDS_REAUTH');await this.ledger.currentSourceIn(tx,config,row.source_generation!,reference(row));
   return {challenge:status(saved,finished),binding:{id:binding.id,state:binding.status,version:binding.version,subject:binding.subject,issuer:binding.issuer}};
  },10000);
 }
 async unlink(req:Request,id:string,raw:unknown){
  federationUuid.parse(id);const input=siteLinkCredentialSchema.extend({expectedVersion:z.number().int().positive()}).strict().parse(raw);
  const proof=await this.reauth.fresh(req,{password:input.password,...input.otp?{otp:input.otp}:{}});
  return this.auth.transaction(proof.actor,async tx=>{
   await this.reauth.currentIn(tx,proof);const row=await this.bindings.revokeIn(tx as PgTransaction,id,input.expectedVersion);await this.reauth.currentIn(tx,proof);
   return {id:row.id,state:row.status,version:row.version};
  },10000);
 }
 async authority(request:VerifiedFederationRequest){return this.ledger.handle(request,(tx,verified,config,current)=>this.sourceActionIn(tx,verified,config,current));}
 private async sourceActionIn(tx:SqlTransaction,request:VerifiedFederationRequest,config:FederationAuthority,current:FederationCurrent):Promise<Record<string,unknown>>{
  this.claimLimiter.check(config.authorityId+'\0'+request.envelope.action);
  const {action,payload}=request.envelope;
  if(action==='LINK_STATUS'){
   const input=sourceReferenceSchema.parse(payload);await this.ledger.currentSourceIn(tx,config,current.generation,input);
   const bindings=(await sql(tx,'SELECT id,status,version FROM site_identity_bindings WHERE company_id=$1 AND issuer=$2 AND subject=$3',[config.companyId,config.issuer,input.subject])).rows;
   const challenges=(await sql(tx,'SELECT id,state,expires_at FROM site_identity_link_challenges WHERE company_id=$1 AND authority_id=$2 AND source_subject=$3 AND source_session_ref=$4 AND source_epoch=$5 AND source_security_fingerprint=$6 AND source_generation=$7 ORDER BY created_at DESC LIMIT 8',[config.companyId,config.authorityId,input.subject,input.sessionRef,input.epoch,input.securityFingerprint,current.generation])).rows;
   const now=Date.parse(await this.clock(tx));return {bindings:bindings.map(row=>({bindingId:row.id,state:row.status,version:row.version})),challenges:challenges.map(row=>({challengeId:row.id,state:['ISSUED','CLAIMED'].includes(row.state)&&Date.parse(instant(row.expires_at))<=now?'EXPIRED':row.state,expiresAt:instant(row.expires_at)}))};
  }
  const input=action==='CLAIM'?claimSchema.parse(payload):z.object({code:codeSchema}).strict().parse(payload);
  const row=(await sql(tx,'SELECT * FROM site_identity_link_challenges WHERE company_id=$1 AND authority_id=$2 AND code_hash=$3',[config.companyId,config.authorityId,codeHash(input.code)])).rows[0] as ChallengeRow|undefined;
  assert(row&&row.state==='ISSUED','FEDERATION_CONFLICT');const now=await this.pendingIn(tx,row);
  if(action==='INSPECT_CHALLENGE'){
   assert(row.inspect_count<10,'RATE_LIMITED');await sql(tx,'UPDATE site_identity_link_challenges SET inspect_count=inspect_count+1 WHERE company_id=$1 AND id=$2',[row.company_id,row.id]);
   const user=await tx.get('user',row.user_id),company=await tx.get('company',row.company_id).catch(error=>{if(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE')return undefined;throw error;});
   return {challengeId:row.id,companyLabel:String(company?.data.name??row.company_id).slice(0,120),erpUserLabel:String(user.data.name??user.data.displayName??user.id).slice(0,120),expiresAt:instant(row.expires_at)};
  }
  const claim=claimSchema.parse(payload);assert(Date.parse(claim.reauthAt)<=Date.parse(now)+5000&&Date.parse(now)-Date.parse(claim.reauthAt)<300000,'NEEDS_REAUTH');
  const source=sourceReferenceSchema.parse({subject:claim.subject,sessionRef:claim.sessionRef,epoch:claim.epoch,securityFingerprint:claim.securityFingerprint,sourcePolicyVersion:claim.sourcePolicyVersion});await this.ledger.currentSourceIn(tx,config,current.generation,source);
  const existing=(await sql(tx,'SELECT id FROM site_identity_bindings WHERE company_id=$1 AND issuer=$2 AND subject=$3',[config.companyId,config.issuer,claim.subject])).rows[0];assert(!existing,'FEDERATION_CONFLICT');
  const saved=(await sql(tx,`UPDATE site_identity_link_challenges SET state='CLAIMED',version=version+1,source_subject=$3,source_session_ref=$4,source_epoch=$5,source_security_fingerprint=$6,source_policy_version=$7,source_generation=$8,source_reauth_at=$9,site_label=$10 WHERE company_id=$1 AND id=$2 RETURNING *`,[row.company_id,row.id,claim.subject,claim.sessionRef,claim.epoch,claim.securityFingerprint,claim.sourcePolicyVersion,current.generation,claim.reauthAt,claim.siteLabel])).rows[0] as ChallengeRow;
  await this.auditIn(tx,saved,'SITE_IDENTITY_LINK_CLAIMED','SITE_FEDERATION');await this.pendingIn(tx,saved);
  return {challengeId:row.id,state:'CLAIMED',expiresAt:instant(row.expires_at)};
 }
}
