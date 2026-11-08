import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {assert,DomainError,type Data,type Entity} from '../../packages/domain/core.ts';
import type {DatabaseLike,SqlTransaction} from './auth.ts';

/** Server-owned request credentials. They never enter Actor, JSON or a command
 * receipt. A later same-user session can therefore recover an existing write. */
export type RequestAuthorityProof=Readonly<{
 kind:'SESSION'|'DEVICE'|'FEDERATED';companyId:string;userId:string;tokenHash:string;
 expiresAt:number;guest?:boolean;deviceId?:string;siteDescriptorHash?:string;reductionOnly?:boolean;
}>;
export interface RequestAuthorityValidator {
 verifyIn(tx:SqlTransaction,proof:RequestAuthorityProof,allowRevoked:boolean):Promise<void>;
 completeSelfDispatchIn?(tx:SqlTransaction,proof:RequestAuthorityProof,change:SelfDispatchChange,result:unknown):Promise<SelfDispatchCompletion|undefined>;
 verifySelfDispatchIn?(tx:SqlTransaction,proof:RequestAuthorityProof,completion:SelfDispatchCompletion):Promise<void>;
}
export type SelfDispatchChange=Readonly<{before:Entity;siteId:string;orderId:string;reservationId:string;idempotencyKey:string;inputHash:string}>;
export type SelfDispatchCompletion=Readonly<{
 kind:'SELF_DISPATCH_SCOPE_EXPANSION';siteId:string;idempotencyKey:string;inputHash:string;
 beforeVersion:number;afterUserHash:string;resultHash:string;orderId:string;reservationId:string;assignmentId:string;revokedAt:number;
}>;
type Reduction='LOGOUT'|'PASSWORD_ROTATED'|'MFA_CONFIGURED';
type Acknowledgement=Reduction|Readonly<{kind:'DEVICE_RETIRED';resultHash:string}>;
interface State {required:boolean;closed:boolean;proof?:RequestAuthorityProof;db?:DatabaseLike;validator?:RequestAuthorityValidator;ack?:Acknowledgement;selfDispatch?:SelfDispatchCompletion;}
interface Frame {state:State;authenticating:boolean;responseOnly?:SelfDispatchCompletion;}
export interface AuthorityLease {state:State;proof:RequestAuthorityProof;tx:SqlTransaction;reduction?:Acknowledgement;selfDispatch?:SelfDispatchCompletion;responseOnly?:SelfDispatchCompletion;}
const context=new AsyncLocalStorage<Frame>();
const reductions=new WeakMap<SqlTransaction,Acknowledgement>();
const selfDispatchCompletions=new WeakMap<SqlTransaction,SelfDispatchCompletion>();
function canonical(value:any):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
function resultHash(value:unknown):string {const bytes=canonical(value);assert(typeof bytes==='string'&&Buffer.byteLength(bytes)<=32768,'NEEDS_REAUTH');return createHash('sha256').update(bytes).digest('hex');}
/** Used only for complete server-owned persisted snapshots, never for accepting
 * browser-provided authority. Preserve the business result's existing size. */
export function authoritySnapshotHash(value:unknown):string {const bytes=canonical(value);assert(typeof bytes==='string','NEEDS_REAUTH');return createHash('sha256').update(bytes).digest('hex');}
const time=(value:unknown)=>value instanceof Date?value.getTime():Date.parse(String(value));
async function identity(tx:SqlTransaction,kind:string,id:string):Promise<Entity>{
 try{return await tx.get(kind,id);}catch(error){
  if(error instanceof DomainError&&['NOT_FOUND_SAFE','NOT_FOUND'].includes(error.code))throw new DomainError('NEEDS_REAUTH');
  throw error;
 }
}
const ackMatches=(value:unknown,kind:Acknowledgement)=>{
 if(typeof kind!=='string')return resultHash(value)===kind.resultHash;
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Data,keys=Object.keys(v).sort();
 return v.ok===true&&(kind==='LOGOUT'?keys.join(',')==='ok':keys.join(',')==='ok,reauthenticationRequired'&&v.reauthenticationRequired===true);
};

export function runRequestAuthority<T>(required:boolean,operation:(close:()=>void)=>T):T {
 const state:State={required,closed:false};
 return context.run({state,authenticating:false},()=>operation(()=>{state.closed=true;}));
}
/** Only authentication lookup may run before a protected request has a proof. */
export function duringAuthentication<T>(operation:()=>T):T {
 const frame=context.getStore();
 return frame?context.run({state:frame.state,authenticating:true},operation):operation();
}
export function registerRequestAuthority(proof:RequestAuthorityProof,db:DatabaseLike,validator?:RequestAuthorityValidator):void {
 const frame=context.getStore();if(!frame)return;
 assert(!frame.state.closed,'NEEDS_REAUTH');
 assert(/^[a-f0-9]{64}$/.test(proof.tokenHash)&&proof.companyId.length>0&&proof.userId.length>0&&Number.isFinite(proof.expiresAt)&&proof.expiresAt>Date.now(),'NEEDS_REAUTH');
 assert(['SESSION','DEVICE','FEDERATED'].includes(proof.kind),'NEEDS_REAUTH');
 assert(proof.kind==='FEDERATED'?!!validator&&/^[a-f0-9]{64}$/.test(proof.siteDescriptorHash??'')&&!proof.guest&&!proof.deviceId:
  !validator&&proof.siteDescriptorHash===undefined&&proof.reductionOnly===undefined,'NEEDS_REAUTH');
 const old=frame.state.proof;
 assert(!old||(old.kind===proof.kind&&old.companyId===proof.companyId&&old.userId===proof.userId&&old.tokenHash===proof.tokenHash&&old.deviceId===proof.deviceId&&old.guest===proof.guest&&old.siteDescriptorHash===proof.siteDescriptorHash&&old.reductionOnly===proof.reductionOnly&&frame.state.validator===validator),'NEEDS_REAUTH');
 frame.state.proof=Object.freeze({...proof,expiresAt:Math.min(old?.expiresAt??Infinity,proof.expiresAt)});frame.state.db=db;frame.state.validator=validator;
}

async function current(tx:SqlTransaction,proof:RequestAuthorityProof,allowRevoked=false,validator?:RequestAuthorityValidator):Promise<void> {
 assert('companyId' in tx&&tx.companyId===proof.companyId&&proof.expiresAt>Date.now(),'NEEDS_REAUTH');
 if(proof.kind==='FEDERATED'){
  assert(validator,'NEEDS_REAUTH');await validator.verifyIn(tx,proof,allowRevoked);return;
 }
 const user=await identity(tx,'user',proof.userId);
 assert(user.companyId===proof.companyId&&user.data.active!==false,'NEEDS_REAUTH');
 if(proof.kind==='SESSION'){
  assert(tx.query,'MISSING_CONFIGURATION');
  const row=(await tx.query('SELECT user_id,company_id,expires_at,revoked_at FROM auth_sessions WHERE company_id=$1 AND token_hash=$2',[proof.companyId,proof.tokenHash])).rows[0];
  assert(row&&row.company_id===proof.companyId&&row.user_id===proof.userId&&time(row.expires_at)>Date.now()&&(allowRevoked?row.revoked_at!=null:row.revoked_at==null),'NEEDS_REAUTH');
  assert((user.data.guest===true)===(proof.guest===true),'NEEDS_REAUTH');
 }else{
  assert(proof.deviceId,'NEEDS_REAUTH');
  const device=await identity(tx,'device',proof.deviceId),d=device.data;
  const state=allowRevoked?d.active===false&&Boolean(d.revokedAt||d.revoked_at):d.active===true&&!d.revokedAt&&!d.revoked_at;
  assert(device.companyId===proof.companyId&&d.employeeId===proof.userId&&state&&d.tokenHash===proof.tokenHash&&time(d.tokenExpiresAt)>Date.now(),'NEEDS_REAUTH');
 }
}

async function verifySelfDispatch(tx:SqlTransaction,state:State,completion:SelfDispatchCompletion):Promise<void>{
 assert(state.proof?.kind==='FEDERATED'&&!state.proof.reductionOnly&&state.validator?.verifySelfDispatchIn,'NEEDS_REAUTH');
 await state.validator.verifySelfDispatchIn(tx,state.proof,completion);
}
/** Runs under the existing company lock and SERIALIZABLE snapshot. Local
 * credentials need no network call; federated checks use bounded introspection. */
export async function beginRequestAuthority(tx:SqlTransaction,actorId:string):Promise<AuthorityLease|undefined> {
 const frame=context.getStore();if(!frame||frame.authenticating)return undefined;
 const state=frame.state;assert(!state.closed,'NEEDS_REAUTH');
 if(!state.proof){assert(!state.required,'NEEDS_REAUTH');return undefined;}
 assert(state.proof.userId===actorId,'NEEDS_REAUTH');
 if(frame.responseOnly){
  assert(state.selfDispatch===frame.responseOnly&&!state.ack,'NEEDS_REAUTH');
  await verifySelfDispatch(tx,state,frame.responseOnly);assert(!state.closed,'NEEDS_REAUTH');return {state,proof:state.proof,tx,responseOnly:frame.responseOnly};
 }
 await current(tx,state.proof,false,state.validator);assert(!state.closed,'NEEDS_REAUTH');return {state,proof:state.proof,tx};
}
export async function finishRequestAuthority(lease:AuthorityLease|undefined,result:unknown):Promise<void> {
 if(!lease)return;assert(!lease.state.closed,'NEEDS_REAUTH');
 const reduction=reductions.get(lease.tx);
 const completion=lease.responseOnly??selfDispatchCompletions.get(lease.tx);
 if(completion){
  assert(!reduction&&!lease.proof.reductionOnly&&authoritySnapshotHash(result)===completion.resultHash,'NEEDS_REAUTH');
  await verifySelfDispatch(lease.tx,lease.state,completion);
  assert(!lease.state.closed,'NEEDS_REAUTH');
  if(!lease.responseOnly)lease.selfDispatch=completion;return;
 }
 if(lease.proof.reductionOnly)assert(reduction==='LOGOUT','NEEDS_REAUTH');
 if(reduction){assert(ackMatches(result,reduction),'NEEDS_REAUTH');await current(lease.tx,lease.proof,true,lease.state.validator);assert(!lease.state.closed,'NEEDS_REAUTH');lease.reduction=reduction;}
 else await current(lease.tx,lease.proof,false,lease.state.validator);
 assert(!lease.state.closed,'NEEDS_REAUTH');
}
/** Called only after successful COMMIT, never on a retry or rollback. */
export function committedRequestAuthority(lease:AuthorityLease|undefined):void {
 if(lease?.reduction)lease.state.ack=lease.reduction;
 if(lease?.selfDispatch)lease.state.selfDispatch=lease.selfDispatch;
}
/** Engine captures the actual pre-handler user and invokes this closure only
 * after dispatch.assign has persisted its exact receipt. The adapter must prove
 * the one allowed scope change; a command name alone grants no exception. */
export async function prepareSelfDispatchScopeExpansion(tx:SqlTransaction,input:Omit<SelfDispatchChange,'before'>):Promise<((result:unknown)=>Promise<void>)|undefined>{
 const frame=context.getStore(),proof=frame?.state.proof;
 if(!frame||frame.authenticating||proof?.kind!=='FEDERATED')return undefined;
 const state=frame.state;assert(!state.closed&&!proof.reductionOnly&&!frame.responseOnly&&state.validator?.completeSelfDispatchIn,'NEEDS_REAUTH');
 assert([input.siteId,input.orderId,input.reservationId].every(id=>typeof id==='string'&&id.length>0&&id.length<=100)&&
  typeof input.idempotencyKey==='string'&&input.idempotencyKey.length>=8&&input.idempotencyKey.length<=200&&/^[a-f0-9]{64}$/.test(input.inputHash),'NEEDS_REAUTH');
 const change=Object.freeze({...input,before:structuredClone(await identity(tx,'user',proof.userId))});
 assert(!state.closed,'NEEDS_REAUTH');
 let used=false;
 return async result=>{
  assert(!used&&!state.closed&&context.getStore()?.state===state&&!state.ack&&!state.selfDispatch&&!reductions.has(tx),'NEEDS_REAUTH');used=true;
  const completion=await state.validator!.completeSelfDispatchIn!(tx,proof,change,result);
  assert(!state.closed,'NEEDS_REAUTH');
  if(completion)selfDispatchCompletions.set(tx,Object.freeze({...completion}));
 };
}
/** Exact own-session revocation, invoked by successful server handlers inside
 * their transaction. No command name or browser flag grants a final-check bypass. */
export async function recordOwnSessionRevocation(tx:SqlTransaction,kind:Reduction):Promise<void> {
 const frame=context.getStore();if(!frame||frame.authenticating||!frame.state.proof||!['SESSION','FEDERATED'].includes(frame.state.proof.kind))return;
 assert(['LOGOUT','PASSWORD_ROTATED','MFA_CONFIGURED'].includes(kind),'NEEDS_REAUTH');
 if(frame.state.proof.reductionOnly)assert(kind==='LOGOUT','NEEDS_REAUTH');
 assert(!frame.state.closed,'NEEDS_REAUTH');
 await current(tx,frame.state.proof,true,frame.state.validator);assert(!frame.state.closed,'NEEDS_REAUTH');reductions.set(tx,kind);
}
/** Preserve the existing device.bind/revoke Entity contract when the caller
 * deliberately retires its own bearer. Only that exact persisted result may
 * cross the response boundary; this does not authorize another transaction. */
export async function recordOwnDeviceRetirement(tx:SqlTransaction,operation:'BIND'|'REVOKE',result:Entity):Promise<void> {
 const frame=context.getStore(),proof=frame?.state.proof;
 if(!frame||frame.authenticating||proof?.kind!=='DEVICE')return;
 assert(operation==='BIND'||operation==='REVOKE','NEEDS_REAUTH');
 assert(!frame.state.closed&&proof.deviceId,'NEEDS_REAUTH');
 const old=await identity(tx,'device',proof.deviceId);
 if(old.data.active===true&&!old.data.revokedAt&&!old.data.revoked_at)return;
 await current(tx,proof,true);
 assert(result.kind==='device'&&result.companyId===proof.companyId&&result.data.employeeId===proof.userId,'NEEDS_REAUTH');
 if(operation==='BIND')assert(result.id!==proof.deviceId&&result.data.active===true&&old.data.revocationReason==='REPLACED','NEEDS_REAUTH');
 else assert(result.id===proof.deviceId&&result.data.active===false,'NEEDS_REAUTH');
 const saved=await identity(tx,'device',result.id),hash=resultHash(saved);
 assert(resultHash(result)===hash,'NEEDS_REAUTH');
 reductions.set(tx,Object.freeze({kind:'DEVICE_RETIRED',resultHash:hash}));
}
export async function verifyResponseAuthority(value?:unknown):Promise<void> {
 const frame=context.getStore();if(!frame)return;
 const state=frame.state;assert(!state.closed,'NEEDS_REAUTH');
 if(state.selfDispatch){
  assert(!state.ack&&state.db&&state.proof&&authoritySnapshotHash(value)===state.selfDispatch.resultHash,'NEEDS_REAUTH');
  // This private frame exists only around a read-only verifier transaction whose
  // callback returns the already committed exact value. It never wraps business
  // work and is unavailable to the next ordinary transaction in this request.
  await context.run({state,authenticating:false,responseOnly:state.selfDispatch},()=>
   state.db!.transaction(state.proof!.companyId,state.proof!.userId,async()=>value,5000,true));assert(!state.closed,'NEEDS_REAUTH');return;
 }
 if(state.ack){assert(ackMatches(value,state.ack),'NEEDS_REAUTH');return;}
 if(!state.proof){assert(!state.required,'NEEDS_REAUTH');return;}
 assert(state.db,'MISSING_CONFIGURATION');
 await state.db.transaction(state.proof.companyId,state.proof.userId,async()=>undefined,5000,true);
 assert(!state.closed,'NEEDS_REAUTH');
}
