import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = resolve("dist/client");
const releaseMode = process.env.KNABA_RELEASE_MODE;
const official = releaseMode === "official";
const vsp = releaseMode === "vsp";
const indexingApproved = official || vsp;
const origin = official ? "https://knaba.de" : "https://kneba.vsp.rest";
const approvedGuideSlugs = [
  "baureinigung-phasen", "baureinigung-kosten-planen",
  "bauuebergabe-checkliste", "bauendreinigung-vorbereiten"
];
const isPublicGuide=(file)=>approvedGuideSlugs.some(slug=>file.endsWith("/ratgeber/"+slug+"/index.html"));
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
  assert.ok(html.includes(`rel="canonical" href="${origin}`));
  assert.match(html, /<meta name="description" content="[^"]{30,}/);
  if (!indexingApproved || /konto|postfach|studio|crm|404/.test(file) || /\/leistungen\/(?:unterhaltsreinigung|bueroreinigung|glasreinigung|baureinigung|grundreinigung|treppenreinigung)\//.test(file) || ((file.includes("/ratgeber/") && !file.endsWith("/ratgeber/index.html")) && !isPublicGuide(file))) assert.match(html, /<meta name="robots" content="noindex, follow"/);
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
  assert.equal(business['@id'], origin+'/#business', `${file}: business @id uses the current host`);
  assert.equal(business.url, origin, `${file}: business URL uses the current host`);
  for(const node of graphNodes){
    if(node['@type']==='Service') assert.equal(node.provider?.['@id'],origin+'/#business',`${file}: service provider`);
    if(node['@type']==='Article') assert.equal(node.publisher?.['@id'],origin+'/#business',`${file}: article publisher`);
  }
  if (isPublicGuide(file)) assert.ok(graphNodes.some(g=>g['@type']==='Article'),`${file}: expected editorial Article schema`);
  if (file.includes('/bauleistungen/') && !file.endsWith('/bauleistungen/index.html')) assert.ok(graphNodes.some(g=>g['@type']==='Service'));
  if (/\/leistungen\/(?:unterhaltsreinigung|bueroreinigung|glasreinigung|baureinigung|grundreinigung|treppenreinigung)\//.test(file)) assert.match(html, /name="robots" content="noindex, follow"/);
  if (file.includes('/ratgeber/') && !file.endsWith('/ratgeber/index.html') && !isPublicGuide(file)) assert.match(html,/name="robots" content="noindex, follow"/);
  assert.match(html,/name="astro-view-transitions-enabled"/);
  for (const img of html.matchAll(/<img\b[^>]*>/g)) {
    assert.match(img[0], /alt="[^"]+"/);
    assert.match(img[0], /width="\d+"/);
    assert.match(img[0], /height="\d+"/);
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
assert.equal(pages.length,121,'121 source-built pages: 117 previous routes plus four new gallery locales');
for (const prefix of ['', 'en/', 'uk/', 'ru/']) {
  const source = await readFile(resolve(root,prefix+'index.html'),'utf8');
  assert.match(source, /class="bau-card-grid"/, prefix+'homepage service grid');
  assert.match(source, /id="partner"/, prefix+'homepage partner section');
  assert.equal((source.match(/data-partner-id="/g)||[]).length, 5, prefix+'homepage all five official partner logos');
  assert.doesNotMatch(source, /<a[^>]+href="https?:\/\/(?:www\.)?knaba\.de\//, prefix+'no legacy official-site outbound links');
  assert.doesNotMatch(source, /class="bau-ribbon"|class="container bau-editorial"|class="bau-editorial-panel"/, prefix+'duplicate sections');
}
const homepage = await readFile(resolve(root, 'index.html'), 'utf8');
assert.doesNotMatch(homepage, /<astro-island/, 'Home remains framework-free');
assert.match(homepage, /data-knaba-open/, 'Chat launcher is present without eager framework hydration');
const workerConfig=JSON.parse(await readFile(resolve('dist/server/wrangler.json'),'utf8'));
for (const route of ['/api/portal/*','/api/assistant/*','/api/leads'])
  assert.ok(workerConfig.assets.run_worker_first.includes(route), 'Worker-first API route: '+route);
const russianPages = pages.filter(file => relative(root, file).startsWith('ru/'));
const russianPublicPages = russianPages.filter(file => !relative(root,file).startsWith('ru/postfach/'));
assert.equal(russianPublicPages.length, 35, '34 existing Russian public routes plus one gallery');
assert.equal(russianPages.length, 36, '35 public Russian pages and one private owner inbox');
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
assert.equal((sitemap.match(/<loc>/g)||[]).length,indexingApproved?92:0);
if(indexingApproved) {
  assert.ok(robots.includes("Sitemap: "+origin+"/sitemap.xml"));
  assert.equal((sitemap.match(/<xhtml:link /g)||[]).length,92*5,'Published routes require reciprocal DE/EN/UK/RU/x-default alternates');
  for(const privatePart of ['/konto/','/studio/','/crm/','/postfach/'])
    assert.ok(!sitemap.includes('<loc>'+origin+privatePart), 'Private sitemap URL '+privatePart);
} else assert.doesNotMatch(robots,/Sitemap:/);
const headers = await readFile(resolve(root,'_headers'),'utf8');
assert.match(headers,/X-Content-Type-Options: nosniff/);
if(!indexingApproved) assert.match(headers,/X-Robots-Tag: noindex, follow/);
else assert.doesNotMatch(headers.split('/konto/*')[0],/X-Robots-Tag: noindex/,'Public VSP release must not send blanket noindex');
for(const path of ['/konto/*','/studio/*','/crm/*','/postfach/*','/ru/konto/*','/ru/postfach/*'])
  assert.ok(headers.includes(path+'\n  X-Robots-Tag: noindex, nofollow'),'Private robots header '+path);
const report = {
  scope: "production-build-static-validation",
  pages: pages.length,
  internalLinks: "PASS",
  metadata: "PASS",
  indexMode: official ? "OFFICIAL" : vsp ? (indexingApproved ? "VSP_PUBLIC" : "VSP_PENDING_APPROVAL") : "TEMPORARY_NOINDEX",
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
