# Operations contract and evidence

The authoritative operations data lives in the same PostgreSQL aggregate transaction used by web, WhatsApp and native commands. Domain mutations, event records and outbox notifications commit together. Command executor authorization, idempotency and optimistic versions precede these handlers; handlers independently enforce company, site, employee and related-record boundaries. All timestamps normalize to UTC; Europe/Berlin is the calendar/display convention. Test fixtures are synthetic, and do not represent KNABA orders, legal approvals or real GPS measurements.

## Canonical records

| Kind | Meaning and immutable reference |
| --- | --- |
| `site`, `site_revision` | Addressed work site; business-code/address revision snapshot |
| `location`, `location_revision` | Acyclic same-site place tree, explicit German floor label, stable external import key and historical breadcrumb |
| `work_package` | Place-linked grouping of work; independent of location hierarchy |
| `task`, `task_assignment`, `task_review` | Atomic work outcome, authorized user IDs, immutable quality cycle snapshots |
| `worklog`, `work_allocation` | Single team outcome and separate employee contributions; exact allocation in seconds |
| `defect`, `rework_link` | Human defect responsibility and linked internally billed corrective task; primary work and costs preserved |
| `task_template`, `task_template_revision`, `task_occurrence` | Future task configuration; unique template/date/location occurrence key in Europe/Berlin |
| `shift`, `time_segment`, `time_event` | One active shift per employee user ID, contiguous half-open UTC intervals, original facts/source/receive time preserved |
| `timesheet`, `timesheet_approval`, `timesheet_revision` | Submitted/approved/disputed/locked period with immutable original interval snapshot and explicit paid activity policy |
| `timesheet_correction`, `timesheet_adjustment` | Reasoned employee request; supervisor review; closed periods receive a separate approved delta |
| `trip`, `trip_event`, `trip_approval` | Canonical business travel, private/service stops, explicit employee arrival and independent paid/client-billing approval |
| `tracking_policy`, `device_enrollment`, `device` | GPS defaults disabled, legal references and expiry; one-use expiring hashed device binding; old tracker revoked |
| `geofence`, `presence`, `presence_event` | Versioned circle configuration, separate device/presence/quality state and minimal coordinate-free events |
| `location_sample`, `location_incident`, `absence_explanation` | Only authorized business-trip route points with retention expiry; reviewable anomalies and explanations |

`employeeId` in time, trip and payroll-facing timesheets is the authenticated **user ID**. Employee HR records may have a separate ID and must resolve their `userId` before issuing time commands. Task `assigneeIds` are user IDs. `media_asset` IDs are evidence references and are checked against the task site. `location` is the canonical place kind; the specification's conceptual LocationNode maps to this aggregate.

## Commands and permissions

Every command has a strict Zod schema and returns typed domain failures, including `ACCESS_DENIED`, `INVALID_STATE`, `NEEDS_APPROVAL`, `VERSION_CONFLICT`, `VALIDATION_ERROR` or `MISSING_CONFIGURATION`.

| Commands | Permission | Scope and invariant |
| --- | --- | --- |
| `site.create` | `site.create` | Company; code unique |
| `site.update`, `location.create/update/archive/import.preview/import.commit` | `site.structure.edit` | Assigned site; preview hash binds current structure versions; archive keeps history |
| `location.breadcrumb` | `site.read` | Assigned site; full unambiguous path |
| `work_package.create`, `task.create/ready`, `task_template.create/update/occurrence` | `task.create` | Same-site references; explicit floor conventions; recurring occurrence deduplication |
| `task.assign/cancel` | `task.assign` | Active users with site entitlement; audited assignment history |
| `task.start/worklog/checklist/submit/block`, `time.allocate` | `task.work` | Assigned worker; single team result key, exact allocation not exceeding closed source interval |
| `task.review/reopen`, `defect.create/rework` | `task.review` | Assigned site; no self-acceptance; required checklist/photos checked at acceptance, never at time completion |
| `task.progress/summary`, `operations.statistics` | `task.read` / `operations.read` | Assigned site; accepted and submitted quantity separate; incompatible units separate |
| `shift.start/activity/end`, `absence.explain` | `shift.manage` | Own/scoped employee; no overlapping activity; no invented lunch; original hours never deleted |
| `shift.summary` | `shift.read` | Own/scoped employee; traceable counters and unallocated remainder |
| `timesheet.submit/correction/correction.bulk` | `timesheet.submit` | Own hours; no overlapping submitted periods; correction reason required |
| `timesheet.review/lock/correction.review`, `absence.review` | `timesheet.approve` | Authorized reviewer and site; self-approval prohibited; closed payroll adjusted separately |
| `timesheet.summary` | `timesheet.read` | Own/scoped employee and sites; disputed facts visible |
| `trip.start/destination/stop/resume/arrive/end` | `trip.manage` | Own active shift; approved company destination; explicit arrival; private stop stops route recording |
| `trip.approve` | `trip.approve` | Scoped supervisor; no self-approval; customer billing requires accepted contract addition |
| `tracking_policy.create/approve/disable`, `geofence.configure` | `location.policy.manage` | Company/site; approval and geofence changes are high risk; policy activation requires OWNER plus MFA and recorded, active and unexpired `legal_approval` records for GPS_LEGAL_PROCESS, GPS_NECESSITY, GPS_WORKS_COUNCIL and GPS_EMPLOYEE_NOTICE |
| `device.enroll/revoke` | `device.manage` | Own/scoped employee; expiring one-use token, revoke audit |
| `device.bind` | `device.self` | Authenticated employee matches enrollment; old device revoked |
| `presence.ingest`, `trip.sample` | `location.self` | Matching employee, active bound tracker, valid policy and collection mode at event time |

## Time and payroll boundary

`shift.summary` returns `totalSeconds`, `workSeconds`, `travelSeconds`, `breakSeconds`, `pendingSeconds`, `serviceSeconds`, `waitingSeconds`, `allocatedSeconds`, `unallocatedSeconds` and the source records. `timesheet.review` records `paidActivities` and `payableSeconds` without money or customer tariff calculations. For minute-based consumers, `totalMinutes = floor(payableSeconds / 60)` and `remainderSeconds` explicitly preserves the remainder; payroll should calculate from exact seconds where its agreed rounding policy allows. Approved `segmentSnapshot` rows contain `id`, `shiftId`, `employeeId`, `siteId`, `activity`, `startAt`, `endAt`, `seconds`, `taskId` and `tripId`.

The synthetic control day is 480 chronological minutes = 420 site + 30 travel + 30 personal break, paid 450 minutes only under the explicit test travel policy. The geofence control day is 480 = 415 site + 30 travel + 30 break + 5 unexplained, paid 445 under its explicit test policy. Unknown/pending time remains visible and does not cause an automatic payroll deduction. Contract billing and ArbZG classification require their own approved policies.

Shift start with historical time before any later ended shift is rejected and requires the correction process. Late activity events cannot silently rewrite closed intervals. Corrections retain originals. A requested boundary change that would leave a gap or overlap is rejected. `timesheet.correction.bulk` supports coordinated boundary changes across multiple source intervals and checks the whole shift timeline before review. Closed-period adjustments are ordered; each delta is calculated from the effective corrected timeline, preventing a repeated correction from duplicating its prior delta.

## Geofence and route privacy

GPS remains disabled until approved legal_approval records for GPS_LEGAL_PROCESS, GPS_NECESSITY, GPS_WORKS_COUNCIL and GPS_EMPLOYEE_NOTICE are supplied explicitly. Synthetic approval records cannot activate GPS for a PRODUCTION company. A minimal presence event contains `eventId`, `deviceId`, `shiftId`, `siteId`, `sequenceNumber`, `observedAt`, optional `distanceM`/`accuracyM`, `source`, `trackerState` and `policyVersionId`; latitude and longitude are forbidden by its schema. The server classifies exit only when `distance - accuracy > exitRadius`, and entry only when `distance + accuracy < enterRadius`. It requires at least two increasing observations and elapsed dwell. Missing accuracy, stale data, uncertain boundaries and unavailable permissions cannot automatically create an absence. One distant sample cannot pause work.

Confirmed exit can close object allocation and open a visible `AWAY_PENDING_REASON` at the confirmation time. Return may resume only the matching geofence-created pending segment under the configured policy. Entry never ends an explicit break, starts an off-duty shift or ends travel. Destination arrival requires the worker command. Anomalies request review and do not establish identity, misconduct or liability.

Route samples accept coordinates only for the employee's explicitly active business-trip interval at **observed event time**, with legal policy, bound device, retention deadline and lease limits. Samples from private stops or after END are rejected even if delivered later. Lawful pre-END trip points can arrive after END; no measured distance is fabricated from incomplete route data, no missing track is interpolated, and no vehicle kilometres or cost is multiplied by passengers.

## Verification and remaining external work

The meaningful domain suite is `tests/operations.test.ts`, run with `npx vitest run tests/operations.test.ts`. It covers exact chronological/payable arithmetic; DST and month/night boundaries; duplicate/overlap protection; self and foreign approval/access; immutable closed-period correction, coordinated boundary correction and sequential effective adjustments; tree cycle and floor-label safety; historical path snapshots; one team result and six person-hours; allocation limits; review versus acceptance; linked deduplicated rework; recurring tasks; preview-bound upsert; GPS legal default-deny, approval-record/MFA safety, one-use device enrollment and replacement, uncertainty, dwell, late events, return privacy and lawful late route points.

Physical Android/iPhone GPS, OS background restrictions, permission changes, battery impact, timing, WhatsApp delivery and legal policy approvals require independent external evidence. Domain synthetic tests do not fulfill these checks. Native session authentication/lease delivery and persistent integration tests are owned by the API/native modules. XLSX parsing is an integration layer; this module accepts normalized validated import rows, provides the error report/preview and atomic commit. Polygon UI/import is not implemented here. These limits must remain explicit in the product readiness matrix.
