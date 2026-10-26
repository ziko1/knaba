/**
 * KNABA I18N-99 source extraction and translation-review tooling.
 * Only PUBLIC, existing static German HTML. No network, customer records,
 * model dispatch, publication, routes or billing. Human/native/legal/browser
 * review is always mandatory before any new public locale is enabled.
 */
import {parse} from 'parse5';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
export const CATALOG_VERSION=1;
export const SOURCE_LOCALE='de';
const EXCLUDED=new Set(['script','style','svg','template','iframe','code','pre']);
const ATTRS=new Set(['alt','title','aria-label','placeholder']);
const PRIVATE=/^\/(?:admin|studio|crm|postfach|login|logout|api)(?:\/|$)/;
const OTHER_LANG=/^\/(?:en|uk|ru)(?:\/|$)/;
const sha=s=>createHash('sha256').update(s).digest('hex');
const normalize=s=>s.replace(/\s+/gu,' ').trim();
const textContent=s=>/\p{L}/u.test(s)&&
 !/^(?:https?:|mailto:|tel:|\/)/i.test(s)&&
 !/^[\w.%+-]+@[\w.-]+\.[a-z]{2,}$/i.test(s)&&
 !['KNABA','KnaBa'].includes(s);
const attr=(n,k)=>n?.attrs?.find(a=>a.name===k)?.value;
const metaLabel=n=>['description','og:title','og:description','og:image:alt','twitter:title','twitter:description'].includes(attr(n,'name')||attr(n,'property'));
const tokens=s=>(s.match(/\{\{[\w.:-]+\}\}|\{[\w.:-]+\}|\$\{[\w.:-]+\}|%(?:\d+\$)?[sd]/g)||[]).sort().join('|');
const goodPath=s=>typeof s==='string'&&/^\/(?:[a-z0-9_-]+\/)*$/i.test(s)&&!PRIVATE.test(s)&&!OTHER_LANG.test(s);
export function germanPathsFromSitemap(xml,origin){
 if(typeof xml!=='string')throw new TypeError('Expected sitemap XML');
 const base=new URL(origin),paths=new Set();
 for(const match of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)){
  let url;try{url=new URL(match[1].trim().replace(/&amp;/g,'&'));}catch{continue;}
  if(url.origin===base.origin&&!url.search&&!url.hash&&goodPath(url.pathname)&&url.pathname!=='/konto/')paths.add(url.pathname);
 }
 return [...paths].sort((a,b)=>a==='/'?-1:b==='/'?1:a.localeCompare(b));
}
export function buildCatalog(pages){
 if(!Array.isArray(pages)||!pages.length)throw new TypeError('Missing source pages');
 const map=new Map(),routes=[];
 for(const {path,html} of [...pages].sort((a,b)=>a.path.localeCompare(b.path))){
  if(!goodPath(path)||typeof html!=='string')throw new TypeError('Unsafe source route');
  const doc=parse(html);
  if(attr(doc.childNodes.find(n=>n.tagName==='html'),'lang')!=='de')
   throw new Error('SOURCE_LOCALE_MISMATCH '+path);
  routes.push(path);
  const add=(kind,v)=>{
   if(typeof v!=='string')return;
   const source=normalize(v);
   if(!source||!textContent(source))return;
   const id=sha(kind+'\0'+source).slice(0,24);
   if(!map.has(id))map.set(id,{kind,source,routes:[]});
   if(!map.get(id).routes.includes(path))map.get(id).routes.push(path);
  };
  function walk(n){
   if(EXCLUDED.has(n.tagName))return;
   if(n.nodeName==='#text')add('text',n.value);
   if(n.tagName){
    for(const a of n.attrs||[])if(ATTRS.has(a.name))add('attr:'+a.name,a.value);
    if(n.tagName==='meta'&&metaLabel(n))add('meta:'+(attr(n,'name')||attr(n,'property')),attr(n,'content'));
   }
   for(const child of n.childNodes||[])walk(child);
  }
  walk(doc);
 }
 const units=Object.fromEntries([...map.entries()].sort(([a],[b])=>a.localeCompare(b)));
 const paths=[...new Set(routes)].sort();
 return {schemaVersion:CATALOG_VERSION,scope:'public-html-only',sourceLocale:SOURCE_LOCALE,
  sourceDigest:sha(JSON.stringify({routes:paths,units})),routes:paths,unitCount:Object.keys(units).length,units,
  uncoveredRuntimeScopes:['inquiry-and-validation','assistant-voice-and-chat','portal-and-account',
   'admin-and-studio','legal-native-review','rtl-and-responsive','seo-and-structured-data',
   'real-browser-and-screen-reader']};
}
export function makeDraft(c,locale,targetCodes){
 if(typeof locale!=='string'||!Array.isArray(targetCodes))throw new TypeError('Invalid locale arguments');
 return {schemaVersion:CATALOG_VERSION,locale,sourceLocale:SOURCE_LOCALE,
  sourceDigest:c.sourceDigest,translations:{},brand:null,
  review:{state:'not-reviewed',reviewer:null,evidence:null},
  disclaimer:'DRAFT ONLY — not reviewed, not published and no hreflang or new public route.'};
}
export function validatePack(c,pack,targetCodes){
 const errors=[];
 if(!pack||typeof pack!=='object'||Array.isArray(pack))
  return {status:'INVALID',published:false,coveragePercent:0,missingCount:c.unitCount,errors:['INVALID_PACK'],blockers:[]};
 if(!Array.isArray(targetCodes)||!targetCodes.includes(pack.locale)||['de','en','uk','ru'].includes(pack.locale))errors.push('INVALID_TARGET_LOCALE');
 if(pack.schemaVersion!==CATALOG_VERSION)errors.push('INVALID_PACK_VERSION');
 if(pack.sourceDigest!==c.sourceDigest)errors.push('SOURCE_DIGEST_MISMATCH');
 if(!pack.translations||typeof pack.translations!=='object'||Array.isArray(pack.translations))errors.push('INVALID_TRANSLATIONS');
 const values=pack.translations&&typeof pack.translations==='object'&&!Array.isArray(pack.translations)?pack.translations:{};
 for(const key of Object.keys(values)){
  if(!Object.hasOwn(c.units,key))errors.push('EXTRA_TRANSLATION_KEY:'+key);
  const v=values[key];
  if(typeof v!=='string')errors.push('TRANSLATION_NOT_STRING:'+key);
  else if(/<\s*\/?\s*[a-z][^>]*>/i.test(v))errors.push('HTML_FORBIDDEN:'+key);
  else if(Object.hasOwn(c.units,key)&&tokens(v)!==tokens(c.units[key].source))errors.push('PLACEHOLDER_MISMATCH:'+key);
  else if(v.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))errors.push('UNSAFE_TRANSLATION_VALUE:'+key);
 }
 const sourceIds=Object.keys(c.units),count=sourceIds.filter(id=>typeof values[id]==='string'&&values[id].trim()).length;
 const missingCount=sourceIds.length-count;
 const coveragePercent=sourceIds.length?Math.round(count/sourceIds.length*10000)/100:0;
 if(pack.brand!=null){
  if(typeof pack.brand!=='object'||Array.isArray(pack.brand))errors.push('INVALID_BRAND');
  else for(const key of ['descriptor','slogan','svgDescription']){
   const v=pack.brand[key];
   if(typeof v!=='string'||v.trim().length<12||/<[^>]*>/.test(v))errors.push('INVALID_BRAND_'+key);
  }
 }
 const blockers=[];
 if(missingCount)blockers.push('STATIC_CONTENT_INCOMPLETE');
 if(!pack.brand)blockers.push('BRAND_TRANSLATION_REQUIRED');
 blockers.push('DYNAMIC_AND_HUMAN_REVIEW_REQUIRED');
 return {status:errors.length?'INVALID':missingCount?'INCOMPLETE':'REVIEW_REQUIRED',published:false,
  translatedUnits:count,totalUnits:sourceIds.length,missingCount,coveragePercent,errors,blockers};
}
export function catalogFromDist(root){
 const dir=resolve(root),xml=readFileSync(join(dir,'sitemap.xml'),'utf8');
 const first=[...xml.matchAll(/<loc>\s*([^<]+)<\/loc>/gi)][0];
 if(!first)throw new Error('SITEMAP_EMPTY');
 const origin=new URL(first[1].trim().replace(/&amp;/g,'&')).origin;
 const sitemapRoutes=germanPathsFromSitemap(xml,origin);
 if(!sitemapRoutes.length)throw new Error('NO_GERMAN_PUBLIC_ROUTES');
 // Legal text and public sign-in must be translated too, even though private
 // management pages and legal routes are not in the public SEO sitemap.
 const legalAndAccount=['/datenschutz/','/impressum/','/konto/'];
 const routes=[...new Set([...sitemapRoutes,...legalAndAccount.filter(path=>
  existsSync(resolve(dir,'.'+path,'index.html')))])];
 return buildCatalog(routes.map(path=>{
  const f=resolve(dir,'.'+path,'index.html');
  if(!f.startsWith(dir+sep))throw new Error('PATH_TRAVERSAL');
  if(!existsSync(f))throw new Error('MISSING_BUILT_PUBLIC_ROUTE '+path);
  return {path,html:readFileSync(f,'utf8')};
 }));
}
const cli=process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]);
if(cli){
 const [command,locale]=process.argv.slice(2);
 const dir=resolve('dist/client'),catalogPath=resolve('i18n/source-de.json');
 try{
  if(command==='extract'){
   const c=catalogFromDist(dir);
   mkdirSync(dirname(catalogPath),{recursive:true});
   writeFileSync(catalogPath,JSON.stringify(c,null,2)+'\n');
   console.log(JSON.stringify({status:'PASS',sourceDigest:c.sourceDigest,routes:c.routes.length,units:c.unitCount,limit:'STATIC_CONTENT_ONLY'}));
  }else if(command==='verify-source'){
   const actual=catalogFromDist(dir),saved=JSON.parse(readFileSync(catalogPath,'utf8'));
   if(JSON.stringify(actual)!==JSON.stringify(saved))throw new Error('SOURCE_CATALOG_STALE_RUN_EXTRACT');
   console.log(JSON.stringify({status:'PASS',digest:actual.sourceDigest,routes:actual.routes.length,units:actual.unitCount}));
  }else if(command==='draft'){
   const manifest=JSON.parse(readFileSync(join(dir,'languages.json'),'utf8'));
   if(!manifest.locales?.some(l=>l.code===locale&&l.status==='pending'))throw new Error('NOT_A_PENDING_TARGET');
   const c=JSON.parse(readFileSync(catalogPath,'utf8')),target=resolve('i18n/drafts/'+locale+'.json');
   if(existsSync(target))throw new Error('DRAFT_ALREADY_EXISTS');
   mkdirSync(dirname(target),{recursive:true});
   writeFileSync(target,JSON.stringify(makeDraft(c,locale,manifest.locales.map(l=>l.code)),null,2)+'\n',{flag:'wx'});
   console.log(JSON.stringify({status:'DRAFT_ONLY',locale,target}));
  }else if(command==='report'){
   const m=JSON.parse(readFileSync(join(dir,'languages.json'),'utf8'));
   const c=JSON.parse(readFileSync(catalogPath,'utf8'));
   const pending=m.locales.filter(l=>l.status==='pending').map(l=>{
    const f=resolve('i18n/drafts/'+l.code+'.json');
    return {locale:l.code,status:existsSync(f)?validatePack(c,JSON.parse(readFileSync(f,'utf8')),m.locales.map(x=>x.code)).status:'NOT_STARTED'};
   });
   console.log(JSON.stringify({targets:m.targets,published:m.published,pending:m.pending,
    sourceDigest:c.sourceDigest,staticUnits:c.unitCount,translationDrafts:pending},null,2));
  }else throw new Error('Commands: extract | verify-source | draft <locale> | report');
 }catch(e){console.error('KNABA_I18N_PIPELINE_ERROR',e?.message||e);process.exitCode=1;}
}
