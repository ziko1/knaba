/** Genuine HTTPS + SQLite browser acceptance on synthetic data; no live URL is accepted. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url);
const output=resolve(process.env.KNABA_ROLE_QA_DIR||'/tmp/knaba-role-browser-evidence');
const receipt={startedAt:new Date().toISOString(),environment:'isolated HTTPS / real SQLite / synthetic accounts',checks:[],errors:[]};
const browserPolicyBlocked=error=>/ERR_BLOCKED_BY_ADMINISTRATOR|No usable sandbox|Chromium sandboxing failed|Failed to move to new namespace|Running as root without/i.test(String(error));
const record=(name,detail={})=>receipt.checks.push({name,status:'PASS',...detail});
const widths=[320,390,768,1024,1440];
let fixture,browser;
const contexts=[];
const accountReturnFocus=new WeakMap();
const pageNetwork=new WeakMap();
function safeText(value){
  let text=String(value);
  for(const secret of [fixture?.password,'Synthetic-browser-only-2026','incorrect-synthetic-password'].filter(Boolean))text=text.replaceAll(secret,'[redacted]');
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[synthetic-email]')
    .replace(/((?:knaba_session|token|password|authorization)\s*[=:]\s*)[^\s,;"'<>]+/gi,'$1[redacted]');
}
async function overflow(page,label){
  const value=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,
    dialog:[...document.querySelectorAll('dialog[open]')].map(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth}))}));
  assert.ok(value.width<=value.viewport+1,label+' document overflow '+JSON.stringify(value));
  for(const dialog of value.dialog)assert.ok(dialog.width<=value.viewport+1&&dialog.scroll<=dialog.client+1,label+' dialog overflow '+JSON.stringify(value));
}
async function newPage(viewport={width:390,height:844}){
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport,reducedMotion:'reduce'});
  contexts.push(context);const page=await context.newPage();
  page.setDefaultTimeout(15000);
  const network={pending:new Map(),recent:[]};pageNetwork.set(page,network);
  page.on('request',request=>{
    const url=new URL(request.url());
    network.pending.set(request,{origin:url.origin===fixture?.origin?'fixture':url.origin,
      path:url.pathname.slice(0,300),method:request.method(),type:request.resourceType(),startedAt:Date.now()});
  });
  page.on('response',response=>{
    const item=network.pending.get(response.request());if(item)item.status=response.status();
  });
  const finished=(request,failure)=>{
    const item=network.pending.get(request);if(!item)return;
    network.pending.delete(request);
    const {startedAt,...detail}=item;
    network.recent.push({...detail,durationMs:Date.now()-startedAt,...(failure?{failure:safeText(failure)}:{})});
    if(network.recent.length>40)network.recent.shift();
  };
  page.on('requestfinished',request=>finished(request));
  page.on('requestfailed',request=>finished(request,request.failure()?.errorText||'Request failed'));
  page.on('pageerror',error=>receipt.errors.push({url:new URL(page.url()).pathname,message:safeText(error.message)}));
  page.on('popup',()=>receipt.errors.push({url:new URL(page.url()).pathname,message:'Unexpected popup: this workflow must stay in one tab'}));
  return page;
}
async function closeCompletedPage(page){
  // Close only after the case has passed. On assertion or JavaScript failure,
  // leave its context alive for the existing masked screenshot diagnostics.
  assert.deepEqual(receipt.errors,[],'browser JavaScript errors before completed-context cleanup');
  const context=page.context();
  await context.close();
  const index=contexts.indexOf(context);
  if(index!==-1)contexts.splice(index,1);
}
async function navigate(page,path){
  assert.ok(path.startsWith('/')&&!path.startsWith('//'),'navigation must remain in the synthetic fixture');
  // Polling and unrelated resources are not a readiness contract. Each caller
  // below still waits for its actual form, authorized role, module or job card.
  const response=await page.goto(fixture.origin+path,{waitUntil:'domcontentloaded'});
  assert.equal(response?.status(),200,'fixture document must load successfully: '+path.split('?')[0]);
  return response;
}
async function reloadPage(page){
  const response=await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(response?.status(),200,'fixture document reload must succeed');
}
async function pageDiagnostic(page){
  const network=pageNetwork.get(page);
  const pending=network?[...network.pending.values()].map(({startedAt,...item})=>({...item,elapsedMs:Date.now()-startedAt})):[];
  const dom=await page.evaluate(()=>{
    const visible=selector=>[...document.querySelectorAll(selector)].some(node=>node.getClientRects().length>0);
    return {readyState:document.readyState,welcomeVisible:visible('.portal-welcome'),
      role:document.querySelector('.portal-shell')?.getAttribute('data-knaba-role')??null,
      portalVisible:visible('.portal-shell'),managementVisible:visible('.kncc-layout'),
      dialogOpen:Boolean(document.querySelector('dialog[open]')),
      alerts:[...document.querySelectorAll('[role="alert"]')].filter(node=>node.getClientRects().length)
        .map(node=>(node.textContent||'').trim().slice(0,300)).filter(Boolean)};
  });
  // No request body, response body, query string, credential header or cookie
  // is collected. These diagnostics distinguish UI readiness from transport.
  return {dom,network:{pending,recent:network?.recent??[]}};
}
async function clickAccountEntry(page){
  const header=page.locator('header .account-link');
  if(await header.isVisible()){
    accountReturnFocus.set(page,header);await header.click();
  }else{
    const menu=page.locator('details.mobile-nav'),summary=menu.locator(':scope > summary');
    if(!await menu.evaluate(el=>el.open))await summary.click();
    accountReturnFocus.set(page,summary);
    await menu.locator('a[data-account-access="login"]').click();
  }
}
async function assertAccountReturnFocus(page){
  const trigger=accountReturnFocus.get(page);
  assert.ok(trigger,'account entry must record its visible return target');
  assert.equal(await trigger.isVisible(),true);
  assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
}
async function openDialog(page){
  await clickAccountEntry(page);
  const dialog=page.locator('dialog[open]');
  await dialog.waitFor({state:'visible'});
  await dialog.locator('form input[name="email"]').waitFor({state:'visible'});
  return dialog;
}
async function chooseRole(dialog,role){
  const control=dialog.locator('[data-account-role="'+role+'"]');
  await control.click();
}
async function submitLogin(page,role,{requested=role}={}){
  const before=page.url(),pageCount=page.context().pages().length;
  const dialog=await openDialog(page);
  await chooseRole(dialog,requested==='owner'?'admin':requested);
  await dialog.locator('input[name="email"]').fill(fixture.identities[role].email);
  await dialog.locator('input[name="password"]').fill(fixture.password);
  const management=role==='owner'||role==='admin';
  await Promise.all([
    page.waitForURL(url=>url.origin===fixture.origin&&url.pathname===(management?'/admin/':'/konto/')),
    dialog.locator('form button[type="submit"]').click()
  ]);
  const destination=new URL(page.url());
  assert.notEqual(page.url(),before,'successful sign-in automatically opens the actual role workspace');
  assert.equal(destination.searchParams.get('lang'),'en');
  assert.equal(page.context().pages().length,pageCount,'sign-in must use the current tab');
  const proof=await apiFromPage(page,'/api/portal/session');
  assert.equal(proof.status,200);assert.equal(proof.body.role,role,'the selected role hint never changes server authority');
  record('sign-in automatically opens the server-authorized workspace in the same tab',{role,requested,path:destination.pathname});
}
async function apiFromPage(page,path,method='GET',body){
  return page.evaluate(async({path,method,body})=>{
    const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),
      headers:{'Content-Type':'application/json','X-KnaBa-Request':'portal-v1'},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  },{path,method,body});
}
async function focusDiagnostic(page){
  return page.evaluate(()=>{
    const active=document.activeElement,title=document.querySelector('.portal-content-heading h2'),skip=document.querySelector('.skip-link');
    return {active:active?{tag:active.tagName,id:active.id,classes:typeof active.className==='string'?active.className:'',tabIndex:active.tabIndex}:null,
      portalTitle:{present:Boolean(title),tabIndex:title?.tabIndex,focused:active===title},
      skipFocused:active===skip,documentFocused:document.hasFocus(),scrollY};
  });
}
async function requestsTab(page){
  await page.locator('.portal-sidebar .portal-tab').filter({hasText:'Requests & jobs'}).click();
  await page.locator('.portal-request-card').first().waitFor();
  try{
    await page.waitForFunction(()=>document.querySelector('.portal-content-heading h2')===document.activeElement);
  }catch(error){receipt.focusFailure=await focusDiagnostic(page);throw error;}
}
async function confirmClick(page,control,accept){
  let type;
  const handled=page.waitForEvent('dialog').then(async dialog=>{
    type=dialog.type();
    if(accept)await dialog.accept();else await dialog.dismiss();
  });
  await Promise.all([handled,control.click()]);
  assert.ok(['confirm','beforeunload'].includes(type),'leaving an edited Studio must ask for confirmation');
}
async function waitForModule(page,view){
  const root={operations:'.portal-shell[data-knaba-role="owner"]',crm:'.kncrm',messages:'.ki-grid',studio:'.studio-workspace'}[view];
  await page.locator(root).waitFor({state:'visible'});
  if(view==='operations')await requestsTab(page);
  if(view==='crm'){
    await page.locator('.kncrm-contact').first().waitFor();
    await page.locator('.kncrm-contact').first().click();
    await page.locator('.kncrm-form').waitFor();
  }
  if(view==='messages'){
    await page.locator('.ki-list-entry').first().waitFor();
    await page.locator('.ki-list-entry').first().click();
    await page.locator('.ki-thread-head').waitFor();
    await page.locator('.ki-message').first().waitFor();
  }
  assert.equal(await page.locator('.kncc-module [role="alert"]:visible').count(),0,view+' module must load without a gate or API error');
}
async function dirtyStudio(page){
  await navigate(page,'/admin/?lang=en&view=studio');
  await waitForModule(page,'studio');
  await page.locator('#studio-language').selectOption('en');
  await page.locator('.studio-mode-toggle').getByRole('button',{name:'Manual · JSON',exact:true}).click();
  const editor=page.locator('#studio-json-editor');
  await editor.fill('[\n]\n');
  await page.locator('.studio-manual [role="status"]').waitFor();
  return editor;
}
async function accountLifecycleCases(){
  const mobile=await newPage({width:390,height:844});
  await navigate(mobile,'/en/');
  const mobileUrl=mobile.url(),summary=mobile.locator('details.mobile-nav > summary');
  await summary.click();
  await mobile.locator('details.mobile-nav a[data-account-access="login"]').click();
  await mobile.locator('dialog[open] input[name="email"]').waitFor();
  assert.equal(await mobile.locator('details.mobile-nav').evaluate(el=>el.open),false);
  await mobile.keyboard.press('Escape');
  assert.equal(await mobile.locator('dialog[open]').count(),0);
  assert.equal(await summary.isVisible(),true);
  assert.equal(await summary.evaluate(el=>el===document.activeElement),true);
  assert.equal(mobile.url(),mobileUrl);
  record('mobile account menu returns focus to its visible summary',{width:390});
  await closeCompletedPage(mobile);

  const modes=await newPage();
  await navigate(modes,'/en/');
  await submitLogin(modes,'worker');
  await modes.locator('.portal-shell[data-knaba-role="worker"]').waitFor();
  // Exercise the real delegated /join/ navigation without adding production UI.
  await modes.evaluate(()=>{
    const link=document.createElement('a');link.href='/join/?lang=en';
    link.dataset.qaRequestMode='true';link.textContent='Synthetic request-mode navigation';
    document.querySelector('main').append(link);
  });
  const modesUrl=modes.url();
  await modes.locator('[data-qa-request-mode]').click();
  const modeDialog=modes.locator('dialog[open]');
  await modeDialog.locator('select[name="intent"]').waitFor();
  const rediscovered=modes.waitForResponse(response=>new URL(response.url()).pathname==='/api/portal/session');
  await modeDialog.getByRole('button',{name:'Back to sign-in',exact:true}).click();
  const proof=await rediscovered;assert.equal(proof.status(),200);assert.equal((await proof.json()).role,'worker');
  const destination=modeDialog.locator('[data-account-destination="portal"]');
  await destination.waitFor();
  assert.equal(new URL(await destination.getAttribute('href'),fixture.origin).searchParams.get('cabinet'),'worker');
  assert.equal(await modeDialog.locator('input[name="password"]').count(),0);
  assert.equal(await modeDialog.locator('[data-account-destination="admin"]').count(),0);
  assert.equal(modes.url(),modesUrl);
  await modes.keyboard.press('Escape');
  await modes.locator('[data-qa-request-mode]').evaluate(el=>el.remove());
  record('request-mode entry rediscovers the existing server role when returning to sign-in');
  await closeCompletedPage(modes);

  const race=await newPage();
  await navigate(race,'/konto/?lang=en');
  await race.locator('.portal-welcome').waitFor();
  const anonymous=await apiFromPage(race,'/api/portal/session');
  assert.equal(anonymous.status,200);assert.equal(anonymous.body.role,'anonymous');
  assert.equal(await race.locator('.portal-page-intro h1').textContent(),'A clear plan. Work that runs smoothly.');
  assert.equal(await race.locator('.portal-welcome a[data-account-access="login"]').evaluate(element=>{
    const box=element.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight;
  }),true,'anonymous sign-in action must be reachable in the initial mobile viewport');
  record('anonymous portal is localized and presents sign-in within the mobile viewport',{width:390});
  const raceUrl=race.url(),raceDialog=await openDialog(race);
  await chooseRole(raceDialog,'partner');
  await raceDialog.locator('[name="email"]').fill(fixture.identities.partner.email);
  await raceDialog.locator('[name="password"]').fill(fixture.password);
  let releaseProof,markCaptured,rejectCaptured,routeError;
  const held=[];
  const gate=new Promise(resolve=>{releaseProof=resolve;});
  const captured=new Promise((resolve,reject)=>{markCaptured=resolve;rejectCaptured=reject;});
  const routePattern='**/api/portal/session';
  const holdProof=route=>{
    const task=(async()=>{try{
      // The real POST installs the real HttpOnly cookie. Only delivery of its
      // following real session proofs is delayed; no role or response is mocked.
      // Both the dialog and the mounted portal may revalidate simultaneously.
      const response=await route.fetch({timeout:15000});
      assert.equal(response.status(),200);assert.equal((await response.json()).role,'partner');
      markCaptured();await gate;
      try{await route.fulfill({response});}
      catch(error){if(!route.request().failure())throw error;}
    }catch(error){routeError=error;rejectCaptured(error);}})();
    held.push(task);return task;
  };
  await race.route(routePattern,holdProof);
  try{
    const requested=race.waitForRequest(request=>new URL(request.url()).pathname==='/api/portal/session');
    await raceDialog.locator('form button[type="submit"]').click();
    await requested;await captured;
    await race.keyboard.press('Escape');
    assert.equal(await race.locator('dialog[open]').count(),0);
    await assertAccountReturnFocus(race);
    releaseProof();await Promise.all(held);
    if(routeError)throw routeError;
    await race.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await race.locator('dialog[open]').count(),0,'a late proof must not resurrect the closed dialog');
    assert.equal(race.url(),raceUrl,'closing the dialog before proof arrives must cancel automatic navigation');
    await race.locator('.portal-shell[data-knaba-role="partner"]').waitFor();
    assert.equal((await apiFromPage(race,'/api/portal/session')).body.role,'partner');
    await clickAccountEntry(race);
    const reopened=race.locator('dialog[open]');
    await reopened.locator('[data-account-destination="portal"]').waitFor();
    assert.equal(await race.locator('dialog').count(),1);
    assert.equal(new URL(await reopened.locator('[data-account-destination="portal"]').getAttribute('href'),fixture.origin).searchParams.get('cabinet'),'partner');
    assert.equal(await reopened.locator('input[name="password"]').count(),0);
    assert.equal(race.url(),raceUrl);
    await race.keyboard.press('Escape');
    record('closing during deferred login proof refreshes the portal; late proof stays closed and reopening shows the actual role');
  }finally{releaseProof();await race.unroute(routePattern,holdProof);}
  await closeCompletedPage(race);
}
async function anonymousInquiryCase(owner,admin){
  const visitor=await newPage();
  const usersBefore=fixture.db.prepare('SELECT COUNT(*) AS total FROM vps_users').get().total;
  const profilesBefore=fixture.db.prepare('SELECT COUNT(*) AS total FROM profiles').get().total;
  const requestsBefore=fixture.db.prepare('SELECT COUNT(*) AS total FROM cleaning_requests').get().total;
  await navigate(visitor,'/konto/?lang=en');
  await visitor.locator('.portal-welcome').waitFor();
  const session=await apiFromPage(visitor,'/api/portal/session');
  assert.equal(session.status,200);assert.equal(session.body.role,'anonymous');assert.equal(session.body.user,null);
  const originalUrl=visitor.url(),pageCount=visitor.context().pages().length;
  let documentNavigations=0;
  const countNavigation=request=>{if(request.isNavigationRequest()&&request.frame()===visitor.mainFrame())documentNavigations++;};
  visitor.on('request',countNavigation);
  const identity=Date.now().toString(36);
  const name='QA anonymous project visitor';
  const email='qa-anonymous-'+identity+'@example.invalid';
  const message='Synthetic anonymous browser enquiry '+identity+'. Test data only; no external contact or delivery requested.';
  await visitor.locator('#portal-public-inquiry > summary').click();
  const wizard=visitor.locator('#portal-public-inquiry .wizard');
  await wizard.locator('#inquiry-service').selectOption('baureinigung');
  await wizard.locator('form button[type="submit"]').click();
  await wizard.locator('#inquiry-object').selectOption('Baustelle');
  await wizard.locator('#inquiry-postcode').fill('10317');
  await wizard.locator('#inquiry-area').fill('185');
  await wizard.locator('#inquiry-frequency').selectOption('Einmalig');
  await wizard.locator('form button[type="submit"]').click();
  await wizard.locator('#inquiry-name').fill(name);
  await wizard.locator('#inquiry-email').fill(email);
  await wizard.locator('#inquiry-message').fill(message);
  await wizard.locator('form button[type="submit"]').click();
  const summary=wizard.locator('#inquiry-summary');await summary.waitFor();
  const reviewed=await summary.inputValue();
  for(const value of [name,email,message,'10317','185'])assert.ok(reviewed.includes(value),'review must contain the visitor’s entered details');
  assert.equal(fixture.db.prepare('SELECT COUNT(*) AS total FROM cleaning_requests').get().total,requestsBefore,'reviewing is not submission');
  const send=wizard.locator('.wizard-actions > button.button-dark[type="button"]');
  assert.equal(await send.isDisabled(),true,'privacy consent is required before sending');
  await wizard.locator('.privacy-check input[type="checkbox"]').check();
  const [response]=await Promise.all([
    visitor.waitForResponse(value=>new URL(value.url()).pathname==='/api/leads'&&value.request().method()==='POST'),
    send.click()
  ]);
  assert.equal(new URL(response.url()).origin,fixture.origin);
  assert.equal(response.status(),201,'the real anonymous intake endpoint must persist a new enquiry');
  const received=await response.json();
  assert.equal(received.received,true);assert.equal(typeof received.id,'string');assert.ok(received.id.length>0);
  const receiptCode=wizard.locator('.receipt-card code');await receiptCode.waitFor();
  assert.equal(await receiptCode.textContent(),received.id,'visible receipt matches the persisted server identifier');
  const row=fixture.db.prepare('SELECT id,client_id,status,contact_name,email,postcode,area,message FROM cleaning_requests WHERE id=?').get(received.id);
  assert.ok(row);assert.equal(row.client_id,null);assert.equal(row.status,'new');
  assert.equal(row.contact_name,name);assert.equal(row.email,email);assert.equal(row.postcode,'10317');assert.equal(row.area,'185');
  assert.ok(row.message.includes(message));
  assert.equal(fixture.db.prepare('SELECT COUNT(*) AS total FROM cleaning_requests').get().total,requestsBefore+1,'one submission creates one enquiry');
  assert.equal(fixture.db.prepare('SELECT COUNT(*) AS total FROM vps_users').get().total,usersBefore,'a public enquiry must not create an account');
  assert.equal(fixture.db.prepare('SELECT COUNT(*) AS total FROM profiles').get().total,profilesBefore,'a public enquiry must not grant a role');
  assert.equal((await apiFromPage(visitor,'/api/portal/session')).body.role,'anonymous');
  assert.equal(visitor.url(),originalUrl);assert.equal(documentNavigations,0,'all three steps, review and receipt stay in the same document');
  assert.equal(visitor.context().pages().length,pageCount,'the enquiry must not open another tab');
  visitor.off('request',countNavigation);
  for(const [role,page] of [['owner',owner],['admin',admin]]){
    await navigate(page,'/konto/?lang=en');await requestsTab(page);
    const card=page.locator('.portal-request-card').filter({hasText:message});await card.waitFor();
    assert.equal(await card.count(),1,role+' sees exactly the persisted anonymous enquiry');
    await card.locator('.portal-details > summary').click();
    assert.ok((await card.locator('.portal-code').textContent()).includes(received.id.slice(-8).toUpperCase()));
    const details=await card.locator('.portal-details').innerText();
    assert.ok(details.includes(name)&&details.includes(email)&&details.includes(message),role+' can read the real submitted contact and request');
  }
  record('new anonymous visitor completes inline three-step enquiry, receives persisted receipt and is visible to owner/admin without creating an account or new tab',
    {steps:3,endpoint:'/api/leads',httpStatus:201,accountCreated:false,managementVisibility:['owner','admin']});
}

async function run(){
  await mkdir(output,{recursive:true});
  let drivers;
  try{drivers=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');}
  catch(error){receipt.status='BLOCKED';receipt.reason='PLAYWRIGHT_UNAVAILABLE';return;}
  const skip=(process.env.KNABA_BROWSER_SKIP||'').split(',');
  receipt.engines=[];
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
  receipt.browserVersion=browser.version();const {createRoleUxFixture}=await import('./fixtures/role-ux-server.mjs');fixture=await createRoleUxFixture();
  receipt.migrations=fixture.db.prepare('SELECT count(*) n FROM vps_schema_migrations').get().n;
  const home=await newPage();
  for(const locale of ['de','en','uk','ru']){
    for(const width of widths){
      await home.setViewportSize({width,height:844});
      const path=locale==='de'?'/':'/'+locale+'/';
      const response=await navigate(home,path);
      assert.equal(response.status(),200);
      let navigation=0;const observed=request=>{if(request.isNavigationRequest()&&request.frame()===home.mainFrame())navigation++;};
      home.on('request',observed);
      const before=home.url();const dialog=await openDialog(home);
      assert.equal(await dialog.locator('[data-account-role]').count(),5);
      await overflow(home,'modal '+locale+' '+width);
      assert.equal(home.url(),before);assert.equal(navigation,0,'opening account must not navigate');
      assert.equal(await home.evaluate(()=>document.querySelector('dialog[open]')?.contains(document.activeElement)),true);
      const stopCount=await dialog.locator('a[href],button,input,select,textarea,[tabindex="0"]').evaluateAll(elements=>
        elements.filter(el=>!el.disabled&&el.getClientRects().length).length);
      assert.ok(stopCount>=6,'dialog exposes keyboard-operable role and form controls');
      for(const key of ['Tab','Shift+Tab'])for(let i=0;i<stopCount+2;i++){
        await home.keyboard.press(key);
        assert.equal(await home.evaluate(()=>document.querySelector('dialog[open]')?.contains(document.activeElement)),true,'focus must wrap inside dialog in both directions');
      }
      if(locale==='uk'&&width===390)await home.screenshot({path:resolve(output,'login-uk-390.png')});
      if(locale==='de'&&width===1440)await home.screenshot({path:resolve(output,'login-de-1440.png')});
      await home.keyboard.press('Escape');
      assert.equal(await home.locator('dialog[open]').count(),0);
      await assertAccountReturnFocus(home);
      assert.equal(navigation,0);home.off('request',observed);
      record('public modal, keyboard and no reload',{locale,width});
    }
  }
  await home.setViewportSize({width:667,height:320});
  await navigate(home,'/en/');
  await openDialog(home);await overflow(home,'short landscape');
  const close=home.locator('dialog[open] button').first();await close.scrollIntoViewIfNeeded();
  assert.equal(await close.isVisible(),true);
  await home.keyboard.press('Escape');record('short landscape modal',{width:667,height:320});
  await closeCompletedPage(home);
  await accountLifecycleCases();

  const errors=await newPage();await navigate(errors,'/en/');
  let dialog=await openDialog(errors);await chooseRole(dialog,'client');
  await dialog.locator('[name=email]').fill('client@example.test');
  await dialog.locator('[name=password]').fill('incorrect-synthetic-password');
  const original=errors.url();let documents=0;
  errors.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===errors.mainFrame())documents++;});
  const denied=errors.waitForResponse(response=>new URL(response.url()).pathname==='/login/'&&response.request().method()==='POST');
  await dialog.locator('form button[type=submit]').click();
  assert.equal((await denied).status(),401);
  await dialog.locator('[role=alert]').waitFor();
  assert.equal(errors.url(),original);assert.equal(documents,0);
  assert.equal(await dialog.locator('[name=email]').inputValue(),'client@example.test');
  const credentialsError=await dialog.locator('[role=alert]').textContent();
  await errors.context().setOffline(true);
  const failed=errors.waitForEvent('requestfailed',{predicate:request=>new URL(request.url()).pathname==='/login/'&&request.method()==='POST'});
  await dialog.locator('form button[type=submit]').click();
  await failed;
  await dialog.locator('[role=alert]').waitFor();
  await errors.waitForFunction(previous=>{
    const root=document.querySelector('dialog[open]');
    const submit=root?.querySelector('form button[type="submit"]');
    const message=root?.querySelector('[role="alert"]')?.textContent;
    return submit&&!submit.disabled&&message&&message!==previous;
  },credentialsError);
  assert.equal(errors.url(),original);assert.equal(documents,0);
  assert.equal(await dialog.locator('[name=email]').inputValue(),'client@example.test');
  await errors.context().setOffline(false);await errors.keyboard.press('Escape');
  record('invalid credentials and network failure retain in-page form');
  await closeCompletedPage(errors);

  const pages={};
  for(const role of ['client','worker','partner','bauleiter','admin','owner']){
    const page=await newPage();pages[role]=page;
    await navigate(page,'/en/');
    await submitLogin(page,role,{requested:role==='client'?'admin':role});
    if(role==='admin'||role==='owner')await page.locator('.kncc-layout').waitFor();
    else await page.locator('.portal-shell[data-knaba-role="'+role+'"]').waitFor();
    const session=await apiFromPage(page,'/api/portal/session');assert.equal(session.body.role,role);
    const dashboard=await apiFromPage(page,'/api/portal/dashboard');assert.equal(dashboard.status,200);
    const expected=role==='admin'||role==='owner'?3:1;
    assert.equal(dashboard.body.requests.length,expected,role+' scoped requests');
    const expectedIds=['owner','admin'].includes(role)?Object.values(fixture.requests).map(request=>request.id):
      [fixture.requests[role==='partner'?'partner':'client'].id];
    assert.deepEqual(dashboard.body.requests.map(request=>request.id).sort(),expectedIds.sort(),role+' sees only the correct requests');
    if(!['owner','admin'].includes(role)){
      assert.equal((await apiFromPage(page,'/api/crm/contacts')).status,403);
      assert.equal((await apiFromPage(page,'/api/studio/page?page=%2F')).status,403);
      assert.equal((await apiFromPage(page,'/api/portal/roles','POST',{
        userId:fixture.identities[role].id,role:'admin',status:'approved',version:1})).status,403);
    }
    for(const width of widths){
      await page.setViewportSize({width,height:844});await overflow(page,role+' '+width);
      if(role==='owner'||role==='admin'){
        if(width<=800){
          const toggle=page.locator('.kncc-nav-toggle');
          if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
          await page.locator('.kncc-navigation').waitFor();
        }
        const names=await page.locator('.kncc-nav-item:visible').allTextContents();assert.ok(names.length>=3);
        if(width<=800){
          await page.keyboard.press('Escape');assert.equal(await page.locator('.kncc-nav-toggle').getAttribute('aria-expanded'),'false');
          assert.equal(await page.locator('.kncc-nav-toggle').evaluate(el=>el===document.activeElement),true);
        }
      }else{
        const sizes=await page.locator('.portal-tab').evaluateAll(elements=>elements.map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})));
        assert.ok(sizes.every(s=>s.w>=44&&s.h>=44),role+' touch targets');
        await requestsTab(page);await overflow(page,role+' list '+width);
        if(role==='bauleiter'&&width===390)await page.screenshot({path:resolve(output,'bauleiter-390.png'),fullPage:true});
      }
      record('authenticated role layout and navigation',{role,width});
    }
    await reloadPage(page);
    await page.locator(role==='owner'||role==='admin'?'.kncc-layout':'.portal-shell[data-knaba-role="'+role+'"]').waitFor();
    assert.equal((await apiFromPage(page,'/api/portal/session')).body.role,role);
    record('authenticated refresh retains session',{role});
  }
  record('an administrator role hint cannot grant a client administrator access');
  for(const role of ['pending','suspended']){
    const page=await newPage();await navigate(page,'/en/');
    await submitLogin(page,role,{requested:'worker'});
    await page.locator('.portal-wait').waitFor();
    assert.equal(await page.locator('.portal-shell').count(),0);
    assert.equal((await apiFromPage(page,'/api/portal/session')).body.role,role);
    const restricted=await apiFromPage(page,'/api/portal/dashboard');
    assert.equal(restricted.status,200);
    assert.deepEqual(restricted.body.requests,[]);
    assert.deepEqual(restricted.body.profiles,[]);
    assert.deepEqual(restricted.body.audit,[]);
    await overflow(page,role+' access state');
    record('unapproved access shows its actual state and cannot load private jobs',{role});
    await closeCompletedPage(page);
  }
  // Every actual management module is exercised inside the reduced content width.
  const admin=pages.owner;
  for(const width of widths){
    await admin.setViewportSize({width,height:844});
    for(const view of ['operations','crm','messages','studio']){
      await navigate(admin,'/admin/?lang=en&view='+view);
      await admin.locator('.kncc-layout').waitFor();
      await admin.locator('.kncc-module-heading').waitFor();
      await waitForModule(admin,view);
      await overflow(admin,'admin '+view+' '+width);
      if(width===390&&view==='operations')await admin.screenshot({path:resolve(output,'admin-operations-390.png'),fullPage:true});
      record('management module layout',{view,width});
    }
  }
  // Genuine manual editor input drives the existing dirty event; no synthetic
  // event injection can make a missing editor integration appear to pass.
  await admin.setViewportSize({width:390,height:844});
  let editor=await dirtyStudio(admin);
  const studioUrl=admin.url();
  let internalDocuments=0;
  const countInternal=request=>{if(request.isNavigationRequest()&&request.frame()===admin.mainFrame())internalDocuments++;};
  admin.on('request',countInternal);
  await admin.locator('.kncc-nav-toggle').click();
  await admin.locator('.kncc-nav-item').filter({hasText:'Overview'}).click();
  await admin.locator('.kncc-intro h2').waitFor();
  assert.equal(await editor.count(),1,'the editor stays mounted when changing management sections');
  assert.equal(await editor.isVisible(),false);assert.equal(await editor.inputValue(),'[\n]\n');
  await admin.goBack();
  await editor.waitFor({state:'visible'});
  assert.equal(admin.url(),studioUrl);assert.equal(await editor.inputValue(),'[\n]\n');
  assert.equal(internalDocuments,0,'section navigation and Back keep the current document and editor draft');
  admin.off('request',countInternal);
  await confirmClick(admin,admin.locator('header.header a.brand'),false);
  assert.equal(admin.url(),studioUrl);assert.equal(await editor.inputValue(),'[\n]\n');
  const homeLink=admin.locator('header.header a.brand');
  const publicPath=new URL(await homeLink.getAttribute('href'),fixture.origin).pathname;
  await confirmClick(admin,homeLink,true);
  await admin.waitForURL(url=>url.pathname===publicPath);
  await admin.locator('.kncc-layout').waitFor({state:'hidden'});
  record('dirty Studio survives section switching and browser Back; cancelled page exit keeps edits and confirmed exit works');
  // Main job journey: an actual customer submits, admin assigns, Bauleiter schedules,
  // employee reports completion, customer reads and records feedback.
  const client=pages.client,jobAdmin=pages.admin,manager=pages.bauleiter,worker=pages.worker;
  await navigate(client,'/konto/?lang=en');
  await client.locator('.portal-tab').filter({hasText:'New request'}).click();
  const form=client.locator('.portal-content form');
  await form.locator('[name=postcode]').fill('10315');await form.locator('[name=area]').fill('420');
  const message='QA new browser workflow '+Date.now();
  await form.locator('[name=message]').fill(message);await form.locator('input[type=checkbox]').check();
  await form.locator('button[type=submit]').click();
  await client.locator('.portal-request-card').filter({hasText:message}).waitFor();
  let row=fixture.db.prepare('SELECT id,version,status FROM cleaning_requests WHERE message=?').get(message);
  assert.ok(row);assert.equal(row.status,'new');
  await navigate(jobAdmin,'/konto/?lang=en');await requestsTab(jobAdmin);
  let card=jobAdmin.locator('.portal-request-card').filter({hasText:message});
  await card.getByRole('button',{name:/Plan job/}).click();
  await card.getByRole('combobox',{name:'Status',exact:true}).selectOption('reviewing');
  await card.getByRole('combobox',{name:'Assigned site manager',exact:true}).selectOption(fixture.identities.bauleiter.id);
  await card.getByRole('button',{name:'Save changes',exact:true}).click();
  await card.locator('form').waitFor({state:'hidden'});
  await navigate(manager,'/konto/?lang=en');await requestsTab(manager);
  card=manager.locator('.portal-request-card').filter({hasText:message});
  await card.getByRole('button',{name:/Plan job/}).click();
  await card.getByRole('combobox',{name:'Status',exact:true}).selectOption('scheduled');
  await card.getByRole('combobox',{name:'Assigned employee',exact:true}).selectOption(fixture.identities.worker.id);
  await card.locator('input[type=datetime-local]').fill('2026-11-05T10:00');
  await card.getByRole('button',{name:'Save changes',exact:true}).click();await card.locator('form').waitFor({state:'hidden'});
  await navigate(worker,'/konto/?lang=en');await requestsTab(worker);
  card=worker.locator('.portal-request-card').filter({hasText:message});
  await card.getByRole('button',{name:/Update job/}).click();
  await card.getByRole('combobox',{name:'Status',exact:true}).selectOption('in_progress');
  await card.getByRole('button',{name:'Save changes',exact:true}).click();await card.locator('form').waitFor({state:'hidden'});
  await card.getByRole('button',{name:/Update job/}).click();
  for(const checkbox of await card.locator('.portal-checklist input[type=checkbox]').all())await checkbox.check();
  await card.getByLabel('Internal job report',{exact:true}).fill('Synthetic browser report: all agreed work checked.');
  await card.getByRole('combobox',{name:'Status',exact:true}).selectOption('completed');
  await card.getByRole('button',{name:'Save changes',exact:true}).click();await card.locator('form').waitFor({state:'hidden'});
  await reloadPage(client);await requestsTab(client);
  card=client.locator('.portal-request-card').filter({hasText:message});
  await card.getByRole('button',{name:/Your feedback/}).click();
  await card.getByLabel('Your feedback',{exact:true}).fill('Synthetic acceptance: completed work received.');
  await card.getByRole('button',{name:'Save changes',exact:true}).click();await card.locator('form').waitFor({state:'hidden'});
  row=fixture.db.prepare('SELECT status,customer_feedback,worker_note FROM cleaning_requests WHERE id=?').get(row.id);
  assert.equal(row.status,'completed');assert.match(row.customer_feedback,/completed work received/);
  assert.match(row.worker_note,/all agreed work checked/);
  assert.ok(!(await client.locator('.portal').textContent()).includes(row.worker_note));
  record('full customer → admin → Bauleiter → worker → customer workflow persisted');
  await client.locator('.portal a[href^="/logout/"]').click();
  await client.locator('form[action="/logout/"]').waitFor();
  assert.equal((await apiFromPage(client,'/api/portal/session')).body.role,'client','GET logout confirmation must not revoke a session');
  await client.locator('form[action="/logout/"] button[type="submit"]').click();
  await client.waitForURL(url=>url.pathname==='/konto/');
  await client.locator('.portal-welcome').waitFor();
  assert.equal((await apiFromPage(client,'/api/portal/session')).body.role,'anonymous');
  assert.equal((await apiFromPage(client,'/api/portal/dashboard')).status,401);record('logout revokes protected access');
  // Run after all original role/count assertions and the authenticated journey.
  await anonymousInquiryCase(pages.owner,pages.admin);
  assert.deepEqual(receipt.errors,[],'browser JavaScript errors');
  receipt.status='PASS';
}
try{await run();}
catch(error){
  receipt.status=browserPolicyBlocked(error)?'BLOCKED':'FAIL';
  if(receipt.status==='BLOCKED')receipt.reason='BROWSER_POLICY_BLOCK';
  receipt.failure={message:safeText(error.message),stack:safeText(error.stack)};
  receipt.failureScreenshots=[];
  // Each context contains only this fixture's synthetic data. Capture before
  // teardown, masking credential fields even if a visibility toggle was used.
  const pages=contexts.flatMap(context=>context.pages()).filter(page=>!page.isClosed()&&fixture&&page.url().startsWith(fixture.origin+'/'));
  for(const [index,page] of pages.entries()){
    const file='failure-page-'+String(index+1).padStart(2,'0')+'.png';
    try{
      const focus=await focusDiagnostic(page),diagnostic=await pageDiagnostic(page);
      await page.screenshot({path:resolve(output,file),timeout:5000,
        mask:[page.locator('input[type="password"],input[name="password"],input[name="password_confirm"],input[name="token"]')]});
      receipt.failureScreenshots.push({file,path:new URL(page.url()).pathname,viewport:page.viewportSize(),focus,diagnostic});
    }catch(problem){receipt.failureScreenshots.push({file,error:safeText(problem.message)});}
  }
}
finally{
  for(const context of contexts)await context.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  if(fixture)await fixture.close().catch(()=>{});
  receipt.finishedAt=new Date().toISOString();await mkdir(output,{recursive:true});
  await writeFile(resolve(output,'browser-receipt.json'),safeText(JSON.stringify(receipt,null,2))+'\n');
  console.log('KNABA_ROLE_BROWSER '+safeText(JSON.stringify(receipt)));
  process.exitCode=receipt.status==='PASS'?0:receipt.status==='BLOCKED'?2:1;
}
