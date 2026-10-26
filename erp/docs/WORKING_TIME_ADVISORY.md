# Working-time advisories

This implements the deterministic software-warning portion of master specification §27, line835 (KNABA-R-27-002). Every result has `ADVISORY_ONLY_REQUIRES_LEGAL_REVIEW`; a computed warning or average is not a legal certification. Actual recorded intervals remain unchanged, including excess hours. These commands do not calculate pay, deduct time, discipline an employee or enable GPS.

## Server contract and access

| Command | Strict input | Required permission |
| --- | --- | --- |
| `shift.working_time_advisory` | `{shiftId, policyApprovalId?}` | `shift.read` |
| `timesheet.working_time_advisory` | `{timesheetId, policyApprovalId?}` | `timesheet.read` |

The operations registry contains both commands. Each reads the current employee and company from the selected shift/timesheet in the existing server transaction, calls `requireOwn(employeeId)` and checks the selected site's scope. Historical rows outside current site scope are omitted and make historical coverage incomplete. Actor role names do not add a permission bypass. Evaluation time comes from the server; a caller cannot submit arbitrary employee IDs, simulated times, segment facts or relaxed thresholds. The Engine treats the commands as fresh reads, so receipt replay does not serve an obsolete calculation. The domain handlers perform no business aggregate writes or events; existing Engine receipt/audit behavior remains applicable.

Raw `time_segment` facts supply the current timeline. Approved/locked timesheets use the canonical `effectiveTimesheet` fold of approved corrections, with original immutable records and payroll fields left intact. A new raw segment absent from an approved snapshot is retained and marks history incomplete. Pending corrections, missing shift linkage or omitted historical sources also prevent a complete historical result. Private explanations, salaries, GPS coordinates, tracker quality and medical information are not returned. Approved payroll `paidActivities` does not determine the distinct ArbZG travel classification.

The response contains recorded seconds, qualifying break seconds, required break seconds, inter-shift rest, bounded warning codes, both averaging windows, confidence, source kind/ID/version provenance and a canonical SHA256 of the minimized evaluated snapshot. Output limits are100 duty windows,100 rests,100 warnings and500 source references, each with an explicit truncation flag. Input limits are1000 shifts/coverage records and10000 segments; larger histories fail explicitly instead of returning a false complete result. The digest binds the server evaluation time and approved correction provenance; it is not a newly stored approval or attestation.

## General-regime arithmetic

- Work is recorded `WORKING`, `SERVICE_TASK` and `WAITING_WORK`. `ON_BREAK` is recorded break. Unclassified activities remain unresolved. `TRAVELLING` defaults to unresolved; an approved profile can classify it as counted or excluded. Excluded travel never becomes a credited break.
- Elapsed duration uses UTC half-open intervals. Europe/Berlin controls calendar dates, holidays and averaging-window boundaries; summer/winter clock changes do not add or remove elapsed work or rest.
- Conservative individual24-hour windows anchored at actual shift starts warn above8 hours and above10 hours. Work across local midnight is retained. Windows can overlap for multiple starts; they are explicit conservative advisories rather than an adjudicated legal definition of an individual workday.
- More than6 and up to9 recorded working hours require30 minutes of qualifying recorded breaks; more than9 requires45 minutes. Break parts must be at least15 minutes. Adjacent pieces of the same recorded physical break merge; separate10-minute pauses do not qualify. No missing lunch is invented from GPS, inactivity or a timeline gap.
- More than6 continuous recorded working hours warn even when a later lunch makes the total daily break sufficient. A contiguous recorded timeline across end/start of separate shift IDs also carries work over short pauses and excluded travel; restarting the application shift does not reset physical continuity. Only a qualifying recorded break resets that cross-shift accumulation. Unresolved intervals yield possible warnings rather than falsely confirmed compliance.
- Closed-shift endpoints establish recorded inter-shift rest. Less than11 elapsed hours warns; exactly11 does not. Missing previous shift/end evidence is explicit.
- Night work, Sunday work and known state holidays produce applicability-review warnings. A federal-state holiday calendar requires an explicit coverage range. A missing calendar, other employers' work and statutory/collective exceptions always need external review; no automatic exemption suppresses thresholds.

Both rolling windows end at the start of the current Berlin calendar day:24 calendar weeks and6 calendar months, with month-end clamping. Current incomplete-day data is excluded. An average is only populated when approved recorded coverage continuously spans a full window and there are no unresolved/open intervals or known scope/recording gaps. A one-second coverage gap yields `INSUFFICIENT_HISTORY` and a null average. Sparse shifts alone never establish adequate coverage. Either complete window may support the recorded general-regime average; an incomplete alternative window remains visible.

The denominator is explicitly the general Monday–Saturday calendar-day baseline. Federal holiday treatment, protected absences, night-worker rules, other employment and approved exceptions can affect the legal assessment and are not inferred from payroll data. Therefore even a recorded average at or below8 hours returns `RECORDED_HISTORY_SUPPORTS_AVERAGE_ONLY`, never legal compliance. A recorded average above8 with the other window incomplete does not establish that every lawful compensation alternative has failed.

## Optional approved profile

An optional `policyApprovalId` must reference a current same-company `legal_approval` with subject `WORKING_TIME`, status `APPROVED`, active state, external evidence reference and valid approval/expiry timestamps. The root-owned `legal_approval.record` command records the external review; this module neither fabricates it nor interprets a payroll/privacy approval as working-time approval.

Its `scope.workingTimeAdvisory` is strictly validated:

```json
{
  "travel": "COUNT",
  "federalState": "BE",
  "holidayDates": ["2026-01-01"],
  "holidayCoverageFrom": "2026-01-01",
  "holidayCoverageTo": "2026-12-31"
}
```

The example is a schema illustration, not a complete approved holiday calendar. `travel` permits `COUNT`, `EXCLUDE` or `UNRESOLVED`; the sixteen German state codes are accepted. Holiday dates must be real ISO dates, at most400, and both coverage endpoints must be present together. Unknown keys and proposed relaxed limits are rejected. Without a profile the result clearly states `UNAPPROVED_GENERAL_REGIME_DEFAULTS` and requires legal review.

## Employee screen

`apps/web/src/WorkingTimeAdvisoryPanel.tsx` displays authorized own shifts/timesheets and submits the selected known record ID to the real command. It presents elapsed hours/minutes/seconds, qualifying/required breaks, rest and human-readable warnings, plus both averaging windows with an explicit insufficient-history state. The legal-review notice remains visible before and after evaluation. The default policy is labelled unapproved; an optional profile can be selected only if current approved `WORKING_TIME` records were supplied by authorized server reads. No arbitrary policy ID, simulated facts or threshold override is accepted by the screen.

Loading, empty, offline, error/retry and stale-response states are handled. A selection, actor scope or selected-record version change clears the prior result; an obsolete asynchronous response cannot populate another selection. Values are dated server-calculated snapshots, not a live compliance certificate. The root/web integration supplies all six locale translations and places the panel on the employee shift/time screens. Browser acceptance is separate from TypeScript verification.

## Verification and remaining evidence

`tests/working-time-advisory.test.ts` uses deterministic actual elapsed facts and the registered operations handlers. Coverage includes strict6/8/9/10-hour boundaries; split/short/late breaks; classified/unresolved travel; spring and autumn DST; midnight; exact11-hour rest; adjacent restarted shifts; six-calendar-month/24-week boundaries; incomplete/one-second-gapped history; scoped reads; effective locked-period correction provenance; private-field minimization; policy subject/expiry and no business writes. `tests/operations.test.ts` also verifies existing workflows are unchanged.

The final focused run passed71/71 CPU tests (34 new plus37 operations), zero failures or skips; raw report `/tmp/knaba-working-time-advisory-result.json`. This includes independent-review regression cases for a10-minute pause, a qualifying15-minute pause, excluded travel and unresolved activity between two shifts. These are CPU/in-memory contract checks, not genuine PostgreSQL execution, browser acceptance, an approved company policy or a legal review. Actual hosted SQL/browser checks for this new source must be recorded separately. Production policy approval, current complete legal holiday calendars, collective exceptions and work at other employers remain external prerequisites.
