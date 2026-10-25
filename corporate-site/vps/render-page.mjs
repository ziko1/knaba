import {parse} from 'parse5';
import {validateStudioEntries} from '../src/lib/site-studio-contract.ts';
import {escapeHtml,renderPublishedSeo} from './seo.mjs';

/**
 * Surgical parse5 source-location based edits. No reserialization of Astro
 * islands/scripts. Only editor-approved leaf nodes and attributes are touched.
 * The compiled module is bundled with the exact pinned HTML parser for VPS.
 */
function findMain(document){
  const stack=[document];let found=null;
  while(stack.length){
    const node=stack.pop();
    if(node.tagName==='main' && node.attrs?.some(x=>x.name==='id'&&x.value==='main')){
      if(found)return null;
      found=node;
    }
    for(const child of node.childNodes||[])stack.push(child);
  }
  return found;
}
function findSelected(main,selector){
  if(!selector.startsWith('#main > '))return null;
  let current=main;
  for(const chunk of selector.slice('#main > '.length).split(' > ')){
    const match=/^([a-z][a-z0-9-]*):nth-of-type\(([1-9][0-9]?)\)$/.exec(chunk);
    if(!match)return null;
    const children=(current.childNodes||[]).filter(x=>x.tagName===match[1]);
    current=children[Number(match[2])-1];
    if(!current)return null;
  }
  return current;
}
function attrPatch(html,node,name,value){
  const location=node.sourceCodeLocation?.startTag;
  if(!location)return null;
  const replace=name+'="'+escapeHtml(value)+'"';
  const attr=location.attrs?.[name];
  if(attr && Number.isInteger(attr.startOffset)&&Number.isInteger(attr.endOffset))
    return {start:attr.startOffset,end:attr.endOffset,value:replace};
  let offset=location.endOffset-1;
  if(html[offset]!=='>' || offset<=location.startOffset)return null;
  if(html[offset-1]==='/')offset--;
  return {start:offset,end:offset,value:' '+replace};
}
function nodePatch(html,node,edit){
  const loc=node.sourceCodeLocation;
  if(!loc?.startTag)return null;
  if(edit.kind==='text'){
    // Never rewrite rich markup, Astro islands, inline icons or scripts.
    if(!loc.endTag || (node.childNodes||[]).some(c=>Boolean(c.tagName)))return null;
    return {start:loc.startTag.endOffset,end:loc.endTag.startOffset,value:escapeHtml(edit.value)};
  }
  if(edit.kind==='href' && node.tagName==='a')return attrPatch(html,node,'href',edit.value);
  if(edit.kind==='src' && node.tagName==='img')return attrPatch(html,node,'src',edit.value);
  if(edit.kind==='alt' && node.tagName==='img')return attrPatch(html,node,'alt',edit.value);
  return null;
}
const styleProperties={color:'color',background:'background-color',padding:'padding',fontSize:'font-size'};
function stylePatch(html,node,entries){
  const raw=node.attrs?.find(x=>x.name==='style')?.value||'';
  const managed=new Set(Object.values(styleProperties));
  const untouched=raw.split(';').map(x=>x.trim()).filter(declaration=>{
    const key=/^([a-z-]+)\s*:/.exec(declaration)?.[1]?.toLowerCase();
    return declaration && (!key || !managed.has(key));
  });
  const authored=entries.map(edit=>{
    const property=styleProperties[edit.kind];
    return property+':'+(edit.kind==='padding'||edit.kind==='fontSize'?edit.value+'px':edit.value);
  });
  return attrPatch(html,node,'style',[...untouched,...authored].join(';'));
}
export function renderPublishedPage(html,row){
  if(typeof html!=='string'||html.length>400000 || !row || !Number.isInteger(row.published_version) ||
    row.published_version<1 || typeof row.published_json!=='string' || row.published_json.length>64000)return html;
  let edits;
  try{edits=validateStudioEntries(JSON.parse(row.published_json));}catch{return html;}
  const bodyEdits=edits.filter(e=>e.selector.startsWith('#main > '));
  let result=html;
  if(bodyEdits.length){
    let document;
    try{document=parse(html,{sourceCodeLocationInfo:true});}catch{return html;}
    const main=findMain(document);
    if(!main)return html;
    const patches=[];
    const stylesBySelector=new Map();
    for(const edit of bodyEdits){
      const node=findSelected(main,edit.selector);
      if(!node)continue;
      if(Object.hasOwn(styleProperties,edit.kind)){
        if(!stylesBySelector.has(edit.selector))stylesBySelector.set(edit.selector,{node,entries:[]});
        stylesBySelector.get(edit.selector).entries.push(edit);
        continue;
      }
      const patch=nodePatch(html,node,edit);
      if(patch && Number.isInteger(patch.start) && Number.isInteger(patch.end) &&
        patch.start>=0 && patch.end>=patch.start && patch.end<=html.length)patches.push(patch);
    }
    for(const {node,entries} of stylesBySelector.values()){
      const patch=stylePatch(html,node,entries);
      if(patch && Number.isInteger(patch.start) && Number.isInteger(patch.end) &&
        patch.start>=0 && patch.end>=patch.start && patch.end<=html.length)patches.push(patch);
    }
    patches.sort((a,b)=>b.start-a.start || b.end-a.end);
    for(let i=0;i<patches.length;i++){
      if(i>0 && patches[i].end>patches[i-1].start)return html; // overlapping edits fail closed
      result=result.slice(0,patches[i].start)+patches[i].value+result.slice(patches[i].end);
    }
  }
  return renderPublishedSeo(result,row);
}
