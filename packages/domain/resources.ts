import { createHash } from 'node:crypto';
import { z } from 'zod';
import { assert, CommandContext, CommandRegistry, Data, DomainError, Entity, id, timestamp as timestampInput } from './core';

const timestamp=timestampInput.transform(value=>new Date(value).toISOString());
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = integer.refine(v => v > 0, 'Must be positive');
const quantity = z.string().regex(/^\d+(?:\.\d{1,9})?$/).max(40);
const unit = z.enum(['ml','l','g','kg','pcs','pair','package']);
const qtyInput = { quantity, unit };
const barcode=z.string().trim().min(1).max(128).refine(v=>!v.toLowerCase().startsWith('knaba://'),'Reserved QR namespace');
const reason = z.string().min(3).max(2000);
const currency = z.literal('EUR').default('EUR');
const uniqueIds=z.array(id).max(200).refine(v=>new Set(v).size===v.length,'Duplicate identifiers');
export function canonicalReportJson(value:any):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(v=>v===undefined?'null':canonicalReportJson(v)).join(',')+']';return '{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonicalReportJson(value[key])).join(',')+'}';}
export function formatReportHours(seconds:number):string {assert(Number.isSafeInteger(seconds)&&seconds>=0,'INVALID_TIMESHEET');const hundredths=(BigInt(seconds)*100n+1800n)/3600n;return `${hundredths/100n}.${String(hundredths%100n).padStart(2,'0')}`;}
export const reportSnapshotHash=(data:unknown)=>createHash('sha256').update(canonicalReportJson(data)).digest('hex');
const digest=reportSnapshotHash;
const asInt = (n: bigint): number => { assert(n >= 0n && n <= BigInt(Number.MAX_SAFE_INTEGER),'VALIDATION_ERROR'); return Number(n); };
const ownOnly = (ctx:CommandContext,employeeId:string) => assert(ctx.actor.userId === employeeId,'ACCESS_DENIED');
const checked = async (ctx:CommandContext,kind:string,entityId:string) => {
  const e = await ctx.tx.get(kind,entityId);
  assert(e.companyId === ctx.actor.companyId,'NOT_FOUND_SAFE');
  return e;
};
const scopedLocation = async (ctx:CommandContext,locationId:string) => {
  const e = await checked(ctx,'stock_location',locationId);
  assert(e.data.type !== 'TRANSIT','ACCESS_DENIED');
  if(e.data.type === 'SITE') ctx.requireSite(e.data.siteId);
  else if(e.data.type === 'EMPLOYEE') ctx.requireOwn(e.data.employeeId);
  else assert(ctx.actor.permissions.includes('scope.company')||ctx.actor.warehouseIds.includes(locationId),'ACCESS_DENIED');
  return e;
};
const scopedRequest = async(ctx:CommandContext,requestId:string) => {
  const r=await checked(ctx,'material_request',requestId);ctx.requireSite(r.data.siteId);return r;
};
const conversionSchema = z.object({unit,numerator:positive,denominator:positive.default(1)}).strict();
export function exactBaseQuantity(material:Data,value:string,inputUnit:string,allowZero=false):number {
  assert(/^\d+(?:\.\d{1,9})?$/.test(value),'VALIDATION_ERROR');
  const conv = (material.conversions as Data[]).find(c=>c.unit===inputUnit);
  assert(conv,'UNIT_INCOMPATIBLE',{inputUnit,baseUnit:material.baseUnit});
  const [whole,fraction='']=value.split('.');
  const denominator=10n ** BigInt(fraction.length) * BigInt(conv.denominator);
  const numerator=BigInt(whole+fraction) * BigInt(conv.numerator);
  assert((allowZero?numerator>=0n:numerator>0n) && numerator % denominator===0n,'NON_INTEGRAL_BASE_QUANTITY');
  return asInt(numerator/denominator);
}
const materialQuantity = async(ctx:CommandContext,input:Data) => {
  const m=await checked(ctx,'material',input.materialId);
  return {material:m,base:exactBaseQuantity(m.data,input.quantity,input.unit)};
};
const usableBatch = async(ctx:CommandContext,materialId:string,batchId?:string) => {
  if(!batchId) return;
  const b=await checked(ctx,'material_batch',batchId);
  assert(b.data.materialId===materialId,'INVALID_REFERENCE');
  assert(b.data.status==='USABLE' && (!b.data.expiresAt||b.data.expiresAt>ctx.now),'STOCK_BLOCKED');
};
export async function stockBalance(ctx:CommandContext,materialId:string,locationId:string,batchId?:string) {
  const [moves,reservations,batches]=await Promise.all([ctx.tx.list('stock_movement'),ctx.tx.list('stock_reservation'),ctx.tx.list('material_batch')]);
  const blocked=new Set(batches.filter(b=>b.data.status!=='USABLE'||(b.data.expiresAt && b.data.expiresAt<=ctx.now)).map(b=>b.id));
  let physical=0,blockedBase=0;
  for(const m of moves) {
    const d=m.data;if(d.materialId!==materialId || (batchId!==undefined&&d.batchId!==batchId)) continue;
    const delta=(d.toLocationId===locationId?d.quantityBase:0)-(d.fromLocationId===locationId?d.quantityBase:0);
    physical+=delta;if(d.batchId&&blocked.has(d.batchId)) blockedBase+=delta;assert(Number.isSafeInteger(physical)&&Number.isSafeInteger(blockedBase),'LEDGER_INVARIANT');
  }
  const reservationsHere=reservations.filter(r=>r.data.materialId===materialId&&r.data.locationId===locationId&&(batchId===undefined||r.data.batchId===batchId)&&r.data.state==='ACTIVE'&&r.data.expiresAt>ctx.now);
  const reserved=reservationsHere.filter(r=>!r.data.batchId||!blocked.has(r.data.batchId)).reduce((n,r)=>n+r.data.quantityBase-r.data.issuedBase,0);
  const blockedReservationBase=reservationsHere.filter(r=>r.data.batchId&&blocked.has(r.data.batchId)).reduce((n,r)=>n+r.data.quantityBase-r.data.issuedBase,0);
  assert(Number.isSafeInteger(physical)&&physical>=0&&blockedBase>=0,'LEDGER_INVARIANT');
  return {physicalBase:physical,blockedBase,blockedReservationBase,reservedBase:reserved,usableBase:physical-blockedBase,freeBase:physical-blockedBase-reserved};
}

async function selectedStock(ctx:CommandContext,materialId:string,locationId:string,batchId?:string) {
  const overall=await stockBalance(ctx,materialId,locationId);
  if(!batchId) {
    const movements=await ctx.tx.list('stock_movement');
    const batchedNet=movements.filter(m=>m.data.materialId===materialId&&m.data.batchId).reduce((n,m)=>n+(m.data.toLocationId===locationId?m.data.quantityBase:0)-(m.data.fromLocationId===locationId?m.data.quantityBase:0),0);
    assert(batchedNet===0,'BATCH_REQUIRED');
  }
  const selected=batchId?await stockBalance(ctx,materialId,locationId,batchId):overall;
  return {...selected,aggregateFreeBase:overall.freeBase,aggregateReservedBase:overall.reservedBase,aggregateUsableBase:overall.usableBase,aggregatePhysicalBase:overall.physicalBase};
}

async function movingWeightedValue(ctx:CommandContext,materialId:string) {
  const movements=(await ctx.tx.list('stock_movement')).filter(m=>m.data.materialId===materialId).sort((a,b)=>(a.data.ledgerSequence||0)-(b.data.ledgerSequence||0));
  let quantityBase=0,valueCents=0n,complete=true;
  for(const movement of movements){const d=movement.data;
    if(['RECEIPT','PURCHASE_RECEIPT'].includes(d.type)){let cost=d.actualCostCents;if(d.goodsReceiptId)cost=(await checked(ctx,'goods_receipt',d.goodsReceiptId)).data.actualCents;if(cost===undefined)complete=false;else valueCents+=BigInt(cost);quantityBase+=d.quantityBase;}
    else if(['USAGE','WRITEOFF','COUNT_ADJUSTMENT'].includes(d.type)) {
      const sign=d.toLocationId?1:-1;let cost=d.carryingCostCents;
      if(cost===undefined&&quantityBase>0&&complete)cost=asInt((BigInt(d.quantityBase)*valueCents+BigInt(quantityBase)/2n)/BigInt(quantityBase));
      if(cost===undefined||cost===null)complete=false;else valueCents+=BigInt(sign)*BigInt(cost);
      quantityBase+=sign*d.quantityBase;assert(quantityBase>=0&&valueCents>=0n,'LEDGER_INVARIANT');
      if(quantityBase===0){valueCents=0n;complete=true;}
    }
  }
  return {quantityBase,valueCents,complete,sourceMovementIds:movements.map(m=>m.id)};
}

async function move(ctx:CommandContext,input:Data) {
  assert(Number.isSafeInteger(input.quantityBase)&&input.quantityBase>0,'VALIDATION_ERROR');
  if(input.fromLocationId) {
    const b=await stockBalance(ctx,input.materialId,input.fromLocationId,input.batchId);
    assert(b.physicalBase>=input.quantityBase,'INSUFFICIENT_STOCK');
  }
  const ledgerSequence=(await ctx.tx.list('stock_movement')).reduce((n,m)=>Math.max(n,m.data.ledgerSequence||0),0)+1;
  if(input.toLocationId){const target=await stockBalance(ctx,input.materialId,input.toLocationId);asInt(BigInt(target.physicalBase)+BigInt(input.quantityBase));}
  const e=await ctx.tx.add('stock_movement',{...input,ledgerSequence,confirmedBy:ctx.actor.userId,confirmedAt:ctx.now,immutable:true});
  await ctx.tx.event('stock.movement_confirmed',{movementId:e.id,...input});return e;
}
const currentReservationAmount=(r:Entity,now:string,blocked=new Set<string>())=>r.data.state==='ACTIVE'&&r.data.expiresAt>now&&(!r.data.batchId||!blocked.has(r.data.batchId))?r.data.quantityBase-r.data.issuedBase:0;
async function blockedBatches(ctx:CommandContext){return new Set((await ctx.tx.list('material_batch')).filter(b=>b.data.status!=='USABLE'||(b.data.expiresAt&&b.data.expiresAt<=ctx.now)).map(b=>b.id));}
async function requestState(ctx:CommandContext,r:Entity) {
  const all=await ctx.tx.list('stock_reservation'),blocked=await blockedBatches(ctx);
  const reserved=all.filter(x=>x.data.requestId===r.id).reduce((n,x)=>n+currentReservationAmount(x,ctx.now,blocked),0);
  const approved=r.data.approvedBase||0;
  const baseState=approved>0?(approved<r.data.quantityBase?'PARTIALLY_APPROVED':'APPROVED'):r.data.state;
  const state=r.data.receivedBase>=approved&&approved>0?'RECEIVED':r.data.issuedBase>=approved&&approved>0?'ISSUED':r.data.issuedBase>0?'PARTIALLY_ISSUED':reserved>=approved&&approved>0?'RESERVED':reserved>0?'PARTIALLY_RESERVED':baseState;
  return ctx.tx.save(r,{...r.data,reservedBase:reserved,state},r.version);
}
async function requireCustomer(ctx:CommandContext,customerId:string,siteId:string) {
  assert(ctx.actor.customerIds.includes(customerId),'ACCESS_DENIED');
  const memberships=await ctx.tx.list('customer_membership');
  assert(memberships.some(m=>m.data.active===true&&!m.data.revokedAt&&(!m.data.expiresAt||Date.parse(m.data.expiresAt)>Date.parse(ctx.now))&&m.data.userId===ctx.actor.userId&&m.data.customerId===customerId&&m.data.permissions?.includes('REPORT_ACK')&&(!m.data.siteIds.length||m.data.siteIds.includes(siteId))),'ACCESS_DENIED');
}
async function scopedReport(ctx:CommandContext,reportId:string) {
  const r=await checked(ctx,'report',reportId);ctx.requireSite(r.data.siteId);return r;
}
async function periodAmounts(ctx:CommandContext,calculationId:string) {
  const c=await checked(ctx,'payroll_calculation',calculationId);
  const payouts=(await ctx.tx.list('payout')).filter(p=>p.data.calculationId===c.id&&p.data.state!=='REVERSED');
  const committed=payouts.filter(p=>['APPROVED','RECORDED'].includes(p.data.state)).reduce((n,p)=>n+p.data.amountCents,0);
  const recorded=payouts.filter(p=>p.data.state==='RECORDED').reduce((n,p)=>n+p.data.amountCents,0);
  const employeeAcknowledgedCents=payouts.filter(p=>p.data.state==='RECORDED').reduce((n,p)=>n+(p.data.employeeStatedReceivedCents||0),0);
  return {calculation:c,payouts,committedCents:committed,recordedCents:recorded,employeeAcknowledgedCents,unconfirmedCents:recorded-employeeAcknowledgedCents,outstandingCents:c.data.payableCents-recorded,employeeUnsettledCents:c.data.payableCents-employeeAcknowledgedCents,uncommittedCents:c.data.payableCents-committed};
}
async function effectivePayrollSeconds(ctx:CommandContext,timesheet:Entity) {
  const adjustments=(await ctx.tx.list('timesheet_adjustment')).filter(a=>a.data.timesheetId===timesheet.id&&a.data.employeeId===timesheet.data.employeeId&&a.data.state==='APPROVED');
  let total=BigInt(timesheet.data.payableSeconds);for(const a of adjustments){assert(Number.isSafeInteger(a.data.deltaPayableSeconds),'INVALID_TIMESHEET');total+=BigInt(a.data.deltaPayableSeconds);}
  return {payableSeconds:asInt(total),adjustmentIds:adjustments.map(a=>a.id),adjustmentSnapshot:adjustments.map(a=>({id:a.id,deltaPayableSeconds:a.data.deltaPayableSeconds,approvedBy:a.data.approvedBy,approvedAt:a.data.approvedAt}))};
}
const command=(permissionName:string,schema:z.ZodTypeAny,handler:(ctx:CommandContext,input:any)=>Promise<any>,highRisk=false)=>({permission:permissionName,schema,handler,highRisk});

export const resourcesCommands:CommandRegistry = {
  'material.create':command('inventory.manage',z.object({sku:z.string().trim().min(1).max(80).refine(v=>!v.toLowerCase().startsWith('knaba://'),'Reserved QR namespace'),name:z.string().min(1).max(200),barcodes:z.array(barcode).max(50).default([]),names:z.record(z.string().max(200)).default({}),synonyms:z.array(z.string().max(100)).default([]),category:z.string().max(100).default(''),baseUnit:z.enum(['ml','g','pcs','pair']),materialType:z.enum(['CONSUMABLE','INVENTORY','ASSET']).default('CONSUMABLE'),valuationMethod:z.literal('WEIGHTED_AVERAGE').default('WEIGHTED_AVERAGE'),packagingBase:positive.default(1),minimumBase:integer.default(0),targetBase:integer.default(0),leadDays:integer.default(0),conversions:z.array(conversionSchema).default([]),supplierIds:z.array(id).default([]),approvedAnalogIds:z.array(id).default([]),safetyDocumentId:id.optional(),storageRules:z.string().max(2000).default('')}).strict(),async(ctx,input)=>{
    assert(!(await ctx.tx.list('material')).some(m=>m.data.sku.toLocaleUpperCase()===input.sku.toLocaleUpperCase()||(m.data.barcodes||[]).some((code:string)=>code.toLocaleUpperCase()===input.sku.toLocaleUpperCase())),'DUPLICATE_SKU');assert(new Set(input.barcodes.map((code:string)=>code.toLocaleUpperCase())).size===input.barcodes.length&&!(await ctx.tx.list('material')).some(m=>(m.data.barcodes||[]).some((code:string)=>input.barcodes.some((v:string)=>v.toLocaleUpperCase()===code.toLocaleUpperCase()))||input.barcodes.some((code:string)=>code.toLocaleUpperCase()===m.data.sku.toLocaleUpperCase())),'DUPLICATE_BARCODE');
    const conversions:Data[]=[{unit:input.baseUnit,numerator:1,denominator:1}];
    if(input.baseUnit==='ml') conversions.push({unit:'l',numerator:1000,denominator:1});
    if(input.baseUnit==='g') conversions.push({unit:'kg',numerator:1000,denominator:1});
    conversions.push({unit:'package',numerator:input.packagingBase,denominator:1});
    for(const c of input.conversions) {
      assert(c.unit!==input.baseUnit&&c.unit!=='package','UNIT_INCOMPATIBLE');
      assert(!((input.baseUnit==='ml'&&['g','kg'].includes(c.unit))||(input.baseUnit==='g'&&['ml','l'].includes(c.unit))),'DENSITY_CONVERSION_REQUIRES_REVIEW');
      const previous=conversions.find(x=>x.unit===c.unit);assert(!previous||previous.numerator===c.numerator&&previous.denominator===c.denominator,'UNIT_INCOMPATIBLE');
      if(!previous) conversions.push(c);
    }
    for(const supplierId of input.supplierIds) await checked(ctx,'supplier',supplierId);
    for(const materialId of input.approvedAnalogIds) await checked(ctx,'material',materialId);
    const m=await ctx.tx.add('material',{...input,conversions});await ctx.tx.event('material.created',{materialId:m.id});return m;
  }),
  'stock_location.create':command('inventory.manage',z.object({name:z.string().min(1).max(200),type:z.enum(['WAREHOUSE','SITE','VEHICLE','EMPLOYEE']),siteId:id.optional(),employeeId:id.optional(),vehicleCode:z.string().max(100).optional()}).strict(),async(ctx,input)=>{
    assert(input.type!=='SITE'||input.siteId,'VALIDATION_ERROR');assert(input.type!=='EMPLOYEE'||input.employeeId,'VALIDATION_ERROR');
    if(input.siteId){ctx.requireSite(input.siteId);await checked(ctx,'site',input.siteId);}if(input.employeeId){ctx.requireOwn(input.employeeId);await checked(ctx,'user',input.employeeId);}
    return ctx.tx.add('stock_location',input);
  }),
  'batch.create':command('inventory.manage',z.object({materialId:id,code:z.string().min(1).max(100),expiresAt:timestamp.optional(),status:z.enum(['USABLE','QUARANTINE','DAMAGED','BLOCKED']).default('USABLE')}).strict(),async(ctx,input)=>{
    await checked(ctx,'material',input.materialId);assert(!(await ctx.tx.list('material_batch')).some(b=>b.data.materialId===input.materialId&&b.data.code===input.code),'DUPLICATE_BATCH');return ctx.tx.add('material_batch',input);
  }),
  'batch.status':command('inventory.manage',z.object({batchId:id,status:z.enum(['USABLE','QUARANTINE','DAMAGED','BLOCKED']),reason}).strict(),async(ctx,input)=>{
    const b=await checked(ctx,'material_batch',input.batchId);const result=await ctx.tx.save(b,{...b.data,status:input.status,statusReason:input.reason,reviewedBy:ctx.actor.userId,reviewedAt:ctx.now},ctx.expectedVersion??b.version);
    if(input.status!=='USABLE'){for(const r of (await ctx.tx.list('stock_reservation')).filter(r=>r.data.batchId===b.id&&r.data.state==='ACTIVE')){await ctx.tx.save(r,{...r.data,state:'RELEASED',reason:'BATCH_BLOCKED',releasedAt:ctx.now},r.version);if(r.data.requestId){const req=await checked(ctx,'material_request',r.data.requestId);await requestState(ctx,{...req,data:{...req.data,state:'APPROVED'}});}}await ctx.tx.event('stock.batch_blocked',{batchId:b.id,reason:input.reason});}return result;
  }),
  'stock.balance':command('inventory.read',z.object({materialId:id,locationId:id,batchId:id.optional()}).strict(),async(ctx,input)=>{
    await scopedLocation(ctx,input.locationId);await checked(ctx,'material',input.materialId);const b=await stockBalance(ctx,input.materialId,input.locationId,input.batchId);
    const orders=await ctx.tx.list('purchase_order');const transfers=await ctx.tx.list('transfer');
    const orderedBase=orders.filter(o=>['ORDERED','PARTIALLY_RECEIVED'].includes(o.data.state)&&o.data.locationId===input.locationId&&o.data.materialId===input.materialId).reduce((n,o)=>n+o.data.quantityBase-o.data.receivedBase,0);
    const transitBase=transfers.filter(t=>t.data.materialId===input.materialId&&(t.data.sourceId===input.locationId||t.data.targetId===input.locationId)).reduce((n,t)=>n+t.data.quantityBase-t.data.acceptedBase,0);
    return {...b,orderedBase,transitBase};
  }),
  'stock.receive':command('inventory.receive',z.object({materialId:id,locationId:id,...qtyInput,batchId:id.optional(),reference:z.string().min(1).max(200),actualCostCents:integer.optional(),supplierId:id.optional()}).strict(),async(ctx,input)=>{
    await scopedLocation(ctx,input.locationId);const {base}=await materialQuantity(ctx,input);if(input.batchId){const b=await checked(ctx,'material_batch',input.batchId);assert(b.data.materialId===input.materialId,'INVALID_REFERENCE');}
    if(input.supplierId) await checked(ctx,'supplier',input.supplierId);
    assert(!(await ctx.tx.list('stock_movement')).some(m=>m.data.type==='RECEIPT'&&m.data.reference===input.reference&&m.data.materialId===input.materialId&&m.data.toLocationId===input.locationId),'DUPLICATE_EFFECT');
    return move(ctx,{type:'RECEIPT',materialId:input.materialId,toLocationId:input.locationId,quantityBase:base,batchId:input.batchId,reference:input.reference,supplierId:input.supplierId,actualCostCents:input.actualCostCents});
  }),
  'reservation.create':command('inventory.reserve',z.object({materialId:id,locationId:id,...qtyInput,batchId:id.optional(),requestId:id.optional(),expiresAt:timestamp}).strict(),async(ctx,input)=>{
    await scopedLocation(ctx,input.locationId);const {base}=await materialQuantity(ctx,input);await usableBatch(ctx,input.materialId,input.batchId);assert(input.expiresAt>ctx.now,'INVALID_DEADLINE');
    const balance=await selectedStock(ctx,input.materialId,input.locationId,input.batchId);assert(Math.min(balance.freeBase,balance.aggregateFreeBase)>=base,'INSUFFICIENT_STOCK');
    let r:Entity|undefined;if(input.requestId){r=await scopedRequest(ctx,input.requestId);assert(r.data.materialId===input.materialId&&['APPROVED','PARTIALLY_APPROVED','PARTIALLY_RESERVED','RESERVED','PARTIALLY_ISSUED'].includes(r.data.state),'INVALID_STATE');
      const blocked=await blockedBatches(ctx);const current=(await ctx.tx.list('stock_reservation')).filter(x=>x.data.requestId===r!.id).reduce((n,x)=>n+currentReservationAmount(x,ctx.now,blocked),0);assert(current+r.data.issuedBase+base<=r.data.approvedBase,'RESERVATION_EXCEEDS_REQUEST');}
    const res=await ctx.tx.add('stock_reservation',{materialId:input.materialId,locationId:input.locationId,batchId:input.batchId,quantityBase:base,issuedBase:0,requestId:input.requestId,expiresAt:input.expiresAt,state:'ACTIVE',createdBy:ctx.actor.userId});
    if(r) await requestState(ctx,r);await ctx.tx.event('stock.reserved',{reservationId:res.id,requestId:input.requestId,quantityBase:base});return res;
  }),
  'reservation.release':command('inventory.reserve',z.object({reservationId:id,reason}).strict(),async(ctx,input)=>{
    const r=await checked(ctx,'stock_reservation',input.reservationId);await scopedLocation(ctx,r.data.locationId);assert(r.data.state==='ACTIVE','INVALID_STATE');
    const result=await ctx.tx.save(r,{...r.data,state:'RELEASED',reason:input.reason,releasedAt:ctx.now},ctx.expectedVersion??r.version);
    if(r.data.requestId){const req=await scopedRequest(ctx,r.data.requestId);await requestState(ctx,{...req,data:{...req.data,state:'APPROVED'}});}await ctx.tx.event('stock.reservation_released',{reservationId:r.id});return result;
  }),
  'stock.ship':command('inventory.ship',z.object({materialId:id,sourceId:id,targetId:id,...qtyInput,batchId:id.optional(),reservationId:id.optional(),requestId:id.optional(),reason:z.string().max(2000).optional()}).strict(),async(ctx,input)=>{
    const source=await scopedLocation(ctx,input.sourceId),target=await scopedLocation(ctx,input.targetId);assert(source.id!==target.id,'INVALID_REFERENCE');const {base}=await materialQuantity(ctx,input);await usableBatch(ctx,input.materialId,input.batchId);
    let reservation:Entity|undefined;
    if(input.reservationId){reservation=await checked(ctx,'stock_reservation',input.reservationId);assert(reservation.data.materialId===input.materialId&&reservation.data.locationId===input.sourceId&&reservation.data.batchId===input.batchId&&reservation.data.requestId===input.requestId,'INVALID_REFERENCE');assert(currentReservationAmount(reservation,ctx.now)>=base,'RESERVATION_UNAVAILABLE');}
    const balance=await selectedStock(ctx,input.materialId,input.sourceId,input.batchId);assert(Math.min(balance.freeBase,balance.aggregateFreeBase)+(reservation?currentReservationAmount(reservation,ctx.now):0)>=base,'INSUFFICIENT_STOCK');
    const req=input.requestId?await scopedRequest(ctx,input.requestId):undefined;
    if(req){assert(req.data.materialId===input.materialId&&req.data.approvedBase>=req.data.issuedBase+base,'INVALID_STATE');assert(target.data.siteId===req.data.siteId||target.data.employeeId===req.data.employeeId,'INVALID_REFERENCE');}
    const transfer=await ctx.tx.add<Data>('transfer',{materialId:input.materialId,sourceId:input.sourceId,targetId:input.targetId,quantityBase:base,acceptedBase:0,batchId:input.batchId,requestId:input.requestId,reservationId:input.reservationId,reason:input.reason,state:'IN_TRANSIT',shippedBy:ctx.actor.userId,shippedAt:ctx.now});
    const transit=await ctx.tx.add('stock_location',{name:`Transit ${transfer.id}`,type:'TRANSIT',transferId:transfer.id});
    const result=await ctx.tx.save(transfer,{...transfer.data,transitId:transit.id},transfer.version);
    await move(ctx,{type:'SHIPMENT',materialId:input.materialId,fromLocationId:input.sourceId,toLocationId:transit.id,quantityBase:base,batchId:input.batchId,transferId:transfer.id});
    if(reservation) await ctx.tx.save(reservation,{...reservation.data,issuedBase:reservation.data.issuedBase+base,state:reservation.data.issuedBase+base===reservation.data.quantityBase?'FULFILLED':'ACTIVE'},reservation.version);
    if(req) await requestState(ctx,{...req,data:{...req.data,issuedBase:req.data.issuedBase+base}});
    return result;
  }),
  'stock.accept':command('inventory.receive',z.object({transferId:id,...qtyInput,discrepancyReason:reason.optional()}).strict(),async(ctx,input)=>{
    const transfer=await checked(ctx,'transfer',input.transferId);await scopedLocation(ctx,transfer.data.targetId);assert(['IN_TRANSIT','PARTIALLY_RECEIVED','DISCREPANCY'].includes(transfer.data.state),'INVALID_STATE');
    const m=await checked(ctx,'material',transfer.data.materialId);const base=exactBaseQuantity(m.data,input.quantity,input.unit);assert(base<=transfer.data.quantityBase-transfer.data.acceptedBase,'RECEIPT_EXCEEDS_SHIPMENT');
    await move(ctx,{type:'TRANSFER_RECEIPT',materialId:m.id,fromLocationId:transfer.data.transitId,toLocationId:transfer.data.targetId,quantityBase:base,batchId:transfer.data.batchId,transferId:transfer.id});
    const acceptedBase=transfer.data.acceptedBase+base;const t=await ctx.tx.save(transfer,{...transfer.data,acceptedBase,state:acceptedBase===transfer.data.quantityBase?'RECEIVED':input.discrepancyReason?'DISCREPANCY':'PARTIALLY_RECEIVED',discrepancyReason:input.discrepancyReason,receivedBy:ctx.actor.userId,receivedAt:ctx.now},ctx.expectedVersion??transfer.version);
    if(m.data.materialType!=='CONSUMABLE'){const target=await checked(ctx,'stock_location',transfer.data.targetId);await ctx.tx.add('asset_assignment',{materialId:m.id,quantityBase:base,stockLocationId:target.id,employeeId:target.data.employeeId,transferId:transfer.id,assignedAt:ctx.now,assignedBy:ctx.actor.userId,expense:false,immutable:true});}
    if(t.data.requestId){const req=await scopedRequest(ctx,t.data.requestId);await requestState(ctx,{...req,data:{...req.data,physicalReceivedBase:(req.data.physicalReceivedBase||0)+base,receivedBase:req.data.receivedBase+(ctx.actor.userId===req.data.employeeId?base:0)}});}return t;
  }),
  'stock.use':command('inventory.use',z.object({materialId:id,locationId:id,...qtyInput,batchId:id.optional(),taskId:id,worklogId:id.optional(),locationNodeId:id.optional(),reference:z.string().min(1).max(100)}).strict(),async(ctx,input)=>{
    const location=await scopedLocation(ctx,input.locationId);const {material,base}=await materialQuantity(ctx,input);assert(material.data.materialType==='CONSUMABLE','INVENTORY_IS_NOT_CONSUMPTION');await usableBatch(ctx,input.materialId,input.batchId);
    const task=await checked(ctx,'task',input.taskId);ctx.requireSite(task.data.siteId);assert(!location.data.siteId||location.data.siteId===task.data.siteId,'INVALID_REFERENCE');
    if(input.worklogId){const w=await checked(ctx,'worklog',input.worklogId);assert(w.data.taskId===task.id&&w.data.siteId===task.data.siteId,'INVALID_REFERENCE');}
    if(input.locationNodeId){const n=await checked(ctx,'location',input.locationNodeId);assert(n.data.siteId===task.data.siteId,'INVALID_REFERENCE');}
    assert(!(await ctx.tx.list('material_usage')).some(u=>u.data.reference===input.reference&&u.data.taskId===task.id),'DUPLICATE_EFFECT');
    const balance=await selectedStock(ctx,input.materialId,input.locationId,input.batchId);assert(Math.min(balance.freeBase,balance.aggregateFreeBase)>=base,'INSUFFICIENT_STOCK');
    const valuation=await movingWeightedValue(ctx,material.id);const internalCostCents=valuation.complete&&valuation.quantityBase>0?asInt((BigInt(base)*valuation.valueCents+BigInt(valuation.quantityBase)/2n)/BigInt(valuation.quantityBase)):null;
    const usage=await ctx.tx.add('material_usage',{materialId:material.id,siteId:task.data.siteId,locationId:input.locationId,quantityBase:base,unit:material.data.baseUnit,taskId:task.id,worklogId:input.worklogId,locationNodeId:input.locationNodeId,reference:input.reference,confirmedBy:ctx.actor.userId,confirmedAt:ctx.now,clientVisible:false,valuationMethod:material.data.valuationMethod,internalCostCents,costStatus:internalCostCents===null?'MISSING_RECEIPT_COST':'CONFIRMED_WEIGHTED_AVERAGE',costSourceMovementIds:valuation.sourceMovementIds});
    await move(ctx,{type:'USAGE',materialId:material.id,fromLocationId:input.locationId,quantityBase:base,batchId:input.batchId,usageId:usage.id,taskId:task.id,siteId:task.data.siteId,carryingCostCents:internalCostCents});return usage;
  }),
  'stock.usage_visibility':command('report.approve',z.object({usageId:id,clientVisible:z.boolean(),reason}).strict(),async(ctx,input)=>{
    const u=await checked(ctx,'material_usage',input.usageId);ctx.requireSite(u.data.siteId);return ctx.tx.save(u,{...u.data,clientVisible:input.clientVisible,visibilityApprovedBy:ctx.actor.userId,visibilityReason:input.reason},ctx.expectedVersion??u.version);
  }),
  'stock.writeoff':command('inventory.writeoff',z.object({materialId:id,locationId:id,...qtyInput,batchId:id.optional(),reason,approvalId:id}).strict(),async(ctx,input)=>{
    await scopedLocation(ctx,input.locationId);const {base}=await materialQuantity(ctx,input);const approval=await checked(ctx,'decision',input.approvalId);assert(approval.data.status==='RESOLVED'&&approval.data.resolution==='APPROVE'&&approval.data.approvalDomain==='INVENTORY'&&approval.data.type==='STOCK_WRITEOFF'&&approval.data.materialId===input.materialId&&approval.data.locationId===input.locationId&&approval.data.batchId===input.batchId&&approval.data.quantityBase===base,'NEEDS_APPROVAL');
    const balance=await selectedStock(ctx,input.materialId,input.locationId,input.batchId),unusable=input.batchId?(await blockedBatches(ctx)).has(input.batchId):false;assert(balance.physicalBase-base>=balance.reservedBase&&balance.aggregatePhysicalBase-base>=balance.aggregateReservedBase&&balance.aggregateUsableBase-(unusable?0:base)>=balance.aggregateReservedBase,'RESERVED_STOCK_REQUIRES_RELEASE');assert(!(await ctx.tx.list('stock_movement')).some(m=>m.data.approvalId===approval.id),'DUPLICATE_EFFECT');return move(ctx,{type:'WRITEOFF',materialId:input.materialId,fromLocationId:input.locationId,quantityBase:base,batchId:input.batchId,reason:input.reason,approvalId:approval.id});
  },true),
  'stock.count.create':command('inventory.count',z.object({materialId:id,locationId:id,batchId:id.optional(),...qtyInput,reason}).strict(),async(ctx,input)=>{
    await scopedLocation(ctx,input.locationId);const material=await checked(ctx,'material',input.materialId);const base=exactBaseQuantity(material.data,input.quantity,input.unit,true);const balance=await selectedStock(ctx,input.materialId,input.locationId,input.batchId);const movements=await ctx.tx.list('stock_movement');
    return ctx.tx.add('stock_count',{materialId:input.materialId,locationId:input.locationId,batchId:input.batchId,countedBase:base,snapshotPhysicalBase:balance.physicalBase,movementIds:movements.map(m=>m.id),countedAt:ctx.now,countedBy:ctx.actor.userId,reason:input.reason,state:'COUNTED'});
  }),
  'stock.count.apply':command('inventory.count.approve',z.object({countId:id,reason}).strict(),async(ctx,input)=>{
    const c=await checked(ctx,'stock_count',input.countId);await scopedLocation(ctx,c.data.locationId);assert(c.data.state==='COUNTED','INVALID_STATE');assert(c.data.countedBy!==ctx.actor.userId,'SELF_APPROVAL_DENIED');
    const delta=c.data.countedBase-c.data.snapshotPhysicalBase;const current=await selectedStock(ctx,c.data.materialId,c.data.locationId,c.data.batchId),unusable=c.data.batchId?(await blockedBatches(ctx)).has(c.data.batchId):false;assert(current.physicalBase+delta>=0&&current.usableBase+(unusable?0:delta)>=current.reservedBase&&current.aggregateUsableBase+(unusable?0:delta)>=current.aggregateReservedBase,'INSUFFICIENT_STOCK');
    if(delta!==0) await move(ctx,{type:'COUNT_ADJUSTMENT',materialId:c.data.materialId,fromLocationId:delta<0?c.data.locationId:undefined,toLocationId:delta>0?c.data.locationId:undefined,quantityBase:Math.abs(delta),batchId:c.data.batchId,countId:c.id,reason:input.reason});
    return ctx.tx.save(c,{...c.data,state:'APPLIED',deltaBase:delta,physicalAfterAdjustment:current.physicalBase+delta,approvedBy:ctx.actor.userId,approvedAt:ctx.now,approvalReason:input.reason},ctx.expectedVersion??c.version);
  },true),
  'request.create':command('inventory.request',z.object({materialId:id,siteId:id,taskId:id.optional(),...qtyInput,dueAt:timestamp,urgency:z.enum(['NORMAL','URGENT','CRITICAL']).default('NORMAL'),reason}).strict(),async(ctx,input)=>{
    ctx.requireSite(input.siteId);await checked(ctx,'site',input.siteId);const {base}=await materialQuantity(ctx,input);if(input.taskId){const t=await checked(ctx,'task',input.taskId);assert(t.data.siteId===input.siteId,'INVALID_REFERENCE');}
    return ctx.tx.add('material_request',{materialId:input.materialId,siteId:input.siteId,taskId:input.taskId,quantityBase:base,approvedBase:0,reservedBase:0,issuedBase:0,physicalReceivedBase:0,receivedBase:0,employeeId:ctx.actor.userId,dueAt:input.dueAt,urgency:input.urgency,reason:input.reason,state:'DRAFT'});
  }),
  'request.submit':command('inventory.request',z.object({requestId:id}).strict(),async(ctx,input)=>{
    const r=await scopedRequest(ctx,input.requestId);ctx.requireOwn(r.data.employeeId);assert(r.data.state==='DRAFT','INVALID_STATE');const result=await ctx.tx.save(r,{...r.data,state:'SUBMITTED',submittedAt:ctx.now},ctx.expectedVersion??r.version);await ctx.tx.event('material_request.submitted',{requestId:r.id,siteId:r.data.siteId});return result;
  }),
  'request.approve':command('inventory.approve',z.object({requestId:id,decision:z.enum(['APPROVE','PARTIAL','REJECT']),approvedBase:integer.optional(),reason:reason.optional()}).strict(),async(ctx,input)=>{
    const r=await scopedRequest(ctx,input.requestId);assert(r.data.state==='SUBMITTED','INVALID_STATE');assert(r.data.employeeId!==ctx.actor.userId,'SELF_APPROVAL_DENIED');
    const approvedBase=input.decision==='APPROVE'?r.data.quantityBase:input.decision==='REJECT'?0:input.approvedBase;
    assert(approvedBase!==undefined&&approvedBase<=r.data.quantityBase,'VALIDATION_ERROR');assert(input.decision!=='PARTIAL'||(approvedBase>0&&approvedBase<r.data.quantityBase&&input.reason),'VALIDATION_ERROR');assert(input.decision!=='REJECT'||input.reason,'VALIDATION_ERROR');
    const saved=await ctx.tx.save(r,{...r.data,approvedBase,state:input.decision==='APPROVE'?'APPROVED':input.decision==='PARTIAL'?'PARTIALLY_APPROVED':'REJECTED',approvalReason:input.reason,approvedBy:ctx.actor.userId,approvedAt:ctx.now},ctx.expectedVersion??r.version);
    await ctx.tx.event('material_request.approved',{requestId:saved.id,siteId:saved.data.siteId,sourceVersion:saved.version});return saved;
  }),
  'request.close':command('inventory.approve',z.object({requestId:id,reason}).strict(),async(ctx,input)=>{
    const r=await scopedRequest(ctx,input.requestId);assert(['RECEIVED','REJECTED'].includes(r.data.state),'INVALID_STATE');return ctx.tx.save(r,{...r.data,state:'CLOSED',closeReason:input.reason},ctx.expectedVersion??r.version);
  }),
};
resourcesCommands['stock.return']=resourcesCommands['stock.ship'];

export async function procurementNeed(ctx:CommandContext,input:{materialId:string;locationIds:string[];horizonAt:string;safetyBase?:number}) {
  const material=await checked(ctx,'material',input.materialId);assert(new Set(input.locationIds).size===input.locationIds.length,'VALIDATION_ERROR');
  const balances=[];for(const locationId of input.locationIds){await scopedLocation(ctx,locationId);balances.push({locationId,...await stockBalance(ctx,input.materialId,locationId)});}
  const requests=(await ctx.tx.list('material_request')).filter(r=>r.data.materialId===input.materialId&&r.data.dueAt<=input.horizonAt&&['APPROVED','PARTIALLY_APPROVED','RESERVED','PARTIALLY_RESERVED','ISSUED','PARTIALLY_ISSUED'].includes(r.data.state));
  const reservations=await ctx.tx.list('stock_reservation'),blocked=await blockedBatches(ctx);
  const demandRows=requests.map(r=>{ctx.requireSite(r.data.siteId);const reserved=reservations.filter(v=>v.data.requestId===r.id).reduce((n,v)=>n+currentReservationAmount(v,ctx.now,blocked),0);return {requestId:r.id,siteId:r.data.siteId,dueAt:r.data.dueAt,approvedBase:r.data.approvedBase,issuedBase:r.data.issuedBase,reservedBase:reserved,unreservedBase:Math.max(0,r.data.approvedBase-r.data.issuedBase-reserved)};});
  const inboundRows=(await ctx.tx.list('purchase_order')).filter(o=>o.data.materialId===input.materialId&&input.locationIds.includes(o.data.locationId)&&['ORDERED','PARTIALLY_RECEIVED'].includes(o.data.state)&&o.data.deliveryConfirmed===true&&o.data.dueAt>=ctx.now&&o.data.dueAt<=input.horizonAt).map(o=>({orderId:o.id,dueAt:o.data.dueAt,remainingBase:o.data.quantityBase-o.data.receivedBase,committedBase:o.data.committedInboundBase||0,freeBase:Math.max(0,o.data.quantityBase-o.data.receivedBase-(o.data.committedInboundBase||0))}));
  const newUnreservedDemand=demandRows.reduce((n,r)=>n+r.unreservedBase,0),freeUsableStock=balances.reduce((n,b)=>n+b.freeBase,0),freeConfirmedInbound=inboundRows.reduce((n,o)=>n+o.freeBase,0),safetyStock=input.safetyBase??material.data.minimumBase;
  const purchaseNeedBase=Math.max(0,newUnreservedDemand+safetyStock-freeUsableStock-freeConfirmedInbound);
  const packages=Math.ceil(purchaseNeedBase/material.data.packagingBase),plannedBase=packages*material.data.packagingBase;
  assert(Number.isSafeInteger(plannedBase),'VALIDATION_ERROR');
  return {materialId:material.id,sku:material.data.sku,baseUnit:material.data.baseUnit,horizonAt:input.horizonAt,newUnreservedDemand,safetyStock,freeUsableStock,freeConfirmedInbound,purchaseNeedBase,packagingBase:material.data.packagingBase,packages,plannedBase,excessBase:plannedBase-purchaseNeedBase,demandRows,balances,inboundRows,supplierIds:material.data.supplierIds};
}
Object.assign(resourcesCommands,{
  'supplier.create':command('inventory.manage',z.object({name:z.string().min(1).max(200),approved:z.boolean().default(false),contact:z.string().max(500).optional(),leadDays:integer.default(0),minimumOrderBase:positive.default(1)}).strict(),async(ctx,input)=>ctx.tx.add('supplier',input)),
  'procurement.calculate':command('procurement.read',z.object({materialId:id,locationIds:uniqueIds.refine(v=>v.length>0),horizonAt:timestamp,safetyBase:integer.optional()}).strict(),procurementNeed),
  'procurement.create':command('procurement.request',z.object({materialId:id,locationIds:uniqueIds.refine(v=>v.length>0),destinationId:id,horizonAt:timestamp,safetyBase:integer.optional(),supplierId:id,unitPriceCents:integer,reason}).strict(),async(ctx,input)=>{
    await scopedLocation(ctx,input.destinationId);const supplier=await checked(ctx,'supplier',input.supplierId);assert(supplier.data.approved,'SUPPLIER_NOT_APPROVED');const need=await procurementNeed(ctx,input);assert(need.purchaseNeedBase>0,'NO_PURCHASE_NEED');
    const quantityBase=Math.max(need.plannedBase,Math.ceil(supplier.data.minimumOrderBase/need.packagingBase)*need.packagingBase);
    const estimateCents=asInt(BigInt(quantityBase/need.packagingBase)*BigInt(input.unitPriceCents));
    const existing=(await ctx.tx.list('purchase_requisition')).find(r=>r.data.materialId===input.materialId&&r.data.destinationId===input.destinationId&&r.data.horizonAt===input.horizonAt&&r.data.state==='DRAFT');
    const data={materialId:input.materialId,destinationId:input.destinationId,locationIds:input.locationIds,horizonAt:input.horizonAt,supplierId:input.supplierId,quantityBase,packagingBase:need.packagingBase,unitPriceCents:input.unitPriceCents,estimateCents,needSnapshot:need,reason:input.reason,state:'DRAFT',createdBy:ctx.actor.userId};
    return existing?ctx.tx.save(existing,data,existing.version):ctx.tx.add('purchase_requisition',data);
  }),
  'procurement.approve':command('procurement.approve',z.object({requisitionId:id,budgetCents:integer,reason}).strict(),async(ctx,input)=>{
    const r=await checked(ctx,'purchase_requisition',input.requisitionId);await scopedLocation(ctx,r.data.destinationId);assert(r.data.state==='DRAFT','INVALID_STATE');assert(r.data.createdBy!==ctx.actor.userId,'SELF_APPROVAL_DENIED');assert(input.budgetCents>=r.data.estimateCents,'BUDGET_EXCEEDED');
    return ctx.tx.save(r,{...r.data,state:'APPROVED',budgetCents:input.budgetCents,approvedBy:ctx.actor.userId,approvedAt:ctx.now,approvalReason:input.reason},ctx.expectedVersion??r.version);
  },true),
  'procurement.order':command('procurement.order',z.object({requisitionId:id,dueAt:timestamp,supplierReference:z.string().min(1).max(200),deliveryConfirmed:z.boolean().default(false)}).strict(),async(ctx,input)=>{
    const r=await checked(ctx,'purchase_requisition',input.requisitionId);await scopedLocation(ctx,r.data.destinationId);assert(r.data.state==='APPROVED','INVALID_STATE');assert(!(await ctx.tx.list('purchase_order')).some(o=>o.data.requisitionId===r.id),'DUPLICATE_EFFECT');
    const order=await ctx.tx.add('purchase_order',{requisitionId:r.id,materialId:r.data.materialId,supplierId:r.data.supplierId,locationId:r.data.destinationId,quantityBase:r.data.quantityBase,receivedBase:0,committedInboundBase:0,unitPriceCents:r.data.unitPriceCents,packagingBase:r.data.packagingBase,estimateCents:r.data.estimateCents,budgetCents:r.data.budgetCents,dueAt:input.dueAt,supplierReference:input.supplierReference,deliveryConfirmed:input.deliveryConfirmed,state:'ORDERED',orderedBy:ctx.actor.userId,orderedAt:ctx.now,externalOrderExecuted:false});
    await ctx.tx.save(r,{...r.data,state:'ORDERED',orderId:order.id},r.version);await ctx.tx.event('procurement.order_recorded',{orderId:order.id,externalOrderExecuted:false});return order;
  },true),
  'procurement.confirm_delivery':command('procurement.order',z.object({orderId:id,dueAt:timestamp,reference:z.string().min(1).max(200),committedInboundBase:integer.default(0)}).strict(),async(ctx,input)=>{
    const o=await checked(ctx,'purchase_order',input.orderId);await scopedLocation(ctx,o.data.locationId);assert(['ORDERED','PARTIALLY_RECEIVED'].includes(o.data.state),'INVALID_STATE');assert(input.committedInboundBase<=o.data.quantityBase-o.data.receivedBase,'VALIDATION_ERROR');
    return ctx.tx.save(o,{...o.data,dueAt:input.dueAt,deliveryConfirmed:true,deliveryConfirmationReference:input.reference,committedInboundBase:input.committedInboundBase},ctx.expectedVersion??o.version);
  }),
  'procurement.receive':command('inventory.receive',z.object({orderId:id,...qtyInput,batchId:id.optional(),reference:z.string().min(1).max(200),actualCents:integer,discrepancyReason:reason.optional()}).strict(),async(ctx,input)=>{
    const o=await checked(ctx,'purchase_order',input.orderId);await scopedLocation(ctx,o.data.locationId);assert(['ORDERED','PARTIALLY_RECEIVED'].includes(o.data.state),'INVALID_STATE');const m=await checked(ctx,'material',o.data.materialId);const base=exactBaseQuantity(m.data,input.quantity,input.unit);assert(base<=o.data.quantityBase-o.data.receivedBase,'RECEIPT_EXCEEDS_ORDER');
    assert(!(await ctx.tx.list('goods_receipt')).some(r=>r.data.orderId===o.id&&r.data.reference===input.reference),'DUPLICATE_EFFECT');if(input.batchId){const b=await checked(ctx,'material_batch',input.batchId);assert(b.data.materialId===m.id,'INVALID_REFERENCE');}
    const receipt=await ctx.tx.add('goods_receipt',{orderId:o.id,materialId:m.id,quantityBase:base,actualCents:input.actualCents,reference:input.reference,batchId:input.batchId,discrepancyReason:input.discrepancyReason,receivedBy:ctx.actor.userId,receivedAt:ctx.now,state:'RECEIVED'});
    await move(ctx,{type:'PURCHASE_RECEIPT',materialId:m.id,toLocationId:o.data.locationId,quantityBase:base,batchId:input.batchId,goodsReceiptId:receipt.id,orderId:o.id});
    const receivedBase=o.data.receivedBase+base;await ctx.tx.save(o,{...o.data,receivedBase,committedInboundBase:Math.min(o.data.committedInboundBase,Math.max(0,o.data.quantityBase-receivedBase)),state:receivedBase===o.data.quantityBase?'RECEIVED':'PARTIALLY_RECEIVED'},ctx.expectedVersion??o.version);return receipt;
  }),
  'procurement.reconcile':command('procurement.approve',z.object({receiptId:id,documentMediaId:id,documentTotalCents:integer,reason}).strict(),async(ctx,input)=>{
    const receipt=await checked(ctx,'goods_receipt',input.receiptId);const order=await checked(ctx,'purchase_order',receipt.data.orderId);await scopedLocation(ctx,order.data.locationId);assert(receipt.data.state==='RECEIVED','INVALID_STATE');const media=await checked(ctx,'media_asset',input.documentMediaId);assert(media.data.state==='RECEIVED'||media.data.state==='APPROVED_FOR_CLIENT','MEDIA_NOT_VERIFIED');assert(input.documentTotalCents===receipt.data.actualCents,'DOCUMENT_TOTAL_MISMATCH');
    return ctx.tx.save(receipt,{...receipt.data,state:'RECONCILED',documentMediaId:media.id,reconciledBy:ctx.actor.userId,reconciledAt:ctx.now,reconciliationReason:input.reason},ctx.expectedVersion??receipt.version);
  }),
  'procurement.close':command('procurement.approve',z.object({orderId:id,reason}).strict(),async(ctx,input)=>{
    const o=await checked(ctx,'purchase_order',input.orderId);await scopedLocation(ctx,o.data.locationId);assert(o.data.state==='RECEIVED','INVALID_STATE');const receipts=(await ctx.tx.list('goods_receipt')).filter(r=>r.data.orderId===o.id);assert(receipts.length&&receipts.every(r=>r.data.state==='RECONCILED'),'NEEDS_RECONCILIATION');
    const actualCents=receipts.reduce((n,r)=>n+r.data.actualCents,0);assert(actualCents<=o.data.budgetCents,'BUDGET_EXCEEDED');return ctx.tx.save(o,{...o.data,state:'CLOSED',actualCents,closeReason:input.reason,closedAt:ctx.now},ctx.expectedVersion??o.version);
  }),
  'payroll.rate':command('finance.payroll',z.object({employeeId:id,type:z.enum(['HOURLY','MONTHLY']),rateCents:positive,effectiveAt:timestamp,reason}).strict(),async(ctx,input)=>{
    ctx.requireOwn(input.employeeId);await checked(ctx,'user',input.employeeId);assert(!(await ctx.tx.list('rate_history')).some(r=>r.data.employeeId===input.employeeId&&r.data.effectiveAt===input.effectiveAt),'DUPLICATE_EFFECT');
    return ctx.tx.add('rate_history',{...input,recordedBy:ctx.actor.userId,recordedAt:ctx.now,immutable:true});
  },true),
  'payroll.calculation':command('finance.payroll',z.object({timesheetId:id,rateId:id,approvedSupplementCents:integer.default(0),supplementApprovalId:id.optional(),reason:z.string().min(3).max(2000)}).strict(),async(ctx,input)=>{
    const t=await checked(ctx,'timesheet',input.timesheetId);ctx.requireOwn(t.data.employeeId);assert(['APPROVED','LOCKED'].includes(t.data.state),'TIMESHEET_NOT_APPROVED');const r=await checked(ctx,'rate_history',input.rateId);assert(r.data.employeeId===t.data.employeeId&&r.data.effectiveAt<=t.data.periodStart,'INVALID_RATE_PERIOD');
    assert(t.data.periodStart<t.data.periodEnd,'INVALID_PERIOD');if(r.data.type==='MONTHLY'){const start=new Date(t.data.periodStart),nextMonth=Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1);assert(start.getUTCDate()===1&&start.getUTCHours()===0&&start.getUTCMinutes()===0&&start.getUTCSeconds()===0&&start.getUTCMilliseconds()===0&&Date.parse(t.data.periodEnd)===nextMonth,'MONTHLY_PERIOD_REQUIRED');}
    const rates=(await ctx.tx.list('rate_history')).filter(x=>x.data.employeeId===t.data.employeeId&&x.data.effectiveAt>r.data.effectiveAt&&x.data.effectiveAt<t.data.periodEnd);assert(!rates.length,'SPLIT_PERIOD_REQUIRED');
    assert(!(await ctx.tx.list('payroll_calculation')).some(c=>c.data.timesheetId===t.id&&c.data.state!=='SUPERSEDED'),'DUPLICATE_EFFECT');
    if(input.approvedSupplementCents){assert(input.supplementApprovalId,'NEEDS_APPROVAL');const a=await checked(ctx,'decision',input.supplementApprovalId);assert(a.data.status==='RESOLVED'&&a.data.resolution==='APPROVE'&&a.data.approvalDomain==='FINANCE'&&a.data.type==='PAYROLL_SUPPLEMENT'&&a.data.employeeId===t.data.employeeId&&a.data.amountCents===input.approvedSupplementCents,'NEEDS_APPROVAL');assert(!(await ctx.tx.list('payroll_calculation')).some(c=>c.data.supplementApprovalId===a.id),'DUPLICATE_EFFECT',{reason:'SUPPLEMENT_ALREADY_APPLIED'});}
    assert(Number.isSafeInteger(t.data.payableSeconds)&&t.data.payableSeconds>=0,'INVALID_TIMESHEET');
    const effective=await effectivePayrollSeconds(ctx,t);const baseCents=r.data.type==='HOURLY'?asInt((BigInt(effective.payableSeconds)*BigInt(r.data.rateCents)+1800n)/3600n):r.data.rateCents;
    const c=await ctx.tx.add('payroll_calculation',{employeeId:t.data.employeeId,timesheetId:t.id,periodStart:t.data.periodStart,periodEnd:t.data.periodEnd,...effective,originalPayableSeconds:t.data.payableSeconds,rateId:r.id,rateSnapshot:r.data,baseCents,supplementCents:input.approvedSupplementCents,supplementApprovalId:input.approvedSupplementCents?input.supplementApprovalId:null,payableCents:asInt(BigInt(baseCents)+BigInt(input.approvedSupplementCents)),currency:'EUR',state:'PRELIMINARY',calculationType:'PRELIMINARY_REMUNERATION',rounding:'EUR cents half-up on approved seconds per period',reason:input.reason,notGermanNetPayroll:true,createdBy:ctx.actor.userId});
    await ctx.tx.event('payroll.preliminary_calculated',{calculationId:c.id});return c;
  },true),
  'payroll.official':command('finance.accountant',z.object({calculationId:id,documentMediaId:id,netCents:integer,grossCents:integer,providerReference:z.string().min(1).max(200),verificationReference:reason}).strict(),async(ctx,input)=>{
    assert(ctx.actor.roles.includes('ACCOUNTANT'),'ACCESS_DENIED');const c=await checked(ctx,'payroll_calculation',input.calculationId);ctx.requireOwn(c.data.employeeId);assert(c.data.state==='PRELIMINARY','INVALID_STATE');const media=await checked(ctx,'media_asset',input.documentMediaId);assert(media.data.visibility==='CONFIDENTIAL'&&media.data.state==='RECEIVED'&&media.data.stage==='DOCUMENT'&&media.data.employeeId===c.data.employeeId,'PAYSLIP_DOCUMENT_REQUIRED');
    const committed=(await periodAmounts(ctx,c.id)).committedCents;assert(input.netCents>=committed,'PAYROLL_RECONCILIATION_REQUIRED');
    const document=await ctx.tx.add('official_payslip',{calculationId:c.id,employeeId:c.data.employeeId,periodStart:c.data.periodStart,periodEnd:c.data.periodEnd,documentMediaId:media.id,previousPayslipId:c.data.previousOfficialPayslipId||null,calculationVersion:c.version,netCents:input.netCents,grossCents:input.grossCents,providerReference:input.providerReference,verificationReference:input.verificationReference,verifiedBy:ctx.actor.userId,verifiedAt:ctx.now,currency:'EUR',immutable:true});
    await ctx.tx.save(c,{...c.data,state:'ACCOUNTANT_VERIFIED',officialPayslipId:document.id,officialDocumentCurrent:true,payableCents:input.netCents,preliminaryCents:c.data.preliminaryCents??c.data.payableCents},ctx.expectedVersion??c.version);return document;
  },true),
  'payroll.balance':command('finance.payroll',z.object({calculationId:id}).strict(),async(ctx,input)=>{const amounts=await periodAmounts(ctx,input.calculationId);ctx.requireOwn(amounts.calculation.data.employeeId);return amounts;}),
  'payout.create':command('finance.payout',z.object({calculationId:id,amountCents:positive,currency,method:z.enum(['CASH','BANK']),reason,allocationPeriodStart:timestamp.optional(),allocationPeriodEnd:timestamp.optional()}).strict(),async(ctx,input)=>{
    const amounts=await periodAmounts(ctx,input.calculationId),c=amounts.calculation;ctx.requireOwn(c.data.employeeId);assert(c.data.state==='ACCOUNTANT_VERIFIED','OFFICIAL_PAYROLL_REQUIRED');assert(input.amountCents<=amounts.uncommittedCents,'PAYOUT_EXCEEDS_BALANCE');assert(!input.allocationPeriodStart||input.allocationPeriodStart===c.data.periodStart,'INVALID_ALLOCATION');assert(!input.allocationPeriodEnd||input.allocationPeriodEnd===c.data.periodEnd,'INVALID_ALLOCATION');
    const p=await ctx.tx.add('payout',{employeeId:c.data.employeeId,calculationId:c.id,periodStart:c.data.periodStart,periodEnd:c.data.periodEnd,calculationVersion:c.version,officialPayslipId:c.data.officialPayslipId,amountCents:input.amountCents,currency:input.currency,method:input.method,reason:input.reason,state:'DRAFT',createdBy:ctx.actor.userId,ackState:'UNCONFIRMED'});
    await ctx.tx.add('payout_allocation',{payoutId:p.id,calculationId:c.id,amountCents:input.amountCents,periodStart:c.data.periodStart,periodEnd:c.data.periodEnd,immutable:true});return p;
  },true),
  'payout.approve':command('finance.payout.approve',z.object({payoutId:id,reason}).strict(),async(ctx,input)=>{
    const p=await checked(ctx,'payout',input.payoutId);ctx.requireOwn(p.data.employeeId);assert(p.data.state==='DRAFT','INVALID_STATE');assert(p.data.createdBy!==ctx.actor.userId,'SELF_APPROVAL_DENIED');const a=await periodAmounts(ctx,p.data.calculationId);assert(a.calculation.data.state==='ACCOUNTANT_VERIFIED'&&a.calculation.data.officialDocumentCurrent===true,'OFFICIAL_PAYROLL_REQUIRED');assert(p.data.officialPayslipId===a.calculation.data.officialPayslipId,'PAYOUT_SOURCE_CHANGED');assert(p.data.amountCents<=a.uncommittedCents,'PAYOUT_EXCEEDS_BALANCE');
    const saved=await ctx.tx.save(p,{...p.data,state:'APPROVED',approvedBy:ctx.actor.userId,approvedAt:ctx.now,approvalReason:input.reason},ctx.expectedVersion??p.version);await ctx.tx.event('payout.approved',{payoutId:saved.id,employeeId:saved.data.employeeId,sourceVersion:saved.version});return saved;
  },true),
  'payout.record':command('finance.payout',z.object({payoutId:id,transferredAt:timestamp,evidenceReference:z.string().min(3).max(300),bankExecuted:z.boolean().optional()}).strict(),async(ctx,input)=>{
    const p=await checked(ctx,'payout',input.payoutId);ctx.requireOwn(p.data.employeeId);assert(p.data.state==='APPROVED','INVALID_STATE');assert(input.transferredAt<=ctx.now,'FUTURE_TRANSFER');assert(p.data.method!=='BANK'||input.bankExecuted===true,'BANK_EXECUTION_NOT_CONFIRMED');
    const result=await ctx.tx.save(p,{...p.data,state:'RECORDED',transferredAt:input.transferredAt,evidenceReference:input.evidenceReference,recordedBy:ctx.actor.userId,recordedAt:ctx.now,ackState:'UNCONFIRMED',bankExecutionSource:p.data.method==='BANK'?'RESPONSIBLE_PERSON_ATTESTATION':undefined},ctx.expectedVersion??p.version);await ctx.tx.event('payout.transfer_recorded',{payoutId:p.id,employeeId:p.data.employeeId});return result;
  },true),
  'payout.ack':command('finance.payout.ack',z.object({payoutId:id,decision:z.enum(['FULL','PARTIAL','DISPUTED']),receivedCents:integer.optional(),statement:reason,signature:z.string().min(1).max(500).optional()}).strict(),async(ctx,input)=>{
    const p=await checked(ctx,'payout',input.payoutId);ownOnly(ctx,p.data.employeeId);assert(p.data.state==='RECORDED'&&p.data.ackState==='UNCONFIRMED','INVALID_STATE');
    const receivedCents=input.decision==='FULL'?p.data.amountCents:input.decision==='PARTIAL'?input.receivedCents:input.receivedCents??0;assert(receivedCents!==undefined&&receivedCents<=p.data.amountCents,'VALIDATION_ERROR');assert(input.decision!=='PARTIAL'||receivedCents>0&&receivedCents<p.data.amountCents,'VALIDATION_ERROR');
    const receipt=await ctx.tx.add('payout_receipt',{payoutId:p.id,payoutVersion:p.version,employeeId:p.data.employeeId,amountStatedCents:p.data.amountCents,receivedCents,decision:input.decision,statement:input.statement,signature:input.signature,signatureType:input.signature?'SIMPLE_DRAWN_OR_TYPED_NOT_QUALIFIED':undefined,confirmedBy:ctx.actor.userId,confirmedAt:ctx.now,immutable:true});
    await ctx.tx.save(p,{...p.data,ackState:input.decision==='FULL'?'RECEIVED':input.decision==='PARTIAL'?'PARTIALLY_RECEIVED':'DISPUTED',receiptId:receipt.id,employeeStatedReceivedCents:receivedCents},ctx.expectedVersion??p.version);return receipt;
  }),
  'payout.reverse':command('finance.payout.approve',z.object({payoutId:id,reason,evidenceReference:z.string().min(3).max(300)}).strict(),async(ctx,input)=>{
    const p=await checked(ctx,'payout',input.payoutId);ctx.requireOwn(p.data.employeeId);assert(['APPROVED','RECORDED'].includes(p.data.state),'INVALID_STATE');assert(p.data.approvedBy!==ctx.actor.userId,'SELF_APPROVAL_DENIED');
    const reversal=await ctx.tx.add('payout_reversal',{payoutId:p.id,amountCents:p.data.amountCents,reason:input.reason,evidenceReference:input.evidenceReference,reversedBy:ctx.actor.userId,reversedAt:ctx.now,immutable:true});await ctx.tx.save(p,{...p.data,state:'REVERSED',reversalId:reversal.id},ctx.expectedVersion??p.version);return reversal;
  },true),
});

function berlinMidnight(day:string):string {
  const target=Date.parse(`${day}T00:00:00.000Z`);assert(Number.isFinite(target)&&new Date(target).toISOString().slice(0,10)===day,'VALIDATION_ERROR');
  let instant=target;const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<3;i++){const parts=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p=>[p.type,p.value]));const local=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));instant+=target-local;}
  return new Date(instant).toISOString();
}
const reportTypes=['Leistungsnachweis','Stundennachweis','Fotodokumentation','MaengelNacharbeitsprotokoll','Abnahmeprotokoll'] as const;
const reportInput=z.object({siteId:id,customerId:id,orderId:id,periodStart:timestamp,periodEnd:timestamp,documentType:z.enum(reportTypes),taskIds:uniqueIds.default([]),timesheetIds:uniqueIds.default([]),mediaIds:uniqueIds.default([]),descriptionDe:z.string().min(3).max(10000),legalApprovalId:id.optional()}).strict();
async function reportSnapshot(ctx:CommandContext,input:Data) {
  ctx.requireSite(input.siteId);const site=await checked(ctx,'site',input.siteId),customer=await checked(ctx,'customer',input.customerId),order=await checked(ctx,'order',input.orderId);
  assert(order.data.customerId===input.customerId&&order.data.siteId===input.siteId,'INVALID_REFERENCE');assert(input.periodStart<input.periodEnd,'INVALID_PERIOD');
  const company=await checked(ctx,'company',ctx.actor.companyId);assert(company.data.legalName&&company.data.address,'MISSING_CONFIGURATION',{missing:'Company legalName/address'});
  if(input.documentType==='Abnahmeprotokoll') {assert(input.legalApprovalId,'NEEDS_APPROVAL');const a=await checked(ctx,'legal_approval',input.legalApprovalId);assert(a.data.subject==='WORK_ACCEPTANCE_TEMPLATE'&&a.data.status==='APPROVED'&&a.data.active&&(!a.data.expiresAt||Date.parse(a.data.expiresAt)>Date.parse(ctx.now)),'NEEDS_APPROVAL');}
  const taskRows=[];for(const taskId of input.taskIds){const t=await checked(ctx,'task',taskId);assert(t.data.siteId===site.id&&(!t.data.orderId||t.data.orderId===order.id),'INVALID_REFERENCE');assert(t.data.state==='ACCEPTED','TASK_NOT_ACCEPTED');const reviews=(await ctx.tx.list('task_review')).filter(r=>r.data.taskId===t.id&&r.data.decision==='ACCEPT').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));assert(reviews.length,'NEEDS_APPROVAL');
    taskRows.push({taskId:t.id,locationId:t.data.locationId||null,descriptionDe:t.data.titleDe||t.data.title||t.data.description,quantityMilli:t.data.acceptedQuantityMilli??reviews[0].data.quantityMilli,unit:t.data.unit,state:'ACCEPTED',reviewId:reviews[0].id});}
  const hoursRows=[];for(const timesheetId of input.timesheetIds){const t=await checked(ctx,'timesheet',timesheetId);assert(['APPROVED','LOCKED'].includes(t.data.state),'TIMESHEET_NOT_APPROVED');assert(t.data.periodStart<input.periodEnd&&t.data.periodEnd>input.periodStart,'INVALID_PERIOD');const u=await checked(ctx,'user',t.data.employeeId);
    const correctedTimeline=await (await import('./operations')).effectiveTimesheet(ctx,t);const candidates=correctedTimeline.filter((s:Data)=>s.siteId===site.id&&['WORKING','SERVICE_TASK','WAITING_WORK'].includes(s.activity)&&(t.data.paidActivities||['WORKING','SERVICE_TASK','WAITING_WORK']).includes(s.activity));
    const segments=[];for(const candidate of candidates){if(candidate.orderId&&candidate.orderId!==order.id)continue;if(candidate.taskId){const linkedTask=await checked(ctx,'task',candidate.taskId);assert(linkedTask.data.siteId===site.id,'INVALID_REFERENCE');if(linkedTask.data.orderId&&linkedTask.data.orderId!==order.id)continue;}segments.push(candidate);}
    const seconds=segments.reduce((n:number,s:Data)=>{const actualStart=Date.parse(s.startAt),actualEnd=Date.parse(s.endAt);assert(Number.isFinite(actualStart)&&Number.isFinite(actualEnd)&&actualEnd>=actualStart,'INVALID_TIMESHEET');const start=Math.max(actualStart,Date.parse(input.periodStart)),end=Math.min(actualEnd,Date.parse(input.periodEnd));return end>start?n+Math.floor((end-start)/1000):n;},0);
    const effective=await effectivePayrollSeconds(ctx,t);assert(seconds<=effective.payableSeconds,'INVALID_TIMESHEET');if(seconds)hoursRows.push({workerCode:u.data.businessCode||u.data.employeeCode||`W-${u.id.slice(0,8)}`,seconds,sourceTimesheetId:t.id});}
  const mediaRows=[];for(const mediaId of input.mediaIds){const m=await checked(ctx,'media_asset',mediaId);assert(m.data.siteId===site.id&&(!m.data.orderId||m.data.orderId===order.id)&&m.data.visibility==='CLIENT_AFTER_APPROVAL'&&m.data.state==='APPROVED_FOR_CLIENT','MEDIA_NOT_APPROVED');assert(!m.data.taskId||input.taskIds.includes(m.data.taskId),'INVALID_REFERENCE');mediaRows.push({mediaId:m.id,clientBlobKey:m.data.clientBlobKey,sha256:m.data.clientSha256,mimeType:m.data.clientMimeType||'image/jpeg',byteSize:m.data.clientByteSize,caption:m.data.caption,stage:m.data.stage,taskId:m.data.taskId||null,uploadedAt:m.data.uploadedAt,photoTakenAtVerified:false});}
  const usages=(await ctx.tx.list('material_usage')).filter(u=>u.data.siteId===site.id&&input.taskIds.includes(u.data.taskId)&&u.data.clientVisible===true&&u.data.confirmedAt>=input.periodStart&&u.data.confirmedAt<input.periodEnd);
  const materialRows=[];for(const u of usages){const m=await checked(ctx,'material',u.data.materialId);materialRows.push({usageId:u.id,sku:m.data.sku,name:m.data.names?.DE||m.data.names?.de||m.data.name,quantityBase:u.data.quantityBase,unit:m.data.baseUnit,taskId:u.data.taskId,chargedSeparately:false});}
  const totalSeconds=hoursRows.reduce((n,r)=>n+r.seconds,0);const totalNetCents=order.data.finalNetCents;
  assert(Number.isSafeInteger(totalNetCents)&&totalNetCents>=0,'INVALID_PRICE');const rateBps=order.data.tax?.rateBps||0;const totalTaxCents=asInt((BigInt(totalNetCents)*BigInt(rateBps)+5000n)/10000n);
  return {language:'de',templateVersion:'knaba-de-report-v1',documentType:input.documentType,company:{legalName:company.data.legalName,address:company.data.address,registration:company.data.registration||'',taxId:company.data.taxId||''},customer:{name:customer.data.name||customer.data.legalName,address:customer.data.address||''},site:{id:site.id,code:site.data.code,name:site.data.name,address:site.data.address},order:{id:order.id,pricingModel:order.data.pricingModel,quoteId:order.data.quoteId,quoteVersion:order.data.quoteVersion},periodStart:input.periodStart,periodEnd:input.periodEnd,descriptionDe:input.descriptionDe,taskRows,hoursRows,materialRows,mediaRows,totalSeconds,totalHoursDisplay:formatReportHours(totalSeconds),currency:'EUR',baseNetCents:order.data.baseNetCents,approvedChangesNetCents:order.data.approvedChangesNetCents,totalNetCents,totalTaxCents,totalGrossCents:asInt(BigInt(totalNetCents)+BigInt(totalTaxCents)),taxPresentation:order.data.tax?.display||'',priceStatus:order.data.status==='CLOSED'?'FINAL':'PROVISIONAL',contractIncludedMaterials:true,legalNotice:'Dokumentempfang, Stundenbestaetigung und Abnahme sind getrennte Erklaerungen.'};
}
Object.assign(resourcesCommands,{
  'media.register':command('media.upload',z.object({uploadId:id,siteId:id.optional(),employeeId:id.optional(),taskId:id.optional(),orderId:id.optional(),locationNodeId:id.optional(),worklogId:id.optional(),taskCycleId:id.optional(),defectId:id.optional(),reportVersionId:id.optional(),stage:z.enum(['BEFORE','AFTER','DEFECT','MATERIALS','DOCUMENT']),visibility:z.enum(['INTERNAL','CLIENT_AFTER_APPROVAL','CONFIDENTIAL']).default('INTERNAL'),caption:z.string().max(2000).default(''),retentionPurpose:reason}).strict(),async(ctx,input)=>{
    const external=ctx.actor.roles.some(r=>['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST'].includes(r));let customerId:string|undefined;
    if(external){assert(input.siteId&&input.stage==='DEFECT'&&input.visibility==='INTERNAL'&&!input.employeeId&&!input.orderId&&!input.worklogId&&!input.taskCycleId&&!input.defectId,'ACCESS_DENIED');const site=await checked(ctx,'site',input.siteId);customerId=site.data.customerId;assert((await ctx.tx.list('customer_membership')).some(m=>m.data.active===true&&!m.data.revokedAt&&(!m.data.expiresAt||Date.parse(m.data.expiresAt)>Date.parse(ctx.now))&&m.data.userId===ctx.actor.userId&&m.data.customerId===customerId&&m.data.permissions?.includes('VIEW')&&(!m.data.siteIds.length||m.data.siteIds.includes(site.id))),'ACCESS_DENIED');if(input.taskId)assert(input.reportVersionId,'NOT_FOUND_SAFE');if(input.reportVersionId){const report=await checked(ctx,'report_version',input.reportVersionId);assert(report.data.immutable===true&&report.data.publishedAt&&report.data.siteId===site.id&&report.data.customerId===customerId&&(!input.taskId||report.data.snapshot?.taskRows?.some((t:Data)=>t.taskId===input.taskId)),'NOT_FOUND_SAFE');}}
    else {assert(input.siteId||input.employeeId,'CONTEXT_REQUIRED');if(input.siteId){ctx.requireSite(input.siteId);await checked(ctx,'site',input.siteId);}if(input.employeeId)ctx.requireOwn(input.employeeId);}
    if(input.taskId){const t=await checked(ctx,'task',input.taskId);assert(t.data.siteId===input.siteId,external?'NOT_FOUND_SAFE':'INVALID_REFERENCE');}
    if(input.locationNodeId){const n=await checked(ctx,'location',input.locationNodeId);assert(n.data.siteId===input.siteId&&(!external||n.data.active===true),external?'NOT_FOUND_SAFE':'INVALID_REFERENCE');}
    if(input.worklogId){const w=await checked(ctx,'worklog',input.worklogId);assert(w.data.siteId===input.siteId&&(!input.taskId||w.data.taskId===input.taskId),'INVALID_REFERENCE');}
    if(input.orderId){const o=await checked(ctx,'order',input.orderId);assert(o.data.siteId===input.siteId,'INVALID_REFERENCE');}
    if(!external&&input.defectId){const d=await checked(ctx,'defect',input.defectId);assert(d.data.siteId===input.siteId&&(!input.taskId||d.data.taskId===input.taskId),'INVALID_REFERENCE');}
    if(!external&&input.reportVersionId){const v=await checked(ctx,'report_version',input.reportVersionId);assert(v.data.siteId===input.siteId&&(!input.orderId||v.data.snapshot?.order?.id===input.orderId),'INVALID_REFERENCE');}
    const upload=await checked(ctx,'media_upload',input.uploadId);assert(upload.data.uploadedBy===ctx.actor.userId||!external&&ctx.actor.permissions.includes('scope.company'),'ACCESS_DENIED');assert(upload.data.scanState==='CLEAN'&&upload.data.blobKey&&/^[a-f0-9]{64}$/.test(upload.data.sha256),'MEDIA_NOT_VERIFIED');
    assert(upload.data.byteSize>0&&upload.data.byteSize<=25*1024*1024&&['image/jpeg','image/png','image/webp','application/pdf'].includes(upload.data.mimeType),'MEDIA_NOT_VERIFIED');
    if(external)assert(['image/jpeg','image/png','image/webp'].includes(upload.data.mimeType),'ACCESS_DENIED');const duplicates=(await ctx.tx.list('media_asset')).filter(m=>m.data.sha256===upload.data.sha256&&(!external||m.data.uploadedBy===ctx.actor.userId));
    return ctx.tx.add('media_asset',{...input,customerId,externalIssuePhoto:external,blobKey:upload.data.blobKey,sha256:upload.data.sha256,mimeType:upload.data.mimeType,byteSize:upload.data.byteSize,clientBlobKey:upload.data.clientBlobKey,clientSha256:upload.data.clientSha256,clientMimeType:upload.data.clientMimeType,clientByteSize:upload.data.clientByteSize,metadataStripped:upload.data.metadataStripped===true,redactionConfirmed:upload.data.redactionConfirmed===true,uploadedAt:upload.createdAt,uploadedBy:upload.data.uploadedBy,state:'RECEIVED',duplicateOf:duplicates[0]?.id||null,photoTakenAtVerified:false});
  }),
  'media.approve':command('report.approve',z.object({mediaId:id,reason}).strict(),async(ctx,input)=>{
    const m=await checked(ctx,'media_asset',input.mediaId);assert(m.data.siteId,'ACCESS_DENIED');ctx.requireSite(m.data.siteId);assert(m.data.visibility==='CLIENT_AFTER_APPROVAL'&&m.data.state==='RECEIVED','INVALID_STATE');assert(m.data.clientBlobKey&&m.data.clientSha256&&m.data.clientBlobKey!==m.data.blobKey&&m.data.metadataStripped&&m.data.redactionConfirmed,'CLIENT_COPY_REQUIRED');
    return ctx.tx.save(m,{...m.data,state:'APPROVED_FOR_CLIENT',approvedBy:ctx.actor.userId,approvedAt:ctx.now,approvalReason:input.reason},ctx.expectedVersion??m.version);
  }),
  'report.create':command('report.create',reportInput,async(ctx,input)=>{
    const snapshot=await reportSnapshot(ctx,input);const r=await ctx.tx.add('report',{siteId:input.siteId,customerId:input.customerId,orderId:input.orderId,inputSnapshot:input,draftSnapshot:snapshot,state:'DRAFT',createdBy:ctx.actor.userId,createdAt:ctx.now,nextVersion:1});await ctx.tx.event('report.draft_created',{reportId:r.id,siteId:input.siteId});return r;
  }),
  'report.review':command('report.review',z.object({reportId:id,decision:z.enum(['PASS','RETURN']),reason}).strict(),async(ctx,input)=>{
    const r=await scopedReport(ctx,input.reportId);assert(r.data.state==='DRAFT','INVALID_STATE');assert(r.data.createdBy!==ctx.actor.userId,'SELF_APPROVAL_DENIED');return ctx.tx.save(r,{...r.data,state:input.decision==='PASS'?'REVIEWED':'DRAFT',reviewedBy:ctx.actor.userId,reviewedAt:ctx.now,reviewReason:input.reason},ctx.expectedVersion??r.version);
  }),
  'report.approve':command('report.approve',z.object({reportId:id,reason}).strict(),async(ctx,input)=>{
    const r=await scopedReport(ctx,input.reportId);assert(r.data.state==='REVIEWED','INVALID_STATE');assert(r.data.createdBy!==ctx.actor.userId,'SELF_APPROVAL_DENIED');
    const current=await reportSnapshot(ctx,r.data.inputSnapshot);assert(digest(current)===digest(r.data.draftSnapshot),'REPORT_SOURCE_CHANGED');const saved=await ctx.tx.save(r,{...r.data,state:'APPROVED',approvedBy:ctx.actor.userId,approvedAt:ctx.now,approvalReason:input.reason},ctx.expectedVersion??r.version);await ctx.tx.event('report.approved',{reportId:saved.id,siteId:saved.data.siteId,sourceVersion:saved.version});return saved;
  },true),
  'report.publish':command('report.publish',z.object({reportId:id}).strict(),async(ctx,input)=>{
    const r=await scopedReport(ctx,input.reportId);assert(r.data.state==='APPROVED','INVALID_STATE');const memberships=await ctx.tx.list('customer_membership');assert(memberships.some(m=>m.data.active===true&&!m.data.revokedAt&&(!m.data.expiresAt||Date.parse(m.data.expiresAt)>Date.parse(ctx.now))&&m.data.customerId===r.data.customerId&&(!m.data.siteIds.length||m.data.siteIds.includes(r.data.siteId))),'CUSTOMER_ACCESS_REQUIRED');
    const existing=(await ctx.tx.list('report_version')).filter(v=>v.data.reportId===r.id);assert(!existing.some(v=>v.data.version===r.data.nextVersion),'DUPLICATE_EFFECT');
    const author=await checked(ctx,'user',r.data.createdBy);const snapshot={...r.data.draftSnapshot,number:`KNB-${r.id}-${String(r.data.nextVersion).padStart(2,'0')}`,version:r.data.nextVersion,issuedAt:ctx.now,authorCode:author.data.businessCode||author.data.employeeCode||`A-${digest(r.data.createdBy).slice(0,8)}`,approval:{approvedAt:r.data.approvedAt}};
    const version=await ctx.tx.add('report_version',{reportId:r.id,siteId:r.data.siteId,customerId:r.data.customerId,version:r.data.nextVersion,previousVersionId:r.data.currentVersionId||null,snapshot,sha256:digest(snapshot),templateVersion:snapshot.templateVersion,publishedAt:ctx.now,immutable:true});
    await ctx.tx.save(r,{...r.data,state:'PUBLISHED',currentVersionId:version.id,nextVersion:r.data.nextVersion+1,publishedAt:ctx.now},ctx.expectedVersion??r.version);
    await ctx.tx.event('report.published',{reportId:r.id,reportVersionId:version.id,customerId:r.data.customerId,siteId:r.data.siteId});return version;
  }),
  'report.delivered':command('report.deliver',z.object({reportVersionId:id,channel:z.enum(['PORTAL','WHATSAPP','EMAIL']),providerReference:z.string().min(1).max(200)}).strict(),async(ctx,input)=>{
    const v=await checked(ctx,'report_version',input.reportVersionId);ctx.requireSite(v.data.siteId);const memberships=await ctx.tx.list('customer_membership');assert(memberships.some(m=>m.data.active===true&&!m.data.revokedAt&&(!m.data.expiresAt||Date.parse(m.data.expiresAt)>Date.parse(ctx.now))&&m.data.customerId===v.data.customerId&&(!m.data.siteIds.length||m.data.siteIds.includes(v.data.siteId))),'ACCESS_DENIED');
    assert(!(await ctx.tx.list('report_delivery')).some(d=>d.data.reportVersionId===v.id&&d.data.providerReference===input.providerReference),'DUPLICATE_EFFECT');return ctx.tx.add('report_delivery',{...input,customerId:v.data.customerId,siteId:v.data.siteId,deliveredAt:ctx.now,receiptIsNotAcceptance:true,immutable:true});
  }),
  'report.ack':command('report.ack',z.object({reportVersionId:id,type:z.enum(['DOCUMENT_RECEIPT','HOURS_CONFIRMATION','WORK_ACCEPTANCE']),decision:z.enum(['CONFIRMED','REJECTED','COMMENT']),statement:reason}).strict(),async(ctx,input)=>{
    const v=await checked(ctx,'report_version',input.reportVersionId);await requireCustomer(ctx,v.data.customerId,v.data.siteId);if(input.type==='WORK_ACCEPTANCE')assert(v.data.snapshot.documentType==='Abnahmeprotokoll','LEGAL_ACCEPTANCE_DOCUMENT_REQUIRED');
    assert(!(await ctx.tx.list('customer_acknowledgment')).some(a=>a.data.reportVersionId===v.id&&a.data.userId===ctx.actor.userId&&a.data.type===input.type),'DUPLICATE_EFFECT');
    return ctx.tx.add('customer_acknowledgment',{...input,customerId:v.data.customerId,siteId:v.data.siteId,userId:ctx.actor.userId,reportSha256:v.data.sha256,acknowledgedAt:ctx.now,immutable:true});
  }),
  'report.revise':command('report.create',z.object({reportId:id,reason,descriptionDe:z.string().min(3).max(10000).optional(),taskIds:uniqueIds.optional(),timesheetIds:uniqueIds.optional(),mediaIds:uniqueIds.optional()}).strict(),async(ctx,input)=>{
    const r=await scopedReport(ctx,input.reportId);assert(r.data.state==='PUBLISHED','INVALID_STATE');const previous=await checked(ctx,'report_version',r.data.currentVersionId);const source={...r.data.inputSnapshot};for(const key of ['descriptionDe','taskIds','timesheetIds','mediaIds'])if(input[key]!==undefined)source[key]=input[key];
    const snapshot=await reportSnapshot(ctx,source);return ctx.tx.save(r,{...r.data,inputSnapshot:source,draftSnapshot:snapshot,state:'DRAFT',createdBy:ctx.actor.userId,revisionReason:input.reason,previousSha256:previous.data.sha256,reviewedBy:null,approvedBy:null},ctx.expectedVersion??r.version);
  }),
});

Object.assign(resourcesCommands,{
  'material.price':command('procurement.approve',z.object({materialId:id,supplierId:id,packagePriceCents:integer,effectiveAt:timestamp,validUntil:timestamp.optional(),reference:z.string().min(1).max(200)}).strict(),async(ctx,input)=>{
    const material=await checked(ctx,'material',input.materialId),supplier=await checked(ctx,'supplier',input.supplierId);assert(supplier.data.approved&&material.data.supplierIds.includes(supplier.id),'SUPPLIER_NOT_APPROVED');assert(!input.validUntil||input.validUntil>input.effectiveAt,'INVALID_PERIOD');
    return ctx.tx.add('purchase_price',{...input,packagingBase:material.data.packagingBase,recordedBy:ctx.actor.userId,recordedAt:ctx.now,immutable:true});
  }),
  'stock.writeoff_request':command('inventory.writeoff',z.object({materialId:id,locationId:id,batchId:id.optional(),...qtyInput,reason}).strict(),async(ctx,input)=>{
    await scopedLocation(ctx,input.locationId);const {base}=await materialQuantity(ctx,input);return ctx.tx.add('decision',{type:'STOCK_WRITEOFF',status:'OPEN',materialId:input.materialId,locationId:input.locationId,batchId:input.batchId,quantityBase:base,reason:input.reason,ownerId:ctx.actor.userId,requestedBy:ctx.actor.userId,requestedAt:ctx.now,history:[]});
  }),
  'stock.writeoff_approve':command('inventory.writeoff.approve',z.object({decisionId:id,reason}).strict(),async(ctx,input)=>{
    const d=await checked(ctx,'decision',input.decisionId);await scopedLocation(ctx,d.data.locationId);assert(d.data.type==='STOCK_WRITEOFF'&&d.data.status==='OPEN','INVALID_STATE');assert(d.data.requestedBy!==ctx.actor.userId,'SELF_APPROVAL_DENIED');
    return ctx.tx.save(d,{...d.data,status:'RESOLVED',resolution:'APPROVE',approvalDomain:'INVENTORY',approvedBy:ctx.actor.userId,approvedAt:ctx.now,history:[...d.data.history,{action:'APPROVE',reason:input.reason,actor:ctx.actor.userId,at:ctx.now}]},ctx.expectedVersion??d.version);
  },true),
  'payroll.supplement_request':command('finance.payroll',z.object({employeeId:id,amountCents:positive,reason}).strict(),async(ctx,input)=>{
    ctx.requireOwn(input.employeeId);await checked(ctx,'user',input.employeeId);return ctx.tx.add('decision',{type:'PAYROLL_SUPPLEMENT',status:'OPEN',employeeId:input.employeeId,amountCents:input.amountCents,reason:input.reason,ownerId:ctx.actor.userId,requestedBy:ctx.actor.userId,requestedAt:ctx.now,history:[]});
  }),
  'payroll.supplement_approve':command('finance.payroll.approve',z.object({decisionId:id,reason}).strict(),async(ctx,input)=>{
    const d=await checked(ctx,'decision',input.decisionId);ctx.requireOwn(d.data.employeeId);assert(d.data.type==='PAYROLL_SUPPLEMENT'&&d.data.status==='OPEN','INVALID_STATE');assert(d.data.requestedBy!==ctx.actor.userId,'SELF_APPROVAL_DENIED');
    return ctx.tx.save(d,{...d.data,status:'RESOLVED',resolution:'APPROVE',approvalDomain:'FINANCE',approvedBy:ctx.actor.userId,approvedAt:ctx.now,history:[...d.data.history,{action:'APPROVE',reason:input.reason,actor:ctx.actor.userId,at:ctx.now}]},ctx.expectedVersion??d.version);
  },true),
});
Object.assign(resourcesCommands,{
  'reservation.expire':command('inventory.reserve',z.object({reservationId:id}).strict(),async(ctx,input)=>{
    const r=await checked(ctx,'stock_reservation',input.reservationId);await scopedLocation(ctx,r.data.locationId);assert(r.data.state==='ACTIVE'&&r.data.expiresAt<=ctx.now,'INVALID_STATE');const result=await ctx.tx.save(r,{...r.data,state:'EXPIRED',releasedAt:ctx.now},ctx.expectedVersion??r.version);if(r.data.requestId){const req=await scopedRequest(ctx,r.data.requestId);await requestState(ctx,req);}await ctx.tx.event('stock.reservation_expired',{reservationId:r.id,requestId:r.data.requestId});return result;
  }),
  'report.daily_draft':command('report.create',z.object({siteId:id,orderId:id,day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict(),async(ctx,input)=>{
    ctx.requireSite(input.siteId);const order=await checked(ctx,'order',input.orderId);assert(order.data.siteId===input.siteId,'INVALID_REFERENCE');
    const periodStart=berlinMidnight(input.day),nextDay=new Date(Date.parse(`${input.day}T00:00:00.000Z`)+86400000).toISOString().slice(0,10),periodEnd=berlinMidnight(nextDay);assert(periodStart<ctx.now,'INVALID_PERIOD');
    const existing=(await ctx.tx.list('report')).find(r=>r.data.dailyDraftKey===`${input.siteId}:${input.orderId}:${input.day}`);if(existing)return existing;
    const taskIds=(await ctx.tx.list('task')).filter(t=>t.data.siteId===input.siteId&&(!t.data.orderId||t.data.orderId===order.id)&&t.data.state==='ACCEPTED'&&t.data.reviewedAt>=periodStart&&t.data.reviewedAt<periodEnd).map(t=>t.id);
    const timesheetIds=(await ctx.tx.list('timesheet')).filter(t=>['APPROVED','LOCKED'].includes(t.data.state)&&t.data.periodStart<periodEnd&&t.data.periodEnd>periodStart&&(t.data.segmentSnapshot||[]).some((s:Data)=>s.siteId===input.siteId)).map(t=>t.id);
    const mediaIds=(await ctx.tx.list('media_asset')).filter(m=>m.data.siteId===input.siteId&&(!m.data.orderId||m.data.orderId===order.id)&&m.data.state==='APPROVED_FOR_CLIENT'&&m.data.uploadedAt>=periodStart&&m.data.uploadedAt<periodEnd&&(!m.data.taskId||taskIds.includes(m.data.taskId))).map(m=>m.id);
    const inputSnapshot={siteId:input.siteId,customerId:order.data.customerId,orderId:order.id,periodStart,periodEnd,documentType:'Leistungsnachweis',taskIds,timesheetIds,mediaIds,descriptionDe:`Tagesbericht fuer den ${input.day}. Die aufgefuehrten Leistungen und Stunden beruhen auf bestaetigten Daten.`};
    const draftSnapshot=await reportSnapshot(ctx,inputSnapshot);return ctx.tx.add('report',{siteId:input.siteId,customerId:order.data.customerId,orderId:order.id,inputSnapshot,draftSnapshot,state:'DRAFT',createdBy:ctx.actor.userId,createdAt:ctx.now,nextVersion:1,dailyDraftKey:`${input.siteId}:${input.orderId}:${input.day}`,automatedDraft:true});
  }),
});
Object.assign(resourcesCommands,{
  'payroll.recalculate':command('finance.payroll',z.object({calculationId:id,reason}).strict(),async(ctx,input)=>{
    const c=await checked(ctx,'payroll_calculation',input.calculationId);ctx.requireOwn(c.data.employeeId);const t=await checked(ctx,'timesheet',c.data.timesheetId);assert(['APPROVED','LOCKED'].includes(t.data.state),'TIMESHEET_NOT_APPROVED');
    const effective=await effectivePayrollSeconds(ctx,t);assert(digest(effective.adjustmentIds)!==digest(c.data.adjustmentIds||[]),'NO_NEW_ADJUSTMENTS');
    await ctx.tx.add('payroll_calculation_revision',{calculationId:c.id,calculationVersion:c.version,snapshot:c.data,reason:input.reason,createdBy:ctx.actor.userId,createdAt:ctx.now,immutable:true});
    const rate=c.data.rateSnapshot,baseCents=rate.type==='HOURLY'?asInt((BigInt(effective.payableSeconds)*BigInt(rate.rateCents)+1800n)/3600n):rate.rateCents;
    const preliminaryCents=asInt(BigInt(baseCents)+BigInt(c.data.supplementCents));assert(Number.isSafeInteger(preliminaryCents),'VALIDATION_ERROR');
    return ctx.tx.save(c,{...c.data,...effective,baseCents,preliminaryCents,payableCents:c.data.state==='ACCOUNTANT_VERIFIED'?c.data.payableCents:preliminaryCents,state:'PRELIMINARY',previousOfficialPayslipId:c.data.officialPayslipId||c.data.previousOfficialPayslipId,officialPayslipId:null,officialDocumentCurrent:false,recalculatedBy:ctx.actor.userId,recalculatedAt:ctx.now,recalculationReason:input.reason},ctx.expectedVersion??c.version);
  },true),
});
Object.assign(resourcesCommands,{
  'request.ack':command('inventory.request',z.object({requestId:id,...qtyInput,decision:z.enum(['RECEIVED','DISCREPANCY']),reason:reason.optional()}).strict(),async(ctx,input)=>{
    const r=await scopedRequest(ctx,input.requestId);ownOnly(ctx,r.data.employeeId);const m=await checked(ctx,'material',r.data.materialId),base=exactBaseQuantity(m.data,input.quantity,input.unit,input.decision==='DISCREPANCY');assert(r.data.receivedBase+base<=(r.data.physicalReceivedBase||0),'RECEIPT_EXCEEDS_DELIVERED');assert(input.decision!=='DISCREPANCY'||input.reason,'VALIDATION_ERROR');
    const receipt=await ctx.tx.add('material_request_receipt',{requestId:r.id,materialId:m.id,quantityBase:base,decision:input.decision,reason:input.reason,employeeId:ctx.actor.userId,confirmedAt:ctx.now,immutable:true});await requestState(ctx,{...r,data:{...r.data,receivedBase:r.data.receivedBase+base,discrepancyReason:input.decision==='DISCREPANCY'?input.reason:r.data.discrepancyReason}});return receipt;
  }),
});
Object.assign(resourcesCommands,{
  'material.update':command('inventory.manage',z.object({materialId:id,name:z.string().min(1).max(200).optional(),barcodes:z.array(barcode).max(50).optional(),names:z.record(z.string().max(200)).optional(),synonyms:z.array(z.string().max(100)).optional(),category:z.string().max(100).optional(),packagingBase:positive.optional(),minimumBase:integer.optional(),targetBase:integer.optional(),leadDays:integer.optional(),supplierIds:uniqueIds.optional(),approvedAnalogIds:uniqueIds.optional(),safetyDocumentId:id.optional(),storageRules:z.string().max(2000).optional(),reason}).strict(),async(ctx,input)=>{
    const m=await checked(ctx,'material',input.materialId);if(input.barcodes)assert(new Set(input.barcodes.map((code:string)=>code.toLocaleUpperCase())).size===input.barcodes.length&&!(await ctx.tx.list('material')).some(other=>other.id!==m.id&&((other.data.barcodes||[]).some((code:string)=>input.barcodes.some((v:string)=>v.toLocaleUpperCase()===code.toLocaleUpperCase()))||input.barcodes.some((code:string)=>code.toLocaleUpperCase()===other.data.sku.toLocaleUpperCase()))),'DUPLICATE_BARCODE');for(const supplierId of input.supplierIds||[])await checked(ctx,'supplier',supplierId);for(const materialId of input.approvedAnalogIds||[])await checked(ctx,'material',materialId);if(input.safetyDocumentId)await checked(ctx,'media_asset',input.safetyDocumentId);
    const changes={...input};delete changes.materialId;delete changes.reason;const conversions=m.data.conversions.map((c:Data)=>c.unit==='package'&&input.packagingBase?{...c,numerator:input.packagingBase,denominator:1}:c);
    await ctx.tx.add('material_revision',{materialId:m.id,materialVersion:m.version,snapshot:m.data,reason:input.reason,changedBy:ctx.actor.userId,changedAt:ctx.now,immutable:true});return ctx.tx.save(m,{...m.data,...changes,conversions,lastChangeReason:input.reason},ctx.expectedVersion??m.version);
  }),
});

async function scanMaterial(ctx:CommandContext,code:string){const trimmed=code.trim();assert(trimmed.length>0&&trimmed.length<=256,'VALIDATION_ERROR');let materialId:string|undefined;if(trimmed.startsWith('knaba://')){let qr:URL;try{qr=new URL(trimmed);}catch{throw new DomainError('VALIDATION_ERROR');}assert(qr.hostname==='material'&&!qr.search&&!qr.hash&&!qr.username&&!qr.password&&/^\/[A-Za-z0-9_-]{1,100}$/.test(qr.pathname),'VALIDATION_ERROR',{reason:'INVALID_MATERIAL_QR'});materialId=qr.pathname.slice(1);}const found=(await ctx.tx.list('material')).filter(m=>materialId?m.id===materialId:m.data.sku.toLocaleUpperCase()===trimmed.toLocaleUpperCase()||(m.data.barcodes||[]).includes(trimmed));assert(found.length===1,'NOT_FOUND_SAFE');return found[0];}
Object.assign(resourcesCommands,{
  'material.lookup':command('inventory.read',z.object({code:z.string().min(1).max(256),locationIds:uniqueIds.optional()}).strict(),async(ctx,input)=>{
    const material=await scanMaterial(ctx,input.code);const locations=input.locationIds||[];const balances=[];for(const locationId of locations){await scopedLocation(ctx,locationId);balances.push({locationId,...await stockBalance(ctx,material.id,locationId)});}return {material,qr:`knaba://material/${material.id}`,balances,identification:'EXACT_CONFIGURED_SKU_OR_BARCODE',photoIdentificationVerified:false};
  }),
  'request.from_scan':command('inventory.request',z.object({code:z.string().min(1).max(256),siteId:id,taskId:id.optional(),...qtyInput,dueAt:timestamp,urgency:z.enum(['NORMAL','URGENT','CRITICAL']).default('NORMAL'),reason}).strict(),async(ctx,input)=>{
    const material=await scanMaterial(ctx,input.code);const {code,...request}=input;return resourcesCommands['request.create'].handler(ctx,resourcesCommands['request.create'].schema.parse({...request,materialId:material.id}));
  }),
  'stock.use_from_scan':command('inventory.use',z.object({code:z.string().min(1).max(256),locationId:id,...qtyInput,batchId:id.optional(),taskId:id,worklogId:id.optional(),locationNodeId:id.optional(),reference:z.string().min(1).max(100),confirmed:z.literal(true)}).strict(),async(ctx,input)=>{
    const material=await scanMaterial(ctx,input.code);const {code,confirmed,...usage}=input;return resourcesCommands['stock.use'].handler(ctx,resourcesCommands['stock.use'].schema.parse({...usage,materialId:material.id}));
  }),
});
