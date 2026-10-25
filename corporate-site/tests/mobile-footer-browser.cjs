// Run in a controlled browser container with KNABA_TEST_URL and KNABA_PLAYWRIGHT_MODULE.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KNABA_TEST_URL||'https://kneba.vsp.rest';
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.KNABA_CHROME_PATH, args:['--no-sandbox']});
try{
  for(const [width,height] of [[320,700],[390,844],[390,1550],[768,1024]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    await page.goto(base+'/uk/leistungen/',{waitUntil:'domcontentloaded',timeout:20000});
    await page.evaluate(()=>{
      const main=document.querySelector('main');
      if(!main)throw Error('No semantic main content');
      // Reproduce very short pages: footer must still cover the bottom of the viewport.
      main.replaceChildren(document.createElement('div'));
      window.scrollTo(0,document.documentElement.scrollHeight);
    });
    const m=await page.evaluate(()=>{
      const footer=document.querySelector('footer');
      const rect=footer.getBoundingClientRect();
      return {bottom:rect.bottom,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth};
    });
    console.log('FOOTER_VIEWPORT',width,height,JSON.stringify(m));
    assert.ok(m.overflow<=1,'No horizontal overflow');
    assert.ok(Math.abs(m.bottom-m.height)<=2,'Footer must end exactly at viewport bottom for short pages');
    await page.close();
  }

  // Real page, all languages: a fixed AI launcher must not cover legal links.
  // Test the bottom *after* layout has settled (including at 200% zoom-like widths).
  for(const route of ['/leistungen/','/en/leistungen/','/uk/leistungen/','/ru/leistungen/']){
    for(const width of [320,360,390,480,760,768,1024,1440]){
      const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
      try{
        const response=await page.goto(base+route,{waitUntil:'load',timeout:20000});
        assert.equal(response?.status(),200,'Catalogue route must load: '+route);
        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
        const evidence=await page.evaluate(()=>{
          const button=document.querySelector('[data-knaba-open]');
          const footer=document.querySelector('footer');
          const links=Array.from(document.querySelectorAll('.footer-bottom a'));
          if(!(button instanceof HTMLElement) || !footer || links.length===0)
            return {error:'Missing assistant launcher, footer or legal links'};
          const launcher=button.getBoundingClientRect();
          const overlaps=links.filter(link=>{
            const rect=link.getBoundingClientRect();
            return rect.left<launcher.right && rect.right>launcher.left &&
              rect.top<launcher.bottom && rect.bottom>launcher.top;
          }).map(link=>link.textContent?.trim());
          const offscreen=links.filter(link=>{
            const rect=link.getBoundingClientRect();
            return rect.left<0 || rect.right>innerWidth;
          }).map(link=>link.textContent?.trim());
          return {
            overlaps,offscreen,
            horizontalOverflow:document.documentElement.scrollWidth-innerWidth,
            footerBottom:footer.getBoundingClientRect().bottom,
            viewportHeight:innerHeight,
            touchTargets:innerWidth<=760?links.map(link=>Math.round(link.getBoundingClientRect().height)):[],
          };
        });
        assert.equal(evidence.error,undefined,JSON.stringify({route,width,evidence}));
        assert.deepEqual(evidence.overlaps,[],JSON.stringify({route,width,evidence}));
        assert.deepEqual(evidence.offscreen,[],JSON.stringify({route,width,evidence}));
        assert.ok(evidence.horizontalOverflow<=1,JSON.stringify({route,width,evidence}));
        assert.ok(Math.abs(evidence.footerBottom-evidence.viewportHeight)<=2,JSON.stringify({route,width,evidence}));
        if(width<=760) assert.ok(evidence.touchTargets.every(value=>value>=44),JSON.stringify({route,width,evidence}));
        console.log('FOOTER_CLEAR',route,width,JSON.stringify(evidence));
      }finally{await page.close()}
    }
  }
}finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
