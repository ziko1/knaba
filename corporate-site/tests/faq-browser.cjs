// Existing FAQ browser regression; requires Playwright executable and selected KNABA_TEST_URL.
const {chromium}=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.KNABA_TEST_URL||'https://kneba.vsp.rest';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.KNABA_CHROME_PATH,args:['--no-sandbox']});
 let total=0;
 try{
  for(const lang of ['', 'en/', 'uk/', 'ru/']){
   for(const width of [320,390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:844},isMobile:width<=390,hasTouch:width<=390});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
     const r=await page.goto(base+'/'+lang+'faq/',{waitUntil:'load',timeout:23000});
     assert.equal(r.status(),200,lang+': HTTP');
     assert.equal(await page.locator('main h1').count(),1,lang+' missing h1');
     assert.equal(await page.locator('[data-faq-entry]').count(),42,lang+' full 42 questions');
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
     assert.ok(overflow<=1,lang+' overflow '+width+' '+overflow);
     await page.locator('[data-faq-select]').selectOption({index:1});
     const filtered=await page.locator('[data-faq-entry]:visible').count();
     assert.equal(filtered,7,lang+' filtered category should show 7');
     await page.locator('[data-faq-select]').selectOption('all');
     await page.locator('[data-faq-search]').fill('zz-gibberish-no-faq');
     const empty=await page.locator('[data-faq-empty]').isVisible();
     assert.equal(empty,true,lang+' missing empty state');
     assert.equal(await page.locator('[data-faq-entry]:visible').count(),0,lang+' empty result should hide all');
     await page.locator('[data-faq-search]').fill('');
     assert.equal(await page.locator('[data-faq-entry]:visible').count(),42,lang+' reset search must restore all');
     const first=page.locator('[data-faq-entry]').first();
     await first.locator('summary').click();
     assert.equal(await first.evaluate(el=>el.open),true,lang+' native disclosure');
     assert.deepEqual(errors,[],lang+' JS errors');
     total++;
     console.log('PASS',lang||'de',width,JSON.stringify({filtered,empty,overflow}));
    }finally{await page.close()}
   }
  }
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(base+'/uk/',{waitUntil:'load',timeout:23000});
  assert.equal(await page.locator('[data-faq-entry]').count(),6,'6 FAQ teaser cards on homepage');
  await page.locator('a[href="/uk/faq/"]').first().click();
  await page.waitForURL(base+'/uk/faq/',{timeout:13000});
  assert.equal(await page.locator('[data-faq-entry]').count(),42,'client routing to full FAQ');
  console.log('PASS client-nav UK home->full FAQ');
  await page.close();
 }finally{await browser.close()}
 console.log('FAQ_BROWSER_TESTS_PASS',total,'locale-viewport sets, 1 client-navigation case');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
