import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {constructionGuideRoutes} from '../src/data/construction-guide-routes.ts';

const root = resolve("dist/client");
const releaseMode = process.env.KNABA_RELEASE_MODE;
const official = releaseMode === "official";
const vsp = releaseMode === "vsp";
const indexingApproved = official;
const origin = official ? "https://knaba.de" : "https://kneba.vsp.rest";
const publishedGuideSlugs = new Set(constructionGuideRoutes.map(guide=>guide.slug));
// Four locales * (12 shared public routes including gallery/partners + 8 offers + guides).
const expectedPublicRoutes = 4 * (12 + 8 + constructionGuideRoutes.length);
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const lists = await Promise.all(
    entries.map((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    ),
  );
  return lists.flat().sort();
}
const files = await walk(root);
assert.ok(!files.some(file => relative(root,file).split(/[\\/]/).includes('.prerender')),
  'Astro prerender server intermediates must never be published as client assets');
const pages = files.filter((f) => f.endsWith(".html"));
const hash = createHash("sha256");
const assets = [];
const titles = new Set();
let externalPartnerImagesInMarkup = 0;
for (const file of files) {
  const bytes = await readFile(file);
  const name = relative(root, file);
  hash
    .update(name + "\0")
    .update(bytes)
    .update("\0");
  if (/\.(css|js|webp)$/.test(file))
    assets.push({ name, bytes: bytes.length, gzip: gzipSync(bytes).length });
}
for (const file of pages) {
  const html = await readFile(file, "utf8");
  const guideSlug = file.match(/\/ratgeber\/([^/]+)\/index\.html$/)?.[1];
  const publishedGuide = !!guideSlug && publishedGuideSlugs.has(guideSlug);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${file}: one h1`);
  assert.match(html, /<html lang="(de|en|uk|ru)"/);
  // One accessible locale disclosure in the header, not a full-width strip.
  const locale = html.match(/<html lang="(de|en|uk|ru)"/)?.[1];
  const languageMenu = html.match(/<details class="site-language-switcher">([\s\S]*?)<\/details>/);
  assert.ok(languageMenu, `${file}: language dropdown must exist`);
  assert.match(languageMenu[1], /<summary\b[^>]*aria-label="[^"]+"/);
  const localeLinks = [...languageMenu[1].matchAll(/<a\b[^>]*data-language-switch[^>]*\slang="(de|en|uk|ru)"[^>]*>/g)];
  assert.deepEqual(localeLinks.map(link => link[1]), ['de','en','uk','ru'], `${file}: four locale targets`);
  const currentLinks = localeLinks.filter(link => link[0].includes('aria-current="page"'));
  assert.equal(currentLinks.length, 1, `${file}: exactly one selected language`);
  assert.equal(currentLinks[0][1], locale, `${file}: selected language matches document`);
  assert.doesNotMatch(html, /class="site-language-bar"|class="language-nav"/, `${file}: no duplicate language strip`);
  if (!official) assert.doesNotMatch(html, /class="preview-banner"/, 'No intrusive preview bar on VPS staging');
  const isNotFoundDocument = file.endsWith("/404.html");
  if (isNotFoundDocument) {
    assert.doesNotMatch(html, /<link rel="canonical"/, file + ": 404 must not publish canonical URL");
    assert.doesNotMatch(html, /<meta property="og:url"/, file + ": 404 must not publish Open Graph URL");
  } else {
  assert.ok(html.includes(`rel="canonical" href="${origin}`));
  }
  assert.match(html, /<meta name="description" content="[^"]{30,}/);
  if (!indexingApproved || /admin|konto|postfach|studio|crm|404|\/app\//.test(file) || /\/leistungen\/(?:unterhaltsreinigung|bueroreinigung|glasreinigung|baureinigung|grundreinigung|treppenreinigung)\//.test(file) || (guideSlug && !publishedGuide)) assert.match(html, /<meta name="robots" content="noindex, follow"/);
  else assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large"/);
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  assert.ok(title && !titles.has(title), `${file}: unique title`);
  titles.add(title);
  // No external scripts or images. All partner logos must be first-party.
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc="https?:\/\//i, file + ': external script');
  const externalImageSources = [...html.matchAll(/<img\b[^>]*\bsrc="(https?:\/\/[^"]+)"/gi)].map(match => match[1]);
  const partnerItems = [...html.matchAll(/<li class="knaba-partner-card" data-partner-id="([^"]+)"[^>]*>[\s\S]*?<\/li>/g)];
  const partnerImageSources = partnerItems.map(match => match[0].match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1]);
  assert.deepEqual(externalImageSources, [], file + ': all images must be first-party');
  if(partnerItems.length) {
    assert.deepEqual(partnerItems.map(match=>match[1]), ['official-01','official-02','hit','stromkreis','gewobag'],file+': partner order');
    assert.deepEqual(partnerImageSources, ['/images/partners/goldbeck.jpg','/images/partners/bonava.jpg','/images/partners/hit.png','/images/partners/stromkreis.png','/images/partners/gewobag.png'],file+': exact local partner assets');
  }
  externalPartnerImagesInMarkup += externalImageSources.length;
  assert.doesNotMatch(html, /(?:Переглянути партнерів на knaba\.de|Джерело перевірено \d{2}\.\d{2}\.\d{4}|Stand des Quellenabgleichs|Дата сверки с источником)/i, file + ': internal research notices on customer pages');
  assert.doesNotMatch(html, /<a\b[^>]*\bhref=["']https?:\/\/(?:www\.)?knaba\.de(?:[\/"'])/i, `${file}: no outbound link to original company site`);
  for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
    const path = url.split("?")[0].split("#")[0];
    if (["/login/", "/logout/"].includes(path)) continue;
    const target = resolve(
      root,
      `.${path.endsWith("/") ? path + "index.html" : path}`,
    );
    assert.ok(target.startsWith(root + "/"));
    assert.ok(
      (await stat(target).catch(() => null))?.isFile(),
      `${file}: missing ${url}`,
    );
  }
  const graphs = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
  assert.ok(graphs.length > 0, `${file}: structured data`);
  const graphNodes=graphs.flatMap(g=>g['@graph']||[g]);
  const business=graphNodes.find(g=>g['@type']==='LocalBusiness');
  assert.ok(business, `${file}: LocalBusiness present`);
  const phoneLinks = [...html.matchAll(/<a\b[^>]*\bhref=["'](tel:[^"'<>]+)["'][^>]*>/gi)].map(link => link[1]);
  assert.deepEqual(phoneLinks, [`tel:${business.telephone}`], `${file}: exactly one canonical telephone link`);
  if (/(?:^|\/)(?:en\/|uk\/|ru\/)?kontakt\/index\.html$/.test(file)) {
    assert.doesNotMatch(html, /class="button button-dark nav-cta"/, `${file}: no header CTA to itself`);
    assert.match(html, /<footer\b[\s\S]*?href="\/(?:en\/|uk\/|ru\/)?planer\/"/, `${file}: footer directs visitors to planner instead`);
  }
  const emailLinks = [...html.matchAll(/<a\b[^>]*\bhref=["'](mailto:[^"'<>]+)["'][^>]*>/gi)].map(link => link[1]);
  const privacy = /(?:^|\/)datenschutz\/index\.html$/.test(file);
  assert.equal(emailLinks.length, privacy ? 4 : 1, `${file}: no redundant mail link outside mandated privacy context`);
  for (const card of html.matchAll(/<article\s+class=["']bau-info-card["'][^>]*>([\s\S]*?)<\/article>/g)) {
    assert.doesNotMatch(card[1], /<a\b[^>]*\bhref=["']\/(?:en\/|uk\/|ru\/)?kontakt\/["']/i, `${file}: no repeated contact link inside an information card`);
  }
  assert.equal(business['@id'], origin+'/#business', `${file}: business @id uses the current host`);
  assert.equal(business.url, origin, `${file}: business URL uses the current host`);
  for(const node of graphNodes){
    if(node['@type']==='Service') assert.equal(node.provider?.['@id'],origin+'/#business',`${file}: service provider`);
    if(node['@type']==='Article') assert.equal(node.publisher?.['@id'],origin+'/#business',`${file}: article publisher`);
  }
  if (file.includes('/bauleistungen/') && !file.endsWith('/bauleistungen/index.html')) assert.ok(graphNodes.some(g=>g['@type']==='Service'));
  if (/\/leistungen\/(?:unterhaltsreinigung|bueroreinigung|glasreinigung|baureinigung|grundreinigung|treppenreinigung)\//.test(file)) assert.match(html, /name="robots" content="noindex, follow"/);
  if (guideSlug && !publishedGuide) assert.match(html,/name="robots" content="noindex, follow"/);
  if (publishedGuide) {
    const article=graphNodes.find(g=>g['@type']==='Article');
    assert.ok(article, `${file}: published guide Article schema`);
    assert.equal(article.inLanguage, locale, `${file}: article language`);
    assert.equal(article.url, origin+'/'+relative(root,file).replace(/index\.html$/,''), `${file}: article canonical URL`);
    assert.ok(article.headline && article.description, `${file}: meaningful article metadata`);
  }
  assert.match(html,/name="astro-view-transitions-enabled"/);
  const carouselSlugs = ['bauzwischenreinigung','bauendreinigung','baustellenraeumung',
    'bauhilfe','kernbohrungen','durchbrueche','zusatzarbeiten'];
  const carouselPaths = carouselSlugs.map(slug => '/illustrations/carousel/' + slug + '.webp');
  const decorativePaths = [];
  for (const img of html.matchAll(/<img\b[^>]*>/g)) {
    if (img[0].includes('alt=""')) {
      const src = img[0].match(/\bsrc="([^"]+)"/)?.[1];
      assert.ok(carouselPaths.includes(src), file + ': unapproved empty-alt image ' + src);
      // Decorative images repeat slide descriptions and are hidden from assistive tech.
      const context = html.slice(Math.max(0,img.index - 140),img.index);
      assert.match(context, /<div class="slide-art" aria-hidden="true"[^>]*>$/, file + ': empty-alt must be aria-hidden');
      decorativePaths.push(src);
    } else {
      assert.match(img[0], /alt="[^"]+"/);
    }
    assert.match(img[0], /width="\d+"/);
    assert.match(img[0], /height="\d+"/);
  }
  if (/(?:\/client\/|\/client\/(?:en|uk|ru)\/)index\.html$/.test(file)) {
    assert.deepEqual(decorativePaths,carouselPaths,file + ': seven distinct carousel artworks');
  } else {
    assert.equal(decorativePaths.length,0,file + ': decorative art only on homepages');
  }
}
const cssGzip = assets
  .filter((a) => a.name.endsWith(".css"))
  .reduce((n, a) => n + a.gzip, 0);
const jsGzip = assets
  .filter((a) => a.name.endsWith(".js"))
  .reduce((n, a) => n + a.gzip, 0);
assert.ok(cssGzip < 40 * 1024, "R3 CSS budget 40KiB gzip");
assert.ok(jsGzip < 220 * 1024, "R3 all emitted client JS budget 220KiB gzip");
assert.equal(pages.length,134,'134 source-built pages: 130 existing public/private pages plus four localized KNABA Mobile entry pages');
for (const prefix of ['', 'en/', 'uk/', 'ru/']) {
  const source = await readFile(resolve(root,prefix+'index.html'),'utf8');
  assert.match(source, /class="bau-card-grid"/, prefix+'homepage service grid');
  assert.match(source, /id="partner"/, prefix+'homepage partner section');
  assert.equal((source.match(/data-partner-id="/g)||[]).length, 5, prefix+'homepage all five official partner logos');
  const sectionIds = ['bau-hero-title', 'bau-services-title', 'bau-contract-heading', 'bau-process-title', 'company-profile-title', 'knaba-partners-title', 'reviews-title', 'knaba-faq-preview-title', 'bau-final-contact-title'];
  const positions = sectionIds.map(id => source.indexOf('id="' + id + '"'));
  assert.ok(positions.every(position => position >= 0), prefix + 'all homepage sections retained');
  assert.deepEqual([...positions].sort((a,b) => a-b), positions, prefix + 'visitor journey section order');
  const planner = await readFile(resolve(root,prefix+'planer/index.html'),'utf8');
  const topics = [...planner.matchAll(/data-planner-topic="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(topics, ['baureinigung','bauzwischenreinigung','bauendreinigung','baustellenraeumung','bauhilfe'], prefix + 'five usable core topics rendered before API/JS');
  assert.doesNotMatch(planner, /Leistungskatalog wird geladen/, prefix + 'known services do not wait for an unused API');
  // The existing /galerie URL is retained for backlinks, but only real
  // references may ever be presented as completed client projects.
  // Until then every illustrated process must answer a user's concrete
  // service question without introducing fake photos or contact-CTA spam.
  const workflowPage = await readFile(resolve(root,prefix+'galerie/index.html'),'utf8');
  const workflowText = {
    '':['So arbeitet KnaBa','Arbeitsabläufe'],
    'en/':['How KnaBa works','How we work'],
    'uk/':['Як працює KnaBa','Як ми працюємо'],
    'ru/':['Как работает KnaBa','Как мы работаем']
  }[prefix];
  for(const value of workflowText) {
    assert.ok(workflowPage.includes(value), prefix+' workflow title/navigation: '+value);
  }
  assert.equal((workflowPage.match(/class="knaba-workflow-detail-link"/g)||[]).length,4,
    prefix+' one service link per illustrated process');
  for(const slug of ['baureinigung','bauhilfe','bauzwischenreinigung','bauendreinigung']) {
    assert.ok(workflowPage.includes('href="/'+prefix+'bauleistungen/'+slug+'/"'),
      prefix+' linked existing service '+slug);
  }
  assert.equal((workflowPage.match(/src="\/illustrations\//g)||[]).length,4,
    prefix+' reuse four first-party, explicitly schematic illustrations');
  const workflowContactLinks = [...workflowPage.matchAll(/<a\b[^>]*class="button button-dark knaba-gallery-cta"[^>]*>/g)]
    .filter(match=>match[0].includes('href="/'+prefix+'kontakt/"'));
  assert.equal(workflowContactLinks.length,1, prefix+' only one final enquiry link');
  const publicCatalog = '/' + prefix + 'leistungen/';
  const extrasLabel = {
    '':'Zusatzarbeiten ansehen',
    'en/':'Explore additional works',
    'uk/':'Переглянути додаткові роботи',
    'ru/':'Подробнее о дополнительных работах'
  }[prefix];
  assert.ok(source.includes('class="button button-outline bau-secondary-cta" href="' + publicCatalog + '"'),
    prefix + 'one prominent hero catalogue CTA');
  assert.doesNotMatch(source, /class="bau-inline bau-services-more"/,
    prefix + 'no duplicate homepage catalogue button under the six cards');
  assert.ok(source.includes('href="' + publicCatalog + '#zusatzarbeiten"'),
    prefix + 'context-specific extras route');
  assert.ok(source.includes(extrasLabel),
    prefix + 'localized extras heading link instead of another generic catalogue label');
  for (const slug of ['baureinigung','bauzwischenreinigung','bauendreinigung','baustellenraeumung',
    'bauhilfe','kernbohrungen','durchbrueche','zusatzarbeiten']) {
    const detail = await readFile(resolve(root,prefix+'bauleistungen/'+slug+'/index.html'),'utf8');
    const href='/' + prefix + 'kontakt/?anliegen=' + slug;
    const linked=[...detail.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)]
      .map(match=>match[1]).filter(value=>value===href);
    assert.equal(linked.length,2,prefix+slug+' only intro and closing enquiry');
    assert.match(detail,/class="container section section-tight service-quote"/,
      prefix+slug+' pricing disclosure remains');
  }
  assert.doesNotMatch(source, /<a[^>]+href="https?:\/\/(?:www\.)?knaba\.de\//, prefix+'no legacy official-site outbound links');
  assert.doesNotMatch(source, /class="bau-ribbon"|class="container bau-editorial"|class="bau-editorial-panel"/, prefix+'duplicate sections');
}
const homepage = await readFile(resolve(root, 'index.html'), 'utf8');
const homeIslands = homepage.match(/<astro-island\b[^>]*>/g) || [];
assert.equal(homeIslands.length, 1, 'Only the functional reviews island hydrates on the homepage');
assert.match(homeIslands[0], /component-url="[^"]*PublicReviews\./, 'Owner components never hydrate publicly');
assert.match(homeIslands[0], /client="visible"/, 'Reviews hydrate only when visible');
assert.match(homepage, /data-knaba-open/, 'Chat launcher is present without eager framework hydration');
const workerConfig=JSON.parse(await readFile(resolve('dist/server/wrangler.json'),'utf8'));
assert.equal(workerConfig.assets.run_worker_first, true,
  'Worker runs first for every API and static route so native response headers are always applied');
const russianPages = pages.filter(file => relative(root, file).startsWith('ru/'));
const russianPublicPages = russianPages.filter(file => !relative(root,file).startsWith('ru/postfach/'));
assert.equal(russianPublicPages.length, 38, 'Russian tree includes partners, gallery, construction guides and mobile entry');
assert.equal(russianPages.length, 39, 'Russian private inbox remains an additional noindex page');
const russianInbox = await readFile(resolve(root,'ru/postfach/index.html'),'utf8');
assert.match(russianInbox, /<html lang="ru"/);
assert.match(russianInbox, /name="robots" content="noindex, follow"/);
const germanInbox = await readFile(resolve(root,'postfach/index.html'),'utf8');
assert.match(germanInbox, /name="robots" content="noindex, follow"/);
for (const file of russianPublicPages) {
  const html = await readFile(file, 'utf8');
  const route = '/' + relative(root, file).replace(/index\.html$/, '');
  assert.match(html, /<html lang="ru"/);
  assert.ok(html.includes(`rel="canonical" href="${origin}${route}"`), `${route}: self canonical`);
  assert.match(html, /property="og:locale" content="ru_RU"/);
  assert.ok(html.includes('href="/ru/kontakt/"'), `${route}: Russian contact navigation`);
  assert.ok(html.includes('href="/ru/konto/"'), `${route}: Russian portal navigation`);
  if (route !== '/ru/konto/') {
    const germanRoute = route.slice(3);
    assert.ok(html.includes(`hreflang="de" href="${origin}${germanRoute}"`));
    const german = await readFile(resolve(root, `.${germanRoute}index.html`), 'utf8');
    assert.ok(german.includes(`hreflang="ru" href="${origin}${route}"`), `${route}: reciprocal alternate`);
  }
}
const catalogue = JSON.parse(await readFile(resolve(root, 'api/catalogue.json'), 'utf8'));
assert.equal(catalogue.version, 1);
const robots = await readFile(resolve(root, 'robots.txt'), 'utf8');
assert.match(robots, /Disallow: \/api\//);
assert.doesNotMatch(robots, /Disallow: \/\s*$/m);
const sitemap = await readFile(resolve(root,'sitemap.xml'),'utf8');
assert.equal((sitemap.match(/<loc>/g)||[]).length,indexingApproved?expectedPublicRoutes:0);
if(indexingApproved) {
  assert.ok(robots.includes("Sitemap: "+origin+"/sitemap.xml"));
  assert.equal((sitemap.match(/<xhtml:link /g)||[]).length,expectedPublicRoutes*5,'Published routes require reciprocal DE/EN/UK/RU/x-default alternates');
  for(const privatePart of ['/admin/','/konto/','/studio/','/crm/','/postfach/'])
    assert.ok(!sitemap.includes('<loc>'+origin+privatePart), 'Private sitemap URL '+privatePart);
} else assert.doesNotMatch(robots,/Sitemap:/);
const headers = await readFile(resolve(root,'_headers'),'utf8');
assert.match(headers,/X-Content-Type-Options: nosniff/);
if(!indexingApproved) assert.match(headers,/X-Robots-Tag: noindex, follow/);
else assert.doesNotMatch(headers.split('/admin/*')[0],/X-Robots-Tag: noindex/,'Approved official build must not send blanket noindex');
for(const path of ['/admin/*','/konto/*','/studio/*','/crm/*','/postfach/*','/ru/konto/*','/ru/postfach/*'])
  assert.ok(headers.includes(path+'\n  X-Robots-Tag: noindex, nofollow'),'Private robots header '+path);
const report = {
  scope: "production-build-static-validation",
  pages: pages.length,
  internalLinks: "PASS",
  metadata: "PASS",
  indexMode: official ? "OFFICIAL" : vsp ? "VSP_STAGING_NOINDEX" : "TEMPORARY_NOINDEX",
  externalImageScriptRequests: "NONE_IN_HTML",
  externalPartnerImagesInMarkup,
  cssGzip,
  allEmittedJsGzip: jsGzip,
  assets,
  artifactSha256: hash.digest("hex"),
  fieldWebVitals: "NOT_RUN",
  networkTransfer: "NOT_MEASURED",
};
await writeFile(
  process.env.KNABA_BUILD_REPORT_PATH || (official ? "docs/evidence/official-build-verification.json" : "docs/build-verification.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
