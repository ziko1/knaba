import {parse, type DefaultTreeAdapterTypes} from 'parse5';
import type {StudioEntry} from './site-studio-contract';

type Node=DefaultTreeAdapterTypes.Node;
type Element=DefaultTreeAdapterTypes.Element;
const children=(node:Node):Node[]=>'childNodes' in node?node.childNodes:[];
const element=(node:Node):node is Element=>'tagName' in node;
const attribute=(node:Element,name:string)=>node.attrs.find(item=>item.name===name)?.value;
const ignored=new Set(['form','button','input','select','textarea','astro-island']);
const htmlNamespace='http://www.w3.org/1999/xhtml';

/** Server-only structural check against trusted build HTML, never user HTML.
 * Positional selectors cannot detect a moved node with the same structure.
 * Stable content IDs remain a prerequisite for changing the template tree.
 */
export function studioMappingCompatible(html:string,entries:StudioEntry[],parsed?:DefaultTreeAdapterTypes.Document):boolean{
  if(typeof html!=='string'||html.length>400_000||new TextEncoder().encode(html).byteLength>400_000)return false;
  // The source renderer supplies its exact same parsed HTML to avoid doing the
  // expensive parse twice. The API validator has no parsed tree and builds one.
  const document=parsed??parse(html,{sourceCodeLocationInfo:true}),all:Element[]=[],queue:Node[]=[document];
  while(queue.length){const node=queue.pop()!;if(element(node))all.push(node);queue.push(...children(node));}
  const mains=all.filter(node=>node.tagName==='main'&&attribute(node,'id')==='main');
  if(mains.length!==1)return false;
  const metas=(key:string,value:string)=>all.filter(node=>node.tagName==='meta'&&attribute(node,key)===value);
  for(const entry of entries){
    if(entry.selector==='@title'){
      if(all.filter(node=>node.tagName==='title').length!==1||metas('property','og:title').length!==1||metas('name','twitter:title').length>1)return false;
      continue;
    }
    if(entry.selector==='@description'){
      if(metas('name','description').length!==1||metas('property','og:description').length!==1||metas('name','twitter:description').length>1)return false;
      continue;
    }
    let target:Element|undefined=mains[0];
    for(const part of entry.selector.slice('#main > '.length).split(' > ')){
      const match=/^([a-z][a-z0-9-]*):nth-of-type\(([1-9][0-9]?)\)$/.exec(part);
      if(!match||!target)return false;
      const next:Element|undefined=children(target).filter(element).filter(node=>node.tagName===match[1])[Number(match[2])-1];
      if(!next||next.namespaceURI!==htmlNamespace||ignored.has(next.tagName)||next.attrs.some(item=>item.name==='contenteditable'||item.name==='data-knaba-widget'))return false;
      target=next;
    }
    if(!target?.sourceCodeLocation?.startTag)return false;
    if(entry.kind==='text'&&(!target.sourceCodeLocation.endTag||children(target).some(element)))return false;
    if(entry.kind==='href'&&target.tagName!=='a')return false;
    if((entry.kind==='src'||entry.kind==='alt')&&target.tagName!=='img')return false;
  }
  return true;
}
