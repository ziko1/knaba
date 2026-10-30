import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const workspace='/workspace/scratch/9edc85de5c65';
const native=path.join(workspace,'knaba');
const dist=path.join(native,'dist/client');
const htmlAuditRoot=path.resolve(process.env.KNABA_HTML_AUDIT_ROOT||dist);
if(!htmlAuditRoot.startsWith(native+path.sep))throw new Error('HTML audit root must stay inside the selected native checkout');
const target=path.join(workspace,'knaba-current/corporate-site/docs/evidence/requirements-followup-20261028/hosted-test.json');
const origin='https://kneba-temporary-preview.just-fawn-8470.chatgpt.site';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const startedAt=new Date().toISOString();
const report={schemaVersion:2,scope:'Read-only anonymous HTTPS verification of published KnaBa TEST v8 against the final native Sites build.',origin,startedAt,methods:['GET','HEAD'],authentication:'No cookies, credentials, identity headers or conversation tokens supplied; no session spoofing.',transport:'Node 24 --use-env-proxy, normal configured HTTPS proxy with approval-reviewed network access.',localBuildRoot:dist,htmlAuditRoot,checks:{pages:[],resources:[],indexingFiles:[],api:[],protocol:[]},limits:['No browser or rendered interaction verification.','No POST, PATCH, PUT, DELETE, sign-in, messages, form submission, provider calls, database mutation or authenticated private-content queries.','GET API results are reduced to schemas, booleans and counts; names, emails, IDs, text, draft/history contents and headers carrying credentials are never persisted.','Exact HTTP response-body hashes compare decoded transfer bytes with built files; request/response compression is not a content difference.','Non-HTML static resources remain served by the hosting platform; their bodies and MIME are checked, but application-owned header policy is required on HTML only.']};
const localBuild=JSON.parse(await fs.readFile(path.join(native,'docs/build-verification.json'),'utf8'));
report.nativeBuildArtifactSha256=localBuild.artifactSha256;
report.publishedWorkerSha256=sha(await fs.readFile(path.join(native,'dist/server/index.js')));
const preparationBytes=await fs.readFile(path.join(native,'.sites-html/manifest.json'));
const preparation=JSON.parse(preparationBytes);
if(preparation.status!=='prepared'||preparation.source.htmlPages!==134||preparation.output.workerSha256!==report.publishedWorkerSha256||preparation.source.clientArtifactSha256!==localBuild.artifactSha256)throw new Error('Prepared HTML artifact identity does not match the verified native build');
report.sitesHtmlPreparationManifestSha256=sha(preparationBytes);
report.workerSourceSha256={};
for(const name of ['index','api','reviews','studio','assistant','crm','turnstile'])report.workerSourceSha256['worker/'+name+'.ts']=sha(await fs.readFile(path.join(native,'worker',name+'.ts')));
async function listFiles(dir,prefix=''){
 const entries=await fs.readdir(dir,{withFileTypes:true});let result=[];
 for(const entry of entries){const rel=prefix+entry.name;if(entry.isDirectory())result.push(...await listFiles(path.join(dir,entry.name),rel+'/'));else result.push(rel);}
 return result.sort();
}
const allFiles=await listFiles(dist);
const htmlFiles=(await listFiles(htmlAuditRoot)).filter(p=>p.endsWith('.html'));
if(htmlFiles.length!==134||htmlFiles.length!==localBuild.pages)throw new Error('Required 134-page HTML audit set is missing or incomplete');
if(JSON.stringify(preparation.html.map(r=>r.file).sort())!==JSON.stringify(htmlFiles))throw new Error('HTML audit files differ from preparation manifest');
for(const row of preparation.html){const bytes=await fs.readFile(path.join(htmlAuditRoot,row.file));if(bytes.length!==row.bytes||sha(bytes)!==row.sha256)throw new Error('Prepared HTML audit bytes changed:'+row.file);}
for(const row of preparation.static){const bytes=await fs.readFile(path.join(dist,row.file));if(bytes.length!==row.bytes||sha(bytes)!==row.sha256)throw new Error('Static artifact bytes changed:'+row.file);}
report.expectedHtmlPages=134;
async function request(urlPath,accept,method='GET',extraHeaders={}){
 let url=new URL(urlPath,origin);const redirects=[];
 for(let step=0;step<4;step++){
  const response=await fetch(url,{method,redirect:'manual',headers:{accept,...extraHeaders},signal:AbortSignal.timeout(20000)});
  const meta={status:response.status,contentType:response.headers.get('content-type'),xRobotsTag:response.headers.get('x-robots-tag'),cacheControl:response.headers.get('cache-control'),nosniff:response.headers.get('x-content-type-options'),referrerPolicy:response.headers.get('referrer-policy'),etag:response.headers.get('etag'),finalPath:url.pathname+url.search,redirects};
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');await response.body?.cancel();
   if(!location)return {...meta,bytes:Buffer.alloc(0),redirectError:'missing-location'};
   const next=new URL(location,url);redirects.push({status:response.status,from:url.pathname,to:next.origin===origin?next.pathname:'external-origin'});
   if(next.origin!==origin)return {...meta,bytes:Buffer.alloc(0),redirectError:'external-redirect-not-followed'};
   if(/^\/(?:signin|signout|login|logout)/.test(next.pathname))return {...meta,bytes:Buffer.alloc(0),redirectError:'authentication-redirect-not-followed'};
   url=next;continue;
  }
  const limit=accept==='application/json'?262144:1048576;
  const reader=response.body?.getReader();const chunks=[];let length=0;
  if(reader)try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new Error('response-size-bound-exceeded');}chunks.push(value);}}finally{reader.releaseLock();}
  return {...meta,bytes:Buffer.concat(chunks)};
 }
 throw new Error('redirect-limit');
}
function safeError(e){return {error:e?.message||'unknown',causeCode:e?.cause?.code||null};}
function stripBytes(r){const {bytes,...meta}=r;return {...meta,responseBytes:bytes.length};}
async function staticCheck(rel,kind){
 const local=await fs.readFile(path.join(kind==='html'?htmlAuditRoot:dist,rel));const urlPath=rel.endsWith('index.html')?'/'+rel.slice(0,-10):'/'+rel;
 const row={path:urlPath,localFile:rel,localBytes:local.length,localSha256:sha(local)};
 try{
  const r=await request(urlPath,kind==='html'?'text/html':kind==='image'?'image/png':kind==='css'?'text/css':kind==='js'?'text/javascript,application/javascript':'text/plain,application/xml,application/json');
  Object.assign(row,stripBytes(r),{hostedSha256:sha(r.bytes),exactBodyMatch:r.bytes.equals(local)});
  row.errors=[];
  if(r.status!==200&&!(rel==='404.html'&&r.status===404))row.errors.push('unexpected-http-status');
  if(r.redirectError)row.errors.push(r.redirectError);
  if(!row.exactBodyMatch)row.errors.push('body-differs-from-built-file');
  if(kind==='html'){
   const html=r.bytes.toString('utf8');row.metaRobots=html.match(/<meta\b[^>]*name=["']robots["'][^>]*content=["']([^"']*)/i)?.[1]||null;
   row.metaNoindex=Boolean(row.metaRobots&&/\bnoindex\b/i.test(row.metaRobots));row.httpNoindex=/\bnoindex\b/i.test(r.xRobotsTag||'');
   if(!r.contentType?.includes('text/html'))row.errors.push('not-html');
   if(!row.metaNoindex)row.errors.push('missing-meta-noindex');
   if(!row.httpNoindex)row.errors.push('missing-http-noindex');
   if(r.nosniff!=='nosniff')row.errors.push('missing-nosniff');
   if(r.referrerPolicy!=='strict-origin-when-cross-origin')row.errors.push('unexpected-referrer-policy');
   const expected=preparation.html.find(item=>item.file===rel);
   // Native delivery may mark the validator weak while transporting compressed
   // content. Require the same content digest and verify conditional304 below.
   row.etagMatchesContent=r.etag?.replace(/^W\//,'')===expected?.etag;
   if(!row.etagMatchesContent)row.errors.push('unexpected-html-etag');
   const ogImage=html.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']*)/i)?.[1];
   const twitterImage=html.match(/<meta\b[^>]*name=["']twitter:image["'][^>]*content=["']([^"']*)/i)?.[1];
   row.socialImagesUseTestOrigin=Boolean(ogImage&&twitterImage===ogImage&&new URL(ogImage).origin===origin&&/^\/images\/knaba-social-(?:de|en|uk|ru)\.png$/.test(new URL(ogImage).pathname));
   if(!row.socialImagesUseTestOrigin)row.errors.push('social-image-not-on-verified-test-origin');
   if(/^\/(?:(?:de|en|uk|ru)\/)?(?:admin|konto|studio|crm|postfach)(?:\/|$)/.test(urlPath)&&(!r.cacheControl?.includes('no-store')||!r.xRobotsTag?.includes('nofollow')))row.errors.push('missing-private-page-policy');
  }
  if(kind==='image'&&!r.contentType?.includes('image/png'))row.errors.push('not-png');
  if(kind==='css'&&!r.contentType?.includes('text/css'))row.errors.push('not-css');
  if(kind==='js'&&!r.contentType?.match(/(?:java|ecma)script/i))row.errors.push('not-javascript');
  if(rel==='robots.txt')row.apiCrawlBlocked=/Disallow:\s*\/api\//.test(r.bytes.toString());
  if(rel==='sitemap.xml')row.sitemapUrlCount=(r.bytes.toString().match(/<loc>/g)||[]).length;
  row.statusLabel=row.errors.length?'FAIL':'PASS';
 }catch(e){Object.assign(row,safeError(e),{statusLabel:'BLOCKED'});}
 return row;
}
async function boundedMap(items,fn,concurrency=5){const results=new Array(items.length);let index=0,done=0;await Promise.all(Array.from({length:concurrency},async()=>{while(index<items.length){const i=index++;results[i]=await fn(items[i]);done++;if(done%25===0)console.log(JSON.stringify({progress:done,total:items.length,failed:results.filter(r=>r&&r.statusLabel!=='PASS').length}));}}));return results;}
report.checks.pages=await boundedMap(htmlFiles,rel=>staticCheck(rel,'html'));
const resources=['de','en','uk','ru'].map(locale=>['images/knaba-social-'+locale+'.png','image']);
for(const [prefix,extension,kind] of [['Layout.','.css','css'],['ConstructionHome.','.css','css'],['Layout.astro_astro_type_script_index_1_lang.','.js','js'],['Inquiry.','.js','js'],['Portal.','.js','js']]){
 const rel=allFiles.find(p=>p.startsWith('_astro/'+prefix)&&p.endsWith(extension));
 if(!rel)throw new Error('representative-resource-not-found:'+prefix);resources.push([rel,kind]);
}
report.checks.resources=await boundedMap(resources,([rel,kind])=>staticCheck(rel,kind),3);
for(const rel of ['robots.txt','sitemap.xml','app-manifest.json'])report.checks.indexingFiles.push(await staticCheck(rel,'document'));
async function apiCheck(urlPath,validate){
 const row={path:urlPath};try{
  const r=await request(urlPath,'application/json');Object.assign(row,stripBytes(r));
  if(!r.contentType?.includes('application/json')){row.statusLabel='FAIL';row.errors=['not-json'];return row;}
  let body;try{body=JSON.parse(r.bytes.toString('utf8'));}catch{row.statusLabel='FAIL';row.errors=['invalid-json'];return row;}
  Object.assign(row,validate(r,body));
  row.httpNoindex=/\bnoindex\b/i.test(r.xRobotsTag||'');
  if(!row.httpNoindex){row.statusLabel='FAIL';row.errors=[...(row.errors||[]),'missing-api-noindex'];}
 }catch(e){Object.assign(row,safeError(e),{statusLabel:'BLOCKED'});}
 report.checks.api.push(row);return row;
}
const session=await apiCheck('/api/portal/session',(r,b)=>({statusLabel:r.status===200&&b.user===null&&b.profile===null&&b.role==='anonymous'?'PASS':'FAIL',anonymous:b.user===null&&b.profile===null&&b.role==='anonymous',identityFieldsRecorded:false}));
await apiCheck('/api/portal/health',(r,b)=>({statusLabel:r.status===200&&b.ready===true?'PASS':'FAIL',ready:b.ready===true,d1Read:'SELECT id FROM profiles LIMIT 1; no row content returned or logged',errorCode:typeof b.error?.code==='string'?b.error.code:null}));
await apiCheck('/api/reviews',(r,b)=>{
 const allowed=new Set(['id','displayName','company','relationship','text','createdAt']);
 const valid=Array.isArray(b.reviews)&&typeof b.total==='number'&&b.reviews.every(row=>row&&Object.keys(row).every(k=>allowed.has(k)));
 return {statusLabel:r.status===200&&valid?'PASS':'FAIL',publicSchemaOnly:valid,returnedCount:Array.isArray(b.reviews)?b.reviews.length:null,total:typeof b.total==='number'?b.total:null,d1Read:'Published public reviews SELECT and COUNT; contents not recorded',errorCode:typeof b.error?.code==='string'?b.error.code:null};
});
await apiCheck('/api/studio/published?page=%2F',(r,b)=>({statusLabel:r.status===200&&b.page==='/'&&typeof b.version==='number'&&Array.isArray(b.entries)?'PASS':'FAIL',validPublicSchema:b.page==='/'&&typeof b.version==='number'&&Array.isArray(b.entries),publishedEntryCount:Array.isArray(b.entries)?b.entries.length:null,publishedVersion:typeof b.version==='number'?b.version:null,d1Read:'SELECT published_json,published_version FROM studio_pages WHERE page_path=?; public entries not recorded',errorCode:typeof b.error?.code==='string'?b.error.code:null}));
for(const urlPath of ['/api/reviews/captcha','/api/assistant/captcha'])await apiCheck(urlPath,(r,b)=>{
 const valid=typeof b.enabled==='boolean'&&typeof b.unavailable==='boolean'&&(b.sitekey===null||typeof b.sitekey==='string');
 const expected=valid&&(r.status===200||(urlPath.includes('/assistant/')&&r.status===503&&b.unavailable));
 return {statusLabel:expected?'PASS':'FAIL',configured:b.enabled===true,unavailable:b.unavailable===true,publicSiteKeyPresent:typeof b.sitekey==='string'&&b.sitekey.length>0,featureReadiness:b.unavailable?'BLOCKED_CAPTCHA_UNAVAILABLE':b.enabled?'CAPTCHA_CONFIGURED':'CAPTCHA_DISABLED_BY_ENVIRONMENT',secretRecorded:false};
});
if(session.anonymous){
 for(const [urlPath,status,code] of [['/api/portal/dashboard',401,'unauthenticated'],['/api/studio/page?page=%2F',401,'unauthenticated'],['/api/studio/ai-status',401,'unauthenticated'],['/api/reviews/manage',401,'unauthenticated'],['/api/assistant/owner/conversations',403,'forbidden'],['/api/assistant/owner/notifications',403,'forbidden'],['/api/crm/contacts',401,'unauthenticated']])await apiCheck(urlPath,(r,b)=>({statusLabel:r.status===status&&b.error?.code===code?'PASS':'FAIL',expectedStatus:status,errorCode:typeof b.error?.code==='string'?b.error.code:null,deniesAnonymous:r.status===status&&b.error?.code===code,privateContentsRecorded:false}));
}else{report.protectedChecksSkipped='Anonymous session not confirmed; no protected GET requests attempted.';}
for(const [urlPath,method,status] of [['/uk/','HEAD',200],['/konto/','HEAD',200],['/admin/','HEAD',200],['/__knaba_test_nonexistent_20261028/','GET',404]]){
 const row={path:urlPath,method,expectedStatus:status};
 try{
  const r=await request(urlPath,'text/html',method);Object.assign(row,stripBytes(r));row.errors=[];
  if(r.status!==status)row.errors.push('unexpected-http-status');
  if(method==='HEAD'&&r.bytes.length!==0)row.errors.push('head-body-not-empty');
  if(!r.xRobotsTag?.includes('noindex'))row.errors.push('missing-http-noindex');
  if(['/konto/','/admin/'].includes(urlPath)&&(!r.cacheControl?.includes('no-store')||!r.xRobotsTag?.includes('nofollow')))row.errors.push('missing-private-page-policy');
  row.statusLabel=row.errors.length?'FAIL':'PASS';
 }catch(e){Object.assign(row,safeError(e),{statusLabel:'BLOCKED'});}
 report.checks.protocol.push(row);
}
const conditionalEtag=report.checks.pages.find(r=>r.path==='/uk/')?.etag;
if(conditionalEtag){
 const row={path:'/uk/',method:'GET',conditional:'If-None-Match',expectedStatus:304};
 try{const r=await request('/uk/','text/html','GET',{'If-None-Match':conditionalEtag});Object.assign(row,stripBytes(r));row.errors=[];if(r.status!==304||r.bytes.length!==0)row.errors.push('invalid-conditional-response');if(!r.xRobotsTag?.includes('noindex')||r.nosniff!=='nosniff')row.errors.push('missing-conditional-headers');row.statusLabel=row.errors.length?'FAIL':'PASS';}catch(e){Object.assign(row,safeError(e),{statusLabel:'BLOCKED'});}
 report.checks.protocol.push(row);
}else{report.checks.protocol.push({path:'/uk/',conditional:'If-None-Match',statusLabel:'FAIL',errors:['missing-etag-for-conditional-check']});}
report.finishedAt=new Date().toISOString();
report.summary={};
for(const [group,rows] of Object.entries(report.checks))report.summary[group]={count:rows.length,pass:rows.filter(r=>r.statusLabel==='PASS').length,fail:rows.filter(r=>r.statusLabel==='FAIL').length,blocked:rows.filter(r=>r.statusLabel==='BLOCKED').length};
report.summary.exactHtmlBodies=report.checks.pages.filter(r=>r.exactBodyMatch).length;
report.summary.htmlMetaNoindex=report.checks.pages.filter(r=>r.metaNoindex).length;
report.summary.htmlHttpNoindex=report.checks.pages.filter(r=>r.httpNoindex).length;
report.summary.featureReadinessCaveats=report.checks.api.filter(r=>r.featureReadiness&&r.featureReadiness!=='CAPTCHA_CONFIGURED').map(r=>({path:r.path,state:r.featureReadiness}));
report.status=Object.values(report.checks).flat().every(r=>r.statusLabel==='PASS')&&!report.protectedChecksSkipped?'PASS':'REVIEW_FINDINGS';
await fs.writeFile(target,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,summary:report.summary,findings:Object.values(report.checks).flat().filter(r=>r.statusLabel!=='PASS').map(({path,status,statusLabel,errors,error,causeCode,errorCode})=>({path,status,statusLabel,errors,error,causeCode,errorCode})),receipt:target}));
