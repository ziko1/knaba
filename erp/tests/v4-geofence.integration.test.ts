import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import type {Actor,Data} from '../packages/domain/core.ts';

// Real authoritative SQL/Engine effects in an isolated synthetic tenant.
// No DATABASE_URL means NOT_RUN, never a PostgreSQL or physical-GPS pass.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
postgres('V4 geofence actual PostgreSQL transaction and immutable time boundaries',()=>{
  let db:Database,engine:Engine,company:string,owner:Actor,worker:Actor,shiftId:string,epoch:number;
  const call=(actor:Actor,name:string,input:Data,key=randomUUID())=>engine.execute(actor,name,{input,idempotency_key:key});
  const at=(offset:number)=>new Date(epoch+offset*1000).toISOString();
  const tick=(offset:number)=>vi.setSystemTime(new Date(epoch+offset*1000));
  const bootSessionId='10000000-0000-4000-8000-000000000001';let geofenceVersionId:string,trackingSessionId:string;
  async function presence(offset:number,sequenceNumber:number,distanceM=400,accuracyM=5,eventId=randomUUID()){
    tick(offset);return call(worker,'presence.ingest',{eventId,deviceId:'device',shiftId,siteId:'site',geofenceVersionId,trackingSessionId,bootSessionId,monotonicElapsedMs:offset*1000,policyVersionId:'policy',sequenceNumber,observedAt:at(offset),distanceM,accuracyM,source:'NATIVE_LOCATION'});
  }
  beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
  beforeEach(async()=>{
    company='v4-geofence-qa-'+randomUUID();epoch=Date.now();
    vi.useFakeTimers({toFake:['Date']});tick(0);
    await db.transaction(company,'SYNTHETIC_V4_GEOFENCE_FIXTURE',async tx=>{
      await tx.add('company',{name:'Synthetic V4 geo QA',operatingMode:'TEST',synthetic:true},company);
      await tx.add('site',{active:true,name:'Synthetic assigned site'},'site');
      await tx.add('user',{active:true,roles:['OWNER'],permissions:['location.policy.manage'],siteIds:['site']},'owner');
      await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:['site']},'worker');
      await tx.add('device',{active:true,employeeId:'worker',platform:'ANDROID',synthetic:true},'device');
      await tx.add('tracking_policy',{state:'APPROVED',enabled:true,synthetic:true,testOnly:true,revision:1,approvedAt:at(-3600),expiresAt:at(86400),retentionDays:1,maxSessionHours:12,allowPresence:true,allowMinimalReturn:true,allowBusinessRoute:false,accessRoles:['OWNER'],legalApprovalReference:'gps-legal',necessityApprovalReference:'gps-necessity',worksCouncilReference:'gps-council',employeeNoticeReference:'gps-notice'},'policy');
      for(const [id,subject]of [['gps-legal','GPS_LEGAL_PROCESS'],['gps-necessity','GPS_NECESSITY'],['gps-council','GPS_WORKS_COUNCIL'],['gps-notice','GPS_EMPLOYEE_NOTICE']])await tx.add('legal_approval',{subject,status:'APPROVED',active:true,testOnly:true,expiresAt:at(86400)},id);
    });
    owner=await engine.getActor('owner',company);worker=await engine.getActor('worker',company);
    geofenceVersionId=(await call(owner,'geofence.configure',{siteId:'site',latitude:52.52,longitude:13.4,autoPause:true,autoReturn:true})).id;
    shiftId=(await call(worker,'shift.start',{siteId:'site',deviceId:'device',occurredAt:at(-600)})).id;
    trackingSessionId=randomUUID();await db.transaction(company,'SYNTHETIC_ISSUED_LEASE',tx=>tx.add('tracking_session',{employeeId:'worker',deviceId:'device',shiftId,policyVersionId:'policy',geofenceVersionId,mode:'SITE_PRESENCE',source:'SERVER',active:true,issuedAt:at(0),expiresAt:at(900)},trackingSessionId));
  });
  afterEach(()=>vi.useRealTimers());afterAll(async()=>{await db?.close();});
  async function rows(kind:string){return (await db.query('SELECT id,version,data FROM aggregates WHERE company_id=$1 AND kind=$2',[company,kind])).rows;}
  it('commits a third-point confirmed pause, source event, immutable revision, audit and one outbox effect at confirmed_at',async()=>{
    await presence(0,1);await presence(60,2);
    expect((await rows('shift'))[0].data.activity).toBe('WORKING');expect(await rows('location_incident')).toEqual([]);
    await presence(120,3);
    const shift=(await rows('shift'))[0],segments=await rows('time_segment'),incident=(await rows('location_incident'))[0];
    expect(shift.data.activity).toBe('AWAY_PENDING_REASON');
    expect(segments.find(s=>s.data.activity==='WORKING')!.data.endAt).toBe(at(120));expect(segments.find(s=>s.data.activity==='AWAY_PENDING_REASON')!.data.startAt).toBe(at(120));
    expect(incident.data).toMatchObject({employeeId:'worker',siteId:'site',shiftId,state:'OPEN',observedAt:at(0),confirmedAt:at(120)});
    const effects=(await db.query("SELECT data FROM outbox WHERE company_id=$1 AND type='absence.explanation_requested'",[company])).rows;
    expect(effects).toHaveLength(1);expect(effects[0].data).toMatchObject({incidentId:incident.id,shiftId,employeeId:'worker',siteId:'site'});
    expect((await db.query("SELECT count(*)::int AS n FROM aggregate_revisions WHERE company_id=$1 AND kind='time_segment'",[company])).rows[0].n).toBeGreaterThan(2);
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE company_id=$1 AND action='COMMAND:presence.ingest'",[company])).rows[0].n).toBe(3);
    expect(JSON.stringify(await rows('presence_event'))).not.toMatch(/latitude|longitude/);
  });
  it('a two-minute gap restarts the candidate; duplicate event delivery cannot duplicate time or incident effects',async()=>{
    await presence(0,1);const interrupted=await presence(120,2);expect(interrupted.presence.data).toMatchObject({candidateCount:1,state:'UNKNOWN'});
    await presence(180,3);expect((await rows('shift'))[0].data.activity).toBe('WORKING');
    const eventId=randomUUID();await presence(240,4,400,5,eventId);await presence(240,4,400,5,eventId);
    expect(await rows('location_incident')).toHaveLength(1);expect((await rows('time_segment')).filter(s=>s.data.activity==='AWAY_PENDING_REASON')).toHaveLength(1);
    expect((await rows('location_incident'))[0].data.confirmedAt).toBe(at(240));
    expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='absence.explanation_requested'",[company])).rows).toHaveLength(1);
  });
  it('private event-time coordinates remain denied and a revoked device cannot finish the old observation window',async()=>{
    await presence(0,1);tick(60);await call(worker,'shift.activity',{shiftId,activity:'ON_BREAK',occurredAt:at(60)});
    await expect(presence(90,2)).rejects.toMatchObject({code:'ACCESS_DENIED',details:{reason:'PRIVATE_OR_OFF_DUTY_EVENT_TIME'}});
    expect((await rows('shift'))[0].data.activity).toBe('ON_BREAK');expect(await rows('location_incident')).toEqual([]);
    await db.transaction(company,'SYNTHETIC_REVOKE',async tx=>{const device=await tx.get('device','device');await tx.save(device,{...device.data,active:false,revokedAt:at(90)});});
    await expect(presence(120,3)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await rows('presence_event')).toHaveLength(1);
  });
  it('expired lease rejects at the exact boundary without writing a point or a time transition',async()=>{
    await presence(0,1);await expect(presence(900,2)).rejects.toMatchObject({code:'ACCESS_DENIED',details:{reason:'TRACKING_LEASE_NOT_VALID_AT_EVENT_TIME'}});
    expect(await rows('presence_event')).toHaveLength(1);expect(await rows('location_incident')).toEqual([]);expect((await rows('shift'))[0].data.activity).toBe('WORKING');
    expect((await db.query('SELECT id FROM gps_points WHERE company_id=$1',[company])).rows).toEqual([]);
  });
  it('reordered boot sequence commits a coordinate-free review and receipt, with no automatic pause',async()=>{
    await presence(0,3);const reviewed=await presence(60,2);
    expect(reviewed).toMatchObject({status:'REVIEW',accepted:false,reason:'DEVICE_SEQUENCE_REORDERED'});
    const reviews=await rows('device_event_review');expect(reviews).toHaveLength(1);expect(reviews[0].data).toMatchObject({state:'REVIEW',coordinatesStored:false,isFraudFinding:false});
    expect(await rows('presence_event')).toHaveLength(1);expect(await rows('location_incident')).toEqual([]);expect((await rows('shift'))[0].data.activity).toBe('WORKING');
    const receipts=(await db.query("SELECT result FROM command_receipts WHERE company_id=$1 AND command='presence.ingest'",[company])).rows;
    expect(receipts.some(r=>r.result.status==='REVIEW'&&r.result.accepted===false)).toBe(true);expect(JSON.stringify([...reviews,...receipts])).not.toMatch(/latitude|longitude/);
  });
  it('a manual WORKING fact at the same timestamp cannot be replaced by a completing geofence EXIT',async()=>{
    await presence(0,1);await presence(60,2);tick(120);
    await call(worker,'shift.activity',{shiftId,siteId:'site',activity:'WORKING',occurredAt:at(120),reason:'Synthetic explicit manual time fact'});
    expect(await presence(120,3)).toMatchObject({status:'REVIEW',reason:'MANUAL_COMMAND_HAS_PRIORITY',accepted:false});
    expect((await rows('shift'))[0].data.activity).toBe('WORKING');expect(await rows('location_incident')).toEqual([]);
    expect((await rows('time_segment')).some(s=>s.data.activity==='AWAY_PENDING_REASON')).toBe(false);
  });
  it('lawful pre-END travel coordinates can sync after expired and revoked lease without changing immutable time history',async()=>{
    await db.transaction(company,'SYNTHETIC_ALLOW_ROUTE',async tx=>{const policy=await tx.get('tracking_policy','policy');await tx.save(policy,{...policy.data,allowBusinessRoute:true});});
    tick(10);const trip=await call(worker,'trip.start',{shiftId,destination:{kind:'SITE',id:'site'},purpose:'Synthetic approved route',occurredAt:at(10)});
    const routeLease=randomUUID();await db.transaction(company,'SYNTHETIC_ROUTE_LEASE',tx=>tx.add('tracking_session',{employeeId:'worker',deviceId:'device',shiftId,tripId:trip.id,policyVersionId:'policy',mode:'BUSINESS_TRAVEL',source:'SERVER',active:false,issuedAt:at(10),expiresAt:at(910),revokedAt:at(200)},routeLease));
    tick(200);await call(worker,'trip.arrive',{tripId:trip.id,startWork:true,occurredAt:at(200)});tick(300);await call(worker,'shift.end',{shiftId,occurredAt:at(300)});
    const history=(await db.query("SELECT kind,id,version,data FROM aggregate_revisions WHERE company_id=$1 AND kind IN ('shift','time_segment','time_event') ORDER BY kind,id,version",[company])).rows;
    const input={eventId:randomUUID(),deviceId:'device',shiftId,tripId:trip.id,policyVersionId:'policy',trackingSessionId:routeLease,bootSessionId,monotonicElapsedMs:100000,sequenceNumber:1,observedAt:at(100),latitude:52.520123,longitude:13.400456,accuracyM:5};
    tick(1500);const accepted=await call(worker,'trip.sample',input);expect(accepted).toMatchObject({accepted:true,eventId:input.eventId});
    expect((await db.query('SELECT id FROM gps_points WHERE company_id=$1',[company])).rows).toHaveLength(1);
    await expect(call(worker,'trip.sample',{...input,eventId:randomUUID(),sequenceNumber:2,observedAt:at(250),monotonicElapsedMs:250000})).rejects.toMatchObject({code:'ACCESS_DENIED',details:{reason:'PRIVATE_OR_OFF_DUTY_EVENT_TIME'}});
    expect((await db.query("SELECT kind,id,version,data FROM aggregate_revisions WHERE company_id=$1 AND kind IN ('shift','time_segment','time_event') ORDER BY kind,id,version",[company])).rows).toEqual(history);
  });
});
