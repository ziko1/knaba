import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Request} from 'express';
import type {PoolClient} from 'pg';
import {Database,PgTransaction} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {ApiController} from '../apps/api/http.ts';
import {AuthService,SESSION_COOKIE,type SqlTransaction} from '../apps/api/auth.ts';
import {internalAssistantHost} from '../apps/api/internal-assistant.ts';
import {prepareInternalAssistant,persistInternalAssistantDraft} from '../packages/integrations/internal-assistant.ts';
import {parseInternalDraftProposal} from '../packages/integrations/internal-assistant-provider.ts';
import {assert,type Actor,type Data} from '../packages/domain/core.ts';

// Genuine PostgreSQL + Engine + ApiController + current cookie authentication.
// Only the Express transport and already-returned AI proposal are synthetic;
// these cases neither invoke nor establish quality of an external AI provider.
// Discovery without DATABASE_URL remains SQL_NOT_RUN, never a database pass.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
const ORIGIN='https://internal-cache.qa.example.test';
function request(token:string):Request{
 const values:Record<string,string>={origin:ORIGIN,host:new URL(ORIGIN).host,cookie:`${SESSION_COOKIE}=${token}`};
 return {method:'GET',protocol:'https',ip:'192.0.2.45',headers:values,get:(name:string)=>values[name.toLowerCase()]} as unknown as Request;
}

postgres('PostgreSQL current internal-cache source authorization through authenticated entity reads',()=>{
 let db:Database,engine:Engine,api:ApiController,auth:AuthService,company:string,actor:Actor,token:string,draftId:string;
 let provider:ReturnType<typeof vi.fn>;
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  vi.stubEnv('DEEPSEEK_API_KEY','');vi.stubEnv('WHATSAPP_ACCESS_TOKEN','');
  provider=vi.fn(async()=>{throw new Error('INTERNAL_CACHE_READ_MUST_NOT_CONTACT_PROVIDER');});vi.stubGlobal('fetch',provider);
  company='internal-cache-qa-'+randomUUID();engine=new Engine(db,'TEST');
  await db.transaction(company,'SYNTHETIC_INTERNAL_CACHE_FIXTURE',async tx=>{
   await tx.add('company',{name:'Synthetic isolated internal-cache QA',synthetic:true,operatingMode:'TEST'},company);
   for(const id of ['foreman','other'])await tx.add('user',{name:'Synthetic '+id,active:true,roles:['INTERNAL_BAULEITER'],siteIds:['site','second-site']},id);
   for(const [id,name,code]of [['site','Haus A','A'],['second-site','Haus B','B']])await tx.add('site',{active:true,name,code},id);
   await tx.add('location',{siteId:'site',active:true,name:'EG',floorLabelDe:'EG',code:'EG',parentId:null,nodeType:'FLOOR'},'floor');
   await tx.add('channel',{type:'COMPANY_GENERAL',members:[{user_id:'foreman',history_from:'2020-01-01T00:00:00Z'}]},'channel');
   await tx.add('message',{channel_id:'channel',author_id:'foreman',message_version:1,source:'HUMAN',text:'Haus A EG reinigen',language:'DE'},'message');
   await tx.add('assistant_config',{status:'ACTIVE',configVersion:1,model:'synthetic-internal-model',timeoutMs:1000,tone:'PROFESSIONAL',addressForm:'Sie',humanHours:[],testOnly:true,provider:'DEEPSEEK'},'config');
  });
  actor=await engine.getActor('foreman',company);
  const options={companyId:company,appMode:'TEST',publicOrigin:ORIGIN,encryptionKey:'SYNTHETIC_AUTH_KEY_NOT_A_PRODUCTION_SECRET'};
  api=new ApiController({db,engine,...options,buildSha:'0'.repeat(40)});auth=new AuthService(db,engine,options);token=(await auth.createSession('foreman')).token;
  const queued=await engine.execute(actor,'internal_assistant.request',{input:{messageId:'message',messageVersion:1,channelId:'channel',configId:'config',configVersion:1,kind:'TASK_BATCH',siteIds:['site','second-site'],context:{locationIds:['floor']}},idempotency_key:randomUUID()});
  const leaseToken=randomUUID(),claimed=await db.query("UPDATE outbox SET status='RUNNING',attempts=1,lease_token=$3,leased_until=clock_timestamp()+interval '5 minutes' WHERE company_id=$1 AND type='internal_assistant.requested' AND data->>'requestId'=$2 RETURNING id",[company,queued.id,leaseToken]);
  expect(claimed.rows).toHaveLength(1);const jobId=claimed.rows[0]!.id;
  const host=internalAssistantHost(db,engine,'TEST',undefined,async(tx:SqlTransaction)=>{
   assert(tx.query,'MISSING_CONFIGURATION');const live=await tx.query("SELECT id FROM outbox WHERE company_id=$1 AND id=$2 AND status='RUNNING' AND lease_token=$3 AND leased_until>clock_timestamp() FOR UPDATE",[company,jobId,leaseToken]);assert(live.rows.length===1,'WORKER_LEASE_LOST');
  });
  const prepared=await prepareInternalAssistant(company,queued.id,host);assert(!prepared.done,'INVALID_STATE');
  const proposal=parseInternalDraftProposal({kind:'TASK_BATCH',needsClarification:false,clarification:null,input:{tasks:[{siteId:'site',locationId:'floor',title:'EG reinigen',sourceQuote:'Haus A EG reinigen'}]}},prepared.providerInput);
  const draft=await persistInternalAssistantDraft(company,queued.id,prepared.contextHash,{proposal,provider:'synthetic-returned-proposal-no-provider-call',model:'synthetic-internal-model'},host);draftId=draft.draftId;
 });
 afterEach(()=>{expect(provider).not.toHaveBeenCalled();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
 afterAll(async()=>{await db?.close();});
 const update=(kind:string,id:string,patch:Data)=>db.transaction(company,'SYNTHETIC_INTERNAL_CACHE_REVOKE',async tx=>{const old=await tx.get(kind,id);return tx.save(old,{...old.data,...patch});});
 async function fingerprint(){
  const result:Record<string,{count:number;sha:string}>={};
  // Static tables: include complete row fingerprints so UPDATE effects, not just
  // added rows, would fail the read-only guarantee. Values never disclose secrets.
  for(const table of ['aggregates','aggregate_revisions','audit_log','command_receipts','outbox','private_blobs','media_blobs','auth_sessions']){
   const r=await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY to_jsonb(r)::text),'')) AS sha FROM ${table} r WHERE company_id=$1`,[company]);result[table]=r.rows[0];
  }
  return result;
 }
 async function deniedWithoutSideEffects(){
  const before=await fingerprint();
  for(const kind of ['internal_assistant_request','internal_assistant_draft']){
   expect((await api.entities(request(token),kind)).items).toEqual([]);
   expect(await engine.readEntities(actor,kind)).toEqual([]); // deliberately stale caller actor
  }
  expect(await fingerprint()).toEqual(before);
 }
 async function waitForCompanyWaiters(holder:PoolClient,count:number){
  const pid=Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid),deadline=Date.now()+5000;
  while(Date.now()<deadline){
   const result=await db.query("SELECT DISTINCT w.pid FROM pg_locks h JOIN pg_locks w ON w.locktype=h.locktype AND w.database IS NOT DISTINCT FROM h.database AND w.classid=h.classid AND w.objid=h.objid AND w.objsubid=h.objsubid WHERE h.pid=$1 AND h.locktype='advisory' AND h.granted AND NOT w.granted",[pid]);
   if(result.rows.length>=count)return;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('Actual cache reads never reached the held company lock');
 }

 it('returns the current owner source-bound cache through a real session without writes, receipts or provider calls',async()=>{
  const before=await fingerprint();
  expect((await api.entities(request(token),'internal_assistant_request')).items).toHaveLength(1);
  const drafts=(await api.entities(request(token),'internal_assistant_draft')).items;
  expect(drafts).toHaveLength(1);expect(drafts[0]).toMatchObject({id:draftId,data:{ownerUserId:'foreman',preview:{tasks:[{title:'EG reinigen'}]}}});
  expect(await fingerprint()).toEqual(before);
  expect(await db.transaction(company,'SYNTHETIC_INTERNAL_CACHE_ASSERT',tx=>tx.list('task'))).toEqual([]);
 });
 it('does not expose a private cached request or draft to another current internal author',async()=>{
  token=(await auth.createSession('other')).token;const before=await fingerprint();
  for(const kind of ['internal_assistant_request','internal_assistant_draft'])expect((await api.entities(request(token),kind)).items).toEqual([]);
  expect(await fingerprint()).toEqual(before);
 });
 it.each(['CLIENT','EXTERNAL_BAULEITER','EMPLOYEE','BOT_ADMIN'])('denies a former owner after a current %s role change despite injected draft/create permissions',async role=>{
  await update('user','foreman',{roles:[role],permissions:['assistant.read','chat.read','task.create','task.assign']});await deniedWithoutSideEffects();
 });
 it('requires every selected site to remain authorized instead of retaining a multi-site cache after one site is removed',async()=>{
  await update('user','foreman',{siteIds:['site']});await deniedWithoutSideEffects();
 });
 it('honors current source-channel membership revocation after the private draft was prepared',async()=>{
  await update('channel','channel',{members:[{user_id:'foreman',history_from:'2020-01-01T00:00:00Z',revoked_at:new Date().toISOString()}]});await deniedWithoutSideEffects();
 });
 it('rejects the old source snapshot after an actual message content/version edit',async()=>{
  await update('message','message',{message_version:2,text:'New source that has not been prepared'});await deniedWithoutSideEffects();
 });
 it('does not disclose old copied source text after the source is marked deleted',async()=>{
  await update('message','message',{deleted_at:new Date().toISOString()});await deniedWithoutSideEffects();
 });
 it('rejects current configuration and selected-location revision drift before exposing cached context',async()=>{
  await update('location','floor',{name:'Renamed current floor'});await deniedWithoutSideEffects();
  await update('assistant_config','config',{status:'RETIRED'});await deniedWithoutSideEffects();
 });
 it('requires the current canonical kind permission in addition to an eligible internal role',async()=>{
  await update('user','foreman',{roles:['TEAM_LEADER']});await deniedWithoutSideEffects();
 });
 it('denies a same-user-name session from another company without leaking this company cache',async()=>{
  const foreign=company+'-foreign';
  await db.transaction(foreign,'SYNTHETIC_INTERNAL_CACHE_FOREIGN',tx=>tx.add('user',{active:true,roles:['INTERNAL_BAULEITER'],siteIds:['site','second-site']},'foreman'));
  const foreignAuth=new AuthService(db,engine,{companyId:foreign,appMode:'TEST',publicOrigin:ORIGIN}),foreignToken=(await foreignAuth.createSession('foreman')).token;
  const before=await fingerprint();await expect(api.entities(request(foreignToken),'internal_assistant_draft')).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(await fingerprint()).toEqual(before);
 });
 it('freshly denies both a cookie/API read and a stale Engine actor when rights are revoked while their real company lock is held',async()=>{
  const holder=await db.pool.connect();let pending:Promise<unknown>[]=[];
  try{
   await holder.query('BEGIN');await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))',[company]);
   pending=[api.entities(request(token),'internal_assistant_draft'),engine.readEntities(actor,'internal_assistant_request')];
   await waitForCompanyWaiters(holder,2);
   const tx=new PgTransaction(holder,company,'SYNTHETIC_INTERNAL_CACHE_LOCKED_REVOKE'),user=await tx.get('user','foreman');await tx.save(user,{...user.data,roles:['CLIENT'],permissions:['assistant.read','chat.read','task.create']});
   await holder.query('COMMIT');
   const before=await fingerprint(),result=await Promise.all(pending);expect(result).toEqual([{items:[],limit:50,has_more:false,next_cursor:null},[]]);expect(await fingerprint()).toEqual(before);
  }finally{
   await holder.query('ROLLBACK');holder.release();await Promise.allSettled(pending);
  }
 });
});
