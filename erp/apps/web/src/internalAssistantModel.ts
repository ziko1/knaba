import type {Entity, Session} from './api';

export type InternalDraftKind = 'TASK_BATCH'|'REPORT'|'MATERIAL_REQUEST';
export type InternalContext = {locationIds:string[];assigneeIds:string[];taskIds:string[];materialIds:string[];orderIds:string[];reportIds:string[]};
export type InternalRequestInput = {messageId:string;messageVersion:number;channelId:string;configId:string;configVersion:number;kind:InternalDraftKind;siteIds:string[];context:InternalContext};
export type InternalPreview = {draftId:string;draftVersion:number;requestId:string;kind:InternalDraftKind;status:'DRAFT'|'NEEDS_CLARIFICATION'|'CONFIRMED';previewHash:string;source:{messageId:string;messageVersion:number;channelId:string};needsClarification:boolean;clarification?:string;preview:Record<string,any>;requiresUserConfirmation:boolean;sideEffectsExecuted:boolean;result?:Record<string,any>|null};
const internalChannels = new Set(['COMPANY_GENERAL','COMPANY_ANNOUNCEMENTS','TEAM','SITE_INTERNAL','TASK_THREAD']);
function activeMember(member:any,userId:string,now:number){return member.user_id===userId&&member.active!==false&&!member.revoked_at&&!member.revokedAt&&!member.left_at&&!member.leftAt&&!member.removed_at&&!member.removedAt&&!member.external&&(!member.expires_at||Date.parse(member.expires_at)>now)&&(!member.expiresAt||Date.parse(member.expiresAt)>now);}
export function eligibleInternalChannel(channel:Entity,userId:string,now=Date.now()) {
 return internalChannels.has(channel.data.type)&&!channel.data.confidential&&channel.data.visibility!=='CONFIDENTIAL'&&Array.isArray(channel.data.members)&&channel.data.members.some((m:any)=>activeMember(m,userId,now));
}
export function ownOriginalMessage(message:Entity,channel:Entity,session:Session) {
 const member=channel.data.members?.find((m:any)=>activeMember(m,session.actor.userId,Date.now()));
 const history=member?.history_from??member?.joined_at;
 return eligibleInternalChannel(channel,session.actor.userId)&&message.kind==='message'&&message.data.channel_id===channel.id&&message.data.author_id===session.actor.userId&&message.data.source==='HUMAN'&&!message.data.deleted_at&&!message.data.deletedAt&&typeof message.data.text==='string'&&message.data.text.length>0&&message.data.text.length<=4000&&Number.isSafeInteger(message.data.message_version)&&message.data.message_version>0&&Boolean(member)&&(!history||Date.parse(message.createdAt)>=Date.parse(history));
}
export function validateInternalPreview(value:any,request:Entity):value is InternalPreview {
 if(!value||typeof value.draftId!=='string'||value.draftId!==request.data.draftId||value.requestId!==request.id||value.kind!==request.data.kind||!Number.isSafeInteger(value.draftVersion)||value.draftVersion<1||!/^[a-f0-9]{64}$/.test(value.previewHash)||!['DRAFT','NEEDS_CLARIFICATION','CONFIRMED'].includes(value.status)||value.source?.messageId!==request.data.messageId||value.source?.channelId!==request.data.channelId||value.source?.messageVersion!==request.data.messageVersion||!value.preview||typeof value.preview!=='object'||value.preview.kind!==value.kind||value.preview.sideEffectsExecuted!==false||value.needsClarification!==(value.status==='NEEDS_CLARIFICATION')||value.requiresUserConfirmation!==(value.status==='DRAFT')||value.sideEffectsExecuted!==(value.status==='CONFIRMED'))return false;
 const text=(v:any)=>typeof v==='string'&&v.length>0;
 const texts=(v:any)=>Array.isArray(v)&&v.every(text);
 if(value.needsClarification)return text(value.clarification||value.preview.clarification);
 if(value.kind==='TASK_BATCH')return Array.isArray(value.preview.tasks)&&value.preview.tasks.length>0&&value.preview.tasks.length<=20&&value.preview.tasks.every((task:any)=>text(task.title)&&text(task.siteId)&&text(task.locationId)&&text(task.sourceQuote)&&texts(task.fullPath)&&task.fullPath.length>0&&typeof task.description==='string'&&Number.isSafeInteger(task.plannedQuantityMilli)&&task.plannedQuantityMilli>=0&&['M2','WINDOW','ROOM','FLOOR','UNIT','HOUR'].includes(task.unit)&&texts(task.assigneeIds)&&Array.isArray(task.executors)&&task.executors.length===task.assigneeIds.length&&task.executors.every((person:any,i:number)=>person?.id===task.assigneeIds[i]&&text(person.label))&&Array.isArray(task.checklist)&&task.checklist.every((item:any)=>text(item?.id)&&text(item?.label)&&item.checked===false)&&texts(task.acceptanceCriteria)&&task.billingScope==='INTERNAL'&&task.clientVisible===false);
 const input=value.preview.input;
 if(!input||!text(input.siteId)||value.preview.stateAfterConfirmation!=='DRAFT')return false;
 if(value.kind==='REPORT')return text(input.orderId)&&text(input.customerId)&&texts(input.taskIds)&&text(input.descriptionDe)&&input.documentType==='Leistungsnachweis'&&Number.isFinite(Date.parse(input.periodStart))&&Number.isFinite(Date.parse(input.periodEnd))&&Date.parse(input.periodStart)<Date.parse(input.periodEnd);
 return value.kind==='MATERIAL_REQUEST'&&text(input.materialId)&&typeof input.quantity==='string'&&/^\d+(?:\.\d{1,9})?$/.test(input.quantity)&&Number(input.quantity)>0&&['ml','l','g','kg','pcs','pair','package'].includes(input.unit)&&Number.isFinite(Date.parse(input.dueAt))&&['NORMAL','URGENT','CRITICAL'].includes(input.urgency)&&text(input.reason);
}
export function internalConfirmationInput(preview:InternalPreview,checked:boolean) {
 if(!checked||preview.status!=='DRAFT'||preview.needsClarification||!preview.requiresUserConfirmation||preview.sideEffectsExecuted||!/^[a-f0-9]{64}$/.test(preview.previewHash)||!Number.isSafeInteger(preview.draftVersion)||preview.draftVersion<1)throw new Error('REVIEW_REQUIRED');
 return {draftId:preview.draftId,expectedVersion:preview.draftVersion,previewHash:preview.previewHash,confirmed:true as const};
}
export function validInternalReceipt(value:any,preview:InternalPreview) {
 const expected={TASK_BATCH:'task.bulk.commit',REPORT:'report.create',MATERIAL_REQUEST:'request.create'}[preview.kind];
 const count=preview.kind==='TASK_BATCH'?preview.preview.tasks?.length:1;
 return Boolean(value?.draftId===preview.draftId&&value.command===expected&&value.sideEffectsExecuted===true&&value.automaticPublication===false&&Array.isArray(value.entityIds)&&value.entityIds.length>0&&value.entityIds.length===count&&value.entityIds.every((id:any)=>typeof id==='string'&&id.length>0)&&Array.isArray(value.result)&&value.result.length===value.entityIds.length&&value.result.every((row:any,index:number)=>row.id===value.entityIds[index]&&Number.isSafeInteger(row.version)&&row.version>0&&row.kind===({TASK_BATCH:'task',REPORT:'report',MATERIAL_REQUEST:'material_request'}[preview.kind])));
}
