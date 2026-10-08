import {createHash} from 'node:crypto';
import {z} from 'zod';
import {assert,id,type CommandContext,type Data,type Entity} from './core.ts';

export const nativeEventAuthoritySchema={trackingSessionId:id,bootSessionId:z.string().uuid(),monotonicElapsedMs:z.number().int().nonnegative().safe()};
export type DeviceEventReview={eventId:string;accepted:false;status:'REVIEW';reason:string;reviewId:string};
const key=(parts:string[])=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const time=(value:unknown)=>typeof value==='string'?Date.parse(value):NaN;

/** Coordinate-free reconciliation. Review never persists the supplied raw GPS payload. */
export async function nativeEventReview(ctx:CommandContext,input:Data,command:string,reason:string):Promise<DeviceEventReview>{
  const reviewId=key(['device-event-review',command,input.eventId]);
  let row=(await ctx.tx.list('device_event_review')).find(e=>e.id===reviewId);
  if(row){assert(row.data.employeeId===ctx.actor.userId&&row.data.deviceId===input.deviceId,'ACCESS_DENIED');}
  else{
    const lease=await ctx.tx.get('tracking_session',input.trackingSessionId);
    row=await ctx.tx.add('device_event_review',{eventId:input.eventId,command,employeeId:ctx.actor.userId,deviceId:input.deviceId,shiftId:input.shiftId,siteId:lease.data.siteId??(command==='presence.ingest'?input.siteId:undefined),trackingSessionId:input.trackingSessionId,bootSessionId:input.bootSessionId,monotonicElapsedMs:input.monotonicElapsedMs,sequenceNumber:input.sequenceNumber,observedAt:input.observedAt,receivedAt:ctx.now,policyVersionId:input.policyVersionId,state:'REVIEW',reason,coordinatesStored:false,isFraudFinding:false},reviewId);
    await ctx.tx.event('device.event_review_requested',{reviewId,eventId:input.eventId,employeeId:ctx.actor.userId,deviceId:input.deviceId,shiftId:input.shiftId,reason,coordinatesStored:false,isFraudFinding:false});
  }
  return {eventId:input.eventId,accepted:false,status:'REVIEW',reason:row.data.reason,reviewId:row.id};
}

/** Actual server-issued event-time authority plus monotonic/sequence fencing. */
export async function authorizeNativeEvent(ctx:CommandContext,input:Data,command:'presence.ingest'|'trip.sample',policy:Entity,geofenceVersionId?:string,alreadyAccepted=false):Promise<DeviceEventReview|undefined>{
  const lease=await ctx.tx.get('tracking_session',input.trackingSessionId),at=time(input.observedAt),now=time(ctx.now);
  assert(lease.companyId===ctx.actor.companyId&&lease.data.source==='SERVER'&&lease.data.employeeId===ctx.actor.userId&&lease.data.deviceId===input.deviceId&&lease.data.shiftId===input.shiftId&&lease.data.policyVersionId===input.policyVersionId,'ACCESS_DENIED',{reason:'FOREIGN_TRACKING_LEASE'});
  const issued=time(lease.data.issuedAt),expires=time(lease.data.expiresAt),revoked=time(lease.data.revokedAt);
  assert(Number.isFinite(issued)&&Number.isFinite(expires)&&expires>issued&&expires-issued<=900_000&&at>=issued&&at<expires,'ACCESS_DENIED',{reason:'TRACKING_LEASE_NOT_VALID_AT_EVENT_TIME'});
  assert(lease.data.active===true&&!lease.data.revokedAt||Number.isFinite(revoked)&&at<revoked,'ACCESS_DENIED',{reason:'TRACKING_LEASE_REVOKED_AT_EVENT_TIME'});
  assert(policy.data.enabled===true&&policy.data.state==='APPROVED'&&time(policy.data.expiresAt)>now&&!policy.data.disabledAt&&!policy.data.supersededAt,'ACCESS_DENIED',{reason:'CURRENT_TRACKING_POLICY_REVOKED'});
  for(const [reference,subject]of [[policy.data.legalApprovalReference,'GPS_LEGAL_PROCESS'],[policy.data.necessityApprovalReference,'GPS_NECESSITY'],[policy.data.worksCouncilReference,'GPS_WORKS_COUNCIL'],[policy.data.employeeNoticeReference,'GPS_EMPLOYEE_NOTICE']]){
    assert(typeof reference==='string','ACCESS_DENIED',{reason:'CURRENT_GPS_LEGAL_APPROVAL_REQUIRED'});
    const approval=await ctx.tx.get('legal_approval',reference);
    assert(approval.companyId===ctx.actor.companyId&&approval.data.subject===subject&&approval.data.status==='APPROVED'&&approval.data.active===true&&time(approval.data.expiresAt)>now,'ACCESS_DENIED',{reason:'CURRENT_GPS_LEGAL_APPROVAL_REQUIRED'});
    if(approval.data.testOnly){const company=await ctx.tx.get('company',ctx.actor.companyId);assert(['TEST','DEMO'].includes(company.data.operatingMode),'ACCESS_DENIED',{reason:'SYNTHETIC_APPROVAL_PRODUCTION_FORBIDDEN'});}
  }
  if(!alreadyAccepted)assert(now-at<72*3600_000,'ACCESS_DENIED',{reason:'GPS_OFFLINE_RETENTION_EXPIRED'});
  const mode=command==='presence.ingest'?'SITE_PRESENCE':'BUSINESS_TRAVEL';
  assert(lease.data.mode===mode,'ACCESS_DENIED',{reason:'TRACKING_LEASE_MODE_MISMATCH'});
  if(command==='trip.sample')assert(lease.data.tripId===input.tripId,'ACCESS_DENIED',{reason:'TRACKING_LEASE_TRIP_MISMATCH'});
  else{
    assert(lease.data.geofenceVersionId===input.geofenceVersionId,'ACCESS_DENIED',{reason:'TRACKING_LEASE_GEOFENCE_MISMATCH'});
    if(input.geofenceVersionId!==geofenceVersionId)return nativeEventReview(ctx,input,command,'GEOFENCE_VERSION_CHANGED');
  }
  const priorReview=(await ctx.tx.list('device_event_review')).find(e=>e.id===key(['device-event-review',command,input.eventId]));
  if(priorReview)return nativeEventReview(ctx,input,command,priorReview.data.reason);
  if(at>now)return nativeEventReview(ctx,input,command,'DEVICE_CLOCK_FUTURE');
  if(alreadyAccepted)return undefined;
  const deviceId=key(['device-event-sequence',input.deviceId]),bootId=key(['device-boot-sequence',input.deviceId,input.bootSessionId]);
  const device=(await ctx.tx.list('device_event_cursor')).find(e=>e.id===deviceId),boot=(await ctx.tx.list('device_boot_cursor')).find(e=>e.id===bootId);
  if(device&&input.sequenceNumber<=device.data.sequenceNumber)return nativeEventReview(ctx,input,command,'DEVICE_SEQUENCE_REORDERED');
  if(boot){
    if(input.monotonicElapsedMs<=boot.data.monotonicElapsedMs||at<=time(boot.data.observedAt))return nativeEventReview(ctx,input,command,'DEVICE_MONOTONIC_OR_TIME_REORDERED');
    if(Math.abs((at-time(boot.data.observedAt))-(input.monotonicElapsedMs-boot.data.monotonicElapsedMs))>120_000)return nativeEventReview(ctx,input,command,'DEVICE_CLOCK_SHIFT');
  }
  const data={employeeId:ctx.actor.userId,deviceId:input.deviceId,bootSessionId:input.bootSessionId,trackingSessionId:input.trackingSessionId,sequenceNumber:input.sequenceNumber,monotonicElapsedMs:input.monotonicElapsedMs,observedAt:input.observedAt,receivedAt:ctx.now,coordinatesStored:false};
  if(device)await ctx.tx.save(device,data);else await ctx.tx.add('device_event_cursor',data,deviceId);
  if(boot)await ctx.tx.save(boot,data);else await ctx.tx.add('device_boot_cursor',data,bootId);
}
