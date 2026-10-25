/**
 * Fail-closed VPS-only server-side SEO rendering of published Site Studio fields.
 * Does not parse or modify arbitrary body HTML or executable scripts.
 * The source of truth is an already published, owner-authorized studio_pages row.
 */
const MAX_JSON=80*780;
const names=new Set(['@title','@description']);
export const escapeHtml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function normalized(row){
  if(!row || !Number.isSafeInteger(row.published_version) || row.published_version<1 ||
    typeof row.published_json!=='string' || row.published_json.length>MAX_JSON)return null;
  let data;
  try{data=JSON.parse(row.published_json);}catch{return null;}
  if(!Array.isArray(data)||data.length>80)return null;
  const edits=new Map();
  for(const part of data){
    if(!part || typeof part!=='object' || Array.isArray(part))return null;
    if(!names.has(part.selector))continue;
    if(part.kind!=='text'||typeof part.value!=='string'||edits.has(part.selector)||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(part.value))return null;
    const length=part.selector==='@title'?100:250;
    if(part.value.length>length || (part.selector==='@title'&&!part.value.trim()))return null;
    edits.set(part.selector,part.value);
  }
  return edits;
}
function replaceExactlyOne(html,matcher,body){
  let count=0;
  const result=html.replace(matcher,()=>{count++;return body;});
  return count===1?result:null;
}
function meta(html,qualifier,value){
  const pattern=new RegExp('<meta\\s+'+qualifier+'\\s+content="[^"]*"\\s*/?>','g');
  return replaceExactlyOne(html,pattern,'<meta '+qualifier+' content="'+escapeHtml(value)+'">');
}
// Older release snapshots may not contain Twitter tags; synchronize them when present,
// while keeping the existing atomic fail-closed behavior for duplicated or malformed tags.
function optionalMeta(html,qualifier,value){
  const exists=new RegExp('<meta\\s+'+qualifier+'\\s+content=', 'g').test(html);
  return exists?meta(html,qualifier,value):html;
}
export function renderPublishedSeo(html,row){
  if(typeof html!=='string'||html.length>400000)return html;
  const edits=normalized(row);
  if(!edits?.size)return html;
  let candidate=html;
  const title=edits.get('@title');
  const desc=edits.get('@description');
  if(title!==undefined){
    candidate=replaceExactlyOne(candidate,/<title>[^<]*<\/title>/g,'<title>'+escapeHtml(title)+'</title>');
    if(candidate===null)return html;
    candidate=meta(candidate,'property="og:title"',title);
    if(candidate===null)return html;
    candidate=optionalMeta(candidate,'name="twitter:title"',title);
    if(candidate===null)return html;
  }
  if(desc!==undefined && desc!==''){
    candidate=meta(candidate,'name="description"',desc);
    if(candidate===null)return html;
    candidate=meta(candidate,'property="og:description"',desc);
    if(candidate===null)return html;
    candidate=optionalMeta(candidate,'name="twitter:description"',desc);
    if(candidate===null)return html;
  }
  return candidate;
}
export function editablePublicHtmlPath(path){
  if(typeof path!=='string'||path.length>180||
    !/^\/(?:[a-z0-9-]+\/){0,4}$/.test(path))return false;
  const restricted=new Set(['api','studio','crm','konto','postfach','portal','admin','assets','images','illustrations','_astro','login','logout']);
  return !path.split('/').some(p=>restricted.has(p));
}
