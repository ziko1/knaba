import {createHash} from 'node:crypto';
import type {Database,PgTransaction} from '../../apps/api/database.ts';
import {assert,DomainError,type Actor,type Data,type Entity} from './core.ts';

export interface WorkNotificationHost {
 actorIn(tx:PgTransaction,userId:string):Promise<Actor>;
 scope(actor:Actor,permission:string):Actor;
 visible(tx:PgTransaction,actor:Actor,entity:Entity):Promise<boolean>;
}
export interface WorkNotificationJob {id:string;company_id:string;type:string;data:Data;lease_token?:string|null;}
export interface WorkNotice {
 recipient_id:string;event:string;category:'WORK'|'CHAT'|'PAYMENT'|'CUSTOMER'|'TECHNICAL';
 related_kind:string;related_id:string;message_id?:string;required_permission:string;
 cause:{schema:1;type:string;data:Data;sourceVersion:number;key:string};
}
const external=(a:Actor)=>a.roles.some(r=>['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST','SERVICE_ACCOUNT'].includes(r));
const ids=(value:unknown):string[]=>Array.isArray(value)?[...new Set(value.filter((v):v is string=>typeof v==='string'&&v.length>0&&v.length<=100))]:[];
const canonical=(v:any):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const hash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const live=(d:Data,now:string)=>d.active!==false&&!d.revoked_at&&!d.revokedAt&&!d.left_at&&!d.leftAt&&!d.removed_at&&!d.removedAt&&(!(d.expires_at??d.expiresAt)||Date.parse(d.expires_at??d.expiresAt)>Date.parse(now));
export const WORK_NOTIFICATION_EVENTS=new Set(['task.created','task.assigned','task.state_changed','defect.rework_created','message.created','message.corrected','issue.opened','decision.opened','dispatch.schedule_confirmed','report.approved','report.published','material_request.submitted','material_request.approved','stock.reserved','stock.movement_confirmed','payout.approved','payout.transfer_recorded','absence.explanation_requested','timesheet.submitted']);
const labels:Record<string,string[]>={
 'task.assigned':['Ihnen wurde eine Aufgabe zugewiesen','Вам призначено завдання','Вам назначена задача','Przydzielono Ci zadanie','Jums paskirta užduotis','A task was assigned to you'],
 'task.submitted_for_review':['Eine Aufgabe benötigt Ihre Prüfung','Завдання потребує вашої перевірки','Задача требует вашей проверки','Zadanie wymaga Twojej kontroli','Užduočiai reikia jūsų patikros','A task needs your review'],
 'task.rework_assigned':['Ihnen wurde Nacharbeit zugewiesen','Вам призначено повторну роботу','Вам назначена повторная работа','Przydzielono Ci poprawki','Jums paskirti taisymo darbai','Rework was assigned to you'],
 'chat.mention':['Sie wurden im Chat erwähnt','Вас згадали в чаті','Вас упомянули в чате','Wspomniano o Tobie na czacie','Jūs paminėti pokalbyje','You were mentioned in a chat'],
 'chat.important_instruction':['Eine wichtige Anweisung in Ihrem Chat','Важлива інструкція у вашому чаті','Важная инструкция в вашем чате','Ważna instrukcja w Twoim czacie','Svarbus nurodymas jūsų pokalbyje','An important instruction in your chat'],
 'chat.foreman_reply':['Der Bauleiter hat auf Ihre Nachricht geantwortet','Прораб відповів на ваше повідомлення','Прораб ответил на ваше сообщение','Kierownik odpowiedział na Twoją wiadomość','Darbų vadovas atsakė į jūsų žinutę','Your foreman replied to your message'],
 'customer.issue':['Ein Kundenhinweis wurde Ihnen zugeordnet','Вам передано зауваження клієнта','Вам передано замечание клиента','Przypisano Ci zgłoszenie klienta','Jums priskirta kliento pastaba','A customer issue is assigned to you'],
 'quote.accepted_without_crew':['Angenommenes Angebot benötigt eine Mannschaft','Погоджена пропозиція потребує бригади','Согласованное предложение требует бригады','Zaakceptowana oferta wymaga ekipy','Patvirtintam pasiūlymui reikia komandos','An accepted offer needs a crew'],
 'dispatch.schedule_confirmed':['Ihr Arbeitsplan wurde bestätigt','Ваш робочий графік підтверджено','Ваш рабочий график подтверждён','Twój harmonogram został potwierdzony','Jūsų darbų grafikas patvirtintas','Your work schedule is confirmed'],
 'report.ready_for_publication':['Ein freigegebener Bericht ist zur Veröffentlichung bereit','Погоджений звіт готовий до публікації','Согласованный отчёт готов к публикации','Zatwierdzony raport jest gotowy do publikacji','Patvirtinta ataskaita paruošta skelbti','An approved report is ready to publish'],
 'report.available':['Ihr veröffentlichter Bericht ist verfügbar','Ваш опублікований звіт доступний','Ваш опубликованный отчёт доступен','Twój opublikowany raport jest dostępny','Jūsų paskelbta ataskaita pasiekiama','Your published report is available'],
 'warehouse.request_submitted':['Eine Materialanfrage benötigt Ihre Prüfung','Заявка на матеріали потребує вашої перевірки','Заявка на материалы требует вашей проверки','Zapotrzebowanie materiałowe wymaga kontroli','Medžiagų užklausai reikia jūsų patikros','A material request needs your review'],
 'warehouse.request_approved':['Ihre Materialanfrage wurde genehmigt','Вашу заявку на матеріали погоджено','Ваша заявка на материалы согласована','Twoje zapotrzebowanie materiałowe zatwierdzono','Jūsų medžiagų užklausa patvirtinta','Your material request is approved'],
 'warehouse.reserved':['Material wurde für Ihre Anfrage reserviert','Матеріали зарезервовано для вашої заявки','Материалы зарезервированы для вашей заявки','Materiały zarezerwowano na Twoje zapotrzebowanie','Jūsų užklausai rezervuotos medžiagos','Material is reserved for your request'],
 'warehouse.actual_issue':['Material wurde für Ihre Anfrage ausgegeben','Матеріали видано за вашою заявкою','Материалы выданы по вашей заявке','Wydano materiały na Twoje zapotrzebowanie','Pagal jūsų užklausą išduotos medžiagos','Material was issued for your request'],
 'payout.approved':['Ihre Auszahlung wurde genehmigt','Вашу виплату погоджено','Ваша выплата согласована','Twoja wypłata została zatwierdzona','Jūsų išmoka patvirtinta','Your payment is approved'],
 'payout.acknowledgment_required':['Bestätigen Sie den Erhalt Ihrer Auszahlung','Підтвердьте отримання вашої виплати','Подтвердите получение вашей выплаты','Potwierdź otrzymanie wypłaty','Patvirtinkite išmokos gavimą','Confirm receipt of your payment'],
 'absence.explanation_requested':['Eine bestätigte Abwesenheit benötigt Ihre Erklärung','Підтверджена відсутність потребує вашого пояснення','Подтверждённое отсутствие требует вашего объяснения','Potwierdzona nieobecność wymaga wyjaśnienia','Patvirtintam nebuvimui reikia jūsų paaiškinimo','A confirmed absence needs your explanation'],
 'timesheet.review_required':['Ein eingereichter Stundenzettel benötigt Ihre Prüfung','Поданий табель потребує вашої перевірки','Поданный табель требует вашей проверки','Złożona ewidencja czasu wymaga kontroli','Pateiktam darbo laiko žiniaraščiui reikia jūsų patikros','A submitted timesheet needs your review']
};
export function workNoticeLabel(event:string,language:string){const index=['DE','UK','RU','PL','LT','EN'].indexOf(language);return labels[event]?.[index<0?0:index]??event;}

/** A closed deterministic source resolver. Event payloads are references, never recipient authority. */
export async function deriveWorkNotices(tx:PgTransaction,host:WorkNotificationHost,event:{type:string;data:Data},now:string):Promise<WorkNotice[]> {
 if(!WORK_NOTIFICATION_EVENTS.has(event.type))return [];
 assert(event.data&&typeof event.data==='object'&&!Array.isArray(event.data)&&Buffer.byteLength(JSON.stringify(event.data),'utf8')<=16384,'VALIDATION_ERROR');
 const company=tx.companyId,out:WorkNotice[]=[];
 const get=async(kind:string,id:unknown)=>{assert(typeof id==='string'&&id.length>0&&id.length<=100,'VALIDATION_ERROR');const e=await tx.get(kind,id);assert(e.companyId===company,'ACCESS_DENIED');return e;};
 const managers=async(siteId:string)=>ids((await get('site',siteId)).data.managerIds);
 const employeeUser=async(employeeId:string)=>{try{const employee=await get('employee',employeeId);return String(employee.data.userId??employee.id);}catch(e){if(e instanceof DomainError&&e.code==='NOT_FOUND_SAFE')return employeeId;throw e;}};
 const add=async(source:Entity,recipientId:string,logical:string,permission:string,category:WorkNotice['category']='WORK',customer=false,bind:Data={})=>{
  if(out.length>=250)throw new DomainError('INVALID_STATE',{reason:'WORK_NOTIFICATION_RECIPIENT_LIMIT'});
  try {
   const actor=await host.actorIn(tx,recipientId);if(actor.companyId!==company||!actor.permissions.includes(permission)||actor.roles.includes('SERVICE_ACCOUNT')||(!customer&&external(actor)))return;
   const scoped=host.scope(actor,permission),siteId=source.data.siteId??source.data.site_id;
   if(!scoped.permissions.includes(permission)||(!customer&&siteId&&!scoped.permissions.includes('scope.company')&&!scoped.siteIds.includes(siteId)))return;
   if(!await host.visible(tx,actor,source))return;
   const data={...bind};const key=hash({logical,kind:source.kind,id:source.id,version:source.version,bind:data});
   if(out.some(n=>n.recipient_id===recipientId&&n.cause.key===key))return;
   out.push({recipient_id:recipientId,event:logical,category,related_kind:source.kind,related_id:source.id,...source.kind==='message'?{message_id:source.id}:{},required_permission:permission,cause:{schema:1,type:event.type,data,sourceVersion:source.version,key}});
  }catch(e){if(e instanceof DomainError&&['NOT_FOUND_SAFE','ACCESS_DENIED'].includes(e.code))return;throw e;}
 };
 const customers=async(source:Entity,logical:string,permission:string,bind:Data)=>{
  const customerId=source.data.customerId??source.data.snapshot?.customer?.id,siteId=source.data.siteId??source.data.snapshot?.site?.id;
  const memberships=await tx.list('customer_membership');assert(memberships.length<=10000,'INVALID_STATE');
  for(const m of memberships)if(m.companyId===company&&m.data.active===true&&live(m.data,now)&&m.data.customerId===customerId&&(m.data.permissions??[]).includes('VIEW')&&(!ids(m.data.siteIds).length||ids(m.data.siteIds).includes(siteId)))await add(source,m.data.userId??m.data.user_id,logical,permission,'CUSTOMER',true,bind);
 };
 const d=event.data;
 if(['message.created','message.corrected'].includes(event.type)){
  const m=await get('message',d.message_id),channel=await get('channel',m.data.channel_id);
  if(m.data.deleted_at||(m.data.message_version??m.data.version)!==d.version)return [];
  const bind={message_id:m.id,version:d.version};
  for(const uid of ids(m.data.mention_ids))if(uid!==m.data.author_id)await add(m,uid,'chat.mention','chat.read','CHAT',false,bind);
  if(m.data.important)for(const member of channel.data.members??[])if(live(member,now)&&member.user_id!==m.data.author_id)await add(m,member.user_id,'chat.important_instruction','chat.read','CHAT',false,bind);
  if(m.data.reply_to_id){const parent=await get('message',m.data.reply_to_id);const author=await host.actorIn(tx,m.data.author_id);
   if(parent.data.channel_id===channel.id&&!parent.data.deleted_at&&parent.data.author_id!==m.data.author_id&&!external(author)&&author.roles.some(r=>['FOREMAN','INTERNAL_BAULEITER','TEAM_LEADER'].includes(r)))await add(m,parent.data.author_id,'chat.foreman_reply','chat.read','CHAT',false,{...bind,parent_id:parent.id});
  }
 }else if(['task.created','task.assigned','task.state_changed','defect.rework_created'].includes(event.type)){
  const t=await get('task',d.taskId),bind={taskId:t.id,employeeIds:ids(t.data.assigneeIds),...event.type==='task.state_changed'?{to:d.to,reviewCycle:t.data.reviewCycle??0}:{}};
  if(event.type==='task.state_changed'){
   if(d.to!=='SUBMITTED_FOR_REVIEW'||t.data.state!==d.to)return [];
   for(const uid of await managers(t.data.siteId))await add(t,uid,'task.submitted_for_review','task.review','WORK',false,bind);
  }else {
   if(!['ASSIGNED','REOPENED','BLOCKED'].includes(t.data.state))return [];
   if(event.type==='task.assigned'&&canonical(ids(d.employeeIds).sort())!==canonical(ids(t.data.assigneeIds).sort()))return [];
   if(event.type==='defect.rework_created'){const defect=await get('defect',d.defectId);if(defect.data.reworkTaskId!==t.id||t.data.completionKind!=='REWORK')return [];}
   for(const uid of ids(t.data.assigneeIds))await add(t,uid,event.type==='defect.rework_created'?'task.rework_assigned':'task.assigned','task.read','WORK',false,{...bind,...event.type==='defect.rework_created'?{defectId:d.defectId}:{}});
  }
 }else if(event.type==='issue.opened'){
  const e=await get('issue',d.issueId);if(e.data.state!=='OPEN'||e.data.cycle!==d.cycle)return [];
  if(e.data.ownerId&&e.data.ownerId!=='UNASSIGNED')await add(e,e.data.ownerId,'customer.issue','issue.read','WORK',false,{issueId:e.id,cycle:e.data.cycle});
 }else if(event.type==='decision.opened'){
  const e=await get('decision',d.decisionId);if(e.data.status!=='OPEN'||e.data.reason!=='CUSTOMER_ACCEPTED_NO_CREW')return [];
  const order=await get('order',e.data.orderId);if(order.data.assignmentId||!['PENDING_OPERATIONS','CONFIRMED'].includes(order.data.status))return [];
  if(e.data.ownerId&&e.data.ownerId!=='UNASSIGNED')await add(e,e.data.ownerId,'quote.accepted_without_crew','decision.manage','WORK',false,{decisionId:e.id,orderId:order.id});
 }else if(event.type==='dispatch.schedule_confirmed'){
  const order=await get('order',d.orderId),assignment=await get('crew_assignment',d.assignmentId);
  if(order.data.status!=='SCHEDULED'||order.data.assignmentId!==assignment.id||order.data.schedulePublishedVersion!==d.scheduleVersion||assignment.data.scheduleVersion!==d.scheduleVersion||assignment.data.status==='CANCELLED')return [];
  const bind={orderId:order.id,assignmentId:assignment.id,scheduleVersion:d.scheduleVersion};
  // Employee schedule notification links the site: private commercial order data remains private.
  const site=await get('site',assignment.data.siteId);
  for(const employeeId of ids(assignment.data.employeeIds))await add(site,await employeeUser(employeeId),'dispatch.schedule_confirmed','site.read','WORK',false,bind);
  await customers(order,'dispatch.schedule_confirmed','customer.portal',bind);
 }else if(event.type==='report.approved'){
  const r=await get('report',d.reportId);if(r.data.state!=='APPROVED'||d.sourceVersion!==r.version)return [];
  for(const uid of await managers(r.data.siteId))await add(r,uid,'report.ready_for_publication','report.publish','WORK',false,{reportId:r.id,sourceVersion:d.sourceVersion});
 }else if(event.type==='report.published'){
  const r=await get('report',d.reportId),v=await get('report_version',d.reportVersionId);if(r.data.state!=='PUBLISHED'||r.data.currentVersionId!==v.id||v.data.reportId!==r.id)return [];
  await customers(v,'report.available','report.read',{reportId:r.id,reportVersionId:v.id});
 }else if(['material_request.submitted','material_request.approved','stock.reserved','stock.movement_confirmed'].includes(event.type)){
  let requestId=d.requestId;let reservation:Entity|undefined;
  if(event.type==='stock.reserved'){reservation=await get('stock_reservation',d.reservationId);requestId=reservation.data.requestId;if(!requestId||reservation.data.state!=='ACTIVE'||Date.parse(reservation.data.expiresAt)<=Date.parse(now))return [];}
  if(event.type==='stock.movement_confirmed'){const movement=await get('stock_movement',d.movementId);requestId=movement.data.requestId;if(!requestId&&movement.data.transferId)requestId=(await get('transfer',movement.data.transferId)).data.requestId;if(!requestId||movement.data.type!=='SHIPMENT')return [];}
  const r=await get('material_request',requestId);if(['CLOSED','REJECTED','RECEIVED'].includes(r.data.state))return [];
  const bind={requestId:r.id,...event.type==='material_request.approved'?{sourceVersion:d.sourceVersion}:{},...reservation?{reservationId:reservation.id}:{},...event.type==='stock.movement_confirmed'?{movementId:d.movementId}:{}};
  if(event.type==='material_request.submitted'){if(r.data.state!=='SUBMITTED')return [];for(const uid of await managers(r.data.siteId))await add(r,uid,'warehouse.request_submitted','inventory.approve','WORK',false,bind);}
  else {if(event.type==='material_request.approved'&&(!['APPROVED','PARTIALLY_APPROVED'].includes(r.data.state)||d.sourceVersion!==r.version))return [];await add(r,r.data.employeeId,event.type==='stock.reserved'?'warehouse.reserved':event.type==='stock.movement_confirmed'?'warehouse.actual_issue':'warehouse.request_approved','inventory.read','WORK',false,bind);}
 }else if(['payout.approved','payout.transfer_recorded'].includes(event.type)){
  const p=await get('payout',d.payoutId);if(event.type==='payout.approved'?p.data.state!=='APPROVED'||d.sourceVersion!==p.version:p.data.state!=='RECORDED'||p.data.ackState!=='UNCONFIRMED')return [];
  await add(p,p.data.employeeId,event.type==='payout.approved'?'payout.approved':'payout.acknowledgment_required','finance.payout.ack','PAYMENT',false,{payoutId:p.id,...event.type==='payout.approved'?{sourceVersion:d.sourceVersion}:{}});
 }else if(event.type==='absence.explanation_requested'){
  const shift=await get('shift',d.shiftId);if(shift.data.state!=='ACTIVE'||shift.data.activity!=='AWAY_PENDING_REASON')return [];
  const incidents=(await tx.list('location_incident')).filter(e=>e.companyId===company&&e.data.shiftId===shift.id&&e.data.employeeId===shift.data.employeeId&&e.data.state==='OPEN'&&e.data.reason==='GEOFENCE_EXIT'&&!e.data.explanationId&&!e.data.explanation_id);
  if(incidents.length!==1)return [];const incident=incidents[0]!;
  if((await tx.list('absence_explanation')).some(e=>e.data.shiftId===shift.id&&e.data.state!=='REJECTED'&&Date.parse(e.createdAt)>=Date.parse(incident.createdAt)))return [];
  await add(incident,shift.data.employeeId,'absence.explanation_requested','shift.read','TECHNICAL',false,{shiftId:shift.id,incidentId:incident.id});
 }else if(event.type==='timesheet.submitted'){
  const sheet=await get('timesheet',d.timesheetId);if(sheet.data.state!=='SUBMITTED')return [];
  const siteIds=ids((sheet.data.segmentSnapshot??[]).map((s:Data)=>s.siteId)),managerIds=new Set<string>();for(const sid of siteIds)for(const uid of await managers(sid))managerIds.add(uid);
  for(const uid of managerIds)await add(sheet,uid,'timesheet.review_required','timesheet.approve','WORK',false,{timesheetId:sheet.id});
 }
 return out;
}

/** Recheck cause, recipient role and source visibility for delivery and private activity reads. */
export async function workNotificationRelevant(tx:PgTransaction,host:WorkNotificationHost,item:Entity,now=new Date().toISOString()):Promise<boolean>{
 const cause=item.data.work_cause;if(!cause)return true;
 if(cause.schema!==1||!WORK_NOTIFICATION_EVENTS.has(cause.type)||typeof cause.key!=='string'||!cause.data||typeof cause.data!=='object'||Array.isArray(cause.data)||item.companyId!==tx.companyId)return false;
 try {
  const notices=await deriveWorkNotices(tx,host,{type:cause.type,data:cause.data},now);
  return notices.some(n=>n.recipient_id===item.data.recipient_id&&n.event===item.data.event&&n.related_kind===item.data.related_kind&&n.related_id===item.data.related_id&&n.cause.key===cause.key&&n.cause.sourceVersion===cause.sourceVersion);
 }catch(e){if(e instanceof DomainError)return false;throw e;}
}

/** Durable internal projection only: one leased canonical event -> atomic audit + WEB activity + delivery outbox. */
export async function processWorkNotifications(db:Database,host:WorkNotificationHost,job:WorkNotificationJob,now=new Date().toISOString()):Promise<{created:number;deduplicated:number;status:'PRODUCED'|'NO_CURRENT_RECIPIENT'|'UNSUPPORTED'}>{
 if(!WORK_NOTIFICATION_EVENTS.has(job.type))return {created:0,deduplicated:0,status:'UNSUPPORTED'};
 assert(typeof job.lease_token==='string'&&job.lease_token.length>0,'WORKER_LEASE_LOST');
 return db.transaction(job.company_id,'knaba-integration-service',async tx=>{
  const lock=async()=>{const held=await tx.query("SELECT id,type,data FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token]);assert(held.rows.length===1,'WORKER_LEASE_LOST');assert(held.rows[0].type===job.type&&canonical(held.rows[0].data)===canonical(job.data),'ACCESS_DENIED');};
  await lock();const actor=await host.actorIn(tx,'knaba-integration-service');assert(actor.companyId===job.company_id&&actor.roles.includes('SERVICE_ACCOUNT')&&host.scope(actor,'integration.process').permissions.includes('integration.process'),'ACCESS_DENIED');
  const notices=await deriveWorkNotices(tx,host,job,now),existing=await tx.list('notification'),settings=await tx.list('notification_setting');let created=0,deduplicated=0;
  assert(existing.length<=50000,'INVALID_STATE');
  for(const n of notices){const dedup_key=`work:${n.cause.key}`;if(existing.some(e=>e.data.recipient_id===n.recipient_id&&e.data.dedup_key===dedup_key)){deduplicated++;continue;}
   const preference=settings.find(s=>s.data.user_id===n.recipient_id),language=['DE','UK','RU','PL','LT','EN'].includes(preference?.data.language)?preference!.data.language:'DE';
   await lock();const item=await tx.add('notification',{recipient_id:n.recipient_id,event:n.event,reason:n.event,title:workNoticeLabel(n.event,language),category:n.category,scheduled_at:now,language,template:null,dedup_key,channel:'WEB',related_kind:n.related_kind,related_id:n.related_id,...n.message_id?{message_id:n.message_id}:{},required_permission:n.required_permission,work_cause:n.cause,status:'PENDING',attempts:0,max_attempts:3});
   // PgTransaction.add writes the CREATE revision and audit in this same transaction.
   const audit=(tx as unknown as {audit?:(action:string,data:Data)=>Promise<void>}).audit;if(audit)await audit.call(tx,'WORK_NOTIFICATION_CREATED',{notificationId:item.id,sourceKind:n.related_kind,sourceId:n.related_id});
   await tx.event('notification.scheduled',{notification_id:item.id,not_before:now});existing.push(item);created++;
  }
  await lock();return {created,deduplicated,status:notices.length?'PRODUCED':'NO_CURRENT_RECIPIENT'};
 },10000);
}
