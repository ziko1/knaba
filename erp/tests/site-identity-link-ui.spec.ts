import {test,expect,type Page,type Route} from '@playwright/test';

const id='c2e08586-eada-44de-b46c-5e807c4bf096',bindingId='a5f355cd-519a-4d9f-bf1f-b123af53d1bc',code='KNABA-LINK-'+'s'.repeat(43),password='Synthetic browser-only password!',subject='immutable-site-user',csrf='synthetic-erp-csrf';
const unexpected=new WeakMap<Page,string[]>();
test.afterEach(async({page})=>{expect(unexpected.get(page)??[],'Only explicit same-origin HTTP fixtures and static assets are allowed.').toEqual([]);});
function deferred(){let resolve!:()=>void;return {promise:new Promise<void>(done=>{resolve=done;}),resolve:()=>resolve()};}
function siteLinkFixtureRoute(address:URL,origin:string){
 const base='/api/v1/account/site-links';
 return address.origin===origin&&address.search===''&&address.hash===''&&[base,`${base}/challenge`,`${base}/challenges/${id}/confirm`,`${base}/challenges/${id}/cancel`,`${base}/bindings/${bindingId}/unlink`].includes(address.pathname);
}
async function fixture(page:Page){
 let challenge:any=null,bindings:any[]=[],enabled=true,denied=false,hold:{entered:ReturnType<typeof deferred>;release:ReturnType<typeof deferred>;finished:ReturnType<typeof deferred>}|undefined,holdIssue:typeof hold;
 const calls:Array<{path:string;body:any;csrf?:string}>=[],failures:string[]=[];page.on('pageerror',error=>failures.push(error.message));
 const blocked:string[]=[];unexpected.set(page,blocked);const origin=new URL(String(test.info().project.use.baseURL??process.env.E2E_BASE_URL??'http://127.0.0.1:3000')).origin;
 await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url()),staticPath=['/','/account/site-links','/login','/console','/index.html','/icon.svg','/icon-maskable.svg','/manifest.webmanifest','/sw.js','/favicon.ico'].includes(url.pathname)||url.pathname.startsWith('/assets/');if(url.origin===origin&&staticPath&&request.method()==='GET'){await route.continue();return;}blocked.push(`${request.method()} ${url.origin}${url.pathname}`);await route.abort('blockedbyclient');});
 await page.addInitScript(()=>localStorage.setItem('knaba-language','EN'));
 await page.route('**/api/v1/me',route=>route.fulfill({json:{actor:{companyId:'browser-company',userId:'erp-user',roles:['EMPLOYEE'],permissions:['identity.self'],siteIds:[],warehouseIds:[],customerIds:[]},user:{id:'erp-user',name:'Synthetic ERP user'},csrfToken:csrf,mode:'TEST'}}));
 await page.route('**/api/v1/public/config',route=>route.fulfill({json:{mode:'TEST',services:[],legal:{}}}));
 await page.route('**/api/v1/commands',route=>route.fulfill({json:{items:[]}}));
 await page.route('**/api/v1/entities/**',route=>route.fulfill({json:{items:[],has_more:false,next_cursor:null}}));
 await page.route('**/api/v1/dashboard',route=>route.fulfill({json:{counts:{},integrationStatus:{}}}));
 await page.route('**/api/v1/events',route=>route.fulfill({contentType:'text/event-stream',body:': synthetic fixture\n\n'}));
 await page.route(address=>siteLinkFixtureRoute(address,origin),async(route:Route)=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()!==(path==='/api/v1/account/site-links'?'GET':'POST')){
   blocked.push(`${request.method()} ${origin}${path}`);await route.abort('blockedbyclient');return;
  }
  if(request.method()==='GET'){
   const current=challenge?{...challenge}:null,held=hold;hold=undefined;if(held){held.entered.resolve();await held.release.promise;}
   try{await route.fulfill(denied?{status:401,json:{code:'NEEDS_REAUTH'}}:{json:{enabled,authorities:enabled?[{id:'site',issuer:'https://site.invalid/identity',siteOrigin:'https://site.invalid'}]:[],bindings:[...bindings],challenge:current}});}finally{held?.finished.resolve();}return;
  }
  calls.push({path,body:request.postDataJSON(),csrf:request.headers()['x-csrf-token']});
  if(path.endsWith('/challenge')){challenge={id,authorityId:'site',state:'ISSUED',version:1,expiresAt:new Date(Date.now()+300000).toISOString(),subject:null,siteLabel:null,bindingId:null};const held=holdIssue;holdIssue=undefined;if(held){held.entered.resolve();await held.release.promise;}try{await route.fulfill({status:201,json:{...challenge,code,siteUrl:'https://site.invalid/account/erp-link/'}});}finally{held?.finished.resolve();}return;}
  if(path.endsWith('/confirm')){challenge={...challenge,state:'CONFIRMED',version:3,bindingId};bindings=[{id:bindingId,issuer:'https://site.invalid/identity',subject,state:'ACTIVE',version:1}];await route.fulfill({status:201,json:{challenge,binding:bindings[0]}});return;}
  if(path.endsWith('/unlink')){bindings=bindings.map(b=>({...b,state:'REVOKED',version:2}));await route.fulfill({status:201,json:{id:bindingId,state:'REVOKED',version:2}});return;}
  if(path.endsWith('/cancel')){challenge={...challenge,state:'CANCELLED',version:challenge.version+1};await route.fulfill({status:201,json:challenge});return;}
  blocked.push(request.method()+' '+path);await route.abort('blockedbyclient');
 });
 await page.goto('/account/site-links');const dialog=page.getByRole('dialog',{name:'Website account',exact:true}),panel=dialog.getByRole('region',{name:'Website account',exact:true});await expect(panel.getByRole('button',{name:'Prepare account link',exact:true})).toBeVisible();
 return {panel,dialog,calls,failures,claim:()=>{challenge={...challenge,state:'CLAIMED',version:2,subject,siteLabel:'Synthetic website account'};},deny:()=>{denied=true;},disabledWithBinding:()=>{enabled=false;bindings=[{id:bindingId,issuer:'https://site.invalid/identity',subject,state:'ACTIVE',version:1}];},hold:()=>hold={entered:deferred(),release:deferred(),finished:deferred()},holdIssue:()=>holdIssue={entered:deferred(),release:deferred(),finished:deferred()}};
}
async function prepare(f:Awaited<ReturnType<typeof fixture>>){await f.panel.getByLabel('Current ERP password',{exact:true}).fill(password);await f.panel.getByRole('button',{name:'Prepare account link',exact:true}).click();await expect(f.panel.getByLabel('One-time link code',{exact:true})).toHaveValue(code);}
test('HTTP fixture: fresh ERP password, memory-only code and explicit exact website account confirmation',async({page},info)=>{
 info.annotations.push({type:'transport-fixture',description:'Actual rendered ERP UI with synthetic all-route fixtures. SQL and VPS coordinator acceptance are separate.'});await page.setViewportSize({width:390,height:844});const f=await fixture(page);await prepare(f);
 await expect(f.panel.getByRole('link',{name:'Open website account',exact:true})).toHaveAttribute('href','https://site.invalid/account/erp-link/');expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toMatch(/KNABA-LINK-|Synthetic browser-only password/);
 f.claim();await f.panel.getByRole('button',{name:'Check status',exact:true}).click();await expect(f.panel).toContainText(subject);await expect(f.panel.getByRole('link')).toHaveCount(0);const confirm=f.panel.getByRole('button',{name:'Confirm account link',exact:true});await expect(confirm).toBeDisabled();
 await f.panel.getByRole('checkbox',{name:/I confirm that the account/}).check();await confirm.click();await expect(f.panel).toContainText('The account link was recorded.');expect(f.calls).toHaveLength(2);expect(f.calls[1]).toEqual({path:`/api/v1/account/site-links/challenges/${id}/confirm`,body:{expectedVersion:2,subject},csrf});expect(f.failures).toEqual([]);
});
test('HTTP fixture: original-session rejection removes all account proof fields and closes the private panel',async({page})=>{
 const f=await fixture(page);await prepare(f);f.claim();await f.panel.getByRole('button',{name:'Check status',exact:true}).click();await expect(f.panel).toContainText(subject);f.deny();await f.panel.getByRole('button',{name:'Check status',exact:true}).click();
 await expect(f.dialog).toHaveCount(0);await expect(page.getByText(subject,{exact:true})).toHaveCount(0);await expect(page.locator(`input[value="${code}"]`)).toHaveCount(0);expect(f.calls).toHaveLength(1);expect(f.failures).toEqual([]);
});
test('HTTP fixture: an older status response cannot restore confirmation after a recorded link',async({page})=>{
 const f=await fixture(page);await prepare(f);f.claim();await f.panel.getByRole('button',{name:'Check status',exact:true}).click();await f.panel.getByRole('checkbox',{name:/I confirm that the account/}).check();const held=f.hold();await f.panel.getByRole('button',{name:'Check status',exact:true}).click();await held.entered.promise;
 try{await f.panel.getByRole('button',{name:'Confirm account link',exact:true}).click();await expect(f.panel).toContainText('The account link was recorded.');}finally{held.release.resolve();}
 await held.finished.promise;await expect(f.panel.getByRole('button',{name:'Confirm account link',exact:true})).toHaveCount(0);expect(f.calls).toHaveLength(2);expect(f.failures).toEqual([]);
});
test('HTTP fixture: self-unlink remains available with disabled federation and requires its own explicit fresh proof',async({page})=>{
 const f=await fixture(page);f.disabledWithBinding();await f.panel.getByRole('button',{name:'Check status',exact:true}).click();await expect(f.panel).toContainText('Account linking is not enabled.');await f.panel.getByRole('button',{name:'Revoke link',exact:true}).click();
 await f.panel.getByLabel('Current ERP password',{exact:true}).fill(password);const submit=f.panel.locator('form').getByRole('button',{name:'Revoke link',exact:true});await expect(submit).toBeDisabled();await f.panel.getByRole('checkbox',{name:'I want to permanently revoke this account link.',exact:true}).check();await submit.click();
 await expect(f.panel).toContainText('Link revoked');expect(f.calls).toEqual([{path:`/api/v1/account/site-links/bindings/${bindingId}/unlink`,body:{expectedVersion:1,password},csrf}]);expect(f.failures).toEqual([]);
});
test('HTTP fixture: reconnect checks an unknown issuance outcome without replaying credentials or recovering its code',async({page,context})=>{
 const f=await fixture(page),held=f.holdIssue();await f.panel.getByLabel('Current ERP password',{exact:true}).fill(password);await f.panel.getByRole('button',{name:'Prepare account link',exact:true}).click();await held.entered.promise;
 try{await context.setOffline(true);await expect(f.panel).toContainText('Reconnect to the internet before continuing.');held.release.resolve();await held.finished.promise;await expect(f.panel.getByLabel('One-time link code',{exact:true})).toHaveCount(0);}finally{held.release.resolve();await context.setOffline(false);}
 await expect(f.panel).toContainText('This code cannot be shown again.');await expect(f.panel.getByRole('button',{name:'Cancel attempt',exact:true})).toBeEnabled();expect(f.calls).toHaveLength(1);expect(f.failures).toEqual([]);
});
