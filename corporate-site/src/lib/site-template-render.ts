import { parse, serialize } from 'parse5';
import { templateCss, validateSiteTemplate, type SiteTemplate } from './site-template-contract.ts';

/** Trusted CSS presets only. Preserve exact Astro/Studio DOM and source selectors. */
export function renderTemplateHtml(html:string,input:SiteTemplate):string{
  const template=validateSiteTemplate(input),css=templateCss(template);
  if(!css)return html;
  if(html.length>400_000)throw new Error('Template page too large');
  const doc=parse(html,{sourceCodeLocationInfo:true});
  const nodes: any[]=[];const stack:any[]=[doc];
  while(stack.length){const node=stack.pop();nodes.push(node);stack.push(...(node.childNodes??[]));}
  const head=nodes.find(n=>n.tagName==='head'),body=nodes.find(n=>n.tagName==='body');
  const end=head?.sourceCodeLocation?.endTag?.startOffset,start=body?.sourceCodeLocation?.startTag?.endOffset;
  if(!Number.isInteger(end)||!Number.isInteger(start))throw new Error('Template page structure invalid');
  const marker=body.attrs.some((attr:any)=>attr.name==='data-public-design')?'':' data-public-design="template"';
  const patches=[{at:end,text:'<style data-knaba-template="'+template.id+'">'+css+'</style>'},{at:start-1,text:marker+' data-knaba-template="'+template.id+'"'}];
  for(const patch of patches.sort((a,b)=>b.at-a.at))html=html.slice(0,patch.at)+patch.text+html.slice(patch.at);
  return html;
}

/** Preview has no actions, script, private session bridge or external navigation. */
export function renderTemplatePreview(html:string,template:SiteTemplate):string{
  const doc:any=parse(renderTemplateHtml(html,template));
  const forbidden=new Set(['script','iframe','object','embed','base','portal']);
  function clean(node:any){
    node.childNodes=(node.childNodes??[]).filter((child:any)=>{
      if(forbidden.has(child.tagName))return false;
      if(child.tagName==='meta'&&child.attrs?.some((a:any)=>a.name==='http-equiv'))return false;
      return true;
    });
    if(node.attrs){
      node.attrs=node.attrs.filter((a:any)=>!a.name.startsWith('on')&&!['action','formaction','srcdoc','nonce','integrity','ping','target','download'].includes(a.name));
      if(node.tagName==='a')node.attrs=node.attrs.filter((a:any)=>a.name!=='href');
      if(node.tagName==='link')node.attrs=node.attrs.filter((a:any)=>a.name!=='href'||/^\/_astro\/[A-Za-z0-9_.-]+\.css$/.test(a.value));
      for(const attr of node.attrs){if(['src','poster'].includes(attr.name)&&(!attr.value.startsWith('/')||attr.value.startsWith('//')))attr.value='';}
      if(['input','button','select','textarea'].includes(node.tagName))node.attrs.push({name:'disabled',value:''});
    }
    for(const child of node.childNodes)clean(child);
    if(node.content)clean(node.content);
  }
  clean(doc);return serialize(doc);
}
