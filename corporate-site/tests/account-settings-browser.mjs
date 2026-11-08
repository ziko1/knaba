/** Real SSR forms, HTTPS, SQLite and browser JavaScript; synthetic identities only.
 * Mail uses the production adapter with an in-memory transport, never a provider.
 * No browser download, retry, trace, HAR, persistent profile or sandbox bypass.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {access,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAccountMailer} from '../vps/account-mail.mjs';
import {createRoleUxFixture} from './fixtures/role-ux-server.mjs';

const require=createRequire(import.meta.url);
const {browserFailureReason}=require('./browser-policy-gate.cjs');
const repo=fileURLToPath(new URL('../../',import.meta.url));
const output=resolve(process.env.KNABA_ACCOUNT_QA_DIR||'/tmp/knaba-account-browser-evidence');
const requiredCases=[
  'account.profile.persisted','account.validation.focus','account.sessions.revoke-others',
  'account.password.rotate','account.mail.disabled','account.reset.fragment',
  'account.reset.replay','account.email.confirm','account.layout.keyboard',
];
const locales=['de','en','pl','lt','ru','uk'];
const allowedPosts=new Set(['/login/','/account/settings/','/account/password/',
  '/account/sessions/','/account/email/','/forgot-password/','/reset-password/','/account/email/confirm/']);
const passwords={initial:'Synthetic-browser-only-2026',changed:'Synthetic-account-rotation-2026',
  reset:'Synthetic-account-recovery-2026',replay:'Synthetic-unused-replay-2026',mismatch:'Synthetic-mismatch-2026'};
const profile={name:'QA Synthetic Account',phone:'+49 30 00000000',company:'Synthetic QA Organisation',
  address:'Synthetic QA street 1',locale:'uk',timeZone:'Europe/Vilnius'};
const secrets=new Set([...Object.values(passwords),profile.name,profile.phone,profile.company,profile.address,
  'synthetic-browser-not-a-real-key']);
const receipt={startedAt:new Date().toISOString(),environment:'isolated HTTPS / actual built website / synthetic SQLite',
  scope:'Rendered account forms, persistence, credentials, sessions, fragment scripts and in-memory mail delivery.',
  checks:[],engines:[],errors:[],blockedExternalRequests:[],screenshots:[]};
const contexts=new Set(),traffic=[],mail=[];
let browser,fixture,mailer,lastPage,activeCase,mailTransportCalls=0;

function safe(value){
  let result=String(value??'');
  for(const secret of secrets)if(secret)result=result.replaceAll(secret,'[redacted]');
  return result.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[synthetic-email]')
    .replace(/\b[A-Za-z0-9_-]{43}\b/g,'[redacted-code]')
    .replace(/((?:token|password|authorization|cookie)\s*[=:]\s*)[^\s,;"'<>]+/gi,'$1[redacted]');
}
function sourceState(){
  const read=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  return {sha:read(['rev-parse','HEAD']),clean:read(['status','--porcelain'])===''};
}
async function artifactDigest(){
  const root=fileURLToPath(new URL('../dist/client/',import.meta.url)),files=[];
  async function walk(directory){
    for(const entry of await readdir(directory,{withFileTypes:true})){
      const path=join(directory,entry.name);
      if(entry.isDirectory())await walk(path);
      else if(entry.isFile())files.push(path);
      else throw Error('Non-regular client artifact entry');
    }
  }
  await walk(root);assert.ok(files.length>0,'a fresh client build is required');
  const digest=createHash('sha256');
  for(const path of files.sort())digest.update(relative(root,path)+'\0').update(await readFile(path)).update('\0');
  return {files:files.length,sha256:digest.digest('hex'),algorithm:'SHA-256(sorted relative path + NUL + bytes + NUL)'};
}
function assertNoBrowserErrors(){
  assert.equal(receipt.errors.length,0,'browser JavaScript, CSP and local-write checks must succeed');
  assert.equal(receipt.blockedExternalRequests.length,0,'the browser must not attempt external requests');
}
async function runCase(caseId,work){
  activeCase=caseId;
  const details=await work();
  assertNoBrowserErrors();
  receipt.checks.push({caseId,status:'PASS',...details});
  activeCase=null;
}
async function openPage(){
  const origin=new URL(fixture.origin);
  assert.equal(origin.protocol,'https:');assert.equal(origin.hostname,'127.0.0.1');
  const context=await browser.newContext({ignoreHTTPSErrors:true,locale:'en-GB',
    viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
  contexts.add(context);
  // Capture script-policy failures across navigations, without copying URLs or DOM text.
  await context.exposeBinding('__accountScriptPolicyFailure',(_source,directive)=>{
    receipt.errors.push({type:'script-csp',directive:String(directive).slice(0,80)});
  });
  await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{
    if(event.effectiveDirective.startsWith('script-src'))
      void globalThis.__accountScriptPolicyFailure(event.effectiveDirective).catch(()=>{});
  }));
  await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==fixture.origin){
      receipt.blockedExternalRequests.push({host:url.hostname,path:safe(url.pathname)});
      return route.abort('blockedbyclient');
    }
    if(!['GET','HEAD'].includes(request.method())&&!(request.method()==='POST'&&allowedPosts.has(url.pathname))){
      receipt.errors.push({type:'unexpected-write',path:url.pathname,method:request.method()});
      return route.abort('blockedbyclient');
    }
    const metadata=request.url()+' '+(request.headers().referer||'');
    if([...secrets].some(secret=>secret&&metadata.includes(secret))||url.searchParams.has('token')){
      receipt.errors.push({type:'secret-in-request-metadata',path:url.pathname});
      return route.abort('blockedbyclient');
    }
    traffic.push({method:request.method(),path:url.pathname});
    return route.continue();
  });
  const page=await context.newPage();lastPage=page;
  page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000);
  page.on('pageerror',error=>receipt.errors.push({type:'pageerror',message:safe(error.message)}));
  page.on('popup',popup=>{receipt.errors.push({type:'unexpected-popup'});void popup.close();});
  return page;
}
async function closePages(){
  for(const context of contexts){await context.close();contexts.delete(context);}
  lastPage=null;
}
async function navigate(page,path,status=200){
  assert.ok(path.startsWith('/')&&!path.startsWith('//'),'only local fixture paths are accepted');
  lastPage=page;
  const response=await page.goto(fixture.origin+path,{waitUntil:'domcontentloaded'});
  assert.equal(response?.status(),status,'rendered navigation HTTP status');
  assert.equal(new URL(page.url()).origin,fixture.origin,'navigation stays inside the fixture');
  return response;
}
async function submit(page,form,status){
  lastPage=page;
  const path=new URL(await form.getAttribute('action'),fixture.origin).pathname;
  const [response]=await Promise.all([
    page.waitForResponse(reply=>reply.request().method()==='POST'&&new URL(reply.url()).pathname===path),
    page.waitForNavigation({waitUntil:'domcontentloaded'}),
    form.locator('button[type="submit"]').click(),
  ]);
  assert.equal(response.status(),status,'native form POST status for '+path);
  assert.equal(new URL(page.url()).origin,fixture.origin);
  return response;
}
async function login(page,role,{password=passwords.initial,email=fixture.identities[role].email,accepted=true}={}){
  await navigate(page,'/login/?lang=en&return_to='+encodeURIComponent('/account/settings/?lang=en'));
  const form=page.locator('form:has(input[name="password"])');
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(password);
  await submit(page,form,accepted?303:401);
  if(accepted){
    assert.equal(new URL(page.url()).pathname,'/account/settings/');
    await page.locator('.account-layout').waitFor({state:'visible'});
  }else{
    assert.equal(new URL(page.url()).pathname,'/login/');
    assert.equal(await page.locator('.account-layout').count(),0);
  }
}
function sessionCount(role){
  return Number(fixture.db.prepare('SELECT count(*) AS n FROM vps_sessions WHERE user_id=?')
    .get(fixture.identities[role].id).n);
}
function authority(role){
  const row=fixture.db.prepare('SELECT role,status,requested_role FROM profiles WHERE id=?')
    .get(fixture.identities[role].id);
  return row?{...row}:null;
}
function accountSettings(role){
  const row=fixture.db.prepare('SELECT name,phone,company,address,locale,time_zone,version FROM vps_account_settings WHERE user_id=?')
    .get(fixture.identities[role].id);
  return row?{...row}:null;
}
function foreignSnapshot(){
  const id=fixture.identities.client2.id;
  const data={profile:fixture.db.prepare('SELECT * FROM profiles WHERE id=?').get(id),
    user:fixture.db.prepare('SELECT * FROM vps_users WHERE id=?').get(id),
    settings:fixture.db.prepare('SELECT * FROM vps_account_settings WHERE user_id=?').get(id),
    sessions:fixture.db.prepare('SELECT * FROM vps_sessions WHERE user_id=? ORDER BY token_hash').all(id)};
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
function credentialDigest(role){
  const row=fixture.db.prepare('SELECT salt,password_hash FROM vps_users WHERE id=?').get(fixture.identities[role].id);
  return createHash('sha256').update(JSON.stringify(row)).digest('hex');
}
function assertPrivateHeaders(response,{script=false}={}){
  const headers=response.headers(),policy=headers['content-security-policy']||'';
  assert.match(policy,/(?:^|;\s*)default-src 'none'(?:;|$)/);
  assert.match(policy,/(?:^|;\s*)form-action 'self'(?:;|$)/);
  assert.match(headers['cache-control']||'',/no-store/);
  assert.equal(headers['referrer-policy'],'strict-origin');
  if(script){
    const sources=policy.split(';').map(part=>part.trim()).find(part=>part.startsWith('script-src '));
    assert.ok(sources,'interactive account scripts require an explicit CSP directive');
    assert.match(sources,/^script-src (?:'sha256-[A-Za-z0-9+/]{43}='\s*)+$/,
      'only exact inline-script hashes are authorized');
  }
}
async function expectErrorFocus(page,response){
  assertPrivateHeaders(response,{script:true});
  await page.locator('#account-error[role="alert"]').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.activeElement?.id==='account-error');
}
async function screenshot(page,name){
  assert.match(name,/^[a-z0-9-]+\.png$/);
  assert.equal(new URL(page.url()).hash,'','fragment must be removed before screenshot capture');
  await page.screenshot({path:join(output,name),fullPage:true,timeout:10000,
    mask:[page.locator('input:not([type="hidden"]),textarea,time,[contenteditable="true"]')]});
  receipt.screenshots.push(name);
}
async function expectSignedOut(page){
  await navigate(page,'/account/settings/?lang=en');
  assert.equal(new URL(page.url()).pathname,'/login/','revoked browser session cannot reopen settings');
  assert.equal(await page.locator('.account-layout').count(),0);
}
async function disabledMailCase(){
  fixture=await createRoleUxFixture();
  const page=await openPage();await login(page,'client');
  assert.equal(await page.locator('form[action^="/account/email/"]').count(),0);
  assert.equal(await page.locator('#security .info').innerText(),
    'Email address confirmation is currently unavailable. Your current address remains active.');
  const response=await navigate(page,'/forgot-password/?lang=en');assertPrivateHeaders(response);
  assert.equal(await page.locator('form').count(),0);
  assert.equal(await page.locator('#account-notice').count(),0,'disabled recovery must not claim delivery');
  assert.equal(await page.locator('#account-main .info').innerText(),
    'Email recovery is currently unavailable. Contact KNABA through a verified channel.');
  await page.getByRole('link',{name:'Contact KNABA',exact:true}).waitFor({state:'visible'});
  await screenshot(page,'mail-disabled.png');
  await closePages();await fixture.close();fixture=null;
  return {mail:'disabled',deliveryClaim:false};
}
async function mailFixture(){
  fixture=await createRoleUxFixture({accountEmailEnvironment:{
    KNABA_ACCOUNT_EMAIL_ENABLED:'approved',KNABA_ACCOUNT_EMAIL_FROM:'KNABA QA <account@example.test>',
    RESEND_API_KEY:'synthetic-browser-not-a-real-key',KNABA_ACCOUNT_EMAIL_DAILY_LIMIT:'100',
  },accountMailerFactory:options=>{
    // This adapter seam has no fetch fallback. The only "delivery" is this array.
    mailer=createAccountMailer({...options,transport:async(endpoint,init)=>{
      mailTransportCalls++;
      assert.equal(endpoint,'https://api.resend.com/emails');assert.equal(init.method,'POST');
      const body=JSON.parse(init.body),links=body.text.match(/^https:\/\/[^\s]+$/gm)||[];
      assert.equal(links.length,1,'synthetic message contains one capability link');
      const url=new URL(links[0]),token=new URLSearchParams(url.hash.slice(1)).get('token');
      if(token)secrets.add(token);
      assert.equal(url.origin,options.origin);assert.ok(/^[A-Za-z0-9_-]{43}$/.test(token||''));
      assert.ok(['/reset-password/','/account/email/confirm/'].includes(url.pathname));
      assert.equal(body.to.length,1);assert.ok(body.to[0].endsWith('@example.test'));
      mail.push({kind:url.pathname==='/reset-password/'?'password_reset':'email_change',email:body.to[0],url:url.href,token});
      return new Response(JSON.stringify({id:'synthetic-mail-'+mailTransportCalls}),{
        status:200,headers:{'Content-Type':'application/json'},
      });
    }});
    assert.equal(mailer.enabled,true,'the injected test adapter must be configured');
    return mailer;
  }});
}
async function profileCase(page){
  const before=authority('client'),foreign=foreignSnapshot();
  assert.deepEqual(before,{role:'client',status:'approved',requested_role:'client'});
  const form=page.locator('#profile form');
  for(const name of ['name','phone','company','address','timeZone'])await form.locator('[name="'+name+'"]').fill(profile[name]);
  await form.locator('[name="locale"]').selectOption(profile.locale);
  assertPrivateHeaders(await submit(page,form,200));
  await page.locator('#account-notice[role="status"]').waitFor({state:'visible'});
  const saved=accountSettings('client');
  assert.ok(saved&&Object.entries(profile).every(([key,value])=>saved[key==='timeZone'?'time_zone':key]===value),
    'all submitted contact fields and preferences must persist together');
  assert.equal(saved.version,1);assert.deepEqual(authority('client'),before);
  assert.equal(fixture.db.prepare('SELECT name FROM profiles WHERE id=?').get(fixture.identities.client.id).name===profile.name,true);
  assert.equal(foreignSnapshot()===foreign,true,'profile editing cannot change another account');
  await navigate(page,'/account/settings/');
  const reload=await page.reload({waitUntil:'domcontentloaded'});assert.equal(reload.status(),200);
  assert.equal(await page.locator('html').getAttribute('lang'),'uk','stored locale survives a fresh request without a query override');
  for(const [name,value] of Object.entries(profile))
    assert.equal(await page.locator('#profile [name="'+name+'"]').inputValue()===value,true,'saved '+name+' is rendered after reload');
  assert.equal(await page.locator('#profile [name="role"],#profile [name="status"]').count(),0);
  assert.ok((await page.locator('#sessions .help').first().innerText()).includes('Europe/Vilnius'));
  return {fields:6,locale:'uk',timeZone:'Europe/Vilnius',reload:true,role:'client',foreignAccountUnchanged:true};
}
async function validationCase(page){
  const before=accountSettings('client');
  await page.locator('#account-timeZone').fill('Planet/Unknown');
  const response=await submit(page,page.locator('#profile form'),422);
  await expectErrorFocus(page,response);
  assert.equal(JSON.stringify(accountSettings('client'))===JSON.stringify(before),true,'rejected form must not partially persist');
  assert.equal(await page.locator('#profile form').getAttribute('aria-describedby'),'account-error');
  await screenshot(page,'validation-focus.png');
  await navigate(page,'/account/settings/?lang=en');
  return {invalidTimeZone:422,atomic:true,errorFocused:true};
}
async function layoutCase(page){
  let combinations=0;
  for(const width of [390,1440])for(const locale of locales){
    await page.setViewportSize({width,height:width===390?844:1000});
    assertPrivateHeaders(await navigate(page,'/account/settings/?lang='+locale));
    assert.equal(await page.locator('html').getAttribute('lang'),locale);
    const layout=await page.evaluate(()=>({
      width:innerWidth,documentWidth:document.documentElement.scrollWidth,
      labelled:[...document.querySelectorAll('input:not([type="hidden"]),select')]
        .every(control=>control.labels?.length>0),
      landmark:document.querySelectorAll('main#account-main').length,
    }));
    assert.ok(layout.documentWidth<=layout.width+1,'account page must not overflow horizontally at '+width+' / '+locale);
    assert.equal(layout.labelled,true);assert.equal(layout.landmark,1);
    if((width===390&&locale==='uk')||(width===1440&&locale==='de'))
      await screenshot(page,'settings-'+locale+'-'+width+'.png');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip').evaluate(node=>node===document.activeElement),true,'first Tab reaches skip link');
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.activeElement?.id==='account-main');
    await page.locator('#account-name').focus();await page.keyboard.press('Tab');
    assert.equal(await page.locator('#account-phone').evaluate(node=>node===document.activeElement),true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#account-name').evaluate(node=>node===document.activeElement),true);
    combinations++;
  }
  await page.setViewportSize({width:1440,height:1000});await navigate(page,'/account/settings/?lang=en');
  return {viewports:[390,1440],locales,combinations,keyboard:['skip-link','forward-tab','reverse-tab'],labels:true};
}
async function sessionsCase(page){
  const other=await openPage();await login(other,'client');
  const before=sessionCount('client'),foreign=foreignSnapshot();assert.ok(before>=3,'seed and both browser sessions exist');
  await navigate(page,'/account/settings/?lang=en');
  const form=page.locator('#sessions form:has(input[name="target"][value="others"])');
  assertPrivateHeaders(await submit(page,form,200));
  await page.locator('#account-notice').waitFor({state:'visible'});
  assert.equal(sessionCount('client'),1);assert.equal(foreignSnapshot()===foreign,true);
  assert.equal(await page.locator('#sessions .current-badge').count(),1);
  assert.equal(await page.locator('#sessions .session-item').count(),1);
  await expectSignedOut(other);
  await navigate(page,'/account/settings/?lang=en');await page.locator('.account-layout').waitFor({state:'visible'});
  return {sessionsBefore:before,sessionsAfter:1,otherBrowserDenied:true,currentBrowserRetained:true,foreignAccountUnchanged:true};
}
async function passwordCase(page){
  const before=authority('client'),credentials=credentialDigest('client');
  assertPrivateHeaders(await navigate(page,'/account/password/?lang=en'),{script:true});
  await page.locator('#account-current').fill(passwords.initial);
  await page.locator('#account-new').fill(passwords.changed);
  await page.locator('#account-confirm').fill(passwords.changed);
  await submit(page,page.locator('form'),303);
  assert.equal(new URL(page.url()).pathname,'/login/');assert.equal(sessionCount('client'),0);
  assert.equal(credentialDigest('client')!==credentials,true);assert.deepEqual(authority('client'),before);
  await login(await openPage(),'client',{password:passwords.initial,accepted:false});
  await login(await openPage(),'client',{password:passwords.changed});
  return {oldPasswordRejected:true,newPasswordAccepted:true,allPreviousSessionsRevoked:true,role:'client'};
}
async function tokenPage(page,message){
  const url=new URL(message.url);
  assert.equal(url.origin,fixture.origin);
  const response=await navigate(page,url.pathname+url.search+url.hash);assertPrivateHeaders(response,{script:true});
  await page.waitForFunction(()=>location.hash===''&&document.querySelector('#account-token')?.type==='hidden');
  assert.equal(await page.locator('#account-token').inputValue()===message.token,true,'fragment is transferred to the POST field');
  assert.equal(await page.locator('#account-token-entry').isVisible(),false);
  await page.locator('#account-token-ready').waitFor({state:'visible'});
}
async function mismatchCannotSubmit(page){
  await page.locator('#account-new').fill(passwords.reset);
  await page.locator('#account-confirm').fill(passwords.mismatch);
  const posts=traffic.filter(item=>item.method==='POST'&&item.path==='/reset-password/').length;
  await page.locator('form button[type="submit"]').click();
  assert.equal(await page.locator('#account-confirm').evaluate(node=>node.validity.customError),true,
    'hash-authorized validation script rejects mismatched confirmation in the browser');
  assert.equal(traffic.filter(item=>item.method==='POST'&&item.path==='/reset-password/').length,posts,
    'mismatched confirmation must not reach the server');
  assert.equal(await page.locator('#account-confirm').evaluate(node=>node===document.activeElement),true);
  await page.locator('#account-confirm').fill(passwords.reset);
  assert.equal(await page.locator('#account-confirm').evaluate(node=>node.validity.valid),true);
}
async function resetCase(){
  const previous=await openPage();await login(previous,'partner');
  const before=authority('partner'),credentials=credentialDigest('partner'),page=await openPage();
  await navigate(page,'/forgot-password/?lang=en');
  await page.locator('input[name="email"]').fill(fixture.identities.partner.email);
  const accepted=await submit(page,page.locator('form'),202);assertPrivateHeaders(accepted);
  const genericNotice=await page.locator('#account-notice').innerText();
  await mailer.drain();
  const messages=mail.filter(item=>item.kind==='password_reset'&&item.email===fixture.identities.partner.email);
  assert.equal(messages.length,1,'eligible recovery creates one in-memory mail');
  assert.equal(sessionCount('partner')>=2,true,'request alone must not revoke sessions');
  const sent=mailTransportCalls;
  await navigate(page,'/forgot-password/?lang=en');
  await page.locator('input[name="email"]').fill('unknown-account@example.test');
  await submit(page,page.locator('form'),202);await mailer.drain();
  assert.equal(await page.locator('#account-notice').innerText(),genericNotice,'recovery response cannot disclose account existence');
  assert.equal(mailTransportCalls,sent,'unknown identity does not schedule delivery');
  const message=messages[0];await tokenPage(page,message);
  assert.equal(credentialDigest('partner')===credentials,true,'opening a link must not consume it');
  await screenshot(page,'reset-fragment-ready.png');
  // Manual-entry recovery is keyboard reachable, clears the old capability, and focuses its labelled field.
  await page.locator('#account-token-edit').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#account-token').inputValue(),'');
  assert.equal(await page.locator('#account-token').evaluate(node=>node===document.activeElement),true);
  assert.equal(await page.locator('#account-token-ready').isVisible(),false);
  // Follow the mail link in a fresh document after exercising the manual-entry control.
  await navigate(page,'/forgot-password/?lang=en');
  await tokenPage(page,message);
  await mismatchCannotSubmit(page);
  assertPrivateHeaders(await submit(page,page.locator('form'),200));
  await page.locator('#account-notice').waitFor({state:'visible'});
  assert.equal(await page.locator('form').count(),0);assert.equal(sessionCount('partner'),0);
  assert.equal(credentialDigest('partner')!==credentials,true);assert.deepEqual(authority('partner'),before);
  await expectSignedOut(previous);await expectSignedOut(page);
  await login(await openPage(),'partner',{password:passwords.initial,accepted:false});
  await login(await openPage(),'partner',{password:passwords.reset});
  return {fragmentRemoved:true,exactScriptCsp:true,nativeValidation:true,manualEntryFocus:true,
    oldPasswordRejected:true,newPasswordAccepted:true,allPreviousSessionsRevoked:true,automaticLogin:false,genericRecoveryResponse:true};
}
async function replayCase(){
  const message=mail.find(item=>item.kind==='password_reset'),page=await openPage();
  const credentials=credentialDigest('partner'),sessions=sessionCount('partner');
  await tokenPage(page,message);
  await page.locator('#account-new').fill(passwords.replay);await page.locator('#account-confirm').fill(passwords.replay);
  const response=await submit(page,page.locator('form'),422);await expectErrorFocus(page,response);
  assert.equal(credentialDigest('partner')===credentials,true,'replaying a consumed capability cannot rotate credentials');
  assert.equal(sessionCount('partner'),sessions,'replay cannot revoke newly established sessions');
  assert.equal(await page.locator('#account-token').inputValue(),'','failed response does not echo the capability');
  await screenshot(page,'reset-replay-error.png');
  return {replay:422,errorFocused:true,credentialsUnchanged:true,newSessionsRetained:true};
}
async function emailCase(){
  const page=await openPage();await login(page,'worker');
  const before=authority('worker'),id=fixture.identities.worker.id,oldEmail=fixture.identities.worker.email;
  const nextEmail='changed-worker@example.test',form=page.locator('form[action^="/account/email/"]');
  await form.locator('input[name="email"]').fill(nextEmail);
  await form.locator('input[name="current"]').fill(passwords.initial);
  assertPrivateHeaders(await submit(page,form,202));
  await page.locator('#account-notice').waitFor({state:'visible'});await mailer.drain();
  assert.equal(fixture.db.prepare('SELECT email FROM vps_users WHERE id=?').get(id).email===oldEmail,true);
  assert.equal(fixture.db.prepare('SELECT email FROM profiles WHERE id=?').get(id).email===oldEmail,true);
  const messages=mail.filter(item=>item.kind==='email_change'&&item.email===nextEmail);assert.equal(messages.length,1);
  const confirmation=await openPage();await tokenPage(confirmation,messages[0]);
  await screenshot(confirmation,'email-confirm-ready.png');
  assertPrivateHeaders(await submit(confirmation,confirmation.locator('form'),200));
  await confirmation.locator('#account-notice').waitFor({state:'visible'});
  assert.equal(fixture.db.prepare('SELECT email FROM vps_users WHERE id=?').get(id).email===nextEmail,true);
  assert.equal(fixture.db.prepare('SELECT email FROM profiles WHERE id=?').get(id).email===nextEmail,true);
  assert.deepEqual(authority('worker'),before);assert.equal(sessionCount('worker'),0);
  await expectSignedOut(page);await expectSignedOut(confirmation);
  await login(await openPage(),'worker',{email:oldEmail,accepted:false});
  await login(await openPage(),'worker',{email:nextEmail});
  const after=sessionCount('worker');await tokenPage(confirmation,messages[0]);
  const replay=await submit(confirmation,confirmation.locator('form'),422);await expectErrorFocus(confirmation,replay);
  assert.equal(sessionCount('worker'),after);
  assert.equal(await confirmation.locator('#account-token').inputValue(),'');
  return {pendingAddressUnchanged:true,fragmentRemoved:true,stableIdentity:true,role:'worker',
    oldAddressRejected:true,newAddressAccepted:true,allPreviousSessionsRevoked:true,replay:422,automaticLogin:false};
}
async function launch(){
  let drivers;
  try{drivers=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');}
  catch{receipt.status='BLOCKED';receipt.reason='PLAYWRIGHT_UNAVAILABLE';return false;}
  const skip=(process.env.KNABA_BROWSER_SKIP||'').split(',').map(value=>value.trim()).filter(Boolean);
  for(const engine of ['chromium','webkit','firefox']){
    if(skip.includes(engine)){receipt.engines.push({engine,status:'SKIPPED_BY_OPERATOR'});continue;}
    // Inventory only installed engines. Never let a missing executable cause an install or retry.
    const executable=engine==='chromium'&&process.env.KNABA_CHROME_PATH?process.env.KNABA_CHROME_PATH:drivers[engine]?.executablePath();
    if(!executable){receipt.status='BLOCKED';receipt.reason='BROWSER_UNAVAILABLE';return false;}
    try{await access(executable,constants.X_OK);}
    catch{receipt.engines.push({engine,status:'BLOCKED',reason:'BROWSER_UNAVAILABLE'});
      receipt.status='BLOCKED';receipt.reason='BROWSER_UNAVAILABLE';return false;}
    try{
      const options={headless:true};
      if(engine==='chromium'){
        options.chromiumSandbox=true;
        if(process.env.KNABA_CHROME_PATH)options.executablePath=process.env.KNABA_CHROME_PATH;
      }
      browser=await drivers[engine].launch(options);receipt.browser=engine;receipt.browserVersion=browser.version();
      receipt.engines.push({engine,status:'LAUNCHED'});return true;
    }catch(error){
      const reason=browserFailureReason(error,'launch');
      if(!reason)throw error;
      receipt.engines.push({engine,status:'BLOCKED',reason});
      receipt.status='BLOCKED';receipt.reason=reason;
      return false; // A known block must not be retried by this suite or hidden by an engine switch.
    }
  }
  receipt.status='BLOCKED';receipt.reason='NO_USABLE_BROWSER';return false;
}
async function run(){
  await mkdir(output,{recursive:true});
  const source=sourceState();assert.equal(source.clean,true,'acceptance requires a clean, committed candidate');
  assert.match(source.sha,/^[a-f0-9]{40}$/);receipt.sourceSha=source.sha;
  if(process.env.KNABA_QA_SOURCE_SHA)assert.equal(source.sha,process.env.KNABA_QA_SOURCE_SHA,'candidate source SHA');
  receipt.clientArtifact=await artifactDigest();receipt.clientArtifactSha256=receipt.clientArtifact.sha256;
  if(process.env.KNABA_QA_CLIENT_SHA256)
    assert.equal(receipt.clientArtifactSha256,process.env.KNABA_QA_CLIENT_SHA256,'candidate client artifact hash');
  if(!await launch())return;
  await runCase('account.mail.disabled',disabledMailCase);
  await mailFixture();const foreign=foreignSnapshot(),page=await openPage();await login(page,'client');
  await runCase('account.profile.persisted',()=>profileCase(page));
  await runCase('account.validation.focus',()=>validationCase(page));
  await runCase('account.layout.keyboard',()=>layoutCase(page));
  await runCase('account.sessions.revoke-others',()=>sessionsCase(page));
  await runCase('account.password.rotate',()=>passwordCase(page));
  await runCase('account.reset.fragment',resetCase);
  await runCase('account.reset.replay',replayCase);
  await runCase('account.email.confirm',emailCase);
  assert.equal(foreignSnapshot()===foreign,true,'all account journeys preserve the unrelated account and its sessions');
  assertNoBrowserErrors();assert.deepEqual(receipt.checks.map(item=>item.caseId).sort(),[...requiredCases].sort());
  assert.deepEqual(await artifactDigest(),receipt.clientArtifact,'built client is unchanged throughout acceptance');
  assert.deepEqual(sourceState(),source,'source candidate is unchanged throughout acceptance');
  receipt.mailTransport={type:'in-memory-production-adapter',calls:mailTransportCalls,messages:mail.length};
  receipt.observedLocalRequests=traffic.length;receipt.status='PASS';
}
try{await run();}
catch(error){
  receipt.status=/listen EPERM|listen EACCES/.test(error.message)||browserFailureReason(error,'suite')==='POLICY_BLOCKED'?'BLOCKED':'FAIL';
  if(activeCase)receipt.checks.push({caseId:activeCase,status:receipt.status});
  receipt.failure={caseId:activeCase||null,message:safe(error.message),stack:safe(error.stack)};
  if(lastPage&&!lastPage.isClosed())try{
    // On a broken fragment script there is deliberately no screenshot: the original code must never be captured.
    if(new URL(lastPage.url()).hash==='')await screenshot(lastPage,'failure.png');
  }catch(problem){receipt.diagnosticError=safe(problem.message);}
}
finally{
  for(const cleanup of [closePages,async()=>fixture?.close(),async()=>browser?.close()]){
    try{await cleanup();}catch(error){
      receipt.errors.push({type:'cleanup',message:safe(error.message)});if(receipt.status==='PASS')receipt.status='FAIL';
    }
  }
  if(receipt.status==='PASS'&&(receipt.errors.length||receipt.blockedExternalRequests.length))receipt.status='FAIL';
  receipt.finishedAt=new Date().toISOString();
  receipt.observedLocalRequests=traffic.length;
  await mkdir(output,{recursive:true});
  const sanitized=safe(JSON.stringify(receipt,null,2));
  await writeFile(join(output,'account-settings-browser-receipt.json'),sanitized+'\n');
  console.log('KNABA_ACCOUNT_BROWSER '+safe(JSON.stringify(receipt)));
  process.exitCode=receipt.status==='PASS'?0:receipt.status==='BLOCKED'?2:1;
}
