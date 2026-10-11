import {queueHandoffSla} from '../../packages/domain/handoff-calendar.ts';
import {processIntegrationOutbound} from '../api/integration-outbound.ts';
import {processHandoffReminder} from './handoff-reminder.ts';
import type {IntegrationWebhookAdapter} from '../../packages/integrations/outbound-webhook.ts';
import {processWorkNotifications} from '../../packages/domain/work-notifications.ts';
import {authorizeDigestPolicy,digestScopeAllowed,policyDue} from '../../packages/domain/operations-digest.ts';
import {automationScheduleDue} from '../../packages/domain/automation-schedule.ts';
import {authorizeAutomationRun} from '../../packages/domain/automation-authority.ts';
import {aiBudgetHeadroom,type AiCategory} from '../../packages/integrations/assistant-playground.ts';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {WhatsAppRouter} from '../../packages/integrations/whatsapp-router.ts';
import {assistantToolCatalog,dispatchAssistantTools} from '../../packages/integrations/assistant-tools.ts';
import {assistantToolHost} from '../api/assistant-runtime.ts';
import {internalAssistantHost} from '../api/internal-assistant.ts';
import {prepareInternalAssistant,revalidateInternalAssistant,persistInternalAssistantDraft,failInternalAssistant,markInternalAssistantUnknown} from '../../packages/integrations/internal-assistant.ts';
import {createPrivateBlobStore} from '../../packages/storage/index.ts';
import {preparePrivateMedia,ingestPrivateMedia} from '../../packages/storage/media-ingest.ts';
import {processPrivacyBlobDeletion} from '../api/privacy-erasure.ts';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Database, PgTransaction } from '../api/database.ts';
import type { Engine } from '../api/engine.ts';
import { assert, DomainError, type Actor, type Data, type Entity } from '../../packages/domain/core.ts';
import { whatsAppPolicy, isQuietHour } from '../../packages/domain/communications.ts';
import {DEFAULT_QUIET_START,DEFAULT_QUIET_END,nextQuietWindowEnd,safeRetryDelayMs,projectDeliveryNotifications,deliveryDecision,type DeliveryFailureClass} from '../../packages/domain/notification-policy.ts';
import { DeepSeekAdapter, WhatsAppCloudAdapter, type WhatsAppInbound, type WhatsAppOutput, type SupportedLanguage } from '../../packages/integrations/index.ts';

export interface OutboxJob {id:string;company_id:string;type:string;data:Data;attempts:number;leased_until:string|Date;lease_token?:string;}
export interface SqlRunner {query:(statement:string,params?:unknown[])=>Promise<{rows:any[]}>;}
export interface WorkerOptions {integrationWebhook?:IntegrationWebhookAdapter;companyId:string;appMode:string;batchSize?:number;leaseMs?:number;maxAttempts?:number;now?:()=>Date;ai?:DeepSeekAdapter;whatsapp?:WhatsAppCloudAdapter;testRecipients?:string[];publicOrigin?:string;whatsappCapabilities?:{accountVerified:boolean;buttons:boolean;lists:boolean};}
const key=(...values:string[])=>createHash('sha256').update(values.join('\u0000')).digest('hex');
const at=(value:string|Date)=>new Date(value).toISOString();
export const serviceId='knaba-integration-service';
const servicePermissions=['integration.process','automation.execute','chat.read','chat.write','translation.use','notifications.manage','report.create','scope.company'];
export class DeferredJob extends Error {constructor(public availableAt:string){super('NOT_DUE');}}
export const retryDelayMs=safeRetryDelayMs;
export function retryable(error:unknown){return !(error instanceof DomainError)||error.code==='PROVIDER_UNAVAILABLE'&&error.details.retryable===true&&error.details.failure_class!=='UNKNOWN';}
export async function leaseOutbox(db:SqlRunner,limit=10,leaseMs=120000,companyId?:string):Promise<OutboxJob[]> {
  assert(Number.isInteger(limit)&&limit>=1&&limit<=100&&leaseMs>=10000&&leaseMs<=600000,'VALIDATION_ERROR');
  const result=await db.query(`WITH picked AS (
    SELECT id FROM outbox WHERE ($3::text IS NULL OR company_id=$3) AND ((status IN ('PENDING','RETRY_SCHEDULED') AND available_at<=now()) OR (status='RUNNING' AND leased_until<now()))
    ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT $1
  ) UPDATE outbox o SET status='RUNNING',attempts=o.attempts+1,lease_token=gen_random_uuid()::text,leased_until=clock_timestamp()+($2::int*interval '1 millisecond')
    FROM picked WHERE o.id=picked.id RETURNING o.*`,[limit,leaseMs,companyId??null]);
  return result.rows;
}
export async function finishOutbox(db:SqlRunner,job:OutboxJob,status:'SUCCEEDED'|'FAILED'|'CANCELLED'|'RETRY_SCHEDULED',error?:string,availableAt?:string) {
  const result=await db.query(`UPDATE outbox SET status=$1,last_error=$2,attempts=CASE WHEN $2='NOT_DUE' THEN GREATEST(attempts-1,0) ELSE attempts END,available_at=COALESCE($3::timestamptz,available_at),finished_at=CASE WHEN $1 IN ('SUCCEEDED','FAILED','CANCELLED') THEN now() ELSE NULL END,leased_until=NULL
    WHERE id=$4 AND status='RUNNING' AND lease_token=$5 AND leased_until>clock_timestamp() RETURNING id`,[status,error??null,availableAt??null,job.id,job.lease_token??null]);
  return result.rows.length===1;
}
export function automationMatches(rule:Data,event:{type:string;data:Data},now:string){return rule.status==='ACTIVE'&&Boolean(rule.approvedBy)&&Date.parse(rule.activeFrom)<=Date.parse(now)&&rule.trigger===event.type&&Object.entries(rule.filters??{}).every(([k,v])=>event.data[k]===v)&&(!(rule.scope?.siteIds?.length)||rule.scope.siteIds.includes(event.data.siteId))&&(!(rule.scope?.customerIds?.length)||rule.scope.customerIds.includes(event.data.customerId));}
export function berlinParts(date:Date){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(parts.map(p=>[p.type,p.value])) as Record<string,string>;}
/** The same bounded Berlin schedule is validated during configuration and execution. */
export function scheduleDue(cron:string,now:Date){return automationScheduleDue(cron,now);}

export class WorkerRunner {
  private stopping=false;private running=false;private lastScheduleMinute='';
  readonly now:()=>Date;
  constructor(public db:Database,public engine:Engine,public options:WorkerOptions){this.now=options.now??(()=>new Date());}
  async initialize(){await this.db.query('SELECT knaba_assert_gps_storage_safe()');await this.db.transaction(this.options.companyId,'WORKER_BOOT',async tx=>{const users=await tx.list('user');const user=users.find(u=>u.id===serviceId);if(!user)await tx.add('user',{name:'KNABA DE integration worker',roles:['SERVICE_ACCOUNT'],permissions:servicePermissions,active:true,siteIds:[],customerIds:[],warehouseIds:[],credentialDisabled:true},serviceId);else assert(user.data.roles.includes('SERVICE_ACCOUNT')&&user.data.active!==false,'ACCESS_DENIED');});}
  async actor(companyId:string){return this.engine.getActor(serviceId,companyId);}
  async command(job:OutboxJob,name:string,input:Data,suffix=name,actor?:Actor){return this.engine.execute(actor??await this.actor(job.company_id),name,{input,idempotency_key:key('worker',job.id,suffix),...(job.lease_token?{worker_lease:{id:job.id,token:job.lease_token}}:{})});}
  private async entity(job:OutboxJob,kind:string,id:string){return this.db.transaction(job.company_id,serviceId,tx=>tx.get(kind,id));}
  private async record(job:OutboxJob,kind:string,id:string,update:(entity:Entity,tx:PgTransaction)=>Promise<Data>|Data){return this.db.transaction(job.company_id,serviceId,async tx=>{const entity=await tx.get(kind,id);return tx.save(entity,await update(entity,tx));});}
  async tick(){if(this.running||this.stopping)return {processed:0};this.running=true;let processed=0;try{await this.db.query('SELECT knaba_purge_gps($1::timestamptz,500,$2::text) AS purged',[this.now().toISOString(),this.options.companyId]);await this.scheduled();const jobs=await leaseOutbox(this.db,this.options.batchSize??5,this.options.leaseMs??120000,this.options.companyId);await Promise.all(jobs.map(async job=>{if(this.stopping)return;await this.process(job);processed++;}));return {processed};}finally{this.running=false;}}
  stop(){this.stopping=true;}
  async process(job:OutboxJob){let leaseLost=false;let renewing:Promise<void>|undefined;const leaseMs=this.options.leaseMs??120000;
    const heartbeat=setInterval(()=>{if(renewing)return;renewing=this.db.query(`UPDATE outbox SET leased_until=clock_timestamp()+($1::int*interval '1 millisecond') WHERE id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() RETURNING leased_until`,[leaseMs,job.id,job.lease_token??null]).then(r=>{if(r.rows[0])job.leased_until=r.rows[0].leased_until;else leaseLost=true;}).catch(()=>{leaseLost=true;}).finally(()=>{renewing=undefined;});},Math.floor(leaseMs/3));heartbeat.unref();
    const finish=async(status:'SUCCEEDED'|'FAILED'|'CANCELLED'|'RETRY_SCHEDULED',error?:string,availableAt?:string)=>{clearInterval(heartbeat);await renewing;if(!leaseLost)await finishOutbox(this.db,job,status,error,availableAt);};
    try{if(job.data.not_before&&Date.parse(job.data.not_before)>this.now().getTime())throw new DeferredJob(job.data.not_before);assert(job.attempts<=(this.options.maxAttempts??4),'RETRY_LIMIT_EXHAUSTED');await this.handle(job);const workNotice=await processWorkNotifications(this.db,this.engine,job,this.now().toISOString());await this.applyRules(job);await finish('SUCCEEDED',workNotice.status==='NO_CURRENT_RECIPIENT'?'WORK_NOTIFICATION_NO_CURRENT_RECIPIENT':undefined);}
    catch(error){if(error instanceof DeferredJob)await finish('RETRY_SCHEDULED','NOT_DUE',error.availableAt);else {const code=error instanceof DomainError?error.code:'WORKER_ERROR';const retry=job.attempts<(this.options.maxAttempts??4)&&retryable(error);await finish(retry?'RETRY_SCHEDULED':'FAILED',code,retry?new Date(this.now().getTime()+retryDelayMs(job.attempts)).toISOString():undefined);}}finally{clearInterval(heartbeat);}}
  async handle(job:OutboxJob){switch(job.type){
    case 'whatsapp.inbound':case 'whatsapp.webhook_received':return this.inbound(job);
    case 'whatsapp.router_response':return this.routerResponse(job);
    case 'integration.outbound_requested':return processIntegrationOutbound(this.db,this.engine,job,this.options.integrationWebhook,this.now);
    case 'handoff.manager_reminder':{const result=await processHandoffReminder(this.db,this.engine,job,this.now().toISOString());if(result.status==='DEFERRED')throw new DeferredJob(result.notBefore);return result;}
    case 'privacy.blob_delete':return processPrivacyBlobDeletion(this.db,this.engine,createPrivateBlobStore(this.db),job);
    case 'translation.requested':return this.translation(job);
    case 'translation.ready':return this.translationReady(job);
    case 'message.created':case 'message.corrected':return this.messageCreated(job);
    case 'delivery.requested':return this.delivery(job);
    case 'notification.scheduled':return this.notification(job);
    case 'assistant.answer_requested':return this.answer(job);
    case 'internal_assistant.requested':return this.internalDraft(job);
    case 'automation.action_requested':return this.automationAction(job);
    case 'digest.requested':return this.operationsDigest(job);
    case 'task.calendar_requested':return this.calendar(job);
    case 'report.daily_requested':return this.command(job,'report.daily_draft',{siteId:job.data.siteId,orderId:job.data.orderId,day:job.data.day});
    default:return;
  }}
  private async currentlyReadable(tx:PgTransaction,userId:string,message:Entity){try{const actor=await this.engine.actorIn(tx,userId);return actor.permissions.includes('chat.read')&&await this.engine.visible(tx,actor,message);}catch{return false;}}
  private async internalDraft(job:OutboxJob){
    assert(['DEMO','TEST','PRODUCTION'].includes(this.options.appMode),'MISSING_CONFIGURATION');
    const host=internalAssistantHost(this.db,this.engine,this.options.appMode as 'DEMO'|'TEST'|'PRODUCTION',this.now,async tx=>{
      assert(tx.query,'MISSING_CONFIGURATION');
      const lease=await tx.query("SELECT id FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token??null]);assert(lease.rows.length===1,'WORKER_LEASE_LOST');
    });
    let providerStarted=false,providerReturned=false,budgetReserved=false,usage:{input_tokens:number;output_tokens:number;cost_cents:number}|undefined;
    try{
      const prepared=await prepareInternalAssistant(job.company_id,job.data.requestId,host);if(prepared.done)return;
      if(!this.options.ai||prepared.config.data.provider!=='DEEPSEEK'){await failInternalAssistant(job.company_id,job.data.requestId,'PROVIDER_DISABLED',host);return;}
      const budget=await this.reserveBudget(job,prepared.config,prepared.providerInput.text,'INTERNAL_DRAFT');budgetReserved=true;
      await revalidateInternalAssistant(job.company_id,job.data.requestId,prepared.contextHash,host);
      await this.activeJob(job);providerStarted=true;
      const result=await this.options.ai.proposeInternalDraft({...prepared.providerInput,budgetRemainingCents:budget});providerReturned=true;usage=result.usage;
      await persistInternalAssistantDraft(job.company_id,job.data.requestId,prepared.contextHash,result,host);
      await this.settleBudget(job,usage?.cost_cents,usage);
    }catch(error){
      const reason=error instanceof DomainError?error.code:'PROVIDER_UNAVAILABLE';
      if(providerStarted&&!providerReturned){
        if(reason!=='WORKER_LEASE_LOST')await markInternalAssistantUnknown(job.company_id,job.data.requestId,reason,host);
      }else if(reason!=='WORKER_LEASE_LOST'){
        await failInternalAssistant(job.company_id,job.data.requestId,reason,host);
      }
      if(providerReturned)await this.settleBudget(job,usage?.cost_cents,usage);
      else if(!providerStarted&&budgetReserved)await this.settleBudget(job,0,{input_tokens:0,output_tokens:0},'CANCELLED');
      // A leased retry sees RUNNING and must never repeat an uncertain provider request.
      throw error;
    }
  }
  private async translation(job:OutboxJob){const t=await this.entity(job,'translation',job.data.translation_id);if(t.data.status!=='PENDING')return;const allowed=await this.db.transaction(job.company_id,serviceId,async tx=>{const message=await tx.get('message',t.data.message_id);if(message.data.message_version!==t.data.message_version||message.data.deleted_at)return false;for(const request of await tx.list('translation_request'))if(request.data.translation_id===t.id&&request.data.status!=='CANCELLED'&&await this.currentlyReadable(tx,request.data.user_id,message))return true;return false;});if(!allowed){await this.record(job,'translation',t.id,e=>({...e.data,status:'CANCELLED',error:'ACCESS_REVOKED',completed_at:this.now().toISOString()}));return;}
    const config=await this.db.transaction(job.company_id,serviceId,async tx=>(await tx.list('assistant_config')).find(c=>c.data.status==='ACTIVE'&&c.data.provider==='DEEPSEEK'));
    if(!this.options.ai||!config)return this.command(job,'translation.result',{translation_id:t.id,status:'FAILED',provider:t.data.provider,model:t.data.model,error:'PROVIDER_DISABLED'});
    try{const budget=await this.reserveBudget(job,config,t.data.source_text);await this.activeJob(job);const result=await this.options.ai.translate({text:t.data.source_text,sourceLanguage:t.data.source_language,targetLanguage:t.data.target_language,glossary:t.data.glossary,canonicalFacts:t.data.canonical_facts,synthetic:['DEMO','TEST'].includes(this.options.appMode)&&config.data.testOnly===true,budgetRemainingCents:budget});await this.activeJob(job);await this.command(job,'translation.result',{translation_id:t.id,status:'SUCCEEDED',text:result.text,provider:result.provider,model:result.model,usage:result.usage});await this.settleBudget(job,result.usage?.cost_cents,result.usage);}
    catch(error){return this.command(job,'translation.result',{translation_id:t.id,status:'FAILED',provider:t.data.provider,model:t.data.model,error:error instanceof DomainError?error.code:'PROVIDER_UNAVAILABLE'});}}
  private async translationReady(job:OutboxJob){await this.db.transaction(job.company_id,serviceId,async tx=>{const translation=await tx.get('translation',job.data.translation_id),request=await tx.get('translation_request',job.data.request_id),message=await tx.get('message',job.data.message_id);if(request.data.status==='CANCELLED')return;if(translation.data.status!=='SUCCEEDED'||message.data.message_version!==translation.data.message_version||!await this.currentlyReadable(tx,job.data.recipient_id,message)){await tx.save(request,{...request.data,status:'CANCELLED'});return;}const id=key('translated-copy',job.id);if((await tx.list('notification')).some(n=>n.id===id))return;await tx.add('notification',{recipient_id:job.data.recipient_id,event:'TRANSLATION_READY',category:'CHAT',channel:'WEB',status:'SUCCEEDED',translation_id:translation.id,message_id:message.id,message_version:translation.data.message_version,machine_translation:true,language:translation.data.target_language,attempts:1,max_attempts:1},id);});}
  private async reserveBudget(job:OutboxJob,config:Entity,_text:string,category:AiCategory=job.type==='translation.requested'?'TRANSLATION':'CUSTOMER_ASSISTANT',guard?:(tx:PgTransaction)=>Promise<void>){
    return this.db.transaction(job.company_id,serviceId,async tx=>{
      await guard?.(tx);
      const current=await tx.get('assistant_config',config.id);assert(current.data.status==='ACTIVE'&&current.version===config.version,'VERSION_CONFLICT');
      const synthetic=['DEMO','TEST'].includes(this.options.appMode)&&current.data.testOnly===true;
      if(!synthetic){assert(current.data.transferApprovalId,'NEEDS_APPROVAL');const approval=await tx.get('legal_approval',current.data.transferApprovalId);assert(approval.data.status==='APPROVED'&&approval.data.subject==='AI_TRANSFER'&&approval.data.active!==false&&(!approval.data.expiresAt||Date.parse(approval.data.expiresAt)>this.now().getTime()),'NEEDS_APPROVAL');}
      const usage=await tx.list('ai_usage');assert(!usage.some(u=>u.data.event_id===job.id),'PROVIDER_OUTCOME_UNKNOWN');
      const headroom=aiBudgetHeadroom(current,usage,category,this.now().toISOString()),reserve=this.options.ai!.maximumCostCents('x'.repeat(180000))*2;
      assert(headroom.remainingCents>=reserve&&reserve>0,'AI_BUDGET_EXHAUSTED',{category});
      await tx.add('ai_usage',{config_id:config.id,config_version:config.version,event_id:job.id,category,currency:'EUR',initial_reserved_cents:reserve,reserved_cents:reserve,status:'RUNNING',cost_basis:'CONFIGURED_RATE_ESTIMATE',started_at:this.now().toISOString()});
      await guard?.(tx);
      return reserve;
    });
  }
  private async settleBudget(job:OutboxJob,actual?:number,tokens?:{input_tokens?:number;output_tokens?:number},status:'SUCCEEDED'|'CANCELLED'='SUCCEEDED'){
    if(actual!==undefined)assert(Number.isSafeInteger(actual)&&actual>=0,'VALIDATION_ERROR');
    for(const amount of [tokens?.input_tokens,tokens?.output_tokens])if(amount!==undefined)assert(Number.isSafeInteger(amount)&&amount>=0,'VALIDATION_ERROR');
    await this.db.transaction(job.company_id,serviceId,async tx=>{
      const usage=(await tx.list('ai_usage')).find(u=>u.data.event_id===job.id);
      if(usage)await tx.save(usage,{...usage.data,status,actual_cents:actual??null,reserved_cents:actual??usage.data.reserved_cents,input_tokens:tokens?.input_tokens??null,output_tokens:tokens?.output_tokens??null,cost_basis:'CONFIGURED_RATE_ESTIMATE',provider_reported_cost_available:false,...status==='CANCELLED'?{provider_invoked:false}:{},completed_at:this.now().toISOString()});
    });
  }
  private async messageCreated(job:OutboxJob){const message=await this.entity(job,'message',job.data.message_id);if(message.data.deleted_at||message.data.message_version!==job.data.version)return;const channel=await this.entity(job,'channel',message.data.channel_id);for(const member of channel.data.members??[]){if(member.revoked_at||member.user_id===message.data.author_id||member.user_id===serviceId)continue;const recipient=await this.db.transaction(job.company_id,serviceId,async tx=>{if(!await this.currentlyReadable(tx,member.user_id,message))return;const actor=await this.engine.actorIn(tx,member.user_id);const preferences=(await tx.list('translation_preference')).filter(p=>p.data.user_id===member.user_id);const preference=preferences.find(p=>p.data.channel_id===channel.id)??preferences.find(p=>!p.data.channel_id);const settings=(await tx.list('notification_setting')).find(p=>p.data.user_id===member.user_id);return {actor,preference,settings};});if(!recipient)continue;
    await this.command(job,'delivery.prepare',{message_id:message.id,recipient_id:member.user_id,channel:'WEB'},`web:${member.user_id}`);
    if(recipient.settings?.data.whatsapp_consent===true&&!recipient.settings?.data.opted_out)await this.command(job,'delivery.prepare',{message_id:message.id,recipient_id:member.user_id,channel:'WHATSAPP'},`wa:${member.user_id}`);
    if(recipient.preference?.data.mode==='ORIGINAL_AND_AUTO'&&recipient.preference.data.target_language!==message.data.language&&recipient.actor.permissions.includes('translation.use'))await this.command(job,'translation.request',{message_id:message.id,target_language:recipient.preference.data.target_language},`translation:${member.user_id}`,recipient.actor);
  }}
  private async delivery(job:OutboxJob){
    const entity=await this.entity(job,'delivery',job.data.delivery_id);
    if(['API_ACCEPTED','SENT','DELIVERED','READ','FAILED','DEAD_LETTER','UNKNOWN','CANCELLED'].includes(entity.data.status))return;
    const snapshot=await this.db.transaction(job.company_id,serviceId,async tx=>{
      const checkLease=async()=>{const lease=await tx.query("SELECT id,type,data FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token??null]);assert(lease.rows.length===1,'WORKER_LEASE_LOST');assert(lease.rows[0].type==='delivery.requested'&&job.type==='delivery.requested'&&lease.rows[0].data.delivery_id===job.data.delivery_id&&lease.rows[0].data.notice===job.data.notice&&lease.rows[0].data.not_before===job.data.not_before,'ACCESS_DENIED');};
      await checkLease();const service=await this.engine.actorIn(tx,serviceId);assert(service.companyId===job.company_id&&service.roles.includes('SERVICE_ACCOUNT')&&this.engine.scope(service,'integration.process').permissions.includes('integration.process'),'ACCESS_DENIED');
      const delivery=await tx.get('delivery',entity.id);
      if(delivery.data.status==='SENDING'){
        if(delivery.data.sending_job_id&&delivery.data.sending_lease_hash){const owner=await tx.query("SELECT id,lease_token FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND leased_until>clock_timestamp()",[job.company_id,delivery.data.sending_job_id]);if(owner.rows.length===1&&createHash('sha256').update(owner.rows[0].lease_token??'').digest('hex')===delivery.data.sending_lease_hash)return;}
        return {unknown:delivery.id};
      }
      if(!['PENDING','RETRY_SCHEDULED'].includes(delivery.data.status))return;
      if(delivery.data.scheduled_at&&Date.parse(delivery.data.scheduled_at)>this.now().getTime())throw new DeferredJob(delivery.data.scheduled_at);
      const message=await tx.get('message',delivery.data.message_id);
      if(message.data.message_version!==delivery.data.message_version||!await this.currentlyReadable(tx,delivery.data.recipient_id,message)){const cancelled=await tx.save(delivery,{...delivery.data,status:'CANCELLED',error:'ACCESS_REVOKED'});await projectDeliveryNotifications(tx,cancelled,this.now().toISOString());await checkLease();return;}
      const settings=(await tx.list('notification_setting')).find(s=>s.data.user_id===delivery.data.recipient_id);
      const template=delivery.data.approved_template?(await tx.list('whatsapp_template')).find(t=>t.data.name===delivery.data.approved_template&&t.data.status==='APPROVED'):undefined;
      const policy=delivery.data.channel==='WEB'?{allowed:true,channel:'WEB' as const}:whatsAppPolicy({now:this.now().toISOString(),last_inbound_at:settings?.data.last_inbound_at,consent:settings?.data.whatsapp_consent===true,opted_out:settings?.data.opted_out,approved_template:template?.data.name,template_status:template?.data.status});
      if(!policy.allowed){const failed=await tx.save(delivery,{...delivery.data,status:'FAILED',error:policy.reason,failure_class:'DEFINITIVE'});await projectDeliveryNotifications(tx,failed,this.now().toISOString());await checkLease();return;}
      if(delivery.data.channel==='WHATSAPP'&&isQuietHour(this.now().toISOString(),settings?.data.quiet_start??DEFAULT_QUIET_START,settings?.data.quiet_end??DEFAULT_QUIET_END))throw new DeferredJob(nextQuietWindowEnd(this.now().toISOString(),settings?.data.quiet_start??DEFAULT_QUIET_START,settings?.data.quiet_end??DEFAULT_QUIET_END));
      const identities=(await tx.list('contact_identity')).filter(c=>c.data.userId===delivery.data.recipient_id&&c.data.verified&&c.data.active!==false&&['WHATSAPP','PHONE'].includes(c.data.type));
      const phones=[...new Set(identities.map(c=>String(c.data.value).replace(/[^\d]/g,'')))],phone=phones.length===1?phones[0]:undefined;
      if(delivery.data.channel==='WHATSAPP'){
        const error=!this.options.whatsapp?'PROVIDER_DISABLED':!phone?'RECIPIENT_UNVERIFIED':this.options.appMode!=='PRODUCTION'&&!this.options.testRecipients?.includes(phone)?'TEST_RECIPIENT_NOT_ALLOWED':undefined;
        if(error){const failed=await tx.save(delivery,{...delivery.data,status:'FAILED',error,failure_class:'DEFINITIVE'});await projectDeliveryNotifications(tx,failed,this.now().toISOString());await checkLease();return;}
        // Claim in the same leased transaction as fresh source/recipient/window checks.
        const claimed:Entity=await tx.save(delivery,{...delivery.data,status:'SENDING',provider_account_id:this.options.whatsapp!.phoneNumberId,provider_recipient_phone:phone,attempts:(delivery.data.attempts??0)+1,sending_started_at:this.now().toISOString(),sending_job_id:job.id,sending_lease_hash:createHash('sha256').update(job.lease_token??'').digest('hex')});await projectDeliveryNotifications(tx,claimed,this.now().toISOString());await checkLease();
        return {delivery:claimed,message,policy,phone,language:settings?.data.language??'DE'};
      }
      return {delivery,message,policy,phone,language:settings?.data.language??'DE'};
    });
    if(!snapshot)return;if('unknown' in snapshot)return this.command(job,'delivery.status',{delivery_id:snapshot.unknown,status:'UNKNOWN',error:'PROVIDER_OUTCOME_UNKNOWN',failure_class:'UNKNOWN'});if(snapshot.delivery.data.channel==='WEB')return this.command(job,'delivery.status',{delivery_id:entity.id,status:'DELIVERED'});
    const output:WhatsAppOutput=snapshot.policy.kind==='TEMPLATE'?{kind:'TEMPLATE',name:snapshot.policy.template!,language:snapshot.language.toLowerCase()==='uk'?'uk':snapshot.language.toLowerCase(),approved:true,parameters:[this.options.publicOrigin??'https://knaba.example.invalid']}:{kind:'TEXT',text:`${job.data.notice==='CORRECTION'?'Korrektur · ':''}${snapshot.message.data.text}`.slice(0,4096)};
    let providerStarted=false;
    try{await this.activeJob(job);providerStarted=true;const result=await this.options.whatsapp!.send(snapshot.phone!,output,{kind:snapshot.policy.kind as 'TEXT'|'TEMPLATE',template:snapshot.policy.template});await this.command(job,'delivery.status',{delivery_id:entity.id,...result});}
    catch(error){
      if(error instanceof DomainError&&error.code==='WORKER_LEASE_LOST')throw error;
      const failure:DeliveryFailureClass=error instanceof DomainError?(error.details.failure_class??(error.code==='PROVIDER_UNAVAILABLE'&&providerStarted?'UNKNOWN':'DEFINITIVE')):'UNKNOWN';
      await this.command(job,'delivery.status',{delivery_id:entity.id,status:failure==='UNKNOWN'?'UNKNOWN':'FAILED',failure_class:failure,error:error instanceof DomainError?error.code:'PROVIDER_OUTCOME_UNKNOWN'});
    }
  }
  private async notification(job:OutboxJob){
    const existing=await this.entity(job,'notification',job.data.notification_id);
    if(['SUCCEEDED','FAILED','DEAD_LETTER','UNKNOWN','CANCELLED','AWAITING_DELIVERY'].includes(existing.data.status)||existing.data.delivery_id)return;
    const item=existing.data.status==='RUNNING'?existing:await this.command(job,'notifications.prepare',{notification_id:job.data.notification_id});if(!item?.id||item.data.status!=='RUNNING')return;
    const allowed=await this.db.transaction(job.company_id,serviceId,async tx=>{try{const actor=await this.engine.actorIn(tx,item.data.recipient_id);if(item.data.message_id&&!await this.currentlyReadable(tx,actor.userId,await tx.get('message',item.data.message_id)))return false;const current=await tx.get('notification',item.id);return current.data.status==='RUNNING'&&await this.engine.visible(tx,actor,current);}catch{return false;}});
    if(!allowed)return this.command(job,'notifications.invalidate',{notification_id:item.id,reason:'ACCESS_REVOKED'});
    if(item.data.channel==='WEB')return this.command(job,'notifications.complete',{notification_id:item.id,succeeded:true});
    if(!item.data.message_id)return this.command(job,'notifications.complete',{notification_id:item.id,succeeded:false,error:'WHATSAPP_MESSAGE_REQUIRED',failure_class:'DEFINITIVE'});
    const delivery=await this.command(job,'delivery.prepare',{message_id:item.data.message_id,recipient_id:item.data.recipient_id,channel:'WHATSAPP',approved_template:item.data.template,template_status:item.data.template_status},'notification-delivery');
    if(!delivery?.id)return this.command(job,'notifications.complete',{notification_id:item.id,succeeded:false,error:delivery.reason??'CHANNEL_POLICY',failure_class:'DEFINITIVE'});
    return this.command(job,'notifications.delivery_link',{notification_id:item.id,delivery_id:delivery.id});
  }

  private router(){return new WhatsAppRouter(this.db,this.engine,{mode:this.options.appMode as 'DEMO'|'TEST'|'PRODUCTION',systemActorId:serviceId,publicOrigin:this.options.publicOrigin,testRecipients:this.options.testRecipients,now:this.now,capabilities:this.options.whatsappCapabilities});}
  private async activeJob(job:OutboxJob){const r=await this.db.query("SELECT id FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp()",[job.company_id,job.id,job.lease_token??null]);assert(r.rows.length===1,'WORKER_LEASE_LOST');}
  private async answerJobGuard(tx:PgTransaction,job:OutboxJob){
    const held=await tx.query("SELECT type,data FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token??null]);
    assert(held.rows.length===1,'WORKER_LEASE_LOST');
    assert(job.type==='assistant.answer_requested'&&held.rows[0].type===job.type&&isDeepStrictEqual(held.rows[0].data,job.data),'ACCESS_DENIED');
    const service=await this.engine.actorIn(tx,serviceId);
    assert(service.companyId===job.company_id&&service.roles.includes('SERVICE_ACCOUNT')&&this.engine.scope(service,'integration.process').permissions.includes('integration.process'),'ACCESS_DENIED');
  }
  private async answerMembership(tx:PgTransaction,channel:Entity,message:Entity){
    const memberships=(channel.data.members??[]).filter((member:Data)=>member.user_id===serviceId);
    // First enrollment is allowed; a historical revocation is never a request
    // for the worker to grant itself access again.
    if(memberships.length)assert(memberships.some((member:Data)=>{
      const expiry=member.expires_at??member.expiresAt;
      return member.active!==false&&!member.revoked_at&&!member.revokedAt&&!member.left_at&&!member.leftAt&&!member.removed_at&&!member.removedAt&&(!expiry||Date.parse(expiry)>this.now().getTime());
    })&&await this.currentlyReadable(tx,serviceId,message),'ACCESS_DENIED');
  }
  private async answerSource(tx:PgTransaction,job:OutboxJob,expected?:{config:Entity;channel:Entity;message:Entity}){
    await this.answerJobGuard(tx,job);
    const config=await tx.get('assistant_config',job.data.configId),channel=await tx.get('channel',job.data.channelId),message=await tx.get('message',job.data.messageId);
    assert(message.data.channel_id===channel.id&&message.data.author_id===job.data.actorId&&['PRIVATE_CUSTOMER_ASSISTANT','SITE_CLIENT'].includes(channel.data.type),'ACCESS_DENIED');
    if(config.data.status!=='ACTIVE'||config.data.configVersion!==job.data.configVersion||channel.data.handoff?.state!=='AI_ACTIVE'||message.data.deleted_at||!await this.currentlyReadable(tx,job.data.actorId,message))return;
    if(channel.data.lead_id&&(await tx.get('lead',channel.data.lead_id)).data.ownership!=='AI_ACTIVE')return;
    await this.answerMembership(tx,channel,message);
    if(expected)assert(config.version===expected.config.version&&channel.version===expected.channel.version&&message.version===expected.message.version,'AI_SUPPRESSED');
    await this.answerJobGuard(tx,job);
    return {config,channel,message};
  }
  private async routerResponse(job:OutboxJob){
   const leased=async<T>(operation:(tx:PgTransaction)=>Promise<T>)=>this.db.transaction(job.company_id,serviceId,async tx=>{
    const check=async()=>{const held=await tx.query("SELECT id,type,data FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token??null]);assert(held.rows.length===1,'WORKER_LEASE_LOST');assert(held.rows[0].type==='whatsapp.router_response'&&job.type==='whatsapp.router_response'&&held.rows[0].data.response_id===job.data.response_id,'ACCESS_DENIED');};
    await check();const service=await this.engine.actorIn(tx,serviceId);assert(service.roles.includes('SERVICE_ACCOUNT')&&this.engine.scope(service,'integration.process').permissions.includes('integration.process'),'ACCESS_DENIED');const result=await operation(tx);await check();return result;
   });
   const prepared:{allowed:boolean;to?:string;output?:WhatsAppOutput;policy?:{kind:'TEXT'};response?:Entity}=await leased(async tx=>{
    const existing=await tx.get('whatsapp_router_response',job.data.response_id);
    if(existing.data.status==='SENDING'){
     if(existing.data.sending_job_id&&existing.data.sending_lease_hash){const owner=await tx.query("SELECT id,lease_token FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND leased_until>clock_timestamp()",[job.company_id,existing.data.sending_job_id]);if(owner.rows.length===1&&createHash('sha256').update(owner.rows[0].lease_token??'').digest('hex')===existing.data.sending_lease_hash)return {allowed:false};}
     await tx.save(existing,{...existing.data,status:'UNKNOWN',failure_class:'UNKNOWN',error:'PROVIDER_OUTCOME_UNKNOWN',completed_at:this.now().toISOString()});await deliveryDecision(tx,{routerResponseId:existing.id,reason:'NOTIFICATION_OUTCOME_UNKNOWN'},this.now().toISOString());return {allowed:false};
    }
    if(!['PENDING','RETRY_SCHEDULED'].includes(existing.data.status))return {allowed:false};
    if(existing.data.scheduled_at&&Date.parse(existing.data.scheduled_at)>this.now().getTime())throw new DeferredJob(existing.data.scheduled_at);
    if(!this.options.whatsapp){await tx.save(existing,{...existing.data,status:'BLOCKED',error:'PROVIDER_DISABLED',failure_class:'DEFINITIVE'});return {allowed:false};}
    const current=await this.router().prepareResponseIn(tx,existing.id);if(!current.allowed||!current.response||!current.to||!current.output||!current.policy)return {allowed:false};
    const claimed:Entity=await tx.save(current.response,{...current.response.data,status:'SENDING',provider_account_id:this.options.whatsapp!.phoneNumberId,provider_recipient_phone:current.to,attempts:(current.response.data.attempts??0)+1,sending_started_at:this.now().toISOString(),sending_job_id:job.id,sending_lease_hash:createHash('sha256').update(job.lease_token??'').digest('hex')});return {...current,response:claimed};
   });
   if(!prepared.allowed||!prepared.response||!prepared.to||!prepared.output||!prepared.policy)return;
   let providerStarted=false;
   try{await this.activeJob(job);providerStarted=true;const result=await this.options.whatsapp!.send(prepared.to,prepared.output,prepared.policy);await leased(async tx=>{const current=await tx.get('whatsapp_router_response',prepared.response!.id);assert(current.data.status==='SENDING'&&current.data.sending_job_id===job.id,'PROVIDER_OUTCOME_UNKNOWN');return tx.save(current,{...current.data,...result,provider_state:'ACCEPTED_BY_PROVIDER',completed_at:this.now().toISOString()});});}
   catch(error){
    if(error instanceof DomainError&&error.code==='WORKER_LEASE_LOST')throw error;
    const failure:DeliveryFailureClass=error instanceof DomainError?(error.details.failure_class??(error.code==='PROVIDER_UNAVAILABLE'&&providerStarted?'UNKNOWN':'DEFINITIVE')):'UNKNOWN';
    await leased(async tx=>{const current=await tx.get('whatsapp_router_response',prepared.response!.id);assert(current.data.status==='SENDING'&&current.data.sending_job_id===job.id,'PROVIDER_OUTCOME_UNKNOWN');const attempts=current.data.attempts??0,maxAttempts=Math.min(4,this.options.maxAttempts??4,current.data.max_attempts??4),retry=failure==='CONFIRMED_TRANSIENT'&&attempts<maxAttempts,status=failure==='UNKNOWN'?'UNKNOWN':retry?'RETRY_SCHEDULED':failure==='CONFIRMED_TRANSIENT'?'DEAD_LETTER':'FAILED',scheduled_at=retry?new Date(this.now().getTime()+safeRetryDelayMs(attempts)).toISOString():current.data.scheduled_at;
     const saved=await tx.save(current,{...current.data,status,failure_class:failure,error:error instanceof DomainError?error.code:'PROVIDER_OUTCOME_UNKNOWN',scheduled_at,completed_at:retry?null:this.now().toISOString()});if(retry)await tx.event('whatsapp.router_response',{response_id:current.id,not_before:scheduled_at});
     if(['UNKNOWN','DEAD_LETTER'].includes(status))await deliveryDecision(tx,{routerResponseId:current.id,reason:status==='UNKNOWN'?'NOTIFICATION_OUTCOME_UNKNOWN':'NOTIFICATION_DELIVERY_EXHAUSTED'},this.now().toISOString());return saved;});
   }
  }
  private async routerStatus(job:OutboxJob,input:Extract<WhatsAppInbound,{kind:'STATUS'}>){
   return this.db.transaction(job.company_id,serviceId,async tx=>{
    const check=async()=>{const held=await tx.query("SELECT id,type,data FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token??null]);assert(held.rows.length===1,'WORKER_LEASE_LOST');assert(['whatsapp.inbound','whatsapp.webhook_received'].includes(held.rows[0].type)&&held.rows[0].type===job.type&&held.rows[0].data.event_id===job.data.event_id,'ACCESS_DENIED');};
    await check();const service=await this.engine.actorIn(tx,serviceId);assert(service.roles.includes('SERVICE_ACCOUNT')&&this.engine.scope(service,'integration.process').permissions.includes('integration.process'),'ACCESS_DENIED');
    const source=await tx.query("SELECT payload FROM webhook_inbox WHERE provider='WHATSAPP' AND company_id=$1 AND event_id=$2",[job.company_id,job.data.event_id]);assert(source.rows.length===1&&JSON.stringify(source.rows[0].payload)===JSON.stringify(input),'ACCESS_DENIED');
    const order=['PENDING','API_ACCEPTED','SENT','DELIVERED','READ'];
    for(const response of await tx.list('whatsapp_router_response'))if(response.data.provider_message_id===input.id&&response.data.provider_account_id===input.phone_number_id&&response.data.provider_recipient_phone===input.recipient&&response.data.sender===input.recipient){
     if(input.status==='FAILED'&&['DELIVERED','READ'].includes(response.data.status))continue;
     if(input.status!=='FAILED'&&order.indexOf(input.status)<order.indexOf(response.data.status))continue;
     if(response.data.provider_received_at&&Date.parse(input.received_at)<Date.parse(response.data.provider_received_at))continue;
     if(response.data.status===input.status&&response.data.provider_received_at===input.received_at)continue;
     await tx.save(response,{...response.data,status:input.status,provider_received_at:input.received_at,provider_status_at:this.now().toISOString(),...input.status==='FAILED'?{failure_class:'DEFINITIVE',error:input.error_code?`META_${input.error_code}`:'META_DELIVERY_FAILED'}:{}});
    }
    await check();
   });
  }
  private async inbound(job:OutboxJob){const provider=job.data.provider??'WHATSAPP';const inbox=await this.db.query('SELECT payload FROM webhook_inbox WHERE provider=$1 AND event_id=$2 AND company_id=$3',[provider,job.data.event_id,job.company_id]);assert(inbox.rows.length===1,'NOT_FOUND_SAFE');const input=inbox.rows[0].payload as WhatsAppInbound;assert(input.kind==='MESSAGE'||input.kind==='STATUS','VALIDATION_ERROR');
    if(input.kind==='STATUS'){const matches=await this.db.transaction(job.company_id,serviceId,async tx=>(await tx.list('delivery')).filter(d=>d.data.provider_message_id===input.id));for(const d of matches)await this.command(job,'delivery.status',{delivery_id:d.id,status:input.status,provider_message_id:input.id,error:input.error_code?`META_${input.error_code}`:undefined},`status:${d.id}`);await this.routerStatus(job,input);return;}
    const route:Entity=await this.db.transaction(job.company_id,serviceId,async tx=>{const old=(await tx.list('conversation_input')).find(i=>i.data.provider_event_id===input.id);if(old)return old;const identities=(await tx.list('contact_identity')).filter(i=>['PHONE','WHATSAPP'].includes(i.data.type)&&i.data.active!==false&&i.data.verified&&String(i.data.value).replace(/[^\d]/g,'')===input.sender);const userIds=[...new Set(identities.map(i=>i.data.userId))];assert(userIds.length<=1,'AMBIGUOUS_RECIPIENT');let userId=userIds[0];if(!userId){const user=await tx.add('user',{name:'WhatsApp guest',roles:['GUEST','CLIENT'],permissions:['chat.read','chat.write','lead.create','lead.manage','commerce.read','translation.use'],siteIds:[],customerIds:[],warehouseIds:[],active:true,guest:true});userId=user.id;await tx.add('contact_identity',{type:'WHATSAPP',value:input.sender,userId,verified:true,active:true,verificationSource:'SIGNED_META_CHANNEL',verifiedAt:this.now().toISOString(),customerVerified:false});}
      const actor=await this.engine.actorIn(tx,userId);let channel:Entity|undefined;let replyId:string|undefined;if(input.context_message_id){const copies=(await tx.list('delivery')).filter(d=>d.data.provider_message_id===input.context_message_id&&d.data.recipient_id===userId);if(copies.length===1){const original=await tx.get('message',copies[0]!.data.message_id);if(await this.currentlyReadable(tx,userId,original)){channel=await tx.get('channel',original.data.channel_id);replyId=original.id;}}}
      if(!channel)channel=(await tx.list('channel')).find(c=>c.data.created_by===userId&&['PRIVATE_CUSTOMER_ASSISTANT','DIRECT'].includes(c.data.type));if(!channel){const external=actor.roles.some(r=>['CLIENT','CUSTOMER','GUEST'].includes(r));channel=await tx.add('channel',{type:external?'PRIVATE_CUSTOMER_ASSISTANT':'DIRECT',name:external?'Private WhatsApp consultation':'Private operator inbox',created_by:userId,members:[{user_id:userId,joined_at:this.now().toISOString(),history_from:this.now().toISOString(),external},{user_id:serviceId,joined_at:this.now().toISOString(),history_from:this.now().toISOString(),external:false}],handoff:{state:'AI_ACTIVE',owner_id:null}});}
      const setting=(await tx.list('notification_setting')).find(s=>s.data.user_id===userId);const language=setting?.data.language??'DE';return tx.add('conversation_input',{provider_event_id:input.id,provider:'WHATSAPP',user_id:userId,channel_id:channel.id,received_at:input.received_at,input,language,reply_to_id:replyId,status:'PENDING'});});
    if(route.data.status!=='PENDING')return;const actor=await this.engine.getActor(route.data.user_id,job.company_id);await this.command(job,'notifications.inbound',{user_id:actor.userId,received_at:input.received_at},'inbound-window');
    if(input.media&&!route.data.upload_id&&this.options.whatsapp){
     try{assert(actor.permissions.includes('media.upload'),'ACCESS_DENIED');await this.activeJob(job);const downloaded=await this.options.whatsapp.media(input.media.id,25*1024*1024);
     assert(downloaded.bytes.length===downloaded.metadata.file_size&&downloaded.metadata.mime_type===input.media.mime_type,'VALIDATION_ERROR',{reason:'PROVIDER_MEDIA_METADATA_MISMATCH'});
     const mediaInput={bytes:downloaded.bytes,mimeType:downloaded.metadata.mime_type,fileName:input.media.filename??`whatsapp-${input.id}`,sourceId:`WHATSAPP:${input.id}`,expectedSha256:downloaded.metadata.sha256};
     const prepared=await preparePrivateMedia(mediaInput);if(input.media.sha256)assert(input.media.sha256===prepared.sha256||input.media.sha256===Buffer.from(prepared.sha256,'hex').toString('base64'),'VALIDATION_ERROR',{reason:'SIGNED_MEDIA_CHECKSUM_MISMATCH'});
     await this.activeJob(job);await this.record(job,'conversation_input',route.id,async(e,tx)=>{const fresh=await this.engine.actorIn(tx,actor.userId);const upload=await ingestPrivateMedia(tx,createPrivateBlobStore(this.db),fresh,mediaInput,prepared);return {...e.data,upload_id:upload.id,media_state:'CLEAN_CONTEXT_REQUIRED'};});
     }catch(error){if(error instanceof DomainError&&(error.code==='WORKER_LEASE_LOST'||error.code==='PROVIDER_UNAVAILABLE'))throw error;await this.record(job,'conversation_input',route.id,e=>({...e.data,media_state:'MANUAL_REVIEW_REQUIRED',media_error:error instanceof DomainError?error.code:'MEDIA_PROCESSING_FAILED'}));}
    }
    const routed=await this.router().route(job.company_id,route.id);if(routed.handled)return;
    if(input.action_id){try{const action=await this.command(job,'callback.consume',{action_id:input.action_id},'callback',actor);if(action.action==='ACK')await this.command(job,'message.ack',{message_id:action.message_id},'callback-ack',actor);if(action.action==='TRANSLATE')await this.command(job,'translation.request',{message_id:action.message_id,target_language:action.target_language},'callback-translate',actor);await this.record(job,'conversation_input',route.id,e=>({...e.data,status:'PROCESSED',action,completed_at:this.now().toISOString()}));return;}catch(error){await this.record(job,'conversation_input',route.id,e=>({...e.data,status:'REJECTED',error:error instanceof DomainError?error.code:'INVALID_CALLBACK',completed_at:this.now().toISOString()}));return;}}
    if(input.type==='location'||input.media||!input.text){await this.record(job,'conversation_input',route.id,e=>({...e.data,status:'MANUAL_REVIEW',reason:input.type==='location'?'ONE_TIME_LOCATION_NOT_GPS_TRACKING':'MEDIA_UPLOAD_REQUIRES_QUARANTINE',completed_at:this.now().toISOString()}));return;}
    const message=await this.command(job,'message.send',{channel_id:route.data.channel_id,text:input.text,language:route.data.language,reply_to_id:route.data.reply_to_id},'inbound-message',actor);await this.record(job,'conversation_input',route.id,async(e,tx)=>{const channel=await tx.get('channel',route.data.channel_id);const config=(await tx.list('assistant_config')).find(c=>c.data.status==='ACTIVE');if(channel.data.type==='PRIVATE_CUSTOMER_ASSISTANT'&&channel.data.handoff?.state==='AI_ACTIVE'&&config?.data.provider==='DEEPSEEK')await tx.event('assistant.answer_requested',{channelId:channel.id,messageId:message.id,actorId:actor.userId,configId:config.id,configVersion:config.data.configVersion,language:route.data.language,sourceChannel:'WHATSAPP'});return {...e.data,status:'PROCESSED',message_id:message.id,router_state:channel.data.type==='PRIVATE_CUSTOMER_ASSISTANT'?'NEW_OR_EXISTING_CUSTOMER_MENU':'OPERATOR_INBOX',completed_at:this.now().toISOString()};});
  }
  private async answer(job:OutboxJob){const snapshot=await this.db.transaction(job.company_id,serviceId,async tx=>{const source=await this.answerSource(tx,job);if(!source)return;const {config,channel,message}=source;
    const docs=await tx.list('knowledge');const sources=docs.filter(d=>config.data.knowledgeIds.includes(d.id)&&d.data.status==='APPROVED'&&Date.parse(d.data.validFrom??d.data.effective_at)<=this.now().getTime()&&(!d.data.validUntil||Date.parse(d.data.validUntil)>this.now().getTime())&&(d.data.visibility==='PUBLIC'||d.data.visibility==='PERSONAL'&&d.data.subjectUserId===job.data.actorId)).map(d=>({id:d.id,text:d.data.content??d.data.text}));const services=(await tx.list('service')).filter(s=>s.data.active&&s.data.approvedBy&&config.data.allowedServiceIds.includes(s.id)).map(s=>({id:s.id,text:`${s.data.name}: ${s.data.description}. ${s.data.included?.join('; ')??''}`}));const conversationHistory=[];for(const prior of (await tx.list('message')).filter(m=>m.data.channel_id===channel.id&&m.id!==message.id&&!m.data.deleted_at).slice(-20)){
 if(await this.currentlyReadable(tx,job.data.actorId,prior))conversationHistory.push({role:prior.data.source==='AI'?'ASSISTANT' as const:'CUSTOMER' as const,text:String(prior.data.text).slice(0,1500)});}
 const approvedPriceBooks=(await tx.list('price_book')).filter(b=>b.data.status==='ACTIVE'&&b.data.approvedBy&&Date.parse(b.data.validFrom)<=this.now().getTime()&&(!b.data.validUntil||Date.parse(b.data.validUntil)>this.now().getTime())).map(b=>({id:b.id,version:b.version,serviceIds:(b.data.rules??[]).filter((r:Data)=>config.data.allowedServiceIds.includes(r.serviceId)).map((r:Data)=>r.serviceId)})).filter(b=>b.serviceIds.length).slice(0,10);
 return {config,channel,message,sources:[...sources,...services].slice(0,20),conversationHistory:conversationHistory.slice(-8),approvedPriceBooks};});if(!snapshot)return;
    if(!this.options.ai||snapshot.config.data.provider!=='DEEPSEEK'){await this.fallback(job,'PROVIDER_DISABLED');return;}
    const checkSource=async(tx:PgTransaction)=>{assert(await this.answerSource(tx,job,snapshot),'AI_SUPPRESSED');};
    const currentSource=()=>this.db.transaction(job.company_id,serviceId,checkSource);
    let knownCost:number|undefined;let knownTokens:{input_tokens?:number;output_tokens?:number}|undefined;let outcomeKnown=false,budgetReserved=false,providerStarted=false;
    try{
      const catalog=assistantToolCatalog(snapshot.config.data.tools).map(t=>({name:t.name,parameters:zodToJsonSchema(t.schema,{target:'jsonSchema7',$refStrategy:'none'})}));
      const policy={model:snapshot.config.data.model,timeoutMs:snapshot.config.data.timeoutMs,tone:snapshot.config.data.tone,addressMode:snapshot.config.data.addressForm,humanHours:snapshot.config.data.humanHours};
      const budget=await this.reserveBudget(job,snapshot.config,snapshot.message.data.text+JSON.stringify(snapshot.sources)+JSON.stringify(catalog),'CUSTOMER_ASSISTANT',checkSource);budgetReserved=true;
      const input={text:snapshot.message.data.text,language:job.data.language as SupportedLanguage,sources:snapshot.sources,ownership:'AI_ACTIVE' as const,synthetic:['DEMO','TEST'].includes(this.options.appMode)&&snapshot.config.data.testOnly===true,budgetRemainingCents:budget,maxReplyChars:snapshot.config.data.maxResponseLength,policy,conversationHistory:snapshot.conversationHistory,approvedPriceBooks:snapshot.approvedPriceBooks};
      await currentSource();providerStarted=true;let response=await this.options.ai.answer({...input,toolCatalog:catalog});knownCost=response.usage?.cost_cents;knownTokens=response.usage;outcomeKnown=true;
      if(response.handoff_required){await this.fallback(job,response.reason??'AI_HANDOFF_REQUIRED');return;}
      const customerTexts:string[]=[];
      if(response.tool_calls.length){
        await currentSource();const tools=await dispatchAssistantTools({companyId:job.company_id,actorId:job.data.actorId,configId:snapshot.config.id,configVersion:snapshot.config.data.configVersion,channelId:snapshot.channel.id,channelVersion:snapshot.channel.version,messageId:snapshot.message.id,messageVersion:snapshot.message.data.message_version,sourceChannel:job.data.sourceChannel??'WHATSAPP'},response.tool_calls,assistantToolHost(this.db,this.engine,this.now,async tx=>{await this.answerJobGuard(tx as PgTransaction,job);await this.answerMembership(tx as PgTransaction,await tx.get('channel',job.data.channelId),await tx.get('message',job.data.messageId));}));
        if(tools.stoppedForHandoff)return;
        for(const r of tools.results)if(r.name==='calculateEstimate'&&typeof r.result.customerText==='string')customerTexts.push(r.result.customerText);
        await currentSource();outcomeKnown=false;
        response=await this.options.ai.answer({...input,budgetRemainingCents:Math.max(0,budget-(knownCost??0)),toolCatalog:[],previousToolResults:tools.results.map(r=>r.name==='calculateEstimate'?{...r,result:{status:r.result.status,source:r.result.source,teamConfirmed:false,scheduleConfirmed:false,priceRenderedSeparatelyByServer:true}}:r)});
        knownCost=knownCost===undefined||response.usage?.cost_cents===undefined?undefined:knownCost+response.usage.cost_cents;knownTokens={input_tokens:knownTokens?.input_tokens===undefined||response.usage?.input_tokens===undefined?undefined:knownTokens.input_tokens+response.usage.input_tokens,output_tokens:knownTokens?.output_tokens===undefined||response.usage?.output_tokens===undefined?undefined:knownTokens.output_tokens+response.usage.output_tokens};outcomeKnown=true;
        if(response.handoff_required){await this.fallback(job,response.reason??'AI_HANDOFF_REQUIRED');return;}
      }
      const references=await this.db.transaction(job.company_id,serviceId,async tx=>{
        await checkSource(tx);
        let channel=await tx.get('channel',snapshot.channel.id);const config=await tx.get('assistant_config',snapshot.config.id),message=await tx.get('message',snapshot.message.id);
        assert(channel.data.handoff?.state==='AI_ACTIVE'&&config.data.status==='ACTIVE'&&config.version===snapshot.config.version,'AI_SUPPRESSED');
        assert(message.data.message_version===snapshot.message.data.message_version&&!message.data.deleted_at&&await this.currentlyReadable(tx,job.data.actorId,message),'ACCESS_DENIED');
        if(!channel.data.members?.some((m:Data)=>m.user_id===serviceId))channel=await tx.save(channel,{...channel.data,members:[...(channel.data.members??[]),{user_id:serviceId,joined_at:this.now().toISOString(),history_from:message.createdAt,external:false}]});
        await this.answerJobGuard(tx,job);
        return [channel,config,message].map(e=>({kind:e.kind,id:e.id,version:e.version}));
      });
      const text=[`KI-Assistent · ${response.answer}`,...customerTexts].join('\n\n');assert(text.length<=12000,'ASSISTANT_TOOL_RESULT_LIMIT');
      await this.engine.execute(await this.actor(job.company_id),'message.send',{input:{channel_id:snapshot.channel.id,text,language:job.data.language,source:'AI',reply_to_id:snapshot.message.id},idempotency_key:key('worker',job.id,'ai-answer'),preconditions:references,worker_lease:{id:job.id,token:job.lease_token!}});
    }catch(error){
      if(error instanceof DomainError&&error.code==='WORKER_LEASE_LOST')throw error;
      await this.fallback(job,error instanceof DomainError?error.code:'PROVIDER_UNAVAILABLE');
    }finally{
      // A known provider outcome remains an accounting fact even when current
      // chat/configuration authority prevents a new reply or handoff effect.
      if(outcomeKnown)await this.settleBudget(job,knownCost,knownTokens);
      else if(budgetReserved&&!providerStarted)await this.settleBudget(job,0,{input_tokens:0,output_tokens:0},'CANCELLED');
    }
  }

  private async fallback(job:OutboxJob,reason:string){
    assert(job.type==='assistant.answer_requested'&&job.lease_token,'WORKER_LEASE_LOST');
    await this.db.transaction(job.company_id,serviceId,async tx=>{
      const lock=()=>this.answerJobGuard(tx,job);
      await lock();
      const channel=await tx.get('channel',job.data.channelId),message=await tx.get('message',job.data.messageId),config=await tx.get('assistant_config',job.data.configId),actor=await this.engine.actorIn(tx,job.data.actorId);
      assert(channel.companyId===job.company_id&&message.companyId===job.company_id&&config.companyId===job.company_id&&message.data.channel_id===channel.id&&message.data.author_id===actor.userId&&!message.data.deleted_at&&config.data.status==='ACTIVE'&&config.data.configVersion===job.data.configVersion&&actor.permissions.includes('chat.read')&&await this.engine.visible(tx,actor,message),'ACCESS_DENIED');
      await this.answerMembership(tx,channel,message);
      if(channel.data.handoff?.state!=='AI_ACTIVE'){await lock();return;}
      const now=this.now().toISOString(),pending=await tx.save(channel,{...channel.data,handoff:{state:'HANDOFF_PENDING',owner_id:null,reason,requested_at:now,source_message_id:message.id}},channel.version);await queueHandoffSla(tx,pending,now);
      const dedup=key('assistant-fallback',job.id);if(!(await tx.list('decision')).some(d=>d.data.dedupeKey===dedup))await tx.add('decision',{status:'OPEN',reason,ownerId:'UNASSIGNED',channelId:channel.id,sources:[message.id],actions:['APPROVE','RETURN','DELEGATE'],summaryDE:'Die private Kundenanfrage benötigt menschliche Unterstützung. Es wurde keine Zusage gemacht.',dedupeKey:dedup,history:[]});
      await lock();
    });
  }
  private async applyRules(job:OutboxJob){if(job.type.startsWith('automation.')||job.type.startsWith('assistant.')||job.type==='translation.requested')return;const now=this.now().toISOString();const rules=await this.db.transaction(job.company_id,serviceId,async tx=>(await tx.list('automation_rule')).filter(r=>automationMatches(r.data,job,now)));for(const rule of rules)await this.command(job,'automation_rule.run',{id:rule.id,event:{id:job.id,type:job.type,data:job.data}},`rule:${rule.id}`);}
  private async automationAction(job:OutboxJob){
    assert(job.company_id===this.options.companyId&&typeof job.data.runId==='string'&&job.lease_token,'ACCESS_DENIED');
    const terminal=['COMPLETED','SUCCEEDED','CANCELLED','COOLDOWN_SUPPRESSED'];
    const host={actorIn:(tx:PgTransaction,id:string)=>this.engine.actorIn(tx,id),scope:(actor:Actor,permission:string)=>this.engine.scope(actor,permission)};
    const canonical=(value:any):string=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    const lock=async(tx:PgTransaction)=>{
      const held=await tx.query("SELECT id,type,data FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token]);
      assert(held.rows.length===1,'WORKER_LEASE_LOST');assert(held.rows[0].type==='automation.action_requested'&&held.rows[0].data?.runId===job.data.runId,'ACCESS_DENIED');
    };
    const fresh=async(tx:PgTransaction,base?:{run:Entity;rule:Entity})=>{
      await lock(tx);const run=await tx.get('automation_run',job.data.runId),rule=await tx.get('automation_rule',run.data.ruleId);
      assert(run.companyId===job.company_id&&rule.companyId===job.company_id,'ACCESS_DENIED');
      if(base)assert(run.version===base.run.version&&rule.version===base.rule.version,'VERSION_CONFLICT');
      assert(rule.data.status==='ACTIVE'&&rule.data.approvedBy&&Number.isFinite(Date.parse(rule.data.activeFrom))&&Date.parse(rule.data.activeFrom)<=this.now().getTime(),'NEEDS_APPROVAL');
      const service=await this.engine.actorIn(tx,serviceId),actor=await authorizeAutomationRun(tx,run,host,{initiator:service,initiatorPermission:'automation.execute'});
      assert(run.data.parameters&&typeof run.data.parameters==='object'&&!Array.isArray(run.data.parameters)&&Buffer.byteLength(JSON.stringify(run.data.parameters),'utf8')<=65536&&canonical(run.data.parameters)===canonical(rule.data.parameters),'ACCESS_DENIED');
      if(!terminal.includes(run.data.status)){assert(['QUEUED','FAILED'].includes(run.data.status),'INVALID_STATE');assert(Number.isSafeInteger(run.data.attempts)&&run.data.attempts>=0&&Number.isSafeInteger(run.data.maxAttempts)&&run.data.maxAttempts>=1&&run.data.maxAttempts===rule.data.maxAttempts&&run.data.attempts<run.data.maxAttempts,'RETRY_LIMIT_EXHAUSTED');}
      return {run,rule,actor,parameters:run.data.parameters};
    };
    const bound=async(tx:PgTransaction,rule:Entity,entity:Entity)=>{
      assert(entity.companyId===job.company_id,'ACCESS_DENIED');let siteId=entity.kind==='site'?entity.id:entity.data.siteId??entity.data.site_id??entity.data.snapshot?.siteId;
      if(!siteId&&(entity.data.taskId??entity.data.task_id))siteId=(await tx.get('task',entity.data.taskId??entity.data.task_id)).data.siteId;
      let customerId=entity.kind==='customer'?entity.id:entity.data.customerId??entity.data.customer_id;
      if(siteId){const site=await tx.get('site',siteId);assert(site.companyId===job.company_id,'ACCESS_DENIED');if(customerId)assert(!site.data.customerId||site.data.customerId===customerId,'ACCESS_DENIED');customerId??=site.data.customerId;}
      assert(!rule.data.scope.siteIds.length||rule.data.scope.siteIds.includes(siteId),'ACCESS_DENIED');assert(!rule.data.scope.customerIds.length||rule.data.scope.customerIds.includes(customerId),'ACCESS_DENIED');
    };
    const succeed=async(tx:PgTransaction,base:{run:Entity;rule:Entity},result:unknown)=>{
      const current=await fresh(tx,base);assert(!terminal.includes(current.run.data.status),'INVALID_STATE');await lock(tx);
      return tx.save(current.run,{...current.run.data,status:'SUCCEEDED',attempts:current.run.data.attempts+1,result,completedAt:this.now().toISOString()});
    };
    let prepared:Awaited<ReturnType<typeof fresh>>|undefined;
    try{
      const initial=await this.db.transaction(job.company_id,serviceId,async tx=>{
        const current=await fresh(tx);prepared=current;if(terminal.includes(current.run.data.status))return {current,terminal:true,targets:[] as Entity[]};
        const {run,rule,actor,parameters}=current;
        if(run.data.action==='DETECT_SHORTAGE'){
          const inventory=this.engine.scope(actor,'inventory.read');assert(inventory.permissions.includes('inventory.read'),'ACCESS_DENIED');const result=[];
          for(const request of await tx.list('material_request')){
            if(request.companyId!==job.company_id||!['APPROVED','PARTIALLY_APPROVED','PARTIALLY_RESERVED'].includes(request.data.state)||!(request.data.approvedBase>request.data.receivedBase))continue;
            if(rule.data.scope.siteIds.length&&!rule.data.scope.siteIds.includes(request.data.siteId))continue;
            if(!inventory.permissions.includes('scope.company')&&!inventory.siteIds.includes(request.data.siteId))continue;
            if(!await this.engine.visible(tx,actor,request))continue;
            const site=await tx.get('site',request.data.siteId);if(rule.data.scope.customerIds.length&&!rule.data.scope.customerIds.includes(site.data.customerId))continue;
            await bound(tx,rule,request);assert(Number.isSafeInteger(request.data.approvedBase)&&Number.isSafeInteger(request.data.receivedBase)&&request.data.receivedBase>=0&&typeof request.data.materialId==='string','INVALID_STATE');
            result.push({requestId:request.id,siteId:request.data.siteId,materialId:request.data.materialId,unreceivedBase:request.data.approvedBase-request.data.receivedBase});assert(result.length<=2500,'INVALID_STATE',{reason:'AUTOMATION_RESULT_TOO_LARGE'});
          }
          await succeed(tx,current,result);return {current,terminal:true,targets:[] as Entity[]};
        }
        const targets:Entity[]=[];
        if(run.data.action==='DRAFT_REPORT'){
          assert(rule.data.scope.siteIds.length>0,'VALIDATION_ERROR');
          for(const order of await tx.list('order'))if(order.companyId===job.company_id&&rule.data.scope.siteIds.includes(order.data.siteId)&&(!rule.data.scope.customerIds.length||rule.data.scope.customerIds.includes(order.data.customerId))&&!['CANCELLED','CLOSED'].includes(order.data.status)){await bound(tx,rule,order);targets.push(order);assert(targets.length<=100,'INVALID_STATE',{reason:'AUTOMATION_RESULT_TOO_LARGE'});}
        }else if(run.data.action==='DRAFT_QUOTE'){
          const input=parameters.input??parameters,lead=await tx.get('lead',input.leadId);await bound(tx,rule,lead);if(input.customerId)assert(input.customerId===lead.data.customerId,'ACCESS_DENIED');targets.push(lead);
        }else if(run.data.action==='PROPOSE_CREW'){
          const input=parameters.input??parameters,order=await tx.get('order',input.orderId);await bound(tx,rule,order);targets.push(order);
        }else if(run.data.action==='REMIND'){
          assert(!!parameters.related_id===!!parameters.related_kind,'VALIDATION_ERROR');
          if(parameters.related_id){const related=await tx.get(parameters.related_kind,parameters.related_id);await bound(tx,rule,related);assert(await this.engine.visible(tx,actor,related),'ACCESS_DENIED');targets.push(related);}
          if(parameters.message_id){const message=await tx.get('message',parameters.message_id),channel=await tx.get('channel',message.data.channel_id);await bound(tx,rule,channel);assert(await this.engine.visible(tx,actor,message),'ACCESS_DENIED');targets.push(message,channel);}
          const recipient=await tx.get('user',parameters.recipient_id);assert(recipient.companyId===job.company_id&&recipient.data.active===true,'ACCESS_DENIED');
          if(rule.data.scope.siteIds.length&&!parameters.message_id)assert((recipient.data.siteIds??[]).some((id:string)=>rule.data.scope.siteIds.includes(id)),'ACCESS_DENIED');targets.push(recipient);
        }else throw new DomainError('AUTOMATION_ACTION_UNSUPPORTED');
        await fresh(tx,current);await lock(tx);return {current,terminal:false,targets};
      },10000);
      if(initial.terminal)return;
      const {current,targets}=initial,{run,rule,actor,parameters}=current;
      const command=(name:string,input:Data,suffix:string)=>this.engine.execute(actor,name,{input,idempotency_key:key('worker',job.id,suffix),preconditions:[{kind:'automation_run',id:run.id,version:run.version},{kind:'automation_rule',id:rule.id,version:rule.version},...(name==='report.daily_draft'?targets.filter(e=>e.kind==='order'&&e.id===input.orderId):targets).map(e=>({kind:e.kind,id:e.id,version:e.version}))],worker_lease:{id:job.id,token:job.lease_token!}});
      let result:unknown;
      switch(run.data.action){
        case 'DRAFT_REPORT':{const drafts=[];for(const order of targets)drafts.push(await command('report.daily_draft',{siteId:order.data.siteId,orderId:order.id,day:parameters.day??this.localDay()},`draft:${order.id}`));result=drafts;break;}
        case 'DRAFT_QUOTE':result=await command('quote.create',parameters.input??parameters,'draft-quote');break;
        case 'REMIND':result=await command('notifications.schedule',{...parameters,scheduled_at:parameters.scheduled_at??this.now().toISOString(),dedup_key:`automation:${run.id}`,max_attempts:Math.min(3,rule.data.maxAttempts)},'remind');break;
        case 'PROPOSE_CREW':result=await command('dispatch.recommend',parameters.input??parameters,'propose-crew');break;
        default:throw new DomainError('AUTOMATION_ACTION_UNSUPPORTED');
      }
      await this.db.transaction(job.company_id,actor.userId,tx=>succeed(tx,current,result),10000);
    }catch(error){
      if(!(error instanceof DomainError&&error.code==='WORKER_LEASE_LOST'))try{await this.db.transaction(job.company_id,serviceId,async tx=>{
        await lock(tx);const service=await this.engine.actorIn(tx,serviceId),scope=this.engine.scope(service,'automation.execute');assert(scope.permissions.includes('automation.execute'),'ACCESS_DENIED');
        const run=await tx.get('automation_run',job.data.runId);if(terminal.includes(run.data.status))return;
        assert(run.companyId===job.company_id&&(scope.permissions.includes('scope.company')||(run.data.scope?.siteIds?.length&&run.data.scope?.customerIds?.length&&run.data.scope.siteIds.every((id:string)=>scope.siteIds.includes(id))&&run.data.scope.customerIds.every((id:string)=>scope.customerIds.includes(id)))),'ACCESS_DENIED');
        if(prepared)assert(run.version===prepared.run.version,'VERSION_CONFLICT');assert(Number.isSafeInteger(run.data.attempts)&&run.data.attempts>=0,'INVALID_STATE');
        const {result:discarded,...data}=run.data;await lock(tx);await tx.save(run,{...data,status:'FAILED',attempts:data.attempts+1,error:error instanceof DomainError?error.code:'WORKER_ERROR',completedAt:this.now().toISOString()});
      },10000);}catch{/* Lease/transport loss cannot authorize even a failure metadata write. */}
      throw error;
    }
  }
  private async operationsDigest(job:OutboxJob){
    assert(job.company_id===this.options.companyId&&job.lease_token,'ACCESS_DENIED');
    const prepared=await this.db.transaction(job.company_id,serviceId,async tx=>{
      const held=await tx.query("SELECT id,type,data FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[job.company_id,job.id,job.lease_token]);
      assert(held.rows.length===1,'WORKER_LEASE_LOST');const data=held.rows[0].data;
      assert(held.rows[0].type==='digest.requested'&&data?.policyId===job.data.policyId&&data?.policyVersion===job.data.policyVersion&&data?.ownerId===job.data.ownerId&&data?.slotAt===job.data.slotAt,'ACCESS_DENIED');
      const policy=await tx.get('digest_policy',data.policyId);assert(policy.version===data.policyVersion&&policy.data.ownerId===data.ownerId,'VERSION_CONFLICT');
      const service=await this.engine.actorIn(tx,serviceId);assert(service.roles.includes('SERVICE_ACCOUNT')&&await digestScopeAllowed(tx,service,policy.data.scope,'automation.execute',this.engine),'ACCESS_DENIED');
      const owner=await this.engine.actorIn(tx,data.ownerId);await authorizeDigestPolicy(tx,owner,policy,this.engine);return {owner,policy};
    },10000);
    return this.engine.execute(prepared.owner,'digest.generate',{input:{policyId:prepared.policy.id,policyVersion:prepared.policy.version,slotAt:job.data.slotAt},expected_version:prepared.policy.version,idempotency_key:key('worker',job.id,'operations-digest'),worker_lease:{id:job.id,token:job.lease_token!}});
  }
  private async calendar(job:OutboxJob){const actor=await this.engine.getActor(job.data.ownerId,job.company_id);return this.command(job,'task_template.generate_due',{templateId:job.data.templateId,templateVersion:job.data.templateVersion},'generate-due',actor);}
  private localDay(){const p=berlinParts(this.now());return `${p.year}-${p.month}-${p.day}`;}
  async scheduled(){const now=this.now(),p=berlinParts(now),minute=`${this.localDay()}:${p.hour}:${p.minute}`;if(minute===this.lastScheduleMinute)return;await this.db.transaction(this.options.companyId,serviceId,async tx=>{const day=this.localDay();if(Number(p.hour)>=18){for(const order of await tx.list('order'))if(order.data.siteId&&order.data.customerId&&!['CANCELLED','CLOSED'].includes(order.data.status)){const id=key('daily-report',tx.companyId,order.id,day);await tx.query(`INSERT INTO outbox(id,company_id,type,data) VALUES($1,$2,'report.daily_requested',$3) ON CONFLICT(id) DO NOTHING`,[id,tx.companyId,JSON.stringify({siteId:order.data.siteId,orderId:order.id,day})]);}}
    const calendarCursors=await tx.list('task_calendar_cursor');for(const template of await tx.list('task_template')){if(template.data.active!==true||template.data.recurrence==='MANUAL'||!template.data.schedule||!template.data.activatedAt||!template.data.scheduleOwnerId)continue;const cursor=calendarCursors.find(c=>c.data.templateId===template.id&&c.data.scheduleRevision===template.data.revision);if(cursor?.data.nextDueAt&&!cursor.data.hasMore&&Date.parse(cursor.data.nextDueAt)>now.getTime())continue;const id=key('task-calendar',template.id,String(template.data.revision),minute);await tx.query("INSERT INTO outbox(id,company_id,type,data) VALUES($1,$2,'task.calendar_requested',$3) ON CONFLICT(id) DO NOTHING",[id,tx.companyId,JSON.stringify({templateId:template.id,templateVersion:template.version,ownerId:template.data.scheduleOwnerId})]);}
    for(const policy of await tx.list('digest_policy')){
      let slot;try{slot=policyDue(policy,now);}catch{continue;}if(!slot)continue;
      const id=key('operations-digest',policy.id,String(policy.version),slot.slotKey);
      await tx.query("INSERT INTO outbox(id,company_id,type,data) VALUES($1,$2,'digest.requested',$3) ON CONFLICT(id) DO NOTHING",[id,tx.companyId,JSON.stringify({policyId:policy.id,policyVersion:policy.version,ownerId:policy.data.ownerId,slotAt:slot.slotAt})]);
    }
    for(const rule of await tx.list('automation_rule')){if(rule.data.status!=='ACTIVE'||!rule.data.approvedBy||Date.parse(rule.data.activeFrom)>now.getTime()||!rule.data.schedule?.cron)continue;try{if(!scheduleDue(rule.data.schedule.cron,now))continue;}catch{continue;}const id=key('scheduled-rule',rule.id,String(rule.data.ruleVersion),minute);await tx.query('INSERT INTO outbox(id,company_id,type,data) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[id,tx.companyId,rule.data.trigger,JSON.stringify({...rule.data.parameters?.eventData,scheduledRuleId:rule.id,siteId:rule.data.scope.siteIds.length===1?rule.data.scope.siteIds[0]:undefined,customerId:rule.data.scope.customerIds.length===1?rule.data.scope.customerIds[0]:undefined})]);}
  });this.lastScheduleMinute=minute;}
}
