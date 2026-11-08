import {assert,DomainError,type Actor,type Data,type Entity} from '../../packages/domain/core.ts';
import type {DatabaseLike,EngineLike,SqlTransaction} from './auth.ts';
import {authorityFingerprint} from './authority-fingerprint.ts';

type Proof = Readonly<{companyId:string;userId:string;tokenHash:string} & ({kind:'session'}|{kind:'device';deviceId:string})>;
const binding = Symbol('request authority');
type BoundActor = Actor & {[binding]?:object};
// Only the empty handle is copied by actor spreads. Neither JSON nor inspection of
// the actor contains the credential/hash. Entries expire with the request actors.
const proofs = new WeakMap<object,Proof>();
const requests = new WeakMap<object,{actor:Actor;db:DatabaseLike}>();
const acknowledgements = new WeakMap<object,object>();
const responseFences = new WeakMap<object,{fingerprint:string;engine:EngineLike;inconsistent:boolean}>();

function proofFor(actor:Actor):Proof|undefined {
 const handle=(actor as BoundActor)[binding];
 if(handle===undefined)return; // Trusted server-created worker/service actor.
 const proof=proofs.get(handle);
 assert(proof&&proof.companyId===actor.companyId&&proof.userId===actor.userId,'NEEDS_REAUTH');
 return proof;
}

export function assertRequestBinding(actor:Actor):void {proofFor(actor);}

export function bindRequestAuthority<T extends Actor>(actor:T,proof:Proof):T {
 assert(actor.companyId===proof.companyId&&actor.userId===proof.userId,'NEEDS_REAUTH');
 const handle=Object.freeze({});proofs.set(handle,Object.freeze({...proof}));
 Object.defineProperty(actor,binding,{value:handle,enumerable:true});
 return actor;
}

export function carryRequestAuthority<T extends Actor>(source:Actor,target:T):T {
 const proof=proofFor(source);if(!proof)return target;
 assert(target.companyId===proof.companyId&&target.userId===proof.userId,'NEEDS_REAUTH');
 const handle=(source as BoundActor)[binding];
 if((target as BoundActor)[binding]===handle)return target;
 assert(!(target as BoundActor)[binding],'NEEDS_REAUTH');
 Object.defineProperty(target,binding,{value:handle,enumerable:true});return target;
}

export function currentDevice(device:Entity,proof:{companyId:string;userId:string;deviceId:string;tokenHash:string},now=Date.now()):boolean {
 const d=device.data;
 return device.kind==='device'&&device.id===proof.deviceId&&device.companyId===proof.companyId&&d.employeeId===proof.userId&&
  d.tokenHash===proof.tokenHash&&d.active===true&&(d.revokedAt===undefined||d.revokedAt===null)&&(d.revoked_at===undefined||d.revoked_at===null)&&
  typeof d.tokenExpiresAt==='string'&&Number.isFinite(Date.parse(d.tokenExpiresAt))&&Date.parse(d.tokenExpiresAt)>now;
}

/** Must run inside the same company transaction as the protected operation. */
export async function assertRequestAuthority(tx:SqlTransaction,actor:Actor):Promise<void> {
 const proof=proofFor(actor);if(!proof)return;
 if('companyId'in tx)assert(tx.companyId===proof.companyId,'NEEDS_REAUTH');
 if(proof.kind==='session'){
  assert(tx.query,'MISSING_CONFIGURATION');
  // now() is fixed at transaction start. Long operations must use the actual clock.
  const row=(await tx.query('SELECT user_id,company_id FROM auth_sessions WHERE token_hash=$1 AND company_id=$2 AND user_id=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp()',[proof.tokenHash,proof.companyId,proof.userId])).rows[0];
  assert(row?.user_id===proof.userId&&row?.company_id===proof.companyId,'NEEDS_REAUTH');
 }else{
  let device:Entity;try{device=await tx.get('device',proof.deviceId);}catch(error){if(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE')throw new DomainError('NEEDS_REAUTH');throw error;}
  assert(currentDevice(device,proof),'NEEDS_REAUTH');
 }
 let user:Entity;try{user=await tx.get('user',proof.userId);}catch(error){if(error instanceof DomainError&&error.code==='NOT_FOUND_SAFE')throw new DomainError('NEEDS_REAUTH');throw error;}
 assert(user.companyId===proof.companyId&&user.id===proof.userId&&user.data.active!==false,'NEEDS_REAUTH');
}

/** Capture the effective scopes in the transaction that produced private data.
 * One hash plus one flag bounds request state even for batches or many reads.
 * A newer successful read must never overwrite the authority of an earlier read.
 */
export async function responseAuthorityFingerprint(tx:SqlTransaction,actor:Actor,engine:EngineLike):Promise<string|undefined> {
 if(!proofFor(actor))return;
 return authorityFingerprint(tx,engine,actor,new Date().toISOString());
}

/** Publish only committed snapshots: a rolled-back attempt is not a response. */
export function recordResponseAuthority(actor:Actor,engine:EngineLike,fingerprint:string|undefined):void {
 if(fingerprint===undefined)return;
 assertRequestBinding(actor);
 const handle=(actor as BoundActor)[binding]!;
 const existing=responseFences.get(handle);
 if(existing){if(existing.fingerprint!==fingerprint)existing.inconsistent=true;}
 else responseFences.set(handle,{fingerprint,engine,inconsistent:false});
}

/** Internal actors remain supported; callers cannot opt a bound actor out. */
export async function authorityTransaction<T>(db:DatabaseLike,actor:Actor,fn:(tx:SqlTransaction)=>Promise<T>,timeoutMs?:number,readOnly=false,engine?:EngineLike):Promise<T> {
 assertRequestBinding(actor);
 const committed=await db.transaction(actor.companyId,actor.userId,async tx=>{
  await assertRequestAuthority(tx,actor);const before=readOnly&&engine?await responseAuthorityFingerprint(tx,actor,engine):undefined;
  const result=await fn(tx),fingerprint=engine?await responseAuthorityFingerprint(tx,actor,engine):undefined;
  if(before!==undefined)assert(before===fingerprint,'NEEDS_REAUTH');
  await assertRequestAuthority(tx,actor);return {result,fingerprint};
 },timeoutMs,readOnly);
 if(engine)recordResponseAuthority(actor,engine,committed.fingerprint);
 return committed.result;
}

export function rememberRequestAuthority<T extends Actor>(req:object,db:DatabaseLike,actor:T):T {
 const proof=proofFor(actor);if(!proof)return actor;
 const existing=requests.get(req);
 if(existing){
  const original=proofFor(existing.actor)!;
  assert(original.kind===proof.kind&&original.companyId===proof.companyId&&original.userId===proof.userId&&original.tokenHash===proof.tokenHash&&
   (original.kind!=='device'||proof.kind==='device'&&original.deviceId===proof.deviceId),'NEEDS_REAUTH');
  // Re-authentication within one HTTP request retains its original fence/ACK
  // handle while refreshing ordinary actor fields such as roles and MFA age.
  const canonical={...actor};Object.defineProperty(canonical,binding,{value:(existing.actor as BoundActor)[binding],enumerable:true,writable:false,configurable:false});
  return canonical;
 }
 requests.set(req,{actor,db});return actor;
}

/** A self-revocation may disclose only this fixed ACK, after its commit succeeds. */
export function revocationAcknowledgement(actor:Actor,reauthenticationRequired=true):{ok:true;reauthenticationRequired?:true} {
 const result=Object.freeze(reauthenticationRequired?{ok:true as const,reauthenticationRequired:true as const}:{ok:true as const});
 const handle=(actor as BoundActor)[binding];if(handle)acknowledgements.set(result,handle);
 return result;
}

export function revokesRequestAuthority(actor:Actor,name:string,input:Data):boolean {
 const proof=proofFor(actor);if(!proof)return false;
 return ['user.password.rotate','user.mfa.configure'].includes(name)||
  proof.kind==='device'&&name==='device.revoke'&&input.deviceId===proof.deviceId;
}

export async function assertResponseAuthority(req:object,result?:unknown):Promise<void> {
 const current=requests.get(req);if(!current)return;
 if(result&&typeof result==='object'&&acknowledgements.get(result)===(current.actor as BoundActor)[binding])return;
 await authorityTransaction(current.db,current.actor,async tx=>{
  const expected=responseFences.get((current.actor as BoundActor)[binding]!);
  if(expected){
   assert(!expected.inconsistent,'NEEDS_REAUTH');
   const fingerprint=await authorityFingerprint(tx,expected.engine,current.actor,new Date().toISOString());
   assert(fingerprint===expected.fingerprint,'NEEDS_REAUTH');
  }
 },10000,true);
}
