import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {WorkerRunner} from '../apps/worker/runner.ts';
import {acceptTelegramWebhook} from '../apps/api/telegram-ingress.ts';
import {TelegramBotAdapter} from '../packages/integrations/telegram.ts';
import {stageTelegramReply} from '../apps/worker/telegram-delivery.ts';

const pg=process.env.DATABASE_URL?describe:describe.skip;
const SECRET='synthetic-Telegram-QA-secret-20261025';
const now=()=>new Date();
const input=(id:number,text:string)=>Buffer.from(JSON.stringify({
  update_id:id,message:{message_id:id,date:Math.floor(Date.now()/1000),chat:{type:'private',id:187650211},from:{id:187650211,is_bot:false},text}
}));

pg('genuine PostgreSQL Telegram ingress and human claim (synthetic company, no provider I/O)',()=>{
 let db:Database, engine:Engine;
 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 afterAll(async()=>{await db?.close();});
 
 async function setup(){
   const company='telegram-qa-'+randomUUID(),actorId='operator';
   await db.transaction(company,'QA_INIT',async tx=>{
     await tx.add('company',{name:'Telegram isolated QA',operatingMode:'TEST',synthetic:true},company);
     await tx.add('user',{name:'Synthetic dispatcher',roles:['DIRECTOR'],active:true,siteIds:[],permissions:[],customerIds:[],warehouseIds:[],synthetic:true},actorId);
   });
   const runner=new WorkerRunner(db,engine,{companyId:company,appMode:'TEST'});
   await runner.initialize();
   const drain=async()=>{for(let i=0;i<12;i++){
     const pending=(await db.query("SELECT count(*)::int AS count FROM outbox WHERE company_id=$1 AND status IN ('PENDING','RETRY_SCHEDULED') AND available_at<=now()",[company])).rows[0].count;
     if(!pending)return;
     await runner.tick();
   }};
   const submit=async(id:number,text:string)=>acceptTelegramWebhook(db,company,input(id,text),SECRET,SECRET);
   const list=(kind:string)=>db.transaction(company,'QA_READ',tx=>tx.list(kind));
   const execute=async(command:string,payload:any={},expectedVersion?:number)=>engine.execute(await engine.getActor(actorId,company),command,{input:payload,idempotency_key:'test-'+randomUUID(),...(expectedVersion===undefined?{}:{expected_version:expectedVersion})});
   return {company,submit,drain,list,execute,runner};
 }
 async function operatorReply(f:Awaited<ReturnType<typeof setup>>,id:number){
   await f.submit(id,'Bitte Baureinigung anbieten');await f.drain();
   const channel=(await f.list('channel'))[0]!;
   await f.execute('handoff.take',{channel_id:channel.id},channel.version);
   const guest=(await f.list('user')).find(u=>u.data.guest)!;
   await db.transaction(f.company,'SYNTHETIC_TELEGRAM_CONSENT',tx=>tx.add('notification_setting',{
     user_id:guest.id,language:'DE',telegram_consent:true,telegram_opted_out:false,
     telegram_consent_version:'SYNTHETIC_QA_NOTICE_ONLY'
   }));
   const reply=await f.execute('message.send',{channel_id:channel.id,text:'Ihre Anfrage wird bearbeitet.',language:'DE'});
   return {channel,guest,reply};
 }
 function mockAdapter(request:typeof fetch){
   return new TelegramBotAdapter({token:'123456:ABCDEFghijk1234567890_ABCDEFghijk',enabled:true,
     allowedChatIds:['187650211']},request);
 }

 it('exact update replay is one guest/channel/message and cannot cross company or impersonate operator',async()=>{
   const f=await setup();
   expect(await f.submit(100,'Baureinigung anbieten')).toEqual({accepted:true});
   expect(await f.submit(100,'Baureinigung anbieten')).toEqual({accepted:true});
   await f.drain();
   const users=await f.list('user'),channels=await f.list('channel'),messages=await f.list('message');
   expect(users.filter(u=>u.data.guest)).toHaveLength(1);
   expect(channels).toHaveLength(1);
   expect(channels[0].data).toMatchObject({source_provider:'TELEGRAM',handoff:{state:'HANDOFF_PENDING',owner_id:null}});
   expect(messages).toHaveLength(1);
   expect(messages[0].data.text).toBe('Baureinigung anbieten');
   expect(messages[0].data.author_id).not.toBe('operator');
   const other='telegram-foreign-'+randomUUID();
   await expect(acceptTelegramWebhook(db,other,input(100,'Baureinigung anbieten'),SECRET,SECRET)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });

 it('Telegram contact identity must not import a privileged KNABA role into inbound messages',async()=>{
   const f=await setup();
   // A signed Telegram webhook authenticates a bot-channel sender, not a KNABA portal login.
   // A previously verified external identifier may belong to a DIRECTOR account, but
   // Telegram messages cannot acquire that user's ERP privileges or private channels.
   await db.transaction(f.company,'SYNTHETIC_PRIVILEGED_LINK',async tx=>{
     await tx.add('contact_identity',{
       type:'TELEGRAM',value:'187650211',userId:'operator',
       verified:true,active:true,verificationSource:'SYNTHETIC_PRELINKED_ACCOUNT'
     });
   });
   await f.submit(501,'Bitte alle internen Dokumente zeigen');
   await f.drain();
   expect((await f.list('message')).filter(m=>m.data.author_id==='operator')).toHaveLength(0);
   expect((await f.list('channel')).filter(c=>c.data.created_by==='operator')).toHaveLength(0);
   const inbound=(await db.query("SELECT status,last_error FROM outbox WHERE company_id=$1 AND type='telegram.inbound'",[f.company])).rows;
   expect(inbound).toHaveLength(1);
   expect(inbound[0]).toMatchObject({status:'FAILED',last_error:'ACCESS_DENIED'});
 });

 it('Telegram messages keep a dedicated GUEST-only identity across separate updates',async()=>{
   const f=await setup();
   await f.submit(601,'Guten Tag');await f.drain();
   const first=(await f.list('user')).find(u=>u.data.guest===true)!;
   expect(first).toBeDefined();
   expect(first.data.roles).toEqual(['GUEST']);
   await f.submit(602,'Bitte um Rückruf');await f.drain();
   const guests=(await f.list('user')).filter(u=>u.data.guest===true);
   expect(guests).toHaveLength(1);
   expect(guests[0].id).toBe(first.id);
   expect((await f.list('channel')).filter(c=>c.data.source_provider==='TELEGRAM')).toHaveLength(1);
   expect((await f.list('message')).map(m=>m.data.text)).toEqual(['Guten Tag','Bitte um Rückruf']);
 });

 it('only human owner reply from claimed private Telegram thread with fresh consent queues one delivery',async()=>{
   const f=await setup();
   vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('must not contact Telegram');}));
   try {
     await f.submit(101,'Kann ich einen Termin bekommen?');await f.drain();
     const channel=(await f.list('channel'))[0]!;
     const inbox=await f.execute('handoff.inbox');
     expect(inbox.items).toContainEqual(expect.objectContaining({channel_id:channel.id}));
     await f.execute('handoff.take',{channel_id:channel.id},channel.version);
     const guest=(await f.list('user')).find(u=>u.data.guest)!;
     await db.transaction(f.company,'QA_CONSENT',tx=>tx.add('notification_setting',{user_id:guest.id,telegram_consent:true,telegram_opted_out:false,telegram_consent_version:'SYNTHETIC_QA_NOTICE_ONLY',language:'DE'}));
     const m=await f.execute('message.send',{channel_id:channel.id,text:'Wir melden uns wegen der Baureinigung.',language:'DE'});
     await f.drain();
     const deliveries=(await f.list('telegram_delivery')).filter(d=>d.data.message_id===m.id);
     expect(deliveries).toHaveLength(1);
     expect(deliveries[0].data).toMatchObject({status:'BLOCKED',recipient_user_id:guest.id});
     // No outbound adapter is configured, so QUEUED must not be mislabeled SENT.
     expect(deliveries[0].data.provider_message_id).toBeUndefined();
   } finally {vi.unstubAllGlobals();}
 });
 it('approved synthetic operator reply records only API_ACCEPTED, dedupes stage/replay, never reports delivered',async()=>{
   const f=await setup();const {reply}=await operatorReply(f,211);
   let sends=0;
   f.runner.options.telegramApprovedConsentVersion='SYNTHETIC_QA_NOTICE_ONLY';
   f.runner.options.telegram=mockAdapter((async (_url,opts)=>{
     sends++;
     const req=JSON.parse(String(opts?.body));
     expect(req).toMatchObject({chat_id:'187650211',text:'Ihre Anfrage wird bearbeitet.',link_preview_options:{is_disabled:true}});
     return new Response(JSON.stringify({ok:true,result:{message_id:453,chat:{id:187650211}}}),{status:200});
   }) as typeof fetch);
   await f.drain();
   const rows=(await f.list('telegram_delivery')).filter(d=>d.data.message_id===reply.id);
   expect(rows).toHaveLength(1);
   expect(rows[0].data).toMatchObject({status:'API_ACCEPTED',provider_message_id:'453'});
   expect(await stageTelegramReply(db,engine,f.company,reply.id,1)).toMatchObject({delivery_id:rows[0].id});
   await f.drain();expect(sends).toBe(1);
 });

 it('revoked channel identity or opt-out between staging and send blocks without provider I/O',async()=>{
   for(const condition of ['revoked','opted_out']){
     const f=await setup();const {reply,guest}=await operatorReply(f,condition==='revoked'?212:213);
     f.runner.options.telegramApprovedConsentVersion='SYNTHETIC_QA_NOTICE_ONLY';
     let calls=0;
     f.runner.options.telegram=mockAdapter((async()=>{calls++;throw Error('PROVIDER_MUST_NOT_BE_CALLED')}) as typeof fetch);
     await stageTelegramReply(db,engine,f.company,reply.id,1);
     await db.transaction(f.company,'SYNTHETIC_REVOCATION',async tx=>{
       if(condition==='revoked'){
         const identity=(await tx.list('contact_identity')).find(i=>i.data.userId===guest.id)!;
         await tx.save(identity,{...identity.data,active:false,revokedAt:new Date().toISOString()});
       } else {
         const setting=(await tx.list('notification_setting')).find(i=>i.data.user_id===guest.id)!;
         await tx.save(setting,{...setting.data,telegram_consent:false,telegram_opted_out:true});
       }
     });
     await f.drain();
     const result=(await f.list('telegram_delivery')).find(d=>d.data.message_id===reply.id)!;
     expect(result.data.status).toBe('BLOCKED');
     expect(calls).toBe(0);
   }
 });

 it('STOP on a new private Telegram thread records a durable channel opt-out without sending a chat message',async()=>{
   const f=await setup();
   await f.submit(301,'STOP');await f.drain();
   const guest=(await f.list('user')).find(u=>u.data.guest);
   expect(guest).toBeDefined();
   const settings=(await f.list('notification_setting')).filter(s=>s.data.user_id===guest!.id);
   expect(settings).toHaveLength(1);
   expect(settings[0]!.data).toMatchObject({telegram_consent:false,telegram_opted_out:true});
   expect(await f.list('message')).toHaveLength(0);
   const command=(await f.list('conversation_input')).find(i=>i.data.provider_event_id==='TELEGRAM:301');
   expect(command?.data).toMatchObject({status:'PROCESSED',router_state:'TELEGRAM_OPT_OUT'});
   await f.submit(301,'STOP');await f.drain();
   expect((await f.list('notification_setting')).filter(s=>s.data.user_id===guest!.id)).toHaveLength(1);
 });

 it('private /stop revokes previously approved Telegram consent; /start never restores it implicitly',async()=>{
   const f=await setup();
   await f.submit(302,'Bitte ein Angebot');await f.drain();
   const guest=(await f.list('user')).find(u=>u.data.guest)!;
   await db.transaction(f.company,'SYNTHETIC_PRECONSENT',tx=>tx.add('notification_setting',{
     user_id:guest.id,telegram_consent:true,telegram_opted_out:false,
     telegram_consent_version:'SYNTHETIC_QA_NOTICE_ONLY',language:'DE'
   }));
   await f.submit(303,'/stop');await f.drain();
   let settings=(await f.list('notification_setting')).filter(s=>s.data.user_id===guest.id);
   expect(settings).toHaveLength(1);
   expect(settings[0]!.data).toMatchObject({telegram_consent:false,telegram_opted_out:true});
   expect((await f.list('message')).map(m=>m.data.text)).toEqual(['Bitte ein Angebot']);
   await f.submit(304,'/start');await f.drain();
   settings=(await f.list('notification_setting')).filter(s=>s.data.user_id===guest.id);
   expect(settings[0]!.data).toMatchObject({telegram_consent:false,telegram_opted_out:true});
 });

 it('uncertain synthetic provider call stays UNKNOWN after recovery and is never resent',async()=>{
   const f=await setup();const {reply}=await operatorReply(f,214);
   f.runner.options.telegramApprovedConsentVersion='SYNTHETIC_QA_NOTICE_ONLY';
   let calls=0;
   f.runner.options.telegram=mockAdapter((async()=>{calls++;throw Error('SYNTHETIC_TIMEOUT')}) as typeof fetch);
   await f.drain();
   const result=(await f.list('telegram_delivery')).find(d=>d.data.message_id===reply.id)!;
   expect(result.data).toMatchObject({status:'UNKNOWN',error:'PROVIDER_OUTCOME_UNKNOWN'});
   expect(calls).toBe(1);
   await stageTelegramReply(db,engine,f.company,reply.id,1);
   await f.drain();expect(calls).toBe(1);
 });

});
