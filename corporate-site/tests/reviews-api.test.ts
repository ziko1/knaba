import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleReviews, ReviewFault, type ReviewActor } from '../worker/reviews';
import { handleApi } from '../worker/api';
import type { D1Database, D1Result, D1Statement, WorkerEnv } from '../worker/types';

const origin = 'https://kneba.vsp.rest';
const owner = { owner: true, id: 'owner-id' };
const anonymous = { owner: false, id: null };
const valid = { displayName: 'Test Customer', email: 'customer@example.test', company: 'Example Company', relationship: 'client', text: 'The communication was clear and the agreed work was completed.', consent: true, website: '' };
let sqlite: DatabaseSync;
let env: WorkerEnv;
function bridge(database: DatabaseSync): D1Database {
  function statement(query: string, values: unknown[] = []): D1Statement {
    return {
      bind: (...v: unknown[]) => statement(query, v),
      first: async<T>() => (database.prepare(query).get(...values as []) || null) as T | null,
      all: async<T>() => ({ success: true, results: database.prepare(query).all(...values as []) as T[] }),
      run: async() => { const info = database.prepare(query).run(...values as []); return { success: true, meta: { changes: Number(info.changes) } }; },
    };
  }
  return { prepare: (query: string) => statement(query), batch: async<T>(statements: D1Statement[]): Promise<D1Result<T>[]> => {
    database.exec('BEGIN IMMEDIATE');
    try {
      const result: D1Result<T>[] = [];
      for (const item of statements) result.push(await item.run() as D1Result<T>);
      database.exec('COMMIT'); return result;
    } catch (error) { database.exec('ROLLBACK'); throw error; }
  } };
}
function request(method: string, path = '/api/reviews', body?: unknown, key = 'review-request-000001', headers: Record<string, string> = {}) {
  return new Request(origin + path, { method, headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin', 'x-knaba-request': 'portal-v1', 'idempotency-key': key, 'cf-connecting-ip': '192.0.2.42', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function invoke(req: Request, actor: ReviewActor = anonymous) {
  try {
    const response = await handleReviews(req, env, actor);
    return { status: response.status, headers: response.headers, body: await response.json() as Record<string, any> };
  } catch (error) {
    if (error instanceof ReviewFault) return { status: error.status, headers: new Headers(), body: { error: { code: error.code, message: error.message } } };
    throw error;
  }
}
function row() { return sqlite.prepare('SELECT * FROM public_reviews').get() as Record<string, any>; }
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle', import.meta.url)).filter(name => name.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '\n'));
  env = { DB: bridge(sqlite), OWNER_EMAIL: 'owner@example.test' };
});
afterEach(() => { sqlite.close(); vi.unstubAllGlobals(); });

describe('public reviews: separate consent, real persistence and owner moderation', () => {
  it('starts empty and never publishes a new submission without owner review', async() => {
    expect((await invoke(request('GET'))).body).toEqual({ reviews: [], total: 0 });
    const submission = await invoke(request('POST', '/api/reviews', valid));
    expect(submission.status).toBe(201); expect(submission.body).toEqual({ submitted: true });
    expect(row()).toMatchObject({ status: 'pending', consent_version: '2026-10-25', email: valid.email, version: 1 });
    expect(row().consent_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect((await invoke(request('GET'))).body).toEqual({ reviews: [], total: 0 });
    expect(sqlite.prepare('SELECT action,actor_id FROM portal_audit').all()).toEqual([{ action: 'review.submitted', actor_id: 'public' }]);
    const managed = await invoke(request('GET', '/api/reviews/manage'), owner);
    expect(managed.body.reviews[0]).toMatchObject({ email: valid.email, status: 'pending', consentVersion: '2026-10-25', version: 1 });
  });
  it('publishes and hides original text with version checks and atomic PII-free audit', async() => {
    await invoke(request('POST', '/api/reviews', valid));
    const id = row().id;
    const published = await invoke(request('PATCH', '/api/reviews/' + id, { version: 1, status: 'published' }), owner);
    expect(published.status).toBe(200); expect(published.body.review.version).toBe(2);
    const listing = await invoke(request('GET'));
    expect(listing.headers.get('Cache-Control')).toContain('no-store');
    expect(listing.body.total).toBe(1);
    expect(Object.keys(listing.body.reviews[0]).sort()).toEqual(['company', 'createdAt', 'displayName', 'id', 'relationship', 'text']);
    expect(JSON.stringify(listing.body)).not.toContain(valid.email);
    expect(listing.body.reviews[0].text).toBe(valid.text);
    expect((await invoke(request('PATCH', '/api/reviews/' + id, { version: 1, status: 'hidden' }), owner)).status).toBe(409);
    expect((await invoke(request('PATCH', '/api/reviews/' + id, { version: 2, status: 'published', text: 'Changed original text' }), owner)).status).toBe(422);
    expect((await invoke(request('PATCH', '/api/reviews/' + id, { version: 2, status: 'hidden' }), owner)).status).toBe(200);
    expect((await invoke(request('GET'))).body).toEqual({ reviews: [], total: 0 });
    expect(row().review_text).toBe(valid.text);
    const audit = sqlite.prepare('SELECT action FROM portal_audit ORDER BY rowid').all();
    expect(audit).toEqual([{ action: 'review.submitted' }, { action: 'review.published' }, { action: 'review.hidden' }]);
    expect(JSON.stringify(sqlite.prepare('SELECT * FROM portal_audit').all())).not.toContain(valid.email);
  });
  it('rejects missing consent, bad text, unknown fields, invalid roles and honeypots without storage', async() => {
    for (const mutation of [{ consent: false }, { consent: 'true' }, { text: 'Too short' }, { text: 'x'.repeat(1201) }, { displayName: 'x' }, { displayName: 'Bad\nName' }, { email: 'bad' }, { relationship: 'admin' }, { rating: 5 }, { website: 'https://spam.test' }, { company: null }]) {
      expect((await invoke(request('POST', '/api/reviews', { ...valid, ...mutation }))).status).toBe(422);
    }
    expect(sqlite.prepare('SELECT count(*) AS total FROM public_reviews').get()).toEqual({ total: 0 });
  });
  it('blocks CSRF, spoofed owner headers, non-owner reads and non-owner mutations', async() => {
    await invoke(request('POST', '/api/reviews', valid)); const id = row().id;
    expect((await invoke(request('POST', '/api/reviews', valid, 'review-request-000002', { origin: 'https://evil.test' }))).status).toBe(403);
    expect((await invoke(request('POST', '/api/reviews', valid, 'review-request-000002', { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
    expect((await invoke(request('POST', '/api/reviews', valid, 'review-request-000002', { 'x-knaba-request': '' }))).status).toBe(403);
    const spoof = { 'oai-authenticated-user-id': 'owner-id', 'oai-authenticated-user-email': 'owner@example.test' };
    expect((await invoke(request('GET', '/api/reviews/manage', undefined, 'review-request-000001', spoof))).status).toBe(401);
    expect((await invoke(request('GET', '/api/reviews/manage'), { owner: false, id: 'admin-id' })).status).toBe(403);
    expect((await invoke(request('PATCH', '/api/reviews/' + id, { version: 1, status: 'published' }))).status).toBe(401);
    expect((await invoke(request('PATCH', '/api/reviews/' + id, { version: 1, status: 'published' }), { owner: false, id: 'admin-id' })).status).toBe(403);
    expect((await invoke(request('PATCH', '/api/reviews/' + id, { version: 1, status: 'published' }, 'review-request-000001', { origin: 'https://evil.test' }), owner)).status).toBe(403);
    expect(row().status).toBe('pending');
  });
  it('replays one request without duplicates or captcha reuse and rejects changed payloads', async() => {
    env.TURNSTILE_SITE_KEY = 'test-site-key-123'; env.TURNSTILE_SECRET_KEY = 'test-secret-key-123'; env.TURNSTILE_REQUIRED = '1';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, hostname: 'kneba.vsp.rest' })));
    vi.stubGlobal('fetch', fetchMock);
    expect((await invoke(request('POST', '/api/reviews', { ...valid, captchaToken: 'valid-one-time-token' }))).status).toBe(201);
    expect((await invoke(request('POST', '/api/reviews', { ...valid, captchaToken: 'already-consumed' }))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await invoke(request('POST', '/api/reviews', { ...valid, text: 'A different review for an already used request token.' }))).status).toBe(409);
    expect(sqlite.prepare('SELECT count(*) AS total FROM public_reviews').get()).toEqual({ total: 1 });
    expect(sqlite.prepare('SELECT count(*) AS total FROM portal_audit').get()).toEqual({ total: 1 });
  });
  it('fails closed if mandatory captcha is unavailable, invalid or for another hostname', async() => {
    env.TURNSTILE_REQUIRED = '1';
    expect((await invoke(request('GET', '/api/reviews/captcha'))).body.unavailable).toBe(true);
    expect((await invoke(request('POST', '/api/reviews', valid))).body.error.code).toBe('captcha_unavailable');
    env.TURNSTILE_SITE_KEY = 'test-site-key-123'; env.TURNSTILE_SECRET_KEY = 'test-secret-key-123';
    expect((await invoke(request('POST', '/api/reviews', valid))).body.error.code).toBe('captcha');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, hostname: 'evil.test' }))));
    expect((await invoke(request('POST', '/api/reviews', { ...valid, captchaToken: 'valid-token-wrong-host' }))).body.error.code).toBe('captcha');
    expect(sqlite.prepare('SELECT count(*) AS total FROM public_reviews').get()).toEqual({ total: 0 });
  });
  it('does not let failed CAPTCHA attempts consume another person’s email allowance', async() => {
    env.TURNSTILE_SITE_KEY = 'test-site-key-123'; env.TURNSTILE_SECRET_KEY = 'test-secret-key-123'; env.TURNSTILE_REQUIRED = '1';
    let accepted = false;
    const fetchMock = vi.fn().mockImplementation(async() => new Response(JSON.stringify({ success: accepted, hostname: 'kneba.vsp.rest' })));
    vi.stubGlobal('fetch', fetchMock);
    for (let i = 0; i < 5; i++) {
      const rejected = await invoke(request('POST', '/api/reviews', valid, 'missing-captcha-' + String(i).padStart(8, '0')));
      expect(rejected.status).toBe(422); expect(rejected.body.error.code).toBe('captcha');
    }
    expect(fetchMock).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i++) {
      const rejected = await invoke(request('POST', '/api/reviews', { ...valid, captchaToken: 'invalid-captcha-token' }, 'invalid-captcha-' + String(i).padStart(8, '0')));
      expect(rejected.status).toBe(422); expect(rejected.body.error.code).toBe('captcha');
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(sqlite.prepare("SELECT count(*) AS total FROM portal_rate_limits WHERE key LIKE 'review-email:%'").get()).toEqual({ total: 0 });
    expect(sqlite.prepare('SELECT count(*) AS total FROM public_reviews').get()).toEqual({ total: 0 });
    expect(sqlite.prepare('SELECT count(*) AS total FROM portal_audit').get()).toEqual({ total: 0 });
    accepted = true;
    for (let i = 0; i < 5; i++)
      expect((await invoke(request('POST', '/api/reviews', { ...valid, captchaToken: 'valid-captcha-token-' + i }, 'verified-review-' + String(i).padStart(8, '0')))).status).toBe(201);
    const capped = await invoke(request('POST', '/api/reviews', { ...valid, captchaToken: 'valid-captcha-token-cap' }, 'verified-review-cap'));
    expect(capped.status).toBe(429); expect(capped.body.error.code).toBe('rate_limit');
    expect(sqlite.prepare('SELECT count(*) AS total FROM public_reviews').get()).toEqual({ total: 5 });
  });
  it('enforces persisted per-email and hashed per-IP quotas while allowing replay', async() => {
    for (let i = 0; i < 5; i++) expect((await invoke(request('POST', '/api/reviews', valid, 'review-request-00000' + i))).status).toBe(201);
    expect((await invoke(request('POST', '/api/reviews', valid, 'review-request-000005'))).status).toBe(429);
    expect((await invoke(request('POST', '/api/reviews', valid, 'review-request-000000'))).status).toBe(200);
    for (let i = 0; i < 14; i++) expect((await invoke(request('POST', '/api/reviews', { ...valid, email: `user${i}@example.test` }, 'review-request-' + String(i).padStart(8, '0')))).status).toBe(201);
    expect((await invoke(request('POST', '/api/reviews', { ...valid, email: 'last@example.test' }, 'review-request-ip-cap'))).status).toBe(429);
    const rates = JSON.stringify(sqlite.prepare('SELECT key FROM portal_rate_limits').all());
    expect(rates).not.toContain('192.0.2.42'); expect(rates).not.toContain(valid.email);
  });
  it('bounds body bytes, validates JSON and rejects invalid request identifiers', async() => {
    expect((await invoke(request('POST', '/api/reviews', { ...valid, text: 'x'.repeat(13_000) }))).status).toBe(413);
    expect((await invoke(request('POST', '/api/reviews', valid, 'short'))).status).toBe(422);
    expect((await invoke(request('POST', '/api/reviews', valid, 'review-request-000001', { 'content-type': 'text/plain' }))).status).toBe(415);
    expect((await invoke(request('POST', '/api/reviews', []))).status).toBe(400);
    expect((await invoke(new Request(origin + '/api/reviews', { method: 'POST', headers: { origin, 'x-knaba-request': 'portal-v1', 'content-type': 'application/json' }, body: '{bad' }))).status).toBe(400);
  });
  it('keeps a failed audit write atomic with submission and publication', async() => {
    sqlite.exec("CREATE TRIGGER fail_review_audit BEFORE INSERT ON portal_audit BEGIN SELECT RAISE(ABORT,'test-failure'); END;");
    await expect(invoke(request('POST', '/api/reviews', valid))).rejects.toThrow('test-failure');
    expect(sqlite.prepare('SELECT count(*) AS total FROM public_reviews').get()).toEqual({ total: 0 });
    sqlite.exec('DROP TRIGGER fail_review_audit;');
    await invoke(request('POST', '/api/reviews', valid)); const id = row().id;
    sqlite.exec("CREATE TRIGGER fail_review_audit BEFORE INSERT ON portal_audit BEGIN SELECT RAISE(ABORT,'test-failure'); END;");
    await expect(invoke(request('PATCH', '/api/reviews/' + id, { version: 1, status: 'published' }), owner)).rejects.toThrow('test-failure');
    expect(row()).toMatchObject({ status: 'pending', version: 1 });
  });
  it('caps public results at twelve and reports the real published count', async() => {
    for (let i = 0; i < 14; i++) {
      await invoke(request('POST', '/api/reviews', { ...valid, email: `viewer${i}@example.test`, relationship: 'partner' }, 'review-request-' + String(i).padStart(8, '0')));
      const stored = sqlite.prepare('SELECT id FROM public_reviews WHERE email=?').get(`viewer${i}@example.test`) as { id: string };
      await invoke(request('PATCH', '/api/reviews/' + stored.id, { version: 1, status: 'published' }), owner);
    }
    const listing = await invoke(request('GET'));
    expect(listing.body.total).toBe(14); expect(listing.body.reviews).toHaveLength(12);
    expect(listing.body.reviews.every((review: any) => review.relationship === 'partner')).toBe(true);
  });
  it('paginates and filters moderation so older published reviews stay reachable', async() => {
    await invoke(request('POST', '/api/reviews', valid));
    const first = row();
    for (let i = 0; i < 104; i++) {
      const status = i < 100 ? 'pending' : i < 103 ? 'published' : 'hidden';
      sqlite.prepare('INSERT INTO public_reviews SELECT ?,display_name,email,company,relationship,review_text,?,consent_at,consent_version,dedupe_scope,?,payload_hash,created_at,updated_at,published_at,version,last_mutation FROM public_reviews WHERE id=?')
        .run('fixture-review-' + String(i).padStart(3, '0'), status, 'fixture-key-' + i, first.id);
    }
    const page1 = await invoke(request('GET', '/api/reviews/manage'), owner);
    expect(page1.body).toMatchObject({ total: 105, limit: 50, offset: 0, hasMore: true, status: 'all' });
    expect(page1.body.reviews).toHaveLength(50);
    const page2 = await invoke(request('GET', '/api/reviews/manage?offset=50'), owner);
    expect(page2.body.reviews).toHaveLength(50);
    const ids = new Set(page1.body.reviews.map((review: any) => review.id));
    expect(page2.body.reviews.every((review: any) => !ids.has(review.id))).toBe(true);
    const published = await invoke(request('GET', '/api/reviews/manage?status=published'), owner);
    expect(published.body).toMatchObject({ total: 3, offset: 0, hasMore: false, status: 'published' });
    expect(published.body.reviews.every((review: any) => review.status === 'published')).toBe(true);
    for (const query of ['offset=-1', 'offset=1.5', 'offset=1000001', 'status=invalid', 'status=pending&status=hidden', 'email=private'])
      expect((await invoke(request('GET', '/api/reviews/manage?' + query), owner)).status).toBe(422);
  });
  it('routes submissions, owner moderation and validation failures through the real API boundary', async() => {
    const submitted = await handleApi(request('POST', '/api/reviews', valid), env);
    expect(submitted.status).toBe(201);
    const id = row().id;
    const denied = await handleApi(request('PATCH', '/api/reviews/' + id, { version: 1, status: 'published' }), env);
    expect(denied.status).toBe(401);
    const published = await handleApi(request('PATCH', '/api/reviews/' + id, { version: 1, status: 'published' }, 'review-request-000001', { 'oai-authenticated-user-id': 'owner-id', 'oai-authenticated-user-email': 'owner@example.test' }), env);
    expect(published.status).toBe(200);
    const listing = await handleApi(request('GET'), env);
    expect((await listing.json() as Record<string, any>).reviews).toHaveLength(1);
    const invalid = await handleApi(request('POST', '/api/reviews', { ...valid, consent: false }), env);
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toEqual({ error: { code: 'consent', message: 'Bitte stimmen Sie der Veröffentlichung Ihres Namens und Ihrer Bewertung zu.' } });
  });
});
