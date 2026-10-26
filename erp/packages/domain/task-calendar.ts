import { z } from 'zod';

const DAY = 86_400_000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function calendarDateValid(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return year! >= 1900 && year! <= 9999 && month! >= 1 && month! <= 12 && day! >= 1 &&
    new Date(Date.UTC(year!, month! - 1, day!)).toISOString().slice(0, 10) === value;
}
export const taskCalendarDateSchema = z.string().refine(calendarDateValid, 'Use an actual YYYY-MM-DD calendar date (1900–9999)');
export const taskCalendarScheduleSchema = z.object({
  startsOn: taskCalendarDateSchema,
  localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timeZone: z.literal('Europe/Berlin').default('Europe/Berlin'),
  weeklyWeekday: z.number().int().min(0).max(6).optional(), // Sunday=0; defaults to startsOn's weekday.
  monthlyDay: z.number().int().min(1).max(31).optional(), // Defaults to startsOn's day; clamps each month independently.
  catchupLimit: z.number().int().min(1).max(100).default(25),
}).strict();
export type TaskCalendarSchedule = z.input<typeof taskCalendarScheduleSchema>;
export type TaskCalendarRecurrence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MANUAL';
export interface TaskCalendarInput {
  templateId: string;
  recurrence: TaskCalendarRecurrence;
  active: boolean;
  activatedAt?: string;
  schedule?: TaskCalendarSchedule;
  now: string;
  locationId?: string | null;
  /** Last successfully inspected period. Persist only after every returned occurrence has committed. */
  afterPeriod?: string | null;
  existingKeys?: ReadonlySet<string>;
  maxOccurrences?: number;
  maxScannedPeriods?: number;
}
export interface PlannedTaskOccurrence { scheduledPeriod: string; dueAt: string; occurrenceKey: string; }
export interface TaskCalendarPlan {
  occurrences: PlannedTaskOccurrence[];
  cursor: string | null;
  hasMore: boolean;
  evaluatedPeriods: number;
  nextDueAt: string | null;
  blockedReason?: 'MISSING_SCHEDULE_OR_ACTIVATION';
}
const keyPart = z.string().min(1).max(100);
const instant = z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)), 'Invalid instant');
const optionsSchema = z.object({
  templateId: keyPart, recurrence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'MANUAL']), active: z.boolean(),
  activatedAt: instant.optional(), schedule: taskCalendarScheduleSchema.optional(), now: instant,
  locationId: keyPart.nullable().optional(), afterPeriod: taskCalendarDateSchema.nullable().optional(),
  maxOccurrences: z.number().int().min(1).max(100).optional(),
  maxScannedPeriods: z.number().int().min(1).max(10_000).default(1000),
}).strict();

/** Tuple encoding preserves exact template + calendar period + location, including ':' and a literal '-' ID. */
export function taskOccurrenceKey(templateId: string, scheduledPeriod: string, locationId?: string | null): string {
  return JSON.stringify([keyPart.parse(templateId), taskCalendarDateSchema.parse(scheduledPeriod), locationId == null ? null : keyPart.parse(locationId)]);
}
const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function localParts(ms: number) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(ms)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
}
function localWall(ms: number): number {
  const p = localParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}
const pad = (v: number) => String(v).padStart(2, '0');
function dateFromParts(year: number, month: number, day: number) {
  const value = `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
  return taskCalendarDateSchema.parse(value);
}
export function berlinCalendarDate(value: string): string {
  const p = localParts(Date.parse(instant.parse(value)));
  return dateFromParts(p.year, p.month, p.day);
}
/** DST compatible policy: overlap chooses the earlier instant; a gap shifts forward by the exact gap. */
export function berlinCalendarInstant(date: string, localTime: string): string {
  taskCalendarDateSchema.parse(date);
  z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).parse(localTime);
  const [year, month, day] = date.split('-').map(Number), [hour, minute] = localTime.split(':').map(Number);
  const desired = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const offsets = new Set([-DAY, 0, DAY].map(delta => localWall(desired + delta) - (desired + delta)));
  const candidates = [...offsets].map(offset => desired - offset);
  const exact = candidates.filter(candidate => localWall(candidate) === desired).sort((a, b) => a - b);
  if (exact.length) return new Date(exact[0]!).toISOString();
  const forward = candidates.map(ms => ({ ms, gap: localWall(ms) - desired })).filter(c => c.gap > 0 && c.gap <= 3 * 3_600_000).sort((a, b) => a.gap - b.gap || a.ms - b.ms);
  if (!forward.length) throw new Error('UNRESOLVABLE_BERLIN_CALENDAR_TIME');
  return new Date(forward[0]!.ms).toISOString();
}
function dateMillis(date: string) { return Date.parse(`${date}T00:00:00.000Z`); }
function plusDays(date: string, days: number) { return taskCalendarDateSchema.parse(new Date(dateMillis(date) + days * DAY).toISOString().slice(0, 10)); }
function monthDate(year: number, month: number, requestedDay: number) {
  return dateFromParts(year, month, Math.min(requestedDay, new Date(Date.UTC(year, month, 0)).getUTCDate()));
}
function followingMonth(date: string, requestedDay: number) {
  const [year, month] = date.split('-').map(Number);
  return monthDate(year! + (month === 12 ? 1 : 0), month === 12 ? 1 : month! + 1, requestedDay);
}

/** Pure bounded calendar planning. It never creates, edits or accepts work and never guesses an activation. */
export function planTaskCalendar(input: TaskCalendarInput): TaskCalendarPlan {
  const { existingKeys, ...raw } = input;
  const i = optionsSchema.parse(raw), empty: TaskCalendarPlan = { occurrences: [], cursor: i.afterPeriod ?? null, hasMore: false, evaluatedPeriods: 0, nextDueAt: null };
  if (!i.active || i.recurrence === 'MANUAL') return empty;
  if (!i.schedule || !i.activatedAt) return { ...empty, blockedReason: 'MISSING_SCHEDULE_OR_ACTIVATION' };
  if (Date.parse(i.activatedAt) > Date.parse(i.now)) return empty;
  const schedule = i.schedule, limit = Math.min(schedule.catchupLimit, i.maxOccurrences ?? 100);
  const monthlyDay = schedule.monthlyDay ?? Number(schedule.startsOn.slice(8, 10));
  const weeklyDay = schedule.weeklyWeekday ?? new Date(dateMillis(schedule.startsOn)).getUTCDay();
  const floorDate = [schedule.startsOn, berlinCalendarDate(i.activatedAt), ...(i.afterPeriod ? [plusDays(i.afterPeriod, 1)] : [])].sort().at(-1)!;
  let period: string;
  if (i.recurrence === 'WEEKLY') period = plusDays(floorDate, (weeklyDay - new Date(dateMillis(floorDate)).getUTCDay() + 7) % 7);
  else if (i.recurrence === 'MONTHLY') {
    const [year, month] = floorDate.split('-').map(Number);
    period = monthDate(year!, month!, monthlyDay);
    if (period < floorDate) period = followingMonth(period, monthlyDay);
  } else period = floorDate;
  const advance = (current: string) => i.recurrence === 'MONTHLY' ? followingMonth(current, monthlyDay) : plusDays(current, i.recurrence === 'WEEKLY' ? 7 : 1);
  let dueAt = berlinCalendarInstant(period, schedule.localTime);
  // At most one aligned candidate can precede activation on activation's calendar day.
  if (Date.parse(dueAt) < Date.parse(i.activatedAt)) { period = advance(period); dueAt = berlinCalendarInstant(period, schedule.localTime); }
  const result = { ...empty, occurrences: [] as PlannedTaskOccurrence[] };
  while (Date.parse(dueAt) <= Date.parse(i.now) && result.occurrences.length < limit && result.evaluatedPeriods < i.maxScannedPeriods) {
    const occurrenceKey = taskOccurrenceKey(i.templateId, period, i.locationId);
    result.evaluatedPeriods++;
    result.cursor = period;
    if (!existingKeys?.has(occurrenceKey)) result.occurrences.push({ scheduledPeriod: period, dueAt, occurrenceKey });
    period = advance(period);
    dueAt = berlinCalendarInstant(period, schedule.localTime);
  }
  result.hasMore = Date.parse(dueAt) <= Date.parse(i.now);
  result.nextDueAt = dueAt;
  return result;
}
