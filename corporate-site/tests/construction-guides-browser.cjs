// Independent read-only Chromium acceptance for 16 real multilingual guide routes.
// Run against loopback source-built static HTTP only; does not touch live or auth.
// KNABA_TEST_URL=http://127.0.0.1:18769 KNABA_PLAYWRIGHT_MODULE=/app/node_modules/playwright
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');
const {join}=require('node:path');
const {chromium}=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');
const base=(process.env.KNABA_TEST_URL||'').replace(/\/$/,'');
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base))
  throw new Error('An isolated loopback HTTP server with explicit port is required');
const screenshotDir=process.env.KNABA_SCREENSHOT_DIR;
if(screenshotDir)mkdirSync(screenshotDir,{recursive:true});
const expected=['baureinigung-phasen','baureinigung-kosten-planen',
  'bauuebergabe-checkliste','bauendreinigung-vorbereiten'];
const locales=[['de',''],['en','/en'],['uk','/uk'],['ru','/ru']];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.KNABA_CHROME_PATH||undefined,
   args:['--no-sandbox','--disable-dev-shm-usage']});
 let verified=0;
 try{
  for(const [lang,prefix] of locales){
   for(const slug of expected){
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',err=>errors.push(err.message));
    const pathname=prefix+'/ratgeber/'+slug+'/';
    try{
     const res=await page.goto(base+pathname,{waitUntil:'networkidle',timeout:25000});
     assert.equal(res?.status(),200,lang+' '+slug+' should be source-built');
     assert.equal(await page.locator('html').getAttribute('lang'),lang);
     assert.equal(await page.locator('h1').count(),1);
     assert.equal(await page.locator('.guide-chapter').count(),4);
     assert.equal(await page.locator('.guide-checks li').count(),4);
     const checkNumber=await page.locator('.guide-checks li span').first().evaluate(node=>({
       text:node.textContent.trim(),
       whiteSpace:getComputedStyle(node).whiteSpace,
       minWidth:node.getBoundingClientRect().width
     }));
     assert.equal(checkNumber.text,'01');
     assert.equal(checkNumber.whiteSpace,'nowrap','Checklist ordinal must not wrap as 0 on one line and 1 on another');
     assert.ok(checkNumber.minWidth>=17,'Checklist ordinal should have a reserved compact column');
     const checklistLabel=(await page.locator('.guide-kicker').textContent()).trim().toLocaleUpperCase();
     const localBadge={de:'CHECKLISTE',en:'CHECKLIST',uk:'ЧЕКЛІСТ',ru:'ЧЕКЛИСТ'}[lang];
     assert.ok(checklistLabel.includes(localBadge),'Checklist eyebrow must match the current language');
     assert.equal(await page.locator('.guide-related-grid a').count(),3);
     const canonical=await page.locator('link[rel="canonical"]').getAttribute('href');
     assert.equal(canonical,'https://kneba.vsp.rest'+pathname);
     const alts=await page.locator('link[rel="alternate"][hreflang]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('hreflang')));
     assert.deepEqual(alts,['de','en','uk','ru','x-default']);
     const data=JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
     const graph=data['@graph'];
     assert.ok(graph.some(node=>node['@type']==='Article'&&node.inLanguage===lang));
     assert.ok(graph.some(node=>node['@type']==='LocalBusiness'));
     const computed=await page.evaluate(()=>{
       const first=document.querySelector('.guide-chapter h2');
       return {overflow:document.documentElement.scrollWidth-window.innerWidth,
         guideTitle:document.querySelector('h1').textContent.trim(),
         firstChapter:first?.textContent.trim(),
         bodyLength:[...document.querySelectorAll('.guide-chapter p')].map(node=>node.textContent.trim()).join(' ').length};
     });
     assert.ok(computed.overflow<=1,'Horizontal overflow '+lang+' '+slug+' '+computed.overflow);
     assert.ok(computed.bodyLength>=680,'Guide too thin in '+lang+' '+slug+': '+computed.bodyLength);
     assert.ok(computed.guideTitle.length>18&&computed.firstChapter.length>15);
     assert.deepEqual(errors,[],'JS errors in '+lang+' '+slug);
     if(screenshotDir && lang==='uk' && slug==='baureinigung-kosten-planen')
       await page.screenshot({path:join(screenshotDir,'knaba-uk-guide-mobile-390.png'),fullPage:true});
     if(screenshotDir && lang==='de' && slug==='bauuebergabe-checkliste')
       await page.screenshot({path:join(screenshotDir,'knaba-de-guide-mobile-390.png'),fullPage:true});
     console.log('GUIDE_BROWSER_PASS',lang,slug,computed.bodyLength+' characters');
     verified++;
    }finally{await page.close()}
   }
  }
  for(const [lang,prefix] of [['de',''],['uk','/uk']]){
    for(const cssWidth of [320,640,1440]){
      const page=await browser.newPage({viewport:{width:cssWidth,height:850},reducedMotion:'reduce'});
      try{
       await page.goto(base+prefix+'/ratgeber/baureinigung-phasen/',{waitUntil:'networkidle'});
       const info=await page.evaluate(()=>{
         const grid=getComputedStyle(document.querySelector('.guide-body')).gridTemplateColumns.trim().split(/\s+/);
         const related=getComputedStyle(document.querySelector('.guide-related-grid')).gridTemplateColumns.trim().split(/\s+/);
         return {bodyCols:grid.length,relatedCols:related.length,
           overflow:document.documentElement.scrollWidth-window.innerWidth};
       });
       assert.equal(info.bodyCols,cssWidth<=800?1:2,'Responsive guide body reflow');
       assert.equal(info.relatedCols,cssWidth<=580?1:cssWidth<=800?2:3,'Related cards grid');
       assert.ok(info.overflow<=1,'Responsive overflow '+JSON.stringify(info));
       console.log('GUIDE_REFLOW_PASS',lang,cssWidth);
       verified++;
      }finally{await page.close()}
    }
  }
  console.log('GUIDE_BROWSER_TOTAL',JSON.stringify({passed:verified,missing:0,locales:4,guideRoutes:16,source:'isolated loopback'}));
 }finally{await browser.close()}
})().catch(err=>{console.error(err.stack||err);process.exitCode=1});
