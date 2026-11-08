import {test,expect,type Page,type Route} from '@playwright/test';

const id='24bb970d-5db5-4c89-a642-57c52d35059e',secret='s'.repeat(43),sender='+4915700000011',csrf='synthetic-guest-csrf';
const code=`KNABA_TRANSFER ${id}.${secret}`,url=`https://wa.me/4915700000099?text=${encodeURIComponent(code)}`;
type Status={id:string;channelId:string;state:string;version:number;expiresAt:string;sender?:string};
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const unexpectedRequests=new WeakMap<Page,string[]>();
test.afterEach(async({page})=>{expect(unexpectedRequests.get(page)??[],'HTTP fixtures must not contact a real API or external provider.').toEqual([]);});

// Rendered browser checks with explicit HTTP fixtures. Backend identity/SQL proof is separate.
async function fixture(page:Page){
 let status:Status|null=null,denied=false,holdRead:{entered:ReturnType<typeof deferred>;release:ReturnType<typeof deferred>}|undefined,holdIssue:typeof holdRead;
 const calls:Array<{path:string;body:unknown;csrf?:string}>=[],failures:string[]=[];page.on('pageerror',error=>failures.push(error.message));
 const unexpected:string[]=[];unexpectedRequests.set(page,unexpected);const origin=new URL(String(test.info().project.use.baseURL??process.env.E2E_BASE_URL??'http://127.0.0.1:3000')).origin;
 // Registered first so the explicit API fixtures below take precedence. Never log URL queries.
 await page.route('**/*',async route=>{const request=route.request(),address=new URL(request.url()),staticPath=['/','/index.html','/icon.svg','/icon-maskable.svg','/manifest.webmanifest','/sw.js','/favicon.ico'].includes(address.pathname)||address.pathname.startsWith('/assets/');if(address.origin===origin&&staticPath&&request.method()==='GET'){await route.continue();return;}unexpected.push(`${request.method()} ${address.origin}${address.pathname}`);await route.abort('blockedbyclient');});
 await page.addInitScript(()=>localStorage.setItem('knaba-language','EN'));
 await page.route('**/api/v1/me',route=>route.fulfill({status:401,json:{code:'NEEDS_REAUTH'}}));
 await page.route('**/api/v1/public/config',route=>route.fulfill({json:{mode:'TEST',services:[],legal:{}}}));
 await page.route('**/api/v1/public/chat',route=>route.fulfill({status:201,json:{channelId:'guest-channel',status:'MANUAL_FALLBACK',csrfToken:csrf}}));
 await page.route('**/api/v1/public/chat/*/messages',route=>route.fulfill({json:{items:[],pendingDrafts:[]}}));
 await page.route('**/api/v1/public/chat/*/transfer**',async(route:Route)=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='GET'){
   const captured=status?{...status}:null,holding=holdRead;holdRead=undefined;if(holding){holding.entered.resolve();await holding.release.promise;}
   await route.fulfill(denied?{status:401,json:{code:'NEEDS_REAUTH'}}:{json:{available:true,transfer:captured}});return;
  }
  calls.push({path,body:request.postDataJSON(),csrf:request.headers()['x-csrf-token']});
  if(path.endsWith('/confirm')){status={...status!,state:'CONFIRMED',version:status!.version+1};await route.fulfill({status:201,json:status});return;}
  if(path.endsWith('/cancel')){status={...status!,state:'CANCELLED',version:status!.version+1};await route.fulfill({status:201,json:status});return;}
  status={id,channelId:'guest-channel',state:'ISSUED',version:1,expiresAt:new Date(Date.now()+600000).toISOString()};const holding=holdIssue;holdIssue=undefined;if(holding){holding.entered.resolve();await holding.release.promise;}await route.fulfill({status:201,json:{...status,url}});
 });
 await page.goto('/?language=EN');await page.getByRole('button',{name:'Start webchat',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Message',{exact:true}).fill('Synthetic guest transfer UI fixture');await dialog.getByRole('button',{name:'Send',exact:true}).click();
 const panel=dialog.getByRole('region',{name:'Continue in WhatsApp'});await expect(panel.getByRole('button',{name:'Prepare transfer',exact:true})).toBeVisible();
 return {panel,calls,failures,claim:()=>{status={...status!,state:'CLAIMED',version:2,sender};},deny:()=>{denied=true;},expire:()=>{status={...status!,expiresAt:new Date(Date.now()-1).toISOString()};},holdRead:()=>holdRead={entered:deferred(),release:deferred()},holdIssue:()=>holdIssue={entered:deferred(),release:deferred()}};
}
test('HTTP fixture: guest reviews the verified number and gives explicit consent before one CSRF-bound confirmation',async({page},testInfo)=>{
 testInfo.annotations.push({type:'transport-fixture',description:'Actual rendered guest UI; deterministic guest/session/transfer HTTP responses. No provider or PostgreSQL claim.'});
 await page.setViewportSize({width:390,height:844});const f=await fixture(page);expect(f.calls).toHaveLength(0);await f.panel.getByRole('button',{name:'Prepare transfer',exact:true}).click();
 await expect(f.panel.getByRole('link',{name:'Send code in WhatsApp',exact:true})).toHaveAttribute('href',url);expect(f.calls).toHaveLength(1);await expect(f.panel.getByRole('button',{name:'Confirm this number',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain(secret);
 f.claim();await f.panel.getByRole('button',{name:'Check status',exact:true}).click();await expect(f.panel).toContainText(sender);await expect(f.panel.getByRole('link')).toHaveCount(0);const confirm=f.panel.getByRole('button',{name:'Confirm this number',exact:true});await expect(confirm).toBeDisabled();
 await f.panel.getByRole('checkbox',{name:/This is my number/}).check();await expect(confirm).toBeEnabled();await confirm.click();await expect(f.panel).toContainText('Your next WhatsApp message will continue this exact chat.');
 expect(f.calls).toHaveLength(2);expect(f.calls[1]).toEqual({path:`/api/v1/public/chat/guest-channel/transfer/${id}/confirm`,body:{expectedVersion:2,targetSender:sender,whatsappConsent:true},csrf});expect(JSON.stringify(f.calls)).not.toContain(secret);expect(f.failures).toEqual([]);
});
test('HTTP fixture: original-session rejection clears the number, link and confirmation controls',async({page})=>{
 const f=await fixture(page);await f.panel.getByRole('button',{name:'Prepare transfer',exact:true}).click();await expect(f.panel.getByRole('link',{name:'Send code in WhatsApp',exact:true})).toBeVisible();f.claim();await f.panel.getByRole('button',{name:'Check status',exact:true}).click();await expect(f.panel).toContainText(sender);await f.panel.getByRole('checkbox',{name:/This is my number/}).check();
 f.deny();await f.panel.getByRole('button',{name:'Check status',exact:true}).click();await expect(f.panel).toContainText('The original web session no longer has access.');await expect(f.panel).not.toContainText(sender);await expect(f.panel.getByRole('link')).toHaveCount(0);await expect(f.panel.getByRole('button',{name:'Confirm this number',exact:true})).toHaveCount(0);expect(f.calls).toHaveLength(1);expect(f.failures).toEqual([]);
});
test('HTTP fixture: a delayed older status cannot restore confirmation after the transfer completes',async({page})=>{
 const f=await fixture(page);await f.panel.getByRole('button',{name:'Prepare transfer',exact:true}).click();await expect(f.panel.getByRole('link',{name:'Send code in WhatsApp',exact:true})).toBeVisible();f.claim();await f.panel.getByRole('button',{name:'Check status',exact:true}).click();await f.panel.getByRole('checkbox',{name:/This is my number/}).check();const held=f.holdRead(),staleResponse=page.waitForResponse(response=>response.url().endsWith('/transfer')&&response.request().method()==='GET');
 await f.panel.getByRole('button',{name:'Check status',exact:true}).click();await held.entered.promise;
 try{await f.panel.getByRole('button',{name:'Confirm this number',exact:true}).click();await expect(f.panel).toContainText('Your next WhatsApp message will continue this exact chat.');}finally{held.release.resolve();}
 await (await staleResponse).finished();await page.evaluate(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));});await expect(f.panel.getByRole('checkbox')).toHaveCount(0);await expect(f.panel).toContainText('Your next WhatsApp message will continue this exact chat.');expect(f.calls).toHaveLength(2);expect(f.failures).toEqual([]);
});
test('HTTP fixture: an unknown issuance outcome is checked after reconnect without replaying or recovering its secret',async({page,context})=>{
 const f=await fixture(page),held=f.holdIssue();await f.panel.getByRole('button',{name:'Prepare transfer',exact:true}).click();await held.entered.promise;
 try{await context.setOffline(true);await expect(f.panel).toContainText('Reconnect to the internet before continuing.');held.release.resolve();await expect(f.panel.getByRole('link')).toHaveCount(0);}finally{held.release.resolve();await context.setOffline(false);}
 await expect(f.panel).toContainText('This code cannot be shown again.');await expect(f.panel.getByRole('button',{name:'Cancel',exact:true})).toBeEnabled();await expect(f.panel.getByRole('link')).toHaveCount(0);expect(f.calls).toHaveLength(1);expect(f.failures).toEqual([]);
});
