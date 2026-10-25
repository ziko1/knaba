/**
 * Real Chromium smoke for the four published locales and lazy 99-target catalogue.
 * Run with the cached Microsoft Playwright image, --network none, and mount
 * dist/client at /site read-only; no login, public service or customer DB needed.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('/app/node_modules/playwright');

const root=path.resolve(process.env.KNABA_TEST_ROOT||'/site');
const mime={
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.webp':'image/webp',
};
const server=http.createServer((request,response)=>{
  try {
    const url=new URL(request.url,'http://127.0.0.1');
    const raw=decodeURIComponent(url.pathname);
    if(raw.includes('\0')||raw.includes('\\')||raw.split('/').includes('..')){
      response.writeHead(400);return response.end();
    }
    let file=path.resolve(root,'.'+raw);
    if(file!==root&&!file.startsWith(root+path.sep)){
      response.writeHead(403);return response.end();
    }
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){
      response.writeHead(404);return response.end();
    }
    response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
    fs.createReadStream(file).pipe(response);
  }catch{
    response.writeHead(500);response.end();
  }
});

(async()=>{
  await new Promise(resolve=>server.listen(8383,'127.0.0.1',resolve));
  let browser,passed=0;
  try {
    browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),
      args:['--no-sandbox','--disable-dev-shm-usage']});
    for(const width of [320,390,768,1280]) {
      for(const [route,lang] of [['/','de'],['/uk/','uk'],['/en/','en'],['/ru/','ru']]) {
        const context=await browser.newContext({viewport:{width,height:844}});
        const page=await context.newPage();
        const errors=[];
        let catalogRequests=0;
        page.on('pageerror',err=>errors.push(err.message));
        page.on('request',req=>{
          if(new URL(req.url()).pathname==='/languages.json')catalogRequests++;
        });
        try {
          const response=await page.goto('http://127.0.0.1:8383'+route,{waitUntil:'domcontentloaded',timeout:13000});
          assert.equal(response.status(),200,route);
          await page.waitForTimeout(90);
          assert.equal(catalogRequests,0,'catalogue must be lazy before disclosure');
          assert.equal(await page.locator('html').getAttribute('lang'),lang);
          assert.equal(await page.locator('[data-locale-item]').count(),0,'no eager untranslated content');
          const normal=await page.evaluate(()=>({
            width:document.documentElement.clientWidth,
            scroll:document.documentElement.scrollWidth,
            published:[...document.querySelectorAll('[data-language-switch]')].map(a=>a.getAttribute('lang'))
          }));
          assert.deepEqual(normal.published,['de','en','uk','ru']);
          assert(normal.scroll<=normal.width+2,route+' closed menu overflow '+width);

          const disclosure=page.locator('details.site-language-switcher > summary').first();
          if(width===390) {
            await disclosure.focus();
            await page.keyboard.press('Enter'); // real keyboard control
          } else {
            await disclosure.click();
          }
          await page.locator('[data-locale-item]').first().waitFor({timeout:6500});
          assert.equal(catalogRequests,1,'exactly one lazy request per opening');
          assert.equal(await page.locator('[data-locale-item]').count(),95);
          assert.equal(await page.locator('[data-locale-list] a[href]').count(),0,'pending translations must never navigate');
          const open=await page.evaluate(()=>({
            width:document.documentElement.clientWidth,
            scroll:document.documentElement.scrollWidth
          }));
          assert(open.scroll<=open.width+2,route+' open menu overflow '+width);
          await page.locator('[data-locale-search]').fill('zh-Hant');
          assert.equal(await page.locator('[data-locale-item]:visible').count(),1);
          assert.equal(await page.locator('[data-locale-item]:visible .locale-catalog-code').textContent(),'zh-Hant');
          assert.equal(errors.length,0,'JS console exceptions '+errors.join('; '));
          passed++;
          console.log('I18N99_BROWSER_PASS',width,lang,'pending=95','links=0','lazy=1','overflow=0');
        }finally{await context.close();}
      }
    }
    console.log('I18N99_BROWSER_TOTAL_PASS '+passed+'/16; synthetic static origin; no external network; no data writes');
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error('I18N99_BROWSER_FAIL',e.stack||e);process.exit(1)});
