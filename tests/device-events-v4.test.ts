import {describe,it,expect} from 'vitest';
import {authorizeNativeEvent} from '../packages/domain/device-events.ts';
import {gpsAcknowledgement} from '../packages/domain/gps.ts';
import {operationsCommands} from '../packages/domain/operations.ts';
import {DomainError,type CommandContext,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';

// Actual shared guard on explicit CPU transaction doubles, not SQL/OS/GPS proof.
class Tx implements Transaction{
  rows=new Map<string,Entity>();events:{type:string;data:Data}[]=[];
  async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{const row=this.rows.get(`${kind}:${id}`);if(!row)throw new DomainError('NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;}
  async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{return [...this.rows.values()].filter(e=>e.kind===kind).map(e=>structuredClone(e)) as Entity<T>[];}
  async add<T extends Data=Data>(kind:string,data:T,id=`${kind}-${this.rows.size}`):Promise<Entity<T>>{const row={id,kind,companyId:'company',data:structuredClone(data),version:1,createdAt:date(0),updatedAt:date(0)};this.rows.set(`${kind}:${id}`,row);return structuredClone(row);}
  async save(row:Entity,data:Data){return this.add(row.kind,data,row.id);}
  async event(type:string,data:Data){this.events.push({type,data:structuredClone(data)});}
}
const epoch=Date.parse('2026-10-08T10:00:00Z'),date=(seconds:number)=>new Date(epoch+seconds*1000).toISOString();
const BOOT='10000000-0000-4000-8000-000000000001',OTHER_BOOT='10000000-0000-4000-8000-000000000002';
async function fixture(mode='SITE_PRESENCE'){
  const tx=new Tx(),actor={userId:'worker',companyId:'company',roles:['EMPLOYEE'],permissions:['location.self'],siteIds:['site'],warehouseIds:[],customerIds:[]};
  await tx.add('company',{operatingMode:'TEST',synthetic:true},'company');
  const policy=await tx.add('tracking_policy',{enabled:true,state:'APPROVED',expiresAt:date(300000),legalApprovalReference:'legal',necessityApprovalReference:'necessity',worksCouncilReference:'council',employeeNoticeReference:'notice'},'policy');
  for(const [id,subject]of [['legal','GPS_LEGAL_PROCESS'],['necessity','GPS_NECESSITY'],['council','GPS_WORKS_COUNCIL'],['notice','GPS_EMPLOYEE_NOTICE']])await tx.add('legal_approval',{subject,status:'APPROVED',active:true,expiresAt:date(300000)},id);
  const lease=await tx.add('tracking_session',{employeeId:'worker',deviceId:'device',shiftId:'shift',policyVersionId:'policy',geofenceVersionId:'geo',tripId:mode==='BUSINESS_TRAVEL'?'trip':undefined,source:'SERVER',mode,active:true,issuedAt:date(0),expiresAt:date(900)},'lease');
  const ctx:CommandContext={tx,actor,now:date(100),idempotencyKey:'synthetic-v4-device-events',requireSite:()=>{},requireOwn:()=>{}};
  const input={eventId:'event-1',deviceId:'device',shiftId:'shift',siteId:'site',policyVersionId:'policy',geofenceVersionId:'geo',tripId:'trip',trackingSessionId:'lease',bootSessionId:BOOT,monotonicElapsedMs:100000,sequenceNumber:1,observedAt:date(100)};
  const check=(i:Data=input)=>authorizeNativeEvent(ctx,i,mode==='SITE_PRESENCE'?'presence.ingest':'trip.sample',policy,'geo');
  return {tx,ctx,input,lease,policy,check};
}
describe('V4 server issued lease, boot sequence and coordinate-free review (CPU)',()=>{
  it('requires the lease, UUID boot session and nonnegative monotonic envelope before accepting native GPS',()=>{
    const schema=operationsCommands['trip.sample']!.schema;
    const input={eventId:OTHER_BOOT,deviceId:'device',shiftId:'shift',tripId:'trip',sequenceNumber:1,observedAt:date(0),latitude:52.52,longitude:13.4,accuracyM:5,policyVersionId:'policy'};
    expect(()=>schema.parse(input)).toThrow();expect(()=>schema.parse({...input,trackingSessionId:'lease',bootSessionId:'not-uuid',monotonicElapsedMs:1})).toThrow();
    expect(()=>schema.parse({...input,trackingSessionId:'lease',bootSessionId:BOOT,monotonicElapsedMs:-1})).toThrow();expect(schema.parse({...input,trackingSessionId:'lease',bootSessionId:BOOT,monotonicElapsedMs:0})).toMatchObject({eventId:OTHER_BOOT,bootSessionId:BOOT});
  });
  it.each(['employeeId','deviceId','shiftId','policyVersionId'])('rejects a server lease bound to another %s',async field=>{
    const f=await fixture();await f.tx.save(f.lease,{...f.lease.data,[field]:'foreign'});await expect(f.check()).rejects.toMatchObject({code:'ACCESS_DENIED',details:{reason:'FOREIGN_TRACKING_LEASE'}});expect(await f.tx.list('device_event_cursor')).toEqual([]);
  });
  it('rejects the exact lease expiry and a client-forged authority source',async()=>{
    const f=await fixture();f.ctx.now=date(900);await expect(f.check({...f.input,observedAt:date(900)})).rejects.toMatchObject({code:'ACCESS_DENIED',details:{reason:'TRACKING_LEASE_NOT_VALID_AT_EVENT_TIME'}});
    await f.tx.save(f.lease,{...f.lease.data,source:'CLIENT'});await expect(f.check()).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  it('permits a lawful historical point after lease expiry and revocation only before the revocation event time',async()=>{
    const f=await fixture();f.ctx.now=date(5000);await f.tx.save(f.lease,{...f.lease.data,active:false,revokedAt:date(200)});
    expect(await f.check()).toBeUndefined();expect(await f.tx.list('device_event_cursor')).toHaveLength(1);
    await expect(f.check({...f.input,eventId:'event-2',sequenceNumber:2,observedAt:date(200),monotonicElapsedMs:200000})).rejects.toMatchObject({code:'ACCESS_DENIED',details:{reason:'TRACKING_LEASE_REVOKED_AT_EVENT_TIME'}});
  });
  it('withdrawn policy or legal approval closes an unexpired issued lease',async()=>{
    const f=await fixture();f.policy.data.enabled=false;await expect(f.check()).rejects.toMatchObject({code:'ACCESS_DENIED',details:{reason:'CURRENT_TRACKING_POLICY_REVOKED'}});f.policy.data.enabled=true;
    const notice=await f.tx.get('legal_approval','notice');await f.tx.save(notice,{...notice.data,active:false});await expect(f.check()).rejects.toMatchObject({code:'ACCESS_DENIED',details:{reason:'CURRENT_GPS_LEGAL_APPROVAL_REQUIRED'}});
  });
  it('reordered sequence becomes one repeatable review without raw coordinates or a rewritten cursor',async()=>{
    const f=await fixture('BUSINESS_TRAVEL');await f.check();const before=await f.tx.list('device_event_cursor');
    const input={...f.input,eventId:'late',latitude:52.5123456789,longitude:13.4123456789,sequenceNumber:1,observedAt:date(90),monotonicElapsedMs:90000};
    const result=await f.check(input);expect(result).toMatchObject({eventId:'late',accepted:false,status:'REVIEW',reason:'DEVICE_SEQUENCE_REORDERED'});expect(await f.check(input)).toEqual(result);
    expect(gpsAcknowledgement(result!)).toEqual(result);expect(await f.tx.list('device_event_review')).toHaveLength(1);expect(await f.tx.list('device_event_cursor')).toEqual(before);
    expect(JSON.stringify([...f.tx.rows.values(),...f.tx.events])).not.toMatch(/latitude|longitude|52\.5123456789|13\.4123456789/);expect(f.tx.events).toHaveLength(1);
  });
  it('monotonic reset and wall clock shift require review rather than an automatic activity transition',async()=>{
    const f=await fixture();await f.check();f.ctx.now=date(500);
    expect(await f.check({...f.input,eventId:'reset',sequenceNumber:2,observedAt:date(160),monotonicElapsedMs:1})).toMatchObject({status:'REVIEW',reason:'DEVICE_MONOTONIC_OR_TIME_REORDERED'});
    expect(await f.check({...f.input,eventId:'clock',sequenceNumber:3,observedAt:date(400),monotonicElapsedMs:101000})).toMatchObject({status:'REVIEW',reason:'DEVICE_CLOCK_SHIFT'});
    expect(await f.tx.list('time_segment')).toEqual([]);
  });
  it('new boot sessions keep global device sequence while establishing a new monotonic anchor',async()=>{
    const f=await fixture();await f.check();f.ctx.now=date(160);
    expect(await f.check({...f.input,eventId:'reboot',sequenceNumber:2,bootSessionId:OTHER_BOOT,monotonicElapsedMs:100,observedAt:date(160)})).toBeUndefined();expect(await f.tx.list('device_boot_cursor')).toHaveLength(2);
    expect(await f.check({...f.input,eventId:'reboot-old-seq',sequenceNumber:1,bootSessionId:OTHER_BOOT,monotonicElapsedMs:200,observedAt:date(160)})).toMatchObject({status:'REVIEW',reason:'DEVICE_SEQUENCE_REORDERED'});
  });
  it('old geofence authority and future clocks create review; queued unaccepted GPS closes exactly72h',async()=>{
    const f=await fixture();expect(await authorizeNativeEvent(f.ctx,f.input,'presence.ingest',f.policy,'replacement-geo')).toMatchObject({status:'REVIEW',reason:'GEOFENCE_VERSION_CHANGED'});
    expect(await f.check({...f.input,eventId:'future',observedAt:date(101)})).toMatchObject({status:'REVIEW',reason:'DEVICE_CLOCK_FUTURE'});
    f.ctx.now=date(100+72*3600);await expect(f.check({...f.input,eventId:'expired'})).rejects.toMatchObject({code:'ACCESS_DENIED',details:{reason:'GPS_OFFLINE_RETENTION_EXPIRED'}});
  });
});
