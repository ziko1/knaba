import {parse} from 'parse5';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {KNABA_PUBLIC_ORIGINS} from './verify-public-live.mjs';

// Complements the fixed-route release gate; read-only HTTP navigation inventory.
// Never submit forms, use authenticated cookies or follow redirects across origins.
const MAX_PAGES=240;
const MAX_ASSETS=350;
const MAX_SITEMAP_BYTES=550000;
const MAX_HTML_BYTES=750000;
const EXTENSION=/\.(?:avif|css|gif|ico|jpe?g|js|json|map|pdf|png|svg|txt|webp|woff2?|xml|zip)$/i;
const IGNORE_PROTOCOL=/^(?:mailto:|tel:|sms:|data:|blob:)/i;

function attr(node,name) {
  return node.attrs?.find(item=>item.name===name)?.value;
}
function descend(node,visit) {
  visit(node);
  for(const child of node.childNodes||[]) descend(child,visit);
  if(node.content) descend(node.content,visit);
}
function resolved(raw,base) {
  if(typeof raw!=='string'||!raw.trim()||IGNORE_PROTOCOL.test(raw.trim())) return null;
  try{return new URL(raw.trim(),base)}catch{return null}
}
function localPath(url) {
  return url.origin+url.pathname;
}
function boundedUrl(value) {
  try { const u=new URL(value); return u.pathname; }catch { return String(value).slice(0,90); }
}
function normalizeOrigin({mode,testUrl}) {
  if(!Object.hasOwn(KNABA_PUBLIC_ORIGINS,mode))throw TypeError('INVALID_AUDIT_MODE');
  if(testUrl===undefined)return KNABA_PUBLIC_ORIGINS[mode];
  if(typeof testUrl!=='string')throw TypeError('INVALID_AUDIT_ORIGIN');
  let u;
  try{u=new URL(testUrl)}catch{throw TypeError('INVALID_AUDIT_ORIGIN')}
  if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||
    !u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash)
    throw TypeError('INVALID_AUDIT_ORIGIN');
  return u.origin;
}
async function readBounded(response,maxBytes) {
  if(!response.body)return '';
  const reader=response.body.getReader();
  const chunks=[];let bytes=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>maxBytes)throw Error('BODY_LIMIT');
      chunks.push(Buffer.from(value));
    }
  }finally{await reader.cancel().catch(()=>{})}
  return Buffer.concat(chunks).toString('utf8');
}
async function pool(items,count,task) {
  let next=0;
  const output=new Array(items.length);
  async function runner(){
    for(;;){
      const i=next++;
      if(i>=items.length)return;
      output[i]=await task(items[i]);
    }
  }
  await Promise.all(Array.from({length:Math.min(items.length,count)},runner));
  return output;
}
function docInfo(html) {
  const ids=new Set(), links=[],assets=[], canonical=[];
  let lang='',heading=0,title=0,description=0,missingAlts=0;
  descend(parse(html),node=>{
    if(!node.tagName)return;
    const id=attr(node,'id');
    if(id) ids.add(id);
    if(node.tagName==='html')lang=attr(node,'lang')||'';
    if(node.tagName==='h1')heading++;
    if(node.tagName==='title')title++;
    if(node.tagName==='meta'&&attr(node,'name')?.toLowerCase()==='description')description++;
    if(node.tagName==='a') {
      const named=attr(node,'name');
      if(named)ids.add(named);
      const href=attr(node,'href');
      if(href!==undefined)links.push(href);
    }
    if(node.tagName==='link') {
      const rel=(attr(node,'rel')||'').toLowerCase();
      if(rel.includes('canonical'))canonical.push(attr(node,'href'));
      if(rel.includes('stylesheet')||['image','font','script'].includes(attr(node,'as')))assets.push(attr(node,'href'));
    }
    if(node.tagName==='img') {
      if(attr(node,'alt')===undefined)missingAlts++;
      assets.push(attr(node,'src'));
    }
    if(['script','source','video','audio'].includes(node.tagName))assets.push(attr(node,'src'));
    const srcset=attr(node,'srcset');
    if(srcset)assets.push(...srcset.split(',').map(item=>item.trim().split(/\s+/)[0]));
  });
  return {ids,links,assets,canonical,lang,heading,title,description,missingAlts};
}
function xmlLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m=>m[1].replaceAll('&amp;','&').trim());
}
export async function auditPublicLinks({
  mode='vsp', testUrl, fetchImpl=globalThis.fetch, timeoutMs=8000, expectedSitemapRoutes,
}={}) {
  const origin=normalizeOrigin({mode,testUrl});
  if(typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000||
    (expectedSitemapRoutes!==undefined&&(!Number.isInteger(expectedSitemapRoutes)||expectedSitemapRoutes<1||expectedSitemapRoutes>MAX_PAGES)))
    throw TypeError('INVALID_AUDIT_CONFIGURATION');

  const issues=[], docs=new Map(), targets=new Set(),assets=new Set(), fragments=[];
  const externalHosts=new Set();
  const issue=(code,page,target='')=>issues.push({code,page:boundedUrl(page),target:boundedUrl(target)});
  async function get(url,kind){
    try {
      const response=await fetchImpl(url,{method:'GET',redirect:'manual',cache:'no-store',
        signal:AbortSignal.timeout(timeoutMs),headers:{'user-agent':'KNABA-public-link-audit/1.0'}});
      const result={status:response.status,mime:(response.headers.get('content-type')||'').toLowerCase(),html:''};
      if(response.status===200&&kind!=='asset')result.html=await readBounded(response,kind==='sitemap'?MAX_SITEMAP_BYTES:MAX_HTML_BYTES);
      else await response.body?.cancel().catch(()=>{});
      return result;
    } catch(error){
      return {status:null,mime:'',html:'',error:error?.message==='BODY_LIMIT'?'BODY_LIMIT':'FETCH_FAILED'};
    }
  }
  const sitemap=await get(origin+'/sitemap.xml','sitemap');
  if(sitemap.status!==200||!sitemap.html)return {
    outcome:'BLOCKED',origin,scope:'PUBLIC_READ_ONLY',sitemapPages:0,extraPages:0,
    checkedPages:0,checkedAssets:0,issues:[{code:'SITEMAP_UNAVAILABLE',page:'/sitemap.xml',target:String(sitemap.status||sitemap.error)}],
  };
  const locs=xmlLocs(sitemap.html);
  const seeds=new Set();
  for(const raw of locs){
    const u=resolved(raw,origin);
    const canonicalOrigin=KNABA_PUBLIC_ORIGINS[mode];
    if(!u||(u.origin!==origin&&!(testUrl&&u.origin===canonicalOrigin))){
      issue('UNTRUSTED_SITEMAP_URL','/sitemap.xml',raw);continue;
    }
    // A static loopback build retains public canonical URLs in its sitemap.
    // Rewrite only their paths to the explicitly approved localhost preview.
    seeds.add(origin+u.pathname);
  }
  if(seeds.size!==locs.length)issue('DUPLICATE_OR_UNSAFE_SITEMAP','/sitemap.xml');
  if(expectedSitemapRoutes!==undefined&&seeds.size!==expectedSitemapRoutes)
    issue('SITEMAP_ROUTE_COUNT','/sitemap.xml',String(seeds.size)+' expected '+String(expectedSitemapRoutes));
  if(!seeds.size||seeds.size>MAX_PAGES)issue('SITEMAP_BOUNDS','/sitemap.xml',String(seeds.size));

  const queue=[...seeds].slice(0,MAX_PAGES);
  const seen=new Set(queue);
  let batches=0;
  while(queue.length) {
    const chunk=queue.splice(0,24);batches++;
    const data=await pool(chunk,6,url=>get(url,'page'));
    for(let i=0;i<chunk.length;i++){
      const url=chunk[i],result=data[i];
      if(result.status!==200||!result.mime.includes('text/html')||!result.html){
        issue('BAD_PAGE_STATUS',url,String(result.status||result.error));
        docs.set(url,{status:result.status,ids:new Set()});
        continue;
      }
      const info=docInfo(result.html);
      docs.set(url,{status:200,ids:info.ids});
      if(!['de','en','uk','ru'].includes(info.lang))issue('HTML_LANG',url,info.lang);
      if(info.heading!==1)issue('H1_COUNT',url,String(info.heading));
      if(info.title!==1)issue('TITLE_COUNT',url,String(info.title));
      if(info.description!==1)issue('META_DESCRIPTION_COUNT',url,String(info.description));
      if(info.missingAlts)issue('MISSING_IMG_ALT',url,String(info.missingAlts));
      if(info.canonical.length!==1)issue('CANONICAL_COUNT',url,String(info.canonical.length));
      else {
        const c=resolved(info.canonical[0],url);
        const expectedOrigin=KNABA_PUBLIC_ORIGINS[mode];
        if(!c||c.origin!==expectedOrigin||c.pathname!==new URL(url).pathname)
          issue('CANONICAL_MISMATCH',url,info.canonical[0]);
      }
      for(const raw of info.links) {
        if(!raw.trim()){issue('EMPTY_LINK',url);continue}
        if(raw.startsWith('javascript:')){issue('UNSAFE_JS_LINK',url);continue}
        const target=resolved(raw,url);
        if(!target)continue;
        if(['knaba.de','www.knaba.de'].includes(target.hostname)&&target.origin!==origin)
          issue('LEGACY_DOMAIN_LINK',url,raw);
        if(target.origin!==origin){externalHosts.add(target.hostname);continue}
        const dest=localPath(target);
        targets.add(dest);
        if(target.hash&&target.hash!=='#')fragments.push({from:url,to:dest,id:decodeURIComponent(target.hash.slice(1))});
        if(EXTENSION.test(target.pathname))assets.add(dest);
        else if(!seen.has(dest)&&!target.pathname.startsWith('/api/')&&!target.pathname.startsWith('/logout')) {
          seen.add(dest);
          if(seen.size>MAX_PAGES)issue('PAGE_LIMIT',url,dest);
          else queue.push(dest);
        }
      }
      for(const raw of info.assets){
        const target=resolved(raw,url);
        if(!target)continue;
        if(target.origin!==origin){issue('EXTERNAL_PAGE_ASSET',url,raw);continue}
        assets.add(localPath(target));
      }
    }
    if(batches>MAX_PAGES){issue('CRAWL_LOOP_LIMIT','/sitemap.xml');break}
  }
  for(const {from,to,id} of fragments){
    const dest=docs.get(to);
    if(dest?.status===200&&!dest.ids.has(id))issue('MISSING_FRAGMENT',from,to+'#'+id);
  }
  const assetList=[...assets];
  if(assetList.length>MAX_ASSETS)issue('ASSET_LIMIT','/sitemap.xml',String(assetList.length));
  const results=await pool(assetList.slice(0,MAX_ASSETS),6,url=>get(url,'asset'));
  for(let i=0;i<results.length;i++){
    const {status,mime,error}=results[i],url=assetList[i];
    if(status!==200){issue('BAD_ASSET_STATUS',url,String(status||error));continue}
    const ext=new URL(url).pathname.toLowerCase();
    if((ext.endsWith('.svg')&&!mime.includes('image/svg'))||
      (ext.endsWith('.css')&&!mime.includes('text/css'))||
      (ext.endsWith('.png')&&!mime.includes('image/png'))||
      (ext.endsWith('.webp')&&!mime.includes('image/webp'))||
      (ext.endsWith('.jpg')&&!mime.includes('image/jpeg'))||
      (ext.endsWith('.jpeg')&&!mime.includes('image/jpeg')))
      issue('BAD_ASSET_MIME',url,mime);
  }
  return {
    scope:'PUBLIC_READ_ONLY',mode,origin,outcome:issues.length?'FAIL':'PASS',
    sitemapPages:seeds.size,extraPages:Math.max(0,docs.size-seeds.size),
    checkedPages:docs.size,internalTargets:targets.size,checkedAssets:results.length,
    externalHosts:[...externalHosts].sort(),issues:issues.slice(0,150),
    issueCount:issues.length,issueListTruncated:issues.length>150,
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try{
    const expected=process.env.KNABA_EXPECT_SITEMAP_ROUTES;
    const result=await auditPublicLinks({
      mode:process.env.KNABA_RELEASE_MODE||'vsp',
      testUrl:process.env.KNABA_TEST_URL||undefined,
      expectedSitemapRoutes:expected?Number(expected):undefined,
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    process.exitCode=result.outcome==='PASS'?0:result.outcome==='FAIL'?1:2;
  }catch(error){
    process.stderr.write(JSON.stringify({outcome:'BLOCKED',reason:String(error?.message||error)})+'\n');
    process.exitCode=2;
  }
}
