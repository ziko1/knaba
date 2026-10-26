// Deterministic CSS viewport reflow, keyboard and reduced-motion browser acceptance.
// Run against a source-built isolated static site; no authentication or live accounts.
// A 640 CSS-px viewport represents the layout width of 1280px at 200% browser zoom;
// 320 CSS px represents 400% reflow. This is NOT physical browser/device zoom QA.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');
const origin=(process.env.KNABA_TEST_URL||'').replace(/\/$/,'');
if(!origin || !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin)){
  throw Error('A loopback isolated test origin is required');
}
const cases=[
  {lang:'de',path:'/',cssWidth:640,zoom:'200% from 1280px'},
  {lang:'de',path:'/',cssWidth:320,zoom:'400% from 1280px'},
  {lang:'uk',path:'/uk/',cssWidth:640,zoom:'200% from 1280px'},
  {lang:'uk',path:'/uk/',cssWidth:320,zoom:'400% from 1280px'},
  {lang:'ru',path:'/ru/',cssWidth:640,zoom:'200% from 1280px'},
  {lang:'en',path:'/en/',cssWidth:320,zoom:'400% from 1280px'}
];
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.KNABA_CHROME_PATH||undefined,
    args:['--disable-dev-shm-usage']});
  let passed=0;
  try{
    for(const item of cases){
      const page=await browser.newPage({viewport:{width:item.cssWidth,height:850},deviceScaleFactor:1,reducedMotion:'reduce'});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        const response=await page.goto(origin+item.path,{waitUntil:'networkidle',timeout:20000});
        assert.equal(response?.status(),200,'HTTP '+item.path);
        const metrics=await page.evaluate(()=>{
          const root=document.documentElement,hero=document.querySelector('.bau-hero');
          return {scrollWidth:root.scrollWidth,viewport:window.innerWidth,
            heroColumns:getComputedStyle(hero).gridTemplateColumns.trim().split(/\s+/).length,
            cardTransition:getComputedStyle(document.querySelector('.bau-card')).transitionDuration};
        });
        assert.ok(metrics.scrollWidth<=metrics.viewport+1,
          'Reflow overflow '+item.lang+' '+item.zoom+': '+JSON.stringify(metrics));
        assert.equal(metrics.heroColumns,1,'Hero must reflow to one column');
        assert.equal(metrics.cardTransition,'0s','Reduce-motion must remove card animation');

        // Keyboard mobile-navigation reachability and Escape restoration.
        const mobile=page.locator('.mobile-nav');
        const mobileSummary=page.locator('.mobile-nav > summary');
        await mobileSummary.focus();
        await page.keyboard.press('Enter');
        assert.equal(await mobile.evaluate(el=>el.open),true,'Mobile menu opens by keyboard');
        const mobileRect=await page.locator('.mobile-nav nav').boundingBox();
        assert.ok(mobileRect && mobileRect.x>=-1 && mobileRect.x+mobileRect.width<=item.cssWidth+1,
          'Mobile menu clipped: '+JSON.stringify(mobileRect));
        await page.keyboard.press('Escape');
        assert.equal(await mobile.evaluate(el=>el.open),false,'Escape closes mobile menu');
        assert.equal(await mobileSummary.evaluate(el=>document.activeElement===el),true,'Focus returns after Escape');

        const language=page.locator('.site-language-switcher');
        const languageSummary=page.locator('.site-language-switcher > summary');
        await languageSummary.focus();await page.keyboard.press('Enter');
        assert.equal(await language.evaluate(el=>el.open),true,'Locale picker keyboard-open');
        const rect=await page.locator('.site-language-options').boundingBox();
        assert.ok(rect && rect.x>=-1 && rect.y>=-1 && rect.x+rect.width<=item.cssWidth+1,
          'Locale dropdown is outside viewport: '+item.lang+' '+item.zoom+' '+JSON.stringify(rect));
        assert.equal(await page.locator('.site-language-options a[data-language-switch]').count(),4);
        await page.keyboard.press('Escape');
        assert.equal(await language.evaluate(el=>el.open),false,'Escape closes locale picker');
        assert.equal(await languageSummary.evaluate(el=>document.activeElement===el),true,'Locale focus restored');

        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
        const footer=await page.evaluate(()=>{
          const links=[...document.querySelectorAll('.footer-bottom a')];
          const launcher=document.querySelector('[data-knaba-open]')?.getBoundingClientRect();
          const overlapping=links.filter(el=>{
            const r=el.getBoundingClientRect();
            return launcher && r.left<launcher.right && r.right>launcher.left && r.top<launcher.bottom && r.bottom>launcher.top;
          }).map(el=>el.textContent.trim());
          return {overlapping,offscreen:links.filter(el=>{
            const r=el.getBoundingClientRect();return r.left<-1 || r.right>window.innerWidth+1
          }).map(el=>el.textContent.trim())};
        });
        assert.deepEqual(footer.overlapping,[],'Fixed assistant covers legal footer links');
        assert.deepEqual(footer.offscreen,[],'Footer legal link offscreen');
        assert.deepEqual(errors,[],'Uncaught errors in '+item.lang+' '+item.zoom);
        passed++;
        console.log('REFLOW_PASS',item.lang,item.zoom,item.cssWidth,'px');
      }finally{await page.close()}
    }
  }finally{await browser.close()}
  console.log('REFLOW_ACCEPTANCE',JSON.stringify({passed,total:cases.length,actualBrowserZoom:false,physicalDevice:false}));
})().catch(err=>{console.error(err.stack||err);process.exitCode=1});
