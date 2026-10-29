/**
 * Private KNABA testing origin. Access is mandatory; there is no bypass mode.
 * Mount auth.json read-only: {"issuer":"https://TEAM.cloudflareaccess.com",
 * "audience":"APPLICATION_AUD"}. No provider credential or app identity is added.
 * Cloudflare documents RS256, the assertion header, and the issuer's JWK set:
 * https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
 * https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
 */
import { createServer, request as httpRequest, STATUS_CODES } from 'node:http';
import { createPublicKey, verify, constants as cryptoConstants } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

export const PRIVACY_HEADERS = Object.freeze({
  'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
  'cache-control': 'private, no-store',
  pragma: 'no-cache', expires: '0',
  'referrer-policy': 'strict-origin',
  'x-content-type-options': 'nosniff',
});
const MAX_CONFIG_BYTES = 4096;
const MAX_JWT_BYTES = 8192;
const MAX_JWKS_BYTES = 65536;
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'expect']);
const decoder = new TextDecoder('utf-8', { fatal: true });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
class GateError extends Error {
  constructor(status) { super('Preview request rejected'); this.status = status; }
}
const reject = status => { throw new GateError(status); };
const integer = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;

async function readConfiguration(path) {
  let file;
  try {
    if (typeof path !== 'string' || !isAbsolute(path)) reject(503);
    file = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
    const before = await file.stat();
    if (!before.isFile() || before.size < 2 || before.size > MAX_CONFIG_BYTES || (before.mode & 0o022)) reject(503);
    const bytes = Buffer.alloc(MAX_CONFIG_BYTES + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    const after = await file.stat();
    if (bytesRead !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) reject(503);
    const config = JSON.parse(decoder.decode(bytes.subarray(0, bytesRead)));
    if (!object(config) || Object.keys(config).some(key => !['issuer', 'audience'].includes(key)) ||
      typeof config.issuer !== 'string' ||
      !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(config.issuer) ||
      typeof config.audience !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(config.audience)) reject(503);
    return config;
  } catch { reject(503); }
  finally { await file?.close().catch(() => {}); }
}

function decodePart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) reject(401);
  const bytes = Buffer.from(part, 'base64url');
  if (bytes.toString('base64url') !== part) reject(401);
  return bytes;
}
function parseToken(token, config, now) {
  try {
    if (typeof token !== 'string' || Buffer.byteLength(token) > MAX_JWT_BYTES) reject(401);
    const parts = token.split('.');
    if (parts.length !== 3) reject(401);
    const header = JSON.parse(decoder.decode(decodePart(parts[0])));
    const claims = JSON.parse(decoder.decode(decodePart(parts[1])));
    const signature = decodePart(parts[2]);
    if (!object(header) || header.alg !== 'RS256' ||
      typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid) ||
      (header.typ !== undefined && header.typ !== 'JWT') ||
      Object.keys(header).some(key => !['alg', 'kid', 'typ'].includes(key)) ||
      !object(claims) || claims.iss !== config.issuer || claims.type !== 'app' ||
      !integer(claims.exp, 1, Number.MAX_SAFE_INTEGER) || claims.exp <= now ||
      !integer(claims.iat, 0, Number.MAX_SAFE_INTEGER) || claims.iat > now + 30 || claims.exp <= claims.iat ||
      (claims.nbf !== undefined && (!integer(claims.nbf, 0, Number.MAX_SAFE_INTEGER) || claims.nbf > now + 30))) reject(401);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.length || audiences.length > 16 || audiences.some(aud => typeof aud !== 'string') ||
      !audiences.includes(config.audience) || signature.length < 256 || signature.length > 512) reject(401);
    return { kid: header.kid, bytes: Buffer.from(parts[0] + '.' + parts[1]), signature, expires: claims.exp };
  } catch (error) { if (error instanceof GateError) throw error; reject(401); }
}

/** Default loader only receives the validated, configured issuer's fixed URL. */
export async function loadAccessJwks({ url, signal }) {
  const response = await fetch(url, { signal, redirect: 'error', headers: { accept: 'application/json' } });
  if (!response.ok || !response.body) throw new Error('Access keys unavailable');
  if (Number(response.headers.get('content-length')) > MAX_JWKS_BYTES) {
    await response.body.cancel(); throw new Error('Access keys too large');
  }
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > MAX_JWKS_BYTES) throw new Error('Access keys too large');
    chunks.push(chunk);
  }
  return JSON.parse(decoder.decode(Buffer.concat(chunks, length)));
}
function publicKeys(document) {
  if (!object(document) || Buffer.byteLength(JSON.stringify(document)) > MAX_JWKS_BYTES ||
    !Array.isArray(document.keys) || !document.keys.length || document.keys.length > 8) reject(503);
  const keys = new Map();
  for (const jwk of document.keys) {
    if (!object(jwk) || jwk.kty !== 'RSA' || jwk.alg !== 'RS256' || jwk.use !== 'sig' ||
      typeof jwk.kid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(jwk.kid) || keys.has(jwk.kid) ||
      typeof jwk.n !== 'string' || typeof jwk.e !== 'string' ||
      ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some(field => field in jwk)) reject(503);
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    const bits = key.asymmetricKeyDetails?.modulusLength;
    if (key.asymmetricKeyType !== 'rsa' || !integer(bits, 2048, 4096)) reject(503);
    keys.set(jwk.kid, key);
  }
  return keys;
}
function keyResolver({ jwksLoader, jwksTimeoutMs, jwksCacheMs, jwksRefreshMinMs, now }) {
  let state;
  return async (issuer, kid) => {
    if (state?.issuer !== issuer) state = { issuer, keys: new Map(), expires: 0, attempted: -Infinity, pending: null };
    const selected = state;
    if (now() < selected.expires && selected.keys.has(kid)) return selected.keys.get(kid);
    if (!selected.pending && now() - selected.attempted >= jwksRefreshMinMs) {
      selected.attempted = now();
      selected.pending = (async () => {
        const controller = new AbortController(); let timer;
        try {
          const timeout = new Promise((_, fail) => { timer = setTimeout(() => {
            controller.abort(); fail(new GateError(503));
          }, jwksTimeoutMs); });
          const document = await Promise.race([
            Promise.resolve().then(() => jwksLoader({ issuer, url: issuer + '/cdn-cgi/access/certs', signal: controller.signal })), timeout,
          ]);
          selected.keys = publicKeys(document); selected.expires = now() + jwksCacheMs;
        } catch { reject(503); }
        finally { clearTimeout(timer); controller.abort(); }
      })();
      try { await selected.pending; } finally { selected.pending = null; }
    } else if (selected.pending) await selected.pending;
    if (now() >= selected.expires) reject(503); // Never use expired keys after a fetch failure.
    const key = selected.keys.get(kid);
    if (!key) reject(401);
    return key;
  };
}

function privacy(res) { for (const [key, value] of Object.entries(PRIVACY_HEADERS)) res.setHeader(key, value); }
function reply(res, status, message = STATUS_CODES[status], extra = {}) {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...extra,
    ...PRIVACY_HEADERS, connection: 'close' });
  res.end(message + '\n');
}
function socketReply(socket, status) {
  if (socket.destroyed || !socket.writable || socket.writableEnded) return;
  const body = STATUS_CODES[status] + '\n';
  socket.end('HTTP/1.1 ' + status + ' ' + STATUS_CODES[status] + '\r\n' +
    Object.entries({ ...PRIVACY_HEADERS, connection: 'close', 'content-type': 'text/plain; charset=utf-8',
      'content-length': Buffer.byteLength(body) }).map(([k, v]) => k + ': ' + v).join('\r\n') + '\r\n\r\n' + body);
}
function hopHeaders(headers) {
  return new Set([...HOP_HEADERS, ...String(headers.connection || '').toLowerCase().split(',').map(x => x.trim())]);
}
function requestHeaders(req, publicHost, length) {
  const excluded = hopHeaders(req.headers); const result = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (excluded.has(key) || key === 'host' || key === 'content-length' ||
      /^(?:cf-|oai-|x-oai-|x-forwarded-|x-auth-|x-authenticated-|x-user-|x-remote-|x-internal-|x-envoy-|x-amzn-|x-arr-)/.test(key) ||
      ['forwarded', 'x-real-ip', 'true-client-ip', 'x-client-ip', 'client-ip', 'x-cluster-client-ip',
        'x-original-forwarded-for', 'remote-user', 'remote-addr'].includes(key)) continue;
    if (key === 'authorization' && !/^Bearer [^\s]+$/i.test(value)) continue;
    if (key === 'cookie') {
      const cookies = String(value).split(';').filter(cookie => !/^\s*CF_(?:Authorization|Binding|Session|AppSession|Device)\s*=/i.test(cookie));
      if (cookies.length) result.cookie = cookies.join(';');
    } else result[key] = value;
  }
  return { ...result, host: publicHost, 'x-forwarded-proto': 'https', 'content-length': String(length), connection: 'close' };
}
async function bodyBytes(req, limit) {
  const chunks = []; let length = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > limit) reject(413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

/** Returns an unbound HTTP server. jwksLoader/now are injection seams for local tests only. */
export function createPreviewGateway({
  publicHost = 'testing.knaba.de', upstream = 'http://127.0.0.1:19121', authFile,
  maxBodyBytes = 1024 * 1024, requestTimeoutMs = 30000, upstreamTimeoutMs = 15000,
  jwksTimeoutMs = 5000, jwksCacheMs = 300000, jwksRefreshMinMs = 30000,
  maxConcurrentRequests = 32, jwksLoader = loadAccessJwks, now = Date.now,
} = {}) {
  if (typeof publicHost !== 'string' || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(publicHost) ||
    !integer(maxBodyBytes, 1, 8 * 1024 * 1024) || !integer(requestTimeoutMs, 20, 120000) ||
    !integer(upstreamTimeoutMs, 10, 120000) || !integer(jwksTimeoutMs, 10, 30000) ||
    !integer(jwksCacheMs, 10, 600000) || !integer(jwksRefreshMinMs, 1, jwksCacheMs) ||
    !integer(maxConcurrentRequests, 1, 128) || typeof jwksLoader !== 'function' || typeof now !== 'function')
    throw new Error('Invalid preview gateway configuration');
  const target = new URL(upstream);
  if (target.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost', 'web'].includes(target.hostname) ||
    target.username || target.password || target.pathname !== '/' || target.search || target.hash)
    throw new Error('Preview upstream must be the local application');
  const getKey = keyResolver({ jwksLoader, jwksTimeoutMs, jwksCacheMs, jwksRefreshMinMs, now });
  const headerTimers = new WeakMap(); let active = 0;
  // Handle missing Host ourselves so Node's automatic 400 cannot omit privacy headers.
  const server = createServer({ maxHeaderSize: 32768, requestTimeout: 0, headersTimeout: 0, requireHostHeader: false });
  server.maxHeadersCount = 100;
  server.on('connection', socket => {
    const timer = setTimeout(() => socketReply(socket, 408), requestTimeoutMs);
    headerTimers.set(socket, timer);
    socket.once('close', () => clearTimeout(timer));
  });
  const handle = async (req, res) => {
    clearTimeout(headerTimers.get(req.socket)); privacy(res);
    if (active >= maxConcurrentRequests) { reply(res, 503); return; }
    active++;
    let upstreamRequest, upstreamResponse, forwarded = false;
    const timer = setTimeout(() => {
      reply(res, forwarded ? 504 : 408); upstreamRequest?.destroy();
    }, requestTimeoutMs);
    let released = false;
    const release = () => {
      if (released) return; released = true; active--; clearTimeout(timer);
      upstreamRequest?.destroy(); upstreamResponse?.destroy();
    };
    res.once('close', release); res.once('finish', release);
    try {
      const count = name => req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === name).length;
      if (count('host') !== 1 || String(req.headers.host).toLowerCase() !== publicHost) reject(421);
      if (!req.url?.startsWith('/') || req.url.startsWith('//') || /[\\\x00-\x20\x7f]/.test(req.url)) reject(400);
      const config = await readConfiguration(authFile);
      if (count('cf-access-jwt-assertion') !== 1) reject(401);
      const token = parseToken(req.headers['cf-access-jwt-assertion'], config, Math.floor(now() / 1000));
      const key = await getKey(config.issuer, token.kid);
      if (token.expires <= Math.floor(now() / 1000) ||
        !verify('RSA-SHA256', token.bytes, { key, padding: cryptoConstants.RSA_PKCS1_PADDING }, token.signature)) reject(401);
      if (!METHODS.has(req.method)) reject(405);
      if (req.headers.expect && req.headers.expect.toLowerCase() !== '100-continue') reject(417);
      const declared = req.headers['content-length'];
      if (declared !== undefined && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) reject(400);
      if (Number(declared || 0) > maxBodyBytes) reject(413);
      if (res.destroyed || res.writableEnded) return;
      if (req.headers.expect) res.writeContinue();
      const body = await bodyBytes(req, maxBodyBytes);
      if (res.destroyed || res.writableEnded) return;
      if (['GET', 'HEAD'].includes(req.method) && body.length) reject(400);
      const path = req.url.split('?', 1)[0];
      if (['GET', 'HEAD'].includes(req.method) && path === '/robots.txt') {
        reply(res, 200, 'User-agent: *\nDisallow: /'); return;
      }
      if (['GET', 'HEAD'].includes(req.method) && /^\/sitemap(?:[^/]*)\.xml$/.test(path)) { reply(res, 404); return; }
      forwarded = true;
      upstreamRequest = httpRequest(target, { method: req.method, path: req.url, agent: false,
        headers: requestHeaders(req, publicHost, body.length), maxHeaderSize: 32768 }, response => {
        upstreamResponse = response;
        const headers = {}; const excluded = hopHeaders(response.headers);
        for (const [key, value] of Object.entries(response.headers)) {
          if (!excluded.has(key) && !(key in PRIVACY_HEADERS)) headers[key] = value;
        }
        if (res.destroyed || res.writableEnded) { response.destroy(); return; }
        res.writeHead(response.statusCode, { ...headers, ...PRIVACY_HEADERS, connection: 'close' });
        response.on('error', () => reply(res, 502));
        response.on('aborted', () => reply(res, 502));
        response.pipe(res);
      });
      upstreamRequest.setTimeout(upstreamTimeoutMs, () => { reply(res, 504); upstreamRequest.destroy(); });
      upstreamRequest.on('error', () => reply(res, 502));
      upstreamRequest.on('upgrade', (_response, socket) => { socket.destroy(); reply(res, 502); });
      upstreamRequest.end(body);
    } catch (error) { reply(res, error instanceof GateError ? error.status : 502); }
  };
  server.on('request', (req, res) => { void handle(req, res); });
  server.on('checkContinue', (req, res) => { void handle(req, res); });
  server.on('checkExpectation', (req, res) => { void handle(req, res); });
  server.on('clientError', (error, socket) => socketReply(socket, error.code === 'HPE_HEADER_OVERFLOW' ? 431 : 400));
  // This HTTP proxy never supports CONNECT/WebSockets, irrespective of identity.
  server.on('connect', (_req, socket) => socketReply(socket, 405));
  server.on('upgrade', (_req, socket) => socketReply(socket, 405));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const port = Number(process.env.KNABA_PREVIEW_PORT || 8081);
    const bind = process.env.KNABA_PREVIEW_BIND || '127.0.0.1';
    if (!integer(port, 1, 65535) || !['127.0.0.1', '0.0.0.0', '::1'].includes(bind)) throw new Error('Invalid bind');
    const server = createPreviewGateway({ publicHost: process.env.KNABA_PREVIEW_HOST || 'testing.knaba.de',
      upstream: process.env.KNABA_PREVIEW_UPSTREAM || 'http://127.0.0.1:19121',
      authFile: process.env.KNABA_PREVIEW_AUTH_FILE });
    server.on('error', () => { process.stderr.write('KNABA preview gateway unavailable\n'); process.exitCode = 1; });
    server.listen(port, bind, () => process.stdout.write('KNABA preview gateway listening; Access validation required\n'));
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
      server.close(); server.closeAllConnections();
    });
  } catch { process.stderr.write('Invalid KNABA preview gateway configuration\n'); process.exitCode = 1; }
}
