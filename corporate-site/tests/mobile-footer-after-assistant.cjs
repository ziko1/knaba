// Real browser regression: closing the solid assistant must never hide footer legal links.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KNABA_TEST_URL||'https://kneba.vsp.rest';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.KNABA_CHROME_PATH,args:['--no-sandbox']});
  let total=0;
  try {
    for(const prefix of ['', '/en','/uk','/ru']){
      for(const width of [320,360,390,480,600,760,768,1024]){
        const page=await browser.newPage({viewport:{width,height:844},isMobile:width<=480,hasTouch:width<=480});
        try{
          const response=await page.goto(base+prefix+'/leistungen/',{waitUntil:'domcontentloaded',timeout:20000});
          assert.equal(response?.status(),200);
          await page.locator('[data-knaba-open]').click();
          await page.locator('.ka-header .ka-icon').click();
          await page.locator('.ka-launcher').waitFor();
          await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
          const bounds=await page.evaluate(()=>{
            const button=document.querySelector('.ka-launcher');
            const launcher=button?.getBoundingClientRect();
            const links=Array.from(document.querySelectorAll('.footer-bottom a'));
            const obscured=links.filter(link=>{
              const r=link.getBoundingClientRect();
              return r.left<launcher.right&&r.right>launcher.left&&r.top<launcher.bottom&&r.bottom>launcher.top;
            }).map(link=>link.textContent?.trim());
            return {buttonWidth:launcher.width,obscured,overflow:document.documentElement.scrollWidth-innerWidth,
              touchHeights:innerWidth<=760?links.map(link=>link.getBoundingClientRect().height):[]};
          });
          assert.deepEqual(bounds.obscured,[],JSON.stringify({prefix,width,bounds}));
          assert.ok(bounds.overflow<=1,JSON.stringify({prefix,width,bounds}));
          if(width<=760){
            assert.ok(bounds.buttonWidth<=56,JSON.stringify({prefix,width,bounds}));
            assert.ok(bounds.touchHeights.every(height=>height>=44),JSON.stringify({prefix,width,bounds}));
          }
          total++;
        }finally{await page.close()}
      }
    }
  }finally{await browser.close()}
  console.log('FOOTER_AFTER_ASSISTANT_CLOSE_PASS',total,'four locales, eight viewport sizes');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
