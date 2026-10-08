import {createHash} from 'node:crypto';
import {z,ZodError} from 'zod';
import {assert,DomainError,type Actor,type Data,type Entity} from '../../packages/domain/core.ts';
import {commandHash} from './engine.ts';
import {permits} from '../../packages/domain/identity.ts';
import type {DatabaseLike,EngineLike,SqlTransaction} from './auth.ts';

export const manualDeviceCommands=['shift.start','shift.end','shift.activity','trip.start','trip.stop','trip.resume','trip.arrive','trip.end','absence.explain'] as const;
const gpsEvent=z.object({command:z.enum(['presence.ingest','trip.sample']),input:z.record(z.unknown()),eventId:z.string().uuid().optional()}).strict();
const manualEvent=z.object({command:z.enum(manualDeviceCommands),eventId:z.string().uuid(),input:z.record(z.unknown())}).strict();
export const deviceBatchSchema=z.object({events:z.array(z.union([gpsEvent,manualEvent])).min(1).max(100)}).strict();
type ManualEvent=z.infer<typeof manualEvent>;
const reviewId=(actor:Actor,eventId:string)=>createHash('sha256').update(JSON.stringify(['KNABA_MANUAL_DEVICE_EVENT_V1',actor.userId,eventId])).digest('hex');

async function manualAuthority(tx:SqlTransaction,engine:EngineLike,actor:Actor,device:Entity,event:ManualEvent,input:Data){
 assert(engine.actorIn&&engine.scope,'MISSING_CONFIGURATION');
 const current=await engine.actorIn(tx,actor.userId),definition=engine.registry[event.command],scoped=engine.scope(current,definition.permission),freshDevice=await tx.get('device',device.id);
 assert(current.companyId===actor.companyId&&!current.roles.some(role=>['CLIENT','CUSTOMER','GUEST','EXTERNAL_BAULEITER','SERVICE_ACCOUNT'].includes(role))&&permits(scoped.permissions,definition.permission),'ACCESS_DENIED');
 assert(freshDevice.companyId===current.companyId&&freshDevice.data.active===true&&!freshDevice.data.revokedAt&&freshDevice.data.employeeId===current.userId&&freshDevice.data.tokenHash===device.data.tokenHash&&Number.isFinite(Date.parse(freshDevice.data.tokenExpiresAt))&&Date.parse(freshDevice.data.tokenExpiresAt)>Date.now(),'ACCESS_DENIED');
 if(event.command==='shift.start'){assert(input.deviceId===device.id&&(input.employeeId===undefined||input.employeeId===current.userId),'ACCESS_DENIED');assert(scoped.permissions.includes('scope.company')||scoped.siteIds.includes(input.siteId),'ACCESS_DENIED');return {current,siteId:input.siteId};}
 const shiftId=input.shiftId??(input.tripId?(await tx.get('trip',input.tripId)).data.shiftId:input.segmentId?(await tx.get('time_segment',input.segmentId)).data.shiftId:undefined);
 assert(typeof shiftId==='string','VALIDATION_ERROR');const shift=await tx.get('shift',shiftId);
 assert(shift.companyId===current.companyId&&shift.data.employeeId===current.userId&&shift.data.deviceId===device.id&&(scoped.permissions.includes('scope.company')||scoped.siteIds.includes(shift.data.siteId)),'ACCESS_DENIED');
 return {current,shiftId,siteId:shift.data.siteId};
}
async function existingReview(db:DatabaseLike,engine:EngineLike,actor:Actor,device:Entity,event:ManualEvent,input:Data){
 return db.transaction(actor.companyId,actor.userId,async tx=>{
  await manualAuthority(tx,engine,actor,device,event,input);
  const row=(await tx.list('manual_device_event')).find(e=>e.id===reviewId(actor,event.eventId));
  if(!row)return undefined;assert(row.data.employeeId===actor.userId&&row.data.deviceId===device.id&&row.data.inputHash===commandHash(event.command,input),'IDEMPOTENCY_CONFLICT');
  return {eventId:event.eventId,status:'REVIEW',accepted:false,reviewId:row.id,reason:row.data.reason};
 });
}
async function preserveManualReview(db:DatabaseLike,engine:EngineLike,actor:Actor,device:Entity,event:ManualEvent,input:Data,reason:string){
 return db.transaction(actor.companyId,actor.userId,async tx=>{
  const bound=await manualAuthority(tx,engine,actor,device,event,input),id=reviewId(actor,event.eventId),inputHash=commandHash(event.command,input);
  const prior=(await tx.list('manual_device_event')).find(e=>e.id===id);
  if(prior)assert(prior.data.employeeId===actor.userId&&prior.data.deviceId===device.id&&prior.data.inputHash===inputHash,'IDEMPOTENCY_CONFLICT');
  else{
   await tx.add('manual_device_event',{eventId:event.eventId,command:event.command,employeeId:actor.userId,deviceId:device.id,shiftId:bound.shiftId,siteId:bound.siteId,observedAt:input.occurredAt??null,receivedAt:new Date().toISOString(),inputSnapshot:input,inputHash,state:'REVIEW',reason,coordinatesStored:false,isFraudFinding:false},id);
   await tx.event('device.manual_review_requested',{reviewId:id,eventId:event.eventId,command:event.command,employeeId:actor.userId,deviceId:device.id,shiftId:bound.shiftId,siteId:bound.siteId,reason,coordinatesStored:false,isFraudFinding:false});
  }
  return {eventId:event.eventId,status:'REVIEW',accepted:false,reviewId:id,reason:prior?.data.reason??reason};
 });
}

/** GPS acceptance and manual time facts are independent per-item outcomes. */
export async function executeDeviceBatch(db:DatabaseLike,engine:EngineLike,actor:Actor,device:Entity,body:unknown):Promise<{results:Data[];apiVersion:1}>{
 const serialized=JSON.stringify(body);assert(typeof serialized==='string'&&Buffer.byteLength(serialized,'utf8')<=1024*1024,'VALIDATION_ERROR',{reason:'BATCH_MAX_1_MIB'});
 const batch=deviceBatchSchema.parse(body),results:Data[]=[];
 for(const event of batch.events){
  const gps=event.command==='presence.ingest'||event.command==='trip.sample',eventId=gps?event.input.eventId:event.eventId;
  let parsed:Data|undefined;
  try{
   assert(typeof eventId==='string'&&z.string().uuid().safeParse(eventId).success,'VALIDATION_ERROR');
   if(event.eventId!==undefined)assert(event.eventId===eventId,'VALIDATION_ERROR');
   const definition=engine.registry[event.command];assert(definition,'NOT_FOUND_SAFE');parsed=definition.schema.parse(event.input);
   if(gps)assert(parsed!.deviceId===device.id,'ACCESS_DENIED');
   else{const prior=await existingReview(db,engine,actor,device,event as ManualEvent,parsed!);if(prior){results.push(prior);continue;}}
   const result=await engine.execute(actor,event.command,{input:parsed,idempotency_key:`native:${event.command}:${eventId}`,native_device:{id:device.id,token_hash:device.data.tokenHash}});
   results.push({eventId,status:result?.status==='REVIEW'?'REVIEW':'ACCEPTED',result});
  }catch(error){
   if(error instanceof ZodError){results.push({eventId,status:'REJECTED',code:'VALIDATION_ERROR'});continue;}
   if(!(error instanceof DomainError))throw error;
   if(!gps&&parsed&&error.code==='INVALID_STATE'){
    try{results.push(await preserveManualReview(db,engine,actor,device,event as ManualEvent,parsed,error.details.reason??'TIME_STATE_RECONCILIATION_REQUIRED'));continue;}
    catch(reviewError){if(!(reviewError instanceof DomainError))throw reviewError;results.push({eventId,status:'REJECTED',code:reviewError.code});continue;}
   }
   results.push({eventId,status:'REJECTED',code:error.code});
  }
 }
 return {results,apiVersion:1};
}
