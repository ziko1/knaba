/* Run only inside the cached Playwright Docker image with --network none.
 * Uses a synthetic HTTPS origin and an isolated SQLite database under /tmp.
 * No production owner credentials, paid provider requests or live data.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {createServer:tlsServer}=require('node:https');
const {request:upRequest}=require('node:http');
const {readFileSync,mkdtempSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {pathToFileURL}=require('node:url');
const {once}=require('node:events');
const ROOT=process.env.KNABA_TEST_ROOT||'/repo';
const ORIGIN='https://knaba.test:19443';
const LOGIN='owner@example.test';
const PASSWORD='synthetic-not-a-real-account-password-2026';
const temp=mkdtempSync(join(tmpdir(),'knaba-browser-'));
const src=path=>pathToFileURL(ROOT+'/'+path).href;
const pSelector='#main > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > p:nth-of-type(1)';
const aSelector='#main > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > a:nth-of-type(1)';
(async()=>{
  let app,browser,proxy;
  try{
    const {openLocalDatabase}=await import(src('vps/database.mjs'));
    const {createOwner}=await import(src('vps/auth.mjs'));
    const {createKnabaVpsServer}=await import(src('vps/server.mjs'));
    const dbPath=join(temp,'site.sqlite');
    const fresh=openLocalDatabase(dbPath);
    createOwner(fresh.db,LOGIN,PASSWORD);
    fresh.db.close();
    app=await createKnabaVpsServer({
      dbPath,staticRoot:ROOT+'/dist/client',workerPath:src('dist/server/index.js'),
      ownerEmail:LOGIN,origin:ORIGIN,port:19567,host:'127.0.0.1',localTest:false
    });
    proxy=tlsServer({
      key:readFileSync('/cert/key.pem'),cert:readFileSync('/cert/cert.pem')
    },(req,res)=>{
      const headers={...req.headers,host:'knaba.test:19443','x-forwarded-proto':'https'};
      const upstream=upRequest({
        hostname:'127.0.0.1',port:19567,path:req.url,method:req.method,headers,
        timeout:12000
      },response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
      upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('upstream failed');});
      req.pipe(upstream);
    });
    proxy.listen(19443,'127.0.0.1');await once(proxy,'listening');
    browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--host-resolver-rules=MAP knaba.test 127.0.0.1']});
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(ORIGIN+'/',{waitUntil:'networkidle'});
    assert.equal(await page.locator('html').getAttribute('lang'),'de');
    assert.ok((await page.locator('img[src="/illustrations/hero-cleaning.svg"]').count())>=1);
    const homeOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(homeOverflow<=1,'Mobile homepage overflow '+homeOverflow);
    await page.goto(ORIGIN+'/ru/',{waitUntil:'networkidle'});
    assert.equal(await page.locator('html').getAttribute('lang'),'ru');
    await page.goto(ORIGIN+'/studio/',{waitUntil:'networkidle'});
    assert.equal(await page.locator('.studio-workspace').count(),0,'anonymous must not enter editor');

    await page.goto(ORIGIN+'/login/?return_to=%2Fstudio%2F');
    await page.locator('input[name="email"]').fill(LOGIN);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/studio/',{timeout:12000});
    await page.locator('.studio-workspace').waitFor({timeout:12000});
    assert.equal((await page.context().cookies()).some(c=>c.name==='__Host-knaba-session'&&c.secure&&c.httpOnly),true);
    const frame=page.frameLocator('.studio-preview-wrap iframe');
    await frame.locator(pSelector).click();
    await page.locator('.studio-inspector textarea').first().fill('Saubere Bauprojekte & Büros');
    await page.locator('.studio-section').nth(1).locator('input').first().fill('KNABA Studio & Bauhelfer Berlin');
    await page.locator('.studio-save').click();
    await page.waitForTimeout(250);
    await page.locator('.studio-publish input[placeholder="PUBLISH"]').fill('PUBLISH');
    await page.locator('.studio-publish-button').click();
    await page.waitForTimeout(350);
    const publicResponse=await page.evaluate(async()=>{
      const response=await fetch('/',{credentials:'same-origin',cache:'no-store'});
      return {status:response.status,html:await response.text()};
    });
    assert.equal(publicResponse.status,200);
    const html=publicResponse.html;
    assert.ok(html.includes('Saubere Bauprojekte &amp; Büros'),'server-rendered published body text');
    assert.ok(html.includes('<title>KNABA Studio &amp; Bauhelfer Berlin</title>'),'server-rendered SEO title');
    const privateStatus=await page.evaluate(async()=>{
      const result=await fetch('/api/studio/page?page=%2F',{credentials:'same-origin'});
      return result.status;
    });
    assert.equal(privateStatus,200);

    await page.goto(ORIGIN+'/studio/',{waitUntil:'networkidle'});
    await page.locator('.studio-workspace').waitFor();
    await frame.locator(aSelector).click();
    const kind=await page.locator('.studio-inspector .studio-section').first().locator('select').inputValue();
    assert.equal(kind,'href','Icon-bearing link selects href, not destructive text.');
    assert.equal(errors.length,0,'Browser JS errors: '+errors.join('; '));
    console.log(JSON.stringify({browser:'Chromium',source:'isolated VPS candidate',viewport:'390x844',mobileOverflowPx:homeOverflow,
      authenticatedOwner:true,sessionCookieSecure:true,serverRenderedBody:true,serverRenderedSeo:true,
      iconLinkEditable:true,clientErrors:errors.length,liveDataTouched:false,externalNetwork:'none'}));
    await context.close();
  }finally{
    if(browser)await browser.close().catch(()=>{});
    if(proxy)await new Promise(resolve=>proxy.close(resolve));
    if(app)await app.close().catch(()=>{});
    rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
