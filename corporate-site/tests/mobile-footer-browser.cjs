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
}finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
