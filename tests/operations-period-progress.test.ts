import { describe, expect, it } from 'vitest';
import { operationsCommands } from '../packages/domain/operations.ts';
import { assert, type Actor, type CommandContext, type Data, type Entity, type Transaction } from '../packages/domain/core.ts';

const OCT='2026-10-05T16:00:00.000Z',START='2026-10-01T00:00:00.000Z',END='2026-11-01T00:00:00.000Z';
const owner:Actor={userId:'owner',companyId:'company',roles:['OWNER'],permissions:['scope.company'],siteIds:[],warehouseIds:[],customerIds:[]},worker:Actor={...owner,userId:'worker',roles:['EMPLOYEE'],permissions:['task.work'],siteIds:['A','B']};
class Memory implements Transaction {
  rows=new Map<string,Entity>();sequence=0;now=OCT;writes=0;
  async get<T extends Data=Data>(kind:string,id:string){const row=this.rows.get(kind+':'+id);assert(row&&row.companyId==='company','NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;}
  async list<T extends Data=Data>(kind:string){return [...this.rows.values()].filter(row=>row.kind===kind&&row.companyId==='company').map(row=>structuredClone(row)) as Entity<T>[];}
  async add<T extends Data=Data>(kind:string,data:T,id=kind+'-'+ ++this.sequence){assert(!this.rows.has(kind+':'+id),'VERSION_CONFLICT');const row={kind,id,data:structuredClone(data),companyId:'company',version:1,createdAt:this.now,updatedAt:this.now};this.rows.set(kind+':'+id,row);this.writes++;return structuredClone(row);}
  async save(row:Entity,data:Data,version=row.version){const original=await this.get(row.kind,row.id);assert(original.version===version,'VERSION_CONFLICT');const saved={...original,data:structuredClone(data),version:version+1,updatedAt:this.now};this.rows.set(row.kind+':'+row.id,saved);this.writes++;return structuredClone(saved);}
  async event(){this.writes++;}
}
async function run(tx:Memory,name:string,input:Data,actor=owner,now=OCT):Promise<any>{tx.now=now;const ctx:CommandContext={tx,actor,now,idempotencyKey:'synthetic-'+ ++tx.sequence,requireSite:id=>assert(actor.permissions.includes('scope.company')||actor.siteIds.includes(id),'ACCESS_DENIED'),requireOwn:id=>assert(id===actor.userId||actor.permissions.includes('scope.company'),'ACCESS_DENIED')};const def=operationsCommands[name]!;return def.handler(ctx,def.schema.parse(input));}
async function setup(){const tx=new Memory();await tx.add('company',{operatingMode:'TEST'},'company');for(const id of ['A','B'])await tx.add('site',{active:true,code:id},id);for(const id of ['owner','worker','peer'])await tx.add('user',{active:true,roles:id==='owner'?['OWNER']:['EMPLOYEE'],siteIds:['A','B']},id);return tx;}
async function task(tx:Memory,fields:Data={},at=OCT){return run(tx,'task.create',{siteId:'A',title:'Synthetic period result',unit:'M2',plannedQuantityMilli:100000,assigneeIds:['worker'],...fields},owner,at);}
async function accept(tx:Memory,t:Entity,at:string,quantity=100000){await run(tx,'task.start',{taskId:t.id},worker,at);const log=await run(tx,'task.worklog',{taskId:t.id,quantityMilli:quantity,description:'Synthetic recorded atomic result'},worker,at);await run(tx,'task.submit',{taskId:t.id},worker,at);await run(tx,'task.review',{taskId:t.id,decision:'ACCEPT'},owner,at);return log;}
const stats=(tx:Memory,extra:Data={},now=OCT)=>run(tx,'operations.statistics',{periodStart:START,periodEnd:END,...extra},owner,now);

describe('descendant atomic progress and period-bound operations statistics (CPU, no PostgreSQL)',()=>{
  it('parent package includes direct/child/grandchild atomic tasks once and excludes package container plans',async()=>{
    const tx=await setup(),root=await run(tx,'work_package.create',{siteId:'A',title:'Container',unit:'M2',plannedQuantityMilli:900000}),child=await run(tx,'work_package.create',{siteId:'A',parentId:root.id,title:'Child',unit:'M2',plannedQuantityMilli:700000}),grand=await run(tx,'work_package.create',{siteId:'A',parentId:child.id,title:'Grandchild',unit:'M2',plannedQuantityMilli:600000});
    const direct=await task(tx,{workPackageId:root.id,plannedQuantityMilli:100000}),leaf=await task(tx,{workPackageId:grand.id,plannedQuantityMilli:300000});await accept(tx,direct,OCT);await accept(tx,leaf,OCT,100000);await task(tx,{workPackageId:child.id,unit:'WINDOW',plannedQuantityMilli:5000});await task(tx,{workPackageId:undefined,plannedQuantityMilli:999000});
    const before=tx.writes,result=await run(tx,'task.progress',{siteId:'A',workPackageId:root.id});expect(result.tasks).toBe(3);expect(result.byUnit.M2).toMatchObject({plannedQuantityMilli:400000,acceptedQuantityMilli:200000,acceptedRatio:0.5});expect(new Set(result.byUnit.M2.taskIds).size).toBe(2);expect(result.byUnit.WINDOW.plannedQuantityMilli).toBe(5000);expect(result.workPackageIds).toHaveLength(3);expect(tx.writes).toBe(before);
  });
  it('package and location descendant filters intersect without counting an accepted task twice',async()=>{
    const tx=await setup(),floor=await run(tx,'location.create',{siteId:'A',nodeType:'FLOOR',code:'F1',name:'Floor',floorLevel:1,floorLabelDe:'1. OG'}),room=await run(tx,'location.create',{siteId:'A',parentId:floor.id,nodeType:'ROOM',code:'R1',name:'Room'}),root=await run(tx,'work_package.create',{siteId:'A',title:'Package',unit:'M2',plannedQuantityMilli:100000}),child=await run(tx,'work_package.create',{siteId:'A',parentId:root.id,title:'Child',unit:'M2',plannedQuantityMilli:100000});
    const t=await task(tx,{workPackageId:child.id,locationId:room.id});await accept(tx,t,OCT);await task(tx,{workPackageId:child.id});const result=await run(tx,'task.progress',{siteId:'A',workPackageId:root.id,locationId:floor.id});expect(result.tasks).toBe(1);expect(result.byUnit.M2.acceptedQuantityMilli).toBe(100000);
  });
  it('foreign-site package selection fails instead of returning an apparently empty progress result',async()=>{
    const tx=await setup(),foreign=await run(tx,'work_package.create',{siteId:'B',title:'Other site',unit:'M2',plannedQuantityMilli:1000});await expect(run(tx,'task.progress',{siteId:'A',workPackageId:foreign.id})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  it('malformed reachable hierarchy cycles fail closed rather than hanging or duplicating quantities',async()=>{
    const tx=await setup(),root=await run(tx,'work_package.create',{siteId:'A',title:'Root',unit:'M2',plannedQuantityMilli:1000}),child=await run(tx,'work_package.create',{siteId:'A',parentId:root.id,title:'Child',unit:'M2',plannedQuantityMilli:1000});tx.rows.get('work_package:'+root.id)!.data.parentId=child.id;await expect(run(tx,'task.progress',{siteId:'A',workPackageId:root.id})).rejects.toMatchObject({code:'INVALID_STATE',details:{reason:'HIERARCHY_CYCLE'}});
  });
  it('June accepted work is absent from October outcomes but honestly remains in the separately labeled current backlog',async()=>{
    const tx=await setup(),t=await task(tx,{},'2026-06-01T10:00:00Z');await accept(tx,t,'2026-06-01T10:00:00Z');const result=await stats(tx);expect(result.byUnit).toEqual({});expect(result.backlog.byUnit.M2.acceptedQuantityMilli).toBe(100000);expect(result.backlog.asOf).toBe(OCT);expect(result.backlog.basis).toContain('NOT_PERIOD_OUTPUT');
  });
  it('work performed in September and accepted in October uses the distinct immutable source event dates',async()=>{
    const tx=await setup(),t=await task(tx,{},'2026-09-30T20:00:00Z');await run(tx,'task.start',{taskId:t.id},worker,'2026-09-30T20:00:00Z');const log=await run(tx,'task.worklog',{taskId:t.id,quantityMilli:100000,description:'September result'},worker,'2026-09-30T21:00:00Z');await run(tx,'task.submit',{taskId:t.id},worker,'2026-09-30T21:00:00Z');await run(tx,'task.review',{taskId:t.id,decision:'ACCEPT'},owner,'2026-10-01T00:00:00Z');
    const result=await stats(tx);expect(result.byUnit.M2).toMatchObject({reportedQuantityMilli:0,acceptedQuantityMilli:100000});expect(result.byUnit.M2.worklogIds).not.toContain(log.id);expect(result.byUnit.M2.reviewIds).toHaveLength(1);
  });
  it('period endpoints are half-open, future events are excluded and current backlog is never called period output',async()=>{
    const tx=await setup(),before=await task(tx,{},'2026-09-30T23:59:59Z'),atStart=await task(tx,{},START),atEnd=await task(tx,{},END);await accept(tx,before,'2026-09-30T23:59:59Z');await accept(tx,atStart,START);await accept(tx,atEnd,END);
    const result=await stats(tx,{},'2026-11-02T00:00:00Z');expect(result.byUnit.M2.reportedQuantityMilli).toBe(100000);expect(result.byUnit.M2.acceptedQuantityMilli).toBe(100000);expect(result.byUnit.M2.taskIds).toEqual([atStart.id]);
  });
  it('accepted original stays immutable while a separately accepted REWORK has its own period facts and no doubled original progress',async()=>{
    const tx=await setup(),t=await task(tx,{},'2026-06-01T10:00:00Z');const originalLog=await accept(tx,t,'2026-06-01T10:00:00Z'),original=await tx.get('task',t.id);
    const rework=await run(tx,'task.reopen',{taskId:t.id,reason:'Synthetic quality review'},owner,'2026-10-02T10:00:00Z');expect(rework.id).not.toBe(t.id);expect(rework.data).toMatchObject({completionKind:'REWORK',sourceTaskId:t.id,billingScope:'INTERNAL',state:'ASSIGNED'});
    const reworkLog=await accept(tx,rework,'2026-10-03T10:00:00Z');expect(await tx.get('task',t.id)).toEqual(original);expect((await tx.get('worklog',originalLog.id)).data.taskId).toBe(t.id);expect(reworkLog.data.taskId).toBe(rework.id);
    const originalPeriod=await stats(tx,{completionKind:'ORIGINAL'}),reworkPeriod=await stats(tx,{completionKind:'REWORK'});expect(originalPeriod.byUnit).toEqual({});expect(originalPeriod.backlog.byUnit.M2.acceptedQuantityMilli).toBe(100000);
    expect(reworkPeriod.byUnit.M2).toMatchObject({reportedQuantityMilli:100000,grossAcceptedQuantityMilli:100000,revokedAcceptedQuantityMilli:0,acceptedQuantityMilli:100000,taskIds:[rework.id],worklogIds:[reworkLog.id]});expect((await stats(tx)).byUnit.M2.acceptedQuantityMilli).toBe(100000);
    const progress=await run(tx,'task.progress',{siteId:'A'});expect(progress.tasks).toBe(1);expect(progress.byUnit.M2).toMatchObject({plannedQuantityMilli:100000,acceptedQuantityMilli:100000,taskIds:[t.id]});expect((await tx.list('task_review')).filter(review=>review.data.taskId===t.id&&review.data.decision==='REOPEN')).toEqual([]);expect((await tx.get('defect',rework.data.defectId)).data.state).toBe('CLOSED');
  });
  it('cancelling a later REWORK preserves the accepted original and its historical outcome; cancelling the original is rejected',async()=>{
    const tx=await setup(),t=await task(tx,{},START);await accept(tx,t,START);const original=await tx.get('task',t.id),rework=await run(tx,'task.reopen',{taskId:t.id,reason:'Synthetic subsequent correction'},owner,'2026-10-03T10:00:00Z');
    await expect(run(tx,'task.cancel',{taskId:t.id,reason:'Synthetic invalid cancellation of accepted fact'},owner,'2026-10-04T10:00:00Z')).rejects.toMatchObject({code:'INVALID_STATE'});expect(await tx.get('task',t.id)).toEqual(original);
    await run(tx,'task.cancel',{taskId:rework.id,reason:'Synthetic cancelled separate correction scope'},owner,'2026-10-04T10:00:00Z');expect((await tx.get('task',rework.id)).data.state).toBe('CANCELLED');expect(await tx.get('task',t.id)).toEqual(original);
    const result=await stats(tx,{periodEnd:'2026-10-02T00:00:00Z'});expect(result.byUnit.M2).toMatchObject({acceptedQuantityMilli:100000,grossAcceptedQuantityMilli:100000,revokedAcceptedQuantityMilli:0,taskIds:[t.id]});expect(result.backlog.byUnit.M2).toMatchObject({acceptedQuantityMilli:100000,taskIds:[t.id]});expect(await stats(tx,{completionKind:'REWORK',periodEnd:'2026-10-02T00:00:00Z'})).toMatchObject({byUnit:{},backlog:{byUnit:{}}});
  });
  it('a grouped team report counts once globally and historical employee source membership survives later reassignment',async()=>{
    const tx=await setup(),t=await task(tx,{assigneeIds:['worker','peer']},START);await run(tx,'task.start',{taskId:t.id},worker,START);const log=await run(tx,'task.worklog',{taskId:t.id,quantityMilli:100000,description:'One shared result',employeeIds:['worker','peer'],groupResultKey:'shared-result'},worker,START);expect((await run(tx,'task.worklog',{taskId:t.id,quantityMilli:100000,description:'Repeated teammate sync',groupResultKey:'shared-result'},{...worker,userId:'peer'},START)).id).toBe(log.id);await run(tx,'task.submit',{taskId:t.id},worker,START);await run(tx,'task.review',{taskId:t.id,decision:'ACCEPT'},owner,START);tx.rows.get('task:'+t.id)!.data.assigneeIds=['peer'];
    expect((await stats(tx)).byUnit.M2.reportedQuantityMilli).toBe(100000);const own=await stats(tx,{employeeId:'worker'});expect(own.byUnit.M2.acceptedQuantityMilli).toBe(100000);expect(own.byUnit.M2.worklogIds).toEqual([log.id]);expect(own.backlog.byUnit).toEqual({});
  });
  it('scoped and completion-kind slices preserve unit separation and do not disclose unauthorized historical sources',async()=>{
    const tx=await setup(),m2=await task(tx,{},START),window=await task(tx,{unit:'WINDOW',plannedQuantityMilli:1000,completionKind:'CONTINUATION'},START),foreign=await task(tx,{siteId:'B'},START);await accept(tx,m2,START);await accept(tx,window,START,1000);await accept(tx,foreign,START);
    const narrowed:Actor={...owner,permissions:[],siteIds:['A']},result=await run(tx,'operations.statistics',{periodStart:START,periodEnd:END,completionKind:'CONTINUATION'},narrowed);expect(Object.keys(result.byUnit)).toEqual(['WINDOW']);expect(JSON.stringify(result)).not.toContain(foreign.id);expect(result.timeCompletionKindBasis).toContain('TASK_QUANTITIES');
  });
  async function approvedCrossingTrip(tx:Memory){
    const shift=await run(tx,'shift.start',{siteId:'A',occurredAt:'2026-09-30T23:00:00Z'},worker,'2026-10-01T03:00:00Z'),trip=await run(tx,'trip.start',{shiftId:shift.id,destination:{kind:'SITE',id:'B'},purpose:'Synthetic month-boundary trip',occurredAt:'2026-09-30T23:30:00Z'},worker,'2026-10-01T03:00:00Z');
    await run(tx,'trip.stop',{tripId:trip.id,kind:'PRIVATE_BREAK',reason:'Synthetic break',occurredAt:'2026-10-01T00:30:00Z'},worker,'2026-10-01T03:00:00Z');await run(tx,'trip.resume',{tripId:trip.id,occurredAt:'2026-10-01T00:45:00Z'},worker,'2026-10-01T03:00:00Z');await run(tx,'trip.arrive',{tripId:trip.id,startWork:true,occurredAt:'2026-10-01T01:00:00Z'},worker,'2026-10-01T03:00:00Z');await run(tx,'shift.end',{shiftId:shift.id,occurredAt:'2026-10-01T02:00:00Z'},worker,'2026-10-01T03:00:00Z');await run(tx,'trip.approve',{tripId:trip.id,decision:'APPROVE',paid:true,reason:'Synthetic explicit trip approval'},owner,'2026-10-01T03:00:00Z');return trip;
  }
  const tripStats=(tx:Memory,extra:Data={})=>run(tx,'operations.statistics',{periodStart:START,periodEnd:'2026-10-01T01:00:00Z',...extra},owner,'2026-10-01T03:00:00Z');
  it('clips approved crossing-trip intervals exactly, excludes private break and never prorates a whole aggregate',async()=>{
    const tx=await setup(),trip=await approvedCrossingTrip(tx),before=tx.writes,result=await tripStats(tx);expect(result).toMatchObject({travelSeconds:2700,breakSeconds:900,payableSeconds:null,trips:{count:1,startedCount:0,approvedPaidSeconds:2700,wholeTripApprovedPaidSeconds:4500,unresolvedPaidTripIds:[]}});expect(result.trips.ids).toEqual([trip.id]);expect((await tx.list('trip_approval'))[0]!.data.segmentSnapshot).toHaveLength(3);expect(tx.writes).toBe(before);
  });
  it('approved period time remains tied to the immutable approval snapshot after raw source timestamps change',async()=>{
    const tx=await setup(),trip=await approvedCrossingTrip(tx),segment=[...tx.rows.values()].find(r=>r.kind==='time_segment'&&r.data.tripId===trip.id&&r.data.activity==='ON_BREAK')!;segment.data.startAt='2026-10-01T00:20:00Z';segment.data.endAt='2026-10-01T00:35:00Z';expect((await tripStats(tx)).trips.approvedPaidSeconds).toBe(2700);
  });
  it('legacy partial-trip pay is explicitly unknown while whole-trip context stays labeled separately',async()=>{
    const tx=await setup(),trip=await approvedCrossingTrip(tx);delete [...tx.rows.values()].find(r=>r.kind==='trip_approval')!.data.segmentSnapshot;const result=await tripStats(tx);expect(result.trips).toMatchObject({approvedPaidSeconds:null,knownApprovedPaidSeconds:0,wholeTripApprovedPaidSeconds:4500,unresolvedPaidTripIds:[trip.id]});expect(result.trips.wholeTripApprovedPaidSecondsBasis).toContain('NOT_PERIOD_TOTAL');
    expect((await tripStats(tx,{periodStart:'2026-09-30T00:00:00Z',periodEnd:'2026-10-02T00:00:00Z'})).trips.approvedPaidSeconds).toBe(4500);
  });
  it('an incomplete or overlapping approved snapshot cannot certify partial pay',async()=>{
    const tx=await setup(),trip=await approvedCrossingTrip(tx),approval=[...tx.rows.values()].find(r=>r.kind==='trip_approval')!;approval.data.segmentSnapshot[1].startAt='2026-10-01T00:20:00Z';expect((await tripStats(tx)).trips).toMatchObject({approvedPaidSeconds:null,unresolvedPaidTripIds:[trip.id]});
  });
  it('disputed trip pay remains zero approved seconds rather than copying a stale aggregate',async()=>{
    const tx=await setup(),trip=await approvedCrossingTrip(tx);await run(tx,'trip.approve',{tripId:trip.id,decision:'DISPUTE',paid:true,reason:'Synthetic disputed journey'},owner,'2026-10-01T03:00:00Z');expect((await tripStats(tx)).trips).toMatchObject({approvedPaidSeconds:0,wholeTripApprovedPaidSeconds:0});
  });
  it('future period endpoints cannot extend current open recorded time beyond the server as-of',async()=>{
    const tx=await setup();await run(tx,'shift.start',{siteId:'A',occurredAt:'2026-10-01T08:00:00Z'},worker,'2026-10-01T09:00:00Z');const result=await stats(tx,{},'2026-10-01T09:00:00Z');expect(result.totalSeconds).toBe(3600);expect(result.payableSeconds).toBeNull();
  });
});
