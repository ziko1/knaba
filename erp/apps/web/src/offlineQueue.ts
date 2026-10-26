import {api,catalog,entities,ApiError,type Command,type Entity,type Session} from './api';

export type QueueState='UNSYNCED'|'UNKNOWN'|'RETRYING'|'CONFLICT'|'DENIED'|'ACKNOWLEDGED'|'EXPIRED';
export type OfflineAction={name:string;input:Readonly<Record<string,unknown>>;expectedVersion:number;idempotencyKey:string};
export type QueueEntry=OfflineAction&{id:string;createdAt:number;expiresAt:number;state:QueueState;code?:string};
export type QueueIdentity=Pick<Session['actor'],'userId'|'companyId'>;
export type QueueTransport={session:()=>Promise<Session>;catalog:()=>Promise<Command[]>;entities:(kind:string)=>Promise<Entity[]>;send:(action:OfflineAction)=>Promise<unknown>};
export class QueueError extends Error{constructor(public code:string){super(code)}}
const policies:Record<string,{permission:string;kind:string;key:string;fields:string[]}>=Object.freeze({
 'task.start':{permission:'task.work',kind:'task',key:'taskId',fields:['taskId']},
 'task.checklist':{permission:'task.work',kind:'task',key:'taskId',fields:['taskId','itemId','checked']},
 'task.submit':{permission:'task.work',kind:'task',key:'taskId',fields:['taskId']},
 'request.submit':{permission:'inventory.request',kind:'material_request',key:'requestId',fields:['requestId']}
});
export const QUEUE_LIMIT=20,QUEUE_LIFETIME_MS=4*60*60*1000;
function validId(value:unknown){return typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u001f\s@]/.test(value)}
function owned(entity:Entity,identity:QueueIdentity){return entity.kind==='task'?Array.isArray(entity.data.assigneeIds)&&entity.data.assigneeIds.includes(identity.userId):entity.kind==='material_request'&&entity.data.employeeId===identity.userId}
export function safeOfflineAction(definition:Command,input:Record<string,unknown>,identity:QueueIdentity,records:Record<string,Entity[]>,expectedVersion?:number):Omit<OfflineAction,'idempotencyKey'>|undefined{
 const policy=policies[definition.name];if(!policy||definition.highRisk||definition.permission!==policy.permission||!input||typeof input!=='object'||Array.isArray(input))return;
 if(Object.keys(input).some(key=>!policy.fields.includes(key))||!validId(input[policy.key]))return;
 if(definition.name==='task.checklist'&&(!validId(input.itemId)||typeof input.checked!=='boolean'))return;
 const resource=(records[policy.kind]||[]).find(row=>row.id===input[policy.key]);
 if(!resource||!owned(resource,identity)||!Number.isSafeInteger(resource.version)||resource.version<1)return;
 if(definition.name==='task.checklist'&&!resource.data.checklist?.some((item:any)=>item.id===input.itemId))return;
 const version=expectedVersion??resource.version;if(!Number.isSafeInteger(version)||version<1)return;
 return {name:definition.name,input:Object.freeze({...input}),expectedVersion:version};
}
function permits(permissions:string[],permission:string){return permissions.includes('*')||permissions.includes(permission)||permissions.some(value=>value.endsWith('.*')&&permission.startsWith(value.slice(0,-1)))}
async function boundedRequest<T>(run:(signal:AbortSignal)=>Promise<T>):Promise<T>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15_000);try{return await run(controller.signal)}finally{clearTimeout(timer)}}
const defaultTransport:QueueTransport={session:()=>boundedRequest(signal=>api('/api/v1/me',{signal})),catalog:()=>boundedRequest(signal=>catalog({signal})),entities:kind=>boundedRequest(signal=>entities(kind,{signal})),send:action=>boundedRequest(signal=>api(`/api/v1/commands/${encodeURIComponent(action.name)}`,{signal,method:'POST',body:JSON.stringify({input:action.input,expected_version:action.expectedVersion,idempotency_key:action.idempotencyKey})}))};

/** Only opaque work references and booleans live in this tab. No storage, cookies,
 * service-worker messages, cached records, tokens or response payloads are used. */
export class SafeOfflineQueue{
 private entries:QueueEntry[]=[];private listeners=new Set<()=>void>();private generation=0;
 constructor(readonly identity:QueueIdentity,private transport:QueueTransport=defaultTransport,private now:()=>number=Date.now){}
 getSnapshot=()=>this.entries;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}};
 private publish(){for(const listener of this.listeners)listener()}
 private patch(id:string,patch:Partial<QueueEntry>){this.entries=this.entries.map(entry=>entry.id===id?Object.freeze({...entry,...patch}):entry);this.publish()}
 clear(){this.generation++;this.entries=[];this.publish()}
 remove(id:string){if(this.entries.some(entry=>entry.id===id&&entry.state==='RETRYING'))return;this.entries=this.entries.filter(entry=>entry.id!==id);this.publish()}
 expire(){const now=this.now();let changed=false;this.entries=this.entries.map(entry=>{if(entry.expiresAt<=now&&!['ACKNOWLEDGED','EXPIRED','RETRYING'].includes(entry.state)){changed=true;return Object.freeze({...entry,input:Object.freeze({}),state:'EXPIRED' as const,code:'QUEUE_EXPIRED'})}return entry});if(changed)this.publish()}
 enqueue(action:OfflineAction,state:'UNSYNCED'|'UNKNOWN'='UNSYNCED'){
  this.expire();const policy=policies[action.name];
  if(!policy||Object.keys(action.input).some(field=>!policy.fields.includes(field))||!validId(action.input[policy.key])||(action.name==='task.checklist'&&(!validId(action.input.itemId)||typeof action.input.checked!=='boolean'))||!Number.isSafeInteger(action.expectedVersion)||action.expectedVersion<1||!validId(action.idempotencyKey)||action.idempotencyKey.length<8)throw new QueueError('QUEUE_UNSAFE');
  const existing=this.entries.find(entry=>entry.idempotencyKey===action.idempotencyKey);if(existing){if(JSON.stringify({name:existing.name,input:existing.input,expectedVersion:existing.expectedVersion})!==JSON.stringify({name:action.name,input:action.input,expectedVersion:action.expectedVersion}))throw new QueueError('QUEUE_KEY_REUSED');return existing}
  if(this.entries.length>=QUEUE_LIMIT)throw new QueueError('QUEUE_FULL');
  const entry:QueueEntry=Object.freeze({...action,input:Object.freeze({...action.input}),id:action.idempotencyKey,createdAt:this.now(),expiresAt:this.now()+QUEUE_LIFETIME_MS,state});this.entries=[...this.entries,entry];this.publish();return entry;
 }
 async retry(id:string):Promise<boolean>{
  this.expire();const entry=this.entries.find(item=>item.id===id);if(!entry||!['UNSYNCED','UNKNOWN'].includes(entry.state))return false;
  const originalState=entry.state,generation=this.generation,policy=policies[entry.name];this.patch(id,{state:'RETRYING',code:undefined});let sent=false;
  try{
   const current=await this.transport.session();if(generation!==this.generation)return false;
   if(current.actor.userId!==this.identity.userId||current.actor.companyId!==this.identity.companyId){this.clear();throw new QueueError('QUEUE_ACCOUNT_CHANGED')}
   const commands=await this.transport.catalog();if(generation!==this.generation)return false;
   const definition=commands.find(item=>item.name===entry.name);if(!definition||definition.highRisk||definition.permission!==policy.permission||!permits(current.actor.permissions,policy.permission)){this.patch(id,{state:'DENIED',code:'ACCESS_DENIED'});return false}
   const rows=await this.transport.entities(policy.kind);if(generation!==this.generation)return false;
   const resource=rows.find(row=>row.id===entry.input[policy.key]);if(!resource||!owned(resource,current.actor)){this.patch(id,{state:'DENIED',code:'ACCESS_DENIED'});return false}
   if(entry.name==='task.checklist'&&!resource.data.checklist?.some((item:any)=>item.id===entry.input.itemId)){this.patch(id,{state:'CONFLICT',code:'CHECKLIST_CHANGED'});return false}
   // A response may have been lost after commit. Only the exact original
   // envelope may reconcile that receipt, even if its entity version advanced.
   if(originalState==='UNSYNCED'&&resource.version!==entry.expectedVersion){this.patch(id,{state:'CONFLICT',code:'VERSION_CONFLICT'});return false}
   if(generation!==this.generation)return false;
   if(this.now()>=entry.expiresAt){this.patch(id,{state:'EXPIRED',input:Object.freeze({}),code:'QUEUE_EXPIRED'});return false}
   sent=true;const result=await this.transport.send({name:entry.name,input:entry.input,expectedVersion:entry.expectedVersion,idempotencyKey:entry.idempotencyKey});if(generation!==this.generation)return false;
   const receipt=result as Partial<Entity>|null;if(!receipt||receipt.id!==entry.input[policy.key]||receipt.kind!==policy.kind||!Number.isSafeInteger(receipt.version)||(receipt.version??0)<entry.expectedVersion)throw new QueueError('INVALID_SERVER_ACK');
   this.patch(id,{state:'ACKNOWLEDGED',code:undefined,input:Object.freeze({})});return true;
  }catch(error){
   if(generation!==this.generation)return false;
   const code=error instanceof ApiError||error instanceof QueueError?error.code:'NETWORK_UNAVAILABLE';
   if(error instanceof ApiError&&[401,403].includes(error.status))this.patch(id,{state:'DENIED',code});
   else if(error instanceof ApiError&&error.status>=400&&error.status<500)this.patch(id,{state:'CONFLICT',code});
   else this.patch(id,{state:sent?'UNKNOWN':originalState,code});
   return false;
  }
 }
}
