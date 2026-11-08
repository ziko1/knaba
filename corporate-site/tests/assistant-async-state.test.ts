import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createAsyncViewScope} from '../src/lib/async-view-scope';
import {createAssistantRequestState,sameAssistantTicket} from '../src/lib/assistant-request-state';
import {createAssistantDisplayReceipts,visibleOwnerMessageIds} from '../src/lib/assistant-display-receipts';
import {INBOX_LOCALES,INBOX_LOCALE_NAMES,INBOX_DATE_LOCALES,assistantInboxLocale,createInboxLocaleStore,type InboxLocale} from '../src/lib/assistant-inbox-i18n';
import {inboxPacks} from './helpers/assistant-inbox-packs';

// Execute the actual component event handlers, with only rendering and network
// replaced. Deliberately reorder HTTP completions to reproduce lost updates.
function fixture(component:'KnabaAssistant'|'AssistantInbox',locale='en',manualLocaleLoads=false) {
  const source=ts.createSourceFile(component+'.tsx',readFileSync(new URL('../src/components/'+component+'.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const entry=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text===component)!;
  const render=entry.body!.statements.find(node=>ts.isReturnStatement(node))!;
  const exposed=component==='KnabaAssistant'
    ? 'load,send,handoff,decide,reset,ticket,setTicket,thread,setThread,open,setOpen,receipts,setLog:(element:HTMLDivElement)=>log=element,setAccepted,setDraft,draft,error,busy,contactPath,contactLabel'
    : 'openConversation,send,setStatus,revokeAccess,refresh,loadMore,nextCursor,loadingMore,changeLocale,locale,label,requestedLocale,languageBusy,languageFault,loginPath,statusLabel,retryNotifications,notifications,setNotifications,role,setRole,list,setList,active,thread,answer,setAnswer,proposal,setProposal,fault,busy';
  const body=entry.getText(source).slice(0,render.getStart(source)-entry.getStart(source))+'return {'+exposed+'};}';
  const input=source.statements.filter(node=>!ts.isImportDeclaration(node)&&node!==entry).map(node=>node.getText(source)).join('\n')+'\n'+body;
  const output=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  type Request={path:string;options:{method:string;body?:string;headers?:Record<string,string>;signal:AbortSignal};resolve:(value:unknown)=>void;reject:(reason:unknown)=>void;respond:(status:number)=>void};
  const requests:Request[]=[],cleanup:Array<()=>void>=[];
  const frames=new Map<number,()=>void>();let frameId=0;
  const document={visibilityState:'visible',hidden:false};
  const localeRequests:Array<{locale:InboxLocale;resolve:(value:unknown)=>void;reject:(reason:unknown)=>void}>=[];
  const fetchInboxLabels=vi.fn((locale:InboxLocale)=>manualLocaleLoads?new Promise((resolve,reject)=>localeRequests.push({locale,resolve,reject})):Promise.resolve(inboxPacks[locale]));
  const exports:Record<string,any>={};
  const storage={removeItem:vi.fn(),setItem:vi.fn()};
  const confirm=vi.fn(()=>true);
  const fetch=vi.fn((path:string,options:Request['options'])=>new Promise((resolve,reject)=>requests.push({path,options,resolve:value=>resolve({ok:true,json:async()=>value}),respond:status=>resolve({ok:false,status}),reject})));
  runInNewContext(output,{
    exports,fetch,createAsyncViewScope,createAssistantRequestState,sameAssistantTicket,createAssistantDisplayReceipts,visibleOwnerMessageIds,INBOX_LOCALES,INBOX_LOCALE_NAMES,INBOX_DATE_LOCALES,assistantInboxLocale,createInboxLocaleStore,fetchInboxLabels,
    createSignal:(initial:unknown)=>{let value=initial;return [()=>value,(next:unknown)=>value=typeof next==='function'?next(value):next];},
    createEffect:()=>{},onMount:()=>{},onCleanup:(fn:()=>void)=>cleanup.push(fn),
    assistantLocale:(locale:string)=>locale??'de',
    window:{confirm,speechSynthesis:{cancel:vi.fn()},innerWidth:800,innerHeight:600},document,sessionStorage:storage,
    requestAnimationFrame:(callback:()=>void)=>{frames.set(++frameId,callback);return frameId;},cancelAnimationFrame:(id:number)=>frames.delete(id),
    setTimeout:()=>1,clearTimeout:()=>{},queueMicrotask,AbortController,crypto:{randomUUID:()=> 'test-request'},
  });
  const view=exports.default(component==='AssistantInbox'?{locale,initialLabels:inboxPacks[assistantInboxLocale(locale)]}:{locale});
  if(component==='AssistantInbox')view.setRole('owner');
  return {view,requests,localeRequests,fetchInboxLabels,fetch,storage,confirm,document,frame:()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback());},dispose:()=>cleanup.forEach(fn=>fn())};
}
const ticket={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',token:'a'.repeat(64)};
const thread=(id:string,content:string)=>({conversation:{id,status:'assistant'},messages:[{id:content,content,sender:'owner'}],offers:[]});
const event={preventDefault:()=>{}};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));

function displayedGuest(){
  const f=fixture('KnabaAssistant'),v=f.view;
  const ownerId='11111111-1111-4111-8111-111111111111',customerId='22222222-2222-4222-8222-222222222222';
  const snapshot={conversation:{id:ticket.id,status:'human'},messages:[
    {id:ownerId,sender:'owner',content:'Owner reply',guestDisplayedAt:null},
    {id:customerId,sender:'customer',content:'Visitor text',guestDisplayedAt:null},
  ],offers:[]};
  const box={left:10,top:10,right:300,bottom:400};
  const log={isConnected:true,getBoundingClientRect:()=>box,querySelectorAll:()=>snapshot.messages.map(message=>({
    isConnected:true,dataset:{ownerMessageId:message.id},getBoundingClientRect:()=>({left:20,top:20,right:250,bottom:60}),
  }))};
  v.setTicket(ticket);v.setThread(snapshot);v.setOpen(true);v.setLog(log);v.setDraft('unsent visitor draft');
  return {...f,ownerId,snapshot,log,paint:()=>{f.frame();f.frame();}};
}

describe('public Assistant asynchronous state',()=>{
  it('reports only an actually displayed owner message after two rendered frames',async()=>{
    const f=displayedGuest(),v=f.view;v.receipts.schedule();expect(f.requests).toHaveLength(0);
    f.frame();expect(f.requests).toHaveLength(0);f.frame();expect(f.requests).toHaveLength(1);
    expect(f.requests[0].path).toBe(`/api/assistant/conversations/${ticket.id}/displayed`);
    expect(JSON.parse(f.requests[0].options.body!)).toEqual({messageIds:[f.ownerId]});
    expect(f.requests[0].options.headers?.['X-KnaBa-Conversation']).toBe(ticket.token);
    f.requests[0].resolve({receipts:[{id:f.ownerId,guestDisplayedAt:'2026-11-08T10:00:00.000Z'}]});await flush();f.paint();
    v.receipts.schedule();f.paint();expect(f.requests).toHaveLength(1);expect(v.draft()).toBe('unsent visitor draft');
  });

  it.each(['closed widget','hidden page','wrong thread','detached node','legacy server'])('does not acknowledge a %s',condition=>{
    const f=displayedGuest(),v=f.view;
    if(condition==='closed widget')v.setOpen(false);
    if(condition==='hidden page')f.document.visibilityState='hidden';
    if(condition==='wrong thread')v.setThread({...f.snapshot,conversation:{id:'other'}});
    if(condition==='detached node')f.log.isConnected=false;
    if(condition==='legacy server')v.setThread({...f.snapshot,messages:f.snapshot.messages.map(({guestDisplayedAt,...message})=>message)});
    v.receipts.schedule();f.paint();expect(f.requests).toHaveLength(0);
  });

  it('clears the current revoked capability on receipt 404 while preserving the typed draft',async()=>{
    const f=displayedGuest(),v=f.view;v.receipts.schedule();f.paint();f.requests[0].respond(404);await flush();
    expect(v.ticket()).toBeNull();expect(v.thread()).toBeNull();expect(v.draft()).toBe('unsent visitor draft');
    expect(v.error()).toBe('Invalid or expired access code.');expect(f.storage.removeItem).toHaveBeenCalledOnce();
    v.receipts.schedule();f.paint();expect(f.requests).toHaveLength(1);
  });

  it('ignores an old receipt 404 after reset and a new conversation is displayed',async()=>{
    const f=displayedGuest(),v=f.view;v.receipts.schedule();f.paint();v.reset();
    const next={id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',token:'b'.repeat(64)};
    v.setTicket(next);v.setThread({...f.snapshot,conversation:{id:next.id,status:'human'}});v.setDraft('new private draft');
    v.receipts.schedule();f.paint();expect(f.requests[0].options.signal.aborted).toBe(true);
    expect(f.requests[1].path).toBe(`/api/assistant/conversations/${next.id}/displayed`);
    f.requests[0].respond(404);await flush();expect(v.ticket()).toEqual(next);expect(v.draft()).toBe('new private draft');
    f.requests[1].resolve({receipts:[]});await flush();expect(v.thread().conversation.id).toBe(next.id);
  });

  it('keeps the current private chat after a transient receipt failure',async()=>{
    const f=displayedGuest(),v=f.view;v.receipts.schedule();f.paint();f.requests[0].respond(503);await flush();
    expect(v.ticket()).toEqual(ticket);expect(v.thread()).toEqual(f.snapshot);expect(v.draft()).toBe('unsent visitor draft');
    expect(v.error()).toBe('');expect(f.storage.removeItem).not.toHaveBeenCalled();
    v.receipts.schedule();f.paint();expect(f.requests).toHaveLength(1);
  });

  it.each(['poll','send','handoff','decision'])('clears expired private state after confirmed %s 404 and keeps the typed draft',async(operation)=>{
    const f=fixture('KnabaAssistant'),v=f.view;v.setTicket(ticket);v.setAccepted(true);
    const initial=v.load(ticket);f.requests[0].resolve(thread(ticket.id,'private history'));await initial;
    v.setDraft('unsent visitor draft');
    const request=operation==='poll'?v.load(ticket):operation==='send'?v.send(event):operation==='handoff'?v.handoff(event):v.decide({id:'proposal'},'accepted');
    await flush();f.requests[1].respond(404);await request;
    expect(v.ticket()).toBeNull();expect(v.thread()).toBeNull();expect(v.busy()).toBe(false);
    expect(v.draft()).toBe('unsent visitor draft');expect(v.error()).toBe('Invalid or expired access code.');
    expect(f.storage.removeItem).toHaveBeenCalledOnce();
    await v.load(ticket);expect(f.requests).toHaveLength(2);
  });
  it.each([500,503])('keeps a recoverable conversation and draft after HTTP %s',async(status)=>{
    const f=fixture('KnabaAssistant'),v=f.view;v.setTicket(ticket);v.setAccepted(true);
    const initial=v.load(ticket);f.requests[0].resolve(thread(ticket.id,'private history'));await initial;
    v.setDraft('retry this draft');const pending=v.send(event);await flush();f.requests[1].respond(status);await pending;
    expect(v.ticket()).toEqual(ticket);expect(v.thread().messages[0].content).toBe('private history');
    expect(v.draft()).toBe('retry this draft');expect(f.storage.removeItem).not.toHaveBeenCalled();
  });
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
  it.each(['de','en','pl','lt','ru','uk'])('provides every inbox action and status in %s and retains a validated language choice',async locale=>{
    const f=fixture('AssistantInbox',locale),v=f.view;
    expect(v.locale()).toBe(locale);expect(v.label()).toEqual(inboxPacks[locale as InboxLocale]);
    expect(v.loginPath()).toContain('lang='+locale);
    for(const status of ['human','closed','assistant','malformed'])expect(v.statusLabel(status)).not.toBe(status);
    await v.changeLocale('uk');expect(v.label().loadMore).toBe('Завантажити ще розмови');
    expect(f.storage.setItem).toHaveBeenCalledWith('knaba-inbox-locale-v1','uk');
    await v.changeLocale('__proto__');expect(v.locale()).toBe('de');
  });

  it.each(['resolved','rejected'])('keeps the newest selected language when an older load is %s last',async completion=>{
    const f=fixture('AssistantInbox','de',true),v=f.view;
    const earlier=v.changeLocale('en'),latest=v.changeLocale('pl');await flush();
    expect(f.localeRequests.map(request=>request.locale)).toEqual(['en','pl']);
    expect(v.locale()).toBe('de');expect(v.requestedLocale()).toBe('pl');expect(v.languageBusy()).toBe(true);
    f.localeRequests[1].resolve(inboxPacks.pl);await latest;
    if(completion==='resolved')f.localeRequests[0].resolve(inboxPacks.en);else f.localeRequests[0].reject(Error('offline'));
    await earlier;
    expect(v.label()).toEqual(inboxPacks.pl);expect(v.locale()).toBe('pl');expect(v.requestedLocale()).toBe('pl');
    expect(v.languageBusy()).toBe(false);expect(v.languageFault()).toBe(false);
    expect(f.storage.setItem.mock.calls).toEqual([['knaba-inbox-locale-v1','pl']]);expect(f.requests).toHaveLength(0);
  });

  it('reuses an in-flight language when choices cycle and ignores the superseded failure',async()=>{
    const f=fixture('AssistantInbox','de',true),v=f.view;
    const first=v.changeLocale('uk'),middle=v.changeLocale('lt'),latest=v.changeLocale('uk');await flush();
    expect(f.localeRequests.map(request=>request.locale)).toEqual(['uk','lt']);
    f.localeRequests[0].resolve(inboxPacks.uk);await Promise.all([first,latest]);
    f.localeRequests[1].reject(Error('offline'));await middle;
    expect(v.label()).toEqual(inboxPacks.uk);expect(v.languageFault()).toBe(false);expect(v.languageBusy()).toBe(false);
    expect(f.storage.setItem).toHaveBeenCalledTimes(1);
    const pending=v.changeLocale('pl');await flush();await v.changeLocale('de');
    f.localeRequests[2].resolve(inboxPacks.pl);await pending;
    expect(v.locale()).toBe('de');expect(v.label()).toEqual(inboxPacks.de);
    expect(f.localeRequests).toHaveLength(3);
  });

  it.each(['network','invalid pack'])('keeps labels, drafts, thread and cursor after a %s failure and allows retry',async failure=>{
    const f=fixture('AssistantInbox','de',true),v=f.view;
    const page=v.refresh();f.requests[0].resolve({conversations:[{id:'A'}],limited:true,nextCursor:'page-2'});await flush();
    f.requests[1].resolve({enabled:false,counts:{}});await page;
    const open=v.openConversation('A');f.requests[2].resolve(thread('A','private history'));await open;
    v.setAnswer('unsent reply');v.setProposal('unsent offer');
    const pending=v.changeLocale('ru');await flush();
    if(failure==='network')f.localeRequests[0].reject(Error('offline'));else f.localeRequests[0].resolve({languageName:'Русский'});
    await pending;
    expect(v.label()).toEqual(inboxPacks.de);expect(v.locale()).toBe('de');expect(v.requestedLocale()).toBe('de');
    expect(v.languageFault()).toBe(true);expect(v.languageBusy()).toBe(false);expect(v.fault()).toBe('');
    expect(v.thread().messages[0].content).toBe('private history');expect(v.list()).toEqual([{id:'A'}]);expect(v.nextCursor()).toBe('page-2');
    expect(v.answer()).toBe('unsent reply');expect(v.proposal()).toBe('unsent offer');expect(f.storage.setItem).not.toHaveBeenCalled();
    const retry=v.changeLocale('ru');await flush();expect(f.localeRequests).toHaveLength(2);
    f.localeRequests[1].resolve(inboxPacks.ru);await retry;
    expect(v.label()).toEqual(inboxPacks.ru);expect(v.languageFault()).toBe(false);expect(v.answer()).toBe('unsent reply');
    expect(f.requests).toHaveLength(3);
  });

  it('invalidates a pending locale completion when current owner access is lost',async()=>{
    const f=fixture('AssistantInbox','de',true),v=f.view;
    v.setList([{id:'A'}]);const open=v.openConversation('A');f.requests[0].resolve(thread('A','private history'));await open;
    v.setAnswer('unsent reply');v.setProposal('unsent offer');
    const locale=v.changeLocale('uk');await flush();
    const page=v.refresh();f.requests[1].respond(403);await page;
    f.localeRequests[0].resolve(inboxPacks.uk);await locale;
    expect(v.role()).toBe('guest');expect(v.list()).toEqual([]);expect(v.thread()).toBeNull();expect(v.nextCursor()).toBeNull();
    expect(v.answer()).toBe('');expect(v.proposal()).toBe('');expect(v.label()).toEqual(inboxPacks.de);expect(v.requestedLocale()).toBe('de');
    expect(v.languageFault()).toBe(false);expect(v.languageBusy()).toBe(false);expect(f.storage.setItem).not.toHaveBeenCalled();
  });

  it('does not apply or persist a language response after unmount',async()=>{
    const f=fixture('AssistantInbox','de',true),v=f.view;
    const pending=v.changeLocale('lt');await flush();f.dispose();
    f.localeRequests[0].resolve(inboxPacks.lt);await pending;
    expect(v.label()).toEqual(inboxPacks.de);expect(v.locale()).toBe('de');expect(f.storage.setItem).not.toHaveBeenCalled();
    await v.changeLocale('pl');expect(f.localeRequests).toHaveLength(1);
  });

  it('appends one page, deduplicates rows and preserves the loaded window during polling',async()=>{
    const f=fixture('AssistantInbox'),v=f.view;
    const initial=v.refresh();f.requests[0].resolve({conversations:[{id:'A',preview:'new A'},{id:'B',preview:'new B'}],limited:true,nextCursor:'page-2'});await flush();
    f.requests[1].resolve({enabled:false,counts:{}});await initial;
    const page=v.loadMore();await v.loadMore();await v.refresh(true);
    expect(f.requests).toHaveLength(3);expect(v.loadingMore()).toBe(true);
    expect(f.requests[2].path).toBe('/api/assistant/owner/conversations?cursor=page-2');
    f.requests[2].resolve({conversations:[{id:'B',preview:'stale B'},{id:'C',preview:'C'}],limited:true,nextCursor:'page-3'});await page;
    expect(v.list().map((row:{id:string})=>row.id)).toEqual(['A','B','C']);expect(v.list()[1].preview).toBe('new B');
    expect(v.nextCursor()).toBe('page-3');expect(v.loadingMore()).toBe(false);
    const refresh=v.refresh(true);f.requests[3].resolve({conversations:[{id:'D'},{id:'A'}],limited:true,nextCursor:'new-page-2'});await flush();
    expect(v.list().map((row:{id:string})=>row.id)).toEqual(['A','B','C']);
    expect(f.requests[4].path).toContain('new-page-2');
    f.requests[4].resolve({conversations:[{id:'B'},{id:'C'}],limited:false,nextCursor:null});await flush();
    f.requests[5].resolve({enabled:false,counts:{}});await refresh;
    expect(v.list().map((row:{id:string})=>row.id)).toEqual(['D','A','B','C']);expect(v.nextCursor()).toBeNull();
  });

  it('does not let a late page replace state after an owner mutation or revoked access',async()=>{
    const f=fixture('AssistantInbox'),v=f.view;
    const initial=v.refresh();f.requests[0].resolve({conversations:[{id:'A'}],limited:true,nextCursor:'page-2'});await flush();
    f.requests[1].resolve({enabled:false,counts:{}});await initial;
    const open=v.openConversation('A');f.requests[2].resolve(thread('A','current'));await open;
    const page=v.loadMore();const mutation=v.setStatus('closed');
    f.requests[3].resolve({conversations:[{id:'stale'}],limited:true,nextCursor:'stale-cursor'});await page;
    expect(v.list().map((row:{id:string})=>row.id)).toEqual(['A']);
    f.requests[4].resolve(thread('A','closed'));await flush();
    f.requests[5].respond(403);await mutation;
    expect(v.role()).toBe('guest');expect(v.list()).toEqual([]);expect(v.nextCursor()).toBeNull();expect(v.loadingMore()).toBe(false);
    await v.loadMore();expect(f.requests).toHaveLength(6);
  });

  it('keeps the existing page and retry cursor after a transient next-page error',async()=>{
    const f=fixture('AssistantInbox'),v=f.view;
    const initial=v.refresh();f.requests[0].resolve({conversations:[{id:'A'}],limited:true,nextCursor:'page-2'});await flush();
    f.requests[1].resolve({enabled:false,counts:{}});await initial;
    const page=v.loadMore();f.requests[2].respond(503);await page;
    expect(v.list().map((row:{id:string})=>row.id)).toEqual(['A']);expect(v.nextCursor()).toBe('page-2');expect(v.loadingMore()).toBe(false);
    const retry=v.loadMore();expect(f.requests[3].path).toContain('page-2');f.requests[3].resolve({conversations:[{id:'B'}],limited:false,nextCursor:null});await retry;
    expect(v.list().map((row:{id:string})=>row.id)).toEqual(['A','B']);expect(v.nextCursor()).toBeNull();
  });
  it('revokes the selected guest code only after confirmation and keeps owner history',async()=>{
    const f=fixture('AssistantInbox'),v=f.view;
    const initial=v.openConversation('A');f.requests[0].resolve(thread('A','owner history'));await initial;
    f.confirm.mockReturnValueOnce(false);await v.revokeAccess();expect(f.requests).toHaveLength(1);
    const revoked={...thread('A','owner history'),conversation:{id:'A',status:'human',revokedAt:'2026-11-08T12:00:00.000Z'}};
    const pending=v.revokeAccess();
    expect(f.requests[1].path).toBe('/api/assistant/owner/conversations/A/access/revoke');
    expect(f.requests[1].options.method).toBe('POST');expect(f.requests[1].options.body).toBe('{}');
    await v.revokeAccess();expect(f.requests).toHaveLength(2);
    f.requests[1].resolve(revoked);await flush();
    f.requests[2].resolve({conversations:[revoked.conversation],limited:false});await flush();
    f.requests[3].resolve({enabled:false,counts:{}});await flush();
    f.requests[4].resolve(revoked);await pending;
    expect(v.thread().conversation.revokedAt).toBe(revoked.conversation.revokedAt);
    expect(v.thread().messages[0].content).toBe('owner history');expect(v.busy()).toBe(false);
    await v.revokeAccess();expect(f.requests).toHaveLength(5);
  });
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
