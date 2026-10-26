import {afterEach,describe,expect,it,vi} from 'vitest';
import {ApiError,type Command,type Entity,type Session} from './api';
import {QUEUE_LIMIT,QUEUE_LIFETIME_MS,QueueError,SafeOfflineQueue,safeOfflineAction,type OfflineAction,type QueueTransport} from './offlineQueue';

const identity={companyId:'synthetic-company',userId:'synthetic-employee'};
const definition:Command={name:'task.checklist',permission:'task.work',highRisk:false,schema:{}};
function resource(overrides:Partial<Entity>={}):Entity{return {id:'synthetic-task',kind:'task',version:3,createdAt:'2026-10-06T12:00:00Z',updatedAt:'2026-10-06T12:00:00Z',data:{assigneeIds:[identity.userId],siteId:'synthetic-site',checklist:[{id:'synthetic-check'}]},...overrides}}
function session(permissions=['task.work','inventory.request']):Session{return {actor:{...identity,roles:['EMPLOYEE'],permissions,siteIds:['synthetic-site'],customerIds:[],warehouseIds:[]},user:{},mode:'DEMO'}}
function action(overrides:Partial<OfflineAction>={}):OfflineAction{return {name:'task.checklist',input:{taskId:'synthetic-task',itemId:'synthetic-check',checked:true},expectedVersion:3,idempotencyKey:'synthetic-original-key',...overrides}}
function transport():QueueTransport{return {session:vi.fn(async()=>session()),catalog:vi.fn(async()=>[definition]),entities:vi.fn(async()=>[resource()]),send:vi.fn(async()=>resource({version:4}))}}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()});

describe('safe tab-memory offline actions',()=>{
 it('uses real own-scoped command names and strictly excludes prose, files, identifiers for others and sensitive commands',()=>{
  const records={task:[resource()]};
  expect(safeOfflineAction(definition,action().input,identity,records)).toMatchObject({name:'task.checklist',expectedVersion:3,input:{taskId:'synthetic-task',itemId:'synthetic-check',checked:true}});
  for(const extra of [{note:'private note'},{photoIds:['private-media']},{employeeIds:['another-employee']},{latitude:52},{bankAccount:'secret'}])expect(safeOfflineAction(definition,{...action().input,...extra},identity,records)).toBeUndefined();
  for(const name of ['task.work','inventory.request','task.worklog','request.create','stock.use','payout.record','trip.sample','message.send'])expect(safeOfflineAction({...definition,name},action().input,identity,records)).toBeUndefined();
  expect(safeOfflineAction({...definition,highRisk:true},action().input,identity,records)).toBeUndefined();
  expect(safeOfflineAction({...definition,permission:'admin.manage'},action().input,identity,records)).toBeUndefined();
  expect(safeOfflineAction(definition,action().input,{...identity,userId:'another-employee'},records)).toBeUndefined();
  expect(safeOfflineAction(definition,{...action().input,checked:'true'},identity,records)).toBeUndefined();
  expect(safeOfflineAction(definition,{...action().input,itemId:'missing-check'},identity,records)).toBeUndefined();
 });
 it('supports submitting only the own existing material request and captures the original version',()=>{
  const def:Command={name:'request.submit',permission:'inventory.request',schema:{}};
  const records={material_request:[resource({kind:'material_request',id:'synthetic-request',version:5,data:{employeeId:identity.userId}})]};
  expect(safeOfflineAction(def,{requestId:'synthetic-request'},identity,records)).toMatchObject({expectedVersion:5});
  expect(safeOfflineAction(def,{requestId:'synthetic-request'},identity,records,4)).toMatchObject({expectedVersion:4});
  expect(safeOfflineAction(def,{requestId:'synthetic-request'},identity,{material_request:[resource({kind:'material_request',id:'synthetic-request',data:{employeeId:'another-employee'}})]})).toBeUndefined();
 });
 it('never writes durable storage or sends during enqueue, subscription or elapsed time',()=>{
  vi.useFakeTimers();const write=vi.fn(()=>{throw new Error('durable storage forbidden')});vi.stubGlobal('localStorage',{setItem:write});vi.stubGlobal('sessionStorage',{setItem:write});vi.stubGlobal('indexedDB',{open:write});
  const gateway=transport(),queue=new SafeOfflineQueue(identity,gateway),listener=vi.fn();queue.subscribe(listener);queue.enqueue(action());vi.advanceTimersByTime(60_000);
  expect(queue.getSnapshot()[0].state).toBe('UNSYNCED');expect(gateway.session).not.toHaveBeenCalled();expect(gateway.send).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();expect(listener).toHaveBeenCalledTimes(1);
 });
 it('bounds entries, rejects key reuse for changed effects and clones the caller payload',()=>{
  const queue=new SafeOfflineQueue(identity,transport()),input={taskId:'synthetic-task',itemId:'synthetic-check',checked:true};queue.enqueue(action({input}));input.checked=false;
  expect(queue.getSnapshot()[0].input.checked).toBe(true);expect(Object.isFrozen(queue.getSnapshot()[0].input)).toBe(true);
  expect(queue.enqueue(action())).toBe(queue.getSnapshot()[0]);expect(()=>queue.enqueue(action({input}))).toThrowError('QUEUE_KEY_REUSED');
  for(let i=1;i<QUEUE_LIMIT;i++)queue.enqueue(action({idempotencyKey:`synthetic-key-${i}`}));expect(queue.getSnapshot()).toHaveLength(QUEUE_LIMIT);expect(()=>queue.enqueue(action({idempotencyKey:'synthetic-overflow'}))).toThrowError('QUEUE_FULL');
  expect(()=>queue.enqueue(action({name:'payout.create'}))).toThrowError(QueueError);
  expect(()=>queue.enqueue(action({input:{...action().input,note:'personal text'}}))).toThrowError('QUEUE_UNSAFE');
 });
 it('expires the actual payload after four hours and refuses any later retry',async()=>{
  let now=10;const gateway=transport(),queue=new SafeOfflineQueue(identity,gateway,()=>now);queue.enqueue(action());now+=QUEUE_LIFETIME_MS;expect(await queue.retry('synthetic-original-key')).toBe(false);expect(queue.getSnapshot()[0]).toMatchObject({state:'EXPIRED',input:{}});expect(gateway.send).not.toHaveBeenCalled();
 });
 it('checks fresh permissions, own reference and version before manually sending the exact original envelope',async()=>{
  const gateway=transport(),queue=new SafeOfflineQueue(identity,gateway);queue.enqueue(action());expect(await queue.retry('synthetic-original-key')).toBe(true);expect(gateway.session).toHaveBeenCalledOnce();expect(gateway.catalog).toHaveBeenCalledOnce();expect(gateway.entities).toHaveBeenCalledWith('task');expect(gateway.send).toHaveBeenCalledExactlyOnceWith(action());expect(queue.getSnapshot()[0]).toMatchObject({state:'ACKNOWLEDGED',input:{}});expect(await queue.retry('synthetic-original-key')).toBe(false);
 });
 it('stops a stale unsent action without changing its version or sending',async()=>{
  const gateway=transport();gateway.entities=vi.fn(async()=>[resource({version:4})]);const queue=new SafeOfflineQueue(identity,gateway);queue.enqueue(action());expect(await queue.retry('synthetic-original-key')).toBe(false);expect(queue.getSnapshot()[0].state).toBe('CONFLICT');expect(queue.getSnapshot()[0].expectedVersion).toBe(3);expect(gateway.send).not.toHaveBeenCalled();
 });
 it.each(['permission','catalog','assignment','reference'] as const)('denies revoked %s before sending',async(mode)=>{
  const gateway=transport();if(mode==='permission')gateway.session=vi.fn(async()=>session([]));if(mode==='catalog')gateway.catalog=vi.fn(async()=>[]);if(mode==='assignment')gateway.entities=vi.fn(async()=>[resource({data:{assigneeIds:['another-employee']}})]);if(mode==='reference')gateway.entities=vi.fn(async()=>[]);
  const queue=new SafeOfflineQueue(identity,gateway);queue.enqueue(action());expect(await queue.retry('synthetic-original-key')).toBe(false);expect(queue.getSnapshot()[0].state).toBe('DENIED');expect(gateway.send).not.toHaveBeenCalled();
 });
 it('reconciles a committed action with a lost reply through the original key and original version only',async()=>{
  const gateway=transport();let committed=false,effects=0;gateway.entities=vi.fn(async()=>[resource({version:committed?4:3})]);gateway.send=vi.fn(async envelope=>{expect(envelope).toEqual(action());if(!committed){committed=true;effects++;throw new TypeError('synthetic response lost after commit')}return resource({version:4})});
  const queue=new SafeOfflineQueue(identity,gateway);queue.enqueue(action());expect(await queue.retry('synthetic-original-key')).toBe(false);expect(queue.getSnapshot()[0].state).toBe('UNKNOWN');expect(effects).toBe(1);expect(gateway.send).toHaveBeenCalledOnce();
  expect(await queue.retry('synthetic-original-key')).toBe(true);expect(effects).toBe(1);expect(gateway.send).toHaveBeenCalledTimes(2);expect(queue.getSnapshot()[0].state).toBe('ACKNOWLEDGED');
 });
 it('keeps preflight connectivity failure unsent and classifies real server conflicts without success',async()=>{
  const gateway=transport();gateway.session=vi.fn(async()=>{throw new TypeError('offline')});const queue=new SafeOfflineQueue(identity,gateway);queue.enqueue(action());expect(await queue.retry('synthetic-original-key')).toBe(false);expect(queue.getSnapshot()[0].state).toBe('UNSYNCED');expect(gateway.send).not.toHaveBeenCalled();
  const denied=transport();denied.send=vi.fn(async()=>{throw new ApiError('VERSION_CONFLICT',409)});const q=new SafeOfflineQueue(identity,denied);q.enqueue(action());expect(await q.retry('synthetic-original-key')).toBe(false);expect(q.getSnapshot()[0].state).toBe('CONFLICT');
 });
 it.each([{},resource({id:'another-task'}),resource({version:2})])('requires an actual matching server result before acknowledging %j',async result=>{const gateway=transport();gateway.send=vi.fn(async()=>result);const queue=new SafeOfflineQueue(identity,gateway);queue.enqueue(action());expect(await queue.retry('synthetic-original-key')).toBe(false);expect(queue.getSnapshot()[0]).toMatchObject({state:'UNKNOWN',code:'INVALID_SERVER_ACK'});});
 it('clears account-switch data before any write and fences logout during permission refresh',async()=>{
  const switched=transport();switched.session=vi.fn(async()=>({...session(),actor:{...session().actor,userId:'another-employee'}}));const q=new SafeOfflineQueue(identity,switched);q.enqueue(action());expect(await q.retry('synthetic-original-key')).toBe(false);expect(q.getSnapshot()).toEqual([]);expect(switched.send).not.toHaveBeenCalled();
  let resolve!:(s:Session)=>void;const gateway=transport();gateway.session=vi.fn(()=>new Promise<Session>(done=>{resolve=done}));const queue=new SafeOfflineQueue(identity,gateway);queue.enqueue(action());const pending=queue.retry('synthetic-original-key');queue.clear();resolve(session());expect(await pending).toBe(false);expect(queue.getSnapshot()).toEqual([]);expect(gateway.send).not.toHaveBeenCalled();
 });
 it('default browser transport refreshes CSRF and sends only the original contract fields',async()=>{
  const calls:Array<{path:string;options:RequestInit}>=[];
  vi.stubGlobal('fetch',async(path:string,options:RequestInit)=>{calls.push({path,options});const body=path==='/api/v1/me'?{...session(),csrfToken:'SYNTHETIC_FRESH_PROOF'}:path==='/api/v1/commands'?{items:[definition]}:path==='/api/v1/entities/task?limit=100'?{items:[resource()],has_more:false,next_cursor:null}:resource({version:4});return {ok:true,status:200,json:async()=>body}});
  const queue=new SafeOfflineQueue(identity);queue.enqueue(action());expect(calls).toHaveLength(0);expect(await queue.retry('synthetic-original-key')).toBe(true);
  expect(calls.map(call=>call.path)).toEqual(['/api/v1/me','/api/v1/commands','/api/v1/entities/task?limit=100','/api/v1/commands/task.checklist']);
  expect(JSON.parse(String(calls[3].options.body))).toEqual({input:action().input,expected_version:3,idempotency_key:'synthetic-original-key'});
  expect((calls[3].options.headers as Record<string,string>)['X-CSRF-Token']).toBe('SYNTHETIC_FRESH_PROOF');expect(calls.every(call=>call.options.signal instanceof AbortSignal)).toBe(true);
  expect(new SafeOfflineQueue(identity).getSnapshot()).toEqual([]);
 });
 it('refuses delivery if the four-hour limit passes during permission refresh',async()=>{let now=1;const gateway=transport();gateway.entities=vi.fn(async()=>{now+=QUEUE_LIFETIME_MS;return [resource()]});const queue=new SafeOfflineQueue(identity,gateway,()=>now);queue.enqueue(action());expect(await queue.retry('synthetic-original-key')).toBe(false);expect(queue.getSnapshot()[0]).toMatchObject({state:'EXPIRED',input:{}});expect(gateway.send).not.toHaveBeenCalled();});
 it('fences a second manual click while a send is in progress',async()=>{
  let resolve!:(value:unknown)=>void;const gateway=transport();gateway.send=vi.fn(()=>new Promise(done=>{resolve=done}));const queue=new SafeOfflineQueue(identity,gateway);queue.enqueue(action());const pending=queue.retry('synthetic-original-key');await vi.waitFor(()=>expect(gateway.send).toHaveBeenCalledOnce());expect(await queue.retry('synthetic-original-key')).toBe(false);queue.remove('synthetic-original-key');expect(queue.getSnapshot()).toHaveLength(1);resolve(resource({version:4}));expect(await pending).toBe(true);
 });
});
