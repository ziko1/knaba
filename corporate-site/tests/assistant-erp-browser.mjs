/** Real Chromium + the built Worker/VPS runtime, with an ephemeral local database.
 * Run after npm run build. KNABA_PLAYWRIGHT_MODULE and KNABA_CHROME_PATH may select
 * an already installed browser; this script never downloads one or visits a live site.
 * ERP scheduled delivery is replaced only in the temporary test wrapper. Browser
 * requests and Node fetch are both fenced to loopback. All account/config data is synthetic.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { leadCopy } from '../src/lib/assistant-lead-ui.ts';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const temp=await mkdtemp(join(tmpdir(),'knaba-lead-browser-'));
const artifacts=resolve(process.env.KNABA_BROWSER_ARTIFACTS||join(tmpdir(),'knaba-lead-browser-artifacts-'+Date.now()));
const port=Number(process.env.KNABA_BROWSER_PORT||19641);
const origin=`http://127.0.0.1:${port}`;
const nativeFetch=globalThis.fetch;
const attemptedExternal=[];
globalThis.fetch=(resource,options)=>{
  const url=new URL(typeof resource==='string'||resource instanceof URL?resource:resource.url);
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)){
    attemptedExternal.push(url.origin);throw Error('External fetch forbidden in browser fixture');
  }
  return nativeFetch(resource,options);
};
const services=[{id:'service-cleaning',label:{de:'Baureinigung',en:'Construction cleaning',uk:'Будівельне прибирання',ru:'Строительная уборка'}}];
const erpBindings={ASSISTANT_ERP_ENABLED:'approved',ASSISTANT_ERP_ORIGIN:'https://erp.example.test',ASSISTANT_ERP_SOURCE:'knaba_web',ASSISTANT_ERP_SITE_ID:'synthetic-browser-site',ASSISTANT_ERP_COMPANY_ID:'synthetic-browser-company',ASSISTANT_ERP_KEY_ID:'synthetic-key',ASSISTANT_ERP_SECRET:'synthetic-not-a-real-key-123456789',ASSISTANT_ERP_MAPPING_VERSION:'synthetic-mapping-v1',ASSISTANT_ERP_SERVICES_JSON:JSON.stringify(services)};
const errors=[],consoleErrors=[],results=[];
let app,browser;
try {
  await mkdir(artifacts,{recursive:true});
  const wrapper=join(temp,'worker.mjs');
  await writeFile(wrapper,`import worker from ${JSON.stringify(pathToFileURL(join(root,'dist/server/index.js')).href)};\nlet enabled=true;\nexport function setEnabled(value){enabled=value;}\nexport default {fetch(request,env,ctx){return worker.fetch(request,{...env,ASSISTANT_ERP_ENABLED:enabled?'approved':''},ctx);},scheduled(){}};\n`);
  const controller=await import(pathToFileURL(wrapper).href);
  const {createKnabaVpsServer}=await import('../vps/server.mjs');
  app=await createKnabaVpsServer({dbPath:join(temp,'site.sqlite'),staticRoot:join(root,'dist/client'),workerPath:pathToFileURL(wrapper).href,origin,host:'127.0.0.1',port,localTest:true,erpBindings,ownerEmail:'owner@example.test'});
  browser=await chromium.launch({headless:true,executablePath:process.env.KNABA_CHROME_PATH,args:['--no-sandbox']});
  const watch=async context=>{
    context.setDefaultTimeout(12000);
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin){attemptedExternal.push(url.origin);return route.abort('blockedbyclient');}
      return route.continue();
    });
    context.on('page',page=>{
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    });
  };
  const status=async(page,locale,state)=>{
    await page.locator('.ka-lead-status').filter({hasText:leadCopy[locale].states[state]}).waitFor();
    assert.equal(await page.locator('.ka-lead-status').innerText(),leadCopy[locale].states[state]);
  };
  const open=async(page,prefix)=>{
    await page.goto(origin+prefix+'/',{waitUntil:'networkidle'});
    await page.locator('[data-knaba-open]').click();
    await page.locator('.ka-panel').waitFor();
  };
  const expand=async page=>{if(await page.locator('.ka-lead-toggle').getAttribute('aria-expanded')!=='true')await page.locator('.ka-lead-toggle').click();};
  const overflow=async(page,locale,stage)=>{
    for(const viewport of [{width:320,height:700},{width:390,height:844},{width:1440,height:1000}]){
      await page.setViewportSize(viewport);
      const dimensions=await page.evaluate(()=>{
        const panel=document.querySelector('.ka-panel'),lead=document.querySelector('.ka-lead'),bottom=document.querySelector('.ka-bottom');
        const box=panel.getBoundingClientRect();
        return {document:document.documentElement.scrollWidth-window.innerWidth,panel:panel.scrollWidth-panel.clientWidth,lead:lead.scrollWidth-lead.clientWidth,bottom:bottom.scrollWidth-bottom.clientWidth,left:box.left,right:box.right,viewport:window.innerWidth};
      });
      for(const key of ['document','panel','lead','bottom'])assert.ok(dimensions[key]<=1,`${locale} ${stage} ${viewport.width}px ${key} horizontal overflow ${dimensions[key]}`);
      assert.ok(dimensions.left>=0&&dimensions.right<=dimensions.viewport+1,'Assistant stays inside viewport');
      results.push({locale,stage,width:viewport.width,overflow:0});
      if(stage==='preview'&&(viewport.width===320||viewport.width===1440)){
        await page.locator('.ka-lead-review-title').scrollIntoViewIfNeeded();
        await page.screenshot({path:join(artifacts,`${locale}-${stage}-${viewport.width}.png`)});
        await page.locator('.ka-lead-consent').scrollIntoViewIfNeeded();
        await page.screenshot({path:join(artifacts,`${locale}-confirmation-${viewport.width}.png`)});
      }
    }
  };
  const fill=async(page,locale)=>{
    const t=leadCopy[locale];
    await page.locator('.ka-lead-form').getByLabel(t.name,{exact:true}).fill('Browser Test '+locale.toUpperCase());
    await page.locator('.ka-lead-form').getByRole('combobox',{name:t.service,exact:true}).selectOption('service-cleaning');
    await page.locator('.ka-lead-form').getByLabel(t.condition+' ('+t.optional+')',{exact:true}).fill('Synthetic construction dust. No real client data.');
    await page.locator('.ka-lead-form').getByLabel(t.period+' ('+t.optional+')',{exact:true}).fill('Next week');
  };
  for(const locale of ['de','en','uk','ru']){
    const t=leadCopy[locale],prefix=locale==='de'?'':'/'+locale;
    const context=await browser.newContext({viewport:{width:390,height:844}});await watch(context);
    const page=await context.newPage();
    const mutations=[];
    page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/api/assistant/'))mutations.push(new URL(request.url()).pathname);});
    await open(page,prefix);
    await page.locator('.ka-lead-toggle').waitFor();
    assert.equal(await page.locator('.ka-lead-toggle').getAttribute('aria-expanded'),'false','New lead form begins collapsed');
    await expand(page);await fill(page,locale);
    assert.ok(await page.locator('.ka-lead-form button[type="submit"]').isDisabled(),'Privacy blocks preview');
    assert.equal(mutations.length,0,'Typing creates no conversation or lead');
    await page.locator('.ka-consent input').check();
    await page.waitForFunction(()=>!document.querySelector('.ka-lead-form button[type="submit"]').disabled);
    await page.locator('.ka-lead-form button[type="submit"]').click();
    await page.locator('.ka-lead-error').filter({hasText:t.required}).waitFor();
    assert.equal(mutations.length,0,'Missing contact stays local');
    await page.locator('.ka-lead-form').getByLabel(t.email,{exact:true}).fill('browser.'+locale+'@example.test');
    await overflow(page,locale,'form');
    await page.locator('.ka-lead-form button[type="submit"]').click();
    await status(page,locale,'DRAFT');
    console.log('PREVIEW',locale);
    assert.equal(mutations.length,2,'Protected conversation then preview');
    assert.equal(mutations[0],'/api/assistant/conversations');
    assert.match(mutations[1],/\/lead\/preview$/);
    assert.equal(await page.locator('.ka-lead-summary').getByText(services[0].label[locale],{exact:true}).count(),1,'Approved service localized');
    assert.equal(await page.locator('.ka-lead-consent input').isChecked(),false,'Lead consent is not inherited from privacy');
    assert.ok(await page.locator('.ka-lead-primary').isDisabled(),'Confirmation disabled until explicit checked review');
    await overflow(page,locale,'preview');
    await page.setViewportSize({width:320,height:700});
    await page.locator('.ka-lead-consent input').focus();
    await page.locator('.ka-lead-consent input').press('Space');
    assert.ok(await page.locator('.ka-lead-consent input').isChecked(),'Keyboard Space gives separate confirmation');
    await page.locator('.ka-lead-primary').focus();
    await page.locator('.ka-lead-primary').press('Enter');
    await status(page,locale,'QUEUED');
    assert.equal(await page.locator('.ka-lead-form').count(),0,'Queued request cannot be edited');
    assert.equal(await page.locator('.ka-lead-consent').count(),0,'Queued request cannot be confirmed twice');
    const conversation=app.db.prepare('SELECT id,status FROM assistant_conversations WHERE locale=? ORDER BY created_at DESC LIMIT 1').get(locale);
    assert.equal(conversation.status,'assistant','Lead submission does not claim operator connection');
    assert.equal(app.db.prepare('SELECT state FROM assistant_erp_requests WHERE conversation_id=?').get(conversation.id).state,'QUEUED');
    await page.locator('.ka-lead-actions').getByRole('button',{name:t.cancel,exact:true}).click();
    await status(page,locale,'CANCELLED');
    assert.equal(app.db.prepare('SELECT state FROM assistant_erp_requests WHERE conversation_id=?').get(conversation.id).state,'CANCELLED');
    assert.equal(mutations.filter(path=>path.endsWith('/lead/confirm')).length,1,'Exactly one confirmation');
    await context.close();
    console.log('FLOW_PASS',locale);
  }
  // Existing status remains actionable when export is switched off. A new visitor
  // still retains chat/human contact, with no new structured request control.
  const context=await browser.newContext({viewport:{width:320,height:700}});await watch(context);
  const page=await context.newPage(),t=leadCopy.en;
  await open(page,'/en');await expand(page);await fill(page,'en');
  await page.locator('.ka-lead-form').getByLabel(t.phone,{exact:true}).fill('+49 30 12345678');
  await page.locator('.ka-consent input').check();
  await page.waitForFunction(()=>!document.querySelector('.ka-lead-form button[type="submit"]').disabled);
  await page.locator('.ka-lead-form button[type="submit"]').click();await status(page,'en','DRAFT');
  await page.locator('.ka-lead-consent input').check();await page.locator('.ka-lead-primary').click();await status(page,'en','QUEUED');
  controller.setEnabled(false);
  await open(page,'/en');await status(page,'en','QUEUED');await expand(page);
  assert.equal(await page.locator('.ka-lead-form').count(),0);
  await page.locator('.ka-lead-actions').getByRole('button',{name:t.cancel,exact:true}).click();await status(page,'en','CANCELLED');
  const disabledContext=await browser.newContext();await watch(disabledContext);const disabledPage=await disabledContext.newPage();
  await open(disabledPage,'/en');
  assert.equal(await disabledPage.locator('.ka-lead').count(),0,'Disabled config hides new lead form');
  assert.ok(await disabledPage.locator('.ka-contact-owner').isVisible(),'Owner contact remains available');
  await disabledContext.close();
  // Synthetic database transitions exercise truthful terminal/uncertain UI. They
  // do not simulate or claim a successful ERP call.
  const existing=app.db.prepare("SELECT id FROM assistant_conversations WHERE locale='en' ORDER BY created_at DESC LIMIT 1").get();
  for(const state of ['UNKNOWN','APPLIED']){
    app.db.prepare('UPDATE assistant_erp_requests SET state=?,revoked_at=NULL,updated_at=? WHERE conversation_id=?').run(state,Date.now(),existing.id);
    await page.locator('.ka-lead-actions').getByRole('button',{name:t.refresh,exact:true}).click();await status(page,'en',state);
    assert.equal(await page.locator('.ka-lead-form').count(),0);
    assert.equal(await page.locator('.ka-lead-consent').count(),0);
    assert.equal(await page.locator('.ka-lead-actions').getByRole('button',{name:t.cancel,exact:true}).count(),0,'Uncertain/accepted transmission cannot be labelled cancelled');
  }
  await context.close();
  // Authenticated owner view uses an isolated password/session. The HTTP localTest
  // server cannot set its production __Host cookie, so seed the verified session
  // as a secure loopback cookie; production TLS/login is outside this fixture.
  controller.setEnabled(true);
  const {createOwner,createLogin}=await import('../vps/auth.mjs');
  const password='synthetic-browser-only-password-2026';
  createOwner(app.db,'owner@example.test',password);
  const login=createLogin(app.db,{email:'owner@example.test',password,clientKey:'browser-test'});
  assert.ok(login,'Synthetic owner authenticated');
  const record=app.db.prepare('SELECT event_id FROM assistant_erp_requests WHERE conversation_id=?').get(existing.id);
  const receipt={status:'APPLIED',duplicate:false,event_id:record.event_id,effect_id:'synthetic-receipt-123',provider_debug:'must-not-escape'};
  app.db.prepare('UPDATE assistant_erp_requests SET attempts=1,last_error=?,receipt_json=? WHERE conversation_id=?').run('transport_unknown',JSON.stringify(receipt),existing.id);
  const ownerContext=await browser.newContext({viewport:{width:1440,height:1000}});await watch(ownerContext);
  await ownerContext.addCookies([{name:'__Host-knaba-session',value:login.token,domain:'127.0.0.1',path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
  const ownerPage=await ownerContext.newPage();
  for(const locale of ['de','ru']){
    await ownerPage.goto(origin+(locale==='ru'?'/ru':'')+'/postfach/?conversation='+existing.id,{waitUntil:'networkidle'});
    await ownerPage.locator('.ki-lead-diagnostics').waitFor();
    assert.ok(await ownerPage.locator('.ki-list-entry').count()>0,'Confirmed assistant-only leads discoverable in owner inbox');
    await ownerPage.locator('.ki-lead-diagnostics summary').click();
    assert.ok((await ownerPage.locator('.ki-lead-diagnostics').innerText()).includes('synthetic-receipt-123'));
    assert.equal(await ownerPage.locator('.ki-lead button').count(),0,'No ERP activation/send controls in owner summary');
    const body=await ownerPage.evaluate(async id=>await(await fetch('/api/assistant/owner/conversations/'+id)).text(),existing.id);
    assert.ok(!body.includes('must-not-escape')&&!body.includes(erpBindings.ASSISTANT_ERP_SECRET),'Raw provider details and credentials stay private');
    for(const width of [320,1440]){
      await ownerPage.setViewportSize({width,height:1000});
      assert.ok(await ownerPage.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)<=1,'Owner inbox has no horizontal overflow');
      await ownerPage.locator('.ki-lead-diagnostics').scrollIntoViewIfNeeded();
      await ownerPage.screenshot({path:join(artifacts,`owner-${locale}-${width}.png`)});
    }
  }
  await ownerContext.close();
  assert.deepEqual(attemptedExternal,[],'No external provider/browser requests attempted');
  assert.deepEqual(errors,[],'No uncaught browser errors');
  assert.deepEqual(consoleErrors,[],'No browser console errors');
  const report={browser:await browser.version(),source:'local built site + actual Worker and VPS runtime',localTest:true,syntheticDataOnly:true,scheduledDelivery:'disabled by test wrapper',locales:['de','en','uk','ru'],layouts:results,protectedPreview:true,separateConfirmation:true,keyboardConfirmationAt320:true,queuedAndCancelled:true,disabledConfigFallback:true,uncertainAndAcceptedReadOnly:true,ownerDiagnostics:true,ownerLocales:['de','ru'],ownerAuth:'synthetic verified session cookie; production TLS/login not tested',clientErrors:0,consoleErrors:0,externalRequests:0,artifacts};
  await writeFile(join(artifacts,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {
  if(browser)await browser.close().catch(()=>{});
  if(app)await app.close();
  globalThis.fetch=nativeFetch;
  await rm(temp,{recursive:true,force:true});
}
