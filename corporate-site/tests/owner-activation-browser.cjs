const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {createServer}=require('node:https');
const {request}=require('node:http');
const {readFileSync,mkdtempSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {pathToFileURL}=require('node:url');
const {once}=require('node:events');
const ROOT=process.env.KNABA_TEST_ROOT||'/repo';
const origin='https://knaba.test:39443';
const user='owner@example.test';
const passphrase='only-a-synthetic-test-passphrase-2026';
const folder=mkdtempSync(join(tmpdir(),'knaba-owner-browser-'));
const source=path=>import(pathToFileURL(ROOT+'/'+path).href);
(async()=>{
  let app,proxy,browser;
  try{
    const {openLocalDatabase}=await source('vps/database.mjs');
    const {issueOwnerInvite}=await source('vps/owner-invite.mjs');
    const {createKnabaVpsServer}=await source('vps/server.mjs');
    const database=join(folder,'site.sqlite');
    const setup=openLocalDatabase(database);
    const invite=issueOwnerInvite(setup.db,user);
    setup.db.close();
    app=await createKnabaVpsServer({
      dbPath:database,ownerEmail:user,origin,localTest:false,
      staticRoot:ROOT+'/dist/client',workerPath:pathToFileURL(ROOT+'/dist/server/index.js').href,
      port:39567,host:'127.0.0.1'
    });
    proxy=createServer({
      key:readFileSync('/cert/key.pem'),cert:readFileSync('/cert/cert.pem')
    },(req,res)=>{
      const up=request({
        hostname:'127.0.0.1',port:39567,path:req.url,method:req.method,
        headers:{...req.headers,host:'knaba.test:39443','x-forwarded-proto':'https'}
      },reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
      up.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
      req.pipe(up);
    });
    proxy.listen(39443,'127.0.0.1');await once(proxy,'listening');
    browser=await chromium.launch({headless:true,executablePath:'/ms-playwright/chromium-1247/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--host-resolver-rules=MAP knaba.test 127.0.0.1']});
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
    const page=await context.newPage();
    const failures=[];
    page.on('pageerror',e=>failures.push(e.message));
    await page.goto(origin+'/activate-owner/#token='+invite.token,{waitUntil:'domcontentloaded'});
    assert.equal(new URL(page.url()).hash,'','secret fragment must disappear');
    assert.equal(await page.locator('input[name=token]').inputValue(),invite.token);
    assert.equal(await page.locator('input[name=token]').isVisible(),false);
    await page.locator('input[name=password]').fill(passphrase);
    await page.locator('input[name=password_confirm]').fill(passphrase);
    await page.locator('input[name=attested]').check();
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/login/**',{timeout:10000});
    const readiness=await page.evaluate(async()=>{const response=await fetch('/readyz');return response.status;});
    assert.equal(readiness,200);
    await page.locator('input[name=email]').fill(user);
    await page.locator('input[name=password]').fill(passphrase);
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/studio/',{timeout:10000});
    await page.locator('.studio-workspace').waitFor({timeout:12000});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,'Studio 390px overflow '+overflow);
    assert.equal(failures.length,0,'Unexpected browser errors');
    console.log(JSON.stringify({activation:'PASS',owner:true,ownerPasswordSetLocally:true,
      studioOpened:true,mobileWidth:390,overflow,errors:0,liveDataTouched:false}));
    await context.close();
  }finally{
    if(browser)await browser.close().catch(()=>{});
    if(proxy)await new Promise(resolve=>proxy.close(resolve));
    if(app)await app.close().catch(()=>{});
    rmSync(folder,{recursive:true,force:true});
  }
})().catch(error=>{console.error('OWNER_BROWSER_FAILED '+(error.stack||error));process.exitCode=1;});
