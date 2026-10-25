// Integrated I18N-99 browser regression. Browser is supplied by the existing local QA image.
// No provider calls, no user data, no fake translated routes.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.KNABA_PLAYWRIGHT_MODULE || 'playwright');
const base = (process.env.KNABA_TEST_URL || 'http://127.0.0.1:4321').replace(/\/$/, '');
(async () => {
  const browser = await chromium.launch({
    headless:true,
    executablePath:process.env.KNABA_CHROME_PATH || undefined,
    args:['--no-sandbox']
  });
  let cases=0;
  try {
    for(const route of ['/', '/en/', '/uk/', '/ru/']) {
      for(const width of [320,390,768]) {
        const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
        try {
          let requests=0;
          page.on('request',request=>{if(new URL(request.url()).pathname==='/languages.json')requests++;});
          const response=await page.goto(base+route,{waitUntil:'load',timeout:20000});
          assert.equal(response?.status(),200,route);
          assert.equal(requests,0,'Only lazy-load 95 pending languages after menu is opened');
          const menu=page.locator('.site-language-switcher > summary');
          await menu.click();
          await page.waitForSelector('[data-locale-item]',{timeout:12000});
          const evidence=await page.evaluate(()=>{
            const root=document.querySelector('[data-locale-catalog]');
            const links=Array.from(document.querySelectorAll('.site-language-options a[data-language-switch]'));
            const pending=Array.from(document.querySelectorAll('[data-locale-item]'));
            const panel=document.querySelector('.site-language-options').getBoundingClientRect();
            return {
              root:!!root,links:links.map(a=>a.getAttribute('hreflang')),
              pending:pending.length,
              nonInteractive:pending.every(item=>!item.querySelector('a,button,input')),
              overflow:document.documentElement.scrollWidth-innerWidth,
              offscreen:panel.left < -1 || panel.right > innerWidth + 1,
              panel:[panel.left,panel.right,innerWidth],
              status:root?.querySelector('[data-locale-status]')?.textContent
            };
          });
          assert.equal(evidence.root,true,JSON.stringify({route,width,evidence}));
          assert.deepEqual(evidence.links,['de','en','uk','ru']);
          assert.equal(evidence.pending,95);
          assert.equal(evidence.nonInteractive,true,'Pending languages are not links');
          assert.ok(evidence.overflow<=1,JSON.stringify({route,width,evidence}));
          assert.equal(evidence.offscreen,false,JSON.stringify({route,width,evidence}));
          assert.equal(requests,1,'Open menu downloads exactly one manifest');
          const filter=page.locator('[data-locale-search]');
          await filter.fill('Spanish');
          const matches=await page.locator('[data-locale-item]:visible').count();
          assert.ok(matches>=1 && matches<95,'Search filters 95 pending options');
          await filter.fill('zzzz-no-match');
          assert.equal(await page.locator('[data-locale-item]:visible').count(),0);
          assert.equal(await page.locator('[data-locale-empty]').isVisible(),true);
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('.site-language-switcher').evaluate(e=>e.open),false);
          assert.equal(await menu.evaluate(e=>document.activeElement===e),true,'Escape returns focus to the locale trigger');
          await menu.click();
          assert.equal(await page.locator('[data-locale-item]').count(),95,'Reopen retains the 95 pending entries');
          assert.equal(requests,1,'Reopen must reuse the already fetched manifest');
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('.site-language-switcher').evaluate(e=>e.open),false);
          cases++;
          console.log('LANG_BROWSER_PASS',route,width,JSON.stringify({pending:evidence.pending,requests,overflow:evidence.overflow,panel:evidence.panel}));
        } finally { await page.close(); }
      }
    }
    // A missing static manifest must never break the already published four links.
    const failed=await browser.newPage({viewport:{width:390,height:844}});
    try {
      await failed.route('**/languages.json',route=>route.abort());
      await failed.goto(base+'/uk/',{waitUntil:'load',timeout:20000});
      await failed.locator('.site-language-switcher > summary').click();
      await failed.waitForFunction(()=>document.querySelector('[data-locale-status]')?.textContent?.includes('недоступ'),{timeout:12000});
      assert.equal(await failed.locator('.site-language-options a[data-language-switch]').count(),4);
      console.log('LANG_MANIFEST_FAILURE_FALLBACK_PASS');
    } finally { await failed.close(); }
    console.log('LANG_BROWSER_TOTAL',cases);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
