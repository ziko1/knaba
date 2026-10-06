import { describe, expect, it } from 'vitest';
import { mobileShiftSummary } from '../apps/api/mobile-shift-summary.ts';
import { assert, type Actor, type Data, type Entity, type Transaction } from '../packages/domain/core.ts';

const actor: Actor = { userId: 'employee', companyId: 'company', roles: ['EMPLOYEE'], permissions: ['shift.read'], siteIds: ['A','B'], warehouseIds: [], customerIds: [] };
const asOf = '2026-10-05T16:00:00.000Z';
class Memory implements Transaction {
  rows = new Map<string, Entity>(); writes = 0;
  put(kind: string, id: string, data: Data, companyId = actor.companyId) { const row = { kind,id,data:structuredClone(data),companyId,version:1,createdAt:asOf,updatedAt:asOf }; this.rows.set(kind+':'+id,row); return row; }
  async get<T extends Data = Data>(kind: string, id: string) { const row = this.rows.get(kind+':'+id); assert(row,'NOT_FOUND_SAFE'); return structuredClone(row) as Entity<T>; }
  async list<T extends Data = Data>(kind: string) { return [...this.rows.values()].filter(row=>row.kind===kind).map(row=>structuredClone(row) as Entity<T>); }
  async add<T extends Data>(kind:string,data:T,id='unexpected-write') { this.writes++; return this.put(kind,id,data) as Entity<T>; }
  async save(row:Entity,data:Data) { this.writes++; return this.put(row.kind,row.id,data,row.companyId); }
  async event() { this.writes++; }
}
function fixture(parts: [string,number,string|null][] = [['WORKING',14400,'A'],['ON_BREAK',1800,null],['TRAVELLING',1800,'A'],['WORKING',10800,'B']], startAt = '2026-10-05T08:00:00.000Z') {
  const tx = new Memory(), device = tx.put('device','device',{employeeId:actor.userId,active:true,tokenExpiresAt:'2027-01-01T00:00:00Z'});
  tx.put('site','A',{name:'Synthetic origin',code:'A-01',active:true,privateClientContact:'PRIVATE_CONTACT'});tx.put('site','B',{name:'Synthetic destination',code:'B-02',active:true});
  let cursor = Date.parse(startAt);
  for (const [index,[activity,duration,siteId]] of parts.entries()) {
    const start = cursor; cursor += duration*1000;
    tx.put('time_segment','segment-'+index,{shiftId:'shift',employeeId:actor.userId,activity,siteId,startAt:new Date(start).toISOString(),endAt:index===parts.length-1?null:new Date(cursor).toISOString(),privateReason:'PRIVATE_REASON',salaryCents:99999,latitude:52.555});
  }
  const current = parts.at(-1)!;
  tx.put('shift','shift',{employeeId:actor.userId,deviceId:device.id,siteId:current[2]||'A',state:'ACTIVE',activity:current[0],startAt,endAt:null,activeSegmentId:'segment-'+(parts.length-1),gpsTrackerState:'STALE',payableSeconds:99999});
  const now = new Date(cursor).toISOString();
  return {tx,device,now,read:(who=actor,at=now,visible?: (row:Entity)=>boolean)=>mobileShiftSummary(tx,who,device,at,visible)};
}
describe('minimal current-device mobile chronological shift summary (CPU, not SQL)',()=>{
  it('returns seven site hours plus separate travel and lunch even without any GPS policy',async()=>{
    const f=fixture(),result=await f.read();expect(result).toEqual({shiftId:'shift',siteId:'B',siteCode:'B-02',siteName:'Synthetic destination',state:'ACTIVE',activity:'WORKING',startedAt:'2026-10-05T08:00:00.000Z',asOf,activityStartedAt:'2026-10-05T13:00:00.000Z',siteSeconds:25200,travelSeconds:1800,breakSeconds:1800,pendingSeconds:0,serviceSeconds:0,waitingSeconds:0});
    expect(f.tx.writes).toBe(0);for(const text of ['PRIVATE_REASON','PRIVATE_CONTACT','salary','payable','latitude','99999','tracker','deviceToken'])expect(JSON.stringify(result)).not.toContain(text);
  });
  it('keeps service, waiting, unexplained time and actual breaks distinct from site work and pay',async()=>{
    const f=fixture([['WORKING',3600,'A'],['SERVICE_TASK',1800,'A'],['WAITING_WORK',900,'A'],['ON_BREAK',900,null],['AWAY_PENDING_REASON',600,'A']]);
    expect(await f.read()).toMatchObject({siteSeconds:3600,serviceSeconds:1800,waitingSeconds:900,breakSeconds:900,pendingSeconds:600,travelSeconds:0,activity:'AWAY_PENDING_REASON'});
  });
  it('reports unknown activity as UNKNOWN and explicit review without inventing payroll or break',async()=>{
    const f=fixture([['WORKING',3600,'A'],['UNRECOGNIZED_STATE',600,'A']]);expect(await f.read()).toMatchObject({activity:'UNKNOWN',siteSeconds:3600,pendingSeconds:600,breakSeconds:0,reviewRequired:true});
  });
  it('advances only the actual open category using the injected server as-of',async()=>{
    const f=fixture(),before=await f.read(),after=await f.read(actor,'2026-10-05T16:00:45.000Z');expect(after!.siteSeconds-before!.siteSeconds).toBe(45);expect(after!.breakSeconds).toBe(before!.breakSeconds);expect(after!.travelSeconds).toBe(before!.travelSeconds);expect(after!.asOf).toBe('2026-10-05T16:00:45.000Z');
  });
  it.each([
    ['2026-03-29T01:30:00+01:00','2026-03-29T03:30:00+02:00'],
    ['2026-10-25T02:30:00+02:00','2026-10-25T02:30:00+01:00'],
    ['2026-10-24T22:00:00+02:00','2026-10-25T08:00:00+01:00']
  ])('uses elapsed UTC seconds across DST/midnight from %s to %s',async(start,end)=>{
    const elapsed=(Date.parse(end)-Date.parse(start))/1000,f=fixture([['WORKING',elapsed,'A']],start);expect((await f.read())!.siteSeconds).toBe(elapsed);
  });
  it('zero-length closed bookkeeping segments cannot become a second open active interval',async()=>{
    const f=fixture([['WORKING',3600,'A'],['WAITING_WORK',0,'A'],['TRAVELLING',1800,'A']]);expect(await f.read()).toMatchObject({siteSeconds:3600,waitingSeconds:0,travelSeconds:1800,activity:'TRAVELLING'});
  });
  it('aggregates same-category subsecond fragments before integer display without extending intervals',async()=>{
    const f=fixture([['WORKING',0.5,'A'],['WORKING',0.5,'A']]);expect((await f.read())!.siteSeconds).toBe(1);
  });
  it('reloads and rejects a freshly revoked device despite the stale authenticated object',async()=>{
    const f=fixture();f.tx.rows.get('device:device')!.data.active=false;await expect(f.read()).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  });
  it('closes device expiry exactly at the injected server timestamp',async()=>{
    const f=fixture();f.tx.rows.get('device:device')!.data.tokenExpiresAt=f.now;await expect(f.read()).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  });
  it('rejects foreign identities/company and a broad role without the existing shift.read right',async()=>{
    const f=fixture();await expect(f.read({...actor,userId:'peer'})).rejects.toMatchObject({code:'ACCESS_DENIED'});await expect(f.read({...actor,companyId:'foreign'})).rejects.toMatchObject({code:'ACCESS_DENIED'});await expect(f.read({...actor,roles:['OWNER'],permissions:[]})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  it.each(['CLIENT','CUSTOMER','GUEST','EXTERNAL_BAULEITER'])('an explicit stale shift.read right cannot restore mobile employee context for external role %s',async(role)=>{
    const f=fixture();await expect(f.read({...actor,roles:['EMPLOYEE',role],permissions:['shift.read','scope.company']})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  it('does not expose a shift belonging to another device or an ended shift',async()=>{
    const f=fixture(),s=f.tx.rows.get('shift:shift')!;s.data.deviceId='replacement';expect(await f.read()).toBeUndefined();s.data.deviceId='device';s.data.state='ENDED';expect(await f.read()).toBeUndefined();
  });
  it('scope denial of any historical site fails closed instead of showing partial misleading totals',async()=>{
    const f=fixture();await expect(f.read({...actor,siteIds:['B']})).rejects.toMatchObject({code:'ACCESS_DENIED'});await expect(f.read({...actor,siteIds:['*']})).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await f.read({...actor,siteIds:[],permissions:['shift.read','scope.company']})).toMatchObject({siteSeconds:25200});
  });
  it('honors supplemental fresh visibility denial for an included source',async()=>{
    const f=fixture();await expect(f.read(actor,f.now,row=>row.id!=='segment-0')).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  it('filters peer and foreign-company shifts without leaking any of their data',async()=>{
    const f=fixture();f.tx.put('shift','peer',{employeeId:'peer',deviceId:'device',state:'ACTIVE',siteId:'A',reason:'PEER_SECRET'});f.tx.put('shift','foreign',{employeeId:actor.userId,deviceId:'device',state:'ACTIVE',siteId:'A',reason:'FOREIGN_SECRET'},'foreign');expect(JSON.stringify(await f.read())).not.toMatch(/PEER_SECRET|FOREIGN_SECRET/);
  });
  it('rejects ambiguous duplicate active own/device-bound shifts',async()=>{
    const f=fixture(),s=await f.tx.get('shift','shift');f.tx.put('shift','duplicate',s.data);await expect(f.read()).rejects.toMatchObject({code:'INVALID_STATE',details:{reason:'MOBILE_SHIFT_AMBIGUOUS'}});
  });
  it.each([
    ['gap',(tx:Memory)=>{tx.rows.get('time_segment:segment-1')!.data.startAt='2026-10-05T12:00:01Z';}],
    ['overlap',(tx:Memory)=>{tx.rows.get('time_segment:segment-1')!.data.startAt='2026-10-05T11:59:59Z';}],
    ['future',(tx:Memory)=>{tx.rows.get('time_segment:segment-0')!.data.endAt='2026-10-05T17:00:00Z';}],
    ['negative',(tx:Memory)=>{tx.rows.get('time_segment:segment-0')!.data.endAt='2026-10-05T07:59:59Z';}],
    ['malformed',(tx:Memory)=>{tx.rows.get('time_segment:segment-0')!.data.startAt='not-a-date';}],
    ['malformed activity',(tx:Memory)=>{tx.rows.get('time_segment:segment-0')!.data.activity=null;}],
    ['missing active',(tx:Memory)=>{tx.rows.get('shift:shift')!.data.activeSegmentId='missing';}],
    ['two open',(tx:Memory)=>{tx.rows.get('time_segment:segment-0')!.data.endAt=null;}],
    ['header mismatch',(tx:Memory)=>{tx.rows.get('shift:shift')!.data.activity='ON_BREAK';}],
    ['missing work site',(tx:Memory)=>{tx.rows.get('time_segment:segment-0')!.data.siteId=null;}]
  ] as const)('rejects malformed actual timeline: %s',async(_name,change)=>{const f=fixture();change(f.tx);await expect(f.read()).rejects.toMatchObject({code:'INVALID_STATE'});expect(f.tx.writes).toBe(0);});
  it('rejects a foreign employee segment inside an otherwise owned shift without returning peer details',async()=>{
    const f=fixture();f.tx.rows.get('time_segment:segment-0')!.data.employeeId='peer';await expect(f.read()).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
});
