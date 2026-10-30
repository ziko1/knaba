/** Actual browser journeys against an isolated HTTPS fixture; never accepts a live origin. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url);
const output=resolve(process.env.KNABA_DEVELOPER_QA_DIR||'/tmp/knaba-developer-browser-evidence');
const receipt={startedAt:new Date().toISOString(),environment:'isolated HTTPS / real SQLite / developer-owned synthetic workspace',checks:[],errors:[]};
const browserPolicyBlocked=error=>/ERR_BLOCKED_BY_ADMINISTRATOR|No usable sandbox|Chromium sandboxing failed|Failed to move to new namespace|Running as root without/i.test(String(error));
const widths=[320,390,768,1440];
const record=(name,detail={})=>receipt.checks.push({name,status:'PASS',...detail});
let fixture,browser,context,page,primaryBefore,draftProbe;
function safeText(value){
  return String(value).replaceAll(fixture?.password||'Synthetic-browser-only-2026','[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[synthetic-email]')
    .replace(/((?:knaba_session|token|password|authorization)\s*[=:]\s*)[^\s,;"'<>]+/gi,'$1[redacted]');
}
async function api(path){
  assert.ok(path.startsWith('/api/'),'readback must use a same-origin API path');
  return page.evaluate(async path=>{
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    return {status:response.status,body:await response.json()};
  },path);
}
async function observeDraftNavigation(){
  assert.equal(new URL(page.url()).origin,fixture.origin,'draft diagnostics are limited to the synthetic fixture');
  receipt.draftNavigation={stages:[],requests:[]};
  draftProbe=await page.evaluateHandle(()=>{
    const form=document.querySelector('.portal-panel:not([hidden]) .portal-form');
    const probe={document,portal:document.querySelector('.portal-shell'),form,field:form?.querySelector('[name="message"]'),events:[]};
    const snapshot=type=>{
      const current=document.querySelector('.portal-form textarea[name="message"]')?.form;
      const fields=[...current?.querySelectorAll('input,textarea,select')||[]]
        .filter(node=>['message','postcode','area'].includes(node.name)||node.type==='checkbox')
        .map(node=>({name:node.name||node.type,value:node.value.slice(0,160),defaultValue:node.defaultValue,
          ...(node.type==='checkbox'?{checked:node.checked,defaultChecked:node.defaultChecked}:{})}));
      const params=new URLSearchParams(location.search);
      return {type,path:location.pathname,tab:params.get('tab'),lang:params.get('lang'),
        sameDocument:document===probe.document,samePortal:document.querySelector('.portal-shell')===probe.portal,
        sameForm:current===probe.form,originalFormConnected:Boolean(probe.form?.isConnected),
        sameMessage:current?.querySelector('[name="message"]')===probe.field,dirty:current?.getAttribute('data-knaba-dirty'),
        historyIndex:history.state?.index,fields};
    };
    probe.snapshot=snapshot;
    const record=type=>{probe.events.push(snapshot(type));if(probe.events.length>16)probe.events.shift();};
    window.addEventListener('knaba:workspace:navigate',()=>{
      record('workspace:navigate');setTimeout(()=>record('workspace:navigate:next-task'),0);
      requestAnimationFrame(()=>record('workspace:navigate:animation-frame'));
    });
    for(const type of ['astro:before-preparation','astro:after-swap','astro:page-load'])document.addEventListener(type,()=>record(type));
    form?.addEventListener('reset',()=>record('form:reset'));
    return probe;
  });
  page.on('request',request=>{
    const url=new URL(request.url());
    if(url.origin!==fixture.origin||(!request.isNavigationRequest()&&!['/konto/','/admin/'].includes(url.pathname)))return;
    receipt.draftNavigation.requests.push({path:url.pathname,type:request.resourceType(),navigation:request.isNavigationRequest()});
    if(receipt.draftNavigation.requests.length>16)receipt.draftNavigation.requests.shift();
  });
  await captureDraftNavigation('filled');
}
async function captureDraftNavigation(stage){
  if(!draftProbe)return;
  try{
    const detail=await draftProbe.evaluate(probe=>({...probe.snapshot('snapshot'),events:probe.events}));
    receipt.draftNavigation.stages.push({stage,...detail});
  }catch(error){receipt.draftNavigation.stages.push({stage,unavailable:safeText(error.message).slice(0,300)});}
  if(receipt.draftNavigation.stages.length>6)receipt.draftNavigation.stages.shift();
}
async function checkWidths(label){
  for(const width of widths){
    await page.setViewportSize({width,height:844});
    const box=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}));
    assert.ok(box.width<=box.viewport+1,label+' overflows at '+width+'px');
    assert.equal(await page.locator('.workspace-test').count(),1,'exactly one test workspace switcher is mounted');
    const select=page.locator('.workspace-test select');
    assert.equal(await select.isVisible(),true,'test role selector remains reachable');
    const size=await select.boundingBox();assert.ok(size&&size.width>0&&size.height>=40,'test role selector has a usable touch target');
    record('responsive developer workspace',{stage:label,width});
  }
  await page.setViewportSize({width:390,height:844});
}
async function successScreenshot(file,width,stage){
  assert.equal(new URL(page.url()).origin,fixture.origin,'screenshots may contain only the synthetic fixture');
  const previous=page.viewportSize();
  await page.setViewportSize({width,height:844});
  assert.equal(await page.locator('input[type="password"]:visible,input[name="password"]:visible,input[name="token"]:visible').count(),0,'success screenshots must not show credentials');
  await page.screenshot({path:resolve(output,file),fullPage:true,
    mask:[page.locator('input[type="password"],input[name="password"],input[name="password_confirm"],input[name="token"]')]});
  (receipt.screenshots??=[]).push({file,stage,width,path:new URL(page.url()).pathname,data:'synthetic fixture only'});
  if(previous)await page.setViewportSize(previous);
}
async function loginDeveloper(){
  await page.goto(fixture.origin+'/en/',{waitUntil:'networkidle'});
  const entry=page.locator('header .account-link');
  if(await entry.isVisible())await entry.click();
  else{
    const menu=page.locator('details.mobile-nav');
    if(!await menu.evaluate(node=>node.open))await menu.locator(':scope > summary').click();
    await menu.locator('a[data-account-access="login"]').click();
  }
  const dialog=page.locator('dialog[open]');
  await dialog.locator('input[name="email"]').waitFor();
  await dialog.locator('[data-account-role="admin"]').click();
  await dialog.locator('input[name="email"]').fill(fixture.identities.developer.email);
  await dialog.locator('input[name="password"]').fill(fixture.password);
  await Promise.all([
    page.waitForURL(url=>url.origin===fixture.origin&&url.pathname==='/admin/'),
    dialog.locator('form button[type="submit"]').click()
  ]);
  await page.locator('.kncc-layout').waitFor();await page.locator('.workspace-test select').waitFor();
  const session=await api('/api/portal/session');
  assert.equal(session.status,200);assert.equal(session.body.role,'owner');
  assert.notEqual(session.body.user.id,fixture.identities.developer.id);
  assert.notEqual(session.body.user.id,fixture.identities.owner.id);
  const workspace=await api('/api/developer/workspace');
  assert.equal(workspace.status,200);assert.equal(workspace.body.enabled,true);assert.equal(workspace.body.isolated,true);
  assert.equal(context.pages().length,1);
  record('developer login automatically opens only its synthetic management workspace in the same tab');
}
async function switchRole(role){
  const bar=page.locator('.workspace-test');
  await bar.locator('select').selectOption(role);
  const confirmed=page.waitForEvent('dialog').then(async prompt=>{
    assert.equal(prompt.type(),'confirm','switching test roles explicitly confirms loss of unsaved edits');
    await prompt.accept();
  });
  const navigated=page.waitForEvent('framenavigated',{predicate:frame=>frame===page.mainFrame()});
  await Promise.all([confirmed,navigated,bar.locator('button[type="submit"]').click()]);
  await page.locator('.workspace-test select').waitFor();
  await page.waitForFunction(expected=>document.querySelector('.workspace-test select')?.value===expected,role);
  const session=await api('/api/portal/session');assert.equal(session.status,200);assert.equal(session.body.role,role);
  assert.equal(new URL(page.url()).pathname,['owner','admin'].includes(role)?'/admin/':'/konto/');
  assert.equal(context.pages().length,1,'role switch does not create another browser tab');
  record('server-authorized test role switch',{role});
}
async function portalTab(tab){
  const link=page.locator('.portal-sidebar .portal-tab[href*="tab='+tab+'"]');
  await link.click();
  await page.waitForFunction(expected=>new URLSearchParams(location.search).get('tab')===expected,tab);
}
async function operations(){
  const link=page.locator('.kncc-nav-item[href*="view=operations"]');
  if(!await link.isVisible())await page.locator('.kncc-nav-toggle').click();
  await link.click();
  await page.locator('.kncc-module:not([hidden]) .portal-shell').waitFor();
}
async function saveJob(card,changes){
  const saving=page.waitForResponse(response=>new URL(response.url()).pathname.startsWith('/api/portal/requests/')&&response.request().method()==='PATCH');
  await changes();
  await card.getByRole('button',{name:'Save changes',exact:true}).click();
  const response=await saving;assert.equal(response.status(),200,await response.text());
  await card.locator('form').waitFor({state:'hidden'});
  return (await response.json()).request;
}
async function sendMessage(text){
  const form=page.locator('.workspace-composer');
  await form.locator('textarea[name="message"]').fill(text);
  const sending=page.waitForResponse(response=>/\/api\/portal\/conversations\/[^/]+\/messages$/.test(new URL(response.url()).pathname)&&response.request().method()==='POST');
  await form.locator('button[type="submit"]').click();
  const response=await sending;assert.ok([200,201].includes(response.status()),'message must actually persist');
  const saved=(await response.json()).message;assert.equal(saved.body,text);
  await page.locator('.workspace-message p').filter({hasText:text}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.workspace-composer textarea')?.value==='');
  return saved;
}
async function run(){
  await mkdir(output,{recursive:true});
  let drivers;
  try{drivers=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');}
  catch{receipt.status='BLOCKED';receipt.reason='PLAYWRIGHT_UNAVAILABLE';return;}
  receipt.engines=[];
  const skip=(process.env.KNABA_BROWSER_SKIP||'').split(',');
  for(const engine of ['chromium','webkit','firefox']){
    if(skip.includes(engine)){receipt.engines.push({engine,status:'SKIPPED_BY_OPERATOR'});continue;}
    try{
      const options={headless:true};
      if(engine==='chromium')options.chromiumSandbox=true;
      if(engine==='chromium'&&process.env.KNABA_CHROME_PATH)options.executablePath=process.env.KNABA_CHROME_PATH;
      browser=await drivers[engine].launch(options);receipt.browser=engine;break;
    }catch(error){
      if(browserPolicyBlocked(error)||/Executable doesn't exist|browser.*not installed|ENOENT|Operation not permitted/i.test(error.message)){
        receipt.engines.push({engine,status:'BLOCKED',reason:error.message.split('\n')[0]});continue;
      }
      throw error;
    }
  }
  if(!browser){receipt.status='BLOCKED';receipt.reason='NO_USABLE_BROWSER';return;}
  receipt.browserVersion=browser.version();
  const {createRoleUxFixture}=await import('./fixtures/role-ux-server.mjs');
  fixture=await createRoleUxFixture();primaryBefore=fixture.primarySnapshot();
  context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},reducedMotion:'reduce'});
  page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>receipt.errors.push({path:new URL(page.url()).pathname,message:safeText(error.message)}));
  page.on('popup',()=>receipt.errors.push({message:'Unexpected popup'}));
  await loginDeveloper();await checkWidths('owner overview');
  let dashboard=(await api('/api/portal/dashboard')).body;
  assert.ok(dashboard.requests.length>0,'test workspace contains an explicitly synthetic example');
  for(const request of Object.values(fixture.requests))assert.ok(!JSON.stringify(dashboard).includes(request.id),'company request must not appear in test workspace');
  await switchRole('client');await portalTab('newRequest');
  const form=page.locator('.portal-panel:not([hidden]) .portal-form');
  const message='Synthetic developer browser project: prepare the site and coordinate access without using company records.';
  await form.locator('[name="postcode"]').fill('10315');await form.locator('[name="area"]').fill('260');
  await form.locator('[name="message"]').fill(message);await form.locator('input[type="checkbox"]').check();
  const draftUrl=page.url();let documents=0;
  const countDocument=request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())documents++;};
  page.on('request',countDocument);
  await observeDraftNavigation();
  await portalTab('requests');await captureDraftNavigation('requests-tab');
  await page.goBack();
  await form.waitFor({state:'visible'});
  await captureDraftNavigation('browser-back');
  assert.equal(page.url(),draftUrl);assert.equal(await form.locator('[name="message"]').inputValue(),message);
  assert.equal(await form.locator('[name="postcode"]').inputValue(),'10315');assert.equal(documents,0);
  page.off('request',countDocument);record('request draft and form fields survive section navigation and browser Back');
  await checkWidths('client request form');
  const submitted=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/portal/requests'&&response.request().method()==='POST');
  await form.locator('button[type="submit"]').click();
  const saved=await submitted;assert.equal(saved.status(),201,await saved.text());
  let request=(await saved.json()).request;assert.equal(request.message,message);assert.equal(request.status,'new');
  await page.locator('.portal-request-card').filter({hasText:message}).waitFor();
  assert.equal(fixture.db.prepare('SELECT id FROM cleaning_requests WHERE id=?').get(request.id),undefined);
  record('client creates a real persisted request exclusively in its developer workspace');
  await successScreenshot('developer-client-request-390.png',390,'client submitted request');
  await switchRole('admin');await operations();await portalTab('requests');
  let card=page.locator('.portal-request-card').filter({hasText:message});
  await card.getByRole('button',{name:/Plan job/}).click();
  request=await saveJob(card,async()=>{await card.getByRole('combobox',{name:'Status',exact:true}).selectOption('reviewing');});
  await card.getByRole('button',{name:/Plan job/}).click();
  request=await saveJob(card,async()=>{
    await card.getByRole('combobox',{name:'Status',exact:true}).selectOption('scheduled');
    await card.getByRole('combobox',{name:'Assigned employee',exact:true}).selectOption({label:'TEST · worker'});
    await card.locator('input[type="datetime-local"]').fill('2026-11-05T10:00');
  });
  assert.equal(request.status,'scheduled');assert.ok(request.assignedWorkerId.endsWith('-worker'));
  await checkWidths('admin assigned request');record('administration reviews, assigns and schedules the client request through the real UI');
  await successScreenshot('developer-admin-assignment-1440.png',1440,'administration assigned and scheduled request');
  await switchRole('worker');await portalTab('requests');
  card=page.locator('.portal-request-card').filter({hasText:message});
  await card.getByRole('button',{name:/Update job/}).click();
  request=await saveJob(card,async()=>{await card.getByRole('combobox',{name:'Status',exact:true}).selectOption('in_progress');});
  assert.equal(request.status,'in_progress');
  await portalTab('conversations');
  const start=page.locator('.workspace-start');await start.locator('select').selectOption(request.id);
  const opened=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/portal/conversations'&&response.request().method()==='POST');
  await start.locator('button[type="submit"]').click();
  const threadResponse=await opened;assert.ok([200,201].includes(threadResponse.status()));
  const thread=(await threadResponse.json()).conversation;
  const composer=page.locator('.workspace-composer textarea[name="message"]');await composer.waitFor();
  const workerText='Synthetic worker message: can management confirm the safe access time for this test job?';
  await composer.fill(workerText);const threadUrl=page.url();documents=0;page.on('request',countDocument);
  await portalTab('requests');await page.goBack();await composer.waitFor();
  assert.equal(page.url(),threadUrl);assert.equal(await composer.inputValue(),workerText);assert.equal(documents,0);
  page.off('request',countDocument);record('worker conversation draft survives section navigation and browser Back');
  await checkWidths('worker conversation');await sendMessage(workerText);
  record('assigned worker updates its job and sends a persistent scoped message');
  await switchRole('admin');await operations();await portalTab('conversations');
  const threadLink=page.locator('.workspace-thread').filter({hasText:workerText});await threadLink.waitFor();await threadLink.click();
  await page.locator('.workspace-message p').filter({hasText:workerText}).waitFor();
  const managerText='Synthetic management reply: confirmed for the scheduled test time; report any access issue here.';
  await sendMessage(managerText);await checkWidths('manager reply');
  record('management sees the worker message and replies in the same workspace');
  await switchRole('worker');await portalTab('conversations');
  await page.locator('.workspace-thread').filter({hasText:managerText}).click();
  await page.locator('.workspace-message p').filter({hasText:managerText}).waitFor();
  const messages=await api('/api/portal/conversations/'+thread.id+'/messages');
  assert.equal(messages.status,200);assert.deepEqual(messages.body.messages.map(item=>item.body),[workerText,managerText]);
  record('worker receives the actual persisted management reply');
  await successScreenshot('developer-worker-reply-390.png',390,'worker received management reply');
  await switchRole('client');await portalTab('conversations');
  await page.locator('.workspace-conversations').waitFor();
  const list=await api('/api/portal/conversations');assert.equal(list.status,200);
  assert.ok(!JSON.stringify(list.body).includes(thread.id));
  assert.equal((await api('/api/portal/conversations/'+thread.id+'/messages')).status,404);
  assert.ok(!(await page.locator('.workspace-conversations').textContent()).includes(workerText));
  dashboard=(await api('/api/portal/dashboard')).body;
  assert.ok(dashboard.requests.some(item=>item.id===request.id&&item.status==='in_progress'));
  record('client tracks its request while worker-management messages stay inaccessible');
  const primaryAfter=fixture.primarySnapshot();assert.deepEqual(primaryAfter,primaryBefore,'developer actions must not mutate any primary business or account table');
  receipt.primaryData={unchanged:true,excludedAuthenticationTables:['vps_sessions','vps_login_limits'],tables:primaryAfter};
  record('all primary data, identities and grants remain byte-equivalent at the row level');
  assert.equal(context.pages().length,1);assert.deepEqual(receipt.errors,[]);
  receipt.status='PASS';
}
try{await run();}
catch(error){
  receipt.status=browserPolicyBlocked(error)?'BLOCKED':'FAIL';
  if(receipt.status==='BLOCKED')receipt.reason='BROWSER_POLICY_BLOCK';
  receipt.failure={message:safeText(error.message),stack:safeText(error.stack)};
  await captureDraftNavigation('failure');
  if(page&&!page.isClosed()){
    try{await page.screenshot({path:resolve(output,'failure.png'),timeout:5000,mask:[page.locator('input[type="password"],input[name="password"],input[name="token"]')]});receipt.failureScreenshot='failure.png';}
    catch(problem){receipt.screenshotError=safeText(problem.message);}
  }
  if(fixture&&primaryBefore){try{receipt.primaryDataUnchanged=JSON.stringify(fixture.primarySnapshot())===JSON.stringify(primaryBefore);}catch{receipt.primaryDataUnchanged='UNKNOWN';}}
}
finally{
  if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});if(fixture)await fixture.close().catch(()=>{});
  receipt.finishedAt=new Date().toISOString();await mkdir(output,{recursive:true});
  await writeFile(resolve(output,'developer-browser-receipt.json'),safeText(JSON.stringify(receipt,null,2))+'\n');
  console.log('KNABA_DEVELOPER_BROWSER '+safeText(JSON.stringify(receipt)));
  process.exitCode=receipt.status==='PASS'?0:receipt.status==='BLOCKED'?2:1;
}
