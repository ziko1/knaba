import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {WorkerRunner} from '../apps/worker/runner.ts';
import {acceptTelegramWebhook} from '../apps/api/telegram-ingress.ts';

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
});
