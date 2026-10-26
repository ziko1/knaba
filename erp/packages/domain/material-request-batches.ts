import {z} from 'zod';
import {assert,id,timestamp,type CommandContext,type CommandDefinition,type CommandRegistry,type Data,type Entity} from './core.ts';

const integer=z.number().int().nonnegative().safe(),quantity=z.string().regex(/^\d+(?:\.\d{1,9})?$/).max(40),unit=z.enum(['ml','l','g','kg','pcs','pair','package']);
const reason=z.string().min(3).max(2000),qty={quantity,unit};
const command=(permission:string,schema:z.ZodTypeAny,handler:CommandDefinition['handler']):CommandDefinition=>({permission,schema,handler});
const sum=(values:number[])=>{const value=values.reduce((n,v)=>{assert(Number.isSafeInteger(v)&&v>=0,'LEDGER_INVARIANT');return n+BigInt(v);},0n);assert(value<=BigInt(Number.MAX_SAFE_INTEGER),'LEDGER_INVARIANT');return Number(value);};
const ownCompany=async(c:CommandContext,kind:string,value:string)=>{const row=await c.tx.get(kind,value);assert(row.companyId===c.actor.companyId,'NOT_FOUND_SAFE');return row;};
const exactQuantity=(material:Entity,input:Data)=>{
 const conv=material.data.conversions?.find((item:Data)=>item.unit===input.unit);assert(conv,'UNIT_INCOMPATIBLE');
 const [whole,fraction='']=input.quantity.split('.'),n=BigInt(whole+fraction)*BigInt(conv.numerator),d=10n**BigInt(fraction.length)*BigInt(conv.denominator);
 assert(n>0n&&n%d===0n,'NON_INTEGRAL_BASE_QUANTITY');assert(n/d<=BigInt(Number.MAX_SAFE_INTEGER),'VALIDATION_ERROR');return Number(n/d);
};
const approval=(line:Entity)=>line.data.approvalState??(line.data.state==='DRAFT'?'DRAFT':line.data.state==='SUBMITTED'?'SUBMITTED':line.data.approvedBase===0?'REJECTED':line.data.approvedBase<line.data.quantityBase?'PARTIAL':'APPROVED');
async function batchLines(c:CommandContext,batch:Entity,authorize=true){
 assert(batch.kind==='material_request_batch'&&batch.companyId===c.actor.companyId&&Array.isArray(batch.data.lineIds)&&batch.data.lineIds.length>0&&batch.data.lineIds.length<=100&&new Set(batch.data.lineIds).size===batch.data.lineIds.length,'INVALID_REFERENCE');
 const lines:Entity[]=[];
 for(const [index,lineId]of batch.data.lineIds.entries()){
  const line=await ownCompany(c,'material_request',lineId);
  assert(line.data.batchRequestId===batch.id&&line.data.lineIndex===index&&line.data.employeeId===batch.data.employeeId,'INVALID_REFERENCE');if(authorize)c.requireSite(line.data.siteId);lines.push(line);
 }
 return lines;
}
async function lineFacts(c:CommandContext,lines:Entity[]){
 const [reservations,transfers,usages,batches]=await Promise.all([c.tx.list('stock_reservation'),c.tx.list('transfer'),c.tx.list('material_usage'),c.tx.list('material_batch')]);
 const blocked=new Set(batches.filter(row=>row.data.status!=='USABLE'||row.data.expiresAt&&row.data.expiresAt<=c.now).map(row=>row.id));
 return lines.map(line=>{
  const outgoing=transfers.filter(row=>row.data.requestId===line.id),returns=transfers.filter(row=>row.data.returnRequestId===line.id),used=usages.filter(row=>row.data.requestId===line.id);
  const reservedBase=sum(reservations.filter(row=>row.data.requestId===line.id&&row.data.state==='ACTIVE'&&row.data.expiresAt>c.now&&(!row.data.batchId||!blocked.has(row.data.batchId))).map(row=>row.data.quantityBase-row.data.issuedBase));
  const issuedBase=sum(outgoing.map(row=>row.data.quantityBase)),physicalReceivedBase=sum(outgoing.map(row=>row.data.acceptedBase)),inTransitBase=sum(outgoing.map(row=>row.data.quantityBase-row.data.acceptedBase));
  const usedBase=sum(used.map(row=>row.data.quantityBase)),returnedBase=sum(returns.map(row=>row.data.acceptedBase)),returnInTransitBase=sum(returns.map(row=>row.data.quantityBase-row.data.acceptedBase));
  const approvedBase=line.data.approvedBase??0,receivedBase=line.data.receivedBase??0,cancelledUnissuedBase=line.data.cancelledUnissuedBase??0;
  assert(issuedBase===line.data.issuedBase&&physicalReceivedBase===(line.data.physicalReceivedBase??0)&&issuedBase<=approvedBase&&receivedBase<=physicalReceivedBase&&usedBase+returnedBase+returnInTransitBase<=receivedBase&&cancelledUnissuedBase+issuedBase<=approvedBase,'LEDGER_INVARIANT');
  const outstandingBase=approvedBase-issuedBase-cancelledUnissuedBase,custodyBase=receivedBase-usedBase-returnedBase-returnInTransitBase;
  const unresolvedDiscrepancy=!!line.data.discrepancyReason&&!line.data.discrepancyResolvedAt;
  const returnObligationBase=line.data.returnRequired?custodyBase+returnInTransitBase:0;
  const settled=outstandingBase===0&&inTransitBase===0&&returnInTransitBase===0&&receivedBase===issuedBase&&!unresolvedDiscrepancy&&returnObligationBase===0;
  return {requestId:line.id,lineIndex:line.data.lineIndex,materialId:line.data.materialId,sku:line.data.sku,siteId:line.data.siteId,taskId:line.data.taskId,needBy:line.data.dueAt,reason:line.data.reason,quantity:line.data.requestedQuantity,unit:line.data.requestedUnit,baseUnit:line.data.baseUnit,materialRequirementId:line.data.materialRequirementId,approvalState:approval(line),requestedBase:line.data.quantityBase,approvedBase,reservedBase,issuedBase,physicalReceivedBase,receivedBase,usedBase,returnedBase,inTransitBase,returnInTransitBase,cancelledUnissuedBase,outstandingBase,custodyBase,unresolvedDiscrepancy,returnObligationBase,settled};
 });
}
export async function materialRequestBatchView(c:CommandContext,batch:Entity,authorize=true){
 const lines=await batchLines(c,batch,authorize),facts=await lineFacts(c,lines),states=facts.map(line=>line.approvalState);
 const approvalState=states.includes('DRAFT')?'DRAFT':states.includes('SUBMITTED')?'SUBMITTED':states.every(state=>state==='REJECTED')?'REJECTED':states.every(state=>state==='APPROVED')?'APPROVED':'PARTIAL';
 const settled=facts.every(line=>line.settled),started=facts.some(line=>line.reservedBase+line.issuedBase+line.receivedBase+line.usedBase+line.returnedBase>0);
 return {...batch,data:{...batch.data,approvalState,fulfillmentState:batch.data.closedAt?'CLOSED':settled&&!['DRAFT','SUBMITTED'].includes(approvalState)?'SETTLED':started?'PARTIAL':'OPEN',lines:facts}};
}
/** Internal cache refresh only; public reads still require every line's fresh site scope. */
export async function synchronizeMaterialRequestBatch(c:CommandContext,line:Entity){
 if(!line.data.batchRequestId)return;
 const batch=await ownCompany(c,'material_request_batch',line.data.batchRequestId),view=await materialRequestBatchView(c,batch,false);
 await c.tx.save(batch,view.data,batch.version);
}
async function scopedLine(c:CommandContext,requestId:string){
 const line=await ownCompany(c,'material_request',requestId);assert(line.data.batchRequestId,'INVALID_REFERENCE');c.requireSite(line.data.siteId);
 const batch=await ownCompany(c,'material_request_batch',line.data.batchRequestId);await batchLines(c,batch,false);return line;
}
async function lineAvailableAt(c:CommandContext,line:Entity,locationId:string){
 const [transfers,usages]=await Promise.all([c.tx.list('transfer'),c.tx.list('material_usage')]);
 const received=sum(transfers.filter(row=>row.data.requestId===line.id&&row.data.targetId===locationId).map(row=>row.data.acceptedBase));
 const used=sum(usages.filter(row=>row.data.requestId===line.id&&row.data.locationId===locationId).map(row=>row.data.quantityBase));
 const returned=sum(transfers.filter(row=>row.data.returnRequestId===line.id&&row.data.sourceId===locationId).map(row=>row.data.quantityBase));
 assert(received>=used+returned,'LEDGER_INVARIANT');return received-used-returned;
}
/** Shared all-channel guard before a genuine usage/return ledger fact is created. */
export async function validateMaterialRequestLineAllocation(c:CommandContext,line:Entity,locationId:string,base:number){
 assert(line.data.batchRequestId&&['APPROVED','PARTIAL'].includes(approval(line)),'INVALID_STATE');
 const batch=await ownCompany(c,'material_request_batch',line.data.batchRequestId);await batchLines(c,batch,false);
 const facts=(await lineFacts(c,[line]))[0]!;assert(facts.custodyBase>=base&&await lineAvailableAt(c,line,locationId)>=base,'REQUEST_ALLOCATION_EXCEEDS_RECEIVED');
}
/** Existing handlers are reused in the caller's transaction; no nested executor, receipt or retry authority. */
export function createMaterialRequestBatchCommands(resources:CommandRegistry):CommandRegistry{
 const delegate=async(c:CommandContext,name:string,input:Data,expectedVersion?:number)=>{
  const definition=resources[name];assert(definition,'MISSING_CONFIGURATION');const scoped=c.forPermission?await c.forPermission(definition.permission):c;assert(scoped.actor.permissions.includes(definition.permission),'ACCESS_DENIED');
  return definition.handler({...scoped,expectedVersion},definition.schema.parse(input));
 };
 return {
  'request.batch.create':command('inventory.request',z.object({lines:z.array(z.object({materialId:id,siteId:id,taskId:id.optional(),...qty,needBy:timestamp,reason,urgency:z.enum(['NORMAL','URGENT','CRITICAL']).default('NORMAL'),materialRequirementId:id.optional(),returnRequired:z.boolean().default(false)}).strict()).min(1).max(100),reason}).strict(),async(c,i)=>{
   const requirements=i.lines.map((line:Data)=>line.materialRequirementId).filter(Boolean);assert(new Set(requirements).size===requirements.length,'DUPLICATE_EFFECT');
   const existing=await c.tx.list('material_request');
   for(const input of i.lines){c.requireSite(input.siteId);await ownCompany(c,'site',input.siteId);const material=await ownCompany(c,'material',input.materialId);const base=exactQuantity(material,input);
    if(input.taskId){const task=await ownCompany(c,'task',input.taskId);assert(task.data.siteId===input.siteId,'INVALID_REFERENCE');}
    if(input.materialRequirementId){const required=await ownCompany(c,'material_requirement',input.materialRequirementId);assert(required.data.siteId===input.siteId&&required.data.materialId===input.materialId&&required.data.quantityBase===base,'INVALID_REFERENCE');assert(!required.data.requestId&&!existing.some(row=>row.data.materialRequirementId===required.id),'DUPLICATE_EFFECT');}
   }
   const batch=await c.tx.add('material_request_batch',{employeeId:c.actor.userId,createdBy:c.actor.userId,createdAt:c.now,siteIds:[...new Set(i.lines.map((line:Data)=>line.siteId))],lineIds:[],reason:i.reason,approvalState:'DRAFT',fulfillmentState:'OPEN'}),lineIds:string[]=[];
   for(const [index,input]of i.lines.entries()){
    const {needBy,materialRequirementId,returnRequired,...createInput}=input;
    const line=await delegate(c,'request.create',{...createInput,dueAt:needBy}),material=await ownCompany(c,'material',input.materialId);
    const saved=await c.tx.save(line,{...line.data,batchRequestId:batch.id,lineIndex:index,requestedQuantity:input.quantity,requestedUnit:input.unit,baseUnit:material.data.baseUnit,sku:material.data.sku,materialRequirementId,returnRequired,approvalState:'DRAFT'},line.version);lineIds.push(saved.id);
   }
   const saved=await c.tx.save(batch,{...batch.data,lineIds},batch.version),view=await materialRequestBatchView(c,saved),persisted=await c.tx.save(saved,view.data,saved.version);await c.tx.event('material_request_batch.created',{batchRequestId:batch.id,employeeId:c.actor.userId,siteIds:saved.data.siteIds,lineIds});return materialRequestBatchView(c,persisted);
  }),
  'request.batch.view':command('inventory.read',z.object({batchRequestId:id}).strict(),async(c,i)=>materialRequestBatchView(c,await ownCompany(c,'material_request_batch',i.batchRequestId))),
  'request.batch.submit':command('inventory.request',z.object({batchRequestId:id}).strict(),async(c,i)=>{
   const batch=await ownCompany(c,'material_request_batch',i.batchRequestId);assert(batch.version===(c.expectedVersion??batch.version),'VERSION_CONFLICT');assert(batch.data.employeeId===c.actor.userId&&!batch.data.closedAt,'ACCESS_DENIED');const lines=await batchLines(c,batch);assert(lines.every(line=>line.data.state==='DRAFT'),'INVALID_STATE');
   for(const line of lines)await delegate(c,'request.submit',{requestId:line.id},line.version);const fresh=await ownCompany(c,'material_request_batch',batch.id),view=await materialRequestBatchView(c,fresh);await c.tx.event('material_request_batch.submitted',{batchRequestId:batch.id,employeeId:c.actor.userId,siteIds:batch.data.siteIds});return view;
  }),
  'request.batch.approve':command('inventory.approve',z.object({batchRequestId:id,lines:z.array(z.object({requestId:id,decision:z.enum(['APPROVE','PARTIAL','REJECT']),approvedBase:integer.optional(),reason:reason.optional()}).strict()).min(1).max(100)}).strict(),async(c,i)=>{
   const batch=await ownCompany(c,'material_request_batch',i.batchRequestId);assert(batch.version===(c.expectedVersion??batch.version),'VERSION_CONFLICT');assert(batch.data.employeeId!==c.actor.userId,'SELF_APPROVAL_DENIED');assert(!batch.data.closedAt,'INVALID_STATE');const lines=await batchLines(c,batch);
   assert(lines.length===i.lines.length&&new Set(i.lines.map((line:Data)=>line.requestId)).size===lines.length&&lines.every(line=>i.lines.some((input:Data)=>input.requestId===line.id)),'INVALID_REFERENCE');assert(lines.every(line=>line.data.state==='SUBMITTED'),'INVALID_STATE');
   for(const line of lines)await delegate(c,'request.approve',i.lines.find((input:Data)=>input.requestId===line.id),line.version);
   const fresh=await ownCompany(c,'material_request_batch',batch.id),view=await materialRequestBatchView(c,fresh);await c.tx.event('material_request_batch.approved',{batchRequestId:batch.id,employeeId:batch.data.employeeId,siteIds:batch.data.siteIds,approvalState:view.data.approvalState});return view;
  }),
  'request.line.use':command('inventory.use',z.object({requestId:id,locationId:id,...qty,batchId:id.optional(),taskId:id,worklogId:id.optional(),locationNodeId:id.optional(),reference:z.string().min(1).max(100)}).strict(),async(c,i)=>{
   const line=await scopedLine(c,i.requestId);assert(['APPROVED','PARTIAL'].includes(approval(line)),'INVALID_STATE');assert(line.data.employeeId===c.actor.userId||c.actor.permissions.includes('scope.company'),'ACCESS_DENIED');assert(!line.data.taskId||line.data.taskId===i.taskId,'INVALID_REFERENCE');
   return delegate(c,'stock.use',{...i,materialId:line.data.materialId});
  }),
  'request.line.return':command('inventory.ship',z.object({requestId:id,sourceId:id,targetId:id,...qty,batchId:id.optional(),reason}).strict(),async(c,i)=>{
   const line=await scopedLine(c,i.requestId);assert(['APPROVED','PARTIAL'].includes(approval(line)),'INVALID_STATE');const source=await ownCompany(c,'stock_location',i.sourceId),target=await ownCompany(c,'stock_location',i.targetId);
   assert(source.data.siteId===line.data.siteId||source.data.employeeId===line.data.employeeId,'INVALID_REFERENCE');assert(['WAREHOUSE','VEHICLE'].includes(target.data.type),'INVALID_REFERENCE');
   const {requestId,...input}=i;return delegate(c,'stock.ship',{...input,materialId:line.data.materialId,returnRequestId:requestId});
  }),
  'request.line.resolve_discrepancy':command('inventory.approve',z.object({requestId:id,reason}).strict(),async(c,i)=>{
   const line=await scopedLine(c,i.requestId),facts=(await lineFacts(c,[line]))[0]!;assert(facts.unresolvedDiscrepancy&&facts.inTransitBase===0&&facts.returnInTransitBase===0&&facts.receivedBase===facts.issuedBase,'INVALID_STATE');assert(line.data.employeeId!==c.actor.userId,'SELF_APPROVAL_DENIED');
   const saved=await c.tx.save(line,{...line.data,discrepancyResolvedAt:c.now,discrepancyResolvedBy:c.actor.userId,discrepancyResolutionReason:i.reason},c.expectedVersion??line.version);await synchronizeMaterialRequestBatch(c,saved);return saved;
  }),
  'request.batch.close':command('inventory.approve',z.object({batchRequestId:id,reason,cancelRemaining:z.boolean().default(false),custodyReason:reason.optional()}).strict(),async(c,i)=>{
   const batch=await ownCompany(c,'material_request_batch',i.batchRequestId);assert(batch.version===(c.expectedVersion??batch.version),'VERSION_CONFLICT');assert(!batch.data.closedAt,'INVALID_STATE');const lines=await batchLines(c,batch),facts=await lineFacts(c,lines);assert(facts.every(line=>!['DRAFT','SUBMITTED'].includes(line.approvalState)),'INVALID_STATE');
   assert(facts.every(line=>line.inTransitBase===0&&line.returnInTransitBase===0&&!line.unresolvedDiscrepancy&&line.receivedBase===line.issuedBase&&line.returnObligationBase===0),'REQUEST_OBLIGATIONS_UNSETTLED');
   assert(i.cancelRemaining||facts.every(line=>line.outstandingBase===0),'REQUEST_OBLIGATIONS_UNSETTLED');const custody=facts.filter(line=>line.custodyBase>0);assert(custody.length===0||i.custodyReason,'CUSTODY_REASON_REQUIRED');
   if(i.cancelRemaining){
    const active=(await c.tx.list('stock_reservation')).filter(reservation=>lines.some(line=>line.id===reservation.data.requestId)&&reservation.data.state==='ACTIVE');
    assert(active.length===0||c.forPermission,'MISSING_CONFIGURATION',{reason:'SCOPED_COMMAND_AUTHORITY_REQUIRED'});
    for(const reservation of active)await delegate(c,'reservation.release',{reservationId:reservation.id,reason:i.reason},reservation.version);
   }else assert(facts.every(line=>line.reservedBase===0),'REQUEST_OBLIGATIONS_UNSETTLED');
   for(const line of lines){const fresh=await ownCompany(c,'material_request',line.id),fact=facts.find(item=>item.requestId===line.id)!;await c.tx.save(fresh,{...fresh.data,state:'CLOSED',approvalState:fact.approvalState,closedAt:c.now,closedBy:c.actor.userId,closeReason:i.reason,cancelledUnissuedBase:(fresh.data.cancelledUnissuedBase??0)+(i.cancelRemaining?fact.outstandingBase:0),cancellationReason:i.cancelRemaining&&fact.outstandingBase>0?i.reason:fresh.data.cancellationReason},fresh.version);}
   const fresh=await ownCompany(c,'material_request_batch',batch.id),closed=await c.tx.save(fresh,{...fresh.data,closedAt:c.now,closedBy:c.actor.userId,closeReason:i.reason,custodyRetained: custody.map(line=>({requestId:line.requestId,materialId:line.materialId,quantityBase:line.custodyBase,employeeId:batch.data.employeeId,reason:i.custodyReason})),fulfillmentState:'CLOSED'},fresh.version),view=await materialRequestBatchView(c,closed);await c.tx.save(closed,view.data,closed.version);await c.tx.event('material_request_batch.closed',{batchRequestId:batch.id,employeeId:batch.data.employeeId,siteIds:batch.data.siteIds,cancelRemaining:i.cancelRemaining,reason:i.reason});return materialRequestBatchView(c,await ownCompany(c,'material_request_batch',batch.id));
  }),
 };
}
