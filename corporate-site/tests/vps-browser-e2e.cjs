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
const pSelector='#main > section:nth-of-type(1) > div:nth-of-type(1) > p:nth-of-type(2)';
const aSelector='#main > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > a:nth-of-type(1)';
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
    assert.ok((await page.locator('img[src="/illustrations/baureinigung.svg"]').count())>=1);
    const homeOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(homeOverflow<=1,'Mobile homepage overflow '+homeOverflow);
    await page.goto(ORIGIN+'/ru/',{waitUntil:'networkidle'});
    assert.equal(await page.locator('html').getAttribute('lang'),'ru');

    // Four real mobile viewport checks using the production-built static pages.
    const mobileRoutes=['/planer/','/en/planer/','/uk/planer/','/ru/planer/'];
    const mobileWidths=[320,390,768];
    const checks=[];
    for(const width of mobileWidths){
      await page.setViewportSize({width,height:844});
      for(const route of mobileRoutes){
        await page.goto(ORIGIN+route,{waitUntil:'domcontentloaded'});
        assert.equal(await page.locator('input[name="anliegen"]').count(),8,'Every service selectable: '+route);
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
        assert.ok(overflow<=1,'Overflow '+overflow+'px at '+width+' '+route);
        checks.push({route,width,overflow});
      }
    }
    await page.setViewportSize({width:390,height:844});
    for(const locale of ['en','uk']){
      await page.goto(ORIGIN+'/'+locale+'/konto/',{waitUntil:'networkidle'});
      assert.equal(await page.locator('html').getAttribute('lang'),locale);
      assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);
      const signIn=page.locator('a[href*="/login/?return_to="]').first();
      await signIn.waitFor({timeout:12000});
      const returnUrl=new URL(await signIn.getAttribute('href'),ORIGIN);
      assert.equal(returnUrl.pathname,'/login/');
      assert.equal(returnUrl.searchParams.get('return_to'),'/'+locale+'/konto/');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      assert.ok(overflow<=1,'Private portal '+locale+' overflows '+overflow+'px');
    }
    await page.goto(ORIGIN+'/planer/',{waitUntil:'networkidle'});
    if(process.env.KNABA_QA_DIR){
      await page.screenshot({path:process.env.KNABA_QA_DIR+'/planner-390.png',fullPage:false});
    }
    await page.locator('input[name="anliegen"][value="kernbohrungen"]').check();
    assert.equal(await page.locator('input[name="anliegen"]:checked').inputValue(),'kernbohrungen');
    await page.locator('.construction-pick-form button[type="submit"]').click();
    await page.waitForURL('**/kontakt/?anliegen=kernbohrungen',{timeout:12000});
    await page.locator('#inquiry-service').waitFor({timeout:12000});
    await page.waitForFunction(()=>document.querySelector('#inquiry-service')?.value==='kernbohrungen');
    assert.equal(await page.locator('#inquiry-service').inputValue(),'kernbohrungen');
    assert.ok((await page.locator('.construction-contract-disclaimer').count())>=1,
      'Unconfirmed concrete drilling work requires visible contract disclaimer');
    const ruLink=await page.locator('a[data-language-switch][lang="ru"]').getAttribute('href');
    assert.ok(ruLink.includes('/ru/kontakt/?anliegen=kernbohrungen'),'Locale link preserves the safe offer slug');
    await page.locator('.wizard form button[type="submit"]').click();
    await page.locator('#inquiry-postcode').waitFor();
    assert.equal(await page.locator('#inquiry-object').inputValue(),'Baustelle');
    await page.locator('#inquiry-postcode').fill('10315');
    await page.locator('#inquiry-frequency').selectOption('Noch offen');
    await page.locator('.wizard form button[type="submit"]').click();
    await page.locator('#inquiry-name').waitFor();
    await page.locator('#inquiry-name').fill('Synthetic Browser QA');
    await page.locator('#inquiry-email').fill('browser-qa@example.invalid');
    await page.locator('#inquiry-message').fill('Beton Ø 120 mm, Leitungen und Statik vor Ausführung prüfen.');
    await page.locator('.wizard form button[type="submit"]').click();
    await page.locator('#inquiry-summary').waitFor();
    const summary=await page.locator('#inquiry-summary').inputValue();
    assert.ok(summary.includes('kernbohrungen')&&summary.includes('Beton Ø 120 mm'),'Selected offer must survive review');
    await page.locator('.privacy-check input[type="checkbox"]').check();
    await page.getByRole('button',{name:/Anfrage senden/}).click();
    await page.locator('.receipt-card').waitFor({timeout:15000});
    const lead=app.db.prepare("SELECT service,message,email FROM cleaning_requests WHERE email='browser-qa@example.invalid'").get();
    assert.equal(lead.service,'baureinigung');
    assert.match(lead.message,/kernbohrungen/);
    assert.match(lead.message,/Ø 120 mm/);

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
    await page.locator('.studio-inspector textarea').first().fill('Bauprojekte sauber & sicher zur Übergabe');
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
    assert.ok(html.includes('Bauprojekte sauber &amp; sicher zur Übergabe'),'server-rendered published body text');
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
      iconLinkEditable:true,clientErrors:errors.length,mobileChecks:checks.length,
      testedConstructionEnquiry:true,clientDataTouched:false,liveDataTouched:false,externalNetwork:'none'}));
    await context.close();
  }finally{
    if(browser)await browser.close().catch(()=>{});
    if(proxy)await new Promise(resolve=>proxy.close(resolve));
    if(app)await app.close().catch(()=>{});
    rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
