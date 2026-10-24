import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = resolve("dist");
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
  assert.match(html, /<html lang="de"/);
  assert.match(html, /<meta name="description" content="[^"]{30,}/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  assert.ok(title && !titles.has(title), `${file}: unique title`);
  titles.add(title);
  assert.doesNotMatch(html, /<(?:script|img)[^>]+src="https?:/);
  for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
    const path = url.split("?")[0];
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
assert.ok(cssGzip < 25 * 1024, "CSS budget 25KiB gzip");
assert.ok(jsGzip < 50 * 1024, "All emitted JS budget 50KiB gzip");
assert.ok(
  assets.find((a) => a.name === "images/office-640.webp").bytes < 300 * 1024,
  "Mobile image budget 300KiB",
);
const report = {
  scope: "production-build-static-validation",
  pages: pages.length,
  internalLinks: "PASS",
  metadata: "PASS",
  draftNoindex: "PASS",
  externalImageScriptRequests: "NONE_IN_HTML",
  cssGzip,
  allEmittedJsGzip: jsGzip,
  assets,
  artifactSha256: hash.digest("hex"),
  fieldWebVitals: "NOT_RUN",
  networkTransfer: "NOT_MEASURED",
};
await writeFile(
  "docs/build-verification.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
