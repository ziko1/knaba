// Browser acceptance test for the existing KnaBa service hero, no mocked DOM.
// Run against an isolated VPS container or the development site.
// Required: KNABA_TEST_URL, KNABA_PLAYWRIGHT_MODULE (when not in NODE_PATH).
const assert = require('node:assert/strict');
const {chromium} = require(process.env.KNABA_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.KNABA_TEST_URL || 'https://kneba.vsp.rest';
const locales = [
  {prefix:'',lang:'de'},
  {prefix:'/en',lang:'en'},
  {prefix:'/uk',lang:'uk'},
  {prefix:'/ru',lang:'ru'},
];
const slugs = [
  'baureinigung','bauzwischenreinigung','bauendreinigung',
  'baustellenraeumung','bauhilfe','kernbohrungen','durchbrueche','zusatzarbeiten',
];

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.KNABA_CHROME_PATH,args:['--no-sandbox']});
  try {
    for (const {prefix,lang} of locales) {
      const widths = lang === 'de' ? [320,390,768,1280] : [390];
      for (const width of widths) {
        const page = await browser.newPage({
          viewport:{width,height:width===320?700:850},
          isMobile:width<=390,hasTouch:width<=390,deviceScaleFactor:1,
        });
        const errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        const home = base + prefix + '/';
        await page.goto(home,{waitUntil:'networkidle',timeout:30000});
        await page.locator('knaba-service-carousel').waitFor();
        assert.equal(await page.evaluate(()=>Boolean(customElements.get('knaba-service-carousel'))),true,'web component upgraded');
        assert.equal(await page.locator('[data-carousel-slide]').count(),8,'all eight published services');
        const hrefs = await page.locator('[data-carousel-slide] .slide-link').evaluateAll(
          links=>links.map(link=>link.getAttribute('href'))
        );
        assert.deepEqual(hrefs,slugs.map(slug=>prefix+'/bauleistungen/'+slug+'/'));
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
        assert.ok(overflow<=1,'no horizontal page overflow on '+lang+' '+width+': '+overflow);
        assert.equal(await page.locator('[data-carousel-prev]').isDisabled(),true,'previous disabled on first slide');
        await page.locator('[data-carousel-next]').click();
        await page.waitForFunction(()=>document.querySelector('[data-carousel-status]')?.textContent?.trim()==='02 / 08');
        await page.locator('[data-carousel-dot]').last().click();
        await page.waitForFunction(()=>document.querySelector('[data-carousel-status]')?.textContent?.trim()==='08 / 08');
        await page.locator('[data-carousel-track]').focus();
        await page.keyboard.press('Home');
        await page.waitForFunction(()=>document.querySelector('[data-carousel-status]')?.textContent?.trim()==='01 / 08');
        await page.keyboard.press('End');
        await page.waitForFunction(()=>document.querySelector('[data-carousel-status]')?.textContent?.trim()==='08 / 08');
        assert.equal(await page.locator('[data-carousel-next]').isDisabled(),true,'next disabled at final slide');
        await page.locator('[data-carousel-slide]').last().locator('.slide-link').click();
        await page.waitForURL(base + prefix + '/bauleistungen/zusatzarbeiten/',{timeout:15000});
        assert.equal(await page.locator('h1').count()>0,true,'target page is real');
        assert.deepEqual(errors,[],'no browser JS page errors');
        console.log('CAROUSEL_PASS',lang,width,hrefs.length,'slides');
        await page.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error.stack || error);process.exitCode=1});
