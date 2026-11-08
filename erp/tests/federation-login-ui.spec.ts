import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';

// Worker-owned traffic bypasses page.route; this fixture covers HTTP flows,
// while service-worker behavior belongs to a separate browser acceptance scope.
test.use({serviceWorkers:'block'});

// Current ERP build + current VPS HTML, served at intercepted synthetic HTTPS
// origins. Chrome supplies real Strict/Lax cookie behavior. This is not a TLS,
// PostgreSQL, app-link ownership or device acceptance result.
// Distinct registrable domains make the source navigation truly cross-site;
// sharing browser.invalid would send the Strict source cookie on the landing.
const erpOrigin='https://erp.browser.invalid',siteOrigin='https://site.source.invalid',appOrigin='https://app.browser.invalid';
const id='8f5eea31-f424-40b7-8b08-3c7a8a43c5bb',inspectionId='a8ab692d-2fb2-4fc7-bad4-8b2596482159';
const state='s'.repeat(43),code='K3C.'+'c'.repeat(43),flow='synthetic-flow-cookie',oldCookie='o'.repeat(43),newCookie='KF3.'+'n'.repeat(43);
const password='Synthetic source password!',otp='123456',csrf='synthetic-flow-csrf';
const blocked=new WeakMap<Page,string[]>();
const defer=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};};
test.afterEach(async({page})=>{expect(blocked.get(page)??[],'Unexpected requests cannot leave the explicit synthetic fixture.').toEqual([]);});
async function fixture(page:Page,context:BrowserContext,{native=false,approved=false,loginPage=false,corruptIssuer=false,dropConfirm=false,dropStart=false,dropWebBody=false,dropWebCookie=false}={}){
  const failures:string[]=[],unexpected:string[]=[],calls:Array<{path:string;method:string;cookie:string;origin:string;body:any;csrf:string;key:string}>=[];
  blocked.set(page,unexpected);page.on('pageerror',error=>failures.push(error.message));
  const sourceUi=await import(pathToFileURL(resolve(process.cwd(),'../corporate-site/vps/federation-login-ui.mjs')).href);
  const client=native?{clientId:'knaba-android-v1',kind:'NATIVE',platform:'ANDROID',label:'KNABA Android',redirectUri:appOrigin+'/auth/knaba/android'}:
    {clientId:'knaba-web-v1',kind:'WEB',platform:'WEB',label:'KNABA Web'};
  const config={enabled:true,authorizationIssuer:erpOrigin+'/auth/federation',authorities:[{authorityId:'site',label:'Synthetic Company',siteOrigin}],clients:[client]};
  const expiresAt=new Date(Date.now()+300000).toISOString();let phase=approved?'SOURCE_APPROVED':'CREATED',version=approved?3:1,authenticated=!loginPage;
  let held:{entered:ReturnType<typeof defer>;release:ReturnType<typeof defer>;finished:ReturnType<typeof defer>}|undefined;
  const actor={userId:'synthetic-erp-user',companyId:'synthetic-company',roles:['EMPLOYEE'],permissions:['identity.self'],siteIds:[],customerIds:[],warehouseIds:[]};
  const session={actor,user:{id:actor.userId,name:'Synthetic ERP account'},mode:'TEST',csrfToken:'synthetic-erp-csrf',expiresAt};
  const snapshot=()=>({requestId:id,state:phase,version,expiresAt,client,companyLabel:'Synthetic Company',authorizationIssuer:config.authorizationIssuer,
    csrfToken:csrf,sourceAuthorizationUrl:siteOrigin+'/account/erp-login/?authority_id=site&request_id='+id,
    ...(native?{callbackState:state}:{}),...(phase==='SOURCE_APPROVED'?{erpUserLabel:'Synthetic ERP account',siteLabel:'Synthetic website account',requiresErpMfa:true}:{})});
  await context.addCookies([
    {name:'knaba_session',value:oldCookie,url:erpOrigin,httpOnly:true,secure:true,sameSite:'Strict'},
    {name:'__Host-knaba-session',value:'synthetic-source-cookie',url:siteOrigin,httpOnly:true,secure:true,sameSite:'Strict'},
    ...(approved?[{name:'__Host-knaba-federation-flow',value:flow,url:erpOrigin,httpOnly:true,secure:true,sameSite:'Lax' as const}]:[])
  ]);
  await page.addInitScript(()=>{localStorage.setItem('knaba-language','EN');});
  await page.route('**/*',async route=>{
    const request=route.request(),address=new URL(request.url()),path=address.pathname,headers=await request.allHeaders();
    const call={path:address.origin+path,method:request.method(),cookie:headers.cookie??'',origin:headers.origin??'',body:request.postData(),csrf:headers['x-csrf-token']??'',key:headers['idempotency-key']??''};
    if(path.startsWith('/api/')||address.origin!==erpOrigin||path.startsWith('/auth/'))calls.push(call);
    if(address.origin===appOrigin&&path==='/auth/knaba/android'&&request.method()==='GET'){
      await route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic app callback</title><p>Native callback reached</p>'});return;
    }
    if(address.origin===siteOrigin){
      const privacy={'Cache-Control':'no-store','Referrer-Policy':'strict-origin','X-Frame-Options':'DENY'},sourceContext={lang:'en',enabled:true,authorityId:'site',requestId:id};
      if(path==='/account/erp-login/'&&request.method()==='GET'){
        await route.fulfill({contentType:'text/html',headers:privacy,body:sourceUi.federationLoginPage(sourceContext)});return;
      }
      if(path==='/account/erp-login/continue/'&&request.method()==='POST'){
        expect(call.origin).toBe(siteOrigin);expect(call.cookie).toContain('__Host-knaba-session=synthetic-source-cookie');
        expect(Object.fromEntries(new URLSearchParams(call.body??''))).toEqual({authorityId:'site',requestId:id});
        await route.fulfill({contentType:'text/html',headers:privacy,body:sourceUi.federationLoginPage({...sourceContext,siteLabel:'Synthetic website account',inspection:{inspectionId,companyLabel:'Synthetic Company',client}})});return;
      }
      if(path==='/account/erp-login/approve/'&&request.method()==='POST'){
        expect(call.origin).toBe(siteOrigin);expect(call.cookie).toContain('__Host-knaba-session=synthetic-source-cookie');
        expect(Object.fromEntries(new URLSearchParams(call.body??''))).toEqual({inspectionId,current:password,confirmed:'yes'});
        phase='SOURCE_APPROVED';version=3;await route.fulfill({status:303,headers:{...privacy,Location:erpOrigin+'/auth/federation/return?request_id='+id},body:''});return;
      }
    }
    if(address.origin===erpOrigin&&path.startsWith('/api/')){
      const post=request.method()==='POST',get=request.method()==='GET';if(post){expect(call.origin).toBe(erpOrigin);call.body=request.postDataJSON();}
      if(path==='/api/v1/public/config'&&get){await route.fulfill({json:{mode:'TEST',services:[],legal:{}}});return;}
      if(path==='/api/v1/me'&&get){await route.fulfill(authenticated?{json:{...session,csrfToken:call.cookie.includes('knaba_session='+newCookie)?session.csrfToken:'synthetic-old-erp-csrf'}}:{status:401,json:{code:'NEEDS_REAUTH'}});return;}
      if(path==='/api/v1/auth/federation/config'&&get){await route.fulfill({json:config});return;}
      if(path==='/api/v1/auth/federation/start'&&post){
        expect(call.body).toEqual({authorityId:'site',clientId:client.clientId});expect(call.key).toMatch(/^[!-~]{8,200}$/);
        if(dropStart){dropStart=false;await route.abort('failed');return;}
        await route.fulfill({json:{requestId:id,authorizationUrl:erpOrigin+'/auth/federation/authorize?request_id='+id,expiresAt}});return;
      }
      if(path==='/api/v1/auth/federation/requests/'+id+'/bind'&&post){
        expect(call.body).toEqual({});if(phase==='CREATED'){phase='BROWSER_BOUND';version=2;}
        await route.fulfill({json:{requestId:id,state:phase,version,expiresAt},headers:{'Set-Cookie':'__Host-knaba-federation-flow='+flow+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300'}});return;
      }
      if(path==='/api/v1/auth/federation/requests/'+id&&get){
        if(!call.cookie.includes('__Host-knaba-federation-flow='+flow)){await route.fulfill({status:401,json:{code:'NEEDS_REAUTH'}});return;}
        expect(call.cookie).toContain('__Host-knaba-federation-flow='+flow);const value=snapshot(),pause=held;held=undefined;
        if(pause){pause.entered.resolve();await pause.release.promise;}
        try{await route.fulfill({json:value});}finally{pause?.finished.resolve();}return;
      }
      if(path==='/api/v1/auth/federation/requests/'+id+'/confirm'&&post){
        expect(call.csrf).toBe(csrf);expect(call.body).toEqual({expectedVersion:3,confirmed:true,otp});
        phase=native?'CODE_ISSUED':'COMPLETE';version=4;
        if(dropConfirm){dropConfirm=false;await route.abort('failed');return;}
        if(native){await route.fulfill({json:{requestId:id,state:phase,version,authorizationResponseUrl:client.redirectUri+'?'+new URLSearchParams({code,state,iss:corruptIssuer?siteOrigin+'/identity':config.authorizationIssuer}).toString()}});return;}
        authenticated=true;
        const sessionHeaders={'Set-Cookie':'knaba_session='+newCookie+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600'};
        if(dropWebBody){
          // Explicit fixture of already processed response cookies with an
          // unusable body ACK. It does not simulate actual server transport.
          dropWebBody=false;await context.clearCookies({name:'__Host-knaba-federation-flow'});
          await route.fulfill({contentType:'application/json',body:'{',headers:sessionHeaders});return;
        }
        await route.fulfill({json:{...session,returnPath:'/console'},headers:dropWebCookie?{}:sessionHeaders});return;
      }
      if(path==='/api/v1/auth/federation/requests/'+id+'/cancel'&&post){
        expect(call.csrf).toBe(csrf);phase='CANCELLED';version++;await route.fulfill({json:{requestId:id,state:phase,version}});return;
      }
      if(path==='/api/v1/commands'&&get){await route.fulfill({json:{items:[]}});return;}
      if(/^\/api\/v1\/entities\/[A-Za-z0-9_]+$/.test(path)&&get){await route.fulfill({json:{items:[],has_more:false,next_cursor:null}});return;}
      if(path==='/api/v1/dashboard'&&get){await route.fulfill({json:{counts:{},integrationStatus:{}}});return;}
      if(path==='/api/v1/events'&&get){await route.fulfill({contentType:'text/event-stream',body:': synthetic\n\n'});return;}
    }
    if(address.origin===erpOrigin&&request.method()==='GET'){
      const pagePath=['/login','/console','/auth/federation/authorize','/auth/federation/return'].includes(path);
      const asset=/^\/assets\/[A-Za-z0-9_.-]+$/.test(path)||['/icon.svg','/icon-maskable.svg','/manifest.webmanifest','/sw.js','/favicon.ico'].includes(path);
      if(pagePath||asset){
        const file=resolve(process.cwd(),'dist/web',pagePath?'index.html':path.slice(1));
        try{await route.fulfill({body:await readFile(file),contentType:pagePath?'text/html':(({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.ico':'image/x-icon'} as Record<string,string>)[extname(file)]??'application/octet-stream'),headers:{'Referrer-Policy':'strict-origin','Cache-Control':'no-store'}});}
        catch{unexpected.push('Missing current build asset '+path);await route.abort('failed');}return;
      }
    }
    unexpected.push(request.method()+' '+address.origin+path);await route.abort('blockedbyclient');
  });
  await page.goto(erpOrigin+(loginPage?'/login':approved?'/auth/federation/return?request_id='+id:'/auth/federation/authorize?request_id='+id));
  return {calls,failures,setPhase:(next:string)=>{phase=next;version++;},holdStatus:()=>held={entered:defer(),release:defer(),finished:defer()}};
}
async function confirm(page:Page){
  const button=page.getByRole('button',{name:'Confirm sign-in',exact:true});await expect(button).toBeDisabled();
  await page.getByRole('checkbox',{name:'I have checked the accounts, company and application and want to sign in.',exact:true}).check();
  await page.getByLabel('Code from your ERP authenticator app',{exact:true}).fill(otp);await button.click();
}
test('F3 HTTP fixture: actual Strict/Lax cross-site continuation and explicit WEB account plus MFA confirmation',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});const f=await fixture(page,context);
  await page.getByRole('link',{name:'Continue to the website',exact:true}).click();
  const siteContinue=page.getByRole('button',{name:'Continue',exact:true});await expect(siteContinue).toBeVisible();
  const initial=f.calls.find(row=>row.path===siteOrigin+'/account/erp-login/'&&row.method==='GET')!;
  expect(initial).toBeDefined();expect(initial.cookie).not.toContain('__Host-knaba-session=');
  await siteContinue.click();
  // getByLabel matches raw label text, including the aria-hidden required star.
  // Check the exact input identity and its accessible name independently.
  const currentPassword=page.locator('input#account-current[name="current"][type="password"]');
  await expect(currentPassword).toHaveAccessibleName('Current password');
  await expect(currentPassword).toHaveAttribute('required','');
  await expect(currentPassword).toHaveAttribute('autocomplete','current-password');
  await currentPassword.fill(password);
  await page.getByRole('checkbox',{name:'I have checked the account, company and application and want to use this account to sign in to ERP.',exact:true}).check();
  await page.getByRole('button',{name:'Confirm sign-in',exact:true}).click();
  await expect(page.getByText('Synthetic ERP account',{exact:true})).toBeVisible();await confirm(page);await expect(page).toHaveURL(erpOrigin+'/console');
  const returning=f.calls.find(row=>row.path===erpOrigin+'/auth/federation/return')!;
  expect(returning.cookie).toContain('__Host-knaba-federation-flow='+flow);expect(returning.cookie).not.toContain('knaba_session=');
  expect((await context.cookies(erpOrigin)).find(c=>c.name==='knaba_session')?.value).toBe(newCookie);
  expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain(password);expect(f.failures).toEqual([]);
});
test('F3 HTTP fixture: native code returns only by top-level exact callback and does not replace the browser ERP account',async({page,context})=>{
  const f=await fixture(page,context,{native:true,approved:true});await confirm(page);await expect(page).toHaveURL(new RegExp('^https://app\\.browser\\.invalid/auth/knaba/android\\?'));
  const url=new URL(page.url());expect(url.searchParams.get('code')).toBe(code);expect(url.searchParams.get('state')).toBe(state);expect(url.searchParams.get('iss')).toBe(erpOrigin+'/auth/federation');
  expect((await context.cookies(erpOrigin)).find(c=>c.name==='knaba_session')?.value).toBe(oldCookie);expect(f.calls.some(row=>row.path.endsWith('/token'))).toBe(false);expect(f.failures).toEqual([]);
});
test('F3 HTTP fixture: incorrect native issuer cannot navigate or persist an authorization code',async({page,context})=>{
  const f=await fixture(page,context,{native:true,approved:true,corruptIssuer:true});await confirm(page);await expect(page.getByRole('alert')).toContainText('The response is missing.');
  expect(page.url()).toBe(erpOrigin+'/auth/federation/return?request_id='+id);expect(f.calls.some(row=>row.path.startsWith(appOrigin))).toBe(false);
  expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain('K3C.');expect(f.failures).toEqual([]);
});
test('F3 HTTP fixture: unknown native confirm ACK reads status without reproducing its code or confirming again',async({page,context})=>{
  const f=await fixture(page,context,{native:true,approved:true,dropConfirm:true});await confirm(page);await expect(page.getByRole('alert')).toContainText('The response is missing.');
  await page.getByRole('button',{name:'Check status again',exact:true}).click();await expect(page.getByRole('status')).toContainText('Return to the app.');
  await expect(page.getByRole('button',{name:'Confirm sign-in',exact:true})).toHaveCount(0);expect(f.calls.filter(row=>row.path.endsWith('/confirm'))).toHaveLength(1);expect(f.calls.some(row=>row.path.startsWith(appOrigin))).toBe(false);expect(f.failures).toEqual([]);
});
test('F3 HTTP fixture: offline invalidation rejects a late private status and requires a fresh current read',async({page,context})=>{
  const f=await fixture(page,context,{approved:true});await expect(page.getByText('Synthetic ERP account',{exact:true})).toBeVisible();const pause=f.holdStatus();
  await page.getByRole('button',{name:'Check status again',exact:true}).click();await pause.entered.promise;
  try{await context.setOffline(true);await expect(page.getByRole('alert')).toBeVisible();pause.release.resolve();await pause.finished.promise;await expect(page.getByText('Synthetic ERP account',{exact:true})).toHaveCount(0);}
  finally{pause.release.resolve();f.setPhase('CANCELLED');await context.setOffline(false);}
  await page.getByRole('button',{name:'Check status again',exact:true}).click();await expect(page.getByRole('status')).toContainText('This request cannot continue.');
  await expect(page.getByRole('button',{name:'Confirm sign-in',exact:true})).toHaveCount(0);expect(f.calls.filter(row=>row.path.endsWith('/confirm'))).toHaveLength(0);expect(f.failures).toEqual([]);
});
test('F3 HTTP fixture: account review and confirmation remain accessible in all six locales at mobile width',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});const f=await fixture(page,context,{approved:true});
  for(const [lang,title] of [['DE','Mit dem Website-Konto anmelden'],['EN','Sign in with your website account'],['PL','Zaloguj się kontem witryny'],['LT','Prisijungti svetainės paskyra'],['RU','Войти через аккаунт сайта'],['UK','Увійти через акаунт сайту']]){
    await page.getByRole('combobox').selectOption(lang);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
    await expect(page.getByRole('checkbox')).toBeVisible();await expect(page.locator('input[autocomplete="one-time-code"]')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  }
  expect(f.failures).toEqual([]);
});
test('F3 HTTP fixture: login entry retries an unknown start with exactly the original key and body',async({page,context})=>{
  const f=await fixture(page,context,{loginPage:true,dropStart:true});await page.getByRole('button',{name:'Sign in through the website',exact:true}).click();
  await page.getByRole('button',{name:'Retry the same request',exact:true}).click();await expect(page.getByRole('link',{name:'Continue to the website',exact:true})).toBeVisible();
  const attempts=f.calls.filter(row=>row.path.endsWith('/start'));expect(attempts).toHaveLength(2);expect(attempts[0].body).toEqual(attempts[1].body);expect(attempts[0].key).toBe(attempts[1].key);expect(f.failures).toEqual([]);
});
test('F3 HTTP fixture: explicit ERP password path is available with an existing browser session and does not auto-logout',async({page,context})=>{
  const f=await fixture(page,context,{approved:true});await page.getByRole('link',{name:'Sign in with an ERP password',exact:true}).click();
  await expect(page).toHaveURL(erpOrigin+'/login?method=password');await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign in through the website',exact:true})).toHaveCount(0);
  expect((await context.cookies(erpOrigin)).find(c=>c.name==='knaba_session')?.value).toBe(oldCookie);expect(f.calls.some(row=>row.path.endsWith('/logout'))).toBe(false);expect(f.failures).toEqual([]);
});
test('F3 HTTP fixture: unknown WEB body ACK offers a new flow or a current-account check after response cookies changed',async({page,context})=>{
  const f=await fixture(page,context,{approved:true,dropWebBody:true});await confirm(page);
  await expect(page.getByRole('alert')).toContainText('The response is missing.');
  await expect(page.getByText('The request has completed. Open your workspace.',{exact:true})).toHaveCount(0);
  expect((await context.cookies(erpOrigin)).find(value=>value.name==='knaba_session')?.value).toBe(newCookie);
  expect((await context.cookies(erpOrigin)).some(value=>value.name==='__Host-knaba-federation-flow')).toBe(false);
  await expect(page.getByRole('link',{name:'Start a new sign-in',exact:true})).toHaveAttribute('href','/login');
  await page.getByRole('button',{name:'Check status again',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Sign-in is currently unavailable.');
  await expect(page.getByRole('button',{name:'Confirm sign-in',exact:true})).toHaveCount(0);
  const checked=f.calls.filter(row=>row.path.endsWith('/api/v1/me')).length;
  await page.getByRole('link',{name:'Check the current account',exact:true}).click();await expect(page).toHaveURL(erpOrigin+'/console');
  await expect.poll(()=>f.calls.filter(row=>row.path.endsWith('/api/v1/me')).length).toBeGreaterThan(checked);
  expect(f.calls.filter(row=>row.path.endsWith('/confirm'))).toHaveLength(1);expect(f.calls.some(row=>row.path.endsWith('/logout'))).toBe(false);expect(f.failures).toEqual([]);
});
test('F3 HTTP fixture: a same-user older ERP cookie cannot complete the new WEB session',async({page,context})=>{
  const f=await fixture(page,context,{approved:true,dropWebCookie:true});await confirm(page);
  await expect(page.getByRole('alert')).toContainText('The response is missing.');
  expect(page.url()).toBe(erpOrigin+'/auth/federation/return?request_id='+id);
  expect((await context.cookies(erpOrigin)).find(value=>value.name==='knaba_session')?.value).toBe(oldCookie);
  const current=f.calls.filter(row=>row.path===erpOrigin+'/api/v1/me');expect(current).toHaveLength(1);expect(current[0].cookie).toContain('knaba_session='+oldCookie);
  await expect(page.getByText('The request has completed. Open your workspace.',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Check the current account',exact:true})).toHaveAttribute('href','/console');
  expect(f.calls.filter(row=>row.path.endsWith('/confirm'))).toHaveLength(1);expect(f.calls.some(row=>row.path.endsWith('/logout'))).toBe(false);expect(f.failures).toEqual([]);
});
