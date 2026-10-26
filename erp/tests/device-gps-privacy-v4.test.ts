import {describe,expect,it} from 'vitest';
import {type Actor,type Data,type Entity} from '../packages/domain/core.ts';
import {GPS_DEVICE_METADATA_KINDS,buildGpsMetadataRetentionInventory,buildPrivacyErasurePlan,revalidatePrivacyErasurePlan,verifyPrivacyErasure,type ErasureSnapshot,type PrivacyErasurePlan} from '../packages/domain/privacy-erasure.ts';

// Pure domain planning and verification over explicit CPU snapshots. These do
// not prove SQL deletion, lawful retention, provider copies or a full DSAR.
const NOW='2026-10-08T12:00:00.000Z',OLD='2026-07-01T00:00:00.000Z';
const actor:Actor={companyId:'company',userId:'owner',roles:['OWNER'],permissions:['privacy.review','scope.company'],siteIds:[],customerIds:[],warehouseIds:[],mfaVerified:true};
const authority={actor,now:NOW};
const entity=(kind:string,id:string,data:Data,companyId='company',version=1):Entity=>({companyId,kind,id,version,data,createdAt:OLD,updatedAt:OLD});
function fixture():ErasureSnapshot{
 const lease=entity('tracking_session','lease',{employeeId:'subject',deviceId:'device',shiftId:'shift',policyVersionId:'gps-policy',source:'SERVER',issuedAt:OLD,expiresAt:'2026-07-01T00:15:00.000Z',active:false,revocationReason:'SHIFT_ENDED'});
 const rows=[entity('user','subject',{active:true}),entity('message','message',{author_id:'subject',text:'PRIVATE_CHAT_SOURCE_CANARY',attachment_ids:[]}),lease,
  entity('device_event_review','review',{employeeId:'subject',deviceId:'device',shiftId:'shift',policyVersionId:'gps-policy',trackingSessionId:lease.id,eventId:'reordered-event',state:'REVIEW',reason:'DEVICE_CLOCK_SHIFT',coordinatesStored:false,isFraudFinding:false}),
  entity('device_event_cursor','cursor',{employeeId:'subject',deviceId:'device',trackingSessionId:lease.id,sequenceNumber:5,coordinatesStored:false}),
  entity('device_boot_cursor','boot-cursor',{employeeId:'subject',deviceId:'device',trackingSessionId:lease.id,bootSessionId:'boot',monotonicElapsedMs:50_000,coordinatesStored:false}),
  entity('payroll_calculation','payroll',{employeeId:'subject',grossCents:12345,state:'ACCOUNTANT_VERIFIED'})];
 const legalApproval=entity('legal_approval','legal',{subject:'PRIVACY',status:'APPROVED',active:true,evidenceReference:'SYNTHETIC_PRIVACY_APPROVAL_ONLY',approvedAt:OLD,expiresAt:'2027-01-01T00:00:00.000Z',scope:{erasureCategories:['CHAT','MEDIA'],retentionProfiles:{CHAT:{minDays:0,maxDays:0},MEDIA:{minDays:0,maxDays:0}}}});
 return {companyId:'company',request:entity('privacy_request','request',{type:'ERASURE',subjectUserId:'subject',categories:['CHAT'],state:'AWAITING_ERASURE_EXECUTION',legalApprovalId:'legal',legalApprovalVersion:1}),legalApproval,
  policies:['CHAT','MEDIA'].map(category=>entity('retention_policy',`policy-${category}`,{category,retentionDays:0,minDays:0,maxDays:0,state:'APPROVED',legalApprovalId:'legal',legalApprovalVersion:1,createdBy:'owner',approvedBy:'other-owner',approvedAt:OLD})),holds:[],aggregates:rows,
  revisions:rows.filter(r=>r.kind!=='user').map(r=>({companyId:r.companyId,kind:r.kind,id:r.id,version:r.version,data:structuredClone(r.data),createdAt:r.createdAt})),receipts:[],outbox:[],webhookInbox:[]};
}
const inventory=(s=fixture())=>buildGpsMetadataRetentionInventory(s,'subject');
const plan=(s=fixture())=>buildPrivacyErasurePlan(s,authority);
function applyCpuSnapshot(p:PrivacyErasurePlan,s:ErasureSnapshot){
 const after=structuredClone(s);
 for(const action of p.actions){
  if(action.type==='REDACT_AGGREGATE'){const row=after.aggregates.find(r=>r.companyId===action.companyId&&r.kind===action.kind&&r.id===action.id);if(row)row.data=structuredClone(action.replacement!);}
  if(action.type==='REDACT_REVISION'){const row=after.revisions.find(r=>r.companyId===action.companyId&&r.kind===action.kind&&r.id===action.id&&r.version===action.version);if(row)row.data=structuredClone(action.replacement!);}
 }
 return after;
}

describe('GPS device metadata retention inventory (CPU snapshots)',()=>{
 it('enumerates explicit same-subject current/history without applying a raw-point or chat TTL to lease/review evidence',()=>{
  const s=fixture(),before=structuredClone(s),result=inventory(s);
  expect(result).toMatchObject({companyId:'company',subjectUserId:'subject',retentionDecision:'PRESERVE_PENDING_APPROVED_METADATA_CLASS',rawCoordinateDeletion:'SEPARATE_DEDICATED_GPS_PURGE',sourceDataDeleted:false,requestFulfilled:false,fullLegalDsarFulfillment:false});
  expect(result.records).toHaveLength(8);
  for(const kind of GPS_DEVICE_METADATA_KINDS)expect(result.records.filter(r=>r.kind===kind).map(r=>r.storage).sort()).toEqual(['CURRENT','REVISION']);
  expect(result.records.every(r=>r.lineage==='SAME_SUBJECT_SERVER_LEASE'&&r.trackingSessionId==='lease'&&r.coordinateStorageStatus==='COORDINATE_FREE')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_CHAT_SOURCE_CANARY');expect(JSON.stringify(result)).not.toContain('grossCents');expect(s).toEqual(before);
 });
 it('does not infer another employee, missing subject or foreign tenant from a shared lease pointer or device identifier',()=>{
  const s=fixture();s.aggregates.push(entity('device_event_review','other-row',{employeeId:'other',trackingSessionId:'lease',deviceId:'device',secret:'OTHER_SUBJECT_CANARY'}),entity('device_boot_cursor','missing-subject',{trackingSessionId:'lease',deviceId:'device',secret:'MISSING_SUBJECT_CANARY'}),entity('device_event_cursor','foreign-row',{employeeId:'subject',deviceId:'device',trackingSessionId:'lease',secret:'FOREIGN_TENANT_CANARY'},'foreign'));
  s.revisions.push(...s.aggregates.slice(-3).map(r=>({companyId:r.companyId,kind:r.kind,id:r.id,version:1,data:r.data})));
  const result=inventory(s);expect(result.records).toHaveLength(8);expect(JSON.stringify(result)).not.toMatch(/other-row|missing-subject|foreign-row|CANARY/);
 });
 it.each(['employee','device','shift','policy','source','absent'])('marks %s lease mismatch unverified without exporting linked lease identity or data',(change)=>{
  const s=fixture(),lease=s.aggregates.find(r=>r.id==='lease')!;
  if(change==='employee')lease.data.employeeId='other';
  if(change==='device')lease.data.deviceId='other-device';
  if(change==='shift')lease.data.shiftId='other-shift';
  if(change==='policy')lease.data.policyVersionId='other-policy';
  if(change==='source')lease.data.source='CLIENT';
  if(change==='absent'){s.aggregates=s.aggregates.filter(r=>r.id!=='lease');s.revisions=s.revisions.filter(r=>r.id!=='lease');}
  lease.data.secret='OTHER_LEASE_CONTENT_CANARY';
  const review=inventory(s).records.find(r=>r.kind==='device_event_review'&&r.storage==='CURRENT')!;
  expect(review.lineage).toBe('UNVERIFIED_LEASE');expect(review).not.toHaveProperty('trackingSessionId');expect(JSON.stringify(review)).not.toContain('CANARY');
 });
 it('preserves own orphan revision evidence and resolves only matching historical server authority',()=>{
  const s=fixture();s.aggregates=s.aggregates.filter(r=>!GPS_DEVICE_METADATA_KINDS.includes(r.kind as any));
  const result=inventory(s);expect(result.records).toHaveLength(4);expect(result.records.every(r=>r.storage==='REVISION'&&r.lineage==='SAME_SUBJECT_SERVER_LEASE')).toBe(true);
  const historicalLease=s.revisions.find(r=>r.id==='lease')!;historicalLease.data.employeeId='other';
  const changed=inventory(s);expect(changed.records).toHaveLength(3);expect(changed.records.every(r=>r.lineage==='UNVERIFIED_LEASE'&&!r.trackingSessionId)).toBe(true);
 });
 it('requires ownership agreement with historical lease snapshots and never rewrites reassigned historical facts',()=>{
  const s=fixture(),before=structuredClone(s);s.revisions.find(r=>r.id==='lease')!.data.employeeId='other';
  expect(inventory(s).records.every(r=>r.lineage==='UNVERIFIED_LEASE')).toBe(true);expect(s.aggregates).toEqual(before.aggregates);expect(s.revisions.find(r=>r.id==='lease')!.data.employeeId).toBe('other');
 });
 it('flags legacy nested coordinate copies for review while returning a coordinate-free projection and preserving original evidence',()=>{
  const s=fixture(),review=s.aggregates.find(r=>r.id==='review')!;review.data.raw={latitude:51.23456789,longitude:6.87654321,accuracyM:3,owner:'LEGACY_RAW_CANARY'};
  const boot=s.revisions.find(r=>r.id==='boot-cursor')!;boot.data.oldGeometry={coordinates:[6.87654321,51.23456789]};
  const result=inventory(s);expect(result.records.filter(r=>r.coordinateStorageStatus==='UNSAFE_COORDINATE_COPY_REQUIRES_REVIEW').map(r=>r.id).sort()).toEqual(['boot-cursor','review']);
  expect(JSON.stringify(result)).not.toMatch(/latitude|longitude|51\.23456789|6\.87654321|LEGACY_RAW_CANARY/);expect(review.data.raw.latitude).toBe(51.23456789);expect(boot.data.oldGeometry.coordinates).toEqual([6.87654321,51.23456789]);
 });
 it('orders inventory deterministically without leaking arbitrary field values or mutating frozen snapshots',()=>{
  const s=fixture(),expected=inventory(s);s.aggregates.reverse();s.revisions.reverse();expect(inventory(s)).toEqual(expected);
  Object.freeze(s.aggregates);Object.freeze(s.revisions);expect(inventory(s)).toEqual(expected);
 });
 it('rejects absent subject/company and bounded oversized inventory before returning personal record identities',()=>{
  const s=fixture();expect(()=>buildGpsMetadataRetentionInventory(s,'')).toThrow('VALIDATION_ERROR');expect(()=>buildGpsMetadataRetentionInventory({...s,companyId:''},'subject')).toThrow('VALIDATION_ERROR');
  s.revisions=Array.from({length:25001},(_,i)=>({companyId:'company',kind:'unrelated',id:String(i),version:1,data:{}}));expect(()=>inventory(s)).toThrow('VALIDATION_ERROR');
 });
});

describe('CHAT/MEDIA erasure excludes GPS device authority and business facts (CPU snapshots)',()=>{
 it('erases only planned chat current/history while preserving old expired lease/cursors/review and payroll evidence',()=>{
  const s=fixture(),p=plan(s),beforeMetadata=inventory(s),after=applyCpuSnapshot(p,s),result=verifyPrivacyErasure(p,after,[]);
  expect(p.actions.map(a=>a.id)).toEqual(['message','message']);expect(p.actions.every(a=>a.kind==='message')).toBe(true);
  expect(inventory(after)).toEqual(beforeMetadata);expect(after.aggregates.filter(r=>r.id!=='message')).toEqual(s.aggregates.filter(r=>r.id!=='message'));expect(after.revisions.filter(r=>r.id!=='message')).toEqual(s.revisions.filter(r=>r.id!=='message'));
  expect(result).toMatchObject({sourceDataDeleted:true,liveSourceStatus:'PURGED_PLANNED_LIVE_SCOPE',requestFulfilled:false,fullLegalDsarFulfillment:false});
 });
 it.each(GPS_DEVICE_METADATA_KINDS)('requires fresh preview when current %s authority changes',(kind)=>{
  const s=fixture(),p=plan(s),row=s.aggregates.find(r=>r.kind===kind)!;row.data.reason='CURRENT_AUTHORITY_CHANGED';row.version++;
  expect(()=>revalidatePrivacyErasurePlan(p,s,authority,p.planHash)).toThrow('VERSION_CONFLICT');
 });
 it.each(GPS_DEVICE_METADATA_KINDS)('requires fresh preview when historical %s evidence changes',(kind)=>{
  const s=fixture(),p=plan(s);s.revisions.find(r=>r.kind===kind)!.data.reviewEvidence='HISTORICAL_AUTHORITY_CHANGED';
  expect(()=>revalidatePrivacyErasurePlan(p,s,authority,p.planHash)).toThrow('VERSION_CONFLICT');
 });
 it.each(GPS_DEVICE_METADATA_KINDS)('preserves source attached to current or historical %s evidence instead of blindly severing business provenance',(kind)=>{
  for(const storage of ['current','historical']){
   const s=fixture(),rows=storage==='current'?s.aggregates:s.revisions;rows.find(r=>r.kind===kind)!.data.sourceMessageId='message';
   const p=plan(s);expect(p.actions).toEqual([]);expect(p.retained).toContainEqual({kind:'message',id:'message',category:'CHAT',reason:'BUSINESS_RECORD_LINK_REQUIRES_REVIEW'});
  }
 });
 it('does not delete private media bytes when a lease/review historical fact holds the media provenance',()=>{
  const s=fixture();s.request.data.categories=['MEDIA'];s.aggregates.push(entity('media_asset','evidence-photo',{uploadedBy:'subject',blobKey:'evidence-blob',sha256:'a'.repeat(64)}));s.revisions.find(r=>r.kind==='device_event_review')!.data.evidence={mediaId:'evidence-photo'};
  const p=plan(s);expect(p.actions).toEqual([]);expect(p.retained).toContainEqual({kind:'media_asset',id:'evidence-photo',category:'MEDIA',reason:'BUSINESS_RECORD_LINK_REQUIRES_REVIEW'});
 });
 it('does not authorize GPS metadata deletion through a CHAT/MEDIA planner even with GPS named in an approval',()=>{
  const s=fixture();s.request.data.categories=['GPS'];s.legalApproval.data.scope.erasureCategories.push('GPS');
  expect(()=>plan(s)).toThrow('NEEDS_APPROVAL');expect(inventory(s).sourceDataDeleted).toBe(false);
 });
 it('ignores foreign-tenant metadata when checking exact preview stability and source protection',()=>{
  const s=fixture(),p=plan(s);s.aggregates.push(entity('tracking_session','foreign-lease',{employeeId:'subject',sourceMessageId:'message',secret:'FOREIGN_CANARY'},'foreign'));
  expect(revalidatePrivacyErasurePlan(p,s,authority,p.planHash).planHash).toBe(p.planHash);expect(inventory(s).records).toHaveLength(8);
 });
 it('preserves and fingerprints manual offline TIME review facts without misclassifying them as GPS metadata',()=>{
  const s=fixture(),manual=entity('manual_device_event','manual-review',{employeeId:'subject',deviceId:'device',shiftId:'shift',siteId:'site',command:'shift.break_start',eventId:'manual-event',inputSnapshot:{shiftId:'shift',observedAt:OLD},state:'REVIEW',coordinatesStored:false,isFraudFinding:false});s.aggregates.push(manual);s.revisions.push({companyId:'company',kind:manual.kind,id:manual.id,version:1,data:structuredClone(manual.data)});
  const p=plan(s);expect(p.actions.some(action=>action.id===manual.id)).toBe(false);expect(inventory(s).records.some(record=>record.id===manual.id)).toBe(false);
  manual.data.reviewReason='CURRENT_TIME_REVIEW_CHANGED';expect(()=>revalidatePrivacyErasurePlan(p,s,authority,p.planHash)).toThrow('VERSION_CONFLICT');
  const fresh=plan(s);s.revisions.find(row=>row.id===manual.id)!.data.reviewReason='HISTORICAL_TIME_REVIEW_CHANGED';expect(()=>revalidatePrivacyErasurePlan(fresh,s,authority,fresh.planHash)).toThrow('VERSION_CONFLICT');
 });
});
