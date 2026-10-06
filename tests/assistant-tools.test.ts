import { describe, expect, it } from 'vitest';
import { commerceCommands } from '../packages/domain/commerce.ts';
import { assert, DomainError, type Actor, type CommandContext, type Data, type Entity, type Transaction } from '../packages/domain/core.ts';
import { ROLE_PERMISSIONS } from '../packages/domain/permissions.ts';
import {
  ASSISTANT_TOOL_NAMES, assistantToolCatalog, confirmAssistantLeadDraft, dispatchAssistantTools,
  formatAssistantEUR, renderAssistantEstimate, type AssistantToolBinding, type AssistantToolCall,
  type AssistantToolHost, type AssistantToolName
} from '../packages/integrations/assistant-tools.ts';

const NOW = '2026-10-06T10:00:00.000Z';
const CANARIES = ['BANK_CANARY', 'STAFF_CANARY', 'OTHER_CUSTOMER_CANARY', 'OTHER_COMPANY_CANARY', 'HIDDEN_TASK_CANARY'];

// A serialized, clone-on-read transaction fixture with real rollback of rows,
// events and generated IDs. These are CPU/domain tests, not PostgreSQL evidence.
class MemoryTransaction implements Transaction {
  rows = new Map<string, Entity>();
  events: { type: string; data: Data }[] = [];
  sequence = 0;
  constructor(public companyId = 'company') {}
  rowKey(kind: string, id: string, companyId = this.companyId) { return `${companyId}:${kind}:${id}`; }
  async get<T extends Data = Data>(kind: string, id: string): Promise<Entity<T>> {
    const row = this.rows.get(this.rowKey(kind, id));
    assert(row, 'NOT_FOUND_SAFE');
    return structuredClone(row) as Entity<T>;
  }
  async list<T extends Data = Data>(kind: string): Promise<Entity<T>[]> {
    return [...this.rows.values()].filter(row => row.companyId === this.companyId && row.kind === kind).map(row => structuredClone(row) as Entity<T>);
  }
  async add<T extends Data = Data>(kind: string, data: T, id = `${kind}-${++this.sequence}`): Promise<Entity<T>> {
    assert(!this.rows.has(this.rowKey(kind, id)), 'VERSION_CONFLICT');
    const row: Entity<T> = { kind, id, companyId: this.companyId, version: 1, data: structuredClone(data), createdAt: NOW, updatedAt: NOW };
    this.rows.set(this.rowKey(kind, id), row);
    return structuredClone(row);
  }
  async save(row: Entity, data: Data, expectedVersion = row.version) {
    assert(row.companyId === this.companyId, 'ACCESS_DENIED');
    const current = await this.get(row.kind, row.id);
    assert(current.version === expectedVersion, 'VERSION_CONFLICT');
    const next = { ...current, version: current.version + 1, data: structuredClone(data), updatedAt: NOW };
    this.rows.set(this.rowKey(row.kind, row.id), next);
    return structuredClone(next);
  }
  async event(type: string, data: Data) { this.events.push({ type, data: structuredClone(data) }); }
  snapshot() { return structuredClone({ rows: [...this.rows], events: this.events, sequence: this.sequence }); }
  restore(snapshot: ReturnType<MemoryTransaction['snapshot']>) {
    this.rows = new Map(snapshot.rows); this.events = snapshot.events; this.sequence = snapshot.sequence;
  }
}

async function fixture() {
  const tx = new MemoryTransaction(), denied = new Set<string>();
  let monotonic = 0, serial: Promise<void> = Promise.resolve();
  const invocations: { permission: string; actor: Actor; expectedVersion?: number }[] = [];
  const transactions: { companyId: string; actorId: string; timeoutMs: number }[] = [];
  const host: AssistantToolHost<MemoryTransaction> = {
    registry: { ...commerceCommands }, now: () => new Date(NOW), monotonicNow: () => monotonic,
    transaction: async (companyId, actorId, fn, timeoutMs) => {
      transactions.push({ companyId, actorId, timeoutMs });
      assert(companyId === tx.companyId, 'ACCESS_DENIED');
      const previous = serial; let release!: () => void;
      serial = new Promise<void>(resolve => { release = resolve; });
      await previous; const snapshot = tx.snapshot();
      try { return await fn(tx); } catch (error) { tx.restore(snapshot); throw error; } finally { release(); }
    },
    actorIn: async (currentTx, userId) => {
      const user = await currentTx.get('user', userId); assert(user.data.active !== false, 'ACCESS_DENIED');
      const roles = user.data.roles as string[];
      return { userId, companyId: currentTx.companyId, roles, permissions: [...new Set([...roles.flatMap(role => ROLE_PERMISSIONS[role] ?? []), ...user.data.permissions])], siteIds: user.data.siteIds, customerIds: user.data.customerIds, warehouseIds: [] };
    },
    context: (currentTx, actor, idempotencyKey, expectedVersion, now, permission): CommandContext => {
      // The host contract applies the requested permission's direct scope and
      // never manufactures a right or uses a manager/self bypass.
      const scoped = { ...actor, siteIds: actor.permissions.includes(permission) ? [...actor.siteIds] : [], permissions: [...actor.permissions] };
      invocations.push({ permission, actor: structuredClone(scoped), expectedVersion });
      return { tx: currentTx, actor: scoped, idempotencyKey, expectedVersion, now,
        requireSite: siteId => assert(scoped.permissions.includes('scope.company') || scoped.siteIds.includes(siteId), 'ACCESS_DENIED'),
        requireOwn: userId => assert(userId === scoped.userId, 'ACCESS_DENIED') };
    },
    visible: async (currentTx, actor, entity) => {
      if (entity.companyId !== actor.companyId || denied.has(`${entity.kind}:${entity.id}`) || !actor.permissions.includes('chat.read')) return false;
      const channel = entity.kind === 'channel' ? entity : await currentTx.get('channel', entity.data.channel_id);
      return !!channel.data.members?.some((member: Data) => member.user_id === actor.userId && member.active !== false && !member.revoked_at && !member.left_at && !member.removed_at && (!member.expires_at || Date.parse(member.expires_at) > Date.parse(NOW)));
    }
  };
  await tx.add('company', { operatingMode: 'TEST' }, 'company');
  // Use the ordinary CLIENT role: tool routing must select the bounded own-lead
  // commands, never add broad lead-management authority to make a test pass.
  await tx.add('user', { active: true, roles: ['CLIENT'], permissions: [], siteIds: ['site-a'], customerIds: ['customer-a', 'customer-b'] }, 'client');
  await tx.add('user', { active: true, roles: ['CLIENT'], permissions: [], siteIds: [], customerIds: [] }, 'other-user');
  await tx.add('service', { name: 'Fensterreinigung', description: 'Reinigung nach Personenstunden', unit: 'PERSON_HOUR', model: 'HOURLY', active: true, approvedBy: 'catalog-reviewer', included: ['Reinigungsmittel'], excluded: ['Gerüst'], questions: ['Wie viele Personenstunden?'], requiredSkills: [], requiresVisit: false }, 'cleaning');
  await tx.add('service', { name: 'Ungeprüfte Leistung', description: 'STAFF_CANARY', unit: 'PERSON_HOUR', active: true, included: [], excluded: [], questions: [] }, 'unapproved');
  await tx.add('service', { name: 'Inaktive Leistung', description: 'STAFF_CANARY', unit: 'PERSON_HOUR', active: false, approvedBy: 'reviewer', included: [], excluded: [], questions: [] }, 'inactive');
  await tx.add('service', { name: 'Nicht freigegebener Katalog', description: 'STAFF_CANARY', unit: 'PERSON_HOUR', active: true, approvedBy: 'reviewer', included: [], excluded: [], questions: [] }, 'disallowed');
  await tx.add('price_book', { name: 'Reviewed synthetic EUR rates', status: 'ACTIVE', approvedBy: 'reviewer', validFrom: '2026-01-01T00:00:00.000Z', currency: 'EUR', mode: 'GUIDED', tax: { mode: 'VAT', rateBps: 1900, display: 'GROSS', testOnly: true }, rules: [{ serviceId: 'cleaning', rateCents: 2250, minimumQuantityMilli: 0, minimumCents: 0, included: false }] }, 'prices');
  await tx.add('assistant_config', { status: 'ACTIVE', configVersion: 3, tools: [...ASSISTANT_TOOL_NAMES], allowedServiceIds: ['cleaning', 'unapproved', 'inactive'], territories: ['Berlin'], pricingPolicy: 'SERVER_PRICE_ONLY', contextPolicy: 'ACL_FILTER_BEFORE_RETRIEVAL', handoffPolicy: 'SUPPRESS_AI_UNTIL_AUTHORIZED_RETURN' }, 'config');
  await tx.add('channel', { type: 'PRIVATE_CUSTOMER_ASSISTANT', created_by: 'client', members: [{ user_id: 'client', active: true, joined_at: '2026-10-01T00:00:00.000Z', history_from: '2026-10-01T00:00:00.000Z' }], handoff: { state: 'AI_ACTIVE' } }, 'channel');
  await tx.add('message', { channel_id: 'channel', author_id: 'client', text: 'Drei Personen für zwei Stunden reinigen Fenster.', language: 'DE', message_version: 1 }, 'message');
  for (const customerId of ['customer-a', 'customer-b']) await tx.add('customer', { name: customerId, active: true }, customerId);
  await tx.add('customer_membership', { userId: 'client', customerId: 'customer-a', active: true, permissions: ['VIEW'], siteIds: ['site-a'], expiresAt: '2026-11-01T00:00:00.000Z' }, 'membership');
  await tx.add('site', { customerId: 'customer-a', name: 'Allowed site', active: true }, 'site-a');
  await tx.add('site', { customerId: 'customer-a', name: 'Excluded site', active: true }, 'site-b');
  await tx.add('site', { customerId: 'customer-b', name: 'OTHER_CUSTOMER_CANARY', active: true }, 'site-c');
  for (const [id, siteId, customerId] of [['order-a', 'site-a', 'customer-a'], ['order-b', 'site-b', 'customer-a'], ['order-c', 'site-c', 'customer-b']]) {
    await tx.add('order', { siteId, customerId, status: 'SCHEDULED', scope: id === 'order-a' ? 'Fensterreinigung' : 'OTHER_CUSTOMER_CANARY', pricingModel: 'FIXED', baseNetCents: 13500, approvedChangesNetCents: 0, finalNetCents: 13500, tax: { mode: 'VAT', rateBps: 1900 }, billing: { invoicedCents: 16065, paidCents: 0 }, scheduleVersion: 2, confirmedStartAt: '2026-10-09T08:00:00.000Z', margin: 'BANK_CANARY', employeeRates: 'STAFF_CANARY' }, id);
  }
  await tx.add('location', { siteId: 'site-a', name: 'Fenster EG', active: true }, 'location-a');
  await tx.add('location', { siteId: 'site-b', name: 'OTHER_CUSTOMER_CANARY' }, 'location-b');
  await tx.add('task', { siteId: 'site-a', orderId: 'order-a', locationId: 'location-a', title: 'Published cleaning', state: 'DONE', clientVisible: true, internalNotes: 'STAFF_CANARY' }, 'task-a');
  await tx.add('task', { siteId: 'site-a', orderId: 'order-a', title: 'HIDDEN_TASK_CANARY', state: 'OPEN', clientVisible: false }, 'hidden-task');
  for (const [id, siteId, customerId] of [['report-a', 'site-a', 'customer-a'], ['report-b', 'site-b', 'customer-a']]) {
    await tx.add('report', { siteId, customerId, state: 'PUBLISHED', currentVersionId: `${id}-v1`, publishedAt: NOW }, id);
    await tx.add('report_version', { reportId: id, siteId, customerId, version: 1, publishedAt: NOW, immutable: true, sha256: 'a'.repeat(64), snapshot: { number: 'KNB-R-1', descriptionDe: id === 'report-a' ? 'Geprüfte Fensterreinigung' : 'OTHER_CUSTOMER_CANARY', taskRows: id === 'report-a' ? [{ taskId: 'task-a' }] : [], wages: 'BANK_CANARY', internalNotes: 'STAFF_CANARY' } }, `${id}-v1`);
  }
  const foreign: Entity = { id: 'foreign-report', companyId: 'other-company', kind: 'report_version', version: 1, createdAt: NOW, updatedAt: NOW, data: { reportId: 'foreign', siteId: 'site-a', customerId: 'customer-a', immutable: true, publishedAt: NOW, snapshot: { descriptionDe: 'OTHER_COMPANY_CANARY' } } };
  tx.rows.set(tx.rowKey(foreign.kind, foreign.id, foreign.companyId), foreign);
  const binding: AssistantToolBinding = { companyId: 'company', actorId: 'client', configId: 'config', configVersion: 3, channelId: 'channel', channelVersion: 1, messageId: 'message', messageVersion: 1, sourceChannel: 'WEB' };
  return { tx, host, binding, denied, invocations, transactions, setMonotonic: (value: number) => { monotonic = value; } };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const call = (name: AssistantToolName, argumentsValue: unknown, id: string = name): AssistantToolCall => ({ id, name, arguments: argumentsValue });
const draftInput = { territory: 'Berlin', contact: { name: 'Synthetic customer', email: 'customer@example.test' }, serviceIds: ['cleaning'], facts: { quantityMilli: 6000, address: 'Synthetic Berlin address', customerType: 'B2C', propertyType: 'Office', desiredPeriod: 'Next week' }, language: 'DE' };
const estimateInput = { territory: 'Berlin', priceBookId: 'prices', lines: [{ serviceId: 'cleaning', quantityMilli: 6000 }] };
async function dispatch(f: Fixture, calls: AssistantToolCall[], binding = f.binding) { return dispatchAssistantTools(binding, calls, f.host); }
async function update(f: Fixture, kind: string, id: string, changes: Data) { const row = await f.tx.get(kind, id); return f.tx.save(row, { ...row.data, ...changes }, row.version); }
async function currentBinding(f: Fixture) { return { ...f.binding, channelVersion: (await f.tx.get('channel', f.binding.channelId)).version }; }
async function savedDraft(f: Fixture, id = 'draft-save') { return (await dispatch(f, [call('saveLeadDraft', draftInput, id)])).results[0]!.result; }
async function confirmedLead(f: Fixture) {
  const draft = await savedDraft(f);
  const result = await confirmAssistantLeadDraft(f.binding, { draftId: draft.draftId, expectedVersion: draft.draftVersion, previewHash: draft.previewHash }, f.host);
  return { draft, result, lead: await f.tx.get('lead', result.leadId), binding: await currentBinding(f) };
}
function noCanaries(value: unknown) { for (const canary of CANARIES) expect(JSON.stringify(value)).not.toContain(canary); }

describe('bounded customer assistant tools with actual commerce handlers', () => {
  it('retrieves only approved configured active services and approved questions', async () => {
    const f = await fixture();
    const result = await dispatch(f, [call('searchApprovedServices', { query: 'fenster' }), call('getServiceQuestions', { serviceId: 'cleaning' })]);
    expect(result.results[0]!.result.services.map((service: Data) => service.id)).toEqual(['cleaning']);
    expect(result.results[1]!.result).toMatchObject({ questions: ['Wie viele Personenstunden?'], unit: 'PERSON_HOUR', measurementSource: 'CUSTOMER_STATED' });
    noCanaries(result); expect(f.transactions[0]).toEqual({ companyId: 'company', actorId: 'client', timeoutMs: 10000 });
    expect(f.invocations.map(row => row.permission)).toEqual(['commerce.read', 'commerce.read']);
  });
  it.each(['unapproved', 'inactive', 'disallowed', 'foreign-service'])('cannot retrieve or price %s', async serviceId => {
    const f = await fixture(), before = f.tx.snapshot();
    await expect(dispatch(f, [call('calculateEstimate', { ...estimateInput, lines: [{ serviceId, quantityMilli: 6000 }] })])).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(f.tx.snapshot()).toEqual(before);
  });
  it('calculates six person-hours from server cents and VAT, with fixed customer text', async () => {
    const f = await fixture(), result = (await dispatch(f, [call('calculateEstimate', estimateInput)])).results[0]!.result;
    expect(result).toMatchObject({ totalNetCents: 13500, totalTaxCents: 2565, totalGrossCents: 16065, currency: 'EUR', source: 'SERVER_PRICE_ENGINE', status: 'ESTIMATE_NOT_QUOTE', measurementSource: 'CUSTOMER_STATED', teamConfirmed: false, scheduleConfirmed: false, tax: { rateBps: 1900, display: 'GROSS' } });
    expect(result.lines).toEqual([{ serviceId: 'cleaning', quantityMilli: 6000, unit: 'PERSON_HOUR', rateCents: 2250, netCents: 13500 }]);
    expect(result.customerText).toContain('160,65 EUR brutto (135,00 EUR netto; 25,65 EUR Steuer)');
    expect(result.customerText).toContain('Kein verbindliches Angebot; Team und Termin sind noch nicht bestätigt.');
    expect(await f.tx.list('quote')).toHaveLength(0); expect(await f.tx.list('lead')).toHaveLength(0);
    expect(formatAssistantEUR(9007199254740991)).toBe('90071992547409,91 EUR');
    expect(() => renderAssistantEstimate({ ...result, totalNetCents: -1 })).toThrow();
  });
  it('does not estimate outside the approved territory or current price book', async () => {
    const f = await fixture();
    await expect(dispatch(f, [call('calculateEstimate', { ...estimateInput, territory: 'Hamburg' })])).rejects.toMatchObject({ code: 'NEEDS_APPROVAL' });
    await update(f, 'price_book', 'prices', { validUntil: NOW });
    await expect(dispatch(f, [call('calculateEstimate', estimateInput)])).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(await f.tx.list('assistant_tool_call')).toHaveLength(0);
  });
  it('saves a draft and a model confirmation request without creating a lead', async () => {
    const f = await fixture(), draft = await savedDraft(f);
    expect(draft).toMatchObject({ status: 'DRAFT', requiresUserConfirmation: true, leadId: null, preview: draftInput });
    expect(draft.preview.facts.measurementSource).toBe('CUSTOMER_STATED');
    expect(draft.previewHash).toMatch(/^[a-f0-9]{64}$/);
    const confirmation = (await dispatch(f, [call('confirmLead', { draftId: draft.draftId })])).results[0]!.result;
    expect(confirmation.requiresUserConfirmation).toBe(true);
    expect(await f.tx.list('lead')).toHaveLength(0); expect((await f.tx.get('channel', 'channel')).data.lead_id).toBeUndefined();
    expect(f.tx.events.filter(event => event.type === 'lead.created')).toHaveLength(0);
  });
  it('explicit reviewed user confirmation creates one actual lead and links its channel', async () => {
    const f = await fixture(), { draft, result, lead, binding } = await confirmedLead(f);
    expect(lead.data).toMatchObject({ ownerUserId: 'client', ownership: 'AI_ACTIVE', status: 'NEW', facts: { quantityMilli: 6000, measurementSource: 'CUSTOMER_STATED' }, marketingConsent: false });
    expect((await f.tx.get('channel', 'channel')).data.lead_id).toBe(lead.id);
    expect((await f.tx.get('assistant_lead_draft', draft.draftId)).data).toMatchObject({ state: 'CONFIRMED', confirmedBy: 'client', leadId: lead.id });
    expect(result).toMatchObject({ confirmedByUser: true, teamConfirmed: false, scheduleConfirmed: false });
    const replay = await confirmAssistantLeadDraft(binding, { draftId: draft.draftId, expectedVersion: draft.draftVersion, previewHash: draft.previewHash }, f.host);
    expect(replay.leadId).toBe(lead.id); expect(await f.tx.list('lead')).toHaveLength(1);
    expect(f.tx.events.filter(event => event.type === 'lead.created')).toHaveLength(1);
    expect(f.tx.events.filter(event => event.type === 'assistant.lead_confirmed')).toHaveLength(1);
  });
  it('serializes concurrent confirmations into one lead effect', async () => {
    const f = await fixture(), draft = await savedDraft(f), input = { draftId: draft.draftId, expectedVersion: draft.draftVersion, previewHash: draft.previewHash };
    const results = await Promise.allSettled([confirmAssistantLeadDraft(f.binding, input, f.host), confirmAssistantLeadDraft(f.binding, input, f.host)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'VERSION_CONFLICT' } });
    expect(await f.tx.list('lead')).toHaveLength(1); expect(f.tx.events.filter(event => event.type === 'lead.created')).toHaveLength(1);
  });
  it('preserves the authenticated WhatsApp source recorded with the preview', async () => {
    const f = await fixture(), whatsapp = { ...f.binding, sourceChannel: 'WHATSAPP' as const };
    const draft = (await dispatch(f, [call('saveLeadDraft', draftInput)], whatsapp)).results[0]!.result;
    const result = await confirmAssistantLeadDraft(f.binding, { draftId: draft.draftId, expectedVersion: draft.draftVersion, previewHash: draft.previewHash }, f.host);
    expect((await f.tx.get('lead', result.leadId)).data.createdSource.channel).toBe('WHATSAPP');
    expect((await f.tx.get('assistant_lead_draft', draft.draftId)).data.sourceChannel).toBe('WHATSAPP');
  });
  it('creates the reviewed input even when an older open lead has the same service', async () => {
    const f = await fixture();
    await f.tx.add('lead', { ownerUserId: 'client', ownership: 'AI_ACTIVE', status: 'NEW', serviceIds: ['cleaning'], contact: { name: 'Earlier request', email: 'earlier@example.test' }, facts: { quantityMilli: 1000, address: 'Earlier address' } }, 'older-lead');
    const { draft, lead } = await confirmedLead(f);
    expect(lead.data.contact).toEqual(draft.preview.contact);
    expect(lead.data.facts).toEqual(draft.preview.facts);
    expect(lead.data.createdSource).toEqual({ channel: 'WEB' });
    expect((await f.tx.get('lead', 'older-lead')).data.contact.name).toBe('Earlier request');
  });
  it.each(['hash', 'version', 'changed-preview', 'other-owner', 'other-channel'])('rejects user confirmation with %s', async mutation => {
    const f = await fixture(), draft = await savedDraft(f), input = { draftId: draft.draftId, expectedVersion: draft.draftVersion, previewHash: draft.previewHash };
    if (mutation === 'hash') input.previewHash = 'b'.repeat(64);
    if (mutation === 'version') input.expectedVersion++;
    if (mutation === 'changed-preview') await update(f, 'assistant_lead_draft', draft.draftId, { input: { ...draft.preview, contact: { name: 'Changed', email: 'changed@example.test' } } });
    if (mutation === 'other-owner') await update(f, 'assistant_lead_draft', draft.draftId, { ownerUserId: 'other-user' });
    if (mutation === 'other-channel') await update(f, 'assistant_lead_draft', draft.draftId, { channelId: 'different-channel' });
    const before = f.tx.snapshot(); await expect(confirmAssistantLeadDraft(f.binding, input, f.host)).rejects.toBeDefined();
    expect(f.tx.snapshot()).toEqual(before); expect(await f.tx.list('lead')).toHaveLength(0);
  });
  it('replays draft tools without duplicate rows and rejects changed arguments for the same call ID', async () => {
    const f = await fixture(), first = await savedDraft(f, 'stable-call'), second = await savedDraft(f, 'stable-call');
    expect(second.draftId).toBe(first.draftId); expect(await f.tx.list('assistant_lead_draft')).toHaveLength(1);
    await expect(dispatch(f, [call('saveLeadDraft', { ...draftInput, contact: { name: 'Changed', email: 'changed@example.test' } }, 'stable-call')])).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(await f.tx.list('assistant_lead_draft')).toHaveLength(1);
  });
  it.each([
    ['model-confirm', call('confirmLead', { draftId: 'arbitrary', confirmed: true })],
    ['model-owner', call('saveLeadDraft', { ...draftInput, ownerUserId: 'other-user' })],
    ['model-source', call('saveLeadDraft', { ...draftInput, sourceChannel: 'WHATSAPP' })],
    ['model-role', call('saveLeadDraft', { ...draftInput, roles: ['OWNER'] })],
    ['model-rate', call('calculateEstimate', { ...estimateInput, lines: [{ serviceId: 'cleaning', quantityMilli: 6000, rateCents: 1 }] })],
    ['model-total', call('calculateEstimate', { ...estimateInput, totalGrossCents: 1 })],
    ['model-verification', call('saveLeadDraft', { ...draftInput, facts: { ...draftInput.facts, measurementSource: 'VERIFIED' } })]
  ])('validates %s before any proposed batch mutation', async (_name, invalidCall) => {
    const f = await fixture(), before = f.tx.snapshot();
    await expect(dispatch(f, [call('saveLeadDraft', draftInput, 'valid-first'), invalidCall])).rejects.toBeDefined();
    expect(f.transactions).toHaveLength(0); expect(f.tx.snapshot()).toEqual(before);
  });
  it('rejects unknown tools, duplicate call IDs and batches over six before transaction', async () => {
    const f = await fixture(), before = f.tx.snapshot();
    await expect(dispatchAssistantTools(f.binding, [{ id: 'unknown', name: 'confirmAssistantLeadDraft', arguments: {} }], f.host)).rejects.toBeDefined();
    await expect(dispatch(f, [call('searchApprovedServices', {}, 'same'), call('getServiceQuestions', { serviceId: 'cleaning' }, 'same')])).rejects.toBeDefined();
    await expect(dispatch(f, Array.from({ length: 7 }, (_, i) => call('searchApprovedServices', {}, String(i))))).rejects.toBeDefined();
    expect(f.transactions).toHaveLength(0); expect(f.tx.snapshot()).toEqual(before);
    expect(() => assistantToolCatalog(['unregisteredTool'])).toThrow();
  });
  it('rolls the whole batch back when a later valid tool is absent from config', async () => {
    const f = await fixture(); await update(f, 'assistant_config', 'config', { tools: ['saveLeadDraft'] }); const before = f.tx.snapshot();
    await expect(dispatch(f, [call('saveLeadDraft', draftInput), call('searchApprovedServices', {})])).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.tx.snapshot()).toEqual(before);
  });
  it.each(['inactive-user', 'lost-permission', 'internal-role', 'disabled-config', 'config-version', 'pricing-policy', 'context-policy', 'handoff-policy', 'channel-version', 'human-channel', 'wrong-private-owner', 'wrong-channel-type', 'revoked-member', 'expired-member', 'deleted-message', 'other-author', 'other-message-channel', 'history-cutoff', 'channel-not-visible', 'message-not-visible'])('uses fresh %s authorization before effects', async mutation => {
    const f = await fixture();
    if (mutation === 'inactive-user') await update(f, 'user', 'client', { active: false });
    if (mutation === 'lost-permission') await update(f, 'user', 'client', { roles: [], permissions: [], siteIds: [] });
    if (mutation === 'internal-role') await update(f, 'user', 'client', { roles: ['OWNER'], permissions: ['lead.create'] });
    if (mutation === 'disabled-config') await update(f, 'assistant_config', 'config', { status: 'DISABLED' });
    if (mutation === 'config-version') await update(f, 'assistant_config', 'config', { configVersion: 4 });
    if (mutation === 'pricing-policy') await update(f, 'assistant_config', 'config', { pricingPolicy: 'MODEL_PRICE' });
    if (mutation === 'context-policy') await update(f, 'assistant_config', 'config', { contextPolicy: 'UNFILTERED' });
    if (mutation === 'handoff-policy') await update(f, 'assistant_config', 'config', { handoffPolicy: 'KEEP_AI_ACTIVE' });
    if (mutation === 'channel-version') await update(f, 'channel', 'channel', { name: 'Changed channel' });
    if (mutation === 'human-channel') await update(f, 'channel', 'channel', { handoff: { state: 'HUMAN_ACTIVE' } });
    if (mutation === 'wrong-private-owner') await update(f, 'channel', 'channel', { created_by: 'other-user' });
    if (mutation === 'wrong-channel-type') await update(f, 'channel', 'channel', { type: 'SITE_INTERNAL' });
    if (mutation === 'revoked-member') await update(f, 'channel', 'channel', { members: [{ user_id: 'client', revoked_at: NOW }] });
    if (mutation === 'expired-member') await update(f, 'channel', 'channel', { members: [{ user_id: 'client', expires_at: NOW }] });
    if (mutation === 'deleted-message') await update(f, 'message', 'message', { deleted_at: NOW });
    if (mutation === 'other-author') await update(f, 'message', 'message', { author_id: 'other-user' });
    if (mutation === 'other-message-channel') await update(f, 'message', 'message', { channel_id: 'another-channel' });
    if (mutation === 'history-cutoff') await update(f, 'channel', 'channel', { members: [{ user_id: 'client', history_from: '2026-10-06T10:00:00.001Z' }] });
    if (mutation === 'channel-not-visible') f.denied.add('channel:channel');
    if (mutation === 'message-not-visible') f.denied.add('message:message');
    const binding = mutation === 'channel-version' ? f.binding : await currentBinding(f), before = f.tx.snapshot();
    await expect(dispatch(f, [call('saveLeadDraft', draftInput)], binding)).rejects.toBeDefined();
    expect(f.tx.snapshot()).toEqual(before);
  });
  it('rejects incorrect actor identity or company supplied by a host', async () => {
    for (const changes of [{ userId: 'other-user' }, { companyId: 'other-company' }]) {
      const f = await fixture(), actorIn = f.host.actorIn;
      f.host.actorIn = async (tx, userId) => ({ ...await actorIn(tx, userId), ...changes });
      await expect(dispatch(f, [call('saveLeadDraft', draftInput)])).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
      expect(await f.tx.list('assistant_lead_draft')).toHaveLength(0);
    }
  });
  it('rejects a stale AI plan after the source message is corrected and accepts the current version', async () => {
    const f = await fixture();
    await update(f, 'message', 'message', { message_version: 2, text: 'Korrektur: eine Person statt drei Personen.' });
    const before = f.tx.snapshot();
    await expect(dispatch(f, [call('saveLeadDraft', draftInput, 'stale-quantity')])).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(f.tx.snapshot()).toEqual(before); expect(f.invocations).toHaveLength(0);
    const result = await dispatch(f, [call('searchApprovedServices', { query: 'fenster' }, 'current-message')], { ...f.binding, messageVersion: 2 });
    expect(result.results[0]!.result.services.map((service: Data) => service.id)).toEqual(['cleaning']);
    expect(await f.tx.list('assistant_lead_draft')).toHaveLength(0);
    expect((await f.tx.get('message', 'message')).data).toMatchObject({ message_version: 2, text: 'Korrektur: eine Person statt drei Personen.' });
  });
  it('cannot confirm an old preview using a fresh binding after its original message is corrected', async () => {
    const f = await fixture(), draft = await savedDraft(f);
    expect((await f.tx.get('assistant_lead_draft', draft.draftId)).data).toMatchObject({ messageId: 'message', messageVersion: 1 });
    await update(f, 'message', 'message', { message_version: 2, text: 'Korrektur der ursprünglichen Anfrage: nur eine Personenstunde.' });
    const current = { ...f.binding, messageVersion: 2 }, before = f.tx.snapshot();
    await expect(confirmAssistantLeadDraft(current, { draftId: draft.draftId, expectedVersion: draft.draftVersion, previewHash: draft.previewHash }, f.host)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(dispatch(f, [call('confirmLead', { draftId: draft.draftId }, 'old-preview-new-source')], current)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(f.tx.snapshot()).toEqual(before); expect(await f.tx.list('lead')).toHaveLength(0); expect(f.invocations).toHaveLength(0);
    expect((await f.tx.get('assistant_lead_draft', draft.draftId)).data.state).toBe('DRAFT');
  });
  it('rechecks permissions and catalog approval before replaying or confirming a saved draft', async () => {
    const f = await fixture(), draft = await savedDraft(f);
    await update(f, 'service', 'cleaning', { approvedBy: null });
    await expect(confirmAssistantLeadDraft(f.binding, { draftId: draft.draftId, expectedVersion: draft.draftVersion, previewHash: draft.previewHash }, f.host)).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    await update(f, 'user', 'client', { roles: ['EXTERNAL_BAULEITER'], permissions: [] });
    await expect(dispatch(f, [call('saveLeadDraft', draftInput, 'draft-save')])).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(await f.tx.list('lead')).toHaveLength(0);
  });
  it('requires fresh VIEW membership for a SITE_CLIENT conversation itself', async () => {
    const f = await fixture(); await update(f, 'channel', 'channel', { type: 'SITE_CLIENT', site_id: 'site-a' }); const binding = await currentBinding(f);
    await dispatch(f, [call('searchApprovedServices', {})], binding);
    await update(f, 'customer_membership', 'membership', { revokedAt: NOW });
    const before = f.tx.snapshot(); await expect(dispatch(f, [call('searchApprovedServices', {}, 'revoked')], binding)).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(f.tx.snapshot()).toEqual(before);
  });
  it('requires chat.write to hand off a private conversation', async () => {
    const f = await fixture(), permissions = [...ROLE_PERMISSIONS.CLIENT!].filter(permission => permission !== 'chat.write');
    await update(f, 'user', 'client', { roles: ['CUSTOMER'], permissions }); const before = f.tx.snapshot();
    await expect(dispatch(f, [call('requestHumanHandoff', { reason: 'No current write permission' })])).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.tx.snapshot()).toEqual(before);
  });
  it.each(['other-owner', 'confidential', 'not-image', 'unclean-state', 'excluded-site'])('rejects %s photo references before saving a sales draft', async mutation => {
    const f = await fixture(); await f.tx.add('media_asset', { uploadedBy: mutation === 'other-owner' ? 'other-user' : 'client', visibility: mutation === 'confidential' ? 'CONFIDENTIAL' : 'INTERNAL', mimeType: mutation === 'not-image' ? 'application/pdf' : 'image/png', state: mutation === 'unclean-state' ? 'QUARANTINED' : 'RECEIVED', siteId: mutation === 'excluded-site' ? 'site-b' : 'site-a', internalMetadata: 'STAFF_CANARY' }, 'photo');
    const before = f.tx.snapshot();
    await expect(dispatch(f, [call('saveLeadDraft', { ...draftInput, facts: { ...draftInput.facts, photoIds: ['photo'] } })])).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(f.tx.snapshot()).toEqual(before);
  });
  it('handoff stops later tools and suppresses subsequent provider batches', async () => {
    const f = await fixture(), result = await dispatch(f, [call('requestHumanHandoff', { reason: 'Customer requests a person' }), call('saveLeadDraft', draftInput)]);
    expect(result.stoppedForHandoff).toBe(true); expect(result.results).toHaveLength(1);
    expect(result.results[0]!.result).toMatchObject({ aiSuppressed: true, teamConfirmed: false, scheduleConfirmed: false });
    expect(await f.tx.list('assistant_lead_draft')).toHaveLength(0); expect(await f.tx.list('decision')).toHaveLength(1);
    await expect(dispatch(f, [call('searchApprovedServices', {}, 'after-handoff')], await currentBinding(f))).rejects.toMatchObject({ code: 'AI_SUPPRESSED' });
  });
  it('requests a site visit through the real command and never confirms staffing or schedule', async () => {
    const f = await fixture(), { lead, binding } = await confirmedLead(f);
    const result = await dispatch(f, [call('requestSiteVisit', { leadId: lead.id, expectedVersion: lead.version, reason: 'Professional site measurement required' }), call('calculateEstimate', estimateInput)], binding);
    expect(result.results).toHaveLength(1); expect(result.results[0]!.result).toMatchObject({ visitStatus: 'REQUESTED', visitConfirmed: false, aiSuppressed: true, teamConfirmed: false, scheduleConfirmed: false });
    expect(await f.tx.list('site_visit_request')).toHaveLength(1); expect((await f.tx.get('lead', lead.id)).data.ownership).toBe('HANDOFF_PENDING');
  });
  it('allows ordinary CLIENT own-lead visit requests without a broad lead.manage grant', async () => {
    const f = await fixture(); await update(f, 'user', 'client', { permissions: [] }); const { lead, binding } = await confirmedLead(f);
    const result = await dispatch(f, [call('requestSiteVisit', { leadId: lead.id, expectedVersion: lead.version, reason: 'Own customer site visit' })], binding);
    expect(result.results[0]!.result.visitStatus).toBe('REQUESTED');
  });
  it('refuses other-owner and human-owned linked leads despite a valid customer role', async () => {
    for (const changes of [{ ownerUserId: 'other-user' }, { ownership: 'HUMAN_ACTIVE' }]) {
      const f = await fixture(), { lead, binding } = await confirmedLead(f); await update(f, 'lead', lead.id, changes);
      const before = f.tx.snapshot(); await expect(dispatch(f, [call('requestHumanHandoff', { reason: 'Not my lead', leadId: lead.id })], binding)).rejects.toMatchObject({ code: 'AI_SUPPRESSED' });
      expect(f.tx.snapshot()).toEqual(before);
    }
  });
  it('returns minimized own order/report data and creates only an unsubmitted Issue draft', async () => {
    const f = await fixture(), result = await dispatch(f, [call('getOwnOrderStatus', { customerId: 'customer-a', orderId: 'order-a' }), call('getOwnPublishedReport', { customerId: 'customer-a', reportVersionId: 'report-a-v1' }), call('createOwnIssueDraft', { siteId: 'site-a', orderId: 'order-a', locationId: 'location-a', taskId: 'task-a', description: 'Fenster müssen nachgereinigt werden' })]);
    expect(result.results[0]!.result.order).toMatchObject({ id: 'order-a', scope: 'Fensterreinigung', status: 'SCHEDULED', scheduleVersion: 2 });
    expect(result.results[1]!.result).toMatchObject({ reportVersionId: 'report-a-v1', descriptionDe: 'Geprüfte Fensterreinigung', privateDownloadRequired: true });
    expect(result.results[2]!.result).toMatchObject({ state: 'DRAFT', requiresUserSubmission: true });
    const issue = (await f.tx.list('issue'))[0]!; expect(issue.data.state).toBe('DRAFT'); expect(await f.tx.list('decision')).toHaveLength(0); noCanaries(result);
    const replay = await dispatch(f, [call('createOwnIssueDraft', { siteId: 'site-a', orderId: 'order-a', locationId: 'location-a', taskId: 'task-a', description: 'Fenster müssen nachgereinigt werden' })]);
    expect(replay.results[0]!.result.issueId).toBe(issue.id); expect(await f.tx.list('issue')).toHaveLength(1);
  });
  it.each([
    call('getOwnOrderStatus', { customerId: 'customer-a', orderId: 'order-b' }),
    call('getOwnOrderStatus', { customerId: 'customer-b', orderId: 'order-c' }),
    call('getOwnPublishedReport', { customerId: 'customer-a', reportVersionId: 'report-b-v1' }),
    call('getOwnPublishedReport', { customerId: 'customer-a', reportVersionId: 'foreign-report' }),
    call('createOwnIssueDraft', { siteId: 'site-b', locationId: 'location-b', description: 'Wrong site' }),
    call('createOwnIssueDraft', { siteId: 'site-a', taskId: 'hidden-task', description: 'Hidden task' }),
    call('createOwnIssueDraft', { siteId: 'site-a', locationId: 'location-b', description: 'Cross-site location' })
  ])('rejects inaccessible customer references in $name', async inaccessible => {
    const f = await fixture(), before = f.tx.snapshot(); await expect(dispatch(f, [inaccessible])).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(f.tx.snapshot()).toEqual(before);
  });
  it.each([{ active: false }, { revokedAt: NOW }, { expiresAt: NOW }, { permissions: ['REPORT_ACK'] }, { siteIds: ['site-b'] }])('rechecks changed membership %j on reads, Issue creation and replay', async changes => {
    const f = await fixture(), issueCall = call('createOwnIssueDraft', { siteId: 'site-a', locationId: 'location-a', description: 'Own issue' }, 'issue-replay');
    await dispatch(f, [issueCall]); await update(f, 'customer_membership', 'membership', changes); const before = f.tx.snapshot();
    for (const currentCall of [call('getOwnOrderStatus', { customerId: 'customer-a', orderId: 'order-a' }), call('getOwnPublishedReport', { customerId: 'customer-a', reportVersionId: 'report-a-v1' }), issueCall]) await expect(dispatch(f, [currentCall])).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(f.tx.snapshot()).toEqual(before);
  });
  it('refuses Issue draft replay after the actor loses issue.create', async () => {
    const f = await fixture(), issueCall = call('createOwnIssueDraft', { siteId: 'site-a', locationId: 'location-a', description: 'Saved own issue' }, 'revoked-issue-right');
    await dispatch(f, [issueCall]);
    await update(f, 'user', 'client', { roles: ['CUSTOMER'], permissions: ROLE_PERMISSIONS.CLIENT!.filter(permission => permission !== 'issue.create') });
    const before = f.tx.snapshot(); await expect(dispatch(f, [issueCall])).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(f.tx.snapshot()).toEqual(before);
  });
  it('refuses explicit confirmed-draft replay after loss of lead.create', async () => {
    const f = await fixture(), { draft, binding } = await confirmedLead(f);
    await update(f, 'user', 'client', { roles: ['EXTERNAL_BAULEITER'], permissions: [] });
    const before = f.tx.snapshot();
    await expect(confirmAssistantLeadDraft(binding, { draftId: draft.draftId, expectedVersion: draft.draftVersion, previewHash: draft.previewHash }, f.host)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.tx.snapshot()).toEqual(before);
  });
  it('rolls back actual Issue mutation when elapsed tool time reaches the limit', async () => {
    const f = await fixture(), actual = commerceCommands['issue.draft']!;
    f.host.registry['issue.draft'] = { ...actual, handler: async (context, input) => { const result = await actual.handler(context, input); f.setMonotonic(10000); return result; } };
    const before = f.tx.snapshot();
    await expect(dispatch(f, [call('createOwnIssueDraft', { siteId: 'site-a', locationId: 'location-a', description: 'Timed out after real mutation' })])).rejects.toMatchObject({ code: 'ASSISTANT_TOOL_TIMEOUT' });
    expect(f.tx.snapshot()).toEqual(before); expect(await f.tx.list('issue')).toHaveLength(0);
  });
  it('rolls back actual lead creation when explicit confirmation exceeds its time limit', async () => {
    const f = await fixture(), draft = await savedDraft(f), actual = commerceCommands['lead.create']!;
    f.host.registry['lead.create'] = { ...actual, handler: async (context, input) => { const result = await actual.handler(context, input); f.setMonotonic(10000); return result; } };
    const before = f.tx.snapshot();
    await expect(confirmAssistantLeadDraft(f.binding, { draftId: draft.draftId, expectedVersion: draft.draftVersion, previewHash: draft.previewHash }, f.host)).rejects.toMatchObject({ code: 'ASSISTANT_TOOL_TIMEOUT' });
    expect(f.tx.snapshot()).toEqual(before); expect(await f.tx.list('lead')).toHaveLength(0);
  });
  it.each(['single-result', 'batch-result'])('rolls back earlier writes and receipts on %s overflow', async limit => {
    const f = await fixture(), size = limit === 'single-result' ? 1000 : 500;
    await update(f, 'service', 'cleaning', { name: 'N'.repeat(1000), description: 'D'.repeat(1000), included: Array(10).fill('I'.repeat(size)), excluded: Array(10).fill('E'.repeat(size)) });
    const searches = Array.from({ length: limit === 'single-result' ? 1 : 3 }, (_, index) => call('searchApprovedServices', { limit: 1 }, `large-${index}`));
    const before = f.tx.snapshot(); await expect(dispatch(f, [call('saveLeadDraft', draftInput), ...searches])).rejects.toMatchObject({ code: 'ASSISTANT_TOOL_RESULT_LIMIT' });
    expect(f.tx.snapshot()).toEqual(before); expect(await f.tx.list('assistant_lead_draft')).toHaveLength(0); expect(await f.tx.list('assistant_tool_call')).toHaveLength(0);
  });
  it('enforces the twenty pending-draft limit without additional effects', async () => {
    const f = await fixture(); for (let index = 0; index < 20; index++) await savedDraft(f, `pending-${index}`);
    const before = f.tx.snapshot(); await expect(savedDraft(f, 'too-many')).rejects.toMatchObject({ code: 'RATE_LIMITED' }); expect(f.tx.snapshot()).toEqual(before);
  });
});
