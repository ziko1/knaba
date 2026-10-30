import type { D1Database, D1Statement, WorkerEnv } from './types';
import { captchaConfig, verifyCaptcha } from './turnstile';

type Row = Record<string, unknown>;
export type ReviewActor = { owner: boolean; id: string | null };
export class ReviewFault extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const CONSENT_VERSION = '2026-10-25';
const MAX_BODY = 12_288;
const fail = (status: number, code: string, message: string): never => { throw new ReviewFault(status, code, message); };
const str = (value: unknown): string => typeof value === 'string' ? value : '';
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Cookie', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff',
} });
function database(env: WorkerEnv): D1Database {
  if (!env.DB) fail(503, 'unavailable', 'Bewertungen sind derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.');
  return env.DB!;
}
async function sha(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
function requireOwner(actor: ReviewActor) {
  if (!actor.id) fail(401, 'unauthenticated', 'Bitte melden Sie sich an.');
  if (!actor.owner) fail(403, 'forbidden', 'Nur der Inhaber darf Bewertungen verwalten.');
}
async function readBody(request: Request): Promise<Row> {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('x-knaba-request') !== 'portal-v1')
    fail(403, 'origin', 'Diese Anfrage ist nicht erlaubt. Bitte laden Sie die Seite erneut.');
  if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json')
    fail(415, 'content_type', 'Bitte senden Sie JSON-Daten.');
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) fail(413, 'body_size', 'Die Anfrage ist zu groß.');
  if (!request.body) fail(400, 'json', 'Die Anfrage enthält keine Daten.');
  const reader = request.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY) { await reader.cancel(); fail(413, 'body_size', 'Die Anfrage ist zu groß.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(400, 'json', 'Die Anfrage enthält ungültige Daten.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(400, 'json', 'Die Anfrage enthält ungültige Daten.');
  return parsed as Row;
}
function allowedKeys(body: Row, keys: string[]) {
  if (Object.keys(body).some(key => !keys.includes(key))) fail(422, 'unknown_field', 'Die Anfrage enthält ein nicht erlaubtes Feld.');
}
function text(value: unknown, min: number, max: number, multiline = false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (!multiline && /[\r\n\t]/.test(value)))
    fail(422, 'validation', 'Bitte prüfen Sie Ihre Angaben.');
  const result = (value as string).trim();
  if (result.length < min) fail(422, 'validation', 'Bitte prüfen Sie Ihre Angaben.');
  return result;
}
function publicReview(row: Row) {
  // Explicit allowlist: never return email, consent metadata or moderation details publicly.
  return { id: str(row.id), displayName: str(row.display_name), company: str(row.company),
    relationship: row.relationship as 'client' | 'partner', text: str(row.review_text), createdAt: str(row.created_at) };
}
function ownerReview(row: Row) {
  return { ...publicReview(row), email: str(row.email), status: str(row.status), consentAt: str(row.consent_at),
    consentVersion: str(row.consent_version), updatedAt: str(row.updated_at), publishedAt: row.published_at as string | null, version: Number(row.version) };
}
async function rateLimit(db: D1Database, key: string, limit: number, seconds: number) {
  const now = Math.floor(Date.now() / 1000), bucket = Math.floor(now / seconds);
  const row = await db.prepare('INSERT INTO portal_rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count')
    .bind(`${key}:${bucket}`, (bucket + 1) * seconds, limit).first<Row>();
  if (!row) fail(429, 'rate_limit', 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.');
  await db.prepare('DELETE FROM portal_rate_limits WHERE expires_at < ?').bind(now - 3600).run();
}
function audit(db: D1Database, actor: string, action: string, id: string, mutation: string, time: string): D1Statement {
  return db.prepare('INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM public_reviews WHERE id=? AND last_mutation=?)')
    .bind(crypto.randomUUID(), actor, action, id, time, id, mutation);
}
async function submit(request: Request, env: WorkerEnv): Promise<Response> {
  const body = await readBody(request);
  allowedKeys(body, ['displayName', 'email', 'company', 'relationship', 'text', 'consent', 'captchaToken', 'website']);
  if (body.consent !== true) fail(422, 'consent', 'Bitte stimmen Sie der Veröffentlichung Ihres Namens und Ihrer Bewertung zu.');
  if (body.website !== undefined && (typeof body.website !== 'string' || body.website.trim())) fail(422, 'validation', 'Die Anfrage konnte nicht verarbeitet werden.');
  const displayName = text(body.displayName, 2, 80);
  const email = text(body.email, 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(422, 'validation', 'Bitte geben Sie eine gültige E-Mail-Adresse an.');
  const company = body.company === undefined ? '' : text(body.company, 0, 120);
  if (body.relationship !== 'client' && body.relationship !== 'partner') fail(422, 'validation', 'Bitte wählen Sie Kunde oder Partner.');
  const relationship = body.relationship;
  const reviewText = text(body.text, 20, 1200, true);
  const key = request.headers.get('idempotency-key') || '';
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) fail(422, 'idempotency', 'Die Anfragekennung ist ungültig. Bitte laden Sie die Seite erneut.');
  const db = database(env), scope = await sha(email);
  const payloadHash = await sha(JSON.stringify({ displayName, email, company, relationship, text: reviewText, consent: true, consentVersion: CONSENT_VERSION }));
  const existing = await db.prepare('SELECT payload_hash FROM public_reviews WHERE dedupe_scope=? AND idempotency_key=?').bind(scope, key).first<Row>();
  if (existing) {
    if (existing.payload_hash !== payloadHash) fail(409, 'idempotency_conflict', 'Diese Anfragekennung wurde bereits für andere Angaben verwendet.');
    // A retry must not consume a one-time captcha token again or expose private moderation state.
    return response({ submitted: true });
  }
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip')?.trim();
  // Coarse attempt protection runs before CAPTCHA; an unverified visitor must not
  // be able to consume another person's email submission allowance.
  if (ip) await rateLimit(db, `review-ip:${await sha(ip.slice(0, 128) + day)}`, 20, 3600);
  const captcha = await verifyCaptcha(request, env, body.captchaToken);
  if (captcha === 'unavailable') fail(503, 'captcha_unavailable', 'Die Sicherheitsprüfung ist derzeit nicht verfügbar.');
  if (captcha !== 'ok') fail(422, 'captcha', 'Bitte wiederholen Sie die Sicherheitsprüfung.');
  await rateLimit(db, `review-email:${await sha(email + day)}`, 5, 86400);
  const id = crypto.randomUUID(), mutation = crypto.randomUUID(), time = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO public_reviews (id,display_name,email,company,relationship,review_text,status,consent_at,consent_version,dedupe_scope,idempotency_key,payload_hash,created_at,updated_at,published_at,version,last_mutation) VALUES (?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,NULL,1,?) ON CONFLICT(dedupe_scope,idempotency_key) DO NOTHING")
      .bind(id, displayName, email, company, relationship, reviewText, time, CONSENT_VERSION, scope, key, payloadHash, time, time, mutation),
    audit(db, 'public', 'review.submitted', id, mutation, time),
  ]);
  const stored = await db.prepare('SELECT payload_hash FROM public_reviews WHERE dedupe_scope=? AND idempotency_key=?').bind(scope, key).first<Row>();
  if (!stored) fail(503, 'unavailable', 'Die Bewertung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.');
  if (stored!.payload_hash !== payloadHash) fail(409, 'idempotency_conflict', 'Diese Anfragekennung wurde bereits für andere Angaben verwendet.');
  return response({ submitted: true }, 201);
}
async function moderate(request: Request, env: WorkerEnv, actor: ReviewActor, id: string): Promise<Response> {
  requireOwner(actor);
  const body = await readBody(request);
  allowedKeys(body, ['version', 'status']);
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 1) fail(422, 'version', 'Bitte laden Sie den aktuellen Datensatz erneut.');
  if (body.status !== 'published' && body.status !== 'hidden') fail(422, 'validation', 'Dieser Status ist nicht erlaubt.');
  const db = database(env), current = await db.prepare('SELECT * FROM public_reviews WHERE id=?').bind(id).first<Row>();
  if (!current) fail(404, 'not_found', 'Die Bewertung wurde nicht gefunden.');
  if (Number(current!.version) !== body.version) fail(409, 'conflict', 'Die Bewertung wurde inzwischen geändert. Bitte aktualisieren Sie die Ansicht.');
  if (current!.status === body.status) return response({ review: ownerReview(current!) });
  const time = new Date().toISOString(), mutation = crypto.randomUUID();
  const result = await db.batch([
    db.prepare("UPDATE public_reviews SET status=?,updated_at=?,published_at=CASE WHEN ?='published' THEN ? ELSE NULL END,version=version+1,last_mutation=? WHERE id=? AND version=?")
      .bind(body.status, time, body.status, time, mutation, id, body.version),
    audit(db, actor.id!, `review.${body.status}`, id, mutation, time),
  ]);
  if (!result[0]?.meta?.changes) fail(409, 'conflict', 'Die Bewertung wurde inzwischen geändert. Bitte aktualisieren Sie die Ansicht.');
  return response({ review: ownerReview((await db.prepare('SELECT * FROM public_reviews WHERE id=?').bind(id).first<Row>())!) });
}

/** The caller supplies its validated session; untrusted identity headers are never inspected here. */
export async function handleReviews(request: Request, env: WorkerEnv, actor: ReviewActor): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  if (path === '/api/reviews/captcha' && request.method === 'GET') return response(captchaConfig(env));
  if (path === '/api/reviews' && request.method === 'GET') {
    const db = database(env);
    const rows = (await db.prepare("SELECT id,display_name,company,relationship,review_text,created_at FROM public_reviews WHERE status='published' ORDER BY published_at DESC,id DESC LIMIT 12").all<Row>()).results || [];
    const count = await db.prepare("SELECT COUNT(*) AS total FROM public_reviews WHERE status='published'").first<Row>();
    return response({ reviews: rows.map(publicReview), total: Number(count?.total || 0) });
  }
  if (path === '/api/reviews' && request.method === 'POST') return submit(request, env);
  if (path === '/api/reviews/manage' && request.method === 'GET') {
    requireOwner(actor);
    const query = new URL(request.url).searchParams;
    const status = query.get('status') || 'all', rawOffset = query.get('offset') || '0';
    if (![...query.keys()].every(key => key === 'status' || key === 'offset') || query.getAll('status').length > 1 || query.getAll('offset').length > 1 || !['all', 'pending', 'published', 'hidden'].includes(status) || !/^\d{1,7}$/.test(rawOffset) || Number(rawOffset) > 1_000_000)
      fail(422, 'validation', 'Bitte wählen Sie einen gültigen Filter.');
    const offset = Number(rawOffset), limit = 50, db = database(env);
    const filter = status === 'all' ? '' : ' WHERE status=?', values = status === 'all' ? [] : [status];
    const rows = (await db.prepare(`SELECT * FROM public_reviews${filter} ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(...values, limit, offset).all<Row>()).results || [];
    const count = await db.prepare('SELECT COUNT(*) AS total FROM public_reviews' + filter).bind(...values).first<Row>();
    const total = Number(count?.total || 0);
    return response({ reviews: rows.map(ownerReview), total, limited: total > rows.length, hasMore: offset + rows.length < total, offset, limit, status });
  }
  const match = path.match(/^\/api\/reviews\/([a-zA-Z0-9_-]{1,100})$/);
  if (match && request.method === 'PATCH') return moderate(request, env, actor, match[1]);
  return response({ error: { code: 'not_found', message: 'Dieser Endpunkt ist nicht verfügbar.' } }, 404);
}
