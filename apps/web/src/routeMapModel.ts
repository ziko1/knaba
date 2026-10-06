import type { Entity } from './api';

export const ROUTE_POINT_LIMIT = 1000;
export const ROUTE_ENTITY_LIMIT = 5000;
export type AuthorizedRouteRecords = Record<string, Entity[]>;
export interface RoutePosition { latitude: number; longitude: number }
export interface RoutePoint extends RoutePosition {
  id: string; tripId: string; shiftId: string; employeeId: string; deviceId: string;
  sequenceNumber: number; observedAt: string; receivedAt: string | null; expiresAt: string;
  accuracyM: number; quality: 'USABLE' | 'UNCERTAIN'; siteIds: string[];
  source: string; policyVersionId: string; isEvidenceOfPerson: false;
}
export interface RouteSite { id: string; name: string; code: string; address: string; position: RoutePosition | null; active: boolean; positionSource: string | null; }
export interface RouteInterval { id: string; activity: string; startAt: string; endAt: string | null; siteId: string | null; }
export interface RouteTrip {
  id: string; employeeId: string; shiftId: string; startAt: string; endAt: string | null;
  state: string; approvalState: string; purpose: string; routeAvailability: string;
  originSiteId: string | null; destinationSiteId: string | null;
  points: RoutePoint[]; intervals: RouteInterval[]; gapCount: number;
}
export interface RouteStatus { shiftId: string; employeeId: string; siteId: string | null; activity: string; shiftState: string; trackerState: string; presence: string; observedAt: string | null; collectionMode: string; }
export interface RouteMapModel {
  day: string; points: RoutePoint[]; trips: RouteTrip[]; sites: RouteSite[]; statuses: RouteStatus[];
  days: string[]; omittedPoints: number; limited: boolean; nextExpiryAt: string | null;
}
const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const str = (v: unknown): string => typeof v === 'string' ? v : '';
const dateMs = (v: unknown): number => typeof v === 'string' && isoPattern.test(v) ? Date.parse(v) : NaN;
const instant = (v: unknown): string | null => Number.isFinite(dateMs(v)) ? new Date(dateMs(v)).toISOString() : null;
export function berlinDay(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(dayFormat.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function validRoutePosition(latitude: unknown, longitude: unknown): RoutePosition | null {
  return typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && !(latitude === 0 && longitude === 0) ? { latitude, longitude } : null;
}
function rows(records: AuthorizedRouteRecords, kind: string): Entity[] { const values = (records[kind] ?? []).filter(e => e.kind === kind); return kind === 'location_sample' ? values.slice(-ROUTE_ENTITY_LIMIT) : values.slice(0, ROUTE_ENTITY_LIMIT); }
function siteRef(value: unknown, known: Set<string>): string | null {
  if (!value || typeof value !== 'object') return null;
  const ref = value as Record<string, unknown>;
  return ref.kind === 'SITE' && known.has(str(ref.id)) ? str(ref.id) : null;
}
function sameInterval(point: RoutePoint, segments: Entity[]): Entity | undefined {
  const at = Date.parse(point.observedAt);
  return segments.find(segment => segment.data.shiftId === point.shiftId && segment.data.tripId === point.tripId && segment.data.employeeId === point.employeeId
    && segment.data.activity === 'TRAVELLING' && at >= dateMs(segment.data.startAt)
    && (!segment.data.endAt || at < dateMs(segment.data.endAt)));
}
/** Defense in depth for already authorized responses. This never grants a role or fetches coordinates. */
export function buildRouteMapModel(records: AuthorizedRouteRecords, selectedDay: string, nowMs = Date.now()): RouteMapModel {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(selectedDay) && berlinDay(`${selectedDay}T12:00:00Z`) === selectedDay ? selectedDay : berlinDay(now);
  const geofences = rows(records, 'geofence');
  const sites: RouteSite[] = rows(records, 'site').map(site => {
    const g = geofences.find(g => g.id === site.data.geofenceVersionId && g.data.siteId === site.id);
    const direct = validRoutePosition(site.data.latitude, site.data.longitude);
    const position = direct ?? (g ? validRoutePosition(g.data.latitude, g.data.longitude) : null);
    return { id: site.id, name: str(site.data.name) || site.id, code: str(site.data.code), address: str(site.data.address), active: site.data.active !== false,
      position, positionSource: direct ? 'SITE_COORDINATES' : position && g ? `GEOFENCE:${g.id}` : null };
  });
  const knownSites = new Set(sites.map(site => site.id));
  const tripRows = rows(records, 'trip').filter(trip => Number.isFinite(dateMs(trip.data.startAt)) && (!trip.data.endAt || dateMs(trip.data.endAt) >= dateMs(trip.data.startAt)));
  const byTrip = new Map(tripRows.map(trip => [trip.id, trip]));
  const segments = rows(records, 'time_segment');
  const policies = new Map(rows(records, 'tracking_policy').map(policy => [policy.id, policy]));
  const allPoints: RoutePoint[] = [];
  const seenIds = new Set<string>();
  let omittedPoints = 0;
  for (const sample of rows(records, 'location_sample')) {
    if (seenIds.has(sample.id)) { omittedPoints++; continue; }
    seenIds.add(sample.id);
    const d = sample.data, trip = byTrip.get(str(d.tripId)), at = dateMs(d.observedAt), expiry = dateMs(d.expiresAt);
    const position = validRoutePosition(d.latitude, d.longitude);
    if (!position || !trip || d.mode !== 'BUSINESS_TRAVEL' || !Number.isFinite(at) || at > now || !Number.isFinite(expiry) || now >= expiry
      || !(typeof d.accuracyM === 'number' && Number.isFinite(d.accuracyM) && d.accuracyM > 0 && d.accuracyM <= 100000)
      || d.employeeId !== trip.data.employeeId || d.shiftId !== trip.data.shiftId || at < dateMs(trip.data.startAt)
      || (trip.data.endAt && at >= dateMs(trip.data.endAt)) || !Number.isSafeInteger(d.sequenceNumber) || d.sequenceNumber < 0
      || !str(d.deviceId) || !str(d.policyVersionId) || !Array.isArray(d.siteIds) || !d.siteIds.length || d.siteIds.some((id: unknown) => !str(id))) {
      omittedPoints++; continue;
    }
    const policy = policies.get(str(d.policyVersionId));
    if (policy && (!policy.data.allowBusinessRoute || !Number.isFinite(dateMs(policy.data.approvedAt)) || at < dateMs(policy.data.approvedAt)
      || at >= dateMs(policy.data.expiresAt) || (policy.data.disabledAt && at >= dateMs(policy.data.disabledAt)) || (policy.data.supersededAt && at >= dateMs(policy.data.supersededAt)))) { omittedPoints++; continue; }
    const point: RoutePoint = { id: sample.id, ...position, tripId: trip.id, shiftId: str(d.shiftId), employeeId: str(d.employeeId), deviceId: str(d.deviceId),
      sequenceNumber: d.sequenceNumber, observedAt: new Date(at).toISOString(), receivedAt: instant(d.receivedAt), expiresAt: new Date(expiry).toISOString(),
      accuracyM: d.accuracyM, quality: d.quality === 'UNCERTAIN' || d.accuracyM > 100 ? 'UNCERTAIN' : 'USABLE',
      siteIds: [...new Set<string>(d.siteIds)], source: str(d.source) || 'UNKNOWN', policyVersionId: str(d.policyVersionId), isEvidenceOfPerson: false };
    const shiftSegments = segments.filter(segment => segment.data.shiftId === point.shiftId);
    if (shiftSegments.length && !sameInterval(point, shiftSegments)) { omittedPoints++; continue; }
    allPoints.push(point);
  }
  allPoints.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || a.sequenceNumber - b.sequenceNumber || a.id.localeCompare(b.id));
  const today = berlinDay(now), days = [...new Set([today, ...allPoints.map(p => berlinDay(p.observedAt)), ...tripRows.map(t => berlinDay(t.data.startAt))])].sort().reverse();
  const dayPoints = allPoints.filter(point => berlinDay(point.observedAt) === day);
  // Keep the latest bounded current response; never archive points in browser storage.
  const points = dayPoints.slice(-ROUTE_POINT_LIMIT), limited = dayPoints.length > points.length || (records.location_sample?.length ?? 0) > ROUTE_ENTITY_LIMIT;
  const trips: RouteTrip[] = tripRows.filter(trip => berlinDay(trip.data.startAt) === day || points.some(point => point.tripId === trip.id)
    || (berlinDay(trip.data.startAt) < day && (!trip.data.endAt ? day <= today : berlinDay(trip.data.endAt) >= day))).map(trip => {
      const tripPoints = points.filter(point => point.tripId === trip.id);
      const intervals = segments.filter(segment => segment.data.tripId === trip.id && segment.data.shiftId === trip.data.shiftId && Number.isFinite(dateMs(segment.data.startAt)))
        .map(segment => ({ id: segment.id, activity: str(segment.data.activity) || 'UNKNOWN', startAt: instant(segment.data.startAt)!, endAt: instant(segment.data.endAt), siteId: knownSites.has(str(segment.data.siteId)) ? str(segment.data.siteId) : null }))
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
      let gapCount = 0;
      for (let i = 1; i < tripPoints.length; i++) {
        const previous = tripPoints[i - 1]!, current = tripPoints[i]!;
        if (current.deviceId !== previous.deviceId || current.sequenceNumber !== previous.sequenceNumber + 1 || Date.parse(current.observedAt) - Date.parse(previous.observedAt) > 120000
          || current.quality === 'UNCERTAIN' || previous.quality === 'UNCERTAIN' || (segments.length && sameInterval(current, segments)?.id !== sameInterval(previous, segments)?.id)) gapCount++;
      }
      return { id: trip.id, employeeId: str(trip.data.employeeId), shiftId: str(trip.data.shiftId), startAt: instant(trip.data.startAt)!, endAt: instant(trip.data.endAt),
        state: str(trip.data.state) || 'UNKNOWN', approvalState: str(trip.data.approvalState) || 'UNKNOWN', purpose: str(trip.data.purpose), routeAvailability: str(trip.data.routeAvailability) || 'UNKNOWN',
        originSiteId: siteRef(trip.data.origin, knownSites), destinationSiteId: siteRef(trip.data.destination, knownSites), points: tripPoints, intervals, gapCount };
    }).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id));
  const presences = rows(records, 'presence');
  const statuses = rows(records, 'shift').filter(shift => shift.data.state === 'ACTIVE' || berlinDay(shift.data.startAt) === day).map(shift => {
    const presence = presences.filter(p => p.data.shiftId === shift.id && p.data.employeeId === shift.data.employeeId)
      .sort((a, b) => dateMs(b.data.lastObservedAt) - dateMs(a.data.lastObservedAt))[0];
    const session = rows(records, 'tracking_session').filter(s => s.data.shiftId === shift.id && s.data.employeeId === shift.data.employeeId)
      .sort((a, b) => dateMs(b.updatedAt) - dateMs(a.updatedAt))[0];
    const observedAt = instant(presence?.data.lastObservedAt), stale = !observedAt || now - Date.parse(observedAt) > 300000 || Date.parse(observedAt) > now;
    const activity = str(shift.data.activity) || 'UNKNOWN', ended = shift.data.state !== 'ACTIVE';
    return { shiftId: shift.id, employeeId: str(shift.data.employeeId), siteId: knownSites.has(str(shift.data.siteId)) ? str(shift.data.siteId) : null,
      activity, shiftState: str(shift.data.state) || 'UNKNOWN', trackerState: ended ? 'OFFLINE' : stale ? (observedAt ? 'STALE' : 'UNKNOWN') : str(presence?.data.trackerState) || 'UNKNOWN',
      presence: stale || presence?.data.trackerState !== 'ONLINE' ? 'UNKNOWN' : str(presence?.data.state) || 'UNKNOWN', observedAt,
      collectionMode: ended ? 'OFF' : activity === 'ON_BREAK' ? 'PRIVATE_BREAK' : session && dateMs(session.data.expiresAt) > now && !session.data.revokedAt
        && ['OFF', 'SITE_PRESENCE', 'BUSINESS_TRAVEL', 'PRIVATE_BREAK'].includes(session.data.mode) ? session.data.mode : 'UNKNOWN' };
  });
  const nextExpiry = points.map(point => Date.parse(point.expiresAt)).sort((a, b) => a - b)[0];
  return { day, points, trips, sites, statuses, days, omittedPoints: omittedPoints + dayPoints.length - points.length, limited, nextExpiryAt: nextExpiry ? new Date(nextExpiry).toISOString() : null };
}
export interface PlotPoint { x: number; y: number; }
/** A local geographic sketch. No geocoding, routing provider or reconstructed path. */
export function routeProjection(positions: RoutePosition[]): (position: RoutePosition) => PlotPoint {
  if (!positions.length) return () => ({ x: 500, y: 300 });
  const anchor = positions[0]!.longitude;
  const unwrap = (longitude: number) => anchor + ((longitude - anchor + 540) % 360) - 180;
  const longitudes = positions.map(p => unwrap(p.longitude)), latitudes = positions.map(p => p.latitude);
  const centerLatitude = (Math.max(...latitudes) + Math.min(...latitudes)) / 2;
  const cos = Math.max(0.1, Math.cos(centerLatitude * Math.PI / 180));
  const minX = Math.min(...longitudes) * cos, maxX = Math.max(...longitudes) * cos;
  const minY = Math.min(...latitudes), maxY = Math.max(...latitudes);
  const span = Math.max((maxX - minX) / 880, (maxY - minY) / 480, 0.000005);
  const centerX = (maxX + minX) / 2, centerY = (maxY + minY) / 2;
  return position => ({ x: 500 + (unwrap(position.longitude) * cos - centerX) / span, y: 300 - (position.latitude - centerY) / span });
}
