import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { normalizedArtifactBytes } from '../scripts/stable-artifact.mjs';

const root = resolve("dist/client");
const official = process.env.KNABA_RELEASE_MODE === "official";
const origin = official ? "https://knaba.de" : "https://kneba.vsp.rest";
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
const deploymentRoot = resolve('dist');
const deploymentHash = createHash('sha256');
for (const file of await walk(deploymentRoot)) {
  const name = relative(deploymentRoot,file);
  deploymentHash.update(name + '\0').update(await readFile(file)).update('\0');
}
const workerBundleSha256=createHash('sha256').update(await readFile(resolve('dist/server/index.js'))).digest('hex');
const hash = createHash("sha256");
const normalizedHash = createHash('sha256');
const assets = [];
const titles = new Set();
for (const file of files) {
  const bytes = await readFile(file);
  const name = relative(root, file);
  hash
    .update(name + "\0")
    .update(bytes)
    .update("\0");
  normalizedHash.update(name + "\0").update(normalizedArtifactBytes(name,bytes)).update("\0");
  if (/\.(css|js|webp)$/.test(file))
    assets.push({ name, bytes: bytes.length, gzip: gzipSync(bytes).length });
}
for (const file of pages) {
  const html = await readFile(file, "utf8");
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${file}: one h1`);
  assert.match(html, /<html lang="(de|en|uk)"/);
  if (!official) assert.match(html, /Temporäre Vorschau|Temporary preview|Тимчасовий сайт/);
  assert.ok(html.includes(`rel="canonical" href="${origin}`));
  assert.match(html, /<meta name="description" content="[^"]{30,}/);
  if (!official || /konto|404/.test(file)) assert.match(html, /<meta name="robots" content="noindex, follow"/);
  else assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large"/);
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  assert.ok(title && !titles.has(title), `${file}: unique title`);
  titles.add(title);
  assert.doesNotMatch(html, /<(?:script|img)[^>]+src="https?:/);
  for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
    const path = url.split("?")[0].split("#")[0];
    if (["/signin-with-chatgpt", "/signout-with-chatgpt"].includes(path)) continue;
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
  assert.ok(graphNodes.some(g=>g['@type']==='LocalBusiness'));
  if (file.includes('/leistungen/') && !file.endsWith('/leistungen/index.html')) assert.ok(graphNodes.some(g=>g['@type']==='Service'));
  if (file.includes('/ratgeber/') && !file.endsWith('/ratgeber/index.html')) assert.ok(graphNodes.some(g=>g['@type']==='Article'));
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
const homepage = await readFile(resolve(root, 'index.html'), 'utf8');
assert.doesNotMatch(homepage, /<astro-island/, 'Home remains framework-free');
const catalogue = JSON.parse(await readFile(resolve(root, 'api/catalogue.json'), 'utf8'));
assert.equal(catalogue.version, 1);
const robots = await readFile(resolve(root, 'robots.txt'), 'utf8');
assert.match(robots, /Disallow: \/api\//);
assert.doesNotMatch(robots, /Disallow: \/\s*$/m);
const sitemap = await readFile(resolve(root,'sitemap.xml'),'utf8');
assert.equal((sitemap.match(/<loc>/g)||[]).length,official?23:0);
if(official) assert.match(robots,/Sitemap: https:\/\/knaba\.de\/sitemap\.xml/);
else assert.doesNotMatch(robots,/Sitemap:/);
const headers = await readFile(resolve(root,'_headers'),'utf8');
assert.match(headers,/X-Content-Type-Options: nosniff/);
if(!official) assert.match(headers,/X-Robots-Tag: noindex, follow/);
const report = {
  scope: "production-build-static-validation",
  pages: pages.length,
  internalLinks: "PASS",
  metadata: "PASS",
  indexMode: official ? "OFFICIAL" : "TEMPORARY_NOINDEX",
  externalImageScriptRequests: "NONE_IN_HTML",
  cssGzip,
  allEmittedJsGzip: jsGzip,
  assets,
  artifactSha256: hash.digest("hex"),
  // Build equivalence across Astro's random island uid values; NOT a deploy-byte hash.
  normalizedArtifactSha256: normalizedHash.digest('hex'),
  workerBundleSha256,
  // All files under dist/, including Worker, assets, schema, and hosting manifest.
  deploymentArtifactSha256: deploymentHash.digest('hex'),
  fieldWebVitals: "NOT_RUN",
  networkTransfer: "NOT_MEASURED",
};
await writeFile(
  official ? "docs/evidence/official-build-verification.json" : "docs/build-verification.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
