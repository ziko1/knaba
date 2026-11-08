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
async function ownerReply(ticket:Ticket,content='Private owner message'):Promise<string>{
  const response=await call(`/api/assistant/owner/conversations/${ticket.id}/messages`,'POST',{content,idempotencyKey:crypto.randomUUID()},owner);
  expect(response.status).toBe(200);
  return (await response.json()).messages.find((message:{content:string})=>message.content===content).id;
}

describe('assistant conversation capability lifecycle', () => {
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

describe('assistant owner inbox pagination', () => {
  function seed(count: number) {
    const time = '2026-11-08T00:00:00.000Z';
    const insert = db.sql.prepare("INSERT INTO assistant_conversations(id,token_hash,token_expires_at,locale,status,contact_name,privacy_version,created_at,updated_at) VALUES(?,?,'2026-11-15T00:00:00.000Z','uk','human',?,'test',?,?)");
    return Array.from({ length: count }, (_, index) => {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      insert.run(id, 'a'.repeat(64), `Private contact ${index}`, time, time);
      return id;
    }).reverse();
  }
  const inboxPath = '/api/assistant/owner/conversations';

  it('lists every conversation with deterministic keyset pages and a secret-free cursor', async () => {
    const expected = seed(205);
    const firstResponse = await call(inboxPath, 'GET', undefined, owner);
    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json();
    expect(first.conversations.map((row: { id: string }) => row.id)).toEqual(expected.slice(0, 100));
    expect(first.limited).toBe(true);
    expect(typeof first.nextCursor).toBe('string');
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]{1,512}$/);
    const decoded = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8'));
    expect(decoded).toEqual({ v: 1, updatedAt: '2026-11-08T00:00:00.000Z', id: expected[99] });
    const second = await (await call(`${inboxPath}?cursor=${first.nextCursor}`, 'GET', undefined, owner)).json();
    expect(second.conversations.map((row: { id: string }) => row.id)).toEqual(expected.slice(100, 200));
    const third = await (await call(`${inboxPath}?cursor=${second.nextCursor}`, 'GET', undefined, owner)).json();
    expect(third.conversations.map((row: { id: string }) => row.id)).toEqual(expected.slice(200));
    expect(third.nextCursor).toBeNull();expect(third.limited).toBe(false);
    expect(new Set([...first.conversations, ...second.conversations, ...third.conversations].map(row => row.id)).size).toBe(205);
    expect(JSON.stringify(decoded)).not.toContain('Private');expect(JSON.stringify(decoded)).not.toContain('token');
  });

  it.each([0, 1, 100])('does not advertise a phantom page for %s conversations', async count => {
    seed(count);
    const result = await (await call(inboxPath, 'GET', undefined, owner)).json();
    expect(result.conversations).toHaveLength(count);
    expect(result.nextCursor).toBeNull();expect(result.limited).toBe(false);
  });

  it('keeps malformed legacy timestamps pageable without rewriting the history', async () => {
    const expected = seed(101);
    db.sql.exec("UPDATE assistant_conversations SET updated_at='malformed legacy date'");
    const first = await (await call(inboxPath, 'GET', undefined, owner)).json();
    const cursor = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8'));
    expect(cursor.updatedAt).toBe('0001-01-01T00:00:00.000Z');
    const second = await (await call(`${inboxPath}?cursor=${first.nextCursor}`, 'GET', undefined, owner)).json();
    expect(second.conversations.map((row: { id: string }) => row.id)).toEqual(expected.slice(100));
    expect(second.conversations[0].updatedAt).toBe('malformed legacy date');
    expect(second.nextCursor).toBeNull();
  });

  it('preserves millisecond precision alongside UUID ties at the page boundary', async () => {
    const expected = seed(101);
    db.sql.exec("UPDATE assistant_conversations SET updated_at='2026-11-08T00:00:00.001Z'");
    db.sql.prepare('UPDATE assistant_conversations SET updated_at=? WHERE id=?').run('2026-11-08T00:00:00.000Z', expected[100]);
    db.sql.prepare('UPDATE assistant_conversations SET updated_at=? WHERE id=?').run('2026-11-08T00:00:00.002Z', expected[50]);
    const first = await (await call(inboxPath, 'GET', undefined, owner)).json();
    expect(first.conversations[0].id).toBe(expected[50]);
    expect(JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8')).updatedAt).toBe('2026-11-08T00:00:00.001Z');
    const last = await (await call(`${inboxPath}?cursor=${first.nextCursor}`, 'GET', undefined, owner)).json();
    expect(last.conversations.map((row: { id: string }) => row.id)).toEqual([expected[100]]);
    expect(last.conversations[0].updatedAt).toBe('2026-11-08T00:00:00.000Z');
  });

  it('rejects malformed, duplicate and unsupported cursor shapes without weakening owner access', async () => {
    seed(101);
    const valid = { v: 1, updatedAt: '2026-11-08T00:00:00.000Z', id: '00000000-0000-4000-8000-000000000001' };
    for (const input of [{}, { ...valid, v: 2 }, { ...valid, updatedAt: 'not-a-date' }, { ...valid, updatedAt: '2026-02-30T00:00:00.000Z' }, { ...valid, id: "' OR 1=1--" }, { ...valid, token: 'forged' }]) {
      const cursor = Buffer.from(JSON.stringify(input)).toString('base64url');
      expect((await call(`${inboxPath}?cursor=${cursor}`, 'GET', undefined, owner)).status).toBe(422);
    }
    for (const query of ['cursor=', 'cursor=invalid!', 'cursor=' + 'a'.repeat(513), 'cursor=one&cursor=two']) {
      expect((await call(`${inboxPath}?${query}`, 'GET', undefined, owner)).status).toBe(422);
    }
    const cursor = Buffer.from(JSON.stringify(valid)).toString('base64url');
    expect((await call(`${inboxPath}?cursor=${cursor}`)).status).toBe(403);
  });

  it('rechecks owner authority on a later page before releasing private rows', async () => {
    seed(101);
    const first = await (await call(inboxPath, 'GET', undefined, owner)).json();
    expect(typeof first.nextCursor).toBe('string');
    let current = true;
    env.VERIFY_ASSISTANT_OWNER_SESSION = () => current;
    db.afterStatement = query => {
      if (/AS preview FROM assistant_conversations/i.test(query)) { db.afterStatement = undefined; current = false; }
    };
    const next = await call(`${inboxPath}?cursor=${first.nextCursor}`, 'GET', undefined, owner);
    expect(next.status).toBe(403);
    expect(await next.text()).not.toContain('Private contact');
  });
});

describe('guest display receipts for actual owner messages',()=>{
  const acknowledge=(ticket:Ticket,messageIds:string[],headers:Record<string,string>=guest(ticket))=>call(threadPath(ticket)+'/displayed','POST',{messageIds},headers);
  const displayed=(id:string)=>db.sql.prepare('SELECT guest_displayed_at FROM assistant_messages WHERE id=?').get(id)?.guest_displayed_at;

  it('starts unconfirmed, records the first guest display once and never reorders the inbox',async()=>{
    const ticket=await start(),id=await ownerReply(ticket);
    const previous=await (await call(threadPath(ticket),'GET',undefined,guest(ticket))).json();
    expect(previous.messages.find((message:{id:string})=>message.id===id).guestDisplayedAt).toBeNull();
    const response=await acknowledge(ticket,[id]);expect(response.status).toBe(200);
    const first=await response.json();expect(first.receipts).toEqual([{id,guestDisplayedAt:expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)}]);
    expect(await (await acknowledge(ticket,[id])).json()).toEqual(first);
    const history=await (await call(`/api/assistant/owner/conversations/${ticket.id}`,'GET',undefined,owner)).json();
    expect(history.messages.find((message:{id:string})=>message.id===id).guestDisplayedAt).toBe(first.receipts[0].guestDisplayedAt);
    expect(history.conversation.updatedAt).toBe(previous.conversation.updatedAt);
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM assistant_notifications').get()?.n).toBe(0);
    expect(JSON.stringify(first)).not.toMatch(/Private owner message|token|contact/);
  });

  it('permits display of a closed conversation without reopening or changing its status',async()=>{
    const ticket=await start(),id=await ownerReply(ticket);
    await call(`/api/assistant/owner/conversations/${ticket.id}/status`,'POST',{status:'closed'},owner);
    const before=db.sql.prepare('SELECT status,updated_at FROM assistant_conversations WHERE id=?').get(ticket.id);
    expect((await acknowledge(ticket,[id])).status).toBe(200);
    expect(db.sql.prepare('SELECT status,updated_at FROM assistant_conversations WHERE id=?').get(ticket.id)).toEqual(before);
  });

  it('rejects owner credentials alone, wrong, expired and revoked guest capabilities uniformly',async()=>{
    const valid=await start(),id=await ownerReply(valid),expired=await startAt(Date.now()-8*86400000),oldId=await ownerReply(expired);
    const responses=[
      await acknowledge(valid,[id],owner),
      await acknowledge(valid,[id],{'X-KnaBa-Conversation':'0'.repeat(64)}),
      await acknowledge(expired,[oldId]),
    ];
    revoke(valid);responses.push(await acknowledge(valid,[id]));
    const bodies=[];for(const response of responses){expect(response.status).toBe(404);bodies.push(await response.text());}
    expect(new Set(bodies).size).toBe(1);expect(displayed(id)).toBeNull();expect(displayed(oldId)).toBeNull();
  });

  it('rejects foreign, customer, automatic or missing messages without a partial receipt',async()=>{
    const own=await start(),other=await start(),id=await ownerReply(own),foreign=await ownerReply(other);
    const sent=await send(own);expect(sent.status).toBe(200);
    const visitor=(await sent.json()).messages.find((message:{sender:string})=>message.sender==='customer').id;
    const auto=crypto.randomUUID();
    db.sql.prepare("INSERT INTO assistant_messages(id,conversation_id,sender,content,request_key,created_at) VALUES(?,?,'assistant','Automatic text',?,?)").run(auto,own.id,auto,new Date().toISOString());
    for(const invalid of [foreign,visitor,auto,crypto.randomUUID()]){
      expect((await acknowledge(own,[id,invalid])).status).toBe(404);expect(displayed(id)).toBeNull();
    }
    expect(displayed(foreign)).toBeNull();
  });

  it('bounds and validates the entire batch before writing',async()=>{
    const ticket=await start(),id=await ownerReply(ticket);
    for(const messageIds of [[],[id,id],['not-a-message'],Array.from({length:33},()=>crypto.randomUUID()),[1],null]){
      const response=await call(threadPath(ticket)+'/displayed','POST',{messageIds},guest(ticket));expect(response.status).toBe(422);
    }
    expect((await call(threadPath(ticket)+'/displayed','POST',{messageIds:[id],guestDisplayedAt:'2099-01-01'},guest(ticket))).status).toBe(422);
    expect(displayed(id)).toBeNull();
  });

  it('checks the current capability at the receipt UPDATE boundary',async()=>{
    const ticket=await start(),id=await ownerReply(ticket);
    revokeBefore(ticket,query=>/^UPDATE assistant_messages SET guest_displayed_at/i.test(query));
    const response=await acknowledge(ticket,[id]);expect(response.status).toBe(404);expect(displayed(id)).toBeNull();
    expect(await response.text()).not.toContain(id);
  });

  it.each(['write','response'])('checks actual SQLite expiry at the %s boundary',async boundary=>{
    const ticket=await startAt(Date.now()-7*86400000+1200),id=await ownerReply(ticket);let reached=false,written=false;
    const expire=()=>{reached=true;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Math.max(0,Date.parse(ticket.expiresAt)-Date.now()+30));};
    if(boundary==='write')db.beforeStatement=query=>{if(/^UPDATE assistant_messages SET guest_displayed_at/i.test(query)){db.beforeStatement=undefined;expire();}};
    else db.afterStatement=query=>{
      if(/^UPDATE assistant_messages SET guest_displayed_at/i.test(query))written=true;
      if(written&&/^SELECT /i.test(query)&&/FROM assistant_messages/i.test(query)){db.afterStatement=undefined;expire();}
    };
    const response=await acknowledge(ticket,[id]);expect(reached).toBe(true);expect(response.status).toBe(404);
    const payload=await response.text();expect(payload).not.toContain(id);expect(payload).not.toContain('guestDisplayedAt');
    if(boundary==='write')expect(displayed(id)).toBeNull();else expect(displayed(id)).toEqual(expect.any(String));
  });

  it('validates all owner messages atomically again at the write boundary',async()=>{
    const ticket=await start(),first=await ownerReply(ticket,'First'),second=await ownerReply(ticket,'Second');
    db.beforeStatement=query=>{if(/^UPDATE assistant_messages SET guest_displayed_at/i.test(query)){db.beforeStatement=undefined;db.sql.prepare('DELETE FROM assistant_messages WHERE id=?').run(second);}};
    const response=await acknowledge(ticket,[first,second]);expect(response.status).toBe(404);expect(displayed(first)).toBeNull();
  });

  it('withholds assembled receipts after capability revocation at the response boundary',async()=>{
    const ticket=await start(),id=await ownerReply(ticket);let written=false;
    db.afterStatement=query=>{
      if(/^UPDATE assistant_messages SET guest_displayed_at/i.test(query))written=true;
      if(written&&/^SELECT /i.test(query)&&/FROM assistant_messages/i.test(query)){db.afterStatement=undefined;revoke(ticket);}
    };
    const response=await acknowledge(ticket,[id]);expect(response.status).toBe(404);
    const payload=await response.text();expect(payload).not.toContain(id);expect(payload).not.toContain('guestDisplayedAt');
    expect(displayed(id)).toEqual(expect.any(String));
  });
});
