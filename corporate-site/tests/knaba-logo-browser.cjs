'use strict';
/** Read-only KNABA 3D brand browser acceptance; no production URL or real accounts.
 * KNABA_TEST_URL=http://127.0.0.1:18769 npm run test:logo:browser
 * KNABA_PLAYWRIGHT_MODULE=/app/node_modules/playwright (when not installed locally)
 * KNABA_BROWSER_SKIP=chromium (reuse a previously verified administrator block)
 */
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');
const {join}=require('node:path');
const {normalizeLoopbackOrigin,runBrowserGate}=require('./browser-policy-gate.cjs');
const locales=[['de',''],['en','/en'],['uk','/uk'],['ru','/ru']];
const widths=[320,390,768,1440];
const screenshotDir=process.env.KNABA_SCREENSHOT_DIR;
async function validateBrand(browser,origin){
  let cases=0;
  for(const [lang,prefix] of locales){
    for(const width of widths){
      const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1,reducedMotion:'reduce'});
      try{
        const response=await page.goto(origin+prefix+'/',{waitUntil:'domcontentloaded',timeout:20000});
        assert.equal(response?.status(),200,`${lang} ${width}: status`);
        assert.equal(await page.locator('html').getAttribute('lang'),lang);
        const header=page.locator('header .construction-brand picture img');
        const footer=page.locator('footer .footer-brand picture img');
        assert.equal(await header.count(),1,`${lang}: shared header logo`);
        assert.equal(await footer.count(),1,`${lang}: shared footer logo`);
        await header.evaluate(image=>image.decode());
        await footer.scrollIntoViewIfNeeded(); // Trigger lazy image loading before decode.
        await footer.evaluate(image=>image.decode());
        const info=await page.evaluate(()=>{
          function read(selector){
            const image=document.querySelector(selector);
            const rect=image?.getBoundingClientRect();
            return {alt:image?.alt||'',src:image?.currentSrc||'',naturalWidth:image?.naturalWidth||0,
              x:rect?.left??-1,right:rect?.right??Infinity,height:rect?.height||0};
          }
          return {viewport:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,
            header:read('header .construction-brand picture img'),footer:read('footer .footer-brand picture img')};
        });
        assert.ok(info.overflow<=1,`${lang}/${width} horizontal overflow: ${info.overflow}`);
        for(const [surface,img] of [['header',info.header],['footer',info.footer]]){
          const target=`/images/knaba-3d-${width<=700?'mobile-':''}${surface}.svg`;
          assert.equal(new URL(img.src).pathname,target,`${lang}/${width} ${surface} responsive source`);
          assert.ok(img.naturalWidth>0&&img.height>0,`${lang}/${width} ${surface} image loaded`);
          assert.ok(img.x>=-1&&img.right<=info.viewport+1,`${lang}/${width} ${surface} clipped`);
          assert.ok(img.alt.trim().length>8,`${lang}/${width} ${surface} localized alt missing`);
        }
        if(width===320||width===390){
          await page.addStyleTag({content:'html{font-size:200%!important}'});
          const reflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
          assert.ok(reflow<=1,`${lang}/${width} 200% root-text reflow: ${reflow}`);
        }
        if(screenshotDir && ((lang==='uk'&&width===390)||(lang==='de'&&width===1440))){
          mkdirSync(screenshotDir,{recursive:true});
          await page.screenshot({path:join(screenshotDir,`knaba-3d-${lang}-${width}.png`),fullPage:true});
        }
        cases++;
      }finally{await page.close()}
    }
  }
  return cases;
}
async function main(){
  const origin=normalizeLoopbackOrigin(process.env.KNABA_TEST_URL);
  let engines;
  try{engines=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright')}
  catch(error){
    if(error?.code==='MODULE_NOT_FOUND'){
      console.log('KNABA_LOGO_BROWSER_QA '+JSON.stringify({status:'BLOCKED',reason:'PLAYWRIGHT_UNAVAILABLE'}));
      process.exitCode=2;return;
    }
    throw error;
  }
  const skipEngines=(process.env.KNABA_BROWSER_SKIP||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(skipEngines.some(s=>!['chromium','firefox','webkit'].includes(s)))throw Error('Invalid KNABA_BROWSER_SKIP');
  const result=await runBrowserGate({origin,engines,skipEngines,suite:({browser,origin:base})=>validateBrand(browser,base)});
  console.log('KNABA_LOGO_BROWSER_QA '+JSON.stringify(result));
  process.exitCode={PASS:0,FAIL:1,BLOCKED:2}[result.status];
}
main().catch(error=>{console.error('KNABA_LOGO_BROWSER_QA_FAIL',String(error?.message||error));process.exitCode=1});
