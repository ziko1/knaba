import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Database } from '../apps/api/database.ts';
import { Engine } from '../apps/api/engine.ts';
import type { Actor, Data, Entity } from '../packages/domain/core.ts';

const postgres = process.env.DATABASE_URL ? describe : describe.skip;
postgres('AC-43 real PostgreSQL shared vehicle journey and command receipts', () => {
  let db: Database, engine: Engine, company: string, owner: Actor, vehicle: Entity, startAt: string, arriveAt: string;
  const execute = (actor: Actor, name: string, input: Data, key: string = randomUUID(), expectedVersion?: number): Promise<any> => engine.execute(actor, name, { input, idempotency_key: key, expected_version: expectedVersion });
  beforeAll(async () => {
    expect(process.env.APP_MODE).toBe('TEST'); db = new Database(); await db.migrate(); engine = new Engine(db, 'TEST');
  });
  beforeEach(async () => {
    company = 'vehicle-' + randomUUID(); startAt = new Date(Date.now() - 3600_000).toISOString(); arriveAt = new Date(Date.parse(startAt) + 1800_000).toISOString();
    await db.transaction(company, 'SYNTHETIC_FIXTURE', async tx => {
      await tx.add('company', { operatingMode: 'TEST' }, company);
      for (const id of ['A', 'B']) await tx.add('site', { name: 'Synthetic site ' + id, active: true }, id);
      await tx.add('user', { active: true, roles: ['OWNER'], siteIds: [] }, 'owner');
      for (const id of ['driver', 'second', 'third', 'outsider']) await tx.add('user', { name: 'Synthetic ' + id, active: true, roles: ['EMPLOYEE'], siteIds: ['A', 'B'] }, id);
    });
    owner = await engine.getActor('owner', company);
    vehicle = await execute(owner, 'vehicle_trip.create', { originSiteId: 'A', destination: { kind: 'SITE', id: 'B' }, driverId: 'driver', passengerIds: ['second', 'third'], purpose: 'Synthetic shared business journey' }, 'create-vehicle');
  });
  afterAll(async () => { await db?.close(); });
  async function departure(userId: string) {
    const actor = await engine.getActor(userId, company);
    const shift = await execute(actor, 'shift.start', { siteId: 'A', occurredAt: new Date(Date.parse(startAt) - 600_000).toISOString() });
    return { actor, input: { shiftId: shift.id, destination: { kind: 'SITE', id: 'B' }, purpose: 'Synthetic transfer', occurredAt: startAt, transportMode: 'CAR', passengerRole: userId === 'driver' ? 'DRIVER' : 'PASSENGER', vehicleTripId: vehicle.id } };
  }
  it('persists three personal timelines, one vehicle distance and current scoped summary without duplicate effects', async () => {
    for (const id of ['driver', 'second', 'third']) {
      const { actor, input } = await departure(id), key = 'start-' + id;
      const trip = await execute(actor, 'trip.start', input, key);
      expect(await execute(actor, 'trip.start', input, key)).toEqual(trip);
      await execute(actor, 'trip.arrive', { tripId: trip.id, occurredAt: arriveAt, startWork: true });
    }
    await execute(owner, 'vehicle_trip.distance', { vehicleTripId: vehicle.id, source: 'ESTIMATED', distanceMeters: 20000, reason: 'Synthetic estimate, no measured track' });
    expect(await execute(owner, 'vehicle_trip.summary', { vehicleTripId: vehicle.id }, 'vehicle-summary')).toMatchObject({ personSeconds: 5400, personHours: 1.5, vehicleKilometers: 20, distanceSource: 'ESTIMATED', participantCount: 3, complete: true });
    const driver = await engine.getActor('driver', company), outsider = await engine.getActor('outsider', company);
    expect((await engine.readEntities(driver, 'vehicle_trip')).map(row => row.id)).toEqual([vehicle.id]);
    expect(await engine.readEntities(outsider, 'vehicle_trip')).toEqual([]);
    await expect(execute(outsider, 'vehicle_trip.summary', { vehicleTripId: vehicle.id })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect((await db.query("SELECT id FROM aggregates WHERE company_id=$1 AND kind='trip'", [company])).rows).toHaveLength(3);
    expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='trip.started'", [company])).rows).toHaveLength(3);
    expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='vehicle_trip.created'", [company])).rows).toHaveLength(1);
  });
  it('serializes competing starts and commits exactly one personal trip and receipt', async () => {
    const { actor, input } = await departure('driver');
    const results = await Promise.allSettled([execute(actor, 'trip.start', input, 'competing-a'), execute(actor, 'trip.start', input, 'competing-b')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await db.query("SELECT id FROM aggregates WHERE company_id=$1 AND kind='trip'", [company])).rows).toHaveLength(1);
    expect((await db.query("SELECT idempotency_key FROM command_receipts WHERE company_id=$1 AND command='trip.start'", [company])).rows).toHaveLength(1);
    expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='trip.started'", [company])).rows).toHaveLength(1);
  });
  it('rolls back a stale distance edit and re-evaluates a cached summary after loss of route scope', async () => {
    await execute(owner, 'vehicle_trip.distance', { vehicleTripId: vehicle.id, source: 'ESTIMATED', distanceMeters: 20000, reason: 'Synthetic estimate' }, 'distance', vehicle.version);
    await expect(execute(owner, 'vehicle_trip.distance', { vehicleTripId: vehicle.id, source: 'UNKNOWN', distanceMeters: null, reason: 'Stale change' }, 'stale-distance', vehicle.version)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    const driver = await engine.getActor('driver', company);
    expect(await execute(driver, 'vehicle_trip.summary', { vehicleTripId: vehicle.id }, 'driver-summary')).toMatchObject({ distanceMeters: 20000 });
    await db.transaction(company, 'SYNTHETIC_SCOPE_REVOCATION', async tx => { const user = await tx.get('user', 'driver'); await tx.save(user, { ...user.data, siteIds: ['A'] }); });
    await expect(execute(driver, 'vehicle_trip.summary', { vehicleTripId: vehicle.id }, 'driver-summary')).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='vehicle_trip.distance_recorded'", [company])).rows).toHaveLength(1);
  });
});
