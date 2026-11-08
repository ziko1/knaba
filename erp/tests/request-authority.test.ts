import {afterEach,describe,it,expect,vi} from 'vitest';
import {DomainError} from '../packages/domain/core.ts';
import type {DatabaseLike,SqlTransaction} from '../apps/api/auth.ts';
import {runRequestAuthority,duringAuthentication,registerRequestAuthority,beginRequestAuthority,finishRequestAuthority,committedRequestAuthority,recordOwnSessionRevocation,recordOwnDeviceRetirement,verifyResponseAuthority,type RequestAuthorityProof} from '../apps/api/request-authority.ts';

// Explicit in-memory SQL/transaction doubles test async context and capabilities.
// Actual HTTP/PostgreSQL races live in request-authority.integration.test.ts.
function fixture(companyId='a',userId='user'){
 const expiresAt=Date.now()+60000,hash='a'.repeat(64);
 const session={company_id:companyId,user_id:userId,expires_at:new Date(expiresAt),revoked_at:null as Date|null};
 const user={id:userId,companyId,kind:'user',version:1,data:{active:true,guest:false},createdAt:'',updatedAt:''};
 const device={id:'device',companyId,kind:'device',version:1,data:{active:true,employeeId:userId,tokenHash:hash,tokenExpiresAt:new Date(expiresAt).toISOString(),revokedAt:null as string|null},createdAt:'',updatedAt:''};
 const proof:RequestAuthorityProof={kind:'SESSION',companyId,userId,tokenHash:hash,expiresAt,guest:false};
 const tx={companyId,query:async()=>({rows:[session]}),get:async(kind:string,id:string)=>{if(kind==='user'&&id===userId)return user;if(kind==='device'&&id==='device')return device;throw new DomainError('NOT_FOUND_SAFE');}} as unknown as SqlTransaction;
 const db={query:async()=>({rows:[]}),transaction:async(cid:string,actor:string,fn:(t:SqlTransaction)=>Promise<unknown>)=>{
  if(cid!==companyId)throw new Error('FIXTURE_WRONG_COMPANY');
  const lease=await beginRequestAuthority(tx,actor),result=await fn(tx);
  await finishRequestAuthority(lease,result);committedRequestAuthority(lease);return result;
 }} as DatabaseLike;
 return {proof,db,tx,session,user,device};
}
afterEach(()=>vi.useRealTimers());
describe('request authority context and reduction capabilities (CPU doubles)',()=>{
 it('a protected HTTP scope cannot reach a transaction before authentication',async()=>{
  const f=fixture();let called=false;
  await expect(runRequestAuthority(true,()=>f.db.transaction('a','user',async()=>{called=true;}))).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(called).toBe(false);
 });
 it('separate public authority and non-HTTP work do not silently become a user session',async()=>{
  const f=fixture();expect(await f.db.transaction('a','worker-service',async()=>7)).toBe(7);
  expect(await runRequestAuthority(false,()=>f.db.transaction('a','PUBLIC_SETUP',async()=>8))).toBe(8);
 });
 it('authentication lookup permission ends on both successful return and error',async()=>{
  const f=fixture();await runRequestAuthority(true,async()=>{
   expect(await duringAuthentication(()=>f.db.transaction('a','AUTH',async()=>1))).toBe(1);
   await expect(duringAuthentication(async()=>{throw new Error('synthetic');})).rejects.toThrow('synthetic');
   await expect(f.db.transaction('a','user',async()=>2)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  });
 });
 it('a registered original session guards ordinary work and final responses',async()=>{
  const f=fixture();await runRequestAuthority(true,async()=>{
   await duringAuthentication(async()=>registerRequestAuthority(f.proof,f.db));
   expect(await f.db.transaction('a','user',async()=>({safe:true}))).toEqual({safe:true});
   await verifyResponseAuthority({safe:true});
  });
 });
 it('concurrent requests retain separate company and user proofs across awaits',async()=>{
  const a=fixture('a','alice'),b=fixture('b','bob');let release!:()=>void;const barrier=new Promise<void>(r=>release=r);
  const first=runRequestAuthority(true,async()=>{registerRequestAuthority(a.proof,a.db);await barrier;return a.db.transaction('a','alice',async()=> 'alice');});
  const second=runRequestAuthority(true,async()=>{registerRequestAuthority(b.proof,b.db);release();await Promise.resolve();return b.db.transaction('b','bob',async()=> 'bob');});
  expect(await Promise.all([first,second])).toEqual(['alice','bob']);
 });
 it('a request cannot replace its original proof with another session or principal',async()=>{
  const f=fixture();await runRequestAuthority(true,async()=>{registerRequestAuthority(f.proof,f.db);
   expect(()=>registerRequestAuthority({...f.proof,tokenHash:'b'.repeat(64)},f.db)).toThrowError(expect.objectContaining({code:'NEEDS_REAUTH'}));
   expect(()=>registerRequestAuthority({...f.proof,userId:'other'},f.db)).toThrowError(expect.objectContaining({code:'NEEDS_REAUTH'}));
   await verifyResponseAuthority();
  });
 });
 it('a renamed guest cookie cannot authorize an ordinary account request',async()=>{
  const f=fixture();f.user.data.guest=true;
  await expect(runRequestAuthority(true,async()=>{registerRequestAuthority(f.proof,f.db);await verifyResponseAuthority();})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('original expiry is checked after async work and cannot be extended mid-request',async()=>{
  vi.useFakeTimers({toFake:['Date']});const f=fixture();
  await expect(runRequestAuthority(true,async()=>{registerRequestAuthority(f.proof,f.db);
   await f.db.transaction('a','user',async()=>{vi.setSystemTime(f.proof.expiresAt+1);f.session.expires_at=new Date(f.proof.expiresAt+60000);return {safe:true};});
  })).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('revocation without an explicit server capability cannot return private data',async()=>{
  const f=fixture();await expect(runRequestAuthority(true,async()=>{registerRequestAuthority(f.proof,f.db);return f.db.transaction('a','user',async()=>{f.session.revoked_at=new Date();return {private:'blocked'};});})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('successful own-session revocation returns only its exact acknowledgement',async()=>{
  const f=fixture();await runRequestAuthority(true,async()=>{registerRequestAuthority(f.proof,f.db);
   const ack=await f.db.transaction('a','user',async tx=>{f.session.revoked_at=new Date();await recordOwnSessionRevocation(tx,'PASSWORD_ROTATED');return {ok:true,reauthenticationRequired:true};});
   await verifyResponseAuthority(ack);
   await expect(verifyResponseAuthority({...ack,private:'blocked'})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
   await expect(f.db.transaction('a','user',async()=>({ok:true}))).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  });
 });
 it('a revoked credential never grants an acknowledgement before commit',async()=>{
  const f=fixture();await runRequestAuthority(true,async()=>{registerRequestAuthority(f.proof,f.db);
   const lease=await beginRequestAuthority(f.tx,'user');f.session.revoked_at=new Date();await recordOwnSessionRevocation(f.tx,'LOGOUT');await finishRequestAuthority(lease,{ok:true});
   await expect(verifyResponseAuthority({ok:true})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  });
 });
 it('an own-revoke capability refuses a richer transaction result',async()=>{
  const f=fixture();await expect(runRequestAuthority(true,async()=>{registerRequestAuthority(f.proof,f.db);return f.db.transaction('a','user',async tx=>{f.session.revoked_at=new Date();await recordOwnSessionRevocation(tx,'LOGOUT');return {ok:true,secret:'blocked'};});})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('a disconnected request cannot finish work or obtain a new proof',async()=>{
  const f=fixture();await expect(runRequestAuthority(true,async close=>{registerRequestAuthority(f.proof,f.db);return f.db.transaction('a','user',async()=>{close();return {ok:true};});})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
 it('device revocation and token replacement are checked independently of cookie sessions',async()=>{
  for(const change of [(f:ReturnType<typeof fixture>)=>{f.device.data.active=false;},(f:ReturnType<typeof fixture>)=>{f.device.data.tokenHash='b'.repeat(64);}]){
   const f=fixture();await expect(runRequestAuthority(true,async()=>{registerRequestAuthority({...f.proof,kind:'DEVICE',guest:undefined,deviceId:'device'},f.db);return f.db.transaction('a','user',async()=>{change(f);return {private:'blocked'};});})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  }
 });
 it('own-device retirement returns exactly its saved Entity and cannot authorize another transaction',async()=>{
  const f=fixture();await runRequestAuthority(true,async()=>{registerRequestAuthority({...f.proof,kind:'DEVICE',guest:undefined,deviceId:'device'},f.db);
   const result=await f.db.transaction('a','user',async tx=>{f.device.data.active=false;f.device.data.revokedAt=new Date().toISOString();await recordOwnDeviceRetirement(tx,'REVOKE',f.device);return f.device;});
   await verifyResponseAuthority(result);
   await expect(verifyResponseAuthority({...result,private:'blocked'})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
   await expect(f.db.transaction('a','user',async()=>({ok:true}))).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  });
 });
 it('an own-device capability cannot be expanded into a richer command result before commit',async()=>{
  const f=fixture();await expect(runRequestAuthority(true,async()=>{registerRequestAuthority({...f.proof,kind:'DEVICE',guest:undefined,deviceId:'device'},f.db);
   return f.db.transaction('a','user',async tx=>{f.device.data.active=false;f.device.data.revokedAt=new Date().toISOString();await recordOwnDeviceRetirement(tx,'REVOKE',f.device);return {...f.device,private:'blocked'};});
  })).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });
});
