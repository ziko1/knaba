import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {assert,DomainError,type Data,type Entity} from '../../packages/domain/core.ts';
import type {DatabaseLike,SqlTransaction} from './auth.ts';

/** Server-owned request credentials. They never enter Actor, JSON or a command
 * receipt. A later same-user session can therefore recover an existing write. */
export type RequestAuthorityProof=Readonly<{
 kind:'SESSION'|'DEVICE';companyId:string;userId:string;tokenHash:string;
 expiresAt:number;guest?:boolean;deviceId?:string;
}>;
type Reduction='LOGOUT'|'PASSWORD_ROTATED'|'MFA_CONFIGURED';
type Acknowledgement=Reduction|Readonly<{kind:'DEVICE_RETIRED';resultHash:string}>;
interface State {required:boolean;closed:boolean;proof?:RequestAuthorityProof;db?:DatabaseLike;ack?:Acknowledgement;}
interface Frame {state:State;authenticating:boolean;}
export interface AuthorityLease {state:State;proof:RequestAuthorityProof;tx:SqlTransaction;reduction?:Acknowledgement;}
const context=new AsyncLocalStorage<Frame>();
const reductions=new WeakMap<SqlTransaction,Acknowledgement>();
function canonical(value:any):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
function resultHash(value:unknown):string {const bytes=canonical(value);assert(typeof bytes==='string'&&Buffer.byteLength(bytes)<=32768,'NEEDS_REAUTH');return createHash('sha256').update(bytes).digest('hex');}
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
export function registerRequestAuthority(proof:RequestAuthorityProof,db:DatabaseLike):void {
 const frame=context.getStore();if(!frame)return;
 assert(!frame.state.closed,'NEEDS_REAUTH');
 assert(/^[a-f0-9]{64}$/.test(proof.tokenHash)&&proof.companyId.length>0&&proof.userId.length>0&&Number.isFinite(proof.expiresAt)&&proof.expiresAt>Date.now(),'NEEDS_REAUTH');
 const old=frame.state.proof;
 assert(!old||(old.kind===proof.kind&&old.companyId===proof.companyId&&old.userId===proof.userId&&old.tokenHash===proof.tokenHash&&old.deviceId===proof.deviceId&&old.guest===proof.guest),'NEEDS_REAUTH');
 frame.state.proof=Object.freeze({...proof,expiresAt:Math.min(old?.expiresAt??Infinity,proof.expiresAt)});frame.state.db=db;
}

async function current(tx:SqlTransaction,proof:RequestAuthorityProof,allowRevoked=false):Promise<void> {
 assert('companyId' in tx&&tx.companyId===proof.companyId&&proof.expiresAt>Date.now(),'NEEDS_REAUTH');
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

/** Runs under the existing company lock and SERIALIZABLE snapshot. Every local
 * logout now uses that same lock; no nested transaction or network call here. */
export async function beginRequestAuthority(tx:SqlTransaction,actorId:string):Promise<AuthorityLease|undefined> {
 const frame=context.getStore();if(!frame||frame.authenticating)return undefined;
 const state=frame.state;assert(!state.closed,'NEEDS_REAUTH');
 if(!state.proof){assert(!state.required,'NEEDS_REAUTH');return undefined;}
 assert(state.proof.userId===actorId,'NEEDS_REAUTH');
 await current(tx,state.proof);return {state,proof:state.proof,tx};
}
export async function finishRequestAuthority(lease:AuthorityLease|undefined,result:unknown):Promise<void> {
 if(!lease)return;assert(!lease.state.closed,'NEEDS_REAUTH');
 const reduction=reductions.get(lease.tx);
 if(reduction){assert(ackMatches(result,reduction),'NEEDS_REAUTH');await current(lease.tx,lease.proof,true);lease.reduction=reduction;}
 else await current(lease.tx,lease.proof);
}
/** Called only after successful COMMIT, never on a retry or rollback. */
export function committedRequestAuthority(lease:AuthorityLease|undefined):void {
 if(lease?.reduction)lease.state.ack=lease.reduction;
}
/** Exact own-session revocation, invoked by successful server handlers inside
 * their transaction. No command name or browser flag grants a final-check bypass. */
export async function recordOwnSessionRevocation(tx:SqlTransaction,kind:Reduction):Promise<void> {
 const frame=context.getStore();if(!frame||frame.authenticating||frame.state.proof?.kind!=='SESSION')return;
 assert(['LOGOUT','PASSWORD_ROTATED','MFA_CONFIGURED'].includes(kind),'NEEDS_REAUTH');
 assert(!frame.state.closed,'NEEDS_REAUTH');
 await current(tx,frame.state.proof,true);reductions.set(tx,kind);
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
 if(state.ack){assert(ackMatches(value,state.ack),'NEEDS_REAUTH');return;}
 if(!state.proof){assert(!state.required,'NEEDS_REAUTH');return;}
 assert(state.db,'MISSING_CONFIGURATION');
 await state.db.transaction(state.proof.companyId,state.proof.userId,async()=>undefined,5000,true);
}
