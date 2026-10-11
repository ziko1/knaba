import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Request} from 'express';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {ApiController} from '../apps/api/http.ts';
import {createOperationsDigestCommands} from '../apps/api/operations-digest.ts';
import {AuthService,SESSION_COOKIE} from '../apps/api/auth.ts';
import {WorkerRunner,leaseOutbox,serviceId,berlinParts,type OutboxJob} from '../apps/worker/runner.ts';
import {DomainError,type Actor,type Data,type Entity} from '../packages/domain/core.ts';

// Genuine PostgreSQL + canonical Engine/domain + leased WorkerRunner + actual
// cookie/CSRF controller authentication. Only Express transport is doubled.
// Every case owns a new synthetic tenant; discovery without DATABASE_URL is SKIP.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
const ORIGIN='https://operations-digest.qa.example.test';
const SECRET='SYNTHETIC_PRIVATE_FINANCE_CANARY_87d41a';
const DAY={start:'2026-03-28T23:00:00.000Z',end:'2026-03-29T22:00:00.000Z'};
const WEEK={start:'2026-03-22T23:00:00.000Z',end:DAY.end};
type Session={token:string;csrfToken:string};
function request(session:Session,method='GET'):Request{
 const values:Record<string,string>={origin:ORIGIN,host:new URL(ORIGIN).host,cookie:`${SESSION_COOKIE}=${session.token}`,'x-csrf-token':session.csrfToken};
 return {method,protocol:'https',ip:'192.0.2.54',headers:values,get:(name:string)=>values[name.toLowerCase()]} as unknown as Request;
}

postgres('operations digest: actual PostgreSQL configure/preview/leased worker/privacy',()=>{
 let db:Database,engine:Engine,api:ApiController,worker:WorkerRunner,company:string,owner:Actor,viewer:Actor,employee:Actor;
 let sessions:Record<string,Session>,provider:ReturnType<typeof vi.fn>,clock:Date,currentCron:string;
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  vi.stubEnv('DEEPSEEK_API_KEY','');vi.stubEnv('WHATSAPP_ACCESS_TOKEN','');
  provider=vi.fn(async()=>{throw new Error('DIGEST_QA_MUST_NOT_CONTACT_PROVIDER');});vi.stubGlobal('fetch',provider);
  company='operations-digest-qa-'+randomUUID();engine=new Engine(db,'TEST');Object.assign(engine.registry,createOperationsDigestCommands(engine));
  clock=new Date(Math.floor(Date.now()/60000)*60000);const local=berlinParts(clock);currentCron=`${Number(local.minute)} ${Number(local.hour)} * * *`;
  await db.transaction(company,'SYNTHETIC_DIGEST_FIXTURE',async tx=>{
   await tx.add('company',{name:'Synthetic isolated operations digest QA',synthetic:true,operatingMode:'TEST'},company);
   for(const id of ['owner','viewer'])await tx.add('user',{active:true,roles:['OPERATIONS_MANAGER'],siteIds:['site'],permissions:['notifications.manage']},id);
   await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:['site']},'employee');
   await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:['foreign-site']},'foreign-employee');
   await tx.add('user',{active:true,roles:['CLIENT'],siteIds:[]},'client');
   await tx.add('site',{active:true,code:'SYN-A',name:'Synthetic permitted site',address:'Synthetic Teststraße 1, Berlin'},'site');
   await tx.add('site',{active:true,code:'SYN-B',name:'Forbidden private site '+SECRET,address:SECRET},'foreign-site');
   for(const [id,activity,startAt,endAt] of [
    ['pre-day','WORKING','2026-03-28T22:30:00.000Z','2026-03-28T23:30:00.000Z'],
    ['dst-travel','TRAVELLING','2026-03-29T00:30:00.000Z','2026-03-29T01:30:00.000Z'],
    ['private-break','ON_BREAK','2026-03-29T10:00:00.000Z','2026-03-29T10:30:00.000Z'],
    ['unexplained','AWAY_PENDING_REASON','2026-03-29T11:00:00.000Z','2026-03-29T11:05:00.000Z'],
    ['post-day','WORKING','2026-03-29T21:30:00.000Z','2026-03-29T22:30:00.000Z'],
   ['week-only','WORKING','2026-03-23T10:00:00.000Z','2026-03-23T11:00:00.000Z'],
   ])await tx.add('time_segment',{employeeId:'employee',shiftId:'synthetic-shift',siteId:'site',activity,startAt,endAt,reason:activity==='ON_BREAK'?SECRET:undefined},id);
   const segmentSnapshot=(await tx.list('time_segment')).map(s=>{const endAt=new Date(Math.min(Date.parse(s.data.endAt),Date.parse(DAY.end))).toISOString();return {id:s.id,...s.data,endAt,seconds:(Date.parse(endAt)-Date.parse(s.data.startAt))/1000};});
   await tx.add('timesheet',{employeeId:'employee',siteId:'site',state:'APPROVED',periodStart:WEEK.start,periodEnd:'2026-03-29T11:05:00.000Z',paidActivities:['WORKING'],segmentSnapshot:segmentSnapshot.filter(s=>s.id!=='post-day'),payableSeconds:7200,approvedBy:'viewer',approvedAt:'2026-03-29T12:00:00.000Z'},'timesheet');
   await tx.add('timesheet',{employeeId:'employee',siteId:'site',state:'APPROVED',periodStart:'2026-03-29T21:30:00.000Z',periodEnd:DAY.end,paidActivities:['WORKING'],segmentSnapshot:segmentSnapshot.filter(s=>s.id==='post-day'),payableSeconds:1800,approvedBy:'viewer',approvedAt:DAY.end},'late-timesheet');
   await tx.add('trip',{employeeId:'employee',shiftId:'synthetic-shift',siteId:'site',origin:{kind:'SITE',id:'site'},destination:{kind:'SITE',id:'site'},state:'ARRIVED',approvalState:'APPROVED',paidSeconds:3600,startAt:'2026-03-29T00:30:00.000Z',endAt:'2026-03-29T01:30:00.000Z',purpose:SECRET},'trip');
   await tx.add('trip_approval',{tripId:'trip',employeeId:'employee',siteId:'site',state:'APPROVED',decision:'APPROVE',approvedBy:'viewer',approvedAt:'2026-03-29T12:00:00.000Z',paidSeconds:3600,paidActivities:['TRAVELLING'],segmentSnapshot:[{id:'dst-travel',siteId:'site',activity:'TRAVELLING',startAt:'2026-03-29T00:30:00.000Z',endAt:'2026-03-29T01:30:00.000Z',seconds:3600}]},'trip-approval');
   await tx.add('time_segment',{employeeId:'foreign-employee',siteId:'foreign-site',activity:'WORKING',startAt:DAY.start,endAt:DAY.end,reason:SECRET},'foreign-segment');
   await tx.add('task',{siteId:'site',title:'Synthetic task',state:'ACCEPTED',unit:'M2',plannedQuantityMilli:100000,reportedQuantityMilli:100000,acceptedQuantityMilli:100000,assigneeIds:['employee'],completionKind:'ORIGINAL',billingScope:'CONTRACT',reviewCycle:1,checklist:[],dependencyIds:[],requiredPhotoCount:0,submittedBy:'employee',reviewedBy:'viewer',reviewedAt:'2026-03-29T13:00:00.000Z',dueAt:'2026-03-28T12:00:00.000Z'},'task');
   await tx.add('worklog',{taskId:'task',siteId:'site',unit:'M2',quantityMilli:100000,employeeIds:['employee'],reportedAt:'2026-03-29T12:00:00.000Z'},'worklog');
   await tx.add('task_review',{taskId:'task',siteId:'site',decision:'ACCEPT',quantityMilli:100000,reviewedAt:'2026-03-29T13:00:00.000Z',snapshot:{siteId:'site',unit:'M2',assigneeIds:['employee']},worklogIds:['worklog']},'review');
   await tx.add('task',{siteId:'foreign-site',title:SECRET,state:'ACCEPTED',unit:'M2',plannedQuantityMilli:999000,reportedQuantityMilli:999000,acceptedQuantityMilli:999000,assigneeIds:['foreign-employee']},'foreign-task');
   await tx.add('official_payslip',{employeeId:'employee',salary:987654321,bank:SECRET,notes:SECRET},'private-payslip');
   await tx.add('payroll_calculation',{employeeId:'employee',siteId:'site',netCents:987654321,notes:SECRET},'private-payroll');
   await tx.add('media_asset',{employeeId:'employee',siteId:'site',visibility:'CONFIDENTIAL',fileName:SECRET,blobKey:SECRET},'private-finance-media');
   await tx.add('decision',{siteId:'site',ownerId:'owner',status:'OPEN',approvalDomain:'FINANCE',amountCents:987654321,summary:SECRET},'private-finance-decision');
   // Current worker generation stays inside the real eight-day freshness bound;
   // historical DST arithmetic is tested independently through readonly preview.
   const localDay=`${local.year}-${local.month}-${local.day}`,previousDay=new Date(Date.parse(localDay+'T00:00:00Z')-86400000).toISOString().slice(0,10);
   const offset=new Intl.DateTimeFormat('en',{timeZone:'Europe/Berlin',timeZoneName:'longOffset'}).formatToParts(new Date(previousDay+'T12:00:00Z')).find(p=>p.type==='timeZoneName')!.value.replace('GMT','')||'+00:00';
   const startAt=new Date(previousDay+'T12:00:00'+offset).toISOString(),endAt=new Date(Date.parse(startAt)+3600000).toISOString();
   await tx.add('time_segment',{employeeId:'employee',shiftId:'current-synthetic-shift',siteId:'site',activity:'WORKING',startAt,endAt},'current-paid-segment');
   await tx.add('timesheet',{employeeId:'employee',siteId:'site',state:'APPROVED',periodStart:startAt,periodEnd:endAt,paidActivities:['WORKING','SERVICE_TASK'],segmentSnapshot:[{id:'current-paid-segment',siteId:'site',activity:'WORKING',startAt,endAt,seconds:3600}],payableSeconds:3600,approvedBy:'viewer',approvedAt:clock.toISOString(),privateNote:SECRET},'current-timesheet');
  });
  worker=new WorkerRunner(db,engine,{companyId:company,appMode:'TEST',maxAttempts:1,leaseMs:120000,now:()=>clock});await worker.initialize();
  [owner,viewer,employee]=await Promise.all(['owner','viewer','employee'].map(id=>engine.getActor(id,company)));
  const options={companyId:company,appMode:'TEST',publicOrigin:ORIGIN,encryptionKey:'SYNTHETIC_DIGEST_AUTH_KEY_NOT_A_PRODUCTION_SECRET'};
  api=new ApiController({db,engine,...options,buildSha:'0'.repeat(40)});const auth=new AuthService(db,engine,options);
  sessions={};for(const id of ['owner','viewer','employee','client'])sessions[id]=await auth.createSession(id);
 });
 afterEach(()=>{expect(provider).not.toHaveBeenCalled();vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
 afterAll(async()=>{await db?.close();});
 const execute=(actor:Actor,name:string,input:Data,key=randomUUID())=>engine.execute(actor,name,{input,idempotency_key:key});
 const rows=(kind:string)=>db.transaction(company,'SYNTHETIC_DIGEST_READ',tx=>tx.list(kind));
 const row=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_DIGEST_READ',tx=>tx.get(kind,id));
 const update=(kind:string,id:string,patch:Data)=>db.transaction(company,'SYNTHETIC_DIGEST_REVOCATION',async tx=>{const e=await tx.get(kind,id);return tx.save(e,{...e.data,...patch});});
 async function fingerprint(tables=['aggregates','aggregate_revisions','audit_log','command_receipts','outbox','auth_sessions']){
  const result:Record<string,Data>={};for(const table of tables)result[table]=(await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY to_jsonb(r)::text),'')) AS hash FROM ${table} r WHERE company_id=$1`,[company])).rows[0];return result;
 }
 const configure=(kind:'MORNING'|'DAY'|'WEEK'='MORNING',extra:Data={})=>api.command(request(sessions.owner!,'POST'),'digest.configure',{input:{name:'Synthetic scoped '+kind+' digest',kind,ownerId:'owner',scope:{siteIds:['site'],customerIds:[]},cron:kind==='WEEK'?'0 0 * * 1':currentCron,timezone:'Europe/Berlin',channel:'WEB',activeFrom:'2026-03-22T00:00:00.000Z',enabled:true,...extra},idempotency_key:randomUUID()}) as Promise<Entity>;
 const preview=(policy:Entity,at=DAY.end,key=randomUUID())=>api.command(request(sessions.owner!,'POST'),'digest.preview',{input:{policyId:policy.id,at},idempotency_key:key}) as Promise<Data>;
 async function digestJob(policy:Entity):Promise<OutboxJob>{
  await worker.scheduled();const jobs=(await leaseOutbox(db,100,120000,company)).filter(j=>j.type==='digest.requested'&&j.data.policyId===policy.id);
  expect(jobs).toHaveLength(1);expect(jobs[0]!.lease_token).toBeTruthy();return jobs[0]!;
 }
 async function businessFingerprint(){
  return (await db.query("SELECT count(*)::int count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY to_jsonb(r)::text),'')) hash FROM aggregates r WHERE company_id=$1 AND kind NOT IN('digest_policy','operations_digest','notification')",[company])).rows[0];
 }

 it('the canonical statistics source clips the 23-hour Berlin day and 167-hour week in SQL READ ONLY without leaking unrelated finance/site facts',async()=>{
  const before=await fingerprint(),definition=engine.registry['operations.statistics']!;
  async function statistics(period:typeof DAY){return db.transaction(company,'owner',async tx=>{
   expect((await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on');
   const fresh=await engine.actorIn(tx,'owner'),actor=engine.scope(fresh,definition.permission);
   return definition.handler(engine.context(tx,actor,randomUUID(),undefined,'2026-03-30T00:00:00.000Z',['employee'],definition.permission),definition.schema.parse({periodStart:period.start,periodEnd:period.end,siteId:'site'}));
  },10000,true);}
  expect((Date.parse(DAY.end)-Date.parse(DAY.start))/3600000).toBe(23);
  expect((Date.parse(WEEK.end)-Date.parse(WEEK.start))/3600000).toBe(167);
  const day=await statistics(DAY),week=await statistics(WEEK);
  expect(day).toMatchObject({totalSeconds:9300,workSeconds:3600,travelSeconds:3600,breakSeconds:1800,pendingSeconds:300,payableSeconds:null,byUnit:{M2:{reportedQuantityMilli:100000,acceptedQuantityMilli:100000}}});
  expect(week).toMatchObject({totalSeconds:14700,workSeconds:9000,travelSeconds:3600,breakSeconds:1800,pendingSeconds:300,payableSeconds:null});
  expect(JSON.stringify({day,week})).not.toContain(SECRET);expect(day.segmentIds).not.toContain('foreign-segment');
  expect(await fingerprint()).toEqual(before);
 });

 it('cookie/CSRF API configure persists one private policy and preview performs no aggregate/audit/receipt/outbox writes',async()=>{
  const policy=await configure(),before=await fingerprint();expect(policy.kind).toBe('digest_policy');
  const result=await preview(policy);
  expect(result).toMatchObject({policyId:policy.id,policyVersion:policy.data.policyVersion,kind:'MORNING',periodStart:DAY.start,periodEnd:DAY.end,providerInvoked:false,businessEffectsExecuted:false});
  expect(result.sections.time).toMatchObject({status:'AVAILABLE',approvedSeconds:9300,byActivity:{WORKING:3600,ON_BREAK:1800,AWAY_PENDING_REASON:300}});
  const definition=engine.registry['digest.preview']!,readOnlyResult=await db.transaction(company,'owner',async tx=>{
   expect((await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on');const fresh=await engine.actorIn(tx,'owner');
   return definition.handler(engine.context(tx,engine.scope(fresh,definition.permission),randomUUID(),undefined,result.asOf,['employee'],definition.permission),definition.schema.parse({policyId:policy.id,at:DAY.end}));
  },10000,true);
  expect(readOnlyResult).toEqual(result);
  expect(await fingerprint()).toEqual(before);expect(await rows('operations_digest')).toHaveLength(0);
  const visible=await api.entities(request(sessions.owner!),'digest_policy');expect(visible.items.map((e:Entity)=>e.id)).toEqual([policy.id]);
  expect((await api.entities(request(sessions.viewer!),'digest_policy')).items).toEqual([]);
  expect((await api.entities(request(sessions.employee!),'digest_policy')).items).toEqual([]);
 });

 it('preview uses explicit Berlin MORNING/day-cutoff/previous-complete-week periods and only approved clipped seconds',async()=>{
  const morning=await configure('MORNING'),week=await configure('WEEK'),day=await configure('DAY',{cron:'0 18 * * *'});
  const before=await fingerprint(),m=await preview(morning),w=await preview(week),d=await preview(day,'2026-03-29T16:00:00.000Z');
  expect(m).toMatchObject({periodStart:DAY.start,periodEnd:DAY.end,plannedStart:DAY.end,plannedEnd:'2026-03-30T22:00:00.000Z'});
  expect(w).toMatchObject({periodStart:WEEK.start,periodEnd:WEEK.end});
  expect(d).toMatchObject({periodStart:DAY.start,periodEnd:'2026-03-29T16:00:00.000Z'});
  expect(m.sections.time.approvedSeconds).toBe(9300);expect(w.sections.time.approvedSeconds).toBe(14700);expect(d.sections.time.approvedSeconds).toBe(7500);
  expect(m.sections.time.byActivity.WORKING).toBe(3600);expect(w.sections.time.byActivity.WORKING).toBe(9000);expect(d.sections.time.byActivity.WORKING).toBe(1800);
  expect(m.sections.time.basis).toContain('NO_PAYROLL_OR_AUTOMATIC_DEDUCTION');expect(m.sections.time.payableSeconds).toBeUndefined();
  for(const p of [m,w,d]){
   expect(p.sections.travel).toMatchObject({status:'AVAILABLE',approvedRecordedSeconds:3600,tripCount:1});
   expect(p.sections.decisions).toMatchObject({status:'AVAILABLE',financeExcluded:true,count:0,knownActionCents:0});
   expect(JSON.stringify(p)).not.toContain(SECRET);expect(JSON.stringify(p)).not.toContain('private-payslip');expect(JSON.stringify(p)).not.toContain('987654321');
  }
  expect(await fingerprint()).toEqual(before);
 });

 it('actual worker schedules/leases/generates one immutable owner-private digest with no business changes or provider I/O',async()=>{
  const policy=await configure(),before=await businessFingerprint(),job=await digestJob(policy);await worker.process(job);
  expect((await db.query('SELECT status,last_error FROM outbox WHERE company_id=$1 AND id=$2',[company,job.id])).rows[0]).toMatchObject({status:'SUCCEEDED',last_error:null});
  const digests=await rows('operations_digest');expect(digests).toHaveLength(1);expect(digests[0]!.data.snapshot).toMatchObject({policyId:policy.id,kind:'MORNING',providerInvoked:false,businessEffectsExecuted:false});
  expect(digests[0]!.data.immutable).toBe(true);expect(digests[0]!.data.snapshot.sections.time.approvedSeconds).toBe(3600);
  const source=await row('timesheet','current-timesheet');expect(Date.parse(source.data.periodStart)).toBeGreaterThanOrEqual(Date.parse(digests[0]!.data.snapshot.periodStart));expect(Date.parse(source.data.periodEnd)).toBeLessThanOrEqual(Date.parse(digests[0]!.data.snapshot.periodEnd));
  expect(JSON.stringify(digests)).not.toContain(SECRET);expect(await businessFingerprint()).toEqual(before);
  expect((await api.entities(request(sessions.owner!),'operations_digest')).items).toHaveLength(1);
  for(const id of ['viewer','employee','client'])expect((await api.entities(request(sessions[id]!),'operations_digest')).items).toEqual([]);
 });

 it('two worker instances schedule the same Berlin slot once and a fresh genuinely leased retry cannot duplicate the snapshot or owner notification',async()=>{
  const policy=await configure(),otherWorker=new WorkerRunner(db,engine,{...worker.options,now:worker.now});
  await Promise.all([worker.scheduled(),otherWorker.scheduled()]);
  expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='digest.requested' AND data->>'policyId'=$2",[company,policy.id])).rows).toHaveLength(1);
  const job=(await leaseOutbox(db,100,120000,company)).find(j=>j.type==='digest.requested'&&j.data.policyId===policy.id)!;expect(job).toBeDefined();await worker.process(job);
  const first=(await rows('operations_digest'))[0]!,before={digests:await rows('operations_digest'),notifications:await rows('notification'),business:await businessFingerprint()};
  const duplicateId=randomUUID();await db.transaction(company,'SYNTHETIC_DUPLICATE_DIGEST_JOB',tx=>tx.query("INSERT INTO outbox(id,company_id,type,data) VALUES($1,$2,'digest.requested',$3)",[duplicateId,company,JSON.stringify(job.data)]));
  const retried=(await leaseOutbox(db,100,120000,company)).find(j=>j.id===duplicateId)!;expect(retried.lease_token).not.toBe(job.lease_token);await otherWorker.process(retried);
  expect((await db.query('SELECT status FROM outbox WHERE company_id=$1 AND id=$2',[company,retried.id])).rows[0].status).toBe('SUCCEEDED');
  expect(await rows('operations_digest')).toEqual(before.digests);expect((await rows('operations_digest'))[0]!.id).toBe(first.id);expect(await rows('notification')).toEqual(before.notifications);expect(await businessFingerprint()).toEqual(before.business);
 });

 it('two real worker instances across the repeated Berlin autumn 02:30 slot schedule only one job and readonly preview exposes the correct 25-hour plan day',async()=>{
  const policy=await configure('MORNING',{cron:'30 2 * * *',activeFrom:'2025-10-20T00:00:00.000Z'});
  const firstWorker=new WorkerRunner(db,engine,{...worker.options,now:()=>new Date('2025-10-26T00:30:00.000Z')}),repeatedWorker=new WorkerRunner(db,engine,{...worker.options,now:()=>new Date('2025-10-26T01:30:00.000Z')});
  await firstWorker.scheduled();await repeatedWorker.scheduled();
  const requested=(await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='digest.requested' AND data->>'policyId'=$2",[company,policy.id])).rows;
  expect(requested).toHaveLength(1);const snapshot=await preview(policy,'2025-10-26T00:30:00.000Z');
  expect(snapshot.slotKey).toBe('2025-10-26:02:30');expect((Date.parse(snapshot.plannedEnd)-Date.parse(snapshot.plannedStart))/3600000).toBe(25);
  expect(await rows('operations_digest')).toHaveLength(0);
 });

 it.each(['inactive','site','role'] as const)('fresh owner %s revocation fences a previously leased digest and hides private policy/history from authenticated stale sessions',async(change)=>{
  const policy=await configure(),job=await digestJob(policy);
  await update('user','owner',change==='inactive'?{active:false}:change==='site'?{siteIds:[]}:{roles:['EMPLOYEE'],permissions:[]});
  const before=await businessFingerprint();await expect(worker.handle(job)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(await rows('operations_digest')).toHaveLength(0);expect(await rows('notification')).toHaveLength(0);expect(await businessFingerprint()).toEqual(before);
  if(change==='inactive')await expect(api.entities(request(sessions.owner!),'digest_policy')).rejects.toMatchObject({code:'ACCESS_DENIED'});
  else expect((await api.entities(request(sessions.owner!),'digest_policy')).items).toEqual([]);
  await expect(preview(policy)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });

 it('expired and replaced real SQL leases cannot generate a digest or persist an idempotent success',async()=>{
  // Releasing an expired lease consumes a second attempt. The default fixture
  // deliberately permits only one; this recovery scenario explicitly permits
  // two without changing any lease, identity or command-effect guards.
  const retryWorker=new WorkerRunner(db,engine,{...worker.options,maxAttempts:2,now:worker.now});
  const policy=await configure(),job=await digestJob(policy),before=await businessFingerprint();
  const digestReceipts=async()=>(await db.query("SELECT command,result FROM command_receipts WHERE company_id=$1 AND command='digest.generate'",[company])).rows;
  expect(job.attempts).toBe(1);
  await db.query("UPDATE outbox SET leased_until=clock_timestamp()-interval '1 second' WHERE company_id=$1 AND id=$2",[company,job.id]);
  await expect(retryWorker.handle(job)).rejects.toMatchObject({code:'WORKER_LEASE_LOST'});expect(await rows('operations_digest')).toHaveLength(0);expect(await digestReceipts()).toEqual([]);
  const current=(await leaseOutbox(db,100,120000,company)).find(j=>j.id===job.id)!;expect(current.lease_token).not.toBe(job.lease_token);expect(current.attempts).toBe(2);
  await expect(retryWorker.handle(job)).rejects.toMatchObject({code:'WORKER_LEASE_LOST'});expect(await rows('notification')).toHaveLength(0);expect(await digestReceipts()).toEqual([]);
  await retryWorker.process(current);
  expect((await db.query('SELECT status,last_error,attempts FROM outbox WHERE company_id=$1 AND id=$2',[company,current.id])).rows[0]).toMatchObject({status:'SUCCEEDED',last_error:null,attempts:2});
  const digests=await rows('operations_digest');expect(digests).toHaveLength(1);expect(await rows('notification')).toHaveLength(1);expect(await digestReceipts()).toMatchObject([{command:'digest.generate',result:{id:digests[0]!.id,kind:'operations_digest'}}]);
  await expect(retryWorker.handle(job)).rejects.toMatchObject({code:'WORKER_LEASE_LOST'});expect(await rows('operations_digest')).toEqual(digests);expect(await digestReceipts()).toHaveLength(1);expect(await businessFingerprint()).toEqual(before);
 });

 it('already generated immutable history becomes private-inaccessible after source rights change, and repeated preview recomputes UNAVAILABLE instead of cached hours',async()=>{
  const policy=await configure(),previewKey=randomUUID(),initial=await preview(policy,DAY.end,previewKey),job=await digestJob(policy);await worker.process(job);
  expect(initial.sections.time.approvedSeconds).toBe(9300);expect((await api.entities(request(sessions.owner!),'operations_digest')).items).toHaveLength(1);
  await update('user','owner',{roles:['DISPATCHER'],permissions:['notifications.manage']});
  const before=await fingerprint();expect((await api.entities(request(sessions.owner!),'operations_digest')).items).toEqual([]);
  const reduced=await preview(policy,DAY.end,previewKey);expect(reduced.sections.time).toMatchObject({status:'UNAVAILABLE',reason:'CURRENT_CAPABILITY_UNAVAILABLE'});
  expect(reduced.sections.time.approvedSeconds).toBeUndefined();expect(JSON.stringify(reduced)).not.toContain(SECRET);expect(await fingerprint()).toEqual(before);
  expect((await rows('operations_digest'))[0]!.data.snapshot.sections.time.approvedSeconds).toBe(3600);
 });

 it('immutable digest history is hidden after its linked rework source changes while the accepted original and old snapshot stay intact',async()=>{
  const accepted=await row('task','task'),rework=await execute(viewer,'task.reopen',{taskId:accepted.id,reason:'Synthetic approved remediation source'});
  const policy=await configure(),job=await digestJob(policy);await worker.process(job);const original=(await rows('operations_digest'))[0]!;
  await execute(employee,'task.start',{taskId:rework.id});
  const before=await fingerprint();expect((await api.entities(request(sessions.owner!),'operations_digest')).items).toEqual([]);
  expect(await row('task',accepted.id)).toEqual(accepted);expect((await row('task',rework.id)).data).toMatchObject({state:'IN_PROGRESS',completionKind:'REWORK',sourceTaskId:accepted.id,billingScope:'INTERNAL'});
  expect(await row('operations_digest',original.id)).toEqual(original);expect(await fingerprint()).toEqual(before);
 });

 it('canonical generation failure rolls digest/notification/revisions/receipt/audit/outbox effects back in one PostgreSQL transaction',async()=>{
  const policy=await configure(),job=await digestJob(policy),definition=engine.registry['digest.generate']!,original=definition.handler;
  engine.registry['digest.generate']={...definition,handler:async(ctx,args)=>{await original(ctx,args);throw new DomainError('SYNTHETIC_DIGEST_ROLLBACK');}};
  const before=await fingerprint();await expect(worker.handle(job)).rejects.toMatchObject({code:'SYNTHETIC_DIGEST_ROLLBACK'});
  expect(await fingerprint()).toEqual(before);expect(await rows('operations_digest')).toHaveLength(0);expect(await rows('notification')).toHaveLength(0);
 });

 it('forged employee configuration/site escalation and another authorized operator private preview are denied with every effect rolled back',async()=>{
  const policy=await configure(),before=await fingerprint();
  await expect(api.command(request(sessions.employee!,'POST'),'digest.configure',{input:{name:'Forbidden employee digest',kind:'MORNING',ownerId:'employee',scope:{siteIds:['site'],customerIds:[]},cron:'0 0 * * *'},idempotency_key:randomUUID()})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(configure('MORNING',{scope:{siteIds:['foreign-site'],customerIds:[]}})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(api.command(request(sessions.viewer!,'POST'),'digest.preview',{input:{policyId:policy.id,at:DAY.end},idempotency_key:randomUUID()})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(await fingerprint()).toEqual(before);
 });

 it('a transport service without a real digest lease cannot mint a snapshot or a receipt, and bad CSRF cannot use the private preview',async()=>{
  const policy=await configure(),before=await fingerprint(),service=await engine.getActor(serviceId,company);
  await expect(execute(service,'digest.generate',{policyId:policy.id,policyVersion:policy.version,slotAt:DAY.end})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const invalid=request({...sessions.owner!,csrfToken:'SYNTHETIC_INVALID_CSRF'},'POST');
  await expect(api.command(invalid,'digest.preview',{input:{policyId:policy.id,at:DAY.end},idempotency_key:randomUUID()})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(await fingerprint()).toEqual(before);expect(await rows('operations_digest')).toHaveLength(0);
 });

 it('current trip dispute, approved closed-period adjustment and in-period rework facts invalidate old history and are recomputed without changing accepted originals',async()=>{
  const timesheet=await row('timesheet','current-timesheet'),segment=timesheet.data.segmentSnapshot[0],travelStart=new Date(Date.parse(segment.endAt)+3600000).toISOString(),travelEnd=new Date(Date.parse(travelStart)+1800000).toISOString();
  await db.transaction(company,'SYNTHETIC_CURRENT_APPROVED_TRIP',async tx=>{
   await tx.add('trip',{employeeId:'employee',siteId:'site',shiftId:'current-synthetic-shift',origin:{kind:'SITE',id:'site'},destination:{kind:'SITE',id:'site'},state:'ARRIVED',approvalState:'APPROVED',startAt:travelStart,endAt:travelEnd,paidSeconds:1800},'current-trip');
   await tx.add('trip_approval',{tripId:'current-trip',employeeId:'employee',siteId:'site',decision:'APPROVE',approvedBy:'viewer',approvedAt:clock.toISOString(),segmentSnapshot:[{id:'current-travel',siteId:'site',activity:'TRAVELLING',startAt:travelStart,endAt:travelEnd,seconds:1800}]},'current-trip-approval');
  });
  const policy=await configure(),initial=await preview(policy,clock.toISOString()),job=await digestJob(policy);await worker.process(job);
  expect(initial.sections.time).toMatchObject({approvedSeconds:3600,byActivity:{WORKING:3600}});expect(initial.sections.travel).toMatchObject({approvedRecordedSeconds:1800,tripCount:1});
  expect(initial.sections.tasks.periodProgress.byUnit).toEqual({});
  const original=(await rows('operations_digest'))[0]!,accepted=await row('task','task');expect((await api.entities(request(sessions.owner!),'operations_digest')).items).toHaveLength(1);
  const rework=await execute(viewer,'task.reopen',{taskId:accepted.id,reason:'Synthetic separate remediation after completed acceptance'});
  const reportAt=new Date(Date.parse(segment.startAt)+600000).toISOString(),submittedAt=new Date(Date.parse(segment.startAt)+1200000).toISOString();
  await db.transaction(company,'SYNTHETIC_APPROVED_FACT_CHANGES',async tx=>{
   await tx.add('timesheet_adjustment',{timesheetId:timesheet.id,employeeId:'employee',siteId:'site',state:'APPROVED',sequence:1,approvedBy:'viewer',approvedAt:clock.toISOString(),proposedSnapshots:[{...segment,activity:'SERVICE_TASK',siteId:'site',taskId:null,tripId:null}],deltaPayableSeconds:0,reason:SECRET},'approved-time-adjustment');
   // Historical reporting fixtures belong to the linked REWORK; V4 never rewinds the accepted source.
   await tx.add('worklog',{taskId:rework.id,siteId:'site',unit:'M2',quantityMilli:120000,employeeIds:['employee'],reportedAt:reportAt},'current-worklog');
   const currentRework=await tx.get('task',rework.id);await tx.save(currentRework,{...currentRework.data,state:'SUBMITTED_FOR_REVIEW',reportedQuantityMilli:120000,submittedBy:'employee',submittedAt});
   const trip=await tx.get('trip','current-trip');await tx.save(trip,{...trip.data,approvalState:'DISPUTED'});
   await tx.add('trip_approval',{tripId:trip.id,employeeId:'employee',siteId:'site',decision:'DISPUTE',approvedBy:'viewer',approvedAt:new Date(clock.getTime()+1).toISOString(),reason:SECRET},'late-trip-dispute');
  });
  const before=await fingerprint();expect((await api.entities(request(sessions.owner!),'operations_digest')).items).toEqual([]);
  const refreshed=await preview(policy,clock.toISOString());
  expect(refreshed.sections.time).toMatchObject({approvedSeconds:3600,byActivity:{SERVICE_TASK:3600}});expect(refreshed.sections.time.byActivity.WORKING).toBeUndefined();expect(refreshed.sections.time.payableSeconds).toBeUndefined();
  expect(refreshed.sections.travel).toMatchObject({approvedRecordedSeconds:0,tripCount:0});
  expect(refreshed.sections.tasks).toMatchObject({counts:{accepted:1,submitted:1,incomplete:0},byUnit:{M2:{acceptedQuantityMilli:100000}},periodProgress:{counts:{worklogs:1,acceptedReviews:0,reopenedReviews:0},byUnit:{M2:{reportedQuantityMilli:120000,grossAcceptedQuantityMilli:0,revokedAcceptedQuantityMilli:0,acceptedQuantityMilli:0}}}});
  expect(refreshed.coverage.timesheetAdjustmentSets.find((set:Data)=>set.timesheetId===timesheet.id).adjustments).toEqual([{id:'approved-time-adjustment',version:1}]);
  expect(JSON.stringify(refreshed)).not.toContain(SECRET);expect(await fingerprint()).toEqual(before);expect(await row('operations_digest',original.id)).toEqual(original);
  expect(await row('task',accepted.id)).toEqual(accepted);expect((await row('task',rework.id)).data).toMatchObject({state:'SUBMITTED_FOR_REVIEW',completionKind:'REWORK',sourceTaskId:accepted.id,billingScope:'INTERNAL',acceptedQuantityMilli:0});
  expect((await row('timesheet',timesheet.id)).data).toEqual(timesheet.data);
  const duplicateId=randomUUID();await db.transaction(company,'SYNTHETIC_REPLAY_AFTER_DISPUTE',tx=>tx.query("INSERT INTO outbox(id,company_id,type,data) VALUES($1,$2,'digest.requested',$3)",[duplicateId,company,JSON.stringify(job.data)]));
  const retry=(await leaseOutbox(db,100,120000,company)).find(item=>item.id===duplicateId)!;
  await expect(worker.handle(retry)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await rows('operations_digest')).toEqual([original]);
 });

 it('retains actual PostgreSQL legacy ACCEPT/REOPEN ledger arithmetic without rewriting accepted originals or counting period-end reversals',async()=>{
  const accepted=await row('task','task'),policy=await configure(),initial=await preview(policy,clock.toISOString());
  const originalRevisions=(await db.query('SELECT version,data FROM aggregate_revisions WHERE company_id=$1 AND kind=$2 AND id=$3 ORDER BY version',[company,'task',accepted.id])).rows;
  expect(initial.sections.tasks.periodProgress.byUnit).toEqual({});
  const segment=(await row('timesheet','current-timesheet')).data.segmentSnapshot[0];
  const at=(minutes:number)=>new Date(Date.parse(segment.startAt)+minutes*60000).toISOString();
  // Explicit migrated-history fixture: the legacy task is already nonterminal.
  // Append historical facts only; never UPDATE an ACCEPTED task or disable its SQL guard.
  const history=await db.transaction(company,'SYNTHETIC_LEGACY_DIGEST_LEDGER',async tx=>{
   const task=await tx.add('task',{siteId:'site',title:'Synthetic retained legacy review history',state:'REOPENED',unit:'M2',plannedQuantityMilli:100000,reportedQuantityMilli:0,acceptedQuantityMilli:0,assigneeIds:['employee'],completionKind:'ORIGINAL',billingScope:'CONTRACT',reviewCycle:2,checklist:[],dependencyIds:[],requiredPhotoCount:0,synthetic:true,legacyHistoryFixture:true},'legacy-ledger-task');
   const facts:Entity[]=[];
   for(const [suffix,quantityMilli,reportMinute,acceptMinute] of [['first',100000,5,10],['second',60000,25,30]] as const){
    const log=await tx.add('worklog',{taskId:task.id,siteId:'site',unit:'M2',quantityMilli,employeeIds:['employee'],reportedAt:at(reportMinute),description:SECRET},'legacy-worklog-'+suffix);
    const review=await tx.add('task_review',{taskId:task.id,siteId:'site',decision:'ACCEPT',quantityMilli,reviewedAt:at(acceptMinute),reviewedBy:'viewer',snapshot:{siteId:'site',unit:'M2',assigneeIds:['employee']},worklogIds:[log.id],reason:SECRET},'legacy-accept-'+suffix);
    facts.push(log,review);
   }
   const reopened=await tx.add('task_review',{taskId:task.id,siteId:'site',decision:'REOPEN',reviewedAt:at(20),reviewedBy:'viewer',snapshot:{siteId:'site',unit:'M2',acceptedQuantityMilli:100000,assigneeIds:['employee']},reason:SECRET},'legacy-reopen-in-period');
   const outside=await tx.add('task_review',{taskId:task.id,siteId:'site',decision:'REOPEN',reviewedAt:initial.periodEnd,reviewedBy:'viewer',snapshot:{siteId:'site',unit:'M2',acceptedQuantityMilli:60000,assigneeIds:['employee']},reason:SECRET},'legacy-reopen-at-period-end');
   return {task,facts:[...facts,reopened],outside};
  });
  const before=await fingerprint(),result=await preview(policy,clock.toISOString());
  expect(result.sections.tasks).toMatchObject({counts:{accepted:1,submitted:0,incomplete:1},byUnit:{M2:{acceptedQuantityMilli:100000}},periodProgress:{counts:{worklogs:2,acceptedReviews:2,reopenedReviews:1},byUnit:{M2:{reportedQuantityMilli:160000,grossAcceptedQuantityMilli:160000,revokedAcceptedQuantityMilli:100000,acceptedQuantityMilli:60000}}}});
  for(const fact of history.facts)expect(result.coverage.sourceReferences).toContainEqual({kind:fact.kind,id:fact.id,version:fact.version,permission:'task.read'});
  expect(result.coverage.sourceReferences.map((reference:Data)=>reference.id)).not.toContain(history.outside.id);
  expect(await row('task',accepted.id)).toEqual(accepted);expect(await row('task',history.task.id)).toEqual(history.task);
  expect((await db.query('SELECT version,data FROM aggregate_revisions WHERE company_id=$1 AND kind=$2 AND id=$3 ORDER BY version',[company,'task',accepted.id])).rows).toEqual(originalRevisions);
  expect(JSON.stringify(result)).not.toContain(SECRET);expect(await fingerprint()).toEqual(before);
 });
});
