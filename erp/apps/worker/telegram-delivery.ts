import {createHash} from 'node:crypto';
import {assert,DomainError,type Data,type Entity} from '../../packages/domain/core.ts';
import type {Database,PgTransaction} from '../api/database.ts';
import type {Engine} from '../api/engine.ts';
import {TelegramBotAdapter,TelegramBoundaryError} from '../../packages/integrations/telegram.ts';

const service='knaba-integration-service';
const digest=(...parts:string[])=>createHash('sha256').update(parts.join('\0')).digest('hex');
const activeMember=(m:Data,now:number)=>m.active!==false&&!m.revokedAt&&!m.revoked_at&&!m.left_at&&!m.leftAt&&!m.removed_at&&!m.removedAt&&(!m.expiresAt||Date.parse(m.expiresAt)>now)&&(!m.expires_at||Date.parse(m.expires_at)>now);
const digits=(s:unknown):s is string=>typeof s==='string'&&/^[1-9]\d{0,15}$/.test(s);
export type TelegramDeliveryJob={id:string;company_id:string;type:string;data:Data;lease_token?:string};
type Preparation={delivery_id:string;status:'PENDING'}|{status:'NOT_APPLICABLE'};
type Pending={kind:'skip'}|{kind:'send';deliveryId:string;chatId:string;text:string;recipientId:string};

/** Called from the existing message.created worker only; creates one ticket and event per original human reply. */
export async function stageTelegramReply(db:Pick<Database,'transaction'>,engine:Engine,companyId:string,messageId:string,version:number):Promise<Preparation>{
  assert(Number.isSafeInteger(version)&&version===1,'VALIDATION_ERROR');
  return db.transaction(companyId,service,async tx=>{
    const message=await tx.get('message',messageId),channel=await tx.get('channel',message.data.channel_id);
    if(channel.data.source_provider!=='TELEGRAM'||channel.data.type!=='PRIVATE_CUSTOMER_ASSISTANT'||
       message.data.deleted_at||message.data.message_version!==version||message.data.source!=='HUMAN'||
       channel.data.handoff?.state!=='HUMAN_ACTIVE'||channel.data.handoff?.owner_id!==message.data.author_id)return {status:'NOT_APPLICABLE'};
    const author=await engine.actorIn(tx,message.data.author_id);
    if(author.companyId!==companyId||!author.roles.some(role=>['OWNER','DIRECTOR','OPERATIONS_MANAGER','DISPATCHER'].includes(role)))return {status:'NOT_APPLICABLE'};
    const recipientIds=[...new Set<string>((channel.data.members??[]).filter((m:Data)=>m.external===true&&typeof m.user_id==='string'&&m.user_id.length>0&&activeMember(m,Date.now())).map((m:Data)=>m.user_id as string))];
    if(recipientIds.length!==1||recipientIds[0]===message.data.author_id)return {status:'NOT_APPLICABLE'};
    const id=digest('knaba-telegram-reply-v1',companyId,messageId,String(version),recipientIds[0]);
    try {const old=await tx.get('telegram_delivery',id);return {delivery_id:old.id,status:'PENDING'};}
    catch(error){if(!(error instanceof DomainError)||error.code!=='NOT_FOUND_SAFE')throw error;}
    const row=await tx.add('telegram_delivery',{
      channel_id:channel.id,message_id:message.id,message_version:version,operator_user_id:author.userId,
      recipient_user_id:recipientIds[0],status:'PENDING',provider:'TELEGRAM',created_at:new Date().toISOString()
    },id);
    await tx.event('telegram.outbound_requested',{delivery_id:row.id});
    return {delivery_id:row.id,status:'PENDING'};
  });
}

async function lease(tx:PgTransaction,job:TelegramDeliveryJob):Promise<void>{
  const rows=await tx.query("SELECT type,data FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token??null]);
  assert(rows.rows.length===1&&rows.rows[0].type==='telegram.outbound_requested'&&job.type==='telegram.outbound_requested'&&rows.rows[0].data.delivery_id===job.data.delivery_id,'WORKER_LEASE_LOST');
}
async function blocked(tx:PgTransaction,ticket:Entity,reason:string){
  await tx.save(ticket,{...ticket.data,status:'BLOCKED',error:reason,completed_at:new Date().toISOString()});
}
/** Persist SENDING before external I/O; an uncertain network result is never blindly resent. */
export async function processTelegramOutbound(
  db:Pick<Database,'transaction'>,engine:Engine,job:TelegramDeliveryJob,adapter?:TelegramBotAdapter,
  approvedConsentVersion?:string
):Promise<void>{
  assert(typeof job.data.delivery_id==='string'&&job.data.delivery_id.length===64,'VALIDATION_ERROR');
  const preflight:Pending=await db.transaction(job.company_id,service,async tx=>{
    await lease(tx,job);
    const ticket=await tx.get('telegram_delivery',job.data.delivery_id);
    if(['API_ACCEPTED','FAILED','BLOCKED','UNKNOWN','CANCELLED'].includes(ticket.data.status))return {kind:'skip'};
    if(ticket.data.status==='SENDING'){
      await tx.save(ticket,{...ticket.data,status:'UNKNOWN',error:'PROVIDER_OUTCOME_UNKNOWN',completed_at:new Date().toISOString()});
      return {kind:'skip'};
    }
    assert(ticket.data.status==='PENDING'&&ticket.data.provider==='TELEGRAM','INVALID_STATE');
    if(!adapter){await blocked(tx,ticket,'PROVIDER_DISABLED');return {kind:'skip'};}
    if(!approvedConsentVersion||typeof approvedConsentVersion!=='string'||approvedConsentVersion.length>128){
      await blocked(tx,ticket,'LEGAL_APPROVAL_REQUIRED');return {kind:'skip'};
    }
    const message=await tx.get('message',ticket.data.message_id),channel=await tx.get('channel',ticket.data.channel_id);
    if(message.data.channel_id!==channel.id||message.data.message_version!==ticket.data.message_version||message.data.deleted_at||
       message.data.source!=='HUMAN'||message.data.author_id!==ticket.data.operator_user_id||
       channel.data.type!=='PRIVATE_CUSTOMER_ASSISTANT'||channel.data.source_provider!=='TELEGRAM'||
       channel.data.handoff?.state!=='HUMAN_ACTIVE'||channel.data.handoff?.owner_id!==message.data.author_id||
       !('text' in message.data)||typeof message.data.text!=='string'||message.data.text.length<1||message.data.text.length>4096){
      await blocked(tx,ticket,'SOURCE_OR_AUTHORITY_CHANGED');return {kind:'skip'};
    }
    let operator:Awaited<ReturnType<Engine['actorIn']>>,recipient:Awaited<ReturnType<Engine['actorIn']>>;
    try{
      operator=await engine.actorIn(tx,ticket.data.operator_user_id);recipient=await engine.actorIn(tx,ticket.data.recipient_user_id);
      if(operator.companyId!==job.company_id||recipient.companyId!==job.company_id||
         !operator.roles.some(role=>['OWNER','DIRECTOR','OPERATIONS_MANAGER','DISPATCHER'].includes(role))||
         !await engine.visible(tx,recipient,message))throw new Error('CURRENT_SCOPE_DENIED');
    }catch{await blocked(tx,ticket,'CURRENT_SCOPE_DENIED');return {kind:'skip'};}
    const current=Date.now();
    const member=(channel.data.members??[]).filter((m:Data)=>m.user_id===recipient.userId&&m.external===true&&activeMember(m,current));
    const identities=(await tx.list('contact_identity')).filter(i=>i.data.type==='TELEGRAM'&&i.data.userId===recipient.userId&&i.data.active!==false&&i.data.verified===true&&!i.data.revoked_at&&!i.data.revokedAt&&(!i.data.expiresAt||Date.parse(i.data.expiresAt)>current));
    const chatIds=[...new Set(identities.map(i=>i.data.value))];
    if(member.length!==1||chatIds.length!==1||!digits(chatIds[0])){
      await blocked(tx,ticket,'RECIPIENT_UNVERIFIED');return {kind:'skip'};
    }
    const settings=(await tx.list('notification_setting')).filter(s=>s.data.user_id===recipient.userId);
    if(settings.length!==1||settings[0].data.telegram_consent!==true||settings[0].data.telegram_opted_out===true||
       settings[0].data.telegram_consent_version!==approvedConsentVersion){
      await blocked(tx,ticket,'CHANNEL_CONSENT_REQUIRED');return {kind:'skip'};
    }
    await tx.save(ticket,{...ticket.data,status:'SENDING',sending_job_id:job.id,sending_lease_hash:digest(job.lease_token??''),started_at:new Date().toISOString()});
    return {kind:'send',deliveryId:ticket.id,chatId:chatIds[0],text:message.data.text,recipientId:recipient.userId};
  });
  if(preflight.kind==='skip')return;
  let outcome:{provider_message_id:string;status:'API_ACCEPTED'}|undefined,errorCode:string|undefined;
  try{outcome=await adapter!.sendText(preflight.chatId,preflight.text,{consent:true,verifiedPrivateRecipient:true});}
  catch(error){errorCode=error instanceof TelegramBoundaryError?error.code:'PROVIDER_OUTCOME_UNKNOWN';}
  await db.transaction(job.company_id,service,async tx=>{
    await lease(tx,job);
    const row=await tx.get('telegram_delivery',preflight.deliveryId);
    assert(row.data.status==='SENDING'&&row.data.sending_job_id===job.id&&row.data.sending_lease_hash===digest(job.lease_token??''),'WORKER_LEASE_LOST');
    await tx.save(row,{...row.data,status:outcome?'API_ACCEPTED':errorCode==='PROVIDER_OUTCOME_UNKNOWN'?'UNKNOWN':errorCode==='PROVIDER_UNAVAILABLE'?'FAILED':'BLOCKED',
      ...(outcome?{provider_message_id:outcome.provider_message_id}:{error:errorCode??'PROVIDER_OUTCOME_UNKNOWN'}),completed_at:new Date().toISOString()});
  });
}
