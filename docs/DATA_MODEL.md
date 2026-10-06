# Data model and invariants

PostgreSQL is authoritative. Canonical domain entities use singular lower-snake-case kinds and this envelope:

```ts
interface Entity {
  id: string;
  companyId: string;
  kind: string;
  version: number;           // aggregate optimistic version
  data: Record<string, unknown>;
  createdAt: string;        // UTC ISO timestamp
  updatedAt: string;
}
```

[Migration 001](../infra/001_init.sql) stores the business envelope in `aggregates`; handlers validate typed data with Zod and related-record checks. The database's composite primary key `(company_id, kind, id)` isolates tenants. A `quoteVersion`, report version, schedule version or policy version is distinct from the aggregate optimistic `version`. IDs are stable; names, phone text, addresses or actor-supplied company IDs are not identity proof.

## Physical tables

| Table | Purpose / key constraints |
| --- | --- |
| `schema_migrations` | Applied schema versions |
| `aggregates` | Company/kind/id primary key; positive version; JSON object data; company-kind/site/employee indexes |
| `aggregate_revisions` | Company/kind/id/version primary key; actor and immutable data snapshot; UPDATE/DELETE blocked by trigger |
| `audit_log` | Company/actor/action/aggregate reference/detail/time; UPDATE/DELETE blocked by trigger |
| `command_receipts` | Company/actor/idempotency key primary key; command, canonical input hash, result, current authorization hash |
| `outbox` | Stable event ID; company/type/data; PENDING/RUNNING/SUCCEEDED/RETRY_SCHEDULED/FAILED/CANCELLED; attempt/lease/due/error/finish fields |
| `webhook_inbox` | Provider/event ID primary key; company and validated payload; durable ingress deduplication |
| `auth_credentials` | Company/user primary key; scrypt password hash, encrypted TOTP secret, last consumed counter |
| `auth_sessions` | Opaque token hash primary key; company/user/expiry/MFA/revocation/time; raw tokens are never persisted |
| `media_blobs` | Private actual original/sanitized bytes, ID/company/owner, MIME/SHA-256/time |
| `sessions`, `private_blobs`, `rate_limits` | Initial compatibility/infrastructure tables; current HTTP auth/media use `auth_sessions` and `media_blobs`; no claim that compatibility records are active runtime storage |

Cross-aggregate business uniqueness and JSON references are checked within the serialized company transaction rather than through a foreign key for every JSON field. The coarse lock protects stock, crew, quote and time conflicts; optimistic versions detect stale edits. Revision/audit immutability is database-enforced. Business snapshots such as issued quote content and report versions are also protected by domain APIs; aggregate JSONB is not a blanket database-level immutable trigger for every kind.

## Domain relationships

| Domain | Canonical entities / relationships |
| --- | --- |
| Identity | `company`, `user`, `employee`, `contact_identity`, `user_invitation`, `role_assignment`, `legal_approval`; employee HR ID resolves to its `userId`; current active user is the authorization identity |
| Customers/sales | `customer`, `customer_membership`, `service`, `price_book`, `lead`, `site_visit_request`, `quote`, `quote_acceptance`, `change_order`; membership ties verified user/customer and optional site limits/capabilities |
| Customer quality | `issue` with private draft, public number, classification, public/private history and cycle; references canonical `task`, `defect`, `change_order` and internal `decision`; immutable historical task/report data remains intact |
| Dispatch | `order`, `dispatch_request`, `decision`, `employee_availability`, `schedule_reservation`, `crew_assignment`, `material_requirement`; quote acceptance creates one pending order, not a guaranteed crew/time |
| Places/work | `site`, `site_revision`, `location`, `location_revision`, `work_package`, `task`, `task_assignment`, `task_review`, `worklog`, `work_allocation`, `defect`, `rework_link`, task templates/occurrences; place tree and work grouping remain separate |
| Time/travel | `shift`, `time_segment`, `time_event`, `timesheet`, approvals/revisions/corrections/adjustments, `trip`, trip events/approvals; employee IDs and task assignees are authenticated user IDs |
| Tracking | `tracking_policy`, `geofence`, `device_enrollment`, `device`, `presence`, `presence_event`, `location_sample`, incidents/explanations; minimal presence has no latitude/longitude; precise samples belong only to permitted business trips |
| Communication | `channel`, `message`, translations/requests, `delivery`, `callback`, notification settings/jobs and provider-copy references; channel membership/history interval controls originals and derived copies |
| Stock/procurement | `material`, `material_batch`, `stock_location`, `stock_movement`, `stock_transfer`, `stock_reservation`, `material_usage`, `material_request`, `stock_count`, `asset_assignment`, `supplier`, requisitions/orders/goods receipts/confirmed inbound |
| Finance | `rate_history`, `payroll_period`, `payroll_calculation`, `official_payslip`, `payout`, allocations/acknowledgments/receipts/corrections; preliminary calculation, actual transfer statement and employee receipt are independent |
| Documents | `media_upload`, `media_asset`, `report`, `report_version`, `report_artifact`, report review/delivery/acknowledgment/acceptance; report_version preserves the published German snapshot, template/version and canonical SHA-256; each artifact retains its own format/blob/checksum and stable version owner |
| Governance | `delegation`, `privacy_request`, `privacy_export`, `privacy_erasure_evidence`, `retention_policy`, `legal_hold`; explicit bounded rights, versioned approval and evidence; actual erasure is not inferred from a recorded reference |
| Assistant/routine | `assistant_config`, `knowledge`, `glossary`, `automation_rule`, `automation_run`; approved versions, effective dates and ACL before retrieval; typed action allowlist |

These are conceptual groups, not a claim that every group's kind can be read by every actor. The executor/read projection explicitly checks recognized kinds and [permissions](ROLE_MATRIX.md); unknown kinds return no data. The exact command schemas in [the API catalogue](API_CONTRACTS.md) are authoritative for fields.

## Arithmetic and time

Money is integer **EUR cents**, discounts/tax rates integer basis points, quoted quantities integer thousandths of an explicit unit. BigInt multiplication and defined half-up rounding avoid float accumulation. The calculator reads approved price-book rates, not caller rates or payroll. An explicit tax scenario is required; 19% is a labeled synthetic fixture, never a production default.

Material quantities are decimal strings validated into integer material base units (ml, g, piece/pair). Package conversions are material-specific rational values; unexplained density or fractional base units fail. Physical, unusable, reserved, free, transit, ordered and consumed quantities differ. Shipping, receiving, custody and usage are separate ledger facts.

UTC intervals are half-open and preserve exact seconds; Europe/Berlin is the display/calendar convention. Work, paid activities, customer-billable time and chronological shift duration are distinct. Three people for two hours means six person-hours, while one team result counts once. Allocations cannot exceed their source interval. Manual breaks are actual facts, never invented to satisfy a rule. Closed corrections add approved deltas while retaining originals and previous payroll/documents.

## State and snapshot boundaries

- Quotes: DRAFT → APPROVED_TO_SEND → SENT → ACCEPTED/REJECTED/EXPIRED/SUPERSEDED. Revised scope gets a new ID/public quote version; accept targets the exact current unexpired SENT version and creates one order/dispatch effect.
- Orders: PENDING_OPERATIONS → CONFIRMED → SCHEDULED → IN_PROGRESS → WORK_SUBMITTED → CLIENT_REVIEW → CLOSED, with explicit pause/cancel/dispute paths. A schedule is confirmed only after required acknowledgments and material readiness.
- Tasks: DRAFT → READY → ASSIGNED → IN_PROGRESS → SUBMITTED_FOR_REVIEW → ACCEPTED; BLOCKED/CANCELLED/REOPENED are controlled. Worker submission is not internal quality acceptance or contractual Abnahme.
- Issues: private DRAFT → OPEN → TRIAGED/IN_PROGRESS → RESOLVED; reopening starts a new cycle while retaining history. Classification is DEFECT, ADDITIONAL_WORK, NEW_SCOPE or CLARIFICATION. Accepted internal rework and contractual additions have separate approvals; a customer issue cannot mutate a published report or silently add to a fixed price.
- FIXED price: base contractual net plus accepted Nachtrag amounts. Actual extra hours/material cost and draft/rejected changes cannot increase it.
- Reports: draft source snapshot → separate review/approval → immutable published `report_version`. Changed inputs invalidate pending approval; a correction produces the next version, preserving prior published bytes/facts/hash.
- Payout: preparation → distinct approval → actual-transfer attestation → employee full/partial/disputed receipt. No state executes a bank transfer or manufactures employee acknowledgment.
- Assistant: DRAFT → PREVIEW → REGRESSION_TESTED → APPROVED → ACTIVE → RETIRED. Preview/regression are deterministic policy checks, not a successful real-provider test.

Current customer memberships, legal approvals and their expiries are checked at action time. Cached idempotent results do not restore revoked authority. Issued snapshots keep historical addresses/rates/facts even when live records change. Customer projections exclude internal payroll/costs/private routes/comments; document receipt, hours confirmation and work acceptance retain distinct records.

## Retention and recovery

Original business history and legal holds require a company-approved retention policy per data class. GPS retention differs from working-time/accounting retention. Expiry fields and conservative tracking gates exist; a complete legally approved deletion/backup-retention process is not inferred from them. The [legal checklist](legal/LEGAL_CHECKLIST_DE.md) and [EXT-08/09/20](EXTERNAL_PREREQUISITES.md) record outstanding decisions. Backup acceptance must prove database records and actual original/client/artifact bytes survive restoration, including external S3 objects when selected. `retention_policy` and privacy evidence workflows require approved category profiles; recorded deletion evidence explicitly remains pending external verification and does not execute or certify erasure.

### Transient GPS data
`gps_points` holds company/sample/employee/site scope, latitude/longitude/accuracy and approved per-point expiry under a composite foreign key to metadata. Coordinate-free `location_sample` metadata is the deduplication tombstone. Raw coordinates never enter immutable revisions or command receipts. `knaba_purge_gps` deletes bounded expired points except specific valid finite GPS legal holds and writes count-only audit. Legacy raw copies are detected by `knaba_assert_gps_storage_safe` and block activation/restore; do not rewrite immutable history without a controlled approved migration. Metadata/audit and encrypted backup lifetimes need their own company-approved finite policies.
