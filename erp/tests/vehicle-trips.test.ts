import { describe, expect, it } from 'vitest';
import { operationsCommands } from '../packages/domain/operations.ts';
import { DomainError, ownScope, siteScope, type Actor, type CommandContext, type Data, type Entity, type Transaction } from '../packages/domain/core.ts';

// Synthetic domain transaction: these cases prove business arithmetic and
// authorization, not PostgreSQL concurrency or an actual device journey.
class Memory implements Transaction {
  rows = new Map<string, Entity>(); sequence = 0; events: { type: string; data: Data }[] = [];
  async get<T extends Data = Data>(kind: string, id: string): Promise<Entity<T>> {
    const row = this.rows.get(kind + ':' + id);
    if (!row) throw new DomainError('NOT_FOUND_SAFE');
    return structuredClone(row) as Entity<T>;
  }
  async list<T extends Data = Data>(kind: string): Promise<Entity<T>[]> { return [...this.rows.values()].filter(row => row.kind === kind).map(row => structuredClone(row)) as Entity<T>[]; }
  async add<T extends Data = Data>(kind: string, data: T, id = kind + '_' + ++this.sequence): Promise<Entity<T>> {
    if (this.rows.has(kind + ':' + id)) throw new DomainError('VERSION_CONFLICT');
    const row = { kind, id, data: structuredClone(data), companyId: 'company', version: 1, createdAt: '2026-11-08T08:00:00Z', updatedAt: '2026-11-08T08:00:00Z' };
    this.rows.set(kind + ':' + id, row); return structuredClone(row);
  }
  async save(row: Entity, data: Data, expected = row.version): Promise<Entity> {
    const current = await this.get(row.kind, row.id);
    if (current.version !== expected) throw new DomainError('VERSION_CONFLICT');
    const saved = { ...current, version: current.version + 1, data: structuredClone(data) };
    this.rows.set(row.kind + ':' + row.id, saved); return structuredClone(saved);
  }
  async event(type: string, data: Data) { this.events.push({ type, data: structuredClone(data) }); }
}
const owner: Actor = { userId: 'owner', companyId: 'company', roles: ['OWNER'], permissions: ['scope.company', 'dispatch.manage', 'trip.approve', 'trip.read'], siteIds: [], customerIds: [], warehouseIds: [] };
const person = (userId: string): Actor => ({ ...owner, userId, roles: ['EMPLOYEE'], permissions: ['shift.manage', 'trip.manage', 'trip.read'], siteIds: ['A', 'B'] });
async function run(tx: Memory, name: string, input: Data, actor = owner, now = '2026-11-08T10:00:00Z', expectedVersion?: number): Promise<any> {
  const definition = operationsCommands[name];
  expect(definition, 'registered command ' + name).toBeDefined();
  const ctx: CommandContext = { tx, actor, now, expectedVersion, idempotencyKey: 'test-' + ++tx.sequence, requireSite: id => siteScope(actor, id), requireOwn: id => ownScope(actor, id) };
  return definition!.handler(ctx, definition!.schema.parse(input));
}
async function setup() {
  const tx = new Memory();
  for (const id of ['A', 'B', 'C']) await tx.add('site', { active: true }, id);
  for (const id of ['owner', 'driver', 'second', 'third', 'outsider']) await tx.add('user', { active: true, roles: ['EMPLOYEE'], siteIds: ['A', 'B'] }, id);
  const vehicle = await run(tx, 'vehicle_trip.create', { originSiteId: 'A', destination: { kind: 'SITE', id: 'B' }, driverId: 'driver', passengerIds: ['second', 'third'], purpose: 'Synthetic shared business journey' });
  return { tx, vehicle };
}
async function start(tx: Memory, vehicle: Entity, id: string, override: Data = {}) {
  const actor = person(id), shift = await run(tx, 'shift.start', { siteId: 'A', occurredAt: '2026-11-08T08:00:00Z' }, actor);
  const trip = await run(tx, 'trip.start', { shiftId: shift.id, destination: { kind: 'SITE', id: 'B' }, purpose: 'Synthetic trip', transportMode: 'CAR', passengerRole: id === 'driver' ? 'DRIVER' : 'PASSENGER', vehicleTripId: vehicle.id, occurredAt: '2026-11-08T09:00:00Z', ...override }, actor);
  return { actor, shift, trip };
}

describe('AC-43 shared vehicle journey', () => {
  it('counts three half-hour participants as 5400 person-seconds and one 20000 m vehicle distance', async () => {
    const { tx, vehicle } = await setup();
    for (const id of ['driver', 'second', 'third']) {
      const { actor, trip } = await start(tx, vehicle, id);
      await run(tx, 'trip.arrive', { tripId: trip.id, occurredAt: '2026-11-08T09:30:00Z', startWork: true }, actor);
    }
    await run(tx, 'vehicle_trip.distance', { vehicleTripId: vehicle.id, source: 'ESTIMATED', distanceMeters: 20000, reason: 'Synthetic route estimate; no recorded GPS track' });
    const result = await run(tx, 'vehicle_trip.summary', { vehicleTripId: vehicle.id });
    expect(result).toMatchObject({ vehicleTripId: vehicle.id, participantCount: 3, personSeconds: 5400, personHours: 1.5, distanceMeters: 20000, vehicleKilometers: 20, distanceSource: 'ESTIMATED', complete: true });
    expect((await tx.list('trip')).map(row => row.data.distanceMeters)).toEqual([null, null, null]);
    expect(await tx.list('vehicle_trip')).toHaveLength(1);
  });
  it('excludes a private break and keeps missing distance unknown', async () => {
    const { tx, vehicle } = await setup(), { actor, trip } = await start(tx, vehicle, 'driver');
    await run(tx, 'trip.stop', { tripId: trip.id, kind: 'PRIVATE_BREAK', reason: 'Synthetic pause', occurredAt: '2026-11-08T09:10:00Z' }, actor);
    await run(tx, 'trip.resume', { tripId: trip.id, occurredAt: '2026-11-08T09:20:00Z' }, actor);
    await run(tx, 'trip.arrive', { tripId: trip.id, occurredAt: '2026-11-08T09:30:00Z' }, actor);
    expect(await run(tx, 'vehicle_trip.summary', { vehicleTripId: vehicle.id })).toMatchObject({ personSeconds: 1200, distanceMeters: null, vehicleKilometers: null, distanceSource: 'UNKNOWN', complete: false });
  });
  it.each([
    ['outsider', {}, 'ACCESS_DENIED'], ['second', { passengerRole: 'DRIVER' }, 'ACCESS_DENIED'],
    ['driver', { passengerRole: 'PASSENGER' }, 'ACCESS_DENIED'], ['driver', { transportMode: 'WALK' }, 'VALIDATION_ERROR'],
    ['driver', { destination: { kind: 'SITE', id: 'A' } }, 'ACCESS_DENIED'],
  ] as const)('rejects mismatched shared membership %s %j before recording a trip', async (id, override, code) => {
    const { tx, vehicle } = await setup();
    await expect(start(tx, vehicle, id, override)).rejects.toMatchObject({ code });
    expect(await tx.list('trip')).toHaveLength(0);
  });
  it('does not accept a second personal trip for the same vehicle journey', async () => {
    const { tx, vehicle } = await setup(), { actor, shift, trip } = await start(tx, vehicle, 'driver');
    await run(tx, 'trip.arrive', { tripId: trip.id, occurredAt: '2026-11-08T09:30:00Z' }, actor);
    await tx.save(await tx.get('shift', shift.id), { ...(await tx.get('shift', shift.id)).data, siteId: 'A' });
    await expect(run(tx, 'trip.start', { shiftId: shift.id, destination: { kind: 'SITE', id: 'B' }, purpose: 'Duplicate shared trip', transportMode: 'CAR', passengerRole: 'DRIVER', vehicleTripId: vehicle.id, occurredAt: '2026-11-08T09:35:00Z' }, actor)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it('rejects duplicate participants, inactive users, missing site assignment and cross-company records', async () => {
    const { tx } = await setup(), input = { originSiteId: 'A', destination: { kind: 'SITE', id: 'B' }, driverId: 'driver', passengerIds: ['second'], purpose: 'Synthetic business trip' };
    await expect(run(tx, 'vehicle_trip.create', { ...input, passengerIds: ['driver'] })).rejects.toThrow();
    await expect(run(tx, 'vehicle_trip.create', { ...input, passengerIds: ['second', 'second'] })).rejects.toThrow();
    const user = await tx.get('user', 'second'); await tx.save(user, { ...user.data, active: false });
    await expect(run(tx, 'vehicle_trip.create', input)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await tx.save(await tx.get('user', 'second'), { ...user.data, siteIds: ['A'] });
    await expect(run(tx, 'vehicle_trip.create', input)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    tx.rows.set('user:second', { ...user, companyId: 'different-company' });
    await expect(run(tx, 'vehicle_trip.create', input)).rejects.toMatchObject({ code: 'NOT_FOUND_SAFE' });
  });
  it('denies unrelated readers and a dispatcher outside either route site', async () => {
    const { tx, vehicle } = await setup();
    await expect(run(tx, 'vehicle_trip.summary', { vehicleTripId: vehicle.id }, person('outsider'))).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await expect(run(tx, 'vehicle_trip.summary', { vehicleTripId: vehicle.id }, { ...owner, roles: ['DISPATCHER'], permissions: ['trip.read', 'dispatch.manage'], siteIds: ['A'] })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(await run(tx, 'vehicle_trip.summary', { vehicleTripId: vehicle.id }, person('driver'))).toMatchObject({ personSeconds: 0 });
  });
  it.each(['dispatch.manage', 'trip.approve'])('permits the precise scoped %s capability without inventing trip.read', async permission => {
    const { tx, vehicle } = await setup();
    const actor = { ...owner, roles: ['DISPATCHER'], permissions: ['identity.self', permission], siteIds: ['A', 'B'] };
    expect(await run(tx, 'vehicle_trip.summary', { vehicleTripId: vehicle.id }, actor)).toMatchObject({ personSeconds: 0 });
    expect(operationsCommands['vehicle_trip.summary']!.permission).toBe('identity.self');
  });
  it('never permits a manual measured-distance claim and resets an estimate to unknown explicitly', async () => {
    const { tx, vehicle } = await setup();
    for (const input of [{ source: 'MEASURED', distanceMeters: 20000 }, { source: 'UNKNOWN', distanceMeters: 20 }, { source: 'ESTIMATED', distanceMeters: null }, { source: 'ESTIMATED', distanceMeters: -1 }]) {
      await expect(run(tx, 'vehicle_trip.distance', { vehicleTripId: vehicle.id, reason: 'Synthetic evidence', ...input })).rejects.toThrow();
    }
    await run(tx, 'vehicle_trip.distance', { vehicleTripId: vehicle.id, source: 'ESTIMATED', distanceMeters: 20000, reason: 'Synthetic route estimate' });
    await run(tx, 'vehicle_trip.distance', { vehicleTripId: vehicle.id, source: 'UNKNOWN', distanceMeters: null, reason: 'Estimate withdrawn' });
    expect(await run(tx, 'vehicle_trip.summary', { vehicleTripId: vehicle.id })).toMatchObject({ distanceMeters: null, distanceSource: 'UNKNOWN' });
  });
});
