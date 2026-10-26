import {createHash} from 'node:crypto';
import {assert,DomainError,type Data,type Entity,type Transaction} from '../../packages/domain/core.ts';
import type {Engine} from '../api/engine.ts';
import type {SupportedLanguage} from '../../packages/integrations/deepseek.ts';
import {telegramPublicIntent,telegramPublicReply} from '../../packages/integrations/telegram-public-navigation.ts';

/** Opt-in, private, deterministic navigation. It never grants identity/owner rights. */
const digest=(...items:string[])=>createHash('sha256').update(items.join('\u0000')).digest('hex');
const safeId=(v:unknown)=>typeof v==='string'&&/^[1-9][0-9]{0,15}$/.test(v);
const current=(entity:Entity,now:number)=>entity.data.active!==false&&entity.data.verified===true&&
  !entity.data.revokedAt&&!entity.data.revoked_at&&
  (!entity.data.expiresAt||Date.parse(entity.data.expiresAt)>now)&&
  (!entity.data.expires_at||Date.parse(entity.data.expires_at)>now);
const activeMember=(m:Data,now:number)=>m.active!==false&&!m.revoked_at&&!m.revokedAt&&
  !m.left_at&&!m.leftAt&&!m.removed_at&&!m.removedAt&&
  (!m.expiresAt||Date.parse(m.expiresAt)>now)&&(!m.expires_at||Date.parse(m.expires_at)>now);
export interface TelegramPublicReplyOptions {
  publicOrigin?:string;
  approvedConsentVersion?:string;
  now:string;
}
export type TelegramPublicStaging={status:'NOT_APPLICABLE'}|{status:'PENDING';delivery_id:string};
type PublicPreparation={status:'BLOCKED';reason:string}|
  {status:'READY';chatId:string;text:string;recipientId:string};

/** Called inside the existing inbound transaction, BEFORE saving it as PROCESSED.
 * Its source argument contains the future PROCESSED record. An outbox event and
 * the updated input are committed or rolled back together.
 */
export async function stageTelegramPublicReplyIn(tx:Transaction,source:Entity,
  opts:TelegramPublicReplyOptions):Promise<TelegramPublicStaging> {
  if(!opts.publicOrigin||!opts.approvedConsentVersion)return {status:'NOT_APPLICABLE'};
  if(source.kind!=='conversation_input'||source.data.provider!=='TELEGRAM'||
     source.data.status!=='PROCESSED')return {status:'NOT_APPLICABLE'};
  const input=source.data.input, intent=telegramPublicIntent(input?.text);
  if(!intent||input?.kind!=='MESSAGE'||input.id!==source.data.provider_event_id||
     input.chat_id!==input.sender||!safeId(input.sender))return {status:'NOT_APPLICABLE'};
  const nowMs=Date.parse(opts.now);
  assert(Number.isFinite(nowMs),'VALIDATION_ERROR');
  const user=await tx.get('user',source.data.user_id);
  if(user.companyId!==source.companyId||user.data.active!==true||user.data.guest!==true||
     !Array.isArray(user.data.roles)||user.data.roles.length!==1||user.data.roles[0]!=='GUEST')
    return {status:'NOT_APPLICABLE'};
  const identities=(await tx.list('contact_identity')).filter(x=>x.companyId===source.companyId&&
    x.data.type==='TELEGRAM'&&x.data.value===input.sender&&current(x,nowMs));
  if(identities.length!==1||identities[0]!.data.userId!==user.id)return {status:'NOT_APPLICABLE'};
  const settings=(await tx.list('notification_setting')).filter(x=>x.data.user_id===user.id);
  if(settings.length!==1||settings[0]!.data.telegram_consent!==true||
     settings[0]!.data.telegram_opted_out===true||
     settings[0]!.data.telegram_consent_version!==opts.approvedConsentVersion)
    return {status:'NOT_APPLICABLE'};
  const locale=settings[0]!.data.language as SupportedLanguage;
  const language=(['DE','UK','RU','PL','LT','EN'].includes(locale)?locale:'DE') as SupportedLanguage;
  const response=telegramPublicReply(intent,language,opts.publicOrigin);
  const id=digest('knaba-telegram-public-v1',source.companyId,source.id,user.id);
  try{
    const old=await tx.get('telegram_delivery',id);
    assert(old.companyId===source.companyId&&old.data.purpose==='PUBLIC_NAVIGATION'&&
      old.data.source_input_id===source.id&&old.data.recipient_user_id===user.id,'ACCESS_DENIED');
    return {status:'PENDING',delivery_id:old.id};
  }catch(e){if(!(e instanceof DomainError&&e.code==='NOT_FOUND_SAFE'))throw e;}
  const row=await tx.add('telegram_delivery',{
    purpose:'PUBLIC_NAVIGATION',provider:'TELEGRAM',source_input_id:source.id,
    channel_id:source.data.channel_id,recipient_user_id:user.id,
    response_hash:digest(response),public_intent:intent,public_origin:opts.publicOrigin,
    language,created_at:opts.now,status:'PENDING'
  },id);
  await tx.event('telegram.outbound_requested',{delivery_id:row.id});
  return {status:'PENDING',delivery_id:row.id};
}

/** Fresh-bound authority and output revalidation before setting SENDING.
 * Caller owns leased transaction, status transitions, and actual provider I/O.
 */
export async function prepareTelegramPublicReplyIn(tx:Transaction,engine:Engine,ticket:Entity,
  opts:TelegramPublicReplyOptions):Promise<PublicPreparation>{
  const deny=(reason:string):PublicPreparation=>({status:'BLOCKED',reason});
  if(!opts.publicOrigin||!opts.approvedConsentVersion||ticket.data.public_origin!==opts.publicOrigin)
    return deny('PROVIDER_OR_ORIGIN_UNCONFIGURED');
  const nowMs=Date.parse(opts.now);
  if(!Number.isFinite(nowMs)||!Number.isFinite(Date.parse(ticket.data.created_at))||
     Date.parse(ticket.data.created_at)>nowMs+30000||nowMs-Date.parse(ticket.data.created_at)>900000)
    return deny('PUBLIC_REPLY_EXPIRED');
  try {
    const source=await tx.get('conversation_input',ticket.data.source_input_id);
    if(source.companyId!==ticket.companyId||source.data.status!=='PROCESSED'||
       source.data.provider!=='TELEGRAM'||source.data.user_id!==ticket.data.recipient_user_id||
       source.data.channel_id!==ticket.data.channel_id)return deny('SOURCE_CHANGED');
    const input=source.data.input,intent=telegramPublicIntent(input?.text);
    if(!intent||intent!==ticket.data.public_intent||input?.kind!=='MESSAGE'||
       input.id!==source.data.provider_event_id||input.chat_id!==input.sender||!safeId(input.sender))
      return deny('SOURCE_CHANGED');
    const user=await tx.get('user',ticket.data.recipient_user_id);
    const actor=await engine.actorIn(tx,user.id);
    if(user.companyId!==ticket.companyId||user.data.active!==true||user.data.guest!==true||
      JSON.stringify(user.data.roles)!=='["GUEST"]'||actor.roles.length!==1||actor.roles[0]!=='GUEST'||
      actor.siteIds.length||actor.customerIds.length||actor.warehouseIds.length)
      return deny('ROLE_CHANGED');
    const channel=await tx.get('channel',source.data.channel_id);
    if(channel.companyId!==ticket.companyId||channel.data.type!=='PRIVATE_CUSTOMER_ASSISTANT'||
       channel.data.source_provider!=='TELEGRAM'||channel.data.created_by!==user.id||
       !(channel.data.members??[]).some((m:Data)=>m.user_id===user.id&&m.external===true&&activeMember(m,nowMs)))
      return deny('CHANNEL_REVOKED');
    const matches=(await tx.list('contact_identity')).filter(x=>x.companyId===ticket.companyId&&
      x.data.type==='TELEGRAM'&&x.data.value===input.sender&&current(x,nowMs));
    if(matches.length!==1||matches[0]!.data.userId!==user.id)return deny('RECIPIENT_REVOKED');
    const settings=(await tx.list('notification_setting')).filter(x=>x.data.user_id===user.id);
    if(settings.length!==1||settings[0]!.data.telegram_consent!==true||
       settings[0]!.data.telegram_opted_out===true||
       settings[0]!.data.telegram_consent_version!==opts.approvedConsentVersion||
       settings[0]!.data.language!==ticket.data.language)return deny('CHANNEL_CONSENT_REQUIRED');
    const text=telegramPublicReply(intent,ticket.data.language,opts.publicOrigin);
    if(digest(text)!==ticket.data.response_hash)return deny('REPLY_TAMPERED');
    return {status:'READY',chatId:input.sender,text,recipientId:user.id};
  }catch{return deny('PUBLIC_REPLY_RECHECK_FAILED');}
}
