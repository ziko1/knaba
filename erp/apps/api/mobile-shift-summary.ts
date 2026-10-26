import { assert, timestamp, type Actor, type Entity, type Transaction } from '../../packages/domain/core.ts';

export interface MobileShiftSummary {
  shiftId: string; siteId: string; siteCode?: string; siteName?: string;
  state: 'ACTIVE'; activity: string; startedAt: string; asOf: string; activityStartedAt: string;
  siteSeconds: number; travelSeconds: number; breakSeconds: number; pendingSeconds: number;
  serviceSeconds: number; waitingSeconds: number; reviewRequired?: boolean;
}
export type MobileSummaryVisibility = (entity: Entity) => boolean | Promise<boolean>;
const knownActivities = new Set(['WORKING', 'TRAVELLING', 'ON_BREAK', 'AWAY_PENDING_REASON', 'SERVICE_TASK', 'WAITING_WORK']);
function instant(value: unknown): number {
  const parsed = timestamp.safeParse(value);
  assert(parsed.success, 'INVALID_STATE', { reason: 'MOBILE_SHIFT_INVALID_TIMESTAMP' });
  return Date.parse(parsed.data);
}
function text(value: unknown): string | undefined { return typeof value === 'string' && value.length > 0 ? value.slice(0, 250) : undefined; }

/** A minimal chronological summary, independent of GPS mode and payability.
 * The caller supplies a fresh permission-scoped actor from the same transaction.
 * All included sites must remain authorized; hidden chunks are never partial totals.
 */
export async function mobileShiftSummary(tx: Transaction, actor: Actor, device: Entity, nowISO: string, visible?: MobileSummaryVisibility): Promise<MobileShiftSummary | undefined> {
  const nowResult = timestamp.safeParse(nowISO);
  assert(nowResult.success, 'VALIDATION_ERROR', { reason: 'MOBILE_SHIFT_INVALID_AS_OF' });
  const now = Date.parse(nowResult.data);
  assert(!actor.roles.some(role => ['CLIENT','CUSTOMER','GUEST','EXTERNAL_BAULEITER'].includes(role)), 'ACCESS_DENIED');
  assert(actor.permissions.includes('shift.read'), 'ACCESS_DENIED');
  assert(device.kind === 'device' && device.companyId === actor.companyId && device.data.employeeId === actor.userId, 'ACCESS_DENIED');
  const currentDevice = await tx.get('device', device.id);
  assert(currentDevice.companyId === actor.companyId && currentDevice.data.employeeId === actor.userId && currentDevice.data.active === true && !currentDevice.data.revokedAt, 'NEEDS_REAUTH');
  if (currentDevice.data.tokenExpiresAt !== undefined) assert(instant(currentDevice.data.tokenExpiresAt) > now, 'NEEDS_REAUTH');
  const matches = (await tx.list('shift')).filter(row => row.companyId === actor.companyId && row.data.employeeId === actor.userId && row.data.state === 'ACTIVE' && row.data.deviceId === currentDevice.id);
  assert(matches.length <= 1, 'INVALID_STATE', { reason: 'MOBILE_SHIFT_AMBIGUOUS' });
  const shift = matches[0]; if (!shift) return undefined;
  const allowed = async (row: Entity) => {
    assert(row.companyId === actor.companyId && (!visible || await visible(row)), 'ACCESS_DENIED');
    const siteId = row.kind === 'site' ? row.id : row.data.siteId;
    assert(!siteId || actor.permissions.includes('scope.company') || actor.siteIds.includes(siteId), 'ACCESS_DENIED');
  };
  await allowed(shift);
  assert(typeof shift.data.siteId === 'string' && shift.data.siteId.length > 0 && typeof shift.data.activity === 'string' && shift.data.activity.length > 0 && shift.data.endAt === null, 'INVALID_STATE', { reason: 'MOBILE_SHIFT_INVALID_HEADER' });
  const started = instant(shift.data.startAt);
  assert(started <= now, 'INVALID_STATE', { reason: 'MOBILE_SHIFT_FUTURE' });
  const site = await tx.get('site', shift.data.siteId); await allowed(site);
  assert(site.data.active !== false, 'INVALID_STATE', { reason: 'MOBILE_SHIFT_SITE_ARCHIVED' });
  const segments = (await tx.list('time_segment')).filter(row => row.companyId === actor.companyId && row.data.shiftId === shift.id);
  assert(segments.length > 0 && segments.length <= 10_000, 'INVALID_STATE', { reason: 'MOBILE_SHIFT_SEGMENT_BOUND' });
  const rows = segments.map(row => ({ row, start: instant(row.data.startAt), end: row.data.endAt === null ? now : instant(row.data.endAt), open: row.data.endAt === null }))
    .sort((a, b) => a.start - b.start || Number(a.open) - Number(b.open) || a.end - b.end || a.row.id.localeCompare(b.row.id));
  const open = rows.filter(row => row.open);
  assert(open.length === 1 && rows.at(-1) === open[0] && open[0]!.row.id === shift.data.activeSegmentId && open[0]!.row.data.activity === shift.data.activity, 'INVALID_STATE', { reason: 'MOBILE_SHIFT_CURRENT_SEGMENT_MISMATCH' });
  const milliseconds = { siteSeconds: 0, travelSeconds: 0, breakSeconds: 0, pendingSeconds: 0, serviceSeconds: 0, waitingSeconds: 0 };
  let cursor = started, reviewRequired = false;
  for (const part of rows) {
    const row = part.row;
    assert(row.data.employeeId === actor.userId, 'ACCESS_DENIED'); await allowed(row);
    assert(typeof row.data.activity === 'string' && row.data.activity.length > 0, 'INVALID_STATE', { reason: 'MOBILE_SHIFT_INVALID_ACTIVITY' });
    assert(part.start === cursor && part.end >= part.start && part.end <= now, 'INVALID_STATE', { reason: 'MOBILE_SHIFT_GAP_OVERLAP_OR_FUTURE' });
    assert(row.data.activity !== 'WORKING' || typeof row.data.siteId === 'string' && row.data.siteId.length > 0, 'INVALID_STATE', { reason: 'MOBILE_SHIFT_WORK_SITE_MISSING' });
    const elapsed = part.end - part.start, activity = row.data.activity;
    const category = activity === 'WORKING' ? 'siteSeconds' : activity === 'TRAVELLING' ? 'travelSeconds' : activity === 'ON_BREAK' ? 'breakSeconds' : activity === 'SERVICE_TASK' ? 'serviceSeconds' : activity === 'WAITING_WORK' ? 'waitingSeconds' : 'pendingSeconds';
    milliseconds[category] += elapsed;
    if (!knownActivities.has(activity)) reviewRequired = true;
    cursor = part.end;
  }
  assert(cursor === now, 'INVALID_STATE', { reason: 'MOBILE_SHIFT_TIMELINE_INCOMPLETE' });
  const counters = Object.fromEntries(Object.entries(milliseconds).map(([key, value]) => { const seconds = Math.floor(value / 1000); assert(Number.isSafeInteger(seconds) && seconds >= 0, 'INVALID_STATE', { reason: 'MOBILE_SHIFT_COUNTER_OVERFLOW' }); return [key, seconds]; })) as Pick<MobileShiftSummary, 'siteSeconds' | 'travelSeconds' | 'breakSeconds' | 'pendingSeconds' | 'serviceSeconds' | 'waitingSeconds'>;
  return {
    shiftId: shift.id, siteId: site.id, ...(text(site.data.code) ? { siteCode: text(site.data.code) } : {}), ...(text(site.data.name) ? { siteName: text(site.data.name) } : {}),
    state: 'ACTIVE', activity: knownActivities.has(shift.data.activity) ? shift.data.activity : 'UNKNOWN', startedAt: new Date(started).toISOString(), asOf: new Date(now).toISOString(),
    activityStartedAt: new Date(open[0]!.start).toISOString(), ...counters, ...(reviewRequired ? { reviewRequired: true } : {})
  };
}
