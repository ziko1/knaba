import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Empty } from '../../../packages/ui/index';
import { AlertCircle, Clock3, ShieldCheck } from './icons';
import { ApiError, command, type Entity, type Session } from './api';
import { errorText } from './CommandForm';
import './WorkingTimeAdvisoryPanel.css';

export interface WorkingTimeAdvisoryPanelProps {
  session: Session;
  records: Entity[];
  t: (key: string) => string;
  language: string;
}
interface DutyWindow { shiftId: string; startAt: string; endAt: string; workSeconds: number; unresolvedSeconds: number; qualifyingBreakSeconds: number; requiredBreakSeconds: number }
interface AverageWindow { kind: string; startAt: string; endAt: string; coverage: string; averageSecondsPerWorkingDay: number | null; recordedWorkSeconds: number; exceeds8Hours: boolean | null }
interface AdvisoryResult {
  status: 'ADVISORY_ONLY_REQUIRES_LEGAL_REVIEW'; employeeId: string; evaluatedAt: string; confidence: string;
  policy: { basis: string; travel: string }; dutyDays: DutyWindow[]; rests: { restSeconds: number }[];
  warnings: Record<string, unknown>[]; averaging: AverageWindow[]; sources: { kind: string; id: string; version: number }[];
  warningsTruncated: boolean; dutyDaysTruncated: boolean; restsTruncated: boolean; sourcesTruncated: boolean;
}
const warningCodes = new Set([
  'BREAK_PART_UNDER_15_MINUTES', 'GENERAL_REGIME_POLICY_REQUIRES_APPROVAL', 'HISTORY_SCOPE_OR_RECORDING_INCOMPLETE',
  'OPEN_SEGMENT_PROVISIONAL', 'ACTIVITY_CLASSIFICATION_UNRESOLVED', 'DAILY_WORK_OVER_10_HOURS',
  'DAILY_WORK_OVER_8_HOURS_REQUIRES_AVERAGING', 'POSSIBLE_DAILY_WORK_OVER_10_HOURS', 'MANDATORY_BREAK_SHORTFALL',
  'POSSIBLE_MANDATORY_BREAK_SHORTFALL', 'CONTINUOUS_WORK_OVER_6_HOURS', 'POSSIBLE_CONTINUOUS_WORK_OVER_6_HOURS',
  'CONTINUOUS_WORK_ACROSS_SHIFT_BOUNDARY_OVER_6_HOURS', 'REST_HISTORY_UNAVAILABLE', 'PREVIOUS_SHIFT_END_UNRESOLVED',
  'REST_UNDER_11_HOURS', 'NIGHT_WORK_APPLICABILITY_REVIEW', 'SUNDAY_WORK_APPLICABILITY_REVIEW',
  'FEDERAL_STATE_HOLIDAY_CALENDAR_INCOMPLETE', 'PUBLIC_HOLIDAY_WORK_APPLICABILITY_REVIEW', 'AVERAGING_HISTORY_INCOMPLETE',
  'AVERAGE_WORK_OVER_8_HOURS', 'OTHER_EMPLOYERS_EXCEPTIONS_AND_NIGHT_RULES_REQUIRE_REVIEW'
]);
const locales: Record<string, string> = { DE: 'de-DE', UK: 'uk-UA', RU: 'ru-RU', PL: 'pl-PL', LT: 'lt-LT', EN: 'en-GB' };

/** Displays an authenticated server calculation. No facts or relaxed limits are submitted. */
export default function WorkingTimeAdvisoryPanel({ session, records, t, language }: WorkingTimeAdvisoryPanelProps) {
  const [selected, setSelected] = useState(''), [policyId, setPolicyId] = useState('');
  const [result, setResult] = useState<AdvisoryResult>(), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>();
  const [online, setOnline] = useState(() => navigator.onLine);
  const sequence = useRef(0);
  const locale = locales[language] || 'de-DE';
  const formatter = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' }), [locale]);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Berlin', dateStyle: 'short' }), [locale]);
  const date = (value: unknown, dateOnly = false) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? (dateOnly ? dateFormatter : formatter).format(new Date(value)) : '—';
  const duration = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
    const seconds = Math.round(value), hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), remainder = seconds % 60;
    const unit = (number: number, name: 'hour' | 'minute' | 'second') => new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short' }).format(number);
    return [hours ? unit(hours, 'hour') : '', minutes || !hours && !remainder ? unit(minutes, 'minute') : '', remainder ? unit(remainder, 'second') : ''].filter(Boolean).join(' ');
  };
  const hasPermission = (permission: string) => session.actor.permissions.includes(permission) || session.actor.permissions.includes('*');
  const subjects = records.filter(record => record.data.employeeId === session.actor.userId &&
    (record.kind === 'shift' && hasPermission('shift.read') || record.kind === 'timesheet' && hasPermission('timesheet.read')))
    .sort((a, b) => String(b.data.startAt || b.data.periodStart).localeCompare(String(a.data.startAt || a.data.periodStart)));
  const subjectSignature = subjects.map(row => `${row.kind}:${row.id}:${row.version}`).join('|');
  const actorSignature = JSON.stringify([session.actor.userId, session.actor.companyId, session.actor.permissions, session.actor.siteIds]);
  const policies = records.filter(record => record.kind === 'legal_approval' && record.data.subject === 'WORKING_TIME' &&
    record.data.status === 'APPROVED' && record.data.active !== false && Date.parse(record.data.approvedAt) <= Date.now() && Date.parse(record.data.expiresAt) > Date.now());
  const policySignature = policies.map(row => `${row.id}:${row.version}`).join('|');
  const subject = subjects.find(row => `${row.kind}:${row.id}` === selected);
  useEffect(() => {
    sequence.current++; setResult(undefined); setError(undefined); setBusy(false);
    setSelected(current => subjects.some(row => `${row.kind}:${row.id}` === current) ? current : subjects[0] ? `${subjects[0].kind}:${subjects[0].id}` : '');
  }, [subjectSignature, actorSignature]);
  useEffect(() => {
    sequence.current++; setResult(undefined); setError(undefined); setBusy(false);
    setPolicyId(current => policies.some(row => row.id === current) ? current : '');
  }, [policySignature]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { sequence.current++; window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  function changeSubject(value: string) { sequence.current++; setSelected(value); setResult(undefined); setError(undefined); setBusy(false); }
  function changePolicy(value: string) { sequence.current++; setPolicyId(value); setResult(undefined); setError(undefined); setBusy(false); }
  async function evaluate() {
    if (!subject || busy || !online) return;
    const current = ++sequence.current;
    setBusy(true); setError(undefined); setResult(undefined);
    try {
      const input = subject.kind === 'shift' ? { shiftId: subject.id } : { timesheetId: subject.id };
      const answer: unknown = await command(`${subject.kind}.working_time_advisory`, { ...input, ...(policyId ? { policyApprovalId: policyId } : {}) });
      if (current !== sequence.current) return;
      const value = answer as AdvisoryResult;
      if (!value || value.status !== 'ADVISORY_ONLY_REQUIRES_LEGAL_REVIEW' || value.employeeId !== session.actor.userId ||
        !Array.isArray(value.dutyDays) || !Array.isArray(value.rests) || !Array.isArray(value.warnings) || !Array.isArray(value.averaging) || !Array.isArray(value.sources) || !value.policy)
        throw new ApiError('REQUEST_FAILED', 502);
      setResult(value);
    } catch (failure) { if (current === sequence.current) setError(failure); }
    finally { if (current === sequence.current) setBusy(false); }
  }
  const warningDetail = (warning: Record<string, unknown>) => {
    const entries = [
      ['advisory_work', warning.recordedWorkSeconds ?? warning.recordedContinuousSeconds],
      ['advisory_unresolved', warning.potentialWorkSeconds ?? warning.potentialContinuousSeconds],
      ['advisory_requiredBreak', warning.requiredSeconds], ['advisory_breaks', warning.recordedQualifyingSeconds],
      ['advisory_rest', warning.recordedRestSeconds]
    ].filter(([, value]) => typeof value === 'number');
    return entries.map(([key, value]) => `${t(String(key))}: ${duration(value)}`).join(' · ');
  };
  return <section className="working-time-advisory" aria-label={t('advisory_title')}>
    <header className="working-time-heading"><Clock3 size={20}/><div><h2>{t('advisory_title')}</h2><p>{t('advisory_description')}</p></div></header>
    <p className="working-time-boundary" data-testid="working-time-legal-review"><ShieldCheck size={17}/>{t('advisory_legalReview')}</p>
    {!subjects.length ? <Empty title={t('advisory_empty')}/> : <>
      <div className="working-time-controls">
        <label><span>{t('advisory_subject')}</span><select name="working-time-subject" value={selected} onChange={event => changeSubject(event.target.value)}>
          <option value="" disabled>{t('advisory_select')}</option>
          {subjects.map(row => <option key={`${row.kind}:${row.id}`} value={`${row.kind}:${row.id}`}>{t(row.kind === 'shift' ? 'advisory_shift' : 'advisory_timesheet')} · {date(row.data.startAt || row.data.periodStart)}{row.kind === 'timesheet' ? ` — ${date(row.data.periodEnd)}` : ''}</option>)}
        </select></label>
        {policies.length > 0 && <label><span>{t('advisory_policyOptional')}</span><select name="working-time-policy" value={policyId} onChange={event => changePolicy(event.target.value)}><option value="">{t('advisory_noPolicyOption')}</option>{policies.map(policy => <option key={policy.id} value={policy.id}>{t('advisory_recordedPolicy')} · {date(policy.data.approvedAt, true)}</option>)}</select></label>}
        <Button type="button" data-testid="working-time-evaluate" disabled={!subject || busy || !online} onClick={() => { void evaluate(); }}>{busy ? t('advisory_loading') : error ? t('advisory_retry') : t('advisory_evaluate')}</Button>
      </div>
      {!online && <p className="working-time-notice" role="status">{t('OFFLINE')}</p>}
      {busy && <p className="working-time-notice" role="status">{t('advisory_loading')}</p>}
      {Boolean(error) && <div className="working-time-error" role="alert"><AlertCircle size={18}/><p>{t('advisory_error')} {errorText(error, t)}</p></div>}
      {result && <div className="working-time-result" data-testid="working-time-result" aria-live="polite">
        <div className="working-time-summary"><Badge tone="amber">{t('advisory_legalReview')}</Badge><p>{t('advisory_evaluated')}: <time>{date(result.evaluatedAt)}</time></p><p>{t('advisory_policy')}: {t(result.policy.basis === 'RECORDED_APPROVED_GENERAL_REGIME_PROFILE' ? 'advisory_recordedPolicy' : 'advisory_defaultPolicy')}</p><p>{t(result.confidence === 'RECORDED_FACTS_ONLY_NOT_CERTIFIED' ? 'advisory_recordedFacts' : 'advisory_incomplete')}</p></div>
        <section><h3>{t('advisory_daily')}</h3><ul className="working-time-days">{result.dutyDays.slice(0, 100).map((duty, index) => <li key={`${duty.shiftId}:${index}`}><p className="working-time-period">{date(duty.startAt)} — {date(duty.endAt)}</p><dl><dt>{t('advisory_work')}</dt><dd>{duration(duty.workSeconds)}</dd><dt>{t('advisory_unresolved')}</dt><dd>{duration(duty.unresolvedSeconds)}</dd><dt>{t('advisory_breaks')}</dt><dd>{duration(duty.qualifyingBreakSeconds)}</dd><dt>{t('advisory_requiredBreak')}</dt><dd>{duration(duty.requiredBreakSeconds)}</dd></dl></li>)}</ul></section>
        {result.rests.length > 0 && <section><h3>{t('advisory_rest')}</h3><ul className="working-time-rests">{result.rests.slice(0, 100).map((rest, index) => <li key={index}>{duration(rest.restSeconds)}</li>)}</ul></section>}
        <section><h3>{t('advisory_warnings')}</h3><ul className="working-time-warnings">{result.warnings.slice(0, 100).map((warning, index) => <li key={index}><AlertCircle size={17}/><div><p>{t(warningCodes.has(String(warning.code)) ? `advisory_warning_${warning.code}` : 'advisory_legalReview')}</p>{warningDetail(warning) && <small>{warningDetail(warning)}</small>}</div></li>)}</ul></section>
        <section><h3>{t('advisory_average')}</h3><p className="working-time-note">{t('advisory_denominator')} {t('advisory_excludedCurrentDay')}</p><div className="working-time-averages">{result.averaging.slice(0, 2).map(window => <article key={window.kind} data-testid="working-time-history"><h4>{t(window.kind === '24_WEEKS' ? 'advisory_24Weeks' : 'advisory_6Months')}</h4><p>{date(window.startAt, true)} — {date(window.endAt, true)}</p>{window.coverage === 'APPROVED_RECORDED_PERIOD_COMPLETE' && typeof window.averageSecondsPerWorkingDay === 'number' ? <><p>{t('advisory_recordedAverage')}: <strong>{duration(window.averageSecondsPerWorkingDay)}</strong></p><p className="working-time-note">{t('advisory_legalReview')}</p></> : <p className="working-time-notice">{t('advisory_missingHistory')}</p>}</article>)}</div></section>
        {(result.warningsTruncated || result.dutyDaysTruncated || result.restsTruncated || result.sourcesTruncated) && <p className="working-time-notice" role="status">{t('advisory_limited')}</p>}
        <p className="working-time-provenance">{t('advisory_provenance')}: {result.sources.length}</p>
      </div>}
    </>}
  </section>;
}
