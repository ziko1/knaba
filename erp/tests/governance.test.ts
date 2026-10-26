import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DomainError, type Actor, type CommandContext, type Data, type Entity, type Transaction } from '../packages/domain/core.ts';
import { ROLE_PERMISSIONS } from '../packages/domain/permissions.ts';
import { governanceCommands, effectiveDelegations, delegationScope, buildPrivacyExport, privacyExportBytes, activeLegalHolds } from '../packages/domain/governance.ts';

const NOW = '2026-10-06T10:00:00.000Z';
const FUTURE = '2026-10-07T10:00:00.000Z';
const REASON = 'Explicit synthetic governance acceptance case';

// Company-filtered fixture. Command rollback models the atomic domain boundary;
// this suite makes no claims about PostgreSQL concurrency or physical deletion.
class MemoryTransaction implements Transaction {
  rows = new Map<string, Entity>();
  events: { type: string; data: Data }[] = [];
  sequence = 0;
  constructor(public companyId = 'company') {}
  async get<T extends Data = Data>(kind: string, id: string): Promise<Entity<T>> {
    const row = this.rows.get(`${kind}:${id}`);
    if (!row || row.companyId !== this.companyId) throw new DomainError('NOT_FOUND_SAFE');
    return structuredClone(row) as Entity<T>;
  }
  async list<T extends Data = Data>(kind: string): Promise<Entity<T>[]> {
    return [...this.rows.values()].filter(row => row.kind === kind && row.companyId === this.companyId).map(row => structuredClone(row) as Entity<T>);
  }
  async add<T extends Data = Data>(kind: string, data: T, id = `${kind}_${++this.sequence}`): Promise<Entity<T>> {
    if (this.rows.has(`${kind}:${id}`)) throw new DomainError('VERSION_CONFLICT');
    const row: Entity<T> = { id, kind, companyId: this.companyId, version: 1, data: structuredClone(data), createdAt: NOW, updatedAt: NOW };
    this.rows.set(`${kind}:${id}`, row);
    return structuredClone(row);
  }
  async save(entity: Entity, data: Data, expectedVersion = entity.version): Promise<Entity> {
    const current = await this.get(entity.kind, entity.id);
    if (current.version !== expectedVersion) throw new DomainError('VERSION_CONFLICT');
    const next = { ...current, data: structuredClone(data), version: current.version + 1, updatedAt: NOW };
    this.rows.set(`${entity.kind}:${entity.id}`, next);
    return structuredClone(next);
  }
  async event(type: string, data: Data) { this.events.push({ type, data: structuredClone(data) }); }
}

function actor(userId: string, roles: string[], siteIds: string[] = [], warehouseIds: string[] = [], extraPermissions: string[] = []): Actor {
  return { userId, companyId: 'company', roles, permissions: [...new Set([...roles.flatMap(role => ROLE_PERMISSIONS[role] || []), ...extraPermissions])], siteIds, warehouseIds, customerIds: [], mfaVerified: true };
}
function context(tx: MemoryTransaction, current: Actor, now = NOW): CommandContext {
  return { tx, actor: current, now, idempotencyKey: 'synthetic-governance-command',
    requireSite(siteId) { if (!current.permissions.includes('scope.company') && !current.siteIds.includes(siteId)) throw new DomainError('ACCESS_DENIED'); },
    requireOwn(userId) { if (current.userId !== userId && !current.permissions.includes('scope.company') && !current.permissions.includes('finance.accountant')) throw new DomainError('ACCESS_DENIED'); }
  };
}
async function run(tx: MemoryTransaction, current: Actor, name: string, input: Data, now = NOW): Promise<any> {
  const definition = governanceCommands[name];
  if (!definition) throw new Error(`Missing governance command: ${name}`);
  const rows = structuredClone(tx.rows), events = structuredClone(tx.events), sequence = tx.sequence;
  try { return await definition.handler(context(tx, current, now), definition.schema.parse(input)); }
  catch (error) { tx.rows = rows; tx.events = events; tx.sequence = sequence; throw error; }
}
async function edit(tx: MemoryTransaction, kind: string, id: string, changes: Data) {
  const row = await tx.get(kind, id);
  return tx.save(row, { ...row.data, ...changes }, row.version);
}
async function fixture() {
  const tx = new MemoryTransaction();
  const owner = actor('owner', ['OWNER']), approver = actor('approver', ['OWNER']), thirdOwner = actor('third-owner', ['OWNER']);
  const grantor = actor('grantor', ['QUALITY_CONTROL'], ['site-b'], ['warehouse-b'], ['role.manage', 'task.create', 'inventory.read']);
  const worker = actor('worker', ['EMPLOYEE'], ['site-a'], ['warehouse-a'], ['task.create']);
  const reviewer = actor('reviewer', ['BOT_ADMIN'], ['site-a'], [], ['privacy.review']);
  for (const current of [owner, approver, thirdOwner, grantor, worker, reviewer]) await tx.add('user', {
    active: true, roles: current.roles, permissions: current.permissions.filter(permission => !(ROLE_PERMISSIONS[current.roles[0]] || []).includes(permission)),
    siteIds: current.siteIds, warehouseIds: current.warehouseIds, name: `Synthetic ${current.userId}`, businessCode: `TEST-${current.userId}`
  }, current.userId);
  await tx.add('user', { active: true, roles: ['EMPLOYEE'], permissions: [], siteIds: ['site-b'], name: 'Other synthetic employee' }, 'other-worker');
  await tx.add('company', { operatingMode: 'TEST' }, 'company');
  for (const id of ['site-a', 'site-b', 'site-c']) await tx.add('site', { name: `Synthetic ${id}`, active: true }, id);
  for (const id of ['warehouse-a', 'warehouse-b', 'warehouse-c']) await tx.add('stock_location', { name: id, type: 'WAREHOUSE' }, id);
  await tx.add('legal_approval', {
    subject: 'PRIVACY', status: 'APPROVED', active: true, approvedAt: '2026-10-05T10:00:00.000Z', expiresAt: '2027-10-06T10:00:00.000Z', evidenceReference: 'synthetic-company-privacy-review',
    scope: { projectionVersion: 'knaba-dsar-v1', exportCategories: ['PROFILE', 'TIME', 'PAYROLL', 'MESSAGES', 'MEDIA'], retentionProfiles: { TIME: { minDays: 730, maxDays: 3650 }, MEDIA: { minDays: 0, maxDays: 365 } } }
  }, 'privacy-approval');
  return { tx, owner, approver, thirdOwner, grantor, worker, reviewer };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function approvedDelegation(f: Fixture, changes: Data = {}) {
  const draft = await run(f.tx, f.grantor, 'delegation.create', { granteeId: f.worker.userId, permissions: ['task.read'], siteIds: ['site-b'], expiresAt: FUTURE, reason: REASON, ...changes });
  return run(f.tx, f.approver, 'delegation.approve', { delegationId: draft.id, confirmedHash: draft.data.previewHash, reason: REASON });
}
async function privacyRequest(f: Fixture, type = 'ACCESS', categories = ['PROFILE', 'TIME', 'PAYROLL', 'MESSAGES', 'MEDIA']) {
  return run(f.tx, f.worker, 'privacy.request', { type, categories, reason: REASON });
}
async function reviewedRequest(f: Fixture, type = 'ACCESS', categories = ['PROFILE', 'TIME', 'PAYROLL', 'MESSAGES', 'MEDIA']) {
  const request = await privacyRequest(f, type, categories);
  return run(f.tx, f.reviewer, 'privacy.review', { requestId: request.id, decision: type === 'ACCESS' ? 'APPROVE_EXPORT' : 'REFER_ERASURE', legalApprovalId: 'privacy-approval', evidenceReference: 'synthetic-reviewed-request', reason: REASON });
}
async function approvedRetention(f: Fixture, category = 'TIME', retentionDays = 730) {
  const policy = await run(f.tx, f.owner, 'retention.create', { category, retentionDays, legalApprovalId: 'privacy-approval', reason: REASON });
  return run(f.tx, f.approver, 'retention.approve', { policyId: policy.id, confirmedHash: policy.data.previewHash, reason: REASON });
}
async function seedPrivateData(f: Fixture) {
  await edit(f.tx, 'user', f.worker.userId, { email: 'worker@example.invalid', language: 'de', passwordHash: 'PROFILE_SECRET_CANARY', nested: { bank: 'NESTED_BANK_CANARY' } });
  await f.tx.add('shift', { employeeId: 'worker', state: 'ENDED', startedAt: NOW, endedAt: FUTURE, totalSeconds: 3600, route: [{ latitude: 'RAW_ROUTE_CANARY' }], notesInternal: 'TIME_SECRET_CANARY' }, 'own-shift');
  await f.tx.add('timesheet', { employeeId: 'worker', state: 'APPROVED', periodStart: NOW, periodEnd: FUTURE, payableSeconds: 3600, segmentSnapshot: [{ secret: 'SEGMENT_SECRET_CANARY' }] }, 'own-timesheet');
  await f.tx.add('payroll_calculation', { employeeId: 'worker', state: 'ACCOUNTANT_VERIFIED', payableCents: 12345, bank: 'OWN_BANK_CANARY', rateSnapshot: { secret: 'RATE_SECRET_CANARY' } }, 'own-payroll');
  await f.tx.add('payout', { employeeId: 'other-worker', createdBy: 'worker', amountCents: 98765, statement: 'OTHER_PAYROLL_CANARY' }, 'manager-authored-other-payroll');
  await f.tx.add('timesheet', { employeeId: 'other-worker', createdBy: 'worker', payableSeconds: 98765, state: 'OTHER_TIME_CANARY' }, 'manager-authored-other-time');
  await f.tx.add('channel', { members: [{ user_id: 'worker' }, { user_id: 'other-worker' }], type: 'INTERNAL' }, 'accessible-channel');
  await f.tx.add('channel', { members: [{ user_id: 'other-worker' }], type: 'INTERNAL' }, 'inaccessible-channel');
  await f.tx.add('message', { author_id: 'worker', channel_id: 'accessible-channel', text: 'My permitted message', language: 'de', secret: 'MESSAGE_SECRET_CANARY' }, 'own-message');
  await f.tx.add('message', { author_id: 'other-worker', channel_id: 'accessible-channel', text: 'OTHER_MESSAGE_CANARY' }, 'other-message');
  await f.tx.add('message', { author_id: 'worker', channel_id: 'inaccessible-channel', text: 'INACCESSIBLE_MESSAGE_CANARY' }, 'inaccessible-own-message');
  await f.tx.add('media_asset', { uploadedBy: 'worker', siteId: 'site-a', stage: 'AFTER', mimeType: 'image/jpeg', byteSize: 100, caption: 'My permitted photo', uploadedAt: NOW, blobKey: 'BLOB_KEY_CANARY', providerToken: 'PROVIDER_TOKEN_CANARY' }, 'own-media');
  const foreign: Entity = { id: 'foreign-payroll', kind: 'payout', companyId: 'other-company', version: 1, createdAt: NOW, updatedAt: NOW, data: { employeeId: 'worker', amountCents: 99999, statement: 'FOREIGN_TENANT_CANARY' } };
  f.tx.rows.set('payout:foreign-payroll', foreign);
}

describe('bounded permission-specific delegations', () => {
  it('requires named resources and grants no access while still a draft', async () => {
    const f = await fixture();
    const draft = await run(f.tx, f.grantor, 'delegation.create', { granteeId: 'worker', permissions: ['task.read'], siteIds: ['site-b'], expiresAt: FUTURE, reason: REASON });
    expect(draft.data).toMatchObject({ state: 'DRAFT', grantorId: 'grantor', granteeId: 'worker' });
    expect(draft.data.previewHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await effectiveDelegations(f.tx, f.worker, NOW)).grants).toEqual([]);
    await expect(run(f.tx, f.grantor, 'delegation.create', { granteeId: 'worker', permissions: ['task.read'], expiresAt: FUTURE, reason: REASON })).rejects.toThrow();
    expect(governanceCommands['delegation.create'].highRisk).toBe(true);
    expect(governanceCommands['delegation.approve'].highRisk).toBe(true);
  });

  it('keeps permission and scope paired instead of producing a cross product', async () => {
    const f = await fixture(), grant = await approvedDelegation(f), effective = await effectiveDelegations(f.tx, f.worker, NOW);
    expect(effective.grantIds).toEqual([grant.id]);
    const read = delegationScope(f.worker, effective, 'task.read'), create = delegationScope(f.worker, effective, 'task.create');
    expect(read.siteIds).toEqual(['site-a', 'site-b']);
    expect(create.siteIds).toEqual(['site-a']);
    expect(read.userId).toBe('worker');
    expect(read.roles).toEqual(['EMPLOYEE']);
    expect(read.permissions).not.toContain('role.manage');
    expect(f.worker.siteIds).toEqual(['site-a']);
    await expect(run(f.tx, f.grantor, 'delegation.create', { granteeId: 'worker', permissions: ['task.read'], siteIds: ['site-c'], expiresAt: FUTURE, reason: REASON })).rejects.toThrow();
  });

  it('does not reuse base sites or warehouses for a permission absent from the base actor', async () => {
    const f = await fixture();
    expect(f.worker.permissions).not.toContain('task.review');
    await approvedDelegation(f, { permissions: ['task.review'] });
    const effective = await effectiveDelegations(f.tx, f.worker, NOW), review = delegationScope(f.worker, effective, 'task.review');
    expect(review.siteIds).toEqual(['site-b']);
    expect(review.warehouseIds).toEqual([]);
    expect(review.permissions).toContain('task.review');
    expect(delegationScope(f.worker, effective, 'task.create').siteIds).toEqual(['site-a']);
    expect(f.worker.siteIds).toEqual(['site-a']);
  });

  it('limits an OWNER lacking the exact delegated right to named scope and strips scope.company', async () => {
    const f = await fixture();
    expect(f.owner.permissions).toContain('scope.company');
    expect(f.owner.permissions).not.toContain('inventory.read');
    const draft = await run(f.tx, f.grantor, 'delegation.create', { granteeId: 'owner', permissions: ['inventory.read'], warehouseIds: ['warehouse-b'], expiresAt: FUTURE, reason: REASON });
    await run(f.tx, f.approver, 'delegation.approve', { delegationId: draft.id, confirmedHash: draft.data.previewHash, reason: REASON });
    const effective = await effectiveDelegations(f.tx, f.owner, NOW), scoped = delegationScope(f.owner, effective, 'inventory.read');
    expect(scoped.roles).toEqual(['OWNER']);
    expect(scoped.userId).toBe('owner');
    expect(scoped.permissions).toContain('inventory.read');
    expect(scoped.permissions).not.toContain('scope.company');
    expect(scoped.siteIds).toEqual([]);
    expect(scoped.warehouseIds).toEqual(['warehouse-b']);
    const absent = delegationScope(f.owner, effective, 'inventory.use');
    expect(absent.permissions).not.toContain('scope.company');
    expect(absent.siteIds).toEqual([]);
    expect(absent.warehouseIds).toEqual([]);
  });

  it('unions warehouses only for the permission granted to their named scope', async () => {
    const f = await fixture();
    await approvedDelegation(f, { permissions: ['inventory.read'], siteIds: [], warehouseIds: ['warehouse-b'] });
    const effective = await effectiveDelegations(f.tx, f.worker, NOW);
    expect(delegationScope(f.worker, effective, 'inventory.read').warehouseIds).toEqual(['warehouse-a', 'warehouse-b']);
    expect(delegationScope(f.worker, effective, 'inventory.use').warehouseIds).toEqual(['warehouse-a']);
    await expect(run(f.tx, f.grantor, 'delegation.create', { granteeId: 'worker', permissions: ['inventory.read'], warehouseIds: ['warehouse-c'], expiresAt: FUTURE, reason: REASON })).rejects.toThrow();
  });

  it('allows company-authorized named resources without granting scope.company to the recipient', async () => {
    const f = await fixture(), expiresAt = '2026-11-05T10:00:00.000Z';
    const draft = await run(f.tx, f.owner, 'delegation.create', { granteeId: 'worker', permissions: ['task.read'], siteIds: ['site-c'], expiresAt, reason: REASON });
    await run(f.tx, f.approver, 'delegation.approve', { delegationId: draft.id, confirmedHash: draft.data.previewHash, reason: REASON });
    const scoped = delegationScope(f.worker, await effectiveDelegations(f.tx, f.worker, NOW), 'task.read');
    expect(scoped.siteIds).toEqual(['site-a', 'site-c']);
    expect(scoped.permissions).not.toContain('scope.company');
    await expect(run(f.tx, f.owner, 'delegation.create', { granteeId: 'worker', permissions: ['task.read'], siteIds: ['unknown-site'], expiresAt: FUTURE, reason: REASON })).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
  });

  it('safe-denies foreign-company grantees and named scope resources', async () => {
    const f = await fixture();
    for (const [kind, id, data] of [['user', 'foreign-user', { active: true, roles: ['EMPLOYEE'] }], ['site', 'foreign-site', { active: true }]] as const) {
      f.tx.rows.set(`${kind}:${id}`, { id, kind, companyId: 'other-company', version: 1, createdAt: NOW, updatedAt: NOW, data });
    }
    await expect(run(f.tx, f.owner, 'delegation.create', { granteeId: 'foreign-user', permissions: ['task.read'], siteIds: ['site-b'], expiresAt: FUTURE, reason: REASON })).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    await expect(run(f.tx, f.owner, 'delegation.create', { granteeId: 'worker', permissions: ['task.read'], siteIds: ['foreign-site'], expiresAt: FUTURE, reason: REASON })).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
    expect(await f.tx.list('delegation')).toHaveLength(0);
  });

  it.each(['finance.payroll', 'payroll.manage', 'payout.approve', 'rate.manage', 'location.history.read', 'privacy.review', 'audit.read', 'role.manage', 'identity.manage', 'legal.manage', 'scope.company', 'report.export', 'task.made_up', 'bot.manage', 'assistant.manage', 'automation.manage', 'integration.status', 'notifications.manage', 'customer.manage', 'price.manage', 'service.manage', 'inventory.manage', 'site.create', 'chat.manage'])('rejects generic delegation of %s even when directly held by the creator', async permission => {
    const f = await fixture(), owner = await f.tx.get('user', 'owner');
    await edit(f.tx, 'user', 'owner', { permissions: [...owner.data.permissions, permission] });
    await expect(run(f.tx, f.owner, 'delegation.create', { granteeId: 'worker', permissions: [permission], siteIds: ['site-b'], expiresAt: FUTURE, reason: REASON })).rejects.toThrow();
    expect(await f.tx.list('delegation')).toHaveLength(0);
  });

  it('requires a distinct OWNER with MFA and an unchanged preview', async () => {
    const f = await fixture(), draft = await run(f.tx, f.owner, 'delegation.create', { granteeId: 'approver', permissions: ['task.read'], siteIds: ['site-b'], expiresAt: FUTURE, reason: REASON });
    const input = { delegationId: draft.id, confirmedHash: draft.data.previewHash, reason: REASON };
    await expect(run(f.tx, f.owner, 'delegation.approve', input)).rejects.toThrow();
    await expect(run(f.tx, f.approver, 'delegation.approve', input)).rejects.toThrow();
    await expect(run(f.tx, { ...f.thirdOwner, mfaVerified: false }, 'delegation.approve', input)).rejects.toThrow();
    await edit(f.tx, 'delegation', draft.id, { siteIds: ['site-c'] });
    await expect(run(f.tx, f.thirdOwner, 'delegation.approve', input)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect((await f.tx.get('delegation', draft.id)).data.state).toBe('DRAFT');
  });

  it('enforces the 30-day bound and the exact start/end access boundaries', async () => {
    const f = await fixture(), start = '2026-10-06T11:00:00.000Z', end = '2026-10-06T12:00:00.000Z';
    await approvedDelegation(f, { startsAt: start, expiresAt: end });
    expect((await effectiveDelegations(f.tx, f.worker, NOW)).grants).toHaveLength(0);
    expect((await effectiveDelegations(f.tx, f.worker, start)).grants).toHaveLength(1);
    expect((await effectiveDelegations(f.tx, f.worker, end)).grants).toHaveLength(0);
    for (const expiresAt of [NOW, '2026-11-05T10:00:00.001Z']) await expect(run(f.tx, f.grantor, 'delegation.create', { granteeId: 'worker', permissions: ['task.read'], siteIds: ['site-b'], expiresAt, reason: REASON })).rejects.toThrow();
    await expect(run(f.tx, f.grantor, 'delegation.create', { granteeId: 'worker', permissions: ['task.read'], siteIds: ['site-b'], startsAt: '2026-10-06T09:59:59.999Z', expiresAt: FUTURE, reason: REASON })).rejects.toThrow();
  });

  it('revocation changes the authorization fingerprint immediately and preserves the grant history', async () => {
    const f = await fixture(), grant = await approvedDelegation(f), before = await effectiveDelegations(f.tx, f.worker, NOW);
    await expect(run(f.tx, f.worker, 'delegation.revoke', { delegationId: grant.id, reason: REASON })).rejects.toThrow();
    await run(f.tx, f.grantor, 'delegation.revoke', { delegationId: grant.id, reason: REASON });
    const after = await effectiveDelegations(f.tx, f.worker, NOW);
    expect(after.grants).toEqual([]);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect((await f.tx.get('delegation', grant.id)).data.state).toBe('REVOKED');
  });

  it.each(['permission', 'scope', 'authority', 'inactive'])('rechecks the grantor after loss of %s instead of trusting the original actor', async loss => {
    const f = await fixture();
    await approvedDelegation(f);
    const grantor = await f.tx.get('user', 'grantor');
    if (loss === 'permission') await edit(f.tx, 'user', 'grantor', { roles: [], permissions: ['role.manage'] });
    if (loss === 'scope') await edit(f.tx, 'user', 'grantor', { siteIds: ['site-c'] });
    if (loss === 'authority') await edit(f.tx, 'user', 'grantor', { permissions: grantor.data.permissions.filter((p: string) => p !== 'role.manage') });
    if (loss === 'inactive') await edit(f.tx, 'user', 'grantor', { active: false });
    expect((await effectiveDelegations(f.tx, f.worker, NOW)).grants).toEqual([]);
  });

  it('does not apply a grant to an inactive or external recipient', async () => {
    const f = await fixture();
    await approvedDelegation(f);
    await edit(f.tx, 'user', 'worker', { active: false });
    expect((await effectiveDelegations(f.tx, f.worker, NOW)).grants).toEqual([]);
    await edit(f.tx, 'user', 'worker', { active: true, roles: ['CLIENT'] });
    expect((await effectiveDelegations(f.tx, f.worker, NOW)).grants).toEqual([]);
  });

  it('refuses transitive scope delegation from an already delegated actor', async () => {
    const f = await fixture();
    await approvedDelegation(f);
    const user = await f.tx.get('user', 'worker');
    await edit(f.tx, 'user', 'worker', { permissions: [...user.data.permissions, 'role.manage'] });
    const elevated = delegationScope({ ...f.worker, permissions: [...f.worker.permissions, 'role.manage'] }, await effectiveDelegations(f.tx, f.worker, NOW), 'task.read');
    await expect(run(f.tx, elevated, 'delegation.create', { granteeId: 'other-worker', permissions: ['task.read'], siteIds: ['site-b'], expiresAt: FUTURE, reason: REASON })).rejects.toThrow();
  });
});

describe('strict-self minimized privacy exports', () => {
  it('denies another subject even to an owner and records requests without changing source data', async () => {
    const f = await fixture();
    await seedPrivateData(f);
    const original = await f.tx.get('payroll_calculation', 'own-payroll');
    await expect(run(f.tx, f.owner, 'privacy.request', { type: 'ACCESS', subjectUserId: 'worker', categories: ['PAYROLL'], reason: REASON })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    const request = await privacyRequest(f, 'ERASURE', ['PAYROLL']);
    expect(request.data).toMatchObject({ subjectUserId: 'worker', state: 'REQUESTED', sourceDataDeleted: false });
    expect(await f.tx.get('payroll_calculation', 'own-payroll')).toEqual(original);
  });

  it('exports allowed own fields and excludes nested secrets, other subjects, authors and tenants', async () => {
    const f = await fixture();
    await seedPrivateData(f);
    const request = await reviewedRequest(f), built = await buildPrivacyExport(f.tx, f.worker, request.id, NOW), json = built.bytes.toString('utf8');
    expect(built.snapshot).toMatchObject({ subjectUserId: 'worker', scope: 'MINIMIZED_SELF_DATA_EXPORT', fullLegalDsarFulfillment: false });
    expect(built.snapshot.profile.email).toBe('worker@example.invalid');
    expect(built.snapshot.time.map((row: Data) => row.id)).toEqual(['own-shift', 'own-timesheet']);
    expect(built.snapshot.payroll).toHaveLength(1);
    expect(built.snapshot.payroll[0].payableCents).toBe(12345);
    expect(built.snapshot.messages.map((row: Data) => row.text)).toEqual(['My permitted message']);
    expect(built.snapshot.media.map((row: Data) => row.id)).toEqual(['own-media']);
    expect(json).not.toContain('CANARY');
    expect(built.sha256).toBe(createHash('sha256').update(built.bytes).digest('hex'));
    expect(built.mimeType).toBe('application/json; charset=utf-8');
  });

  it('does not export an authored message after channel membership is revoked', async () => {
    const f = await fixture();
    await seedPrivateData(f);
    await edit(f.tx, 'channel', 'accessible-channel', { members: [{ user_id: 'worker', revoked_at: NOW }] });
    const request = await reviewedRequest(f, 'ACCESS', ['MESSAGES']), built = await buildPrivacyExport(f.tx, f.worker, request.id, NOW);
    expect(built.snapshot.messages).toEqual([]);
  });

  it('rechecks customer VIEW, internal/task site scope, history cutoff and message deletion in a combined export', async () => {
    const f = await fixture();
    await seedPrivateData(f);
    await edit(f.tx, 'site', 'site-a', { customerId: 'customer-a' });
    await f.tx.add('customer_membership', { userId: 'worker', customerId: 'customer-a', siteIds: ['site-a'], permissions: ['VIEW'], active: true, expiresAt: FUTURE }, 'worker-customer-view');
    await f.tx.add('task', { siteId: 'site-a' }, 'task-a');
    for (const [id, data] of [
      ['client-channel', { type: 'SITE_CLIENT', site_id: 'site-a' }],
      ['internal-site-channel', { type: 'SITE_INTERNAL', site_id: 'site-a' }],
      ['task-channel', { type: 'TASK_THREAD', task_id: 'task-a' }]
    ] as const) await f.tx.add('channel', { ...data, members: [{ user_id: 'worker', history_from: NOW }] }, id);
    for (const [id, channelId] of [['client-own-message', 'client-channel'], ['site-own-message', 'internal-site-channel'], ['task-own-message', 'task-channel']]) await f.tx.add('message', { author_id: 'worker', channel_id: channelId, text: `Permitted ${id}` }, id);
    const old = await f.tx.add('message', { author_id: 'worker', channel_id: 'internal-site-channel', text: 'BEFORE_HISTORY_CUTOFF_CANARY' }, 'historical-own-message');
    f.tx.rows.set(`message:${old.id}`, { ...old, createdAt: '2026-10-05T10:00:00.000Z' });
    const request = await reviewedRequest(f, 'ACCESS', ['MESSAGES']), initial = await buildPrivacyExport(f.tx, f.worker, request.id, NOW);
    expect(initial.snapshot.messages.map((row: Data) => row.id).sort()).toEqual(['client-own-message', 'own-message', 'site-own-message', 'task-own-message']);
    expect(initial.bytes.toString('utf8')).not.toContain('BEFORE_HISTORY_CUTOFF_CANARY');
    await edit(f.tx, 'customer_membership', 'worker-customer-view', { permissions: [] });
    await edit(f.tx, 'user', 'worker', { siteIds: [] });
    await edit(f.tx, 'message', 'own-message', { deleted_at: NOW });
    const currentActor = { ...f.worker, siteIds: [] }, after = await buildPrivacyExport(f.tx, currentActor, request.id, NOW);
    expect(after.snapshot.messages).toEqual([]);
  });

  it('does not treat uploading another employee confidential document as owning that employee data', async () => {
    const f = await fixture();
    await seedPrivateData(f);
    await f.tx.add('media_asset', { uploadedBy: 'worker', employeeId: 'other-worker', visibility: 'CONFIDENTIAL', stage: 'DOCUMENT', caption: 'OTHER_EMPLOYEE_DOCUMENT_CANARY' }, 'other-employee-document');
    const request = await reviewedRequest(f, 'ACCESS', ['MEDIA']), built = await buildPrivacyExport(f.tx, f.worker, request.id, NOW);
    expect(built.snapshot.media.map((row: Data) => row.id)).toEqual(['own-media']);
    expect(built.bytes.toString('utf8')).not.toContain('OTHER_EMPLOYEE_DOCUMENT_CANARY');
  });

  it('handles normal unapproved timesheets without inventing payable values', async () => {
    const f = await fixture();
    await f.tx.add('timesheet', { employeeId: 'worker', state: 'SUBMITTED', periodStart: NOW, periodEnd: FUTURE, payableSeconds: null, totalMinutes: null, remainderSeconds: null }, 'pending-timesheet');
    const request = await reviewedRequest(f, 'ACCESS', ['TIME']), built = await buildPrivacyExport(f.tx, f.worker, request.id, NOW);
    expect(built.snapshot.time).toHaveLength(1);
    expect(built.snapshot.time[0]).toMatchObject({ id: 'pending-timesheet', state: 'SUBMITTED' });
    expect(built.snapshot.time[0].payableSeconds).not.toBe(0);
  });

  it('preserves the real start and end fields of an own shift', async () => {
    const f = await fixture();
    await f.tx.add('shift', { employeeId: 'worker', state: 'ENDED', startAt: NOW, endAt: FUTURE }, 'normal-shift');
    const request = await reviewedRequest(f, 'ACCESS', ['TIME']), built = await buildPrivacyExport(f.tx, f.worker, request.id, NOW);
    expect(built.snapshot.time[0]).toMatchObject({ id: 'normal-shift', startedAt: NOW, endedAt: FUTURE });
  });

  it('requires distinct review and current recorded legal authorization for exactly the requested categories', async () => {
    const f = await fixture(), request = await privacyRequest(f, 'ACCESS', ['PAYROLL']);
    const review = { requestId: request.id, decision: 'APPROVE_EXPORT', legalApprovalId: 'privacy-approval', evidenceReference: 'synthetic-review-evidence', reason: REASON };
    await expect(run(f.tx, f.worker, 'privacy.review', review)).rejects.toThrow();
    await expect(buildPrivacyExport(f.tx, f.worker, request.id, NOW)).rejects.toThrow();
    const legal = await f.tx.get('legal_approval', 'privacy-approval');
    await edit(f.tx, 'legal_approval', legal.id, { scope: { ...legal.data.scope, exportCategories: ['PROFILE'] } });
    await expect(run(f.tx, f.reviewer, 'privacy.review', review)).rejects.toThrow();
    expect((await f.tx.get('privacy_request', request.id)).data.state).toBe('REQUESTED');
  });

  it('stores an immutable own artifact, denies other readers, and detects stored snapshot tampering', async () => {
    const f = await fixture();
    await seedPrivateData(f);
    const request = await reviewedRequest(f), exported = await run(f.tx, f.worker, 'privacy.export', { requestId: request.id });
    const first = await privacyExportBytes(f.tx, f.worker, exported.exportId);
    expect(first.sha256).toBe(exported.sha256);
    await expect(privacyExportBytes(f.tx, f.owner, exported.exportId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await expect(buildPrivacyExport(f.tx, f.owner, request.id, NOW)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await edit(f.tx, 'user', 'worker', { name: 'Changed after export' });
    expect((await privacyExportBytes(f.tx, f.worker, exported.exportId)).bytes).toEqual(first.bytes);
    await expect(run(f.tx, f.worker, 'privacy.export', { requestId: request.id })).rejects.toMatchObject({ code: 'DUPLICATE_EFFECT' });
    expect(await f.tx.list('privacy_export')).toHaveLength(1);
    const artifact = await f.tx.get('privacy_export', exported.exportId);
    await edit(f.tx, 'privacy_export', artifact.id, { snapshot: { ...artifact.data.snapshot, subjectUserId: 'other-worker' } });
    await expect(privacyExportBytes(f.tx, f.worker, artifact.id)).rejects.toMatchObject({ code: 'INVALID_STATE', details: { reason: 'PRIVACY_EXPORT_CHECKSUM_MISMATCH' } });
  });

  it('blocks export generation after the legal approval expires or is revoked', async () => {
    const f = await fixture(), request = await reviewedRequest(f, 'ACCESS', ['PROFILE']);
    await edit(f.tx, 'legal_approval', 'privacy-approval', { active: false });
    await expect(buildPrivacyExport(f.tx, f.worker, request.id, NOW)).rejects.toThrow();
    await edit(f.tx, 'legal_approval', 'privacy-approval', { active: true, expiresAt: NOW });
    await expect(buildPrivacyExport(f.tx, f.worker, request.id, NOW)).rejects.toThrow();
    expect(await f.tx.list('privacy_export')).toHaveLength(0);
  });
});

describe('specific holds, approved retention bounds and erasure evidence', () => {
  const holdInput = { subjectUserId: 'worker', categories: ['PAYROLL'], expiresAt: FUTURE, legalApprovalId: 'privacy-approval', evidenceReference: 'synthetic-specific-case-hold', reason: REASON };
  it('requires an OWNER with MFA and a finite category/subject hold', async () => {
    const f = await fixture();
    await expect(run(f.tx, f.reviewer, 'legal_hold.create', holdInput)).rejects.toThrow();
    await expect(run(f.tx, { ...f.owner, mfaVerified: false }, 'legal_hold.create', holdInput)).rejects.toThrow();
    for (const expiresAt of [NOW, '2027-10-06T10:00:00.001Z']) await expect(run(f.tx, f.owner, 'legal_hold.create', { ...holdInput, expiresAt })).rejects.toThrow();
    await expect(run(f.tx, f.owner, 'legal_hold.create', { ...holdInput, categories: ['*'] })).rejects.toThrow();
    await expect(run(f.tx, f.owner, 'legal_hold.create', { ...holdInput, subjectUserId: 'foreign-user' })).rejects.toThrow();
    const hold = await run(f.tx, f.owner, 'legal_hold.create', holdInput);
    expect(hold.data).toMatchObject({ state: 'ACTIVE', automaticDeletionOnExpiry: false });
  });

  it('matches only the held subject/categories, maps messages to CHAT, and never auto-deletes at expiry', async () => {
    const f = await fixture();
    await seedPrivateData(f);
    const original = await f.tx.get('payroll_calculation', 'own-payroll');
    const hold = await run(f.tx, f.owner, 'legal_hold.create', { ...holdInput, categories: ['CHAT'] });
    expect((await activeLegalHolds(f.tx, 'worker', ['MESSAGES'], NOW)).map(row => row.id)).toEqual([hold.id]);
    expect(await activeLegalHolds(f.tx, 'other-worker', ['MESSAGES'], NOW)).toEqual([]);
    expect(await activeLegalHolds(f.tx, 'worker', ['TIME'], NOW)).toEqual([]);
    expect(await activeLegalHolds(f.tx, 'worker', ['MESSAGES'], FUTURE)).toEqual([]);
    expect(await f.tx.get('payroll_calculation', 'own-payroll')).toEqual(original);
    expect((await f.tx.get('legal_hold', hold.id)).data.state).toBe('ACTIVE');
  });

  it('requires a different owner to release the hold and immediately stops matching it', async () => {
    const f = await fixture(), hold = await run(f.tx, f.owner, 'legal_hold.create', holdInput), input = { holdId: hold.id, evidenceReference: 'synthetic-hold-release-evidence', reason: REASON };
    await expect(run(f.tx, f.owner, 'legal_hold.release', input)).rejects.toThrow();
    await run(f.tx, f.approver, 'legal_hold.release', input);
    expect(await activeLegalHolds(f.tx, 'worker', ['PAYROLL'], NOW)).toEqual([]);
    expect((await f.tx.get('legal_hold', hold.id)).data.state).toBe('RELEASED');
  });

  it('keeps an erasure request on its specific legal hold without deleting any source records', async () => {
    const f = await fixture();
    await seedPrivateData(f);
    await run(f.tx, f.owner, 'legal_hold.create', holdInput);
    const before = await f.tx.get('payroll_calculation', 'own-payroll'), request = await reviewedRequest(f, 'ERASURE', ['PAYROLL']);
    expect(request.data).toMatchObject({ state: 'ON_LEGAL_HOLD', sourceDataDeleted: false });
    expect(request.data.holdIds).toHaveLength(1);
    expect(await f.tx.get('payroll_calculation', 'own-payroll')).toEqual(before);
    const unheld = await reviewedRequest(f, 'ERASURE', ['TIME']);
    expect(unheld.data.state).toBe('AWAITING_ERASURE_EXECUTION');
  });

  it('rejects retention outside its own approved category bounds instead of inheriting payroll periods', async () => {
    const f = await fixture();
    for (const [category, retentionDays] of [['TIME', 729], ['TIME', 3651], ['MEDIA', 730], ['GPS', 730]]) await expect(run(f.tx, f.owner, 'retention.create', { category, retentionDays, legalApprovalId: 'privacy-approval', reason: REASON })).rejects.toThrow();
    expect(await f.tx.list('retention_policy')).toHaveLength(0);
    const time = await approvedRetention(f), media = await approvedRetention(f, 'MEDIA', 0);
    expect(time.data).toMatchObject({ state: 'APPROVED', retentionDays: 730, automaticDeletion: false });
    expect(media.data).toMatchObject({ state: 'APPROVED', retentionDays: 0, automaticDeletion: false });
  });

  it('binds retention approval to the unchanged preview and current legal policy version', async () => {
    const f = await fixture(), policy = await run(f.tx, f.owner, 'retention.create', { category: 'TIME', retentionDays: 730, legalApprovalId: 'privacy-approval', reason: REASON }), input = { policyId: policy.id, confirmedHash: policy.data.previewHash, reason: REASON };
    await expect(run(f.tx, f.owner, 'retention.approve', input)).rejects.toThrow();
    await edit(f.tx, 'retention_policy', policy.id, { retentionDays: 731 });
    await expect(run(f.tx, f.approver, 'retention.approve', input)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await edit(f.tx, 'retention_policy', policy.id, { retentionDays: 730 });
    await edit(f.tx, 'legal_approval', 'privacy-approval', { evidenceReference: 'new-recorded-privacy-policy-version' });
    await expect(run(f.tx, f.approver, 'retention.approve', input)).rejects.toThrow();
    expect((await f.tx.get('retention_policy', policy.id)).data.state).toBe('DRAFT');
  });

  const erasureInput = { categories: ['TIME'], evidenceReference: 'synthetic-external-erasure-evidence', evidenceSha256: createHash('sha256').update('synthetic externally supplied evidence').digest('hex'), executionReference: 'synthetic-external-execution', completedAt: NOW, derivedDataEvidence: [{ kind: 'BACKUPS', reference: 'synthetic-backup-deletion-pending', result: 'PENDING' }], reason: REASON };
  it('requires reviewed erasure, category retention and no subsequently applied hold', async () => {
    const f = await fixture(), request = await reviewedRequest(f, 'ERASURE', ['TIME']);
    await expect(run(f.tx, f.owner, 'privacy.erasure_evidence', { ...erasureInput, requestId: request.id })).rejects.toThrow();
    await approvedRetention(f);
    await run(f.tx, f.owner, 'legal_hold.create', { ...holdInput, categories: ['TIME'] });
    await expect(run(f.tx, f.approver, 'privacy.erasure_evidence', { ...erasureInput, requestId: request.id })).rejects.toMatchObject({ code: 'LEGAL_HOLD_BLOCKS_ERASURE' });
    expect(await f.tx.list('privacy_erasure_evidence')).toHaveLength(0);
  });

  it('records unverified external evidence once while leaving system sources unchanged', async () => {
    const f = await fixture();
    await seedPrivateData(f);
    await approvedRetention(f);
    const request = await reviewedRequest(f, 'ERASURE', ['TIME']), original = await f.tx.get('timesheet', 'own-timesheet');
    const result = await run(f.tx, f.owner, 'privacy.erasure_evidence', { ...erasureInput, requestId: request.id });
    expect(result).toMatchObject({ status: 'EVIDENCE_RECORDED_PENDING_VERIFICATION', actualSystemDeletion: false });
    expect((await f.tx.get('privacy_erasure_evidence', result.evidenceId)).data).toMatchObject({ verificationStatus: 'EXTERNAL_REFERENCE_NOT_VERIFIED', systemDataDeleted: false, immutable: true });
    expect(await f.tx.get('timesheet', 'own-timesheet')).toEqual(original);
    expect((await f.tx.get('privacy_request', request.id)).data).toMatchObject({ state: 'EVIDENCE_RECORDED_PENDING_VERIFICATION', sourceDataDeleted: false });
    await expect(run(f.tx, f.owner, 'privacy.erasure_evidence', { ...erasureInput, requestId: request.id })).rejects.toThrow();
    expect(await f.tx.list('privacy_erasure_evidence')).toHaveLength(1);
    expect(f.tx.events.filter(event => event.type === 'privacy.erasure_evidence_recorded')).toHaveLength(1);
  });
});
