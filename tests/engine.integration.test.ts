import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,type PgTransaction} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {DomainError,type Actor,type Data,type Entity} from '../packages/domain/core.ts';
import {seed} from '../infra/seed.ts';

// A real PostgreSQL suite: every test creates a unique tenant and retains immutable
// audit history. No shared seed, production record, or trigger is deleted.
const integration=process.env.DATABASE_URL?describe:describe.skip;
integration('PostgreSQL command transaction and read authorization',()=>{
 let db:Database,engine:Engine,company:string,owner:Actor,worker:Actor,client:Actor,bot:Actor;
 const ids={owner:'qa-owner',worker:'qa-worker',client:'qa-client',bot:'qa-bot',reviewer:'qa-reviewer',customer:'qa-customer',site:'qa-site-a',otherSite:'qa-site-b',warehouse:'qa-warehouse',material:'qa-material'};
 const call=(a:Actor,name:string,input:Data,key=randomUUID(),version?:number)=>engine.execute(a,name,{input,idempotency_key:key,expected_version:version});
 const list=(kind:string)=>db.transaction(company,ids.owner,tx=>tx.list(kind));
 const add=(kind:string,data:Data,id?:string)=>db.transaction(company,ids.owner,tx=>tx.add(kind,data,id));
 beforeAll(async()=>{db=new Database();await db.query('SELECT 1');engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
  company=`qa-${randomUUID()}`;
  await db.transaction(company,'QA_FIXTURE',async tx=>{
   await tx.add('company',{legalName:'Synthetic QA GmbH',address:'Teststrasse 1, Berlin',synthetic:true},company);
   await tx.add('customer',{name:'Synthetic customer',address:'Berlin'},ids.customer);
   await tx.add('site',{code:'QA-A',name:'Permitted QA site',address:'Synthetic address A',customerId:ids.customer,active:true},ids.site);
   await tx.add('site',{code:'QA-B',name:'Restricted QA site',address:'Synthetic address B',customerId:ids.customer,active:true},ids.otherSite);
   await tx.add('user',{name:'QA owner',roles:['OWNER'],active:true,siteIds:[ids.site,ids.otherSite],permissions:['inventory.manage','inventory.reserve','chat.manage','chat.write','chat.read','report.create','report.review','report.approve','report.publish']},ids.owner);
   await tx.add('user',{name:'QA employee',roles:['EMPLOYEE'],active:true,siteIds:[ids.site]},ids.worker);
   await tx.add('user',{name:'QA client',roles:['CLIENT'],active:true,siteIds:[],customerIds:[]},ids.client);
   await tx.add('user',{name:'QA bot admin',roles:['BOT_ADMIN'],active:true,siteIds:[ids.site]},ids.bot);
   await tx.add('user',{name:'QA reviewer',roles:['DIRECTOR'],active:true,siteIds:[ids.site,ids.otherSite]},ids.reviewer);
   await tx.add('customer_membership',{userId:ids.client,customerId:ids.customer,siteIds:[ids.site],permissions:['VIEW','REPORT_ACK'],active:true,expiresAt:new Date(Date.now()+3600000).toISOString()},'qa-membership');
   await tx.add('stock_location',{name:'Synthetic warehouse',type:'WAREHOUSE'},ids.warehouse);
   await tx.add('material',{sku:'QA-PCS',name:'Synthetic consumable',baseUnit:'pcs',materialType:'CONSUMABLE',packagingBase:1,conversions:[{unit:'pcs',numerator:1,denominator:1}]},ids.material);
   await tx.add('stock_movement',{type:'RECEIPT',materialId:ids.material,toLocationId:ids.warehouse,quantityBase:10,ledgerSequence:1},'qa-opening-stock');
  });
  [owner,worker,client,bot]=await Promise.all([ids.owner,ids.worker,ids.client,ids.bot].map(id=>engine.getActor(id,company)));
 });
 afterAll(async()=>{await db?.close();});

 it('atomic confirmation refuses a changed referenced aggregate without effects',async()=>{
  const original=(await list('site')).find(s=>s.id===ids.site)!;
  await db.transaction(company,ids.owner,async tx=>{const site=await tx.get('site',ids.site);await tx.save(site,{...site.data,name:'Changed after preview'});});
  const idempotency_key=randomUUID();
  await expect(engine.execute(owner,'task.create',{input:{siteId:ids.site,title:'Stale preview task'},idempotency_key,preconditions:[{kind:'site',id:ids.site,version:original.version}]})).rejects.toMatchObject({code:'VERSION_CONFLICT',details:{reason:'PREVIEW_REFERENCE_CHANGED'}});
  expect(await list('task')).toEqual([]);expect((await db.query('SELECT command FROM command_receipts WHERE company_id=$1 AND idempotency_key=$2',[company,idempotency_key])).rows).toEqual([]);
 });
 it('successful confirmation replay precedes changed reference guards but rejects changed guard identity',async()=>{
  const input={siteId:ids.site,title:'Confirmed task'},idempotency_key=randomUUID(),preconditions=[{kind:'site',id:ids.site,version:1}];
  const first=await engine.execute(owner,'task.create',{input,idempotency_key,preconditions});
  await db.transaction(company,ids.owner,async tx=>{const site=await tx.get('site',ids.site);await tx.save(site,{...site.data,name:'Changed after successful execution'});});
  expect(await engine.execute(owner,'task.create',{input,idempotency_key,preconditions})).toEqual(first);
  await expect(engine.execute(owner,'task.create',{input,idempotency_key,preconditions:[{...preconditions[0]!,version:2}]})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  expect(await list('task')).toHaveLength(1);
 });
 it('replayed command has one aggregate, receipt and outbox effect',async()=>{
  const key=randomUUID(),input={code:'QA-NEW',name:'New QA site',address:'Berlin'};
  const first=await call(owner,'site.create',input,key),replay=await call(owner,'site.create',input,key);
  expect(replay).toEqual(first);expect((await list('site')).filter(e=>e.data.code==='QA-NEW')).toHaveLength(1);
  expect((await db.query('SELECT id FROM outbox WHERE company_id=$1 AND type=$2 AND data->>\'siteId\'=$3',[company,'site.created',first.id])).rows).toHaveLength(1);
  expect((await db.query('SELECT command FROM command_receipts WHERE company_id=$1 AND idempotency_key=$2',[company,key])).rows).toHaveLength(1);
 });
 it('reusing idempotency key with another input fails without a second effect',async()=>{
  const key=randomUUID();await call(owner,'site.create',{code:'ONE',name:'One',address:'Berlin'},key);
  await expect(call(owner,'site.create',{code:'TWO',name:'Two',address:'Berlin'},key)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  expect((await list('site')).some(e=>e.data.code==='TWO')).toBe(false);
 });
 it('two concurrent identical retries return the same committed result',async()=>{
  const key=randomUUID(),input={code:'CONCURRENT',name:'Concurrent QA site',address:'Berlin'};
  const [a,b]=await Promise.all([call(owner,'site.create',input,key),call(owner,'site.create',input,key)]);
  expect(a.id).toBe(b.id);expect((await list('site')).filter(e=>e.data.code==='CONCURRENT')).toHaveLength(1);
 });
 it('concurrent shift starts yield one active shift and one typed conflict',async()=>{
  const results=await Promise.allSettled([call(worker,'shift.start',{siteId:ids.site}),call(worker,'shift.start',{siteId:ids.site})]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason).toMatchObject({code:'INVALID_STATE'});
  expect((await list('shift')).filter(s=>s.data.state==='ACTIVE')).toHaveLength(1);
 });
 it('concurrent stock reservations cannot reserve fourteen units from ten',async()=>{
  const input={materialId:ids.material,locationId:ids.warehouse,quantity:'7',unit:'pcs',expiresAt:new Date(Date.now()+3600000).toISOString()};
  const results=await Promise.allSettled([call(owner,'reservation.create',input),call(owner,'reservation.create',input)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await list('stock_reservation')).reduce((n,e)=>n+e.data.quantityBase,0)).toBe(7);
  expect((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason).toMatchObject({code:'INSUFFICIENT_STOCK'});
 });
 it('failed transaction rolls aggregate, audit, receipt and outbox back together',async()=>{
  const commandName=`qa.rollback.${randomUUID()}`;engine.registry[commandName]={permission:'site.create',schema:z.object({}).strict(),handler:async ctx=>{await ctx.tx.add('qa_atomic',{synthetic:true});await ctx.tx.event('qa.must_not_commit',{});throw new DomainError('INVALID_STATE');}};
  try{await expect(call(owner,commandName,{})).rejects.toMatchObject({code:'INVALID_STATE'});expect(await list('qa_atomic')).toHaveLength(0);expect((await db.query('SELECT id FROM outbox WHERE company_id=$1 AND type=$2',[company,'qa.must_not_commit'])).rows).toHaveLength(0);expect((await db.query('SELECT id FROM audit_log WHERE company_id=$1 AND aggregate_kind=$2',[company,'qa_atomic'])).rows).toHaveLength(0);expect((await db.query('SELECT command FROM command_receipts WHERE company_id=$1 AND command=$2',[company,commandName])).rows).toHaveLength(0);}finally{delete engine.registry[commandName];}
 });
 it('stale expected version changes neither current data nor revision history',async()=>{
  const loc=await call(owner,'location.create',{siteId:ids.site,nodeType:'BUILDING',code:'A',name:'Haus A'});
  await call(owner,'location.update',{locationId:loc.id,name:'Haus Alpha'},randomUUID(),1);
  const revisions=(await list('location_revision')).length;
  await expect(call(owner,'location.update',{locationId:loc.id,name:'Stale rewrite'},randomUUID(),1)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  expect((await list('location')).find(e=>e.id===loc.id)?.data.name).toBe('Haus Alpha');expect(await list('location_revision')).toHaveLength(revisions);
 });
 it('unknown fields and fractional cent values are rejected before mutation',async()=>{
  await expect(call(owner,'site.create',{code:'INJECT',name:'Unsafe',address:'Berlin',companyId:'foreign'})).rejects.toBeDefined();
  expect((await list('site')).some(e=>e.data.code==='INJECT')).toBe(false);
 });
 it('permission revocation is rechecked for an old Actor and cached replay',async()=>{
  const key=randomUUID(),input={code:'REVOKE',name:'Before revoke',address:'Berlin'};await call(owner,'site.create',input,key);
  await db.transaction(company,ids.owner,async tx=>{const u=await tx.get('user',ids.owner);await tx.save(u,{...u.data,roles:['AUDITOR'],permissions:[]});});
  await expect(call(owner,'site.create',input,key)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(call(owner,'site.create',{code:'AFTER',name:'After revoke',address:'Berlin'})).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('disabled user cannot read using a previously authenticated actor',async()=>{
  await db.transaction(company,ids.owner,async tx=>{const u=await tx.get('user',ids.worker);await tx.save(u,{...u.data,active:false});});
  await expect(engine.readEntities(worker,'site')).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('foreign tenant aggregate IDs are indistinguishable from nonexistent IDs',async()=>{
  const foreign=`qa-foreign-${randomUUID()}`;await db.transaction(foreign,'QA_FIXTURE',tx=>tx.add('site',{name:'Secret foreign site',active:true},'foreign-site'));
  await expect(call(owner,'location.create',{siteId:'foreign-site',nodeType:'BUILDING',code:'F',name:'Foreign'})).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  await expect(call(owner,'location.create',{siteId:'nonexistent-site',nodeType:'BUILDING',code:'N',name:'Missing'})).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  expect(JSON.stringify(await engine.readEntities(owner,'site'))).not.toContain('Secret foreign site');
 });
 it('employee site reads are scoped and unknown aggregate kinds deny by default',async()=>{
  expect((await engine.readEntities(worker,'site')).map(e=>e.id)).toEqual([ids.site]);await add('future_secret',{employeeId:ids.worker,secret:'must not leak'});
  expect(await engine.readEntities(worker,'future_secret')).toEqual([]);
 });
 it('BOT_ADMIN cannot read employee payroll, payouts or rates',async()=>{
  for(const kind of ['payroll_calculation','payout','rate_history']){await add(kind,{employeeId:ids.worker,amountCents:123456,bank:'synthetic-private-bank'});expect(await engine.readEntities(bot,kind)).toEqual([]);}
 });
 it('worker can read own finance records but not another employee',async()=>{
  await add('payout',{employeeId:ids.worker,amountCents:123});await add('payout',{employeeId:ids.owner,amountCents:999});
  expect((await engine.readEntities(worker,'payout')).map(e=>e.data.amountCents)).toEqual([123]);
 });
 it('public entity removes credential hashes and API secrets from the own profile',async()=>{
  await db.transaction(company,ids.owner,async tx=>{const u=await tx.get('user',ids.worker);await tx.save(u,{...u.data,passwordHash:'PRIVATE-HASH',totpSecret:'PRIVATE-OTP',tokenHash:'PRIVATE-TOKEN',apiKey:'PRIVATE-KEY'});});
  const serialized=JSON.stringify(await engine.readEntities(worker,'user'));for(const secret of ['PRIVATE-HASH','PRIVATE-OTP','PRIVATE-TOKEN','PRIVATE-KEY'])expect(serialized).not.toContain(secret);
 });
 it('bounded customer membership excludes another site of the same customer',async()=>{
  expect((await engine.readEntities(client,'site')).map(e=>e.id)).toEqual([ids.site]);
  for(const siteId of [ids.site,ids.otherSite])await add('report',{siteId,customerId:ids.customer,state:'PUBLISHED',inputSnapshot:{private:'not client'},currentVersionId:`version-${siteId}`},`report-${siteId}`);
  expect((await engine.readEntities(client,'report')).map(e=>e.id)).toEqual([`report-${ids.site}`]);
 });
 it('published report versions retain export metadata and hide unpublished drafts',async()=>{
  await add('report',{siteId:ids.site,customerId:ids.customer,state:'PUBLISHED',currentVersionId:'qa-published-version'},'qa-published-report');
  await add('report_version',{reportId:'qa-published-report',siteId:ids.site,customerId:ids.customer,version:1,publishedAt:new Date().toISOString(),immutable:true,sha256:'a'.repeat(64),snapshot:{site:{id:ids.site},totalNetCents:24000,totalGrossCents:28560,totalTaxCents:4560}},'qa-published-version');
  await add('report_version',{reportId:'qa-published-report',siteId:ids.site,customerId:ids.customer,version:2,snapshot:{internalCostCents:999}},'qa-draft-version');
  const versions=await engine.readEntities(client,'report_version');expect(versions).toHaveLength(1);expect(versions[0]).toMatchObject({id:'qa-published-version',data:{publishedAt:expect.any(String),sha256:'a'.repeat(64),immutable:true,snapshot:{totalGrossCents:28560}}});
 });
 it('expired or revoked membership immediately excludes the customer reports',async()=>{
  await add('report',{siteId:ids.site,customerId:ids.customer,state:'PUBLISHED'},'qa-report');
  await db.transaction(company,ids.owner,async tx=>{const m=await tx.get('customer_membership','qa-membership');await tx.save(m,{...m.data,expiresAt:new Date(Date.now()-1000).toISOString()});});
  expect(await engine.readEntities(client,'site')).toEqual([]);expect(await engine.readEntities(client,'report')).toEqual([]);
 });
 it('channel membership revocation cuts message reads immediately',async()=>{
  const channel=await call(owner,'channel.create',{type:'SITE_INTERNAL',site_id:ids.site,name:'QA private channel',member_ids:[ids.worker]});
  const message=await call(worker,'message.send',{channel_id:channel.id,text:'Synthetic QA message',language:'EN'});expect((await engine.readEntities(worker,'message')).map(e=>e.id)).toContain(message.id);
  await call(owner,'channel.membership',{channel_id:channel.id,user_id:ids.worker,action:'REVOKE'});
  expect(await engine.readEntities(worker,'message')).toEqual([]);await expect(call(worker,'message.read',{channel_id:channel.id})).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('cached message read cannot replay after channel membership revocation',async()=>{
  const channel=await call(owner,'channel.create',{type:'SITE_INTERNAL',site_id:ids.site,name:'QA revoked receipt',member_ids:[ids.worker]});await call(worker,'message.send',{channel_id:channel.id,text:'Do not reveal after revocation',language:'EN'});
  const key=randomUUID();expect(await call(worker,'message.read',{channel_id:channel.id},key)).toHaveLength(1);await call(owner,'channel.membership',{channel_id:channel.id,user_id:ids.worker,action:'REVOKE'});
  await expect(call(worker,'message.read',{channel_id:channel.id},key)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('replayed read and search recompute edited or deleted message data',async()=>{
  const channel=await call(owner,'channel.create',{type:'SITE_INTERNAL',site_id:ids.site,name:'QA fresh read',member_ids:[ids.worker]});const message=await call(worker,'message.send',{channel_id:channel.id,text:'obsolete QA description',language:'EN'});
  const key=randomUUID(),searchKey=randomUUID();expect((await call(worker,'message.read',{channel_id:channel.id},key))[0].data.text).toBe('obsolete QA description');expect(await call(worker,'message.read',{channel_id:channel.id,query:'obsolete'},searchKey)).toHaveLength(1);
  await call(worker,'message.edit',{message_id:message.id,text:'Corrected QA description'});expect((await call(worker,'message.read',{channel_id:channel.id},key))[0].data).toMatchObject({text:'Corrected QA description',message_version:2});expect(await call(worker,'message.read',{channel_id:channel.id,query:'obsolete'},searchKey)).toEqual([]);
  await db.transaction(company,ids.owner,async tx=>{const current=await tx.get('message',message.id);await tx.save(current,{...current.data,deleted_at:new Date().toISOString()});});expect(await call(worker,'message.read',{channel_id:channel.id},key)).toEqual([]);
 });
 it('read recomputation preserves idempotency key input conflict protection',async()=>{
  const channel=await call(owner,'channel.create',{type:'SITE_INTERNAL',site_id:ids.site,name:'QA read key',member_ids:[ids.worker]}),key=randomUUID();await call(worker,'message.read',{channel_id:channel.id,query:'one'},key);await expect(call(worker,'message.read',{channel_id:channel.id,query:'two'},key)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
 });
 it('cached shift summary cannot replay after site scope revocation',async()=>{
  const shift=await call(worker,'shift.start',{siteId:ids.site});const key=randomUUID();await call(worker,'shift.summary',{shiftId:shift.id},key);
  await db.transaction(company,ids.owner,async tx=>{const u=await tx.get('user',ids.worker);await tx.save(u,{...u.data,siteIds:[]});});
  await expect(call(worker,'shift.summary',{shiftId:shift.id},key)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('client media reads require approval and matching site membership',async()=>{
  for(const [id,siteId,state]of [['approved-a',ids.site,'APPROVED_FOR_CLIENT'],['approved-b',ids.otherSite,'APPROVED_FOR_CLIENT'],['internal-a',ids.site,'RECEIVED']])await add('media_asset',{siteId,customerId:ids.customer,state,visibility:'CLIENT_AFTER_APPROVAL',uploadedBy:ids.worker,blobKey:`private-${id}`,clientBlobKey:`client-${id}`,clientSha256:'b'.repeat(64)},id);
  const media=await engine.readEntities(client,'media_asset');expect(media.map(e=>e.id)).toEqual(['approved-a']);expect(JSON.stringify(media)).not.toContain('private-approved-a');
 });
 it('database immutable audit and revision history cannot be edited',async()=>{
  await expect(db.query('UPDATE audit_log SET detail=$1 WHERE company_id=$2',[JSON.stringify({tampered:true}),company])).rejects.toThrow('immutable business history');
  await expect(db.query('DELETE FROM aggregate_revisions WHERE company_id=$1',[company])).rejects.toThrow('immutable business history');
 });
});

// These tests execute the same Engine authorization methods without pretending
// to verify SQL. They remain runnable when this sandbox blocks local TCP access.
class PolicyFixture {
 companyId='offline-qa';actorId='worker';rows=new Map<string,Entity>();receipts=new Map<string,any>();blobs=new Map<string,any>();
 add(kind:string,data:Data,id:string=randomUUID()){const e:Entity={id,kind,data:structuredClone(data),companyId:this.companyId,version:1,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};this.rows.set(`${kind}:${id}`,e);return e;}
 async get(kind:string,id:string){const e=this.rows.get(`${kind}:${id}`);if(!e)throw new DomainError('NOT_FOUND_SAFE');return structuredClone(e);}
 async list(kind:string){return [...this.rows.values()].filter(e=>e.kind===kind).map(e=>structuredClone(e));}
 async save(e:Entity,data:Data){const n={...e,data:structuredClone(data),version:e.version+1};this.rows.set(`${e.kind}:${e.id}`,n);return n;}
 async event(){}
 async query(sql:string,params:any[]=[]){if(sql.startsWith('SELECT command,input_hash'))return {rows:this.receipts.has(params[2])?[this.receipts.get(params[2])]:[]};if(sql.startsWith('INSERT INTO command_receipts')){this.receipts.set(params[2],{command:params[3],input_hash:params[4],result:JSON.parse(params[5]),authorization_hash:params[6],created_at:new Date()});return {rows:[]};}if(sql.startsWith('INSERT INTO audit_log')||sql.startsWith('INSERT INTO auth_credentials'))return {rows:[]};if(sql.startsWith('INSERT INTO media_blobs')){if(this.blobs.has(params[0]))return {rows:[]};this.blobs.set(params[0],{company_id:params[1],owner_id:params[2],bytes:params[3],mime_type:params[4],sha256:params[5]});return {rows:[{id:params[0]}]};}if(sql.startsWith('SELECT company_id,owner_id,bytes'))return {rows:this.blobs.has(params[0])?[this.blobs.get(params[0])]:[]};throw new Error(`Unexpected offline query: ${sql}`);}
 async transaction<T>(_company:string,actor:string,fn:(tx:PgTransaction)=>Promise<T>){this.actorId=actor;return fn(this as unknown as PgTransaction);}
}
describe('Engine runtime policy regressions (in-memory, SQL not covered)',()=>{
 let tx:PolicyFixture,engine:Engine,employee:Actor,client:Actor,bot:Actor;
 const read=(actor:Actor,kind:string)=>engine.readEntities(actor,kind);
 beforeEach(async()=>{
  tx=new PolicyFixture();engine=new Engine(tx as unknown as Database,'TEST');
  tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:['site-a'],warehouseIds:[]},'worker');
  tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:['site-b']},'other-worker');
  tx.add('user',{active:true,roles:['CLIENT'],siteIds:[],customerIds:['customer']},'client');
  tx.add('user',{active:true,roles:['BOT_ADMIN'],siteIds:['site-a']},'bot');
  tx.add('site',{active:true,customerId:'customer'},'site-a');tx.add('site',{active:true,customerId:'customer'},'site-b');
  tx.add('customer_membership',{active:true,userId:'client',customerId:'customer',siteIds:['site-a'],permissions:['VIEW','REPORT_ACK']},'membership');
  [employee,client,bot]=await Promise.all(['worker','client','bot'].map(id=>engine.getActor(id,tx.companyId)));
 });
 it('internal preview guards fail before handler and prevent replay identity substitution',async()=>{
  const def={permission:'chat.write',schema:z.object({}).strict(),handler:vi.fn(async()=>({done:true}))};engine.registry={...engine.registry,'qa.guard':def};
  const idempotency_key=randomUUID(),preconditions=[{kind:'site',id:'site-a',version:1}];
  expect(await engine.execute(employee,'qa.guard',{idempotency_key,preconditions})).toEqual({done:true});
  const site=await tx.get('site','site-a');await tx.save(site,{...site.data,name:'Updated'});
  expect(await engine.execute(employee,'qa.guard',{idempotency_key,preconditions})).toEqual({done:true});expect(def.handler).toHaveBeenCalledTimes(1);
  await expect(engine.execute(employee,'qa.guard',{idempotency_key:randomUUID(),preconditions})).rejects.toMatchObject({code:'VERSION_CONFLICT',details:{reason:'PREVIEW_REFERENCE_CHANGED'}});
  await expect(engine.execute(employee,'qa.guard',{idempotency_key,preconditions:[{...preconditions[0]!,version:2}]})).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect(def.handler).toHaveBeenCalledTimes(1);
 });
 it('internal guards reject malformed references and resolve only within the current company transaction',async()=>{
  engine.registry={...engine.registry,'qa.guard':{permission:'chat.write',schema:z.object({}).strict(),handler:vi.fn(async()=>null)}};
  await expect(engine.execute(employee,'qa.guard',{idempotency_key:randomUUID(),preconditions:[{kind:'site',id:'site-a',version:0}]})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await expect(engine.execute(employee,'qa.guard',{idempotency_key:randomUUID(),preconditions:[{kind:'site',id:'foreign-company-site',version:1}]})).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 async function delegated(permissions:string[],granteeId='worker',warehouseIds:string[]=[],ttlMs=3_600_000){
  tx.add('user',{active:true,roles:['INTERNAL_BAULEITER'],permissions:['role.manage'],siteIds:['site-b'],warehouseIds:['delegated-warehouse']},'grantor');
  tx.add('user',{active:true,roles:['OWNER'],siteIds:[]},'delegation-reviewer');tx.add('stock_location',{type:'WAREHOUSE'},'delegated-warehouse');
  const grantor=await engine.getActor('grantor',tx.companyId),approver=await engine.getActor('delegation-reviewer',tx.companyId);approver.mfaVerified=true;
  const grant=await engine.execute(grantor,'delegation.create',{input:{granteeId,permissions,siteIds:['site-b'],warehouseIds,expiresAt:new Date(Date.now()+ttlMs).toISOString(),reason:'Explicit synthetic scoped QA delegation'},idempotency_key:randomUUID()});
  return engine.execute(approver,'delegation.approve',{input:{delegationId:grant.id,confirmedHash:grant.data.previewHash,reason:'Independent synthetic scope review'},idempotency_key:randomUUID()});
 }
 it('delegated task read on another site does not widen existing inventory read',async()=>{
  tx.add('task',{siteId:'site-a',title:'Base task'},'base-task');tx.add('task',{siteId:'site-b',title:'Delegated task'},'delegated-task');tx.add('stock_location',{type:'SITE',siteId:'site-a'},'base-stock');tx.add('stock_location',{type:'SITE',siteId:'site-b'},'other-stock');
  await delegated(['task.read']);expect((await read(employee,'task')).map(e=>e.id)).toEqual(['base-task','delegated-task']);expect((await read(employee,'stock_location')).map(e=>e.id)).toEqual(['base-stock']);expect((await engine.getActor('worker',tx.companyId)).siteIds).toEqual(['site-a']);
 });
 it('OWNER without an inventory right receives only the named delegated inventory scope',async()=>{
  tx.add('user',{active:true,roles:['OWNER'],siteIds:['site-a'],warehouseIds:[]},'narrow-owner');tx.add('stock_location',{type:'WAREHOUSE'},'private-owner-warehouse');tx.add('stock_location',{type:'SITE',siteId:'site-a'},'private-owner-site-stock');
  const owner=await engine.getActor('narrow-owner',tx.companyId);expect(owner.permissions).not.toContain('inventory.read');expect(await read(owner,'stock_location')).toEqual([]);await delegated(['inventory.read'],'narrow-owner',['delegated-warehouse']);expect((await read(owner,'stock_location')).map(e=>e.id)).toEqual(['delegated-warehouse']);
 });
 it.each(['REVOKED','EXPIRED'] as const)('delegation %s invalidates cached command authority without rewriting the base user',async(state)=>{
  const grant=await delegated(['task.create']);const input={siteId:'site-b',title:'Only delegated scope permits this task'},key=randomUUID();await engine.execute(employee,'task.create',{input,idempotency_key:key});
  try{
   if(state==='REVOKED'){const grantor=await engine.getActor('grantor',tx.companyId);await engine.execute(grantor,'delegation.revoke',{input:{delegationId:grant.id,reason:'Synthetic revocation regression'},idempotency_key:randomUUID()});}
   else{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()+3_600_001);}
   await expect(engine.execute(employee,'task.create',{input,idempotency_key:key})).rejects.toMatchObject({code:'ACCESS_DENIED'});expect((await tx.get('user','worker')).data.siteIds).toEqual(['site-a']);expect((await tx.list('task')).filter(task=>task.data.title===input.title)).toHaveLength(1);
  }finally{vi.useRealTimers();}
 });
 it('same-site employees and device administrators cannot read another employee time history',async()=>{
  const other=await tx.get('user','other-worker');await tx.save(other,{...other.data,siteIds:['site-a']});const administrator=await tx.get('user','bot');await tx.save(administrator,{...administrator.data,permissions:['device.manage']});
  for(const kind of ['shift','timesheet','time_event']){tx.add(kind,{employeeId:'other-worker',siteId:'site-a',state:'ENDED',totalSeconds:21600,createdBy:'worker'},`other-${kind}`);tx.add(kind,{employeeId:'other-worker',siteId:'site-a',state:'ENDED',totalSeconds:21600,createdBy:'bot'},`authored-other-${kind}`);}tx.add('device',{employeeId:'other-worker',siteId:'site-a',active:true},'managed-device');
  for(const kind of ['shift','timesheet','time_event']){expect(await read(employee,kind)).toEqual([]);expect(await read(bot,kind)).toEqual([]);}expect((await read(bot,'device')).map(e=>e.id)).toEqual(['managed-device']);
 });
 it('read replay recomputes edit, query and deletion instead of returning stale cached text',async()=>{
  const channel=tx.add('channel',{type:'SITE_INTERNAL',site_id:'site-a',members:[{user_id:'worker',history_from:'2020-01-01T00:00:00Z'}]},'fresh-read-channel');
  const run=(name:string,input:Data,key=randomUUID())=>engine.execute(employee,name,{input,idempotency_key:key});const message=await run('message.send',{channel_id:channel.id,text:'obsolete synthetic instruction',language:'EN'}),readKey=randomUUID(),searchKey=randomUUID();
  expect((await run('message.read',{channel_id:channel.id},readKey))[0].data.text).toBe('obsolete synthetic instruction');expect(await run('message.read',{channel_id:channel.id,query:'obsolete'},searchKey)).toHaveLength(1);
  await run('message.edit',{message_id:message.id,text:'Corrected synthetic instruction'});expect((await run('message.read',{channel_id:channel.id},readKey))[0].data).toMatchObject({text:'Corrected synthetic instruction',message_version:2});expect(await run('message.read',{channel_id:channel.id,query:'obsolete'},searchKey)).toEqual([]);
  const current=await tx.get('message',message.id);await tx.save(current,{...current.data,deleted_at:new Date().toISOString()});expect(await run('message.read',{channel_id:channel.id},readKey)).toEqual([]);
 });
 it('fresh read replay still rejects one idempotency key reused with different search input',async()=>{
  tx.add('channel',{type:'SITE_INTERNAL',site_id:'site-a',members:[{user_id:'worker',history_from:'2020-01-01T00:00:00Z'}]},'fresh-read-channel');const key=randomUUID();await engine.execute(employee,'message.read',{input:{channel_id:'fresh-read-channel',query:'one'},idempotency_key:key});await expect(engine.execute(employee,'message.read',{input:{channel_id:'fresh-read-channel',query:'two'},idempotency_key:key})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
 });
 it('warehouse and employee custody override an incidental permitted siteId',async()=>{
  tx.add('stock_location',{type:'WAREHOUSE',siteId:'site-a'},'private-warehouse');tx.add('stock_location',{type:'EMPLOYEE',siteId:'site-a',employeeId:'other-worker'},'other-custody');tx.add('stock_location',{type:'SITE',siteId:'site-a'},'site-stock');
  expect((await read(employee,'stock_location')).map(e=>e.id)).toEqual(['site-stock']);
 });
 it('stock movements deny unassigned origin and destination warehouses',async()=>{
  tx.add('stock_location',{type:'WAREHOUSE'},'private-warehouse');tx.add('stock_location',{type:'SITE',siteId:'site-a'},'site-stock');
  tx.add('stock_movement',{fromLocationId:'private-warehouse',toLocationId:'site-stock',quantityBase:10},'cross-boundary');tx.add('stock_movement',{toLocationId:'site-stock',quantityBase:5},'allowed');
  expect((await read(employee,'stock_movement')).map(e=>e.id)).toEqual(['allowed']);
 });
 it('stock transfers and asset assignments resolve their canonical custody references',async()=>{
  tx.add('stock_location',{type:'WAREHOUSE'},'private-warehouse');tx.add('stock_location',{type:'SITE',siteId:'site-a'},'site-stock');
  tx.add('stock_transfer',{sourceId:'site-stock',targetId:'private-warehouse',siteId:'site-a',createdBy:'worker'},'restricted-transfer');tx.add('stock_transfer',{sourceId:'site-stock',targetId:'site-stock'},'allowed-transfer');
  tx.add('asset_assignment',{stockLocationId:'private-warehouse',employeeId:'worker'},'restricted-asset');tx.add('asset_assignment',{stockLocationId:'site-stock',employeeId:'worker'},'allowed-asset');
  expect((await read(employee,'stock_transfer')).map(e=>e.id)).toEqual(['allowed-transfer']);expect((await read(employee,'asset_assignment')).map(e=>e.id)).toEqual(['allowed-asset']);
 });
 it('an author is not the finance subject and BOT_ADMIN cannot read authored employee payout',async()=>{
  tx.add('payout',{employeeId:'other-worker',createdBy:'bot',amountCents:99999},'foreign-payout');expect(await read(bot,'payout')).toEqual([]);
 });
 it('site media permission does not reveal another employee confidential document',async()=>{
  tx.add('media_asset',{visibility:'CONFIDENTIAL',employeeId:'other-worker',siteId:'site-a',uploadedBy:'worker'},'private-other');tx.add('media_asset',{visibility:'CONFIDENTIAL',employeeId:'worker'},'private-self');
  expect((await read(employee,'media_asset')).map(e=>e.id)).toEqual(['private-self']);
 });
 it('an employee record resolves own subject through userId instead of aggregate ID',async()=>{
  tx.add('employee',{userId:'worker',active:true},'employee-worker');tx.add('employee',{userId:'other-worker',active:true},'employee-other');
  expect((await read(employee,'employee')).map(e=>e.id)).toEqual(['employee-worker']);
 });
 it('location revision scope resolves its referenced location and denies another site snapshot',async()=>{
  tx.add('location',{siteId:'site-a',name:'Permitted tree node'},'location-a');tx.add('location',{siteId:'site-b',name:'Restricted tree node'},'location-b');
  tx.add('location_revision',{locationId:'location-a',snapshot:{siteId:'site-a',name:'Permitted historical node'}},'revision-a');tx.add('location_revision',{locationId:'location-b',snapshot:{siteId:'site-b',name:'Restricted historical node'}},'revision-b');
  expect((await read(employee,'location_revision')).map(e=>e.id)).toEqual(['revision-a']);
 });
 it('canonical nested task templates and occurrences retain their original site scope',async()=>{
  tx.add('task_template',{name:'Allowed recurrence',task:{siteId:'site-a',title:'Allowed work'}},'template-a');tx.add('task_template',{name:'Private recurrence',task:{siteId:'site-b',title:'Private work'}},'template-b');
  tx.add('task',{siteId:'site-a',title:'Allowed occurrence'},'task-a');tx.add('task',{siteId:'site-b',title:'Private occurrence'},'task-b');
  tx.add('task_occurrence',{templateId:'template-a',taskId:'task-a',templateSnapshot:{task:{siteId:'site-a'}}},'occurrence-a');tx.add('task_occurrence',{templateId:'template-b',taskId:'task-b',templateSnapshot:{task:{siteId:'site-b'}}},'occurrence-b');
  expect((await read(employee,'task_template')).map(e=>e.id)).toEqual(['template-a']);expect((await read(employee,'task_occurrence')).map(e=>e.id)).toEqual(['occurrence-a']);
 });
 it('valid client site-channel membership is readable through customer site scope',async()=>{
  tx.add('channel',{type:'SITE_CLIENT',site_id:'site-a',members:[{user_id:'client',history_from:'2025-01-01T00:00:00.000Z'}]},'external-channel');tx.add('message',{channel_id:'external-channel',author_id:'worker',text:'Customer approved discussion'},'client-message');
  expect((await read(client,'channel')).map(e=>e.id)).toEqual(['external-channel']);expect((await read(client,'message')).map(e=>e.id)).toEqual(['client-message']);
 });
 it('revoked and expired customer membership denies static customerIds on user',async()=>{
  const m=await tx.get('customer_membership','membership');await tx.save(m,{...m.data,revokedAt:new Date().toISOString()});expect(await read(client,'site')).toEqual([]);
 });
 it('cached message reads are denied immediately after membership changes',async()=>{
  const channel=tx.add('channel',{type:'SITE_INTERNAL',site_id:'site-a',members:[{user_id:'worker',history_from:'2025-01-01T00:00:00.000Z'}]},'channel');tx.add('message',{channel_id:channel.id,text:'Secret after revocation',author_id:'worker',revisions:[{version:1,text:'Secret after revocation'}]},'message');
  const envelope={input:{channel_id:channel.id},idempotency_key:'offline-cache-message'};expect(await engine.execute(employee,'message.read',envelope)).toHaveLength(1);await tx.save(channel,{...channel.data,members:[{...channel.data.members[0],revoked_at:new Date().toISOString()}]});
  await expect(engine.execute(employee,'message.read',envelope)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('cached site reads deny a stale actor after user scope changes',async()=>{
  const shift=tx.add('shift',{employeeId:'worker',siteId:'site-a',state:'ENDED',endAt:'2026-01-01T01:00:00.000Z'},'shift');
  const envelope={input:{shiftId:shift.id},idempotency_key:'offline-cache-scope'};await engine.execute(employee,'shift.summary',envelope);const u=await tx.get('user','worker');await tx.save(u,{...u.data,siteIds:[]});await expect(engine.execute(employee,'shift.summary',envelope)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('cached customer reads deny membership site or VIEW permission changes',async()=>{
  const name=`qa.customer-read.${randomUUID()}`;engine.registry[name]={permission:'customer.read',schema:z.object({}).strict(),handler:ctx=>engine.readEntities(ctx.actor,'site')};const envelope={input:{},idempotency_key:'offline-customer-scope'};
  try{expect((await engine.execute(client,name,envelope)).map((e:Entity)=>e.id)).toEqual(['site-a']);const m=await tx.get('customer_membership','membership');await tx.save(m,{...m.data,siteIds:['site-b'],permissions:[]});await expect(engine.execute(client,name,envelope)).rejects.toMatchObject({code:'ACCESS_DENIED'});}finally{delete engine.registry[name];}
 });
 it('cached customer reads expire even when raw membership and static customer IDs do not change',async()=>{
  const m=await tx.get('customer_membership','membership'),now=Date.now();await tx.save(m,{...m.data,expiresAt:new Date(now+1000).toISOString()});
  tx.add('customer_membership',{active:true,userId:'client',customerId:'customer',siteIds:['site-b'],permissions:['VIEW'],expiresAt:new Date(now+60000).toISOString()},'second-membership');
  const name=`qa.customer-expiry.${randomUUID()}`;engine.registry[name]={permission:'customer.read',schema:z.object({}).strict(),handler:ctx=>engine.readEntities(ctx.actor,'site')};const envelope={input:{},idempotency_key:'offline-customer-expiry'};
  try{expect((await engine.execute(client,name,envelope)).map((e:Entity)=>e.id)).toEqual(['site-a','site-b']);vi.useFakeTimers();vi.setSystemTime(now+2000);await expect(engine.execute(client,name,envelope)).rejects.toMatchObject({code:'ACCESS_DENIED'});}finally{vi.useRealTimers();delete engine.registry[name];}
 });
 it('an employee cannot start or change another employee shift sharing the same site',async()=>{
  const other=await tx.get('user','other-worker');await tx.save(other,{...other.data,siteIds:['site-a']});
  await expect(engine.execute(employee,'shift.start',{input:{employeeId:'other-worker',siteId:'site-a'},idempotency_key:'offline-other-shift'})).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('canonical synthetic seed produces a reviewed report, photo bytes and client access without legal approval',async()=>{
  const fixture=new PolicyFixture();const db=fixture as unknown as Database;await seed(db,fixture.companyId);
  const company=await fixture.get('company',fixture.companyId),version=await fixture.get('report_version',company.data.seedReportVersionId);
  expect(version.data.snapshot).toMatchObject({totalSeconds:21600,totalNetCents:24000,totalTaxCents:4560,totalGrossCents:28560,totalHoursDisplay:'6.00'});expect(version.data.snapshot.taskRows).toHaveLength(1);expect(version.data.snapshot.mediaRows).toHaveLength(1);expect(fixture.blobs.size).toBe(2);
  const e=new Engine(db,'TEST'),a=await e.getActor('demo-client',fixture.companyId);expect((await e.readEntities(a,'report_version')).map(v=>v.id)).toEqual([version.id]);expect(await fixture.list('legal_approval')).toEqual([]);
  const before=(await fixture.list('report_version')).length;await seed(db,fixture.companyId);expect(await fixture.list('report_version')).toHaveLength(before);expect(await fixture.list('time_segment')).toHaveLength(1);
  const run=async(id:string,name:string,input:unknown)=>e.execute(await e.getActor(id,fixture.companyId),name,{input,idempotency_key:randomUUID()});
  await run('demo-employee','task.start',{taskId:'task-windows'});await run('demo-employee','task.worklog',{taskId:'task-windows',quantityMilli:100000,description:'Synthetic original seed task workflow'});await run('demo-employee','task.submit',{taskId:'task-windows'});await run('demo-foreman','task.review',{taskId:'task-windows',decision:'ACCEPT',reason:'Separate synthetic quality review'});expect((await fixture.get('task','task-windows')).data.state).toBe('ACCEPTED');
 });
});
