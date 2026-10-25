// Visual smoke test for the source-built KnaBa site.
// Run against isolated static HTTP or an explicitly approved preview origin.
// KNABA_TEST_URL=http://127.0.0.1:18769
// KNABA_PLAYWRIGHT_MODULE=/app/node_modules/playwright
// KNABA_SCREENSHOT_DIR=/evidence  (optional)
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');
const {join}=require('node:path');
const {chromium}=require(process.env.KNABA_PLAYWRIGHT_MODULE || 'playwright');
const base=(process.env.KNABA_TEST_URL || '').replace(/\/$/,'');
if (!base) throw Error('KNABA_TEST_URL is required: no implicit live checks');
const host=new URL(base);
if (!['http:','https:'].includes(host.protocol)) throw Error('HTTP(S) preview required');
const screenshotDir=process.env.KNABA_SCREENSHOT_DIR;
if (screenshotDir) mkdirSync(screenshotDir,{recursive:true});
const expectedNoindex=process.env.KNABA_EXPECT_NOINDEX!=='0';
const locales=[['de',''],['en','/en'],['uk','/uk'],['ru','/ru']];
const widths=[320,390,768,980,1440];
let pages=0;

(async()=>{
 const browser=await chromium.launch({
   headless:true,
   executablePath:process.env.KNABA_CHROME_PATH||undefined,
   args:['--no-sandbox','--disable-dev-shm-usage']
 });
 try{
   for(const [lang,prefix] of locales){
     for(const width of (lang==='de'||lang==='uk'?widths:[390])){
       const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
       const errors=[];
       page.on('pageerror',error=>errors.push(error.message));
       try{
         const response=await page.goto(base+prefix+'/',{waitUntil:'networkidle',timeout:20000});
         assert.equal(response?.status(),200,lang+' homepage status');
         assert.equal(await page.locator('html').getAttribute('lang'),lang);
         assert.equal(await page.locator('h1').count(),1);
         assert.equal(await page.locator('.bau-card').count(),6,'five core services + one project card');
         assert.equal(await page.locator('.bau-editorial-panel').count(),2);
         assert.equal(await page.locator('.service-slide').count(),8);
         const metrics=await page.evaluate(()=>{
           const cards=[...document.querySelectorAll('.bau-card')];
           const hero=document.querySelector('.bau-hero');
           const carousel=customElements.get('knaba-service-carousel');
           return {
             overflow:document.documentElement.scrollWidth-window.innerWidth,
             colors:new Set(cards.map(card=>getComputedStyle(card).backgroundImage)).size,
             gridColumns:getComputedStyle(hero).gridTemplateColumns.trim().split(/\s+/).length,
             carouselReady:!!carousel,
             h1FontSize:parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)
           };
         });
         assert.ok(metrics.overflow<=1,'horizontal overflow '+lang+' '+width+': '+JSON.stringify(metrics));
         assert.ok(metrics.colors>=4,'cards need varied gradients '+JSON.stringify(metrics));
         assert.equal(metrics.gridColumns,width<=880?1:2,'responsive hero columns '+lang+' '+width);
         assert.ok(metrics.h1FontSize>=32,'readable heading size '+lang+' '+width);
         assert.ok(metrics.carouselReady,'carousel custom element upgraded');
         assert.equal(await page.locator('link[rel="alternate"][hreflang]').count(),5);
         const ld=await page.locator('script[type="application/ld+json"]').first().textContent();
         const graph=JSON.parse(ld)['@graph'];
         assert.ok(graph.some(e=>e['@type']==='LocalBusiness'));
         assert.ok(graph.some(e=>e['@type']==='WebSite'));
         if(expectedNoindex)assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);
         // The keyboard-only skip link must stay off-screen until deliberately focused.
         const skip=await page.locator('.skip-link').evaluate(node=>({
           fixed:getComputedStyle(node).position==='fixed',
           top:node.getBoundingClientRect().top,
           focused:document.activeElement===node
         }));
         assert.ok(skip.fixed && skip.top<0 && !skip.focused,'skip link hidden by default '+lang+' '+width+': '+JSON.stringify(skip));
         if(screenshotDir && width===390 && lang==='uk') await page.screenshot({path:join(screenshotDir,'knaba-uk-mobile-390.png'),fullPage:true});
         if(screenshotDir && width===1440 && lang==='de') await page.screenshot({path:join(screenshotDir,'knaba-de-desktop-1440.png'),fullPage:true});
         if(width===390&&lang==='uk'){
           await page.locator('[data-carousel-next]').click();
           await page.waitForFunction(()=>document.querySelector('[data-carousel-status]')?.textContent?.trim()==='02 / 08',null,{timeout:5000});
         }
         assert.deepEqual(errors,[],'uncaught page errors '+lang+' '+width);
         console.log('HERO_PASS',lang,width,'colors',metrics.colors,'overflow',metrics.overflow);
         pages++;
       } finally {await page.close()}
     }
   }
   for(const [lang,prefix] of locales){
     const page=await browser.newPage({viewport:{width:390,height:844}});
     try{
       for(const route of ['/leistungen/','/bauleistungen/baureinigung/','/faq/']){
         const response=await page.goto(base+prefix+route,{waitUntil:'networkidle',timeout:20000});
         assert.equal(response?.status(),200,lang+' '+route);
         const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
         assert.ok(overflow<=1,lang+route+' overflow '+overflow);
         assert.equal(await page.locator('h1').count(),1);
         if(route==='/leistungen/'){
           assert.ok((await page.locator('.bau-offer').count())>=6);
           const styles=await page.locator('.bau-offer').evaluateAll(els=>new Set(els.map(e=>getComputedStyle(e).backgroundImage)).size);
           assert.ok(styles>=3,'catalogue colors '+lang);
         }
         if(route.includes('/bauleistungen/')){
           assert.ok(await page.locator('.service-related-link').count()>=1,'preserved PR64 internal related-service links');
         }
         console.log('PAGE_PASS',lang,route);
         pages++;
       }
     } finally {await page.close()}
   }
   console.log('VISUAL_ACCEPTANCE_PASS',JSON.stringify({pages,locales:locales.length,viewports:widths,site:base,proofDir:screenshotDir||null}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
