import {describe,expect,it} from 'vitest';
import {Engine} from '../apps/api/engine.ts';
import type {Database,PgTransaction} from '../apps/api/database.ts';
import {AUTOMATION_ACTION_PERMISSIONS,authorizeAutomationRule,authorizeAutomationRun,automationVisible,type AutomationAuthorityHost} from '../packages/domain/automation-authority.ts';
import {assert,DomainError,type Actor,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';

// Current Engine authority and real domain handlers; storage is an explicitly
// in-memory transaction. These cases do not establish SQL or provider acceptance.
const NOW='2026-10-06T12:00:00.000Z';
class MemoryTransaction implements Transaction{
 companyId='synthetic-automation-authority';rows=new Map<string,Entity>();events:Data[]=[];sequence=0;
 async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{const e=this.rows.get(kind+':'+id);assert(e,'NOT_FOUND_SAFE');return structuredClone(e) as Entity<T>;}
 async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{return [...this.rows.values()].filter(e=>e.kind===kind).map(e=>structuredClone(e) as Entity<T>);}
 async add<T extends Data=Data>(kind:string,data:T,id=kind+'-'+(++this.sequence)):Promise<Entity<T>>{const e={kind,id,companyId:this.companyId,version:1,data:structuredClone(data),createdAt:NOW,updatedAt:NOW};assert(!this.rows.has(kind+':'+id),'VERSION_CONFLICT');this.rows.set(kind+':'+id,e);return structuredClone(e);}
 async save<T extends Data=Data>(e:Entity,data:T,version=e.version):Promise<Entity<T>>{const previous=await this.get(e.kind,e.id);assert(previous.version===version,'VERSION_CONFLICT');const next={...previous,version:previous.version+1,data:structuredClone(data)};this.rows.set(e.kind+':'+e.id,next);return structuredClone(next);}
 async event(type:string,data:Data){this.events.push({type,data:structuredClone(data)});}
}
async function fixture(){
 const tx=new MemoryTransaction(),db={transaction:async(_company:string,_actor:string,fn:(tx:MemoryTransaction)=>Promise<unknown>)=>fn(tx)} as unknown as Database,engine=new Engine(db,'TEST');
 const capabilities=Object.values(AUTOMATION_ACTION_PERMISSIONS);
 for(const id of ['owner','viewer','initiator']){
  await tx.add('user',{active:true,roles:['INTERNAL_BAULEITER'],permissions:['automation.manage',...capabilities],siteIds:['site']},id);
  await tx.add('customer_membership',{active:true,userId:id,customerId:'customer',permissions:['VIEW']},'member-'+id);
 }
 await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:['site']},'employee');
 await tx.add('user',{active:true,roles:['DIRECTOR'],permissions:['inventory.read','scope.company'],siteIds:[]},'global-owner');
 await tx.add('user',{active:true,roles:['SERVICE_ACCOUNT'],permissions:['automation.execute','scope.company'],siteIds:[]},'service');
 for(const id of ['site','foreign-site'])await tx.add('site',{active:true},id);
 for(const id of ['customer','foreign-customer'])await tx.add('customer',{active:true},id);
 const rule=await tx.add('automation_rule',{name:'Synthetic scoped shortage routine',ownerId:'owner',action:'DETECT_SHORTAGE',scope:{siteIds:['site'],customerIds:['customer']},status:'ACTIVE',approvedBy:'director',ruleVersion:1,parameters:{privateOriginal:'Synthetic copied note'}},'rule');
 const run=await tx.add('automation_run',{ruleId:rule.id,ruleVersion:1,ownerId:'owner',action:'DETECT_SHORTAGE',scope:rule.data.scope,parameters:rule.data.parameters,status:'SUCCEEDED',result:{privateMaterial:'Synthetic private result'}},'run');
 const host:AutomationAuthorityHost<MemoryTransaction>={actorIn:(current,id)=>engine.actorIn(current as unknown as PgTransaction,id),scope:(actor,permission)=>engine.scope(actor,permission)};
 const actor=(id:string)=>engine.getActor(id,tx.companyId),update=async(kind:string,id:string,patch:Data)=>{const e=await tx.get(kind,id);return tx.save(e,{...e.data,...patch});};
 const snapshot=()=>structuredClone({rows:tx.rows,events:tx.events});
 return {tx,engine,host,rule,run,actor,update,snapshot};
}
describe('bounded current automation authority through actual Engine (CPU storage fixture)',()=>{
 it('permits a current fully scoped owner and distinct viewer without writes and removes assistant.read-only employee exposure',async()=>{
  const f=await fixture(),viewer=await f.actor('viewer'),employee=await f.actor('employee'),before=f.snapshot();
  expect((await authorizeAutomationRule(f.tx,f.rule,f.host)).userId).toBe('owner');
  expect((await authorizeAutomationRun(f.tx,f.run,f.host)).userId).toBe('owner');
  expect(await f.engine.readEntities(viewer,'automation_rule')).toHaveLength(1);expect(await f.engine.readEntities(viewer,'automation_run')).toHaveLength(1);
  expect(await f.engine.readEntities(employee,'automation_rule')).toEqual([]);expect(await f.engine.readEntities(employee,'automation_run')).toEqual([]);expect(f.snapshot()).toEqual(before);
 });
 it.each(Object.keys(AUTOMATION_ACTION_PERMISSIONS))('requires the canonical %s capability independently of automation management',async action=>{
  const f=await fixture(),rule=await f.update('automation_rule','rule',{action});
  expect((await authorizeAutomationRule(f.tx,rule,f.host)).userId).toBe('owner');
  const right=AUTOMATION_ACTION_PERMISSIONS[action as keyof typeof AUTOMATION_ACTION_PERMISSIONS];
  const host={...f.host,scope:(actor:Actor,permission:string)=>permission===right?{...actor,permissions:actor.permissions.filter(p=>p!==right)}:f.host.scope(actor,permission)};
  await expect(authorizeAutomationRule(f.tx,rule,host)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it.each(['SITE','CUSTOMER','OWNER_PERMISSION','OWNER_INACTIVE','OWNER_EXTERNAL','OWNER_SERVICE'])('invalidates stored rules and runs after current %s authority is revoked',async reason=>{
  const f=await fixture(),viewer=await f.actor('viewer');
  if(reason==='SITE')await f.update('user','owner',{siteIds:[]});
  if(reason==='CUSTOMER')await f.update('customer_membership','member-owner',{active:false});
  if(reason==='OWNER_PERMISSION')await f.update('user','owner',{permissions:['inventory.read']});
  if(reason==='OWNER_INACTIVE')await f.update('user','owner',{active:false});
  if(reason==='OWNER_EXTERNAL')await f.update('user','owner',{roles:['CLIENT']});
  if(reason==='OWNER_SERVICE')await f.update('user','owner',{roles:['SERVICE_ACCOUNT'],permissions:['automation.manage','inventory.read','scope.company']});
  const before=f.snapshot();await expect(authorizeAutomationRun(f.tx,f.run,f.host)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(await f.engine.readEntities(viewer,'automation_rule')).toEqual([]);expect(await f.engine.readEntities(viewer,'automation_run')).toEqual([]);expect(f.snapshot()).toEqual(before);
 });
 it('requires every declared site/customer instead of one overlapping scope',async()=>{
  const f=await fixture(),rule=await f.update('automation_rule','rule',{scope:{siteIds:['site','foreign-site'],customerIds:['customer','foreign-customer']}});
  await expect(authorizeAutomationRule(f.tx,rule,f.host)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(await automationVisible(f.tx,await f.actor('viewer'),rule,f.host)).toBe(false);
 });
 it.each([{siteIds:[],customerIds:['customer']},{siteIds:['site'],customerIds:[]}])('does not turn an empty unbounded dimension into a scoped grant: %j',async scope=>{
  const f=await fixture(),rule=await f.update('automation_rule','rule',{scope});await expect(authorizeAutomationRule(f.tx,rule,f.host)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const global=await f.update('automation_rule','rule',{ownerId:'global-owner',scope});expect((await authorizeAutomationRule(f.tx,global,f.host)).userId).toBe('global-owner');
  expect(await automationVisible(f.tx,await f.actor('viewer'),global,f.host)).toBe(false);
 });
 it.each([{siteIds:['site','site'],customerIds:['customer']},{siteIds:['site'],customerIds:['']},{siteIds:'site',customerIds:['customer']},{siteIds:['site'],customerIds:['customer'],all:true},{siteIds:Array.from({length:101},(_,i)=>'site'+i),customerIds:['customer']}])('fails closed for malformed, duplicate or unbounded declared scope: %j',async scope=>{
  const f=await fixture(),rule=await f.update('automation_rule','rule',{scope}),before=f.snapshot();
  await expect(authorizeAutomationRule(f.tx,rule,f.host)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(f.snapshot()).toEqual(before);
 });
 it.each([{ruleId:'missing-rule'},{ruleVersion:2},{ownerId:'global-owner'},{action:'DRAFT_REPORT'},{scope:{siteIds:['foreign-site'],customerIds:['customer']}},{parameters:{privateOriginal:'Changed private source snapshot'}}])('rejects stale or orphaned copied run linkage: %j',async patch=>{
  const f=await fixture(),run=await f.update('automation_run','run',patch),before=f.snapshot();
  await expect(authorizeAutomationRun(f.tx,run,f.host)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await f.engine.readEntities(await f.actor('viewer'),'automation_run')).toEqual([]);expect(f.snapshot()).toEqual(before);
 });
 it('compares nested run parameters semantically despite JSONB key ordering and rejects current parameter drift without a ruleVersion change',async()=>{
  const f=await fixture();const rule=await f.update('automation_rule','rule',{parameters:{a:1,nested:{x:'source',y:[1,2]}}}),run=await f.update('automation_run','run',{parameters:{nested:{y:[1,2],x:'source'},a:1}});
  expect((await authorizeAutomationRun(f.tx,run,f.host)).userId).toBe('owner');
  await f.update('automation_rule','rule',{parameters:{a:1,nested:{x:'changed',y:[1,2]}},ruleVersion:rule.data.ruleVersion});
  const before=f.snapshot();await expect(authorizeAutomationRun(f.tx,run,f.host)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await f.engine.readEntities(await f.actor('viewer'),'automation_run')).toEqual([]);expect(f.snapshot()).toEqual(before);
 });
 it('rechecks the viewer and separate effective capability scopes rather than combining unrelated grants',async()=>{
  const f=await fixture(),viewer=await f.actor('viewer');await f.update('user','viewer',{siteIds:[]});expect(await f.engine.readEntities(viewer,'automation_run')).toEqual([]);
  const host={...f.host,scope:(actor:Actor,permission:string)=>actor.userId==='owner'&&permission==='inventory.read'?{...actor,siteIds:['foreign-site']}:f.host.scope(actor,permission)};
  await expect(authorizeAutomationRule(f.tx,f.rule,host)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('keeps service execute transport separate from fresh owner business authority',async()=>{
  const f=await fixture(),service=await f.actor('service');expect((await authorizeAutomationRun(f.tx,f.run,f.host,{initiator:service,initiatorPermission:'automation.execute'})).userId).toBe('owner');
  await expect(authorizeAutomationRun(f.tx,f.run,f.host,{initiator:service,initiatorPermission:'automation.manage'})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await f.update('user','owner',{permissions:['inventory.read']});await expect(authorizeAutomationRun(f.tx,f.run,f.host,{initiator:service,initiatorPermission:'automation.execute'})).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('actual rule creation rejects an out-of-scope customer or global candidate before any domain write',async()=>{
  const f=await fixture(),initiator=await f.actor('initiator'),def=f.engine.registry['automation_rule.create']!;
  for(const customerIds of [['foreign-customer'],[]]){
   const input=def.schema.parse({name:'Synthetic candidate',trigger:'task.accepted',filters:{},action:'DETECT_SHORTAGE',ownerId:'global-owner',scope:{siteIds:['site'],customerIds},activeFrom:NOW}),before=f.snapshot();
   const context=f.engine.context(f.tx as unknown as PgTransaction,initiator,'synthetic-create',undefined,NOW,[],'automation.manage');
   await expect(def.handler(context,input)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(f.snapshot()).toEqual(before);
  }
 });
 it('accepts only an explicit unsaved initial draft candidate and never hides an unexpected database failure',async()=>{
  const f=await fixture(),candidate={...f.rule,id:'unsaved',data:{...f.rule.data,status:'DRAFT'}},initiator=await f.actor('initiator'),before=f.snapshot();
  expect((await authorizeAutomationRule(f.tx,candidate,f.host,{initiator,initiatorPermission:'automation.manage',allowCandidate:true})).userId).toBe('owner');expect(f.snapshot()).toEqual(before);
  await expect(authorizeAutomationRule(f.tx,f.rule,f.host,{initiator,initiatorPermission:'automation.manage',allowCandidate:true})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(authorizeAutomationRule(f.tx,candidate,f.host,{allowCandidate:true})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const outage=new Error('SYNTHETIC_DATABASE_OUTAGE'),broken={...f.host,actorIn:async()=>{throw outage;}};
  await expect(automationVisible(f.tx,initiator,f.rule,broken)).rejects.toBe(outage);
 });
 it('rejects foreign company or stale caller-version entities before exposing any cached data',async()=>{
  const f=await fixture(),viewer=await f.actor('viewer');
  expect(await automationVisible(f.tx,viewer,{...f.rule,companyId:'foreign-company'},f.host)).toBe(false);
  await f.update('automation_rule','rule',{status:'RETIRED'});await expect(authorizeAutomationRule(f.tx,f.rule,f.host)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  expect(await automationVisible(f.tx,viewer,f.rule,f.host)).toBe(false);
 });
});
