import {createHash} from 'node:crypto';
import {z} from 'zod';
import {assert,DomainError,type Actor,type CommandContext,type Data,type Entity,type Transaction,id,isManager} from './core.ts';
import {ROLE_PERMISSIONS} from './permissions.ts';

const clock=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const holiday=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;},'A real calendar date is required');
const minute=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3));
export const businessCalendarSchema=z.object({
 name:z.string().min(1).max(200),timezone:z.literal('Europe/Berlin'),
 weekdays:z.array(z.number().int().min(1).max(7)).min(1).max(7),
 windows:z.array(z.object({start:clock,end:clock}).strict()).min(1).max(16),
 holidays:z.array(holiday).max(732),managerUserId:id,siteIds:z.array(id).max(200)
}).strict().superRefine((value,ctx)=>{
 if(new Set(value.weekdays).size!==value.weekdays.length||new Set(value.holidays).size!==value.holidays.length||new Set(value.siteIds).size!==value.siteIds.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Calendar entries must be unique'});
 const windows=value.windows.map(w=>({start:minute(w.start),end:minute(w.end)})).sort((a,b)=>a.start-b.start);
 for(let i=0;i<windows.length;i++)if(windows[i]!.end<=windows[i]!.start||i>0&&windows[i]!.start<windows[i-1]!.end)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Use non-overlapping same-day windows; split overnight hours explicitly'});
});
export type BusinessCalendar=z.infer<typeof businessCalendarSchema>;
const calendarFields=['name','timezone','weekdays','windows','holidays','managerUserId','siteIds'] as const;
export function calendarDefinition(calendar:Entity){return businessCalendarSchema.parse(Object.fromEntries(calendarFields.map(key=>[key,calendar.data[key]])));}
const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'});
const weekdays:Record<string,number>={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7};
function parts(at:number){return Object.fromEntries(formatter.formatToParts(new Date(at)).map(p=>[p.type,p.value]));}
function nextMidnight(at:number,p:Record<string,string>){
 const target=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day)+1);let candidate=target;
 for(let i=0;i<4;i++){const q=parts(candidate),wall=Date.UTC(Number(q.year),Number(q.month)-1,Number(q.day),Number(q.hour),Number(q.minute));const delta=target-wall;if(delta===0)return candidate;candidate+=delta;}
 throw new DomainError('MISSING_CONFIGURATION',{reason:'BUSINESS_CALENDAR_TIMEZONE_UNAVAILABLE'});
}
/** Working minutes are elapsed time inside explicitly configured Berlin windows.
 * UTC minute boundaries preserve partial minutes and both sides of a DST fold. */
function workingTargets(calendar:BusinessCalendar,start:number,targets:number[]){
 const windows=calendar.windows.map(w=>({start:minute(w.start),end:minute(w.end)})),holidays=new Set(calendar.holidays),results:number[]=[];
 let cursor=start,worked=0,index=0;const horizon=start+370*24*60*60*1000;
 while(index<targets.length&&cursor<horizon){
  const p=parts(cursor),day=`${p.year}-${p.month}-${p.day}`,openDay=calendar.weekdays.includes(weekdays[p.weekday!]!)&&!holidays.has(day);
  if(!openDay){cursor=nextMidnight(cursor,p);continue;}
  const localMinute=Number(p.hour)*60+Number(p.minute),boundary=Math.min((Math.floor(cursor/60000)+1)*60000,horizon),open=windows.some(w=>localMinute>=w.start&&localMinute<w.end);
  if(open){const duration=boundary-cursor;while(index<targets.length&&worked+duration>=targets[index]!){results.push(cursor+targets[index]!-worked);index++;}worked+=duration;}
  cursor=boundary;
 }
 assert(index===targets.length,'MISSING_CONFIGURATION',{reason:'BUSINESS_CALENDAR_HORIZON_EXCEEDED'});return results;
}
export function addBusinessMinutes(calendar:BusinessCalendar,requestedAt:string,businessMinutes:number){
 const validated=businessCalendarSchema.parse(calendar),start=Date.parse(requestedAt);assert(Number.isFinite(start)&&Number.isInteger(businessMinutes)&&businessMinutes>=1&&businessMinutes<=480,'VALIDATION_ERROR');
 return new Date(workingTargets(validated,start,[businessMinutes*60000])[0]!).toISOString();
}
export function canonicalHandoffState(state:unknown){return state==='HANDOFF_PENDING'?'HUMAN_QUEUED':state;}
export function queuedHandoff(channel:Entity){return channel.data.type==='PRIVATE_CUSTOMER_ASSISTANT'&&canonicalHandoffState(channel.data.handoff?.state)==='HUMAN_QUEUED'&&channel.data.handoff.owner_id===null;}
export function handoffGeneration(channel:Entity){const handoff=channel.data.handoff??{};return createHash('sha256').update(JSON.stringify([channel.id,handoff.requested_at,handoff.source_message_id??null])).digest('hex');}
export function handoffDeadlines(calendar:Entity|undefined,requestedAt:string){
 const requested=Date.parse(requestedAt),approved=Date.parse(calendar?.data.approvedAt),parsed=businessCalendarSchema.safeParse(calendar?Object.fromEntries(calendarFields.map(key=>[key,calendar.data[key]])):undefined);
 if(!calendar||calendar.kind!=='business_calendar'||calendar.data.status!=='APPROVED'||calendar.data.active!==true||!calendar.data.approvedBy||!calendar.data.createdBy||calendar.data.approvedBy===calendar.data.createdBy||!Number.isFinite(approved)||!Number.isFinite(requested)||approved>requested||!parsed.success)return {status:'NO_APPROVED_CALENDAR' as const};
 try{const [response,manager]=workingTargets(parsed.data,requested,[15*60000,30*60000]);return {status:'CALCULATED' as const,responseDueAt:new Date(response!).toISOString(),managerReminderAt:new Date(manager!).toISOString()};}
 catch(error){if(error instanceof DomainError&&error.code==='MISSING_CONFIGURATION')return {status:'NO_APPROVED_CALENDAR' as const,reason:error.details.reason};throw error;}
}
function permissions(user:Entity){return [...new Set([...(user.data.roles??[]).flatMap((role:string)=>ROLE_PERMISSIONS[role]??[]),...(user.data.permissions??[])])];}
function activeMember(m:Data,now:string){const expiry=m.expires_at??m.expiresAt;return m.active!==false&&!m.revoked_at&&!m.revokedAt&&!m.left_at&&!m.leftAt&&!m.removed_at&&!m.removedAt&&(!expiry||Date.parse(expiry)>Date.parse(now));}
function priorAutomaticReturn(m:Data,userId:string,now:string){const revoked=Date.parse(m.revoked_at),joined=Date.parse(m.joined_at);return m.user_id===userId&&m.source==='OPERATOR_CLAIM'&&m.claim_owner_id===userId&&m.revocation_reason==='AI_RESUMED'&&Number.isFinite(revoked)&&Number.isFinite(joined)&&revoked>=joined&&revoked<=Date.parse(now)&&m.active!==false&&!m.revokedAt&&!m.left_at&&!m.leftAt&&!m.removed_at&&!m.removedAt&&!m.expires_at&&!m.expiresAt;}
export async function handoffManagerAllowed(tx:Transaction,userId:string,channel:Entity,now:string){
 try{
  const user=await tx.get('user',userId),rights=permissions(user),roles=user.data.roles??[];
  if(user.companyId!==channel.companyId||user.data.active!==true||!isManager({roles} as Actor)||roles.some((r:string)=>['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST','SERVICE_ACCOUNT'].includes(r))||!rights.includes('chat.manage')||!rights.includes('chat.read'))return false;
  let siteId=channel.data.site_id;if(channel.data.task_id){const task=await tx.get('task',channel.data.task_id);if(task.companyId!==channel.companyId||siteId&&siteId!==task.data.siteId)return false;siteId=task.data.siteId;}
  if(siteId&&!rights.includes('scope.company')&&!(user.data.siteIds??[]).includes(siteId))return false;
  const own=(channel.data.members??[]).filter((m:Data)=>m.user_id===userId);return own.some((m:Data)=>activeMember(m,now))||own.every((m:Data)=>priorAutomaticReturn(m,userId,now));
 }catch(error){if(error instanceof DomainError&&['ACCESS_DENIED','NOT_FOUND_SAFE'].includes(error.code))return false;throw error;}
}
export async function requireCalendarManager(ctx:CommandContext,calendar:BusinessCalendar){
 const user=await ctx.tx.get('user',calendar.managerUserId),rights=permissions(user),roles=user.data.roles??[];assert(user.companyId===ctx.actor.companyId&&user.data.active===true&&isManager({roles} as Actor)&&!roles.some((r:string)=>['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST','SERVICE_ACCOUNT'].includes(r))&&rights.includes('chat.manage')&&rights.includes('chat.read'),'ACCESS_DENIED');
 assert(calendar.siteIds.length?calendar.siteIds.every(siteId=>rights.includes('scope.company')||(user.data.siteIds??[]).includes(siteId)):rights.includes('scope.company'),'ACCESS_DENIED');
}
export async function calendarConfigurationAuthority(ctx:CommandContext,siteIds:string[]){
 assert(ctx.actor.mfaVerified===true,'NEEDS_REAUTH');assert(isManager(ctx.actor)&&ctx.actor.permissions.includes('chat.manage'),'ACCESS_DENIED');
 const user=await ctx.tx.get('user',ctx.actor.userId),rights=permissions(user);assert(user.companyId===ctx.actor.companyId&&user.data.active===true&&isManager({roles:user.data.roles??[]} as Actor)&&rights.includes('chat.manage')&&rights.includes('chat.read'),'ACCESS_DENIED');
 if(!siteIds.length)assert(ctx.actor.permissions.includes('scope.company')&&rights.includes('scope.company'),'ACCESS_DENIED');
 for(const siteId of siteIds){ctx.requireSite(siteId);await ctx.tx.get('site',siteId);assert(rights.includes('scope.company')||(user.data.siteIds??[]).includes(siteId),'ACCESS_DENIED');}
}
export function handoffCalendarApplies(calendar:Entity,channel:Entity){const scope=calendar.data.siteIds;return Array.isArray(scope)&&(!scope.length||typeof channel.data.site_id==='string'&&scope.includes(channel.data.site_id));}
export async function queueHandoffSla(tx:Transaction,channel:Entity,now:string){
 if(!queuedHandoff(channel))return channel;
 const generation=handoffGeneration(channel);if(channel.data.handoff.sla?.generation===generation&&channel.data.handoff.sla.status==='CALCULATED')return channel;
 const explicit=channel.data.business_calendar_id,candidates=(await tx.list('business_calendar')).filter(calendar=>calendar.companyId===channel.companyId&&calendar.data.active===true&&calendar.data.status==='APPROVED'&&handoffCalendarApplies(calendar,channel)&&(!explicit||calendar.id===explicit));
 const calendar=candidates.length===1?candidates[0]:undefined,deadlines=handoffDeadlines(calendar,channel.data.handoff.requested_at),sla:Data={...deadlines,generation,calculated_at:now,customer_promise:false};
 if(deadlines.status==='CALCULATED'&&calendar){sla.calendar_id=calendar.id;sla.calendar_version=calendar.version;sla.manager_user_id=calendar.data.managerUserId;sla.reminder_state='PENDING';}
 const saved=await tx.save(channel,{...channel.data,handoff:{...channel.data.handoff,canonical_state:'HUMAN_QUEUED',sla}},channel.version);
 if(deadlines.status==='CALCULATED'&&calendar){const data={channelId:channel.id,generation,calendarId:calendar.id,calendarVersion:calendar.version,managerUserId:calendar.data.managerUserId,requestedAt:channel.data.handoff.requested_at,not_before:deadlines.managerReminderAt};await tx.event('handoff.manager_reminder',data);
  const sql=tx as Transaction&{query?:(sql:string,params:unknown[])=>Promise<any>};if(sql.query)await sql.query("UPDATE outbox SET available_at=$1::timestamptz WHERE company_id=$2 AND type='handoff.manager_reminder' AND status='PENDING' AND data->>'channelId'=$3 AND data->>'generation'=$4",[deadlines.managerReminderAt,channel.companyId,channel.id,generation]);
 }
 return saved;
}
export async function cancelHandoffSla(tx:Transaction,channel:Entity,now:string,reason:string){
 const sla=channel.data.handoff?.sla;if(!sla)return channel;
 const saved=await tx.save(channel,{...channel.data,handoff:{...channel.data.handoff,sla:{...sla,reminder_state:'CANCELLED',cancelled_at:now,cancellation_reason:reason}}},channel.version);
 const sql=tx as Transaction&{query?:(sql:string,params:unknown[])=>Promise<any>};if(sql.query)await sql.query("UPDATE outbox SET status='CANCELLED',finished_at=now(),last_error=$1 WHERE company_id=$2 AND type='handoff.manager_reminder' AND status IN ('PENDING','RETRY_SCHEDULED') AND data->>'channelId'=$3 AND data->>'generation'=$4",[reason,channel.companyId,channel.id,sla.generation]);
 for(const item of await tx.list('notification'))if(item.data.event==='HANDOFF_MANAGER_REMINDER'&&item.data.handoff_channel_id===channel.id&&item.data.handoff_generation===sla.generation&&item.data.status==='WEB_AVAILABLE')await tx.save(item,{...item.data,status:'CANCELLED',reason});return saved;
}
export async function handoffReminderReadable(tx:Transaction,actor:Actor,notice:Entity,now:string){
 if(notice.data.event!=='HANDOFF_MANAGER_REMINDER')return true;
 if(notice.companyId!==actor.companyId||notice.data.recipient_id!==actor.userId)return false;
 try{const channel=await tx.get('channel',notice.data.handoff_channel_id),calendar=await tx.get('business_calendar',notice.data.handoff_calendar_id),sla=channel.data.handoff?.sla;
  return channel.companyId===actor.companyId&&calendar.companyId===actor.companyId&&queuedHandoff(channel)&&handoffGeneration(channel)===notice.data.handoff_generation&&sla?.generation===notice.data.handoff_generation&&sla.reminder_state==='WEB_AVAILABLE'&&calendar.data.status==='APPROVED'&&calendar.data.active===true&&calendar.version===notice.data.handoff_calendar_version&&calendar.data.managerUserId===actor.userId&&handoffCalendarApplies(calendar,channel)&&await handoffManagerAllowed(tx,actor.userId,channel,now);
 }catch(error){if(error instanceof DomainError&&['ACCESS_DENIED','NOT_FOUND_SAFE'].includes(error.code))return false;throw error;}
}
export function handoffReminderTitle(language:string){const rows:Record<string,string>={DE:'Eine Kundenanfrage wartet weiterhin auf menschliche Übernahme.',UK:'Звернення клієнта досі очікує на опрацювання людиною.',RU:'Обращение клиента всё ещё ожидает обработки человеком.',PL:'Zapytanie klienta nadal oczekuje na przejęcie przez człowieka.',LT:'Kliento užklausa vis dar laukia, kol ją perims darbuotojas.',EN:'A customer enquiry is still awaiting a human operator.'};return rows[language]??rows.DE!;}
export function handoffQueueNotice(language:string){const rows:Record<string,string>={DE:'Ihre Anfrage wurde an einen menschlichen Ansprechpartner übergeben.',UK:'Ваше звернення передано людині для опрацювання.',RU:'Ваше обращение передано человеку для обработки.',PL:'Twoje zapytanie przekazano człowiekowi do obsługi.',LT:'Jūsų užklausa perduota darbuotojui.',EN:'Your enquiry has been passed to a human operator.'};return rows[language]??rows.DE!;}
