// Regression: localized public destinations must not advertise German-only copy.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KNABA_TEST_URL||'https://kneba.vsp.rest';
const locales={
 en:{labels:['Your sector','Guides','Berlin & surroundings','Careers']},
 uk:{labels:['Ваша галузь','Поради','Берлін та околиці','Робота']}
};
const paths=['branchen','ratgeber','berlin','karriere'];
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.KNABA_CHROME_PATH,args:['--no-sandbox']});
 try{
  for(const [lang,def] of Object.entries(locales)){
   const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   try{
    await p.goto(base+'/'+lang+'/',{waitUntil:'load',timeout:20000});
    for(let i=0;i<paths.length;i++){
     const target='/'+lang+'/'+paths[i]+'/';
     const link=p.locator('footer a[href="'+target+'"]');
     assert.equal(await link.count(),1,'one localized footer link '+target);
     const label=(await link.textContent()).trim();
     assert.equal(label,def.labels[i],lang+' footer '+paths[i]+' must name the actual localized page');
     const response=await p.request.get(base+target);
     assert.equal(response.status(),200,target+' must resolve');
     const html=await response.text();
     assert.ok(html.includes('<html lang="'+lang+'"'),target+' language');
    }
    // DE-only legal notices are intentionally marked and must remain on DE URLs.
    assert.ok((await p.locator('footer a[href="/datenschutz/"]').textContent()).includes('(DE)'));
    assert.ok((await p.locator('footer a[href="/impressum/"]').textContent()).includes('(DE)'));
    console.log('LOCALIZED_FOOTER_PASS',lang);
   }finally{await p.close()}
  }
 }finally{await b.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
