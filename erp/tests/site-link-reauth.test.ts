import {beforeAll,describe,expect,it} from 'vitest';
import type {Request} from 'express';
import * as OTPAuth from 'otpauth';
import {AuthService,csrfFor,hashPassword,hashToken,sealSecret,type SqlTransaction} from '../apps/api/auth.ts';
import {Engine} from '../apps/api/engine.ts';
import {SiteLinkReauthentication} from '../apps/api/site-link-reauth.ts';
import {assert,type Data,type Entity} from '../packages/domain/core.ts';

const password='Synthetic F2 password 2026!',token='original_web_session_for_federation_123456789';
let passwordHash:string;
beforeAll(async()=>{passwordHash=await hashPassword(password);});
class ReauthMemory {
 companyId='f2-reauth';now=Date.now();inTransaction=false;credentialReads=0;afterCredentialRead?:()=>void;
 user:Entity={companyId:this.companyId,kind:'user',id:'erp-user',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),data:{active:true,roles:['EMPLOYEE'],permissions:['identity.self'],name:'Synthetic user'}};
 credential:any={password_hash:passwordHash,totp_secret:null,totp_last_counter:-1};
 session:any={user_id:'erp-user',company_id:this.companyId,mfa_verified:false,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),revoked_at:null};
 async get(kind:string,id:string){assert(kind==='user'&&id===this.user.id,'NOT_FOUND_SAFE');return structuredClone(this.user);}
 async list(kind:string){return kind==='user'?[structuredClone(this.user)]:[];}
 async query(statement:string,params:any[]=[]){
  if(statement.includes('FROM auth_sessions'))return {rows:params[0]===hashToken(token)&&params[1]===this.companyId&&!this.session.revoked_at&&Date.parse(this.session.expires_at)>Date.now()?[structuredClone(this.session)]:[]};
  if(statement.includes('FROM auth_credentials')){this.credentialReads++;const row=structuredClone(this.credential);this.afterCredentialRead?.();return {rows:[row]};}
  if(statement.startsWith('UPDATE auth_credentials')){if(this.credential.totp_last_counter>=params[2])return {rows:[]};this.credential.totp_last_counter=params[2];return {rows:[{user_id:'erp-user'}]};}
  if(statement==='SELECT clock_timestamp() AS now')return {rows:[{now:new Date(this.now)}]};
  throw new Error('Unexpected synthetic reauthentication statement');
 }
 async transaction<T>(companyId:string,_actorId:string,fn:(tx:SqlTransaction)=>Promise<T>){expect(companyId).toBe(this.companyId);expect(this.inTransaction).toBe(false);this.inTransaction=true;const before=structuredClone(this.credential);try{return await fn(this as any);}catch(error){this.credential=before;throw error;}finally{this.inTransaction=false;}}
 async add(_kind:string,_data:Data){throw new Error('Reauthentication must not create business data');}
 async save(_row:Entity,_data:Data){throw new Error('Reauthentication must not modify business data');}
 async event(){throw new Error('Reauthentication must not enqueue credentials');}
}
function fixture(){
 const db=new ReauthMemory(),engine=new Engine(db as any,'TEST'),options={companyId:db.companyId,appMode:'TEST',publicOrigin:'https://erp.example.invalid',encryptionKey:'synthetic-encryption-key-32-bytes-long'};
 const auth=new AuthService(db as any,engine,options),reauth=new SiteLinkReauthentication(auth);
 const request=(changes:Record<string,string|undefined>={})=>{const headers:Record<string,string|undefined>={cookie:`knaba_session=${token}`,'x-csrf-token':csrfFor(token),origin:options.publicOrigin,...changes};return {get:(name:string)=>headers[name.toLowerCase()],ip:'127.0.0.1'} as Request;};
 return {db,auth,reauth,request,options};
}
describe('fresh original-cookie ERP proof for F2',()=>{
 it('requires the actual password and returns only a digest-bound bounded witness',async()=>{
  const f=fixture(),proof=await f.reauth.fresh(f.request(),{password});expect(proof.actor.userId).toBe('erp-user');expect(proof.sessionHash).toBe(hashToken(token));expect(proof.credentialFingerprint).toMatch(/^[a-f0-9]{64}$/);
  const text=JSON.stringify(proof);expect(text).not.toContain(password);expect(text).not.toContain(passwordHash);expect(text).not.toContain(token);
  await expect(f.reauth.fresh(f.request(),{password:'incorrect synthetic password'})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it.each(['missing-csrf','foreign-origin','missing-cookie'])('does not accept %s as fresh ERP possession',async attack=>{
  const f=fixture(),changes=attack==='missing-csrf'?{'x-csrf-token':undefined}:attack==='foreign-origin'?{origin:'https://other.invalid'}:{cookie:undefined};
  await expect(f.reauth.fresh(f.request(changes),{password})).rejects.toThrow();expect(f.db.credentialReads).toBe(0);
 });
 it.each(['GUEST','SERVICE_ACCOUNT'])('rejects a %s even if a cookie is placed in the web slot',async role=>{
  const f=fixture();f.db.user.data.roles=[role];await expect(f.reauth.fresh(f.request(),{password})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('rejects a credential replacement while scrypt is outside the company transaction',async()=>{
  const f=fixture();let changed=false;
  f.db.afterCredentialRead=()=>{if(f.db.credentialReads===1)setTimeout(()=>{expect(f.db.inTransaction).toBe(false);f.db.credential.password_hash='synthetic-replaced-verifier';changed=true;},0);};
  await expect(f.reauth.fresh(f.request(),{password})).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(changed).toBe(true);
 });
 it('rejects the original session revoked while scrypt completes, regardless of successful password verification',async()=>{
  const f=fixture();let changed=false;f.db.afterCredentialRead=()=>{if(f.db.credentialReads===1)setTimeout(()=>{f.db.session.revoked_at=new Date().toISOString();changed=true;},0);};
  await expect(f.reauth.fresh(f.request(),{password})).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(changed).toBe(true);
 });
 it('requires current MFA and consumes its counter instead of trusting a prior session mfa flag',async()=>{
  const f=fixture(),secret='JBSWY3DPEHPK3PXP';f.db.credential.totp_secret=sealSecret(secret,f.options.encryptionKey);f.db.session.mfa_verified=true;f.db.user.data.mfaRequired=true;
  await expect(f.reauth.fresh(f.request(),{password})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  const otp=new OTPAuth.TOTP({issuer:'KNABA DE',algorithm:'SHA1',digits:6,period:30,secret:OTPAuth.Secret.fromBase32(secret)}).generate({timestamp:f.db.now});
  await f.reauth.fresh(f.request(),{password,otp});expect(f.db.credential.totp_last_counter).toBe(Math.floor(f.db.now/30000));
  await expect(f.reauth.fresh(f.request(),{password,otp})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('expires the witness by the transaction clock and rejects changed current roles',async()=>{
  const f=fixture(),proof=await f.reauth.fresh(f.request(),{password});f.db.now+=300000;
  await expect(f.auth.transaction(proof.actor,tx=>f.reauth.currentIn(tx,proof))).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  f.db.now-=300000;f.db.user.data.roles=['CLIENT'];await expect(f.auth.transaction(proof.actor,tx=>f.reauth.currentIn(tx,proof))).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('rejects extra browser identity/session claims rather than treating them as a proof',async()=>{
  const f=fixture();await expect(f.reauth.fresh(f.request(),{password,userId:'other-user',sessionHash:hashToken(token)})).rejects.toThrow();expect(f.db.credentialReads).toBe(0);
 });
});
