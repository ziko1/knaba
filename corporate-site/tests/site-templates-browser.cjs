/**
 * Isolated template acceptance. Requires Node 24, a completed production build,
 * and an already installed, authorized Playwright browser. No live URL option.
 * node tests/site-templates-browser.cjs [--probe | --fixture]
 * --fixture starts only the synthetic server for an authorized external browser;
 * its printed credentials are temporary test data. Stop with SIGINT/SIGTERM.
 * KNABA_PLAYWRIGHT_MODULE may name an installed module; KNABA_CHROME_PATH may
 * name an authorized Chromium binary. Never installs browsers or removes sandboxing.
 * Exit: 0 completed PASS, 1 product/setup FAIL, 2 environment BLOCKED.
 */
const assert = require('node:assert/strict');
const {existsSync, readFileSync, readdirSync} = require('node:fs');
const {resolve, relative, join} = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');

const root = resolve(__dirname, '..');
const runtime = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const receipt = {suite:'site-templates-browser',status:'NOT_RUN',scope:'synthetic HTTPS and SQLite only',
  timestamp:new Date().toISOString(),engines:[],checks:[],widths:[360,768,1440]};
const blocked = /Executable doesn't exist|ENOENT|No usable sandbox|Chromium sandboxing failed|Running as root without|Failed to move to new namespace|Operation not permitted|error while loading shared libraries|ERR_BLOCKED_BY_ADMINISTRATOR/i;
const skip = new Set((process.env.KNABA_BROWSER_SKIP || '').split(/[,\s]+/));
const probeOnly = process.argv.includes('--probe');
const fixtureOnly = process.argv.includes('--fixture');
let browser, fixture;
const record = (name, details={}) => receipt.checks.push({name,status:'PASS',...details});
const hash = value => createHash('sha256').update(value).digest('hex');

function sourceIdentity(){
  try{
    receipt.sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
    receipt.dirty=Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim());
  }catch{receipt.sourceSha=null;}
}
function artifactIdentity(){
  const directory=join(root,'dist');
  for(const path of ['server/index.js','client/studio/templates/index.html']){
    if(!existsSync(join(directory,path)))throw new Error('Build required: dist/'+path+' is missing');
  }
  const files=[];
  function walk(path){
    for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      const file=join(path,entry.name);
      if(entry.isDirectory())walk(file);
      else if(entry.isFile())files.push([relative(directory,file),hash(readFileSync(file))]);
    }
  }
  walk(directory);
  receipt.artifact={files:files.length,manifestSha256:hash(JSON.stringify(files))};
}
async function availableBrowser(){
  let drivers;
  const modules=process.env.KNABA_PLAYWRIGHT_MODULE?[process.env.KNABA_PLAYWRIGHT_MODULE]:['playwright',runtime];
  for(const module of modules){try{drivers=require(module);receipt.playwrightModule=module;break;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}}
  if(!drivers){receipt.reason='PLAYWRIGHT_UNAVAILABLE';return;}
  for(const engine of ['chromium','webkit','firefox']){
    if(skip.has(engine)){receipt.engines.push({engine,status:'SKIPPED_BY_OPERATOR'});continue;}
    const executable=engine==='chromium'?(process.env.KNABA_CHROME_PATH||process.env.KNABA_BROWSER_CHROME_PATH||drivers[engine].executablePath()):drivers[engine].executablePath();
    const installed=existsSync(executable);
    if(!installed){receipt.engines.push({engine,status:'BLOCKED',reason:'EXECUTABLE_MISSING',executable});continue;}
    if(probeOnly){receipt.engines.push({engine,status:'AVAILABLE_UNLAUNCHED',executable});continue;}
    try{
      const options={headless:true,executablePath:executable,timeout:20000};
      if(engine==='chromium')options.chromiumSandbox=true;
      browser=await drivers[engine].launch(options);
      receipt.browser={engine,version:browser.version()};
      receipt.engines.push({engine,status:'LAUNCHED',executable});return;
    }catch(error){
      if(!blocked.test(String(error)))throw error;
      receipt.engines.push({engine,status:'BLOCKED',reason:String(error.message).split('\n')[0],executable});
    }
  }
  receipt.reason=receipt.engines.some(engine=>engine.status==='AVAILABLE_UNLAUNCHED')?'PROBE_ONLY_BROWSER_NOT_RUN':'NO_USABLE_BROWSER';
}

async function run(){
  sourceIdentity();
  if(fixtureOnly){
    artifactIdentity();
    const {createRoleUxFixture}=await import('./fixtures/role-ux-server.mjs');
    fixture=await createRoleUxFixture({localTest:false});
    assert.equal(new URL(fixture.origin).hostname,'127.0.0.1');
    console.log(JSON.stringify({mode:'ISOLATED_FIXTURE',origin:fixture.origin,
      ownerEmail:fixture.identities.owner.email,syntheticPassword:fixture.password,
      destination:fixture.origin+'/studio/templates/?lang=en',sourceSha:receipt.sourceSha,artifact:receipt.artifact}));
    await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
    receipt.reason='FIXTURE_ONLY_EXTERNAL_BROWSER_EVIDENCE_REQUIRED';return;
  }
  await availableBrowser();
  if(!browser){receipt.status=probeOnly&&receipt.reason==='PROBE_ONLY_BROWSER_NOT_RUN'?'NOT_RUN':'BLOCKED';return;}
  artifactIdentity();
  const {createRoleUxFixture}=await import('./fixtures/role-ux-server.mjs');
  fixture=await createRoleUxFixture({localTest:false});
  assert.equal(new URL(fixture.origin).hostname,'127.0.0.1');
  const errors=[];
  const context=await browser.newContext({ignoreHTTPSErrors:true,locale:'en-US',viewport:{width:1440,height:1000},acceptDownloads:true});
  // A temporary, owned TLS certificate is the sole reason HTTPS errors are ignored.
  // No third-party request can leave the isolated browser fixture.
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return url.origin===fixture.origin?route.continue():route.abort('blockedbyclient');
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  const manager=page.locator('#template-manager');
  const control=name=>manager.locator('[data-'+name+']');
  const ready=()=>manager.locator('[data-refresh]:not([disabled])').waitFor({timeout:15000});
  const state=()=>fixture.api('owner','/api/studio/templates');
  async function mutate(name,action,keyboard=false,expected=200){
    if(keyboard)await control(name).focus();
    const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/studio/templates/'+action&&response.request().method()==='POST');
    if(keyboard)await page.keyboard.press('Enter');else await control(name).click();
    const received=await response;
    assert.equal(received.status(),expected,action+' HTTP status');
    const payload=await received.json();
    await ready();return payload;
  }
  async function publicHtml(){
    return page.evaluate(async()=>{
      const response=await fetch('/',{cache:'no-store',credentials:'omit'});
      if(!response.ok)throw Error('Public home HTTP '+response.status);
      return response.text();
    });
  }
  function preserved(){
    const excluded=new Set(['studio_templates','studio_template_state','studio_template_history','portal_rate_limits']);
    return Object.fromEntries(Object.entries(fixture.primarySnapshot()).filter(([table])=>!excluded.has(table)));
  }
  async function content(title){
    const current=await fixture.api('owner','/api/studio/page?page=%2F');
    const draft=await fixture.api('owner','/api/studio/draft','POST',{page:'/',version:current.version,entries:[{selector:'@title',kind:'text',value:title}]});
    await fixture.api('owner','/api/studio/publish','POST',{page:'/',version:draft.version,confirm:'PUBLISH'});
  }

  await page.goto(fixture.origin+'/studio/templates/?lang=en',{waitUntil:'domcontentloaded'});
  await control('login').waitFor({state:'visible'});
  assert.equal(await control('catalogue').isDisabled(),true);
  assert.equal(await control('activate').isDisabled(),true);
  record('anonymous controls remain locked');

  const destination='/studio/templates/?lang=en';
  await page.goto(fixture.origin+'/login/?lang=en&return_to='+encodeURIComponent(destination),{waitUntil:'domcontentloaded'});
  await page.locator('input[name=email]').fill(fixture.identities.owner.email);
  await page.locator('input[name=password]').fill(fixture.password);
  await Promise.all([page.waitForURL(url=>url.origin===fixture.origin&&url.pathname==='/studio/templates/'),page.locator('button[type=submit]').click()]);
  await manager.locator('[data-catalogue]:not([disabled])').waitFor();
  await page.waitForFunction(()=>document.querySelector('#template-manager')?.lang==='en');
  assert.equal(await control('error').isVisible(),false);
  assert.ok((await state()).templates.filter(template=>template.builtin).length>=3);
  record('real VPS owner credential login opens catalogue');

  await content('Synthetic template preservation before activation');
  const before=preserved();
  const initial=await publicHtml();
  assert.ok(initial.includes('Synthetic template preservation before activation'));
  assert.ok(!initial.includes('data-knaba-template='));
  await control('catalogue').focus();
  await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  const keyboardChoice=await control('catalogue').inputValue();
  assert.ok((await state()).templates.some(template=>template.digest===keyboardChoice),'Keyboard selection resolves to a real template');
  assert.ok((await control('preview').getAttribute('src')).includes(keyboardChoice));
  record('catalogue keyboard selection opens the selected template preview');

  for(const locale of ['de','en','pl','lt','ru','uk']){
    await control('language').selectOption(locale);
    await page.waitForFunction(locale=>document.querySelector('#template-manager')?.lang===locale,locale);
    assert.ok((await manager.locator('h1').textContent()).trim());
  }
  await control('language').selectOption('en');
  await page.waitForFunction(()=>document.querySelector('#template-manager')?.lang==='en');
  record('six editor locales load complete labels');

  let uploads=0;
  page.on('request',request=>{if(new URL(request.url()).pathname==='/api/studio/templates/upload'&&request.method()==='POST')uploads++;});
  await control('file').setInputFiles({name:'too-large.zip',mimeType:'application/zip',buffer:Buffer.alloc(65537)});
  await control('upload').click();
  await control('error').waitFor({state:'visible'});
  assert.equal(uploads,0,'Oversized ZIP must be rejected before a request');
  const downloadPromise=page.waitForEvent('download');
  await control('example').click();
  const download=await downloadPromise;
  assert.equal(await download.failure(),null);
  const zip=readFileSync(await download.path());
  assert.ok(zip.length>0&&zip.length<=65536);
  await control('file').setInputFiles({name:download.suggestedFilename(),mimeType:'application/zip',buffer:zip});
  const uploaded=await mutate('upload','upload');
  assert.equal(uploaded.duplicate,false);
  assert.equal(await control('catalogue').inputValue(),uploaded.template.digest);
  const selected=await mutate('save','select',true);
  assert.equal(selected.draftDigest,uploaded.template.digest);
  assert.equal(selected.activeDigest,null);
  assert.equal(await control('activate').isDisabled(),true,'Publish remains disabled without confirmation');
  assert.ok(!(await publicHtml()).includes('data-knaba-template='),'Saved draft must not change the public page');
  record('downloaded ZIP uploads and saves as draft through keyboard form controls',{zipSha256:hash(zip)});

  const preview=control('preview');
  assert.equal(await preview.getAttribute('sandbox'),'');
  for(const locale of ['de','en','pl','lt','ru','uk']){
    const target=locale==='de'?'/':'/'+locale+'/';
    const response=page.waitForResponse(response=>{
      const url=new URL(response.url());
      return url.pathname==='/api/studio/templates/preview'&&url.searchParams.get('page')===target;
    });
    await control('preview-language').selectOption(locale);
    const received=await response;
    assert.equal(received.status(),200);
    const html=await received.text();
    assert.ok(html.includes('data-knaba-template="'+uploaded.template.id+'"'));
    assert.ok(!/<script(?:\s|>)/i.test(html),'Preview has no executable scripts');
  }
  for(const width of receipt.widths){
    await page.setViewportSize({width,height:1000});
    await control('width').selectOption(width===1440?'full':String(width));
    const frame=await (await preview.elementHandle()).contentFrame();
    await frame.locator('#main').waitFor();
    assert.equal(await frame.locator('script, iframe, object, embed').count(),0);
    assert.equal(await frame.locator('form input:not([disabled]),form button:not([disabled])').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,'Manager overflow at '+width);
    const bounds=await preview.boundingBox();
    assert.ok(bounds.width<=width+1,'Preview fits viewport at '+width);
    await control('confirm').focus();
    assert.equal(await control('confirm').evaluate(element=>element===document.activeElement),true);
  }
  record('inert localized previews and keyboard access at 360, 768 and 1440 pixels');

  await control('confirm').focus();await page.keyboard.press('Space');
  assert.equal(await control('confirm').isChecked(),true);
  const activated=await mutate('activate','activate',true);
  assert.equal(activated.activeDigest,uploaded.template.digest);
  assert.equal(await control('confirm').isChecked(),false);
  const activeHtml=await publicHtml();
  assert.ok(activeHtml.includes('data-knaba-template="'+uploaded.template.id+'"'));
  assert.ok(activeHtml.includes('Synthetic template preservation before activation'));
  assert.deepEqual(preserved(),before,'Activation must preserve business records, users and existing published content');
  record('explicit activation changes anonymous public HTML and preserves primary records');

  await content('Synthetic content edited after template activation');
  const afterEdit=preserved();
  await control('history').selectOption('0');
  assert.equal(await control('rollback').isDisabled(),true);
  await control('confirm').focus();await page.keyboard.press('Space');
  const rolledBack=await mutate('rollback','rollback',true);
  assert.equal(rolledBack.activeDigest,null);
  const restored=await publicHtml();
  assert.ok(!restored.includes('data-knaba-template='));
  assert.ok(restored.includes('Synthetic content edited after template activation'));
  assert.deepEqual(preserved(),afterEdit,'Rollback must preserve content edited after activation');
  assert.ok(rolledBack.templates.some(template=>template.digest===uploaded.template.digest),'Rollback must retain uploaded packages');
  assert.deepEqual(errors,[],'No browser JavaScript exceptions');
  record('confirmed original rollback preserves later content, uploads and business data');
  record('no browser JavaScript exceptions');
  receipt.status='PASS';
}

(async()=>{
  try{await run();}
  catch(error){
    receipt.status=blocked.test(String(error))?'BLOCKED':'FAIL';
    receipt.reason=String(error.message);
    if(receipt.status==='FAIL')receipt.stack=String(error.stack);
  }finally{
    for(const resource of [browser,fixture]){
      try{if(resource)await resource.close();}
      catch(error){receipt.status='FAIL';receipt.cleanupError=String(error.message);}
    }
    console.log(JSON.stringify(receipt,null,2));
    process.exitCode=receipt.status==='PASS'?0:receipt.status==='BLOCKED'||receipt.status==='NOT_RUN'?2:1;
  }
})();
