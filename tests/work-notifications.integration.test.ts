import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Request} from 'express';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {ApiController} from '../apps/api/http.ts';
import {AuthService,SESSION_COOKIE} from '../apps/api/auth.ts';
import {WorkerRunner,leaseOutbox,type OutboxJob} from '../apps/worker/runner.ts';
import {processWorkNotifications} from '../packages/domain/work-notifications.ts';
import type {Actor,Data,Entity} from '../packages/domain/core.ts';

// Genuine company-serialized PostgreSQL transactions, real Engine commands,
// leased WorkerRunner and authenticated API; no provider/HTTP sockets. These
// fixtures are SQL_NOT_RUN when DATABASE_URL is absent, never CPU acceptance.
const postgres=process.env.DATABASE_URL?describe:describe.skip,ORIGIN='https://work-notifications.qa.example.test';
postgres('automatic work notifications: actual PostgreSQL producer/worker/activity lifecycle',()=>{
 let db:Database,engine:Engine,worker:WorkerRunner,api:ApiController,company:string,manager:Actor,employee:Actor,peer:Actor;
 let session:{token:string;csrfToken:string},provider:ReturnType<typeof vi.fn>;
 const host=()=>({actorIn:engine.actorIn.bind(engine),scope:engine.scope.bind(engine),visible:engine.visible.bind(engine)});
 const execute=(actor:Actor,name:string,input:Data,expected_version?:number)=>engine.execute(actor,name,{input,expected_version,idempotency_key:randomUUID()});
 const read=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_WORK_QA',tx=>tx.get(kind,id));
 const change=(kind:string,id:string,patch:Data)=>db.transaction(company,'SYNTHETIC_WORK_QA',async tx=>{const e=await tx.get(kind,id);return tx.save(e,{...e.data,...patch},e.version);});
 const notices=()=>db.transaction(company,'SYNTHETIC_WORK_QA',async tx=>(await tx.list('notification')).filter(n=>n.data.work_cause));
 const req=():Request=>{const headers:Record<string,string>={origin:ORIGIN,host:new URL(ORIGIN).host,cookie:`${SESSION_COOKIE}=${session.token}`};return {method:'GET',protocol:'https',ip:'192.0.2.70',headers,get:(name:string)=>headers[name.toLowerCase()]} as unknown as Request;};
 async function take(type:string,predicate=(j:OutboxJob)=>true){const pending=(await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type=$2 AND status='PENDING' ORDER BY created_at,id",[company,type])).rows;expect(pending.length).toBeGreaterThan(0);const ids=pending.map(r=>r.id);await db.query("UPDATE outbox SET available_at=now()-interval '1 second' WHERE company_id=$1 AND id=ANY($2::text[])",[company,ids]);const jobs=await leaseOutbox(db,100,120000,company),job=jobs.find(j=>j.type===type&&predicate(j));expect(job).toBeDefined();return job!;}
 const createTask=()=>execute(manager,'task.create',{siteId:'site',title:'PRIVATE_TASK_ORIGINAL_DO_NOT_COPY',assigneeIds:[]});
 async function assignedTask(){const task=await createTask();await execute(manager,'task.assign',{taskId:task.id,employeeIds:['employee']},task.version);const job=await take('task.assigned',j=>j.data.taskId===task.id);return {task:await read('task',task.id),job};}
 async function fingerprint(){const result:Data={};for(const table of ['aggregates','aggregate_revisions','audit_log','outbox'])result[table]=(await db.query(`SELECT count(*)::int AS n,md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY to_jsonb(r)::text),'')) AS hash FROM ${table} r WHERE company_id=$1`,[company])).rows[0];return result;}
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  vi.stubEnv('WHATSAPP_ACCESS_TOKEN','');vi.stubEnv('DEEPSEEK_API_KEY','');provider=vi.fn(async()=>{throw new Error('NO_EXTERNAL_PROVIDER_IN_WORK_NOTIFICATION_QA');});vi.stubGlobal('fetch',provider);
  company='work-notification-qa-'+randomUUID();engine=new Engine(db,'TEST');
  await db.transaction(company,'SYNTHETIC_WORK_QA',async tx=>{
   await tx.add('company',{name:'Isolated synthetic work notifications',operatingMode:'TEST',synthetic:true},company);
   await tx.add('site',{name:'Synthetic site',code:'WORK-QA',active:true,managerIds:['manager']},'site');
   await tx.add('user',{name:'Synthetic responsible foreman',roles:['INTERNAL_BAULEITER'],permissions:['report.publish'],siteIds:['site'],active:true},'manager');
   for(const id of ['employee','peer'])await tx.add('user',{name:'Synthetic '+id,roles:['EMPLOYEE'],siteIds:['site'],active:true},id);
   await tx.add('user',{name:'Nonresponsible reviewer',roles:['QUALITY_CONTROL'],siteIds:['site'],active:true},'other-reviewer');
   await tx.add('user',{name:'Synthetic client',roles:['CLIENT'],siteIds:[],active:true},'client');
   for(const id of ['manager','employee','peer'])await tx.add('notification_setting',{user_id:id,language:id==='employee'?'UK':'DE',whatsapp_consent:false,opted_out:false,quiet_start:0,quiet_end:0},'setting-'+id);
  });
  manager=await engine.getActor('manager',company);employee=await engine.getActor('employee',company);peer=await engine.getActor('peer',company);
  worker=new WorkerRunner(db,engine,{companyId:company,appMode:'TEST',maxAttempts:2,leaseMs:120000,publicOrigin:ORIGIN});await worker.initialize();
  const options={companyId:company,appMode:'TEST',publicOrigin:ORIGIN,encryptionKey:'SYNTHETIC_WORK_QA_AUTH_ONLY'};api=new ApiController({db,engine,...options,buildSha:'0'.repeat(40)});session=await new AuthService(db,engine,options).createSession('employee');
 });
 afterEach(()=>{expect(provider).not.toHaveBeenCalled();vi.unstubAllGlobals();vi.unstubAllEnvs();});
 afterAll(async()=>{await db?.close();});

 it('task.assign automatically creates reasoned own-language WEB activity, delivery outbox and actual audit without copying task text',async()=>{
  const {task,job}=await assignedTask();await worker.process(job);const stored=await notices();expect(stored).toHaveLength(1);const n=stored[0]!;
  expect(n.data).toMatchObject({event:'task.assigned',recipient_id:'employee',channel:'WEB',language:'UK',status:'PENDING',related_kind:'task',related_id:task.id});
  expect(JSON.stringify(n)).not.toContain('PRIVATE_TASK_ORIGINAL');expect((await api.entities(req(),'notification')).items.map((e:Entity)=>e.id)).toEqual([n.id]);
  expect((await db.query("SELECT action FROM audit_log WHERE company_id=$1 AND aggregate_kind='notification' AND aggregate_id=$2",[company,n.id])).rows).toEqual([{action:'CREATE'}]);
  const send=await take('notification.scheduled',j=>j.data.notification_id===n.id);await worker.process(send);expect((await read('notification',n.id)).data.status).toBe('SUCCEEDED');expect(await read('task',task.id)).toEqual(task);
 });
 it('a duplicate canonical outbox event after worker restart has one notification and one scheduled delivery',async()=>{
  const {job}=await assignedTask();await worker.process(job);await db.transaction(company,'SYNTHETIC_DUPLICATE_EVENT',tx=>tx.event(job.type,job.data));
  const repeated=await take(job.type);const restarted=new WorkerRunner(db,engine,worker.options);await restarted.initialize();await restarted.process(repeated);
  expect(await notices()).toHaveLength(1);expect((await db.query("SELECT count(*)::int AS n FROM outbox WHERE company_id=$1 AND type='notification.scheduled'",[company])).rows[0].n).toBe(1);
 });
 it('expired/stolen lease and changed canonical event data fail before any notification/audit/outbox effect',async()=>{
  const {job}=await assignedTask(),before=await fingerprint();await expect(processWorkNotifications(db,host(),{...job,lease_token:'STOLEN_TOKEN'})).rejects.toMatchObject({code:'WORKER_LEASE_LOST'});expect(await fingerprint()).toEqual(before);
  await expect(processWorkNotifications(db,host(),{...job,data:{...job.data,employeeIds:['peer']}})).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await fingerprint()).toEqual(before);
  await expect(processWorkNotifications(db,host(),{...job,type:'issue.opened'})).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await fingerprint()).toEqual(before);
  await db.query("UPDATE outbox SET leased_until=clock_timestamp()-interval '1 second' WHERE company_id=$1 AND id=$2",[company,job.id]);const expired=await fingerprint();await expect(processWorkNotifications(db,host(),job)).rejects.toMatchObject({code:'WORKER_LEASE_LOST'});expect(await fingerprint()).toEqual(expired);
 });
 it('reassignment committed before producer execution suppresses the old employee and notifies only the fresh canonical assignee',async()=>{
  const {task,job}=await assignedTask();await execute(manager,'task.assign',{taskId:task.id,employeeIds:['peer']},task.version);await worker.process(job);expect(await notices()).toEqual([]);
  const fresh=await take('task.assigned',j=>j.data.employeeIds[0]==='peer');await worker.process(fresh);expect((await notices()).map(n=>n.data.recipient_id)).toEqual(['peer']);expect((await api.entities(req(),'notification')).items).toEqual([]);
 });
 it.each(['site','role','inactive'])('fresh %s revocation after production hides activity and cancels queued delivery',async(revocation)=>{
  const {job}=await assignedTask();await worker.process(job);const n=(await notices())[0]!;
  const patch=revocation==='site'?{siteIds:[]}:revocation==='role'?{roles:['CLIENT'],permissions:[]}: {active:false};await change('user','employee',patch);
  if(revocation!=='inactive')expect((await api.entities(req(),'notification')).items).toEqual([]);
  const send=await take('notification.scheduled');await worker.process(send);expect((await read('notification',n.id)).data).toMatchObject({status:'CANCELLED'});
 });
 it('chat mention/instruction/foreman reply are actual message.send producers, then source membership revocation cancels all three',async()=>{
  const channel=await execute(manager,'channel.create',{type:'SITE_INTERNAL',name:'Synthetic protected chat',site_id:'site',member_ids:['employee']});const original=await execute(employee,'message.send',{channel_id:channel.id,text:'Synthetic worker question',language:'UK'});const message=await execute(manager,'message.send',{channel_id:channel.id,text:'PRIVATE_CHAT_ORIGINAL',language:'DE',mention_ids:['employee'],important:true,reply_to_id:original.id});
  const job=await take('message.created',j=>j.data.message_id===message.id);await worker.process(job);const n=await notices();expect(n.map(e=>e.data.event).sort()).toEqual(['chat.foreman_reply','chat.important_instruction','chat.mention']);expect(JSON.stringify(n)).not.toContain('PRIVATE_CHAT_ORIGINAL');
  await execute(manager,'channel.membership',{channel_id:channel.id,user_id:'employee',action:'REVOKE'});expect((await api.entities(req(),'notification')).items).toEqual([]);
  const queued=(await leaseOutbox(db,100,120000,company)).filter(j=>j.type==='notification.scheduled');expect(queued).toHaveLength(3);for(const j of queued)await worker.process(j);expect((await notices()).every(e=>e.data.status==='CANCELLED')).toBe(true);
 });
 it('task submission notifies configured current reviewer, never every reviewer; accepting the task cancels stale cause',async()=>{
  const {task}=await assignedTask();await execute(employee,'task.start',{taskId:task.id});await execute(employee,'task.submit',{taskId:task.id});
  const job=await take('task.state_changed',j=>j.data.to==='SUBMITTED_FOR_REVIEW');await worker.process(job);const n=await notices();expect(n.map(e=>[e.data.event,e.data.recipient_id])).toEqual([['task.submitted_for_review','manager']]);
  await execute(manager,'task.review',{taskId:task.id,decision:'ACCEPT'});expect(await engine.readEntities(manager,'notification')).toEqual([]);const send=await take('notification.scheduled');await worker.process(send);expect((await read('notification',n[0]!.id)).data.status).toBe('CANCELLED');
 });
 it('SQL transaction rollback preserves atomicity if delivery outbox insertion fails after notification revision/audit',async()=>{
  const {job}=await assignedTask(),before=await fingerprint();const failing={transaction:(companyId:string,actorId:string,fn:any,timeout:number)=>db.transaction(companyId,actorId,async tx=>{tx.event=async()=>{throw new Error('SYNTHETIC_OUTBOX_INSERT_FAILURE');};return fn(tx);},timeout)} as Database;
  await expect(processWorkNotifications(failing,host(),job)).rejects.toThrow('SYNTHETIC_OUTBOX_INSERT_FAILURE');expect(await fingerprint()).toEqual(before);expect(await notices()).toEqual([]);
 });
 it('revoked service account cannot project an otherwise valid leased event and causes no partial writes',async()=>{
  const {job}=await assignedTask();await change('user','knaba-integration-service',{active:false});const before=await fingerprint();await expect(processWorkNotifications(db,host(),job)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await fingerprint()).toEqual(before);
 });
 it('synthetic recorded-payout source produces only its subject acknowledgment reminder; actual payout.ack cancels it without finance payload copying',async()=>{
  // A synthetic payroll source fixture, not proof of external bank execution or
  // payout approval. The real own acknowledgment handler is exercised below.
  await db.transaction(company,'SYNTHETIC_RECORDED_PAYOUT_FIXTURE',async tx=>{await tx.add('payout',{state:'RECORDED',ackState:'UNCONFIRMED',employeeId:'employee',amountCents:543210,currency:'EUR',method:'CASH'},'payout');await tx.event('payout.transfer_recorded',{payoutId:'payout',employeeId:'employee'});});
  const job=await take('payout.transfer_recorded');await worker.process(job);const n=(await notices())[0]!;expect(n.data).toMatchObject({event:'payout.acknowledgment_required',recipient_id:'employee'});expect(JSON.stringify(n)).not.toContain('543210');expect(await engine.readEntities(manager,'notification')).toEqual([]);expect((await api.entities(req(),'notification')).items).toHaveLength(1);
  await execute(employee,'payout.ack',{payoutId:'payout',decision:'FULL',statement:'Synthetic receipt confirmed'});expect((await api.entities(req(),'notification')).items).toEqual([]);await worker.process(await take('notification.scheduled'));expect((await read('notification',n.id)).data.status).toBe('CANCELLED');
 });
 it('same-looking foreign company and current client cannot see private employee work activity',async()=>{
  const {job}=await assignedTask();await worker.process(job);expect(await engine.readEntities(await engine.getActor('client',company),'notification')).toEqual([]);
  const foreign='work-notification-foreign-'+randomUUID();await db.transaction(foreign,'SYNTHETIC_FOREIGN',async tx=>{await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:['site']},'employee');});expect(await engine.readEntities(await engine.getActor('employee',foreign),'notification')).toEqual([]);
 });
});
