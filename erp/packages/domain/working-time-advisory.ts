import { createHash } from 'node:crypto';
import { z } from 'zod';
import { assert, DomainError, id, type CommandContext, type CommandRegistry, type Data, type Entity } from './core.ts';

const HOUR = 3600, DAY = 86_400_000;
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const parsed = Date.parse(value + 'T00:00:00Z'); return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value; });
export const workingTimePolicySchema = z.object({
  travel: z.enum(['COUNT', 'EXCLUDE', 'UNRESOLVED']).default('UNRESOLVED'),
  federalState: z.enum(['BW','BY','BE','BB','HB','HH','HE','MV','NI','NW','RP','SL','SN','ST','SH','TH']).optional(),
  holidayDates: z.array(dateOnly).max(400).default([]),
  holidayCoverageFrom: dateOnly.optional(), holidayCoverageTo: dateOnly.optional()
}).strict().refine(value => (!value.holidayCoverageFrom && !value.holidayCoverageTo) || !!value.holidayCoverageFrom && !!value.holidayCoverageTo && value.holidayCoverageFrom <= value.holidayCoverageTo);
export type WorkingTimePolicy = z.infer<typeof workingTimePolicySchema>;
export interface AdvisorySource { kind: string; id: string; version: number }
export interface AdvisorySegment { id: string; shiftId: string; activity: string; startAt: string; endAt: string | null; source: AdvisorySource }
export interface AdvisoryShift { id: string; startAt: string; endAt: string | null; source: AdvisorySource }
export interface AdvisoryCoverage { startAt: string; endAt: string; source: AdvisorySource }
export interface WorkingTimeAdvisoryInput {
  employeeId: string; now: string; focusStart: string; focusEnd: string;
  segments: AdvisorySegment[]; shifts: AdvisoryShift[]; coverage?: AdvisoryCoverage[];
  policy?: WorkingTimePolicy; policySource?: AdvisorySource; incompleteHistory?: boolean; additionalSources?: AdvisorySource[];
}
const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function berlinParts(ms: number) { return Object.fromEntries(formatter.formatToParts(ms).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)])) as Record<string, number>; }
function dateKey(ms: number) { const p = berlinParts(ms); return String(p.year).padStart(4, '0') + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0'); }
function midnight(date: string) {
  const [year, month, day] = date.split('-').map(Number), target = Date.UTC(year!, month! - 1, day!);
  let result = target;
  for (let attempt = 0; attempt < 3; attempt++) { const p = berlinParts(result); result += target - Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!); }
  return result;
}
function addDays(date: string, days: number) { return new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10); }
function subtractMonths(date: string, months: number) {
  const [year, month, day] = date.split('-').map(Number), first = new Date(Date.UTC(year!, month! - 1 - months, 1));
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day!, new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()))).toISOString().slice(0, 10);
}
function time(value: string) { const result = Date.parse(value); assert(Number.isFinite(result), 'VALIDATION_ERROR', { reason: 'INVALID_ADVISORY_TIMESTAMP' }); return result; }
function seconds(start: number, end: number, from: number, until: number) { return Math.max(0, Math.floor((Math.min(end, until) - Math.max(start, from)) / 1000)); }
function canonical(value: unknown): string { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; const data = value as Data; return '{' + Object.keys(data).sort().filter(key => data[key] !== undefined).map(key => JSON.stringify(key) + ':' + canonical(data[key])).join(',') + '}'; }
type Interval = AdvisorySegment & { start: number; end: number; classification: 'WORK' | 'BREAK' | 'EXCLUDED' | 'UNRESOLVED'; open: boolean };

/** Recorded facts only. This is a general-regime advisory, never a legal certificate,
 * payroll policy, disciplinary decision, or permission to activate tracking. */
export function evaluateWorkingTimeAdvisory(input: WorkingTimeAdvisoryInput) {
  const now = time(input.now), focusStart = time(input.focusStart), focusEnd = time(input.focusEnd);
  assert(focusStart <= focusEnd && focusEnd <= now && focusEnd - focusStart <= 370 * DAY && input.segments.length <= 10_000 && input.shifts.length <= 1000 && (input.coverage?.length ?? 0) <= 1000 && (input.additionalSources?.length ?? 0) <= 1000, 'VALIDATION_ERROR', { reason: 'ADVISORY_BOUND' });
  const policy = workingTimePolicySchema.parse(input.policy ?? {}), warnings: Data[] = [];
  let warningCount = 0;
  const warn = (code: string, details: Data = {}) => { warningCount++; if (warnings.length < 100) warnings.push({ code, status: 'REQUIRES_LEGAL_REVIEW', ...details }); };
  const intervals: Interval[] = input.segments.map(segment => {
    const start = time(segment.startAt), rawEnd = segment.endAt === null ? now : time(segment.endAt), end = Math.min(rawEnd, now);
    assert(start <= end && rawEnd >= start, 'INVALID_STATE', { reason: 'INVALID_RECORDED_INTERVAL', segmentId: segment.id });
    const classification: Interval['classification'] = ['WORKING', 'SERVICE_TASK', 'WAITING_WORK'].includes(segment.activity) ? 'WORK'
      : segment.activity === 'ON_BREAK' ? 'BREAK'
      : segment.activity === 'TRAVELLING' ? policy.travel === 'COUNT' ? 'WORK' : policy.travel === 'EXCLUDE' ? 'EXCLUDED' : 'UNRESOLVED'
      : 'UNRESOLVED';
    return { ...segment, start, end, classification, open: segment.endAt === null };
  }).filter(segment => segment.end > segment.start).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  for (let index = 1; index < intervals.length; index++) assert(intervals[index]!.start >= intervals[index - 1]!.end, 'INVALID_STATE', { reason: 'ADVISORY_TIMELINE_OVERLAP' });
  // Adjacent recorded break segments form one uninterrupted physical break.
  const breaks: { start: number; end: number; ids: string[]; shiftId: string }[] = [];
  for (const segment of intervals.filter(segment => segment.classification === 'BREAK')) {
    const previous = breaks.at(-1);
    if (previous?.end === segment.start && previous.shiftId === segment.shiftId) { previous.end = segment.end; previous.ids.push(segment.id); }
    else breaks.push({ start: segment.start, end: segment.end, ids: [segment.id], shiftId: segment.shiftId });
  }
  const qualifyingBreaks = breaks.filter(segment => (segment.end - segment.start) / 1000 >= 900);
  const shortBreaks = breaks.filter(segment => (segment.end - segment.start) / 1000 < 900 && segment.end > focusStart && segment.start < focusEnd);
  if (shortBreaks.length) warn('BREAK_PART_UNDER_15_MINUTES', { count: shortBreaks.length });
  if (!input.policySource) warn('GENERAL_REGIME_POLICY_REQUIRES_APPROVAL');
  if (input.incompleteHistory) warn('HISTORY_SCOPE_OR_RECORDING_INCOMPLETE');
  const focused = intervals.filter(segment => segment.end > focusStart && segment.start < focusEnd);
  if (focused.some(segment => segment.open)) warn('OPEN_SEGMENT_PROVISIONAL');
  if (focused.some(segment => segment.classification === 'UNRESOLVED')) warn('ACTIVITY_CLASSIFICATION_UNRESOLVED', { activities: [...new Set(focused.filter(segment => segment.classification === 'UNRESOLVED').map(segment => segment.activity))] });
  const dutyDays: Data[] = [];
  // Conservative individual 24-hour windows anchored at actual shift starts;
  // crossing local midnight never resets a recorded duty interval.
  for (const shift of [...input.shifts].sort((a, b) => time(a.startAt) - time(b.startAt))) {
    const start = time(shift.startAt), end = Math.min(start + DAY, now);
    if (end <= focusStart || start >= focusEnd) continue;
    const workSeconds = intervals.filter(segment => segment.classification === 'WORK').reduce((sum, segment) => sum + seconds(segment.start, segment.end, start, end), 0);
    const unresolvedSeconds = intervals.filter(segment => segment.classification === 'UNRESOLVED').reduce((sum, segment) => sum + seconds(segment.start, segment.end, start, end), 0);
    const breakSeconds = qualifyingBreaks.reduce((sum, segment) => sum + seconds(segment.start, segment.end, start, end), 0);
    const requiredBreakSeconds = workSeconds > 9 * HOUR ? 2700 : workSeconds > 6 * HOUR ? 1800 : 0;
    const possibleRequiredBreakSeconds = workSeconds + unresolvedSeconds > 9 * HOUR ? 2700 : workSeconds + unresolvedSeconds > 6 * HOUR ? 1800 : 0;
    const duty = { shiftId: shift.id, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), workSeconds, unresolvedSeconds, qualifyingBreakSeconds: breakSeconds, requiredBreakSeconds, possibleRequiredBreakSeconds };
    dutyDays.push(duty);
    if (workSeconds > 10 * HOUR) warn('DAILY_WORK_OVER_10_HOURS', { shiftId: shift.id, recordedWorkSeconds: workSeconds });
    else if (workSeconds > 8 * HOUR) warn('DAILY_WORK_OVER_8_HOURS_REQUIRES_AVERAGING', { shiftId: shift.id, recordedWorkSeconds: workSeconds });
    if (unresolvedSeconds && workSeconds + unresolvedSeconds > 10 * HOUR) warn('POSSIBLE_DAILY_WORK_OVER_10_HOURS', { shiftId: shift.id, potentialWorkSeconds: workSeconds + unresolvedSeconds });
    if (breakSeconds < requiredBreakSeconds) warn('MANDATORY_BREAK_SHORTFALL', { shiftId: shift.id, requiredSeconds: requiredBreakSeconds, recordedQualifyingSeconds: breakSeconds });
    else if (breakSeconds < possibleRequiredBreakSeconds) warn('POSSIBLE_MANDATORY_BREAK_SHORTFALL', { shiftId: shift.id, requiredSeconds: possibleRequiredBreakSeconds, recordedQualifyingSeconds: breakSeconds });
  }
  for (const shift of input.shifts) {
    const start = time(shift.startAt), end = Math.min(shift.endAt === null ? now : time(shift.endAt), now);
    if (end <= focusStart || start >= focusEnd) continue;
    let continuous = 0, possibleContinuous = 0, maximum = 0, possibleMaximum = 0;
    const rows = intervals.filter(segment => segment.shiftId === shift.id);
    for (const segment of rows) {
      if (qualifyingBreaks.some(part => part.start <= segment.start && part.end >= segment.end)) { continuous = 0; possibleContinuous = 0; continue; }
      if (segment.classification === 'WORK') { continuous += (segment.end - segment.start) / 1000; possibleContinuous += (segment.end - segment.start) / 1000; }
      else if (segment.classification === 'UNRESOLVED') possibleContinuous += (segment.end - segment.start) / 1000;
      maximum = Math.max(maximum, continuous); possibleMaximum = Math.max(possibleMaximum, possibleContinuous);
    }
    if (maximum > 6 * HOUR) warn('CONTINUOUS_WORK_OVER_6_HOURS', { shiftId: shift.id, recordedContinuousSeconds: maximum });
    else if (possibleMaximum > 6 * HOUR) warn('POSSIBLE_CONTINUOUS_WORK_OVER_6_HOURS', { shiftId: shift.id, potentialContinuousSeconds: possibleMaximum });
  }
  // Ending/restarting a shift cannot reset a physically contiguous timeline.
  // Short pauses and excluded travel are not qualifying statutory breaks.
  // Unknown activities retain a possible warning; unrecorded gaps never become
  // an invented qualifying break or a certified compliant result.
  let contiguousStart = 0, contiguousEnd = 0, contiguousWork = 0, contiguousPossible = 0, contiguousUnresolved = false, contiguousShiftIds = new Set<string>();
  const finishContiguous = () => {
    if (contiguousShiftIds.size <= 1 || contiguousEnd <= focusStart || contiguousStart >= focusEnd) return;
    if (!contiguousUnresolved && contiguousWork > 6 * HOUR)
      warn('CONTINUOUS_WORK_ACROSS_SHIFT_BOUNDARY_OVER_6_HOURS', { shiftIds: [...contiguousShiftIds].slice(0, 20), recordedContinuousSeconds: contiguousWork });
    else if (contiguousPossible > 6 * HOUR)
      warn('POSSIBLE_CONTINUOUS_WORK_OVER_6_HOURS', { shiftIds: [...contiguousShiftIds].slice(0, 20), potentialContinuousSeconds: contiguousPossible });
  };
  const resetContiguous = (start: number) => { contiguousStart = start; contiguousEnd = start; contiguousWork = 0; contiguousPossible = 0; contiguousUnresolved = false; contiguousShiftIds = new Set(); };
  for (const segment of intervals) {
    if (segment.start !== contiguousEnd) { finishContiguous(); resetContiguous(segment.start); }
    if (qualifyingBreaks.some(part => part.start <= segment.start && part.end >= segment.end)) { finishContiguous(); resetContiguous(segment.end); continue; }
    contiguousEnd = segment.end;
    if (segment.classification === 'WORK') { contiguousWork += (segment.end - segment.start) / 1000; contiguousPossible += (segment.end - segment.start) / 1000; contiguousShiftIds.add(segment.shiftId); }
    else if (segment.classification === 'UNRESOLVED') { contiguousUnresolved = true; contiguousPossible += (segment.end - segment.start) / 1000; contiguousShiftIds.add(segment.shiftId); }
  }
  finishContiguous();
  const shifts = [...input.shifts].sort((a, b) => time(a.startAt) - time(b.startAt)), rests: Data[] = [];
  if (!shifts.length || time(shifts[0]!.startAt) >= focusStart) warn('REST_HISTORY_UNAVAILABLE');
  for (let index = 1; index < shifts.length; index++) {
    const previous = shifts[index - 1]!, next = shifts[index]!, nextStart = time(next.startAt);
    if (nextStart < focusStart || nextStart >= focusEnd) continue;
    if (!previous.endAt) { warn('PREVIOUS_SHIFT_END_UNRESOLVED', { shiftId: next.id }); continue; }
    const restSeconds = Math.floor((nextStart - time(previous.endAt)) / 1000);
    assert(restSeconds >= 0, 'INVALID_STATE', { reason: 'ADVISORY_SHIFT_OVERLAP' });
    rests.push({ previousShiftId: previous.id, shiftId: next.id, restSeconds });
    if (restSeconds < 11 * HOUR) warn('REST_UNDER_11_HOURS', { shiftId: next.id, recordedRestSeconds: restSeconds });
  }
  const dates = new Set<string>();
  for (const segment of focused.filter(segment => ['WORK', 'UNRESOLVED'].includes(segment.classification))) {
    const start = Math.max(segment.start, focusStart), end = Math.min(segment.end,focusEnd);
    for (let date = dateKey(start); midnight(date) < end; date = addDays(date, 1)) dates.add(date);
    if (berlinParts(start).hour! < 6 || berlinParts(end - 1).hour! >= 23 || end - start >= DAY || dateKey(start) !== dateKey(end - 1)) warn('NIGHT_WORK_APPLICABILITY_REVIEW', { shiftId: segment.shiftId });
  }
  if ([...dates].some(date => new Date(date + 'T12:00:00Z').getUTCDay() === 0)) warn('SUNDAY_WORK_APPLICABILITY_REVIEW');
  const calendarComplete = !!policy.federalState && !!policy.holidayCoverageFrom && !!policy.holidayCoverageTo && [...dates].every(date => date >= policy.holidayCoverageFrom! && date <= policy.holidayCoverageTo!);
  if (!calendarComplete) warn('FEDERAL_STATE_HOLIDAY_CALENDAR_INCOMPLETE');
  if ([...dates].some(date => policy.holidayDates.includes(date))) warn('PUBLIC_HOLIDAY_WORK_APPLICABILITY_REVIEW', { federalState: policy.federalState ?? null });
  const windowEndDate = dateKey(now), windowEnd = midnight(windowEndDate);
  const averaging = [ ['24_WEEKS', addDays(windowEndDate, -168)], ['6_CALENDAR_MONTHS', subtractMonths(windowEndDate, 6)] ].map(([kind, startDate]) => {
    const windowStart = midnight(startDate!), relevant = intervals.filter(segment => segment.end > windowStart && segment.start < windowEnd);
    const covers = (input.coverage ?? []).map(part => ({ start: time(part.startAt), end: time(part.endAt) })).sort((a, b) => a.start - b.start);
    let cursor = windowStart;
    for (const part of covers) { if (part.start > cursor) break; if (part.end > cursor) cursor = part.end; }
    const complete = cursor >= windowEnd && !input.incompleteHistory && relevant.every(segment => segment.classification !== 'UNRESOLVED' && !segment.open);
    let workingDays = 0;
    for (let date = startDate!; date < windowEndDate; date = addDays(date, 1)) if (new Date(date + 'T12:00:00Z').getUTCDay() !== 0) workingDays++;
    const workSeconds = relevant.filter(segment => segment.classification === 'WORK').reduce((sum, segment) => sum + seconds(segment.start, segment.end, windowStart, windowEnd), 0);
    return { kind, startAt: new Date(windowStart).toISOString(), endAt: new Date(windowEnd).toISOString(), coverage: complete ? 'APPROVED_RECORDED_PERIOD_COMPLETE' : 'INSUFFICIENT_HISTORY', workingDays, recordedWorkSeconds: workSeconds, averageSecondsPerWorkingDay: complete && workingDays ? workSeconds / workingDays : null, exceeds8Hours: complete ? workSeconds > workingDays * 8 * HOUR : null };
  });
  const averagingEvidence = averaging.some(window => window.coverage === 'APPROVED_RECORDED_PERIOD_COMPLETE' && window.exceeds8Hours === false) ? 'RECORDED_HISTORY_SUPPORTS_AVERAGE_ONLY' : averaging.every(window => window.coverage === 'INSUFFICIENT_HISTORY') ? 'INSUFFICIENT_HISTORY' : 'RECORDED_AVERAGE_OVER_8_HOURS';
  if (averagingEvidence === 'INSUFFICIENT_HISTORY') warn('AVERAGING_HISTORY_INCOMPLETE');
  else if (averagingEvidence === 'RECORDED_AVERAGE_OVER_8_HOURS') warn('AVERAGE_WORK_OVER_8_HOURS');
  warn('OTHER_EMPLOYERS_EXCEPTIONS_AND_NIGHT_RULES_REQUIRE_REVIEW');
  const sources = [...input.segments.map(part => part.source), ...input.shifts.map(part => part.source), ...(input.coverage ?? []).map(part => part.source), ...(input.additionalSources ?? []), ...(input.policySource ? [input.policySource] : [])];
  const uniqueSources = [...new Map(sources.map(source => [source.kind + ':' + source.id + ':' + source.version, source])).values()].sort((a, b) => (a.kind + ':' + a.id).localeCompare(b.kind + ':' + b.id));
  const snapshot = { employeeId: input.employeeId, evaluatedAt: new Date(now).toISOString(), focusStart: input.focusStart, focusEnd: input.focusEnd, policy, segments: input.segments, shifts: input.shifts, coverage: input.coverage ?? [], additionalSources: input.additionalSources ?? [], incompleteHistory: !!input.incompleteHistory };
  return {
    status: 'ADVISORY_ONLY_REQUIRES_LEGAL_REVIEW', employeeId: input.employeeId, evaluatedAt: snapshot.evaluatedAt,
    confidence: input.incompleteHistory || focused.some(segment => segment.classification === 'UNRESOLVED' || segment.open) ? 'INCOMPLETE_OR_PROVISIONAL' : !input.policySource || averagingEvidence === 'INSUFFICIENT_HISTORY' ? 'RECORDED_FACTS_WITH_INCOMPLETE_LEGAL_POLICY_OR_HISTORY' : 'RECORDED_FACTS_ONLY_NOT_CERTIFIED',
    policy: { basis: input.policySource ? 'RECORDED_APPROVED_GENERAL_REGIME_PROFILE' : 'UNAPPROVED_GENERAL_REGIME_DEFAULTS', approval: input.policySource ?? null, travel: policy.travel, federalState: policy.federalState ?? null },
    dailyBasis: 'CONSERVATIVE_INDIVIDUAL_24H_WINDOWS_ANCHORED_AT_SHIFT_START', dutyDays: dutyDays.slice(0,100), dutyDaysTruncated: dutyDays.length > 100, rests: rests.slice(0,100), restsTruncated: rests.length > 100, warnings, warningsTruncated: warningCount > warnings.length,
    averaging, averagingEvidence, averagingExcludesCurrentIncompleteDay: true, averagingDenominator: 'GENERAL_MON_SAT_DAYS; FEDERAL_HOLIDAYS_NIGHT_AND_EXCEPTIONS_REQUIRE_REVIEW', sources: uniqueSources.slice(0,500), sourcesTruncated: uniqueSources.length > 500,
    snapshotSha256: createHash('sha256').update(canonical(snapshot)).digest('hex'),
    effects: { payrollChanged: false, actualIntervalsChanged: false, automaticDiscipline: false, gpsActivated: false },
  };
}

type EffectiveTimesheet = (context: CommandContext, sheet: Entity) => Promise<Data[]>;
/** Reads current scoped sources inside the existing server transaction. No policy
 * is fabricated and no new legal/business aggregate is written by these reads. */
export function createWorkingTimeAdvisoryCommands(effectiveTimesheet: EffectiveTimesheet): CommandRegistry {
  async function read(ctx: CommandContext, kind: 'shift' | 'timesheet', entityId: string, approvalId?: string) {
    const focus = await ctx.tx.get(kind, entityId); assert(focus.companyId === ctx.actor.companyId, 'NOT_FOUND_SAFE'); ctx.requireOwn(focus.data.employeeId);
    const employeeId = focus.data.employeeId, now = time(ctx.now), from = kind === 'shift' ? time(focus.data.startAt) : time(focus.data.periodStart), until = Math.min(kind === 'shift' ? time(focus.data.endAt ?? ctx.now) : time(focus.data.periodEnd), now);
    assert(from <= until && until - from <= 370 * DAY, 'VALIDATION_ERROR', { reason: 'ADVISORY_FOCUS_BOUND' });
    const source = (row: Entity): AdvisorySource => ({ kind: row.kind, id: row.id, version: row.version });
    let policy: WorkingTimePolicy | undefined, policySource: AdvisorySource | undefined, incompleteHistory = false;
    if (approvalId) {
      const approval = await ctx.tx.get('legal_approval', approvalId), data = approval.data;
      assert(approval.companyId === ctx.actor.companyId && data.subject === 'WORKING_TIME' && data.status === 'APPROVED' && data.active !== false && data.evidenceReference && time(data.approvedAt) <= now && time(data.expiresAt) > now, 'NEEDS_APPROVAL', { reason: 'CURRENT_WORKING_TIME_APPROVAL_REQUIRED' });
      policy = workingTimePolicySchema.parse(data.scope?.workingTimeAdvisory); policySource = source(approval);
    }
    const cutoff = Math.min(from - DAY, midnight(subtractMonths(dateKey(now), 6)) - 12 * HOUR * 1000);
    const visible = (siteId: string | undefined) => { try { if (siteId) ctx.requireSite(siteId); return true; } catch (error) { if (error instanceof DomainError && error.code === 'ACCESS_DENIED') { incompleteHistory = true; return false; } throw error; } };
    const shifts: AdvisoryShift[] = [];
    for (const row of await ctx.tx.list('shift')) if (row.companyId === ctx.actor.companyId && row.data.employeeId === employeeId && time(row.data.startAt) < now && time(row.data.endAt ?? ctx.now) > cutoff) {
      if (row.id === focus.id && kind === 'shift' && row.data.siteId) ctx.requireSite(row.data.siteId);
      if (visible(row.data.siteId)) shifts.push({ id: row.id, startAt: row.data.startAt, endAt: row.data.endAt ?? null, source: source(row) });
    }
    const relevantSheets = (await ctx.tx.list('timesheet')).filter(row => row.companyId === ctx.actor.companyId && row.data.employeeId === employeeId && time(row.data.periodStart) < now && time(row.data.periodEnd) > cutoff && (['APPROVED','LOCKED'].includes(row.data.state) || kind === 'timesheet' && row.id === focus.id));
    const coverage: AdvisoryCoverage[] = [], snapshots: { id: string; start: number; end: number; rows: AdvisorySegment[] }[] = [];
    for (const sheet of relevantSheets) {
      const effective = await effectiveTimesheet(ctx, sheet);
      assert(effective.every(segment => segment.employeeId === undefined || segment.employeeId === employeeId), 'INVALID_STATE', { reason: 'SNAPSHOT_EMPLOYEE_MISMATCH' });
      if (kind === 'timesheet' && sheet.id === focus.id) for (const segment of effective) if (segment.siteId) ctx.requireSite(segment.siteId);
      if (!effective.every(segment => visible(segment.siteId))) continue;
      snapshots.push({ id: sheet.id, start: time(sheet.data.periodStart), end: time(sheet.data.periodEnd), rows: effective.map(segment => ({ id: segment.id, shiftId: segment.shiftId, activity: segment.activity, startAt: segment.startAt, endAt: segment.endAt, source: source(sheet) })) });
      if (['APPROVED','LOCKED'].includes(sheet.data.state) && sheet.data.approvedBy && sheet.data.approvedAt) coverage.push({ startAt: sheet.data.periodStart, endAt: sheet.data.periodEnd, source: source(sheet) });
    }
    const segments: AdvisorySegment[] = [];
    for (const row of await ctx.tx.list('time_segment')) if (row.companyId === ctx.actor.companyId && row.data.employeeId === employeeId && time(row.data.startAt) < now && time(row.data.endAt ?? ctx.now) > cutoff && visible(row.data.siteId)) {
      let fragments = [{ start: time(row.data.startAt), end: Math.min(time(row.data.endAt ?? ctx.now), now) }];
      for (const sheet of snapshots) {
        if (!sheet.rows.some(segment => segment.id === row.id)) { if (fragments.some(part => part.end > sheet.start && part.start < sheet.end)) incompleteHistory = true; continue; }
        fragments = fragments.flatMap(part => part.end <= sheet.start || part.start >= sheet.end ? [part] : [{ start: part.start, end: Math.min(part.end,sheet.start) }, { start: Math.max(part.start,sheet.end), end: part.end }].filter(fragment => fragment.start < fragment.end));
      }
      for (const fragment of fragments) segments.push({ id: row.id, shiftId: row.data.shiftId, activity: row.data.activity, startAt: new Date(fragment.start).toISOString(), endAt: row.data.endAt === null && fragment.end === now ? null : new Date(fragment.end).toISOString(), source: source(row) });
    }
    for (const sheet of snapshots) segments.push(...sheet.rows);
    if ((await ctx.tx.list('timesheet_correction')).some(row => row.companyId === ctx.actor.companyId && row.data.employeeId === employeeId && row.data.state === 'SUBMITTED')) incompleteHistory = true;
    if (segments.some(segment => !shifts.some(shift => shift.id === segment.shiftId))) incompleteHistory = true;
    const additionalSources = (await ctx.tx.list('timesheet_adjustment')).filter(row => row.companyId === ctx.actor.companyId && row.data.employeeId === employeeId && row.data.state === 'APPROVED' && snapshots.some(sheet => sheet.id === row.data.timesheetId)).map(source);
    return evaluateWorkingTimeAdvisory({ employeeId, now: ctx.now, focusStart: new Date(from).toISOString(), focusEnd: new Date(until).toISOString(), segments, shifts, coverage, policy, policySource, incompleteHistory, additionalSources });
  }
  return {
    'shift.working_time_advisory': { permission: 'shift.read', schema: z.object({ shiftId: id, policyApprovalId: id.optional() }).strict(), handler: (ctx,input) => read(ctx,'shift',input.shiftId,input.policyApprovalId) },
    'timesheet.working_time_advisory': { permission: 'timesheet.read', schema: z.object({ timesheetId: id, policyApprovalId: id.optional() }).strict(), handler: (ctx,input) => read(ctx,'timesheet',input.timesheetId,input.policyApprovalId) },
  };
}
