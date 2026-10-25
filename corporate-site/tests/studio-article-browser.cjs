/**
 * Synthetic HTTPS/Chromium smoke test for KNABA Studio articles.
 * Run only with the preinstalled Playwright browser image and ephemeral TLS certificate.
 * Never mounts or mutates live VPS data, production credentials, or customer accounts.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {createServer:tlsServer}=require('node:https');
const {request:upstreamRequest}=require('node:http');
const {readFileSync,mkdtempSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {pathToFileURL}=require('node:url');
const {once}=require('node:events');
const ROOT=process.env.KNABA_TEST_ROOT||'/repo';
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
  const [{openLocalDatabase},{createOwner},{createKnabaVpsServer}]=await Promise.all([
   import(src('vps/database.mjs')),import(src('vps/auth.mjs')),import(src('vps/server.mjs'))
  ]);
  const dbPath=join(temp,'synthetic.sqlite');
  const fresh=openLocalDatabase(dbPath);
  createOwner(fresh.db,EMAIL,PASSWORD);fresh.db.close();
  app=await createKnabaVpsServer({
   dbPath,staticRoot:ROOT+'/dist/client',workerPath:src('dist/server/index.js'),
   ownerEmail:EMAIL,origin:ORIGIN,port:19567,host:'127.0.0.1',localTest:false
  });
  proxy=tlsServer({key:readFileSync('/cert/key.pem'),cert:readFileSync('/cert/cert.pem')},(req,res)=>{
    const headers={...req.headers,host:'knaba.test:19443','x-forwarded-proto':'https'};
    const upstream=upstreamRequest({hostname:'127.0.0.1',port:19567,path:req.url,method:req.method,headers,timeout:13000},reply=>{
     res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
    });
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('upstream failed');});
    req.pipe(upstream);
  });
  proxy.listen(19443,'127.0.0.1');await once(proxy,'listening');
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--host-resolver-rules=MAP knaba.test 127.0.0.1']});
  const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
  const page=await ctx.newPage();
  const jsErrors=[];
  page.on('pageerror',e=>jsErrors.push(e.message));
  await page.goto(ORIGIN+'/studio/',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(550);
  assert.equal(await page.locator('.studio-article-panel').count(),0,'Studio must not be available to anonymous visitors');
  await page.goto(ORIGIN+'/login/?return_to=%2Fstudio%2F',{waitUntil:'domcontentloaded'});
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/studio/',{timeout:15000});
  await page.locator('.studio-article-panel').waitFor({timeout:15000});
  const button=page.locator('.studio-article-panel > details > summary');
  await button.click();
  const panel=page.locator('.studio-article-panel');
  await panel.locator('input[placeholder="baureinigung-planung"]').fill('baureinigung-planung');
  await panel.getByRole('button',{name:'Open new page'}).click();
  await panel.locator('.studio-article-path').waitFor({timeout:10000});
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
  await panel.locator('.studio-article-actions input[placeholder="PUBLISH"]').fill('PUBLISH');
  await panel.getByRole('button',{name:'Publish',exact:true}).click();
  await panel.getByText('Published version saved.').waitFor({timeout:10000});
  const pub=await page.evaluate(async(p)=>{
    const html=await (await fetch(p,{cache:'no-store'})).text();
    return {hasTitle:html.includes('Baureinigung in Berlin strukturiert planen'),html};
  },PATH);
  assert.ok(pub.hasTitle,'Published page must be SSR-visible');
  assert.ok(pub.html.includes('"@type":"Article"'),'Article JSON-LD must exist');
  // Synthetic HTTPS host deliberately differs from built KNABA canonical origin.
  // The live-host exact sitemap behavior is asserted in vps/article.test.mjs.
  await panel.locator('.studio-article-unpublish input[placeholder="UNPUBLISH"]').fill('UNPUBLISH');
  await panel.getByRole('button',{name:'Unpublish article'}).click();
  await panel.getByText('Article unpublished.').waitFor({timeout:10000});
  const post=await page.evaluate(async(p)=>({
    code:(await fetch(p,{cache:'no-store'})).status,
    xml:await (await fetch('/sitemap.xml',{cache:'no-store'})).text()
  }),PATH);
  assert.equal(post.code,404,'Unpublished page must return 404');
  assert.ok(!post.xml.includes('<loc>'+ORIGIN+PATH+'</loc>'),'Unpublished page removed from sitemap');
  // This release's critical regression: history must immediately offer the preserved "unpublished" revision.
  const history=panel.locator('.studio-article-history li');
  await page.waitForTimeout(450);
  assert.ok((await history.allTextContents()).some(v=>v.includes('unpublished')),'Unpublished revision must be restorable without reload');
  await history.filter({hasText:'unpublished'}).getByRole('button',{name:'Restore as draft'}).click();
  await panel.getByText('Version restored to draft.').waitFor({timeout:10000});
  const notRepublished=await page.evaluate(async(p)=>(await fetch(p,{cache:'no-store'})).status,PATH);
  assert.equal(notRepublished,404);
  for(const width of [390,1280]){
    await page.setViewportSize({width,height:844});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,'Studio horizontal overflow '+overflow+' at '+width+' px');
  }
  assert.deepEqual(jsErrors,[],'Unexpected browser page errors');
  console.log('STUDIO_ARTICLE_BROWSER_PASS anonymous guard, TLS login, draft, publish, sitemap, unpublish, restore, responsive 390/1280');
 }finally{
  await browser?.close().catch(()=>{});
  if(proxy) await new Promise(resolve=>proxy.close(resolve));
  await app?.close().catch(()=>{});
  rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
