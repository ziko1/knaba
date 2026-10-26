import {assert,type Data,type Entity,type Transaction} from './core.ts';

export const DEFAULT_QUIET_START=20;
export const DEFAULT_QUIET_END=7;
export const SAFE_RETRY_DELAYS_MS=[60_000,300_000,900_000] as const;
export type DeliveryFailureClass='CONFIRMED_TRANSIENT'|'DEFINITIVE'|'UNKNOWN';

/** Retry numbers are one based. Three retries follow the first confirmed failure. */
export function safeRetryDelayMs(failedAttempt:number){
 assert(Number.isSafeInteger(failedAttempt)&&failedAttempt>=1,'VALIDATION_ERROR');
 return SAFE_RETRY_DELAYS_MS[Math.min(failedAttempt-1,SAFE_RETRY_DELAYS_MS.length-1)]!;
}

export function quietHour(now:string,start=DEFAULT_QUIET_START,end=DEFAULT_QUIET_END,timezone='Europe/Berlin'){
 assert(Number.isFinite(Date.parse(now))&&Number.isInteger(start)&&start>=0&&start<=23&&Number.isInteger(end)&&end>=0&&end<=23,'VALIDATION_ERROR');
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));
 return start===end?false:start<end?hour>=start&&hour<end:hour>=start||hour<end;
}

/** Find the next real wall-clock window; repeated or missing DST hours are not guessed. */
export function nextQuietWindowEnd(now:string,start=DEFAULT_QUIET_START,end=DEFAULT_QUIET_END,timezone='Europe/Berlin'){
 const instant=Date.parse(now);if(!quietHour(now,start,end,timezone))return now;
 const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',hourCycle:'h23'});
 let candidate=Math.floor(instant/60_000)*60_000+60_000;
 for(let minutes=0;minutes<26*60;minutes++,candidate+=60_000){const hour=Number(formatter.format(new Date(candidate)));if(!(start<end?hour>=start&&hour<end:hour>=start||hour<end))return new Date(candidate).toISOString();}
 assert(false,'INVALID_STATE',{reason:'QUIET_WINDOW_UNRESOLVED'});
}

/** Public reminders have no bypass. Only the canonical geo incident producer sets this class. */
export function activeOperationalNotice(data:Data){
 return data.work_cause?.schema===1&&data.work_cause?.type==='absence.explanation_requested'&&
  ['absence.explanation_requested','absence.responsible_review_required'].includes(data.event)&&data.operational_incident===true;
}

export async function deliveryDecision(tx:Transaction,data:Data,now:string){
 const sourceId=data.notificationId??data.deliveryId??data.routerResponseId;
 const dedupeKey=`delivery-decision:${data.notificationId?'notification':data.routerResponseId?'router-response':'delivery'}:${sourceId}:${data.reason}`;
 const existing=(await tx.list('decision')).find(e=>e.data.dedupeKey===dedupeKey);if(existing)return existing;
 const decision=await tx.add('decision',{status:'OPEN',ownerId:data.ownerId??'UNASSIGNED',siteId:data.siteId,
  reason:data.reason,notificationId:data.notificationId,deliveryId:data.deliveryId,routerResponseId:data.routerResponseId,sources:[sourceId],openedAt:now,
  actions:['CHANGE','RETURN','DELEGATE'],history:[],summaryDE:data.reason==='NOTIFICATION_OUTCOME_UNKNOWN'?
   'Unklarer Zustellstatus: zuerst den Anbieterstatus prüfen, nicht erneut senden.':'Eine Benachrichtigung konnte nach begrenzten sicheren Versuchen nicht zugestellt werden.',dedupeKey});
 await tx.event('decision.opened',{decisionId:decision.id,reason:data.reason,siteId:data.siteId});return decision;
}

/** A notification follows its one delivery; only the delivery worker owns provider retries. */
export async function projectDeliveryNotifications(tx:Transaction,delivery:Entity,now:string){
 const status=['API_ACCEPTED','SENT','DELIVERED','READ'].includes(delivery.data.status)?'SUCCEEDED':
  ['PENDING','SENDING'].includes(delivery.data.status)?'AWAITING_DELIVERY':delivery.data.status;
 const settings=await tx.list('notification_setting');
 for(const n of await tx.list('notification'))if(n.data.delivery_id===delivery.id&&['RUNNING','AWAITING_DELIVERY','RETRY_SCHEDULED','UNKNOWN'].includes(n.data.status)){
  const preference=settings.find(s=>s.data.user_id===n.data.recipient_id);
  const fallback=['FAILED','DEAD_LETTER'].includes(status)&&preference?.data.allowed_fallback==='WEB'&&!preference.data.opted_out;
  await tx.save(n,{...n.data,status:fallback?'SUCCEEDED':status,...fallback?{channel:'WEB',reason:'WHATSAPP_PROVIDER_FALLBACK'}:{},delivery_status:delivery.data.status,attempts:delivery.data.attempts??0,error:delivery.data.error??null,
   failure_class:status==='SUCCEEDED'?null:delivery.data.failure_class??null,scheduled_at:delivery.data.scheduled_at??n.data.scheduled_at,
   provider_message_id:delivery.data.provider_message_id??null,delivery_status_at:now});
 }
}

/** Eager cancellation is optional; every queued delivery still checks current incident relevance. */
export async function cancelPendingAbsenceNotices(tx:Transaction,shiftId:string,reason:string,now:string){
 let cancelled=0;
 for(const n of await tx.list('notification'))if(n.data.work_cause?.type==='absence.explanation_requested'&&n.data.work_cause?.data?.shiftId===shiftId&&['PENDING','RETRY_SCHEDULED'].includes(n.data.status)){
  await tx.save(n,{...n.data,status:'CANCELLED',reason,cancelled_at:now});cancelled++;
 }
 return cancelled;
}
