import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {bindInquiryNavigation,createInquiryDraftMemory,inquiryDraftCopy} from '../src/lib/inquiry-draft';
import {emptyInquiry,buildInquiry} from '../src/lib/inquiry';
import {constructionInquiryData,constructionMessageLimit,validateConstructionInquiry} from '../src/lib/inquiry-construction';
import {offerBySlug} from '../src/data/construction-offers';

const answers={...emptyInquiry(),service:'baureinigung',objectType:'Baustelle',postcode:'10315',frequency:'Einmalig',name:'Synthetic visitor',email:'draft@example.test',message:'Мій власний текст <unchanged>'};
function navigationTo(path:string,language=false){
  const anchor={hasAttribute:(name:string)=>language&&name==='data-language-switch'};
  return Object.assign(new Event('astro:before-preparation',{cancelable:true}),{
    from:new URL('https://kneba.vsp.rest/kontakt/'),to:new URL(path,'https://kneba.vsp.rest'),
    sourceElement:{closest:()=>anchor},
  });
}

// Exercise the actual component's state/lifecycle functions in the repository's
// Node-only harness. JSX/rendering and actual navigation remain browser gates.
const source=ts.createSourceFile('Inquiry.tsx',readFileSync(new URL('../src/components/Inquiry.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const component=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='Inquiry');
if(!component?.body)throw new Error('Inquiry component is missing');
const body=component.body.statements.filter(node=>!ts.isReturnStatement(node)).map(node=>node.getText(source)).join('\n');
const output=ts.transpileModule(`function Inquiry(props={}){${body}\nreturn {data,topic,step,review,receipt,sending,privacy,setPrivacy,selectTopic,update,sendRequest};}\nexports.Inquiry=Inquiry;`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function mount(memory:ReturnType<typeof createInquiryDraftMemory>,locale='en',search=''){
  const mounted:(()=>void)[]=[],effects:(()=>void)[]=[],cleanups:(()=>void)[]=[];
  const page=new EventTarget(),tab=Object.assign(new EventTarget(),{location:{search}});
  const exports={} as {Inquiry:(props:unknown)=>{data:()=>typeof answers;topic:()=>string;step:()=>number;review:()=>unknown;receipt:()=>string;sending:()=>boolean;privacy:()=>boolean;setPrivacy:(value:boolean)=>void;selectTopic:(value:string)=>void;update:(field:string,value:string)=>void;sendRequest:()=>Promise<void>}};
  const fetcher=vi.fn(),createId=vi.fn(()=>`synthetic-${locale}-request-key`);
  runInNewContext(output,{exports,createSignal:(initial:unknown)=>{let value=initial;return[()=>value,(next:unknown)=>{value=typeof next==='function'?next(value):next;}];},onMount:(callback:()=>void)=>mounted.push(callback),onCleanup:(callback:()=>void)=>cleanups.push(callback),createEffect:(callback:()=>void)=>effects.push(callback),publicText:(text:string)=>text,publicApiError:()=>'',inquirySupportPath:(path:string)=>path,inquiryDraftMemory:memory,inquiryDraftCopy,bindInquiryNavigation,emptyInquiry,constructionInquiryData,constructionMessageLimit,validateConstructionInquiry,buildInquiry,offerBySlug,window:tab,document:page,URLSearchParams,queueMicrotask,setTimeout,clearTimeout,AbortController,createRequestId:createId,portalHeader:{},fetch:fetcher,console});
  const view=exports.Inquiry({locale});mounted.forEach(callback=>callback());
  const flush=()=>effects.forEach(callback=>callback());flush();
  return {view,page,tab,flush,fetcher,createId,cleanup:()=>cleanups.forEach(callback=>callback())};
}

describe('transient inquiry draft across Astro navigation',()=>{
  it('restores user answers verbatim on a locale change and keeps the current step',()=>{
    const memory=createInquiryDraftMemory();
    memory.save({data:answers,topic:'bauhilfe',step:2,reviewing:false});
    const page=mount(memory,'uk','?anliegen=bauhilfe');
    expect(page.view.data()).toEqual(answers);
    expect(page.view.topic()).toBe('bauhilfe');
    expect(page.view.step()).toBe(2);
    page.cleanup();
  });
  it('saves actual component input before a page switch and restores it on return',()=>{
    const memory=createInquiryDraftMemory(),first=mount(memory,'en','?anliegen=bauhilfe');
    first.view.update('name','Synthetic visitor');first.view.update('message','Private text unchanged');first.flush();
    const navigation=new Event('astro:before-preparation',{cancelable:true});first.page.dispatchEvent(navigation);
    expect(navigation.defaultPrevented).toBe(false);first.cleanup();
    const second=mount(memory,'ru');
    expect(second.view.data().name).toBe('Synthetic visitor');
    expect(second.view.data().message).toBe('Private text unchanged');
    expect(second.view.topic()).toBe('bauhilfe');second.cleanup();
  });
  it('retains contact answers while honoring a newly selected explicit service',()=>{
    const memory=createInquiryDraftMemory();memory.save({data:answers,topic:'bauhilfe',step:2,reviewing:true});
    const page=mount(memory,'en','?anliegen=kernbohrungen');
    expect(page.view.topic()).toBe('kernbohrungen');
    expect(page.view.data().email).toBe(answers.email);
    expect(page.view.step()).toBe(0);
    expect(page.view.review()).toBeNull();page.cleanup();
  });
  it('keeps private memory snapshots independent from callers and clears them explicitly',()=>{
    const memory=createInquiryDraftMemory(),input={data:{...answers},topic:'bauhilfe',step:2,reviewing:false};
    memory.save(input);input.data.name='Changed outside';
    const read=memory.read()!;read.data.email='Changed outside';
    expect(memory.read()!.data).toEqual(answers);
    memory.clear();expect(memory.read()).toBeNull();
  });
  it('retries the same body and key after a timeout and locale change until an actual edit',()=>{
    const memory=createInquiryDraftMemory(),createId=vi.fn().mockReturnValueOnce('request-1').mockReturnValueOnce('request-2');
    const first=memory.prepareSubmission({...answers,message:'Original localized topic: '+answers.message},'',createId);
    const retry=memory.prepareSubmission({...answers,message:'Another locale topic: '+answers.message},'',createId);
    expect(retry).toEqual(first);expect(createId).toHaveBeenCalledOnce();
    memory.resetSubmission();const changed=memory.prepareSubmission({...answers,message:'Edited by visitor'},'',createId);
    expect(changed.idempotencyKey).toBe('request-2');expect(changed.message).toBe('Edited by visitor');
  });
  it('the actual submission handler keeps retry identity across locales, requires renewed consent and clears a confirmed draft',async()=>{
    const memory=createInquiryDraftMemory();memory.save({data:answers,topic:'bauhilfe',step:2,reviewing:true});
    const first=mount(memory,'en');first.view.setPrivacy(true);first.fetcher.mockRejectedValueOnce(new TypeError('Synthetic network failure'));
    await first.view.sendRequest();const original=JSON.parse(first.fetcher.mock.calls[0][1].body);first.cleanup();
    const second=mount(memory,'uk');expect(second.view.privacy()).toBe(false);
    await second.view.sendRequest();expect(second.fetcher).not.toHaveBeenCalled();
    second.view.setPrivacy(true);second.fetcher.mockResolvedValueOnce({ok:true,json:async()=>({received:true,id:'synthetic-receipt'})});
    await second.view.sendRequest();
    expect(JSON.parse(second.fetcher.mock.calls[0][1].body)).toEqual(original);
    expect(second.createId).not.toHaveBeenCalled();expect(second.view.receipt()).toBe('synthetic-receipt');
    expect(memory.read()).toBeNull();second.cleanup();expect(memory.read()).toBeNull();
  });
  it('preserves normal SPA navigation during a request and ignores a late response after component cleanup',async()=>{
    const memory=createInquiryDraftMemory();memory.save({data:answers,topic:'bauhilfe',step:2,reviewing:true});
    const first=mount(memory,'en');first.view.setPrivacy(true);
    let resolve!:(value:unknown)=>void;first.fetcher.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    const request=first.view.sendRequest();
    const navigation=new Event('astro:before-preparation',{cancelable:true});first.page.dispatchEvent(navigation);
    expect(navigation.defaultPrevented).toBe(false);first.cleanup();
    expect(first.fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    const second=mount(memory,'uk');second.view.update('name','A newer draft');second.flush();
    resolve({ok:true,json:async()=>({received:true,id:'stale-receipt'})});await request;
    expect(first.view.receipt()).toBe('');expect(memory.read()!.data.name).toBe('A newer draft');second.cleanup();
  });
  it('a language link carrying the original URL topic cannot revert the edited service or discard its retry key',async()=>{
    const memory=createInquiryDraftMemory();memory.save({data:answers,topic:'bauhilfe',step:2,reviewing:true,entryTopic:'bauhilfe'});
    const first=mount(memory,'en','?anliegen=bauhilfe');first.view.selectTopic('kernbohrungen');first.flush();
    first.view.setPrivacy(true);first.fetcher.mockRejectedValueOnce(new TypeError('Synthetic timeout'));
    await first.view.sendRequest();const original=JSON.parse(first.fetcher.mock.calls[0][1].body);
    first.page.dispatchEvent(navigationTo('/uk/kontakt/?anliegen=bauhilfe',true));first.cleanup();
    const second=mount(memory,'uk','?anliegen=bauhilfe');expect(second.view.topic()).toBe('kernbohrungen');
    second.view.setPrivacy(true);second.fetcher.mockResolvedValueOnce({ok:true,json:async()=>({received:true,id:'same-receipt'})});
    await second.view.sendRequest();expect(JSON.parse(second.fetcher.mock.calls[0][1].body)).toEqual(original);second.cleanup();
  });
  it('tracks an explicit service link while away from the form and keeps the unload warning until the draft clears',()=>{
    const memory=createInquiryDraftMemory();memory.save({data:answers,topic:'bauhilfe',step:2,reviewing:false,entryTopic:'bauhilfe'});
    const first=mount(memory,'en','?anliegen=bauhilfe');first.view.selectTopic('kernbohrungen');first.flush();
    first.page.dispatchEvent(navigationTo('/faq/'));first.cleanup();
    const unload=new Event('beforeunload',{cancelable:true});Object.defineProperty(unload,'returnValue',{value:'unchanged',writable:true});first.tab.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    first.page.dispatchEvent(navigationTo('/kontakt/?anliegen=bauhilfe'));
    const second=mount(memory,'de','?anliegen=bauhilfe');expect(second.view.topic()).toBe('bauhilfe');expect(second.view.data().email).toBe(answers.email);expect(second.view.step()).toBe(0);
    second.cleanup();memory.clear();const clean=new Event('beforeunload',{cancelable:true});second.tab.dispatchEvent(clean);expect(clean.defaultPrevented).toBe(false);
  });
});

describe('inquiry navigation lifecycle',()=>{
  it('never turns a pending SPA preparation into Astro full-document fallback',()=>{
    const page=new EventTarget(),tab=new EventTarget(),save=vi.fn();let sending=true;
    const guard=bindInquiryNavigation({page,tab,hasDraft:()=>true,isSending:()=>sending,save});
    const busy=new Event('astro:before-preparation',{cancelable:true});page.dispatchEvent(busy);
    expect(busy.defaultPrevented).toBe(false);expect(save).toHaveBeenCalledOnce();
    sending=false;const ready=new Event('astro:before-preparation',{cancelable:true});page.dispatchEvent(ready);
    expect(ready.defaultPrevented).toBe(false);expect(save).toHaveBeenCalledTimes(2);guard.dispose();
  });
  it('warns on document unload for a dirty draft and releases both listeners on cleanup',()=>{
    const page=new EventTarget(),tab=new EventTarget(),save=vi.fn();let dirty=false;
    const guard=bindInquiryNavigation({page,tab,hasDraft:()=>dirty,isSending:()=>false,save});
    const unload=()=>{const event=new Event('beforeunload',{cancelable:true});Object.defineProperty(event,'returnValue',{value:'unchanged',writable:true});tab.dispatchEvent(event);return event;};
    expect(unload().defaultPrevented).toBe(false);dirty=true;guard.refresh();expect(unload().defaultPrevented).toBe(true);
    dirty=false;guard.refresh();expect(unload().defaultPrevented).toBe(false);
    dirty=true;guard.refresh();guard.dispose();expect(unload().defaultPrevented).toBe(false);
    page.dispatchEvent(new Event('astro:before-preparation',{cancelable:true}));expect(save).not.toHaveBeenCalled();
  });
  it('does not override another guard that already cancelled navigation',()=>{
    const page=new EventTarget(),save=vi.fn();
    const guard=bindInquiryNavigation({page,tab:new EventTarget(),hasDraft:()=>true,isSending:()=>true,save});
    const event=new Event('astro:before-preparation',{cancelable:true});event.preventDefault();page.dispatchEvent(event);
    expect(save).not.toHaveBeenCalled();guard.dispose();
  });
});
