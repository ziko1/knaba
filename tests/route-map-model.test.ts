import { describe, expect, it } from 'vitest';
import { berlinDay, buildRouteMapModel, routeProjection, validRoutePosition, type AuthorizedRouteRecords } from '../apps/web/src/routeMapModel';
import type { Entity } from '../apps/web/src/api';

const now = Date.parse('2026-10-06T10:15:00Z');
const row = (kind: string, id: string, data: Record<string, any>): Entity => ({ id, kind, data, version: 1, createdAt: '2026-10-06T09:00:00Z', updatedAt: '2026-10-06T10:00:00Z' });
function fixture(): AuthorizedRouteRecords {
  return {
    site: [row('site', 'site-a', { name: 'Synthetic Berlin A', code: 'SYN-A', address: 'Synthetic address A', geofenceVersionId: 'geo-a' }), row('site', 'site-b', { name: 'Synthetic Berlin B', code: 'SYN-B', address: 'Synthetic address B' })],
    geofence: [row('geofence', 'geo-a', { siteId: 'site-a', latitude: 52.52, longitude: 13.4 })],
    trip: [row('trip', 'trip-a', { shiftId: 'shift-a', employeeId: 'worker-a', startAt: '2026-10-06T09:00:00Z', endAt: '2026-10-06T10:00:00Z', state: 'ARRIVED', approvalState: 'DRAFT', origin: { kind: 'SITE', id: 'site-a' }, destination: { kind: 'SITE', id: 'site-b' }, purpose: 'Synthetic business transfer', routeAvailability: 'PARTIAL' })],
    shift: [row('shift', 'shift-a', { employeeId: 'worker-a', siteId: 'site-b', startAt: '2026-10-06T08:00:00Z', state: 'ACTIVE', activity: 'WORKING' })],
    time_segment: [row('time_segment', 'segment-a', { employeeId: 'worker-a', shiftId: 'shift-a', tripId: 'trip-a', activity: 'TRAVELLING', startAt: '2026-10-06T09:00:00Z', endAt: '2026-10-06T10:00:00Z', siteId: 'site-a' })],
    location_sample: [sample('point-a', '2026-10-06T09:05:00Z', 1), sample('point-b', '2026-10-06T09:06:00Z', 2)],
    tracking_policy: [row('tracking_policy', 'policy-a', { enabled: true, state: 'APPROVED', allowBusinessRoute: true, approvedAt: '2026-10-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z' })]
  };
}
function sample(id: string, observedAt: string, sequenceNumber: number, data: Record<string, any> = {}): Entity {
  return row('location_sample', id, { tripId: 'trip-a', shiftId: 'shift-a', employeeId: 'worker-a', deviceId: 'device-a', policyVersionId: 'policy-a', mode: 'BUSINESS_TRAVEL',
    latitude: 52.52 + sequenceNumber / 100000, longitude: 13.4 + sequenceNumber / 100000, accuracyM: 6, sequenceNumber, observedAt, receivedAt: '2026-10-06T10:00:01Z', expiresAt: '2026-10-13T09:05:00Z', quality: 'USABLE', siteIds: ['site-a', 'site-b'], source: 'DEVICE_GPS', isEvidenceOfPerson: false, ...data });
}

describe('scoped route display model with synthetic authorized inputs', () => {
  it('preserves observation/receipt provenance and separates route, activity, tracker and presence', () => {
    const records = fixture(), model = buildRouteMapModel(records, '2026-10-06', now);
    expect(model.points).toHaveLength(2); expect(model.points[0]).toMatchObject({ observedAt: '2026-10-06T09:05:00.000Z', receivedAt: '2026-10-06T10:00:01.000Z', source: 'DEVICE_GPS', policyVersionId: 'policy-a', siteIds: ['site-a', 'site-b'], isEvidenceOfPerson: false });
    expect(model.trips[0]).toMatchObject({ originSiteId: 'site-a', destinationSiteId: 'site-b', approvalState: 'DRAFT', routeAvailability: 'PARTIAL', gapCount: 0 });
    expect(model.statuses[0]).toMatchObject({ activity: 'WORKING', trackerState: 'UNKNOWN', presence: 'UNKNOWN', collectionMode: 'UNKNOWN' });
    expect(model.sites[0]).toMatchObject({ position: { latitude: 52.52, longitude: 13.4 }, positionSource: 'GEOFENCE:geo-a' });
    expect(model.sites[1]?.position).toBeNull(); expect(JSON.stringify(records)).toContain('2026-10-06T09:05:00Z');
  });
  it('expires points exactly at TTL, including an otherwise valid historical day selection', () => {
    const records = fixture(); records.location_sample![0]!.data.expiresAt = new Date(now).toISOString(); records.location_sample![1]!.data.expiresAt = new Date(now + 1).toISOString();
    expect(buildRouteMapModel(records, '2026-10-06', now).points.map(p => p.id)).toEqual(['point-b']);
    expect(buildRouteMapModel(records, '2026-10-06', now + 1).points).toEqual([]);
    expect(buildRouteMapModel(records, '2026-10-06', now).nextExpiryAt).toBe(new Date(now + 1).toISOString());
  });
  it('filters private modes, missing/nonfinite coordinates, zero sentinel, future observations and malformed retention', () => {
    const records = fixture(); const bad = [{ mode: 'PRIVATE_BREAK' }, { mode: 'OFF' }, { latitude: undefined }, { latitude: Infinity }, { longitude: NaN }, { latitude: 0, longitude: 0 }, { latitude: 91 }, { longitude: -181 }, { accuracyM: 0 }, { accuracyM: undefined }, { observedAt: '2026-10-06T12:00:00Z' }, { expiresAt: 'invalid' }, { siteIds: [] }, { sequenceNumber: 1.5 }];
    records.location_sample = bad.map((data, i) => sample(`bad-${i}`, '2026-10-06T09:05:00Z', 1, data));
    expect(buildRouteMapModel(records, '2026-10-06', now)).toMatchObject({ points: [], omittedPoints: bad.length });
    expect(validRoutePosition('52.52', 13.4)).toBeNull(); expect(validRoutePosition(90, 180)).toEqual({ latitude: 90, longitude: 180 });
  });
  it('binds samples to an authorized trip and employee/shift/event interval; a private break never becomes a route', () => {
    const records = fixture(); records.time_segment = [row('time_segment', 'travel-1', { employeeId: 'worker-a', shiftId: 'shift-a', tripId: 'trip-a', activity: 'TRAVELLING', startAt: '2026-10-06T09:00:00Z', endAt: '2026-10-06T09:05:00Z' }), row('time_segment', 'break-1', { employeeId: 'worker-a', shiftId: 'shift-a', tripId: 'trip-a', activity: 'ON_BREAK', startAt: '2026-10-06T09:05:00Z', endAt: '2026-10-06T09:10:00Z' })];
    records.location_sample = [sample('private', '2026-10-06T09:05:00Z', 1), sample('before-boundary', '2026-10-06T09:04:59Z', 2), sample('wrong-worker', '2026-10-06T09:04:00Z', 3, { employeeId: 'someone-else' }), sample('wrong-shift', '2026-10-06T09:04:00Z', 4, { shiftId: 'hidden-shift' }), sample('unknown-trip', '2026-10-06T09:04:00Z', 5, { tripId: 'hidden-trip' }), sample('at-trip-end', '2026-10-06T10:00:00Z', 6)];
    expect(buildRouteMapModel(records, '2026-10-06', now).points.map(p => p.id)).toEqual(['before-boundary']);
  });
  it('uses a returned policy at event time and never creates current GPS collection from a historical route', () => {
    const records = fixture(); records.tracking_policy![0]!.data.disabledAt = '2026-10-06T09:05:30Z'; records.tracking_policy![0]!.data.enabled = false;
    const model = buildRouteMapModel(records, '2026-10-06', now);
    expect(model.points.map(p => p.id)).toEqual(['point-a']); expect(model.statuses[0]!.collectionMode).toBe('UNKNOWN');
    records.tracking_policy![0]!.data.allowBusinessRoute = false;
    expect(buildRouteMapModel(records, '2026-10-06', now).points).toEqual([]);
  });
  it('orders reordered events, deduplicates IDs, flags gaps/uncertainty and exports no reconstructed path or distance', () => {
    const records = fixture(); records.location_sample = [sample('late', '2026-10-06T09:12:00Z', 8), sample('early', '2026-10-06T09:05:00Z', 1), sample('uncertain', '2026-10-06T09:06:00Z', 2, { accuracyM: 150 }), sample('early', '2026-10-06T09:05:00Z', 1)];
    const model = buildRouteMapModel(records, '2026-10-06', now); expect(model.points.map(p => p.id)).toEqual(['early', 'uncertain', 'late']); expect(model.trips[0]!.gapCount).toBe(2);
    expect(model.points[1]!.quality).toBe('UNCERTAIN'); expect(model.trips[0]).not.toHaveProperty('path'); expect(model.trips[0]).not.toHaveProperty('distanceMeters'); expect(model.omittedPoints).toBe(1);
  });
  it('bounds selected-day display to the latest1000 valid points without browser persistence', () => {
    const records = fixture(); records.location_sample = Array.from({ length: 1100 }, (_, i) => sample(`p-${i}`, new Date(Date.parse('2026-10-06T09:00:00Z') + i * 1000).toISOString(), i));
    const model = buildRouteMapModel(records, '2026-10-06', now); expect(model.points).toHaveLength(1000); expect(model.points[0]?.id).toBe('p-100'); expect(model.points.at(-1)?.id).toBe('p-1099'); expect(model.limited).toBe(true); expect(model.omittedPoints).toBe(100);
  });
  it('Berlin days include summer/winter boundary and repeated DST hour without UTC date leakage', () => {
    expect(berlinDay('2026-10-05T22:00:00Z')).toBe('2026-10-06'); expect(berlinDay('2026-12-05T22:59:59Z')).toBe('2026-12-05'); expect(berlinDay('2026-12-05T23:00:00Z')).toBe('2026-12-06');
    expect(berlinDay('2026-10-25T00:30:00Z')).toBe('2026-10-25'); expect(berlinDay('2026-10-25T01:30:00Z')).toBe('2026-10-25'); expect(berlinDay('invalid')).toBe('');
    const records = fixture(); records.time_segment = []; records.trip![0]!.data.startAt = '2026-10-05T21:00:00Z'; records.trip![0]!.data.endAt = '2026-10-06T10:00:00Z'; records.location_sample = [sample('before', '2026-10-05T21:59:59Z', 1), sample('after', '2026-10-05T22:00:00Z', 2)];
    expect(buildRouteMapModel(records, '2026-10-06', now).points.map(p => p.id)).toEqual(['after']); expect(buildRouteMapModel(records, '2026-10-05', now).points.map(p => p.id)).toEqual(['before']);
    expect(buildRouteMapModel(records, '2026-02-30', now).day).toBe('2026-10-06');
  });
  it('unknown/stale tracking does not change working time or label device position as absence', () => {
    const records = fixture(); records.presence = [row('presence', 'presence-a', { shiftId: 'shift-a', employeeId: 'worker-a', trackerState: 'ONLINE', state: 'OUTSIDE', lastObservedAt: '2026-10-06T10:09:59Z' })];
    expect(buildRouteMapModel(records, '2026-10-06', now).statuses[0]).toMatchObject({ activity: 'WORKING', trackerState: 'STALE', presence: 'UNKNOWN' });
    records.presence[0]!.data.lastObservedAt = '2026-10-06T10:14:59Z'; records.presence[0]!.data.trackerState = 'PERMISSION_DENIED'; records.shift![0]!.data.activity = 'ON_BREAK';
    expect(buildRouteMapModel(records, '2026-10-06', now).statuses[0]).toMatchObject({ activity: 'ON_BREAK', trackerState: 'PERMISSION_DENIED', presence: 'UNKNOWN', collectionMode: 'PRIVATE_BREAK' });
    records.shift![0]!.data.state = 'ENDED'; expect(buildRouteMapModel(records, '2026-10-06', now).statuses[0]).toMatchObject({ trackerState: 'OFFLINE', collectionMode: 'OFF' });
  });
  it('site markers use only authorized current coordinates and missing destination refs stay unknown', () => {
    const records = fixture(); records.site![0]!.data.geofenceVersionId = 'missing-current'; records.trip![0]!.data.destination = { kind: 'SITE', id: 'unauthorized-site' };
    const model = buildRouteMapModel(records, '2026-10-06', now); expect(model.sites[0]!.position).toBeNull(); expect(model.trips[0]!.destinationSiteId).toBeNull(); expect(model.sites.map(s => s.id)).not.toContain('unauthorized-site');
  });
  it('an expired or revoked tracking session cannot advertise an active collection mode', () => {
    const records = fixture(); records.tracking_session = [row('tracking_session', 'session-a', { employeeId: 'worker-a', shiftId: 'shift-a', mode: 'BUSINESS_TRAVEL', expiresAt: new Date(now + 1).toISOString() })];
    expect(buildRouteMapModel(records, '2026-10-06', now).statuses[0]?.collectionMode).toBe('BUSINESS_TRAVEL');
    expect(buildRouteMapModel(records, '2026-10-06', now + 1).statuses[0]?.collectionMode).toBe('UNKNOWN');
    records.tracking_session[0]!.data.revokedAt = new Date(now - 1).toISOString();
    expect(buildRouteMapModel(records, '2026-10-06', now).statuses[0]?.collectionMode).toBe('UNKNOWN');
  });
  it('local geographic projection stays finite and compact across the dateline and at poles', () => {
    for (const positions of [[{ latitude: 52.52, longitude: 13.4 }], [{ latitude: 10, longitude: 179.9 }, { latitude: 10.1, longitude: -179.9 }], [{ latitude: 90, longitude: 180 }, { latitude: 89, longitude: 179 }]]) {
      const project = routeProjection(positions); for (const position of positions) { const point = project(position); expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true); expect(point.x).toBeGreaterThanOrEqual(60 - 1e-6); expect(point.x).toBeLessThanOrEqual(940 + 1e-6); expect(point.y).toBeGreaterThanOrEqual(60 - 1e-6); expect(point.y).toBeLessThanOrEqual(540 + 1e-6); }
    }
    expect(routeProjection([])({ latitude: 0, longitude: 0 })).toEqual({ x: 500, y: 300 });
  });
});
