/** Actual browser + ephemeral HTTPS/SQLite. No live URL, provider or account is accepted. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRoleUxFixture} from './fixtures/role-ux-server.mjs';

const require=createRequire(import.meta.url),locales=['de','en','pl','lt','ru','uk'];
const output=resolve(process.env.KNABA_PORTAL_LANGUAGE_QA_DIR||'/tmp/knaba-portal-languages-browser-evidence');
const receipt={startedAt:new Date().toISOString(),environment:'isolated HTTPS / actual built website / synthetic SQLite',
  scope:'Portal and administration language selection, hydration, history and failed language-pack recovery.',
  checks:[],errors:[],blockedExternalRequests:[]};
const record=(name,detail={})=>receipt.checks.push({name,status:'PASS',...detail});
const roots={portal:'.portal:not(.portal-embedded)',admin:'.kncc'};
const selectors={portal:'.portal-language select',admin:'.kncc-language select'};
const packLocale=url=>new URL(url).pathname.match(/^\/_astro\/(en|pl|lt|ru|uk)\.[\w-]+\.json$/)?.[1];
let fixture,browser,context,page,copy={},requests=[],failedOnce=false,navigations=0;
function safe(value){
  return String(value??'').replaceAll('Synthetic-browser-only-2026','[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[synthetic-email]')
    .replace(/((?:token|password|authorization)\s*[=:]\s*)[^\s,;"'<>]+/gi,'$1[redacted]');
}
async function artifactDigest(){
  const root=fileURLToPath(new URL('../dist/client/',import.meta.url)),files=[];
  async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,entry.name);
    if(entry.isDirectory())await walk(path);else if(entry.isFile())files.push(path);else throw Error('Non-regular client artifact entry');
  }}
  await walk(root);const hash=createHash('sha256');
  for(const path of files.sort())hash.update(relative(root,path)+'\0').update(await readFile(path)).update('\0');
  return {files:files.length,sha256:hash.digest('hex'),algorithm:'SHA-256(sorted relative path + NUL + bytes + NUL)'};
}
async function openContext(failLocale=null){
  requests=[];failedOnce=false;navigations=0;
  context=await browser.newContext({ignoreHTTPSErrors:true,locale:'de-DE',viewport:{width:1280,height:900},
    reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==fixture.origin){receipt.blockedExternalRequests.push({host:url.hostname,path:url.pathname});return route.abort('blockedbyclient');}
    if(!['GET','HEAD'].includes(request.method())&&!(request.method()==='POST'&&url.pathname==='/login/')){
      receipt.errors.push({type:'unexpected-write',path:url.pathname,method:request.method()});return route.abort('blockedbyclient');
    }
    if(packLocale(url.href)===failLocale&&!failedOnce){
      failedOnce=true;
      return route.fulfill({status:503,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:'{"error":"synthetic-language-pack-unavailable"}'});
    }
    return route.continue();
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000);
  const pending=new Map();
  page.on('request',request=>{
    if(request.isNavigationRequest()&&request.frame()===page.mainFrame())navigations++;
    const locale=packLocale(request.url());if(!locale)return;
    const entry={locale,path:new URL(request.url()).pathname};requests.push(entry);pending.set(request,entry);
  });
  page.on('response',response=>{const entry=pending.get(response.request());if(entry)entry.status=response.status();});
  page.on('pageerror',error=>receipt.errors.push({type:'pageerror',path:new URL(page.url()).pathname,message:safe(error.message)}));
  page.on('popup',popup=>{receipt.errors.push({type:'unexpected-popup'});void popup.close();});
}
async function closeContext(){
  assert.deepEqual(receipt.errors,[],'uncaught browser errors');
  assert.deepEqual(receipt.blockedExternalRequests,[],'unexpected external requests');
  await context.close();context=null;page=null;
}
async function navigate(path){
  assert.ok(path.startsWith('/')&&!path.startsWith('//'));
  const response=await page.goto(fixture.origin+path,{waitUntil:'domcontentloaded'});
  assert.equal(response?.status(),200,path);assert.equal(new URL(page.url()).origin,fixture.origin);
}
async function waitLocale(kind,locale){
  await page.waitForFunction(({root,select,locale})=>{
    const region=document.querySelector(root),control=region?.querySelector(select);
    return region?.getAttribute('lang')===locale&&control?.value===locale&&!control.disabled;
  },{root:roots[kind],select:selectors[kind],locale});
}
async function roleProof(role){
  const proof=await page.evaluate(async()=>{
    const result=await fetch('/api/portal/session',{credentials:'same-origin',cache:'no-store'});
    return {status:result.status,role:(await result.json()).role};
  });
  assert.deepEqual(proof,{status:200,role},'language selection preserves server-authorized role');
}
async function login(role){
  const path=role==='owner'?'/admin/':'/konto/';
  await navigate('/login/?lang=de&return_to='+encodeURIComponent(path+'?lang=de'));
  await page.locator('input[name="email"]').fill(fixture.identities[role].email);
  await page.locator('input[name="password"]').fill(fixture.password);
  await Promise.all([page.waitForURL(url=>url.origin===fixture.origin&&url.pathname===path),page.locator('form button[type="submit"]').click()]);
  await page.locator(role==='owner'?'.kncc-layout':'.portal-shell[data-knaba-role="client"]').waitFor({state:'visible'});
  await waitLocale(role==='owner'?'admin':'portal','de');await roleProof(role);
  assert.deepEqual(requests,[],'German entry needs no additional language pack');
  record('native sign-in reaches actual authorized workspace',{role});
}
async function selectLanguage(kind,locale){
  const control=page.locator(roots[kind]+' '+selectors[kind]);
  await control.selectOption(locale);await waitLocale(kind,locale);
  await page.waitForFunction(locale=>new URL(location.href).searchParams.get('lang')===locale,locale);
  const heading=kind==='portal'?'.portal-view-title':'.kncc-intro h2';
  assert.equal((await page.locator(roots[kind]+' '+heading).textContent()).trim(),kind==='portal'?copy[locale].portal.welcome:copy[locale].admin.title);
}
async function anonymousCases(){
  for(const locale of ['pl','lt','ru']){
    await openContext();
    await navigate(locale==='ru'?'/ru/konto/':'/konto/?lang='+locale);
    await waitLocale('portal',locale);await page.locator('.portal-welcome').waitFor({state:'visible'});
    assert.equal((await page.locator('.portal-welcome h2').textContent()).trim(),copy[locale].portal.loginTitle);
    assert.deepEqual(requests.map(item=>item.locale),[locale],'only the chosen language is downloaded');
    assert.ok(requests.every(item=>item.status===200));await roleProof('anonymous');
    if(locale==='ru')assert.equal(await page.locator('html').getAttribute('lang'),'ru');
    record(locale==='ru'?'Russian SSR portal hydrates in Russian without an exception':'explicit portal URL loads its Polish/Lithuanian copy',{locale,languagePacks:requests});
    await closeContext();
  }
}
async function historyCases(kind){
  await selectLanguage(kind,'pl');const count=navigations;
  const parameter=kind==='portal'?'tab':'view',section=kind==='portal'?'requests':'operations';
  const link=view=>page.locator(kind==='portal'?'.portal-tab[href*="tab='+view+'"]':'.kncc-navigation a[href*="view='+view+'"]');
  await link(section).click();
  await page.waitForFunction(({parameter,section})=>new URL(location.href).searchParams.get(parameter)===section,{parameter,section});
  if(kind==='portal')await page.locator('.portal-request-card').first().waitFor({state:'visible'});
  else await page.locator('.portal-embedded .portal-shell[data-knaba-role="owner"]').waitFor({state:'visible'});
  await page.locator(roots[kind]+' '+selectors[kind]).selectOption('lt');await waitLocale(kind,'lt');
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('lang')==='lt');
  if(kind==='admin')await page.waitForFunction(()=>document.querySelector('.portal-embedded')?.getAttribute('lang')==='lt');
  await link('overview').click();
  await page.waitForFunction(parameter=>new URL(location.href).searchParams.get(parameter)==='overview',parameter);
  for(const [direction,locale,view] of [['back','lt',section],['back','pl','overview'],['forward','lt',section],['forward','lt','overview']]){
    await page[direction==='back'?'goBack':'goForward']({waitUntil:'domcontentloaded'});
    await waitLocale(kind,locale);
    await page.waitForFunction(({parameter,view,locale})=>{
      const url=new URL(location.href);return (url.searchParams.get(parameter)||'overview')===view&&url.searchParams.get('lang')===locale;
    },{parameter,view,locale});
    const current=page.locator(kind==='portal'?'.portal-tab[aria-current="page"]':'.kncc-navigation a[aria-current="page"]');
    await page.waitForFunction(({selector,parameter,view})=>{
      const href=document.querySelector(selector)?.getAttribute('href');return href&&new URL(href,location.href).searchParams.get(parameter)===view;
    },{selector:kind==='portal'?'.portal-tab[aria-current="page"]':'.kncc-navigation a[aria-current="page"]',parameter,view});
    assert.equal(await current.count(),1);record('browser history restores language and selected workspace section',{workspace:kind,direction,locale,view});
  }
  assert.equal(navigations,count,'workspace history does not reload the document');
}
async function authenticatedCases(kind){
  const role=kind==='admin'?'owner':'client';await openContext();await login(role);
  assert.deepEqual(await page.locator(roots[kind]+' '+selectors[kind]+' option').evaluateAll(options=>options.map(option=>option.value)),locales);
  for(const locale of locales){await selectLanguage(kind,locale);await roleProof(role);record('all six real workspace selections render expected copy',{workspace:kind,locale});}
  assert.deepEqual(requests.map(item=>item.locale),locales.slice(1),'one request per non-default selected locale');
  assert.ok(requests.every(item=>item.status===200));
  await historyCases(kind);assert.equal(requests.length,5,'already selected language packs are reused');
  await closeContext();
}
async function failureCase(kind){
  const role=kind==='admin'?'owner':'client';await openContext('lt');await login(role);await selectLanguage(kind,'pl');
  const beforeUrl=page.url(),control=page.locator(roots[kind]+' '+selectors[kind]);
  await control.selectOption('lt');
  const alert=page.locator(roots[kind]+' .portal-alert-error').filter({hasText:copy.pl.portal.networkError});
  await alert.waitFor({state:'visible'});await waitLocale(kind,'pl');
  assert.equal(failedOnce,true);assert.equal(page.url(),beforeUrl,'failed selection keeps current URL');await roleProof(role);
  assert.deepEqual(requests.filter(item=>item.locale==='lt').map(item=>item.status),[503]);
  record('failed language pack preserves previous copy, selected value, URL and role',{workspace:kind,previous:'pl',failed:'lt',simulatedStatus:503});
  await selectLanguage(kind,'lt');await alert.waitFor({state:'detached'});await roleProof(role);
  assert.deepEqual(requests.filter(item=>item.locale==='lt').map(item=>item.status),[503,200]);
  record('retry downloads the same locale successfully and clears its error',{workspace:kind,locale:'lt'});
  await closeContext();
}
async function run(){
  await mkdir(output,{recursive:true});receipt.clientArtifact=await artifactDigest();
  if(/^[a-f0-9]{40}$/.test(process.env.KNABA_QA_SOURCE_SHA??''))receipt.operatorReportedSourceSha=process.env.KNABA_QA_SOURCE_SHA;
  if(process.env.KNABA_QA_CLIENT_SHA256)assert.equal(receipt.clientArtifact.sha256,process.env.KNABA_QA_CLIENT_SHA256,'operator-pinned client artifact');
  for(const locale of locales)copy[locale]=JSON.parse(await readFile(new URL('../src/data/portal-locales/'+locale+'.json',import.meta.url),'utf8'));
  let drivers;try{drivers=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');}
  catch{receipt.status='BLOCKED';receipt.reason='PLAYWRIGHT_UNAVAILABLE';return;}
  receipt.engines=[];const skip=(process.env.KNABA_BROWSER_SKIP||'').split(',');
  for(const engine of ['chromium','webkit','firefox']){
    if(skip.includes(engine)){receipt.engines.push({engine,status:'SKIPPED_BY_OPERATOR'});continue;}
    try{
      const options={headless:true};if(engine==='chromium'&&process.env.KNABA_CHROME_PATH)options.executablePath=process.env.KNABA_CHROME_PATH;
      browser=await drivers[engine].launch(options);receipt.browser=engine;break;
    }catch(error){
      if(/ERR_BLOCKED_BY_ADMINISTRATOR|Executable doesn't exist|browser.*not installed|ENOENT/i.test(error.message)){
        receipt.engines.push({engine,status:'BLOCKED',reason:safe(error.message.split('\n')[0])});continue;
      }throw error;
    }
  }
  if(!browser){receipt.status='BLOCKED';receipt.reason='NO_USABLE_BROWSER';return;}
  receipt.browserVersion=browser.version();fixture=await createRoleUxFixture();const before=fixture.primarySnapshot();
  await anonymousCases();await authenticatedCases('portal');await authenticatedCases('admin');await failureCase('portal');await failureCase('admin');
  assert.deepEqual(fixture.primarySnapshot(),before,'language navigation does not mutate primary business records');record('primary business data unchanged');
  assert.deepEqual(await artifactDigest(),receipt.clientArtifact,'built artifact unchanged throughout language acceptance');
  receipt.status='PASS';
}
try{await run();}
catch(error){
  receipt.status=/listen EPERM|listen EACCES|ERR_BLOCKED_BY_ADMINISTRATOR/.test(error.message)?'BLOCKED':'FAIL';
  receipt.failure={message:safe(error.message),stack:safe(error.stack)};
  receipt.failedCaseLanguageRequests=requests;
  if(page&&!page.isClosed())try{
    receipt.failureDom=await page.evaluate(()=>{
      const selectInfo=select=>select?{value:select.value,valueAttribute:select.getAttribute('value'),disabled:select.disabled,
        selectedIndex:select.selectedIndex,options:[...select.options].map(option=>({value:option.value,selected:option.selected,defaultSelected:option.defaultSelected}))}:null;
      const visible=selector=>[...document.querySelectorAll(selector)].some(node=>node.getClientRects().length>0);
      return {path:location.pathname,languageParameter:new URL(location.href).searchParams.get('lang'),documentLanguage:document.documentElement.lang,
        readyState:document.readyState,portals:[...document.querySelectorAll('.portal')].map(root=>({language:root.getAttribute('lang'),
          embedded:root.classList.contains('portal-embedded'),select:selectInfo(root.querySelector('.portal-language select')),
          heading:root.querySelector('.portal-view-title,.portal-welcome h2')?.textContent?.trim()??null})),
        administration:[...document.querySelectorAll('.kncc')].map(root=>({language:root.getAttribute('lang'),select:selectInfo(root.querySelector('.kncc-language select'))})),
        welcomeVisible:visible('.portal-welcome'),portalRole:document.querySelector('.portal-shell')?.getAttribute('data-knaba-role')??null,
        alerts:[...document.querySelectorAll('[role="alert"]')].filter(node=>node.getClientRects().length).map(node=>node.textContent.trim().slice(0,300))};
    });
    receipt.failureDom=JSON.parse(safe(JSON.stringify(receipt.failureDom)));
  }catch(problem){receipt.diagnosticError=safe(problem.message);}
  if(page&&!page.isClosed())try{await page.screenshot({path:resolve(output,'failure.png'),timeout:5000,
    mask:[page.locator('input[name="email"],input[name="password"],input[name="token"]')]});}catch{}
}
finally{
  if(context)await context.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  if(fixture)await fixture.close().catch(()=>{});
  receipt.finishedAt=new Date().toISOString();await mkdir(output,{recursive:true});
  await writeFile(resolve(output,'portal-languages-browser-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log('KNABA_PORTAL_LANGUAGES_BROWSER '+JSON.stringify(receipt));
  process.exitCode=receipt.status==='PASS'?0:receipt.status==='BLOCKED'?2:1;
}
