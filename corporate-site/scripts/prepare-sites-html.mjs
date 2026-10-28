// Final, opt-in Sites artifact step. Run only after build + verify:build.
// Sites dispatches files in dist/client before the Worker. Keep verified HTML in
// the Worker so the existing application remains responsible for its headers.
import { readFile, writeFile, readdir, lstat, mkdir, mkdtemp, rename, unlink, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const REPORT = 'docs/build-verification.json';
const CLIENT = 'dist/client';
const WORKER = 'dist/server/index.js';
const AUDIT = '.sites-html';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function info(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function directory(path) {
  const entry = await info(path);
  assert.ok(entry?.isDirectory() && !entry.isSymbolicLink(), `${path}: expected a regular directory, not a symbolic link`);
}
async function regularFile(path) {
  const entry = await info(path);
  assert.ok(entry?.isFile() && !entry.isSymbolicLink(), `${path}: expected a regular file, not a symbolic link`);
  return readFile(path);
}
async function tree(root, prefix = '') {
  await directory(join(root, prefix));
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await tree(root, file));
    else files.push({ file, data: await regularFile(join(root, file)) });
  }
  return files.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
}
function artifactHash(files) {
  const hash = createHash('sha256');
  for (const { file, data } of [...files].sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0)) hash.update(file + '\0').update(data).update('\0');
  return hash.digest('hex');
}
function descriptor({ file, data }) { return { file, bytes: data.length, sha256: sha(data) }; }
function pageDescriptor(file) {
  const common = descriptor(file);
  const route = '/' + (file.file === 'index.html' || file.file.endsWith('/index.html') ? file.file.slice(0, -10) : file.file);
  assert.ok(!route.startsWith('/api/') && route !== '/api', 'Generated HTML must not overlap API routes');
  return { file: common.file, route, status: file.file === '404.html' ? 404 : 200, bytes: common.bytes, sha256: common.sha256, etag: `"${common.sha256}"` };
}
async function readReport(root, expectedPages) {
  const report = JSON.parse(await regularFile(join(root, REPORT)));
  assert.equal(report.scope, 'production-build-static-validation', 'Expected the existing successful build verification report');
  assert.equal(report.pages, expectedPages, 'Verified page count does not match the required page count');
  assert.equal(report.internalLinks, 'PASS', 'Build link verification must pass first');
  assert.equal(report.metadata, 'PASS', 'Build metadata verification must pass first');
  assert.match(report.artifactSha256, /^[a-f0-9]{64}$/, 'Missing verified artifact hash');
  return report;
}

// This function is serialized into the bundled Worker, with only the immutable
// generated HTML table and the unmodified compiled application as its inputs.
function embeddedWorker(application, pages) {
  const routes = new Map();
  const aliases = new Map();
  for (const page of pages) {
    routes.set(page.route, page);
    if (page.file === 'index.html' || page.file.endsWith('/index.html')) {
      aliases.set('/' + page.file, page);
      if (page.route !== '/') aliases.set(page.route.slice(0, -1), page);
    }
  }
  const notFound = pages.find(page => page.file === '404.html');
  function lookup(request) {
    const url = new URL(request.url);
    let path = url.pathname;
    try { path = decodeURIComponent(path); } catch { return { url }; }
    if (path.startsWith('//') || path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path)) return { url };
    return { url, page: routes.get(path), alias: aliases.get(path) };
  }
  function representation(request, page) {
    const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': String(page.bytes), ETag: page.etag, 'Cache-Control': 'public, max-age=0, must-revalidate' });
    const matches = request.headers.get('If-None-Match')?.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === page.etag);
    if (page.status === 200 && matches) return new Response(null, { status: 304, headers });
    return new Response(request.method === 'HEAD' ? null : page.body, { status: page.status, headers });
  }
  return {
    ...application,
    async fetch(request, env, ctx) {
      // Preserve API request/identity/binding references and every API method.
      if (new URL(request.url).pathname.startsWith('/api/')) return application.fetch(request, env, ctx);
      const initial = lookup(request);
      if (!initial.page && !initial.alias && !env.ASSETS) return application.fetch(request, env, ctx);
      const assets = {
        async fetch(assetRequest) {
          const { url, page, alias } = lookup(assetRequest);
          if (page || alias) {
            if (assetRequest.method !== 'GET' && assetRequest.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
            if (alias) return new Response(null, { status: 308, headers: { Location: encodeURI(alias.route) + url.search, 'Cache-Control': 'public, max-age=0, must-revalidate' } });
            return representation(assetRequest, page);
          }
          const response = await env.ASSETS.fetch(assetRequest);
          // The platform cannot find the removed404 document. Preserve the
          // original branded fallback, without intercepting API JSON or writes.
          if (response.status === 404 && (assetRequest.method === 'GET' || assetRequest.method === 'HEAD')) return representation(assetRequest, notFound);
          return response;
        },
      };
      return application.fetch(request, { ...env, ASSETS: assets }, ctx);
    },
  };
}

async function validateRuntime(workerPath, pages) {
  const application = (await import(pathToFileURL(workerPath).href + '?sha=' + sha(await readFile(workerPath)))).default;
  assert.equal(typeof application?.fetch, 'function', 'Prepared Worker must export fetch');
  const env = { KNABA_RELEASE_MODE: 'vsp', ASSETS: { fetch() { throw Error('Known HTML unexpectedly delegated to platform assets'); } } };
  for (const page of pages) for (const method of ['GET', 'HEAD']) {
    const response = await application.fetch(new Request('https://artifact.invalid' + encodeURI(page.route), { method }), env, {});
    assert.equal(response.status, page.status, `${page.file}: runtime status`);
    assert.equal(response.headers.get('Content-Length'), String(page.bytes), `${page.file}: runtime byte length`);
    assert.equal(response.headers.get('ETag'), page.etag, `${page.file}: runtime ETag`);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff', `${page.file}: runtime security header`);
    assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin', `${page.file}: runtime referrer header`);
    assert.match(response.headers.get('X-Robots-Tag') || '', /\bnoindex\b/, `${page.file}: runtime preview indexing header`);
    const body = Buffer.from(await response.arrayBuffer());
    if (method === 'HEAD') assert.equal(body.length, 0, `${page.file}: runtime HEAD body`);
    else assert.equal(sha(body), page.sha256, `${page.file}: runtime exact body hash`);
  }
}

async function verifyPrepared(root, report, expectedPages) {
  await directory(join(root, AUDIT));
  const manifestPath = join(root, AUDIT, 'manifest.json');
  assert.ok(await info(manifestPath), 'Existing HTML preparation is incomplete: manifest missing; retain audit files and rebuild before retrying');
  const manifest = JSON.parse(await regularFile(manifestPath));
  assert.equal(manifest.schemaVersion, 1, 'Unknown HTML preparation schema');
  assert.equal(manifest.status, 'prepared', 'Incomplete HTML preparation');
  assert.equal(manifest.source.buildReport, REPORT);
  assert.equal(manifest.source.htmlPages, expectedPages, 'Prepared page count mismatch');
  assert.equal(manifest.source.clientArtifactSha256, report.artifactSha256, 'Prepared source artifact hash mismatch');
  assert.equal(manifest.output.worker, WORKER);
  assert.equal(manifest.output.htmlRoot, `${AUDIT}/client`);
  const htmlFiles = await tree(join(root, AUDIT, 'client'));
  const staticFiles = await tree(join(root, CLIENT));
  assert.equal(htmlFiles.length, expectedPages, 'Audit HTML page count mismatch');
  assert.ok(htmlFiles.every(file => file.file.endsWith('.html')), 'Unexpected non-HTML file in audit tree');
  assert.ok(staticFiles.every(file => !file.file.endsWith('.html')), 'Incomplete preparation: HTML remains in dist/client');
  assert.deepEqual(htmlFiles.map(pageDescriptor), manifest.html, 'Audit HTML hashes differ from manifest');
  assert.deepEqual(staticFiles.map(descriptor), manifest.static, 'Prepared static files or hashes differ from manifest');
  assert.equal(artifactHash([...htmlFiles, ...staticFiles]), report.artifactSha256, 'Reconstructed source artifact hash mismatch');
  assert.equal(sha(await regularFile(join(root, AUDIT, 'worker-application.js'))), manifest.source.applicationSha256, 'Original application hash mismatch');
  assert.equal(sha(await regularFile(join(root, WORKER))), manifest.output.workerSha256, 'Prepared Worker hash mismatch');
  await validateRuntime(join(root, WORKER), manifest.html);
  return manifest;
}

export async function prepareSitesHtml({ root = process.cwd(), mode = process.env.PUBLIC_KNABA_AUTH_MODE, expectedPages = 134 } = {}) {
  assert.equal(mode, 'sites', 'HTML preparation requires explicit Sites mode: PUBLIC_KNABA_AUTH_MODE=sites');
  assert.ok(Number.isInteger(expectedPages) && expectedPages > 0, 'A positive expected page count is required');
  root = resolve(root);
  await directory(root);
  await directory(join(root, 'dist'));
  await directory(join(root, 'dist/server'));
  const report = await readReport(root, expectedPages);
  if (await info(join(root, AUDIT))) return verifyPrepared(root, report, expectedPages);
  const files = await tree(join(root, CLIENT));
  assert.equal(artifactHash(files), report.artifactSha256, 'Build artifact hash differs from the successful verification report');
  const htmlFiles = files.filter(file => file.file.endsWith('.html'));
  const staticFiles = files.filter(file => !file.file.endsWith('.html'));
  assert.equal(htmlFiles.length, expectedPages, 'Actual HTML page count differs from the verified page count');
  assert.ok(htmlFiles.some(file => file.file === 'index.html') && htmlFiles.some(file => file.file === '404.html'), 'Verified home and404 documents are required');
  const pages = htmlFiles.map(file => {
    const body = file.data.toString('utf8');
    assert.ok(Buffer.from(body).equals(file.data), `${file.file}: HTML must be valid UTF-8 without byte replacement`);
    return { ...pageDescriptor(file), body };
  });
  const occupied = new Set(staticFiles.map(file => '/' + file.file));
  for (const page of pages) for (const route of [page.route, '/' + page.file, ...(page.route.endsWith('/') && page.route !== '/' ? [page.route.slice(0, -1)] : [])]) {
    assert.ok(!occupied.has(route), `${page.file}: HTML route collides with a static asset`);
  }
  const original = await regularFile(join(root, WORKER));
  const applicationSha256 = sha(original);
  const stage = await mkdtemp(join(root, `${AUDIT}.tmp-`));
  let committed = false;
  try {
    for (const file of htmlFiles) {
      await mkdir(join(stage, 'client', file.file, '..'), { recursive: true });
      await writeFile(join(stage, 'client', file.file), file.data, { flag: 'wx' });
    }
    await writeFile(join(stage, 'worker-application.js'), original, { flag: 'wx' });
    const source = `import application from ${JSON.stringify(join(stage, 'worker-application.js'))};\nconst pages = ${JSON.stringify(pages)};\nexport default (${embeddedWorker.toString()})(application, pages);\n`;
    const bundle = await build({ stdin: { contents: source, sourcefile: 'sites-html-wrapper.mjs', resolveDir: root }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', minify: true, metafile: true, logLevel: 'silent' });
    assert.equal(bundle.outputFiles.length, 1, 'Expected one self-contained Worker bundle');
    assert.ok(Object.values(bundle.metafile.outputs).every(output => output.imports.length === 0), 'Prepared Worker must not retain external module imports');
    const output = bundle.outputFiles[0].contents;
    const preparedWorker = join(stage, 'prepared-worker.mjs');
    await writeFile(preparedWorker, output, { flag: 'wx' });
    await validateRuntime(preparedWorker, pages);
    assert.deepEqual((await tree(join(stage, 'client'))).map(descriptor), htmlFiles.map(descriptor), 'Audit copy byte verification failed');
    assert.equal(sha(await regularFile(join(stage, 'worker-application.js'))), applicationSha256, 'Original Worker audit copy hash mismatch');
    // Detect a concurrent rebuild before replacing or removing any build output.
    assert.equal(artifactHash(await tree(join(root, CLIENT))), report.artifactSha256, 'Source client changed during HTML preparation');
    assert.equal(sha(await regularFile(join(root, WORKER))), applicationSha256, 'Source Worker changed during HTML preparation');
    assert.equal((await readReport(root, expectedPages)).artifactSha256, report.artifactSha256, 'Build report changed during HTML preparation');
    const manifest = {
      schemaVersion: 1, status: 'prepared',
      source: { buildReport: REPORT, clientArtifactSha256: report.artifactSha256, htmlPages: expectedPages, applicationSha256 },
      output: { worker: WORKER, workerSha256: sha(output), htmlRoot: `${AUDIT}/client` },
      html: pages.map(({ body, ...page }) => page),
      static: staticFiles.map(descriptor),
    };
    // The complete audit copy is durable before the atomic Worker replacement.
    // An interrupted removal has no completed manifest and fails closed on rerun.
    await rename(stage, join(root, AUDIT));
    committed = true;
    await rename(join(root, AUDIT, 'prepared-worker.mjs'), join(root, WORKER));
    for (const file of htmlFiles) await unlink(join(root, CLIENT, file.file));
    assert.deepEqual((await tree(join(root, CLIENT))).map(descriptor), manifest.static, 'Remaining static asset bytes changed');
    await writeFile(join(root, AUDIT, 'manifest.json.tmp'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await rename(join(root, AUDIT, 'manifest.json.tmp'), join(root, AUDIT, 'manifest.json'));
    return manifest;
  } finally {
    if (!committed) await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = await prepareSitesHtml();
  console.log(JSON.stringify({ status: manifest.status, htmlPages: manifest.html.length, staticFiles: manifest.static.length, workerSha256: manifest.output.workerSha256, manifest: `${AUDIT}/manifest.json` }, null, 2));
}
