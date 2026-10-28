'use strict';
const assert = require('node:assert/strict');
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const projectRoot = process.env.KNABA_PROJECT_ROOT || '/workspace/scratch/4399223b73d0/knaba';
const { normalizeLoopbackOrigin, runBrowserGate } = require(join(projectRoot, 'corporate-site/tests/browser-policy-gate.cjs'));
const engines = require(process.env.KNABA_PLAYWRIGHT_MODULE);
const origin = normalizeLoopbackOrigin(process.env.KNABA_TEST_URL);
const checks = [];
const directory = process.env.KNABA_SCREENSHOT_DIR || '/workspace/scratch/4399223b73d0/knaba-qa/vivid-mobile-integration';
mkdirSync(directory, { recursive: true });
function luminance(rgb) {
  return rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126,.7152,.0722][index], 0);
}
function ratio(a, b) { const values = [luminance(a), luminance(b)].sort((x,y)=>x-y); return (values[1] + .05)/(values[0] + .05); }
async function suite({ browser }) {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin && ['GET','HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error=>errors.push(error.message));
    for (const [locale,prefix] of [['de',''],['en','/en'],['uk','/uk'],['ru','/ru']]) {
      for (const width of [390,700]) {
        await page.setViewportSize({width,height:900});
        assert.equal((await page.goto(origin+prefix+'/',{waitUntil:'domcontentloaded'})).status(),200);
        await page.mouse.move(0,0);
        const promo=page.locator('.knaba-home-mobile');
        const button=promo.locator('a.button');
        await button.scrollIntoViewIfNeeded();
        const normal=await button.evaluate(node=>({background:getComputedStyle(node).backgroundColor,image:getComputedStyle(node).backgroundImage,color:getComputedStyle(node).color,href:new URL(node.href).pathname}));
        assert.equal(normal.background,'rgb(214, 243, 129)');
        assert.equal(normal.image,'none');
        assert.equal(normal.color,'rgb(19, 60, 52)');
        assert.equal(normal.href,prefix+'/app/');
        await page.keyboard.press('Tab');
        await button.focus();
        const focus=await button.evaluate(node=>({style:getComputedStyle(node).outlineStyle,color:getComputedStyle(node).outlineColor,width:getComputedStyle(node).outlineWidth}));
        assert.deepEqual(focus,{style:'solid',color:'rgb(255, 233, 142)',width:'3px'});
        await button.hover();
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.knaba-home-mobile a.button')).backgroundColor==='rgb(238, 252, 194)');
        const promoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
        assert.ok(promoOverflow<=1);
        if(locale==='uk'&&width===390) await promo.screenshot({path:directory+'/promo-uk-390.jpg',type:'jpeg',quality:85});
        assert.equal((await page.goto(origin+prefix+'/app/',{waitUntil:'domcontentloaded'})).status(),200);
        const app=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,locale:document.documentElement.lang,theme:document.body.getAttribute('data-public-design'),h1:document.querySelectorAll('h1').length,phone:document.querySelectorAll('a[href^="tel:"]').length,manifest:document.querySelector('link[rel="manifest"]')?.getAttribute('href'),roles:document.querySelectorAll('.knaba-role-grid article').length,downloadCards:document.querySelectorAll('.knaba-download-card').length}));
        assert.ok(app.overflow<=1,`${locale}/${width} app overflow ${app.overflow}`);
        assert.equal(app.locale,locale); assert.equal(app.theme,null); assert.equal(app.h1,1); assert.equal(app.phone,1); assert.equal(app.manifest,'/app-manifest.json'); assert.equal(app.roles,4); assert.equal(app.downloadCards,3);
        if(locale==='uk'&&width===390) await page.screenshot({path:directory+'/app-uk-390.jpg',type:'jpeg',quality:85});
        checks.push({locale,width,status:'PASS',promo:{...normal,...focus,overflow:promoOverflow,textContrast:ratio([19,60,52],[214,243,129]),minimumFocusContrast:ratio([255,233,142],[34,84,74])},app});
      }
    }
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
  return checks.length;
}
runBrowserGate({origin,engines,suite}).then(result=>{const report={...result,origin,checks};writeFileSync(directory+'/qa.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exitCode={PASS:0,FAIL:1,BLOCKED:2}[result.status];}).catch(error=>{console.error(error.stack);process.exitCode=1;});
