import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {type Actor,type Data,type Entity} from '../packages/domain/core.ts';

// Real company-locked PostgreSQL Engine/receipts/outbox. Missing DATABASE_URL
// means NOT_RUN. Cases use distinct companies, migrate once and close their
// connection pool; no global truncate/delete can interfere with parallel tests.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
postgres('V4 multi-SKU MaterialRequest parent/line transactions (real PostgreSQL)',()=>{
 let db:Database,engine:Engine,company:string,store:Actor,worker:Actor,worker2:Actor,outsider:Actor;
 const due=()=>new Date(Date.now()+86400000).toISOString();
 const call=(actor:Actor,name:string,input:Data,key=randomUUID(),version?:number)=>engine.execute(actor,name,{input,idempotency_key:key,expected_version:version});
 const list=(kind:string)=>db.transaction(company,'SYNTHETIC_MATERIAL_ASSERT',tx=>tx.list(kind));
 const get=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_MATERIAL_ASSERT',tx=>tx.get(kind,id));
 const lines=()=>[{materialId:'liquid',siteId:'site-a',taskId:'task-a',quantity:'2',unit:'l',needBy:due(),reason:'Synthetic liquid required'},{materialId:'parts',siteId:'site-a',taskId:'task-a',quantity:'3',unit:'pcs',needBy:due(),reason:'Synthetic parts required'}];
 beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
 beforeEach(async()=>{
  company=`material-batch-v4-${randomUUID()}`;
  await db.transaction(company,'SYNTHETIC_MATERIAL_FIXTURE',async tx=>{
   await tx.add('company',{operatingMode:'TEST',synthetic:true},company);
   for(const id of ['site-a','site-b'])await tx.add('site',{active:true,name:'Synthetic '+id},id);
   await tx.add('task',{siteId:'site-a',state:'IN_PROGRESS',title:'Synthetic material task'},'task-a');await tx.add('task',{siteId:'site-b',state:'IN_PROGRESS',title:'Private other site'},'task-b');
   await tx.add('user',{active:true,roles:['STOREKEEPER'],siteIds:['site-a'],warehouseIds:['main'],permissions:['procurement.read']},'store');
   for(const id of ['worker','worker2'])await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:['site-a'],permissions:[]},id);
   await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:['site-b'],permissions:[]},'outsider');
   await tx.add('stock_location',{name:'Synthetic main',type:'WAREHOUSE'},'main');await tx.add('stock_location',{name:'Synthetic site',type:'SITE',siteId:'site-a'},'site-store');
   await tx.add('material',{sku:'LIQUID',name:'Synthetic liquid',baseUnit:'ml',packagingBase:1000,minimumBase:0,supplierIds:[],approvedAnalogIds:[],materialType:'CONSUMABLE',valuationMethod:'MOVING_WEIGHTED_AVERAGE',conversions:[{unit:'ml',numerator:1,denominator:1},{unit:'l',numerator:1000,denominator:1},{unit:'package',numerator:1000,denominator:1}]},'liquid');
   await tx.add('material',{sku:'PARTS',name:'Synthetic parts',baseUnit:'pcs',packagingBase:1,minimumBase:0,supplierIds:[],approvedAnalogIds:[],materialType:'CONSUMABLE',valuationMethod:'MOVING_WEIGHTED_AVERAGE',conversions:[{unit:'pcs',numerator:1,denominator:1},{unit:'package',numerator:1,denominator:1}]},'parts');
  });
  [store,worker,worker2,outsider]=await Promise.all(['store','worker','worker2','outsider'].map(id=>engine.getActor(id,company)));
  await call(store,'stock.receive',{materialId:'liquid',locationId:'main',quantity:'5',unit:'l',reference:'synthetic-opening-liquid',actualCostCents:500});await call(store,'stock.receive',{materialId:'parts',locationId:'main',quantity:'10',unit:'pcs',reference:'synthetic-opening-parts',actualCostCents:1000});
 });
 afterAll(async()=>{await db?.close();});
 async function approved(input:Data[]=lines(),actor=worker){const batch=await call(actor,'request.batch.create',{lines:input,reason:'Synthetic multi-SKU request'});await call(actor,'request.batch.submit',{batchRequestId:batch.id});await call(store,'request.batch.approve',{batchRequestId:batch.id,lines:batch.data.lineIds.map((requestId:string)=>({requestId,decision:'APPROVE'}))});return call(actor,'request.batch.view',{batchRequestId:batch.id});}
 async function deliver(line:Data,quantity:string,unit='l',recipient=worker){const transfer=await call(store,'stock.ship',{materialId:line.materialId,requestId:line.requestId,sourceId:'main',targetId:'site-store',quantity,unit});await call(recipient,'stock.accept',{transferId:transfer.id,quantity,unit});return transfer;}

 it('real create/replay commits one parent/two genuine children, atomic receipt/audit/outbox and exact per-SKU base units',async()=>{
  const input={lines:lines(),reason:'Actual SQL multi-SKU creation'},key=randomUUID(),batch=await call(worker,'request.batch.create',input,key);expect(await call(worker,'request.batch.create',input,key)).toEqual(batch);
  expect(await list('material_request_batch')).toHaveLength(1);expect(await list('material_request')).toHaveLength(2);expect(batch.data.lines.map((line:Data)=>[line.materialId,line.requestedBase])).toEqual([['liquid',2000],['parts',3]]);
  expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='material_request_batch.created'",[company])).rows).toHaveLength(1);expect((await db.query("SELECT id FROM audit_log WHERE company_id=$1 AND action='COMMAND:request.batch.create'",[company])).rows).toHaveLength(1);expect((await db.query('SELECT idempotency_key FROM command_receipts WHERE company_id=$1 AND idempotency_key=$2',[company,key])).rows).toHaveLength(1);
  await expect(call(worker,'request.batch.create',{...input,reason:'Different payload same key'},key)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});expect(await list('material_request')).toHaveLength(2);
 });
 it('later invalid SKU/task or forbidden site leaves no parent/child/receipt/outbox effects in real SQL',async()=>{
  const input=lines();input[1]={...input[1],taskId:'task-b'};const before=(await db.query('SELECT count(*) AS count FROM outbox WHERE company_id=$1',[company])).rows[0].count,key=randomUUID();
  await expect(call(worker,'request.batch.create',{lines:input,reason:'Invalid later task context'},key)).rejects.toMatchObject({code:'INVALID_REFERENCE'});expect(await list('material_request_batch')).toEqual([]);expect(await list('material_request')).toEqual([]);expect((await db.query('SELECT 1 FROM command_receipts WHERE company_id=$1 AND idempotency_key=$2',[company,key])).rows).toEqual([]);expect((await db.query('SELECT count(*) AS count FROM outbox WHERE company_id=$1',[company])).rows[0].count).toBe(before);
  await expect(call(worker,'request.batch.create',{lines:[{...lines()[0],siteId:'site-b',taskId:'task-b'}],reason:'Wrong site scope'})).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('real fresh site revocation and foreign actor cannot read/replay a cached private parent or its line details',async()=>{
  const input={lines:lines(),reason:'Private scoped request'},key=randomUUID(),batch=await call(worker,'request.batch.create',input,key);expect((await engine.readEntities(worker,'material_request_batch')).map(row=>row.id)).toContain(batch.id);expect(await engine.readEntities(outsider,'material_request_batch')).toEqual([]);await expect(call(outsider,'request.batch.view',{batchRequestId:batch.id})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await db.transaction(company,'SYNTHETIC_MATERIAL_FIXTURE',async tx=>{const user=await tx.get('user',worker.userId);await tx.save(user,{...user.data,siteIds:[]});});
  expect(await engine.readEntities(worker,'material_request_batch')).toEqual([]);await expect(call(worker,'request.batch.create',input,key)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const foreign=await db.transaction('material-foreign-'+randomUUID(),'SYNTHETIC_MATERIAL_FIXTURE',async tx=>{await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:['site-a']},'worker');return engine.actorIn(tx,'worker');});
  expect(await engine.readEntities(foreign,'material_request_batch')).toEqual([]);
 });
 it('competing genuine reservations cannot both consume four liters of the same five-liter stock',async()=>{
  const a=await approved([{...lines()[0],quantity:'4'}],worker),b=await approved([{...lines()[0],quantity:'4'}],worker2),results=await Promise.allSettled([a,b].map(batch=>call(store,'reservation.create',{materialId:'liquid',locationId:'main',requestId:batch.data.lineIds[0],quantity:'4',unit:'l',expiresAt:due()})));
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect((results.find(result=>result.status==='rejected') as PromiseRejectedResult).reason).toMatchObject({code:'INSUFFICIENT_STOCK'});expect(await list('stock_reservation')).toHaveLength(1);expect(await call(store,'stock.balance',{materialId:'liquid',locationId:'main'})).toMatchObject({physicalBase:5000,reservedBase:4000,freeBase:1000});
 });
 it('real partial receipt/usage/return records original ledger provenance and only counts physical confirmed returns',async()=>{
  const batch=await approved([lines()[0]]),line=batch.data.lines[0];await deliver(line,'2');const usage=await call(worker,'request.line.use',{requestId:line.requestId,locationId:'site-store',quantity:'0.5',unit:'l',taskId:'task-a',reference:'actual-line-usage'}),returned=await call(store,'request.line.return',{requestId:line.requestId,sourceId:'site-store',targetId:'main',quantity:'0.5',unit:'l',reason:'Unused allocation returned'});
  let view=await call(worker,'request.batch.view',{batchRequestId:batch.id});expect(view.data.lines[0]).toMatchObject({issuedBase:2000,receivedBase:2000,usedBase:500,returnedBase:0,returnInTransitBase:500});await call(store,'stock.accept',{transferId:returned.id,quantity:'0.5',unit:'l'});view=await call(worker,'request.batch.view',{batchRequestId:batch.id});expect(view.data.lines[0]).toMatchObject({issuedBase:2000,usedBase:500,returnedBase:500,custodyBase:1000});
  const movements=(await list('stock_movement')).filter(row=>row.data.requestId===line.requestId||row.data.returnRequestId===line.requestId);expect(movements.every(row=>row.version===1&&row.data.batchRequestId===batch.id)).toBe(true);expect(movements.find(row=>row.data.usageId===usage.id)?.data.requestId).toBe(line.requestId);expect((await get('material_usage',usage.id)).data).toMatchObject({requestId:line.requestId,batchRequestId:batch.id});
  const history=(await db.query("SELECT version,data FROM aggregate_revisions WHERE company_id=$1 AND kind='stock_movement' AND id=ANY($2::text[])",[company,movements.map(row=>row.id)])).rows;expect(history).toHaveLength(movements.length);expect(history.every(row=>row.version===1)).toBe(true);
 });
 it('concurrent genuine usage cannot allocate three liters from a two-liter received line and retry records no second ledger fact',async()=>{
  const batch=await approved([lines()[0]]),line=batch.data.lines[0];await deliver(line,'2');const input={requestId:line.requestId,locationId:'site-store',quantity:'1.5',unit:'l',taskId:'task-a',reference:'first-use'},key=randomUUID(),results=await Promise.allSettled([call(worker,'request.line.use',input,key),call(worker,'request.line.use',{...input,reference:'second-use'})]);
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect((results.find(result=>result.status==='rejected') as PromiseRejectedResult).reason).toMatchObject({code:'REQUEST_ALLOCATION_EXCEEDS_RECEIVED'});expect(await list('material_usage')).toHaveLength(1);const first=results[0];if(first.status==='fulfilled')expect(await call(worker,'request.line.use',input,key)).toEqual(first.value);
  expect((await call(worker,'request.batch.view',{batchRequestId:batch.id})).data.lines[0]).toMatchObject({receivedBase:2000,usedBase:1500,custodyBase:500});expect(await call(store,'stock.balance',{materialId:'liquid',locationId:'site-store'})).toMatchObject({physicalBase:500,freeBase:500});
 });
 it('actual cancellation releases only unissued reservation, retains approved history/custody and blocks future generic shipment',async()=>{
  const batch=await approved([{...lines()[0],quantity:'4'}]),line=batch.data.lines[0],res=await call(store,'reservation.create',{materialId:'liquid',locationId:'main',requestId:line.requestId,quantity:'4',unit:'l',expiresAt:due()}),transfer=await call(store,'stock.ship',{materialId:'liquid',sourceId:'main',targetId:'site-store',requestId:line.requestId,reservationId:res.id,quantity:'1',unit:'l'});await call(worker,'stock.accept',{transferId:transfer.id,quantity:'1',unit:'l'});const movements=await list('stock_movement');
  const closed=await call(store,'request.batch.close',{batchRequestId:batch.id,reason:'Unissued need withdrawn',cancelRemaining:true,custodyReason:'Delivered liter remains with assigned employee'});expect(closed.data.lines[0]).toMatchObject({approvedBase:4000,cancelledUnissuedBase:3000,issuedBase:1000,receivedBase:1000,reservedBase:0});expect(closed.data.custodyRetained[0]).toMatchObject({employeeId:'worker',quantityBase:1000});expect((await get('stock_reservation',res.id)).data.state).toBe('RELEASED');expect(await list('stock_movement')).toEqual(movements);
  await expect(call(store,'stock.ship',{materialId:'liquid',sourceId:'main',targetId:'site-store',requestId:line.requestId,quantity:'1',unit:'l'})).rejects.toMatchObject({code:'INVALID_STATE'});expect((await call(store,'procurement.calculate',{materialId:'liquid',locationIds:['main'],horizonAt:due()})).newUnreservedDemand).toBe(0);
 });
 it('actual closure cannot hide transit or explicit return obligation, and stale parent approval is atomic',async()=>{
  const batch=await approved([{...lines()[0],returnRequired:true}]),line=batch.data.lines[0],transfer=await call(store,'stock.ship',{materialId:'liquid',sourceId:'main',targetId:'site-store',requestId:line.requestId,quantity:'2',unit:'l'}),before=await get('material_request_batch',batch.id);
  await expect(call(store,'request.batch.close',{batchRequestId:batch.id,reason:'Cannot hide inbound transit',cancelRemaining:true,custodyReason:'No waiver'})).rejects.toMatchObject({code:'REQUEST_OBLIGATIONS_UNSETTLED'});expect(await get('material_request_batch',batch.id)).toEqual(before);await call(worker,'stock.accept',{transferId:transfer.id,quantity:'2',unit:'l'});await expect(call(store,'request.batch.close',{batchRequestId:batch.id,reason:'Cannot waive explicit return',custodyReason:'No waiver'})).rejects.toMatchObject({code:'REQUEST_OBLIGATIONS_UNSETTLED'});
  const returned=await call(store,'request.line.return',{requestId:line.requestId,sourceId:'site-store',targetId:'main',quantity:'2',unit:'l',reason:'Required material returned'});await call(store,'stock.accept',{transferId:returned.id,quantity:'2',unit:'l'});expect((await call(store,'request.batch.close',{batchRequestId:batch.id,reason:'Actual obligations settled'})).data.fulfillmentState).toBe('CLOSED');
  const draft=await call(worker,'request.batch.create',{lines:lines(),reason:'Version guard draft'});await call(worker,'request.batch.submit',{batchRequestId:draft.id});const state=await list('material_request');await expect(call(store,'request.batch.approve',{batchRequestId:draft.id,lines:draft.data.lineIds.map((requestId:string)=>({requestId,decision:'APPROVE'}))},randomUUID(),draft.version)).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect(await list('material_request')).toEqual(state);
 });
 it('requirement linkage dedup gives one child demand and preserves other company records without invented task demand',async()=>{
  await db.transaction(company,'SYNTHETIC_MATERIAL_FIXTURE',tx=>tx.add('material_requirement',{siteId:'site-a',materialId:'liquid',quantityBase:2000,source:'CONFIRMED_DISPATCH'},'requirement'));
  const input=[{...lines()[0],materialRequirementId:'requirement'}],batch=await approved(input);await expect(call(worker,'request.batch.create',{lines:input,reason:'Duplicate same requirement'})).rejects.toMatchObject({code:'DUPLICATE_EFFECT'});const forecast=await call(store,'procurement.calculate',{materialId:'liquid',locationIds:['main'],horizonAt:due()});expect(forecast.newUnreservedDemand).toBe(2000);expect(forecast.demandRows.map((row:Data)=>row.requestId)).toEqual(batch.data.lineIds);expect(await list('material_request')).toHaveLength(1);
 });
 it('permission-specific crossed delegation cannot borrow approval scope to release a reservation, then an exact fresh reserve grant succeeds',async()=>{
  const batch=await approved([{...lines()[0],quantity:'4'}]),line=batch.data.lines[0],reservation=await call(store,'reservation.create',{materialId:'liquid',locationId:'main',requestId:line.requestId,quantity:'4',unit:'l',expiresAt:due()});
  await db.transaction(company,'SYNTHETIC_MATERIAL_FIXTURE',async tx=>{
   await tx.add('user',{active:true,roles:['OWNER','STOREKEEPER'],siteIds:['site-a','site-b'],warehouseIds:['main','wrong-warehouse']},'grantor');await tx.add('user',{active:true,roles:['OWNER'],siteIds:[]},'grant-reviewer');await tx.add('user',{active:true,roles:['TEAM_LEADER'],siteIds:['site-b'],permissions:[]},'delegate');await tx.add('stock_location',{type:'WAREHOUSE',name:'Unrelated permitted warehouse'},'wrong-warehouse');
  });
  const grantor={...await engine.getActor('grantor',company),mfaVerified:true},reviewer={...await engine.getActor('grant-reviewer',company),mfaVerified:true},delegate=await engine.getActor('delegate',company);
  const grant=async(permissions:string[],siteIds:string[],warehouseIds:string[])=>{const drafted=await call(grantor,'delegation.create',{granteeId:'delegate',permissions,siteIds,warehouseIds,expiresAt:new Date(Date.now()+3600000).toISOString(),reason:'Explicit synthetic permission-specific scope'});return call(reviewer,'delegation.approve',{delegationId:drafted.id,confirmedHash:drafted.data.previewHash,reason:'Independent scope approval'});};
  await grant(['inventory.approve'],['site-a'],[]);await grant(['inventory.reserve'],['site-b'],['wrong-warehouse']);
  const beforeParent=await get('material_request_batch',batch.id),beforeLine=await get('material_request',line.requestId),beforeReservation=await get('stock_reservation',reservation.id),key=randomUUID(),input={batchRequestId:batch.id,reason:'Cancel only future unissued demand',cancelRemaining:true};
  await expect(call(delegate,'request.batch.close',input,key)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await get('material_request_batch',batch.id)).toEqual(beforeParent);expect(await get('material_request',line.requestId)).toEqual(beforeLine);expect(await get('stock_reservation',reservation.id)).toEqual(beforeReservation);expect((await db.query('SELECT 1 FROM command_receipts WHERE company_id=$1 AND actor_id=$2 AND idempotency_key=$3',[company,'delegate',key])).rows).toEqual([]);
  await grant(['inventory.reserve'],['site-a'],['main']);const closed=await call(delegate,'request.batch.close',input,key);expect(closed.data.fulfillmentState).toBe('CLOSED');expect(closed.data.lines[0]).toMatchObject({cancelledUnissuedBase:4000,reservedBase:0});expect((await get('stock_reservation',reservation.id)).data.state).toBe('RELEASED');
 });
 it('concurrent distinct request creators cannot bind and purchase the same material requirement twice',async()=>{
  await db.transaction(company,'SYNTHETIC_MATERIAL_FIXTURE',tx=>tx.add('material_requirement',{siteId:'site-a',materialId:'liquid',quantityBase:2000,source:'CONFIRMED_DISPATCH'},'requirement'));
  const input={lines:[{...lines()[0],materialRequirementId:'requirement'}],reason:'Same authoritative task requirement'},results=await Promise.allSettled([call(worker,'request.batch.create',input),call(worker2,'request.batch.create',input)]);
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect((results.find(result=>result.status==='rejected') as PromiseRejectedResult).reason).toMatchObject({code:'DUPLICATE_EFFECT'});expect(await list('material_request_batch')).toHaveLength(1);expect(await list('material_request')).toHaveLength(1);expect((await list('material_request'))[0].data.materialRequirementId).toBe('requirement');expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='material_request_batch.created'",[company])).rows).toHaveLength(1);
 });
});
