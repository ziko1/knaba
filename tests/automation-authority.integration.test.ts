import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Request} from 'express';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {ApiController} from '../apps/api/http.ts';
import {AuthService,SESSION_COOKIE} from '../apps/api/auth.ts';
import {WorkerRunner,leaseOutbox,serviceId,type OutboxJob} from '../apps/worker/runner.ts';
import type {Actor,Data,Entity} from '../packages/domain/core.ts';

// Real Database/Engine/domain lifecycle/worker and cookie authentication. Only
// Express transport is doubled; no external provider is contacted. Without a
// DATABASE_URL these five discovered fixtures remain SQL_NOT_RUN.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
const ORIGIN='https://automation-authority.qa.example.test';
function request(token:string,csrf:string,method='GET'):Request{
 const values:Record<string,string>={origin:ORIGIN,host:new URL(ORIGIN).host,cookie:`${SESSION_COOKIE}=${token}`,'x-csrf-token':csrf};
 return {method,protocol:'https',ip:'192.0.2.46',headers:values,get:(name:string)=>values[name.toLowerCase()]} as unknown as Request;
}

postgres('automation current authority: real PostgreSQL Engine/worker/API with no external provider',()=>{
 let db:Database,engine:Engine,api:ApiController,auth:AuthService,worker:WorkerRunner,company:string,owner:Actor,viewer:Actor,rule:Entity,run:Entity,runKey:string,runInput:Data;
 let ownerSession:{token:string;csrfToken:string},viewerSession:{token:string;csrfToken:string},employeeSession:{token:string;csrfToken:string};
 let provider:ReturnType<typeof vi.fn>;
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  vi.stubEnv('DEEPSEEK_API_KEY','');vi.stubEnv('WHATSAPP_ACCESS_TOKEN','');provider=vi.fn(async()=>{throw new Error('AUTOMATION_QA_MUST_NOT_CONTACT_PROVIDER');});vi.stubGlobal('fetch',provider);
  company='automation-authority-qa-'+randomUUID();engine=new Engine(db,'TEST');
  await db.transaction(company,'SYNTHETIC_AUTOMATION_AUTHORITY_FIXTURE',async tx=>{
   await tx.add('company',{name:'Synthetic isolated automation authority QA',synthetic:true,operatingMode:'TEST'},company);
   for(const id of ['owner','viewer']){
    await tx.add('user',{active:true,roles:['INTERNAL_BAULEITER'],permissions:['automation.manage','automation.approve'],siteIds:['site']},id);
    await tx.add('customer_membership',{active:true,userId:id,customerId:'customer',permissions:['VIEW']},'member-'+id);
   }
   await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:['site']},'employee');
   await tx.add('user',{active:true,roles:['DIRECTOR'],permissions:['inventory.read','scope.company'],siteIds:[]},'global-owner');
   for(const id of ['site','foreign-site'])await tx.add('site',{active:true,code:id,name:'Synthetic '+id,customerId:id==='site'?'customer':'foreign-customer'},id);
   for(const id of ['customer','foreign-customer'])await tx.add('customer',{active:true,name:'Synthetic '+id},id);
   await tx.add('material_request',{siteId:'site',materialId:'private-material',approvedBase:9000,receivedBase:1000,state:'APPROVED'},'private-request');
  });
  worker=new WorkerRunner(db,engine,{companyId:company,appMode:'TEST',maxAttempts:1,leaseMs:120000});await worker.initialize();
  owner=await engine.getActor('owner',company);viewer=await engine.getActor('viewer',company);
  const options={companyId:company,appMode:'TEST',publicOrigin:ORIGIN,encryptionKey:'SYNTHETIC_AUTH_KEY_NOT_A_PRODUCTION_SECRET'};api=new ApiController({db,engine,...options,buildSha:'0'.repeat(40)});auth=new AuthService(db,engine,options);
  ownerSession=await auth.createSession('owner');viewerSession=await auth.createSession('viewer');employeeSession=await auth.createSession('employee');
  rule=await execute(owner,'automation_rule.create',{name:'Synthetic bounded shortage routine',trigger:'material.request.changed',filters:{},action:'DETECT_SHORTAGE',ownerId:'owner',scope:{siteIds:['site'],customerIds:['customer']},cooldownSeconds:0,maxAttempts:3,activeFrom:'2026-01-01T00:00:00.000Z',parameters:{}});
  await execute(owner,'automation_rule.preview',{id:rule.id,events:[]});rule=await execute(owner,'automation_rule.activate',{id:rule.id});
  runKey=randomUUID();runInput={id:rule.id,event:{id:'synthetic-source-event',type:'material.request.changed',data:{siteId:'site',customerId:'customer'}}};
  run=await engine.execute(await engine.getActor(serviceId,company),'automation_rule.run',{input:runInput,idempotency_key:runKey});
 });
 afterEach(()=>{expect(provider).not.toHaveBeenCalled();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
 afterAll(async()=>{await db?.close();});
 const execute=(actor:Actor,name:string,input:Data)=>engine.execute(actor,name,{input,idempotency_key:randomUUID()});
 const row=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_AUTOMATION_AUTHORITY_ASSERT',tx=>tx.get(kind,id));
 const update=(kind:string,id:string,patch:Data)=>db.transaction(company,'SYNTHETIC_AUTOMATION_AUTHORITY_REVOKE',async tx=>{const e=await tx.get(kind,id);return tx.save(e,{...e.data,...patch});});
 async function fingerprint(){
  const values:Record<string,Data>={};for(const table of ['aggregates','aggregate_revisions','audit_log','command_receipts','outbox','auth_sessions'])values[table]=(await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY to_jsonb(r)::text),'')) AS hash FROM ${table} r WHERE company_id=$1`,[company])).rows[0];return values;
 }
 async function job():Promise<OutboxJob>{const jobs=await leaseOutbox(db,1,120000,company);expect(jobs).toHaveLength(1);expect(jobs[0]!.type).toBe('automation.action_requested');expect(jobs[0]!.data.runId).toBe(run.id);return jobs[0]!;}

 it('authenticated entity lists disclose only specific current automation/capability authority and do not write on read',async()=>{
  const before=await fingerprint();for(const kind of ['automation_rule','automation_run']){
   expect((await api.entities(request(employeeSession.token,employeeSession.csrfToken),kind)).items).toEqual([]);
   expect((await api.entities(request(viewerSession.token,viewerSession.csrfToken),kind)).items).toHaveLength(1);
  }
  expect(await fingerprint()).toEqual(before);
 });
 it('revocation of the rule owner customer membership or site removes stored rule/run visibility for a still-authorized viewer',async()=>{
  await update('customer_membership','member-owner',{active:false});const before=await fingerprint();
  for(const kind of ['automation_rule','automation_run'])expect((await api.entities(request(viewerSession.token,viewerSession.csrfToken),kind)).items).toEqual([]);
  expect(await fingerprint()).toEqual(before);
  await update('user','owner',{siteIds:[]});expect(await engine.readEntities(viewer,'automation_run')).toEqual([]);
 });
 it('actual cookie/API rule creation rejects an unauthorized customer even when the nominated owner has company authority, rolling back every effect',async()=>{
  const input={name:'Synthetic forbidden customer candidate',trigger:'material.request.changed',filters:{},action:'DETECT_SHORTAGE',ownerId:'global-owner',scope:{siteIds:['site'],customerIds:['foreign-customer']},activeFrom:'2026-01-01T00:00:00.000Z'},before=await fingerprint();
 await expect(api.command(request(ownerSession.token,ownerSession.csrfToken,'POST'),'automation_rule.create',{input,idempotency_key:randomUUID()})).rejects.toMatchObject({code:'ACCESS_DENIED'});
 expect(await fingerprint()).toEqual(before);
  const allowedInput={...input,name:'Synthetic authorized globally owned candidate',scope:{siteIds:['site'],customerIds:['customer']}},createKey=randomUUID();
  const created=await api.command(request(ownerSession.token,ownerSession.csrfToken,'POST'),'automation_rule.create',{input:allowedInput,idempotency_key:createKey});
  expect(created.data.ownerId).toBe('global-owner');await update('user','global-owner',{active:false});const afterRevocation=await fingerprint();
  await expect(api.command(request(ownerSession.token,ownerSession.csrfToken,'POST'),'automation_rule.create',{input:allowedInput,idempotency_key:createKey})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(await fingerprint()).toEqual(afterRevocation);
 });
 it('a genuinely leased worker and exact service receipt reject owner revocation and current parameter drift before disclosing private shortage data',async()=>{
  const leased=await job(),sourceBefore=await row('material_request','private-request');await update('user','owner',{siteIds:[]});
  const service=await engine.getActor(serviceId,company);
  await expect(engine.execute(service,'automation_rule.run',{input:runInput,idempotency_key:runKey})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(worker.handle(leased)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const current=await row('automation_run',run.id);expect(current.data.status).not.toBe('SUCCEEDED');expect(current.data.result).toBeUndefined();expect(await row('material_request','private-request')).toEqual(sourceBefore);
  await update('user','owner',{siteIds:['site']});await update('automation_rule',rule.id,{parameters:{privateOriginal:'Changed current source without ruleVersion bump'}});
  await expect(engine.execute(service,'automation_rule.run',{input:runInput,idempotency_key:runKey})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(engine.execute(service,'automation_rule.run',{input:runInput,idempotency_key:randomUUID()})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(worker.handle(leased)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect((await row('automation_run',run.id)).data.result).toBeUndefined();expect(await row('material_request','private-request')).toEqual(sourceBefore);
 });
 it('a genuinely leased current-owner worker records only the authorized source shortage once without modifying the source inventory request',async()=>{
  const leased=await job(),sourceBefore=await row('material_request','private-request');await worker.handle(leased);
  const current=await row('automation_run',run.id);expect(current.data.status).toBe('SUCCEEDED');expect(current.data.result).toEqual([{requestId:'private-request',siteId:'site',materialId:'private-material',unreceivedBase:8000}]);expect(await row('material_request','private-request')).toEqual(sourceBefore);
  const before=await fingerprint();await worker.handle(leased);expect(await fingerprint()).toEqual(before);
 });
});
