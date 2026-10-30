'use strict';
// Read-only acceptance on a local static build. No form submission or external requests.
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { normalizeLoopbackOrigin, runBrowserGate } = require('./browser-policy-gate.cjs');
const output = process.env.KNABA_SCREENSHOT_DIR;
const checks = [];
if (output) mkdirSync(output, { recursive: true });
const locales = [['de', ''], ['en', '/en'], ['uk', '/uk'], ['ru', '/ru']];

async function suite({ browser, origin }) {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const visit = async (path, width, height = 900) => {
    await page.setViewportSize({ width, height });
    assert.equal((await page.goto(origin + path, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const layout = async label => {
    const metrics = await page.evaluate(() => ({
      viewport: innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      h1: document.querySelectorAll('h1').length,
      phone: document.querySelectorAll('a[href^="tel:"]').length,
      headings: [...document.querySelectorAll('h1,h2,h3')].filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width && (rect.left < -1 || rect.right > innerWidth + 1) && !node.closest('.carousel-track');
      }).map(node => node.textContent.slice(0, 80)),
    }));
    assert.ok(metrics.overflow <= 1, label + ': horizontal overflow ' + metrics.overflow);
    assert.equal(metrics.h1, 1, label + ': one h1');
    assert.equal(metrics.phone, 1, label + ': one phone link');
    assert.deepEqual(metrics.headings, [], label + ': heading outside viewport');
    checks.push({ name: label, ...metrics, status: 'PASS' });
  };
  try {
    for (const [lang, prefix] of locales) {
      for (const width of [320, 390, 700, 768, 1440]) {
        await visit(prefix + '/', width, width === 1440 ? 1000 : 900);
        assert.equal(await page.locator('html').getAttribute('lang'), lang);
        await layout(`${lang} home ${width}`);
        assert.equal(await page.locator('#bau-services .bau-card-grid > a.bau-card').count(), 6);
        const dots = await page.locator('.carousel-dot').evaluateAll(nodes => nodes.map(node => {
          const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height };
        }));
        assert.equal(dots.length, 8);
        assert.ok(dots.every(dot => dot.width >= 24 && dot.height >= 44), `${lang}/${width}: touch targets`);
        if (output && ((lang === 'de' && width === 1440) || (lang === 'uk' && width === 390))) {
          await page.screenshot({ path: join(output, `home-${lang}-${width}.jpg`), type: 'jpeg', quality: 85, fullPage: false });
          for (const image of await page.locator('main img[loading="lazy"], footer img[loading="lazy"]').all()) {
            if (await image.evaluate(node => Boolean(node.closest('.carousel-track')))) continue;
            await image.scrollIntoViewIfNeeded();
            await image.evaluate(node => node.decode());
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: join(output, `home-${lang}-${width}-full.png`), fullPage: true });
        }
      }
      for (const route of ['/leistungen/', '/bauleistungen/baureinigung/', '/kontakt/']) {
        await visit(prefix + route, 700);
        await layout(`${lang} ${route} 700`);
      }
      await visit(prefix + '/', 390, 320);
      const summary = page.locator('.mobile-nav > summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      const menu = await page.locator('.mobile-nav nav').evaluate(node => {
        const rect = node.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, viewport: innerHeight, scroll: node.scrollHeight, height: node.clientHeight };
      });
      assert.ok(menu.bottom <= menu.viewport + 1, `${lang}: short menu bottom ${menu.bottom}`);
      assert.ok(menu.scroll > menu.height, `${lang}: menu must scroll in short viewport`);
      await page.locator('.mobile-nav nav a').last().focus();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.mobile-nav').getAttribute('open'), null);
      assert.equal(await summary.evaluate(node => node === document.activeElement), true);
      checks.push({ name: `${lang} short menu keyboard`, ...menu, status: 'PASS' });
    }
    await visit('/', 390);
    await page.locator('[data-carousel-next]').click();
    assert.equal((await page.locator('[data-carousel-status]').textContent()).trim(), '02 / 08');
    await page.locator('[data-carousel-dot]').nth(7).click();
    assert.equal((await page.locator('[data-carousel-status]').textContent()).trim(), '08 / 08');
    await page.locator('[data-carousel-track]').focus();
    await page.keyboard.press('Home');
    assert.equal((await page.locator('[data-carousel-status]').textContent()).trim(), '01 / 08');
    await page.keyboard.press('ArrowRight');
    assert.equal((await page.locator('[data-carousel-status]').textContent()).trim(), '02 / 08');
    checks.push({ name: 'carousel arrows dots Home ArrowRight', status: 'PASS' });
    await page.locator('[data-carousel-dot]').first().click();
    const firstLink = page.locator('.service-slide').first().locator('.slide-link');
    await page.keyboard.press('Tab');
    await firstLink.focus();
    assert.equal(await firstLink.evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
    assert.equal(await firstLink.evaluate(node => getComputedStyle(node).outlineColor), 'rgb(222, 250, 139)');
    checks.push({ name: 'first dark slide keyboard focus', status: 'PASS' });
    await visit('/', 1440);
    await page.locator('.why-knaba-item').first().scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0);
    checks.push({ name: 'reduced motion stays still', status: 'PASS' });
    await visit('/uk/', 390);
    await page.addStyleTag({ content: 'html{font-size:200%!important}' });
    await layout('uk 390 200% root text');
    await page.locator('.footer-bottom').scrollIntoViewIfNeeded();
    const overlaps = await page.locator('.footer-bottom a').evaluateAll(nodes => {
      const launcher = document.querySelector('[data-knaba-open]')?.getBoundingClientRect();
      return nodes.some(node => { const rect = node.getBoundingClientRect(); return launcher && rect.left < launcher.right && rect.right > launcher.left && rect.top < launcher.bottom && rect.bottom > launcher.top; });
    });
    assert.equal(overlaps, false, 'footer legal links remain clear of launcher');
    checks.push({ name: 'footer legal launcher clearance', status: 'PASS' });
    assert.deepEqual(pageErrors, [], 'unexpected browser JavaScript exceptions');
  } finally { await context.close(); }
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  await noJs.route('**/*', route => new URL(route.request().url()).origin === origin && route.request().method() === 'GET' ? route.continue() : route.abort());
  try {
    const staticPage = await noJs.newPage();
    await staticPage.goto(origin + '/uk/', { waitUntil: 'domcontentloaded' });
    assert.equal(await staticPage.locator('#bau-services .bau-card-grid > a.bau-card').count(), 6);
    assert.ok(await staticPage.locator('h1').isVisible());
    await staticPage.locator('.mobile-nav summary').click();
    assert.ok(await staticPage.locator('.mobile-nav nav').isVisible());
    await staticPage.goto(origin + '/uk/kontakt/', { waitUntil: 'domcontentloaded' });
    assert.ok(await staticPage.locator('noscript .aside-card').isVisible());
    assert.equal(await staticPage.locator('a[href^="tel:"]').count(), 1);
    checks.push({ name: 'no JavaScript content navigation contact fallback', status: 'PASS' });
  } finally { await noJs.close(); }
  const normal = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 1440, height: 1000 } });
  await normal.route('**/*', route => new URL(route.request().url()).origin === origin && route.request().method() === 'GET' ? route.continue() : route.abort());
  try {
    const motionPage = await normal.newPage();
    await motionPage.addInitScript(() => {
      const original = Element.prototype.animate;
      const keys = new WeakMap();
      let sequence = 0;
      window.__knabaMotionCalls = [];
      Element.prototype.animate = function (frames, options) {
        if (!keys.has(this)) keys.set(this, ++sequence);
        window.__knabaMotionCalls.push({ key: keys.get(this), card: this.matches('.bau-card'), hero: Boolean(this.closest('.bau-hero')), duration: typeof options === 'number' ? options : options?.duration });
        return original.call(this, frames, options);
      };
    });
    await motionPage.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    await motionPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await motionPage.evaluate(() => window.__knabaMotionCalls.filter(call => call.hero && call.duration === 420).length), 0, 'hero remains still');
    const firstCard = motionPage.locator('#bau-services a.bau-card').first();
    await firstCard.scrollIntoViewIfNeeded();
    await motionPage.waitForFunction(() => window.__knabaMotionCalls.some(call => call.card && call.duration === 420));
    const first = await motionPage.evaluate(() => window.__knabaMotionCalls.find(call => call.card && call.duration === 420));
    await motionPage.evaluate(() => window.scrollTo(0, 0));
    await firstCard.scrollIntoViewIfNeeded();
    await motionPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await motionPage.evaluate(key => window.__knabaMotionCalls.filter(call => call.key === key && call.duration === 420).length, first.key), 1, 'same card does not replay on another scroll');
    checks.push({ name: 'normal motion animates below-fold card once and leaves hero still', status: 'PASS', duration: first.duration });
  } finally { await normal.close(); }
  return checks.length;
}

async function main() {
  const origin = normalizeLoopbackOrigin(process.env.KNABA_TEST_URL);
  let engines;
  try { engines = require(process.env.KNABA_PLAYWRIGHT_MODULE || 'playwright'); }
  catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    console.log('KNABA_VIVID_BROWSER_QA ' + JSON.stringify({ status: 'BLOCKED', reason: 'PLAYWRIGHT_UNAVAILABLE' }));
    process.exitCode = 2; return;
  }
  const skipEngines = (process.env.KNABA_BROWSER_SKIP || '').split(',').filter(Boolean);
  if (skipEngines.some(name => !['chromium', 'webkit', 'firefox'].includes(name))) throw Error('Invalid KNABA_BROWSER_SKIP');
  const result = await runBrowserGate({ origin, engines, suite, skipEngines });
  const report = { ...result, checks, origin, scope: 'local static public presentation only' };
  if (output) writeFileSync(join(output, 'qa.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('KNABA_VIVID_BROWSER_QA ' + JSON.stringify(report));
  process.exitCode = { PASS: 0, FAIL: 1, BLOCKED: 2 }[result.status];
}
main().catch(error => { console.error(String(error?.stack || error)); process.exitCode = 1; });
