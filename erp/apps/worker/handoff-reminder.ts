import {createHash} from 'node:crypto';
import type {Database,PgTransaction} from '../api/database.ts';
import type {Engine} from '../api/engine.ts';
import type {OutboxJob} from './runner.ts';
import {assert,DomainError,type Data} from '../../packages/domain/core.ts';
import {queuedHandoff,handoffGeneration,handoffManagerAllowed,handoffCalendarApplies,handoffReminderTitle,cancelHandoffSla} from '../../packages/domain/handoff-calendar.ts';

const processorId='knaba-integration-service';
const fields=['channelId','generation','calendarId','calendarVersion','managerUserId','requestedAt','not_before'] as const;
/** No provider I/O: exactly one minimal notice becomes available in the manager's
 * private web inbox, under the actual lease and current handoff authority. */
export async function processHandoffReminder(db:Database,engine:Engine,job:OutboxJob,now:string){
 assert(job.type==='handoff.manager_reminder'&&job.lease_token&&Number.isFinite(Date.parse(now)),'ACCESS_DENIED');
 return db.transaction(job.company_id,processorId,async(tx:PgTransaction)=>{
  const lock=async()=>{const result=await tx.query("SELECT type,data FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token]);assert(result.rows.length===1,'WORKER_LEASE_LOST');const row=result.rows[0]!,data:Data=typeof row.data==='string'?JSON.parse(row.data):row.data;assert(row.type==='handoff.manager_reminder'&&fields.every(field=>data[field]===job.data[field]),'ACCESS_DENIED');return data;};
  const data=await lock(),service=await engine.actorIn(tx,processorId);assert(service.companyId===job.company_id&&service.roles.includes('SERVICE_ACCOUNT')&&service.permissions.includes('integration.process')&&service.permissions.includes('notifications.manage'),'ACCESS_DENIED');
  assert(typeof data.channelId==='string'&&typeof data.generation==='string'&&/^[a-f0-9]{64}$/.test(data.generation)&&typeof data.calendarId==='string'&&Number.isInteger(data.calendarVersion)&&typeof data.managerUserId==='string'&&Number.isFinite(Date.parse(data.requestedAt))&&Number.isFinite(Date.parse(data.not_before)),'VALIDATION_ERROR');
  if(Date.parse(now)<Date.parse(data.not_before))return {status:'DEFERRED' as const,notBefore:data.not_before};
  const channel=await tx.get('channel',data.channelId),sla=channel.data.handoff?.sla;
  if(channel.companyId!==job.company_id||!queuedHandoff(channel)||handoffGeneration(channel)!==data.generation||sla?.generation!==data.generation||sla.calendar_id!==data.calendarId||sla.calendar_version!==data.calendarVersion||sla.manager_user_id!==data.managerUserId||sla.managerReminderAt!==data.not_before||channel.data.handoff.requested_at!==data.requestedAt||!['PENDING','WEB_AVAILABLE'].includes(sla.reminder_state))return {status:'CANCELLED' as const,reason:'HANDOFF_CHANGED'};
  let cancellation:string|undefined;try{const calendar=await tx.get('business_calendar',data.calendarId);if(calendar.companyId!==job.company_id||calendar.data.status!=='APPROVED'||calendar.data.active!==true||calendar.version!==data.calendarVersion||calendar.data.managerUserId!==data.managerUserId||!handoffCalendarApplies(calendar,channel))cancellation='CALENDAR_CHANGED';}catch(error){if(error instanceof DomainError&&['ACCESS_DENIED','NOT_FOUND_SAFE'].includes(error.code))cancellation='CALENDAR_CHANGED';else throw error;}
  if(!cancellation&&!await handoffManagerAllowed(tx,data.managerUserId,channel,now))cancellation='OPERATOR_AUTHORITY_CHANGED';
  const setting=(await tx.list('notification_setting')).find(item=>item.data.user_id===data.managerUserId);if(!cancellation&&setting?.data.opted_out===true)cancellation='OPTED_OUT';
  if(cancellation){await cancelHandoffSla(tx,channel,now,cancellation);await lock();return {status:'CANCELLED' as const,reason:cancellation};}
  const dedup=createHash('sha256').update(JSON.stringify(['handoff-manager-notice',job.company_id,data.generation,data.calendarId,data.calendarVersion,data.managerUserId])).digest('hex'),existing=(await tx.list('notification')).find(item=>item.id===dedup);
  if(existing){await lock();return {status:'WEB_AVAILABLE' as const,notificationId:existing.id,duplicate:true};}
  const selected=setting?.data.language??'DE',notice=await tx.add('notification',{recipient_id:data.managerUserId,event:'HANDOFF_MANAGER_REMINDER',title:handoffReminderTitle(selected),category:'CUSTOMER',channel:'WEB',status:'WEB_AVAILABLE',delivery_status:'WEB_AVAILABLE',provider_state:'NOT_APPLICABLE',scheduled_at:data.not_before,completed_at:now,language:selected,attempts:0,max_attempts:1,dedup_key:dedup,required_permission:'chat.manage',handoff_channel_id:channel.id,handoff_generation:data.generation,handoff_calendar_id:data.calendarId,handoff_calendar_version:data.calendarVersion,customer_promise:false},dedup);
  await tx.save(channel,{...channel.data,handoff:{...channel.data.handoff,sla:{...sla,reminder_state:'WEB_AVAILABLE',notification_id:notice.id,reminded_at:now}}},channel.version);
  await lock();return {status:'WEB_AVAILABLE' as const,notificationId:notice.id,duplicate:false};
 });
}
