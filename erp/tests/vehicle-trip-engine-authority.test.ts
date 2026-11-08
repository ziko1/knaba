import {describe,expect,it,vi} from 'vitest';
import {Engine} from '../apps/api/engine.ts';
import {DomainError,type Actor,type Data,type Entity} from '../packages/domain/core.ts';
import {governanceCommands} from '../packages/domain/governance.ts';

const companyId='synthetic-vehicle-authority',epoch='2026-11-08T10:00:00.000Z';
const actor:Actor={companyId,userId:'driver',roles:['EMPLOYEE'],permissions:['identity.self','trip.read'],siteIds:['origin','destination'],warehouseIds:[],customerIds:[]};
const row=(kind:string,id:string,data:Data):Entity=>({kind,id,companyId,version:1,data,createdAt:epoch,updatedAt:epoch});
const vehicle=()=>row('vehicle_trip','vehicle',{originSiteId:'origin',destination:{kind:'SITE',id:'destination'},driverId:'driver',passengerIds:[],state:'PLANNED',distanceSource:'UNKNOWN',distanceMeters:null});

/** SQL transport double; real Engine actorIn, delegation scopes and receipts. */
function engineFixture(base=actor){
 const entities=new Map<string,Entity>();let receipt:Data|undefined,receiptWrites=0,sequence=0;
 const put=(kind:string,id:string,data:Data)=>{const entity=row(kind,id,data);entities.set(`${kind}:${id}`,entity);return entity;};
 entities.set('vehicle_trip:vehicle',vehicle());
 put('user',base.userId,{active:true,roles:base.roles,permissions:base.permissions,siteIds:base.siteIds});
 put('site','origin',{active:true});put('site','destination',{active:true});
 put('trip','personal-trip',{vehicleTripId:'vehicle',employeeId:'driver',shiftId:'shift',startAt:epoch,endAt:'2026-11-08T10:05:00.000Z',state:'ARRIVED'});
 put('time_segment','segment',{tripId:'personal-trip',shiftId:'shift',employeeId:'driver',activity:'TRAVELLING',startAt:epoch,endAt:'2026-11-08T10:01:00.000Z'});
 const tx={companyId,get:async(kind:string,id:string)=>{const entity=entities.get(`${kind}:${id}`);if(!entity)throw new DomainError('NOT_FOUND_SAFE');return structuredClone(entity);},list:async(kind:string)=>[...entities.values()].filter(entity=>entity.kind===kind).map(entity=>structuredClone(entity)),
  add:async(kind:string,data:Data,id=`synthetic-${++sequence}`)=>put(kind,id,data),event:async()=>{},
  query:async(statement:string,params:any[]=[])=>{
   if(statement.startsWith('SELECT command,input_hash'))return {rows:receipt?[receipt]:[]};
   if(statement.startsWith('INSERT INTO command_receipts')){receiptWrites++;receipt={command:params[3],input_hash:params[4],result:JSON.parse(params[5]),authorization_hash:params[6],created_at:new Date().toISOString()};return {rows:[]};}
   if(statement.startsWith('INSERT INTO audit_log'))return {rows:[]};throw Error('Unexpected vehicle summary SQL');
  }};
 const db={transaction:async(_company:string,_user:string,fn:(tx:any)=>Promise<unknown>)=>fn(tx)},engine=new Engine(db as any,'TEST');
 return {engine,tx,entities,put,receiptWrites:()=>receiptWrites};
}

describe('shared vehicle Engine read authority',()=>{
 it('requires one complete permission-specific route scope, without combining unrelated delegated sites',async()=>{
  const engine=new Engine({} as any,'TEST'),scopes:Record<string,Actor>={
   'trip.read':{...actor,siteIds:['origin']},
   'dispatch.manage':{...actor,permissions:['dispatch.manage'],siteIds:['destination']},
   'trip.approve':{...actor,permissions:[],siteIds:['origin','destination']}
  };
  engine.scope=vi.fn((_actor,permission)=>scopes[permission]!);
  await expect(engine.visible({companyId} as any,actor,vehicle())).resolves.toBe(false);
  expect(engine.scope).toHaveBeenCalledWith(actor,'trip.read');expect(engine.scope).toHaveBeenCalledWith(actor,'dispatch.manage');expect(engine.scope).toHaveBeenCalledWith(actor,'trip.approve');
  scopes['dispatch.manage']={...actor,userId:'dispatcher',permissions:['dispatch.manage'],siteIds:['origin','destination']};
  await expect(engine.visible({companyId} as any,actor,vehicle())).resolves.toBe(true);
 });

 it('keeps another participant, a foreign tenant and external actors out of the vehicle list',async()=>{
  const engine=new Engine({} as any,'TEST');
  await expect(engine.visible({companyId} as any,actor,vehicle())).resolves.toBe(true);
  await expect(engine.visible({companyId} as any,{...actor,userId:'unrelated'},vehicle())).resolves.toBe(false);
  await expect(engine.visible({companyId} as any,actor,{...vehicle(),companyId:'foreign-company'})).resolves.toBe(false);
  await expect(engine.visible({companyId} as any,{...actor,roles:['CLIENT'],permissions:['trip.read','scope.company']},vehicle())).resolves.toBe(false);
 });

 it('recalculates live person-time through an existing command receipt instead of returning the old summary',async()=>{
  const f=engineFixture(),{engine,entities}=f;
  const envelope={input:{vehicleTripId:'vehicle'},idempotency_key:'synthetic-shared-trip-summary'};
  expect(await engine.execute(actor,'vehicle_trip.summary',envelope)).toMatchObject({personSeconds:60,participantCount:1});
  entities.get('time_segment:segment')!.data.endAt='2026-11-08T10:02:00.000Z';
  expect(await engine.execute(actor,'vehicle_trip.summary',envelope)).toMatchObject({personSeconds:120,participantCount:1});
  expect(f.receiptWrites()).toBe(1);
 });

 it.each(['dispatch.manage','trip.approve'])('allows a scoped manager with only %s through the actual command gateway',async permission=>{
  const manager={...actor,userId:'manager',roles:[],permissions:['identity.self',permission]},f=engineFixture(manager);
  const current=await f.engine.getActor(manager.userId,companyId);
  expect(current.permissions).not.toContain('trip.read');
  await expect(f.engine.execute(current,'vehicle_trip.summary',{input:{vehicleTripId:'vehicle'},idempotency_key:'manager-vehicle-summary'})).resolves.toMatchObject({personSeconds:60});
 });

 it('uses actual current delegations without joining different permissions and denies a revoked grant before receipt replay',async()=>{
  const base={...actor,roles:[],permissions:['identity.self','trip.read'],siteIds:['origin']},f=engineFixture(base);
  f.put('user','grantor',{active:true,roles:[],permissions:['role.manage','dispatch.manage'],siteIds:['origin','destination']});
  const grant=async(siteId:string)=>{
   const grantor=await f.engine.getActor('grantor',companyId),definition=governanceCommands['delegation.create']!;
   const created=await definition.handler(f.engine.context(f.tx as any,grantor,'synthetic-vehicle-delegation'),definition.schema.parse({granteeId:base.userId,permissions:['dispatch.manage'],siteIds:[siteId],expiresAt:new Date(Date.now()+3600000).toISOString(),reason:'Synthetic delegated vehicle scope'}));
   f.entities.get(`delegation:${created.id}`)!.data.state='APPROVED';
  };
  await grant('destination');const current=await f.engine.getActor(base.userId,companyId),envelope={input:{vehicleTripId:'vehicle'},idempotency_key:'delegated-vehicle-summary'};
  await expect(f.engine.execute(current,'vehicle_trip.summary',envelope)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(f.receiptWrites()).toBe(0);
  await grant('origin');await expect(f.engine.execute(current,'vehicle_trip.summary',envelope)).resolves.toMatchObject({personSeconds:60});
  f.entities.get('user:grantor')!.data.permissions=['role.manage'];
  await expect(f.engine.execute(current,'vehicle_trip.summary',envelope)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(f.receiptWrites()).toBe(1);
 });
});
