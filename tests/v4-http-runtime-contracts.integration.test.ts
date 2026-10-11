import 'reflect-metadata';
import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Request} from 'express';
import {METHOD_METADATA,PATH_METADATA} from '@nestjs/common/constants';
import {RequestMethod} from '@nestjs/common';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {ApiController} from '../apps/api/http.ts';
import {hashToken} from '../apps/api/auth.ts';
import type {Actor,Data} from '../packages/domain/core.ts';

describe('actual Nest route metadata without a listening socket (CPU)',()=>{
 it('binds device/manual batch POST aliases and session/OpenAPI/audit GET handlers before the wildcard POST',()=>{
  expect(Reflect.getMetadata(PATH_METADATA,ApiController)).toBe('api/v1');
  expect(Reflect.getMetadata(PATH_METADATA,ApiController.prototype.mobileEvents)).toEqual(['mobile/events','device-events/batch']);
  expect(Reflect.getMetadata(METHOD_METADATA,ApiController.prototype.mobileEvents)).toBe(RequestMethod.POST);
  for(const [handler,path]of [['mobileSession','mobile/session'],['openapi','openapi.json'],['audit','audit']] as const){expect(Reflect.getMetadata(PATH_METADATA,ApiController.prototype[handler])).toBe(path);expect(Reflect.getMetadata(METHOD_METADATA,ApiController.prototype[handler])).toBe(RequestMethod.GET);}
  expect(Object.getOwnPropertyNames(ApiController.prototype).indexOf('mobileEvents')).toBeLessThan(Object.getOwnPropertyNames(ApiController.prototype).indexOf('v4Command'));
 });
});

// Genuine PostgreSQL + Engine + opaque-bearer AuthService + controller handlers.
// These are not network/browser/device tests. No DATABASE_URL means NOT_RUN.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
postgres('V4 actual HTTP controller/auth/SQL runtime boundaries',()=>{
 let db:Database,engine:Engine,api:ApiController,company:string,worker:Actor,epoch:number;
 const token='SYNTHETIC_V4_HTTP_DEVICE_TOKEN_01234567890123456789';
 const at=(seconds:number)=>new Date(epoch+seconds*1000).toISOString();
 const tick=(seconds:number)=>vi.setSystemTime(new Date(epoch+seconds*1000));
 const request=(query:Data={})=>({get:(name:string)=>name.toLowerCase()==='authorization'?`Bearer ${token}`:undefined,headers:{},ip:'192.0.2.50',query}) as unknown as Request;
 const call=(name:string,input:Data)=>engine.execute(worker,name,{input,idempotency_key:randomUUID()});
 const manual=(command:string,input:Data,eventId:string=randomUUID())=>({command,eventId,input});
 async function rows(kind:string){return (await db.query('SELECT id,data,version FROM aggregates WHERE company_id=$1 AND kind=$2',[company,kind])).rows;}
 async function start(){return call('shift.start',{siteId:'site',deviceId:'device',occurredAt:at(-600)});}
 async function save(kind:string,id:string,patch:Data){return db.transaction(company,'SYNTHETIC_V4_HTTP_PATCH',async tx=>{const row=await tx.get(kind,id);return tx.save(row,{...row.data,...patch});});}
 function point(session:Data,shiftId:string,offset=0){return {command:'presence.ingest',input:{eventId:randomUUID(),deviceId:'device',shiftId,siteId:'site',policyVersionId:'policy',trackingSessionId:session.trackingSessionId,geofenceVersionId:'fence',bootSessionId:randomUUID(),monotonicElapsedMs:Math.max(0,offset*1000),sequenceNumber:1,observedAt:at(offset),distanceM:400,accuracyM:5,source:'NATIVE_LOCATION'}};}
 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
  company='v4-http-runtime-qa-'+randomUUID();epoch=Date.now();vi.useFakeTimers({toFake:['Date']});tick(0);
  await db.transaction(company,'SYNTHETIC_V4_HTTP_FIXTURE',async tx=>{
   await tx.add('company',{operatingMode:'TEST',synthetic:true},company);
   await tx.add('site',{active:true,name:'Synthetic runtime site',geofenceVersionId:'fence'},'site');
   await tx.add('geofence',{siteId:'site',algorithmVersion:'GEOFENCE_V1',latitude:52.52,longitude:13.4,radiusEnterM:150,radiusExitM:200,maxAccuracyM:75,maxPointAgeSeconds:120,dwellSeconds:120,minimumSamples:3,maxSampleGapSeconds:90,autoPause:true,autoReturn:true,exceptionZones:[]},'fence');
   await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:['site'],synthetic:true},'worker');
   await tx.add('device',{active:true,employeeId:'worker',platform:'ANDROID',tokenHash:hashToken(token),tokenExpiresAt:at(86400),credentialType:'OPAQUE_BEARER',synthetic:true},'device');
   await tx.add('tracking_policy',{state:'APPROVED',enabled:true,testOnly:true,maxSessionHours:12,retentionDays:1,expiresAt:at(86400),allowPresence:true,allowMinimalReturn:true,allowBusinessRoute:false,accessRoles:['DISPATCHER'],legalApprovalReference:'legal',necessityApprovalReference:'necessity',worksCouncilReference:'council',employeeNoticeReference:'notice'},'policy');
   for(const [id,subject]of [['legal','GPS_LEGAL_PROCESS'],['necessity','GPS_NECESSITY'],['council','GPS_WORKS_COUNCIL'],['notice','GPS_EMPLOYEE_NOTICE']])await tx.add('legal_approval',{subject,status:'APPROVED',active:true,testOnly:true,expiresAt:at(86400)},id);
  });
  worker=await engine.getActor('worker',company);api=new ApiController({db,engine,companyId:company,appMode:'TEST',buildSha:'0'.repeat(40),publicOrigin:'https://synthetic-runtime.invalid',encryptionKey:'SYNTHETIC_RUNTIME_CURSOR_AUTH_KEY_0123456789'});
 });
 afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});afterAll(async()=>{await db?.close();});
 it('issues actual SERVER leases with correct authority and gives each renewal a new retained lease ID',async()=>{
  const shift=await start(),session:Data=await api.mobileSession(request());
  expect(session).toMatchObject({mode:'SITE_PRESENCE',shiftId:shift.id,deviceId:'device',employeeId:'worker',policyVersionId:'policy',geofenceVersionId:'fence',expiresAt:at(900)});
  expect(session.siteGeofence).toMatchObject({algorithmVersion:'GEOFENCE_V1',minimumSamples:3,maxSampleGapSeconds:90});
  expect((await rows('tracking_session'))[0]!.data).toMatchObject({source:'SERVER',employeeId:'worker',deviceId:'device',shiftId:shift.id,siteId:'site',mode:'SITE_PRESENCE',issuedAt:at(0),expiresAt:at(900),active:true});
  tick(300);const renewed:Data=await api.mobileSession(request());expect(renewed.trackingSessionId).not.toBe(session.trackingSessionId);expect(renewed.expiresAt).toBe(at(1200));expect(await rows('tracking_session')).toHaveLength(2);
 });
 it('does not issue leases for missing active approval, disabled policy or superseded policy',async()=>{
  await start();await save('legal_approval','legal',{active:null});expect(await api.mobileSession(request())).toMatchObject({mode:'OFF',reason:'GPS_LEGAL_GATE_CLOSED'});expect(await rows('tracking_session')).toEqual([]);
  await save('legal_approval','legal',{active:true});await save('tracking_policy','policy',{disabledAt:at(-1)});expect(await api.mobileSession(request())).toMatchObject({mode:'OFF',reason:'GPS_LEGAL_GATE_CLOSED'});
  await save('tracking_policy','policy',{disabledAt:null,supersededAt:at(-1)});expect(await api.mobileSession(request())).toMatchObject({mode:'OFF',reason:'GPS_LEGAL_GATE_CLOSED'});expect(await rows('tracking_session')).toEqual([]);
 });
 it('synthetic GPS approval never activates a production company',async()=>{
  await start();await save('company',company,{operatingMode:'PRODUCTION'});expect(await api.mobileSession(request())).toMatchObject({mode:'OFF',reason:'GPS_LEGAL_GATE_CLOSED'});expect(await rows('tracking_session')).toEqual([]);expect((await db.query('SELECT id FROM gps_points WHERE company_id=$1',[company])).rows).toEqual([]);
 });
 it('manual START/END and their duplicates work with no GPS policy or tracking lease',async()=>{
  await db.query("DELETE FROM aggregates WHERE company_id=$1 AND kind IN ('tracking_policy','legal_approval')",[company]);
  const begin=manual('shift.start',{siteId:'site',deviceId:'device',occurredAt:at(-600)}),started=await api.mobileEvents(request(),{events:[begin]});expect(started.results[0]!.status).toBe('ACCEPTED');
  const shiftId=started.results[0]!.result.id;expect((await api.mobileEvents(request(),{events:[begin]})).results[0]!.result.id).toBe(shiftId);
  const end=manual('shift.end',{shiftId,occurredAt:at(0)});await api.mobileEvents(request(),{events:[end]});await api.mobileEvents(request(),{events:[end]});
  expect(await rows('shift')).toHaveLength(1);expect((await rows('shift'))[0]!.data).toMatchObject({state:'ENDED',summary:{totalSeconds:600}});expect(await rows('tracking_session')).toEqual([]);
  expect((await db.query("SELECT command FROM command_receipts WHERE company_id=$1 AND command IN ('shift.start','shift.end')",[company])).rows).toHaveLength(2);
 });
 it('rejects an expired GPS observation while preserving the following actual manual END',async()=>{
  const shift=await start(),session=await api.mobileSession(request());tick(900);
  const result=await api.mobileEvents(request(),{events:[point(session,shift.id,900),manual('shift.end',{shiftId:shift.id,occurredAt:at(900)})]});expect(result.results.map(row=>row.status)).toEqual(['REJECTED','ACCEPTED']);
  expect((await rows('shift'))[0]!.data).toMatchObject({state:'ENDED',endAt:at(900)});expect(await rows('presence_event')).toEqual([]);expect((await db.query('SELECT id FROM gps_points WHERE company_id=$1',[company])).rows).toEqual([]);
 });
 it('does not let malformed GPS validation discard a valid independent END fact',async()=>{
  const shift=await start(),session=await api.mobileSession(request()),bad=point(session,shift.id);delete bad.input.trackingSessionId;
  const result=await api.mobileEvents(request(),{events:[bad,manual('shift.end',{shiftId:shift.id,occurredAt:at(0)})]});expect(result.results.map(row=>row.status)).toEqual(['REJECTED','ACCEPTED']);expect(result.results[0]!.code).toBe('VALIDATION_ERROR');expect((await rows('shift'))[0]!.data.state).toBe('ENDED');
 });
 it('preserves a future manual fact for review once, with no time mutation or GPS/credential leakage',async()=>{
  const shift=await start(),event=manual('shift.end',{shiftId:shift.id,occurredAt:at(1000),description:'Synthetic worker future-clock statement'}),before=await rows('time_segment');
  const first=await api.mobileEvents(request(),{events:[event]}),second=await api.mobileEvents(request(),{events:[event]});expect(first.results[0]).toMatchObject({status:'REVIEW',accepted:false,reason:'DEVICE_CLOCK_FUTURE'});expect(second.results).toEqual(first.results);expect(await rows('time_segment')).toEqual(before);expect((await rows('shift'))[0]!.data.state).toBe('ACTIVE');
  const review=await rows('manual_device_event');expect(review).toHaveLength(1);expect(review[0]!.data).toMatchObject({inputSnapshot:event.input,coordinatesStored:false,isFraudFinding:false});expect(JSON.stringify(review)).not.toMatch(/latitude|longitude|tokenHash|token_hash/);
  const changed=await api.mobileEvents(request(),{events:[{...event,input:{...event.input,description:'Changed same UUID fact'}}]});expect(changed.results[0]).toMatchObject({status:'REJECTED',code:'IDEMPOTENCY_CONFLICT'});expect(await rows('manual_device_event')).toHaveLength(1);
 });
 it('refreshes current bearer authority inside actual Engine execution before a stale END receipt or mutation',async()=>{
  const shift=await start(),original=engine.execute.bind(engine);let changed=false;
  vi.spyOn(engine,'execute').mockImplementation(async(actor,name,envelope)=>{if(!changed){changed=true;await save('device','device',{tokenHash:hashToken('SYNTHETIC_REPLACEMENT_TOKEN_01234567890123456789')});}return original(actor,name,envelope);});
  const result=await api.mobileEvents(request(),{events:[manual('shift.end',{shiftId:shift.id,occurredAt:at(0)})]});expect(changed).toBe(true);expect(result.results[0]).toMatchObject({status:'REJECTED',code:'NEEDS_REAUTH'});expect((await rows('shift'))[0]!.data.state).toBe('ACTIVE');expect(await rows('manual_device_event')).toEqual([]);
 });
 it('actual permission-filtered OpenAPI exports strict device batch union and omits upload commands after role revocation',async()=>{
  const first=await api.openapi(request()),batch=first.paths['/api/v1/device-events/batch'].post.requestBody.content['application/json'].schema;
  expect(batch.additionalProperties).toBe(false);expect(batch.properties.events.minItems).toBe(1);expect(batch.properties.events.maxItems).toBe(100);expect(JSON.stringify(batch)).toContain('shift.end');expect(JSON.stringify(batch)).toContain('presence.ingest');expect(first.paths['/api/v1/media/uploads']).toBeDefined();
  await save('user','worker',{roles:['AUDITOR'],permissions:[]});const current=await api.openapi(request());expect(current.paths['/api/v1/media/uploads']).toBeUndefined();expect(current.paths['/api/v1/commands/shift.end']).toBeUndefined();expect(JSON.stringify(current)).not.toContain(token);
 });
 it('actual audit SQL keyset parses correctly and maintains company scope over cursor pages',async()=>{
  // Audit timestamps come from PostgreSQL; let this snapshot follow the committed inserts in real time.
  vi.useRealTimers();
  await start();await save('user','worker',{roles:['AUDITOR'],permissions:[]});
  await db.query("INSERT INTO audit_log(company_id,actor_id,action,detail) VALUES($1,'FOREIGN','PRIVATE_CANARY','{}')",['foreign-'+randomUUID()]);
  const first=await api.audit(request({limit:'1'}));expect(first.items).toHaveLength(1);expect(first.has_more).toBe(true);expect(first.next_cursor).toBeTruthy();
  const second=await api.audit(request({limit:'1',cursor:first.next_cursor}));expect(second.items).toHaveLength(1);expect(second.items[0]!.id).not.toBe(first.items[0]!.id);expect([...first.items,...second.items].every(row=>row.companyId===company&&row.data.action!=='PRIVATE_CANARY')).toBe(true);
 });
 it('trip review access uses route permission/policy while presence-only duty and finance grants cannot read it',async()=>{
  await db.transaction(company,'SYNTHETIC_REVIEW_SCOPE_FIXTURE',async tx=>{
   await tx.add('user',{active:true,roles:['DISPATCHER'],permissions:['location.presence.read','location.history.read'],siteIds:['site']},'dispatcher');
   await tx.add('user',{active:true,roles:['ACCOUNTANT'],siteIds:['site']},'accountant');
   for(const [id,command]of [['presence-review','presence.ingest'],['route-review','trip.sample']])await tx.add('device_event_review',{employeeId:'worker',deviceId:'device',siteId:'site',policyVersionId:'policy',command,state:'REVIEW',coordinatesStored:false},id);
  });
  expect((await engine.readEntities(await engine.getActor('dispatcher',company),'device_event_review')).map(row=>row.id)).toEqual(['presence-review']);expect(await engine.readEntities(await engine.getActor('accountant',company),'device_event_review')).toEqual([]);
  expect((await engine.readEntities(worker,'device_event_review')).map(row=>row.id).sort()).toEqual(['presence-review','route-review']);
 });
});
