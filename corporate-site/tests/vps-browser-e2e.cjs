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
    browser=await chromium.launch({headless:true,executablePath:process.env.KNABA_CHROME_PATH||chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--host-resolver-rules=MAP knaba.test 127.0.0.1']});
    // Test the real first-party AJAX login against synthetic HTTPS and disposable
    // SQLite. An invalid password cannot set a cookie; a valid password updates
    // the portal in the same browser document without an HTML navigation.
    const inlineContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
    const inlinePage=await inlineContext.newPage();
    let inlineNavigations=0;
    inlinePage.on('framenavigated',frame=>{if(frame===inlinePage.mainFrame())inlineNavigations++});
    await inlinePage.goto(ORIGIN+'/konto/',{waitUntil:'domcontentloaded'});
    const inline=inlinePage.locator('.portal-inline-login');
    await inline.waitFor({timeout:16000});
    assert.equal(await inline.locator('input[name="email"]').count(),1,'Visible inline email field');
    assert.equal(await inline.locator('input[name="password"]').count(),1,'Visible password input');
    // Counted framenavigated events include same-document Astro client-routing.
    // Preserve an actual window-scoped marker instead: full reload drops it.
    const inlineDocumentMarker='synthetic-keep-document-20261025';
    await inlinePage.evaluate(value=>window.__knabaSyntheticDocumentMark=value,inlineDocumentMarker);
    const navigationsAtLogin=inlineNavigations;
    await inline.locator('input[name="email"]').fill(LOGIN);
    await inline.locator('input[name="password"]').fill('synthetic-invalid-password');
    await inline.locator('button[type="submit"]').click();
    await inline.locator('[role="alert"]').waitFor({timeout:12000});
    assert.equal((await inlineContext.cookies()).some(c=>c.name==='__Host-knaba-session'),false,'Bad password must not authenticate');
    await inline.locator('input[name="password"]').fill(PASSWORD);
    await inline.locator('button[type="submit"]').click();
    await inlinePage.locator('.portal-shell').waitFor({state:'visible',timeout:18000});
    // The verified badge is deliberately display:none on <=520px; it still
    // exists after a real authenticated session, but is not a visible-state gate.
    assert.equal(await inlinePage.locator('.portal-verified').count(),1);
    const privateSession=await inlinePage.evaluate(async()=>{
      const r=await fetch('/api/portal/session',{credentials:'same-origin',cache:'no-store'});
      const json=await r.json();
      return {status:r.status,role:json.role};
    });
    assert.equal(privateSession.status,200);
    assert.equal(privateSession.role,'owner');
    assert.equal(new URL(inlinePage.url()).pathname,'/konto/','AJAX login stays on the portal URL');
    const documentPreserved=await inlinePage.evaluate(value=>window.__knabaSyntheticDocumentMark===value,inlineDocumentMarker);
    assert.equal(documentPreserved,true,'AJAX login must preserve the current HTML document');
    console.log('INLINE_LOGIN_NAV_EVENTS',inlineNavigations-navigationsAtLogin,'(same-document events allowed)');
    assert.ok((await inlineContext.cookies()).some(c=>c.name==='__Host-knaba-session'&&c.secure&&c.httpOnly),'Host-only session cookie required');
    console.log('INLINE_LOGIN_BROWSER_PASS invalid+valid_same_window_secure_session');
    await inlineContext.close();

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
    await page.goto(ORIGIN+'/studio/',{waitUntil:'networkidle'});
    assert.equal(await page.locator('.studio-workspace').count(),0,'anonymous must not enter editor');
    const art=await page.evaluate(async()=>{
      const response=await fetch('/studio-media.json',{cache:'no-store'});
      return {status:response.status,body:await response.json()};
    });
    assert.equal(art.status,200,'bundled public media catalog loads');
    assert.ok(art.body.assets.includes('/illustrations/baureinigung.svg'),'Bundled image selectable');


    await page.goto(ORIGIN+'/login/?return_to=%2Fstudio%2F');
    await page.locator('input[name="email"]').fill(LOGIN);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/studio/',{timeout:12000});
    await page.locator('.studio-workspace').waitFor({timeout:12000});
    assert.equal((await page.context().cookies()).some(c=>c.name==='__Host-knaba-session'&&c.secure&&c.httpOnly),true);
    const frame=page.frameLocator('.studio-preview-wrap iframe');
    async function waitLead(value){
      await page.waitForFunction(expected=>{
        const iframe=document.querySelector('.studio-preview-wrap iframe');
        return iframe?.contentDocument?.querySelector('.bau-lead')?.textContent===expected;
      },value,{timeout:9000});
    }

    const originalText=await frame.locator(pSelector).innerText();
    await frame.locator(pSelector).click();
    await page.locator('.studio-inspector textarea').first().fill('Temporary unsaved live text');
    await waitLead('Temporary unsaved live text');
    assert.equal(await frame.locator(pSelector).innerText(),'Temporary unsaved live text');
    await page.locator('.studio-toolbar button[aria-label="Undo"]').click();
    await waitLead(originalText);
    assert.equal(await frame.locator(pSelector).innerText(),originalText,'visual Undo restores original text');
    await frame.locator(pSelector).click();
    await page.locator('.studio-inspector textarea').first().fill('Saubere Bauprojekte & Bauhelfer');
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
    assert.ok(html.includes('Saubere Bauprojekte &amp; Bauhelfer'),'server-rendered published body text');
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
    await page.locator('.studio-mode-toggle button').nth(1).click();
    const manual=page.locator('#studio-json-editor');
    await manual.fill(JSON.stringify([
      {selector:'#main > section:nth-of-type(1)',kind:'background',value:'#213344'},
      {selector:pSelector,kind:'text',value:'Manual visual site content'}
    ],null,2));
    await page.locator('.studio-manual-actions .studio-btn').click();
    await waitLead('Manual visual site content');
    assert.equal(await frame.locator(pSelector).innerText(),'Manual visual site content');
    assert.equal(await frame.locator('main#main section').first().evaluate(el=>el.style.backgroundColor),'rgb(33, 51, 68)');
    await manual.fill('invalid-json');
    await page.locator('.studio-manual-actions .studio-btn').click();
    assert.equal(await frame.locator(pSelector).innerText(),'Manual visual site content','Invalid JSON never updates preview');
    await page.locator('.studio-manual-actions .studio-minor').click();
    await page.locator('.studio-save').click();
    await page.locator('.studio-publish input[placeholder="PUBLISH"]').fill('PUBLISH');
    await page.locator('.studio-publish-button').click();
    await page.waitForTimeout(350);
    const publishedDesign=await page.evaluate(async()=>await (await fetch('/',{cache:'no-store'})).text());
    assert.match(publishedDesign,/Manual visual site content/);
    assert.match(publishedDesign,/background-color:#213344/);
    const mobileStudioOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(mobileStudioOverflow<=1,'Studio has 390px viewport overflow '+mobileStudioOverflow);
    await page.setViewportSize({width:320,height:700});
    const narrowOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(narrowOverflow<=1,'Studio 320px horizontal overflow '+narrowOverflow);
    await page.setViewportSize({width:768,height:1024});
    const tabletOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(tabletOverflow<=1,'Studio 768px horizontal overflow '+tabletOverflow);

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
