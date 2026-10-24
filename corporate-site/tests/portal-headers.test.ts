import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import worker from '../worker/index';
import type { WorkerEnv } from '../worker/types';

const origin = 'https://kneba.vsp.rest';
function fixture(status = 200): WorkerEnv {
  return {ASSETS: {fetch: async () => new Response(status === 200 ? '<html><h1>KnaBa Portal</h1></html>' : 'Not found', {
    status, headers: {'Content-Type':'text/html','Cache-Control':'public, max-age=0, must-revalidate'}
  })}};
}
describe('portal document security at the edge', () => {
  it('prevents cross-site framing and sensitive portal HTML caching', async () => {
    for (const path of ['/konto', '/konto/', '/konto/extra']) {
      const result = await worker.fetch(new Request(origin + path), fixture());
      expect(result.status).toBe(200);
      expect(result.headers.get('X-Frame-Options')).toBe('DENY');
      expect(result.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
      expect(result.headers.get('Cache-Control')).toContain('no-store');
      expect(result.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
      expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(await result.text()).toContain('KnaBa Portal');
    }
  });
  it('keeps the edge headers for portal 404s, without changing marketing asset handling', async () => {
    const notFound = await worker.fetch(new Request(origin + '/konto/missing'), fixture(404));
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get('X-Frame-Options')).toBe('DENY');
    const normal = await worker.fetch(new Request(origin + '/berlin/'), fixture());
    expect(normal.headers.get('X-Frame-Options')).toBeNull();
    expect(normal.headers.get('Cache-Control')).toContain('public');
  });
  it('routes portal documents through the Worker, keeping other static pages asset-first', () => {
    const source = readFileSync(new URL('../vite.worker.config.ts', import.meta.url), 'utf8');
    expect(source).toContain("'/konto'");
    expect(source).toContain("'/konto/*'");
    expect(source).not.toContain('run_worker_first: true');
  });
});
