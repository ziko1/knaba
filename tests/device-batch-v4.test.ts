import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {executeDeviceBatch,deviceBatchSchema} from '../apps/api/device-batch.ts';
import {registry} from '../apps/api/registry.ts';
import {DomainError,type Actor,type Data,type Entity} from '../packages/domain/core.ts';
import type {DatabaseLike,EngineLike,SqlTransaction} from '../apps/api/auth.ts';

// Explicit CPU transaction/Engine doubles exercise batch separation and receipts.
// Actual Engine/auth/SQL assertions live in v4-http-runtime-contracts.integration.test.ts.
const actor:Actor={companyId:'company',userId:'worker',roles:['EMPLOYEE'],permissions:['shift.manage','trip.manage','location.self'],siteIds:['site'],customerIds:[],warehouseIds:[]};
const hash='a'.repeat(64),now=()=>new Date().toISOString();
function fixture(){
 const rows:Entity[]=[{id:'device',kind:'device',companyId:'company',version:1,createdAt:now(),updatedAt:now(),data:{employeeId:'worker',active:true,tokenHash:hash,tokenExpiresAt:new Date(Date.now()+3600000).toISOString()}},{id:'shift',kind:'shift',companyId:'company',version:1,createdAt:now(),updatedAt:now(),data:{employeeId:'worker',deviceId:'device',siteId:'site',state:'ACTIVE'}}],events:Data[]=[];
 const tx={get:async(kind:string,id:string)=>{const row=rows.find(e=>e.kind===kind&&e.id===id);if(!row)throw new DomainError('NOT_FOUND_SAFE');return structuredClone(row);},list:async(kind:string)=>rows.filter(e=>e.kind===kind).map(e=>structuredClone(e)),add:async(kind:string,data:Data,id:string)=>{const row={id,kind,data:structuredClone(data),companyId:'company',version:1,createdAt:now(),updatedAt:now()};rows.push(row);return structuredClone(row);},event:async(type:string,data:Data)=>{events.push({type,...data});}} as unknown as SqlTransaction;
 const db={transaction:async(_company:string,_actor:string,fn:(tx:SqlTransaction)=>Promise<unknown>)=>fn(tx)} as DatabaseLike;
 const execute=vi.fn(async(_actor:Actor,name:string,_envelope:any):Promise<any>=>{if(name==='presence.ingest')throw new DomainError('ACCESS_DENIED',{reason:'TRACKING_LEASE_NOT_VALID_AT_EVENT_TIME'});return {id:'shift',kind:'shift',data:{state:'ENDED'}};});
 const engine={registry,actorIn:async()=>actor,scope:(current:Actor)=>current,execute} as unknown as EngineLike;
 return {rows,events,tx,db,engine,execute,device:rows[0]!};
}
const manual=(command='shift.end',input:Data={shiftId:'shift',occurredAt:now()},eventId=randomUUID())=>({command,eventId,input});
const gps=()=>({command:'presence.ingest',input:{eventId:randomUUID(),trackingSessionId:'expired-lease',bootSessionId:randomUUID(),monotonicElapsedMs:1000,deviceId:'device',shiftId:'shift',siteId:'site',geofenceVersionId:'fence',policyVersionId:'policy',sequenceNumber:1,observedAt:now(),distanceM:400,accuracyM:5,source:'NATIVE_LOCATION'}});

describe('V4 independent device batch outcomes (CPU doubles, no SQL acceptance)',()=>{
 it('accepts strict existing GPS entries and UUID keyed manual inputs, with no manual GPS lease requirement',()=>{
  expect(deviceBatchSchema.parse({events:[gps(),manual()]}).events).toHaveLength(2);
  expect(()=>deviceBatchSchema.parse({events:[{command:'shift.end',input:{shiftId:'shift'}}]})).toThrow();
  expect(()=>deviceBatchSchema.parse({events:[manual('identity.delete')]})).toThrow();
 });
 it('keeps END accepted after a rejected expired GPS lease, using fresh native device authority context',async()=>{
  const f=fixture(),end=manual(),result=await executeDeviceBatch(f.db,f.engine,actor,f.device,{events:[gps(),end]});
  expect(result.results.map(row=>row.status)).toEqual(['REJECTED','ACCEPTED']);
  expect(f.execute.mock.calls[1]![2]).toMatchObject({input:end.input,idempotency_key:`native:shift.end:${end.eventId}`,native_device:{id:'device',token_hash:hash}});
  expect(JSON.stringify(result)).not.toContain(hash);
 });
 it('a malformed GPS input is rejected per item and cannot prevent a following manual time fact',async()=>{
  const f=fixture(),point=gps();delete (point.input as any).trackingSessionId;
  const result=await executeDeviceBatch(f.db,f.engine,actor,f.device,{events:[point,manual()]});
  expect(result.results.map(row=>[row.status,row.code])).toEqual([['REJECTED','VALIDATION_ERROR'],['ACCEPTED',undefined]]);expect(f.execute).toHaveBeenCalledTimes(1);
 });
 it('preserves an out-of-order manual fact exactly once without applying time or storing GPS',async()=>{
  const f=fixture(),event=manual();f.execute.mockRejectedValue(new DomainError('INVALID_STATE',{reason:'OUT_OF_ORDER_TIME'}));
  const first=await executeDeviceBatch(f.db,f.engine,actor,f.device,{events:[event]}),second=await executeDeviceBatch(f.db,f.engine,actor,f.device,{events:[event]});
  expect(second.results).toEqual(first.results);expect(first.results[0]).toMatchObject({status:'REVIEW',accepted:false,reason:'OUT_OF_ORDER_TIME'});
  expect(f.rows.filter(e=>e.kind==='manual_device_event')).toHaveLength(1);expect(f.events).toHaveLength(1);expect(f.execute).toHaveBeenCalledTimes(1);
  expect(f.rows.find(e=>e.kind==='manual_device_event')!.data).toMatchObject({inputSnapshot:event.input,coordinatesStored:false,isFraudFinding:false,state:'REVIEW'});
  expect(JSON.stringify(f.rows.find(e=>e.kind==='manual_device_event'))).not.toMatch(/latitude|longitude|tokenHash/);
 });
 it('conflicting same-event payload cannot replace an original manual review',async()=>{
  const f=fixture(),event=manual();f.execute.mockRejectedValue(new DomainError('INVALID_STATE',{reason:'OUT_OF_ORDER_TIME'}));
  await executeDeviceBatch(f.db,f.engine,actor,f.device,{events:[event]});
  const changed=await executeDeviceBatch(f.db,f.engine,actor,f.device,{events:[{...event,input:{...event.input,description:'changed fact'}}]});
  expect(changed.results[0]).toMatchObject({status:'REJECTED',code:'IDEMPOTENCY_CONFLICT'});expect(f.events).toHaveLength(1);expect(f.execute).toHaveBeenCalledTimes(1);
 });
 it('foreign or revoked devices cannot execute or persist a manual reconciliation fact',async()=>{
  for(const patch of [{employeeId:'other'},{active:false}]){const f=fixture();Object.assign(f.device.data,patch);const result=await executeDeviceBatch(f.db,f.engine,actor,f.device,{events:[manual()]});expect(result.results[0]).toMatchObject({status:'REJECTED',code:'ACCESS_DENIED'});expect(f.execute).not.toHaveBeenCalled();expect(f.events).toEqual([]);}
 });
 it('revocation after a failed command is refreshed before any REVIEW snapshot is retained',async()=>{
  const f=fixture();f.execute.mockImplementation(async()=>{f.device.data.active=false;throw new DomainError('INVALID_STATE',{reason:'OUT_OF_ORDER_TIME'});});
  const result=await executeDeviceBatch(f.db,f.engine,actor,f.device,{events:[manual()]});expect(result.results[0]).toMatchObject({status:'REJECTED',code:'ACCESS_DENIED'});expect(f.rows.filter(e=>e.kind==='manual_device_event')).toEqual([]);
 });
 it('strict manual schema rejects disguised coordinates before reconciliation and validates missing/oversize batches',async()=>{
  const f=fixture(),result=await executeDeviceBatch(f.db,f.engine,actor,f.device,{events:[manual('shift.end',{shiftId:'shift',latitude:52,longitude:13})]});expect(result.results[0]).toMatchObject({status:'REJECTED',code:'VALIDATION_ERROR'});expect(f.execute).not.toHaveBeenCalled();
  await expect(executeDeviceBatch(f.db,f.engine,actor,f.device,undefined)).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await expect(executeDeviceBatch(f.db,f.engine,actor,f.device,{events:[manual('shift.end',{shiftId:'shift',description:'x'.repeat(1024*1024)})]})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
 });
});
