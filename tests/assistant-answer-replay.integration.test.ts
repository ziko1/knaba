import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database,type PgTransaction} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {WorkerRunner,leaseOutbox,serviceId,type OutboxJob} from '../apps/worker/runner.ts';
import {DeepSeekAdapter} from '../packages/integrations/deepseek.ts';
import type {AiCategory} from '../packages/integrations/assistant-playground.ts';
import {DomainError,type Data,type Entity} from '../packages/domain/core.ts';

// Genuine PostgreSQL, real command receipts, row leases, WorkerRunner and adapter.
// The external provider transport and explicit crash/scheduling seams are doubles.
// All records are synthetic, company-scoped, and never sent to an external service.
// Missing DATABASE_URL means PostgreSQL NOT_RUN, never an accepted SQL case.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
const configId='synthetic-replay-config',channelId='synthetic-replay-channel';
const actorId='synthetic-replay-customer',messageId='synthetic-replay-source';
const providerUrl='https://synthetic-replay-provider.example.test/v1';
type ReserveHost={reserveBudget:(job:OutboxJob,config:Entity,text:string,category?:AiCategory,guard?:(tx:PgTransaction)=>Promise<void>)=>Promise<number>};
type SettleHost={settleBudget:(job:OutboxJob,actual?:number,tokens?:{input_tokens?:number;output_tokens?:number},status?:'SUCCEEDED'|'CANCELLED')=>Promise<void>};

postgres('AI answer real PostgreSQL recovery after persisted replies and known/unknown provider boundaries',()=>{
 let db:Database,engine:Engine,company:string;

 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
  company='synthetic-answer-replay-'+randomUUID();
  await db.transaction(company,'SYNTHETIC_ANSWER_REPLAY_FIXTURE',async tx=>{
   await tx.add('company',{name:'Synthetic answer replay QA',operatingMode:'TEST',synthetic:true},company);
   await tx.add('user',{name:'Synthetic requester',active:true,roles:['CLIENT'],permissions:['chat.read','chat.write'],siteIds:[],synthetic:true},actorId);
   await tx.add('assistant_config',{
    status:'ACTIVE',configVersion:1,provider:'DEEPSEEK',testOnly:true,synthetic:true,
    tools:[],knowledgeIds:[],allowedServiceIds:[],territories:[],
    model:'synthetic-replay-model',timeoutMs:1000,tone:'FORMAL',addressForm:'Sie',humanHours:[],
    maxResponseLength:2000,budgetCents:1000,pricingPolicy:'SERVER_PRICE_ONLY',
    contextPolicy:'ACL_FILTER_BEFORE_RETRIEVAL',handoffPolicy:'SUPPRESS_AI_UNTIL_AUTHORIZED_RETURN',
   },configId);
   const channel=await tx.add('channel',{
    type:'PRIVATE_CUSTOMER_ASSISTANT',created_by:actorId,members:[],
    handoff:{state:'AI_ACTIVE',owner_id:null},synthetic:true,
   },channelId);
   const original=await tx.add('message',{
    channel_id:channelId,author_id:actorId,text:'Eine synthetische Anfrage zur Reinigung.',
    language:'DE',source:'HUMAN',message_version:1,synthetic:true,
   },messageId);
   // Use the persisted source clock so a same-transaction JS timestamp cannot
   // place the original message before the requester's readable history.
   await tx.save(channel,{...channel.data,members:[{
    user_id:actorId,external:true,joined_at:original.createdAt,history_from:original.createdAt,
   }]});
   await tx.event('assistant.answer_requested',{
    channelId,messageId,actorId,configId,configVersion:1,language:'DE',sourceChannel:'WEB',
   });
  });
 });
 afterEach(()=>vi.restoreAllMocks());
 afterAll(async()=>{await db?.close();});

 const rows=(kind:string)=>db.transaction(company,'SYNTHETIC_ANSWER_REPLAY_ASSERT',tx=>tx.list(kind));
 const row=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_ANSWER_REPLAY_ASSERT',tx=>tx.get(kind,id));
 const change=(kind:string,id:string,patch:Data)=>db.transaction(company,'SYNTHETIC_ANSWER_REPLAY_CHANGE',async tx=>{
  const current=await tx.get(kind,id);return tx.save(current,{...current.data,...patch});
 });
 async function fixture(providerBoundary?:()=>Promise<void>){
  const request=vi.fn(async(url:Parameters<typeof fetch>[0],init?:RequestInit)=>{
   expect(String(url)).toBe(providerUrl+'/chat/completions');
   const body=JSON.parse(String(init?.body));
   expect(body.model).toBe('synthetic-replay-model');
   expect(JSON.parse(body.messages[1].content).text).toBe('Eine synthetische Anfrage zur Reinigung.');
   await providerBoundary?.();
   return new Response(JSON.stringify({
    choices:[{finish_reason:'stop',message:{content:JSON.stringify({
     answer:'KI-Assistent: Bitte beschreiben Sie die gewünschte Leistung.',
     source_ids:[],handoff_required:false,reason:null,tool_calls:[],
    })}}],usage:{prompt_tokens:100,completion_tokens:50},
   }),{status:200,headers:{'Content-Type':'application/json'}});
  });
  const ai=new DeepSeekAdapter({
   baseUrl:providerUrl,apiKey:'SYNTHETIC_EXTERNAL_TRANSPORT_DOUBLE',model:'synthetic-replay-model',
   timeoutMs:1000,inputPricePerMillionCents:1,outputPricePerMillionCents:1,maxOutputTokens:1000,syntheticOnly:true,
  },request as typeof fetch);
  const worker=new WorkerRunner(db,engine,{companyId:company,appMode:'TEST',ai,leaseMs:120000});
  await worker.initialize();
  const jobs=await leaseOutbox(db,10,120000,company);
  expect(jobs).toHaveLength(1);const job=jobs[0]!;
  expect(job).toMatchObject({type:'assistant.answer_requested',company_id:company,attempts:1,lease_token:expect.any(String)});
  return {worker,job,request};
 }
 async function reclaim(job:OutboxJob){
  await db.query("UPDATE outbox SET leased_until=clock_timestamp()-interval '1 second' WHERE company_id=$1 AND id=$2",[company,job.id]);
  const jobs=await leaseOutbox(db,100,120000,company),successor=jobs.find(item=>item.id===job.id);
  expect(successor).toBeDefined();expect(successor!.attempts).toBe(job.attempts+1);
  expect(successor!.lease_token).not.toBe(job.lease_token);
  return successor!;
 }
 async function fingerprint(){
  const result:Record<string,unknown>={};
  for(const table of ['aggregates','aggregate_revisions','audit_log','command_receipts','outbox']){
   result[table]=(await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY to_jsonb(r)::text),'')) AS hash FROM ${table} r WHERE company_id=$1`,[company])).rows[0];
  }
  return result;
 }
 async function answerEffects(){
  return (await db.query(`SELECT
   (SELECT count(*)::int FROM aggregates WHERE company_id=$1 AND kind='message' AND data->>'source'='AI') AS replies,
   (SELECT count(*)::int FROM command_receipts WHERE company_id=$1 AND command='message.send') AS receipts,
   (SELECT count(*)::int FROM audit_log WHERE company_id=$1 AND action='COMMAND:message.send') AS command_audits,
   (SELECT count(*)::int FROM outbox WHERE company_id=$1 AND type='message.created') AS message_events,
   (SELECT count(*)::int FROM aggregates WHERE company_id=$1 AND kind='decision') AS decisions`,[company])).rows[0];
 }
 async function assertSingleReply(){
  expect(await answerEffects()).toEqual({replies:1,receipts:1,command_audits:1,message_events:1,decisions:0});
  expect((await row('channel',channelId)).data.handoff).toEqual({state:'AI_ACTIVE',owner_id:null});
  for(const kind of ['lead','quote','order','dispatch_request'])expect(await rows(kind),kind).toHaveLength(0);
 }
 async function cancelBeforeProvider(f:Awaited<ReturnType<typeof fixture>>){
  const host=f.worker as unknown as ReserveHost,original=host.reserveBudget.bind(f.worker);
  const boundary=vi.spyOn(host,'reserveBudget').mockImplementation(async(...args)=>{
   const result=await original(...args);
   expect((await rows('ai_usage')).filter(item=>item.data.event_id===f.job.id)).toHaveLength(1);
   await db.query("UPDATE outbox SET leased_until=clock_timestamp()-interval '1 second' WHERE company_id=$1 AND id=$2",[company,f.job.id]);
   return result;
  });
  try{await expect(f.worker.handle(f.job)).rejects.toMatchObject({code:'WORKER_LEASE_LOST'});}
  finally{boundary.mockRestore();}
  expect(f.request).not.toHaveBeenCalled();
  const usage=await rows('ai_usage');expect(usage).toHaveLength(1);
  expect(usage[0]!.data).toMatchObject({event_id:f.job.id,status:'CANCELLED',actual_cents:0,reserved_cents:0,provider_invoked:false});
  expect(await answerEffects()).toEqual({replies:0,receipts:0,command_audits:0,message_events:0,decisions:0});
  return usage[0]!;
 }

 it('reclaims a successfully replied and settled job without another provider call, reply, cost write or false human handoff',async()=>{
  const f=await fixture();await f.worker.handle(f.job);
  expect(f.request).toHaveBeenCalledTimes(1);await assertSingleReply();
  const usage=await rows('ai_usage');expect(usage).toHaveLength(1);
  expect(usage[0]!.data).toMatchObject({event_id:f.job.id,status:'SUCCEEDED',actual_cents:1,reserved_cents:1});
  const successor=await reclaim(f.job),before=await fingerprint();
  await f.worker.handle(successor);
  expect(f.request).toHaveBeenCalledTimes(1);await assertSingleReply();
  expect(await rows('ai_usage')).toEqual(usage);expect(await fingerprint()).toEqual(before);
 });

 it('uses the persisted reply receipt after a settlement crash and retains its unresolved full reservation without resending or handoff',async()=>{
  const f=await fixture();
  // This seam fails only the separate cost settlement, after the actual reply
  // transaction and its command receipt have committed in PostgreSQL.
  const settlement=vi.spyOn(f.worker as unknown as SettleHost,'settleBudget').mockRejectedValueOnce(new Error('SYNTHETIC_CRASH_BEFORE_COST_SETTLEMENT'));
  try{await expect(f.worker.handle(f.job)).rejects.toThrow('SYNTHETIC_CRASH_BEFORE_COST_SETTLEMENT');}
  finally{settlement.mockRestore();}
  expect(f.request).toHaveBeenCalledTimes(1);await assertSingleReply();
  const usage=await rows('ai_usage');expect(usage).toHaveLength(1);
  expect(usage[0]!.data.status).toBe('RUNNING');
  expect(usage[0]!.data.reserved_cents).toBe(usage[0]!.data.initial_reserved_cents);
  expect(usage[0]!.data.reserved_cents).toBeGreaterThan(1);
  expect(usage[0]!.data.actual_cents??null).toBeNull();
  const successor=await reclaim(f.job),before=await fingerprint();
  await f.worker.handle(successor);
  expect(f.request).toHaveBeenCalledTimes(1);await assertSingleReply();
  expect(await rows('ai_usage')).toEqual(usage);expect(await fingerprint()).toEqual(before);
 });

 it('retries a confirmed never-invoked zero-cost cancellation once under a fresh real lease and preserves one billed outcome',async()=>{
  const f=await fixture(),cancelled=await cancelBeforeProvider(f),successor=await reclaim(f.job);
  await f.worker.handle(successor);
  expect(f.request).toHaveBeenCalledTimes(1);await assertSingleReply();
  const usages=(await rows('ai_usage')).filter(item=>item.data.event_id===f.job.id);
  expect(usages.filter(item=>item.data.status==='SUCCEEDED')).toHaveLength(1);
  expect(usages.reduce((sum,item)=>sum+(item.data.actual_cents??0),0)).toBe(1);
  for(const usage of usages)if(usage.data.status!=='SUCCEEDED')expect(usage.data).toMatchObject({status:'CANCELLED',actual_cents:0,reserved_cents:0,provider_invoked:false});
  expect((await db.query("SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind='ai_usage' AND id=$2 AND version=$3",[company,cancelled.id,cancelled.version])).rows).toEqual([{data:cancelled.data}]);
  const before=await fingerprint();await f.worker.handle(successor);
  expect(f.request).toHaveBeenCalledTimes(1);expect(await fingerprint()).toEqual(before);
 });

 it('ignores a delayed old-lease cancellation after a safe successor has durably marked its own provider request started',async()=>{
  let f!:Awaited<ReturnType<typeof fixture>>,successor!:OutboxJob;
  let checkedStartedReservation=false;
  f=await fixture(async()=>{
   const usage=await rows('ai_usage');expect(usage).toHaveLength(1);
   expect(usage[0]!.data).toMatchObject({event_id:successor.id,status:'RUNNING',provider_invoked:true});
   expect(usage[0]!.data.reserved_cents).toBe(usage[0]!.data.initial_reserved_cents);
   expect(usage[0]!.data.reserved_cents).toBeGreaterThan(1);
   const before=await fingerprint();
   // The prior worker may observe a delayed cancellation/commit callback. Its
   // old lease cannot release the new attempt's already started reservation.
   await (f.worker as unknown as SettleHost).settleBudget(f.job,0,{input_tokens:0,output_tokens:0},'CANCELLED');
   expect(await rows('ai_usage')).toEqual(usage);expect(await fingerprint()).toEqual(before);
   checkedStartedReservation=true;
  });
  const cancelled=await cancelBeforeProvider(f);successor=await reclaim(f.job);
  await f.worker.handle(successor);
  expect(checkedStartedReservation).toBe(true);expect(f.request).toHaveBeenCalledTimes(1);await assertSingleReply();
  const usage=await rows('ai_usage');expect(usage).toHaveLength(1);
  expect(usage[0]!.data).toMatchObject({event_id:successor.id,status:'SUCCEEDED',provider_invoked:true,actual_cents:1,reserved_cents:1});
  expect(usage[0]!.data.reservation_lease_hash).not.toBe(cancelled.data.reservation_lease_hash);
  expect((await db.query("SELECT data FROM aggregate_revisions WHERE company_id=$1 AND kind='ai_usage' AND id=$2 AND version=$3",[company,cancelled.id,cancelled.version])).rows).toEqual([{data:cancelled.data}]);
 });

 it('refuses zero-cost cancellation even from the current lease after its actual provider-start marker commits',async()=>{
  let f!:Awaited<ReturnType<typeof fixture>>,checkedStartedReservation=false;
  f=await fixture(async()=>{
   const usage=await rows('ai_usage');expect(usage).toHaveLength(1);
   expect(usage[0]!.data).toMatchObject({event_id:f.job.id,status:'RUNNING',provider_invoked:true});
   expect(usage[0]!.data.reserved_cents).toBe(usage[0]!.data.initial_reserved_cents);
   expect(usage[0]!.data.reserved_cents).toBeGreaterThan(1);
   expect(usage[0]!.data.actual_cents??null).toBeNull();
   const before=await fingerprint();
   await (f.worker as unknown as SettleHost).settleBudget(f.job,0,{input_tokens:0,output_tokens:0},'CANCELLED');
   expect(await rows('ai_usage')).toEqual(usage);expect(await fingerprint()).toEqual(before);
   checkedStartedReservation=true;
  });
  await f.worker.handle(f.job);
  expect(checkedStartedReservation).toBe(true);expect(f.request).toHaveBeenCalledTimes(1);await assertSingleReply();
  const usage=await rows('ai_usage');expect(usage).toHaveLength(1);
  expect(usage[0]!.data).toMatchObject({event_id:f.job.id,status:'SUCCEEDED',provider_invoked:true,actual_cents:1,reserved_cents:1,input_tokens:100,output_tokens:50});
 });

 it('retains the full reservation and requests human review when a genuine first provider request is still unknown during lease recovery',async()=>{
  let entered!:()=>void,release!:()=>void;
  const providerEntered=new Promise<void>(resolve=>{entered=resolve;});
  const providerMayFail=new Promise<void>(resolve=>{release=resolve;});
  const f=await fixture(async()=>{entered();await providerMayFail;throw new Error('SYNTHETIC_PROVIDER_RESULT_LOST');});
  const original=f.worker.handle(f.job).then(()=>({error:undefined as unknown}),error=>({error}));
  try{
   await Promise.race([providerEntered,original.then(()=>{throw new Error('Worker finished before its genuine provider boundary');})]);
   expect(f.request).toHaveBeenCalledTimes(1);
   const usage=await rows('ai_usage');expect(usage).toHaveLength(1);expect(usage[0]!.data.status).toBe('RUNNING');
   expect(usage[0]!.data.reserved_cents).toBe(usage[0]!.data.initial_reserved_cents);
   const successor=await reclaim(f.job);await f.worker.handle(successor);
   expect(f.request).toHaveBeenCalledTimes(1);expect(await rows('ai_usage')).toEqual(usage);
   expect(await answerEffects()).toEqual({replies:0,receipts:0,command_audits:0,message_events:0,decisions:1});
   expect((await row('channel',channelId)).data.handoff).toMatchObject({state:'HANDOFF_PENDING',reason:'PROVIDER_OUTCOME_UNKNOWN'});
   const decisions=await rows('decision');expect(decisions[0]!.data.reason).toBe('PROVIDER_OUTCOME_UNKNOWN');
   const beforeLateResult=await fingerprint();release();
   expect((await original).error).toMatchObject({code:'WORKER_LEASE_LOST'});
   expect(f.request).toHaveBeenCalledTimes(1);expect(await fingerprint()).toEqual(beforeLateResult);
  }finally{release();await original;}
 });

 it.each(['SUBSTITUTED_SOURCE','WRONG_JOB_TYPE','EXPIRED_LEASE','REPLACED_LEASE'] as const)(
  'checks %s before trusting a previous successful reply or cost record',async condition=>{
   const f=await fixture();await f.worker.handle(f.job);await assertSingleReply();
   let supplied=await reclaim(f.job);
   if(condition==='SUBSTITUTED_SOURCE'){
    const other=await db.transaction(company,'SYNTHETIC_REPLAY_OTHER_SOURCE',tx=>tx.add('message',{
     channel_id:channelId,author_id:actorId,text:'A different synthetic current message.',language:'DE',source:'HUMAN',message_version:1,synthetic:true,
    }));
    supplied={...supplied,data:{...supplied.data,messageId:other.id}};
   }
   if(condition==='WRONG_JOB_TYPE')await db.query("UPDATE outbox SET type='translation.requested' WHERE company_id=$1 AND id=$2",[company,supplied.id]);
   if(condition==='EXPIRED_LEASE')await db.query("UPDATE outbox SET leased_until=clock_timestamp()-interval '1 second' WHERE company_id=$1 AND id=$2",[company,supplied.id]);
   if(condition==='REPLACED_LEASE')await db.query('UPDATE outbox SET lease_token=$1 WHERE company_id=$2 AND id=$3',[randomUUID(),company,supplied.id]);
   const before=await fingerprint();
   await expect(f.worker.handle(supplied)).rejects.toMatchObject({code:condition.endsWith('LEASE')?'WORKER_LEASE_LOST':'ACCESS_DENIED'});
   expect(f.request).toHaveBeenCalledTimes(1);await assertSingleReply();expect(await fingerprint()).toEqual(before);
  }
 );

 it.each(['ACTOR_DISABLED','CONFIG_RETIRED','SERVICE_MEMBERSHIP_REVOKED'] as const)(
  'does not restart a known no-send cancellation after current %s authority is revoked',async condition=>{
   const f=await fixture();await cancelBeforeProvider(f);const successor=await reclaim(f.job);
   if(condition==='ACTOR_DISABLED')await change('user',actorId,{active:false});
   if(condition==='CONFIG_RETIRED')await change('assistant_config',configId,{status:'RETIRED'});
   if(condition==='SERVICE_MEMBERSHIP_REVOKED'){
    const channel=await row('channel',channelId);
    await change('channel',channelId,{members:[...channel.data.members,{
     user_id:serviceId,external:false,joined_at:channel.createdAt,history_from:channel.createdAt,revoked_at:new Date().toISOString(),
    }]});
   }
   const before=await fingerprint();
   let failure:unknown;try{await f.worker.handle(successor);}catch(error){failure=error;}
   if(failure!==undefined){expect(failure).toBeInstanceOf(DomainError);expect(['ACCESS_DENIED','AI_SUPPRESSED']).toContain((failure as DomainError).code);}
   expect(f.request).not.toHaveBeenCalled();
   expect(await answerEffects()).toEqual({replies:0,receipts:0,command_audits:0,message_events:0,decisions:0});
   expect(await fingerprint()).toEqual(before);
  }
 );
});
