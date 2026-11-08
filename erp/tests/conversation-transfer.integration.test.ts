import 'reflect-metadata';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {NestFactory} from '@nestjs/core';
import type {INestApplication} from '@nestjs/common';
import express from 'express';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {AuthService,hashToken} from '../apps/api/auth.ts';
import {createApiModule} from '../apps/api/http.ts';
import {whatsAppIngressHandler,whatsAppRawBody} from '../apps/api/whatsapp-ingress.ts';
import {WorkerRunner,serviceId,type OutboxJob} from '../apps/worker/runner.ts';
import {GUEST_TRANSFER_KIND,GUEST_TRANSFER_ROUTE_KIND} from '../packages/domain/conversation-transfer.ts';
import {transferEnvelope,signedTransferBody,transferPhone,transferSender,transferOrigin,syntheticPhoneId,syntheticAppSecret} from './helpers/conversation-transfer-fixture.ts';

const postgres=process.env.DATABASE_URL?describe:describe.skip;
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}

// Actual PostgreSQL/company locks, actual Nest/Express HTTP and signed synthetic Meta payloads.
// No provider send, external account or live-device acceptance is implied.
postgres('PostgreSQL ERP guest conversation transfer',()=>{
 let db:Database,engine:Engine;const apps:INestApplication[]=[];
 beforeAll(async()=>{expect(process.env.APP_MODE).toBe('TEST');db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(()=>{vi.stubEnv('WHATSAPP_PUBLIC_NUMBER',transferPhone);vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID',syntheticPhoneId);});
 afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllEnvs();for(const app of apps.splice(0))await app.close();});
 afterAll(async()=>{await db?.close();});
 async function fixture(){
  const company=`guest-transfer-${randomUUID()}`;
  await db.transaction(company,'SYNTHETIC_FIXTURE',async tx=>{
   await tx.add('user',{name:'Same synthetic guest name',active:true,guest:true,roles:['GUEST','CLIENT'],permissions:['chat.read','chat.write','lead.create','lead.manage','commerce.read'],siteIds:[],customerIds:[],warehouseIds:[]},'guest');
   await tx.add('user',{name:'Synthetic integration',active:true,roles:['SERVICE_ACCOUNT'],permissions:['integration.process','scope.company'],siteIds:[],customerIds:[],warehouseIds:[]},serviceId);
   await tx.add('channel',{type:'PRIVATE_CUSTOMER_ASSISTANT',name:'Synthetic private conversation',created_by:'guest',members:[{user_id:'guest',external:true,joined_at:new Date().toISOString(),history_from:'2026-01-01T00:00:00.000Z'}],handoff:{state:'AI_ACTIVE',owner_id:null}},'guest-channel');
   await tx.add('message',{channel_id:'guest-channel',author_id:'guest',text:'Synthetic private history'},'private-history');
  });
  const options={companyId:company,appMode:'TEST',publicOrigin:transferOrigin},auth=new AuthService(db,engine,options),session=await auth.createSession('guest',true,false);
  const headers={origin:transferOrigin,'content-type':'application/json',cookie:`knaba_guest=${session.token}`,'x-csrf-token':session.csrfToken};
  const app=await NestFactory.create(createApiModule({...options,db,engine,buildSha:'0'.repeat(40)}),{logger:false,bodyParser:false,abortOnError:false});apps.push(app);
  app.use('/api/v1/webhooks/whatsapp',whatsAppRawBody());app.use(express.json({verify:(req:any,_res,raw)=>{req.rawBody=raw;}}));app.getHttpAdapter().getInstance().post('/api/v1/webhooks/whatsapp',whatsAppIngressHandler(db,company,()=>({appSecret:syntheticAppSecret,phoneNumberId:syntheticPhoneId})));
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const request=(path:string,body?:unknown,override:Record<string,string>={})=>fetch(`${base}/api/v1/public/chat/guest-channel/transfer${path}`,{method:body===undefined?'GET':'POST',headers:{...headers,...override},body:body===undefined?undefined:JSON.stringify(body)});
  const webhook=(text:string,sender=transferSender,eventId:string=randomUUID())=>{const signed=signedTransferBody(transferEnvelope(text,sender,eventId));return {eventId,response:fetch(`${base}/api/v1/webhooks/whatsapp`,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signed.signature},body:signed.raw})};};
  return {company,auth,session,request,webhook};
 }
 type Fixture=Awaited<ReturnType<typeof fixture>>;
 async function issue(f:Fixture){const response=await f.request('',{});expect(response.status).toBe(201);const result=await response.json();return {...result,code:new URL(result.url).searchParams.get('text')!};}
 async function lease(company:string,eventId:string){const row=(await db.query("UPDATE outbox SET status='RUNNING',attempts=1,lease_token=$3,leased_until=clock_timestamp()+interval '60 seconds' WHERE company_id=$1 AND type='whatsapp.inbound' AND data->>'event_id'=$2 RETURNING *",[company,eventId,randomUUID()])).rows[0];expect(row).toBeDefined();return row as OutboxJob;}
 async function run(company:string,job:OutboxJob){await (new WorkerRunner(db,engine,{companyId:company,appMode:'TEST'}) as any).inbound(job);}
 async function claim(f:Fixture,code:string,sender=transferSender){const incoming=f.webhook(code,sender);expect((await incoming.response).status).toBe(200);const job=await lease(f.company,incoming.eventId);await run(f.company,job);return job;}
 async function status(f:Fixture){const response=await f.request('');expect(response.status).toBe(200);return (await response.json()).transfer;}
 async function confirm(f:Fixture,id:string){const pending=await status(f);return f.request(`/${id}/confirm`,{expectedVersion:pending.version,targetSender:pending.sender,whatsappConsent:true});}
 async function rows(company:string,kind:string){return (await db.query('SELECT id,version,data FROM aggregates WHERE company_id=$1 AND kind=$2 ORDER BY id',[company,kind])).rows;}
 async function noGrant(company:string){expect(await rows(company,'contact_identity')).toHaveLength(0);expect(await rows(company,GUEST_TRANSFER_ROUTE_KIND)).toHaveLength(0);expect(await rows(company,'notification_setting')).toHaveLength(0);}
 async function waitForCompanyWaiter(company:string,completed:()=>boolean){const deadline=Date.now()+2000;while(Date.now()<deadline){if(completed())return false;const waiting=(await db.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=(hashtext($1)::bigint & 4294967295)::oid AND objsubid=1 AND NOT granted LIMIT 1",[company])).rows;if(waiting.length)return true;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Expected a company-lock waiter within two seconds');}

 it('binds the original guest and exact channel after dual HTTP confirmation, with hash-only durable state and one retry effect',async()=>{
  const f=await fixture(),issued=await issue(f),before=await rows(f.company,'user'),eventId=randomUUID();
  const responses=await Promise.all(Array.from({length:10},()=>f.webhook(issued.code,transferSender,eventId).response));expect(responses.every(response=>response.status===200)).toBe(true);
  expect((await db.query("SELECT event_id FROM webhook_inbox WHERE provider='WHATSAPP' AND company_id=$1",[f.company])).rows).toHaveLength(1);
  expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='whatsapp.inbound'",[f.company])).rows).toHaveLength(1);
  const job=await lease(f.company,eventId);await run(f.company,job);await noGrant(f.company);expect((await status(f)).state).toBe('CLAIMED');expect(await rows(f.company,'conversation_input')).toHaveLength(0);
  const confirmed=await confirm(f,issued.id);expect(confirmed.status).toBe(201);expect(await confirmed.json()).toMatchObject({state:'CONFIRMED',channelId:'guest-channel'});
  expect(await rows(f.company,'user')).toEqual(before);expect((await rows(f.company,'contact_identity'))[0].data).toMatchObject({userId:'guest',value:transferSender,verified:true,customerVerified:false});expect((await rows(f.company,GUEST_TRANSFER_ROUTE_KIND))[0].data.channelId).toBe('guest-channel');
  await run(f.company,job);expect((await confirm(f,issued.id)).status).toBe(201);expect(await rows(f.company,'contact_identity')).toHaveLength(1);expect((await db.query("SELECT id FROM audit_log WHERE company_id=$1 AND action='GUEST_TRANSFER_CONFIRMED'",[f.company])).rows).toHaveLength(1);
  const stored=(await db.query('SELECT data::text AS value FROM aggregates WHERE company_id=$1 UNION ALL SELECT data::text FROM aggregate_revisions WHERE company_id=$1 UNION ALL SELECT detail::text FROM audit_log WHERE company_id=$1 UNION ALL SELECT payload::text FROM webhook_inbox WHERE company_id=$1 UNION ALL SELECT data::text FROM outbox WHERE company_id=$1 UNION ALL SELECT result::text FROM command_receipts WHERE company_id=$1',[f.company])).rows;
  expect(JSON.stringify(stored)).not.toContain(issued.code.split('.').at(-1));expect(JSON.stringify(stored)).not.toContain(issued.url);expect((await db.query('SELECT idempotency_key FROM command_receipts WHERE company_id=$1',[f.company])).rows).toHaveLength(0);
 });

 it('serializes two signed senders and concurrent confirms into one pinned identity without creating another guest',async()=>{
  const f=await fixture(),issued=await issue(f),incoming=[f.webhook(issued.code,transferSender),f.webhook(issued.code,'4915700000033')];for(const item of incoming)expect((await item.response).status).toBe(200);
  const jobs=await Promise.all(incoming.map(item=>lease(f.company,item.eventId)));await Promise.all(jobs.map(job=>run(f.company,job)));const pending=await status(f);expect([`+${transferSender}`,'+4915700000033']).toContain(pending.sender);await noGrant(f.company);
  const input={expectedVersion:pending.version,targetSender:pending.sender,whatsappConsent:true},responses=await Promise.all([f.request(`/${issued.id}/confirm`,input),f.request(`/${issued.id}/confirm`,input)]);expect(responses.every(response=>response.status===201)).toBe(true);
  expect(await rows(f.company,'user')).toHaveLength(2);expect(await rows(f.company,'contact_identity')).toHaveLength(1);expect((await rows(f.company,'contact_identity'))[0].data.value).toBe(pending.sender.slice(1));expect((await db.query("SELECT id FROM audit_log WHERE company_id=$1 AND action='GUEST_TRANSFER_CONFIRMED'",[f.company])).rows).toHaveLength(1);
 });

 it('observes original-session revocation committed while confirmation waits for the company lock, even with a replacement session',async()=>{
  const f=await fixture(),issued=await issue(f);await claim(f,issued.code);const pending=await status(f),locked=deferred(),release=deferred();
  const revocation=db.transaction(f.company,'SYNTHETIC_REVOCATION',async tx=>{await tx.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE company_id=$1 AND token_hash=$2',[f.company,hashToken(f.session.token)]);await f.auth.createSession('guest',true,false,tx);locked.resolve();await release.promise;});
  await locked.promise;let completed=false;const response=f.request(`/${issued.id}/confirm`,{expectedVersion:pending.version,targetSender:pending.sender,whatsappConsent:true}).finally(()=>{completed=true;});
  try{expect(await waitForCompanyWaiter(f.company,()=>completed)).toBe(true);}finally{release.resolve();await revocation;}
  expect((await response).status).toBe(401);await noGrant(f.company);expect((await rows(f.company,GUEST_TRANSFER_KIND))[0].data.state).toBe('CLAIMED');
 });

 it('rolls back contact, routing, consent and audit when the real SQL deadline expires after writes',async()=>{
  const f=await fixture(),issued=await issue(f);await claim(f,issued.code);const pending=await status(f);
  await db.query("UPDATE aggregates SET data=jsonb_set(data,'{expiresAt}',to_jsonb(clock_timestamp()+interval '2 seconds')) WHERE company_id=$1 AND kind=$2 AND id=$3",[f.company,GUEST_TRANSFER_KIND,issued.id]);
  const original=db.transaction.bind(db);let wroteContact=false;
  vi.spyOn(db,'transaction').mockImplementation(((company:any,actor:any,callback:any,timeout:any,readOnly:any)=>original(company,actor,async tx=>{const add=tx.add.bind(tx);tx.add=(async(kind:any,data:any,id:any)=>{const row=await add(kind,data,id);if(company===f.company&&kind==='contact_identity'){wroteContact=true;await tx.query('SELECT pg_sleep(2.1)');}return row;}) as typeof tx.add;return callback(tx);},timeout,readOnly)) as typeof db.transaction);
  const response=await f.request(`/${issued.id}/confirm`,{expectedVersion:pending.version,targetSender:pending.sender,whatsappConsent:true});expect(wroteContact).toBe(true);expect(response.status).toBeGreaterThanOrEqual(400);expect(await response.json()).toMatchObject({code:'EXPIRED'});await noGrant(f.company);
  expect((await rows(f.company,GUEST_TRANSFER_KIND))[0].data.state).toBe('CLAIMED');expect((await db.query("SELECT id FROM audit_log WHERE company_id=$1 AND action='GUEST_TRANSFER_CONFIRMED'",[f.company])).rows).toHaveLength(0);
 });

 it('does not merge or retarget a different User bound between claim and web confirmation',async()=>{
  const f=await fixture(),issued=await issue(f);await claim(f,issued.code);
  await db.transaction(f.company,'SYNTHETIC_CONFLICT',async tx=>{await tx.add('user',{name:'Same synthetic guest name',active:true,guest:true,roles:['GUEST','CLIENT']},'other');await tx.add('contact_identity',{type:'WHATSAPP',value:transferSender,userId:'other',verified:true,active:true},'existing-contact');});
  const before=await rows(f.company,'contact_identity'),response=await confirm(f,issued.id);expect(response.status).toBe(201);expect(await response.json()).toMatchObject({state:'CONFLICT'});expect(await rows(f.company,'contact_identity')).toEqual(before);expect(await rows(f.company,GUEST_TRANSFER_ROUTE_KIND)).toHaveLength(0);expect(await rows(f.company,'notification_setting')).toHaveLength(0);
 });

 it('cannot claim a challenge from another company through a valid signed inbox event',async()=>{
  const original=await fixture(),other=await fixture(),issued=await issue(original);await claim(other,issued.code);await noGrant(original.company);await noGrant(other.company);expect((await rows(original.company,GUEST_TRANSFER_KIND))[0].data.state).toBe('ISSUED');expect(await rows(other.company,GUEST_TRANSFER_KIND)).toHaveLength(0);
 });

 it('rolls back the actual inbox row when outbox publication fails before the HTTP acknowledgement',async()=>{
  const f=await fixture(),original=db.transaction.bind(db);
  vi.spyOn(db,'transaction').mockImplementation(((company:any,actor:any,callback:any,timeout:any,readOnly:any)=>original(company,actor,async tx=>{if(company===f.company&&actor==='WHATSAPP_INBOX')tx.event=async()=>{throw new Error('Synthetic outbox failure');};return callback(tx);},timeout,readOnly)) as typeof db.transaction);
  const response=await f.webhook('Hello').response;expect(response.status).toBe(503);expect((await db.query('SELECT event_id FROM webhook_inbox WHERE company_id=$1',[f.company])).rows).toHaveLength(0);expect((await db.query('SELECT id FROM outbox WHERE company_id=$1',[f.company])).rows).toHaveLength(0);
 });

 it.each(['scope','STOP'] as const)('restricts signed transfer consent to its conversation and observes committed %s before queued provider egress',async change=>{
  const f=await fixture(),issued=await issue(f);await claim(f,issued.code);expect((await confirm(f,issued.id)).status).toBe(201);
  const command=async(name:string,input:unknown,user=serviceId)=>engine.execute(await engine.getActor(user,f.company),name,{input,idempotency_key:randomUUID()});
  const configured:any=await command('notifications.configure',{language:'EN',whatsapp_consent:true,quiet_start:0,quiet_end:0},'guest');
  expect(configured.data).toMatchObject({whatsapp_consent_scope:{kind:'CONVERSATION',channel_id:'guest-channel',transfer_id:issued.id},consent_purpose:'CONTINUE_GUEST_CONVERSATION',consent_source:'DUAL_CHANNEL_GUEST_TRANSFER'});
  await db.transaction(f.company,'SYNTHETIC_FIXTURE',async tx=>{
   const channel=await tx.get('channel','guest-channel');await tx.add('channel',{...channel.data,name:'Another readable conversation'},'other-channel');
   await tx.add('message',{channel_id:'other-channel',author_id:'guest',text:'Unrelated synthetic notice',message_version:1},'other-message');
  });
  expect(await command('delivery.prepare',{message_id:'other-message',recipient_id:'guest',channel:'WHATSAPP'})).toMatchObject({allowed:false,reason:'CHANNEL_CONSENT_REQUIRED'});
  const delivery:any=await command('delivery.prepare',{message_id:'private-history',recipient_id:'guest',channel:'WHATSAPP'});expect(delivery.kind).toBe('delivery');
  const job=(await db.query("UPDATE outbox SET status='RUNNING',attempts=1,lease_token=$3,leased_until=clock_timestamp()+interval '60 seconds' WHERE company_id=$1 AND type='delivery.requested' AND data->>'delivery_id'=$2 RETURNING *",[f.company,delivery.id,randomUUID()])).rows[0] as OutboxJob;expect(job).toBeDefined();
  const send=vi.fn(async()=>({provider_message_id:'synthetic-should-not-send',status:'API_ACCEPTED'})),runner=new WorkerRunner(db,engine,{companyId:f.company,appMode:'TEST',testRecipients:[transferSender],whatsapp:{phoneNumberId:syntheticPhoneId,send} as any}),activeJob=(runner as any).activeJob.bind(runner);
  vi.spyOn(runner as any,'activeJob').mockImplementation(async(current:any)=>{
   await activeJob(current);expect((await rows(f.company,'delivery'))[0].data.status).toBe('SENDING');
   await db.transaction(f.company,'SYNTHETIC_CONSENT_CHANGE',async tx=>{const setting=(await tx.list('notification_setting'))[0]!;await tx.save(setting,{...setting.data,...change==='STOP'?{opted_out:true}:{whatsapp_consent_scope:{...setting.data.whatsapp_consent_scope,channel_id:'other-channel'}}},setting.version);});
  });
  await (runner as any).delivery(job);expect(send).not.toHaveBeenCalled();expect((await rows(f.company,'delivery'))[0].data).toMatchObject({status:'FAILED',error:'CHANNEL_CONSENT_REQUIRED',failure_class:'DEFINITIVE'});
 });

 it('does not commit a signed claim after its real worker lease expires during the transaction',async()=>{
  const f=await fixture(),issued=await issue(f),incoming=f.webhook(issued.code);expect((await incoming.response).status).toBe(200);const job=await lease(f.company,incoming.eventId);
  await db.query("UPDATE outbox SET leased_until=clock_timestamp()+interval '2 seconds' WHERE company_id=$1 AND id=$2",[f.company,job.id]);const original=db.transaction.bind(db);let wroteClaim=false;
  vi.spyOn(db,'transaction').mockImplementation(((company:any,actor:any,callback:any,timeout:any,readOnly:any)=>original(company,actor,async tx=>{const save=tx.save.bind(tx);tx.save=(async(row:any,data:any,version:any)=>{const saved=await save(row,data,version);if(company===f.company&&row.kind===GUEST_TRANSFER_KIND&&data.state==='CLAIMED'){wroteClaim=true;await tx.query('SELECT pg_sleep(2.1)');}return saved;}) as typeof tx.save;return callback(tx);},timeout,readOnly)) as typeof db.transaction);
  await expect(run(f.company,job)).rejects.toMatchObject({code:'WORKER_LEASE_LOST'});expect(wroteClaim).toBe(true);expect((await rows(f.company,GUEST_TRANSFER_KIND))[0].data.state).toBe('ISSUED');await noGrant(f.company);expect((await db.query("SELECT id FROM audit_log WHERE company_id=$1 AND action='GUEST_TRANSFER_CLAIMED'",[f.company])).rows).toHaveLength(0);
 });
});
