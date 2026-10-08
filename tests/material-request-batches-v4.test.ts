import {describe,expect,it} from 'vitest';
import {resourcesCommands,stockBalance} from '../packages/domain/resources.ts';
import {createMaterialRequestBatchCommands} from '../packages/domain/material-request-batches.ts';
import {DomainError,type Actor,type CommandContext,type Data,type Entity,type Transaction} from '../packages/domain/core.ts';

// Company-filtered CPU transactional double. Genuine SQL locking, receipts and
// simultaneous competition are separately authored in the PG companion suite.
class Memory implements Transaction{
 rows=new Map<string,Entity>();events:{type:string;data:Data}[]=[];serial=0;
 async get<T extends Data=Data>(kind:string,id:string):Promise<Entity<T>>{const row=this.rows.get(`${kind}:${id}`);if(!row||row.companyId!=='company')throw new DomainError('NOT_FOUND_SAFE');return structuredClone(row) as Entity<T>;}
 async list<T extends Data=Data>(kind:string):Promise<Entity<T>[]>{return [...this.rows.values()].filter(row=>row.companyId==='company'&&row.kind===kind).map(row=>structuredClone(row)) as Entity<T>[];}
 async add<T extends Data=Data>(kind:string,data:T,id=`${kind}-${++this.serial}`):Promise<Entity<T>>{if(this.rows.has(`${kind}:${id}`))throw new DomainError('VERSION_CONFLICT');const row={companyId:'company',kind,id,version:1,data:structuredClone(data),createdAt:NOW,updatedAt:NOW};this.rows.set(`${kind}:${id}`,row);return structuredClone(row);}
 async save(row:Entity,data:Data,expected=row.version){const current=await this.get(row.kind,row.id);if(current.version!==expected)throw new DomainError('VERSION_CONFLICT');const next={...current,data:structuredClone(data),version:current.version+1};this.rows.set(`${row.kind}:${row.id}`,next);return structuredClone(next);}
 async event(type:string,data:Data){this.events.push({type,data:structuredClone(data)});}
}
const NOW='2026-10-08T12:00:00.000Z',DUE='2026-10-09T12:00:00.000Z';
const rights=['inventory.request','inventory.read','inventory.manage','inventory.approve','inventory.reserve','inventory.receive','inventory.ship','inventory.use','procurement.read'];
const manager:Actor={companyId:'company',userId:'manager',roles:['STOREKEEPER'],permissions:[...rights,'scope.company'],siteIds:[],customerIds:[],warehouseIds:[]};
const worker:Actor={...manager,userId:'worker',roles:['EMPLOYEE'],permissions:['inventory.request','inventory.read','inventory.receive','inventory.use'],siteIds:['site-a'],warehouseIds:[]};
const registry={...resourcesCommands,...createMaterialRequestBatchCommands(resourcesCommands)};
function context(tx:Memory,actor=manager,expectedVersion?:number):CommandContext{return {tx,actor,now:NOW,expectedVersion,idempotencyKey:'cpu-fixture',forPermission:async permission=>{if(!actor.permissions.includes(permission))throw new DomainError('ACCESS_DENIED');return context(tx,actor);},requireSite:site=>{if(!actor.permissions.includes('scope.company')&&!actor.siteIds.includes(site))throw new DomainError('ACCESS_DENIED');},requireOwn:subject=>{if(subject!==actor.userId&&!actor.permissions.includes('scope.company'))throw new DomainError('ACCESS_DENIED');}};}
async function run(tx:Memory,name:string,input:Data,actor=manager,expected?:number){const before=structuredClone(tx.rows),events=structuredClone(tx.events);try{const definition=registry[name];if(!actor.permissions.includes(definition.permission))throw new DomainError('ACCESS_DENIED');return await definition.handler(context(tx,actor,expected),definition.schema.parse(input));}catch(error){tx.rows=before;tx.events=events;throw error;}}
async function fixture(){
 const tx=new Memory();for(const id of ['worker','manager'])await tx.add('user',{active:true},id);
 for(const id of ['site-a','site-b']){await tx.add('site',{active:true},id);await tx.add('task',{siteId:id,state:'IN_PROGRESS'},`task-${id}`);}
 const liquid=await run(tx,'material.create',{sku:'LIQUID',name:'Synthetic liquid',baseUnit:'ml',packagingBase:1000}),pieces=await run(tx,'material.create',{sku:'PARTS',name:'Synthetic parts',baseUnit:'pcs',packagingBase:1});
 const main=await run(tx,'stock_location.create',{name:'Main',type:'WAREHOUSE'}),site=await run(tx,'stock_location.create',{name:'A',type:'SITE',siteId:'site-a'}),other=await run(tx,'stock_location.create',{name:'B',type:'SITE',siteId:'site-b'});
 await run(tx,'stock.receive',{materialId:liquid.id,locationId:main.id,quantity:'10',unit:'l',reference:'liquid-receipt',actualCostCents:1000});await run(tx,'stock.receive',{materialId:pieces.id,locationId:main.id,quantity:'20',unit:'pcs',reference:'parts-receipt',actualCostCents:2000});
 const lines=[{materialId:liquid.id,siteId:'site-a',taskId:'task-site-a',quantity:'4',unit:'l',needBy:DUE,reason:'Required cleaning material'},{materialId:pieces.id,siteId:'site-a',taskId:'task-site-a',quantity:'3',unit:'pcs',needBy:DUE,reason:'Required physical parts'}];
 return {tx,liquid,pieces,main,site,other,lines};
}
async function approved(f:Awaited<ReturnType<typeof fixture>>,lines:Data[]=f.lines){const batch=await run(f.tx,'request.batch.create',{lines,reason:'Synthetic multiple SKU request'},worker);await run(f.tx,'request.batch.submit',{batchRequestId:batch.id},worker);await run(f.tx,'request.batch.approve',{batchRequestId:batch.id,lines:batch.data.lineIds.map((requestId:string)=>({requestId,decision:'APPROVE'}))});return run(f.tx,'request.batch.view',{batchRequestId:batch.id});}
async function deliver(f:Awaited<ReturnType<typeof fixture>>,line:Data,quantity:string,unit='l',acceptActor=worker){const transfer=await run(f.tx,'stock.ship',{materialId:line.materialId,sourceId:f.main.id,targetId:f.site.id,requestId:line.requestId,quantity,unit});await run(f.tx,'stock.accept',{transferId:transfer.id,quantity,unit},acceptActor);return transfer;}

describe('parent/line material requests over genuine existing handlers (CPU double)',()=>{
 it('creates exact heterogeneous SKU lines with canonical original units and fresh per-line context while preserving single-line resources',async()=>{
  const f=await fixture(),batch=await run(f.tx,'request.batch.create',{lines:f.lines,reason:'Exact batch request'},worker);
  expect(batch.data).toMatchObject({approvalState:'DRAFT',fulfillmentState:'OPEN',employeeId:'worker',siteIds:['site-a']});expect(batch.data.lines).toEqual(expect.arrayContaining([expect.objectContaining({sku:'LIQUID',quantity:'4',unit:'l',baseUnit:'ml',requestedBase:4000,approvedBase:0}),expect.objectContaining({sku:'PARTS',quantity:'3',unit:'pcs',baseUnit:'pcs',requestedBase:3,approvedBase:0})]));
  expect((await f.tx.list('material_request')).every(line=>line.data.batchRequestId===batch.id)).toBe(true);expect((await f.tx.list('stock_movement')).length).toBe(2);
  const standalone=await run(f.tx,'request.create',{materialId:f.liquid.id,siteId:'site-a',quantity:'1',unit:'l',dueAt:DUE,reason:'Existing single line request'},worker);expect(standalone.data).not.toHaveProperty('batchRequestId');
 });
 it.each(['foreign-site','foreign-task','incompatible-unit','fractional-base','missing-material'])('atomically rejects a later %s line without leaving a parent, child, demand or event',(failure)=>{
  return fixture().then(async f=>{const lines=structuredClone(f.lines),second=lines[1] as Data;if(failure==='foreign-site')second.siteId='site-b';if(failure==='foreign-task')second.taskId='task-site-b';if(failure==='incompatible-unit')second.unit='kg';if(failure==='fractional-base')second.quantity='0.5';if(failure==='missing-material')second.materialId='absent';const before=structuredClone(f.tx.rows),events=structuredClone(f.tx.events);await expect(run(f.tx,'request.batch.create',{lines,reason:'Invalid later line'},worker)).rejects.toThrow();expect(f.tx.rows).toEqual(before);expect(f.tx.events).toEqual(events);});
 });
 it('enforces full submitted line set, separate beneficiary approval and parent version before any child effect',async()=>{
  const f=await fixture(),batch=await run(f.tx,'request.batch.create',{lines:f.lines,reason:'Complete request'},worker),inputs=batch.data.lineIds.map((requestId:string)=>({requestId,decision:'APPROVE'}));
  await expect(run(f.tx,'request.batch.approve',{batchRequestId:batch.id,lines:inputs})).rejects.toMatchObject({code:'INVALID_STATE'});await run(f.tx,'request.batch.submit',{batchRequestId:batch.id},worker);
  await expect(run(f.tx,'request.batch.approve',{batchRequestId:batch.id,lines:inputs},{...worker,permissions:[...worker.permissions,'inventory.approve']})).rejects.toMatchObject({code:'SELF_APPROVAL_DENIED'});
  await expect(run(f.tx,'request.batch.approve',{batchRequestId:batch.id,lines:inputs.slice(0,1)})).rejects.toMatchObject({code:'INVALID_REFERENCE'});
  const before=structuredClone(f.tx.rows);await expect(run(f.tx,'request.batch.approve',{batchRequestId:batch.id,lines:inputs},manager,1)).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect(f.tx.rows).toEqual(before);
 });
 it('keeps per-line partial/rejected approvals independent of fulfillment and preserves requested quantities',async()=>{
  const f=await fixture(),batch=await run(f.tx,'request.batch.create',{lines:f.lines,reason:'Mixed material approval'},worker);await run(f.tx,'request.batch.submit',{batchRequestId:batch.id},worker);
  const result=await run(f.tx,'request.batch.approve',{batchRequestId:batch.id,lines:[{requestId:batch.data.lineIds[0],decision:'PARTIAL',approvedBase:2000,reason:'Only two liters approved'},{requestId:batch.data.lineIds[1],decision:'REJECT',reason:'Parts not currently required'}]});
  expect(result.data).toMatchObject({approvalState:'PARTIAL',fulfillmentState:'OPEN'});expect(result.data.lines.map((line:Data)=>[line.requestedBase,line.approvedBase,line.approvalState])).toEqual([[4000,2000,'PARTIAL'],[3,0,'REJECTED']]);
 });
 it('generic existing submit/approve commands maintain authoritative parent approval without a second executor',async()=>{
  const f=await fixture(),batch=await run(f.tx,'request.batch.create',{lines:f.lines,reason:'Generic channel compatibility'},worker);
  for(const requestId of batch.data.lineIds)await run(f.tx,'request.submit',{requestId},worker);for(const requestId of batch.data.lineIds)await run(f.tx,'request.approve',{requestId,decision:'APPROVE'});
  expect((await f.tx.get('material_request_batch',batch.id)).data.approvalState).toBe('APPROVED');expect((await f.tx.list('material_request')).map(line=>line.data.approvalState)).toEqual(['APPROVED','APPROVED']);
 });
 it('records actual partial receipt, usage and confirmed return with immutable provenance and no duplicated issued quantity',async()=>{
  const f=await fixture(),batch=await approved(f,[f.lines[0]]),line=batch.data.lines[0];
  const res=await run(f.tx,'reservation.create',{materialId:f.liquid.id,locationId:f.main.id,requestId:line.requestId,quantity:'4',unit:'l',expiresAt:DUE});
  const transfer=await run(f.tx,'stock.ship',{materialId:f.liquid.id,sourceId:f.main.id,targetId:f.site.id,requestId:line.requestId,reservationId:res.id,quantity:'2',unit:'l'});
  await run(f.tx,'stock.accept',{transferId:transfer.id,quantity:'1',unit:'l'},worker);
  let facts=(await run(f.tx,'request.batch.view',{batchRequestId:batch.id})).data.lines[0];expect(facts).toMatchObject({requestedBase:4000,approvedBase:4000,reservedBase:2000,issuedBase:2000,receivedBase:1000,inTransitBase:1000,usedBase:0,returnedBase:0});
  await run(f.tx,'request.line.use',{requestId:line.requestId,locationId:f.site.id,quantity:'0.5',unit:'l',taskId:'task-site-a',reference:'line-use'},worker);
  const returned=await run(f.tx,'request.line.return',{requestId:line.requestId,sourceId:f.site.id,targetId:f.main.id,quantity:'0.5',unit:'l',reason:'Unused portion returned'});
  facts=(await run(f.tx,'request.batch.view',{batchRequestId:batch.id})).data.lines[0];expect(facts).toMatchObject({issuedBase:2000,receivedBase:1000,usedBase:500,returnedBase:0,returnInTransitBase:500});
  await run(f.tx,'stock.accept',{transferId:returned.id,quantity:'0.5',unit:'l'});facts=(await run(f.tx,'request.batch.view',{batchRequestId:batch.id})).data.lines[0];expect(facts).toMatchObject({issuedBase:2000,usedBase:500,returnedBase:500,returnInTransitBase:0});
  const usage=(await f.tx.list('material_usage'))[0],moves=await f.tx.list('stock_movement');expect(usage.data).toMatchObject({requestId:line.requestId,batchRequestId:batch.id});expect(moves.filter(row=>row.data.usageId===usage.id)).toHaveLength(1);expect(moves.filter(row=>row.data.usageId===usage.id)[0].version).toBe(1);expect(moves.filter(row=>row.data.returnRequestId===line.requestId).every(row=>row.version===1&&row.data.movementPurpose==='RETURN')).toBe(true);
  expect((await stockBalance(context(f.tx),f.liquid.id,f.main.id)).physicalBase).toBe(8500);expect((await stockBalance(context(f.tx),f.liquid.id,f.site.id)).physicalBase).toBe(0);
 });
 it('generic stock.use/ship channels cannot bypass received allocation or double-count pending returns',async()=>{
  const f=await fixture(),batch=await approved(f,[f.lines[0]]),line=batch.data.lines[0];await deliver(f,line,'1');
  await run(f.tx,'stock.receive',{materialId:f.liquid.id,locationId:f.other.id,quantity:'2',unit:'l',reference:'other-site-supply'});
  await expect(run(f.tx,'stock.use',{materialId:f.liquid.id,requestId:line.requestId,locationId:f.other.id,quantity:'1',unit:'l',taskId:'task-site-a',reference:'foreign-context'})).rejects.toMatchObject({code:'INVALID_REFERENCE'});
  await expect(run(f.tx,'stock.use',{materialId:f.liquid.id,requestId:line.requestId,locationId:f.site.id,quantity:'2',unit:'l',taskId:'task-site-a',reference:'over-allocation'},worker)).rejects.toMatchObject({code:'REQUEST_ALLOCATION_EXCEEDS_RECEIVED'});
  await run(f.tx,'stock.ship',{materialId:f.liquid.id,returnRequestId:line.requestId,sourceId:f.site.id,targetId:f.main.id,quantity:'1',unit:'l',reason:'Actual return'});
  await expect(run(f.tx,'stock.ship',{materialId:f.liquid.id,returnRequestId:line.requestId,sourceId:f.site.id,targetId:f.main.id,quantity:'0.1',unit:'l',reason:'Duplicate return'})).rejects.toThrow();
  await expect(run(f.tx,'stock.use',{materialId:f.liquid.id,requestId:line.requestId,locationId:f.site.id,quantity:'0.1',unit:'l',taskId:'task-site-a',reference:'consume-returned'},worker)).rejects.toMatchObject({code:'REQUEST_ALLOCATION_EXCEEDS_RECEIVED'});
 });
 it('blocks closure with unresolved shipment/return transit even when future remaining demand is explicitly cancelled',async()=>{
  const f=await fixture(),batch=await approved(f,[f.lines[0]]),line=batch.data.lines[0];await run(f.tx,'stock.ship',{materialId:f.liquid.id,sourceId:f.main.id,targetId:f.site.id,requestId:line.requestId,quantity:'1',unit:'l'});
  const before=structuredClone(f.tx.rows);await expect(run(f.tx,'request.batch.close',{batchRequestId:batch.id,reason:'Cannot hide physical transit',cancelRemaining:true,custodyReason:'Responsible employee keeps stock'})).rejects.toMatchObject({code:'REQUEST_OBLIGATIONS_UNSETTLED'});expect(f.tx.rows).toEqual(before);
 });
 it('requires documented recipient discrepancy resolution after real delivery and refuses invented receipt reconciliation',async()=>{
  const f=await fixture(),batch=await approved(f,[f.lines[0]]),line=batch.data.lines[0];await deliver(f,line,'4','l',manager);
  await run(f.tx,'request.ack',{requestId:line.requestId,quantity:'2',unit:'l',decision:'DISCREPANCY',reason:'Only portion counted'},worker);
  await expect(run(f.tx,'request.line.resolve_discrepancy',{requestId:line.requestId,reason:'Cannot invent missing acknowledgment'})).rejects.toMatchObject({code:'INVALID_STATE'});
  await run(f.tx,'request.ack',{requestId:line.requestId,quantity:'2',unit:'l',decision:'RECEIVED'},worker);
  await expect(run(f.tx,'request.batch.close',{batchRequestId:batch.id,reason:'Old discrepancy remains',custodyReason:'Owned material retained'})).rejects.toMatchObject({code:'REQUEST_OBLIGATIONS_UNSETTLED'});
  await run(f.tx,'request.line.resolve_discrepancy',{requestId:line.requestId,reason:'Actual full receipt checked independently'});
  expect((await run(f.tx,'request.batch.close',{batchRequestId:batch.id,reason:'Request delivery settled',custodyReason:'Worker retains allocated stock for assigned task'})).data.fulfillmentState).toBe('CLOSED');
 });
 it('cancels only future unissued remainder and releases actual reservation, preserving approval and all receipt/movement facts',async()=>{
  const f=await fixture(),batch=await approved(f,[f.lines[0]]),line=batch.data.lines[0];const reservation=await run(f.tx,'reservation.create',{materialId:f.liquid.id,locationId:f.main.id,requestId:line.requestId,quantity:'4',unit:'l',expiresAt:DUE});const shipment=await run(f.tx,'stock.ship',{materialId:f.liquid.id,sourceId:f.main.id,targetId:f.site.id,requestId:line.requestId,reservationId:reservation.id,quantity:'1',unit:'l'});await run(f.tx,'stock.accept',{transferId:shipment.id,quantity:'1',unit:'l'},worker);
  const moves=await f.tx.list('stock_movement');await expect(run(f.tx,'request.batch.close',{batchRequestId:batch.id,reason:'Future remainder cancelled',cancelRemaining:true,custodyReason:'Worker keeps delivered liter'},{...manager,permissions:manager.permissions.filter(right=>right!=='inventory.reserve')})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const closed=await run(f.tx,'request.batch.close',{batchRequestId:batch.id,reason:'Future remainder cancelled',cancelRemaining:true,custodyReason:'Worker keeps delivered liter'});expect(closed.data.lines[0]).toMatchObject({requestedBase:4000,approvedBase:4000,issuedBase:1000,receivedBase:1000,cancelledUnissuedBase:3000,reservedBase:0,outstandingBase:0});expect(closed.data.custodyRetained[0]).toMatchObject({employeeId:'worker',quantityBase:1000});expect((await f.tx.get('stock_reservation',reservation.id)).data.state).toBe('RELEASED');expect(await f.tx.list('stock_movement')).toEqual(moves);
  await expect(run(f.tx,'stock.ship',{materialId:f.liquid.id,requestId:line.requestId,sourceId:f.main.id,targetId:f.site.id,quantity:'1',unit:'l'})).rejects.toMatchObject({code:'INVALID_STATE'});
  expect((await run(f.tx,'procurement.calculate',{materialId:f.liquid.id,locationIds:[f.main.id],horizonAt:DUE})).newUnreservedDemand).toBe(0);
 });
 it('allows legitimate documented custody while requiring explicitly declared return obligations to be physically settled',async()=>{
  const f=await fixture(),batch=await approved(f,[{...f.lines[0],returnRequired:true}]),line=batch.data.lines[0];await deliver(f,line,'4');
  await expect(run(f.tx,'request.batch.close',{batchRequestId:batch.id,reason:'Return obligation cannot be waived by custody reason',custodyReason:'Wanted to retain all material'})).rejects.toMatchObject({code:'REQUEST_OBLIGATIONS_UNSETTLED'});
  const transfer=await run(f.tx,'request.line.return',{requestId:line.requestId,sourceId:f.site.id,targetId:f.main.id,quantity:'4',unit:'l',reason:'Required unused material returned'});await run(f.tx,'stock.accept',{transferId:transfer.id,quantity:'4',unit:'l'});
  expect((await run(f.tx,'request.batch.close',{batchRequestId:batch.id,reason:'Return obligation settled'})).data.lines[0]).toMatchObject({returnedBase:4000,custodyBase:0,returnObligationBase:0});
 });
 it('requires custody owner/reason at closure without inventing mandatory consumption of all received goods',async()=>{
  const f=await fixture(),batch=await approved(f,[f.lines[0]]);await deliver(f,batch.data.lines[0],'4');
  await expect(run(f.tx,'request.batch.close',{batchRequestId:batch.id,reason:'Delivered stock remains in employee custody'})).rejects.toMatchObject({code:'CUSTODY_REASON_REQUIRED'});
  const closed=await run(f.tx,'request.batch.close',{batchRequestId:batch.id,reason:'Request delivery fulfilled',custodyReason:'Kept for assigned cleaning task'});expect(closed.data.lines[0]).toMatchObject({usedBase:0,returnedBase:0,custodyBase:4000});expect(closed.data.custodyRetained[0]).toMatchObject({employeeId:'worker',reason:'Kept for assigned cleaning task'});
  await expect(run(f.tx,'request.close',{requestId:batch.data.lineIds[0],reason:'Bypass parent obligation review'})).rejects.toMatchObject({code:'BATCH_CLOSE_REQUIRED'});
 });
 it('binds a material requirement once across requests and does not add parent quantities to purchase demand',async()=>{
  const f=await fixture();await f.tx.add('material_requirement',{siteId:'site-a',materialId:f.liquid.id,quantityBase:4000},'requirement');const lines=[{...f.lines[0],materialRequirementId:'requirement'}],batch=await approved(f,lines);
  await expect(run(f.tx,'request.batch.create',{lines,reason:'Duplicate task/requirement demand'},worker)).rejects.toMatchObject({code:'DUPLICATE_EFFECT'});
  const p=await run(f.tx,'procurement.calculate',{materialId:f.liquid.id,locationIds:[f.main.id],horizonAt:DUE});expect(p.newUnreservedDemand).toBe(4000);expect(p.demandRows.map((row:Data)=>row.requestId)).toEqual(batch.data.lineIds);
 });
 it('checks every site on parent reads and inner delegated rights without granting cross-site or new wildcard authority',async()=>{
  const f=await fixture(),batch=await run(f.tx,'request.batch.create',{lines:[f.lines[0],{...f.lines[1],siteId:'site-b',taskId:'task-site-b'}],reason:'Explicit multi-site manager request'});
  await expect(run(f.tx,'request.batch.view',{batchRequestId:batch.id},worker)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const approvedBatch=await approved(f,[f.lines[0]]),line=approvedBatch.data.lines[0];await deliver(f,line,'1');await expect(run(f.tx,'request.line.return',{requestId:line.requestId,sourceId:f.site.id,targetId:f.main.id,quantity:'1',unit:'l',reason:'No shipment permission'},worker)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const actualInner=resourcesCommands['request.create'];const restricted=createMaterialRequestBatchCommands({...resourcesCommands,'request.create':{...actualInner,permission:'inventory.superuser'}});await expect(restricted['request.batch.create'].handler(context(f.tx,worker),restricted['request.batch.create'].schema.parse({lines:[f.lines[0]],reason:'Missing explicit inner authority'}))).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('bounds line count and refuses duplicated material requirement identity before mutation',async()=>{
  const f=await fixture();expect(()=>registry['request.batch.create'].schema.parse({lines:Array.from({length:101},()=>f.lines[0]),reason:'Too many lines'})).toThrow();await expect(run(f.tx,'request.batch.create',{lines:[{...f.lines[0],materialRequirementId:'same'},{...f.lines[1],materialRequirementId:'same'}],reason:'Duplicated requirement identity'},worker)).rejects.toMatchObject({code:'DUPLICATE_EFFECT'});
 });
 it('preserves active reservations when a direct host lacks trusted distinct-permission scope rebuilding',async()=>{
  const f=await fixture(),batch=await approved(f,[f.lines[0]]);await run(f.tx,'reservation.create',{materialId:f.liquid.id,locationId:f.main.id,requestId:batch.data.lineIds[0],quantity:'4',unit:'l',expiresAt:DUE});
  const ctx=context(f.tx);delete ctx.forPermission;const before=structuredClone(f.tx.rows),definition=registry['request.batch.close'];await expect(definition.handler(ctx,definition.schema.parse({batchRequestId:batch.id,reason:'No authority to borrow approval scope',cancelRemaining:true}))).rejects.toMatchObject({code:'MISSING_CONFIGURATION',details:{reason:'SCOPED_COMMAND_AUTHORITY_REQUIRED'}});expect(f.tx.rows).toEqual(before);
 });
});
