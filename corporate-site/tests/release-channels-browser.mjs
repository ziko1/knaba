/** Actual browser + ephemeral HTTPS/SQLite acceptance. No provider sends or external navigation. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRoleUxFixture} from './fixtures/role-ux-server.mjs';

const require=createRequire(import.meta.url);
const locales=['de','en','pl','lt','ru','uk'],widths=[320,390,768,1440];
const output=resolve(process.env.KNABA_RELEASE_QA_DIR||'/tmp/knaba-release-browser-evidence');
const receipt={startedAt:new Date().toISOString(),environment:'isolated HTTPS / actual built website / synthetic SQLite',
  scope:'Release presentation and local assistant only. Synthetic configured URLs are never opened.',
  externalProviderDelivery:'NOT_RUN',appleDistribution:'NOT_RUN',captchaProvider:'NOT_RUN',checks:[],errors:[],blockedExternalRequests:[]};
const record=(name,detail={})=>receipt.checks.push({name,status:'PASS',...detail});
const prefix=locale=>locale==='de'?'':'/'+locale;
let browser,fixture,context,page;
const safe=value=>String(value??'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[synthetic-email]')
  .replace(/(token|password|secret)([=:]\s*)[^\s,;]+/gi,'$1$2[redacted]');

async function artifactDigest(){
  const root=fileURLToPath(new URL('../dist/',import.meta.url)),entries=[];
  async function walk(relative){
    const children=await readdir(join(root,relative),{withFileTypes:true});
    for(const child of children.sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      const path=relative?relative+'/'+child.name:child.name;
      if(child.isDirectory())await walk(path);
      else if(child.isFile())entries.push([path,createHash('sha256').update(await readFile(join(root,path))).digest('hex')]);
      else throw Error('Unexpected non-regular dist entry: '+path);
    }
  }
  await walk('');
  return {algorithm:'SHA-256(JSON.stringify(sorted [relative path, file SHA-256] pairs))',files:entries.length,
    sha256:createHash('sha256').update(JSON.stringify(entries)).digest('hex')};
}
async function openFixture(options){
  fixture=await createRoleUxFixture(options);
  context=await browser.newContext({ignoreHTTPSErrors:true,locale:'pl-PL',viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  // No external resource, popup, messenger, store or telephone request may leave this fixture.
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===fixture.origin)return route.continue();
    receipt.blockedExternalRequests.push({host:url.hostname,path:url.pathname});return route.abort('blockedbyclient');
  });
  page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>receipt.errors.push({type:'pageerror',path:new URL(page.url()).pathname,message:safe(error.message)}));
  page.on('console',message=>{if(message.type()==='error')receipt.errors.push({type:'console',path:new URL(page.url()).pathname,message:safe(message.text())});});
  page.on('popup',popup=>{receipt.errors.push({type:'unexpected-popup'});void popup.close();});
}
async function closeFixture(){
  if(context)await context.close();context=null;page=null;
  if(fixture)await fixture.close();fixture=null;
}
async function navigate(path,locale,{release=false,configured=false}={}){
  assert.ok(path.startsWith('/')&&!path.startsWith('//'));
  const loaded=release?page.waitForResponse(response=>new URL(response.url()).pathname==='/api/public/release'):null;
  const response=await page.goto(fixture.origin+path,{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200,path);
  assert.equal(await page.locator('html').getAttribute('lang'),locale,path+' language');
  assert.equal(new URL(page.url()).origin,fixture.origin);
  if(loaded){
    const metadata=await loaded;assert.equal(metadata.status(),200);
    const body=await metadata.json();assert.deepEqual(body.languages,locales);assert.equal(body.defaultLanguage,'de');
    if(configured)await page.locator('[data-channel-open]').first().waitFor({state:'visible'});
  }
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
}
async function languageMenu(locale){
  const menu=page.locator('.site-language-switcher');await menu.locator('summary').click();
  assert.deepEqual(await menu.locator('a[data-language-switch]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('lang'))),locales);
  assert.equal(await menu.locator('a[aria-current="page"]').getAttribute('lang'),locale);
  await assertFits('language menu');await menu.locator('summary').click();
}
async function assertFits(label){
  const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,
    panel:[...document.querySelectorAll('.ka-panel')].map(el=>({scroll:el.scrollWidth,client:el.clientWidth}))}));
  assert.ok(dimensions.document<=dimensions.viewport+1&&dimensions.body<=dimensions.viewport+1,label+' overflow '+JSON.stringify(dimensions));
  assert.ok(dimensions.panel.every(item=>item.scroll<=item.client+1),label+' assistant panel overflow');
}
async function responsive(label){
  for(const width of widths){await page.setViewportSize({width,height:844});await assertFits(label+' '+width);}
  record('no horizontal overflow',{page:label,widths});
}
async function releaseState(configured,channel){
  const section=page.locator('[data-knaba-release]');assert.equal(await section.count(),1);
  assert.equal(await section.locator('[data-release-stage]').textContent(),await section.getAttribute('data-prototype'));
  assert.equal(await section.locator('[data-working-version]').isVisible(),configured);
  if(configured)assert.equal(await section.locator('[data-working-version]').getAttribute('href'),'https://customer.example.test/app/');
  const channels=channel?[channel]:['whatsapp','telegram'];
  assert.deepEqual(await section.locator('[data-channel]').evaluateAll(nodes=>nodes.map(node=>node.dataset.channel)),channels);
  for(const name of channels){
    const link=section.locator('[data-channel="'+name+'"] [data-channel-open]');
    assert.equal(await link.isVisible(),configured);
    assert.equal(await link.getAttribute('href'),configured?expected[name]:null);
    if(configured){assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel'),/noopener/);}
  }
  if(!channel){
    for(const platform of ['android','ios']){
      assert.equal(await section.locator('[data-'+platform+'-download]').isVisible(),configured);
      assert.equal(await section.locator('[data-'+platform+'-pending]').isVisible(),!configured);
      assert.equal(await section.locator('[data-'+platform+'-download]').getAttribute('href'),configured?expected[platform]:null);
    }
    assert.equal(await section.locator('[data-android-prototype]').isVisible(),configured);
    assert.equal(await section.locator('[data-android-hash]').isVisible(),configured);
    if(configured)assert.equal(await section.locator('[data-android-hash] code').textContent(),'a'.repeat(64));
  }
}
const expected={android:'https://customer.example.test/downloads/fixture-only.apk',ios:'https://testflight.apple.com/join/QAonly12',
  whatsapp:'https://wa.me/12025550123',telegram:'https://t.me/KnabaFixtureOnlyBot?start=website'};
const releaseEnvironment={KNABA_RELEASE_STAGE:'prototype',KNABA_WORKING_ORIGIN:'https://customer.example.test',KNABA_WORKING_ORIGIN_VERIFIED:'true',
  KNABA_VERIFIED_WHATSAPP_NUMBER:'12025550123',KNABA_VERIFIED_TELEGRAM_BOT:'KnabaFixtureOnlyBot',
  KNABA_ANDROID_APK_URL:expected.android,KNABA_ANDROID_APK_SHA256:'a'.repeat(64),KNABA_ANDROID_DISTRIBUTION:'prototype',KNABA_ANDROID_VERSION:'0.0.0-qa',
  KNABA_IOS_INSTALL_URL:expected.ios};

async function releaseCases(configured){
  await openFixture({releaseEnvironment:configured?releaseEnvironment:{}});
  const before=fixture.primarySnapshot();
  await navigate('/','de');await languageMenu('de');record('German is the default with Polish browser preferences',{configured});
  for(const locale of locales){
    const base=prefix(locale);
    await navigate(base+'/app/',locale,{release:true,configured});await languageMenu(locale);await releaseState(configured);
    for(const name of ['whatsapp','telegram'])assert.equal(await page.locator('[data-channel="'+name+'"] a[href="'+base+'/bots/'+name+'/"]').count(),1);
    await responsive((configured?'configured':'pending')+' '+locale+' app');
    if(locale==='de'){
      await page.setViewportSize({width:320,height:844});await page.locator('[data-knaba-release]').scrollIntoViewIfNeeded();
      await page.screenshot({path:resolve(output,(configured?'configured':'pending')+'-release-de-320.png')});
    }
    for(const name of ['whatsapp','telegram']){
      // Click only the real, same-origin entry page; the provider destination remains untouched.
      if(name==='telegram')await navigate(base+'/app/',locale,{release:true,configured});
      const loaded=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/public/release');
      await page.locator('[data-channel="'+name+'"] a[href="'+base+'/bots/'+name+'/"]').click();
      await page.waitForURL(fixture.origin+base+'/bots/'+name+'/');assert.equal((await loaded).status(),200);
      if(configured)await page.locator('[data-channel-open]').waitFor({state:'visible'});
      assert.equal(await page.locator('html').getAttribute('lang'),locale);await releaseState(configured,name);
      await responsive((configured?'configured':'pending')+' '+locale+' '+name);
    }
    record('separate messenger entry pages and app state',{locale,configured,externalLinksOpened:0});
  }
  assert.deepEqual(fixture.primarySnapshot(),before,'public release presentation must not change business data');
  record('read-only public release browsing preserves all primary rows',{configured});await closeFixture();
}
async function assistantCases(){
  // Explicitly isolated TEST mode permits local knowledge replies. Real CAPTCHA acceptance is not asserted.
  await openFixture({localTest:true});
  const cases={pl:{question:'Jaka jest cena sprzątania?',greeting:'Dzień dobry!',answer:'Cena zależy od etapu budowy'},
    lt:{question:'Kokia yra valymo kaina?',greeting:'Sveiki!',answer:'Kaina priklauso nuo statybos etapo'}};
  for(const [locale,words] of Object.entries(cases)){
    await navigate('/'+locale+'/',''+locale);
    await page.evaluate(()=>sessionStorage.clear());
    await page.locator('[data-knaba-open]').click();await page.locator('.ka-panel').waitFor();
    assert.equal(await page.locator('.ka-wrap').getAttribute('lang'),locale);
    assert.ok((await page.locator('.ka-history').textContent()).includes(words.greeting));
    await page.locator('#ka-input').fill(words.question);
    const captcha=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/assistant/captcha');
    await page.locator('.ka-consent input[type=checkbox]').check();
    assert.equal((await (await captcha).json()).enabled,false);
    await page.waitForFunction(()=>document.querySelector('.ka-captcha')?.hidden===true);
    const saved=page.waitForResponse(response=>/\/api\/assistant\/conversations\/[^/]+\/messages\/?$/.test(new URL(response.url()).pathname)&&response.request().method()==='POST');
    await page.locator('.ka-chat-form button[type=submit]').click();assert.equal((await saved).status(),200);
    await page.locator('.ka-history .ka-assistant').filter({hasText:words.answer}).waitFor();
    const persisted=fixture.db.prepare('SELECT count(*) n FROM assistant_messages m JOIN assistant_conversations c ON c.id=m.conversation_id WHERE c.locale=? AND m.sender=? AND m.content LIKE ?').get(locale,'assistant',words.answer+'%');
    assert.equal(persisted.n,1,'actual localized response must be persisted once');
    await responsive('local assistant '+locale);
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(output,'assistant-'+locale+'-390.png')});
    // This dialog is deliberately non-modal: Escape belongs to it only while
    // focus is inside. Sending disables the submit button and can blur it.
    await page.locator('#ka-input').focus();await page.keyboard.press('Escape');
    await page.locator('.ka-panel').waitFor({state:'detached'});
    record('local assistant greeting, consent and persisted knowledge response',{locale,mode:'ephemeral local TEST',providersUsed:0});
  }
  await closeFixture();
}
async function run(){
  await mkdir(output,{recursive:true});receipt.artifact=await artifactDigest();
  if(/^[a-f0-9]{40}$/.test(process.env.KNABA_QA_SOURCE_SHA??''))receipt.operatorReportedSourceSha=process.env.KNABA_QA_SOURCE_SHA;
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
  receipt.browserVersion=browser.version();
  await releaseCases(false);await releaseCases(true);await assistantCases();
  assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.blockedExternalRequests,[]);
  assert.deepEqual(await artifactDigest(),receipt.artifact,'built artifact changed during browser acceptance');
  receipt.status='PASS';
}
try{await run();}
catch(error){
  receipt.status=/listen EPERM|listen EACCES/.test(error.message)?'BLOCKED':'FAIL';
  receipt.failure={message:safe(error.message),stack:safe(error.stack)};
  if(page&&!page.isClosed())try{await page.screenshot({path:resolve(output,'failure.png'),timeout:5000});}catch{}
}
finally{
  await closeFixture().catch(()=>{});if(browser)await browser.close().catch(()=>{});
  receipt.finishedAt=new Date().toISOString();await mkdir(output,{recursive:true});
  await writeFile(resolve(output,'release-browser-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log('KNABA_RELEASE_BROWSER '+JSON.stringify(receipt));
  process.exitCode=receipt.status==='PASS'?0:receipt.status==='BLOCKED'?2:1;
}
