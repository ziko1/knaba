import { describe,it,expect } from 'vitest';
import { communicationsCommands, whatsAppPolicy, isQuietHour } from '../packages/domain/communications.ts';
import { DomainError,type Actor,type CommandContext,type Data,type Entity,type Transaction } from '../packages/domain/core.ts';

class MemoryTx implements Transaction {
  rows=new Map<string,Entity>();events:{type:string;data:Data}[]=[];sequence=0;now='2026-10-06T10:00:00.000Z';
  async get<T extends Data=Data>(kind:string,id:string){const entity=this.rows.get(`${kind}:${id}`);if(!entity)throw new DomainError('NOT_FOUND_SAFE');return structuredClone(entity) as Entity<T>;}
  async list<T extends Data=Data>(kind:string){return [...this.rows.values()].filter(e=>e.kind===kind).map(e=>structuredClone(e) as Entity<T>);}
  async add<T extends Data=Data>(kind:string,data:T,id=`entity-${++this.sequence}`){const entity={id,kind,data:structuredClone(data),companyId:'company',version:1,createdAt:this.now,updatedAt:this.now};this.rows.set(`${kind}:${id}`,entity);return structuredClone(entity);}
  async save(entity:Entity,data:Data,version=entity.version){const old=await this.get(entity.kind,entity.id);if(old.version!==version)throw new DomainError('VERSION_CONFLICT');const saved={...entity,data:structuredClone(data),version:entity.version+1,updatedAt:this.now};this.rows.set(`${entity.kind}:${entity.id}`,saved);return structuredClone(saved);}
  async event(type:string,data:Data){this.events.push({type,data});}
}
const employee:Actor={userId:'employee',companyId:'company',roles:['EMPLOYEE'],permissions:['chat.read','chat.write','translation.use'],siteIds:['site'],customerIds:[],warehouseIds:[]};
const manager={...employee,userId:'owner',roles:['OWNER'],permissions:[...employee.permissions,'scope.company','media.read']};const service={...employee,userId:'worker',roles:['SERVICE_ACCOUNT']};
function context(tx:MemoryTx,actor=employee):CommandContext {return {tx,actor,now:tx.now,idempotencyKey:'test-command-key',requireSite:id=>{if(!actor.permissions.includes('scope.company')&&!actor.siteIds.includes(id))throw new DomainError('ACCESS_DENIED');},requireOwn:id=>{if(actor.userId!==id)throw new DomainError('ACCESS_DENIED');}};}
async function run(tx:MemoryTx,name:string,input:Data,actor=employee,expectedVersion?:number){const command=communicationsCommands[name]!;const before=structuredClone(tx.rows),events=structuredClone(tx.events);try{return await command.handler({...context(tx,actor),expectedVersion},command.schema.parse(input));}catch(error){tx.rows=before;tx.events=events;throw error;}}
async function setup(){const tx=new MemoryTx();await tx.add('user',{roles:['OWNER'],active:true,permissions:manager.permissions},'owner');await tx.add('user',{roles:['EMPLOYEE'],active:true,siteIds:['site']},'employee');await tx.add('user',{roles:['CLIENT'],active:true},'client');await tx.add('user',{roles:['EMPLOYEE'],active:true,siteIds:['site']},'other');await tx.add('site',{customerId:'customer'},'site');await tx.add('site',{customerId:'other-customer'},'other-site');await tx.add('customer_membership',{userId:'client',customerId:'customer',active:true,permissions:['VIEW'],siteIds:['site']},'client-view');const channel=await run(tx,'channel.create',{type:'SITE_INTERNAL',name:'Site internal',member_ids:['employee','other'],site_id:'site'},manager);const message=await run(tx,'message.send',{channel_id:channel.id,text:'Nicht 24 Stück auf Etage 2 verwenden.',language:'DE',important:true});return {tx,channel,message};}
const client:Actor={...employee,userId:'client',roles:['CLIENT'],siteIds:[],customerIds:['customer']};
async function setupClient(){const {tx}=await setup();const channel=await run(tx,'channel.create',{type:'SITE_CLIENT',name:'Client site',site_id:'site',customer_id:'customer',member_ids:['client'],external_member_ids:['client']},manager);const message=await run(tx,'message.send',{channel_id:channel.id,text:'Freigegebene Objektmeldung',language:'DE',important:true},manager);return {tx,channel,message,membership:await tx.get('customer_membership','client-view')};}

describe('WhatsApp outbound policy and quiet period',()=>{
 it('needs recorded consent even when a recent inbound exists',()=>{expect(whatsAppPolicy({now:'2026-10-06T10:00:00Z',last_inbound_at:'2026-10-06T09:00:00Z',consent:false})).toMatchObject({allowed:false,reason:'CHANNEL_CONSENT_REQUIRED'});});
 it('allows free text strictly inside 24 hours and requires approved template at the boundary',()=>{const base={now:'2026-10-06T10:00:00Z',consent:true};expect(whatsAppPolicy({...base,last_inbound_at:'2026-10-05T10:00:01Z'})).toMatchObject({allowed:true,kind:'TEXT'});expect(whatsAppPolicy({...base,last_inbound_at:'2026-10-05T10:00:00Z'})).toMatchObject({allowed:false,reason:'WHATSAPP_WINDOW_CLOSED'});expect(whatsAppPolicy({...base,approved_template:'report_ready',template_status:'APPROVED'})).toMatchObject({allowed:true,kind:'TEMPLATE'});});
 it('optout wins over approved templates and future inbound cannot open a window',()=>{expect(whatsAppPolicy({now:'2026-10-06T10:00:00Z',consent:true,opted_out:true,approved_template:'report_ready',template_status:'APPROVED'}).allowed).toBe(false);expect(whatsAppPolicy({now:'2026-10-06T10:00:00Z',last_inbound_at:'2026-10-06T11:00:00Z',consent:true}).allowed).toBe(false);});
 it('uses Berlin DST rather than UTC for quiet hours and disables equal hour ranges',()=>{expect(isQuietHour('2026-07-06T20:00:00Z',22,7)).toBe(true);expect(isQuietHour('2026-01-06T20:00:00Z',22,7)).toBe(false);expect(isQuietHour('2026-10-06T23:00:00Z',0,0)).toBe(false);});
});

describe('current channel scope and safe attachment boundaries',()=>{
 it('manager roles cannot list/read an unassigned site without an explicit company scope',async()=>{const {tx,channel}=await setup();const unscoped={...manager,siteIds:[],permissions:['chat.read','chat.write','chat.manage']};expect(await run(tx,'channel.list',{},unscoped)).toEqual([]);expect(await run(tx,'channel.unread',{},unscoped)).toEqual([]);await expect(run(tx,'message.read',{channel_id:channel.id},unscoped)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect((await run(tx,'channel.list',{},manager)).map((c:Entity)=>c.id)).toContain(channel.id);});
 it('task threads inherit the task site and remain scoped even when the caller omitted site_id',async()=>{const {tx}=await setup();await tx.add('task',{siteId:'other-site'},'other-task');const channel=await run(tx,'channel.create',{type:'TASK_THREAD',name:'Other task',task_id:'other-task',member_ids:['owner']},manager);expect(channel.data.site_id).toBe('other-site');const scoped={...manager,permissions:['chat.read'],siteIds:['site']};expect((await run(tx,'channel.list',{},scoped)).some((c:Entity)=>c.id===channel.id)).toBe(false);await expect(run(tx,'message.read',{channel_id:channel.id},scoped)).rejects.toMatchObject({code:'ACCESS_DENIED'});});
 it.each([{expires_at:'2026-10-06T10:00:00.000Z'},{left_at:'2026-10-06T09:00:00Z'},{removed_at:'2026-10-06T09:00:00Z'},{active:false}])('expired/left/removed/inactive channel membership blocks reads and existing callbacks: %j',async patch=>{const {tx,channel,message}=await setup();const callback=await run(tx,'callback.create',{message_id:message.id,action:'ACK'});await tx.save(channel,{...channel.data,members:channel.data.members.map((m:Data)=>m.user_id==='employee'?{...m,...patch}:m)});expect(await run(tx,'channel.list',{})).toEqual([]);await expect(run(tx,'message.read',{channel_id:channel.id})).rejects.toMatchObject({code:'ACCESS_DENIED'});await expect(run(tx,'callback.consume',{action_id:callback.action_id})).rejects.toMatchObject({code:'ACCESS_DENIED'});});
 it.each([
  ['inactive',{active:false}],['revoked',{revokedAt:'2026-10-06T09:59:59Z'}],['expired',{expiresAt:'2026-10-06T10:00:00.000Z'}],['invalid expiry',{expiresAt:'invalid'}],['VIEW removed',{permissions:['ACK']}],['site removed',{siteIds:['other-site']}],['customer changed',{customerId:'other-customer'}],
 ] as [string,Data][])('%s customer rights block all historical/message/translation actions despite cached customerIds and channel membership',async(_reason,patch)=>{
  const {tx,channel,message,membership}=await setupClient();expect((await run(tx,'channel.list',{},client)).map((c:Entity)=>c.id)).toContain(channel.id);
  const translation=await run(tx,'translation.request',{message_id:message.id,target_language:'UK'},client),callback=await run(tx,'callback.create',{message_id:message.id,action:'ACK'},client);
  await tx.save(membership,{...membership.data,...patch});
  expect(await run(tx,'channel.list',{},client)).toEqual([]);expect(await run(tx,'channel.unread',{},client)).toEqual([]);
  for(const [command,input] of [
   ['message.read',{channel_id:channel.id}],['message.send',{channel_id:channel.id,text:'Expired reply',language:'DE'}],['channel.mute',{channel_id:channel.id,muted:true}],['channel.mark_read',{channel_id:channel.id}],['translation.preferences',{channel_id:channel.id,mode:'BUTTON',target_language:'UK'}],['translation.read',{translation_id:translation.translation_id}],['message.ack',{message_id:message.id}],['callback.consume',{action_id:callback.action_id}],
  ] as [string,Data][])await expect(run(tx,command,input,client)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('queued translation/delivery/reminder rechecks VIEW and cancels after customer revocation',async()=>{
  const {tx,channel,message,membership}=await setupClient();const request=await run(tx,'translation.request',{message_id:message.id,target_language:'UK'},client);
  const delivery=await run(tx,'delivery.prepare',{message_id:message.id,recipient_id:'client',channel:'WEB'},service);expect(delivery.data.status).toBe('PENDING');
  const notification=await run(tx,'notifications.schedule',{recipient_id:'client',event:'CHAT',category:'CHAT',scheduled_at:tx.now,dedup_key:'synthetic-client-reminder',message_id:message.id},manager);
  await tx.save(membership,{...membership.data,revokedAt:tx.now});
  await expect(run(tx,'delivery.prepare',{message_id:message.id,recipient_id:'client',channel:'WEB'},service)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await run(tx,'translation.result',{translation_id:request.translation_id,status:'SUCCEEDED',text:'Затверджене повідомлення',provider:'synthetic',model:'synthetic'},service);
  expect((await tx.get('translation_request',request.request_id)).data.status).toBe('CANCELLED');expect(tx.events.filter(e=>e.type==='translation.ready')).toEqual([]);
  expect(await run(tx,'notifications.prepare',{notification_id:notification.id},service)).toEqual({status:'CANCELLED'});expect((await tx.get('notification',notification.id)).data.reason).toBe('ACCESS_REVOKED');
  expect((await tx.get('channel',channel.id)).data.members.find((m:Data)=>m.user_id==='client').revoked_at).toBeUndefined();
 });
 it('does not create or restore an external site channel member without current VIEW for that site',async()=>{const {tx,channel,membership}=await setupClient();await run(tx,'channel.membership',{channel_id:channel.id,user_id:'client',action:'REVOKE'},manager);await tx.save(membership,{...membership.data,permissions:[]});await expect(run(tx,'channel.membership',{channel_id:channel.id,user_id:'client',action:'ADD',external:true},manager)).rejects.toMatchObject({code:'ACCESS_DENIED'});await expect(run(tx,'channel.create',{type:'SITE_CLIENT',name:'Invalid site',site_id:'site',member_ids:['client'],external_member_ids:['client']},manager)).rejects.toMatchObject({code:'ACCESS_DENIED'});});
 it('rejects employee/finance documents in regular channels even for the uploader with finance and media privileges',async()=>{const {tx,channel}=await setup();const finance={...manager,permissions:[...manager.permissions,'finance.payroll','finance.accountant']};for(const data of [{visibility:'CONFIDENTIAL',employeeId:'employee'},{visibility:'INTERNAL',employeeId:'employee'},{visibility:'CONFIDENTIAL'}]){const media=await tx.add('media_asset',{state:'RECEIVED',stage:'DOCUMENT',siteId:'site',uploadedBy:'owner',...data});await expect(run(tx,'message.send',{channel_id:channel.id,text:'Salary attachment',language:'DE',attachment_ids:[media.id]},finance)).rejects.toMatchObject({code:'ACCESS_DENIED'});}expect(await tx.list('message')).toHaveLength(1);});
 it('allows ordinary same-site internal media but denies cross-site and unbound-channel attachments',async()=>{const {tx,channel}=await setup();const same=await tx.add('media_asset',{siteId:'site',state:'RECEIVED',visibility:'INTERNAL',uploadedBy:'employee'});expect((await run(tx,'message.send',{channel_id:channel.id,text:'Site progress',language:'DE',attachment_ids:[same.id]})).data.attachment_ids).toEqual([same.id]);const other=await tx.add('media_asset',{siteId:'other-site',state:'RECEIVED',visibility:'INTERNAL',uploadedBy:'owner'});await expect(run(tx,'message.send',{channel_id:channel.id,text:'Wrong site',language:'DE',attachment_ids:[other.id]},manager)).rejects.toMatchObject({code:'ACCESS_DENIED'});const general=await run(tx,'channel.create',{type:'COMPANY_GENERAL',name:'General',member_ids:['employee']},manager);await expect(run(tx,'message.send',{channel_id:general.id,text:'Unbound site photo',language:'DE',attachment_ids:[same.id]},manager)).rejects.toMatchObject({code:'ACCESS_DENIED'});});
 it('client channels require a reviewed distinct sanitized copy even when an internal operator owns the original',async()=>{const {tx,channel}=await setupClient();const media=await tx.add('media_asset',{siteId:'site',state:'RECEIVED',visibility:'CLIENT_AFTER_APPROVAL',uploadedBy:'owner',blobKey:'original'});await expect(run(tx,'message.send',{channel_id:channel.id,text:'Unsafe original',language:'DE',attachment_ids:[media.id]},manager)).rejects.toMatchObject({code:'CLIENT_COPY_REQUIRED'});const approved=await tx.save(media,{...media.data,state:'APPROVED_FOR_CLIENT',clientBlobKey:'separate-private-copy',clientSha256:'a'.repeat(64),metadataStripped:true,redactionConfirmed:true,approvedBy:'reviewer',approvedAt:tx.now});expect((await run(tx,'message.send',{channel_id:channel.id,text:'Reviewed image',language:'DE',attachment_ids:[approved.id]},client)).data.attachment_ids).toEqual([approved.id]);const wrong=await tx.add('media_asset',{...approved.data,siteId:'other-site',uploadedBy:'owner'});await expect(run(tx,'message.send',{channel_id:channel.id,text:'Other client image',language:'DE',attachment_ids:[wrong.id]},manager)).rejects.toMatchObject({code:'ACCESS_DENIED'});const reused=await tx.save(approved,{...approved.data,clientBlobKey:approved.data.blobKey});await expect(run(tx,'message.send',{channel_id:channel.id,text:'Original masquerading as copy',language:'DE',attachment_ids:[reused.id]},manager)).rejects.toMatchObject({code:'CLIENT_COPY_REQUIRED'});});
});

describe('durable conversation invariants',()=>{
 it('external customers cannot join internal channels or create an internal chat',async()=>{const {tx}=await setup();await expect(run(tx,'channel.create',{type:'SITE_INTERNAL',name:'leak',member_ids:['client'],external_member_ids:['client'],site_id:'site'},manager)).rejects.toMatchObject({code:'ACCESS_DENIED'});await expect(run(tx,'channel.create',{type:'SITE_INTERNAL',name:'leak',member_ids:['client'],site_id:'site'},{...employee,userId:'client',roles:['CLIENT']})).rejects.toMatchObject({code:'ACCESS_DENIED'});});
 it('revoked membership denies historical reads and cancels pending recipient translations',async()=>{const {tx,channel,message}=await setup();const request=await run(tx,'translation.request',{message_id:message.id,target_language:'UK'});await run(tx,'channel.membership',{channel_id:channel.id,user_id:'employee',action:'REVOKE'},manager);await expect(run(tx,'message.read',{channel_id:channel.id})).rejects.toMatchObject({code:'ACCESS_DENIED'});expect((await tx.get('translation_request',request.request_id)).data.status).toBe('CANCELLED');});
 it('joined users see only history after their membership boundary',async()=>{const {tx,channel}=await setup();tx.now='2026-10-06T11:00:00.000Z';await run(tx,'channel.membership',{channel_id:channel.id,user_id:'employee',action:'REVOKE'},manager);await run(tx,'channel.membership',{channel_id:channel.id,user_id:'employee',action:'ADD'},manager);expect(await run(tx,'message.read',{channel_id:channel.id})).toEqual([]);});
 it('translation requests share versioned cache, while message correction creates a new request',async()=>{const {tx,message}=await setup();const a=await run(tx,'translation.request',{message_id:message.id,target_language:'UK'});const b=await run(tx,'translation.request',{message_id:message.id,target_language:'UK'},{...employee,userId:'other'});expect(a.translation_id).toBe(b.translation_id);expect((await tx.list('translation')).length).toBe(1);await run(tx,'message.edit',{message_id:message.id,text:'Nicht 25 Stück verwenden.'});const c=await run(tx,'translation.request',{message_id:message.id,target_language:'UK'});expect(c.translation_id).not.toBe(a.translation_id);expect((await tx.get('message',message.id)).data.revisions).toHaveLength(2);});
 it('late provider result cannot replace a corrected original or publish a stale translation',async()=>{const {tx,message}=await setup();const translation=await run(tx,'translation.request',{message_id:message.id,target_language:'UK'});await run(tx,'message.edit',{message_id:message.id,text:'Nicht 25 Stück verwenden.'});expect(await run(tx,'translation.result',{translation_id:translation.translation_id,status:'SUCCEEDED',text:'Не використовувати 24 штук.',provider:'test',model:'test'},service)).toEqual({status:'CANCELLED'});expect((await tx.get('message',message.id)).data.text).toBe('Nicht 25 Stück verwenden.');expect(tx.events.filter(e=>e.type==='translation.ready')).toHaveLength(0);});
 it('provider failure preserves original and exposes a typed reason',async()=>{const {tx,message}=await setup();const request=await run(tx,'translation.request',{message_id:message.id,target_language:'UK'});await run(tx,'translation.result',{translation_id:request.translation_id,status:'FAILED',provider:'test',model:'test',error:'PROVIDER_DISABLED'},service);expect(await run(tx,'translation.read',{translation_id:request.translation_id})).toMatchObject({status:'FAILED',reason:'PROVIDER_DISABLED'});expect((await tx.get('message',message.id)).data.text).toBe('Nicht 24 Stück auf Etage 2 verwenden.');});
 it('callbacks bind opaque IDs to one recipient and message version and are consumed once',async()=>{const {tx,message}=await setup();const callback=await run(tx,'callback.create',{message_id:message.id,action:'ACK'});await expect(run(tx,'callback.consume',{action_id:callback.action_id},{...employee,userId:'other'})).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});expect(await run(tx,'callback.consume',{action_id:callback.action_id})).toMatchObject({action:'ACK',message_id:message.id});await expect(run(tx,'callback.consume',{action_id:callback.action_id})).rejects.toMatchObject({code:'CALLBACK_EXPIRED'});});
 it('old callbacks are rejected after corrections or expiration',async()=>{const {tx,message}=await setup();const a=await run(tx,'callback.create',{message_id:message.id,action:'ACK'});await run(tx,'message.edit',{message_id:message.id,text:'Correction 25.'});await expect(run(tx,'callback.consume',{action_id:a.action_id})).rejects.toMatchObject({code:'VERSION_CONFLICT'});const b=await run(tx,'callback.create',{message_id:message.id,action:'ACK',ttl_seconds:30});tx.now='2026-10-06T11:00:00.000Z';await expect(run(tx,'callback.consume',{action_id:b.action_id})).rejects.toMatchObject({code:'CALLBACK_EXPIRED'});});
 it('internal copying requires preview confirmation and does not copy attachments automatically',async()=>{const {tx,message}=await setup();const clientChannel=await run(tx,'channel.create',{type:'SITE_CLIENT',name:'client',site_id:'site',member_ids:['client'],external_member_ids:['client']},manager);const preview=await run(tx,'message.copy_preview',{message_id:message.id,target_channel_id:clientChannel.id},manager);expect(await tx.list('message')).toHaveLength(1);const copy=await run(tx,'message.copy_confirm',{preview_id:preview.id},manager);expect(copy.data.visibility).toBe('EXTERNAL');expect(copy.data.attachment_ids).toEqual([]);await expect(run(tx,'message.copy_confirm',{preview_id:preview.id},manager)).rejects.toMatchObject({code:'INVALID_STATE'});});
 it('human ownership suppresses AI until an explicit authorized return',async()=>{const {tx,channel}=await setup();await run(tx,'handoff.take',{channel_id:channel.id},manager);await tx.save(await tx.get('channel',channel.id),{...(await tx.get('channel',channel.id)).data,members:[...channel.data.members,{user_id:'worker',history_from:tx.now}]});await expect(run(tx,'message.send',{channel_id:channel.id,text:'AI response',language:'DE',source:'AI'},service)).rejects.toMatchObject({code:'AI_SUPPRESSED'});await run(tx,'handoff.resume',{channel_id:channel.id,reason:'Authorized return'},manager);expect((await run(tx,'message.send',{channel_id:channel.id,text:'AI response',language:'DE',source:'AI'},service)).data.source).toBe('AI');});
 it('configured three-attempt override dead-letters safe transient failures and resolution cancels reminders',async()=>{const {tx}=await setup();await tx.add('location_incident',{status:'OPEN'},'incident');const notification=await run(tx,'notifications.schedule',{recipient_id:'employee',event:'ABSENCE',category:'WORK',scheduled_at:tx.now,dedup_key:'absence-1',related_kind:'location_incident',related_id:'incident',max_attempts:3},manager);for(let count=0;count<3;count++){await run(tx,'notifications.prepare',{notification_id:notification.id},service);const result=await run(tx,'notifications.complete',{notification_id:notification.id,succeeded:false,error:'PROVIDER_UNAVAILABLE',failure_class:'CONFIRMED_TRANSIENT'},service);tx.now=result.data.scheduled_at;}expect((await tx.get('notification',notification.id)).data).toMatchObject({status:'DEAD_LETTER',attempts:3});const n=await run(tx,'notifications.schedule',{recipient_id:'employee',event:'ABSENCE',category:'WORK',scheduled_at:tx.now,dedup_key:'absence-2',related_kind:'location_incident',related_id:'incident'},manager);await tx.save(await tx.get('location_incident','incident'),{status:'RESOLVED'});expect(await run(tx,'notifications.prepare',{notification_id:n.id},service)).toEqual({status:'CANCELLED'});});
 it('quiet hours defer notifications without consuming an attempt',async()=>{const {tx}=await setup();tx.now='2026-10-06T21:00:00.000Z';const n=await run(tx,'notifications.schedule',{recipient_id:'employee',event:'REMINDER',category:'WORK',scheduled_at:tx.now,dedup_key:'quiet-1'},manager);expect(await run(tx,'notifications.prepare',{notification_id:n.id},service)).toMatchObject({status:'RETRY_SCHEDULED',reason:'QUIET_HOURS'});expect((await tx.get('notification',n.id)).data.attempts).toBe(0);});
});

describe('private operator handoff claims (CPU domain fixture; SQL races not covered)',()=>{
 const operator:Actor={userId:'operator',companyId:'company',roles:['DIRECTOR'],permissions:['chat.manage','chat.read','chat.write','translation.use'],siteIds:['site'],customerIds:[],warehouseIds:[]};
 const second:Actor={...operator,userId:'second',roles:['OPERATIONS_MANAGER']};
 const guest:Actor={...employee,userId:'guest',roles:['GUEST'],siteIds:[]};
 async function privateSetup(){
  const tx=new MemoryTx();tx.now='2026-10-06T09:00:00.000Z';
  for(const actor of [operator,second,guest])await tx.add('user',{roles:actor.roles,active:true,permissions:[],siteIds:actor.siteIds},actor.userId);
  const channel=await tx.add('channel',{type:'PRIVATE_CUSTOMER_ASSISTANT',name:'private-contact@example.test',created_by:'guest',members:[{user_id:'guest',external:true,joined_at:tx.now,history_from:tx.now}],handoff:{state:'HANDOFF_PENDING',owner_id:null,requested_at:tx.now}},'pending');
  const original=await run(tx,'message.send',{channel_id:channel.id,text:'Private original before an operator joins.',language:'DE'},guest);
  tx.now='2026-10-06T10:00:00.000Z';return {tx,channel:await tx.get('channel',channel.id),original};
 }
 async function claim(tx:MemoryTx,channel:Entity,actor=operator){return run(tx,'handoff.take',{channel_id:channel.id},actor,channel.version);}
 it('exposes only a bounded pending reference before an explicit claim, then grants the complete single conversation',async()=>{
  const {tx,channel,original}=await privateSetup();
  await expect(run(tx,'message.read',{channel_id:channel.id},operator)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(await run(tx,'channel.list',{},operator)).toEqual([]);
  const inbox=await run(tx,'handoff.inbox',{},operator);
  expect(inbox).toEqual({items:[{channel_id:channel.id,version:channel.version,requested_at:'2026-10-06T09:00:00.000Z',state:'HANDOFF_PENDING'}]});
  expect(JSON.stringify(inbox)).not.toMatch(/private-contact|Private original|guest/);
  const saved=await claim(tx,channel);
  expect(saved.data.handoff).toMatchObject({state:'HUMAN_ACTIVE',owner_id:operator.userId});
  expect(saved.data.members.find((m:Data)=>m.user_id===operator.userId)).toMatchObject({source:'OPERATOR_CLAIM',claim_owner_id:operator.userId,joined_at:tx.now,history_from:channel.createdAt,external:false});
  expect((await run(tx,'message.read',{channel_id:channel.id},operator)).map((m:Entity)=>m.id)).toEqual([original.id]);
  const unrelated=await tx.add('channel',{...channel.data,name:'Another private customer'},'unrelated');
  await expect(run(tx,'message.read',{channel_id:unrelated.id},operator)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect((await run(tx,'channel.list',{},operator)).map((c:Entity)=>c.id)).toEqual([channel.id]);
 });
 it.each([
  ['AI-owned',{handoff:{state:'AI_ACTIVE',owner_id:null}}],
  ['already human-owned',{handoff:{state:'HUMAN_ACTIVE',owner_id:'second'}}],
  ['pending with another owner',{handoff:{state:'HANDOFF_PENDING',owner_id:'second'}}],
  ['missing owner field',{handoff:{state:'HANDOFF_PENDING'}}],
  ['ordinary direct',{type:'DIRECT'}],['internal site',{type:'SITE_INTERNAL'}],['client site',{type:'SITE_CLIENT'}],
 ] as [string,Data][])('does not discover or claim %s by guessing its channel ID',async(_name,patch)=>{
  const {tx,channel}=await privateSetup(),changed=await tx.save(channel,{...channel.data,...patch});
  expect(await run(tx,'handoff.inbox',{},operator)).toEqual({items:[]});
  await expect(claim(tx,changed)).rejects.toMatchObject({code:patch.handoff?.state==='HUMAN_ACTIVE'?'CONVERSATION_OWNED':'INVALID_STATE'});
  expect((await tx.get('channel',channel.id)).data.members).toEqual(channel.data.members);
 });
 it('requires the displayed current version and creates no membership or lead effect after a stale preview',async()=>{
  const {tx,channel}=await privateSetup();const lead=await tx.add('lead',{ownership:'HANDOFF_PENDING'},'lead');
  const linked=await tx.save(channel,{...channel.data,lead_id:lead.id});
  await expect(run(tx,'handoff.take',{channel_id:linked.id},operator)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  await expect(claim(tx,channel)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  expect((await tx.get('lead',lead.id)).data.ownership).toBe('HANDOFF_PENDING');
  expect((await tx.get('channel',linked.id)).data.members).toEqual(channel.data.members);
  expect(tx.events.filter(e=>e.type==='conversation.human_active')).toEqual([]);
 });
 it('a second operator cannot take the first winner or obtain its history from the same preview',async()=>{
  const {tx,channel}=await privateSetup();await claim(tx,channel);
  await expect(claim(tx,channel,second)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  await expect(run(tx,'message.read',{channel_id:channel.id},second)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect((await tx.get('channel',channel.id)).data.members.filter((m:Data)=>m.source==='OPERATOR_CLAIM')).toHaveLength(1);
  expect(tx.events.filter(e=>e.type==='conversation.human_active')).toHaveLength(1);
 });
 it.each([
  ['disabled',{active:false}],['lost manager role',{roles:['EMPLOYEE']}],
  ['mixed external role',{roles:['DIRECTOR','CLIENT']}],
  ['lost chat rights',{roles:['OWNER'],permissions:[]}],
 ] as [string,Data][])('rechecks the authoritative user after %s despite the cached actor',async(_name,patch)=>{
  const {tx,channel}=await privateSetup(),user=await tx.get('user',operator.userId);await tx.save(user,{...user.data,...patch});
  await expect(run(tx,'handoff.inbox',{},operator)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(claim(tx,channel)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect((await tx.get('channel',channel.id)).data.members).toEqual(channel.data.members);
 });
 it.each([
  ['no chat.read',{permissions:['chat.manage']}],['no chat.manage',{permissions:['chat.read']}],
  ['nonmanager',{roles:['EMPLOYEE']}],['external mixed manager',{roles:['DIRECTOR','CLIENT']}],
 ] as [string,Partial<Actor>][])('does not let an actor with %s inspect or join private inbox sessions',async(_name,patch)=>{
  const {tx,channel}=await privateSetup(),actor={...operator,...patch};
  await expect(run(tx,'handoff.inbox',{},actor)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(claim(tx,channel,actor)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('filters unauthorized sites and refuses scope removed from the current user',async()=>{
  const {tx,channel}=await privateSetup(),scoped=await tx.save(channel,{...channel.data,site_id:'site'});
  expect((await run(tx,'handoff.inbox',{},operator)).items).toHaveLength(1);
  const user=await tx.get('user',operator.userId);await tx.save(user,{...user.data,siteIds:[]});
  expect(await run(tx,'handoff.inbox',{},operator)).toEqual({items:[]});
  await expect(claim(tx,scoped)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const foreignSite=await tx.save(scoped,{...scoped.data,site_id:'other-site'});
  await expect(claim(tx,foreignSite)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('a foreign-company channel is neither an inbox item nor claimable',async()=>{
  const {tx,channel}=await privateSetup();tx.rows.set(`channel:${channel.id}`,{...channel,companyId:'foreign-company'});
  expect(await run(tx,'handoff.inbox',{},operator)).toEqual({items:[]});
  await expect(claim(tx,channel)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 it.each([{revoked_at:'2026-10-06T09:30:00Z'},{removed_at:'2026-10-06T09:30:00Z'},{left_at:'2026-10-06T09:30:00Z'},{active:false},{expires_at:'2026-10-06T10:00:00.000Z'},{expires_at:'invalid'}])('does not restore a previously removed operator membership: %j',async patch=>{
  const {tx,channel}=await privateSetup();const changed=await tx.save(channel,{...channel.data,members:[...channel.data.members,{user_id:operator.userId,source:'OPERATOR_CLAIM',claim_owner_id:operator.userId,history_from:channel.createdAt,...patch}]});
  expect(await run(tx,'handoff.inbox',{},operator)).toEqual({items:[]});
  await expect(claim(tx,changed)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect((await tx.get('channel',channel.id)).data.members).toEqual(changed.data.members);
 });
 it('bounds minimal pending metadata at100 and orders the oldest pending references first',async()=>{
  const {tx,channel}=await privateSetup();for(let n=0;n<105;n++)await tx.add('channel',{...channel.data,name:`Secret${n}`,handoff:{...channel.data.handoff,requested_at:new Date(Date.parse(channel.createdAt)+n*1000).toISOString()}},`pending-${n.toString().padStart(3,'0')}`);
  const inbox=await run(tx,'handoff.inbox',{},operator);expect(inbox.items).toHaveLength(100);
  expect(inbox.items.every((item:Data)=>Object.keys(item).sort().join(',')==='channel_id,requested_at,state,version')).toBe(true);
  expect(inbox.items.at(-1).requested_at).toBe('2026-10-06T09:01:38.000Z');
  expect(JSON.stringify(inbox)).not.toContain('Secret');
 });
 it('claims channel and lead ownership together without replacing another human owner',async()=>{
  const {tx,channel}=await privateSetup();const lead=await tx.add('lead',{ownership:'HUMAN_ACTIVE',humanOwnerId:second.userId},'lead'),linked=await tx.save(channel,{...channel.data,lead_id:lead.id});
  await expect(claim(tx,linked)).rejects.toMatchObject({code:'CONVERSATION_OWNED'});
  expect((await tx.get('channel',channel.id)).data.members).toEqual(channel.data.members);
  const pending=await tx.save(await tx.get('lead',lead.id),{ownership:'HANDOFF_PENDING',humanOwnerId:null});await claim(tx,linked);
  expect((await tx.get('lead',pending.id)).data).toMatchObject({ownership:'HUMAN_ACTIVE',humanOwnerId:operator.userId});
 });
 it('refuses a foreign-company linked lead before creating claim membership',async()=>{
  const {tx,channel}=await privateSetup(),lead=await tx.add('lead',{ownership:'HANDOFF_PENDING'},'foreign-lead');tx.rows.set(`lead:${lead.id}`,{...lead,companyId:'foreign-company'});
  const linked=await tx.save(channel,{...channel.data,lead_id:lead.id});await expect(claim(tx,linked)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  expect((await tx.get('channel',channel.id)).data.members).toEqual(channel.data.members);
 });
 it('explicit AI return removes only the claim-owned access and cancels its pending translation',async()=>{
  const {tx,channel,original}=await privateSetup(),claimed=await claim(tx,channel);
  const translation=await run(tx,'translation.request',{message_id:original.id,target_language:'UK'},operator);
  await run(tx,'handoff.resume',{channel_id:channel.id,reason:'Customer agreed to return to AI.'},operator,claimed.version);
  const resumed=await tx.get('channel',channel.id);
  expect(resumed.data.handoff.state).toBe('AI_ACTIVE');
  expect(resumed.data.members.find((m:Data)=>m.user_id==='guest')).toEqual(channel.data.members[0]);
  expect(resumed.data.members.find((m:Data)=>m.user_id===operator.userId)).toMatchObject({revoked_at:tx.now,revocation_reason:'AI_RESUMED'});
  expect((await tx.get('translation_request',translation.request_id)).data.status).toBe('CANCELLED');
  await expect(run(tx,'message.read',{channel_id:channel.id},operator)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(run(tx,'message.send',{channel_id:channel.id,text:'Unclaimed residual reply',language:'DE'},operator)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect((await run(tx,'message.read',{channel_id:channel.id},guest)).map((m:Entity)=>m.id)).toEqual([original.id]);
 });
 it('does not revoke a separately authorized persistent manager membership on AI return',async()=>{
  const {tx,channel}=await privateSetup(),claimed=await claim(tx,channel),persistent={user_id:operator.userId,history_from:channel.createdAt,joined_at:tx.now,source:'MANUAL_INVITATION',external:false};
  await tx.save(claimed,{...claimed.data,members:[...claimed.data.members,persistent]});
  await run(tx,'handoff.resume',{channel_id:channel.id,reason:'Explicit return with retained separately granted rights'},operator);
  expect((await tx.get('channel',channel.id)).data.members.find((m:Data)=>m.source==='MANUAL_INVITATION')).toEqual(persistent);
  expect(await run(tx,'message.read',{channel_id:channel.id},operator)).toHaveLength(1);
 });
 it('another operator cannot resume the claimed conversation; a fresh customer handoff permits the same operator to claim again',async()=>{
  const {tx,channel}=await privateSetup();await claim(tx,channel);
  await expect(run(tx,'handoff.resume',{channel_id:channel.id,reason:'Not my session'},second)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await run(tx,'handoff.resume',{channel_id:channel.id,reason:'Authorized return'},operator);
  const resumed=await tx.get('channel',channel.id),requested=await tx.save(resumed,{...resumed.data,handoff:{state:'HANDOFF_PENDING',owner_id:null,requested_at:tx.now}});
  expect((await run(tx,'handoff.inbox',{},operator)).items).toEqual([{channel_id:channel.id,version:requested.version,requested_at:tx.now,state:'HANDOFF_PENDING'}]);
  await expect(claim(tx,channel)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  const previous=resumed.data.members.find((m:Data)=>m.user_id===operator.userId),reclaimed=await claim(tx,requested);
  expect(reclaimed.data.handoff.owner_id).toBe(operator.userId);
  expect(reclaimed.data.members.filter((m:Data)=>m.user_id===operator.userId)).toHaveLength(2);
  expect(reclaimed.data.members.filter((m:Data)=>m.user_id===operator.userId)[0]).toEqual(previous);
  expect(reclaimed.data.members.at(-1)).toMatchObject({history_from:channel.createdAt,source:'OPERATOR_CLAIM',claim_owner_id:operator.userId});
  expect((await run(tx,'handoff.inbox',{},second)).items).toEqual([]);
 });
 it.each([
  {source:'MANUAL_INVITATION'},{claim_owner_id:'another-operator'},{revocation_reason:'ADMIN_REVOKED'},
  {active:false},{left_at:'2026-10-06T10:00:00.000Z'},{removed_at:'2026-10-06T10:00:00.000Z'},
  {expires_at:'2026-10-06T10:00:00.000Z'},{revokedAt:'2026-10-06T10:00:00.000Z'},
  {revoked_at:'invalid'},{joined_at:'invalid'},
 ])('an AI-return-looking record with additional authoritative removal is never restored: %j',async patch=>{
  const {tx,channel}=await privateSetup();await claim(tx,channel);await run(tx,'handoff.resume',{channel_id:channel.id,reason:'Explicit AI return'},operator);
  const resumed=await tx.get('channel',channel.id),changed=await tx.save(resumed,{...resumed.data,handoff:{state:'HANDOFF_PENDING',owner_id:null,requested_at:tx.now},members:resumed.data.members.map((m:Data)=>m.user_id===operator.userId?{...m,...patch}:m)});
  expect(await run(tx,'handoff.inbox',{},operator)).toEqual({items:[]});await expect(claim(tx,changed)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('one automatic return cannot override a separate earlier admin revocation record',async()=>{
  const {tx,channel}=await privateSetup();await claim(tx,channel);await run(tx,'handoff.resume',{channel_id:channel.id,reason:'Explicit AI return'},operator);
  const resumed=await tx.get('channel',channel.id),changed=await tx.save(resumed,{...resumed.data,handoff:{state:'HANDOFF_PENDING',owner_id:null,requested_at:tx.now},members:[...resumed.data.members,{user_id:operator.userId,source:'MANUAL_INVITATION',revoked_at:tx.now,history_from:channel.createdAt}]});
  expect(await run(tx,'handoff.inbox',{},operator)).toEqual({items:[]});await expect(claim(tx,changed)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
});
