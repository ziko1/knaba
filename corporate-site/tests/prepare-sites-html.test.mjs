import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { prepareSitesHtml } from '../scripts/prepare-sites-html.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const html = {
  'index.html': '<!doctype html><html lang="uk"><title>КнаБа</title><p>Збережено 🌟</p></html>\n',
  'konto/index.html': '<!doctype html><html><title>Konto</title><p>Private shell</p></html>',
  '404.html': '<!doctype html><html><title>404</title><p>Nicht gefunden</p></html>',
};
const fixtureApplication = `
export default {
  marker: 'original-application',
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) return env.API(request, env, ctx);
    const response = env.ASSETS ? await env.ASSETS.fetch(request) : new Response(request.method === 'HEAD' ? null : 'Unavailable', {status:503});
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('X-Robots-Tag', response.status >= 400 ? 'noindex, nofollow' : 'noindex, follow');
    if (decodeURIComponent(path).startsWith('/konto')) headers.set('Cache-Control', 'private, no-store');
    return new Response(response.body, {status:response.status,headers});
  },
  scheduled(event, env, ctx) { return env.SCHEDULED(event, env, ctx); }
};`;

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'knaba-sites-html-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = { ...html, '_astro/app.js': 'export const marker="unchanged";', 'robots.txt': 'User-agent: *\nDisallow: /\n', 'images/raw.bin': Buffer.from([0, 255, 1, 128]) };
  await mkdir(join(root, 'dist/server'), { recursive: true });
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  for (const [file, bytes] of Object.entries(files)) {
    await mkdir(join(root, 'dist/client', file, '..'), { recursive: true });
    await writeFile(join(root, 'dist/client', file), bytes);
  }
  await writeFile(join(root, 'dist/server/index.js'), fixtureApplication);
  const hash = createHash('sha256');
  for (const file of Object.keys(files).sort()) hash.update(file + '\0').update(files[file]).update('\0');
  const report = { scope: 'production-build-static-validation', pages: 3, internalLinks: 'PASS', metadata: 'PASS', artifactSha256: hash.digest('hex') };
  await writeFile(join(root, 'docs/build-verification.json'), JSON.stringify(report));
  const options = { root, mode: 'sites', expectedPages: 3 };
  return { root, files, report, options };
}

async function loadWorker(root) {
  return (await import(pathToFileURL(join(root, 'dist/server/index.js')).href + '?fixture=' + Date.now())).default;
}
const request = (path, init) => new Request('https://test.example' + path, init);
const asset404 = { fetch: async () => new Response('platform missing', { status: 404 }) };

test('requires explicit Sites mode and a complete verified artifact before changing files', async t => {
  const f = await fixture(t);
  await assert.rejects(prepareSitesHtml({ ...f.options, mode: 'vps' }), /Sites mode/);
  await assert.rejects(prepareSitesHtml({ ...f.options, expectedPages: 134 }), /page count/);
  await writeFile(join(f.root, 'dist/client/index.html'), html['index.html'] + 'changed');
  await assert.rejects(prepareSitesHtml(f.options), /artifact hash/);
  assert.equal(await readFile(join(f.root, 'dist/server/index.js'), 'utf8'), fixtureApplication);
  await assert.rejects(readFile(join(f.root, '.sites-html/manifest.json')), { code: 'ENOENT' });
});

test('preserves every exact UTF-8 body, static asset, and original Worker with a reproducible manifest', async t => {
  const f = await fixture(t);
  const manifest = await prepareSitesHtml(f.options);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.status, 'prepared');
  assert.equal(manifest.source.clientArtifactSha256, f.report.artifactSha256);
  assert.equal(manifest.source.htmlPages, 3);
  assert.equal(manifest.source.applicationSha256, sha(fixtureApplication));
  assert.equal(manifest.output.htmlRoot, '.sites-html/client');
  assert.equal(manifest.output.workerSha256, sha(await readFile(join(f.root, manifest.output.worker))));
  assert.equal(await readFile(join(f.root, '.sites-html/worker-application.js'), 'utf8'), fixtureApplication);
  const app = await loadWorker(f.root);
  for (const page of manifest.html) {
    const expected = Buffer.from(html[page.file]);
    assert.deepEqual(await readFile(join(f.root, '.sites-html/client', page.file)), expected);
    await assert.rejects(readFile(join(f.root, 'dist/client', page.file)), { code: 'ENOENT' });
    assert.equal(page.sha256, sha(expected));
    assert.equal(page.bytes, expected.length);
    for (const method of ['GET', 'HEAD']) {
      const response = await app.fetch(request(page.route, { method }), { ASSETS: asset404 }, {});
      assert.equal(response.status, page.status);
      assert.equal(response.headers.get('Content-Length'), String(expected.length));
      assert.equal(response.headers.get('ETag'), page.etag);
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
      assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), method === 'HEAD' ? Buffer.alloc(0) : expected);
    }
  }
  for (const file of manifest.static) assert.deepEqual(await readFile(join(f.root, 'dist/client', file.file)), Buffer.from(f.files[file.file]));
  assert.equal(manifest.static.length, 3);
  assert.equal(app.marker, 'original-application');
});

test('canonical aliases preserve queries and always stay on the same origin', async t => {
  const f = await fixture(t);
  await prepareSitesHtml(f.options);
  const app = await loadWorker(f.root);
  for (const [path, target] of [['/index.html?x=1', '/?x=1'], ['/konto?return_to=%2F', '/konto/?return_to=%2F'], ['/konto/index.html?a=b', '/konto/?a=b'], ['/%6bonto?x=2', '/konto/?x=2']]) {
    const response = await app.fetch(request(path), { ASSETS: asset404 }, {});
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('Location'), target);
    assert.equal(await response.text(), '');
  }
});

test('conditional GET/HEAD accepts strong, weak, list and wildcard tags without changing404 or allowing writes', async t => {
  const f = await fixture(t);
  const manifest = await prepareSitesHtml(f.options);
  const app = await loadWorker(f.root);
  const tag = manifest.html.find(page => page.route === '/').etag;
  for (const method of ['GET', 'HEAD']) for (const match of [tag, 'W/' + tag, '"elsewhere", W/' + tag, '*']) {
    const response = await app.fetch(request('/', { method, headers: { 'If-None-Match': match } }), { ASSETS: asset404 }, {});
    assert.equal(response.status, 304);
    assert.equal(response.headers.get('ETag'), tag);
    assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
    assert.equal(await response.text(), '');
  }
  assert.equal((await app.fetch(request('/', { headers: { 'If-None-Match': '"different"' } }), {}, {})).status, 200);
  for (const path of ['/', '/konto', '/konto/', '/404.html']) {
    const response = await app.fetch(request(path, { method: 'POST', body: 'untouched', headers: { 'If-None-Match': '*' } }), { ASSETS: asset404 }, {});
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), 'GET, HEAD');
  }
  const missingTag = manifest.html.find(page => page.status === 404).etag;
  for (const path of ['/404.html', '/unknown/']) for (const method of ['GET', 'HEAD']) {
    const response = await app.fetch(request(path, { method, headers: { 'If-None-Match': missingTag } }), { ASSETS: asset404 }, {});
    assert.equal(response.status, 404);
    assert.equal(await response.text(), method === 'HEAD' ? '' : html['404.html']);
  }
  const privateResponse = await app.fetch(request('/konto/'), { ASSETS: asset404 }, {});
  assert.equal(privateResponse.headers.get('Cache-Control'), 'private, no-store');
});

test('delegates API requests and scheduled events with original identity, bindings, request bodies and context', async t => {
  const f = await fixture(t);
  await prepareSitesHtml(f.options);
  const app = await loadWorker(f.root);
  const ctx = {};
  const apiRequest = request('/api/portal/missing?probe=1', { method: 'POST', body: 'private input' });
  const event = {};
  let calls = 0;
  const env = {
    ASSETS: { fetch() { throw Error('API must not call assets'); } },
    API(req, bindings, context) { assert.equal(req, apiRequest); assert.equal(bindings, env); assert.equal(context, ctx); calls++; return new Response('api404', { status: 404, headers: { 'Content-Type': 'application/json' } }); },
    SCHEDULED(received, bindings, context) { assert.equal(received, event); assert.equal(bindings, env); assert.equal(context, ctx); calls++; return 'scheduled'; },
  };
  const response = await app.fetch(apiRequest, env, ctx);
  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'api404');
  assert.equal(await apiRequest.text(), 'private input');
  assert.equal(app.scheduled(event, env, ctx), 'scheduled');
  assert.equal(calls, 2);
});

test('preserves non-HTML assets, ranges, redirects,404 fallback, and missing-binding503 behavior', async t => {
  const f = await fixture(t);
  await prepareSitesHtml(f.options);
  const app = await loadWorker(f.root);
  const original = request('/images/raw.bin', { headers: { Range: 'bytes=1-2' } });
  const env = { ASSETS: { fetch(req) { assert.equal(req, original); return new Response(new Uint8Array([255, 1]), { status: 206, headers: { 'Content-Range': 'bytes 1-2/4', ETag: '"asset"' } }); } } };
  const range = await app.fetch(original, env, {});
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('Content-Range'), 'bytes 1-2/4');
  assert.equal(range.headers.get('ETag'), '"asset"');
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), Buffer.from([255, 1]));
  const redirect = await app.fetch(request('/other'), { ASSETS: { fetch: async () => new Response(null, { status: 302, headers: { Location: '/somewhere' } }) } }, {});
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('Location'), '/somewhere');
  assert.equal((await app.fetch(request('/unknown'), {}, {})).status, 503);
  assert.equal((await app.fetch(request('/'), {}, {})).status, 200);
  const originalPost = await app.fetch(request('/unknown', { method: 'POST' }), { ASSETS: asset404 }, {});
  assert.equal(originalPost.status, 404);
  assert.equal(await originalPost.text(), 'platform missing');
});

test('idempotent preparation verifies the whole frozen artifact and rejects later drift', async t => {
  const f = await fixture(t);
  const first = await prepareSitesHtml(f.options);
  const second = await prepareSitesHtml(f.options);
  assert.deepEqual(second, first);
  await writeFile(join(f.root, 'dist/client/_astro/app.js'), 'drift');
  await assert.rejects(prepareSitesHtml(f.options), /static|hash/);
});

test('rejects partial preparation and symlink inputs before removing any HTML', async t => {
  const f = await fixture(t);
  await mkdir(join(f.root, '.sites-html'));
  await assert.rejects(prepareSitesHtml(f.options), /incomplete|manifest/);
  assert.equal(await readFile(join(f.root, 'dist/client/index.html'), 'utf8'), html['index.html']);
  await rm(join(f.root, '.sites-html'), { recursive: true });
  await symlink(join(f.root, 'dist/client/index.html'), join(f.root, 'dist/client/linked.html'));
  await assert.rejects(prepareSitesHtml(f.options), /symbolic|regular/);
  assert.equal(await readFile(join(f.root, 'dist/server/index.js'), 'utf8'), fixtureApplication);
});

test('bundle/runtime validation failure leaves the source build intact', async t => {
  const f = await fixture(t);
  const broken = 'export default { fetch() { return new Response("wrong body"); } };';
  await writeFile(join(f.root, 'dist/server/index.js'), broken);
  await assert.rejects(prepareSitesHtml(f.options), /runtime|body|header|status/);
  assert.equal(await readFile(join(f.root, 'dist/server/index.js'), 'utf8'), broken);
  for (const [file, body] of Object.entries(html)) assert.equal(await readFile(join(f.root, 'dist/client', file), 'utf8'), body);
  assert.deepEqual((await readdir(f.root)).filter(name => name.startsWith('.sites-html')), []);
});
