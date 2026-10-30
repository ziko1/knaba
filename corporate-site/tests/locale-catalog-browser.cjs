/* Browser acceptance of published vs pending locale metadata.
   Run in isolated Chromium image with KNABA_PLAYWRIGHT_MODULE and KNABA_TEST_URL.
   No credentials, no user data and no mutations of a running app. */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.KNABA_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.KNABA_TEST_URL || 'http://127.0.0.1:19121';
const routes = [{url:'/',locale:'de'}, {url:'/en/',locale:'en'}, {url:'/uk/',locale:'uk'}, {url:'/ru/',locale:'ru'}];
async function main() {
  const browser = await chromium.launch({
    headless:true, executablePath: process.env.KNABA_CHROME_PATH,
    args:['--no-sandbox']
  });
  let tests = 0;
  try {
    for (const {url,locale} of routes) {
      for (const width of [320,390,768,1280]) {
        const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
        const pageErrors=[];
        let manifestRequests=0;
        page.on('pageerror',error=>pageErrors.push(error.message));
        page.on('request',request=>{if(request.url().split('?')[0].endsWith('/languages.json'))manifestRequests++;});
        try {
          await page.goto(base+url,{waitUntil:'domcontentloaded',timeout:20000});
          await page.locator('body').waitFor();
          assert.equal(await page.locator('html').getAttribute('lang'),locale);
          assert.equal(await page.locator('a[data-language-switch]').count(),4);
          assert.equal(await page.locator('[data-locale-item]').count(),0,'Pending locales must be lazy');
          assert.equal(manifestRequests,0,'No eager manifest fetch before selector opens');
          const summary=page.locator('.site-language-switcher > summary');
          await summary.click({timeout:7000});
          await page.waitForFunction(()=>document.querySelectorAll('[data-locale-item]').length===95,null,{timeout:12000});
          assert.equal(manifestRequests,1,'Only one inventory request per page');
          const metrics=await page.evaluate(()=>{
            const nav=document.querySelector('.site-language-options');
            const r=nav?.getBoundingClientRect();
            const candidates=[...document.querySelectorAll('[data-locale-item]')];
            const pendingLinks=candidates.filter(x=>x.querySelector('a[href]')).length;
            const globalOverflow=document.documentElement.scrollWidth-innerWidth;
            return {left:r?.left,right:r?.right,viewport:innerWidth,overflow:globalOverflow,
              items:candidates.length,pendingLinks,activeLinks:document.querySelectorAll('a[data-language-switch]').length};
          });
          console.log('DIAG_LOCALE_BOX',locale,width,JSON.stringify(metrics));
          assert.equal(metrics.items,95);
          assert.equal(metrics.pendingLinks,0,'Pending languages must not navigate to imaginary URLs');
          assert.equal(metrics.activeLinks,4);
          assert.ok(metrics.overflow<=1,'No horizontal scroll overflow');
          assert.ok(metrics.left>=-1 && metrics.right<=metrics.viewport+1,'Selector must stay inside viewport');
          const search=page.locator('[data-locale-search]');
          await search.fill('pl');
          const filtered=await page.evaluate(()=>[...document.querySelectorAll('[data-locale-item]')].filter(li=>!li.hidden).map(li=>li.querySelector('.locale-catalog-code')?.textContent||''));
          assert.ok(filtered.includes('pl'),'Polish must appear by code without publishing a fake URL');
          await search.fill('invalid_locale_qwerty');
          assert.equal(await page.locator('[data-locale-empty]').isVisible(),true,'No-result state should be displayed');
          // Escape from the *focused search input* (not the disclosure
          // summary) must close and return focus to a keyboard-accessible trigger.
          await search.press('Escape');
          await page.waitForFunction(()=>!document.querySelector('.site-language-switcher')?.open,null,{timeout:3000});
          assert.equal(await summary.evaluate(e=>document.activeElement===e),true,
            'Escape from search returns focus to the locale trigger');
          await summary.click();
          assert.equal(await page.locator('[data-locale-item]').count(),95);
          assert.equal(manifestRequests,1,'Reopening uses the cached manifest');
          await summary.press('Escape');
          await page.waitForFunction(()=>!document.querySelector('.site-language-switcher')?.open,null,{timeout:3000});
          assert.deepEqual(pageErrors,[],'No page JS exceptions');
          tests++;
          console.log('PASS',locale,width,'95 pending/4 available','no-overflow','lazy');
        } finally {await page.close();}
      }
    }
    // Provider/manifest outage must leave all four real language links usable.
    const unavailable=await browser.newPage({viewport:{width:390,height:844}});
    const fallbackErrors=[];
    unavailable.on('pageerror',e=>fallbackErrors.push(e.message));
    try{
      await unavailable.route('**/languages.json',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
      await unavailable.goto(base+'/uk/',{waitUntil:'domcontentloaded',timeout:20000});
      await unavailable.locator('.site-language-switcher > summary').click();
      await unavailable.waitForFunction(()=>{
        const e=document.querySelector('[data-locale-status]');
        return e?.textContent?.includes('недоступний');
      },null,{timeout:8000});
      assert.equal(await unavailable.locator('a[data-language-switch]').count(),4);
      assert.equal(await unavailable.locator('[data-locale-item]').count(),0);
      assert.deepEqual(fallbackErrors,[]);
      console.log('LOCALE_FAILURE_FALLBACK_PASS uk 390');
    }finally{await unavailable.close();}

    // A published-locale link must navigate to a real same-window route.
    const linkPage=await browser.newPage({viewport:{width:390,height:844}});
    try{
      await linkPage.goto(base+'/uk/leistungen/',{waitUntil:'domcontentloaded',timeout:20000});
      await linkPage.locator('.site-language-switcher > summary').click();
      await linkPage.locator('a[data-language-switch][lang=de]').click();
      await linkPage.waitForURL(base+'/leistungen/',{timeout:10000});
      assert.equal(await linkPage.locator('html').getAttribute('lang'),'de');
      console.log('LOCALE_SAME_WINDOW_NAV_PASS uk_to_de');
    }finally{await linkPage.close();}

    // Accessible 200% root text reflow: 320px, 390px and 640px.
    let zoomTests=0;
    for (const {url,locale} of routes) {
      for(const width of [320,390,640]) {
        const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
        try {
          const response=await page.goto(base+url,{waitUntil:'load',timeout:20000});
          assert.equal(response?.status(),200,url);
          await page.addStyleTag({content:'html{font-size:200%!important}'});
          const metrics=await page.evaluate(()=>{
            const selectors=['.construction-brand img','.site-language-switcher > summary','.mobile-nav > summary'];
            const rects=selectors.map(selector=>document.querySelector(selector).getBoundingClientRect());
            const skip=document.querySelector('.skip-link');
            const rect=skip.getBoundingClientRect();
            return {overflow:document.documentElement.scrollWidth-innerWidth,
              headerInside:rects.every(r=>r.left>=-1 && r.right<=innerWidth+1),
              offscreenSkip:rect.bottom<=-1,
              skipPointerEvents:getComputedStyle(skip).pointerEvents};
          });
          assert.ok(metrics.overflow<=1&&metrics.headerInside,JSON.stringify({url,width,metrics}));
          assert.equal(metrics.offscreenSkip,true,JSON.stringify({url,width,metrics}));
          assert.equal(metrics.skipPointerEvents,'none');
          await page.locator('.skip-link').focus();
          const focused=await page.locator('.skip-link').evaluate(element=>{
            const r=element.getBoundingClientRect();
            return document.activeElement===element && r.top>=0 &&
              r.left>=0 && r.right<=innerWidth+1 && getComputedStyle(element).pointerEvents==='auto';
          });
          assert.equal(focused,true,'Skip link visible on keyboard focus');
          await page.locator('.mobile-nav > summary').click({timeout:4000});
          assert.equal(await page.locator('.mobile-nav').evaluate(element=>element.open),true);
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('.mobile-nav').evaluate(element=>element.open),false);
          await page.locator('.site-language-switcher > summary').click({timeout:4000});
          await page.waitForFunction(()=>document.querySelectorAll('[data-locale-item]').length===95,null,{timeout:12000});
          const panel=await page.locator('.site-language-options').evaluate(element=>{
            const r=element.getBoundingClientRect();
            return {left:r.left,right:r.right,viewport:innerWidth,
              overflow:document.documentElement.scrollWidth-innerWidth};
          });
          assert.ok(panel.left>=-1&&panel.right<=panel.viewport+1&&panel.overflow<=1,
            JSON.stringify({url,width,panel}));
          zoomTests++;
          console.log('FONT200_PASS',locale,width);
        }finally{await page.close();}
      }
    }
    console.log('FONT200_TOTAL',zoomTests);

    console.log('LOCALE_BROWSER_PASS',tests,'viewports + fallback + navigation');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
