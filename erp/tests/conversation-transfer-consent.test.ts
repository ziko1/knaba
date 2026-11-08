import {describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {WorkerRunner,serviceId,type OutboxJob} from '../apps/worker/runner.ts';
import {whatsappConsentAllowed} from '../packages/domain/notification-policy.ts';
import {transferFixture,transferSender,syntheticPhoneId} from './helpers/conversation-transfer-fixture.ts';

const transferId='24bb970d-5db5-4c89-a642-57c52d35059e';
const scope=(channel='guest-channel')=>({kind:'CONVERSATION',channel_id:channel,transfer_id:transferId});
function fixture(){const f=transferFixture(),now=new Date().toISOString();
 f.db.rows.get('message:private-history')!.data.message_version=1;
 f.db.put('channel','other-channel',{...f.db.rows.get('channel:guest-channel')!.data,name:'Another conversation'});f.db.put('message','other-message',{channel_id:'other-channel',author_id:'guest',text:'Unrelated private conversation',message_version:1});
 f.db.put('contact_identity','phone',{userId:'guest',type:'WHATSAPP',value:transferSender,verified:true,active:true});
 f.db.put('notification_setting','settings',{user_id:'guest',language:'EN',whatsapp_consent:true,opted_out:false,whatsapp_consent_scope:scope(),consent_purpose:'CONTINUE_GUEST_CONVERSATION',last_inbound_at:now,quiet_start:0,quiet_end:0});
 const send=vi.fn(async()=>({provider_message_id:'synthetic-accepted',status:'API_ACCEPTED'})),runner=new WorkerRunner(f.db as any,f.engine,{companyId:f.db.companyId,appMode:'TEST',testRecipients:[transferSender],whatsapp:{phoneNumberId:syntheticPhoneId,send} as any});
 const command=async(name:string,input:unknown,user=serviceId)=>f.engine.execute(await f.engine.getActor(user,f.db.companyId),name,{input,idempotency_key:randomUUID()});
 return {...f,send,runner,command};
}
type Fixture=ReturnType<typeof fixture>;
function lease(f:Fixture,type:string){const job=[...f.db.jobs.values()].find(row=>row.type===type)!;Object.assign(job,{status:'RUNNING',attempts:1,lease_token:randomUUID(),leased_until:new Date(Date.now()+60000).toISOString()});return job as OutboxJob;}
async function delivery(f:Fixture,message='private-history'){return f.command('delivery.prepare',{message_id:message,recipient_id:'guest',channel:'WHATSAPP'});}
async function routerResponse(f:Fixture,channelId:string|undefined='guest-channel'){
 f.db.put('conversation_input','input',{provider:'WHATSAPP',user_id:'guest',...channelId?{channel_id:channelId}:{},input:{kind:'MESSAGE',sender:transferSender,type:'text',text:'MENU'}});
 f.db.put('whatsapp_router_session','router-session',{user_id:'guest',generation:1});
 f.db.put('whatsapp_router_response','response',{user_id:'guest',recipient_id:'guest',sender:transferSender,input_id:'input',session_id:'router-session',session_generation:1,output:{kind:'TEXT',text:'Synthetic reply'},access_refs:[],required_permissions:[],internal:false,status:'PENDING',expires_at:new Date(Date.now()+600000).toISOString()});
 await f.db.event('whatsapp.router_response',{response_id:'response'});return lease(f,'whatsapp.router_response');
}

describe('conversation-only WhatsApp consent regression',()=>{
 it('allows the transferred conversation but denies another readable channel at delivery preparation',async()=>{
  const f=fixture();expect(await delivery(f)).toMatchObject({kind:'delivery'});expect(await delivery(f,'other-message')).toMatchObject({allowed:false,reason:'CHANNEL_CONSENT_REQUIRED'});expect(await f.db.list('delivery')).toHaveLength(1);
 });
 it.each(['unrelated-message','no-message'] as const)('denies a scheduled notification with %s context',async kind=>{
  const f=fixture();f.db.put('notification','scheduled',{recipient_id:'guest',event:'SYNTHETIC_NOTICE',category:'WORK',channel:'WHATSAPP',status:'PENDING',scheduled_at:new Date(Date.now()-1000).toISOString(),...kind==='unrelated-message'?{message_id:'other-message'}:{}});
  expect(await f.command('notifications.prepare',{notification_id:'scheduled'})).toMatchObject({allowed:false,reason:'CHANNEL_CONSENT_REQUIRED'});expect((await f.db.get('notification','scheduled')).data.status).toBe('FAILED');expect(f.send).not.toHaveBeenCalled();
 });
 it('rejects already queued delivery when the current consent no longer covers its message channel',async()=>{
  const f=fixture();await delivery(f);f.db.rows.get('notification_setting:settings')!.data.whatsapp_consent_scope=scope('other-channel');await (f.runner as any).delivery(lease(f,'delivery.requested'));expect(f.send).not.toHaveBeenCalled();expect((await f.db.list('delivery'))[0]!.data.status).toBe('FAILED');
 });
 it.each(['scope','STOP','contact-revocation','channel-revocation'] as const)('rechecks %s after async lease I/O immediately before the delivery provider call',async change=>{
  const f=fixture();await delivery(f);const original=(f.runner as any).activeJob.bind(f.runner);vi.spyOn(f.runner as any,'activeJob').mockImplementation(async(job:any)=>{await original(job);if(change==='scope')f.db.rows.get('notification_setting:settings')!.data.whatsapp_consent_scope=scope('other-channel');if(change==='STOP')f.db.rows.get('notification_setting:settings')!.data.opted_out=true;if(change==='contact-revocation')f.db.rows.get('contact_identity:phone')!.data.revokedAt=new Date().toISOString();if(change==='channel-revocation')f.db.rows.get('channel:guest-channel')!.data.members[0].active=false;});
  await (f.runner as any).delivery(lease(f,'delivery.requested'));expect(f.send).not.toHaveBeenCalled();expect((await f.db.list('delivery'))[0]!.data.status).not.toBe('UNKNOWN');
 });
 it('still sends one permitted conversation delivery with unchanged current authority',async()=>{
  const f=fixture();await delivery(f);await (f.runner as any).delivery(lease(f,'delivery.requested'));expect(f.send).toHaveBeenCalledTimes(1);expect((await f.db.list('delivery'))[0]!.data.status).toBe('API_ACCEPTED');
 });
 it('preserves conversation scope across language, quiet-hour and consent-checkbox resubmission',async()=>{
  const f=fixture();for(const input of [{language:'PL',whatsapp_consent:true,quiet_start:18,quiet_end:8},{language:'UK',whatsapp_consent:false},{language:'EN',whatsapp_consent:true}]){
   const result=await f.command('notifications.configure',input,'guest');expect(result.data).toMatchObject({whatsapp_consent_scope:scope(),consent_purpose:'CONTINUE_GUEST_CONVERSATION'});expect(result.data).not.toHaveProperty('all_operational_whatsapp_notifications');
  }
  expect(await delivery(f,'other-message')).toMatchObject({allowed:false,reason:'CHANNEL_CONSENT_REQUIRED'});
 });
 it('requires an explicit operational opt-in to broaden scope and never persists that intent flag for form replay',async()=>{
  const f=fixture(),user=await f.db.get('user','guest');await f.command('notifications.configure',{language:'EN',whatsapp_consent:true,all_operational_whatsapp_notifications:true},'guest');const setting=await f.db.get('notification_setting','settings');
  expect(setting.data).toMatchObject({whatsapp_consent_scope:{kind:'OPERATIONAL'},consent_purpose:'OPERATIONAL_NOTIFICATIONS',consent_source:'EXPLICIT_OPERATIONAL_OPTIN'});expect(setting.data).not.toHaveProperty('all_operational_whatsapp_notifications');expect(await delivery(f,'other-message')).toMatchObject({kind:'delivery'});expect(await f.db.get('user','guest')).toEqual(user);
  await f.command('notifications.configure',{language:'EN',whatsapp_consent:false,opted_out:true},'guest');expect(await delivery(f)).toMatchObject({allowed:false});
  await expect(f.command('notifications.configure',{language:'EN',whatsapp_consent:true,opted_out:true,all_operational_whatsapp_notifications:true},'guest')).rejects.toMatchObject({code:'VALIDATION_ERROR'});
 });
 it('retains legacy unscoped operational consent but denies missing or malformed scoped records',async()=>{
  const f=fixture(),settings=f.db.rows.get('notification_setting:settings')!.data;delete settings.whatsapp_consent_scope;delete settings.consent_purpose;expect(await delivery(f,'other-message')).toMatchObject({kind:'delivery'});
  for(const malformed of [undefined,null,{}, {kind:'UNKNOWN'},{kind:'CONVERSATION',channel_id:'guest-channel'},{kind:'CONVERSATION',channel_id:'guest-channel',transfer_id:'wrong'},{...scope(),extra:true}]){
   const record={whatsapp_consent:true,consent_purpose:'CONTINUE_GUEST_CONVERSATION',whatsapp_consent_scope:malformed};expect(whatsappConsentAllowed(record,{channelId:'guest-channel'})).toBe(false);
  }
  expect(whatsappConsentAllowed({whatsapp_consent:true,consent_purpose:'CONTINUE_GUEST_CONVERSATION',whatsapp_consent_scope:scope()})).toBe(false);
 });
 it('denies a RUNNING scheduled notice prepared before consent was narrowed',async()=>{
  const f=fixture();f.db.put('notification','running',{recipient_id:'guest',event:'SYNTHETIC_NOTICE',category:'WORK',channel:'WHATSAPP',status:'RUNNING',attempts:0,scheduled_at:new Date(Date.now()-1000).toISOString(),message_id:'other-message',policy:{allowed:true,channel:'WHATSAPP',kind:'TEXT'}});await f.db.event('notification.scheduled',{notification_id:'running'});
  await (f.runner as any).notification(lease(f,'notification.scheduled'));expect(f.send).not.toHaveBeenCalled();expect(await f.db.list('delivery')).toHaveLength(0);expect((await f.db.get('notification','running')).data.status).toBe('FAILED');
 });
 it('rechecks conversation consent before an already prepared router response leaves the worker',async()=>{
  const f=fixture(),job=await routerResponse(f);
  const original=(f.runner as any).activeJob.bind(f.runner);vi.spyOn(f.runner as any,'activeJob').mockImplementation(async(job:any)=>{await original(job);f.db.rows.get('notification_setting:settings')!.data.whatsapp_consent_scope=scope('other-channel');});
  await (f.runner as any).routerResponse(job);expect(f.send).not.toHaveBeenCalled();expect((await f.db.get('whatsapp_router_response','response')).data.status).not.toBe('UNKNOWN');
 });
 it('allows a router reply to the exact canonical transferred conversation',async()=>{
  const f=fixture(),job=await routerResponse(f);await (f.runner as any).routerResponse(job);expect(f.send).toHaveBeenCalledOnce();expect((await f.db.get('whatsapp_router_response','response')).data.status).toBe('API_ACCEPTED');
 });
 it.each(['other-channel','missing-context'] as const)('denies a router reply with %s despite caller-supplied channel hints',async context=>{
  const f=fixture(),job=await routerResponse(f,context==='missing-context'?'':context);f.db.rows.get('whatsapp_router_response:response')!.data.channel_id='guest-channel';
  await (f.runner as any).routerResponse(job);expect(f.send).not.toHaveBeenCalled();expect((await f.db.get('whatsapp_router_response','response')).data).toMatchObject({status:'BLOCKED',error:'CHANNEL_CONSENT_REQUIRED'});
 });
});
