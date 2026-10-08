import {assert,type CommandContext,type Entity} from './core.js';

/** Called only after the authoritative active shift points at the actual new
 * segment in the same command transaction. An unbound segment never guesses an
 * order from its site. Authorization and all business effects share that TX. */
export async function startOrderFromWorkSegment(ctx:CommandContext,segment:Entity):Promise<Entity|undefined>{
 assert(segment.kind==='time_segment'&&segment.companyId===ctx.actor.companyId,'ACCESS_DENIED');
 const current=await ctx.tx.get('time_segment',segment.id);assert(current.version===segment.version,'VERSION_CONFLICT');
 if(!['WORKING','SERVICE_TASK'].includes(current.data.activity)||!current.data.taskId)return;
 const task=await ctx.tx.get('task',current.data.taskId);if(!task.data.orderId)return;
 const order=await ctx.tx.get('order',task.data.orderId),shift=await ctx.tx.get('shift',current.data.shiftId),site=await ctx.tx.get('site',order.data.siteId);
 assert(shift.data.state==='ACTIVE'&&shift.data.activeSegmentId===current.id&&current.data.endAt===null&&shift.data.employeeId===current.data.employeeId,'INVALID_STATE',{reason:'ACTIVE_ORDER_WORK_SEGMENT_REQUIRED'});
 ctx.requireOwn(shift.data.employeeId);ctx.requireSite(order.data.siteId);
 assert(site.data.active===true&&site.data.customerId===order.data.customerId&&shift.data.siteId===order.data.siteId&&order.data.siteId===current.data.siteId&&task.data.siteId===order.data.siteId&&task.data.assigneeIds.includes(shift.data.employeeId)&&['ASSIGNED','IN_PROGRESS'].includes(task.data.state),'ACCESS_DENIED',{reason:'ORDER_TASK_WORK_SCOPE_REQUIRED'});
 assert(['SCHEDULED','IN_PROGRESS'].includes(order.data.status),'INVALID_STATE',{reason:'ORDER_NOT_PERMITTED_TO_START',status:order.data.status});
 const assignment=await ctx.tx.get('crew_assignment',order.data.assignmentId);assert(assignment.data.orderId===order.id&&assignment.data.siteId===order.data.siteId&&assignment.data.scheduleVersion===order.data.scheduleVersion&&['ACKNOWLEDGED','STARTED'].includes(assignment.data.status),'INVALID_STATE',{reason:'CURRENT_ACCEPTED_CREW_REQUIRED'});
 const userIds:string[]=[];for(const employeeId of assignment.data.employeeIds){const employee=await ctx.tx.get('employee',employeeId);assert(employee.data.active!==false,'INVALID_STATE',{reason:'CREW_MEMBER_INACTIVE'});userIds.push(employee.data.userId??employee.data.user_id??employee.id);}
 assert(userIds.includes(shift.data.employeeId)&&assignment.data.employeeIds.every((id:string)=>assignment.data.acknowledgedIds.includes(id)),'NEEDS_APPROVAL',{reason:'ALL_REQUIRED_CREW_ACKNOWLEDGMENTS_REQUIRED'});
 assert(Number.isFinite(Date.parse(current.data.startAt))&&Date.parse(current.data.startAt)<=Date.parse(ctx.now)&&(!order.data.confirmedAt||Date.parse(current.data.startAt)>=Date.parse(order.data.confirmedAt)),'INVALID_STATE',{reason:'ORDER_WORK_SEGMENT_TIME_INVALID'});
 if(order.data.status==='IN_PROGRESS')return order;
 await ctx.tx.save(assignment,{...assignment.data,status:'STARTED',startedAt:current.data.startAt,startedBy:shift.data.employeeId,firstWorkSegmentId:current.id},assignment.version);
 const started=await ctx.tx.save(order,{...order.data,status:'IN_PROGRESS',startedAt:current.data.startAt,firstWorkSegmentId:current.id},order.version);
 await ctx.tx.event('order.status_changed',{orderId:order.id,status:'IN_PROGRESS',source:'FIRST_PERMITTED_WORK_SEGMENT',segmentId:current.id,employeeId:shift.data.employeeId});return started;
}
