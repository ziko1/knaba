import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {createPrivacyErasureCommands,loadPrivacyErasureSnapshot} from '../apps/api/privacy-erasure.ts';
import {PostgresPrivateBlobStore} from '../packages/storage/index.ts';
import {GPS_DEVICE_METADATA_KINDS,buildGpsMetadataRetentionInventory} from '../packages/domain/privacy-erasure.ts';
import {type Actor,type Data} from '../packages/domain/core.ts';

// Genuine PostgreSQL/transactional adapter coverage. Missing DATABASE_URL is
// NOT_RUN, not deletion/retention acceptance. Every case has an isolated tenant;
// no global truncation or cross-test cleanup runs alongside other PG suites.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
postgres('GPS device metadata versus scoped privacy execution (real PostgreSQL)',()=>{
 let db:Database,engine:Engine,company:string,ownerA:Actor,ownerB:Actor;
 const ids={ownerA:'owner-a',ownerB:'owner-b',subject:'subject',other:'other',legal:'legal',request:'request',message:'message',lease:'lease',review:'review',cursor:'cursor',boot:'boot',payroll:'payroll'};
 const call=(actor:Actor,command:string,input:Data)=>engine.execute(actor,command,{input,idempotency_key:randomUUID()});
 const snapshot=()=>db.transaction(company,'SYNTHETIC_GPS_PRIVACY_QA',tx=>loadPrivacyErasureSnapshot(tx,ids.request));
 const metadataRows=async()=>({current:(await db.query('SELECT kind,id,version,data FROM aggregates WHERE company_id=$1 AND kind=ANY($2::text[]) ORDER BY kind,id',[company,GPS_DEVICE_METADATA_KINDS])).rows,history:(await db.query('SELECT kind,id,version,data,actor_id,created_at FROM aggregate_revisions WHERE company_id=$1 AND kind=ANY($2::text[]) ORDER BY kind,id,version',[company,GPS_DEVICE_METADATA_KINDS])).rows});
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  company=`device-privacy-v4-${randomUUID()}`;engine=new Engine(db,'TEST');engine.registry={...engine.registry,...createPrivacyErasureCommands(db,engine,new PostgresPrivateBlobStore(db))};
  const now=Date.now();
  await db.transaction(company,'SYNTHETIC_GPS_PRIVACY_QA',async tx=>{
   await tx.add('company',{operatingMode:'TEST',synthetic:true},company);
   for(const id of [ids.ownerA,ids.ownerB])await tx.add('user',{active:true,roles:['OWNER'],siteIds:[]},id);
   for(const id of [ids.subject,ids.other])await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:[]},id);
   await tx.add('legal_approval',{subject:'PRIVACY',status:'APPROVED',active:true,evidenceReference:'SYNTHETIC_PRIVACY_ONLY_NOT_PRODUCTION_APPROVAL',approvedAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+86400000).toISOString(),scope:{erasureCategories:['CHAT'],retentionProfiles:{CHAT:{minDays:0,maxDays:0}}}},ids.legal);
   await tx.add('retention_policy',{category:'CHAT',state:'APPROVED',retentionDays:0,minDays:0,maxDays:0,legalApprovalId:ids.legal,legalApprovalVersion:1,createdBy:ids.ownerA,approvedBy:ids.ownerB,approvedAt:new Date(now-30000).toISOString()},'chat-policy');
   await tx.add('privacy_request',{type:'ERASURE',categories:['CHAT'],subjectUserId:ids.subject,state:'AWAITING_ERASURE_EXECUTION',legalApprovalId:ids.legal,legalApprovalVersion:1},ids.request);
   await tx.add('message',{author_id:ids.subject,channel_id:'synthetic-channel',text:'SYNTHETIC_PRIVATE_SOURCE',attachment_ids:[]},ids.message);
   const authority={employeeId:ids.subject,deviceId:'device',shiftId:'shift',policyVersionId:'gps-policy'};
   await tx.add('tracking_session',{...authority,source:'SERVER',active:false,issuedAt:new Date(now-900000).toISOString(),expiresAt:new Date(now-1).toISOString(),revocationReason:'SHIFT_ENDED'},ids.lease);
   await tx.add('device_event_review',{...authority,trackingSessionId:ids.lease,eventId:'reviewed-event',reason:'DEVICE_CLOCK_SHIFT',state:'REVIEW',coordinatesStored:false,isFraudFinding:false},ids.review);
   await tx.add('device_event_cursor',{employeeId:ids.subject,deviceId:'device',trackingSessionId:ids.lease,sequenceNumber:5,coordinatesStored:false},ids.cursor);
   await tx.add('device_boot_cursor',{employeeId:ids.subject,deviceId:'device',trackingSessionId:ids.lease,monotonicElapsedMs:4000,coordinatesStored:false},ids.boot);
   await tx.add('payroll_calculation',{employeeId:ids.subject,grossCents:12345,state:'ACCOUNTANT_VERIFIED'},ids.payroll);
   await tx.query('INSERT INTO audit_log(company_id,actor_id,action,aggregate_kind,aggregate_id,detail) VALUES($1,$2,$3,$4,$5,$6)',[company,ids.subject,'SYNTHETIC_LEASE_AUDIT','tracking_session',ids.lease,JSON.stringify({leaseId:ids.lease,coordinatesStored:false})]);
  });
  [ownerA,ownerB]=await Promise.all([ids.ownerA,ids.ownerB].map(async id=>({...await engine.getActor(id,company),mfaVerified:true})));
 });
 afterAll(async()=>{await db?.close();});

 it('actually erases chat current/history while leaving exact GPS authority/history, payroll and existing audit rows intact',async()=>{
  const before=await metadataRows(),payroll=(await db.query('SELECT data FROM aggregates WHERE company_id=$1 AND kind=$2 AND id=$3',[company,'payroll_calculation',ids.payroll])).rows;
  const audit=(await db.query('SELECT id,actor_id,action,aggregate_kind,aggregate_id,detail FROM audit_log WHERE company_id=$1 ORDER BY id',[company])).rows;
  const p=await call(ownerA,'privacy.erasure.preview',{requestId:ids.request});
  const result=await call(ownerB,'privacy.erasure.confirm',{planId:p.planId,confirmedHash:p.planHash});
  expect(result).toMatchObject({sourceDataDeleted:true,requestFulfilled:false,fullLegalDsarFulfillment:false});
  expect(await metadataRows()).toEqual(before);expect((await db.query('SELECT data FROM aggregates WHERE company_id=$1 AND kind=$2 AND id=$3',[company,'payroll_calculation',ids.payroll])).rows).toEqual(payroll);
  expect((await db.query('SELECT id,actor_id,action,aggregate_kind,aggregate_id,detail FROM audit_log WHERE company_id=$1 AND id<=$2 ORDER BY id',[company,audit.at(-1)!.id])).rows).toEqual(audit);
  expect((await db.query("SELECT data FROM aggregates WHERE company_id=$1 AND kind='message'",[company])).rows[0].data.text).toBe('');
  expect(JSON.stringify((await db.query("SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind='message'",[company])).rows)).not.toContain('SYNTHETIC_PRIVATE_SOURCE');
  expect(buildGpsMetadataRetentionInventory(await snapshot(),ids.subject).records).toHaveLength(8);
 });
 it('real dedicated raw-point expiry removes only expired coordinates and preserves lease/review/cursors and immutable metadata history',async()=>{
  const point=randomUUID();await db.transaction(company,'SYNTHETIC_GPS_PRIVACY_QA',tx=>tx.add('location_sample',{employeeId:ids.subject,deviceId:'device',trackingSessionId:ids.lease,siteIds:['site'],latitude:51.23,longitude:6.87,accuracyM:4,expiresAt:new Date(Date.now()-1000).toISOString(),source:'DEVICE'},point));
  const before=await metadataRows(),pointHistory=(await db.query("SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind='location_sample' AND id=$2",[company,point])).rows;
  const purged=await db.query('SELECT knaba_purge_gps($1::timestamptz,500,$2::text) AS count',[new Date().toISOString(),company]);expect(Number(purged.rows[0].count)).toBe(1);
  expect((await db.query('SELECT id FROM gps_points WHERE company_id=$1',[company])).rows).toEqual([]);expect(await metadataRows()).toEqual(before);
  expect((await db.query("SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind='location_sample' AND id=$2",[company,point])).rows).toEqual(pointHistory);
  expect(JSON.stringify(pointHistory)).not.toMatch(/latitude|longitude|51\.23|6\.87/);expect(buildGpsMetadataRetentionInventory(await snapshot(),ids.subject).retentionDecision).toBe('PRESERVE_PENDING_APPROVED_METADATA_CLASS');
 });
 it('fresh SQL review authority after preview invalidates confirmation atomically and preserves chat plus metadata',async()=>{
  const p=await call(ownerA,'privacy.erasure.preview',{requestId:ids.request});
  // Review facts are append-only; a new linked review changes the preview inventory.
  const original=await db.transaction(company,'SYNTHETIC_GPS_PRIVACY_QA',async tx=>{const review=await tx.get('device_event_review',ids.review);await tx.add('device_event_review',{...review.data,eventId:'followup-reviewed-event',sourceReviewId:review.id,reason:'NEW_BUSINESS_REVIEW'},'followup-review');return review;});
  const before=await metadataRows();await expect(call(ownerB,'privacy.erasure.confirm',{planId:p.planId,confirmedHash:p.planHash})).rejects.toMatchObject({code:'VERSION_CONFLICT',details:{reason:'ERASURE_SOURCE_OR_AUTHORITY_CHANGED'}});
  expect(await db.transaction(company,'SYNTHETIC_GPS_PRIVACY_QA',tx=>tx.get('device_event_review',ids.review))).toEqual(original);
  expect(await metadataRows()).toEqual(before);expect((await db.query("SELECT data FROM aggregates WHERE company_id=$1 AND kind='message'",[company])).rows[0].data.text).toBe('SYNTHETIC_PRIVATE_SOURCE');expect((await db.query('SELECT 1 FROM privacy_erasure_manifests WHERE company_id=$1',[company])).rows).toEqual([]);
 });
 it('actual company-scoped snapshot excludes another employee and foreign tenant from lineage inventory',async()=>{
  const foreign=`device-privacy-foreign-${randomUUID()}`;
  await db.transaction(company,'SYNTHETIC_GPS_PRIVACY_QA',tx=>tx.add('device_event_review',{employeeId:ids.other,deviceId:'device',trackingSessionId:ids.lease,privateText:'OTHER_SUBJECT_PRIVATE'},'other-review'));
  await db.transaction(foreign,'SYNTHETIC_GPS_PRIVACY_QA',tx=>tx.add('device_event_review',{employeeId:ids.subject,deviceId:'device',trackingSessionId:ids.lease,privateText:'FOREIGN_TENANT_PRIVATE'},'foreign-review'));
  const result=buildGpsMetadataRetentionInventory(await snapshot(),ids.subject);expect(result.records).toHaveLength(8);expect(JSON.stringify(result)).not.toMatch(/other-review|foreign-review|OTHER_SUBJECT_PRIVATE|FOREIGN_TENANT_PRIVATE/);
  expect((await db.query('SELECT 1 FROM aggregates WHERE company_id=$1',[foreign])).rows).toHaveLength(1);
 });
});
