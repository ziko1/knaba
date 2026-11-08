import {sameAssistantTicket} from './assistant-request-state';
import type {AssistantTicket} from './assistant-recovery';

type Bounds={left:number;top:number;right:number;bottom:number};
/** A rendered owner node must intersect both the scroll container and viewport. */
export function visibleOwnerMessageIds(log:HTMLElement|undefined,allowed:ReadonlySet<string>,viewport:Bounds):string[]{
  if(!log?.isConnected)return [];
  const bounds=log.getBoundingClientRect(),left=Math.max(bounds.left,viewport.left),top=Math.max(bounds.top,viewport.top);
  const right=Math.min(bounds.right,viewport.right),bottom=Math.min(bounds.bottom,viewport.bottom);
  if(right<=left||bottom<=top)return [];
  return Array.from(log.querySelectorAll<HTMLElement>('[data-owner-message-id]')).flatMap(node=>{
    const id=node.dataset.ownerMessageId;if(!id||!allowed.has(id)||!node.isConnected)return [];
    const box=node.getBoundingClientRect();
    return box.right>box.left&&box.bottom>box.top&&box.right>left&&box.left<right&&box.bottom>top&&box.top<bottom?[id]:[];
  });
}

/** Private receipt state belongs to one mounted chat and one current capability. */
export function createAssistantDisplayReceipts(options:{
  ticket:()=>AssistantTicket|null;
  displayedIds:()=>string[];
  send:(ticket:AssistantTicket,ids:string[],signal:AbortSignal)=>Promise<unknown>;
  error:(problem:unknown,ticket:AssistantTicket)=>void;
  frame:(callback:()=>void)=>number;
  cancelFrame:(id:number)=>void;
}){
  let active:AssistantTicket|null=null,generation=0,disposed=false,frame=0,retryAt=0;
  let pending:AbortController|null=null;
  const confirmed=new Set<string>();
  function reset(){
    generation++;if(frame)options.cancelFrame(frame);frame=0;pending?.abort();pending=null;
    active=null;confirmed.clear();retryAt=0;
  }
  function schedule(){
    if(disposed)return;
    const ticket=options.ticket();if(!ticket){reset();return;}
    if(!sameAssistantTicket(active,ticket)){reset();active={...ticket};}
    if(frame||pending||Date.now()<retryAt)return;
    const started=generation;
    // Two frames allow the newly rendered node to be painted before it is reported.
    frame=options.frame(()=>{
      if(disposed||started!==generation)return;
      frame=options.frame(()=>{if(disposed||started!==generation)return;frame=0;void flush();});
    });
  }
  async function flush(){
    const ticket=active;if(!ticket||!sameAssistantTicket(options.ticket(),ticket))return;
    const ids=[...new Set(options.displayedIds())].filter(id=>!confirmed.has(id)).slice(0,32);
    if(!ids.length)return;
    const started=generation,controller=new AbortController();pending=controller;
    const current=()=>!disposed&&started===generation&&pending===controller&&sameAssistantTicket(options.ticket(),ticket);
    let accepted=false;
    try{
      await options.send(ticket,ids,controller.signal);
      if(current()){for(const id of ids)confirmed.add(id);accepted=true;}
    }catch(problem){
      if(current()){retryAt=Date.now()+8000;options.error(problem,ticket);}
    }finally{if(pending===controller)pending=null;}
    if(accepted)schedule();
  }
  return {schedule,reset,dispose:()=>{disposed=true;reset();}};
}
