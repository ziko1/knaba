import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import * as OTPAuth from 'otpauth';
import type {Request,Response} from 'express';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {AuthService,hashPassword,sealSecret} from '../apps/api/auth.ts';

const sql=process.env.DATABASE_URL?describe:describe.skip;
const originalPassword='Synthetic login original password 123!';
const rotatedPassword='Synthetic login rotated password 456!';
const encryptionKey='synthetic-login-race-encryption-key';
const totpSecret='JBSWY3DPEHPK3PXP';
const request=(headers:Record<string,string>={})=>({
 get:(name:string)=>headers[name]??(name==='origin'?'https://erp.example.test':undefined),ip:'127.0.0.1'
} as unknown as Request);
function response(){const cookies:unknown[]=[];return {cookies,cookie:(...args:unknown[])=>cookies.push(args)} as unknown as Response & {cookies:unknown[]};}

sql('PostgreSQL login finalization and credential revocation',()=>{
 let db:Database,engine:Engine,auth:AuthService,company:string,originalHash:string,rotatedHash:string;
 beforeAll(async()=>{
  expect(process.env.APP_MODE).toBe('TEST');
  db=new Database();await db.migrate();engine=new Engine(db,'TEST');
  [originalHash,rotatedHash]=await Promise.all([hashPassword(originalPassword),hashPassword(rotatedPassword)]);
 });
 beforeEach(async()=>{
  company='login-race-'+randomUUID();
  await db.transaction(company,'SYNTHETIC_FIXTURE',async tx=>{
   await tx.add('user',{name:'Synthetic employee',email:'employee@example.test',active:true,roles:['EMPLOYEE']},'employee');
   await tx.query('INSERT INTO auth_credentials(user_id,company_id,password_hash,totp_secret,totp_last_counter) VALUES($1,$2,$3,NULL,-1)',['employee',company,originalHash]);
  });
  auth=new AuthService(db,engine,{companyId:company,appMode:'TEST',publicOrigin:'https://erp.example.test',encryptionKey});
 });
 afterAll(async()=>{await db?.close();});
 const login=(res:Response,extra:Record<string,string>={})=>auth.login(request(),res,{email:'employee@example.test',password:originalPassword,...extra});
 // Arrange a real committed credential mutation after the actual SQL read and
 // before scrypt completes. Only scheduling is controlled; storage is PostgreSQL.
 async function afterCredentialRead(work:()=>Promise<void>,run:()=>Promise<unknown>){
  const query=db.query.bind(db);let fired=false;
  db.query=async(statement,params=[])=>{
   const result=await query(statement,params);
   if(!fired&&statement.startsWith('SELECT password_hash')){fired=true;await work();}
   return result;
  };
  try{await run();expect(fired).toBe(true);}finally{db.query=query;}
 }
 it('cannot mint a new session from an old password after committed rotation/revocation',async()=>{
  await auth.createSession('employee');const res=response();
  await afterCredentialRead(()=>db.transaction(company,'SYNTHETIC_ROTATION',async tx=>{
   await tx.query('UPDATE auth_credentials SET password_hash=$3 WHERE user_id=$1 AND company_id=$2',['employee',company,rotatedHash]);
   await tx.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND company_id=$2',['employee',company]);
  }),()=>expect(login(res)).rejects.toMatchObject({code:'NEEDS_REAUTH'}));
  const sessions=(await db.query('SELECT revoked_at FROM auth_sessions WHERE company_id=$1',[company])).rows;
  expect(sessions).toHaveLength(1);expect(sessions[0].revoked_at).not.toBeNull();expect(res.cookies).toEqual([]);
 });
 it('rejects a changed MFA secret even when the previously read password still verifies',async()=>{
  const res=response();
  await afterCredentialRead(()=>db.transaction(company,'SYNTHETIC_MFA',async tx=>{
   await tx.query('UPDATE auth_credentials SET totp_secret=$3 WHERE user_id=$1 AND company_id=$2',['employee',company,sealSecret(totpSecret,encryptionKey)]);
  }),()=>expect(login(res)).rejects.toMatchObject({code:'NEEDS_REAUTH'}));
  expect((await db.query('SELECT token_hash FROM auth_sessions WHERE company_id=$1',[company])).rows).toHaveLength(0);
  expect(res.cookies).toEqual([]);
 });
 it('keeps a normal login company-scoped and a later rotation revokes its issued session',async()=>{
  const res=response(),logged=await login(res);
  expect(logged.actor).toMatchObject({companyId:company,userId:'employee'});expect(res.cookies).toHaveLength(1);
  const token=(res.cookies[0] as string[])[1]!;
  await expect(auth.authenticate(request({cookie:'knaba_session='+token}))).resolves.toHaveProperty('actor.userId','employee');
  await db.transaction(company,'SYNTHETIC_ROTATION',async tx=>{
   await tx.query('UPDATE auth_credentials SET password_hash=$3 WHERE user_id=$1 AND company_id=$2',['employee',company,rotatedHash]);
   await tx.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND company_id=$2',['employee',company]);
  });
  await expect(auth.authenticate(request({cookie:'knaba_session='+token}))).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('rolls back an actual SQL TOTP update on session-insert fault and emits no cookie',async()=>{
  await db.transaction(company,'SYNTHETIC_MFA',tx=>tx.query('UPDATE auth_credentials SET totp_secret=$3 WHERE user_id=$1 AND company_id=$2',['employee',company,sealSecret(totpSecret,encryptionKey)]));
  const transaction=db.transaction.bind(db),res=response();
  db.transaction=async(companyId,actorId,fn,timeout,readOnly)=>transaction(companyId,actorId,async tx=>{
   const query=tx.query.bind(tx);
   tx.query=async(statement,params=[])=>{
    if(statement.startsWith('INSERT INTO auth_sessions'))throw Error('Synthetic session-insert fault');
    return query(statement,params);
   };
   return fn(tx);
  },timeout,readOnly);
  try{
   const otp=new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(totpSecret),digits:6,period:30}).generate();
   await expect(login(res,{otp})).rejects.toThrow('Synthetic session-insert fault');
  }finally{db.transaction=transaction;}
  expect((await db.query('SELECT totp_last_counter FROM auth_credentials WHERE user_id=$1 AND company_id=$2',['employee',company])).rows[0].totp_last_counter).toBe('-1');
  expect((await db.query('SELECT token_hash FROM auth_sessions WHERE company_id=$1',[company])).rows).toHaveLength(0);
  expect(res.cookies).toEqual([]);
 });
});
