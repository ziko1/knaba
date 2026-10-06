# Delegation, privacy requests and retention governance

The implementation is `packages/domain/governance.ts`. The engine supplies company-filtered, serialized transactions, command permissions, version control, idempotency, audit and outbox. These commands supplement the identity and legal-approval modules; they do not impersonate another user or bypass finance/GPS permissions.

## Temporary delegation

`delegation.create` requires `role.manage`, current directly held permissions, explicit named site/warehouse scopes, an active internal recipient and an expiry within 30 days. The 30-day maximum is an implementation limit, not a statutory deadline. Scope must fit the grantor's current scope; an explicit company scope allows named company records but cannot itself be delegated. Wildcards, self-delegation, transitive grants, role/identity/legal authority, finance/payroll/GPS/privacy/audit rights, global bot/assistant/automation/integration/customer/price/service settings and mass export are excluded from this generic deputy workflow. Dedicated legal and privileged identity workflows remain necessary for those rights.

Creation returns a draft and immutable parameter hash. `delegation.approve` requires a distinct OWNER with MFA, the exact hash and a still-valid grantor/recipient. Combining roles cannot satisfy the distinct-person condition. `delegation.revoke` invalidates a draft or approved grant immediately. The grant expires at the exclusive end of `[startsAt, expiresAt)`.

`effectiveDelegations(tx, baseActor, now)` refreshes recipient activity, grantor activity and directly held authority, current grantor scope, record state, parameter checksum and expiry. It returns permission/scope tuples, grant IDs and a fingerprint for command receipt authorization. `delegationScope(baseActor, effective, permission)` adds scopes only for that permission. Base site/warehouse scope is retained only when the base actor already holds that exact permission; otherwise company scope is stripped even for an OWNER. For example, base `task.create` on site A plus delegated `task.read` on site B does not authorize creating a task on site B.

The engine must apply these tuples to every command/read permission, file authorization and pending delivery. Globally combining all delegated permissions with all delegated sites creates an unsafe cross product. Roles and authenticated user ID remain unchanged. Fresh effective grant fingerprints participate in receipt authorization, so old buttons and retries cannot retain expired or revoked access.

## Minimized own-data export

`privacy.request` (`identity.self`) records ACCESS or ERASURE categories and fixes the subject to the authenticated user. OWNER, accountant and company scope cannot request or export another person's dataset through this path. Supported export categories are PROFILE, TIME, PAYROLL, MESSAGES and MEDIA. This is a minimized self-data export, not a claim that the company's complete legal DSAR obligations are fulfilled.

`privacy.review` (`privacy.review`, high risk) requires a distinct reviewer and a current, evidenced, externally reviewed PRIVACY legal record. The record's `scope.projectionVersion` must be `knaba-dsar-v1`; `scope.exportCategories` enumerates permitted export categories. Approval of an export does not grant the reviewer access to its contents.

`privacy.export` creates an immutable private `privacy_export` JSON snapshot and returns only file metadata, checksum and the need for a secured download. `buildPrivacyExport(tx, actor, requestId, now)` returns the actual canonical JSON bytes; `privacyExportBytes(tx, actor, exportId)` returns archived bytes only to their subject and verifies the SHA-256. The HTTP layer must authenticate the current active user before serving the private JSON attachment. Export JSON must not be echoed into WhatsApp or placed at a public URL.

Declared Zod projection schemas select fields from the authenticated profile, own shifts/timesheets, own payroll/payout facts, own undeleted authored messages in currently accessible channels and their permitted history interval, with current internal site scope and active unexpired VIEW customer membership for SITE_CLIENT channels, and own media metadata. Credentials, role permissions, banking details, raw coordinates/routes, other authors' messages, unrelated employee records, private blob keys and unrecognized nested fields are excluded. Metadata about another employee's confidential document is excluded even when the requesting accountant uploaded it. Additional data categories or broader disclosure require a separately reviewed projection version.

## Erasure requests, legal holds and retention

An ERASURE request creates a workflow record and changes zero operational records or blobs. Review may reject, retain for an evidenced legal basis, refer to erasure execution, or put the request on a specific legal hold. Referral is not deletion. `privacy.erasure_evidence` records a responsible person's external execution reference, evidence SHA and derivative outcomes, with `EXTERNAL_REFERENCE_NOT_VERIFIED` and `EVIDENCE_RECORDED_PENDING_VERIFICATION`; it never claims system deletion or marks the legal request completed.

Legal holds identify a particular subject and categories, an evidenced PRIVACY review, reason and expiry within 365 days. This is a technical bound chosen to prevent indefinite blanket holds, not a statutory retention period. Release requires another OWNER with MFA and evidence. Expiry or release permits another review; neither triggers automatic deletion. An active relevant hold blocks erasure evidence progression.

`retention.create` and `retention.approve` maintain separately reviewed category policies for PROFILE, TIME, PAYROLL, GPS, CHAT, MEDIA and AUDIT. The legal record supplies fixed `scope.retentionProfiles[category] = {minDays, maxDays}`; the chosen retention period must remain inside those approved bounds. A distinct OWNER with MFA approves the exact draft hash and unchanged legal profile. The implementation does not invent one statutory period for all documents and does not automatically delete immutable audit/history.

For general data categories, physical deletion, eligibility by record age, lawful audit minimization, backups, processor copies, source messages and their translations/search indexes require reviewed execution and verifiable evidence from the actual storage/processors. Recorded references are not proof that those systems erased data. Legal applicability and full DSAR/erasure closure remain external reviews.

## GPS source retention and restored copies

Raw route coordinates use the separate erasable `gps_points` store; ordinary `location_sample` aggregates/revisions and `trip.sample` receipt results must contain coordinate-free metadata. `knaba_assert_gps_storage_safe()` rejects legacy coordinate copies instead of modifying immutable history. The worker executes this guard before creating or updating its service account. Each subsequent worker tick calls `knaba_purge_gps(injectedNow,500,companyId)` before scheduling or leasing jobs: one bounded, company-scoped batch. A cleanup failure aborts that tick and therefore cannot produce a successful-tick heartbeat. The SQL purge honors specific ACTIVE, unexpired GPS legal holds for the same company and subject, and records only counts in its audit event. It leaves time segments, approved timesheets and payroll facts intact.

Each point's `expiresAt`, derived from the approved tracking policy's `retentionDays`, is a source-retention control distinct from the privacy-request evidence workflow. It does not make all other categories automatically deletable, or prove lawful company approval of GPS. A generic payroll retention period cannot extend raw GPS storage. On restore, original counts and blob integrity are checked first, then current storage guards and bounded expiry cleanup run before the destination may be used. Legacy immutable coordinate copies block restoration until a reviewed migration; old encrypted backups still need finite approved backup retention and key retirement. See `docs/BACKUP_RESTORE.md` for the exact restore bounds. Legal approval, real-device tests and live database verification remain separate evidence requirements.

## Command permissions

| Commands | Permission |
| --- | --- |
| `delegation.create`, `delegation.approve`, `delegation.revoke` | `role.manage` |
| `privacy.request`, `privacy.export`, `privacy.status` | `identity.self` |
| `privacy.review`, `privacy.erasure_evidence`, `legal_hold.create`, `legal_hold.release` | `privacy.review` |
| `retention.create`, `retention.approve` | `privacy.manage` |

The generic temporary delegation workflow cannot grant `privacy.review` or `privacy.manage`. A privacy reviewer receives explicit authority through the existing privileged identity process. Privacy authority provides workflow metadata access, not company-wide payroll/GPS exports. Engine visibility for `privacy_export` is subject-only; request/hold/policy metadata requires its documented permission and scope.

## Local validation

`npx vitest run tests/governance.test.ts`: **58 passed, 0 failed** on 2026-10-06 at 18:26 UTC. Targeted strict TypeScript validation of the test and imported governance/core/permissions modules passed. The cases cover scope cross-products, unrelated base scope, OWNER without the exact right, forbidden global privileges, distinct approvers, changed hashes, expiry/revocation/grantor loss, strict-self export canaries, channel/customer/site/history revocation, immutable JSON checksums, finite holds, fixed retention bounds and non-destructive erasure evidence. Whole-repository and live HTTP verification remain the release owner's checks. Synthetic fixtures do not establish legal approval or physical deletion from real processors/backups.
