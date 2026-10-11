import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { Database, type PgTransaction } from '../apps/api/database.ts';
import { Engine } from '../apps/api/engine.ts';
import { ApiController } from '../apps/api/http.ts';
import { GUEST_COOKIE } from '../apps/api/auth.ts';
import { WorkerRunner, leaseOutbox, serviceId, type OutboxJob } from '../apps/worker/runner.ts';
import { DeepSeekAdapter } from '../packages/integrations/deepseek.ts';
import { ASSISTANT_TOOL_NAMES, type AssistantToolCall } from '../packages/integrations/assistant-tools.ts';
import type { AiCategory } from '../packages/integrations/assistant-playground.ts';
import { DomainError, type Data, type Entity } from '../packages/domain/core.ts';

// Genuine PostgreSQL, Engine, HTTP controller authentication, queue leasing,
// WorkerRunner and DeepSeekAdapter. Only the external provider request and the
// Express transport objects are doubles. No socket/provider is contacted.
// Supply an isolated QA DATABASE_URL to execute; skipped discovery is NOT SQL PASS.
const postgres = process.env.DATABASE_URL ? describe : describe.skip;
const ORIGIN = 'https://assistant-runtime.qa.example.test';
const PROVIDER_URL = 'https://synthetic-ai-provider.example.test/v1';
const SERVICE = 'synthetic-cleaning', PRICES = 'synthetic-prices', CONFIG = 'synthetic-config';
const INPUT = 'Drei Personen reinigen zwei Stunden Fenster in einem Büro in Berlin.';
const draftArguments = {
  territory: 'Berlin', contact: { name: 'Synthetic runtime customer', email: 'runtime@example.test' },
  serviceIds: [SERVICE], facts: { customerType: 'B2C', quantityMilli: 6000, address: 'Synthetic Berlin address', propertyType: 'Office' }, language: 'DE'
};
const estimateArguments = { territory: 'Berlin', priceBookId: PRICES, lines: [{ serviceId: SERVICE, quantityMilli: 6000 }] };
const plan: AssistantToolCall[] = [
  { id: 'estimate-reviewed-hours', name: 'calculateEstimate', arguments: estimateArguments },
  { id: 'save-reviewed-preview', name: 'saveLeadDraft', arguments: draftArguments }
];
const answer = (toolCalls: unknown[] = [], text = 'KI-Assistent: Ihre unverbindliche Vorschau steht zur Prüfung bereit.') => ({
  answer: text, source_ids: [SERVICE], handoff_required: false, reason: null, tool_calls: toolCalls
});
type CapturedRequest = { url: string; body: Data; payload: Data; signal?: AbortSignal };
type ProviderStep = (request: CapturedRequest) => unknown | Promise<unknown>;
type Guest = { token: string; csrf: string; actorId: string };

function transport(guest?: Guest, headers: Record<string, string> = {}, ip = '192.0.2.10'): Request {
  const values: Record<string, string> = { origin: ORIGIN, host: new URL(ORIGIN).host, ...headers };
  if (guest) { values.cookie = GUEST_COOKIE + '=' + guest.token; values['x-csrf-token'] ??= guest.csrf; }
  return { method: 'POST', protocol: 'https', ip, headers: values, get: (name: string) => values[name.toLowerCase()] } as unknown as Request;
}
function responseTransport() {
  const cookies: { name: string; value: string; options: Data }[] = [];
  return { cookies, response: { cookie: (name: string, value: string, options: Data) => { cookies.push({ name, value, options }); } } as unknown as Response };
}

postgres('assistant runtime: PostgreSQL/Engine/worker/controller with explicitly mocked external AI', () => {
  let db: Database, engine: Engine, company: string, api: ApiController;

  beforeAll(async () => { db = new Database(); await db.migrate(); engine = new Engine(db, 'TEST'); });
  beforeEach(async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'SYNTHETIC_TEST_ONLY_NOT_A_PROVIDER_SECRET');
    company = 'assistant-runtime-qa-' + randomUUID();
    await db.transaction(company, 'SYNTHETIC_ASSISTANT_RUNTIME_QA', async tx => {
      await tx.add('company', { name: 'Synthetic assistant runtime QA', operatingMode: 'TEST', synthetic: true }, company);
      await tx.add('service', {
        name: 'Fensterreinigung', description: 'Geprüfte Reinigung nach Personenstunden', unit: 'PERSON_HOUR', model: 'HOURLY',
        active: true, approvedBy: 'SYNTHETIC_CATALOG_REVIEW', included: ['Reinigungsmittel'], excluded: ['Gerüst'], questions: ['Wie viele Personenstunden?'], requiredSkills: [], requiresVisit: false
      }, SERVICE);
      await tx.add('price_book', {
        name: 'Synthetic approved integer EUR rates', status: 'ACTIVE', approvedBy: 'SYNTHETIC_PRICE_REVIEW', validFrom: new Date(Date.now() - 86_400_000).toISOString(),
        currency: 'EUR', mode: 'GUIDED', tax: { mode: 'VAT', rateBps: 1900, display: 'GROSS', testOnly: true },
        rules: [{ serviceId: SERVICE, rateCents: 2250, minimumQuantityMilli: 0, minimumCents: 0, included: false }]
      }, PRICES);
      await tx.add('assistant_config', {
        name: 'Synthetic approved assistant runtime', status: 'ACTIVE', configVersion: 1, provider: 'DEEPSEEK', testOnly: true,
        tools: [...ASSISTANT_TOOL_NAMES], allowedServiceIds: [SERVICE], territories: ['Berlin'], knowledgeIds: [],
        model: 'synthetic-configured-model', timeoutMs: 1000, tone: 'FORMAL', addressForm: 'Sie', humanHours: [{ day: 1, start: '09:00', end: '17:00' }],
        maxResponseLength: 2000, budgetCents: 1000, pricingPolicy: 'SERVER_PRICE_ONLY', contextPolicy: 'ACL_FILTER_BEFORE_RETRIEVAL', handoffPolicy: 'SUPPRESS_AI_UNTIL_AUTHORIZED_RETURN'
      }, CONFIG);
    });
    api = new ApiController({ db, engine, companyId: company, appMode: 'TEST', publicOrigin: ORIGIN, buildSha: '0'.repeat(40), encryptionKey: 'SYNTHETIC_TEST_ONLY_AUTH_ENCRYPTION_KEY' });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  afterAll(async () => { await db?.close(); });

  const rows = (kind: string) => db.transaction(company, 'SYNTHETIC_ASSISTANT_RUNTIME_QA_READ', tx => tx.list(kind));
  const row = (kind: string, id: string) => db.transaction(company, 'SYNTHETIC_ASSISTANT_RUNTIME_QA_READ', tx => tx.get(kind, id));
  async function update(kind: string, id: string, changes: Data) {
    return db.transaction(company, 'SYNTHETIC_ASSISTANT_RUNTIME_QA_UPDATE', async tx => {
      const original = await tx.get(kind, id); return tx.save(original, { ...original.data, ...changes }, original.version);
    });
  }
  async function guestChat(ip = '192.0.2.10') {
    const transportResponse = responseTransport();
    const submitted = await api.publicChat(transport(undefined, {}, ip), transportResponse.response, { text: INPUT, language: 'DE' });
    const cookie = transportResponse.cookies.find(value => value.name === GUEST_COOKIE);
    expect(cookie).toBeDefined(); expect(cookie!.options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict' });
    expect(submitted).toMatchObject({ status: 'QUEUED', csrfToken: expect.any(String) });
    const source = await row('message', submitted.messageId);
    return { submitted, guest: { token: cookie!.value, csrf: submitted.csrfToken!, actorId: source.data.author_id } };
  }
  async function fixture(steps: ProviderStep[] = [() => answer(plan), () => answer()]) {
    const requests: CapturedRequest[] = [];
    const request = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Data;
      const captured = { url: String(url), body, payload: JSON.parse(body.messages[1].content) as Data, signal: init?.signal ?? undefined };
      requests.push(captured);
      expect(captured.url).toBe(PROVIDER_URL + '/chat/completions');
      const step = steps[requests.length - 1];
      if (!step) throw new Error('Unexpected mocked external provider request');
      const result = await step(captured);
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const adapter = new DeepSeekAdapter({
      baseUrl: PROVIDER_URL, apiKey: 'SYNTHETIC_EXTERNAL_REQUEST_DOUBLE', model: 'synthetic-adapter-default', timeoutMs: 1000,
      inputPricePerMillionCents: 1, outputPricePerMillionCents: 1, maxOutputTokens: 1000, syntheticOnly: true
    }, request as typeof fetch);
    const worker = new WorkerRunner(db, engine, { companyId: company, appMode: 'TEST', ai: adapter, leaseMs: 120_000 });
    await worker.initialize();
    const chat = await guestChat();
    const jobs = await leaseOutbox(db, 1, 120_000, company);
    expect(jobs).toHaveLength(1);
    const job = jobs[0]!;
    expect(job).toMatchObject({ company_id: company, type: 'assistant.answer_requested', attempts: 1, lease_token: expect.any(String), data: { messageId: chat.submitted.messageId, actorId: chat.guest.actorId, sourceChannel: 'WEB', configVersion: 1 } });
    const persisted = (await db.query('SELECT status,lease_token,leased_until FROM outbox WHERE company_id=$1 AND id=$2', [company, job.id])).rows[0];
    expect(persisted.status).toBe('RUNNING'); expect(persisted.lease_token).toBe(job.lease_token); expect(new Date(persisted.leased_until).getTime()).toBeGreaterThan(Date.now());
    expect((await row('user', chat.guest.actorId)).data).toMatchObject({ guest: true, active: true, roles: ['GUEST', 'CLIENT'] });
    return { ...chat, worker, job, request, requests };
  }
  async function noBusinessEffects() {
    for (const kind of ['lead', 'quote', 'order', 'dispatch_request', 'assistant_lead_draft', 'assistant_tool_call']) expect(await rows(kind), kind).toHaveLength(0);
    expect((await rows('message')).filter(message => message.data.source === 'AI')).toHaveLength(0);
  }
  async function persistedFingerprint() {
    const result: Record<string, unknown> = {};
    for (const table of ['aggregates', 'aggregate_revisions', 'audit_log', 'command_receipts', 'outbox']) {
      result[table] = (await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\\n' ORDER BY to_jsonb(r)::text),'')) AS hash FROM ${table} r WHERE company_id=$1`, [company])).rows[0];
    }
    return result;
  }
  function afterActualReservation(worker: WorkerRunner, boundary: () => Promise<void>) {
    // A controlled scheduling seam after the actual PostgreSQL reservation has
    // committed. It preserves the real method, database, return value and checks.
    const budgetHost = worker as unknown as { reserveBudget: (job: OutboxJob, config: Entity, text: string, category?: AiCategory, guard?: (tx: PgTransaction) => Promise<void>) => Promise<number> };
    const reserve = budgetHost.reserveBudget.bind(worker);
    return vi.spyOn(budgetHost, 'reserveBudget').mockImplementation(async (...args) => {
      const budget = await reserve(...args);
      await boundary();
      return budget;
    });
  }
  const confirm = (f: Awaited<ReturnType<typeof fixture>>, draft: Entity, request = transport(f.guest), input = { expectedVersion: draft.version, previewHash: draft.data.previewHash }) => api.confirmChatDraft(request, f.submitted.channelId, draft.id, input);
  async function prepared() { const f = await fixture(); await f.worker.process(f.job); const drafts = await rows('assistant_lead_draft'); expect(drafts).toHaveLength(1); return { ...f, draft: drafts[0]! }; }

  it('runs proposal → exact server estimate → private WEB draft, with no lead before explicit authenticated confirmation', async () => {
    const f = await fixture(); await f.worker.process(f.job);
    expect(f.requests).toHaveLength(2);
    expect(f.requests[0]!.body).toMatchObject({ model: 'synthetic-configured-model', temperature: 0, max_tokens: 1000, stream: false, response_format: { type: 'json_object' } });
    expect(f.requests[0]!.payload.policy).toEqual({ tone: 'FORMAL', addressMode: 'Sie', humanHours: [{ day: 1, start: '09:00', end: '17:00' }], timeZone: 'Europe/Berlin' });
    expect(f.requests[0]!.payload.tool_catalog.map((tool: Data) => tool.name)).toEqual([...ASSISTANT_TOOL_NAMES]);
    expect(f.requests[0]!.payload.conversation_history).toEqual([]);
    expect(f.requests[0]!.payload.approved_price_books).toEqual([{ id: PRICES, version: 1, serviceIds: [SERVICE] }]);
    expect(f.requests[1]!.payload.tool_catalog).toEqual([]);
    // Actual amounts are appended by the server after the model reply. They do
    // not pass through a second model rewrite or become a quote/order promise.
    const secondEstimate = f.requests[1]!.payload.previous_tool_results.find((result: Data) => result.name === 'calculateEstimate');
    expect(secondEstimate.result).toEqual({ status: 'ESTIMATE_NOT_QUOTE', source: 'SERVER_PRICE_ENGINE', teamConfirmed: false, scheduleConfirmed: false, priceRenderedSeparatelyByServer: true });
    expect(JSON.stringify(secondEstimate.result)).not.toContain('16065');
    expect(await rows('lead')).toHaveLength(0); expect(await rows('quote')).toHaveLength(0); expect(await rows('order')).toHaveLength(0);
    const drafts = await rows('assistant_lead_draft'); expect(drafts).toHaveLength(1);
    const draft = drafts[0]!;
    expect(draft.data).toMatchObject({ state: 'DRAFT', ownerUserId: f.guest.actorId, messageId: f.submitted.messageId, messageVersion: 1, sourceChannel: 'WEB', previewHash: expect.stringMatching(/^[a-f0-9]{64}$/), input: { facts: { quantityMilli: 6000, measurementSource: 'CUSTOMER_STATED' } } });
    const toolCalls = await rows('assistant_tool_call'); expect(toolCalls).toHaveLength(2);
    expect(toolCalls.find(value => value.data.tool === 'calculateEstimate')?.data.result).toMatchObject({ totalNetCents: 13500, totalTaxCents: 2565, totalGrossCents: 16065, currency: 'EUR', lines: [{ rateCents: 2250, quantityMilli: 6000, netCents: 13500 }] });
    const replies = (await rows('message')).filter(message => message.data.source === 'AI'); expect(replies).toHaveLength(1);
    expect(replies[0]!.data.reply_to_id).toBe(f.submitted.messageId);
    expect(replies[0]!.data.text).toContain('160,65 EUR brutto (135,00 EUR netto; 25,65 EUR Steuer)');
    expect(replies[0]!.data.text).toContain('Team und Termin sind noch nicht bestätigt');
    const publicState = await api.publicMessages(transport(f.guest), f.submitted.channelId);
    expect(publicState.pendingDrafts).toMatchObject([{ id: draft.id, version: draft.version, previewHash: draft.data.previewHash, state: 'DRAFT' }]);
    expect((await db.query('SELECT status FROM outbox WHERE company_id=$1 AND id=$2', [company, f.job.id])).rows[0].status).toBe('SUCCEEDED');
    const confirmed = await confirm(f, draft);
    expect(confirmed).toMatchObject({ draftId: draft.id, confirmedByUser: true, teamConfirmed: false, scheduleConfirmed: false });
    const leads = await rows('lead'); expect(leads).toHaveLength(1);
    expect(leads[0]!.id).toBe(confirmed.leadId);
    expect(leads[0]!.data).toMatchObject({ ownerUserId: f.guest.actorId, ownership: 'AI_ACTIVE', status: 'NEW', createdSource: { channel: 'WEB' }, marketingConsent: false, facts: { quantityMilli: 6000, measurementSource: 'CUSTOMER_STATED' } });
    expect((await row('assistant_lead_draft', draft.id)).data).toMatchObject({ state: 'CONFIRMED', leadId: confirmed.leadId, confirmedBy: f.guest.actorId });
    expect((await confirm(f, draft)).leadId).toBe(confirmed.leadId);
    expect(await rows('lead')).toHaveLength(1);
    expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='assistant.lead_confirmed'", [company])).rows).toHaveLength(1);
  });

  it('supplies bounded currently visible conversation and approved price-book IDs without private knowledge or raw rates', async () => {
    const f = await fixture([() => answer()]);
    const knowledgeIds = ['public-info', 'own-info', 'other-private-info', 'staff-info', 'expired-info', 'unapproved-info'];
    await db.transaction(company, 'SYNTHETIC_ASSISTANT_RUNTIME_QA_CONTEXT', async tx => {
      const hiddenChannel = await tx.add('channel', { type: 'PRIVATE_CUSTOMER_ASSISTANT', created_by: 'another-guest', members: [], handoff: { state: 'AI_ACTIVE' } });
      await tx.add('message', { channel_id: hiddenChannel.id, author_id: 'another-guest', source: 'HUMAN', text: 'OTHER_CHANNEL_SECRET', language: 'DE', message_version: 1 });
      for (let index = 0; index < 12; index++) await tx.add('message', {
        channel_id: f.submitted.channelId, author_id: f.guest.actorId, source: 'HUMAN', text: 'VISIBLE_CONTEXT_' + index + ' ' + 'x'.repeat(1800), language: 'DE', message_version: 1
      }, 'history-' + String(index).padStart(2, '0'));
      await tx.add('message', { channel_id: f.submitted.channelId, author_id: f.guest.actorId, source: 'HUMAN', text: 'DELETED_MESSAGE_SECRET', language: 'DE', message_version: 1, deleted_at: new Date().toISOString() });
      for (const id of knowledgeIds) await tx.add('knowledge', {
        status: id === 'unapproved-info' ? 'DRAFT' : 'APPROVED', validFrom: new Date(Date.now() - 60_000).toISOString(),
        ...(id === 'expired-info' ? { validUntil: new Date(Date.now() - 1000).toISOString() } : {}),
        visibility: id === 'staff-info' ? 'INTERNAL' : ['own-info', 'other-private-info'].includes(id) ? 'PERSONAL' : 'PUBLIC',
        subjectUserId: id === 'own-info' ? f.guest.actorId : 'another-guest', content: id === 'public-info' || id === 'own-info' ? id : 'KNOWLEDGE_SECRET_' + id
      }, id);
      const config = await tx.get('assistant_config', CONFIG); await tx.save(config, { ...config.data, knowledgeIds });
      await tx.add('price_book', { name: 'Unapproved', status: 'ACTIVE', validFrom: new Date(Date.now() - 60_000).toISOString(), rules: [{ serviceId: SERVICE, rateCents: 987654 }] }, 'unapproved-prices');
      await tx.add('price_book', { name: 'Retired', status: 'RETIRED', approvedBy: 'SYNTHETIC_REVIEW', validFrom: new Date(Date.now() - 60_000).toISOString(), rules: [{ serviceId: SERVICE, rateCents: 987654 }] }, 'retired-prices');
    });
    await f.worker.process(f.job); expect(f.requests).toHaveLength(1);
    const payload = f.requests[0]!.payload;
    expect(payload.approved_sources.map((source: Data) => source.id).sort()).toEqual([SERVICE, 'public-info', 'own-info'].sort());
    expect(payload.conversation_history).toHaveLength(8);
    expect(payload.conversation_history.map((message: Data) => message.text.split(' ')[0])).toEqual(Array.from({ length: 8 }, (_, index) => 'VISIBLE_CONTEXT_' + (index + 4)));
    expect(payload.conversation_history.every((message: Data) => message.role === 'CUSTOMER' && message.text.length === 1500)).toBe(true);
    expect(payload.approved_price_books).toEqual([{ id: PRICES, version: 1, serviceIds: [SERVICE] }]);
    for (const secret of ['OTHER_CHANNEL_SECRET', 'DELETED_MESSAGE_SECRET', 'KNOWLEDGE_SECRET_', '987654', 'rateCents', 'tax', 'author_id']) expect(JSON.stringify(payload)).not.toContain(secret);
    expect((await rows('message')).filter(message => message.data.source === 'AI')).toHaveLength(1);
    expect(await rows('lead')).toHaveLength(0);
  });

  it('rejects another authenticated guest, absent CSRF and a tampered review hash without creating a lead', async () => {
    const f = await prepared(), other = await guestChat('192.0.2.11');
    await expect(confirm(f, f.draft, transport(other.guest))).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    await expect(confirm(f, f.draft, transport(f.guest, { 'x-csrf-token': '' }))).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await expect(confirm(f, f.draft, transport(f.guest, { origin: 'https://other.example.test' }))).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await expect(confirm(f, f.draft, transport(f.guest), { expectedVersion: f.draft.version, previewHash: '0'.repeat(64) })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(confirm(f, f.draft, transport(f.guest), { expectedVersion: f.draft.version + 1, previewHash: f.draft.data.previewHash })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(await rows('lead')).toHaveLength(0); expect((await row('assistant_lead_draft', f.draft.id)).data.state).toBe('DRAFT');
  });

  it('rejects a confirmed preview after its original customer message changes, including a replay of the old preview', async () => {
    const f = await prepared(), actor = await engine.getActor(f.guest.actorId, company);
    await engine.execute(actor, 'message.edit', { input: { message_id: f.submitted.messageId, text: 'Korrektur: nur eine Personenstunde.' }, idempotency_key: randomUUID() });
    await expect(confirm(f, f.draft)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(await rows('lead')).toHaveLength(0);
    expect((await api.publicMessages(transport(f.guest), f.submitted.channelId)).pendingDrafts).toEqual([]);
  });

  it('rejects confirmation after assistant configuration retirement and after current guest authority is revoked', async () => {
    const f = await prepared(); await update('assistant_config', CONFIG, { status: 'RETIRED' });
    await expect(confirm(f, f.draft)).rejects.toBeDefined(); expect(await rows('lead')).toHaveLength(0);
    await update('assistant_config', CONFIG, { status: 'ACTIVE' });
    await update('user', f.guest.actorId, { roles: [], permissions: ['chat.read', 'chat.write'] });
    await expect(confirm(f, f.draft)).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(await rows('lead')).toHaveLength(0);
  });

  it.each(['CONFIG_RETIRED', 'CONFIG_VERSION_CHANGED', 'HUMAN_HANDOFF', 'MESSAGE_DELETED', 'ACTOR_DISABLED', 'MEMBERSHIP_REVOKED'] as const)(
    'suppresses provider requests before processing when %s', async condition => {
      const f = await fixture();
      if (condition === 'CONFIG_RETIRED') await update('assistant_config', CONFIG, { status: 'RETIRED' });
      if (condition === 'CONFIG_VERSION_CHANGED') await update('assistant_config', CONFIG, { configVersion: 2 });
      if (condition === 'HUMAN_HANDOFF') await update('channel', f.submitted.channelId, { handoff: { state: 'HUMAN_ACTIVE', owner_id: 'synthetic-human' } });
      if (condition === 'MESSAGE_DELETED') await update('message', f.submitted.messageId, { deleted_at: new Date().toISOString() });
      if (condition === 'ACTOR_DISABLED') await update('user', f.guest.actorId, { active: false });
      if (condition === 'MEMBERSHIP_REVOKED') {
        const channel = await row('channel', f.submitted.channelId);
        await update('channel', channel.id, { members: channel.data.members.map((member: Data) => ({ ...member, revoked_at: new Date().toISOString() })) });
      }
      await f.worker.process(f.job); expect(f.request).not.toHaveBeenCalled(); await noBusinessEffects(); expect(await rows('ai_usage')).toHaveLength(0);
    }
  );

  it.each(['SUBSTITUTED_SOURCE', 'WRONG_PERSISTED_TYPE'] as const)(
    'binds the entire assistant job to its genuine SQL lease before provider or any persisted effects: %s', async condition => {
      const f = await fixture();
      let supplied: OutboxJob = f.job;
      if (condition === 'SUBSTITUTED_SOURCE') {
        const other = await guestChat('192.0.2.11');
        const original = await row('message', f.submitted.messageId), alternate = await row('message', other.submitted.messageId);
        expect(alternate.companyId).toBe(original.companyId);
        expect(alternate.data.author_id).not.toBe(original.data.author_id);
        expect((await row('channel', other.submitted.channelId)).data.handoff.state).toBe('AI_ACTIVE');
        supplied = { ...f.job, data: { ...f.job.data, channelId: other.submitted.channelId, messageId: other.submitted.messageId, actorId: other.guest.actorId } };
      } else {
        await db.query("UPDATE outbox SET type='translation.requested' WHERE company_id=$1 AND id=$2", [company, f.job.id]);
      }
      const before = await persistedFingerprint();
      await expect(f.worker.handle(supplied)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
      expect(f.request).not.toHaveBeenCalled(); expect(f.requests).toHaveLength(0);
      await noBusinessEffects(); expect(await rows('ai_usage')).toHaveLength(0);
      expect(await persistedFingerprint()).toEqual(before);
    }
  );

  it.each(['DISABLED', 'NON_SERVICE_ROLE'] as const)(
    'requires current canonical worker authority before spending or publishing: %s', async condition => {
      const f = await fixture(), service = await row('user', serviceId);
      await update('user', serviceId, condition === 'DISABLED' ? { active: false } : { roles: [], permissions: service.data.permissions });
      if (condition === 'NON_SERVICE_ROLE') expect((await row('user', serviceId)).data.permissions).toContain('integration.process');
      const before = await persistedFingerprint();
      await expect(f.worker.handle(f.job)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
      expect(f.request).not.toHaveBeenCalled(); await noBusinessEffects(); expect(await rows('ai_usage')).toHaveLength(0);
      expect(await persistedFingerprint()).toEqual(before);
    }
  );

  it.each(['REVOKED', 'LEFT', 'REMOVED', 'INACTIVE', 'EXPIRED'] as const)(
    'never restores historical worker channel access or invokes the provider after %s membership', async condition => {
      const f = await fixture(), channel = await row('channel', f.submitted.channelId);
      const past = new Date(Date.now() - 1000).toISOString();
      const revoked: Data = { user_id: serviceId, joined_at: channel.createdAt, history_from: channel.createdAt, external: false };
      if (condition === 'REVOKED') revoked.revoked_at = past;
      if (condition === 'LEFT') revoked.left_at = past;
      if (condition === 'REMOVED') revoked.removed_at = past;
      if (condition === 'INACTIVE') revoked.active = false;
      if (condition === 'EXPIRED') revoked.expires_at = past;
      await update('channel', channel.id, { members: [...channel.data.members, revoked] });
      const before = await persistedFingerprint();
      await expect(f.worker.handle(f.job)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
      expect(f.request).not.toHaveBeenCalled(); await noBusinessEffects(); expect(await rows('ai_usage')).toHaveLength(0);
      expect((await row('channel', channel.id)).data.members.filter((member: Data) => member.user_id === serviceId)).toEqual([revoked]);
      expect(await persistedFingerprint()).toEqual(before);
    }
  );

  it.each(['EXPIRED', 'REPLACED'] as const)(
    'releases a genuine reservation as zero-cost cancelled when the lease is %s before the first provider invocation', async condition => {
      const f = await fixture(), channel = await row('channel', f.submitted.channelId);
      let fencedLease: Data | undefined;
      const reserve = afterActualReservation(f.worker, async () => {
        const usage = await rows('ai_usage');
        expect(usage).toHaveLength(1); expect(usage[0]!.data.status).toBe('RUNNING');
        expect(usage[0]!.data.initial_reserved_cents).toBeGreaterThan(0);
        if (condition === 'EXPIRED') await db.query("UPDATE outbox SET leased_until=clock_timestamp()-interval '1 second' WHERE company_id=$1 AND id=$2", [company, f.job.id]);
        else await db.query('UPDATE outbox SET lease_token=$1 WHERE company_id=$2 AND id=$3', [randomUUID(), company, f.job.id]);
        fencedLease = (await db.query('SELECT status,lease_token,leased_until,attempts FROM outbox WHERE company_id=$1 AND id=$2', [company, f.job.id])).rows[0];
      });
      await expect(f.worker.handle(f.job)).rejects.toMatchObject({ code: 'WORKER_LEASE_LOST' });
      expect(reserve).toHaveBeenCalledTimes(1); expect(f.request).not.toHaveBeenCalled(); await noBusinessEffects();
      const usage = await rows('ai_usage'); expect(usage).toHaveLength(1);
      expect(usage[0]!.data).toMatchObject({ event_id: f.job.id, status: 'CANCELLED', actual_cents: 0, reserved_cents: 0, input_tokens: 0, output_tokens: 0, provider_invoked: false });
      expect(usage[0]!.data.initial_reserved_cents).toBeGreaterThan(0);
      expect(await row('channel', channel.id)).toEqual(channel);
      expect((await db.query('SELECT status,lease_token,leased_until,attempts FROM outbox WHERE company_id=$1 AND id=$2', [company, f.job.id])).rows[0]).toEqual(fencedLease);
    }
  );

  it.each(['MESSAGE_EDITED', 'ACTOR_DISABLED', 'CONFIG_RETIRED'] as const)(
    'rechecks the prepared source after the actual reservation and before transferring its text: %s', async condition => {
      const f = await fixture();
      const reserve = afterActualReservation(f.worker, async () => {
        if (condition === 'MESSAGE_EDITED') {
          const actor = await engine.getActor(f.guest.actorId, company);
          await engine.execute(actor, 'message.edit', { input: { message_id: f.submitted.messageId, text: 'Korrigierte private Anfrage vor jedem KI-Aufruf.' }, idempotency_key: randomUUID() });
        }
        if (condition === 'ACTOR_DISABLED') await update('user', f.guest.actorId, { active: false });
        if (condition === 'CONFIG_RETIRED') await update('assistant_config', CONFIG, { status: 'RETIRED' });
      });
      await f.worker.process(f.job);
      expect(reserve).toHaveBeenCalledTimes(1); expect(f.request).not.toHaveBeenCalled(); await noBusinessEffects();
      const usage = await rows('ai_usage'); expect(usage).toHaveLength(1);
      expect(usage[0]!.data).toMatchObject({ event_id: f.job.id, status: 'CANCELLED', actual_cents: 0, reserved_cents: 0, provider_invoked: false });
      expect((await row('channel', f.submitted.channelId)).data.members.some((member: Data) => member.user_id === serviceId)).toBe(false);
    }
  );

  it.each(['CONFIG_RETIRED', 'CONFIG_VERSION_CHANGED', 'MESSAGE_EDITED', 'HUMAN_HANDOFF', 'ACTOR_DISABLED', 'TOOLS_REVOKED'] as const)(
    'rechecks fresh server state before dispatch after first provider request: %s', async condition => {
      let f!: Awaited<ReturnType<typeof fixture>>;
      f = await fixture([async () => {
        if (condition === 'CONFIG_RETIRED') await update('assistant_config', CONFIG, { status: 'RETIRED' });
        if (condition === 'CONFIG_VERSION_CHANGED') await update('assistant_config', CONFIG, { configVersion: 2 });
        if (condition === 'MESSAGE_EDITED') {
          const actor = await engine.getActor(f.guest.actorId, company);
          await engine.execute(actor, 'message.edit', { input: { message_id: f.submitted.messageId, text: 'Korrektur: nur eine Personenstunde.' }, idempotency_key: randomUUID() });
        }
        if (condition === 'HUMAN_HANDOFF') await update('channel', f.submitted.channelId, { handoff: { state: 'HUMAN_ACTIVE', owner_id: 'synthetic-human' } });
        if (condition === 'ACTOR_DISABLED') await update('user', f.guest.actorId, { active: false });
        if (condition === 'TOOLS_REVOKED') await update('assistant_config', CONFIG, { tools: ['searchApprovedServices'] });
        return answer(plan);
      }]);
      await f.worker.process(f.job); expect(f.requests).toHaveLength(1); await noBusinessEffects();
      if (condition === 'HUMAN_HANDOFF') expect((await row('channel', f.submitted.channelId)).data.handoff.state).toBe('HUMAN_ACTIVE');
      expect((await rows('ai_usage'))[0]!.data).toMatchObject({ status: 'SUCCEEDED', actual_cents: 1 });
    }
  );

  it.each(['TOO_MANY_TOOLS', 'MODEL_RATE_INJECTION', 'MODEL_CONFIRMATION_FLAG', 'MODEL_PRICE_TEXT', 'DISALLOWED_TOOL'] as const)(
    'validates external proposals before any server effect: %s', async condition => {
      if (condition === 'DISALLOWED_TOOL') await update('assistant_config', CONFIG, { tools: ['searchApprovedServices'] });
      const f = await fixture([() => {
        if (condition === 'TOO_MANY_TOOLS') return answer(Array.from({ length: 7 }, (_, index) => ({ id: 'search-' + index, name: 'searchApprovedServices', arguments: {} })));
        if (condition === 'MODEL_RATE_INJECTION') return answer([{ id: 'forged-rate', name: 'calculateEstimate', arguments: { ...estimateArguments, lines: [{ serviceId: SERVICE, quantityMilli: 6000, rateCents: 1 }] } }]);
        if (condition === 'MODEL_CONFIRMATION_FLAG') return answer([{ id: 'forged-consent', name: 'confirmLead', arguments: { draftId: 'forged-draft', confirmed: true } }]);
        if (condition === 'MODEL_PRICE_TEXT') return answer([], 'KI-Assistent: Sie zahlen 1,00 EUR.');
        return answer(plan);
      }]);
      await f.worker.process(f.job); expect(f.requests).toHaveLength(1); await noBusinessEffects();
      expect((await row('channel', f.submitted.channelId)).data.handoff.state).toBe('HANDOFF_PENDING');
      expect(await rows('decision')).toHaveLength(1);
    }
  );

  it('stops further tools and the second provider call after the customer requests human handoff', async () => {
    const f = await fixture([() => answer([
      { id: 'request-human', name: 'requestHumanHandoff', arguments: { reason: 'Der Kunde bittet um persönliche Unterstützung.' } },
      ...plan
    ])]);
    await f.worker.process(f.job); expect(f.requests).toHaveLength(1);
    expect((await row('channel', f.submitted.channelId)).data.handoff.state).toBe('HANDOFF_PENDING');
    expect(await rows('assistant_lead_draft')).toHaveLength(0); expect(await rows('lead')).toHaveLength(0);
    expect((await rows('assistant_tool_call')).map(call => call.data.tool)).toEqual(['requestHumanHandoff']);
    expect(await rows('decision')).toHaveLength(1);
  });

  it('refuses a second-round model tool proposal while retaining the unconfirmed draft and never creating a lead', async () => {
    const f = await fixture([() => answer(plan), () => answer([{ id: 'second-round-confirm', name: 'confirmLead', arguments: { draftId: 'guess' } }])]);
    await f.worker.process(f.job); expect(f.requests).toHaveLength(2);
    expect(await rows('lead')).toHaveLength(0); expect(await rows('assistant_lead_draft')).toHaveLength(1);
    expect((await rows('message')).filter(message => message.data.source === 'AI')).toHaveLength(0);
    expect((await row('channel', f.submitted.channelId)).data.handoff.state).toBe('HANDOFF_PENDING');
  });

  it.each(['MESSAGE_EDITED', 'CONFIG_RETIRED', 'HUMAN_HANDOFF'] as const)(
    'rechecks publication after the second provider request: %s', async condition => {
      let f!: Awaited<ReturnType<typeof fixture>>;
      f = await fixture([() => answer(plan), async () => {
        if (condition === 'MESSAGE_EDITED') {
          const actor = await engine.getActor(f.guest.actorId, company);
          await engine.execute(actor, 'message.edit', { input: { message_id: f.submitted.messageId, text: 'Korrektur: nur eine Personenstunde.' }, idempotency_key: randomUUID() });
        }
        if (condition === 'CONFIG_RETIRED') await update('assistant_config', CONFIG, { status: 'RETIRED' });
        if (condition === 'HUMAN_HANDOFF') await update('channel', f.submitted.channelId, { handoff: { state: 'HUMAN_ACTIVE', owner_id: 'synthetic-human' } });
        return answer();
      }]);
      await f.worker.process(f.job); expect(f.requests).toHaveLength(2);
      expect(await rows('assistant_lead_draft')).toHaveLength(1); expect(await rows('lead')).toHaveLength(0);
      expect((await rows('message')).filter(message => message.data.source === 'AI')).toHaveLength(0);
      await expect(confirm(f, (await rows('assistant_lead_draft'))[0]!)).rejects.toBeDefined();
      if (condition === 'HUMAN_HANDOFF') expect((await row('channel', f.submitted.channelId)).data.handoff.state).toBe('HUMAN_ACTIVE');
    }
  );

  it('deduplicates a repeated leased source event without another provider request, draft, estimate, or AI message', async () => {
    const f = await fixture(); await f.worker.handle(f.job);
    const before = { drafts: await rows('assistant_lead_draft'), tools: await rows('assistant_tool_call'), messages: await rows('message'), usage: await rows('ai_usage') };
    await f.worker.handle(f.job);
    expect(f.requests).toHaveLength(2); expect(await rows('assistant_lead_draft')).toEqual(before.drafts); expect(await rows('assistant_tool_call')).toEqual(before.tools); expect(await rows('message')).toEqual(before.messages);
    expect(await rows('ai_usage')).toEqual(before.usage); expect(await rows('lead')).toHaveLength(0); expect(await rows('decision')).toHaveLength(1);
  });

  it('fences expired or reassigned worker leases after the provider returns, before any tool effects', async () => {
    let f!: Awaited<ReturnType<typeof fixture>>;
    f = await fixture([async () => {
      await db.query("UPDATE outbox SET lease_token=$1,leased_until=clock_timestamp()-interval '1 second' WHERE company_id=$2 AND id=$3", [randomUUID(), company, f.job.id]);
      return answer(plan);
    }]);
    await f.worker.process(f.job); expect(f.requests).toHaveLength(1); await noBusinessEffects();
    expect((await db.query('SELECT status,lease_token FROM outbox WHERE company_id=$1 AND id=$2', [company, f.job.id])).rows[0]).toMatchObject({ status: 'RUNNING' });
    expect((await db.query('SELECT lease_token FROM outbox WHERE company_id=$1 AND id=$2', [company, f.job.id])).rows[0].lease_token).not.toBe(f.job.lease_token);
  });

  it('settles one late known provider outcome after real lease reassignment without changing the successor lease or calling the provider again', async () => {
    let reachedProvider!: () => void, releaseProvider!: () => void;
    const providerEntered = new Promise<void>(resolve => { reachedProvider = resolve; });
    const providerMayReturn = new Promise<void>(resolve => { releaseProvider = resolve; });
    const f = await fixture([async () => { reachedProvider(); await providerMayReturn; return answer(plan); }]);
    // The external request is paused; both worker attempts, reservation and lease
    // reassignment continue to use the actual PostgreSQL implementations.
    const oldResult = f.worker.handle(f.job).then(() => ({ error: undefined as unknown }), error => ({ error }));
    try {
      await Promise.race([providerEntered, oldResult.then(() => { throw new Error('Original worker finished before its provider request'); })]);
      const initialUsage = await rows('ai_usage'); expect(initialUsage).toHaveLength(1);
      expect(initialUsage[0]!.data.status).toBe('RUNNING');
      await db.query("UPDATE outbox SET leased_until=clock_timestamp()-interval '1 second' WHERE company_id=$1 AND id=$2", [company, f.job.id]);
      const reclaimed = await leaseOutbox(db, 1, 120_000, company); expect(reclaimed).toHaveLength(1);
      const successor = reclaimed[0]!;
      expect(successor.id).toBe(f.job.id); expect(successor.attempts).toBe(2); expect(successor.lease_token).not.toBe(f.job.lease_token);
      await f.worker.handle(successor);
      const beforeLateUsage = await rows('ai_usage'); expect(beforeLateUsage).toEqual(initialUsage);
      const successorLease = (await db.query('SELECT * FROM outbox WHERE company_id=$1 AND id=$2', [company, successor.id])).rows[0];
      expect(successorLease).toMatchObject({ status: 'RUNNING', lease_token: successor.lease_token, attempts: 2 });
      const channelAfterSuccessor = await row('channel', f.submitted.channelId), decisionsAfterSuccessor = await rows('decision');
      releaseProvider();
      const result = await oldResult;
      expect(result.error).toBeInstanceOf(DomainError); expect(result.error).toMatchObject({ code: 'WORKER_LEASE_LOST' });
      expect(f.requests).toHaveLength(1); await noBusinessEffects();
      const settled = await rows('ai_usage'); expect(settled).toHaveLength(1);
      expect(settled[0]!.id).toBe(initialUsage[0]!.id);
      expect(settled[0]!.data).toMatchObject({ event_id: f.job.id, status: 'SUCCEEDED', actual_cents: 1, reserved_cents: 1, input_tokens: 100, output_tokens: 50 });
      expect(settled[0]!.version).toBe(initialUsage[0]!.version + 1);
      expect((await db.query('SELECT * FROM outbox WHERE company_id=$1 AND id=$2', [company, successor.id])).rows[0]).toEqual(successorLease);
      expect(await row('channel', f.submitted.channelId)).toEqual(channelAfterSuccessor); expect(await rows('decision')).toEqual(decisionsAfterSuccessor);
    } finally {
      releaseProvider(); await oldResult;
    }
  });

  it('retains the full reservation when the second provider outcome is unknown instead of settling only the first round', async () => {
    const f = await fixture([() => answer(plan), () => { throw new Error('SYNTHETIC_CONNECTION_LOST_AFTER_SECOND_REQUEST'); }]);
    await f.worker.process(f.job);
    expect(f.requests).toHaveLength(2);
    const usage = await rows('ai_usage'); expect(usage).toHaveLength(1);
    expect(usage[0]!.version).toBe(1);
    expect(usage[0]!.data).toMatchObject({ event_id: f.job.id, status: 'RUNNING' });
    expect(usage[0]!.data.initial_reserved_cents).toBeGreaterThan(1);
    expect(usage[0]!.data.reserved_cents).toBe(usage[0]!.data.initial_reserved_cents);
    expect(usage[0]!.data.actual_cents).toBeUndefined(); expect(usage[0]!.data.completed_at).toBeUndefined();
    expect(await rows('assistant_lead_draft')).toHaveLength(1); expect(await rows('assistant_tool_call')).toHaveLength(2);
    for (const kind of ['lead', 'quote', 'order', 'dispatch_request']) expect(await rows(kind), kind).toHaveLength(0);
    expect((await rows('message')).filter(message => message.data.source === 'AI')).toHaveLength(0);
    expect((await row('channel', f.submitted.channelId)).data.handoff.state).toBe('HANDOFF_PENDING');
  });

  it('rechecks the worker lease atomically after waiting for the genuine company lock before tools execute', async () => {
    let blocker: PoolClient | undefined;
    let ownerPid: number | undefined, reachedProvider!: () => void;
    const providerEntered = new Promise<void>(resolve => { reachedProvider = resolve; });
    const f = await fixture([async () => {
      blocker = await db.pool.connect();
      ownerPid = Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await blocker.query('SELECT pg_advisory_lock(hashtext($1))', [company]); reachedProvider();
      return answer(plan);
    }]);
    const processing = f.worker.process(f.job);
    try {
      await Promise.race([providerEntered, processing.then(() => { throw new Error('Worker completed before reaching the mocked external provider'); })]);
      // Synchronize against PostgreSQL's actual lock waiter, rather than timing
      // a sleep or replacing the host/database transaction with a fake.
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (Date.now() < deadline) {
        const locks = await db.query("SELECT w.pid FROM pg_locks h JOIN pg_locks w ON w.locktype=h.locktype AND w.database IS NOT DISTINCT FROM h.database AND w.classid=h.classid AND w.objid=h.objid AND w.objsubid=h.objsubid WHERE h.pid=$1 AND h.locktype='advisory' AND h.granted AND NOT w.granted", [ownerPid]);
        if (locks.rows.length) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting, 'Worker must actually wait on the held company lock').toBe(true);
      await db.query("UPDATE outbox SET lease_token=$1,leased_until=clock_timestamp()-interval '1 second' WHERE company_id=$2 AND id=$3", [randomUUID(), company, f.job.id]);
    } finally {
      if (blocker) { try { await blocker.query('SELECT pg_advisory_unlock(hashtext($1))', [company]); } finally { blocker.release(); } }
      await processing;
    }
    expect(f.requests).toHaveLength(1); await noBusinessEffects();
  });
});
