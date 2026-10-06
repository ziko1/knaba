import {describe,it,expect} from 'vitest';
import type {Actor,Data,Entity} from '../packages/domain/core.ts';
import {DomainError} from '../packages/domain/core.ts';
import type {Database,PgTransaction} from '../apps/api/database.ts';
import {deriveWorkNotices,processWorkNotifications,workNotificationRelevant,workNoticeLabel,type WorkNotificationHost,type WorkNotificationJob} from '../packages/domain/work-notifications.ts';

const NOW='2026-10-06T10:00:00.000Z',COMPANY='synthetic-work-notifications';
function fixture(){
 const entities=new Map<string,Entity>(),actors=new Map<string,Actor>();let seq=0;
 const row=(kind:string,id:string,data:Data,version=1):Entity=>{const e={kind,id,data,version,companyId:COMPANY,createdAt:'2026-10-06T09:00:00.000Z',updatedAt:NOW};entities.set(kind+'/'+id,e);return e;};
 const actor=(id:string,permissions:string[],roles=['EMPLOYEE'],siteIds=['site'])=>actors.set(id,{userId:id,companyId:COMPANY,permissions,roles,siteIds,warehouseIds:[],customerIds:[]});
 actor('worker',['task.read','chat.read','inventory.read','finance.payout.ack','shift.read','site.read']);actor('peer',['task.read','chat.read','site.read']);actor('manager',['task.read','task.review','chat.read','issue.read','decision.manage','report.publish','inventory.approve','inventory.read','timesheet.approve'],['INTERNAL_BAULEITER']);actor('service',['integration.process'],['SERVICE_ACCOUNT']);actors.set('knaba-integration-service',actors.get('service')!);actors.get('knaba-integration-service')!.userId='knaba-integration-service';
 actor('client',['task.read','chat.read','customer.portal','report.read'],['CLIENT']);
 row('site','site',{managerIds:['manager'],customerId:'customer'});
 const tx={companyId:COMPANY,get:async(kind:string,id:string)=>{const e=entities.get(kind+'/'+id);if(!e)throw new DomainError('NOT_FOUND_SAFE');return e;},list:async(kind:string)=>[...entities.values()].filter(e=>e.kind===kind),add:async(kind:string,data:Data)=>row(kind,'new-'+(++seq),data),event:async()=>{},query:async()=>({rows:[]})} as unknown as PgTransaction;
 const host:WorkNotificationHost={actorIn:async(_tx,id)=>{const a=actors.get(id);if(!a)throw new DomainError('ACCESS_DENIED');return a;},scope:a=>a,visible:async(_tx,a,e)=>{
  if(e.companyId!==a.companyId)return false;
  if(e.kind==='message'){const c=entities.get('channel/'+e.data.channel_id);return a.permissions.includes('chat.read')&&c?.data.members.some((m:Data)=>m.user_id===a.userId&&!m.revoked_at&&m.active!==false)&&(!c?.data.site_id||a.siteIds.includes(c.data.site_id));}
  if(e.kind==='payout')return a.userId===e.data.employeeId;
  if(e.kind==='order'||e.kind==='report_version')return a.roles.includes('CLIENT')&&entities.get('customer_membership/client')?.data.active===true;
  return !a.roles.includes('CLIENT')&&(!e.data.siteId||a.siteIds.includes(e.data.siteId));
 }};
 const derive=(type:string,data:Data)=>deriveWorkNotices(tx,host,{type,data},NOW);
 const notice=(n:Awaited<ReturnType<typeof derive>>[number]):Entity=>row('notification','notice',{...n,work_cause:n.cause});
 return {row,actor,actors,entities,tx,host,derive,notice};
}

describe('work notifications: CPU current-source resolver (no PostgreSQL/provider acceptance)',()=>{
 it('assigned task follows canonical fresh assignees, never payload recipients or a client with injected task rights',async()=>{
  const f=fixture();f.row('task','task',{siteId:'site',state:'ASSIGNED',assigneeIds:['worker','client'],title:'PRIVATE_TASK_TEXT'});
  const notices=await f.derive('task.assigned',{taskId:'task',employeeIds:['worker','client'],recipient_id:'peer'});
  expect(notices.map(n=>n.recipient_id)).toEqual(['worker']);expect(JSON.stringify(notices)).not.toContain('PRIVATE_TASK_TEXT');
  expect(await f.derive('task.assigned',{taskId:'task',employeeIds:['peer']})).toEqual([]);
 });
 it('created-with-assignees and assigned events share a stable cause dedup identity',async()=>{
  const f=fixture();f.row('task','task',{siteId:'site',state:'ASSIGNED',assigneeIds:['worker']});
  expect((await f.derive('task.created',{taskId:'task'}))[0]!.cause.key).toBe((await f.derive('task.assigned',{taskId:'task',employeeIds:['worker']}))[0]!.cause.key);
 });
 it.each(['site','permission','inactive','reassignment','version'])('fresh %s change invalidates a queued assignment cause',async(change)=>{
  const f=fixture(),task=f.row('task','task',{siteId:'site',state:'ASSIGNED',assigneeIds:['worker']});const n=f.notice((await f.derive('task.assigned',{taskId:'task',employeeIds:['worker']}))[0]!);
  expect(await workNotificationRelevant(f.tx,f.host,n,NOW)).toBe(true);
  if(change==='site')f.actors.get('worker')!.siteIds=[];
  if(change==='permission')f.actors.get('worker')!.permissions=[];
  if(change==='inactive')f.actors.delete('worker');
  if(change==='reassignment')task.data.assigneeIds=['peer'];
  if(change==='version')task.version++;
  expect(await workNotificationRelevant(f.tx,f.host,n,NOW)).toBe(false);
 });
 it('submitted task targets only configured current managers with review rights, without guessing a company manager',async()=>{
  const f=fixture();f.row('task','task',{siteId:'site',state:'SUBMITTED_FOR_REVIEW',assigneeIds:['worker'],reviewCycle:2});
  expect((await f.derive('task.state_changed',{taskId:'task',to:'SUBMITTED_FOR_REVIEW'})).map(n=>n.recipient_id)).toEqual(['manager']);
  f.entities.get('site/site')!.data.managerIds=[];expect(await f.derive('task.state_changed',{taskId:'task',to:'SUBMITTED_FOR_REVIEW'})).toEqual([]);
 });
 it('REWORK requires actual defect link and rework task, never ordinary task label',async()=>{
  const f=fixture();f.row('task','task',{siteId:'site',state:'ASSIGNED',assigneeIds:['worker'],completionKind:'REWORK'});const d=f.row('defect','defect',{reworkTaskId:'task'});
  expect((await f.derive('defect.rework_created',{taskId:'task',defectId:'defect'}))[0]?.event).toBe('task.rework_assigned');d.data.reworkTaskId='other';expect(await f.derive('defect.rework_created',{taskId:'task',defectId:'defect'})).toEqual([]);
 });
 it('chat distinguishes explicit mention, important instruction and foreman reply; revoked members receive none',async()=>{
  const f=fixture();const channel=f.row('channel','channel',{site_id:'site',members:[{user_id:'worker'},{user_id:'peer',revoked_at:NOW},{user_id:'manager'}]});
  f.row('message','parent',{channel_id:'channel',author_id:'worker'});f.row('message','message',{channel_id:'channel',author_id:'manager',message_version:1,text:'PRIVATE_ORIGINAL',mention_ids:['worker','peer'],important:true,reply_to_id:'parent'});
  const n=await f.derive('message.created',{message_id:'message',version:1});expect(n.map(x=>x.event).sort()).toEqual(['chat.foreman_reply','chat.important_instruction','chat.mention']);expect(n.every(x=>x.recipient_id==='worker')).toBe(true);expect(JSON.stringify(n)).not.toContain('PRIVATE_ORIGINAL');
  channel.data.members[0].revoked_at=NOW;expect(await f.derive('message.created',{message_id:'message',version:1})).toEqual([]);
 });
 it('stale message version cannot create notices; own and service recipients are suppressed',async()=>{
  const f=fixture();f.row('channel','channel',{members:[{user_id:'worker'},{user_id:'knaba-integration-service'}]});f.row('message','message',{channel_id:'channel',author_id:'worker',message_version:2,important:true,mention_ids:['worker','knaba-integration-service']});expect(await f.derive('message.created',{message_id:'message',version:1})).toEqual([]);expect(await f.derive('message.created',{message_id:'message',version:2})).toEqual([]);
 });
 it('customer issue follows canonical owner and review cycle',async()=>{
  const f=fixture();f.row('issue','issue',{siteId:'site',state:'OPEN',cycle:2,ownerId:'manager'});expect((await f.derive('issue.opened',{issueId:'issue',cycle:2,ownerId:'peer'}))[0]?.recipient_id).toBe('manager');expect(await f.derive('issue.opened',{issueId:'issue',cycle:1})).toEqual([]);
 });
 it('accepted offer without crew uses the real decision owner and stops once an assignment exists',async()=>{
  const f=fixture();f.row('decision','decision',{status:'OPEN',reason:'CUSTOMER_ACCEPTED_NO_CREW',ownerId:'manager',orderId:'order'});const order=f.row('order','order',{status:'PENDING_OPERATIONS'});
  expect((await f.derive('decision.opened',{decisionId:'decision'}))[0]?.event).toBe('quote.accepted_without_crew');order.data.assignmentId='assigned';expect(await f.derive('decision.opened',{decisionId:'decision'})).toEqual([]);
 });
 it('schedule derives employee user binding and customer VIEW membership without exposing the commercial order to crew',async()=>{
  const f=fixture();f.row('employee','employee',{userId:'worker'});f.row('crew_assignment','assignment',{siteId:'site',scheduleVersion:3,status:'ASSIGNED',employeeIds:['employee']});const order=f.row('order','order',{status:'SCHEDULED',customerId:'customer',siteId:'site',assignmentId:'assignment',schedulePublishedVersion:3});f.row('customer_membership','client',{active:true,userId:'client',customerId:'customer',siteIds:['site'],permissions:['VIEW']});
  const n=await f.derive('dispatch.schedule_confirmed',{orderId:'order',assignmentId:'assignment',scheduleVersion:3});expect(n.map(x=>[x.recipient_id,x.related_kind])).toEqual([['worker','site'],['client','order']]);order.data.schedulePublishedVersion=4;expect(await f.derive('dispatch.schedule_confirmed',{orderId:'order',assignmentId:'assignment',scheduleVersion:3})).toEqual([]);
 });
 it.each(['report.approved','material_request.approved','payout.approved'])('%s demands exact source version and appropriate current state',async(type)=>{
  const f=fixture();const kind=type==='report.approved'?'report':type==='payout.approved'?'payout':'material_request';const source=f.row(kind,'source',{state:'APPROVED',siteId:'site',employeeId:'worker'},3);const data=type==='report.approved'?{reportId:'source'}:type==='payout.approved'?{payoutId:'source'}:{requestId:'source'};
  expect(await f.derive(type,{...data,sourceVersion:2})).toEqual([]);expect(await f.derive(type,{...data,sourceVersion:3})).toHaveLength(1);source.data.state='REJECTED';expect(await f.derive(type,{...data,sourceVersion:3})).toEqual([]);
 });
 it('payout receipt reminder goes only to its subject and stops after acknowledgment without copying amounts',async()=>{
  const f=fixture();const p=f.row('payout','payout',{state:'RECORDED',ackState:'UNCONFIRMED',employeeId:'worker',amountCents:987654});const n=await f.derive('payout.transfer_recorded',{payoutId:'payout',employeeId:'peer'});expect(n.map(x=>x.recipient_id)).toEqual(['worker']);expect(JSON.stringify(n)).not.toContain('987654');p.data.ackState='RECEIVED';expect(await f.derive('payout.transfer_recorded',{payoutId:'payout'})).toEqual([]);
 });
 it.each(['ON_BREAK','TRAVELLING','SERVICE_TASK','WORKING'])('absence reminder is suppressed while %s',async(activity)=>{const f=fixture();f.row('shift','shift',{employeeId:'worker',siteId:'site',state:'ACTIVE',activity});f.row('location_incident','incident',{employeeId:'worker',siteId:'site',shiftId:'shift',state:'OPEN',reason:'GEOFENCE_EXIT'});expect(await f.derive('absence.explanation_requested',{shiftId:'shift'})).toEqual([]);});
 it('absence cause binds one canonical incident and stops on submitted explanation',async()=>{const f=fixture();f.row('shift','shift',{employeeId:'worker',siteId:'site',state:'ACTIVE',activity:'AWAY_PENDING_REASON'});f.row('location_incident','incident',{employeeId:'worker',siteId:'site',shiftId:'shift',state:'OPEN',reason:'GEOFENCE_EXIT'});expect(await f.derive('absence.explanation_requested',{shiftId:'shift'})).toHaveLength(1);f.row('absence_explanation','explanation',{shiftId:'shift',state:'SUBMITTED'});expect(await f.derive('absence.explanation_requested',{shiftId:'shift'})).toEqual([]);});
 it('unknown events and corrupt work causes fail closed without creating notices',async()=>{const f=fixture();expect(await f.derive('arbitrary.provider_action',{recipient_id:'worker'})).toEqual([]);expect(await workNotificationRelevant(f.tx,f.host,f.row('notification','bad',{work_cause:{schema:9,type:'task.assigned',key:'bad'}}),NOW)).toBe(false);});
 it('six-language reason labels remain static and contain no source content',()=>{const values=['DE','UK','RU','PL','LT','EN'].map(lang=>workNoticeLabel('chat.mention',lang));expect(new Set(values).size).toBe(6);expect(values.every(v=>v.length>8&&!v.includes('chat.mention'))).toBe(true);expect(workNoticeLabel('task.assigned','INVALID')).toBe(workNoticeLabel('task.assigned','DE'));});
 it('warehouse reservation and shipment follow canonical request references and stop after the cause closes',async()=>{const f=fixture();const r=f.row('material_request','request',{siteId:'site',state:'RESERVED',employeeId:'worker'});f.row('stock_reservation','reservation',{requestId:'request',state:'ACTIVE',expiresAt:'2026-10-07T10:00:00.000Z'});expect((await f.derive('stock.reserved',{reservationId:'reservation',requestId:'ATTACKER_REFERENCE'}))[0]?.event).toBe('warehouse.reserved');f.row('transfer','transfer',{requestId:'request'});f.row('stock_movement','movement',{type:'SHIPMENT',transferId:'transfer'});expect((await f.derive('stock.movement_confirmed',{movementId:'movement'}))[0]?.event).toBe('warehouse.actual_issue');r.data.state='CLOSED';expect(await f.derive('stock.reserved',{reservationId:'reservation'})).toEqual([]);expect(await f.derive('stock.movement_confirmed',{movementId:'movement'})).toEqual([]);});
 it('foreign source rejects before recipient resolution or any projected content',async()=>{const f=fixture();const t=f.row('task','task',{siteId:'site',state:'ASSIGNED',assigneeIds:['worker']});t.companyId='unrelated-company';await expect(f.derive('task.assigned',{taskId:'task',employeeIds:['worker']})).rejects.toMatchObject({code:'ACCESS_DENIED'});});

 it('CPU orchestration double binds lease/type/data, stable dedup and explicit audit/outbox; it does not prove SQL',async()=>{
  const f=fixture();f.row('task','task',{siteId:'site',state:'ASSIGNED',assigneeIds:['worker']});const job:WorkNotificationJob={id:'job',company_id:COMPANY,type:'task.assigned',data:{taskId:'task',employeeIds:['worker']},lease_token:'actual-token'};const emitted:Data[]=[];let audit=0;
  f.tx.query=async(_sql:any,args:any)=>({rows:args[2]==='actual-token'?[{id:args[1],type:job.type,data:job.data}]:[]}) as any;f.tx.event=async(type,data)=>{emitted.push({type,data});};(f.tx as any).audit=async()=>{audit++;};const db={transaction:async(_c:any,_a:any,fn:any)=>fn(f.tx)} as Database;
  expect(await processWorkNotifications(db,f.host,job,NOW)).toMatchObject({created:1,status:'PRODUCED'});expect(await processWorkNotifications(db,f.host,{...job,id:'different-restart-job'},NOW)).toMatchObject({created:0,deduplicated:1});expect(audit).toBe(1);expect(emitted).toHaveLength(1);const stored=[...f.entities.values()].find(e=>e.kind==='notification')!;expect(stored.data.channel).toBe('WEB');expect(stored.data.template).toBeNull();
  await expect(processWorkNotifications(db,f.host,{...job,lease_token:'stolen'},NOW)).rejects.toMatchObject({code:'WORKER_LEASE_LOST'});f.tx.query=async()=>({rows:[{type:'message.created',data:job.data}]}) as any;await expect(processWorkNotifications(db,f.host,job,NOW)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(emitted).toHaveLength(1);
 });
});
