import { describe, expect, it } from 'vitest';
import { berlinCalendarDate, berlinCalendarInstant, planTaskCalendar, taskCalendarScheduleSchema, taskOccurrenceKey, type TaskCalendarInput } from '../packages/domain/task-calendar.ts';

const base: TaskCalendarInput = { templateId: 'template', recurrence: 'DAILY', active: true, activatedAt: '2026-01-01T00:00:00.000Z', schedule: { startsOn: '2026-01-01', localTime: '08:00' }, now: '2026-01-03T08:00:00.000Z', locationId: 'floor' };
const periods = (input: TaskCalendarInput) => planTaskCalendar(input).occurrences.map(o => o.scheduledPeriod);

describe('Europe/Berlin task-template calendar', () => {
  it('T-TASK-07 plans missed daily periods from the explicit anchor, never the worker restart date', () => {
    const p = planTaskCalendar(base);
    expect(p.occurrences.map(o => [o.scheduledPeriod, o.dueAt])).toEqual([['2026-01-01', '2026-01-01T07:00:00.000Z'], ['2026-01-02', '2026-01-02T07:00:00.000Z'], ['2026-01-03', '2026-01-03T07:00:00.000Z']]);
    expect(p).toMatchObject({ cursor: '2026-01-03', hasMore: false, evaluatedPeriods: 3, nextDueAt: '2026-01-04T07:00:00.000Z' });
  });
  it('suppresses inactive, manual, future activation and not-yet-due templates', () => {
    for (const patch of [{ active: false }, { recurrence: 'MANUAL' as const }, { activatedAt: '2026-01-04T00:00:00.000Z' }, { now: '2026-01-01T06:59:59.999Z' }]) expect(planTaskCalendar({ ...base, ...patch }).occurrences).toEqual([]);
    expect(periods({ ...base, schedule: { startsOn: '2027-01-01', localTime: '08:00' } })).toEqual([]);
  });
  it('does not infer activation/schedule from the recurrence enum', () => {
    expect(planTaskCalendar({ ...base, activatedAt: undefined })).toMatchObject({ occurrences: [], blockedReason: 'MISSING_SCHEDULE_OR_ACTIVATION' });
    expect(planTaskCalendar({ ...base, schedule: undefined })).toMatchObject({ occurrences: [], blockedReason: 'MISSING_SCHEDULE_OR_ACTIVATION' });
    expect(planTaskCalendar({ ...base, recurrence: 'MANUAL', schedule: undefined, activatedAt: undefined }).blockedReason).toBeUndefined();
  });
  it('activation excludes an earlier due time that same local day', () => {
    expect(periods({ ...base, activatedAt: '2026-01-02T08:00:00.000Z' })).toEqual(['2026-01-03']);
    expect(periods({ ...base, activatedAt: '2026-01-02T07:00:00.000Z' })).toEqual(['2026-01-02', '2026-01-03']);
  });
  it('weekly defaults to the anchor weekday and accepts an explicit Sunday boundary', () => {
    expect(periods({ ...base, recurrence: 'WEEKLY', now: '2026-01-20T09:00:00.000Z' })).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
    expect(periods({ ...base, recurrence: 'WEEKLY', schedule: { startsOn: '2026-01-01', localTime: '08:00', weeklyWeekday: 0 }, now: '2026-01-20T09:00:00.000Z' })).toEqual(['2026-01-04', '2026-01-11', '2026-01-18']);
  });
  it('monthly clamps31 to each month end without drifting the March anchor', () => {
    const p = { ...base, recurrence: 'MONTHLY' as const, schedule: { startsOn: '2026-01-31', localTime: '08:00' }, now: '2026-04-30T07:00:00.000Z' };
    expect(periods(p)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(periods({ ...p, activatedAt: '2024-01-01T00:00:00.000Z', schedule: { startsOn: '2024-01-31', localTime: '08:00' }, now: '2024-03-01T00:00:00.000Z' })).toEqual(['2024-01-31', '2024-02-29']);
  });
  it('monthly skips a candidate earlier than startsOn and keeps an explicit requested day', () => {
    expect(periods({ ...base, recurrence: 'MONTHLY', schedule: { startsOn: '2026-01-20', localTime: '08:00', monthlyDay: 10 }, now: '2026-03-11T00:00:00.000Z' })).toEqual(['2026-02-10', '2026-03-10']);
  });
  it('spring DST gap shifts02:30 by exactly one hour, with stable calendar-period identity', () => {
    expect(berlinCalendarInstant('2026-03-29', '02:30')).toBe('2026-03-29T01:30:00.000Z');
    const p = planTaskCalendar({ ...base, activatedAt: '2026-03-27T00:00:00.000Z', schedule: { startsOn: '2026-03-28', localTime: '02:30' }, now: '2026-03-30T01:00:00.000Z' });
    expect(p.occurrences.map(o => [o.scheduledPeriod, o.dueAt])).toEqual([['2026-03-28', '2026-03-28T01:30:00.000Z'], ['2026-03-29', '2026-03-29T01:30:00.000Z'], ['2026-03-30', '2026-03-30T00:30:00.000Z']]);
  });
  it('autumn overlap chooses the first02:30 and does not produce a second occurrence', () => {
    expect(berlinCalendarInstant('2026-10-25', '02:30')).toBe('2026-10-25T00:30:00.000Z');
    const p = { ...base, activatedAt: '2026-10-24T00:00:00.000Z', schedule: { startsOn: '2026-10-25', localTime: '02:30' }, now: '2026-10-25T01:30:00.000Z' };
    const first = planTaskCalendar(p); expect(first.occurrences).toHaveLength(1);
    expect(planTaskCalendar({ ...p, existingKeys: new Set(first.occurrences.map(o => o.occurrenceKey)) }).occurrences).toEqual([]);
  });
  it('uses Berlin local midnight/month/year boundaries rather than UTC dates', () => {
    expect(berlinCalendarDate('2026-12-31T23:30:00.000Z')).toBe('2027-01-01');
    expect(berlinCalendarDate('2026-07-01T22:30:00.000Z')).toBe('2026-07-02');
    expect(berlinCalendarInstant('2026-07-02', '00:00')).toBe('2026-07-01T22:00:00.000Z');
    expect(periods({ ...base, activatedAt: '2026-12-31T23:00:00.000Z', schedule: { startsOn: '2027-01-01', localTime: '00:00' }, now: '2026-12-31T23:00:00.000Z' })).toEqual(['2027-01-01']);
  });
  it('bounded oldest-first catchup resumes its cursor until all missed periods exist exactly once', () => {
    let input: TaskCalendarInput = { ...base, now: '2026-01-10T08:00:00.000Z', maxOccurrences: 3 };
    const existing = new Set<string>(), observed: string[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const plan = planTaskCalendar({ ...input, existingKeys: existing });
      expect(plan.occurrences.length).toBeLessThanOrEqual(3);
      for (const occurrence of plan.occurrences) { expect(existing.has(occurrence.occurrenceKey)).toBe(false); existing.add(occurrence.occurrenceKey); observed.push(occurrence.scheduledPeriod); }
      input = { ...input, afterPeriod: plan.cursor };
      if (!plan.hasMore) break;
    }
    expect(observed).toEqual(Array.from({ length: 10 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`));
    expect(planTaskCalendar({ ...input, existingKeys: existing }).occurrences).toEqual([]);
  });
  it('crash replay deduplicates committed keys even without advancing the cursor', () => {
    const first = planTaskCalendar({ ...base, maxOccurrences: 2 }), keys = new Set(first.occurrences.map(o => o.occurrenceKey));
    const restarted = planTaskCalendar({ ...base, existingKeys: keys, maxOccurrences: 2 });
    expect(restarted.occurrences.map(o => o.scheduledPeriod)).toEqual(['2026-01-03']); expect(keys.size).toBe(2);
  });
  it('bounds scanning through existing backlog separately from new occurrence count', () => {
    const keys = new Set(planTaskCalendar({ ...base, now: '2026-01-10T08:00:00.000Z' }).occurrences.map(o => o.occurrenceKey));
    const p = planTaskCalendar({ ...base, now: '2026-01-10T08:00:00.000Z', existingKeys: keys, maxScannedPeriods: 2 });
    expect(p).toMatchObject({ occurrences: [], cursor: '2026-01-02', evaluatedPeriods: 2, hasMore: true });
  });
  it('uses the lower caller/schedule catchup cap without modifying existing tasks or inputs', () => {
    const schedule = { startsOn: '2026-01-01', localTime: '08:00', catchupLimit: 1 }, input = { ...base, schedule, maxOccurrences: 10 };
    const before = structuredClone(input); expect(planTaskCalendar(input).occurrences).toHaveLength(1); expect(input).toEqual(before);
  });
  it('tuple keys distinguish templates, calendar periods, locations and null from a literal dash', () => {
    const keys = [taskOccurrenceKey('template', '2026-01-01'), taskOccurrenceKey('template', '2026-01-01', '-'), taskOccurrenceKey('template', '2026-01-01', 'floor'), taskOccurrenceKey('template', '2026-01-02', 'floor'), taskOccurrenceKey('other-template', '2026-01-01', 'floor')];
    expect(new Set(keys).size).toBe(keys.length);
    expect(taskOccurrenceKey('a', '2026-01-01', 'b:2026-01-02:c')).not.toBe(taskOccurrenceKey('a:2026-01-01:b', '2026-01-02', 'c'));
    expect(taskOccurrenceKey('template', '2026-01-01', null)).toBe(taskOccurrenceKey('template', '2026-01-01'));
  });
  it.each(['2026-02-29', '2026-04-31', '2026-00-10', '2026-13-01', '2026-1-01', '2026-01-00'])('rejects impossible calendar date%s instead of JavaScript rollover', date => {
    expect(() => taskCalendarScheduleSchema.parse({ startsOn: date, localTime: '08:00' })).toThrow();
  });
  it.each(['24:00', '08:60', '8:00', '-1:30', '02:30:00'])('rejects invalid local time%s', localTime => {
    expect(() => taskCalendarScheduleSchema.parse({ startsOn: '2026-01-01', localTime })).toThrow();
  });
  it('rejects timezone/cap/weekday/monthday misuse and invalid instants', () => {
    for (const patch of [{ timeZone: 'UTC' }, { weeklyWeekday: 7 }, { monthlyDay: 0 }, { monthlyDay: 32 }, { catchupLimit: 101 }]) expect(() => taskCalendarScheduleSchema.parse({ startsOn: '2026-01-01', localTime: '08:00', ...patch })).toThrow();
    expect(() => planTaskCalendar({ ...base, now: 'not-an-instant' })).toThrow(); expect(() => planTaskCalendar({ ...base, maxScannedPeriods: 10001 })).toThrow();
  });
});
