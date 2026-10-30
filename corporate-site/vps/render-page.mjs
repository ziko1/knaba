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
/** Keep this page's existing Article facts aligned with owner-published visible copy. */
function syncArticleMetadata(html){
  if(!/"@type"\s*:\s*"Article"/.test(html))return html;
  let document;
  try{document=parse(html,{sourceCodeLocationInfo:true});}catch{return html;}
  const main=findMain(document);
  if(!main)return html;
  const descendants=node=>{
    const result=[];const stack=[node];
    while(stack.length){const item=stack.pop();result.push(item);stack.push(...(item.childNodes||[]));}
    return result;
  };
  const attr=(node,name)=>node.attrs?.find(item=>item.name===name)?.value;
  const heads=descendants(document).filter(node=>node.tagName==='head');
  const headings=descendants(main).filter(node=>node.tagName==='h1');
  if(heads.length!==1||headings.length!==1)return html;
  const headNodes=descendants(heads[0]);
  const descriptions=headNodes.filter(node=>node.tagName==='meta'&&attr(node,'name')==='description');
  const canonicals=headNodes.filter(node=>node.tagName==='link'&&attr(node,'rel')==='canonical');
  if(descriptions.length!==1||canonicals.length!==1)return html;
  const content=node=>node.nodeName==='#text'?node.value:(node.childNodes||[]).map(content).join('');
  const headline=content(headings[0]).trim();
  const description=attr(descriptions[0],'content');
  const canonical=attr(canonicals[0],'href');
  if(!headline||!description||!canonical)return html;
  const patches=[];
  for(const script of headNodes.filter(node=>node.tagName==='script'&&attr(node,'type')==='application/ld+json')){
    const location=script.sourceCodeLocation;
    if(!location?.startTag||!location?.endTag)continue;
    let data;
    try{data=JSON.parse(content(script));}catch{continue;}
    const nodes=Array.isArray(data)?data:Array.isArray(data?.['@graph'])?data['@graph']:[data];
    let changed=false;
    for(const node of nodes){
      if(node?.['@type']!=='Article'||node.url!==canonical)continue;
      if(node.headline===headline&&node.description===description)continue;
      node.headline=headline;node.description=description;changed=true;
    }
    if(changed)patches.push({start:location.startTag.endOffset,end:location.endTag.startOffset,value:JSON.stringify(data).replace(/</g,'\\u003c')});
  }
  for(const patch of patches.sort((a,b)=>b.start-a.start))
    html=html.slice(0,patch.start)+patch.value+html.slice(patch.end);
  return html;
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
  result=renderPublishedSeo(result,row);
  return result===html?result:syncArticleMetadata(result);
}
