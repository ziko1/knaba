import {describe,it,expect,vi} from 'vitest';
import {z,ZodError} from 'zod';
import {DomainError,type Actor,type Entity} from '../packages/domain/core.ts';
import {registry} from '../apps/api/registry.ts';
import {V4_REST_ROUTES,executeV4Rest,resolveV4Route,v4HttpError,v4HttpStatus,parseV4PageQuery,encodeV4Cursor,paginateV4Entities,v4OpenApiPaths,type V4CursorBinding} from '../apps/api/v4-rest.ts';

const actor:Actor={companyId:'company-a',userId:'employee-a',roles:['EMPLOYEE'],permissions:['task.work','shift.manage'],siteIds:['site-a'],customerIds:[],warehouseIds:[]};
const key='0123456789abcdef0123456789abcdef';
const now=Date.parse('2026-10-09T12:00:00.000Z');
const binding:V4CursorBinding={companyId:actor.companyId,userId:actor.userId,resource:'entities:task',filters:{siteId:'site-a'}};
const row=(id:string,createdAt='2026-10-09T11:00:00.000Z'):Entity=>({id,createdAt,updatedAt:createdAt,companyId:actor.companyId,kind:'task',version:1,data:{}});

describe('V4 named REST adapter (explicit Engine fixture; business authorization remains in Engine)',()=>{
 it('covers the required domain path groups and binds their canonical domain resource fields',()=>{
  const routes=[
   ['/leads/l-1/qualify','lead.qualify','id'],['/quotes/q-1/approve','quote.approve','id'],['/quotes/q-1/send','quote.send','id'],['/quotes/q-1/accept','quote.accept','id'],
   ['/handoffs/c-1/claim','handoff.take','channel_id'],['/handoffs/c-1/return-to-ai','handoff.resume','channel_id'],
   ['/orders/o-1/crew-reservations','dispatch.reserve','orderId'],['/orders/o-1/schedule','dispatch.assign','orderId'],['/sites/s-1/locations','location.create','siteId'],
   ['/channels/c-1/messages','message.send','channel_id'],['/messages/m-1/translations','translation.request','message_id'],
   ['/payroll/p-1/approve','payroll.approve','calculationId'],['/payouts/p-1/approve','payout.approve','payoutId'],['/payouts/p-1/record','payout.record','payoutId'],['/payouts/p-1/acknowledge','payout.ack','payoutId'],
   ['/reports/r-1/publish','report.publish','reportId'],['/reports/r-1/acknowledge','report.ack','reportVersionId'],
  ];
  for(const [path,command,idField]of routes){const resolved=resolveV4Route('POST',`/api/v1${path}`,{expected_version:7});expect(resolved.command).toBe(command);expect(resolved.input[idField!]).toBe(path!.split('/')[2]);expect(resolved.expectedVersion).toBe(7);}
  for(const path of ['/leads','/shifts/start','/trips','/material-requests','/stock/transfers','/stock/receipts','/stock/usage','/payouts'])expect(resolveV4Route('POST',path,{expected_version:7}).command).toBeTruthy();
  for(const route of V4_REST_ROUTES)if(route.command&&route.command!=='payroll.approve')expect(registry[route.command]).toBeDefined();
 });
 it('forwards a validated task action, authenticated actor and Idempotency-Key to the same Engine',async()=>{
  const execute=vi.fn(async()=>({id:'task-a',version:3}));
  const result=await executeV4Rest({registry,execute},actor,{method:'POST',path:'/tasks/task-a/transitions',body:{action:'START',expected_version:2},idempotencyKey:'command-1234'});
  expect(execute).toHaveBeenCalledExactlyOnceWith(actor,'task.start',{input:{taskId:'task-a'},expected_version:2,idempotency_key:'command-1234',preconditions:[{kind:'task',id:'task-a',version:2}]});
  expect(result).toEqual({status:200,body:{id:'task-a',version:3}});
 });
 it('maps ACCEPT/REJECT review actions and bounded shift/trip actions without arbitrary command injection',()=>{
  expect(resolveV4Route('POST','/tasks/task-a/transitions',{action:'REJECT',reason:'Correction required',expected_version:2}).input).toEqual({taskId:'task-a',decision:'REJECT',reason:'Correction required'});
  expect(resolveV4Route('POST','/shifts/shift-a/actions',{action:'END',expected_version:3}).command).toBe('shift.end');
  expect(resolveV4Route('POST','/trips/trip-a/actions',{action:'ARRIVE',expected_version:4}).command).toBe('trip.arrive');
  expect(()=>resolveV4Route('POST','/tasks/task-a/transitions',{action:'identity.delete',expected_version:2})).toThrow(ZodError);
  expect(()=>resolveV4Route('POST','/tasks/task-a/transitions',{action:'ACCEPT',decision:'REJECT',expected_version:2})).toThrowError('VALIDATION_ERROR');
 });
 it('binds body-ID parent versions for trip creation, time correction and payout creation',async()=>{
  const execute=vi.fn(async(_actor:Actor,_command:string,_envelope:Record<string,unknown>)=>({done:true}));
  const commands={
   'trip.start':{...registry['trip.start']!,schema:z.object({shiftId:z.string()}).strict()},
   'timesheet.correction':{...registry['timesheet.correction']!,schema:z.object({timesheetId:z.string()}).strict()},
   'payout.create':{...registry['payout.create']!,schema:z.object({calculationId:z.string()}).strict()},
  };
  for(const [path,field,kind]of [['/trips','shiftId','shift'],['/time/corrections','timesheetId','timesheet'],['/payouts','calculationId','payroll_calculation']] as const){
   await executeV4Rest({registry:commands,execute},actor,{method:'POST',path,body:{[field]:'parent-a',expected_version:3},idempotencyKey:'parent-command-123'});
   expect(execute.mock.calls.at(-1)![2]).toMatchObject({preconditions:[{kind,id:'parent-a',version:3}]});
   expect(()=>resolveV4Route('POST',path,{[field]:'parent-a'})).toThrow(ZodError);
  }
 });
 it('rejects missing update version, forged transport fields, mismatched body/path identifiers and unsafe paths before effects',async()=>{
  const execute=vi.fn();
  for(const body of [{action:'START'},{action:'START',expected_version:2,taskId:'other-task'},{action:'START',expected_version:2,actorId:'owner'},{action:'START',expected_version:2,companyId:'other-company'},{action:'START',expected_version:2,idempotency_key:'evil-key'}])await expect(executeV4Rest({registry,execute},actor,{method:'POST',path:'/tasks/task-a/transitions',body,idempotencyKey:'command-1234'})).rejects.toThrow();
  for(const path of ['/tasks/%2fprivate/transitions','/tasks/%00private/transitions','/tasks/%2e%2e/transitions','/tasks/%zz/transitions'])expect(()=>resolveV4Route('POST',path,{action:'START',expected_version:1})).toThrow();
  expect(execute).not.toHaveBeenCalled();
 });
 it('uses strict domain schema and a transport-only printable key; unknown fields and duplicate-key arrays fail',async()=>{
  const execute=vi.fn();
  await expect(executeV4Rest({registry,execute},actor,{method:'POST',path:'/tasks/task-a/transitions',body:{action:'START',expected_version:2,shell:'rm -rf'},idempotencyKey:'command-1234'})).rejects.toThrow(ZodError);
  for(const idempotencyKey of ['short','command-1234\n',[ 'command-1234','command-5678' ]])await expect(executeV4Rest({registry,execute},actor,{method:'POST',path:'/tasks/task-a/transitions',body:{action:'START',expected_version:2},idempotencyKey})).rejects.toThrow(ZodError);
  expect(execute).not.toHaveBeenCalled();
 });
 it('propagates real Engine denial/conflict and never creates a fake async operation from a result ID',async()=>{
  const denial=new DomainError('ACCESS_DENIED',{internalUser:'secret'});
  await expect(executeV4Rest({registry,execute:async()=>{throw denial;}},actor,{method:'POST',path:'/tasks/task-a/transitions',body:{action:'START',expected_version:2},idempotencyKey:'command-1234'})).rejects.toBe(denial);
  await expect(executeV4Rest({registry,execute:async()=>{throw new DomainError('VERSION_CONFLICT',{reason:'IDEMPOTENCY_KEY_REUSED'});}},actor,{method:'POST',path:'/tasks/task-a/transitions',body:{action:'START',expected_version:2},idempotencyKey:'command-1234'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  const host={registry,execute:async()=>({id:'random-result-id',status:'PENDING'})};
  expect((await executeV4Rest(host,actor,{method:'POST',path:'/tasks/task-a/transitions',body:{action:'START',expected_version:2},idempotencyKey:'command-1234'})).status).toBe(200);
  expect(await executeV4Rest({...host,asynchronousResult:async()=>({operation_id:'durable-job-1',status:'QUEUED'})},actor,{method:'POST',path:'/tasks/task-a/transitions',body:{action:'START',expected_version:2},idempotencyKey:'command-1234'})).toEqual({status:202,body:{operation_id:'durable-job-1',status:'QUEUED'}});
 });
 it('fails absent payroll approval and specialized handlers explicitly instead of mapping unrelated accountant operations',async()=>{
  await expect(executeV4Rest({registry:{},execute:vi.fn()},actor,{method:'POST',path:'/payroll/calculation-a/approve',body:{expected_version:1},idempotencyKey:'command-1234'})).rejects.toMatchObject({code:'MISSING_CONFIGURATION',details:{command:'payroll.approve'}});
  for(const path of ['/media/uploads','/device-events/batch','/integrations/crm/events','/webhooks/whatsapp'])await expect(executeV4Rest({registry,execute:vi.fn()},actor,{method:'POST',path,body:{},idempotencyKey:'command-1234'})).rejects.toMatchObject({code:'MISSING_CONFIGURATION',details:{reason:'SPECIALIZED_ROUTE_ADAPTER_REQUIRED'}});
 });
 it('generates flat named JSON request schemas from the registry with path IDs, action variants, versions and keyset bounds',()=>{
  const paths=v4OpenApiPaths(registry);
  const start=paths['/api/v1/shifts/start'].post.requestBody.content['application/json'].schema;
  expect(start.required).toContain('siteId');expect(start.properties.siteId).toBeDefined();expect(start.additionalProperties).toBe(false);
  const qualify=paths['/api/v1/leads/{id}/qualify'].post.requestBody.content['application/json'].schema;
  expect(qualify.properties.id).toBeUndefined();expect(qualify.required).toContain('expected_version');
  const tasks=paths['/api/v1/tasks/{id}/transitions'].post.requestBody.content['application/json'].schema.oneOf;
  expect(tasks.map((schema:any)=>schema.properties.action.const)).toEqual(['START','SUBMIT','ACCEPT','REJECT','REOPEN','CANCEL']);
  for(const task of tasks){expect(task.properties.taskId).toBeUndefined();expect(task.required).toContain('action');expect(task.required).toContain('expected_version');}
  const pagination=paths['/api/v1/channels/{id}/messages'].get;
  expect(pagination.parameters.find((param:any)=>param.name==='limit').schema).toEqual({type:'integer',minimum:1,maximum:100,default:50});
  expect(paths['/api/v1/channels/{id}/messages'].post).toBeDefined();
  expect(paths['/api/v1/leads'].post.responses['409'].content['application/json'].schema.required).toEqual(['code','details']);
  expect(paths['/api/v1/messages/{id}/translations'].post.responses['202'].content['application/json'].schema.required).toEqual(['operation_id','status']);
  expect(paths['/api/v1/operations/{id}'].get.responses['200'].content['application/json'].schema.required).toEqual(['operation_id','status','resource_id']);
  // Missing handler-owned schemas are not presented as executable contractual proof.
  expect(paths['/api/v1/media/uploads']).toBeUndefined();
  const special=v4OpenApiPaths(registry,{integrationEvent:{type:'object'},whatsappWebhook:{type:'object'},deviceBatch:{type:'object'}});
  const integration=special['/api/v1/integrations/{source}/events'].post.parameters;
  expect(integration.map((parameter:any)=>parameter.name)).toEqual(['X-Knaba-Key-Id','X-Knaba-Timestamp','X-Knaba-Signature','source']);
  expect(special['/api/v1/webhooks/whatsapp'].post.parameters.map((parameter:any)=>parameter.name)).toEqual(['X-Hub-Signature-256']);
  expect(special['/api/v1/device-events/batch'].post.parameters.map((parameter:any)=>parameter.name)).toEqual(['Authorization']);
 });
});

describe('V4 transport cursor (authorized-record fixture; SQL scan limits tested separately)',()=>{
 it('defaults to 50, accepts max100 and rejects zero/oversized/noncanonical/array pagination',()=>{
  expect(parseV4PageQuery({},binding,key,now)).toEqual({limit:50,snapshotAt:new Date(now).toISOString(),expiresAt:now+900000});
  expect(parseV4PageQuery(undefined,binding,key,now).limit).toBe(50);
  for(const limit of [1,100,'1','100'])expect(parseV4PageQuery({limit},binding,key,now).limit).toBe(Number(limit));
  for(const limit of [0,101,'01','+1','1.0','1e2',' 1',['50'],Infinity])expect(()=>parseV4PageQuery({limit},binding,key,now)).toThrow();
  expect(()=>parseV4PageQuery({offset:1000000},binding,key,now)).toThrow();
 });
 it('does not omit or duplicate messages with the same created_at on consecutive pages',()=>{
  const records=Array.from({length:105},(_,index)=>row(String(index).padStart(3,'0'))).reverse();
  const oneRequest=parseV4PageQuery({},binding,key,now),one=paginateV4Entities(records,oneRequest,binding,key);
  const twoRequest=parseV4PageQuery({cursor:one.next_cursor},binding,key,now+1000),two=paginateV4Entities(records,twoRequest,binding,key);
  const three=paginateV4Entities(records,parseV4PageQuery({cursor:two.next_cursor},binding,key,now+2000),binding,key);
  expect([one.items.length,two.items.length,three.items.length]).toEqual([50,50,5]);
  expect([...one.items,...two.items,...three.items].map(r=>r.id)).toEqual(Array.from({length:105},(_,index)=>String(index).padStart(3,'0')));
  expect(three).toMatchObject({has_more:false,next_cursor:null});
 });
 it('uses PostgreSQL UTF8 COLLATE C order for BMP/astral identifiers sharing the same timestamp',()=>{
  const records=[row('\u{10000}'),row('\uE000'),row('a')];
  const one=paginateV4Entities(records,parseV4PageQuery({limit:2},binding,key,now),binding,key);
  expect(one.items.map(item=>item.id)).toEqual(['a','\uE000']);
  const two=paginateV4Entities(records,parseV4PageQuery({limit:2,cursor:one.next_cursor},binding,key,now+1),binding,key);
  expect(two.items.map(item=>item.id)).toEqual(['\u{10000}']);expect(two.next_cursor).toBeNull();
 });
 it('keeps snapshot cutoff across pages and re-applies current authorized records when a membership is revoked',()=>{
  const request=parseV4PageQuery({limit:1},binding,key,now),one=paginateV4Entities([row('a'),row('b'),row('c')],request,binding,key);
  const nextRequest=parseV4PageQuery({limit:1,cursor:one.next_cursor},binding,key,now+1000);
  const two=paginateV4Entities([row('a'),row('c'),row('future',new Date(now+1).toISOString())],nextRequest,binding,key);
  expect(two.items.map(r=>r.id)).toEqual(['c']);expect(two.next_cursor).toBeNull();expect(nextRequest.snapshotAt).toBe(request.snapshotAt);
 });
 it('binds the cursor to company, recipient, resource and filters; stable filter key order produces identical binding',()=>{
  const request=parseV4PageQuery({},binding,key,now),cursor=encodeV4Cursor(binding,request,row('a'),key);
  for(const changed of [{...binding,companyId:'company-b'},{...binding,userId:'employee-b'},{...binding,resource:'entities:payout'},{...binding,filters:{siteId:'site-b'}}])expect(()=>parseV4PageQuery({cursor},changed,key,now+1)).toThrowError('VALIDATION_ERROR');
  const ordered={...binding,filters:{siteId:'site-a',active:true}},reverse={...binding,filters:{active:true,siteId:'site-a',unused:undefined}};
  const orderedCursor=encodeV4Cursor(ordered,request,row('a'),key);
  expect(parseV4PageQuery({cursor:orderedCursor},reverse,key,now+1).after).toEqual({createdAt:row('a').createdAt,id:'a'});
 });
 it('encrypts even unauthorized scan-boundary identifiers and uses fresh IVs for the same page',()=>{
  const request=parseV4PageQuery({},binding,key,now),privateId='PRIVATE_FOREIGN_SCOPE_ID_DO_NOT_DISCLOSE';
  const one=encodeV4Cursor(binding,request,{createdAt:timeForCursor(),id:privateId},key),two=encodeV4Cursor(binding,request,{createdAt:timeForCursor(),id:privateId},key);
  expect(one).not.toBe(two);expect(one).not.toContain(privateId);
  const packed=Buffer.from(one.split('.')[1]!,'base64url');
  expect(packed.toString('utf8')).not.toContain(privateId);expect(packed.toString('utf8')).not.toContain(actor.companyId);expect(packed.toString('utf8')).not.toContain('createdAt');
  expect(parseV4PageQuery({cursor:one},binding,key,now+1).after?.id).toBe(privateId);
 });
 it('rejects ciphertext/IV/tag tampering, noncanonical base64url, bad encryption key, expiry and future snapshots',()=>{
  const request=parseV4PageQuery({},binding,key,now),cursor=encodeV4Cursor(binding,request,row('a'),key);
  const [version,packedText]=cursor.split('.') as [string,string],packed=Buffer.from(packedText,'base64url');
  for(const index of [0,12,28,packed.length-1]){const changed=Buffer.from(packed);changed[index]=changed[index]!^1;expect(()=>parseV4PageQuery({cursor:`v1.${changed.toString('base64url')}`},binding,key,now+1)).toThrowError('VALIDATION_ERROR');}
  for(const corrupt of [`${version}.${packedText}=`,`v2.${packedText}`,`${cursor}.extra`,'v1.AAAA'])expect(()=>parseV4PageQuery({cursor:corrupt},binding,key,now+1)).toThrow();
  expect(()=>parseV4PageQuery({cursor},binding,'short',now+1)).toThrowError('MISSING_CONFIGURATION');
  expect(()=>parseV4PageQuery({cursor},binding,key,now+900000)).toThrowError('VALIDATION_ERROR');
  expect(()=>parseV4PageQuery({cursor},binding,key,now-1)).toThrowError('VALIDATION_ERROR');
  expect(()=>parseV4PageQuery({cursor},binding,'other-key-with-at-least-thirty-two-bytes',now+1)).toThrowError('VALIDATION_ERROR');
 });
});
function timeForCursor(){return '2026-10-09T11:00:00.000Z';}

describe('V4 machine-readable HTTP errors',()=>{
 it.each([['VALIDATION_ERROR',400],['NEEDS_REAUTH',401],['ACCESS_DENIED',403],['NOT_FOUND_SAFE',404],['INVALID_STATE',409],['VERSION_CONFLICT',409],['IDEMPOTENCY_CONFLICT',409],['MISSING_CONFIGURATION',422],['NEEDS_APPROVAL',422],['RATE_LIMITED',429],['PROVIDER_UNAVAILABLE',503],['INTERNAL_ERROR',500]] as const)('%s has HTTP %s', (code,status)=>expect(v4HttpStatus(code)).toBe(status));
 it('does not disclose auth/resource details or ordinary exception messages',()=>{
  for(const code of ['NEEDS_REAUTH','ACCESS_DENIED','NOT_FOUND_SAFE'])expect(v4HttpError(new DomainError(code,{secret:'hidden'})).body).toEqual({code,details:{}});
  expect(v4HttpError(new Error('db-secret-password'))).toEqual({status:500,body:{code:'INTERNAL_ERROR',details:{}}});
  const parsed=z.object({amount:z.number().int()}).safeParse({amount:'string'});
  if(!parsed.success)expect(v4HttpError(parsed.error)).toMatchObject({status:400,body:{code:'VALIDATION_ERROR',details:{issues:[{path:['amount']}]}}});
 });
});
