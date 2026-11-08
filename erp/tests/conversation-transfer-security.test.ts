import {describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {GuestConversationTransfers,transferredGuestChannelIn} from '../apps/api/conversation-transfer.ts';
import {acceptWhatsAppWebhook} from '../apps/api/whatsapp-ingress.ts';
import {AuthService,csrfFor,hashToken} from '../apps/api/auth.ts';
import {WorkerRunner,serviceId,type OutboxJob} from '../apps/worker/runner.ts';
import {processGuestConversationTransfer} from '../apps/worker/conversation-transfer.ts';
import {parseWhatsAppWebhook,type WhatsAppInbound} from '../packages/integrations/whatsapp.ts';
import {GUEST_TRANSFER_KIND,GUEST_TRANSFER_ROUTE_KIND,GUEST_TRANSFER_LIMIT_KIND} from '../packages/domain/conversation-transfer.ts';
import {transferFixture,transferEnvelope,signedTransferBody,transferPhone,transferSender,syntheticPhoneId,syntheticAppSecret,transferCookie} from './helpers/conversation-transfer-fixture.ts';

const config={publicNumber:transferPhone,phoneNumberId:syntheticPhoneId};
async function prepared(){const f=transferFixture(),service=new GuestConversationTransfers(f.auth,()=>config),issued=await service.issue(f.makeRequest(),'guest-channel',{});return {...f,service,issued,code:new URL(issued.url).searchParams.get('text')!};}
type Fixture=Awaited<ReturnType<typeof prepared>>;
async function queue(f:Fixture,text=f.code,sender=transferSender,id:string=randomUUID()){
 const signed=signedTransferBody(transferEnvelope(text,sender,id));await acceptWhatsAppWebhook(f.db,f.db.companyId,signed.raw,signed.signature,{appSecret:syntheticAppSecret,phoneNumberId:syntheticPhoneId});
 const job=[...f.db.jobs.values()].find(row=>row.data.event_id===id)!;Object.assign(job,{status:'RUNNING',attempts:1,lease_token:randomUUID(),leased_until:new Date(Date.now()+60000).toISOString()});
 return {job:job as OutboxJob,input:f.db.inbox.get(`WHATSAPP:${id}`)!.payload as Extract<WhatsAppInbound,{kind:'MESSAGE'}>};
}
async function claim(f:Fixture,text=f.code,sender=transferSender,id?:string){const queued=await queue(f,text,sender,id);const runner=new WorkerRunner(f.db as any,f.engine,{companyId:f.db.companyId,appMode:'TEST'});await (runner as any).inbound(queued.job);return queued;}
async function pending(f:Fixture){return (await f.service.status(f.makeRequest(),'guest-channel')).transfer!;}
async function confirm(f:Fixture,overrides:Record<string,unknown>={}){const status=await pending(f);return f.service.confirm(f.makeRequest(),'guest-channel',f.issued.id,{expectedVersion:status.version,targetSender:status.sender,whatsappConsent:true,...overrides});}
const noBinding=async(f:Fixture)=>{expect(await f.db.list('contact_identity')).toHaveLength(0);expect(await f.db.list(GUEST_TRANSFER_ROUTE_KIND)).toHaveLength(0);expect(await f.db.list('notification_setting')).toHaveLength(0);};

describe('guest transfer trust and state boundaries',()=>{
 it('keeps the same canonical guest, channel and history only after both confirmations',async()=>{
  const f=await prepared(),users=await f.db.list('user'),history=await f.db.list('message');
  expect((await pending(f)).state).toBe('ISSUED');await noBinding(f);
  const queued=await claim(f);expect((await pending(f))).toMatchObject({state:'CLAIMED',sender:`+${transferSender}`});await noBinding(f);
  expect(await f.db.list('conversation_input')).toHaveLength(0);expect(await f.db.list('user')).toEqual(users);expect(await f.db.list('message')).toEqual(history);
  const current=await pending(f),body={expectedVersion:current.version,targetSender:current.sender,whatsappConsent:true};
  expect(await f.service.confirm(f.makeRequest(),'guest-channel',f.issued.id,body)).toMatchObject({state:'CONFIRMED',channelId:'guest-channel'});
  expect(await f.db.list('user')).toEqual(users);expect(await f.db.list('message')).toEqual(history);
  const identity=(await f.db.list('contact_identity'))[0]!;expect(identity.data).toMatchObject({userId:'guest',value:transferSender,verified:true,customerVerified:false});
  expect((await f.db.list('notification_setting'))[0]!.data).toMatchObject({user_id:'guest',whatsapp_consent:true,whatsapp_consent_scope:{kind:'CONVERSATION',channel_id:'guest-channel',transfer_id:f.issued.id},consent_purpose:'CONTINUE_GUEST_CONVERSATION'});
  const before=structuredClone({rows:f.db.rows,audit:f.db.audit});await f.service.confirm(f.makeRequest(),'guest-channel',f.issued.id,body);await processGuestConversationTransfer(f.db as any,f.engine,queued.job,queued.input,serviceId);expect({rows:f.db.rows,audit:f.db.audit}).toEqual(before);
  const actor=await f.engine.getActor('guest',f.db.companyId);expect((await f.engine.readEntities(actor,'message')).map(row=>row.id)).toContain('private-history');
  expect(await f.db.transaction(f.db.companyId,serviceId,tx=>transferredGuestChannelIn(tx,f.db.companyId,'guest',transferSender))).toMatchObject({id:'guest-channel'});
  const original=f.db.rows.get('channel:guest-channel')!;f.db.rows.delete('channel:guest-channel');f.db.put('channel','earlier-channel',{...original.data,name:'A different older guest conversation'});f.db.rows.set('channel:guest-channel',original);expect((await f.db.list('channel'))[0]!.id).toBe('earlier-channel');
  const normal=await queue(f,'Continue my consultation',transferSender);const runner=new WorkerRunner(f.db as any,f.engine,{companyId:f.db.companyId,appMode:'TEST'});(runner as any).router=()=>({route:async()=>({handled:true})});await (runner as any).inbound(normal.job);
  expect((await f.db.list('conversation_input'))[0]!.data).toMatchObject({user_id:'guest',channel_id:'guest-channel'});expect(await f.db.list('user')).toEqual(users);
 });

 it('never persists a raw token in aggregates, audit, inbox, outbox or command receipts',async()=>{
  const f=await prepared();await claim(f);await confirm(f);const secret=f.code.split('.').at(-1)!;
  const persistence=JSON.stringify({rows:[...f.db.rows.values()],audit:f.db.audit,inbox:[...f.db.inbox.values()],outbox:[...f.db.jobs.values()],receipts:f.db.receipts});
  expect(persistence).not.toContain(secret);expect(persistence).not.toContain(f.code);expect(persistence).not.toContain(f.issued.url);expect(f.db.receipts).toHaveLength(0);
  expect(JSON.stringify(await pending(f))).not.toMatch(/tokenHash|sessionHash|token_hash|\.([A-Za-z0-9_-]{43})/);
 });
 it('rejects a correctly signed claim with a wrong secret without falling through to guest creation',async()=>{
  const f=await prepared(),last=f.code.at(-1),wrong=f.code.slice(0,-1)+(last==='A'?'B':'A');await claim(f,wrong);expect((await pending(f)).state).toBe('ISSUED');await noBinding(f);expect(await f.db.list('user')).toHaveLength(2);expect(await f.db.list('conversation_input')).toHaveLength(0);
 });
 it('reuses an existing current binding only when it already belongs to this exact guest',async()=>{
  const f=await prepared();f.db.put('contact_identity','own-contact',{type:'WHATSAPP',value:transferSender,userId:'guest',verified:true,active:true});const original=await f.db.get('contact_identity','own-contact');await claim(f);expect(await confirm(f)).toMatchObject({state:'CONFIRMED'});expect(await f.db.list('contact_identity')).toEqual([original]);expect((await f.db.list(GUEST_TRANSFER_ROUTE_KIND))[0]!.data.contactIdentityId).toBe('own-contact');
 });

 it('does not allow a stolen code, another guest, or an unconfirmed claim to read history',async()=>{
  const f=await prepared();await claim(f,f.code,'4915700000033');await noBinding(f);
  f.db.put('user','other',{...f.db.rows.get('user:guest')!.data,name:'Same synthetic name'});
  const otherToken='other_guest_session_for_transfer_123456789';f.db.sessions.set(hashToken(otherToken),{...f.session,user_id:'other'});
  const req=f.makeRequest({...f.headers,cookie:`knaba_guest=${otherToken}`,'x-csrf-token':csrfFor(otherToken)});
  await expect(f.service.status(req,'guest-channel')).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  await expect(f.service.confirm(f.makeRequest({...f.headers,cookie:`knaba_guest=${otherToken}`,'x-csrf-token':csrfFor(otherToken)}),'guest-channel',f.issued.id,{expectedVersion:2,targetSender:'+4915700000033',whatsappConsent:true})).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  const other=await f.engine.getActor('other',f.db.companyId);expect(await f.engine.readEntities(other,'message')).toEqual([]);await noBinding(f);
 });

 it('pins the first signed sender and requires its exact displayed number and version',async()=>{
  const f=await prepared();await claim(f);await claim(f,f.code,'4915700000033');expect((await pending(f)).sender).toBe(`+${transferSender}`);
  await expect(confirm(f,{targetSender:'+4915700000033'})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(confirm(f,{expectedVersion:1})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  await expect(confirm(f,{whatsappConsent:false})).rejects.toBeDefined();await noBinding(f);
 });

 it('cannot substitute a new valid web session for the exact original guest session',async()=>{
  const f=await prepared();await claim(f);const replacement='replacement_guest_cookie_for_transfer_123456789';f.db.sessions.set(hashToken(replacement),{...f.session});
  const req=f.makeRequest({...f.headers,cookie:`knaba_guest=${replacement}`,'x-csrf-token':csrfFor(replacement)});
  await expect(f.service.confirm(req,'guest-channel',f.issued.id,{expectedVersion:2,targetSender:`+${transferSender}`,whatsappConsent:true})).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});await noBinding(f);
 });

 it.each(['revoked','expired','disabled','promoted','membership','channel-revoked'] as const)('does not grant a claim after original guest authority is %s',async kind=>{
  const f=await prepared();if(kind==='revoked')f.db.sessions.get(hashToken(transferCookie))!.revoked_at=new Date().toISOString();
  if(kind==='expired')f.db.sessions.get(hashToken(transferCookie))!.expires_at=new Date(Date.now()-1000).toISOString();
  if(kind==='disabled')f.db.rows.get('user:guest')!.data.active=false;
  if(kind==='promoted')f.db.rows.get('user:guest')!.data.roles=['CLIENT'];
  if(kind==='membership')f.db.put('customer_membership','membership',{userId:'guest',customerId:'customer',active:true,verified:true,permissions:['VIEW'],siteIds:[]});
  if(kind==='channel-revoked')f.db.rows.get('channel:guest-channel')!.data.members[0].revoked_at=new Date().toISOString();
  await claim(f);expect((await f.db.get(GUEST_TRANSFER_KIND,f.issued.id)).data.state).toBe('ISSUED');await noBinding(f);
 });

 it.each(['revoked','disabled','channel-revoked','customer-history'] as const)('revalidates %s after the signed claim and before web confirmation',async kind=>{
  const f=await prepared();await claim(f);if(kind==='revoked')f.db.sessions.get(hashToken(transferCookie))!.revoked_at=new Date().toISOString();
  if(kind==='disabled')f.db.rows.get('user:guest')!.data.active=false;
  if(kind==='channel-revoked')f.db.rows.get('channel:guest-channel')!.data.members[0].active=false;
  if(kind==='customer-history')f.db.rows.get('channel:guest-channel')!.data.customer_id='other-customer';
  await expect(f.service.confirm(f.makeRequest(),'guest-channel',f.issued.id,{expectedVersion:2,targetSender:`+${transferSender}`,whatsappConsent:true})).rejects.toBeDefined();await noBinding(f);
 });

 it.each(['active','revoked','expired','unverified'] as const)('does not retarget an existing %s binding to another User, even with the same name',async state=>{
  const f=await prepared();f.db.put('user','existing-guest',{...f.db.rows.get('user:guest')!.data});
  f.db.put('contact_identity','existing-binding',{type:'WHATSAPP',value:transferSender,userId:'existing-guest',verified:state!=='unverified',active:true,...state==='revoked'?{revoked_at:new Date().toISOString()}:{},...state==='expired'?{expiresAt:new Date(Date.now()-1000).toISOString()}:{} });
  const before=await f.db.get('contact_identity','existing-binding');await claim(f);expect((await pending(f)).state).toBe('CONFLICT');expect(await f.db.get('contact_identity','existing-binding')).toEqual(before);expect(await f.db.list('contact_identity')).toHaveLength(1);expect(await f.db.list(GUEST_TRANSFER_ROUTE_KIND)).toHaveLength(0);
 });

 it('rechecks conflicting identity creation between claim and confirmation',async()=>{
  const f=await prepared();await claim(f);f.db.put('contact_identity','raced-binding',{type:'WHATSAPP',value:transferSender,userId:'another-user',verified:true,active:true});
  expect(await confirm(f)).toMatchObject({state:'CONFLICT'});expect((await f.db.get('contact_identity','raced-binding')).data.userId).toBe('another-user');expect(await f.db.list(GUEST_TRANSFER_ROUTE_KIND)).toHaveLength(0);
 });

 it('expires at ten minutes, including a deadline reached after asynchronous confirmation writes',async()=>{
  const expired=await prepared();expired.db.clock=new Date(Date.parse(expired.issued.expiresAt));await claim(expired);expect((await pending(expired)).state).toBe('EXPIRED');await noBinding(expired);
  const f=await prepared();await claim(f);const add=f.db.add.bind(f.db);vi.spyOn(f.db,'add').mockImplementation(async(kind,data,id)=>{const row=await add(kind,data,id);if(kind==='contact_identity')f.db.clock=new Date(Date.parse(f.issued.expiresAt));return row as any;});
  await expect(confirm(f)).rejects.toMatchObject({code:'EXPIRED'});await noBinding(f);expect((await f.db.get(GUEST_TRANSFER_KIND,f.issued.id)).data.state).toBe('CLAIMED');
 });

 it('bounds issuance and active attempts and cancels without recovering a secret',async()=>{
  const f=await prepared();await expect(f.service.issue(f.makeRequest(),'guest-channel',{})).rejects.toMatchObject({code:'INVALID_STATE'});
  await f.service.cancel(f.makeRequest(),'guest-channel',f.issued.id,{});await claim(f);expect((await pending(f)).state).toBe('CANCELLED');await noBinding(f);
  for(let i=0;i<4;i++){const next=await f.service.issue(f.makeRequest(),'guest-channel',{});await f.service.cancel(f.makeRequest(),'guest-channel',next.id,{});}
  await expect(f.service.issue(f.makeRequest(),'guest-channel',{})).rejects.toMatchObject({code:'RATE_LIMITED'});expect((await f.db.get(GUEST_TRANSFER_LIMIT_KIND,'guest')).data.count).toBe(5);
 });

 it('does not expose the private transfer aggregate through generic Engine reads',async()=>{
  const f=await prepared();f.db.put('user','owner',{active:true,roles:['OWNER'],permissions:['identity.manage','scope.company'],siteIds:[],customerIds:[],warehouseIds:[]});
  for(const id of ['guest','owner']){const actor=await f.engine.getActor(id,f.db.companyId);for(const kind of [GUEST_TRANSFER_KIND,GUEST_TRANSFER_LIMIT_KIND,GUEST_TRANSFER_ROUTE_KIND])expect(await f.engine.readEntities(actor,kind)).toEqual([]);}
 });

 it.each(['no-lease','wrong-event','changed-sender','revoked-service-role','disabled-service'] as const)('requires current signed-inbox and worker authority: %s',async attack=>{
  const f=await prepared(),queued=await queue(f);if(attack==='no-lease')f.db.jobs.get(queued.job.id)!.leased_until=new Date(Date.now()-1).toISOString();
  if(attack==='wrong-event')queued.job={...queued.job,data:{...queued.job.data,event_id:'other-event'}};
  if(attack==='changed-sender')queued.input={...queued.input,sender:'4915700000098'};
  if(attack==='revoked-service-role')f.db.rows.get(`user:${serviceId}`)!.data.roles=['EMPLOYEE'];
  if(attack==='disabled-service')f.db.rows.get(`user:${serviceId}`)!.data.active=false;
  await expect(processGuestConversationTransfer(f.db as any,f.engine,queued.job,queued.input,serviceId)).rejects.toBeDefined();expect((await f.db.get(GUEST_TRANSFER_KIND,f.issued.id)).data.state).toBe('ISSUED');await noBinding(f);
 });

 it('rolls back a claim when the worker lease expires during asynchronous work',async()=>{
  const f=await prepared(),queued=await queue(f),save=f.db.save.bind(f.db);vi.spyOn(f.db,'save').mockImplementation(async(row,data,version)=>{const saved=await save(row,data,version);if(row.kind===GUEST_TRANSFER_KIND)f.db.jobs.get(queued.job.id)!.leased_until=new Date(Date.now()-1).toISOString();return saved;});
  await expect(processGuestConversationTransfer(f.db as any,f.engine,queued.job,queued.input,serviceId)).rejects.toMatchObject({code:'WORKER_LEASE_LOST'});expect((await f.db.get(GUEST_TRANSFER_KIND,f.issued.id)).data.state).toBe('ISSUED');await noBinding(f);
 });

 it('denies a confirmed route after the exact contact binding or channel membership is revoked',async()=>{
  const f=await prepared();await claim(f);await confirm(f);const identity=(await f.db.list('contact_identity'))[0]!;f.db.rows.get(`contact_identity:${identity.id}`)!.data.revokedAt=new Date().toISOString();
  await expect(f.db.transaction(f.db.companyId,serviceId,tx=>transferredGuestChannelIn(tx,f.db.companyId,'guest',transferSender))).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(confirm(f)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
});

describe('reserved transfer wire protocol',()=>{
 it.each(['KNABA_TRANSFER bad','knaba_transfer expired.invalid','Text before KNABA_TRANSFER leaked-secret','KNABA_TRANSFER','KNABA_TRANSFER '+ 'x'.repeat(200)])('redacts malformed reserved text: %s',text=>{
  const parsed=parseWhatsAppWebhook(transferEnvelope(text));expect(parsed).toMatchObject([{type:'transfer',transfer:{state:'INVALID'}}]);expect(JSON.stringify(parsed)).not.toContain(text);
 });
 it('reserves a transfer-looking caption without persisting media or the code',()=>{
  const body=transferEnvelope('unused'),message=body.entry[0]!.changes[0]!.value.messages[0]! as any;message.type='image';delete message.text;message.image={id:'image-id',mime_type:'image/jpeg',sha256:'hash',caption:'KNABA_TRANSFER never-persist-this'};
  const parsed=parseWhatsAppWebhook(body);expect(parsed).toMatchObject([{type:'transfer',transfer:{state:'INVALID'}}]);expect(parsed[0]).not.toHaveProperty('media');expect(JSON.stringify(parsed)).not.toContain('never-persist-this');
 });
 it('does not accept caller-provided proof fields from an ordinary webhook message',()=>{
  const body=transferEnvelope('Hello'),message=body.entry[0]!.changes[0]!.value.messages[0]! as any;message.transfer={state:'CLAIM',id:randomUUID(),tokenHash:'a'.repeat(64)};message.verified=true;message.userId='guest';
  const parsed=parseWhatsAppWebhook(body);expect(parsed[0]).toMatchObject({text:'Hello',type:'text'});expect(parsed[0]).not.toHaveProperty('transfer');expect(parsed[0]).not.toHaveProperty('verified');expect(parsed[0]).not.toHaveProperty('userId');
 });
});
