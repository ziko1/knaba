import { z } from 'zod';
import { assert, DomainError, id, type Actor, type CommandContext, type CommandRegistry, type Data, type Entity } from './core.ts';

const shortText = z.string().trim().min(1).max(250);
const destination = z.object({ kind: z.enum(['SITE', 'WAREHOUSE', 'SERVICE_POINT']), id, label: shortText.optional() }).strict();
const reference = z.object({ vehicleTripId: id }).strict();
const external = new Set(['GUEST', 'CLIENT', 'CUSTOMER', 'EXTERNAL_BAULEITER', 'SERVICE_ACCOUNT']);
const requireInternalActor = (actor: Actor): void => assert(!actor.roles.some(role => external.has(role)), 'ACCESS_DENIED');
const routeSites = (row: Entity): string[] => [...new Set([row.data.originSiteId, ...(row.data.destination?.kind === 'SITE' ? [row.data.destination.id] : []), row.data.destinationSiteId].filter(Boolean))];
const routeAllowed = (actor: Actor, row: Entity) => actor.permissions.includes('scope.company') || routeSites(row).length > 0 && routeSites(row).every(site => actor.siteIds.includes(site));
const participant = (row: Entity, userId: string) => row.data.driverId === userId || (row.data.passengerIds ?? []).includes(userId);

/** Pass an actor scoped to this exact permission, never merged delegation sites. */
export function vehicleTripReadable(actor: Actor, row: Entity, permission: 'trip.read' | 'dispatch.manage' | 'trip.approve' = 'trip.read'): boolean {
  if (row.kind !== 'vehicle_trip' || row.companyId !== actor.companyId || actor.roles.some(role => external.has(role)) || !actor.permissions.includes(permission) || !routeAllowed(actor, row)) return false;
  return permission !== 'trip.read' || participant(row, actor.userId) || actor.permissions.includes('scope.company');
}
async function entity(ctx: CommandContext, kind: string, entityId: string): Promise<Entity> {
  const row = await ctx.tx.get(kind, entityId);
  assert(row.companyId === ctx.actor.companyId, 'NOT_FOUND_SAFE'); return row;
}
async function currentParticipant(ctx: CommandContext, userId: string, siteIds: string[]) {
  const user = await entity(ctx, 'user', userId);
  assert(user.data.active !== false && !(user.data.roles ?? []).some((role: string) => external.has(role)), 'ACCESS_DENIED');
  assert(siteIds.every(site => (user.data.siteIds ?? []).includes(site) || (user.data.roles ?? []).some((role: string) => ['OWNER', 'DIRECTOR', 'OPERATIONS_MANAGER'].includes(role))), 'ACCESS_DENIED', { reason: 'EMPLOYEE_SITE_SCOPE' });
}
async function readAllowed(ctx: CommandContext, row: Entity) {
  for (const permission of ['trip.read', 'dispatch.manage', 'trip.approve'] as const) {
    try {
      const scoped = ctx.forPermission ? await ctx.forPermission(permission) : ctx;
      if (vehicleTripReadable(scoped.actor, row, permission)) return;
    } catch (error) { if (!(error instanceof DomainError) || error.code !== 'ACCESS_DENIED') throw error; }
  }
  assert(false, 'ACCESS_DENIED');
}
async function scopedVehicle(ctx: CommandContext, vehicleTripId: string) {
  requireInternalActor(ctx.actor);
  const row = await entity(ctx, 'vehicle_trip', vehicleTripId);
  for (const siteId of routeSites(row)) ctx.requireSite(siteId);
  return row;
}

/** A personal Trip remains authoritative for time; the vehicle only groups it. */
export async function validateSharedVehicleTrip(ctx: CommandContext, input: Data, shift: Entity): Promise<void> {
  if (!input.vehicleTripId) return;
  const row = await scopedVehicle(ctx, input.vehicleTripId);
  assert(row.data.state !== 'CANCELLED', 'INVALID_STATE');
  assert(input.transportMode === 'CAR', 'VALIDATION_ERROR', { reason: 'SHARED_TRIP_REQUIRES_CAR' });
  assert(shift.data.employeeId === ctx.actor.userId && participant(row, ctx.actor.userId), 'ACCESS_DENIED');
  assert(input.passengerRole === (row.data.driverId === ctx.actor.userId ? 'DRIVER' : 'PASSENGER'), 'ACCESS_DENIED');
  assert(shift.data.siteId === row.data.originSiteId && input.destination.kind === row.data.destination.kind && input.destination.id === row.data.destination.id, 'ACCESS_DENIED', { reason: 'SHARED_ROUTE_MISMATCH' });
  await currentParticipant(ctx, ctx.actor.userId, routeSites(row));
  await currentParticipant(ctx, row.data.driverId, routeSites(row));
  const previous = (await ctx.tx.list('trip')).some(trip => trip.companyId === ctx.actor.companyId && trip.data.vehicleTripId === row.id && trip.data.employeeId === ctx.actor.userId);
  assert(!previous, 'INVALID_STATE', { reason: 'SHARED_PARTICIPANT_ALREADY_RECORDED' });
}

const distanceInput = reference.extend({ source: z.enum(['UNKNOWN', 'ESTIMATED']), distanceMeters: z.number().int().min(0).max(5_000_000).nullable(), reason: z.string().trim().min(1).max(2000) }).strict()
  .refine(value => value.source === 'UNKNOWN' ? value.distanceMeters === null : value.distanceMeters !== null, { message: 'Distance and source must agree' });

export const vehicleTripCommands: CommandRegistry = {
  'vehicle_trip.create': {
    permission: 'dispatch.manage',
    schema: z.object({ originSiteId: id, destination, driverId: id, passengerIds: z.array(id).max(50).default([]), purpose: z.string().trim().min(1).max(2000), vehicleLabel: shortText.optional() }).strict()
      .refine(value => !value.passengerIds.includes(value.driverId) && new Set(value.passengerIds).size === value.passengerIds.length, { message: 'Each participant must be unique' }),
    async handler(ctx, input) {
      requireInternalActor(ctx.actor);
      ctx.requireSite(input.originSiteId);
      assert((await entity(ctx, 'site', input.originSiteId)).data.active !== false, 'INVALID_STATE');
      const target = await entity(ctx, input.destination.kind === 'SITE' ? 'site' : input.destination.kind === 'WAREHOUSE' ? 'stock_location' : 'service_point', input.destination.id);
      assert(target.data.active !== false, 'INVALID_STATE');
      const destinationSiteId = input.destination.kind === 'SITE' ? target.id : target.data.siteId ?? null;
      if (destinationSiteId) ctx.requireSite(destinationSiteId);
      if (input.destination.kind === 'WAREHOUSE') assert(ctx.actor.permissions.includes('scope.company') || ctx.actor.warehouseIds.includes(target.id), 'ACCESS_DENIED');
      const sites = [...new Set([input.originSiteId, destinationSiteId].filter(Boolean))] as string[];
      for (const userId of [input.driverId, ...input.passengerIds]) await currentParticipant(ctx, userId, sites);
      const row = await ctx.tx.add('vehicle_trip', { ...input, destinationSiteId, state: 'PLANNED', distanceMeters: null, distanceSource: 'UNKNOWN', distanceReason: null, createdBy: ctx.actor.userId });
      await ctx.tx.event('vehicle_trip.created', { vehicleTripId: row.id, originSiteId: input.originSiteId });
      return row;
    },
  },
  'vehicle_trip.distance': {
    permission: 'trip.approve', schema: distanceInput,
    async handler(ctx, input) {
      const row = await scopedVehicle(ctx, input.vehicleTripId);
      assert(row.data.state !== 'CANCELLED', 'INVALID_STATE');
      // Manual estimates never become measured GPS/odometer evidence, wages or invoices.
      const result = await ctx.tx.save(row, { ...row.data, distanceMeters: input.distanceMeters, distanceSource: input.source, distanceReason: input.reason, distanceRecordedBy: ctx.actor.userId, distanceRecordedAt: ctx.now }, ctx.expectedVersion);
      await ctx.tx.event('vehicle_trip.distance_recorded', { vehicleTripId: row.id, source: input.source });
      return result;
    },
  },
  'vehicle_trip.cancel': {
    permission: 'dispatch.manage', schema: reference.extend({ reason: z.string().trim().min(1).max(2000) }).strict(),
    async handler(ctx, input) {
      const row = await scopedVehicle(ctx, input.vehicleTripId);
      assert(!(await ctx.tx.list('trip')).some(trip => trip.companyId === ctx.actor.companyId && trip.data.vehicleTripId === row.id), 'INVALID_STATE', { reason: 'PERSONAL_TRIPS_ALREADY_STARTED' });
      return ctx.tx.save(row, { ...row.data, state: 'CANCELLED', cancelledAt: ctx.now, cancelledBy: ctx.actor.userId, cancellationReason: input.reason }, ctx.expectedVersion);
    },
  },
  'vehicle_trip.summary': {
    // Authentication opens the command gateway; each actual read capability is
    // re-evaluated in its own current delegation scope by readAllowed.
    permission: 'identity.self', schema: reference,
    async handler(ctx, input) {
      const row = await entity(ctx, 'vehicle_trip', input.vehicleTripId);
      await readAllowed(ctx, row);
      const ids = [row.data.driverId, ...row.data.passengerIds], trips = (await ctx.tx.list('trip')).filter(trip => trip.companyId === ctx.actor.companyId && trip.data.vehicleTripId === row.id);
      assert(trips.every(trip => ids.includes(trip.data.employeeId)) && new Set(trips.map(trip => trip.data.employeeId)).size === trips.length, 'INVALID_STATE', { reason: 'INVALID_SHARED_TRIP_MEMBERSHIP' });
      let personSeconds = 0;
      for (const segment of await ctx.tx.list('time_segment')) {
        if (segment.companyId !== ctx.actor.companyId || segment.data.activity !== 'TRAVELLING') continue;
        const trip = trips.find(trip => trip.id === segment.data.tripId);
        if (!trip) continue;
        assert(segment.data.employeeId === trip.data.employeeId && segment.data.shiftId === trip.data.shiftId, 'INVALID_STATE');
        const from = Date.parse(segment.data.startAt), until = Math.min(Date.parse(segment.data.endAt ?? ctx.now), Date.parse(trip.data.endAt ?? ctx.now));
        assert(Number.isFinite(from) && Number.isFinite(until) && until >= from && from >= Date.parse(trip.data.startAt), 'INVALID_STATE');
        personSeconds += Math.floor((until - from) / 1000);
      }
      assert(Number.isSafeInteger(personSeconds), 'INVALID_STATE');
      const distanceMeters = row.data.distanceSource === 'ESTIMATED' && Number.isSafeInteger(row.data.distanceMeters) ? row.data.distanceMeters : null;
      return { vehicleTripId: row.id, participantCount: trips.length, plannedParticipantCount: ids.length, personSeconds, personHours: personSeconds / 3600,
        distanceMeters, vehicleKilometers: distanceMeters === null ? null : distanceMeters / 1000, distanceSource: distanceMeters === null ? 'UNKNOWN' : 'ESTIMATED',
        complete: trips.length === ids.length && trips.every(trip => trip.data.state === 'ARRIVED' && trip.data.endAt),
        formula: 'sum(TRAVELLING TimeSegment seconds across participants); vehicle distance counted once; no automatic payroll or invoicing' };
    },
  },
};
