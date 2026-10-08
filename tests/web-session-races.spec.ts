import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';

// These cases use the actual rendered app and synthetic backend, with the
// explicitly annotated response delay/401 as controlled HTTP fixtures.
const runtimeFailures=new WeakMap<Page,string[]>();
test.beforeEach(async({page,request})=>{
 const failures:string[]=[];runtimeFailures.set(page,failures);page.on('pageerror',error=>failures.push(error.message));
 const config=await request.get('/api/v1/public/config',{timeout:10_000});expect(config.ok()).toBe(true);test.skip((await config.json()).mode!=='DEMO','Requires the isolated synthetic DEMO backend.');
 await page.addInitScript(()=>localStorage.setItem('knaba-language','EN'));
});
test.afterEach(async({page})=>{expect(runtimeFailures.get(page)||[],'The rendered regression must not introduce JavaScript errors.').toEqual([])});
async function demo(page:Page,role:string){
 let response=await page.request.post('/api/v1/auth/demo',{data:{role},timeout:10_000});
 if(response.status()===429){
  const limited=await response.json(),retryAfter=limited.details?.retryAfterSeconds;expect(limited.code).toBe('RATE_LIMITED');expect(Number.isInteger(retryAfter)&&retryAfter>0&&retryAfter<=60).toBe(true);
  test.info().setTimeout(test.info().timeout+retryAfter*1000+10_500);test.info().annotations.push({type:'auth-rate-limit',description:`Honoured the real demo-login cooldown (${retryAfter}s).`});
  await new Promise(resolve=>setTimeout(resolve,retryAfter*1000+500));response=await page.request.post('/api/v1/auth/demo',{data:{role},timeout:10_000});
 }
 expect(response.ok(),await response.text()).toBe(true);const session=await response.json(),document=await page.goto('/console');expect(document?.ok()).toBe(true);await expect(page.locator('.sidebar')).toBeVisible();return session;
}
async function command(request:APIRequestContext,name:string,input:unknown){
 const me=await request.get('/api/v1/me',{timeout:10_000});expect(me.ok()).toBe(true);const session=await me.json();
 const response=await request.post(`/api/v1/commands/${name}`,{timeout:10_000,headers:{'X-CSRF-Token':session.csrfToken},data:{input,idempotency_key:randomUUID()}});expect(response.ok(),await response.text()).toBe(true);return response.json();
}
async function navigate(page:Page,label:string){await page.locator('.sidebar nav').getByRole('button',{name:label,exact:true}).click();await expect(page.locator('.page-heading h1')).toHaveText(label)}

test('transport fixture: a current private 401 removes the open record and permanently clears the console',async({page},testInfo)=>{
 testInfo.annotations.push({type:'transport-fixture',description:'Actual demo login, records and rendered UI; the site-refresh response is an explicit HTTP 401 fixture, not real server expiry.'});
 await demo(page,'DIRECTOR');await navigate(page,'Sites & locations');await page.locator('.content-panel .record-link').first().click();
 const detail=page.locator('.record-detail');await expect(detail).toBeVisible();const privateId=await detail.locator('.detail-summary code').textContent();expect(privateId).toBeTruthy();
 try{
  await page.route('**/api/v1/entities/site',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'NEEDS_REAUTH',details:{reason:'SYNTHETIC_EXPIRED_RESPONSE'}})}));
  // The same loader also runs on SSE updates while a record modal is open.
  // Invoke its real refresh control without dismissing the modal first.
  await page.evaluate(()=>{const refresh=document.querySelector<HTMLButtonElement>('.heading-actions .refresh');if(!refresh)throw Error('Missing refresh control');refresh.click()});
  await expect(page.locator('.startup[role="alert"]')).toBeVisible();await expect(page.locator('.sidebar')).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(detail).toHaveCount(0);await expect(page.getByText(privateId!,{exact:true})).toHaveCount(0);
 }finally{await page.unrouteAll({behavior:'wait'})}
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.locator('.startup[role="alert"]')).toBeVisible();await expect(page.locator('.sidebar')).toHaveCount(0);
});

test('transport fixture: an A send response arriving after switching to B preserves B history and its new draft',async({page},testInfo)=>{
 testInfo.annotations.push({type:'transport-fixture',description:'Actual backend channels/messages and rendered UI; only the successful A send response is deferred after its real server commit.'});
 const session=await demo(page,'OWNER'),suffix=randomUUID(),aName=`QA race A ${suffix}`,bName=`QA race B ${suffix}`;
 const a=await command(page.request,'channel.create',{type:'DIRECT',name:aName,member_ids:[session.actor.userId,'demo-employee']}),b=await command(page.request,'channel.create',{type:'DIRECT',name:bName,member_ids:[session.actor.userId,'demo-employee']});
 const aHistory=`A history ${suffix}`,bHistory=`B history ${suffix}`,aText=`A send ${suffix}`,bDraft=`B new draft ${suffix}`;
 await command(page.request,'message.send',{channel_id:a.id,text:aHistory,language:'EN'});await command(page.request,'message.send',{channel_id:b.id,text:bHistory,language:'EN'});
 // Preparing memberships changes the SSE authority snapshot. Adopt the final
 // setup before exercising the independent delayed-response race.
 const prepared=await page.reload();expect(prepared?.ok()).toBe(true);await expect(page.locator('.sidebar')).toBeVisible();
 await navigate(page,'Team communication');await expect(page.locator('.channel-list').getByRole('button').filter({hasText:aName})).toBeVisible();await page.locator('.channel-list').getByRole('button').filter({hasText:aName}).click();await expect(page.locator('.message-bubble').filter({hasText:aHistory})).toBeVisible();
 let release!:()=>void,committed!:()=>void;const released=new Promise<void>(resolve=>{release=resolve}),realCommit=new Promise<void>(resolve=>{committed=resolve});
 try{
  await page.route('**/api/v1/commands/message.send',async route=>{
   if(route.request().postDataJSON().input.channel_id!==a.id){await route.continue();return;}
   const actual=await route.fetch({timeout:10_000});expect(actual.ok(),await actual.text()).toBe(true);committed();await released;await route.fulfill({response:actual});
  });
  const sent=page.waitForResponse(response=>response.url().endsWith('/api/v1/commands/message.send')&&response.request().postDataJSON().input.channel_id===a.id);
  await page.getByRole('textbox',{name:'Message',exact:true}).fill(aText);await page.getByRole('button',{name:'Send',exact:true}).click();await realCommit;
  await page.locator('.channel-list').getByRole('button').filter({hasText:bName}).click();await expect(page.locator('.chat-pane h2')).toHaveText(bName);await expect(page.locator('.message-bubble').filter({hasText:bHistory})).toBeVisible();await page.getByRole('textbox',{name:'Message',exact:true}).fill(bDraft);
  release();const response=await sent;expect(response.ok()).toBe(true);await response.finished();
  await page.evaluate(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))});
  await expect(page.locator('.chat-pane h2')).toHaveText(bName);await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue(bDraft);await expect(page.locator('.message-bubble').filter({hasText:bHistory})).toBeVisible();await expect(page.locator('.message-bubble').filter({hasText:aText})).toHaveCount(0);await expect(page.locator('.message-bubble').filter({hasText:aHistory})).toHaveCount(0);
 }finally{release();await page.unrouteAll({behavior:'wait'})}
});
