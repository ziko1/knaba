import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {leaseOutbox,type OutboxJob} from '../apps/worker/runner.ts';
import {processLeadSearch,scheduleLeadSearch} from '../apps/worker/lead-agent.ts';
import {profileSchema} from '../packages/domain/lead-agent-model.ts';
import type {Actor,Entity,Data} from '../packages/domain/core.ts';

// Actual PostgreSQL boundaries; provider responses are explicit synthetic fixtures.
// This suite proves neither provider permissions nor a deployment/SSO on knaba.de.
const integration=process.env.DATABASE_URL?describe:describe.skip;
integration('Lead Agent durable command and worker boundaries in PostgreSQL',()=>{
 let db:Database,engine:Engine,company:string,owner:Actor,other:Actor,client:Actor,profile:Entity;
 const config=()=>profileSchema.parse({name:'Synthetic Berlin procurement',sources:['ted'],categories:[],minimumScore:30});
 const execute=(actor:Actor,name:string,input:Data,version?:number,key=randomUUID())=>engine.execute(actor,name,{input,expected_version:version,idempotency_key:key});
 const list=(kind:string)=>db.transaction(company,'TEST_READ',tx=>tx.list(kind));
 const response=()=>new Response(JSON.stringify({notices:[{'publication-number':'999999-2026','title-proc':{deu:'Synthetic Berlin refurbishment'},'description-proc':{deu:'Fixture only. No real customer or contact.'},'notice-type':'cn-standard','publication-date':new Date().toISOString().slice(0,10)+'Z','place-of-performance':['DE300'],'place-of-performance-city-proc':['Berlin'],'classification-cpv':['45000000'],'deadline-receipt-tender-date-lot':['2030-12-16+01:00'],'deadline-receipt-tender-time-lot':['12:00:00+01:00']}],totalNoticeCount:1,timedOut:false}),{headers:{'content-type':'application/json'}});
 const queue=async()=>execute(owner,'lead_agent.search',{id:profile.id},profile.version);
 async function leased(){const jobs=await leaseOutbox(db,10,120000,company);const job=jobs.find(j=>j.type==='lead_agent.search_requested');expect(job).toBeDefined();return job!;}
 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
   company='qa-lead-agent-'+randomUUID();
   await db.transaction(company,'SYNTHETIC_SETUP',async tx=>{
     await tx.add('company',{legalName:'Synthetic test company',operatingMode:'TEST',synthetic:true},company);
     await tx.add('user',{active:true,roles:['OWNER'],permissions:[],siteIds:[]},'owner');
     await tx.add('user',{active:true,roles:['DIRECTOR'],permissions:[],siteIds:[]},'other');
     await tx.add('user',{active:true,roles:['CLIENT'],permissions:[],siteIds:[]},'client');
     await tx.add('user',{active:true,roles:['SERVICE_ACCOUNT'],permissions:['integration.process'],credentialDisabled:true,siteIds:[]},'knaba-integration-service');
   });
   [owner,other,client]=await Promise.all(['owner','other','client'].map(id=>engine.getActor(id,company)));
   profile=await execute(owner,'lead_agent.profile.save',{profile:config()});
 });
 afterAll(async()=>{await db?.close();});
 it('commits a single search, receipt, audit and existing outbox effect under concurrent replay',async()=>{
   const key=randomUUID();const [a,b]=await Promise.all([execute(owner,'lead_agent.search',{id:profile.id},profile.version,key),execute(owner,'lead_agent.search',{id:profile.id},profile.version,key)]);
   expect(a.id).toBe(b.id);expect(await list('lead_agent_run')).toHaveLength(1);
   expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='lead_agent.search_requested'",[company])).rows).toHaveLength(1);
   expect((await db.query('SELECT command FROM command_receipts WHERE company_id=$1 AND idempotency_key=$2',[company,key])).rows).toHaveLength(1);
   expect((await db.query("SELECT id FROM audit_log WHERE company_id=$1 AND aggregate_kind='lead_agent_run'",[company])).rows.length).toBeGreaterThan(0);
 });
 it('denies a foreign user and customer both through commands and generic entity reads',async()=>{
   expect(await engine.readEntities(other,'lead_agent_profile')).toEqual([]);expect(await engine.readEntities(client,'lead_agent_profile')).toEqual([]);
   await expect(execute(other,'lead_agent.search',{id:profile.id},profile.version)).rejects.toMatchObject({code:'ACCESS_DENIED'});
   await expect(execute(client,'lead_agent.catalog',{})).rejects.toMatchObject({code:'ACCESS_DENIED'});
   const foreign={...owner,companyId:'qa-other-tenant-'+randomUUID()};await expect(engine.readEntities(foreign,'lead_agent_profile')).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 it('a disabled public-search worker makes no provider request and records a visible block',async()=>{
   const run=await queue(),job=await leased(),fetcher=vi.fn(async()=>response());await processLeadSearch(db,engine,job,false,()=>new Date(),fetcher);
   expect(fetcher).not.toHaveBeenCalled();expect((await list('lead_agent_run')).find(r=>r.id===run.id)?.data).toMatchObject({status:'BLOCKED',reason:'PUBLIC_SEARCH_DISABLED'});
 });
 it('persists one sourced opportunity and one template, and a job replay has no duplicate request',async()=>{
   await queue();const job=await leased(),fetcher=vi.fn(async()=>response());await processLeadSearch(db,engine,job,true,()=>new Date(),fetcher);await processLeadSearch(db,engine,job,true,()=>new Date(),fetcher);
   expect(fetcher).toHaveBeenCalledTimes(1);expect(await list('lead_agent_opportunity')).toHaveLength(1);expect(await list('lead_agent_draft')).toHaveLength(1);
   expect((await list('lead_agent_run'))[0].data).toMatchObject({status:'SUCCEEDED',seen:1,matched:1});
   expect((await engine.readEntities(owner,'lead_agent_opportunity'))[0].data.source.source).toBe('ted');
 });
 it('cancels an in-flight result after an operator changes the search profile',async()=>{
   await queue();const job=await leased();const fetcher=vi.fn(async()=>{await execute(owner,'lead_agent.profile.save',{id:profile.id,profile:{...config(),name:'Changed scope'}},profile.version);return response();});
   await processLeadSearch(db,engine,job,true,()=>new Date(),fetcher);expect(await list('lead_agent_opportunity')).toHaveLength(0);expect((await list('lead_agent_run'))[0].data.status).toBe('CANCELLED');
 });
 it('does not publish fetched data after the original user loses authority',async()=>{
   await queue();const job=await leased();const fetcher=vi.fn(async()=>{await db.transaction(company,'SYNTHETIC_REVOKE',async tx=>{const u=await tx.get('user','owner');await tx.save(u,{...u.data,active:false},u.version);});return response();});
   await processLeadSearch(db,engine,job,true,()=>new Date(),fetcher);expect(await list('lead_agent_opportunity')).toHaveLength(0);expect((await list('lead_agent_run'))[0].data.status).toBe('CANCELLED');
 });
 it('a lost lease cannot publish even a successful provider result',async()=>{
   await queue();const job=await leased();const fetcher=vi.fn(async()=>{await db.query("UPDATE outbox SET lease_token='replacement-worker-token' WHERE company_id=$1 AND id=$2",[company,job.id]);return response();});
   await expect(processLeadSearch(db,engine,job,true,()=>new Date(),fetcher)).rejects.toMatchObject({code:'WORKER_LEASE_LOST'});expect(await list('lead_agent_opportunity')).toHaveLength(0);
 });
 it('a fake lease or a job from a different company makes no provider request',async()=>{
   await queue();const job=await leased(),fetcher=vi.fn(async()=>response());
   for(const bad of [{...job,lease_token:'fake'},{...job,company_id:'foreign'}])await expect(processLeadSearch(db,engine,bad,true,()=>new Date(),fetcher)).rejects.toMatchObject({code:'WORKER_LEASE_LOST'});
   expect(fetcher).not.toHaveBeenCalled();
 });
 it('two scheduling workers cannot create two jobs for the same due profile',async()=>{
   profile=await execute(owner,'lead_agent.profile.save',{id:profile.id,profile:{...config(),scheduleEnabled:true}},profile.version);
   const schedule=()=>db.transaction(company,'knaba-integration-service',tx=>scheduleLeadSearch(tx,engine,new Date().toISOString()));await Promise.all([schedule(),schedule()]);
   expect(await list('lead_agent_run')).toHaveLength(1);expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='lead_agent.search_requested'",[company])).rows).toHaveLength(1);
 });
 it('expired user authority stops future scheduled work',async()=>{
   profile=await execute(owner,'lead_agent.profile.save',{id:profile.id,profile:{...config(),scheduleEnabled:true}},profile.version);
   await db.transaction(company,'SYNTHETIC_REVOKE',async tx=>{const user=await tx.get('user','owner');await tx.save(user,{...user.data,roles:['EMPLOYEE'],permissions:[]},user.version);});
   await db.transaction(company,'knaba-integration-service',tx=>scheduleLeadSearch(tx,engine,new Date().toISOString()));expect(await list('lead_agent_run')).toHaveLength(0);
 });
 it('newest-first pagination crosses 100 same-timestamp records without duplicates and rejects foreign cursors',async()=>{
   await db.transaction(company,'SYNTHETIC_PAGE_SETUP',async tx=>{for(let n=0;n<105;n++)await tx.add('lead_agent_run',{ownerUserId:'other',profileId:profile.id,profileVersion:1,status:'SUCCEEDED',requestedAt:new Date().toISOString()},'run-'+String(n).padStart(4,'0'));});
   const first=await execute(other,'lead_agent.list',{kind:'lead_agent_run',limit:100});expect(first.items).toHaveLength(100);expect(first.items[0].id).toBe('run-0104');expect(first.has_more).toBe(true);
   const next=await execute(other,'lead_agent.list',{kind:'lead_agent_run',limit:100,cursor:first.next_cursor});expect(next.items).toHaveLength(5);expect(new Set([...first.items,...next.items].map((r:Entity)=>r.id)).size).toBe(105);
   const foreign=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(first.next_cursor,'base64url').toString()),company:'foreign'})).toString('base64url');
   await expect(execute(other,'lead_agent.list',{kind:'lead_agent_run',cursor:foreign})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
   await expect(execute(owner,'lead_agent.list',{kind:'lead_agent_run',cursor:first.next_cursor})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
   expect((await execute(client,'lead_agent.list',{kind:'lead_agent_run'}).catch(e=>({code:e.code}))).code).toBe('ACCESS_DENIED');
 });
 it('terminal outbox failures stop the UI run rather than leaving it running forever',async()=>{
   const run=await queue();await db.query("UPDATE outbox SET status='FAILED',last_error='SYNTHETIC_FAILURE' WHERE company_id=$1 AND type='lead_agent.search_requested'",[company]);
   await db.transaction(company,'knaba-integration-service',tx=>scheduleLeadSearch(tx,engine,new Date().toISOString(),false));
   expect((await list('lead_agent_run')).find(r=>r.id===run.id)?.data).toMatchObject({status:'FAILED',reason:'WORKER_FAILED'});
 });
 it('revoked owners cannot starve later valid schedules in the bounded due window',async()=>{
   await db.transaction(company,'SYNTHETIC_SCHEDULE_SETUP',async tx=>{
     await tx.add('user',{active:false,roles:['DIRECTOR'],permissions:[]},'revoked');
     for(let n=0;n<20;n++)await tx.add('lead_agent_profile',{ownerUserId:'revoked',archived:false,profile:{...config(),scheduleEnabled:true}},'a-revoked-'+String(n).padStart(2,'0'));
     await tx.add('lead_agent_profile',{ownerUserId:'owner',archived:false,profile:{...config(),scheduleEnabled:true}},'z-current');
   });
   for(let n=0;n<2;n++)await db.transaction(company,'knaba-integration-service',tx=>scheduleLeadSearch(tx,engine,new Date().toISOString()));
   expect((await list('lead_agent_run')).map(r=>r.data.profileId)).toContain('z-current');
   expect((await list('lead_agent_profile')).filter(p=>p.data.ownerUserId==='revoked').every(p=>p.data.profile.scheduleEnabled===false&&p.data.schedulePauseReason==='AUTHORITY_REVOKED')).toBe(true);
 });
});
