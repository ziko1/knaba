'use strict';
// Legacy test path kept for CI compatibility. Test truthful marketing stories, not fictional testimonials.
// Isolated, read-only browser contract: no real submissions or owner account.
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');
const {join}=require('node:path');
const {normalizeLoopbackOrigin,runBrowserGate}=require('./browser-policy-gate.cjs');
const headings={de:/Das zählt bei Ihrer Anfrage/,en:/What matters for your enquiry/,uk:/Що важливо для вашого запиту/,ru:/Что важно для вашего запроса/};
async function suite({browser,origin}){
  let cases=0;
  for(const locale of Object.keys(headings)){
    for(const width of [320,390,768,1440]){
      const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
      try{
        await page.route('**/api/reviews',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({reviews:[],total:0})}));
        await page.goto(origin+(locale==='de'?'/':'/'+locale+'/'));
        await page.locator('#reviews').scrollIntoViewIfNeeded();
        await page.locator('.reviews-empty').waitFor();
        assert.equal(await page.locator('.marketing-story').count(),3);
        assert.match(await page.locator('.marketing-stories-intro h2').innerText(),headings[locale]);
        for(const card of await page.locator('.marketing-story').all()){
          assert.equal(await card.locator('blockquote,time,[itemtype*="Review"]').count(),0);
          const image=card.locator('img');
          assert.ok((await image.getAttribute('alt')).trim());
          assert.ok((await image.getAttribute('src')).startsWith('/illustrations/marketing-'));
          await image.scrollIntoViewIfNeeded();
          assert.ok(await image.evaluate(node=>node.complete&&node.naturalWidth>0));
          const href=await card.locator('a').getAttribute('href');
          assert.ok(href.startsWith(locale==='de'?'/':'/'+locale+'/'));
        }
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        await page.locator('.reviews-action button').focus();await page.keyboard.press('Enter');
        await page.locator('[name="displayName"]').waitFor({state:'visible'});
        assert.equal(await page.locator('[name="displayName"]').evaluate(el=>document.activeElement===el),true);
        await page.locator('.reviews-action button').click();
        if(process.env.KNABA_SCREENSHOT_DIR&&locale==='uk'&&(width===390||width===1440)){
          mkdirSync(process.env.KNABA_SCREENSHOT_DIR,{recursive:true});
          await page.locator('.marketing-stories').screenshot({path:join(process.env.KNABA_SCREENSHOT_DIR,'marketing-stories-'+width+'.png')});
        }
        if(width===320){
          await page.addStyleTag({content:'html{font-size:200%!important}'});
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        }
        cases++;
      }finally{await page.close();}
    }
  }
  const page=await browser.newPage();
  try{
    await page.route('**/api/reviews',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({reviews:[{id:'fixture',displayName:'Synthetic QA fixture',company:'',relationship:'client',text:'Only this published fixture should be visible.',createdAt:'2026-10-26T12:00:00Z'}],total:1})}));
    await page.goto(origin+'/en/');await page.locator('#reviews').scrollIntoViewIfNeeded();
    await page.getByText('Synthetic QA fixture',{exact:true}).waitFor();
    assert.equal(await page.locator('.reviews-empty').count(),0);
    assert.equal(await page.locator('.marketing-story').count(),3);
    assert.equal(await page.locator('.review-card').count(),1);cases++;
    await page.unroute('**/api/reviews');
    await page.route('**/api/reviews',route=>route.fulfill({status:503,body:'unavailable'}));
    await page.reload();await page.locator('#reviews').scrollIntoViewIfNeeded();
    await page.locator('.reviews-notice[role="alert"]').waitFor();
    assert.equal(await page.locator('.reviews-empty').count(),0);cases++;
  }finally{await page.close();}
  return cases;
}
(async()=>{
  const origin=normalizeLoopbackOrigin(process.env.KNABA_TEST_URL);
  const engines=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');
  const skipEngines=(process.env.KNABA_BROWSER_SKIP||'').split(',').filter(Boolean);
  const result=await runBrowserGate({origin,engines,skipEngines,suite});
  console.log(JSON.stringify(result));process.exitCode={PASS:0,FAIL:1,BLOCKED:2}[result.status];
})().catch(error=>{console.error(error);process.exitCode=1;});
