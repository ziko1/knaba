import {beforeAll,describe,expect,it} from 'vitest';
import * as OTPAuth from 'otpauth';
import type {Request,Response} from 'express';
import {AuthService,hashPassword,sealSecret,type DatabaseLike,type EngineLike,type SqlTransaction} from '../apps/api/auth.ts';
import {DomainError,type Actor,type Data,type Entity} from '../packages/domain/core.ts';

// Explicit CPU storage double. Real serialization/rollback is exercised separately
// in login-revocation.integration.test.ts against PostgreSQL, never inferred here.
class LoginDatabase implements DatabaseLike,SqlTransaction {
 companyId='login-company';inTransaction=false;
 user:Entity={id:'employee',kind:'user',companyId:this.companyId,version:1,
  data:{active:true,roles:['EMPLOYEE'],email:'employee@example.test',name:'Synthetic'},
  createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 credential:Data={};sessions:Data[]=[];writesInsideTransaction:boolean[]=[];
 afterCredentialRead?:()=>void;
 failInsert=false;
 async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>> {
  if(kind!=='user'||id!==this.user.id||this.user.companyId!==this.companyId)throw new DomainError('NOT_FOUND_SAFE');
  return structuredClone(this.user) as Entity<T>;
 }
 async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]> {
  return kind==='user'?[structuredClone(this.user) as Entity<T>]:[];
 }
 async add<T extends Data=Data>(_kind:string,_data:T):Promise<Entity<T>>{throw Error('Unexpected add');}
 async save(_row:Entity,_data:Data):Promise<Entity>{throw Error('Unexpected save');}
 async event(){throw Error('Unexpected event');}
 async transaction<T>(company:string,_actor:string,fn:(tx:SqlTransaction)=>Promise<T>):Promise<T> {
  if(this.inTransaction)throw Error('Nested authentication transaction');
  expect(company).toBe(this.companyId);
  const before=structuredClone({credential:this.credential,sessions:this.sessions});
  this.inTransaction=true;
  try{return await fn(this);}catch(error){Object.assign(this,before);throw error;}
  finally{this.inTransaction=false;}
 }
 async query(statement:string,params:any[]=[]){
  if(statement.startsWith('SELECT password_hash')){
   expect(params).toEqual([this.user.id,this.companyId]);
   const result={rows:[structuredClone(this.credential)]};
   if(!this.inTransaction){const race=this.afterCredentialRead;this.afterCredentialRead=undefined;race?.();}
   return result;
  }
  if(statement.startsWith('UPDATE auth_credentials SET totp_last_counter')){
   this.writesInsideTransaction.push(this.inTransaction);
   if(this.credential.totp_last_counter>=params[2])return {rows:[]};
   this.credential.totp_last_counter=params[2];return {rows:[{user_id:this.user.id}]};
  }
  if(statement.startsWith('INSERT INTO auth_sessions')){
   this.writesInsideTransaction.push(this.inTransaction);
   if(this.failInsert)throw Error('Synthetic session storage failure');
   this.sessions.push({hash:params[0],userId:params[1],companyId:params[2],mfa:params[4]});return {rows:[]};
  }
  throw Error('Unexpected authentication query');
 }
}
const request=()=>({get:(name:string)=>name==='origin'?'https://erp.example.test':undefined,ip:'127.0.0.1'} as unknown as Request);
function response(){const cookies:unknown[]=[];return {cookies,cookie:(...args:unknown[])=>cookies.push(args)} as unknown as Response & {cookies:unknown[]};}
function engine(db:LoginDatabase):EngineLike {
 const actorIn=async(tx:SqlTransaction,userId:string):Promise<Actor>=>{
  const user=await tx.get('user',userId);
  if(user.data.active===false)throw new DomainError('ACCESS_DENIED');
  return {userId,companyId:db.companyId,roles:user.data.roles,permissions:[],siteIds:[],customerIds:[],warehouseIds:[]};
 };
 return {actorIn,getActor:(_id,_company)=>actorIn(db,_id),registry:{},execute:async()=>{},readEntities:async()=>[]};
}
const password='Synthetic original password 123!',key='synthetic-login-encryption-key',secret='JBSWY3DPEHPK3PXP';
let originalHash:string,rotatedHash:string;
beforeAll(async()=>{[originalHash,rotatedHash]=await Promise.all([hashPassword(password),hashPassword('Synthetic rotated password 456!')]);});
function fixture(mode='TEST'){
 const db=new LoginDatabase();db.credential={password_hash:originalHash,totp_secret:null,totp_last_counter:-1};
 const service=new AuthService(db,engine(db),{companyId:db.companyId,appMode:mode,publicOrigin:'https://erp.example.test',encryptionKey:key});
 return {db,service,res:response()};
}
describe('ERP credential revocation during password verification',()=>{
 it('rejects the old password if rotation commits after credential read, before session issue',async()=>{
  const {db,service,res}=fixture();db.afterCredentialRead=()=>{db.credential.password_hash=rotatedHash;};
  await expect(service.login(request(),res,{email:db.user.data.email,password})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(db.sessions).toEqual([]);expect(res.cookies).toEqual([]);
 });
 it('rejects a stale MFA configuration instead of issuing a password-only session',async()=>{
  const {db,service,res}=fixture();db.afterCredentialRead=()=>{db.credential.totp_secret=sealSecret(secret,key);};
  await expect(service.login(request(),res,{email:db.user.data.email,password})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(db.sessions).toEqual([]);expect(res.cookies).toEqual([]);
 });
 it('rejects an email identity changed during password verification',async()=>{
  const {db,service,res}=fixture();const email=db.user.data.email;
  db.afterCredentialRead=()=>{db.user.data.email='different@example.test';};
  await expect(service.login(request(),res,{email,password})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(db.sessions).toEqual([]);expect(res.cookies).toEqual([]);
 });
 it('refuses a disabled target without issuing a cookie or session',async()=>{
  const {db,service,res}=fixture();db.afterCredentialRead=()=>{db.user.data.active=false;};
  await expect(service.login(request(),res,{email:db.user.data.email,password})).rejects.toBeDefined();
  expect(db.sessions).toEqual([]);expect(res.cookies).toEqual([]);
 });
 it('uses current privileged roles to require MFA in production',async()=>{
  const {db,service,res}=fixture('PRODUCTION');db.afterCredentialRead=()=>{db.user.data.roles=['OWNER'];};
  await expect(service.login(request(),res,{email:db.user.data.email,password})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(db.sessions).toEqual([]);expect(res.cookies).toEqual([]);
 });
 it('issues the normal current-user session under the company transaction',async()=>{
  const {db,service,res}=fixture();const result=await service.login(request(),res,{email:db.user.data.email,password});
  expect(result.actor).toMatchObject({userId:db.user.id,companyId:db.companyId,roles:['EMPLOYEE']});
  expect(result.user).toMatchObject({id:db.user.id,email:db.user.data.email});
  expect(db.sessions).toHaveLength(1);expect(res.cookies).toHaveLength(1);
  expect(db.writesInsideTransaction).toEqual([true]);
 });
 it('consumes TOTP and creates its session atomically',async()=>{
  const {db,service,res}=fixture('PRODUCTION');db.user.data.roles=['OWNER'];db.credential.totp_secret=sealSecret(secret,key);
  const otp=new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(secret),digits:6,period:30}).generate();
  const result=await service.login(request(),res,{email:db.user.data.email,password,otp});
  expect(result.actor.mfaVerified).toBe(true);expect(db.writesInsideTransaction).toEqual([true,true]);
  expect(db.sessions).toHaveLength(1);expect(res.cookies).toHaveLength(1);
 });
 it('rolls back the TOTP replay counter when session storage fails',async()=>{
  const {db,service,res}=fixture('PRODUCTION');db.user.data.roles=['OWNER'];db.credential.totp_secret=sealSecret(secret,key);db.failInsert=true;
  const otp=new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(secret),digits:6,period:30}).generate();
  await expect(service.login(request(),res,{email:db.user.data.email,password,otp})).rejects.toThrow('Synthetic session storage failure');
  expect(db.credential.totp_last_counter).toBe(-1);expect(db.sessions).toEqual([]);expect(res.cookies).toEqual([]);
 });
});
