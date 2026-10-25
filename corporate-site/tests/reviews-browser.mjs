import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer as createHttpsServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {createKnabaVpsServer} from '../vps/server.mjs';
import {createOwner} from '../vps/auth.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=resolve(process.env.EVIDENCE_DIR||'../../evidence');
const port=Number(process.env.REVIEWS_BROWSER_PORT||18786),base='https://127.0.0.1:'+port;
const report={source:process.env.SOURCE_SHA||'working tree',time:new Date().toISOString(),mode:'Real compiled worker + disposable SQLite; synthetic owner and feedback; local CAPTCHA disabled; HTTPS proxy adds Secure to local-test __Host cookie',checks:[],failures:[],pageErrors:[],externalRequests:[],posts:0};
const dir=await mkdtemp(join(tmpdir(),'knaba-review-browser-'));
await mkdir(out,{recursive:true});
const key=join(dir,'key.pem'),cert=join(dir,'cert.pem');
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
const app=await createKnabaVpsServer({dbPath:join(dir,'test.sqlite'),staticRoot:resolve('dist/client'),workerPath:new URL('../dist/server/index.js',import.meta.url).href,ownerEmail:'review-owner@example.test',origin:base,localTest:true,host:'127.0.0.1',port:0});
createOwner(app.db,'review-owner@example.test','synthetic-review-browser-password-2026');
const proxy=createHttpsServer({key:await readFile(key),cert:await readFile(cert)},(req,res)=>{
  const upstream=httpRequest({hostname:'127.0.0.1',port:app.port,path:req.url,method:req.method,headers:req.headers},reply=>{
    const headers={...reply.headers};
    if(headers['set-cookie'])headers['set-cookie']=headers['set-cookie'].map(cookie=>cookie+'; Secure');
    res.writeHead(reply.statusCode,headers);reply.pipe(res);
  });upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
});
await new Promise((resolve,reject)=>{proxy.listen(port,'127.0.0.1',resolve);proxy.once('error',reject);});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/knaba-browsers/chromium_headless_shell-1161/chrome-linux/headless_shell',args:['--no-sandbox']});
const check=async(label,run)=>{try{await run();report.checks.push(label);}catch(error){report.failures.push({label,error:error.message});}};
let context;
try{
  context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:320,height:900},reducedMotion:'reduce',locale:'en-GB'});
  await context.route('**/*',route=>{
    if(!route.request().url().startsWith(base)){report.externalRequests.push(route.request().url());return route.abort();}
    return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('request',request=>{if(request.method()==='POST')report.posts++;});
  const openHome=async(locale='de')=>{
    await page.goto(base+(locale==='de'?'/':'/'+locale+'/'),{waitUntil:'networkidle'});
    await page.locator('#reviews').scrollIntoViewIfNeeded();
    await page.locator('.reviews-empty').waitFor();
  };
  const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page has horizontal overflow');
  for(const locale of ['de','en','uk','ru']){
    await check(locale+' original partner logos on homepage and company page',async()=>{
      await page.setViewportSize({width:320,height:900});
      for(const suffix of ['/','/unternehmen/']){
        await page.goto(base+(locale==='de'?'':'/'+locale)+suffix,{waitUntil:'networkidle'});
        const partners=page.locator('.knaba-partners');await partners.scrollIntoViewIfNeeded();
        assert.equal(await partners.locator('img').count(),5);
        for(const img of await partners.locator('img').all()){
          await img.scrollIntoViewIfNeeded();
          await page.waitForFunction(el=>el.complete&&el.naturalWidth>0,await img.elementHandle());
          assert.ok((await img.getAttribute('alt')).trim());
        }
        assert.equal(await partners.locator('a').getAttribute('href'),'https://knaba.de/');
        await overflow();
      }
    });
    await check(locale+' empty state / collapsed form / no CAPTCHA script',async()=>{
      await page.setViewportSize({width:320,height:900});await openHome(locale);
      assert.equal(await page.locator('.review-card').count(),0);
      assert.equal(await page.locator('#review-form-panel').isVisible(),false);
      assert.equal(await page.locator('script[data-knaba-turnstile]').count(),0);
      await overflow();
    });
    await check(locale+' 320px form and 200% text',async()=>{
      await page.locator('.reviews-action button').focus();await page.keyboard.press('Enter');
      await page.locator('[name="displayName"]').waitFor({state:'visible'});
      assert.equal(await page.locator('[name="displayName"]').evaluate(el=>document.activeElement===el),true);
      await page.locator('.reviews-form button[type="submit"]:not([disabled])').waitFor();
      await overflow();
      await page.addStyleTag({content:'html{font-size:200%!important}'});await overflow();
      const fields=await page.locator('.reviews-form :is(input,select,textarea):not([name="website"])').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().right<=innerWidth+1));
      assert.ok(fields,'form field outside viewport');
    });
    for(const width of [390,1440])await check(locale+' '+width+'px layout',async()=>{
      await page.setViewportSize({width,height:1000});await openHome(locale);await page.locator('.reviews-action button').click();await overflow();
      const skip=await page.locator('.skip-link').evaluate(el=>({focused:document.activeElement===el,bottom:el.getBoundingClientRect().bottom,transform:getComputedStyle(el).transform}));
      assert.ok(skip.focused||skip.bottom<=0,'unfocused skip link overlaps content: '+JSON.stringify(skip));
      if(locale==='uk'){
        await page.locator('#reviews').screenshot({path:join(out,'reviews-uk-'+width+'.png')});
        await page.locator('.knaba-partners').scrollIntoViewIfNeeded();
        await page.screenshot({path:join(out,'partners-uk-'+width+'.png')});
      }
    });
  }
  await check('real submission survives uncertain network result without duplicate',async()=>{
    await page.setViewportSize({width:390,height:900});await openHome('en');await page.locator('.reviews-action button').click();
    await page.locator('[name="displayName"]').fill('Synthetic browser test');
    await page.locator('[name="email"]').fill('browser-review@example.test');
    await page.locator('[name="company"]').fill('Synthetic test company');
    await page.locator('[name="relationship"]').selectOption('partner');
    await page.locator('[name="text"]').fill('Synthetic test feedback only. This record exists in a disposable local test database.');
    await page.locator('[name="consent"]').check();
    let dropped=false;const keys=[];
    const drop=async route=>{
      if(route.request().method()!=='POST')return route.fallback();
      keys.push(route.request().headers()['idempotency-key']);
      if(!dropped){dropped=true;const response=await route.fetch();assert.equal(response.status(),201);return route.abort('failed');}
      return route.continue();
    };
    await page.route('**/api/reviews',drop);
    await page.locator('.reviews-form button[type="submit"]').click();await page.locator('.reviews-error').waitFor();
    assert.match(await page.locator('[name="text"]').inputValue(),/Synthetic test feedback/);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM public_reviews').get().n,1);
    await page.locator('.reviews-form button[type="submit"]').click();await page.locator('.reviews-success').waitFor();
    assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM public_reviews').get().n,1);
    assert.equal(app.db.prepare('SELECT status FROM public_reviews').get().status,'pending');
    assert.deepEqual(await (await context.request.get(base+'/api/reviews')).json(),{reviews:[],total:0});
    await page.unroute('**/api/reviews',drop);
  });
  await check('owner login / publish / public view / hide',async()=>{
    await page.goto(base+'/login/?return_to=/studio/');
    await page.locator('[name="email"]').fill('review-owner@example.test');
    await page.locator('[name="password"]').fill('synthetic-review-browser-password-2026');
    await page.locator('button[type="submit"]').click();await page.waitForURL(base+'/studio/');
    await page.locator('.reviews-moderation-card').waitFor();
    assert.match(await page.locator('.reviews-moderation-card').innerText(),/browser-review@example.test/);
    await page.locator('.reviews-moderation-card .reviews-button').click();
    await page.locator('.reviews-badge-published').waitFor();
    const published=await (await context.request.get(base+'/api/reviews')).json();
    assert.equal(published.total,1);assert.equal('email' in published.reviews[0],false);assert.equal('consentAt' in published.reviews[0],false);
    await page.goto(base+'/en/');await page.locator('#reviews').scrollIntoViewIfNeeded();await page.locator('.review-card').waitFor();
    assert.match(await page.locator('.review-card').innerText(),/Synthetic browser test/);
    assert.equal(await page.locator('.review-card').innerText().then(text=>text.includes('browser-review@example.test')),false);
    await page.goto(base+'/studio/');await page.locator('.reviews-badge-published').waitFor();
    await page.locator('.reviews-moderation-card .reviews-link').click();await page.locator('.reviews-badge-hidden').waitFor();
    assert.deepEqual(await (await context.request.get(base+'/api/reviews')).json(),{reviews:[],total:0});
    await page.locator('.reviews-moderation-filter select').selectOption('pending');
    await page.waitForFunction(()=>document.querySelectorAll('.reviews-moderation-card').length===0);
    await page.locator('.reviews-moderation-filter select').selectOption('hidden');await page.locator('.reviews-badge-hidden').waitFor();
    assert.equal(app.db.prepare('SELECT status FROM public_reviews').get().status,'hidden');
  });
  await check('public load error and recovery',async()=>{
    const fail=route=>route.abort('failed');await page.route('**/api/reviews',fail);
    await page.goto(base+'/en/');await page.locator('#reviews').scrollIntoViewIfNeeded();await page.locator('.reviews-notice[role="alert"]').waitFor();
    await page.unroute('**/api/reviews',fail);await page.locator('.reviews-notice button').click();await page.locator('.reviews-empty').waitFor();
  });
  await check('no script errors or external requests',async()=>{assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.externalRequests,[]);});
}finally{
  await context?.close();await browser.close();await new Promise(resolve=>proxy.close(resolve));await app.close();
  await rm(dir,{recursive:true,force:true});
  await writeFile(join(out,'reviews-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({checks:report.checks.length,failures:report.failures,pageErrors:report.pageErrors,externalRequests:report.externalRequests}));
}
if(report.failures.length)process.exitCode=1;
