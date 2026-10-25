// Consent/privacy regression: external Turnstile must not load before acknowledged notice.
// The provider script here is a synthetic fixture, NOT a real human challenge.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KNABA_TEST_URL||'https://kneba.vsp.rest';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.KNABA_CHROME_PATH,args:['--no-sandbox']});
 let count=0;
 try{
  for(const prefix of ['', '/en', '/uk', '/ru']){
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   let challenges=0,configs=0;
   page.on('request',request=>{if(request.url().startsWith('https://challenges.cloudflare.com'))challenges++;});
   await page.route('**/api/assistant/captcha',async route=>{
     configs++;
     await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:true,sitekey:'0x4AAAAAAAAtestsite',unavailable:false})});
   });
   await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',async route=>{
     await route.fulfill({status:200,contentType:'text/javascript',body:'window.__turnstileResetCount=0;window.turnstile={render:function(element,options){window.__turnstileOptions=options;var fake=document.createElement("div");fake.className="synthetic-challenge";element.appendChild(fake);return "synthetic-test-widget";},reset:function(){window.__turnstileResetCount++;},remove:function(){}};'});
   });
   try{
    await page.goto(base+prefix+'/',{waitUntil:'domcontentloaded',timeout:20000});
    await page.locator('[data-knaba-open]').click();
    await page.locator('.ka-consent').waitFor();
    await page.waitForTimeout(300);
    assert.equal(configs,0,'No captcha config before acknowledgment '+prefix);
    assert.equal(challenges,0,'No Cloudflare script before acknowledgment '+prefix);
    assert.equal(await page.locator('.ka-captcha').count(),0,'No challenge before acknowledgement '+prefix);
    assert.equal(await page.locator('.ka-captcha-hint').isVisible(),true,'Consent guidance visible '+prefix);
    await page.locator('.ka-consent input').check();
    await page.locator('.synthetic-challenge').waitFor({state:'attached',timeout:12000});
    assert.equal(configs,1,'Exactly one lazy config call '+prefix);
    assert.equal(challenges,1,'Exactly one lazy external script '+prefix);
    const expiryReset=await page.evaluate(()=>{
      window.__turnstileOptions['expired-callback']();
      return window.__turnstileResetCount;
    });
    assert.equal(expiryReset,1,'Expired challenges must be reset before another submission '+prefix);
    await page.locator('.ka-consent input').uncheck();
    assert.equal(await page.locator('.ka-captcha').count(),0,'Uncheck must unload challenge DOM '+prefix);
    assert.ok(await page.locator('.ka-chat-form textarea').isVisible(),'Normal chat input preserved');
    count++;
   }finally{await page.close()}
  }
 }finally{await browser.close()}
 console.log('CONSENT_GATED_TURNSTILE_PASS',count,'locale flows (synthetic provider script)');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
