import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createAsyncViewScope} from '../src/lib/async-view-scope';
import {createAssistantRequestState,sameAssistantTicket} from '../src/lib/assistant-request-state';

// Execute the actual component event handlers, with only rendering and network
// replaced. Deliberately reorder HTTP completions to reproduce lost updates.
function fixture(component:'KnabaAssistant'|'AssistantInbox',locale='en') {
  const source=ts.createSourceFile(component+'.tsx',readFileSync(new URL('../src/components/'+component+'.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const entry=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text===component)!;
  const render=entry.body!.statements.find(node=>ts.isReturnStatement(node))!;
  const exposed=component==='KnabaAssistant'
    ? 'load,send,handoff,reset,ticket,setTicket,thread,setAccepted,setDraft,draft,error,busy,contactPath,contactLabel'
    : 'openConversation,send,setStatus,refresh,retryNotifications,notifications,setNotifications,role,setRole,list,setList,active,thread,answer,setAnswer,proposal,setProposal,fault,busy';
  const body=entry.getText(source).slice(0,render.getStart(source)-entry.getStart(source))+'return {'+exposed+'};}';
  const input=source.statements.filter(node=>!ts.isImportDeclaration(node)&&node!==entry).map(node=>node.getText(source)).join('\n')+'\n'+body;
  const output=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  type Request={path:string;options:{method:string;body?:string;signal:AbortSignal};resolve:(value:unknown)=>void;reject:(reason:unknown)=>void;respond:(status:number)=>void};
  const requests:Request[]=[],cleanup:Array<()=>void>=[];
  const exports:Record<string,any>={};
  const fetch=vi.fn((path:string,options:Request['options'])=>new Promise((resolve,reject)=>requests.push({path,options,resolve:value=>resolve({ok:true,json:async()=>value}),respond:status=>resolve({ok:false,status}),reject})));
  runInNewContext(output,{
    exports,fetch,createAsyncViewScope,createAssistantRequestState,sameAssistantTicket,
    createSignal:(initial:unknown)=>{let value=initial;return [()=>value,(next:unknown)=>value=typeof next==='function'?next(value):next];},
    createEffect:()=>{},onMount:()=>{},onCleanup:(fn:()=>void)=>cleanup.push(fn),
    assistantLocale:(locale:string)=>locale??'de',
    window:{confirm:()=>true,speechSynthesis:{cancel:vi.fn()}},sessionStorage:{removeItem:vi.fn(),setItem:vi.fn()},
    setTimeout:()=>1,clearTimeout:()=>{},queueMicrotask,AbortController,crypto:{randomUUID:()=> 'test-request'},
  });
  const view=exports.default({locale});
  if(component==='AssistantInbox')view.setRole('owner');
  return {view,requests,fetch,dispose:()=>cleanup.forEach(fn=>fn())};
}
const ticket={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',token:'a'.repeat(64)};
const thread=(id:string,content:string)=>({conversation:{id,status:'assistant'},messages:[{id:content,content,sender:'owner'}],offers:[]});
const event={preventDefault:()=>{}};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));

describe('public Assistant asynchronous state',()=>{
  it('uses one localized contact page link without duplicated phone or email links',()=>{
    const source=readFileSync(new URL('../src/components/KnabaAssistant.tsx',import.meta.url),'utf8');
    expect(source).not.toMatch(/href=["'](?:tel:|mailto:)/);
    expect(source).toContain('href={contactPath}');
    for(const locale of ['de','en','pl','lt','uk','ru']){
      const {view}=fixture('KnabaAssistant',locale);
      expect(view.contactPath).toBe(locale==='de'?'/kontakt/':`/${locale}/kontakt/`);
      expect(view.contactLabel.length).toBeGreaterThan(0);
    }
  });
  it('never lets an earlier poll replace a confirmed sent message',async()=>{
    const f=fixture('KnabaAssistant'),v=f.view;v.setTicket(ticket);v.setAccepted(true);v.setDraft('hello');
    const oldPoll=v.load(ticket);const send=v.send(event);await flush();
    expect(f.requests.map(r=>r.options.method)).toEqual(['GET','POST']);
    f.requests[1].resolve(thread(ticket.id,'new response'));await send;
    f.requests[0].resolve(thread(ticket.id,'old response'));await oldPoll;
    expect(v.thread().messages[0].content).toBe('new response');expect(v.busy()).toBe(false);
  });
  it('skips polling during a mutation and preserves a newly typed draft',async()=>{
    const f=fixture('KnabaAssistant'),v=f.view;v.setTicket(ticket);v.setAccepted(true);v.setDraft('first');
    const send=v.send(event);await flush();v.setDraft('second');await v.load(ticket);
    expect(f.requests).toHaveLength(1);expect(JSON.parse(f.requests[0].options.body!).content).toBe('first');
    f.requests[0].resolve(thread(ticket.id,'sent'));await send;
    expect(v.draft()).toBe('second');
  });
  it('keeps one slow poll in flight across ticks and ignores errors after reset',async()=>{
    const f=fixture('KnabaAssistant'),v=f.view;v.setTicket(ticket);
    const first=v.load(ticket),second=v.load(ticket);
    await second;expect(f.requests).toHaveLength(1);
    f.requests[0].resolve(thread(ticket.id,'latest'));await first;
    expect(v.thread().messages[0].content).toBe('latest');
    const pending=v.load(ticket);v.reset();f.requests[1].reject(new Error('offline'));await pending;
    expect(v.thread()).toBeNull();expect(v.ticket()).toBeNull();expect(v.error()).toBe('');
  });
  it('does not update the thread after unmount during polling',async()=>{
    const f=fixture('KnabaAssistant'),v=f.view;v.setTicket(ticket);
    const pending=v.load(ticket);f.dispose();f.requests[0].resolve(thread(ticket.id,'late'));await pending;
    expect(v.thread()).toBeNull();
  });
  it('does not issue duplicate handoffs during a pending mutation',async()=>{
    const f=fixture('KnabaAssistant'),v=f.view;v.setTicket(ticket);v.setAccepted(true);
    const first=v.handoff(event);await flush();await v.handoff(event);
    expect(v.ticket()).toEqual(ticket);expect(f.requests).toHaveLength(1);
    f.requests[0].resolve(thread(ticket.id,'owner'));await first;expect(v.busy()).toBe(false);
  });
  it('preserves the current reset cancellation contract during a pending handoff',async()=>{
    const f=fixture('KnabaAssistant'),v=f.view;v.setTicket(ticket);v.setAccepted(true);
    const pending=v.handoff(event);await flush();v.reset();
    expect(f.requests[0].options.signal.aborted).toBe(true);
    expect(v.ticket()).toBeNull();expect(v.thread()).toBeNull();expect(v.busy()).toBe(false);
    f.requests[0].resolve(thread(ticket.id,'late owner'));await pending;
    expect(v.ticket()).toBeNull();expect(v.thread()).toBeNull();expect(v.error()).toBe('');
  });
});

describe('owner inbox asynchronous state',()=>{
  it('ignores old selections and their errors and keeps drafts per conversation',async()=>{
    const f=fixture('AssistantInbox'),v=f.view;
    const first=v.openConversation('A');v.setAnswer('A draft');const second=v.openConversation('B');
    f.requests[1].resolve(thread('B','B current'));await second;f.requests[0].reject(new Error('old failure'));await first;
    expect(v.thread().conversation.id).toBe('B');expect(v.fault()).toBe('');expect(v.answer()).toBe('');
    v.setAnswer('B draft');const back=v.openConversation('A');f.requests[2].resolve(thread('A','A current'));await back;
    expect(v.answer()).toBe('A draft');
  });
  it('prevents selection and stale polling from replacing a pending owner reply',async()=>{
    const f=fixture('AssistantInbox'),v=f.view;
    const open=v.openConversation('A');f.requests[0].resolve(thread('A','start'));await open;
    const poll=v.openConversation('A',true);v.setAnswer('reply');const send=v.send('messages','reply');await flush();
    await v.openConversation('B');expect(v.active()).toBe('A');
    f.requests[2].resolve(thread('A','sent'));await flush();
    f.requests[1].resolve(thread('A','stale'));await poll;
    expect(v.thread().messages[0].content).toBe('sent');
    // Complete the post-write list/notification/thread refresh.
    f.requests[3].resolve({conversations:[],limited:false});await flush();
    f.requests[4].resolve({enabled:false,counts:{}});await flush();
    f.requests[5].resolve(thread('A','sent'));await send;
    expect(v.busy()).toBe(false);
  });
  it('keeps one slow owner refresh in flight across polling ticks',async()=>{
    const f=fixture('AssistantInbox'),v=f.view;const first=v.refresh(true);await v.refresh(true);
    expect(f.requests).toHaveLength(1);
    f.requests[0].resolve({conversations:[],limited:false});await flush();
    await v.refresh(true);expect(f.requests).toHaveLength(2);
    f.requests[1].resolve({enabled:false,counts:{}});await first;
  });
  it('notification refresh completion does not unlock a newer owner mutation',async()=>{
    const f=fixture('AssistantInbox'),v=f.view;
    const open=v.openConversation('A');f.requests[0].resolve(thread('A','start'));await open;
    v.setNotifications({enabled:true,counts:{pending:1}});
    const retry=v.retryNotifications();f.requests[1].resolve({ok:true});await flush();
    expect(v.busy()).toBe(false);
    const send=v.send('messages','reply');await flush();expect(v.busy()).toBe(true);
    f.requests[2].resolve({conversations:[],limited:false});await retry;
    expect(v.busy()).toBe(true);
    f.requests[3].resolve(thread('A','sent'));await flush();
    f.requests[4].resolve({conversations:[],limited:false});await flush();
    f.requests[5].resolve({enabled:false,counts:{}});await flush();
    f.requests[6].resolve(thread('A','sent'));await send;expect(v.busy()).toBe(false);
  });
  it.each([401,403])('clears private cached state and pending updates after current HTTP %s',async(status)=>{
    const f=fixture('AssistantInbox'),v=f.view;
    const first=v.openConversation('A');f.requests[0].resolve(thread('A','private A'));await first;
    v.setAnswer('private draft A');const second=v.openConversation('B');f.requests[1].resolve(thread('B','private B'));await second;
    v.setAnswer('private draft B');v.setList([{id:'A',preview:'private list'}]);v.setNotifications({enabled:true,counts:{pending:2}});
    const late=v.openConversation('B',true);const refresh=v.refresh();f.requests[3].respond(status);await refresh;
    expect(v.role()).toBe('guest');expect(v.thread()).toBeNull();expect(v.list()).toEqual([]);expect(v.notifications()).toBeNull();
    expect(v.active()).toBe('');expect(v.answer()).toBe('');expect(v.proposal()).toBe('');expect(v.busy()).toBe(false);
    f.requests[2].resolve(thread('B','late private response'));await late;expect(v.thread()).toBeNull();
    v.setRole('owner');const reopened=v.openConversation('A');f.requests[4].resolve(thread('A','new session'));await reopened;
    expect(v.answer()).toBe('');
  });
  it('ignores an unauthorized response from a superseded selection',async()=>{
    const f=fixture('AssistantInbox'),v=f.view;const old=v.openConversation('A'),latest=v.openConversation('B');
    f.requests[1].resolve(thread('B','current'));await latest;f.requests[0].respond(401);await old;
    expect(v.role()).toBe('owner');expect(v.thread().conversation.id).toBe('B');
  });
  it('ignores a late thread response after navigation/unmount',async()=>{
    const f=fixture('AssistantInbox'),v=f.view;const pending=v.openConversation('A');f.dispose();
    f.requests[0].resolve(thread('A','late'));await pending;expect(v.thread()).toBeNull();
  });
});
