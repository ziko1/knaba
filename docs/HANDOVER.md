# KNABA DE handover and actual readiness

Status snapshot: **2026-10-06**. This is an implemented application candidate with scoped local verification. Public staging is blocked and company production is not accepted. The [full V3 specification](../KNABA_DE_MASTER_SPEC.md), [roadmap](../MASTER_ROADMAP.md), [requirements matrix](requirements/REQUIREMENTS_TRACEABILITY.md) and [single external prerequisite list](EXTERNAL_PREREQUISITES.md) retain all unresolved acceptance.

## Release identity and access

| Item | Actual status / authoritative source |
| --- | --- |
| Separate repository | `/workspace/knaba-de`, independent of AVENQO; company-controlled remote ownership acceptance remains outstanding |
| Full specification | `KNABA_DE_MASTER_SPEC.md`; preserved V3 bytes, SHA-256 `bc506661b5ee013f9948ead7ac2ff98c00fb77d3d00af1de61a2851516cdc683` |
| Verified public staging URL | **None.** Separate Railway project and `https://api-staging-a476.up.railway.app` domain now exist; services are empty and application readiness remains NOT_RUN. [Actual state](RAILWAY_STAGING.md) |
| Authorized staging scope | New isolated synthetic KNABA DE Railway staging, EUR 10/month cap; no agent plan purchase, real messages/payments/procurement; [authorization](../infra/DEPLOYMENT_AUTHORIZATION.json) |
| Production URL / WhatsApp identity | Not established; company/domain/Meta/account/recipient prerequisites unresolved |
| Exact release SHA/checksums | Release owner records final source Git SHA and actual package hashes in `artifacts/RELEASE_MANIFEST.json`; compare `dist/release.json` and actual `/version` after deployment. The exact built code SHA is recorded in the manifest; earlier candidate `4f8cfbb` is superseded by the GPS retention changes; live runtime remains unverified |
| Local address | Final isolated verification targets `http://127.0.0.1:3100`; the system execution request was CANCELLED before execution and this address is not verified or public |
| API/web and worker | Current build identity and integrity are recorded in the artifact manifest; clean API/web and separate worker are packaged only after final committed-source build. The Linux x64 Node24 runtime archive includes verified production dependencies; see actual manifest hashes |
| Android | Source/project/encrypted queue/build scripts implemented; host Java geofence classifier 16 cases passed; no compiled/signed APK/AAB or physical acceptance |
| iOS | SwiftUI/CoreLocation/Keychain source, project/XcodeGen/build scripts/XCTest vectors implemented; macOS/Xcode unavailable; no compiled/signed IPA or physical acceptance |
| Secrets / recovery | Supply through company-controlled secret storage and verified owner setup; no credentials in this document or bundle |

Preserve final source hash, artifact hash, target/mode, schema and evidence timestamp together. A later code change invalidates an earlier bundle's release identity. Generated evidence or hosting permission cannot certify company ownership/production acceptance.

## Module readiness

| Module | Implemented behavior | Actual verification boundary / remaining acceptance |
| --- | --- | --- |
| Identity/API authorization | Password/session/CSRF/MFA/invitation/revocation, fresh exact roles/scopes and bounded privileged grants, private guest/device identities | Local tests recorded in ledger; actual owner/MFA recovery and deployed negative tests outstanding |
| Commerce/dispatch/assistant policy | Approved catalog/rates/tax, guided/delegated quote version lifecycle, exact customer acceptance, fixed changes, TTL/conflict/ack/material gates, memberships/config/knowledge | **Focused commerce 49 passed**, including canonical internal knowledge and external/personal isolation; no real commercial/legal/crew/provider acceptance |
| Customer Issues | Private draft/submit/reference; safe context/read/list; four classes; canonical defect/rework/continuation/new-scope links; evidence-based resolution and cycle-preserving reopening | **13 Issue/context cases passed within 49**, including expired/revoked/foreign membership, stale version/self-approval, immutable originals and closure evidence. Final browser/deployed customer workflows pending |
| Sites/tasks/import/quality | Hierarchy, bounded CSV/XLSX parsing, scoped preview/commit, task work/review/rework/team allocation | Domain/parser tests in ledger; final file-import UI/browser and company conventions pending; circle geofences only |
| Working time/travel/tracking | Exact actual segments, timesheet review/correction/locked adjustments, explicit trips, policy/device/lease/event-time privacy | Synthetic server tests; raw GPS now has separate deletable storage, safe acknowledgements, exact expiry/read scope, bounded hold-aware worker purge and restore gate. SQL lifecycle and physical/company acceptance remain NOT_RUN; uncertain observations never automatically deduct wages |
| Chat/translation/WhatsApp | Membership/history/original/version/copy ACL, translation/delivery/callbacks, signed durable official inbox and adapters | Domain/adapter tests are local; real Meta/AI results NOT_RUN; uncertain network sends require reconciliation |
| Inventory/procurement | Integer quantities, ledger/transit/use/custody, approval/shortage/receipt costs | Synthetic domain tests; no real supplier ordering/payment acceptance |
| Remuneration/payout | Approved-time preliminary calculation, accountant document, separate approval/actual-transfer statement/employee receipt | Synthetic domain tests; no certified German net calculation, executed bank transfer or invented employee receipt |
| Media/reports/exports | Actual verified/sanitized images, private PG/S3, configured fail-closed ClamAV, immutable snapshots and archived PDF/XLSX/CSV | Actual local document bytes and independent spreadsheet loading tested; adapter/scanner fixtures passed. Real S3/scanner/offsite restore and legal structured invoices remain unverified |
| Web/PWA | Six-language console/customer entry, authorized forms, importer/Issue composer, private chat/media/exports/SSE | 13 browser cases discovered but Chromium launch fails EPERM; no passed application browser scenario or full offline write queue |
| Native companions | Android/iOS source plus server enrollment/session/events, bounded encrypted queues and local privacy stop | Host classifier/static checks only; native compile/sign/install and physical OS/permission/battery/offline tests blocked externally |
| Automation/worker/governance | Typed limited rules, leased durable outbox/retry fencing; integrated governance commands for bounded delegation and reviewed privacy/retention/export/evidence | Governance58 CPU invariants passed, fresh Engine scopes wired; final real worker integration evidence required; provider effects, privacy erasure and company retention are not inferred from records |
| Infrastructure/recovery | Pinned runtime, migrations, API/worker packaging, Docker and encrypted guarded backup/restore; separate configured Railway project/services/domain | Final runtime/DB/browser/clean restore blocked EPERM; source transfer and billing controls still block staging activation; offsite/alerts/RPO/RTO unresolved |

## Executed evidence and unresolved failures

The [verification ledger](TEST_EVIDENCE.md) and [machine-readable evidence](evidence/) identify actual commands, timestamps, modes and pass/fail/skip counts. The latest owned commerce check passed 49 tests at 2026-10-06T18:51:06 UTC; the final aggregate TypeScript rerun is recorded in the verification ledger after concurrent web/governance changes. This scoped result does not establish all 475 acceptance requirements.

An earlier actual PostgreSQL run had 157 passes and one lease timestamp-fencing failure. Source now uses an exact random lease token and expiry, but the final PostgreSQL rerun remains pending under the socket restriction. The earlier restore drill failed missing fake fixture media references; tooling now supports both actual media stores, but a clean database plus media restoration has not yet passed. Browser13 cases are authored/discovered; Chromium fails EPERM before application scenarios. Additional permission requests stalled and were aborted before command execution; they are not test results.

Synthetic resource/document/scanner/native/engine checks have their own evidence. A fixture provider response is not a real send, signed installable app, physical route, accountant acceptance or legal review. Baseline cases without mapped executed evidence remain NOT_RUN.

Review [architecture](ARCHITECTURE.md), [data model](DATA_MODEL.md), [API catalogue](API_CONTRACTS.md), [roles](ROLE_MATRIX.md), [German user guide](USER_GUIDE_DE.md), [bot guide](BOT_ADMIN_GUIDE.md), [legal checklist](legal/LEGAL_CHECKLIST_DE.md), [commerce](COMMERCE.md), [operations](OPERATIONS.md), [resources](RESOURCES.md), [integrations](INTEGRATIONS.md), [mobile](MOBILE.md) and [web behavior](../apps/web/README.md). Persistent state belongs to [PROJECT_MEMORY](../PROJECT_MEMORY.md), engineering rules to [AGENTS](../AGENTS.md).

## Completion and secure transfer

1. Obtain an execution path with working local sockets/browser or authorized CI; run final DB migrations/concurrency/lease tests, built API role/business checks and clean encrypted DB plus actual media restore. Retain historical failures until real rerun evidence supersedes them.
2. Resume the already-created isolated Railway project identified in RAILWAY_STAGING.md. Resolve dedicated source transfer and billing controls, then activate private DB/API/worker, migrate and seed DEMO, configure actual origin and exact deployed source SHA. Record actual readiness and authenticated positive/negative scenarios; do not touch existing projects.
3. Record worker/API restart, recovered jobs and stable logical effects. Establish permitted alert recipients, independent backup destination, retention/RPO/RTO and actual checksum restoration.
4. Finish roadmap code/acceptance gaps; build/sign native packages on company-controlled runners and record certificate/hash/install plus authorized physical privacy/OS/battery/offline tests.
5. Resolve applicable commercial/customer/legal/provider/accounting inputs. Establish actual production owner/key custody; remove synthetic data/configuration and record a separate company production decision.
6. Transfer company-controlled repository/domain/hosting/Meta/data/signing assets, schema/export/backup keys through the approved secure channel. Record license review, support/incident contacts and acceptance; revoke temporary developer access.

Current status: **implementation candidate; CPU verification scoped; final runtime verification blocked by execution environment; Railway capacity resolved and infrastructure prepared, application activation blocked by source transfer and unverified billing controls; company production and physical/live integrations not accepted**.

## Downloadable artifacts

Built code SHA: read the exact 40-character value in `artifacts/RELEASE_MANIFEST.json` and `dist/release.json`. The source ZIP and complete Git bundle preserve that commit. `artifacts/KNABA_DE_RUNTIME_LINUX_X64_<shortSHA>.zip` contains compiled API/worker/web and production dependencies for Linux x64 glibc/Node24. Node24 and a configured PostgreSQL17 database are still required. `artifacts/RELEASE_MANIFEST.json` contains exact artifact SHA256/byte counts and current unverified runtime/public status. Verified synthetic report examples are `artifacts/verified-report-v1.pdf`, `.xlsx` and `.csv`.
