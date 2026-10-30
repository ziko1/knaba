import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm, unlink, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreviewGateway, PRIVACY_HEADERS } from './preview-gateway.mjs';

const HOST = 'testing.knaba.de';
const CONFIG = { issuer: 'https://knaba-fixture.cloudflareaccess.com', audience: 'a'.repeat(64) };
const primary = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rotated = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = (pair = primary, kid = 'primary') => ({ ...pair.publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' });
function token({ claims = {}, header = {}, pair = primary } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const data = [
    { alg: 'RS256', kid: 'primary', typ: 'JWT', ...header },
    { type: 'app', iss: CONFIG.issuer, aud: [CONFIG.audience], iat: now - 1, exp: now + 120, ...claims },
  ].map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), pair.privateKey).toString('base64url');
}
async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}
async function close(server) {
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
async function fixture(t, { config = CONFIG, backend, gateway = {} } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'knaba-preview-gate-'));
  const authFile = join(directory, 'auth.json');
  if (config !== null) await writeFile(authFile, JSON.stringify(config), { mode: 0o600 });
  const calls = []; const loads = [];
  const origin = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const call = { method: req.method, path: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() };
      calls.push(call);
      if (backend) backend(req, res, call);
      else {
        res.writeHead(200, { 'content-type': 'application/json', 'x-robots-tag': 'index, follow',
          'cache-control': 'public, max-age=9999', expires: 'tomorrow', 'set-cookie': 'knaba=session; HttpOnly; Secure; Path=/' });
        res.end(JSON.stringify(call));
      }
    });
  });
  const originPort = await listen(origin);
  const server = createPreviewGateway({ publicHost: HOST, upstream: 'http://127.0.0.1:' + originPort, authFile,
    jwksLoader: async options => { loads.push(options); return { keys: [jwk()] }; }, ...gateway });
  const port = await listen(server);
  t.after(async () => { await close(server); await close(origin); await rm(directory, { recursive: true, force: true }); });
  return { server, origin, port, directory, authFile, calls, loads };
}
function call(f, { method = 'GET', path = '/', jwt = token(), headers = {}, body, chunks } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: f.port, method, path, agent: false,
      headers: { host: HOST, ...(jwt === null ? {} : { 'cf-access-jwt-assertion': jwt }), ...headers } }, res => {
      const parts = [];
      res.on('data', chunk => parts.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts).toString() }));
    });
    req.on('error', reject);
    if (chunks) for (const chunk of chunks) req.write(chunk);
    req.end(body);
  });
}
function privateResponse(response, expected) {
  assert.equal(response.status, expected);
  for (const [name, value] of Object.entries(PRIVACY_HEADERS)) assert.equal(response.headers[name], value, name);
}
function raw(f, request) {
  return new Promise((resolve, reject) => {
    const socket = connect(f.port, '127.0.0.1', () => socket.write(request));
    let response = '';
    socket.setEncoding('utf8'); socket.on('data', bytes => { response += bytes; });
    socket.on('error', reject); socket.on('end', () => resolve(response));
  });
}

test('valid Access signature protects every forwarded path and preserves app Bearer authentication', async t => {
  const f = await fixture(t);
  const original = await readFile(f.authFile, 'utf8');
  const response = await call(f, { method: 'POST', path: '/api/assistant?private=query', body: 'sample', headers: {
    authorization: 'Bearer application-token', cookie: 'knaba=app-session; CF_Authorization=secret-access-cookie; CF_Binding=secret',
    'content-type': 'text/plain', 'x-forwarded-proto': 'http', 'x-forwarded-for': '203.0.113.22',
    forwarded: 'for=203.0.113.22', 'x-real-ip': '203.0.113.22', 'true-client-ip': '203.0.113.22',
    'cf-access-authenticated-user-email': 'forged@example.invalid', 'cf-connecting-ip': '203.0.113.22',
    'oai-authenticated': 'true', 'x-oai-user-id': 'forged', 'x-auth-request-email': 'forged@example.invalid',
  } });
  privateResponse(response, 200);
  const forwarded = JSON.parse(response.body);
  assert.equal(forwarded.body, 'sample'); assert.equal(forwarded.path, '/api/assistant?private=query');
  assert.equal(forwarded.headers.host, HOST); assert.equal(forwarded.headers['x-forwarded-proto'], 'https');
  assert.equal(forwarded.headers.authorization, 'Bearer application-token'); assert.equal(forwarded.headers.cookie, 'knaba=app-session');
  for (const header of ['cf-access-jwt-assertion', 'cf-access-authenticated-user-email', 'cf-connecting-ip',
    'x-forwarded-for', 'forwarded', 'x-real-ip', 'true-client-ip', 'oai-authenticated', 'x-oai-user-id', 'x-auth-request-email'])
    assert.equal(forwarded.headers[header], undefined, header);
  assert.deepEqual(response.headers['set-cookie'], ['knaba=session; HttpOnly; Secure; Path=/']);
  assert.equal(f.loads[0].url, CONFIG.issuer + '/cdn-cgi/access/certs'); assert.equal(f.loads[0].issuer, CONFIG.issuer);
  assert.equal(await readFile(f.authFile, 'utf8'), original);
  privateResponse(await call(f, { method: 'HEAD', path: '/asset.js' }), 200);
  assert.equal(f.loads.length, 1, 'current JWK set is cached');
});

test('missing, unsafe and invalid configuration fail closed without reaching JWKS or backend', async t => {
  const f = await fixture(t, { config: null });
  for (const path of ['/', '/asset.js', '/healthz', '/robots.txt', '/sitemap.xml']) privateResponse(await call(f, { path }), 503);
  for (const value of ['{', '{}', JSON.stringify({ ...CONFIG, issuer: 'http://127.0.0.1' }),
    JSON.stringify({ ...CONFIG, issuer: CONFIG.issuer + '/attacker' }), JSON.stringify({ ...CONFIG, audience: '' }), 'x'.repeat(4097)]) {
    await writeFile(f.authFile, value, { mode: 0o600 }); privateResponse(await call(f), 503);
  }
  await writeFile(f.authFile, JSON.stringify(CONFIG)); await chmod(f.authFile, 0o666);
  privateResponse(await call(f), 503);
  await chmod(f.authFile, 0o600); await unlink(f.authFile);
  const target = join(f.directory, 'other.json'); await writeFile(target, JSON.stringify(CONFIG), { mode: 0o600 });
  await symlink(target, f.authFile); privateResponse(await call(f), 503);
  assert.equal(f.calls.length, 0); assert.equal(f.loads.length, 0);
});

test('native HTML form POST retains its Origin and uses strict-origin response policy', async t => {
  const f = await fixture(t);
  const response = await call(f, { method: 'POST', path: '/join/', body: 'message=synthetic-fixture', headers: {
    origin: 'https://' + HOST,
    referer: 'https://' + HOST + '/',
    'content-type': 'application/x-www-form-urlencoded',
  } });
  privateResponse(response, 200);
  assert.equal(response.headers['referrer-policy'], 'strict-origin');
  assert.equal(f.calls[0].headers.origin, 'https://' + HOST);
  assert.equal(f.calls[0].headers.referer, 'https://' + HOST + '/');
  assert.equal(f.calls[0].headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(f.calls[0].body, 'message=synthetic-fixture');
});

test('missing, malformed, tampered and wrong-claim tokens cannot authorize any path', async t => {
  const f = await fixture(t);
  const now = Math.floor(Date.now() / 1000);
  const invalid = [null, 'not-a-jwt', 'a'.repeat(8193), token({ pair: rotated }),
    token({ claims: { aud: ['b'.repeat(64)] } }), token({ claims: { iss: 'https://attacker.cloudflareaccess.com' } }),
    token({ claims: { exp: now - 1 } }), token({ claims: { exp: '9999999999' } }),
    token({ claims: { iat: now + 90 } }), token({ claims: { nbf: now + 90 } }), token({ claims: { type: 'org' } }),
    token({ header: { alg: 'HS256' } }), token({ header: { alg: 'none' } }),
    token({ header: { jku: 'https://attacker.invalid/keys' } }), token({ header: { kid: 'missing-key' } })];
  for (const jwt of invalid) privateResponse(await call(f, { path: '/asset.js', jwt }), 401);
  privateResponse(await call(f, { jwt: null, headers: { cookie: 'CF_Authorization=' + token(), authorization: 'Bearer app-token' } }), 401);
  privateResponse(await call(f, { headers: { 'cf-access-jwt-assertion': [token(), token()] } }), 401);
  for (const path of ['/robots.txt', '/sitemap.xml', '/healthz']) privateResponse(await call(f, { jwt: null, path }), 401);
  assert.equal(f.calls.length, 0);
});

test('correct host and origin-form URL are required, including raw requests without Host', async t => {
  const f = await fixture(t);
  privateResponse(await call(f, { headers: { host: 'knaba.de' } }), 421);
  privateResponse(await call(f, { headers: { host: HOST + ':444' } }), 421);
  privateResponse(await call(f, { path: 'http://attacker.invalid/' }), 400);
  privateResponse(await call(f, { path: '//attacker.invalid/' }), 400);
  const missingHost = await raw(f, 'GET / HTTP/1.1\r\nConnection: close\r\n\r\n');
  assert.match(missingHost, /HTTP\/1\.1 421/); assert.match(missingHost, /x-robots-tag: noindex/);
  assert.equal(f.calls.length, 0); assert.equal(f.loads.length, 0);
});

test('authenticated robots disallows everything; sitemap is unavailable and neither reaches the app', async t => {
  const f = await fixture(t);
  const robots = await call(f, { path: '/robots.txt?ignored=1' }); privateResponse(robots, 200);
  assert.equal(robots.body, 'User-agent: *\nDisallow: /\n');
  const head = await call(f, { method: 'HEAD', path: '/robots.txt' }); privateResponse(head, 200); assert.equal(head.body, '');
  for (const path of ['/sitemap.xml', '/sitemap-index.xml']) privateResponse(await call(f, { path }), 404);
  assert.equal(f.calls.length, 0);
});

test('method restrictions and declared/chunked body limits apply before any upstream side effect', async t => {
  const f = await fixture(t, { gateway: { maxBodyBytes: 8 } });
  privateResponse(await call(f, { method: 'TRACE' }), 405);
  privateResponse(await call(f, { method: 'TRACE', jwt: null }), 401);
  privateResponse(await call(f, { method: 'POST', body: '123456789', headers: { 'content-length': '9' } }), 413);
  privateResponse(await call(f, { method: 'POST', chunks: ['12345', '6789'] }), 413);
  privateResponse(await call(f, { method: 'GET', body: 'a', headers: { 'content-length': '1' } }), 400);
  assert.equal(f.calls.length, 0);
  privateResponse(await call(f, { method: 'PATCH', body: '12345678' }), 200);
  assert.equal(f.calls[0].body, '12345678');
});

test('backend errors, missing keys and backend timeouts carry privacy headers', async t => {
  const broken = await fixture(t, { backend: req => req.socket.destroy() });
  privateResponse(await call(broken), 502);
  const timed = await fixture(t, { backend: () => {}, gateway: { upstreamTimeoutMs: 25, requestTimeoutMs: 500 } });
  privateResponse(await call(timed), 504);
  const keys = await fixture(t, { gateway: { jwksLoader: async () => { throw new Error('not exposed'); } } });
  const result = await call(keys); privateResponse(result, 503); assert.equal(result.body, 'Service Unavailable\n');
  assert.equal(keys.calls.length, 0);
  const hanging = await fixture(t, { gateway: { jwksLoader: () => new Promise(() => {}), jwksTimeoutMs: 20 } });
  privateResponse(await call(hanging), 503);
  const invalidKeys = await fixture(t, { gateway: { jwksLoader: async () => ({ keys: [jwk(), jwk()] }) } });
  privateResponse(await call(invalidKeys), 503);
});

test('key rotation refreshes by kid within bounded cache rules and never accepts expired cached keys', async t => {
  let time = Date.now(); let loads = 0; let available = [jwk()]; let fail = false;
  const f = await fixture(t, { gateway: { now: () => time, jwksCacheMs: 1000, jwksRefreshMinMs: 100,
    jwksLoader: async () => { loads++; if (fail) throw new Error('offline'); return { keys: available }; } } });
  privateResponse(await call(f), 200);
  available = [jwk(), jwk(rotated, 'rotated')];
  const next = token({ pair: rotated, header: { kid: 'rotated' } });
  privateResponse(await call(f, { jwt: next }), 401); assert.equal(loads, 1);
  time += 101; privateResponse(await call(f, { jwt: next }), 200); assert.equal(loads, 2);
  fail = true; time += 1001; privateResponse(await call(f), 503); assert.equal(loads, 3);
  assert.equal(f.calls.length, 2);
});

test('token expiry is rechecked after key lookup and configuration changes invalidate old audiences', async t => {
  let time = Date.now();
  const f = await fixture(t, { gateway: { now: () => time, jwksLoader: async () => {
    time += 2000; return { keys: [jwk()] };
  } } });
  privateResponse(await call(f, { jwt: token({ claims: { exp: Math.floor(time / 1000) + 1 } }) }), 401);
  await writeFile(f.authFile, JSON.stringify({ ...CONFIG, audience: 'b'.repeat(64) }));
  privateResponse(await call(f), 401); assert.equal(f.calls.length, 0);
});

test('upstream responses stream with backpressure instead of waiting for the whole response', async t => {
  let finishBackend; let finished = false;
  const f = await fixture(t, { backend: (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' }); res.write('first');
    finishBackend = () => { finished = true; res.end('second'); };
  } });
  await new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: f.port, path: '/', agent: false,
      headers: { host: HOST, 'cf-access-jwt-assertion': token() } }, res => {
      let text = ''; let sawFirst = false;
      res.on('data', chunk => {
        text += chunk;
        if (!sawFirst) { sawFirst = true; assert.equal(finished, false); assert.equal(String(chunk), 'first'); finishBackend(); }
      });
      res.on('end', () => { assert.equal(text, 'firstsecond'); assert.equal(res.headers['cache-control'], 'private, no-store'); resolve(); });
      res.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
});

test('raw malformed requests and slow headers fail closed with the same privacy headers', async t => {
  const f = await fixture(t, { gateway: { requestTimeoutMs: 40 } });
  for (const [request, status] of [['not HTTP\r\n\r\n', 400], ['GET / HTTP/1.1\r\nHost: ', 408],
    ['CONNECT example.invalid:443 HTTP/1.1\r\nHost: ' + HOST + '\r\n\r\n', 405]]) {
    const response = await raw(f, request); assert.match(response, new RegExp('HTTP/1.1 ' + status));
    assert.match(response, /x-robots-tag: noindex, nofollow, noarchive, nosnippet/);
    assert.match(response, /cache-control: private, no-store/);
  }
  assert.equal(f.calls.length, 0);
});

test('the factory rejects public or credential-bearing upstreams and unsafe limits', () => {
  for (const upstream of ['https://example.invalid', 'http://example.invalid', 'http://user:secret@127.0.0.1', 'http://web:8080/path'])
    assert.throws(() => createPreviewGateway({ upstream }));
  assert.throws(() => createPreviewGateway({ publicHost: 'testing.knaba.de/evil' }));
  assert.throws(() => createPreviewGateway({ maxBodyBytes: 16 * 1024 * 1024 }));
});

test('slow request bodies have a total deadline and concurrent work is bounded before forwarding', async t => {
  let announce;
  const authenticating = new Promise(resolve => { announce = resolve; });
  const f = await fixture(t, { gateway: { requestTimeoutMs: 150, maxConcurrentRequests: 1,
    jwksLoader: async () => { announce(); return { keys: [jwk()] }; } } });
  const incomplete = raw(f, 'POST /api/private HTTP/1.1\r\nHost: ' + HOST + '\r\n' +
    'Cf-Access-Jwt-Assertion: ' + token() + '\r\nContent-Length: 1\r\n\r\n');
  await authenticating;
  privateResponse(await call(f), 503);
  const timedOut = await incomplete;
  assert.match(timedOut, /HTTP\/1\.1 408/);
  assert.match(timedOut, /cache-control: private, no-store/);
  assert.equal(f.calls.length, 0);
});
