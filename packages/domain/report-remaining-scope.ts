import {assert,type Entity} from './core.ts';

export interface ReportRemainingTaskRow {
 taskId:string; taskVersion:number; locationId:string|null; descriptionDe:string;
 state:string; unit:string; plannedQuantityMilli:number; acceptedQuantityMilli:number; remainingQuantityMilli:number;
}

/** The reviewed report contains an explicit, allowlisted snapshot of the
 * customer's remaining scope, not private worklog/rejection narratives.
 * No caller-supplied list may silently omit unfinished work. */
export function reportRemainingTaskRows(order:Entity,tasks:Entity[]):ReportRemainingTaskRow[] {
 const rows:ReportRemainingTaskRow[]=[];
 for(const task of tasks.filter(t=>t.companyId===order.companyId&&t.data.orderId===order.id&&t.data.state!=='CANCELLED')){
  const d=task.data;assert(d.siteId===order.data.siteId,'INVALID_REFERENCE');
  // Explicitly internal/unapproved work is never implicitly published merely
  // because it shares an order. Existing client visibility remains authoritative.
  if(['INTERNAL','PENDING_APPROVAL'].includes(d.billingScope)&&d.clientVisible!==true)continue;
  const accepted=d.state==='ACCEPTED'?d.acceptedQuantityMilli:0;
  // Pre-V4 accepted tasks may lack a planned quantity. Their accepted quantity
  // remains authoritative; do not invent a remainder or rewrite their bytes.
  const planned=d.plannedQuantityMilli??(d.state==='ACCEPTED'?accepted:undefined);
  assert(Number.isSafeInteger(planned)&&planned>=0&&Number.isSafeInteger(accepted)&&accepted>=0&&typeof d.unit==='string'&&d.unit.length>0,'INVALID_STATE',{reason:'REPORT_TASK_QUANTITY_REQUIRED'});
  const remaining=Math.max(0,planned-accepted);
  if(d.state==='ACCEPTED'&&remaining===0)continue;
  assert(d.clientVisible!==false,'NEEDS_APPROVAL',{reason:'REMAINING_SCOPE_VISIBILITY_REVIEW_REQUIRED'});
  rows.push({taskId:task.id,taskVersion:task.version,locationId:d.locationId??null,descriptionDe:d.titleDe??d.title??'',state:d.state,unit:d.unit,plannedQuantityMilli:planned,acceptedQuantityMilli:accepted,remainingQuantityMilli:remaining});
 }
 return rows.sort((a,b)=>a.taskId.localeCompare(b.taskId));
}
