import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createInquiryDraftMemory,inquiryDraftCopy} from '../src/lib/inquiry-draft';
import {createAssistantTicketStore} from '../src/lib/assistant-ticket';
import {emptyInquiry,buildInquiry} from '../src/lib/inquiry';
import {constructionInquiryData,constructionMessageLimit,validateConstructionInquiry} from '../src/lib/inquiry-construction';
import {offerBySlug} from '../src/data/construction-offers';
import {publicOfferName} from '../src/lib/public-i18n';
import {inboxPacks} from './helpers/assistant-inbox-packs';
import {mergeAssistantRequests,type AssistantRequestContext,type AssistantRequestSummary} from '../src/lib/assistant-request-contract';

const a={id:'43bb00af-fccc-4495-ac32-b2e354190570',token:'a'.repeat(64)},b={id:'53bb00af-fccc-4495-ac32-b2e354190570',token:'b'.repeat(64)};
const request:AssistantRequestSummary={id:'63bb00af-fccc-4495-ac32-b2e354190570',status:'new',version:1,createdAt:'2026-11-08T12:00:00.000Z',erpTransfer:{status:'PENDING'}};
const answers={...emptyInquiry(),service:'baureinigung',objectType:'Baustelle',postcode:'10315',frequency:'Einmalig',name:'Edited guest',email:'edited@example.invalid',message:'Local-only free text'};
const context=(requests:AssistantRequestSummary[]=[],status:'assistant'|'human'|'closed'='assistant'):AssistantRequestContext=>({conversation:{id:a.id,locale:'en',status,contactName:'Current contact',contactEmail:'current@example.invalid',contactPhone:'+491234567890'},requests,requestPage:{limit:20,total:requests.length,nextCursor:null}});
const ok=(value:unknown)=>({ok:true,status:200,json:vi.fn(async()=>value)});
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {resolve,promise};}
function shared(capture=true){
  const values=new Map<string,string>();const tickets=createAssistantTicketStore(()=>({getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}}));
  tickets.write(a);if(capture)tickets.capture(a);
  return {tickets,memory:createInquiryDraftMemory()};
}

// Execute the actual form lifecycle/handlers. Transport, signals and navigation
// are controlled here; DOM/painted visibility remain actual-browser acceptance.
const source=ts.createSourceFile('Inquiry.tsx',readFileSync(new URL('../src/components/Inquiry.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const component=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='Inquiry');
if(!component?.body)throw Error('Inquiry component missing');
const body=component.body.statements.filter(node=>!ts.isReturnStatement(node)).map(node=>node.getText(source)).join('\n');
const exposed='data,topic,ready,review,receipt,error,privacy,transferAccepted,assistantContext,assistantFault,contextBusy,sending,setPrivacy,setTransferAccepted,selectTopic,update,sendRequest,refreshAssistant,cancelAssistantRequest';
const output=ts.transpileModule(`function Inquiry(props={}){${body}\nreturn {${exposed}};}\nexports.Inquiry=Inquiry;`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
type View={data:()=>typeof answers;topic:()=>string;ready:()=>boolean;review:()=>unknown;receipt:()=>string;error:()=>string;privacy:()=>boolean;transferAccepted:()=>boolean;assistantContext:()=>AssistantRequestContext|null;assistantFault:()=>string;contextBusy:()=>boolean;sending:()=>boolean;setPrivacy:(v:boolean)=>void;setTransferAccepted:(v:boolean)=>void;selectTopic:(v:string)=>void;update:(field:string,v:string)=>void;sendRequest:()=>Promise<void>;refreshAssistant:(more?:boolean)=>Promise<void>;cancelAssistantRequest:(r:AssistantRequestSummary)=>Promise<void>};
function mount(state=shared(),initial=context(),locale='en'){
  const mounted:(()=>void)[]=[],effects:(()=>void)[]=[],cleanups:(()=>void)[]=[];
  const fetcher=vi.fn().mockResolvedValueOnce(ok(initial)),createId=vi.fn(()=> '73bb00af-fccc-4495-ac32-b2e354190570');
  const tab=Object.assign(new EventTarget(),{location:{search:'?intent=assistant'},confirm:vi.fn(()=>true)}),page=new EventTarget(),props={locale};
  const exports={} as {Inquiry:(props:unknown)=>View};
  runInNewContext(output,{exports,createSignal:(initial:unknown)=>{let value=initial;return[()=>value,(next:unknown)=>{value=typeof next==='function'?next(value):next;}];},onMount:(fn:()=>void)=>mounted.push(fn),onCleanup:(fn:()=>void)=>cleanups.push(fn),createEffect:(fn:()=>void)=>effects.push(fn),publicText:(text:string)=>text,publicApiError:()=>'',publicOfferName,mergeAssistantRequests,inquirySupportPath:(path:string)=>path,inquiryDraftMemory:state.memory,inquiryDraftCopy,assistantTickets:state.tickets,fetchAssistantRequestLabels:async(selected:keyof typeof inboxPacks)=>inboxPacks[selected],emptyInquiry,constructionInquiryData,constructionMessageLimit,validateConstructionInquiry,buildInquiry,offerBySlug,window:tab,document:page,URLSearchParams,queueMicrotask,setTimeout,clearTimeout,AbortController,DOMException,createRequestId:createId,portalHeader:{'X-KnaBa-Request':'portal-v1'},fetch:fetcher,Error,TypeError,SyntaxError});
  const view=exports.Inquiry(props);mounted.forEach(fn=>fn());const flush=()=>effects.forEach(fn=>fn());flush();
  return {view,props,fetcher,createId,tab,flush,cleanup:()=>cleanups.forEach(fn=>fn()),...state};
}
function fill(view:View){view.selectTopic('bauhilfe');for(const [key,value] of Object.entries(answers))view.update(key,value);}
const submissions=(fetcher:ReturnType<typeof vi.fn>)=>fetcher.mock.calls.filter(([path,init])=>String(path).endsWith('/requests')&&init.method==='POST');

describe('actual assistant inquiry handlers',()=>{
  it('never restores a public draft or falls back to public submission when only the intent URL is present',async()=>{
    const state=shared(false);state.memory.save({data:answers,topic:'bauhilfe',step:2,reviewing:true});
    const page=mount(state);await tick();
    expect(page.view.data()).toEqual(emptyInquiry());expect(page.view.ready()).toBe(false);expect(page.view.assistantFault()).toBe('unavailable');
    page.view.setPrivacy(true);page.view.setTransferAccepted(true);await page.view.sendRequest();
    expect(page.fetcher).not.toHaveBeenCalled();expect(state.memory.read()?.data).toEqual(answers);page.cleanup();
  });
  it('prefills only editable contact fields and requires a fresh separate transfer acknowledgement',async()=>{
    const page=mount();await tick();
    expect(page.view.data()).toEqual({...emptyInquiry(),name:'Current contact',email:'current@example.invalid',phone:'+491234567890'});
    expect(page.view.topic()).toBe('');expect(page.view.privacy()).toBe(false);expect(page.view.transferAccepted()).toBe(false);
    expect(page.fetcher.mock.calls[0]).toMatchObject([`/api/assistant/conversations/${a.id}/request-context`,{credentials:'same-origin',cache:'no-store',headers:{'X-KnaBa-Conversation':a.token}}]);
    fill(page.view);page.view.setPrivacy(true);await page.view.sendRequest();expect(submissions(page.fetcher)).toHaveLength(0);
    page.view.setTransferAccepted(true);page.view.update('postcode','10115');expect(page.view.transferAccepted()).toBe(false);
    page.view.setTransferAccepted(true);page.fetcher.mockResolvedValueOnce(ok({id:request.id,received:true,conversationId:a.id,request})).mockResolvedValueOnce(ok(context([request])));
    await page.view.sendRequest();
    const [path,init]=submissions(page.fetcher)[0];expect(path).toBe(`/api/assistant/conversations/${a.id}/requests`);
    expect(JSON.parse(init.body)).toMatchObject({privacyAccepted:true,transferAccepted:true,idempotencyKey:'73bb00af-fccc-4495-ac32-b2e354190570',postcode:'10115'});
    expect(Object.keys(JSON.parse(init.body)).sort()).toEqual([...Object.keys(answers),'privacyAccepted','transferAccepted','idempotencyKey','website'].sort());
    expect(page.view.receipt()).toBe(request.id);expect(page.view.assistantContext()?.requests[0].erpTransfer.status).toBe('PENDING');
    await page.view.sendRequest();expect(submissions(page.fetcher)).toHaveLength(1);page.cleanup();
  });
  it('retries byte-identical pending content across locale navigation only after renewed acknowledgements',async()=>{
    const state=shared(),first=mount(state);await tick();fill(first.view);first.view.setPrivacy(true);first.view.setTransferAccepted(true);first.flush();
    first.fetcher.mockRejectedValueOnce(new TypeError('Synthetic timeout'));await first.view.sendRequest();const original=submissions(first.fetcher)[0][1].body;first.cleanup();
    const second=mount(state,context(),'uk');await tick();expect(second.view.data()).toEqual(answers);expect(second.view.privacy()).toBe(false);expect(second.view.transferAccepted()).toBe(false);
    second.view.setPrivacy(true);await second.view.sendRequest();expect(submissions(second.fetcher)).toHaveLength(0);
    second.view.setTransferAccepted(true);second.fetcher.mockResolvedValueOnce(ok({id:request.id,received:true,conversationId:a.id,request})).mockResolvedValueOnce(ok(context([request])));
    await second.view.sendRequest();expect(submissions(second.fetcher)[0][1].body).toBe(original);expect(second.createId).not.toHaveBeenCalled();second.cleanup();
  });
  it('clears private state on reset and never consumes a late response for a replaced or restored ticket',async()=>{
    const page=mount();await tick();fill(page.view);page.view.setPrivacy(true);page.view.setTransferAccepted(true);
    const pending=deferred<ReturnType<typeof ok>>();page.fetcher.mockImplementationOnce(()=>pending.promise);const sending=page.view.sendRequest();
    page.tickets.write(null);page.tickets.write(a);page.tickets.capture(a);
    const late=ok({id:request.id,received:true,conversationId:a.id,request});pending.resolve(late);await sending;
    expect(late.json).not.toHaveBeenCalled();expect(page.view.receipt()).toBe('');expect(page.view.data()).toEqual(emptyInquiry());expect(page.view.assistantContext()).toBeNull();
    expect(submissions(page.fetcher)[0][1].signal.aborted).toBe(true);expect(page.tickets.captured()).toEqual(a);page.cleanup();
  });
  it('checks authority again after JSON parsing and does not acknowledge another conversation',async()=>{
    const page=mount();await tick();fill(page.view);page.view.setPrivacy(true);page.view.setTransferAccepted(true);
    const parsed=deferred<unknown>(),json=vi.fn(()=>parsed.promise);page.fetcher.mockResolvedValueOnce({ok:true,status:200,json});const sending=page.view.sendRequest();await tick();expect(json).toHaveBeenCalledOnce();
    page.tickets.write(b);page.tickets.capture(b);parsed.resolve({id:request.id,received:true,conversationId:a.id,request});await sending;
    expect(page.view.receipt()).toBe('');expect(page.view.assistantFault()).toBe('unavailable');expect(page.tickets.captured()).toEqual(b);page.cleanup();
  });
  it('permits withdrawal for a closed chat and keeps an already-applied ERP state distinct',async()=>{
    const applied={...request,erpTransfer:{status:'APPLIED' as const}},cancelled={...applied,status:'cancelled' as const,version:2};
    const page=mount(shared(),context([applied],'closed'));await tick();page.view.setPrivacy(true);page.view.setTransferAccepted(true);await page.view.sendRequest();expect(submissions(page.fetcher)).toHaveLength(0);
    page.fetcher.mockResolvedValueOnce(ok({conversationId:a.id,request:cancelled})).mockResolvedValueOnce(ok(context([cancelled],'closed')));
    await page.view.cancelAssistantRequest(applied);
    expect(page.fetcher.mock.calls[1]).toMatchObject([`/api/assistant/conversations/${a.id}/requests/${request.id}/cancel`,{method:'POST',body:'{"version":1}',headers:{'X-KnaBa-Conversation':a.token}}]);
    expect(page.view.assistantContext()?.requests[0]).toMatchObject({status:'cancelled',erpTransfer:{status:'APPLIED'}});page.cleanup();
  });
  it('refreshes a version conflict but requires another explicit cancellation action',async()=>{
    const page=mount(shared(),context([request]));await tick();const newer={...request,status:'reviewing' as const,version:2};
    page.fetcher.mockResolvedValueOnce({ok:false,status:409}).mockResolvedValueOnce(ok(context([newer])));
    await page.view.cancelAssistantRequest(request);
    expect(page.fetcher.mock.calls.filter(([,init])=>init.method==='POST')).toHaveLength(1);expect(page.view.assistantContext()?.requests[0].version).toBe(2);expect(page.view.error()).toBe(inboxPacks.en.requestChanged);
    expect(page.view.receipt()).toBe('');page.cleanup();
  });
  it('rejects an unrelated context response without prefilling or enabling submission',async()=>{
    const wrong={...context(),conversation:{...context().conversation,id:b.id}};
    const page=mount(shared(),wrong);await tick();expect(page.view.ready()).toBe(false);expect(page.view.data()).toEqual(emptyInquiry());expect(page.view.assistantFault()).toBe('load');page.cleanup();
  });
  it('clears a confirmed guest 404 without clearing an unrelated public draft or trying /api/leads',async()=>{
    const state=shared();state.memory.save({data:answers,topic:'bauhilfe',step:2,reviewing:false});const page=mount(state);await tick();
    page.fetcher.mockResolvedValueOnce({ok:false,status:404});await page.view.refreshAssistant();
    expect(page.tickets.current()).toBeNull();expect(page.view.data()).toEqual(emptyInquiry());expect(page.view.ready()).toBe(false);expect(page.memory.read()?.data).toEqual(answers);
    expect(page.fetcher.mock.calls.every(([path])=>String(path).startsWith('/api/assistant/conversations/'))).toBe(true);page.cleanup();
  });
  it('loads another page under the same capability and ignores a late page after a ticket change',async()=>{
    const initial=context([request]);initial.requestPage={limit:20,total:21,nextCursor:'safe-cursor'};const page=mount(shared(),initial);await tick();
    const pending=deferred<ReturnType<typeof ok>>();page.fetcher.mockImplementationOnce(()=>pending.promise);const loading=page.view.refreshAssistant(true);
    expect(page.fetcher.mock.calls[1][0]).toBe(`/api/assistant/conversations/${a.id}/request-context?requestCursor=safe-cursor`);
    page.tickets.write(b);page.tickets.capture(b);const late=ok(context([{...request,id:'83bb00af-fccc-4495-ac32-b2e354190570'}]));pending.resolve(late);await loading;
    expect(late.json).not.toHaveBeenCalled();expect(page.view.assistantContext()).toBeNull();page.cleanup();
  });
  it('invalidates acknowledged consent on an in-place locale change while retaining exact pending request bytes',async()=>{
    const page=mount();await tick();fill(page.view);page.view.setPrivacy(true);page.view.setTransferAccepted(true);page.flush();
    page.fetcher.mockRejectedValueOnce(new TypeError('Synthetic timeout'));await page.view.sendRequest();const original=submissions(page.fetcher)[0][1].body;
    page.fetcher.mockResolvedValueOnce(ok(context()));page.props.locale='uk';page.flush();await tick();
    expect(page.view.privacy()).toBe(false);expect(page.view.transferAccepted()).toBe(false);
    await page.view.sendRequest();expect(submissions(page.fetcher)).toHaveLength(1);
    page.view.setPrivacy(true);page.view.setTransferAccepted(true);page.fetcher.mockResolvedValueOnce(ok({id:request.id,received:true,conversationId:a.id,request})).mockResolvedValueOnce(ok(context([request])));
    await page.view.sendRequest();expect(submissions(page.fetcher)[1][1].body).toBe(original);page.cleanup();
  });
});
