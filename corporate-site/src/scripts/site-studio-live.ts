import { normalizeStudioPage, validateStudioEntries, type StudioEntry, type StudioKind } from '../lib/site-studio-contract';

const editableTags=new Set(['H1','H2','H3','H4','H5','H6','P','SPAN','STRONG','EM','SMALL','A','LI','FIGCAPTION','BLOCKQUOTE','LABEL','B','I','IMG']);
const ignore='form, button, input, select, textarea, [contenteditable], astro-island, [data-knaba-widget]';
const isPreview=()=>new URLSearchParams(location.search).get('knaba_studio_preview')==='1';
let generation=0;
let hovered:HTMLElement|null=null;
let editorBound=false;

function apply(entries:StudioEntry[]){
  for(const entry of entries){
    if(entry.selector==='@title'){
      document.title=entry.value;
      document.querySelector('meta[property="og:title"]')?.setAttribute('content',entry.value);
      continue;
    }
    if(entry.selector==='@description'){
      document.querySelector('meta[name="description"]')?.setAttribute('content',entry.value);
      document.querySelector('meta[property="og:description"]')?.setAttribute('content',entry.value);
      continue;
    }
    const target=document.querySelector(entry.selector);
    if(!(target instanceof HTMLElement)) continue;
    if(entry.kind==='text' && target.childElementCount===0 && editableTags.has(target.tagName) && target.tagName!=='IMG') target.textContent=entry.value;
    if(entry.kind==='href' && target instanceof HTMLAnchorElement) target.setAttribute('href',entry.value);
    if(entry.kind==='src' && target instanceof HTMLImageElement) target.setAttribute('src',entry.value);
    if(entry.kind==='alt' && target instanceof HTMLImageElement) target.alt=entry.value;
    if(entry.kind==='color') target.style.color=entry.value;
  }
}
function selectorFor(node:Element):string|null{
  const main=document.querySelector('#main');
  if(!main || !main.contains(node)) return null;
  const segments:string[]=[];
  let cursor:Element|null=node;
  while(cursor && cursor!==main){
    const parent:Element|null=cursor.parentElement;
    if(!parent || segments.length>9) return null;
    const same=Array.from(parent.children).filter(item=>item.tagName===cursor!.tagName);
    const position=same.indexOf(cursor)+1;
    if(position<1 || position>99) return null;
    segments.unshift(cursor.tagName.toLowerCase()+':nth-of-type('+position+')');
    cursor=parent;
  }
  return '#main > '+segments.join(' > ');
}
function editable(target:EventTarget|null):HTMLElement|null{
  let element=target instanceof Element?target:null;
  const main=document.querySelector('#main');
  while(element && main?.contains(element)){
    if(element.matches(ignore) || element.closest(ignore)) return null;
    const richLink=element instanceof HTMLAnchorElement &&
      element.children.length>0 && [...element.children].every(child=>child instanceof SVGElement) &&
      Boolean(element.textContent?.trim());
    if(element instanceof HTMLElement && editableTags.has(element.tagName) &&
      (element.tagName==='IMG' || richLink || (element.children.length===0 && Boolean(element.textContent?.trim())))) {
      const key=selectorFor(element);
      if(key) {
        try{
          const chosen=element instanceof HTMLImageElement?'src':richLink?'href':'text';
          const value=element instanceof HTMLImageElement?(element.getAttribute('src')||''):
            richLink?(element.getAttribute('href')||''):(element.textContent||'');
          validateStudioEntries([{selector:key,kind:chosen,value}]);
          return element;
        }
        catch{return null;}
      }
    }
    element=element.parentElement;
  }
  return null;
}
function select(element:HTMLElement){
  const selector=selectorFor(element);
  if(!selector) return;
  const isImage=element instanceof HTMLImageElement;
  const richLink=element instanceof HTMLAnchorElement && element.children.length>0;
  window.parent.postMessage({
    type:'knaba:studio:select',page:location.pathname,selector,
    kind:isImage?'src':richLink?'href':'text' as StudioKind,tag:element.tagName.toLowerCase(),
    rich:richLink,value:isImage?element.getAttribute('src'):richLink?(element as HTMLAnchorElement).getAttribute('href'):element.textContent,
    href:element instanceof HTMLAnchorElement?element.getAttribute('href'):undefined,
    alt:isImage?element.alt:undefined
  },location.origin);
}
function attachPreview(){
  if(editorBound) return;
  editorBound=true;
  const style=document.createElement('style');
  style.textContent='body[data-knaba-studio-frame] .knaba-edit-hover{outline:3px solid #0b9275!important;outline-offset:3px!important;cursor:crosshair!important}';
  document.head.append(style);
  document.body.setAttribute('data-knaba-studio-frame','');
  document.addEventListener('pointerover',event=>{
    if(!isPreview())return;
    const next=editable(event.target);
    if(hovered===next)return;
    hovered?.classList.remove('knaba-edit-hover');
    hovered=next;
    hovered?.classList.add('knaba-edit-hover');
  },true);
  document.addEventListener('click',event=>{
    if(!isPreview())return;
    const target=editable(event.target);
    if(!target)return;
    event.preventDefault();event.stopImmediatePropagation();
    select(target);
  },true);
  window.addEventListener('message',event=>{
    if(!isPreview()||event.origin!==location.origin||event.source!==window.parent)return;
    const data=event.data as {type?:string;page?:string;entries?:unknown};
    if(data?.type!=='knaba:studio:apply'||data.page!==location.pathname)return;
    try { apply(validateStudioEntries(data.entries)); } catch { /* Never execute untrusted draft data. */ }
  });
  window.parent.postMessage({type:'knaba:studio:ready',page:location.pathname},location.origin);
}
async function publishedContent(){
  const ticket=++generation;
  if(isPreview()) {attachPreview();return;}
  let page:string;
  try{page=normalizeStudioPage(location.pathname);}catch{return;}
  try{
    const result=await fetch('/api/studio/published?page='+encodeURIComponent(page),{
      credentials:'same-origin',headers:{'Accept':'application/json'},cache:'default'
    });
    if(!result.ok || ticket!==generation || location.pathname!==page)return;
    const data=await result.json() as {entries?:unknown};
    apply(validateStudioEntries(data.entries));
  }catch{ /* A public site remains usable when D1 or Site Studio is unavailable. */ }
}
export function initializeSiteStudioLive(){
  void publishedContent();
  document.addEventListener('astro:page-load',()=>void publishedContent());
}
