import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createAssistantDisplayReceipts,visibleOwnerMessageIds} from '../src/lib/assistant-display-receipts';

const first={id:'first-conversation',token:'a'.repeat(64)},second={id:'second-conversation',token:'b'.repeat(64)};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
afterEach(()=>vi.useRealTimers());
function fixture(){
  let ticket:{id:string;token:string}|null=first,ids=['message-1'],counter=0;
  const frames=new Map<number,()=>void>(),requests:Array<{ticket:typeof first;ids:string[];signal:AbortSignal;resolve:()=>void;reject:(problem:unknown)=>void}>=[];
  const error=vi.fn();
  const receipts=createAssistantDisplayReceipts({ticket:()=>ticket,displayedIds:()=>ids,error,
    frame:callback=>{frames.set(++counter,callback);return counter;},cancelFrame:id=>frames.delete(id),
    send:(ticket,ids,signal)=>new Promise<void>((resolve,reject)=>requests.push({ticket,ids,signal,resolve,reject})),
  });
  const frame=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback());};
  return {receipts,requests,error,frames,frame,paint:()=>{frame();frame();},setIds:(value:string[])=>{ids=value;},setTicket:(value:typeof ticket)=>{ticket=value;}};
}

describe('client-reported visible display lifecycle',()=>{
  it('waits for two frames and rechecks visible messages immediately before sending',async()=>{
    const f=fixture();f.receipts.schedule();expect(f.requests).toHaveLength(0);
    f.frame();expect(f.requests).toHaveLength(0);f.setIds([]);f.frame();expect(f.requests).toHaveLength(0);
    f.setIds(['message-1']);f.receipts.schedule();f.paint();expect(f.requests[0].ids).toEqual(['message-1']);
    f.requests[0].resolve();await flush();f.paint();f.receipts.schedule();f.paint();expect(f.requests).toHaveLength(1);
  });
  it('sends at most 32 unique visible IDs per request and never overlaps pending receipts',async()=>{
    const f=fixture();f.setIds([...Array.from({length:33},(_,i)=>`message-${i}`),'message-0']);f.receipts.schedule();f.paint();
    expect(f.requests[0].ids).toHaveLength(32);f.receipts.schedule();f.paint();expect(f.requests).toHaveLength(1);
    f.requests[0].resolve();await flush();f.paint();expect(f.requests[1].ids).toEqual(['message-32']);
    f.requests[1].resolve();await flush();f.paint();expect(f.requests).toHaveLength(2);
  });
  it('cancels the old capability and ignores its late error without disturbing a new receipt',async()=>{
    const f=fixture();f.receipts.schedule();f.paint();
    f.setTicket(second);f.setIds(['second-message']);f.receipts.schedule();f.paint();
    expect(f.requests[0].signal.aborted).toBe(true);expect(f.requests[1].ticket).toEqual(second);
    f.requests[0].reject(Error('old 404'));await flush();expect(f.error).not.toHaveBeenCalled();
    f.requests[1].resolve();await flush();f.paint();expect(f.requests).toHaveLength(2);
  });
  it('does not let an uncancellable old animation frame overwrite the new scheduling generation',()=>{
    const f=fixture();f.receipts.schedule();f.frame();const stale=[...f.frames.values()][0];
    f.setTicket(second);f.receipts.schedule();stale();f.receipts.schedule();expect(f.frames.size).toBe(1);
    f.paint();expect(f.requests).toHaveLength(1);expect(f.requests[0].ticket).toEqual(second);
  });
  it('bounds failure retries to the existing polling interval and stops on reset or disposal',async()=>{
    vi.useFakeTimers({toFake:['Date']});const f=fixture();f.receipts.schedule();f.paint();
    f.requests[0].reject(Error('503'));await flush();expect(f.error).toHaveBeenCalledOnce();
    f.receipts.schedule();f.paint();expect(f.requests).toHaveLength(1);
    vi.setSystemTime(Date.now()+8000);f.receipts.schedule();f.paint();expect(f.requests).toHaveLength(2);
    f.receipts.reset();expect(f.requests[1].signal.aborted).toBe(true);f.setTicket(null);
    f.requests[1].resolve();await flush();f.receipts.schedule();f.paint();expect(f.requests).toHaveLength(2);
    f.setTicket(second);f.receipts.schedule();f.receipts.dispose();f.paint();f.receipts.schedule();expect(f.requests).toHaveLength(2);
  });
  it('requires a connected rendered node intersecting both the chat and visible viewport',()=>{
    const node=(id:string,box:{left:number;top:number;right:number;bottom:number},isConnected=true)=>({dataset:{ownerMessageId:id},isConnected,getBoundingClientRect:()=>box});
    const log={isConnected:true,getBoundingClientRect:()=>({left:100,top:100,right:400,bottom:500}),querySelectorAll:()=>[
      node('visible',{left:120,top:120,right:350,bottom:160}),node('below',{left:120,top:450,right:350,bottom:490}),
      node('outside',{left:500,top:120,right:600,bottom:160}),node('detached',{left:120,top:120,right:350,bottom:160},false),
      node('foreign',{left:120,top:120,right:350,bottom:160}),node('empty',{left:120,top:120,right:120,bottom:160}),
    ]} as unknown as HTMLElement;
    const allowed=new Set(['visible','below','outside','detached','empty']);
    expect(visibleOwnerMessageIds(log,allowed,{left:0,top:0,right:800,bottom:400})).toEqual(['visible']);
    expect(visibleOwnerMessageIds(log,allowed,{left:0,top:550,right:800,bottom:900})).toEqual([]);
    expect(visibleOwnerMessageIds(undefined,allowed,{left:0,top:0,right:800,bottom:600})).toEqual([]);
  });
  it('wires only owner DOM IDs and scroll/visibility events, with no read or acceptance labels',()=>{
    const guest=readFileSync(new URL('../src/components/KnabaAssistant.tsx',import.meta.url),'utf8');
    expect(guest).toContain("data-owner-message-id={item.sender==='owner'?item.id:undefined}");
    expect(guest).toContain('onScroll={()=>receipts.schedule()}');expect(guest).toContain("document.addEventListener('visibilitychange',schedule)");
    const owner=readFileSync(new URL('../src/components/AssistantInbox.tsx',import.meta.url),'utf8');
    expect(owner).toContain("<Show when={m.sender==='owner'}>");expect(owner).toContain('label().displayed');expect(owner).toContain('label().displayUnconfirmed');
  });
});
