/* Customer-facing locale picker acceptance: only reviewed translations may be offered.
   Read-only browser QA. No signup, personal data, provider requests or mutations. */
'use strict';
const assert = require('node:assert/strict');
const {chromium} = require(process.env.KNABA_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.KNABA_TEST_URL || 'http://127.0.0.1:19121';
const routes = [{url:'/',locale:'de'}, {url:'/en/',locale:'en'}, {url:'/uk/',locale:'uk'}, {url:'/ru/',locale:'ru'}];

async function main() {
  const launch={headless:true};
  if (process.env.KNABA_CHROME_PATH) launch.executablePath=process.env.KNABA_CHROME_PATH;
  const browser=await chromium.launch(launch);
  let checks=0;
  try {
    for(const {url,locale} of routes) {
      for(const width of [320,390,768,1280]) {
        const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
        let manifestRequests=0;
        const pageErrors=[];
        page.on('request',request=>{if(request.url().split('?')[0].endsWith('/languages.json'))manifestRequests++;});
        page.on('pageerror',error=>pageErrors.push(error.message));
        try {
          const response=await page.goto(base+url,{waitUntil:'domcontentloaded',timeout:20000});
          assert.equal(response?.status(),200,url);
          assert.equal(await page.locator('html').getAttribute('lang'),locale);
          const links=page.locator('a[data-language-switch]');
          assert.equal(await links.count(),4,'Only four real published translations');
          assert.equal(await page.locator('a[data-language-switch][aria-current="page"]').count(),1);
          const dropdown=page.locator('.site-language-switcher');
          const copy=await dropdown.innerText();
          assert.doesNotMatch(copy,/99 (?:Zielsprachen|target languages|цільових мов|целевых языков)|95 (?:geplant|planned|заплановано|запланировано)/i,
            'Do not expose the translation backlog to customers');
          assert.equal(await page.locator('[data-locale-catalog]').count(),0);
          assert.equal(manifestRequests,0,'Do not fetch 95 unpublished locales for visitors');

          const summary=page.locator('.site-language-switcher > summary');
          await summary.click({timeout:7000});
          const rect=await page.locator('.site-language-options').evaluate(element=>{
            const r=element.getBoundingClientRect();
            return {left:r.left,right:r.right,viewport:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth};
          });
          assert.ok(rect.left>=-1&&rect.right<=rect.viewport+1&&rect.overflow<=1,JSON.stringify(rect));
          assert.equal(await links.count(),4);
          await summary.press('Escape');
          await page.waitForFunction(()=>!document.querySelector('.site-language-switcher')?.open,null,{timeout:3000});
          assert.deepEqual(pageErrors,[]);
          checks++;
        } finally {await page.close();}
      }
    }

    // A broken private translation manifest must not affect the four published languages.
    const unavailable=await browser.newPage({viewport:{width:390,height:844}});
    try {
      await unavailable.route('**/languages.json',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
      await unavailable.goto(base+'/uk/',{waitUntil:'domcontentloaded',timeout:20000});
      await unavailable.locator('.site-language-switcher > summary').click();
      assert.equal(await unavailable.locator('a[data-language-switch]').count(),4);
      assert.equal(await unavailable.locator('[data-locale-catalog]').count(),0);
    } finally {await unavailable.close();}

    const link=await browser.newPage({viewport:{width:390,height:844}});
    try {
      await link.goto(base+'/uk/leistungen/',{waitUntil:'domcontentloaded',timeout:20000});
      await link.locator('.site-language-switcher > summary').click();
      await link.locator('a[data-language-switch][lang=de]').click();
      await link.waitForURL(base+'/leistungen/',{timeout:10000});
      assert.equal(await link.locator('html').getAttribute('lang'),'de');
    } finally {await link.close();}

    let reflow=0;
    for(const {url} of routes) for(const width of [320,390,640]) {
      const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
      try {
        const response=await page.goto(base+url,{waitUntil:'load',timeout:20000});
        assert.equal(response?.status(),200);
        await page.addStyleTag({content:'html{font-size:200%!important}'});
        const metrics=await page.evaluate(()=>{
          const rects=['.construction-brand img','.site-language-switcher > summary','.mobile-nav > summary']
            .map(selector=>document.querySelector(selector).getBoundingClientRect());
          const skip=document.querySelector('.skip-link');
          const r=skip.getBoundingClientRect();
          return {overflow:document.documentElement.scrollWidth-innerWidth,
            headerInside:rects.every(x=>x.left>=-1&&x.right<=innerWidth+1),
            offscreenSkip:r.bottom<=-1,pointerEvents:getComputedStyle(skip).pointerEvents};
        });
        assert.ok(metrics.overflow<=1&&metrics.headerInside,JSON.stringify({url,width,metrics}));
        assert.equal(metrics.offscreenSkip,true);
        assert.equal(metrics.pointerEvents,'none');
        const skip=page.locator('.skip-link');
        await skip.focus();
        const focused=await skip.evaluate(element=>{
          const r=element.getBoundingClientRect();
          return document.activeElement===element&&r.top>=0&&r.left>=0&&r.right<=innerWidth+1&&getComputedStyle(element).pointerEvents==='auto';
        });
        assert.equal(focused,true,'Skip link must be accessible on keyboard focus');
        await page.locator('.mobile-nav > summary').click();
        assert.equal(await page.locator('.mobile-nav').evaluate(element=>element.open),true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.mobile-nav').evaluate(element=>element.open),false);
        await page.locator('.site-language-switcher > summary').click();
        assert.equal(await page.locator('a[data-language-switch]').count(),4);
        const box=await page.locator('.site-language-options').evaluate(element=>{
          const r=element.getBoundingClientRect();
          return {left:r.left,right:r.right,viewport:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth};
        });
        assert.ok(box.left>=-1&&box.right<=box.viewport+1&&box.overflow<=1,JSON.stringify(box));
        reflow++;
      } finally {await page.close();}
    }
    console.log('LOCALE_BROWSER_PASS',checks,'viewports + manifest outage + navigation;',reflow,'200%-text reflow cases');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
