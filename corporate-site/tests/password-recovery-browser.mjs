/**
 * Actual browser -> isolated HTTPS -> real VPS routes/SQLite acceptance.
 * Only the email-provider transport is captured explicitly; no response mocking.
 * Requires the existing built corporate-site and an already-installed browser.
 * KNABA_PLAYWRIGHT_MODULE=/app/node_modules/playwright (or NODE_PATH) selects the
 * authorized QA image module. KNABA_CHROME_PATH may select its existing Chromium.
 * Exit 0 PASS, 1 FAIL, 2 BLOCKED. No browser download or sandbox bypass is allowed.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,readdir,writeFile,rename,access} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {accountWords} from '../vps/account-recovery-ui.mjs';

const require=createRequire(import.meta.url);
const siteRoot=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.env.KNABA_RECOVERY_QA_DIR||'/tmp/knaba-recovery-browser-evidence');
const locales=['de','en','pl','lt','ru','uk'],widths=[390,1440];
const secrets=new Set(),contexts=new Set(),fixtures=[];
const receipt={startedAt:new Date().toISOString(),status:'RUNNING',environment:'isolated loopback HTTPS / real VPS routes / real SQLite / synthetic accounts',
  scope:'Password recovery browser acceptance; captured provider transport is not real email delivery.',
  checks:[],errors:[],engines:[],screenshots:[],externalRequests:[],
  browserResponsesMocked:false,realProviderDelivery:'NOT_RUN',physicalDeviceAcceptance:'NOT_RUN'};
let browser,fixture,activePage,currentCase='setup',rejectExternal;
const externalFailure=new Promise((_,reject)=>{rejectExternal=reject;});
externalFailure.catch(()=>{});
const remember=value=>{if(typeof value==='string'&&value)secrets.add(value);return value;};
function safe(value){
  let text=String(value??'');
  for(const secret of [...secrets].sort((a,b)=>b.length-a.length))text=text.replaceAll(secret,'[redacted]');
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[synthetic-email]')
    .replace(/([?&#](?:token|password|email)=)[^\s&#"'<>]*/gi,'$1[redacted]')
    .replace(/((?:__Host-knaba-session|authorization|password)\s*[=:]\s*)[^\s,;"'<>]+/gi,'$1[redacted]')
    .replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g,'[redacted-capability]');
}
function safeObject(value){
  if(typeof value==='string')return safe(value);
  if(Array.isArray(value))return value.map(safeObject);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,safeObject(item)]));
  return value;
}
const record=(name,detail={})=>receipt.checks.push({name,status:'PASS',...detail});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function sourceIdentity(){
  let head=null,dirty=null;
  try{
    head=execFileSync('git',['rev-parse','HEAD'],{cwd:siteRoot,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    dirty=Boolean(execFileSync('git',['status','--porcelain'],{cwd:siteRoot,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim());
  }catch{/* Read-only QA mounts can intentionally omit Git metadata. */}
  const declared=process.env.KNABA_QA_SOURCE_SHA??null;
  if(declared!==null)assert.ok(declared.length===40&&/^(?!0{40}$)[a-f0-9]{40}$/.test(declared),
    'Invalid operator-declared source SHA: expected exactly 40 nonzero lowercase hexadecimal characters');
  if(head&&declared)assert.equal(head,declared,'Operator source differs from checkout');
  return {checkoutHead:head,workingTreeDirty:dirty,operatorDeclaredSourceSha:declared,
    binding:head?'GIT_HEAD_PLUS_ACTUAL_INPUT_HASHES':'ACTUAL_INPUT_HASHES_WITH_OPTIONAL_OPERATOR_DECLARATION'};
}
async function inputProof(){
  const paths=[];
  async function walk(directory){
    for(const entry of await readdir(directory,{withFileTypes:true})){
      const path=join(directory,entry.name);
      if(entry.isDirectory())await walk(path);
      else if(entry.isFile())paths.push(path);
      else throw Error('Non-regular source/build input');
      assert.ok(paths.length<10000,'Bounded artifact inventory exceeded');
    }
  }
  for(const directory of ['vps','drizzle','dist'])await walk(join(siteRoot,directory));
  paths.push(join(siteRoot,'package.json'),fileURLToPath(import.meta.url),
    fileURLToPath(new URL('./fixtures/password-recovery-server.mjs',import.meta.url)));
  const files=[];
  for(const path of [...new Set(paths)].sort()){
    const bytes=await readFile(path);files.push({path:relative(siteRoot,path),sha256:hash(bytes),bytes:bytes.length});
  }
  return {sha256:hash(Buffer.from(JSON.stringify(files))),algorithm:'SHA256(JSON of sorted relative path, SHA256 and size records)',files};
}
function privateHeaders(response){
  const headers=response.headers();
  assert.match(headers['cache-control']??'',/no-store/);
  assert.match(headers['x-robots-tag']??'',/noindex/);
  assert.equal(headers['referrer-policy'],'strict-origin');
  assert.equal(headers['x-frame-options'],'DENY');
  assert.match(headers['content-security-policy']??'',/default-src 'none'/);
  assert.doesNotMatch(headers['content-security-policy']??'',/script-src 'unsafe-inline'/);
}
function assertClean(){
  assert.equal(receipt.externalRequests.length,0,'External request attempted');
  assert.equal(receipt.errors.length,0,'Unexpected browser JavaScript error');
  for(const item of fixtures)item.assertIsolated();
}
async function newPage(target,{javaScriptEnabled=true,identity}={}){
  const context=await browser.newContext({ignoreHTTPSErrors:true,javaScriptEnabled,
    viewport:{width:390,height:844},locale:'de-DE',reducedMotion:'reduce',serviceWorkers:'block'});
  contexts.add(context);
  // This is an isolation deny-list, never a stub: same-origin requests continue
  // unchanged to the actual HTTPS fixture; no route.fulfill/fake response exists.
  await context.route('**/*',async route=>{
    let url;try{url=new URL(route.request().url());}catch{}
    if(!url||url.origin!==target.origin){
      receipt.externalRequests.push({origin:safe(url?.origin??'unparseable'),method:route.request().method()});
      rejectExternal(new Error('External browser origin attempted'));
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  if(identity)await context.addCookies([target.cookie(identity)]);
  const page=await context.newPage();activePage=page;
  page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(20000);
  page.on('pageerror',error=>receipt.errors.push({case:currentCase,message:safe(error.message)}));
  page.on('popup',popup=>{receipt.errors.push({case:currentCase,message:'Unexpected popup'});void popup.close();});
  return page;
}
async function closePage(page){
  assertClean();const context=page.context();await context.close();contexts.delete(context);
  if(activePage===page)activePage=null;
}
async function navigate(page,target,path,status=200){
  assert.ok(path.startsWith('/')&&!path.startsWith('//'),'Only fixture-relative navigation is allowed');
  activePage=page;
  const response=await page.goto(target.origin+path,{waitUntil:'domcontentloaded'});
  assert.equal(response?.status(),status,'Unexpected document HTTP status');
  assert.equal(new URL(page.url()).origin,target.origin);assertClean();return response;
}
async function navigateFragment(page,target,path){
  assert.ok(path.startsWith('/')&&!path.startsWith('//'));
  const before=new URL(page.url()),after=new URL(target.origin+path);
  assert.equal(before.origin,target.origin);assert.equal(after.origin,target.origin);
  assert.equal(before.pathname,after.pathname);assert.equal(before.search,after.search);
  assert.notEqual(before.hash,after.hash);assert.ok(after.hash,'A new recovery fragment is required');
  const gets=target.requestCount('GET',after.pathname),posts=target.requestCount('POST',after.pathname);
  activePage=page;
  const response=await page.goto(after.href,{waitUntil:'domcontentloaded'});
  assert.equal(response,null,'A hash-only transition has no document HTTP response');
  await page.waitForFunction(()=>location.hash==='');
  assert.equal(new URL(page.url()).origin+new URL(page.url()).pathname+new URL(page.url()).search,
    after.origin+after.pathname+after.search);
  assert.equal(target.requestCount('GET',after.pathname),gets,'Hash-only recovery must not GET');
  assert.equal(target.requestCount('POST',after.pathname),posts,'Hash-only recovery must not POST');
  assertClean();
}
async function submit(page,target,path,status){
  activePage=page;
  const [response]=await Promise.all([
    page.waitForResponse(response=>new URL(response.url()).origin===target.origin&&new URL(response.url()).pathname===path&&response.request().method()==='POST'),
    page.waitForNavigation({waitUntil:'domcontentloaded'}),
    page.locator('form button[type="submit"]').click()
  ]);
  assert.equal(response.status(),status,'Unexpected real form POST status');
  assert.equal(new URL(page.url()).origin,target.origin);assertClean();return response;
}
async function screenshot(page,name){
  // Never record browser traces, request bodies, cookies or captured mail. Mask
  // every typed control. If a defect reflects a secret into text, mask all body.
  const visibleSecret=await page.evaluate(values=>{
    const text=document.body?.innerText??'';return values.some(value=>text.includes(value));
  },[...secrets]);
  const path=join(output,name+'.png');
  await page.screenshot({path,fullPage:true,mask:[page.locator(visibleSecret?'body':'input,textarea,[contenteditable="true"]')],maskColor:'#182c24'});
  const bytes=await readFile(path);
  receipt.screenshots.push({path:name+'.png',sha256:hash(bytes),bytes:bytes.length,allTypedControlsMasked:true,bodyMasked:visibleSecret});
}
async function layout(page,lang,kind){
  for(const width of widths){
    await page.setViewportSize({width,height:900});
    const geometry=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,
      controls:[...document.querySelectorAll('input:not([type=hidden]),button')].filter(node=>node.getClientRects().length)
        .map(node=>{const box=node.getBoundingClientRect();return {left:box.left,right:box.right,width:box.width,height:box.height};})}));
    assert.ok(geometry.document<=geometry.viewport+1,'Recovery page horizontal overflow');
    assert.ok(geometry.controls.length>0);
    for(const control of geometry.controls){
      assert.ok(control.left>=-1&&control.right<=width+1,'Control exceeds viewport');
      assert.ok(control.height>=44,'Control has insufficient touch height');
    }
    await screenshot(page,kind+'-'+lang+'-'+width);
    record('Localized recovery layout and masked screenshot',{locale:lang,page:kind,width});
  }
  await page.setViewportSize({width:390,height:844});
}
async function checkForm(page,lang,kind){
  const words=accountWords(lang),reset=kind==='reset';
  assert.equal(await page.locator('html').getAttribute('lang'),lang);
  assert.equal((await page.locator('h1').textContent()).trim(),reset?words.resetTitle:words.recoverTitle);
  const form=page.locator('form');
  assert.equal(await form.getAttribute('method'),'post');
  assert.equal(await form.getAttribute('action'),(reset?'/reset-password/':'/forgot-password/')+'?lang='+lang);
  assert.equal((await form.locator('button[type=submit]').textContent()).trim(),reset?words.resetSubmit:words.recoverySubmit);
  const fields=reset?{token:words.token,new:words.newPassword,confirm:words.confirmPassword}:{email:words.email};
  for(const [name,label] of Object.entries(fields)){
    const control=form.locator('[name="'+name+'"]'),id=await control.getAttribute('id');
    assert.ok(id);assert.ok((await form.locator('label[for="'+id+'"]').textContent()).includes(label));
    assert.notEqual(await control.getAttribute('required'),null);
  }
  assert.deepEqual(await form.locator('input[name]').evaluateAll(nodes=>nodes.map(node=>node.name).sort()),Object.keys(fields).sort());
}
async function skipFocus(page){
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.skip').evaluate(node=>node===document.activeElement),true,'Keyboard reaches skip link first');
  assert.equal(await page.locator('.skip').evaluate(node=>getComputedStyle(node).outlineStyle!=='none'),true,'Keyboard focus is visible');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#account-main').evaluate(node=>node===document.activeElement),true,'Skip link moves focus to main');
}
async function requestRecovery(page,target,name,lang){
  const before=target.mailCount();
  await page.locator('#account-email').fill(target.identities[name].email);
  const response=await submit(page,target,'/forgot-password/',202);privateHeaders(response);
  assert.equal((await page.locator('#account-notice').textContent()).trim(),accountWords(lang).recoverySent);
  assert.equal(await page.locator('form').count(),0);
  return target.capturedMailSince(before,name,lang);
}
async function openCapability(page,target,mail,lang,{sameDocument=false}={}){
  const url=new URL(mail.link);assert.equal(url.origin,target.origin);
  if(sameDocument)await navigateFragment(page,target,url.pathname+url.search+url.hash);
  else {const response=await navigate(page,target,url.pathname+url.search+url.hash);privateHeaders(response);}
  await checkForm(page,lang,'reset');
  assert.equal(new URL(page.url()).hash,'','Recovery fragment is removed before further navigation');
  assert.ok((await page.locator('#account-token').inputValue())===mail.token,'Exact fragment token is bound to the POST field');
  assert.equal(await page.locator('#account-token').getAttribute('type'),'hidden');
  assert.equal(await page.locator('#account-token-entry').isVisible(),false);
  assert.equal(await page.locator('#account-token-ready').isVisible(),true);
  assert.equal(target.tokenExists(mail.token),true,'GET must not consume recovery capability');
}
async function reopenCompleted(page,target,mail,lang){
  const current=new URL(page.url()),link=new URL(mail.link);
  assert.equal(current.origin+current.pathname+current.search,link.origin+link.pathname+link.search);
  assert.equal(await page.locator('form').count(),0);
  const path=current.pathname.endsWith('/')?current.pathname.slice(0,-1):current.pathname+'/';
  const gets=target.requestCount('GET',path),posts=target.requestCount('POST',current.pathname);
  const credential=target.credentialDigest(lang),sessions=target.sessionCount(lang);
  const [response,fragmentResponse]=await Promise.all([
    page.waitForResponse(response=>new URL(response.url()).origin===target.origin&&
      new URL(response.url()).pathname===path&&response.request().method()==='GET'),
    page.goto(link.href,{waitUntil:'domcontentloaded'})
  ]);
  assert.equal(fragmentResponse,null,'The initial completed-page link is hash-only');
  assert.equal(response.status(),200);privateHeaders(response);
  await page.waitForFunction(()=>location.hash===''&&Boolean(document.getElementById('account-token')));
  assert.equal(new URL(page.url()).pathname,path);assert.equal(new URL(page.url()).search,link.search);
  await checkForm(page,lang,'reset');
  assert.ok((await page.locator('#account-token').inputValue())===mail.token);
  assert.equal(target.requestCount('GET',path),gets+1,'Completed recovery reopens through exactly one fresh GET');
  assert.equal(target.requestCount('POST',current.pathname),posts,'Completed recovery never replays its POST');
  assert.equal(target.tokenExists(mail.token),false,'Reopening cannot revive a consumed capability');
  assert.equal(target.credentialDigest(lang),credential);assert.equal(target.sessionCount(lang),sessions);
  assertClean();
}
async function fillPasswords(page,password,confirm=password){
  remember(password);remember(confirm);
  await page.locator('#account-new').fill(password);await page.locator('#account-confirm').fill(confirm);
}
async function assertAuthority(target,before,other){
  assert.deepEqual(target.authoritySnapshot(),before,'Recovery must not change profiles or staff grants');
  assert.deepEqual(target.otherSnapshot(),other,'Recovery must preserve the other account and its session');
}
async function newPasswordLogin(page,target,name,lang,password,{rejectOld=true}={}){
  await navigate(page,target,'/login/?lang='+lang+'&return_to=%2Faccount%2Fpassword%2F');
  await page.locator('input[name=email]').fill(target.identities[name].email);
  if(rejectOld){
    await page.locator('input[name=password]').fill(target.password);
    await submit(page,target,'/login/',401);
    assert.equal(await page.locator('[role=alert]').isVisible(),true,'Old credential is rejected by actual login');
    await page.locator('input[name=email]').fill(target.identities[name].email);
  }
  await page.locator('input[name=password]').fill(password);
  await submit(page,target,'/login/',303);
  assert.equal(new URL(page.url()).pathname,'/account/password/');
  const session=(await page.context().cookies(target.origin)).find(cookie=>cookie.name==='__Host-knaba-session');
  assert.ok(session,'Actual login issues a session cookie');remember(session.value);
  assert.equal(target.sessionMatches(name,session.name+'='+session.value),true,'New session belongs to the intended unchanged principal');
  assert.equal(session.secure,true);assert.equal(session.httpOnly,true);assert.equal(session.sameSite,'Strict');
  await navigate(page,target,'/account/password/');
}
async function localeFlow(lang,otherPage){
  currentCase='recovery-'+lang;
  const words=accountWords(lang),page=await newPage(fixture),old=await newPage(fixture,{identity:lang});
  const authority=fixture.authoritySnapshot(),other=fixture.otherSnapshot(),beforeCredential=fixture.credentialDigest(lang);
  assert.equal(fixture.sessionCount(lang),2);await navigate(old,fixture,'/account/password/');
  const start=await navigate(page,fixture,'/forgot-password/?lang='+lang);privateHeaders(start);
  await checkForm(page,lang,'forgot');await skipFocus(page);await layout(page,lang,'forgot');
  const mail=await requestRecovery(page,fixture,lang,lang);
  await openCapability(page,fixture,mail,lang);await layout(page,lang,'reset');
  await skipFocus(page);
  assert.ok((await page.locator('#account-token').inputValue())===mail.token,'Skip navigation preserves the bound capability');
  // A genuine link navigation and Back must not restore the original fragment.
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('.account-back').click()]);
  assert.equal(new URL(page.url()).pathname,'/login/');assert.equal(new URL(page.url()).hash,'');
  await page.goBack({waitUntil:'domcontentloaded'});
  assert.equal(new URL(page.url()).pathname,'/reset-password/');
  assert.ok(['','#account-main'].includes(new URL(page.url()).hash),'Back may restore the skip anchor, never the recovery capability');
  fixture.assertIsolated();await openCapability(page,fixture,mail,lang,{sameDocument:true});
  record('Fragment binding, history scrub and non-consuming GET',{locale:lang});

  const next=remember('Synthetic-new-'+lang+'-'+randomBytes(18).toString('base64url'));
  await fillPasswords(page,next,next+'-mismatch');
  const posts=fixture.requestCount('POST','/reset-password/');
  await page.locator('form button[type=submit]').click();
  const validity=await page.locator('#account-confirm').evaluate(node=>({customError:node.validity.customError,message:node.validationMessage}));
  assert.equal(validity.customError,true);assert.equal(validity.message,words.passwordMismatch);
  assert.equal(fixture.requestCount('POST','/reset-password/'),posts,'Client mismatch must not POST or lose the bound token');
  assert.ok((await page.locator('#account-token').inputValue())===mail.token);
  assert.equal(fixture.tokenExists(mail.token),true);assert.equal(fixture.credentialDigest(lang),beforeCredential);
  record('Localized confirmation mismatch blocks POST and keeps capability',{locale:lang});

  await page.locator('#account-token-edit').click();
  assert.equal(await page.locator('#account-token').getAttribute('type'),'text');
  assert.equal(await page.locator('#account-token').inputValue(),'');
  assert.equal(await page.locator('#account-token').evaluate(node=>node===document.activeElement),true);
  await page.locator('#account-token').fill(remember(randomBytes(32).toString('base64url')));
  await fillPasswords(page,next);
  const invalid=await submit(page,fixture,'/reset-password/',422);privateHeaders(invalid);
  assert.equal((await page.locator('#account-error').textContent()).trim(),words.invalidToken);
  assert.equal(await page.locator('#account-error').evaluate(node=>node===document.activeElement),true);
  assert.equal(await page.locator('#account-token').inputValue(),'');
  assert.equal(await page.locator('#account-new').inputValue(),'');
  assert.equal(fixture.credentialDigest(lang),beforeCredential);assert.equal(fixture.sessionCount(lang),2);
  record('Invalid capability is rejected with localized, focused, secret-free error',{locale:lang});

  await openCapability(page,fixture,mail,lang,{sameDocument:true});
  record('Same-document link rebinds the capability after a rejected POST without a request',{locale:lang});
  await fillPasswords(page,next);
  const done=await submit(page,fixture,'/reset-password/',200);privateHeaders(done);
  assert.equal((await page.locator('#account-notice').textContent()).trim(),words.resetDone);
  assert.equal(await page.locator('form').count(),0);assert.equal(fixture.tokenExists(mail.token),false);
  assert.equal(fixture.sessionCount(lang),0,'All old sessions are revoked atomically');
  assert.notEqual(fixture.credentialDigest(lang),beforeCredential);
  await reopenCompleted(page,fixture,mail,lang);
  record('Completed recovery reopens through one GET without replaying POST or reviving its capability',{locale:lang});
  await navigate(page,fixture,'/account/password/',401); // No automatic login.
  await navigate(old,fixture,'/account/password/',401); // Previously working browser session.
  await navigate(otherPage,fixture,'/account/password/');await assertAuthority(fixture,authority,other);
  await newPasswordLogin(page,fixture,lang,lang,next);
  record('Actual reset revokes old sessions; old password fails; new password logs in',{locale:lang,oldSessionsRevoked:2,otherSessionPreserved:true,authorityPreserved:true});

  const changed=fixture.credentialDigest(lang),sessions=fixture.sessionCount(lang),replay=await newPage(fixture);
  const replayUrl=new URL(mail.link);await navigate(replay,fixture,replayUrl.pathname+replayUrl.search+replayUrl.hash);
  assert.equal(new URL(replay.url()).hash,'');await fillPasswords(replay,next+'-replay');
  await submit(replay,fixture,'/reset-password/',422);
  assert.equal((await replay.locator('#account-error').textContent()).trim(),words.invalidToken);
  assert.equal(fixture.credentialDigest(lang),changed);assert.equal(fixture.sessionCount(lang),sessions);
  await navigate(page,fixture,'/account/password/');await assertAuthority(fixture,authority,other);
  record('Consumed capability replay cannot change credentials or revoke the new session',{locale:lang});
  await closePage(replay);await closePage(old);await closePage(page);
}
async function fragmentNegatives(){
  currentCase='malformed-fragments';const token=remember(randomBytes(32).toString('base64url'));
  for(const [name,fragment] of [['malformed','#token=short'],['duplicate','#token='+token+'&token='+token],['extra-field','#token='+token+'&extra=1'],['line-terminator','#token='+token+'%0A']]){
    const page=await newPage(fixture);
    await navigate(page,fixture,'/reset-password/?lang=en'+fragment);
    assert.equal(new URL(page.url()).hash,'');assert.equal(await page.locator('#account-token').inputValue(),'');
    assert.equal(await page.locator('#account-token-entry').isVisible(),true);
    assert.equal(await page.locator('#account-token-ready').isVisible(),false);
    await navigateFragment(page,fixture,'/reset-password/?lang=en#token='+token);
    assert.ok((await page.locator('#account-token').inputValue())===token);
    await fillPasswords(page,remember('Synthetic-stale-'+randomBytes(18).toString('base64url')));
    await navigateFragment(page,fixture,'/reset-password/?lang=en'+fragment);
    assert.equal(await page.locator('#account-token').inputValue(),'');
    assert.equal(await page.locator('#account-token').getAttribute('type'),'text');
    assert.equal(await page.locator('#account-token-entry').isVisible(),true);
    assert.equal(await page.locator('#account-token-ready').isVisible(),false);
    assert.equal(await page.locator('#account-new').inputValue(),'');assert.equal(await page.locator('#account-confirm').inputValue(),'');
    record('Malformed fragment is scrubbed on load and clears stale same-document binding',{case:name});
    await closePage(page);
  }
}
async function noJavaScript(){
  currentCase='manual-no-javascript';const lang='uk',name='manual',words=accountWords(lang);
  const page=await newPage(fixture,{javaScriptEnabled:false}),old=await newPage(fixture,{javaScriptEnabled:false,identity:name});
  const authority=fixture.authoritySnapshot(),other=fixture.otherSnapshot(),before=fixture.credentialDigest(name);
  await navigate(old,fixture,'/account/password/');
  await navigate(page,fixture,'/forgot-password/?lang='+lang);await checkForm(page,lang,'forgot');
  const mail=await requestRecovery(page,fixture,name,lang),next=remember('Synthetic-manual-'+randomBytes(18).toString('base64url'));
  // No script is expected to handle a fragment. The shipped manual-code field
  // is exercised with a clean URL and the actual captured one-use capability.
  await navigate(page,fixture,'/reset-password/?lang='+lang);await checkForm(page,lang,'reset');
  assert.equal(await page.locator('#account-token-entry').isVisible(),true);
  await page.locator('#account-token').fill(mail.token);await fillPasswords(page,next,next+'-mismatch');
  await submit(page,fixture,'/reset-password/',422);
  assert.equal((await page.locator('#account-error').textContent()).trim(),words.invalidToken);
  assert.equal(await page.locator('#account-token').inputValue(),'');assert.equal(await page.locator('#account-new').inputValue(),'');
  assert.equal(fixture.tokenExists(mail.token),true);assert.equal(fixture.credentialDigest(name),before);
  await page.locator('#account-token').fill(mail.token);await fillPasswords(page,next);
  await screenshot(page,'manual-no-javascript-uk-390');
  await submit(page,fixture,'/reset-password/',200);
  assert.equal((await page.locator('#account-notice').textContent()).trim(),words.resetDone);
  assert.equal(fixture.sessionCount(name),0);await navigate(old,fixture,'/account/password/',401);
  await navigate(page,fixture,'/account/password/',401);await newPasswordLogin(page,fixture,name,lang,next);
  await assertAuthority(fixture,authority,other);
  record('No-JavaScript manual recovery: real POST mismatch, reset, revocation and new login',{locale:lang});
  await closePage(old);await closePage(page);
}
async function disabledMail(createFixture){
  currentCase='mail-disabled';const disabled=await createFixture({mailEnabled:false,onSecret:remember});fixtures.push(disabled);
  const page=await newPage(disabled),authority=disabled.authoritySnapshot(),other=disabled.otherSnapshot();
  for(const lang of locales){
    const response=await navigate(page,disabled,'/forgot-password/?lang='+lang);privateHeaders(response);
    const words=accountWords(lang);
    assert.equal(await page.locator('html').getAttribute('lang'),lang);
    assert.equal((await page.locator('h1').textContent()).trim(),words.recoverTitle);
    assert.equal((await page.locator('.info').textContent()).trim(),words.recoveryUnavailable);
    assert.equal(await page.locator('form').count(),0);assert.equal(await page.locator('#account-notice').count(),0);
    assert.equal(await page.getByRole('link',{name:words.contact,exact:true}).getAttribute('href'),(lang==='de'?'':'/'+lang)+'/kontakt/');
    for(const width of widths){
      await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    }
    record('Disabled mail gives honest localized contact fallback without a sent claim',{locale:lang,widths});
  }
  await disabled.drain();assert.equal(disabled.mailCount(),0);await assertAuthority(disabled,authority,other);
  await screenshot(page,'mail-disabled-uk-1440');await closePage(page);
}
const environmentFailure=(error,stage)=>{
  const message=String(error?.message??error);
  if(/ERR_BLOCKED_BY_ADMINISTRATOR|No usable sandbox|Chromium sandboxing failed|Failed to move to new namespace|Running as root without|Operation not permitted/i.test(message))return 'POLICY_OR_SANDBOX_BLOCKED';
  if(stage==='launch'&&/Executable doesn't exist|Executable does not exist|browser.*not installed|ENOENT|No such file or directory/i.test(message))return 'BROWSER_UNAVAILABLE';
  return null;
};
async function run(){
  await mkdir(output,{recursive:true});
  await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  assert.equal(process.env.KNABA_TEST_URL,undefined,'This harness accepts no pre-existing or live test origin');
  receipt.source=sourceIdentity();
  try{receipt.inputs=await inputProof();}
  catch(error){if(error.code==='ENOENT'){receipt.status='BLOCKED';receipt.reason='EXACT_BUILT_SITE_INPUTS_UNAVAILABLE';return;}throw error;}
  let drivers;
  try{drivers=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');}
  catch{receipt.status='BLOCKED';receipt.reason='PLAYWRIGHT_MODULE_UNAVAILABLE';return;}
  const {createPasswordRecoveryFixture}=await import('./fixtures/password-recovery-server.mjs');
  fixture=await createPasswordRecoveryFixture({onSecret:remember});fixtures.push(fixture);
  const skip=(process.env.KNABA_BROWSER_SKIP||'').split(',').map(value=>value.trim());
  for(const engine of ['chromium','webkit','firefox']){
    if(skip.includes(engine)){receipt.engines.push({engine,status:'SKIPPED_BY_OPERATOR'});continue;}
    if(typeof drivers[engine]?.launch!=='function'){receipt.engines.push({engine,status:'BROWSER_UNAVAILABLE'});continue;}
    const executable=engine==='chromium'&&process.env.KNABA_CHROME_PATH?process.env.KNABA_CHROME_PATH:drivers[engine].executablePath();
    try{await access(executable,fsConstants.X_OK);}
    catch{receipt.engines.push({engine,status:'BROWSER_UNAVAILABLE',reason:'NO_EXECUTABLE_ALREADY_INSTALLED'});continue;}
    let stage='launch',probe;
    try{
      const options={headless:true};
      if(engine==='chromium'){
        options.chromiumSandbox=true;
        if(process.env.KNABA_CHROME_PATH)options.executablePath=process.env.KNABA_CHROME_PATH;
      }
      browser=await drivers[engine].launch(options);stage='preflight';
      probe=await newPage(fixture);await navigate(probe,fixture,'/forgot-password/?lang=de');
      await closePage(probe);probe=null;
      receipt.browser=engine;receipt.browserVersion=browser.version();receipt.engines.push({engine,status:'SELECTED'});break;
    }catch(error){
      if(probe){await probe.context().close().catch(()=>{});contexts.delete(probe.context());}
      if(browser)await browser.close().catch(()=>{});browser=null;
      const reason=environmentFailure(error,stage);if(!reason)throw error;
      receipt.engines.push({engine,status:'BLOCKED',reason,stage,detail:safe(String(error?.message??error))});
    }
  }
  if(!browser){receipt.status='BLOCKED';receipt.reason='NO_USABLE_BROWSER';return;}
  await Promise.race([(async()=>{
    const other=await newPage(fixture,{identity:'other'});await navigate(other,fixture,'/account/password/');
    for(const lang of locales)await localeFlow(lang,other);
    await closePage(other);await fragmentNegatives();await noJavaScript();await disabledMail(createPasswordRecoveryFixture);
    assertClean();
  })(),externalFailure]);
  assert.equal((await inputProof()).sha256,receipt.inputs.sha256,'Source/build inputs changed during acceptance');
  receipt.status='PASS';
}
try{await run();}
catch(error){
  receipt.status='FAIL';receipt.failure={case:currentCase,message:safe(error.message)};
  if(activePage&&!activePage.isClosed())try{await screenshot(activePage,'failure-masked');}catch{receipt.failure.screenshot='UNAVAILABLE';}
}finally{
  for(const item of fixtures){try{receipt.fixtureEvidence??=[];receipt.fixtureEvidence.push(item.evidence());}catch{}}
  for(const context of contexts)await context.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  for(const item of fixtures)try{await item.close();}catch{receipt.status='FAIL';receipt.cleanupError='Synthetic fixture cleanup failed';}
  receipt.finishedAt=new Date().toISOString();receipt.completedChecks=receipt.checks.length;
  await mkdir(output,{recursive:true});
  const temporary=join(output,'receipt.json.tmp');await writeFile(temporary,JSON.stringify(safeObject(receipt),null,2)+'\n');
  await rename(temporary,join(output,'receipt.json'));
  process.stdout.write(JSON.stringify(safeObject({status:receipt.status,browser:receipt.browser,completedChecks:receipt.completedChecks,
    reason:receipt.reason,failure:receipt.failure,receipt:join(output,'receipt.json')}),null,2)+'\n');
  process.exitCode=receipt.status==='PASS'?0:receipt.status==='BLOCKED'?2:1;
}
