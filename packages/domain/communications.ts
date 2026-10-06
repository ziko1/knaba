import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Actor, assert, CommandContext, CommandRegistry, Data, DomainError, Entity, id, isManager, timestamp } from './core.ts';
import { ROLE_PERMISSIONS } from './permissions.ts';

export const language = z.enum(['DE','UK','RU','PL','LT','EN']);
const channelType = z.enum(['COMPANY_GENERAL','COMPANY_ANNOUNCEMENTS','TEAM','SITE_INTERNAL','TASK_THREAD','DIRECT','SITE_CLIENT','PRIVATE_CUSTOMER_ASSISTANT']);
const externalTypes = new Set(['SITE_CLIENT','PRIVATE_CUSTOMER_ASSISTANT']);
const digest = (...values:string[]) => createHash('sha256').update(values.join('\u0000')).digest('hex');
const external = (ctx:CommandContext) => ctx.actor.roles.some(r=>['CUSTOMER','CLIENT','EXTERNAL_BAULEITER','GUEST'].includes(r));
function member(channel:Entity,userId:string,now:string) {return (channel.data.members as Data[]??[]).find(m=>{const expiry=m.expires_at??m.expiresAt;return m.user_id===userId&&m.active!==false&&!m.revoked_at&&!m.revokedAt&&!m.left_at&&!m.leftAt&&!m.removed_at&&!m.removedAt&&(!expiry||Date.parse(expiry)>Date.parse(now));});}
function userPermissions(user:Entity):string[] {return [...new Set([...(user.data.roles??[]).flatMap((r:string)=>ROLE_PERMISSIONS[r]??[]),...(user.data.permissions??[])])];}
async function channelSite(ctx:CommandContext,channel:Entity):Promise<string|undefined> {
  const siteId=channel.data.site_id as string|undefined;
  if(!channel.data.task_id)return siteId;
  const task=await ctx.tx.get('task',channel.data.task_id);assert(task.companyId===ctx.actor.companyId&&(!siteId||siteId===task.data.siteId),'ACCESS_DENIED');return task.data.siteId;
}
async function assertCustomerSite(ctx:CommandContext,userId:string,siteId:string,customerId?:string) {
  const site=await ctx.tx.get('site',siteId);assert(site.companyId===ctx.actor.companyId&&site.data.customerId&&(!customerId||customerId===site.data.customerId),'ACCESS_DENIED');
  const now=Date.parse(ctx.now);
  assert((await ctx.tx.list('customer_membership')).some(m=>{const d=m.data,expiry=d.expiresAt??d.expires_at;return m.companyId===ctx.actor.companyId&&d.active===true&&!d.revokedAt&&!d.revoked_at&&(d.userId??d.user_id)===userId&&d.customerId===site.data.customerId&&(d.permissions??[]).includes('VIEW')&&(!expiry||Date.parse(expiry)>now)&&(!(d.siteIds??[]).length||d.siteIds.includes(siteId));}),'ACCESS_DENIED');
}
export async function assertChannelAccess(ctx:CommandContext,channel:Entity) {
  assert(channel.companyId===ctx.actor.companyId,'NOT_FOUND_SAFE');
  assert(member(channel,ctx.actor.userId,ctx.now),'ACCESS_DENIED');
  assert(!external(ctx)||externalTypes.has(channel.data.type),'ACCESS_DENIED');
  const siteId=await channelSite(ctx,channel);
  if(external(ctx)&&channel.data.type==='SITE_CLIENT') {assert(siteId,'ACCESS_DENIED');await assertCustomerSite(ctx,ctx.actor.userId,siteId,channel.data.customer_id);}
  else if(siteId&&!external(ctx))ctx.requireSite(siteId);
}
export async function visibleMessage(ctx:CommandContext,messageId:string) {
  const message=await ctx.tx.get('message',messageId), channel=await ctx.tx.get('channel',message.data.channel_id);
  await assertChannelAccess(ctx,channel);
  assert(!message.data.deleted_at && message.createdAt >= member(channel,ctx.actor.userId,ctx.now)!.history_from,'NOT_FOUND_SAFE');
  return {message,channel};
}
async function manageChannel(ctx:CommandContext,channel:Entity) {
  await assertChannelAccess(ctx,channel);
  assert(!external(ctx)&&(isManager(ctx.actor)||ctx.actor.roles.some(r=>['FOREMAN','INTERNAL_BAULEITER','TEAM_LEAD','TEAM_LEADER'].includes(r))||channel.data.type==='DIRECT'&&channel.data.created_by===ctx.actor.userId),'ACCESS_DENIED');
  if(channel.data.site_id) ctx.requireSite(channel.data.site_id);
}
async function recipientCanRead(ctx:CommandContext,channel:Entity,userId:string,message:Entity) {
  try {
    const user=await ctx.tx.get('user',userId);assert(user.companyId===ctx.actor.companyId&&user.data.active!==false,'ACCESS_DENIED');
    const roles:string[]=user.data.roles??[],permissions=userPermissions(user);
    const actor:Actor={userId,companyId:ctx.actor.companyId,roles,permissions,siteIds:user.data.siteIds??[],customerIds:[],warehouseIds:user.data.warehouseIds??[]};
    assert(permissions.includes('chat.read'),'ACCESS_DENIED');
    await assertChannelAccess({...ctx,actor,requireSite:siteId=>assert(permissions.includes('scope.company')||actor.siteIds.includes(siteId),'ACCESS_DENIED')},channel);
    const m=member(channel,userId,ctx.now);return !!m&&!message.data.deleted_at&&message.createdAt>=(m.history_from??'');
  }catch(error){if(error instanceof DomainError&&['ACCESS_DENIED','NOT_FOUND_SAFE'].includes(error.code))return false;throw error;}
}
async function accessibleChannels(ctx:CommandContext) {
  const channels:Entity[]=[];
  for(const channel of await ctx.tx.list('channel'))try{await assertChannelAccess(ctx,channel);channels.push(channel);}catch(error){if(!(error instanceof DomainError)||!['ACCESS_DENIED','NOT_FOUND_SAFE'].includes(error.code))throw error;}
  return channels;
}
async function assertAttachment(ctx:CommandContext,channel:Entity,media:Entity) {
  assert(media.companyId===ctx.actor.companyId&&media.data.visibility!=='CONFIDENTIAL'&&!media.data.employeeId&&!media.data.employee_id,'ACCESS_DENIED');
  assert(['RECEIVED','APPROVED_FOR_CLIENT'].includes(media.data.state),'INVALID_STATE');
  const siteId=await channelSite(ctx,channel);assert(siteId&&media.data.siteId===siteId,'ACCESS_DENIED');
  if(externalTypes.has(channel.data.type))assert(media.data.visibility==='CLIENT_AFTER_APPROVAL'&&media.data.state==='APPROVED_FOR_CLIENT'&&media.data.clientBlobKey&&media.data.clientBlobKey!==media.data.blobKey&&/^[a-f0-9]{64}$/.test(media.data.clientSha256??'')&&media.data.metadataStripped===true&&media.data.redactionConfirmed===true,'CLIENT_COPY_REQUIRED');
  if(external(ctx))await assertCustomerSite(ctx,ctx.actor.userId,siteId,channel.data.customer_id);
  else {ctx.requireSite(siteId);assert(media.data.uploadedBy===ctx.actor.userId||ctx.actor.permissions.includes('media.read'),'ACCESS_DENIED');}
}
function messageRevision(message:Entity,version:number) { return (message.data.revisions as Data[]).find(r=>r.version===version); }
async function activity(ctx:CommandContext,channelId:string) {
  return (await ctx.tx.list('channel_activity')).find(a=>a.data.channel_id===channelId&&a.data.user_id===ctx.actor.userId);
}

export interface DeliveryPolicy { allowed:boolean; channel:'WEB'|'WHATSAPP'; kind?:'TEXT'|'TEMPLATE'; reason?:string; template?:string; }
export function whatsAppPolicy(input:{now:string;last_inbound_at?:string;consent:boolean;opted_out?:boolean;approved_template?:string;template_status?:string}):DeliveryPolicy {
  if(!input.consent||input.opted_out) return {allowed:false,channel:'WHATSAPP',reason:'CHANNEL_CONSENT_REQUIRED'};
  const age=input.last_inbound_at?Date.parse(input.now)-Date.parse(input.last_inbound_at):Infinity;
  if(age>=0&&age<24*60*60*1000) return {allowed:true,channel:'WHATSAPP',kind:'TEXT'};
  if(input.approved_template&&input.template_status==='APPROVED') return {allowed:true,channel:'WHATSAPP',kind:'TEMPLATE',template:input.approved_template};
  return {allowed:false,channel:'WHATSAPP',reason:'WHATSAPP_WINDOW_CLOSED'};
}
export function isQuietHour(now:string,start:number,end:number,timezone='Europe/Berlin') {
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));
  return start===end ? false : start<end ? hour>=start&&hour<end : hour>=start||hour<end;
}

export const communicationsCommands:CommandRegistry={
  'channel.create':{permission:'chat.write',schema:z.object({type:channelType,name:z.string().min(1).max(150),member_ids:z.array(id).min(1).max(500),external_member_ids:z.array(id).default([]),site_id:id.optional(),task_id:id.optional(),customer_id:id.optional(),lead_id:id.optional()}).strict(),handler:async(ctx,input)=>{
    if(external(ctx)) {assert(input.type==='PRIVATE_CUSTOMER_ASSISTANT'&&input.member_ids.length===1&&input.member_ids[0]===ctx.actor.userId,'ACCESS_DENIED');}
    else if(!['DIRECT','PRIVATE_CUSTOMER_ASSISTANT'].includes(input.type)) assert(isManager(ctx.actor)||ctx.actor.roles.some(r=>['FOREMAN','INTERNAL_BAULEITER','TEAM_LEAD','TEAM_LEADER'].includes(r)),'ACCESS_DENIED');
    if(input.site_id) ctx.requireSite(input.site_id);
    if(['SITE_INTERNAL','SITE_CLIENT'].includes(input.type)) assert(input.site_id,'VALIDATION_ERROR');
    if(input.type==='TASK_THREAD') {assert(input.task_id,'VALIDATION_ERROR'); const task=await ctx.tx.get('task',input.task_id); ctx.requireSite(task.data.siteId);assert(!input.site_id||input.site_id===task.data.siteId,'ACCESS_DENIED');input={...input,site_id:task.data.siteId};}
    assert(externalTypes.has(input.type)||input.external_member_ids.length===0,'ACCESS_DENIED');
    assert(input.type!=='DIRECT'||new Set([...input.member_ids,ctx.actor.userId]).size===2,'VALIDATION_ERROR');
    if(input.lead_id) await ctx.tx.get('lead',input.lead_id);
    const memberIds=[...new Set([...input.member_ids,ctx.actor.userId])];
    for(const userId of memberIds){const user=await ctx.tx.get('user',userId);assert(user.companyId===ctx.actor.companyId&&user.data.active!==false,'ACCESS_DENIED');const userExternal=(user.data.roles??[]).some((r:string)=>['CUSTOMER','CLIENT','EXTERNAL_BAULEITER','GUEST'].includes(r));assert(!userExternal||externalTypes.has(input.type),'ACCESS_DENIED');assert(userExternal===input.external_member_ids.includes(userId)||userId===ctx.actor.userId&&external(ctx),'VALIDATION_ERROR');if(input.site_id&&!userExternal)assert(userPermissions(user).includes('scope.company')||(user.data.siteIds??[]).includes(input.site_id),'ACCESS_DENIED');if(userExternal&&input.type==='SITE_CLIENT')await assertCustomerSite(ctx,userId,input.site_id,input.customer_id);}
    assert(input.external_member_ids.every((u:string)=>memberIds.includes(u)),'VALIDATION_ERROR');
    const channel=await ctx.tx.add('channel',{...input,created_by:ctx.actor.userId,members:memberIds.map(user_id=>({user_id,joined_at:ctx.now,history_from:ctx.now,external:input.external_member_ids.includes(user_id)})),history_policy:'FROM_JOIN',handoff:{state:'AI_ACTIVE',owner_id:null}});
    await ctx.tx.event('channel.created',{channel_id:channel.id}); return channel;
  }},
  'channel.membership':{permission:'chat.manage',schema:z.object({channel_id:id,user_id:id,action:z.enum(['ADD','REVOKE']),external:z.boolean().default(false),history_from:timestamp.optional()}).strict(),handler:async(ctx,input)=>{
    const channel=await ctx.tx.get('channel',input.channel_id); await manageChannel(ctx,channel);
    assert(channel.data.type!=='DIRECT','INVALID_STATE');
    assert(!input.external||externalTypes.has(channel.data.type),'ACCESS_DENIED');
    const targetUser=await ctx.tx.get('user',input.user_id);const targetExternal=(targetUser.data.roles??[]).some((r:string)=>['CUSTOMER','CLIENT','EXTERNAL_BAULEITER','GUEST'].includes(r));if(input.action==='ADD'){assert(targetUser.companyId===ctx.actor.companyId&&targetUser.data.active!==false&&targetExternal===input.external,'ACCESS_DENIED');const siteId=await channelSite(ctx,channel);if(siteId&&!targetExternal)assert(userPermissions(targetUser).includes('scope.company')||(targetUser.data.siteIds??[]).includes(siteId),'ACCESS_DENIED');if(targetExternal&&channel.data.type==='SITE_CLIENT'){assert(siteId,'ACCESS_DENIED');await assertCustomerSite(ctx,input.user_id,siteId,channel.data.customer_id);}}
    const members=(channel.data.members as Data[]).map(m=>({...m}));
    const current=members[(channel.data.members as Data[]).indexOf(member(channel,input.user_id,ctx.now)!)];
    if(input.action==='REVOKE') {assert(current,'NOT_FOUND_SAFE');current.revoked_at=ctx.now;}
    else {assert(!current,'INVALID_STATE'); assert(!input.history_from||isManager(ctx.actor),'ACCESS_DENIED');members.push({user_id:input.user_id,joined_at:ctx.now,history_from:input.history_from??ctx.now,external:input.external});}
    const saved=await ctx.tx.save(channel,{...channel.data,members},ctx.expectedVersion);
    if(input.action==='REVOKE') for(const pending of await ctx.tx.list('translation_request')) if(pending.data.user_id===input.user_id&&pending.data.channel_id===channel.id&&pending.data.status==='PENDING') await ctx.tx.save(pending,{...pending.data,status:'CANCELLED'});
    await ctx.tx.event('channel.membership_changed',{channel_id:channel.id,user_id:input.user_id,action:input.action}); return saved;
  }},
  'channel.list':{permission:'chat.read',schema:z.object({}).strict(),handler:async ctx=>accessibleChannels(ctx)},
  'handoff.take':{permission:'chat.manage',schema:z.object({channel_id:id}).strict(),handler:async(ctx,input)=>{
    const channel=await ctx.tx.get('channel',input.channel_id);await assertChannelAccess(ctx,channel);assert(isManager(ctx.actor),'ACCESS_DENIED');
    assert(channel.data.handoff?.state!=='HUMAN_ACTIVE'||channel.data.handoff.owner_id===ctx.actor.userId,'CONVERSATION_OWNED');
    if(channel.data.lead_id){const lead=await ctx.tx.get('lead',channel.data.lead_id);assert(lead.data.ownership!=='HUMAN_ACTIVE'||lead.data.humanOwnerId===ctx.actor.userId,'CONVERSATION_OWNED');await ctx.tx.save(lead,{...lead.data,ownership:'HUMAN_ACTIVE',humanOwnerId:ctx.actor.userId});}
    const saved=await ctx.tx.save(channel,{...channel.data,handoff:{state:'HUMAN_ACTIVE',owner_id:ctx.actor.userId,taken_at:ctx.now}},ctx.expectedVersion);await ctx.tx.event('conversation.human_active',{channel_id:channel.id,owner_id:ctx.actor.userId});return saved;
  }},
  'handoff.resume':{permission:'chat.manage',schema:z.object({channel_id:id,reason:z.string().min(1).max(1000)}).strict(),handler:async(ctx,input)=>{
    const channel=await ctx.tx.get('channel',input.channel_id);await assertChannelAccess(ctx,channel);assert(isManager(ctx.actor)&&channel.data.handoff?.state==='HUMAN_ACTIVE'&&channel.data.handoff.owner_id===ctx.actor.userId,'ACCESS_DENIED');
    if(channel.data.lead_id){const lead=await ctx.tx.get('lead',channel.data.lead_id);await ctx.tx.save(lead,{...lead.data,ownership:'AI_ACTIVE',humanOwnerId:null});}
    const saved=await ctx.tx.save(channel,{...channel.data,handoff:{state:'AI_ACTIVE',owner_id:null,resumed_at:ctx.now,resumed_by:ctx.actor.userId,reason:input.reason}},ctx.expectedVersion);await ctx.tx.event('conversation.ai_resumed',{channel_id:channel.id});return saved;
  }},
  'channel.mute':{permission:'chat.read',schema:z.object({channel_id:id,muted:z.boolean()}).strict(),handler:async(ctx,input)=>{
    const channel=await ctx.tx.get('channel',input.channel_id); await assertChannelAccess(ctx,channel);const current=await activity(ctx,channel.id);
    const data={...current?.data,channel_id:channel.id,user_id:ctx.actor.userId,muted:input.muted};return current?ctx.tx.save(current,data):ctx.tx.add('channel_activity',data);
  }},
  'channel.mark_read':{permission:'chat.read',schema:z.object({channel_id:id}).strict(),handler:async(ctx,input)=>{
    const channel=await ctx.tx.get('channel',input.channel_id);await assertChannelAccess(ctx,channel);const current=await activity(ctx,channel.id);
    const data={...current?.data,channel_id:channel.id,user_id:ctx.actor.userId,read_at:ctx.now};return current?ctx.tx.save(current,data):ctx.tx.add('channel_activity',data);
  }},
  'channel.unread':{permission:'chat.read',schema:z.object({}).strict(),handler:async ctx=>{
    const channels=await accessibleChannels(ctx);
    const messages=await ctx.tx.list('message'),activities=await ctx.tx.list('channel_activity');
    return channels.map(c=>({channel_id:c.id,unread:messages.filter(m=>m.data.channel_id===c.id&&!m.data.deleted_at&&m.data.author_id!==ctx.actor.userId&&m.createdAt>=member(c,ctx.actor.userId,ctx.now)!.history_from&&m.createdAt>(activities.find(a=>a.data.channel_id===c.id&&a.data.user_id===ctx.actor.userId)?.data.read_at??'')).length}));
  }},
  'message.send':{permission:'chat.write',schema:z.object({channel_id:id,text:z.string().min(1).max(12000),language,reply_to_id:id.optional(),task_id:id.optional(),location_node_id:id.optional(),attachment_ids:z.array(id).max(20).default([]),mention_ids:z.array(id).max(30).default([]),important:z.boolean().default(false),source:z.enum(['HUMAN','AI']).default('HUMAN')}).strict(),handler:async(ctx,input)=>{
    const channel=await ctx.tx.get('channel',input.channel_id);await assertChannelAccess(ctx,channel);
    if(channel.data.type==='COMPANY_ANNOUNCEMENTS') assert(isManager(ctx.actor),'ACCESS_DENIED');
    if(!external(ctx)&&input.source==='HUMAN'&&externalTypes.has(channel.data.type)&&channel.data.handoff?.state==='HUMAN_ACTIVE')assert(channel.data.handoff.owner_id===ctx.actor.userId,'CONVERSATION_OWNED');
    if(input.source==='AI') {assert(ctx.actor.roles.includes('SERVICE_ACCOUNT'),'ACCESS_DENIED');assert(channel.data.handoff?.state!=='HUMAN_ACTIVE','AI_SUPPRESSED');if(channel.data.lead_id){const lead=await ctx.tx.get('lead',channel.data.lead_id);assert(lead.data.ownership==='AI_ACTIVE','AI_SUPPRESSED');}}
    if(input.reply_to_id) {const {message}=await visibleMessage(ctx,input.reply_to_id);assert(message.data.channel_id===channel.id,'ACCESS_DENIED');}
    assert(input.mention_ids.every((u:string)=>!!member(channel,u,ctx.now)),'ACCESS_DENIED');
    for(const mediaId of input.attachment_ids)await assertAttachment(ctx,channel,await ctx.tx.get('media_asset',mediaId));
    if(input.task_id){const task=await ctx.tx.get('task',input.task_id);ctx.requireSite(task.data.siteId);assert(!channel.data.site_id||channel.data.site_id===task.data.siteId,'ACCESS_DENIED');}
    const message=await ctx.tx.add('message',{...input,author_id:ctx.actor.userId,message_version:1,revisions:[{version:1,text:input.text,language:input.language,edited_at:ctx.now,editor_id:ctx.actor.userId}],pinned:false,acknowledgements:[],visibility:externalTypes.has(channel.data.type)?'EXTERNAL':'INTERNAL'});
    await ctx.tx.event('message.created',{message_id:message.id,channel_id:channel.id,version:1});return message;
  }},
  'message.read':{permission:'chat.read',schema:z.object({channel_id:id,query:z.string().max(300).optional(),limit:z.number().int().min(1).max(200).default(50),after:timestamp.optional()}).strict(),handler:async(ctx,input)=>{
    const channel=await ctx.tx.get('channel',input.channel_id);await assertChannelAccess(ctx,channel);
    return (await ctx.tx.list('message')).filter(m=>m.data.channel_id===channel.id&&!m.data.deleted_at&&m.createdAt>=member(channel,ctx.actor.userId,ctx.now)!.history_from&&(!input.after||m.createdAt>input.after)&&(!input.query||m.data.text.toLocaleLowerCase().includes(input.query.toLocaleLowerCase()))).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).slice(-input.limit);
  }},
  'message.edit':{permission:'chat.write',schema:z.object({message_id:id,text:z.string().min(1).max(12000)}).strict(),handler:async(ctx,input)=>{
    const {message}=await visibleMessage(ctx,input.message_id);assert(message.data.author_id===ctx.actor.userId,'ACCESS_DENIED');
    const version=message.data.message_version+1;const saved=await ctx.tx.save(message,{...message.data,text:input.text,message_version:version,revisions:[...message.data.revisions,{version,text:input.text,language:message.data.language,edited_at:ctx.now,editor_id:ctx.actor.userId}]},ctx.expectedVersion);
    await ctx.tx.event('message.corrected',{message_id:message.id,channel_id:message.data.channel_id,version,notice:'CORRECTION'});return saved;
  }},
  'message.pin':{permission:'chat.write',schema:z.object({message_id:id,pinned:z.boolean()}).strict(),handler:async(ctx,input)=>{
    const {message,channel}=await visibleMessage(ctx,input.message_id);await manageChannel(ctx,channel);return ctx.tx.save(message,{...message.data,pinned:input.pinned},ctx.expectedVersion);
  }},
  'message.ack':{permission:'chat.read',schema:z.object({message_id:id}).strict(),handler:async(ctx,input)=>{
    const {message}=await visibleMessage(ctx,input.message_id);assert(message.data.important,'INVALID_STATE');
    const acknowledgements=(message.data.acknowledgements as Data[]).filter(a=>a.user_id!==ctx.actor.userId||a.message_version!==message.data.message_version);
    acknowledgements.push({user_id:ctx.actor.userId,message_version:message.data.message_version,acknowledged_at:ctx.now});return ctx.tx.save(message,{...message.data,acknowledgements});
  }},
  'message.copy_preview':{permission:'chat.write',schema:z.object({message_id:id,target_channel_id:id}).strict(),handler:async(ctx,input)=>{
    const {message}=await visibleMessage(ctx,input.message_id),channel=await ctx.tx.get('channel',input.target_channel_id);await assertChannelAccess(ctx,channel);await manageChannel(ctx,channel);assert(channel.data.type==='SITE_CLIENT','INVALID_STATE');
    const preview=await ctx.tx.add('message_copy_preview',{message_id:message.id,message_version:message.data.message_version,target_channel_id:channel.id,text:message.data.text,language:message.data.language,author_id:ctx.actor.userId,expires_at:new Date(Date.parse(ctx.now)+600000).toISOString(),status:'PENDING'});return preview;
  }},
  'message.copy_confirm':{permission:'chat.write',schema:z.object({preview_id:id}).strict(),handler:async(ctx,input)=>{
    const preview=await ctx.tx.get('message_copy_preview',input.preview_id);assert(preview.data.author_id===ctx.actor.userId&&preview.data.status==='PENDING'&&preview.data.expires_at>ctx.now,'INVALID_STATE');
    const {message}=await visibleMessage(ctx,preview.data.message_id),channel=await ctx.tx.get('channel',preview.data.target_channel_id);await assertChannelAccess(ctx,channel);await manageChannel(ctx,channel);assert(message.data.message_version===preview.data.message_version,'VERSION_CONFLICT');
    const saved=await ctx.tx.add('message',{channel_id:channel.id,text:preview.data.text,language:preview.data.language,author_id:ctx.actor.userId,message_version:1,revisions:[{version:1,text:preview.data.text,language:preview.data.language,edited_at:ctx.now,editor_id:ctx.actor.userId}],pinned:false,important:false,acknowledgements:[],visibility:'EXTERNAL',attachment_ids:[],mention_ids:[],source:'HUMAN',copied_from:message.id});
    await ctx.tx.save(preview,{...preview.data,status:'CONFIRMED',copied_message_id:saved.id});await ctx.tx.event('message.created',{message_id:saved.id,channel_id:channel.id,version:1});return saved;
  }},
  'translation.request':{permission:'translation.use',schema:z.object({message_id:id,target_language:language}).strict(),handler:async(ctx,input)=>{
    const {message,channel}=await visibleMessage(ctx,input.message_id);const configs=(await ctx.tx.list('assistant_config')).filter(c=>c.data.status==='ACTIVE');
    const model=configs[0]?.data.model??'deepseek-chat'; const glossary=(await ctx.tx.list('glossary')).find(g=>g.data.state==='ACTIVE');const glossaryVersion=glossary?.version??0;
    const key=digest(ctx.actor.companyId,message.id,String(message.data.message_version),message.data.language,input.target_language,model,String(glossaryVersion));
    let translation=(await ctx.tx.list('translation')).find(t=>t.data.cache_key===key);
    if(!translation){translation=await ctx.tx.add('translation',{cache_key:key,message_id:message.id,channel_id:channel.id,message_version:message.data.message_version,source_language:message.data.language,target_language:input.target_language,source_text:message.data.text,glossary_version:glossaryVersion,glossary:glossary?.data.entries??[],provider:'deepseek-compatible',model,status:'PENDING',requested_at:ctx.now});await ctx.tx.event('translation.requested',{translation_id:translation.id});}
    else if(translation.data.status==='FAILED'){translation=await ctx.tx.save(translation,{...translation.data,status:'PENDING',retry_requested_at:ctx.now});await ctx.tx.event('translation.requested',{translation_id:translation.id});}
    let request=(await ctx.tx.list('translation_request')).find(r=>r.data.translation_id===translation!.id&&r.data.user_id===ctx.actor.userId);
    if(!request) request=await ctx.tx.add('translation_request',{translation_id:translation.id,user_id:ctx.actor.userId,channel_id:channel.id,status:translation.data.status==='SUCCEEDED'?'SUCCEEDED':'PENDING'});
    return {translation_id:translation.id,request_id:request.id,status:translation.data.status,...translation.data.status==='SUCCEEDED'?{text:translation.data.text,machine_translation:true,message_version:translation.data.message_version}:{}};
  }},
  'translation.read':{permission:'translation.use',schema:z.object({translation_id:id}).strict(),handler:async(ctx,input)=>{
    const translation=await ctx.tx.get('translation',input.translation_id);await visibleMessage(ctx,translation.data.message_id);
    const own=(await ctx.tx.list('translation_request')).find(r=>r.data.translation_id===translation.id&&r.data.user_id===ctx.actor.userId&&r.data.status!=='CANCELLED');assert(own,'ACCESS_DENIED');
    const message=await ctx.tx.get('message',translation.data.message_id);assert(message.data.message_version===translation.data.message_version,'VERSION_CONFLICT');
    return {translation_id:translation.id,status:translation.data.status,message_version:translation.data.message_version,...translation.data.status==='SUCCEEDED'?{text:translation.data.text,machine_translation:true}: {reason:translation.data.error??'PROVIDER_PENDING'}};
  }},
  'translation.result':{permission:'integration.process',schema:z.object({translation_id:id,status:z.enum(['SUCCEEDED','FAILED']),text:z.string().min(1).max(24000).optional(),provider:z.string().max(100),model:z.string().max(100),error:z.string().max(100).optional(),usage:z.object({input_tokens:z.number().int().nonnegative(),output_tokens:z.number().int().nonnegative(),cost_cents:z.number().int().nonnegative().optional()}).optional()}).strict(),handler:async(ctx,input)=>{
    assert(ctx.actor.roles.includes('SERVICE_ACCOUNT'),'ACCESS_DENIED');const translation=await ctx.tx.get('translation',input.translation_id);
    if(translation.data.status==='SUCCEEDED')return {status:'ALREADY_PROCESSED'};
    assert(input.status!=='SUCCEEDED'||input.text,'VALIDATION_ERROR');
    const message=await ctx.tx.get('message',translation.data.message_id),channel=await ctx.tx.get('channel',translation.data.channel_id);
    if(message.data.deleted_at||message.data.message_version!==translation.data.message_version) {await ctx.tx.save(translation,{...translation.data,status:'CANCELLED',error:'VERSION_CONFLICT'});return {status:'CANCELLED'};}
    const saved=await ctx.tx.save(translation,{...translation.data,...input,completed_at:ctx.now});
    for(const request of await ctx.tx.list('translation_request')) if(request.data.translation_id===translation.id&&request.data.status!=='CANCELLED') {
      if(!await recipientCanRead(ctx,channel,request.data.user_id,message)) {await ctx.tx.save(request,{...request.data,status:'CANCELLED'});continue;}
      await ctx.tx.save(request,{...request.data,status:input.status});
      if(input.status==='SUCCEEDED')await ctx.tx.event('translation.ready',{translation_id:translation.id,request_id:request.id,recipient_id:request.data.user_id,message_id:message.id});
    }
    return saved;
  }},
  'translation.preferences':{permission:'translation.use',schema:z.object({mode:z.enum(['BUTTON','ORIGINAL_AND_AUTO','ORIGINAL_ONLY']),target_language:language,channel_id:id.optional()}).strict(),handler:async(ctx,input)=>{
    if(input.channel_id)await assertChannelAccess(ctx,await ctx.tx.get('channel',input.channel_id));
    const current=(await ctx.tx.list('translation_preference')).find(p=>p.data.user_id===ctx.actor.userId&&p.data.channel_id===input.channel_id);
    const data={...input,user_id:ctx.actor.userId};return current?ctx.tx.save(current,data):ctx.tx.add('translation_preference',data);
  }},
  'glossary.configure':{permission:'bot.manage',schema:z.object({entries:z.array(z.object({source:z.string().min(1).max(200),target:z.string().min(1).max(200),source_language:language,target_language:language}).strict()).max(500)}).strict(),handler:async(ctx,input)=>{
    assert(isManager(ctx.actor)||ctx.actor.roles.includes('IT_ADMIN'),'ACCESS_DENIED');for(const old of await ctx.tx.list('glossary'))if(old.data.state==='ACTIVE')await ctx.tx.save(old,{...old.data,state:'RETIRED'});
    return ctx.tx.add('glossary',{...input,state:'ACTIVE',published_at:ctx.now,author_id:ctx.actor.userId});
  }},
  'callback.create':{permission:'chat.read',schema:z.object({message_id:id,action:z.enum(['TRANSLATE','REPLY','OPEN_TASK','ACK']),target_language:language.optional(),ttl_seconds:z.number().int().min(30).max(900).default(300)}).strict(),handler:async(ctx,input)=>{
    const {message}=await visibleMessage(ctx,input.message_id);assert(input.action!=='TRANSLATE'||input.target_language,'VALIDATION_ERROR');const actionId=randomBytes(24).toString('base64url');
    await ctx.tx.add('callback',{action_hash:digest(actionId),message_id:message.id,message_version:message.data.message_version,recipient_id:ctx.actor.userId,action:input.action,target_language:input.target_language,expires_at:new Date(Date.parse(ctx.now)+input.ttl_seconds*1000).toISOString(),consumed_at:null});return {action_id:actionId,expires_at:new Date(Date.parse(ctx.now)+input.ttl_seconds*1000).toISOString()};
  }},
  'callback.consume':{permission:'chat.read',schema:z.object({action_id:z.string().min(20).max(100)}).strict(),handler:async(ctx,input)=>{
    const callback=(await ctx.tx.list('callback')).find(c=>c.data.action_hash===digest(input.action_id));assert(callback&&callback.data.recipient_id===ctx.actor.userId,'NOT_FOUND_SAFE');
    assert(callback.data.expires_at>ctx.now&&!callback.data.consumed_at,'CALLBACK_EXPIRED');const {message}=await visibleMessage(ctx,callback.data.message_id);assert(message.data.message_version===callback.data.message_version,'VERSION_CONFLICT');
    await ctx.tx.save(callback,{...callback.data,consumed_at:ctx.now});return {action:callback.data.action,message_id:message.id,target_language:callback.data.target_language,task_id:message.data.task_id};
  }},
  'delivery.prepare':{permission:'integration.process',schema:z.object({message_id:id,recipient_id:id,channel:z.enum(['WEB','WHATSAPP']),approved_template:z.string().max(100).optional(),template_status:z.enum(['APPROVED','PENDING','REJECTED']).optional()}).strict(),handler:async(ctx,input)=>{
    assert(ctx.actor.roles.includes('SERVICE_ACCOUNT'),'ACCESS_DENIED');const message=await ctx.tx.get('message',input.message_id),channel=await ctx.tx.get('channel',message.data.channel_id);
    assert(!message.data.deleted_at&&await recipientCanRead(ctx,channel,input.recipient_id,message),'ACCESS_DENIED');
    const settings=(await ctx.tx.list('notification_setting')).find(s=>s.data.user_id===input.recipient_id);
    const policy:DeliveryPolicy=input.channel==='WEB'?{allowed:true,channel:'WEB'}:whatsAppPolicy({now:ctx.now,last_inbound_at:settings?.data.last_inbound_at,consent:settings?.data.whatsapp_consent===true,opted_out:settings?.data.opted_out,approved_template:input.approved_template,template_status:input.template_status});
    if(!policy.allowed)return policy;
    const existing=(await ctx.tx.list('delivery')).find(d=>d.data.message_id===message.id&&d.data.message_version===message.data.message_version&&d.data.recipient_id===input.recipient_id&&d.data.channel===input.channel);
    if(existing)return existing;const delivery=await ctx.tx.add('delivery',{...input,message_version:message.data.message_version,channel_id:channel.id,policy,status:'PENDING',attempts:0});await ctx.tx.event('delivery.requested',{delivery_id:delivery.id});return delivery;
  }},
  'delivery.status':{permission:'integration.process',schema:z.object({delivery_id:id,status:z.enum(['API_ACCEPTED','SENT','DELIVERED','READ','FAILED']),provider_message_id:z.string().max(200).optional(),error:z.string().max(100).optional()}).strict(),handler:async(ctx,input)=>{
    assert(ctx.actor.roles.includes('SERVICE_ACCOUNT'),'ACCESS_DENIED');const delivery=await ctx.tx.get('delivery',input.delivery_id);
    const order=['PENDING','API_ACCEPTED','SENT','DELIVERED','READ'];if(input.status!=='FAILED'&&order.indexOf(input.status)<order.indexOf(delivery.data.status))return delivery;
    return ctx.tx.save(delivery,{...delivery.data,...input,provider_status_at:ctx.now});
  }},
  'delivery.reply_context':{permission:'chat.read',schema:z.object({provider_message_id:z.string().min(1).max(200)}).strict(),handler:async(ctx,input)=>{
    const copies=(await ctx.tx.list('delivery')).filter(d=>d.data.provider_message_id===input.provider_message_id&&d.data.recipient_id===ctx.actor.userId);assert(copies.length===1,'AMBIGUOUS_RECIPIENT');const {message}=await visibleMessage(ctx,copies[0].data.message_id);return {message_id:message.id,channel_id:message.data.channel_id};
  }},
  'notifications.configure':{permission:'chat.read',schema:z.object({language,whatsapp_consent:z.boolean(),opted_out:z.boolean().default(false),quiet_start:z.number().int().min(0).max(23).default(22),quiet_end:z.number().int().min(0).max(23).default(7),allowed_fallback:z.enum(['WEB','NONE']).default('WEB')}).strict(),handler:async(ctx,input)=>{
    const current=(await ctx.tx.list('notification_setting')).find(s=>s.data.user_id===ctx.actor.userId);const data={...current?.data,...input,user_id:ctx.actor.userId,timezone:'Europe/Berlin',consent_recorded_at:ctx.now};return current?ctx.tx.save(current,data):ctx.tx.add('notification_setting',data);
  }},
  'notifications.inbound':{permission:'integration.process',schema:z.object({user_id:id,received_at:timestamp}).strict(),handler:async(ctx,input)=>{
    assert(ctx.actor.roles.includes('SERVICE_ACCOUNT'),'ACCESS_DENIED');assert(Date.parse(input.received_at)<=Date.parse(ctx.now)+30000,'VALIDATION_ERROR');const current=(await ctx.tx.list('notification_setting')).find(s=>s.data.user_id===input.user_id);
    const last=current?.data.last_inbound_at;if(last&&last>input.received_at)return current;
    const data={...current?.data,user_id:input.user_id,last_inbound_at:input.received_at};return current?ctx.tx.save(current,data):ctx.tx.add('notification_setting',data);
  }},
  'notifications.schedule':{permission:'notifications.manage',schema:z.object({recipient_id:id,event:z.string().min(1).max(100),category:z.enum(['WORK','CHAT','PAYMENT','CUSTOMER','TECHNICAL']),scheduled_at:timestamp,dedup_key:z.string().min(1).max(200),channel:z.enum(['WEB','WHATSAPP']).default('WEB'),related_kind:z.string().max(100).optional(),related_id:id.optional(),message_id:id.optional(),template:z.string().max(100).optional(),template_status:z.enum(['APPROVED','PENDING','REJECTED']).optional(),max_attempts:z.number().int().min(1).max(3).default(3)}).strict(),handler:async(ctx,input)=>{
    assert(isManager(ctx.actor)||ctx.actor.roles.some(r=>['FOREMAN','SERVICE_ACCOUNT'].includes(r)),'ACCESS_DENIED');
    if(input.message_id){const message=await ctx.tx.get('message',input.message_id),channel=await ctx.tx.get('channel',message.data.channel_id);if(!ctx.actor.roles.includes('SERVICE_ACCOUNT'))await assertChannelAccess(ctx,channel);assert(await recipientCanRead(ctx,channel,input.recipient_id,message),'ACCESS_DENIED');}
    const existing=(await ctx.tx.list('notification')).find(n=>n.data.dedup_key===input.dedup_key&&n.data.recipient_id===input.recipient_id);if(existing)return existing;
    const settings=(await ctx.tx.list('notification_setting')).find(s=>s.data.user_id===input.recipient_id);
    const notification=await ctx.tx.add('notification',{...input,language:settings?.data.language??'DE',status:'PENDING',attempts:0});await ctx.tx.event('notification.scheduled',{notification_id:notification.id,not_before:input.scheduled_at});return notification;
  }},
  'notifications.prepare':{permission:'integration.process',schema:z.object({notification_id:id}).strict(),handler:async(ctx,input)=>{
    assert(ctx.actor.roles.includes('SERVICE_ACCOUNT'),'ACCESS_DENIED');const item=await ctx.tx.get('notification',input.notification_id);assert(['PENDING','RETRY_SCHEDULED'].includes(item.data.status),'INVALID_STATE');assert(item.data.scheduled_at<=ctx.now,'NOT_DUE');
    if(item.data.related_kind&&item.data.related_id){const related=await ctx.tx.get(item.data.related_kind,item.data.related_id);if(['RESOLVED','CLOSED','COMPLETED','ACCEPTED','CANCELLED','CONFIRMED'].includes(related.data.status)||related.data.explanation||related.data.explanation_id){await ctx.tx.save(item,{...item.data,status:'CANCELLED',reason:'RESOLVED'});return {status:'CANCELLED'};}}
    if(item.data.message_id){const message=await ctx.tx.get('message',item.data.message_id),channel=await ctx.tx.get('channel',message.data.channel_id);if(message.data.deleted_at||!await recipientCanRead(ctx,channel,item.data.recipient_id,message)){await ctx.tx.save(item,{...item.data,status:'CANCELLED',reason:'ACCESS_REVOKED'});return {status:'CANCELLED'};}}
    const settings=(await ctx.tx.list('notification_setting')).find(s=>s.data.user_id===item.data.recipient_id);
    if(settings?.data.opted_out){await ctx.tx.save(item,{...item.data,status:'CANCELLED',reason:'OPTED_OUT'});return {status:'CANCELLED'};}
    if(isQuietHour(ctx.now,settings?.data.quiet_start??22,settings?.data.quiet_end??7)){const next=new Date(Date.parse(ctx.now)+3600000).toISOString();await ctx.tx.save(item,{...item.data,status:'RETRY_SCHEDULED',scheduled_at:next});await ctx.tx.event('notification.scheduled',{notification_id:item.id,not_before:next});return {status:'RETRY_SCHEDULED',reason:'QUIET_HOURS'};}
    const policy:DeliveryPolicy=item.data.channel==='WHATSAPP'?whatsAppPolicy({now:ctx.now,last_inbound_at:settings?.data.last_inbound_at,consent:settings?.data.whatsapp_consent===true,opted_out:settings?.data.opted_out,approved_template:item.data.template,template_status:item.data.template_status}):{allowed:true,channel:'WEB'};
    if(!policy.allowed){if(settings?.data.allowed_fallback==='WEB'){return ctx.tx.save(item,{...item.data,status:'RUNNING',channel:'WEB',reason:'WHATSAPP_POLICY_FALLBACK',language:settings?.data.language??'DE'});}await ctx.tx.save(item,{...item.data,status:'FAILED',reason:policy.reason});return policy;}
    return ctx.tx.save(item,{...item.data,status:'RUNNING',language:settings?.data.language??'DE',policy});
  }},
  'notifications.complete':{permission:'integration.process',schema:z.object({notification_id:id,succeeded:z.boolean(),error:z.string().max(100).optional()}).strict(),handler:async(ctx,input)=>{
    assert(ctx.actor.roles.includes('SERVICE_ACCOUNT'),'ACCESS_DENIED');const item=await ctx.tx.get('notification',input.notification_id);assert(item.data.status==='RUNNING','INVALID_STATE');const attempts=item.data.attempts+1;
    const status=input.succeeded?'SUCCEEDED':attempts>=item.data.max_attempts?'FAILED':'RETRY_SCHEDULED';const scheduled_at=new Date(Date.parse(ctx.now)+60000*2**attempts).toISOString();
    const saved=await ctx.tx.save(item,{...item.data,status,attempts,error:input.error,scheduled_at});if(status==='RETRY_SCHEDULED')await ctx.tx.event('notification.scheduled',{notification_id:item.id,not_before:scheduled_at});return saved;
  }},
  'notifications.cancel':{permission:'notifications.manage',schema:z.object({notification_id:id}).strict(),handler:async(ctx,input)=>{
    const item=await ctx.tx.get('notification',input.notification_id);assert(item.data.recipient_id===ctx.actor.userId||isManager(ctx.actor),'ACCESS_DENIED');return ctx.tx.save(item,{...item.data,status:'CANCELLED'});
  }},
};
