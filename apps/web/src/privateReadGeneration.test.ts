import {afterEach,describe,expect,it,vi} from 'vitest';
import {entities,type Entity} from './api';
import {PrivateReadGeneration,type PrivateReadTicket} from './privateReadGeneration';
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve};}
afterEach(()=>vi.unstubAllGlobals());
describe('private reads across the adopted session boundary (controlled transport)',()=>{
 it('does not restore private GPS records from the actual entities transport after access_revoked (mock HTTP)',async()=>{
  const gate=new PrivateReadGeneration(),ticket=gate.begin('entities')!,response=deferred<{ok:boolean;json:()=>Promise<{items:Entity[]}>}>();let records:Entity[]=[];
  // Deliberately ignore abort in the mock to model an already-completed network
  // response whose parsing/state dispatch arrives after the SSE revocation.
  const fetch=vi.fn(()=>response.promise);vi.stubGlobal('fetch',fetch);
  const pending=entities('location_sample',{signal:ticket.signal}).then(rows=>{records=gate.update<Entity[]>(ticket,()=>rows)(records)});
  expect(fetch.mock.calls[0]).toMatchObject(['/api/v1/entities/location_sample?limit=100',{signal:ticket.signal}]);
  gate.invalidate();records=[];response.resolve({ok:true,json:async()=>({items:[{id:'synthetic-test-point',kind:'location_sample',version:1,createdAt:'2026-10-06T10:00:00Z',updatedAt:'2026-10-06T10:00:00Z',data:{latitude:1,longitude:2}}]})});await pending;
  expect(ticket.signal.aborted).toBe(true);expect(records).toEqual([]);expect(gate.begin('entities')).toBeUndefined();
 });
 it('loads all pages through the actual entities transport without truncating the authorized collection (mock HTTP)',async()=>{
  const gate=new PrivateReadGeneration(),ticket=gate.begin('entities')!,pageOne:Entity[]=Array.from({length:100},(_,i)=>({id:`synthetic-point-${i}`,kind:'location_sample',version:1,createdAt:'2026-10-06T10:00:00Z',updatedAt:'2026-10-06T10:00:00Z',data:{latitude:1,longitude:2}})),last={...pageOne[0],id:'synthetic-point-100'};
  const fetch=vi.fn(async(path:string)=>({ok:true,json:async()=>path.endsWith('&cursor=synthetic%2Fpage%2B2')?{items:[last],has_more:false,next_cursor:null}:{items:pageOne,has_more:true,next_cursor:'synthetic/page+2'}}));vi.stubGlobal('fetch',fetch);
  const rows=await entities('location_sample',{signal:ticket.signal});expect(rows).toHaveLength(101);expect(rows[100]).toEqual(last);expect(gate.accepts(ticket)).toBe(true);
  expect(fetch.mock.calls).toMatchObject([['/api/v1/entities/location_sample?limit=100',{signal:ticket.signal}],['/api/v1/entities/location_sample?limit=100&cursor=synthetic%2Fpage%2B2',{signal:ticket.signal}]]);
 });
 it('discards every page after access_revoked while a later page is in flight (mock HTTP)',async()=>{
  const gate=new PrivateReadGeneration(),ticket=gate.begin('entities')!,response=deferred<{ok:boolean;json:()=>Promise<{items:Entity[];has_more:boolean;next_cursor:null}>}>(),point:Entity={id:'synthetic-private-point',kind:'location_sample',version:1,createdAt:'2026-10-06T10:00:00Z',updatedAt:'2026-10-06T10:00:00Z',data:{latitude:1,longitude:2}};let records:Entity[]=[];
  const fetch=vi.fn(async(path:string)=>path.includes('&cursor=')?response.promise:{ok:true,json:async()=>({items:[point],has_more:true,next_cursor:'synthetic-next'})});vi.stubGlobal('fetch',fetch);
  const pending=entities('location_sample',{signal:ticket.signal}).then(rows=>{records=gate.update<Entity[]>(ticket,()=>rows)(records)});await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
  gate.invalidate();records=[];response.resolve({ok:true,json:async()=>({items:[{...point,id:'synthetic-late-point'}],has_more:false,next_cursor:null})});await pending;
  expect(ticket.signal.aborted).toBe(true);expect(records).toEqual([]);expect(gate.accepts(ticket)).toBe(false);expect(gate.begin('reconnect')).toBeUndefined();
 });
 it('rechecks an already-enqueued updater when React later applies it',()=>{
  const gate=new PrivateReadGeneration(),ticket=gate.begin('entities')!;
  const queued=gate.update(ticket,()=>['sensitive report']);gate.invalidate();expect(queued([])).toEqual([]);
 });
 it('fences dashboard, error, loading and point provenance updates as well as records',()=>{
  const gate=new PrivateReadGeneration(),ticket=gate.begin('entities')!;
  const dashboard=gate.update<{private:string}|undefined>(ticket,()=>({private:'dashboard'})),error=gate.update<Error|undefined>(ticket,()=>new Error('late error')),loading=gate.update(ticket,()=>true),receivedAt=gate.update<string|undefined>(ticket,()=>'late GPS provenance');
  gate.invalidate();expect(dashboard(undefined)).toBeUndefined();expect(error(undefined)).toBeUndefined();expect(loading(false)).toBe(false);expect(receivedAt(undefined)).toBeUndefined();
 });
 it('rejects a stale dashboard continuation and does not start another request after revocation',async()=>{
  const gate=new PrivateReadGeneration(),ticket=gate.begin('entities')!,read=deferred<null>();let dashboardCalls=0;
  const pending=read.promise.then(()=>{if(gate.accepts(ticket))dashboardCalls++});gate.invalidate();read.resolve(null);await pending;expect(dashboardCalls).toBe(0);
 });
 it('invalidates logout, account change and unmount boundaries without a reconnect reopening old authority',()=>{
  for(const boundary of ['logout','account change','unmount']){const oldGate=new PrivateReadGeneration(),ticket=oldGate.begin(boundary)!;oldGate.invalidate();expect(oldGate.accepts(ticket)).toBe(false);expect(oldGate.begin('reconnect')).toBeUndefined();const freshlyAdopted=new PrivateReadGeneration();expect(freshlyAdopted.accepts(freshlyAdopted.begin('entities')!)).toBe(true);expect(freshlyAdopted.accepts(ticket as PrivateReadTicket)).toBe(false)}
 });
 it('keeps catalogue and entity lanes independent but rejects an older request in the same lane',()=>{
  const gate=new PrivateReadGeneration(),catalog=gate.begin('catalog')!,oldEntities=gate.begin('entities')!,freshEntities=gate.begin('entities')!;expect(gate.accepts(catalog)).toBe(true);expect(gate.accepts(oldEntities)).toBe(false);expect(gate.accepts(freshEntities)).toBe(true);expect(oldEntities.signal.aborted).toBe(true);
 });
 it('supports StrictMode effect replay while never reviving a revoked adopted session',()=>{
  const gate=new PrivateReadGeneration();gate.mount();const old=gate.begin('entities')!;gate.unmount();expect(gate.accepts(old)).toBe(false);expect(old.signal.aborted).toBe(true);expect(gate.mount()).toBe(true);expect(gate.accepts(gate.begin('entities')!)).toBe(true);gate.invalidate();gate.unmount();expect(gate.mount()).toBe(false);expect(gate.begin('entities')).toBeUndefined();
 });
});
