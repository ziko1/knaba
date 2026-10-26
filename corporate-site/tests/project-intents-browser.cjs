// Isolated corporate SEO content QA. A loopback static artifact server, no providers or form submissions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require(process.env.KNABA_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(process.env.KNABA_BUILD_ROOT || 'dist/client');
const expected = ['baureinigung','bauzwischenreinigung','bauendreinigung','baustellenraeumung','bauhilfe','kernbohrungen'];
const locales = [['de',''],['en','/en'],['uk','/uk'],['ru','/ru']];
const widths = [320,390,768,1440];
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const errors = [];
let gets=0;
const server=http.createServer((req,res)=>{
  if (req.method!=='GET') {res.writeHead(405);res.end();return;}
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    const name=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
    const filename=path.resolve(root,'.'+name);
    if (!filename.startsWith(root+path.sep)) throw Error('forbidden path');
    const data=fs.readFileSync(filename);
    res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream'});
    res.end(data);gets++;
  } catch {res.writeHead(404);res.end('Not found');}
});
async function run(){
  assert.ok(fs.existsSync(path.join(root,'index.html')),'built HTML required');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  let passed=0;
  try {
    // Browser security remains enabled. A policy block is BLOCKED, never PASS.
    browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.KNABA_CHROME_PATH||undefined,timeout:20000});
    for (const [lang,prefix] of locales) for (const width of widths){
      const page=await browser.newPage({viewport:{width,height:850},reducedMotion:'reduce'});
      page.on('pageerror',e=>errors.push(lang+' '+width+': '+e.message));
      await page.route('**/*',route=>{
        const request=route.request();
        return request.method()==='GET'&&request.url().startsWith(base+'/')
          ?route.continue():route.abort();
      });
      try {
        const response=await page.goto(base+prefix+'/leistungen/',{waitUntil:'networkidle',timeout:20000});
        assert.equal(response?.status(),200,lang+' '+width+' HTTP');
        assert.equal(await page.locator('html').getAttribute('lang'),lang);
        assert.equal(await page.locator('h1').count(),1,'one H1 '+lang);
        const section=page.locator('section[aria-labelledby="project-intents-heading"]');
        assert.equal(await section.count(),1,'one new guide '+lang);
        const text=await section.locator('h2').textContent();
        assert.ok(text && text.trim().length>26,'useful localized H2 '+lang);
        assert.equal(await section.locator('.project-intents-grid > article').count(),6,'six guide cards '+lang);
        const hrefs=await section.locator('.project-intents-grid a[href]').evaluateAll(items=>items.map(a=>a.getAttribute('href')));
        assert.deepEqual(hrefs,expected.map(slug=>prefix+'/bauleistungen/'+slug+'/'));
        const rendered=await page.evaluate(()=>{
          const grid=document.querySelector('.project-intents-grid');
          const h1=document.querySelector('h1');
          const firstLink=grid?.querySelector('a');
          const style=grid?getComputedStyle(grid):null;
          return {
            overflow:document.documentElement.scrollWidth-window.innerWidth,
            columns:style?.gridTemplateColumns?.trim().split(/\s+/).length,
            targetWidth:firstLink?.getBoundingClientRect().height,
            headingSize:parseFloat(getComputedStyle(h1).fontSize),
            visible:grid?.getBoundingClientRect().width > 0
          };
        });
        assert.ok(rendered.overflow<=1,'no horizontal overflow '+lang+' '+width+': '+JSON.stringify(rendered));
        assert.equal(rendered.columns,width<=520?1:width<=850?2:3,'responsive guide columns '+lang+' '+width);
        assert.ok(rendered.targetWidth>=24,'keyboard target height '+lang+' '+width);
        assert.ok(rendered.visible,'rendered guide width');
        const first=section.locator('.project-intents-grid a').first();
        await first.focus();
        assert.equal(await first.evaluate(el=>document.activeElement===el),true,'link keyboard focus '+lang+' '+width);
        assert.equal(await page.locator('a[href^="tel:"]').count(),1,'single canonical phone link '+lang);
        passed++;
        console.log('KNABA_INTENT_BROWSER_PASS',lang,width,'cols',rendered.columns,'overflow',rendered.overflow);
      } finally {await page.close();}
    }
    assert.deepEqual(errors,[],'no browser JS errors');
    console.log('KNABA_INTENT_BROWSER_TOTAL',JSON.stringify({passed,total:locales.length*widths.length,httpGets:gets,source:process.env.SOURCE_SHA||'uncommitted-source',live:false,physicalDevice:false}));
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
run().catch(error=>{
  const msg=String(error.stack||error);
  const blocked=/No usable sandbox|Chromium sandboxing failed|Operation not permitted|ERR_BLOCKED_BY_ADMINISTRATOR|Failed to launch browser|Executable doesn't exist|Target page, context or browser has been closed/.test(msg);
  console.error('KNABA_INTENT_BROWSER_'+(blocked?'BLOCKED':'FAIL'),msg);
  server.close();
  process.exitCode=blocked?2:1;
});