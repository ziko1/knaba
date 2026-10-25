// Browser regression for the shared KnaBa cards and localized service pages.
// Run ONLY against a reviewed local/staging build:
//   KNABA_TEST_URL=http://127.0.0.1:4321 node tests/construction-card-browser.cjs
const assert=require('node:assert/strict');
const {chromium}=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KNABA_TEST_URL;
if(!base || !/^https?:\/\//.test(base)) {
  console.error('Set KNABA_TEST_URL to an explicit local/staging origin.');
  process.exit(2);
}
(async()=>{
  const browser=await chromium.launch({
    headless:true,executablePath:process.env.KNABA_CHROME_PATH,args:['--no-sandbox']
  });
  try {
    for(const locale of ['','/en','/uk','/ru']){
      for(const path of ['/','/leistungen/','/bauleistungen/baureinigung/']){
        for(const width of [320,390,760,1280]){
          const url=base+locale+path;
          const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
          try{
            const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
            assert.equal(r?.status(),200,url);
            for(const textZoom of [1,2]){
              if(textZoom===2 && width!==390)continue;
              await page.evaluate(scale=>{document.documentElement.style.fontSize=scale*100+'%'},textZoom);
              const evidence=await page.evaluate(()=>{
                const grid=document.querySelector('.bau-card-grid,.bau-offer-grid');
                const detail=document.querySelector('.service-insight');
                const tile=document.querySelector('.bau-card-request,.bau-offer-request');
                const dimensions=grid?.getBoundingClientRect();
                const card=tile?.getBoundingClientRect();
                return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
                  gridWidth:dimensions?.width,cardWidth:card?.width,
                  heading:detail?.querySelector('h2')?.textContent?.trim(),
                  siteWidth:document.documentElement.clientWidth
                };
              });
              assert(evidence.overflow<=1,JSON.stringify({url,width,textZoom,evidence}));
              if(path==='/bauleistungen/baureinigung/'){
                assert(evidence.heading && evidence.heading.length>25,JSON.stringify({url,evidence}));
              }else{
                assert(evidence.cardWidth>0 && evidence.gridWidth>=evidence.cardWidth,
                  JSON.stringify({url,width,evidence}));
              }
              console.log('KNA_BAU_CARD_PASS',locale||'de',path,width,textZoom);
            }
          }finally{await page.close();}
        }
      }
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
