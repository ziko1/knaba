/**
 * Synthetic HTTPS/Chromium smoke test for KNABA Studio articles.
 * Run only with the preinstalled Playwright browser image and ephemeral TLS certificate.
 * Never mounts or mutates live VPS data, production credentials, or customer accounts.
 */
const {chromium}=require(process.env.KNABA_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {createServer:tlsServer}=require('node:https');
const {request:upstreamRequest}=require('node:http');
const {readFileSync,mkdtempSync,rmSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const {pathToFileURL}=require('node:url');
const {once}=require('node:events');
const {execFileSync}=require('node:child_process');
const ROOT=process.env.KNABA_TEST_ROOT||resolve(__dirname,'..');
const skippedBrowsers=new Set((process.env.KNABA_BROWSER_SKIP||'').split(/[,\s]+/).filter(Boolean));
const blockedBrowser=(message)=>Object.assign(new Error(message),{code:'KNABA_BROWSER_BLOCKED'});
const unavailableBrowser=/Executable doesn't exist|No usable sandbox|Chromium sandboxing failed|Running as root without|Failed to move to new namespace|Operation not permitted|error while loading shared libraries|ERR_BLOCKED_BY_ADMINISTRATOR/i;
const ORIGIN='https://knaba.test:19443';
const EMAIL='owner@example.test';
const PASSWORD='synthetic-only-browser-test-2026';
const PATH='/wissen/baureinigung-planung/';
const ARTICLE={
 title:'Baureinigung in Berlin strukturiert planen',
 description:'Ein sorgfältig überprüfter Ratgeber zur Abstimmung der Bauphasen, Reinigungsschritte und Übergabe eines Bauprojekts in Berlin.',
 body:'Bauleitung und Reinigungsteam vereinbaren die Reihenfolge der Bauarbeiten und der Reinigung, bevor der Einsatz beginnt. Für die Vorbereitung werden Zugänge, Oberflächen und verfügbare Zeitfenster gemeinsam geprüft.\n\n## Vorbereitung\nVor Beginn werden sensible Bereiche geschützt. Welche Leistungen erforderlich sind, richtet sich nach dem jeweiligen Projekt und den vereinbarten Bedingungen. Es werden keine pauschalen Termine, Preise oder Genehmigungen zugesagt.'
};
const temp=mkdtempSync(join(tmpdir(),'knaba-article-browser-'));
const src=(p)=>pathToFileURL(ROOT+'/'+p).href;
(async()=>{
 let app,browser,proxy;
 try {
  if(skippedBrowsers.has('chromium'))throw blockedBrowser('Chromium was already blocked or explicitly skipped; this synthetic HTTPS harness requires an available authorized Chromium environment.');
  const [{openLocalDatabase},{createOwner},{createKnabaVpsServer}]=await Promise.all([
   import(src('vps/database.mjs')),import(src('vps/auth.mjs')),import(src('vps/server.mjs'))
  ]);
  const dbPath=join(temp,'synthetic.sqlite');
  const tlsDirectory=process.env.KNABA_ARTICLE_QA_TLS_DIR||temp;
  if(!process.env.KNABA_ARTICLE_QA_TLS_DIR){
   execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
    '-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),
    '-subj','/CN=knaba.test','-addext','subjectAltName=DNS:knaba.test'],{stdio:'ignore'});
  }
  const fresh=openLocalDatabase(dbPath,{allowMigrations:true});
  createOwner(fresh.db,EMAIL,PASSWORD);fresh.db.close();
  app=await createKnabaVpsServer({
   dbPath,staticRoot:ROOT+'/dist/client',workerPath:src('dist/server/index.js'),
   ownerEmail:EMAIL,origin:ORIGIN,port:19567,host:'127.0.0.1',localTest:false
  });
  proxy=tlsServer({key:readFileSync(join(tlsDirectory,'key.pem')),cert:readFileSync(join(tlsDirectory,'cert.pem'))},(req,res)=>{
    const headers={...req.headers,host:'knaba.test:19443','x-forwarded-proto':'https'};
    const upstream=upstreamRequest({hostname:'127.0.0.1',port:19567,path:req.url,method:req.method,headers,timeout:13000},reply=>{
     res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
    });
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('upstream failed');});
    req.pipe(upstream);
  });
  proxy.listen(19443,'127.0.0.1');await once(proxy,'listening');
  try{
   browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.KNABA_BROWSER_CHROME_PATH||chromium.executablePath(),args:['--host-resolver-rules=MAP knaba.test 127.0.0.1']});
  }catch(error){
   if(unavailableBrowser.test(String(error)))throw blockedBrowser(String(error));
   throw error;
  }
  const ctx=await browser.newContext({ignoreHTTPSErrors:true,locale:'en-US',viewport:{width:390,height:844}});
  const page=await ctx.newPage();
  const jsErrors=[];
  page.on('pageerror',e=>jsErrors.push(e.message));
  await page.goto(ORIGIN+'/studio/',{waitUntil:'domcontentloaded'});
  await page.locator('.studio-gate[role="alert"]').waitFor({timeout:15000});
  assert.equal(await page.locator('.studio-article-panel').count(),0,'Studio must not be available to anonymous visitors');
  assert.equal(await page.evaluate(async()=>(await fetch('/api/studio/articles',{cache:'no-store'})).status),401);
  const destination='/admin/?lang=en&view=studio';
  await page.goto(ORIGIN+'/login/?lang=en&return_to='+encodeURIComponent(destination),{waitUntil:'domcontentloaded'});
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await Promise.all([
   page.waitForURL(url=>url.origin===ORIGIN&&url.pathname==='/admin/'&&url.searchParams.get('view')==='studio',{timeout:15000}),
   page.locator('button[type="submit"]').click()
  ]);
  await page.locator('.studio-article-panel').waitFor({timeout:15000});
  await page.locator('#studio-language').selectOption('en');
  const button=page.locator('.studio-article-panel > details > summary');
  await button.focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('.studio-article-panel > details').evaluate(element=>element.open),true,'Article editor opens from the keyboard');
  const panel=page.locator('.studio-article-panel');
  await panel.locator('.studio-article-controls select').first().selectOption('de');
  await panel.locator('input[placeholder="baureinigung-planung"]').fill('baureinigung-planung');
  await panel.getByRole('button',{name:'Open new page'}).click();
  await panel.locator('.studio-article-path').waitFor({timeout:10000});
  assert.ok((await panel.locator('.studio-article-path').textContent()).includes(PATH),'The article language is independent of the editor UI language');
  await panel.locator('.studio-article-form input[maxlength="100"]').fill(ARTICLE.title);
  await panel.locator('.studio-article-form textarea[maxlength="250"]').fill(ARTICLE.description);
  await panel.locator('.studio-article-form textarea[maxlength="6000"]').fill(ARTICLE.body);
  assert.equal(await panel.locator('.studio-article-preview h3').textContent(),ARTICLE.title);
  await panel.getByRole('button',{name:'Save draft'}).click();
  await panel.getByText('Draft saved.').waitFor({timeout:10000});
  const pre=await page.evaluate(async(p)=>{
    const r=await fetch(p,{cache:'no-store'});return {code:r.status,robots:r.headers.get('x-robots-tag')};
  },PATH);
  assert.equal(pre.code,404,'No draft leak');
  assert.equal(await panel.getByRole('button',{name:'Publish',exact:true}).isDisabled(),true,'Publication requires explicit confirmation');
  await panel.locator('.studio-article-actions input[placeholder="PUBLISH"]').fill('PUBLISH');
  await panel.getByRole('button',{name:'Publish',exact:true}).click();
  await panel.getByText('Published version saved.').waitFor({timeout:10000});
  const pub=await page.evaluate(async(p)=>{
    const html=await (await fetch(p,{cache:'no-store'})).text();
    return {hasTitle:html.includes('Baureinigung in Berlin strukturiert planen'),html};
  },PATH);
  assert.ok(pub.hasTitle,'Published page must be SSR-visible');
  assert.ok(pub.html.includes('"@type":"Article"'),'Article JSON-LD must exist');
  const canonical=/<link rel="canonical" href="([^"]+)"/.exec(pub.html)?.[1];
  assert.ok(canonical?.endsWith(PATH),'The article keeps the built canonical origin');
  const visitorContext=await browser.newContext({ignoreHTTPSErrors:true,locale:'en-US',viewport:{width:390,height:844}});
  const visitor=await visitorContext.newPage();
  visitor.on('pageerror',e=>jsErrors.push(e.message));
  const publicResponse=await visitor.goto(ORIGIN+PATH,{waitUntil:'domcontentloaded'});
  assert.equal(publicResponse.status(),200,'A fresh anonymous visitor can read the published article');
  assert.match(publicResponse.headers()['x-robots-tag']||'',/noindex/,'Synthetic publication must keep the crawler gate');
  assert.equal(await visitor.locator('h1').textContent(),ARTICLE.title);
  assert.equal(await visitor.locator('a[href^="tel:"]').count(),1,'Published HTML retains one phone link');
  assert.equal(await visitor.locator('.seo-article-links').evaluate(element=>getComputedStyle(element).display),'flex','Dynamic article CSS must survive the build');
  for(const width of [320,390,768,1440]){
   await visitor.setViewportSize({width,height:844});
   assert.ok(await visitor.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Published article overflows at '+width+' px');
  }
  await visitorContext.close();
  // Synthetic HTTPS host deliberately differs from built KNABA canonical origin.
  // The live-host exact sitemap behavior is asserted in vps/article.test.mjs.
  assert.equal(await panel.getByRole('button',{name:'Unpublish article'}).isDisabled(),true,'Unpublishing also requires explicit confirmation');
  await panel.locator('.studio-article-unpublish input[placeholder="UNPUBLISH"]').fill('UNPUBLISH');
  await panel.getByRole('button',{name:'Unpublish article'}).click();
  await panel.getByText('Article unpublished.').waitFor({timeout:10000});
  const post=await page.evaluate(async(p)=>({
    code:(await fetch(p,{cache:'no-store'})).status,
    xml:await (await fetch('/sitemap.xml',{cache:'no-store'})).text()
  }),PATH);
  assert.equal(post.code,404,'Unpublished page must return 404');
  assert.ok(!post.xml.includes('<loc>'+canonical+'</loc>'),'Unpublished canonical URL must not appear in sitemap');
  // This release's critical regression: history must immediately offer the preserved "unpublished" revision.
  const history=panel.locator('.studio-article-history li');
  await history.filter({hasText:'unpublished'}).first().waitFor({timeout:10000});
  assert.ok((await history.allTextContents()).some(v=>v.includes('unpublished')),'Unpublished revision must be restorable without reload');
  await history.filter({hasText:'unpublished'}).getByRole('button',{name:'Restore as draft'}).click();
  await panel.getByText('Version restored to draft.').waitFor({timeout:10000});
  const notRepublished=await page.evaluate(async(p)=>(await fetch(p,{cache:'no-store'})).status,PATH);
  assert.equal(notRepublished,404);
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:844});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,'Studio horizontal overflow '+overflow+' at '+width+' px');
  }
  assert.deepEqual(jsErrors,[],'Unexpected browser page errors');
  console.log('STUDIO_ARTICLE_BROWSER_PASS anonymous guard, current owner destination, keyboard entry, explicit draft/publish/unpublish, anonymous SSR, crawler policy, retained article CSS, immediate history/restore, responsive 320/390/768/1440');
 }finally{
  await browser?.close().catch(()=>{});
  if(proxy) await new Promise(resolve=>proxy.close(resolve));
  await app?.close().catch(()=>{});
  rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{
 const blocked=error.code==='KNABA_BROWSER_BLOCKED'||/ERR_BLOCKED_BY_ADMINISTRATOR/.test(String(error));
 console.error(blocked?'STUDIO_ARTICLE_BROWSER_BLOCKED':'STUDIO_ARTICLE_BROWSER_FAIL',error);
 process.exitCode=blocked?2:1;
});
