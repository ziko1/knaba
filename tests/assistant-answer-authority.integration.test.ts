import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine,type CommandPrecondition} from '../apps/api/engine.ts';
import {leaseOutbox,serviceId,type OutboxJob} from '../apps/worker/runner.ts';
import {DomainError,type Actor,type Data,type Entity} from '../packages/domain/core.ts';

// Genuine PostgreSQL/Engine authorization and atomic effects. Only synthetic
// company data is created; there is no provider, HTTP double or live send.
// Without DATABASE_URL every case is SQL_NOT_RUN, never a local SQL pass.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
const sourceId='synthetic-answer-source';
const otherSourceId='synthetic-other-source';
const otherServiceId='synthetic-other-service';
const serviceRights=['integration.process','chat.read','chat.write','scope.company'];
type Envelope=Parameters<Engine['execute']>[2];
type Source={channel:Entity;config:Entity;message:Entity;lead:Entity};

postgres('AI answer exact leased PostgreSQL authority without broad config access',()=>{
 let db:Database,engine:Engine,company:string,service:Actor,job:OutboxJob;
 let source:Source,other:Source,sameChannelMessage:Entity;

 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
  company='synthetic-answer-authority-'+randomUUID();
  const seeded=await db.transaction(company,'SYNTHETIC_ANSWER_AUTHORITY_FIXTURE',async tx=>{
   await tx.add('company',{name:'Synthetic AI answer authorization QA',operatingMode:'TEST',synthetic:true},company);
   for(const id of [sourceId,otherSourceId])await tx.add('user',{active:true,roles:['CLIENT'],permissions:['chat.read','chat.write'],siteIds:[],synthetic:true},id);
   for(const id of [serviceId,otherServiceId])await tx.add('user',{active:true,roles:['SERVICE_ACCOUNT'],permissions:serviceRights,siteIds:[],credentialDisabled:true,synthetic:true},id);
   const createSource=async(suffix:string):Promise<Source>=>{
    const config=await tx.add('assistant_config',{status:'ACTIVE',provider:'DEEPSEEK',configVersion:1,testOnly:true,synthetic:true},'config-'+suffix);
    const lead=await tx.add('lead',{ownerUserId:sourceId,ownership:'AI_ACTIVE',status:'NEW',synthetic:true},'lead-'+suffix);
    let channel:Entity=await tx.add('channel',{type:'PRIVATE_CUSTOMER_ASSISTANT',created_by:sourceId,lead_id:lead.id,members:[],handoff:{state:'AI_ACTIVE',owner_id:null},synthetic:true},'channel-'+suffix);
    // The persisted database timestamp avoids a JS/transaction-clock gap that
    // could accidentally hide the source message behind history_from.
    channel=await tx.save(channel,{...channel.data,members:[sourceId,otherSourceId,serviceId,otherServiceId].map(user_id=>({user_id,external:[sourceId,otherSourceId].includes(user_id),joined_at:channel.createdAt,history_from:channel.createdAt}))});
    const message=await tx.add('message',{channel_id:channel.id,author_id:sourceId,text:'Synthetic original for '+suffix,language:'DE',source:'HUMAN',message_version:1,synthetic:true},'message-'+suffix);
    return {channel,config,message,lead};
   };
   const primary=await createSource('primary'),secondary=await createSource('secondary');
   const sibling=await tx.add('message',{channel_id:primary.channel.id,author_id:sourceId,text:'A different synthetic source in the same channel',language:'DE',source:'HUMAN',message_version:1,synthetic:true},'message-sibling');
   await tx.event('assistant.answer_requested',{channelId:primary.channel.id,messageId:primary.message.id,actorId:sourceId,configId:primary.config.id,configVersion:1,language:'DE',sourceChannel:'WEB'});
   return {primary,secondary,sibling};
  });
  source=seeded.primary;other=seeded.secondary;sameChannelMessage=seeded.sibling;
  service=await engine.getActor(serviceId,company);
  const leased=await leaseOutbox(db,10,120000,company);
  expect(leased).toHaveLength(1);job=leased[0]!;
  expect(job).toMatchObject({type:'assistant.answer_requested',company_id:company,lease_token:expect.any(String)});
 });
 afterAll(async()=>{await db?.close();});

 const guards=(bound=source):CommandPrecondition[]=>[bound.channel,bound.config,bound.message].map(row=>({kind:row.kind,id:row.id,version:row.version}));
 const envelope=(patch:Partial<Envelope>={}):Envelope=>({
  input:{channel_id:source.channel.id,text:'Synthetic server-checked assistant answer',language:'DE',source:'AI',reply_to_id:source.message.id},
  idempotency_key:randomUUID(),preconditions:guards(),worker_lease:{id:job.id,token:job.lease_token!},...patch
 });
 const send=(body:Envelope=envelope(),actor=service)=>engine.execute(actor,'message.send',body);
 const row=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_ANSWER_ASSERT',tx=>tx.get(kind,id));
 const change=(kind:string,id:string,patch:Data)=>db.transaction(company,'SYNTHETIC_ANSWER_CHANGE',async tx=>{const current=await tx.get(kind,id);return tx.save(current,{...current.data,...patch});});
 const changeJob=async(patch:Data)=>{await db.query('UPDATE outbox SET data=$1 WHERE company_id=$2 AND id=$3',[JSON.stringify({...job.data,...patch}),company,job.id]);};
 async function fingerprint(){
  const result:Record<string,unknown>={};
  for(const table of ['aggregates','aggregate_revisions','audit_log','command_receipts','outbox']){
   result[table]=(await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY to_jsonb(r)::text),'')) AS hash FROM ${table} r WHERE company_id=$1`,[company])).rows[0];
  }
  return result;
 }
 async function effects(){
  return (await db.query(`SELECT
   (SELECT count(*)::int FROM aggregates WHERE company_id=$1 AND kind='message' AND data->>'source'='AI') AS messages,
   (SELECT count(*)::int FROM command_receipts WHERE company_id=$1 AND command='message.send') AS receipts,
   (SELECT count(*)::int FROM audit_log WHERE company_id=$1 AND action='COMMAND:message.send') AS command_audits,
   (SELECT count(*)::int FROM outbox WHERE company_id=$1 AND type='message.created') AS events`,[company])).rows[0];
 }
 async function deniedAtomically(attempt:()=>Promise<unknown>,expectedCode:string){
  const before=await fingerprint(),beforeEffects=await effects();let failure:unknown;
  try{await attempt();}catch(error){failure=error;}
  expect(await fingerprint()).toEqual(before);
  expect(await effects()).toEqual(beforeEffects);
  expect(failure).toBeInstanceOf(DomainError);
  expect((failure as DomainError).code).toBe(expectedCode);
 }

 it('sends one valid bound answer with exact current guards and replays one receipt without additional effects',async()=>{
  const prepared=envelope();expect(prepared.preconditions).toEqual(guards());
  for(const guard of prepared.preconditions!){const current=await row(guard.kind,guard.id);expect(current.version).toBe(guard.version);expect(current.companyId).toBe(company);}
  expect(await effects()).toEqual({messages:0,receipts:0,command_audits:0,events:0});
  const answer=await send(prepared);
  expect(answer).toMatchObject({kind:'message',companyId:company,version:1,data:{source:'AI',author_id:serviceId,channel_id:source.channel.id,reply_to_id:source.message.id}});
  const current=await row('message',answer.id);expect(current).toEqual(answer);
  expect(await effects()).toEqual({messages:1,receipts:1,command_audits:1,events:1});
  expect((await db.query("SELECT actor_id,data FROM aggregate_revisions WHERE company_id=$1 AND kind='message' AND id=$2",[company,answer.id])).rows).toEqual([{actor_id:serviceId,data:answer.data}]);
  const before=await fingerprint();expect(await send(prepared)).toEqual(answer);expect(await fingerprint()).toEqual(before);
 });

 it('keeps assistant configurations invisible through ordinary service reads before and after the narrow bound send',async()=>{
  expect(service.permissions).not.toContain('assistant.read');expect(service.permissions).not.toContain('assistant.manage');
  expect(await engine.readEntities(service,'assistant_config')).toEqual([]);
  expect(await db.transaction(company,'SYNTHETIC_CONFIG_READ_ASSERT',tx=>engine.visible(tx,service,source.config))).toBe(false);
  await send();
  expect(await engine.readEntities(await engine.getActor(serviceId,company),'assistant_config')).toEqual([]);
  expect(await db.transaction(company,'SYNTHETIC_CONFIG_READ_ASSERT',tx=>engine.visible(tx,service,other.config))).toBe(false);
 });

 it.each(['missing','wrong-job-type','expired','replaced'] as const)('rejects %s lease authority before any message, revision, audit, receipt or event',async condition=>{
  const prepared=envelope();
  if(condition==='missing')delete prepared.worker_lease;
  if(condition==='wrong-job-type')await db.query("UPDATE outbox SET type='translation.requested' WHERE company_id=$1 AND id=$2",[company,job.id]);
  if(condition==='expired')await db.query("UPDATE outbox SET leased_until=clock_timestamp()-interval '1 second' WHERE company_id=$1 AND id=$2",[company,job.id]);
  if(condition==='replaced')await db.query('UPDATE outbox SET lease_token=$1 WHERE company_id=$2 AND id=$3',[randomUUID(),company,job.id]);
  await deniedAtomically(()=>send(prepared),condition==='wrong-job-type'?'ACCESS_DENIED':'WORKER_LEASE_LOST');
 });

 it('does not let an arbitrary SERVICE_ACCOUNT use the canonical worker lease even with the same declared chat/integration rights',async()=>{
  const otherService=await engine.getActor(otherServiceId,company);
  expect(otherService.roles).toContain('SERVICE_ACCOUNT');expect(otherService.permissions).toContain('integration.process');
  await deniedAtomically(()=>send(envelope(),otherService),'ACCESS_DENIED');
 });

 it.each(['channel','assistant_config','message'])('rejects a missing %s guard instead of trusting an otherwise valid lease',async kind=>{
  const prepared=envelope();prepared.preconditions=prepared.preconditions!.filter(guard=>guard.kind!==kind);
  await deniedAtomically(()=>send(prepared),'ACCESS_DENIED');
 });

 it.each(['channel','config','message','source-actor'] as const)('rejects substituted %s while every alternative remains a valid same-company record',async condition=>{
  let prepared=envelope();
  if(condition==='channel')prepared=envelope({input:{...prepared.input,channel_id:other.channel.id,reply_to_id:other.message.id},preconditions:guards({...other,config:source.config})});
  if(condition==='config')prepared=envelope({preconditions:guards({...source,config:other.config})});
  if(condition==='message')prepared=envelope({input:{...prepared.input,reply_to_id:sameChannelMessage.id},preconditions:guards({...source,message:sameChannelMessage})});
  if(condition==='source-actor'){
   const otherActor=await engine.getActor(otherSourceId,company);
   expect(await db.transaction(company,'SYNTHETIC_SUBSTITUTED_ACTOR_ASSERT',tx=>engine.visible(tx,otherActor,source.message))).toBe(true);
   await changeJob({actorId:otherSourceId});
  }
  await deniedAtomically(()=>send(prepared),'ACCESS_DENIED');
 });

 it.each(['channel','config','message'] as const)('rejects a stale %s entity version even when AI mode, source identity and configVersion still match',async kind=>{
  const prepared=envelope(),bound=source[kind];
  const current=await change(bound.kind,bound.id,{syntheticReviewedRevision:'Changed after answer preparation'});
  expect(current.version).toBe(bound.version+1);
  await deniedAtomically(()=>send(prepared),'VERSION_CONFLICT');
 });

 const revokeSource=async(condition:'retired-config'|'changed-config-version'|'disabled-actor'|'actor-read-revoked'|'deleted-message'|'queued-channel'|'lead-handoff')=>{
  if(condition==='retired-config')await change('assistant_config',source.config.id,{status:'RETIRED'});
  if(condition==='changed-config-version')await change('assistant_config',source.config.id,{configVersion:2});
  if(condition==='disabled-actor')await change('user',sourceId,{active:false});
  if(condition==='actor-read-revoked')await change('user',sourceId,{roles:[],permissions:['chat.write']});
  if(condition==='deleted-message')await change('message',source.message.id,{deleted_at:new Date().toISOString()});
  if(condition==='queued-channel')await change('channel',source.channel.id,{handoff:{state:'HANDOFF_PENDING',owner_id:null}});
  if(condition==='lead-handoff')await change('lead',source.lead.id,{ownership:'HANDOFF_PENDING'});
 };
 it.each(['retired-config','changed-config-version','disabled-actor','actor-read-revoked','deleted-message','queued-channel','lead-handoff'] as const)('rechecks current %s authority after preparation and leaves all business effects unchanged',async condition=>{
  const prepared=envelope();await revokeSource(condition);
  await deniedAtomically(()=>send(prepared),['retired-config','changed-config-version','queued-channel','lead-handoff'].includes(condition)?'AI_SUPPRESSED':'ACCESS_DENIED');
 });

 it.each(['retired-config','disabled-actor','deleted-message','queued-channel','expired-lease'] as const)('rechecks %s before returning a cached successful AI message receipt',async condition=>{
  const prepared=envelope(),answer=await send(prepared);
  expect(await effects()).toEqual({messages:1,receipts:1,command_audits:1,events:1});
  if(condition==='expired-lease')await db.query("UPDATE outbox SET leased_until=clock_timestamp()-interval '1 second' WHERE company_id=$1 AND id=$2",[company,job.id]);
  else await revokeSource(condition);
  await deniedAtomically(()=>send(prepared),condition==='expired-lease'?'WORKER_LEASE_LOST':['retired-config','queued-channel'].includes(condition)?'AI_SUPPRESSED':'ACCESS_DENIED');
  expect(await row('message',answer.id)).toEqual(answer);
 });
});
