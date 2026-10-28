import { describe, expect, it, vi } from 'vitest';
import worker from '../worker/index';
import { handleApi } from '../worker/api';
import type { WorkerEnv } from '../worker/types';

const origin = 'https://knaba-test.example';
const request = (path = '/', method = 'GET') => new Request(origin + path, { method });
function assets(response: Response, extra: Partial<WorkerEnv> = {}) {
  const fetch = vi.fn(async (_request: Request) => response);
  return { env: { ...extra, ASSETS: { fetch } } as WorkerEnv, fetch };
}

describe('native Worker static response headers', () => {
  it.each([undefined, '', 'staging', 'OFFICIAL', 'unknown'])('defaults to staging noindex for release mode %s', async mode => {
    const upstream = new Response('original HTML', { headers: { 'Content-Type': 'text/html', ETag: '"page-v1"' } });
    const { env, fetch } = assets(upstream, { KNABA_RELEASE_MODE: mode });
    const req = request('/en/');
    const response = await worker.fetch(req, env);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(req);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(response.headers.get('ETag')).toBe('"page-v1"');
    expect(await response.text()).toBe('original HTML');
    expect(upstream.headers.has('X-Robots-Tag')).toBe(false);
  });

  it('permits public indexing only in explicit official mode and retains an upstream crawler restriction', async () => {
    const { env } = assets(new Response('public'), { KNABA_RELEASE_MODE: 'official' });
    expect((await worker.fetch(request('/unternehmen/'), env)).headers.has('X-Robots-Tag')).toBe(false);
    const restricted = assets(new Response('restricted', { headers: { 'X-Robots-Tag': 'noindex, nofollow' } }), { KNABA_RELEASE_MODE: 'official' });
    expect((await worker.fetch(request('/app/'), restricted.env)).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it.each(['/app/', '/konto/'])('retains upstream crawler restrictions while applying staging policy on %s', async route => {
    const { env } = assets(new Response('restricted', { headers: { 'X-Robots-Tag': 'nofollow, noarchive' } }));
    const response = await worker.fetch(request(route), env);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
    const alreadyRestricted = assets(new Response('restricted', { headers: { 'X-Robots-Tag': 'noindex, nofollow' } }));
    expect((await worker.fetch(request(route), alreadyRestricted.env)).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('adds global private restrictions even when the upstream robots header is agent-scoped', async () => {
    const { env } = assets(new Response('private', { headers: { 'X-Robots-Tag': 'googlebot: noindex, nofollow' } }), { KNABA_RELEASE_MODE: 'official' });
    const response = await worker.fetch(request('/konto/'), env);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, googlebot: noindex, nofollow');
  });

  it.each(['/admin', '/admin/', '/studio/', '/crm/', '/konto/', '/ru/konto/', '/en/konto/', '/uk/konto/', '/postfach/', '/ru/postfach/', '/login/', '/logout/', '/%6bonto/'])('keeps private route %s uncacheable in official mode', async route => {
    const { env } = assets(new Response('private shell', { headers: { 'Cache-Control': 'public, max-age=3600' } }), { KNABA_RELEASE_MODE: 'official' });
    const response = await worker.fetch(request(route), env);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(await response.text()).toBe('private shell');
  });

  it('preserves public asset caching and applies the existing immutable _astro policy', async () => {
    const publicAsset = assets(new Response('image', { headers: { 'Cache-Control': 'public, max-age=300' } }));
    expect((await worker.fetch(request('/images/example.png'), publicAsset.env)).headers.get('Cache-Control')).toBe('public, max-age=300');
    const hashed = assets(new Response('script', { headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'public, max-age=0' } }));
    const response = await worker.fetch(request('/_astro/page.abc123.js'), hashed.env);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(await response.text()).toBe('script');
    const similarPublicPath = assets(new Response('public', { headers: { 'Cache-Control': 'public, max-age=300' } }), { KNABA_RELEASE_MODE: 'official' });
    const publicResponse = await worker.fetch(request('/studio-guide/'), similarPublicPath.env);
    expect(publicResponse.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(publicResponse.headers.has('X-Robots-Tag')).toBe(false);
  });

  it('preserves streaming binary range bytes, status and representation headers', async () => {
    const bytes = new Uint8Array([0, 128, 255, 13]);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
    const upstream = new Response(stream, { status: 206, statusText: 'Partial Content', headers: {
      'Content-Type': 'application/octet-stream', 'Content-Range': 'bytes 4-7/12', 'Content-Length': '4',
      'Accept-Ranges': 'bytes', ETag: '"binary-v1"', 'Last-Modified': 'Wed, 28 Oct 2026 10:00:00 GMT',
    } });
    const { env } = assets(upstream);
    const response = await worker.fetch(request('/images/range.bin'), env);
    expect(response.status).toBe(206);
    expect(response.statusText).toBe('Partial Content');
    for (const [name, value] of upstream.headers) expect(response.headers.get(name)).toBe(value);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...bytes]);
  });

  it.each([{ method: 'HEAD', status: 200 }, { method: 'GET', status: 304 }, { method: 'HEAD', status: 304 }])('preserves a bodyless $method $status response', async ({ method, status }) => {
    const upstream = new Response(null, { status, headers: { ETag: '"unchanged"', 'Content-Type': 'text/html', 'Content-Length': '1200' } });
    const { env, fetch } = assets(upstream);
    const req = request('/', method);
    const response = await worker.fetch(req, env);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(req);
    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
    expect(response.headers.get('Content-Length')).toBe('1200');
    expect(response.headers.get('ETag')).toBe('"unchanged"');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow');
  });

  it('handles immutable redirect headers without changing the redirect', async () => {
    const { env } = assets(Response.redirect(origin + '/konto/', 308));
    const response = await worker.fetch(request('/konto'), env);
    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe(origin + '/konto/');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.body).toBeNull();
  });

  it('preserves an asset 404 body and status without allowing error indexing in official mode', async () => {
    const { env } = assets(new Response('not found page', { status: 404, statusText: 'Not Found', headers: { 'Content-Type': 'text/html' } }), { KNABA_RELEASE_MODE: 'official' });
    const response = await worker.fetch(request('/missing/'), env);
    expect(response.status).toBe(404);
    expect(response.statusText).toBe('Not Found');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(await response.text()).toBe('not found page');
  });

  it('adds static safety headers to the unavailable-assets fallback and respects HEAD', async () => {
    for (const method of ['GET', 'HEAD']) {
      const response = await worker.fetch(request('/', method), {});
      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Type')).toBe('text/plain;charset=UTF-8');
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
      expect(await response.text()).toBe(method === 'HEAD' ? '' : 'Dienst derzeit nicht verfügbar.');
    }
  });

  it.each([404, 503])('does not cache an _astro asset failure (%s) as immutable', async status => {
    const { env } = assets(new Response('asset unavailable', { status, headers: { 'Cache-Control': 'no-store' } }));
    const response = await worker.fetch(request('/_astro/missing.js'), env);
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(await response.text()).toBe('asset unavailable');
  });

  it.each(['/api/portal/session', '/api/portal/dashboard', '/api/studio/published?page=%2F', '/api/assistant/captcha', '/api/reviews'])('leaves API response bytes, status and headers unchanged for %s', async route => {
    const { env, fetch } = assets(new Response('must not serve API as asset'));
    const expected = await handleApi(request(route), env);
    const actual = await worker.fetch(request(route), env);
    expect(fetch).not.toHaveBeenCalled();
    expect(actual.status).toBe(expected.status);
    expect([...actual.headers]).toEqual([...expected.headers]);
    expect(await actual.text()).toBe(await expected.text());
  });
});
