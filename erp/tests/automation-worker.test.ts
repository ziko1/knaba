import { afterEach, describe, expect, it, vi } from 'vitest';
import { Engine } from '../apps/api/engine.ts';
import type { Database, PgTransaction } from '../apps/api/database.ts';
import { WorkerRunner, serviceId, type OutboxJob } from '../apps/worker/runner.ts';
import { assert, DomainError, type Data, type Entity, type Transaction } from '../packages/domain/core.ts';

const NOW='2026-10-06T10:00:00.000Z';
/** Boundary double for PostgreSQL transactions/leases only. Business commands,
 * actor/scope resolution, worker code and automation authorization are real.
 * These cases do not claim SQL row-lock/concurrency acceptance. */
class MemoryDatabase implements Transaction {
  companyId='company';actorId='setup';rows=new Map<string,Entity>();jobs=new Map<string,Data>();receipts=new Map<string,Data>();audits:Data[]=[];events:Data[]=[];trace:string[]=[];sequence=0;transactions=0;
  onList?: (kind:string)=>void;beforeTransaction?: (number:number)=>void;onLease?: (count:number)=>void;leaseChecks=0;
  async get<T extends Data=Data>(kind:string,id:string){const row=this.rows.get(kind+':'+id);assert(row&&row.companyId===this.companyId,'NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;}
  async list<T extends Data=Data>(kind:string){this.trace.push('read:'+kind);this.onList?.(kind);return [...this.rows.values()].filter(row=>row.companyId===this.companyId&&row.kind===kind).map(row=>structuredClone(row)) as Entity<T>[];}
  async add<T extends Data=Data>(kind:string,data:T,id=kind+'-'+ ++this.sequence){const row={id,companyId:this.companyId,kind,data:structuredClone(data),version:1,createdAt:NOW,updatedAt:NOW};assert(!this.rows.has(kind+':'+id),'VERSION_CONFLICT');this.rows.set(kind+':'+id,row);this.trace.push('add:'+kind);return structuredClone(row);}
  async save(row:Entity,data:Data,version=row.version){const current=await this.get(row.kind,row.id);assert(current.version===version,'VERSION_CONFLICT');const result={...current,data:structuredClone(data),version:version+1};this.rows.set(row.kind+':'+row.id,result);this.trace.push('save:'+row.kind);return structuredClone(result);}
  async event(type:string,data:Data){this.events.push({type,data:structuredClone(data)});this.trace.push('event:'+type);}
  async query(sql:string,params:any[]=[]):Promise<{rows:any[]}>{
    if(sql.includes('FROM outbox')&&sql.includes("status='RUNNING'")){
      this.trace.push(sql.includes('FOR UPDATE')?'lease:locked':'lease:check');this.onLease?.(++this.leaseChecks);const job=this.jobs.get(params[1]);return {rows:job&&job.company_id===params[0]&&job.status==='RUNNING'&&job.lease_token===params[2]&&Date.parse(job.leased_until)>Date.now()?[structuredClone(job)]:[]};
    }
    const receiptKey=params[0]+':'+params[1]+':'+params[2];
    if(sql.startsWith('SELECT command,input_hash'))return {rows:this.receipts.has(receiptKey)?[structuredClone(this.receipts.get(receiptKey)!)]:[]};
    if(sql.startsWith('INSERT INTO command_receipts')){this.receipts.set(receiptKey,{command:params[3],input_hash:params[4],result:JSON.parse(params[5]),authorization_hash:params[6],created_at:NOW});return {rows:[]};}
    if(sql.startsWith('INSERT INTO audit_log')){this.audits.push({actor:params[1],action:params[2]});return {rows:[]};}
    throw new Error('Unexpected synthetic SQL boundary');
  }
  async transaction<T>(companyId:string,actorId:string,fn:(tx:PgTransaction)=>Promise<T>):Promise<T>{
    assert(companyId===this.companyId,'ACCESS_DENIED');this.transactions++;this.beforeTransaction?.(this.transactions);this.actorId=actorId;const snapshot=structuredClone({rows:this.rows,jobs:this.jobs,receipts:this.receipts,audits:this.audits,events:this.events,sequence:this.sequence});
    try{return await fn(this as unknown as PgTransaction);}catch(error){Object.assign(this,snapshot);throw error;}
  }
}
async function fixture(action='DETECT_SHORTAGE',parameters:Data={},scope={siteIds:['A'],customerIds:['C']}){
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(NOW));const db=new MemoryDatabase();
  await db.add('user',{active:true,roles:['OWNER'],permissions:['automation.manage','inventory.read','report.create','quote.create','notifications.manage','dispatch.read'],siteIds:['A','B'],warehouseIds:['W1']},'owner');
  await db.add('user',{active:true,roles:['SERVICE_ACCOUNT'],permissions:['automation.execute','scope.company'],siteIds:[],warehouseIds:[]},serviceId);
  await db.add('user',{active:true,roles:['EMPLOYEE'],permissions:[],siteIds:['A'],warehouseIds:[]},'recipient');
  await db.add('customer',{active:true},'C');await db.add('customer',{active:true},'D');
  for(const [id,customerId]of [['A','C'],['B','C'],['outside','D']])await db.add('site',{active:true,customerId},id);
  await db.add('customer_membership',{userId:'owner',customerId:'C',siteIds:['A','B'],permissions:['VIEW'],active:true},'membership');
  const rule=await db.add('automation_rule',{status:'ACTIVE',approvedBy:'owner',ownerId:'owner',ruleVersion:1,scope,parameters,action,maxAttempts:3,activeFrom:'2026-10-01T00:00:00Z'},'rule'),run=await db.add('automation_run',{ruleId:rule.id,ruleVersion:1,ownerId:'owner',scope,parameters,action,status:'QUEUED',attempts:0,maxAttempts:3},'run');
  for(const [id,siteId,state,approvedBase,receivedBase]of [['eligible','A','APPROVED',10000,2000],['private-outside','outside','APPROVED',50000,0],['done','A','APPROVED',100,100],['pending','A','REQUESTED',99999,0]] as const)await db.add('material_request',{siteId,state,materialId:'synthetic-'+id,approvedBase,receivedBase,privateNote:'PRIVATE_CANARY_'+id},id);
  const job:OutboxJob={id:'job',company_id:'company',type:'automation.action_requested',data:{runId:run.id},attempts:1,lease_token:'lease-token',leased_until:'2026-10-06T11:00:00Z'};db.jobs.set(job.id,{...job,status:'RUNNING'});
  const engine=new Engine(db as unknown as Database,'TEST'),worker=new WorkerRunner(db as unknown as Database,engine,{companyId:'company',appMode:'TEST',now:()=>new Date()});db.trace=[];db.transactions=0;
  return {db,engine,worker,job,run,rule,handle:()=>worker.handle(job),current:()=>db.get('automation_run',run.id)};
}
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
describe('actual worker + Engine automation authorization (CPU SQL-boundary double)',()=>{
  it('detector reads, revalidates and succeeds in one locked transaction with only approved owner-visible rule-scoped quantities',async()=>{
    const f=await fixture(),before=structuredClone((await f.db.list('material_request')).map(r=>r.data));f.db.trace=[];await f.handle();expect((await f.current()).data).toMatchObject({status:'SUCCEEDED',attempts:1,result:[{requestId:'eligible',siteId:'A',materialId:'synthetic-eligible',unreceivedBase:8000}]});expect(JSON.stringify((await f.current()).data.result)).not.toContain('PRIVATE_CANARY');expect(f.db.transactions).toBe(1);expect(f.db.trace.filter(t=>t.startsWith('save:'))).toEqual(['save:automation_run']);expect(f.db.trace.filter(t=>t==='lease:locked').length).toBeGreaterThanOrEqual(3);expect((await f.db.list('material_request')).map(r=>r.data)).toEqual(before);
  });
  it.each(['OWNER_ROLE','OWNER_DISABLED','OWNER_ACTION','SERVICE_DISABLED'] as const)('fresh %s revocation prevents any detector source read/result/success',async(change)=>{
    const f=await fixture(),owner=f.db.rows.get('user:owner')!,service=f.db.rows.get('user:'+serviceId)!;
    if(change==='OWNER_ROLE'){owner.data.roles=['EMPLOYEE'];owner.data.permissions=[];owner.data.siteIds=[];}else if(change==='OWNER_DISABLED')owner.data.active=false;else if(change==='OWNER_ACTION')owner.data.permissions=owner.data.permissions.filter((p:string)=>p!=='inventory.read');else service.data.active=false;
    await expect(f.handle()).rejects.toMatchObject({code:'ACCESS_DENIED'});expect((await f.current()).data.result).toBeUndefined();expect((await f.current()).data.status).not.toBe('SUCCEEDED');expect(f.db.trace).not.toContain('read:material_request');expect(f.db.trace).not.toContain('add:report');
  });
  it('narrow current inventory rights exclude warehouse-ineligible requests even when their site matches the rule',async()=>{
    const f=await fixture();Object.assign(f.db.rows.get('user:owner')!.data,{roles:[],permissions:['automation.manage','inventory.read'],siteIds:['A'],warehouseIds:['W1']});await f.db.add('stock_location',{type:'WAREHOUSE'},'W1');await f.db.add('stock_location',{type:'WAREHOUSE'},'W2');await f.db.add('material_request',{siteId:'A',locationId:'W2',state:'APPROVED',materialId:'PRIVATE_WAREHOUSE_CANARY',approvedBase:90000,receivedBase:0},'private-warehouse');await f.handle();expect((await f.current()).data.result).toEqual([{requestId:'eligible',siteId:'A',materialId:'synthetic-eligible',unreceivedBase:8000}]);expect(JSON.stringify((await f.current()).data.result)).not.toContain('PRIVATE_WAREHOUSE_CANARY');
  });
  it.each(['OWNER','ACTION','VERSION','SCOPE','PARAMETERS'] as const)('a copied run with changed %s cannot authorize original cached/copied results',async(change)=>{
    const f=await fixture(),r=f.db.rows.get('automation_run:run')!.data;if(change==='OWNER')r.ownerId='recipient';else if(change==='ACTION')r.action='REMIND';else if(change==='VERSION')r.ruleVersion=2;else if(change==='SCOPE')r.scope={siteIds:['outside'],customerIds:['D']};else r.parameters={unauthorized:'changed'};
    await expect(f.handle()).rejects.toMatchObject({code:'ACCESS_DENIED'});expect((await f.current()).data.result).toBeUndefined();expect((await f.current()).data.status).not.toBe('SUCCEEDED');expect(f.db.trace).not.toContain('read:material_request');
  });
  it('late owner revocation at the detector read boundary is caught again before results persist and rolls back the copied output',async()=>{
    const f=await fixture();let changed=false;f.db.onList=kind=>{if(kind==='material_request'&&!changed){changed=true;f.db.rows.get('user:owner')!.data.permissions=['automation.manage'];}};
    await expect(f.handle()).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(changed).toBe(true);expect((await f.current()).data).toMatchObject({status:'FAILED',error:'ACCESS_DENIED'});expect((await f.current()).data.result).toBeUndefined();expect(f.db.trace.filter(t=>t==='save:automation_run')).toHaveLength(1);
  });
  it.each(['EXPIRED','REBOUND','WRONG_SOURCE'] as const)('%s persisted lease/source prevents all private reads and result writes',async(change)=>{
    const f=await fixture(),job=f.db.jobs.get('job')!;if(change==='EXPIRED')job.leased_until=NOW;else if(change==='REBOUND')job.lease_token='other-lease';else job.data={runId:'another-run'};
    await expect(f.handle()).rejects.toMatchObject({code:change==='WRONG_SOURCE'?'ACCESS_DENIED':'WORKER_LEASE_LOST'});expect(f.db.trace).not.toContain('read:material_request');expect(f.db.trace).not.toContain('save:automation_run');
  });
  it('lease loss after private source read prevents both successful output and unauthorized failure metadata',async()=>{
    const f=await fixture();f.db.onList=kind=>{if(kind==='material_request')f.db.jobs.get('job')!.leased_until=NOW;};await expect(f.handle()).rejects.toMatchObject({code:'WORKER_LEASE_LOST'});expect((await f.current()).data.status).toBe('QUEUED');expect((await f.current()).data.result).toBeUndefined();expect(f.db.trace).not.toContain('save:automation_run');
  });
  it('same parameters with reordered nested JSONB keys remain valid',async()=>{
    const f=await fixture('DETECT_SHORTAGE',{nested:{a:1,b:2},value:'synthetic'});f.db.rows.get('automation_run:run')!.data.parameters={value:'synthetic',nested:{b:2,a:1}};await f.handle();expect((await f.current()).data.status).toBe('SUCCEEDED');
  });
  it('a multi-site rule denied on its second declared site performs no first-site report effect',async()=>{
    const f=await fixture('DRAFT_REPORT',{day:'2026-10-05'},{siteIds:['A','B'],customerIds:['C']});Object.assign(f.db.rows.get('user:owner')!.data,{roles:[],permissions:['automation.manage','report.create'],siteIds:['A']});await f.db.add('order',{siteId:'A',customerId:'C',status:'CONFIRMED'},'order-a');await f.db.add('order',{siteId:'B',customerId:'C',status:'CONFIRMED'},'order-b');f.db.trace=[];
    await expect(f.handle()).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(f.db.trace).not.toContain('read:order');expect(await f.db.list('report')).toHaveLength(0);expect((await f.current()).data.result).toBeUndefined();
  });
  it.each(['DRAFT_QUOTE','PROPOSE_CREW'] as const)('global owner rights do not allow %s targeting a record outside the declared rule scope',async(action)=>{
    const parameters=action==='DRAFT_QUOTE'?{input:{leadId:'outside-lead',customerId:'D'}}:{input:{orderId:'outside-order',startAt:NOW,endAt:'2026-10-06T11:00:00Z'}},f=await fixture(action,parameters);await f.db.add('lead',{siteId:'outside',customerId:'D'},'outside-lead');await f.db.add('order',{siteId:'outside',customerId:'D'},'outside-order');const execute=vi.spyOn(f.engine,'execute');await expect(f.handle()).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(execute).not.toHaveBeenCalled();expect(await f.db.list('quote')).toHaveLength(0);expect((await f.current()).data.result).toBeUndefined();
  });
  it('canonical owner-authored notification command executes with source/version/lease guards rather than service business privileges',async()=>{
    const f=await fixture('REMIND',{recipient_id:'recipient',event:'Synthetic reminder',category:'WORK',channel:'WEB'}),execute=vi.spyOn(f.engine,'execute');await f.handle();expect(execute).toHaveBeenCalledTimes(1);expect(execute.mock.calls[0]![0].userId).toBe('owner');expect(execute.mock.calls[0]![2]).toMatchObject({worker_lease:{id:'job',token:'lease-token'},preconditions:expect.arrayContaining([{kind:'automation_run',id:'run',version:1},{kind:'automation_rule',id:'rule',version:1}])});expect(await f.db.list('notification')).toHaveLength(1);expect((await f.current()).data.status).toBe('SUCCEEDED');expect(f.db.audits[0]!.actor).toBe('owner');
  });
  it('current rule disabled between preparation and the actual canonical command creates no notification',async()=>{
    const f=await fixture('REMIND',{recipient_id:'recipient',event:'Synthetic reminder',category:'WORK'});f.db.beforeTransaction=number=>{if(number===2)f.db.rows.get('automation_rule:rule')!.data.status='DISABLED';};await expect(f.handle()).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await f.db.list('notification')).toHaveLength(0);expect((await f.current()).data.result).toBeUndefined();
  });
  it('successful action cannot persist its copied result after owner rights disappear before final write',async()=>{
    const f=await fixture('REMIND',{recipient_id:'recipient',event:'Synthetic reminder',category:'WORK'});f.db.beforeTransaction=number=>{if(number===3)f.db.rows.get('user:owner')!.data.permissions=f.db.rows.get('user:owner')!.data.permissions.filter((p:string)=>p!=='automation.manage');};await expect(f.handle()).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await f.db.list('notification')).toHaveLength(1);expect((await f.current()).data.result).toBeUndefined();expect((await f.current()).data.status).toBe('FAILED');
  });
  it('completed detector replay performs no source query or duplicate result/save but still requires current authority',async()=>{
    const f=await fixture();await f.handle();const before=(await f.current()).version;f.db.trace=[];await f.handle();expect(f.db.trace).not.toContain('read:material_request');expect((await f.current()).version).toBe(before);f.db.rows.get('user:owner')!.data.permissions=[];await expect(f.handle()).rejects.toMatchObject({code:'ACCESS_DENIED'});expect((await f.current()).version).toBe(before);
  });
});
