import {afterAll,afterEach,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Request} from 'express';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {ApiController} from '../apps/api/http.ts';
import {v4HttpError} from '../apps/api/v4-rest.ts';
import {PHOTO_BYTE_LIMIT,PDF_BYTE_LIMIT} from '../packages/storage/media-limits.ts';
import type {Actor,Data,Entity} from '../packages/domain/core.ts';

// Actual PostgreSQL and Engine; controller actor/header are explicit transport fixtures.
// Each case uses a distinct tenant; no table truncation/global deletion occurs.
const realPostgres=process.env.DATABASE_URL?describe:describe.skip;
realPostgres('V4 root core PostgreSQL contracts and keyset authorization',()=>{
 let db:Database,engine:Engine,company:string,reviewer:Actor,worker:Actor,accountant:Actor,outsider:Actor;
 const ids={reviewer:'core-reviewer',worker:'core-worker',accountant:'core-accountant',outsider:'core-other-worker'};
 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
  company='qa-v4-core-'+randomUUID();
  await db.transaction(company,'SYNTHETIC_CORE_FIXTURE',async tx=>{
   await tx.add('company',{legalName:'Synthetic KNABA core contract GmbH',address:'Synthetic Berlin',synthetic:true},company);
   await tx.add('site',{name:'Allowed synthetic site',active:true},'site-a');await tx.add('site',{name:'Private other crew site',active:true},'site-b');
   await tx.add('user',{name:'Scoped synthetic internal reviewer',active:true,roles:['INTERNAL_BAULEITER'],siteIds:['site-a'],permissions:['operations.read']},ids.reviewer);
   await tx.add('user',{name:'Synthetic assigned employee',active:true,roles:['EMPLOYEE'],siteIds:['site-a'],permissions:[]},ids.worker);
   await tx.add('user',{name:'Synthetic finance actor',active:true,roles:['ACCOUNTANT'],siteIds:['site-a'],permissions:[]},ids.accountant);
   await tx.add('user',{name:'Synthetic other crew',active:true,roles:['EMPLOYEE'],siteIds:['site-b'],permissions:[]},ids.outsider);
  });
  [reviewer,worker,accountant,outsider]=await Promise.all(Object.values(ids).map(id=>engine.getActor(id,company)));
 });
 afterEach(()=>vi.restoreAllMocks());
 afterAll(async()=>{await db?.close();});
 const call=(actor:Actor,name:string,input:Data,key:string=randomUUID(),version?:number)=>engine.execute(actor,name,{input,idempotency_key:key,expected_version:version});
 const list=(kind:string)=>db.transaction(company,'SYNTHETIC_CORE_ASSERT',tx=>tx.list(kind));
 const get=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_CORE_ASSERT',tx=>tx.get(kind,id));
 async function accepted(){return db.transaction(company,'SYNTHETIC_CORE_FIXTURE',tx=>tx.add('task',{siteId:'site-a',title:'Synthetic accepted100m2',state:'ACCEPTED',completionKind:'ORIGINAL',billingScope:'CONTRACT',unit:'M2',plannedQuantityMilli:100000,reportedQuantityMilli:100000,acceptedQuantityMilli:100000,assigneeIds:[ids.worker],reviewCycle:1,requiredPhotoCount:0,checklist:[],dependencyIds:[],locationSnapshot:[],submittedBy:ids.worker,submittedAt:'2026-10-07T11:00:00.000Z',reviewedBy:ids.reviewer,reviewedAt:'2026-10-07T12:00:00.000Z'},'accepted-original'));}
 function controllerFor(actor:Actor){const controller=new ApiController({companyId:company,appMode:'TEST',db,engine,buildSha:'shared-working-tree-core-candidate',encryptionKey:'synthetic-core-test-key-at-least32characters'});(controller as any).actor=async()=>({actor});return controller;}
 const page=(controller:ApiController,query:Data={})=>controller.entities({query} as unknown as Request,'task');
 async function tiedRows(publicCount=104,privateCount=25){
  const createdAt=new Date(Date.now()-2000).toISOString(),ids=[...Array.from({length:publicCount},(_,i)=>'public-'+String(i).padStart(3,'0')),'Z','é','\uE000','\u{10000}'];
  await db.transaction(company,'SYNTHETIC_KEYSET_FIXTURE',async tx=>{
   for(const [index,id]of ids.entries())await tx.query('INSERT INTO aggregates(company_id,kind,id,data,created_at,updated_at) VALUES($1,$2,$3,$4,$5::timestamptz+($6::int*interval \'1 microsecond\'),$5::timestamptz)',[company,'task',id,{siteId:'site-a',title:'Allowed '+id,state:'DRAFT',completionKind:'ORIGINAL'},createdAt,index%2?900:100]);
   for(let index=0;index<privateCount;index++)await tx.query('INSERT INTO aggregates(company_id,kind,id,data,created_at,updated_at) VALUES($1,$2,$3,$4,$5::timestamptz,$5::timestamptz)',[company,'task','private-'+String(index).padStart(3,'0'),{siteId:'site-b',title:'PRIVATE_CREW_MARKER',state:'DRAFT'},createdAt]);
   await tx.query('INSERT INTO aggregates(company_id,kind,id,data,created_at,updated_at) VALUES($1,$2,$3,$4,$5::timestamptz,$5::timestamptz)',[company+'-foreign','task','public-000',{siteId:'site-a',title:'FOREIGN_TENANT_MARKER',state:'DRAFT'},createdAt]);
  });return {createdAt,expected:[...ids].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)))};
 }

 it('AC-21 actual accepted reopen/replay creates linked remediation while original data/version/audit revisions stay unchanged',async()=>{
  const original=await accepted(),beforeRevision=(await db.query('SELECT version,data FROM aggregate_revisions WHERE company_id=$1 AND kind=$2 AND id=$3',[company,'task',original.id])).rows,key=randomUUID(),input={taskId:original.id,reason:'Synthetic verified defect requires separate work'};const rework=await call(reviewer,'task.reopen',input,key,original.version);expect(await call(reviewer,'task.reopen',input,key,original.version)).toEqual(rework);expect(await get('task',original.id)).toEqual(original);expect((await db.query('SELECT version,data FROM aggregate_revisions WHERE company_id=$1 AND kind=$2 AND id=$3',[company,'task',original.id])).rows).toEqual(beforeRevision);expect(rework.data).toMatchObject({completionKind:'REWORK',billingScope:'INTERNAL',sourceTaskId:original.id,acceptedQuantityMilli:0,state:'ASSIGNED'});expect(await list('defect')).toHaveLength(1);expect(await list('rework_link')).toHaveLength(1);expect((await db.query('SELECT id FROM outbox WHERE company_id=$1 AND type=$2',[company,'defect.rework_created'])).rows).toHaveLength(1);
 });
 it('accepting the separate rework closes the defect but keeps original accepted quantity once in progress',async()=>{
  const original=await accepted(),rework=await call(reviewer,'task.reopen',{taskId:original.id,reason:'Synthetic remediation cycle'});await call(worker,'task.start',{taskId:rework.id});await call(worker,'task.worklog',{taskId:rework.id,quantityMilli:100000,description:'Actual synthetic remedial100m2'});await call(worker,'task.submit',{taskId:rework.id});await call(reviewer,'task.review',{taskId:rework.id,decision:'ACCEPT'});expect(await get('task',original.id)).toEqual(original);expect((await get('task',rework.id)).data.state).toBe('ACCEPTED');expect((await list('defect'))[0]!.data.state).toBe('CLOSED');expect(await call(reviewer,'task.progress',{siteId:'site-a'})).toMatchObject({tasks:1,byUnit:{M2:{plannedQuantityMilli:100000,acceptedQuantityMilli:100000,taskIds:[original.id],acceptedRatio:1}}});
 });
 it('maximum valid200-character idempotency key does not prevent accepted source remediation',async()=>{
  const original=await accepted(),rework=await call(reviewer,'task.reopen',{taskId:original.id,reason:'Maximum valid transport key'},'k'.repeat(200),original.version);expect(rework.data.sourceTaskId).toBe(original.id);expect(await get('task',original.id)).toEqual(original);expect(await list('defect')).toHaveLength(1);
 });
 it('actual PRODUCTION high-risk command denies expired cached MFA actor and cached receipt replay after10minutes',async()=>{
  const production=new Engine(db,'PRODUCTION'),now=Date.now(),clock=vi.spyOn(Date,'now').mockReturnValue(now),actor={...accountant,mfaVerified:true,mfaVerifiedAt:new Date(now).toISOString()},key=randomUUID(),input={employeeId:ids.worker,type:'HOURLY',rateCents:2000,effectiveAt:'2026-01-01T00:00:00.000Z',reason:'Synthetic privileged source command'};await production.execute(actor,'payroll.rate',{input,idempotency_key:key});clock.mockReturnValue(now+600001);await expect(production.execute(actor,'payroll.rate',{input,idempotency_key:key})).rejects.toMatchObject({code:'NEEDS_REAUTH'});await expect(production.execute({...actor,mfaVerifiedAt:undefined},'payroll.rate',{input:{...input,effectiveAt:'2026-02-01T00:00:00.000Z'},idempotency_key:randomUUID()})).rejects.toMatchObject({code:'NEEDS_REAUTH'});expect(await list('rate_history')).toHaveLength(1);expect((await db.query('SELECT command FROM command_receipts WHERE company_id=$1 AND command=$2',[company,'payroll.rate'])).rows).toHaveLength(1);
 });
 it('SQL rejects UPDATE and DELETE for every protected append-only business fact without rewriting snapshots or revisions',async()=>{
  const kinds=['rate_history','payout_receipt','payout_reconciliation','payout_reversal','payout_allocation','official_payslip','payroll_calculation_revision','payroll_approval','payroll_lock','quote_acceptance','measurement_verification','integration_decision'];
  const facts=await db.transaction(company,'SYNTHETIC_IMMUTABLE_FIXTURE',async tx=>{const rows:Entity[]=[];for(const kind of kinds)rows.push(await tx.add(kind,{employeeId:ids.worker,immutable:true,synthetic:true,sourceReference:'synthetic-fact-'+kind,quoteId:kind==='quote_acceptance'?'synthetic-quote':undefined,quoteVersion:kind==='quote_acceptance'?1:undefined},kind+'-fact'));return rows;});
  for(const fact of facts){await expect(db.query('UPDATE aggregates SET data=data||$4::jsonb,version=version+1 WHERE company_id=$1 AND kind=$2 AND id=$3',[company,fact.kind,fact.id,{syntheticTampered:true}])).rejects.toThrow('KNABA_IMMUTABLE_BUSINESS_FACT');await expect(db.query('DELETE FROM aggregates WHERE company_id=$1 AND kind=$2 AND id=$3',[company,fact.kind,fact.id])).rejects.toThrow('KNABA_IMMUTABLE_BUSINESS_FACT');expect(await get(fact.kind,fact.id)).toEqual(fact);expect((await db.query('SELECT version,data FROM aggregate_revisions WHERE company_id=$1 AND kind=$2 AND id=$3',[company,fact.kind,fact.id])).rows).toEqual([{version:1,data:fact.data}]);}
 });
 it('SQL accepted-task history cannot be updated/deleted, while ordinary draft transitions remain usable',async()=>{
  const original=await accepted();await expect(db.query('UPDATE aggregates SET data=data||$4::jsonb WHERE company_id=$1 AND kind=$2 AND id=$3',[company,'task',original.id,{state:'REOPENED',acceptedQuantityMilli:0}])).rejects.toThrow('KNABA_IMMUTABLE_BUSINESS_FACT');await expect(db.query('DELETE FROM aggregates WHERE company_id=$1 AND kind=$2 AND id=$3',[company,'task',original.id])).rejects.toThrow('KNABA_IMMUTABLE_BUSINESS_FACT');expect(await get('task',original.id)).toEqual(original);const draft=await db.transaction(company,'SYNTHETIC_CORE_FIXTURE',tx=>tx.add('task',{siteId:'site-a',state:'DRAFT',synthetic:true},'ordinary-draft'));const changed=await db.transaction(company,'SYNTHETIC_CORE_FIXTURE',tx=>tx.save(draft,{...draft.data,state:'ASSIGNED'}));expect(changed.version).toBe(2);expect(changed.data.state).toBe('ASSIGNED');
 });
 it('real keyset default50/max100 uses same-millisecond C order and excludes private/foreign records before page counts',async()=>{
  const fixture=await tiedRows(),controller=controllerFor(reviewer);let response=await page(controller),seen=response.items.map((row:Entity)=>row.id);expect(response.limit).toBe(50);expect(response.items).toHaveLength(50);expect(response.has_more).toBe(true);while(response.next_cursor){response=await page(controller,{cursor:response.next_cursor});seen.push(...response.items.map((row:Entity)=>row.id));}expect(seen).toEqual(fixture.expected);expect(new Set(seen).size).toBe(fixture.expected.length);expect(JSON.stringify(response)).not.toMatch(/PRIVATE_CREW_MARKER|FOREIGN_TENANT_MARKER/);const max=await page(controller,{limit:'100'});expect(max.items).toHaveLength(100);expect(max.limit).toBe(100);await expect(page(controller,{limit:'101'})).rejects.toThrow();
 });
 it('each page rechecks site access for a stale actor after revocation and keeps signed cursors bound to actor/company',async()=>{
  await tiedRows();const controller=controllerFor(reviewer),first=await page(controller);expect(first.next_cursor).toBeTruthy();await expect(page(controllerFor(outsider),{cursor:first.next_cursor})).rejects.toMatchObject({code:'VALIDATION_ERROR',details:{reason:'CURSOR_SCOPE_MISMATCH'}});await db.transaction(company,'SYNTHETIC_ACCESS_REVOCATION',async tx=>{const user=await tx.get('user',ids.reviewer);await tx.save(user,{...user.data,siteIds:[]});});const after=await page(controller,{cursor:first.next_cursor});expect(after.items).toEqual([]);expect(after.has_more).toBe(false);expect(after.next_cursor).toBeNull();
 });
 it('private and absent preconditions yield the same404 with no version details or effects, while visible stale source gives conflict',async()=>{
  const privateTask=await db.transaction(company,'SYNTHETIC_PRIVATE_FIXTURE',tx=>tx.add('task',{siteId:'site-b',state:'DRAFT',title:'Private source secret'},'private-task'));
  for(const id of [privateTask.id,'nonexistent-private-task']){let error:unknown;try{await engine.execute(reviewer,'task.create',{input:{siteId:'site-a',title:'Public intended task'},idempotency_key:randomUUID(),preconditions:[{kind:'task',id,version:999}]});}catch(caught){error=caught;}expect(error).toMatchObject({code:'NOT_FOUND_SAFE'});expect(v4HttpError(error)).toEqual({status:404,body:{code:'NOT_FOUND_SAFE',details:{}}});}
  expect((await list('task')).map(t=>t.id)).toEqual(['private-task']);expect((await db.query('SELECT command FROM command_receipts WHERE company_id=$1',[company])).rows).toEqual([]);expect((await db.query('SELECT id FROM outbox WHERE company_id=$1',[company])).rows).toEqual([]);const visible=await db.transaction(company,'SYNTHETIC_VISIBLE_FIXTURE',tx=>tx.add('task',{siteId:'site-a',state:'DRAFT',title:'Visible source'},'visible-source'));await expect(engine.execute(reviewer,'task.create',{input:{siteId:'site-a',title:'Stale visible guard'},idempotency_key:randomUUID(),preconditions:[{kind:'task',id:visible.id,version:visible.version+1}]})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
 });
 it('oversized actual controller media ingress writes neither PostgreSQL blobs/uploads nor outbox',async()=>{
  const controller=controllerFor(worker);for(const [mimeType,size]of [['image/png',PHOTO_BYTE_LIMIT+1],['application/pdf',PDF_BYTE_LIMIT+1]] as const)await expect(controller.upload({} as Request,{base64:Buffer.alloc(size).toString('base64'),mimeType,fileName:'synthetic-over-limit'})).rejects.toMatchObject({code:'MEDIA_TOO_LARGE'});expect(await list('media_upload')).toEqual([]);expect((await db.query('SELECT id FROM media_blobs WHERE company_id=$1',[company])).rows).toEqual([]);expect((await db.query('SELECT id FROM outbox WHERE company_id=$1',[company])).rows).toEqual([]);
 });
});
