import de from '../data/template-locales/template-de.json?url&no-inline';
import en from '../data/template-locales/template-en.json?url&no-inline';
import pl from '../data/template-locales/template-pl.json?url&no-inline';
import lt from '../data/template-locales/template-lt.json?url&no-inline';
import ru from '../data/template-locales/template-ru.json?url&no-inline';
import uk from '../data/template-locales/template-uk.json?url&no-inline';

const locales={de,en,pl,lt,ru,uk};
type Locale=keyof typeof locales;
type Template={digest:string;name:string;version:string;author:string;license:string;builtin:boolean};
type State={version:number;activeDigest:string|null;draftDigest:string|null;templates:Template[];history:{revision:number;digest:string|null;action:string;createdAt:string}[]};
type Pending={path:string;payload:string};
const endpoint='/api/studio/templates';
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const locale=(v:string):Locale=>Object.hasOwn(locales,v)?v as Locale:'de';
export class TemplateRequestError extends Error{constructor(readonly status:number,message=''){super(message);}}
export function validateTemplateState(v:unknown):State{
  const s=v as State;
  if(!s||!Number.isSafeInteger(s.version)||s.version<0||!Array.isArray(s.templates)||s.templates.length>60||!Array.isArray(s.history)||s.history.length>100||
    ![s.activeDigest,s.draftDigest].every(x=>x===null||digest(x))||s.templates.some(x=>!x||!digest(x.digest)||typeof x.builtin!=='boolean'||![x.name,x.version,x.author,x.license].every(t=>typeof t==='string'&&t.length<=200))||
    s.history.some(x=>!x||!Number.isSafeInteger(x.revision)||x.revision<0||!(x.digest===null||digest(x.digest))||typeof x.action!=='string'||typeof x.createdAt!=='string'))throw new TemplateRequestError(0);
  return s;
}
async function request(path:string,payload?:string):Promise<unknown>{
  const response=await fetch(endpoint+path,{method:payload===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
    headers:payload===undefined?{'Accept':'application/json'}:{'Content-Type':'application/json','Accept':'application/json','X-Knaba-Request':'portal-v1'},body:payload,signal:AbortSignal.timeout(15000)});
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw new TemplateRequestError(response.status,typeof value?.error?.message==='string'?value.error.message:'');
  if(path==='/upload'){
    if(!digest(value?.template?.digest)||typeof value?.duplicate!=='boolean')throw new TemplateRequestError(0);
    return value;
  }
  return validateTemplateState(value);
}
/** Retain exact bytes after ambiguous failure; only explicit client rejection clears them. */
export function createTemplateMutations(send:(path:string,payload:string)=>Promise<unknown>=request){
  let pending:Pending|null=null,running=false;
  async function dispatch(){
    if(running||!pending)throw new TemplateRequestError(0,'busy');
    running=true;
    try{const result=await send(pending.path,pending.payload);pending=null;return result;}
    catch(error){if(error instanceof TemplateRequestError&&error.status>=400&&error.status<500)pending=null;throw error;}
    finally{running=false;}
  }
  return {snapshot:()=>({pending:pending?{...pending}:null,running}),retry:dispatch,
    run:(path:string,body:Record<string,unknown>)=>{if(pending||running)return Promise.reject(new TemplateRequestError(0,'pending'));pending={path,payload:JSON.stringify(body)};return dispatch();}};
}
function mount(){
  const found=document.querySelector<HTMLElement>('#template-manager');
  if(!found||found.dataset.mounted)return;
  const root=found;
  root.dataset.mounted='true';
  const life=new AbortController(),events={signal:life.signal};
  const el=<T extends HTMLElement>(name:string)=>root.querySelector<T>('[data-'+name+']')!;
  const lang=el<HTMLSelectElement>('language'),catalogue=el<HTMLSelectElement>('catalogue'),history=el<HTMLSelectElement>('history'),file=el<HTMLInputElement>('file'),confirm=el<HTMLInputElement>('confirm'),frame=el<HTMLIFrameElement>('preview');
  let words=JSON.parse(root.dataset.copy||'{}') as Record<string,string>,state:State|null=null,busy=false,langAttempt=0;
  const mutations=createTemplateMutations();
  const tell=(key:string)=>{el('status').textContent=words[key]||key;};
  const error=(message:string)=>{el('error').textContent=message;el('error').hidden=!message;};
  const alive=()=>!life.signal.aborted;
  function controls(){
    const locked=busy||!state||Boolean(mutations.snapshot().pending);
    for(const node of root.querySelectorAll<HTMLButtonElement>('[data-mutate]'))node.disabled=locked;
    for(const node of [catalogue,history,file,confirm])node.disabled=locked;
    el<HTMLButtonElement>('refresh').disabled=busy;
    el<HTMLButtonElement>('retry').hidden=!mutations.snapshot().pending;
    el<HTMLButtonElement>('retry').disabled=busy;
    el<HTMLButtonElement>('activate').disabled=locked||!confirm.checked||!state?.draftDigest||catalogue.value!==state.draftDigest;
    el<HTMLButtonElement>('rollback').disabled=locked||!confirm.checked||!history.value;
    el<HTMLButtonElement>('save').disabled=locked||!catalogue.value||catalogue.value===state?.draftDigest;
    el<HTMLButtonElement>('upload').disabled=locked||!file.files?.length;
  }
  function preview(){
    if(!state||!digest(catalogue.value))return;
    const selected=state.templates.find(t=>t.digest===catalogue.value);
    el('details').textContent=selected?[selected.author,selected.version,selected.license,words[selected.builtin?'builtin':'uploaded']].join(' · '):'';
    el('digest').textContent=catalogue.value;
    const language=locale(el<HTMLSelectElement>('preview-language').value);
    frame.src=endpoint+'/preview?'+new URLSearchParams({digest:catalogue.value,page:language==='de'?'/':'/'+language+'/'});
    const width=el<HTMLSelectElement>('width').value;frame.style.maxWidth=width==='full'?'100%':width+'px';
  }
  function render(preferred=catalogue.value){
    if(!state){catalogue.replaceChildren();history.replaceChildren();frame.removeAttribute('src');el('current').textContent='';el('details').textContent='';el('digest').textContent='';controls();return;}
    const name=(id:string|null)=>state?.templates.find(t=>t.digest===id)?.name||words.original;
    el('current').textContent=words.active+': '+name(state.activeDigest)+' · '+words.draft+': '+(state.draftDigest?name(state.draftDigest):'—')+' · v'+state.version;
    catalogue.replaceChildren(...state.templates.map(t=>new Option(t.name+' · '+t.version+(t.digest===state!.activeDigest?' ✓':''),t.digest)));
    catalogue.value=state.templates.some(t=>t.digest===preferred)?preferred:state.draftDigest||state.activeDigest||state.templates[0]?.digest||'';
    history.replaceChildren(new Option(words.chooseRevision,''),new Option('#0 · '+words.original,'0'),...state.history.map(h=>new Option('#'+h.revision+' · '+name(h.digest)+' · '+h.createdAt,String(h.revision))));
    confirm.checked=false;preview();controls();
  }
  async function refresh(){
    if(busy)return;
    busy=true;controls();error('');tell('loading');
    try{const s=await request('');if(alive()){state=s as State;render();tell(mutations.snapshot().pending?'ambiguous':'loaded');el('login').hidden=true;}}
    catch(problem){if(alive())await showError(problem);}
    finally{busy=false;if(alive())controls();}
  }
  async function showError(problem:unknown){
    const code=problem instanceof TemplateRequestError?problem.status:0;
    if(code===401||code===403){state=null;render();el('login').hidden=code!==401;}
    error(words[code===401?'unauthenticated':code===403?'denied':code===409?'conflict':mutations.snapshot().pending?'ambiguous':'failed']+(problem instanceof TemplateRequestError&&problem.message&&code>=400?' '+problem.message:''));
    tell('failed');
    if(code===409){try{state=await request('') as State;if(alive())render();}catch{state=null;if(alive())render();}}
  }
  async function perform(path:string,body:Record<string,unknown>,retry=false){
    if(busy)return;
    busy=true;controls();error('');tell('working');
    try{
      const result=await (retry?mutations.retry():mutations.run(path,body));
      if(!alive())return;
      if((result as {template?:Template}).template){const item=(result as {template:Template}).template;state=await request('') as State;if(!alive())return;file.value='';render(item.digest);}
      else{state=result as State;render();}
      tell('saved');
    }catch(problem){if(alive())await showError(problem);}
    finally{busy=false;if(alive())controls();}
  }
  async function translate(value:string){
    const next=locale(value),attempt=++langAttempt;
    try{
      const response=await fetch(locales[next],{credentials:'omit',cache:'force-cache',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error();
      const data=await response.json() as Record<string,unknown>;
      if(Object.keys(words).some(key=>typeof data[key]!=='string'||!(data[key] as string).trim())||Object.keys(data).length!==Object.keys(words).length)throw Error();
      if(!alive()||attempt!==langAttempt)return;
      words=data as Record<string,string>;root.lang=next;lang.value=next;
      for(const node of root.querySelectorAll<HTMLElement>('[data-word]'))node.textContent=words[node.dataset.word!]||'';
      lang.setAttribute('aria-label',words.language);frame.title=words.preview;
      render();tell(mutations.snapshot().pending?'ambiguous':state?'loaded':'loading');
    }catch{if(alive()&&attempt===langAttempt){lang.value=root.lang;error(words.languageError);}}
  }
  lang.addEventListener('change',()=>void translate(lang.value),events);
  catalogue.addEventListener('change',()=>{confirm.checked=false;preview();controls();},events);
  for(const name of ['preview-language','width'])el(name).addEventListener('change',preview,events);
  for(const node of [history,confirm,file])node.addEventListener('change',controls,events);
  el('refresh').addEventListener('click',()=>void refresh(),events);
  el('retry').addEventListener('click',()=>void perform('',{},true),events);
  el('save').addEventListener('click',()=>{if(state)void perform('/select',{digest:catalogue.value,version:state.version});},events);
  el('activate').addEventListener('click',()=>{if(state&&confirm.checked&&catalogue.value===state.draftDigest)void perform('/activate',{digest:catalogue.value,version:state.version,confirm:'PUBLISH',idempotencyKey:crypto.randomUUID()});},events);
  el('rollback').addEventListener('click',()=>{if(state&&confirm.checked&&history.value)void perform('/rollback',{revision:Number(history.value),version:state.version,confirm:'ROLLBACK',idempotencyKey:crypto.randomUUID()});},events);
  el('upload').addEventListener('click',async()=>{
    const selected=file.files?.[0];if(!selected||busy||mutations.snapshot().pending)return;
    if(!selected.size||selected.size>65536||!selected.name.toLowerCase().endsWith('.zip')){error(words.fileError);return;}
    busy=true;controls();
    try{const bytes=new Uint8Array(await selected.arrayBuffer());if(!alive())return;busy=false;let raw='';for(const b of bytes)raw+=String.fromCharCode(b);void perform('/upload',{zip:btoa(raw)});}
    catch{busy=false;if(alive()){error(words.failed);controls();}}
  },events);
  window.addEventListener('beforeunload',event=>{if(busy||mutations.snapshot().pending)event.preventDefault();},events);
  // The existing Astro router falls back to native navigation, allowing the
  // beforeunload guard to protect an uncertain in-flight action.
  document.addEventListener('astro:before-preparation',event=>{if(busy||mutations.snapshot().pending)event.preventDefault();},events);
  document.addEventListener('astro:before-swap',()=>life.abort(),{once:true,signal:life.signal});
  const preferred=locale(new URL(location.href).searchParams.get('lang')||navigator.language.slice(0,2));
  el<HTMLSelectElement>('preview-language').value=preferred;
  void refresh();if(preferred!=='de')void translate(preferred);
}
if(typeof document!=='undefined'){document.addEventListener('astro:page-load',mount);mount();}
