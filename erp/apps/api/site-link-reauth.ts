import type {Request} from 'express';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {assert,type Actor,type Entity} from '../../packages/domain/core.ts';
import {canonicalJson} from '../../packages/integrations/site-federation-protocol.mjs';
import {AuthService,hashToken,openSecret,RateLimiter,sql,validateTotp,verifyPassword,type SqlTransaction} from './auth.ts';

export const siteLinkCredentialSchema=z.object({password:z.string().min(1).max(128),otp:z.string().regex(/^\d{6}$/).optional()}).strict();
const privileged=new Set(['OWNER','DIRECTOR','OPERATIONS_MANAGER','ACCOUNTANT','BOT_ADMIN','DISPATCHER']);
export interface SiteLinkWebProof {actor:Actor;sessionHash:string;credentialFingerprint:string;reauthAt:string}
export function siteLinkUserEligible(user:Entity,mode:string){
 const d=user.data;
 assert(user.kind==='user'&&d.active===true&&d.guest!==true&&!d.roles?.some((role:string)=>role==='GUEST'||role==='SERVICE_ACCOUNT')&&(mode!=='PRODUCTION'||d.synthetic!==true&&d.demo!==true),'NEEDS_REAUTH');
}
/** Only the digest leaves the protected auth database/transaction. */
export function siteLinkCredentialFingerprint(user:Entity,credential:any){
 assert(credential&&typeof credential.password_hash==='string','NEEDS_REAUTH');
 const d=user.data;
 return createHash('sha256').update('KNABA-ERP-LINK-CREDENTIAL-v1\0'+canonicalJson({companyId:user.companyId,userId:user.id,passwordHash:credential.password_hash,totpSecret:credential.totp_secret??null,active:d.active===true,mfaRequired:d.mfaRequired===true,email:d.email??null,roles:[...(d.roles??[])].sort(),permissions:[...(d.permissions??[])].sort()})).digest('hex');
}
export class SiteLinkReauthentication {
 private readonly limiter=new RateLimiter(5,60000);
 constructor(private readonly auth:AuthService){}
 async web(req:Request,mutation=false){
  const authenticated=mutation?await this.auth.mutation(req):await this.auth.authenticate(req);
  assert(!authenticated.device&&!authenticated.guest,'NEEDS_REAUTH');
  return {actor:authenticated.actor,sessionHash:hashToken(authenticated.token)};
 }
 async fresh(req:Request,raw:unknown):Promise<SiteLinkWebProof>{
  const input=siteLinkCredentialSchema.parse(raw),web=await this.web(req,true);
  this.limiter.check(hashToken(web.actor.companyId+'\0'+web.actor.userId));
  const earlier=await this.auth.transaction(web.actor,async tx=>{
   const user=await tx.get('user',web.actor.userId);siteLinkUserEligible(user,this.auth.options.appMode);
   const credential=(await sql(tx,'SELECT password_hash,totp_secret,totp_last_counter FROM auth_credentials WHERE company_id=$1 AND user_id=$2',[web.actor.companyId,web.actor.userId])).rows[0];
   return {credential,fingerprint:siteLinkCredentialFingerprint(user,credential)};
  },10000,true);
  assert(await verifyPassword(input.password,earlier.credential.password_hash),'NEEDS_REAUTH');
  return this.auth.transaction(web.actor,async tx=>{
   const user=await tx.get('user',web.actor.userId);siteLinkUserEligible(user,this.auth.options.appMode);
   const credential=(await sql(tx,'SELECT password_hash,totp_secret,totp_last_counter FROM auth_credentials WHERE company_id=$1 AND user_id=$2 FOR UPDATE',[web.actor.companyId,web.actor.userId])).rows[0];
   const fingerprint=siteLinkCredentialFingerprint(user,credential);assert(fingerprint===earlier.fingerprint,'NEEDS_REAUTH');
   const now=new Date((await sql(tx,'SELECT clock_timestamp() AS now')).rows[0].now);
   if(credential.totp_secret){
    const counter=validateTotp(openSecret(credential.totp_secret,this.auth.options.encryptionKey),input.otp??'',now.getTime());assert(counter!==null,'NEEDS_REAUTH');
    const consumed=await sql(tx,'UPDATE auth_credentials SET totp_last_counter=$3 WHERE company_id=$1 AND user_id=$2 AND totp_last_counter<$3 RETURNING user_id',[web.actor.companyId,web.actor.userId,counter]);assert(consumed.rows.length===1,'NEEDS_REAUTH');
   }else assert(user.data.mfaRequired!==true&&(this.auth.options.appMode!=='PRODUCTION'||!user.data.roles?.some((role:string)=>privileged.has(role))),'NEEDS_REAUTH');
   return {...web,credentialFingerprint:fingerprint,reauthAt:now.toISOString()};
  },10000);
 }
 async currentIn(tx:SqlTransaction,proof:SiteLinkWebProof){
  const user=await tx.get('user',proof.actor.userId);siteLinkUserEligible(user,this.auth.options.appMode);
  const credential=(await sql(tx,'SELECT password_hash,totp_secret FROM auth_credentials WHERE company_id=$1 AND user_id=$2',[proof.actor.companyId,proof.actor.userId])).rows[0];
  const now=new Date((await sql(tx,'SELECT clock_timestamp() AS now')).rows[0].now).getTime();
  assert(siteLinkCredentialFingerprint(user,credential)===proof.credentialFingerprint&&Date.parse(proof.reauthAt)<=now&&now-Date.parse(proof.reauthAt)<300000,'NEEDS_REAUTH');
  return new Date(now).toISOString();
 }
}
