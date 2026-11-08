import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleApi } from '../worker/api';
import type { D1Database, D1Result, D1Statement, WorkerEnv } from '../worker/types';

/** Run the actual migrations and SQL; hooks model another request at an await boundary. */
class CapabilityD1 implements D1Database {
  sql = new DatabaseSync(':memory:');
  beforeStatement?: (query: string) => void;
  afterStatement?: (query: string) => void;

  constructor() {
    this.sql.exec('PRAGMA foreign_keys=ON;');
    for (const path of readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) {
      this.sql.exec(readFileSync('drizzle/' + path, 'utf8'));
    }
  }

  prepare(query: string): D1Statement {
    const db = this;
    let values: unknown[] = [];
    function execute<T>(run: () => T): T {
      db.beforeStatement?.(query);
      const result = run();
      db.afterStatement?.(query);
      return result;
    }
    return {
      bind(...args: unknown[]) { values = args; return this; },
      async first<T>(column?: string) {
        return execute(() => {
          const row = db.sql.prepare(query).get(...values as never[]) as Record<string, unknown> | undefined;
          return row ? (column ? row[column] : row) as T : null;
        });
      },
      async all<T>() {
        return execute(() => ({ success: true, results: db.sql.prepare(query).all(...values as never[]) as T[] }));
      },
      async run() {
        return execute(() => ({ success: true, results: [], meta: { changes: Number(db.sql.prepare(query).run(...values as never[]).changes) } }));
      },
    };
  }

  async batch<T>(statements: D1Statement[]): Promise<D1Result<T>[]> {
    this.sql.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sql.exec('COMMIT');
      return results as D1Result<T>[];
    } catch (error) {
      this.sql.exec('ROLLBACK');
      throw error;
    }
  }
}

const origin = 'https://kneba.vsp.rest';
const owner = { 'oai-authenticated-user-id': 'owner-test-id', 'oai-authenticated-user-email': 'owner@knaba.test' };
const browser = { Origin: origin, 'Content-Type': 'application/json', 'X-KnaBa-Request': 'portal-v1', 'CF-Connecting-IP': '192.0.2.79' };
type Ticket = { id: string; token: string; expiresAt: string };
let db: CapabilityD1;
let env: WorkerEnv;
beforeEach(() => { db = new CapabilityD1(); env = { DB: db, OWNER_EMAIL: 'owner@knaba.test' }; });
afterEach(() => { vi.useRealTimers(); db.sql.close(); });

function call(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
  return handleApi(new Request(origin + path, {
    method, headers: { ...browser, ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
}
async function start(): Promise<Ticket> {
  const response = await call('/api/assistant/conversations', 'POST', { locale: 'uk', privacyAccepted: true, website: '' });
  expect(response.status).toBe(201);
  return response.json();
}
async function startAt(time: number) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(time);
  try { return await start(); }
  finally { vi.useRealTimers(); }
}
const guest = (ticket: Ticket) => ({ 'X-KnaBa-Conversation': ticket.token });
const threadPath = (ticket: Ticket) => `/api/assistant/conversations/${ticket.id}`;
function revoke(ticket: Ticket) {
  db.sql.prepare("UPDATE assistant_conversations SET token_hash='' WHERE id=?").run(ticket.id);
}
function revokeBefore(ticket: Ticket, matches: (query: string) => boolean) {
  db.beforeStatement = query => {
    if (matches(query)) { db.beforeStatement = undefined; revoke(ticket); }
  };
}
async function send(ticket: Ticket, content = 'Private visitor message') {
  return call(threadPath(ticket) + '/messages', 'POST', { content, idempotencyKey: crypto.randomUUID() }, guest(ticket));
}
async function offer(ticket: Ticket): Promise<string> {
  const response = await call(`/api/assistant/owner/conversations/${ticket.id}/offers`, 'POST', {
    content: 'Private owner proposal', idempotencyKey: crypto.randomUUID(),
  }, owner);
  expect(response.status).toBe(200);
  return (await response.json()).offers[0].id;
}
describe('assistant conversation capability lifecycle', () => {
  it('denies the expiry boundary and future-created capabilities without denying the owner history', async () => {
    const current = Date.now();
    for (const created of [current - 7 * 86400000, current + 3600000]) {
      const ticket = await startAt(created);
      expect((await call(threadPath(ticket), 'GET', undefined, guest(ticket))).status).toBe(404);
      expect((await call(`/api/assistant/owner/conversations/${ticket.id}`, 'GET', undefined, owner)).status).toBe(200);
    }
  });

  it('issues a seven-day immutable lifetime without renewing it on reads or writes', async () => {
    const ticket = await start();
    const stored = db.sql.prepare('SELECT created_at,token_expires_at,token_hash FROM assistant_conversations WHERE id=?').get(ticket.id)!;
    expect(Date.parse(ticket.expiresAt) - Date.parse(String(stored.created_at))).toBe(7 * 24 * 60 * 60 * 1000);
    expect(stored.token_expires_at).toBe(ticket.expiresAt);
    expect(stored.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.token_hash).not.toBe(ticket.token);
    const result = await send(ticket);
    expect(result.status).toBe(200);
    const payload = await result.text();
    expect(payload).toContain(ticket.expiresAt);
    expect(payload).not.toContain(ticket.token);
    expect(payload).not.toContain(String(stored.token_hash));
    expect(() => db.sql.prepare('UPDATE assistant_conversations SET token_expires_at=? WHERE id=?').run('2099-01-01T00:00:00.000Z', ticket.id))
      .toThrow('assistant_capability_expiry_immutable');
    expect(db.sql.prepare('SELECT token_expires_at FROM assistant_conversations WHERE id=?').get(ticket.id)?.token_expires_at).toBe(ticket.expiresAt);
  });

  it('denies expired read, send, handoff and offer-decision capabilities without losing owner history', async () => {
    const ticket = await startAt(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1000);
    const offerId = await offer(ticket);
    const read = await call(threadPath(ticket), 'GET', undefined, guest(ticket));
    const message = await send(ticket);
    const handoff = await call(threadPath(ticket) + '/handoff', 'POST', { name: 'Expired guest' }, guest(ticket));
    const decision = await call(threadPath(ticket) + `/offers/${offerId}/decision`, 'POST', { decision: 'accepted' }, guest(ticket));
    const missing = await call(threadPath(ticket));
    expect([read.status, message.status, handoff.status, decision.status, missing.status]).toEqual([404, 404, 404, 404, 404]);
    const concealed = await missing.text();
    for (const response of [read, message, handoff, decision]) expect(await response.text()).toBe(concealed);
    expect(db.sql.prepare('SELECT state FROM assistant_offers WHERE id=?').get(offerId)?.state).toBe('pending');
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM assistant_notifications WHERE conversation_id=?').get(ticket.id)?.n).toBe(0);
    const history = await call(`/api/assistant/owner/conversations/${ticket.id}`, 'GET', undefined, owner);
    expect(history.status).toBe(200);
    expect(await history.text()).toContain('Private owner proposal');
  });

  it('keeps closed conversations readable until expiry and does not renew access when reopened', async () => {
    const ticket = await start();
    const path = `/api/assistant/owner/conversations/${ticket.id}/status`;
    expect((await call(path, 'POST', { status: 'closed' }, owner)).status).toBe(200);
    expect((await call(threadPath(ticket), 'GET', undefined, guest(ticket))).status).toBe(200);
    expect((await send(ticket)).status).toBe(409);
    expect((await call(path, 'POST', { status: 'human' }, owner)).status).toBe(200);
    expect((await send(ticket)).status).toBe(200);
    expect(db.sql.prepare('SELECT token_expires_at,token_revoked_at FROM assistant_conversations WHERE id=?').get(ticket.id))
      .toEqual({ token_expires_at: ticket.expiresAt, token_revoked_at: null });
  });

  it('keeps missing, foreign and revoked capabilities indistinguishable and secret-free', async () => {
    const ticket = await start();
    const foreign = await start();
    const missing = await call(threadPath(ticket));
    const wrong = await call(threadPath(ticket), 'GET', undefined, guest(foreign));
    revoke(ticket);
    const revoked = await call(threadPath(ticket), 'GET', undefined, guest(ticket));
    expect([missing.status, wrong.status, revoked.status]).toEqual([404, 404, 404]);
    const payload = await missing.text();
    expect(await wrong.text()).toBe(payload);
    expect(await revoked.text()).toBe(payload);
    expect(payload).not.toContain(ticket.token);
    expect(payload).not.toContain('token_hash');
  });

  it('lets only the owner revoke guest access idempotently while preserving owner history', async () => {
    const ticket = await start();
    expect((await send(ticket)).status).toBe(200);
    const path = `/api/assistant/owner/conversations/${ticket.id}/access/revoke`;
    expect((await call(path, 'POST', {}, guest(ticket))).status).toBe(403);
    expect((await call(path, 'POST', {}, owner)).status).toBe(200);
    expect((await call(path, 'POST', {}, owner)).status).toBe(200);
    expect(db.sql.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE action='assistant.access.revoke' AND entity_id=?").get(ticket.id)?.n).toBe(1);
    expect(() => db.sql.prepare('UPDATE assistant_conversations SET token_revoked_at=NULL WHERE id=?').run(ticket.id))
      .toThrow('assistant_capability_revocation_immutable');
    expect((await call(threadPath(ticket), 'GET', undefined, guest(ticket))).status).toBe(404);
    expect((await send(ticket)).status).toBe(404);
    const history = await call(`/api/assistant/owner/conversations/${ticket.id}`, 'GET', undefined, owner);
    expect(history.status).toBe(200);
    const payload = await history.text();
    expect(payload).toContain('Private visitor message');
    expect(payload).not.toContain(ticket.token);
    expect(payload).not.toContain('token_hash');
  });

  it('rechecks current owner authority before list and conversation responses', async () => {
    const ticket = await start();
    await offer(ticket);
    let current = true;
    env.VERIFY_ASSISTANT_OWNER_SESSION = () => current;
    db.afterStatement = query => {
      if (/AS preview FROM assistant_conversations/i.test(query)) { db.afterStatement = undefined; current = false; }
    };
    const list = await call('/api/assistant/owner/conversations', 'GET', undefined, owner);
    expect(list.status).toBe(403);
    expect(await list.text()).not.toContain(ticket.id);
    current = true;
    db.afterStatement = query => {
      if (/FROM assistant_offers/i.test(query)) { db.afterStatement = undefined; current = false; }
    };
    const history = await call(`/api/assistant/owner/conversations/${ticket.id}`, 'GET', undefined, owner);
    expect(history.status).toBe(403);
    expect(await history.text()).not.toContain('Private owner proposal');
  });

  it('stops a poll when access is revoked before the messages read', async () => {
    const ticket = await start();
    expect((await send(ticket)).status).toBe(200);
    revokeBefore(ticket, query => /^SELECT /i.test(query) && /FROM assistant_messages/i.test(query));
    const response = await call(threadPath(ticket), 'GET', undefined, guest(ticket));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('Private visitor message');
  });

  it('rechecks access before returning a history response assembled across awaits', async () => {
    const ticket = await start();
    await offer(ticket);
    db.afterStatement = query => {
      if (/^SELECT /i.test(query) && /FROM assistant_offers/i.test(query)) {
        db.afterStatement = undefined;
        revoke(ticket);
      }
    };
    const response = await call(threadPath(ticket), 'GET', undefined, guest(ticket));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('Private owner proposal');
  });

  it('does not write a message or notice when the capability is revoked before INSERT', async () => {
    const ticket = await start();
    const messageKey = crypto.randomUUID();
    revokeBefore(ticket, query => /INSERT OR IGNORE INTO assistant_messages/i.test(query));
    const response = await call(threadPath(ticket) + '/messages', 'POST', {
      content: 'Must never be committed', idempotencyKey: messageKey,
    }, guest(ticket));
    expect(response.status).toBe(404);
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM assistant_messages WHERE conversation_id=?').get(ticket.id)?.n).toBe(0);
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM assistant_notifications WHERE conversation_id=?').get(ticket.id)?.n).toBe(0);
  });

  it('does not return an idempotent message replay after capability revocation', async () => {
    const ticket = await start(), idempotencyKey = crypto.randomUUID();
    const path = threadPath(ticket) + '/messages', body = {content:'Private retry receipt',idempotencyKey};
    expect((await call(path,'POST',body,guest(ticket))).status).toBe(200);
    const before = db.sql.prepare('SELECT * FROM assistant_messages WHERE conversation_id=? ORDER BY id').all(ticket.id);
    revoke(ticket);
    const response = await call(path,'POST',body,guest(ticket));
    expect(response.status).toBe(404);expect(await response.text()).not.toContain(body.content);
    expect(db.sql.prepare('SELECT * FROM assistant_messages WHERE conversation_id=? ORDER BY id').all(ticket.id)).toEqual(before);
  });

  it('does not modify contacts or queue handoff after capability revocation', async () => {
    const ticket = await start();
    revokeBefore(ticket, query => /^UPDATE assistant_conversations SET status='human',contact_name=/i.test(query));
    const response = await call(threadPath(ticket) + '/handoff', 'POST', {
      name: 'Revoked writer', email: 'private@example.test', phone: '+4930123456',
    }, guest(ticket));
    expect(response.status).toBe(404);
    expect(db.sql.prepare('SELECT status,contact_name,contact_email FROM assistant_conversations WHERE id=?').get(ticket.id))
      .toEqual({ status: 'assistant', contact_name: '', contact_email: '' });
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM assistant_notifications WHERE conversation_id=?').get(ticket.id)?.n).toBe(0);
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM assistant_messages WHERE conversation_id=?').get(ticket.id)?.n).toBe(0);
  });

  it('does not accept a proposal after capability revocation at the write boundary', async () => {
    const ticket = await start();
    const offerId = await offer(ticket);
    revokeBefore(ticket, query => /^UPDATE assistant_offers SET state=/i.test(query));
    const response = await call(threadPath(ticket) + `/offers/${offerId}/decision`, 'POST', { decision: 'accepted' }, guest(ticket));
    expect(response.status).toBe(404);
    expect(db.sql.prepare('SELECT state,decided_at FROM assistant_offers WHERE id=?').get(offerId))
      .toEqual({ state: 'pending', decided_at: null });
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM assistant_notifications WHERE conversation_id=?').get(ticket.id)?.n).toBe(0);
  });
});
