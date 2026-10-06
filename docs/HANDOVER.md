# KNABA DE handover and actual readiness

Documentation checkpoint: **2026-10-06**. **Public staging is NOT_READY; company production is not accepted.** Latest executed source `fc6c30fc9ff1f6c6c946fe93dd274e0806e3e7d1` has application workflow FAILED: 1221/1225 tests passed, 4 genuine PG failures; browser 19/20 passed, 1 strict-locator failure. Hosted Docker image/source-worker gate, encrypted backup, tamper rejection, empty-DB/private-blob restore and bundled worker restart passed. iOS simulator/15 XCTest passed; native run overall FAILED because Android lint had 3 errors/7 warnings despite 52 JVM checks passing. Current later source corrections and 21 authored browser cases remain **FINAL_CI_PENDING**; no final current count/PASS is inferred.

Last observed Railway readback (2026-10-06T21:34UTC): API/worker OFFLINE, PostgreSQL CRASHED; patch `6aa92092-b449-4e17-8161-b0b4bc8c47eb` had 26 staged non-destructive changes, unapplied. The first user-confirmed application began 20:55:09Z and failed. Provider TWO_FACTOR requires dashboard application after the complete new tested source batch is ready; no corrected deployment success, runtime SHA or readiness is observed.

The [full V3 specification](../KNABA_DE_MASTER_SPEC.md), [roadmap](../MASTER_ROADMAP.md), [requirements matrix](requirements/REQUIREMENTS_TRACEABILITY.md) and [single external prerequisite list](EXTERNAL_PREREQUISITES.md) retain unresolved acceptance. Historical execution never certifies later source changes.

## Release identity and access

| Item | Actual state |
| --- | --- |
| Separate repository | Local `/workspace/knaba-de`, independent of AVENQO; user-provided public [ziko1/knaba](https://github.com/ziko1/knaba), branch `knaba-staging` |
| Review | [PR1](https://github.com/ziko1/knaba/pull/1) is **draft**; `main` unchanged |
| Full specification | Preserved `KNABA_DE_MASTER_SPEC.md`, SHA256 `bc506661b5ee013f9948ead7ac2ff98c00fb77d3d00af1de61a2851516cdc683` |
| Latest executed remote source (historical) | `fc6c30fc9ff1f6c6c946fe93dd274e0806e3e7d1`; subsequent fixes are not a tested final release |
| Historical matching local source | `dd67043d7f3c5a0107f3eabe6275ad2dd60d4abf`, tree `e1fa5ed7ee7ec076f197ca1341c4a1281b079d88`; later changes supersede this source |
| Latest executed application CI | [37534825577](https://github.com/ziko1/knaba/actions/runs/37534825577), **FAILED**: 1068 CPU/fixture PASS, 153/157 genuine PG PASS with 4FAIL, browser 19/20PASS |
| Latest executed native CI | [37534825214](https://github.com/ziko1/knaba/actions/runs/37534825214), **FAILED_ANDROID_LINT**; iOS simulator/15 XCTest PASS/45 bundle hashes verified; Android 52 JVM checks PASS, lint 3 errors/7 warnings. Fixes need new CI |
| Allocated staging address | [https://api-staging-a476.up.railway.app](https://api-staging-a476.up.railway.app); **not verified live**, no readiness or runtime SHA observed |
| Railway | Initial `accept_deploy` **SUCCESS** committed 13 compacted changes from patch beginning `24e7a116` before 20:55:09Z. API deployment `4356abfe…` **FAILED**; PostgreSQL `f7192f59…` **CRASHED**; worker OFFLINE with no source. Subsequent correction acceptance requires Railway dashboard **2FA**, so the correction is **NOT_APPLIED**. [Exact continuation](RAILWAY_STAGING.md) |
| Staging boundary | Synthetic DEMO only; absolute cutoff **2026-10-07T20:11:52Z** on staged lifecycle commands. Bounded 24-hour test, not a permanent EUR10/month deployment guarantee |
| Production URL / identities | Not established; production owner/keys/domain/Meta/provider/legal/accounting acceptance outstanding |
| Artifact/runtime identity | `artifacts/RELEASE_MANIFEST.json` and `dist/release.json` identify the artifacts they actually describe. Compare each to its exact source SHA; a prior manifest or local bundle is not proof of the current remote runtime |
| Secrets | Platform/company-controlled secret storage only; no credentials in this document or downloadable evidence |

## Actual executed evidence

Historical fc6 [CI 37534825577](https://github.com/ziko1/knaba/actions/runs/37534825577), job 112512993282, has **1221 PASS/4 FAIL/0 SKIP of 1225**: 1068 CPU/document/explicit transport-double assertions passed, and 153 of 157 genuine PostgreSQL assertions passed. Four failing internal-cache/draft confirmation/rollback/worker cases require source fixes and rerun. **Browser 19/20 passed, 1 failed** at an ambiguous UNSYNCED status locator; later original-key retry/acknowledgment checks in that case were not reached. [Exact receipt](evidence/ci-run-37534825577-summary.json) preserves names, classifications and file hashes. No functional UI failure was established by that locator trace; this does not turn its acceptance into PASS.

Actual hosted Docker image/source-worker verification **PASSED**, preserving fc6 `PINNED_CONTAINER_CONTEXT` and `source_dirty:null`. Encrypted backup, tamper rejection, distinct empty synthetic PostgreSQL/private-blob restore and actual bundled-worker heartbeat/restart **PASSED**. Artifact 11446158611,8,418,475 bytes, SHA256 `d5f2c34aa56422e179ec7b90e601291af5a2b4bd65bcfa9ee6533b32eefb8081`, ZIP CRC and all 14 built-file hashes were independently checked. These tests did not deploy Railway or validate real offsite/provider/legal/device operations.

Native fc6 [run 37534825214](https://github.com/ziko1/knaba/actions/runs/37534825214) has iOS **PASS** (simulator build/plist/15 XCTest / six OS locales/all 45 bundle hashes). Android 36 locale/projection/generation and 16 geometry host vectors passed, but lint **FAILED** with 3 errors/7 warnings; an APK was produced without a verified signing step in this failed run. [iOS receipt](evidence/native-run-37534825214-summary.json) and [application receipt Android appendix](evidence/ci-run-37534825577-summary.json) preserve verified hashes and exact limits. New Android lint fixes require new execution. Stable signing, installable signed IPA and physical OS/GPS/battery acceptance remain NOT_RUN.

Later source is in progress / **FINAL_CI_PENDING**: canonical JSONB cache/fingerprint fixes, additional operations policies, bounded validated automation schedule/access and native lint corrections. **21 browser scenarios are authored: 20 actual backend/UI plus one existing explicit mocked customer AI-draft transport fixture**. The 21st actual automation create/preview/activate/access scenario is unexecuted. Focused regressions do not establish a current global count or final hosted PASS.

Earlier exact-source [3c85 application](evidence/ci-run-37529346179-summary.json) passed 802/802 including 94 genuine PG but browser 11/14 overall FAILED; [3c85 native](evidence/native-run-37529346218-summary.json) passed Android debug/lint and iOS simulator / 4 XCTest. [942b application](evidence/ci-run-37525960411-summary.json) had 439/439 including 39 genuine PG and browser 6/13 overall FAILED, with separate [native receipt](evidence/native-run-37525960129-summary.json). These remain historical, rather than certifying subsequent source.

## Module readiness

All modules below remain **PARTIAL for company production acceptance**; this table distinguishes implemented behavior from actually executed evidence.

| Module | Implemented / verified boundary | Remaining acceptance |
| --- | --- | --- |
| Identity/API | Password/session/CSRF/MFA, fresh scoped roles/delegation, invitations, guest/device identity. Historical fc6 includes genuine authorization SQL; latest authority/cache changes require rerun | Current deployed negative tests, company owner/MFA/key recovery |
| Commerce/dispatch/Issues | Deterministic prices/quotes/changes, reservations, customer memberships, contextual private Issues and canonical rework/continuation links; synthetic domain execution recorded | Current deployed complete workflows and company commercial/crew/legal decisions |
| Sites/tasks/import/quality | Acyclic locations, exact team quantities/allocations, bounded CSV/XLSX preview/commit, review/rework and templates. New calendar planner and atomic catch-up integrated | Current operations policy/cron changes need hosted repeat; company floor conventions/field workflows remain external. Multiple agreed circles meet spec491; polygon is optional |
| Time/trips/GPS | UTC half-open intervals, separate activity/presence/timesheet states, approved corrections, event-time route gates, deletable raw GPS, exact TTL and hold-aware purge. Historical fc6 genuine PostgreSQL includes GPS lifecycle cases | New SQL repeat, native/physical privacy and company legal policy; no automatic wage deductions or physical presence claim |
| Chat/translation/WhatsApp/router | Fresh memberships/history/media ACL, durable signed official inbox, callbacks/replies, encrypted bounded native queue and persistent manual wizard | Current router/runtime SQL/business execution; real Meta account/version/template/recipient acceptance |
| AI governance/internal drafts | Scoped catalog/knowledge/price lookup, category budgets, safe cost telemetry, pure SIMULATED playground; own-original internal request, minimized references and explicit canonical draft confirmation | fc6 actual usage/playground/provider-disabled request UI passed;4 internal genuine PostgreSQL failures require correction/rerun. Real transfer/model remains external; customer draft mock proves UI gating only |
| Inventory/procurement | Integer stock ledger, custody/transit/use, reservations, shortage, review/receipt and exact conversion; synthetic execution | Real supplier/order/physical stock acceptance |
| Payroll/payout | Approved-time preliminary amounts, separate accountant document and actual payment/employee statement; synthetic execution | Accountant/legal calculation acceptance, real bank/payment evidence |
| Media/reports/exports | Verified originals/private sanitized copies, immutable snapshots and actual PDF/CSV/XLSX bytes; private storage/scanner adapter tests | Current browser exports/Issues, real approved S3/scanner/offsite operation and applicable invoice requirements |
| Web/PWA/maps/advisory | Six languages, scoped console/portal/forms, importer, private chat/media, operator inbox, SVG route view, read-only time guidance and bounded tab-memory nonsensitive queue/manual retry |fc6 handoff/map/advisory/governance UI passed; offline retry stopped at locator failure. Current 21 cases need new execution; no external maps/legal compliance/sensitive persistence/full offline app claim |
| Native companions | Kotlin/SwiftUI leases/privacy stop/encrypted queues; fc6 iOS six-language/card simulator / 15 XCTest verified; Android 52 JVM vectors pass but lint FAILED | New Android lint fix execution pending; iOS later source changes require their own acceptance; stable company signing, installation and physical OS/GPS/battery/offline acceptance |
| Automation/worker/privacy | Durable leased outbox/fencing, typed limited rules, calendar transactions and reviewed scoped CHAT/MEDIA erasure with quiescence/retention guards | Current validated daily/weekly Europe/Berlin schedule/access and 21st UI case need execution; arbitrary cron optional. Full DSAR/provider/device/backups fulfillment remains pending |
| Infrastructure/recovery | Pinned source/builds/migrations and encrypted guarded backup/restore; historical real restore/restart passed. Restore requires separately trusted current erasure ledger. First staging failed; strict-TLS Railway variant actually built/passed source-worker gate in fc6 hosted CI, no successful Railway build observed | Dashboard2FA apply concrete build/reference corrections, then observe DB/API readiness, connect worker, complete live acceptance, offsite recovery/alerts/RPO/RTO and measured cost |

## Verified downloadable historical native artifacts

Latest iOS artifact describes historical **fc6 source**, while the last fully lint/signature-checked Android artifact below describes **3c85**. Neither is a company production distribution. The current fc6 Android APK exists in a lint-failed archive; it has not been accepted as a release.

| Artifact | Actual verified payload / access |
| --- | --- |
| fc6 iOS simulator | [Artifact 11446272184](https://github.com/ziko1/knaba/actions/runs/37534825214/artifacts/11446272184), outer ZIP 5,562,756 bytes SHA256 `8ecd2d9ef8de44597b4254ca8ae7bdfbd87f6d912217984c79bd0c8984178e14`; inner simulator ZIP 5,505,381 bytes SHA256 `e6ef747b9e004c3090416abde39f89f8600f2c22478c232e245a807442cc6c87`. All 45 bundle files/CRC verified; unsigned simulator, no signed-phone installation claim |
| Historical 3c85 Android debug | [Artifact 11444125616](https://github.com/ziko1/knaba/actions/runs/37529346218/artifacts/11444125616); [KNABA-DE-Android-debug-3c85adc.apk](../artifacts/KNABA-DE-Android-debug-3c85adc.apk),881,684 bytes SHA256 `c741191c1ffd2d7da66a7cc6c1188961fa5ed145671e602eba7079c3802f1712`. Ephemeral debug key only; actual old lint/signature checks passed |
| fc6 Android lint-failed APK | ActualAPK 939,944 bytes SHA256 `7d04d1ae24c82b6d71368487030580371d9a5d86b112b56744fdbf5d61cd91e6`; archive 935,593 bytes SHA256 `a30e9c3111442c1fb1fa86780341d6c42a9d575a2595e270f0533bfbfc422c75`. APK existence does not satisfy lint/signing/physical acceptance; new fixed build pending |

Earlier 3c85/942b simulator and APK hashes remain in their original receipts without source relabelling.

The actualfc6 hosted Docker image ID is `sha256:60d62334b1d115abca43f0cfee25cd585767752ae8f1ae282f4f39304ccb8cc5`. Its exact source/worker release gate passed. Gitless context correctly records `source_dirty:null`; this image result does not establish successful Railway application.

Source/runtime archives and synthetic PDF/XLSX/CSV examples listed in `artifacts/RELEASE_MANIFEST.json` retain their recorded hashes and source identities. Verify those identities before using an archive; this document does not relabel historical bytes as a current release.

## Required continuation and secure transfer

1. Complete new security tests, freeze/publish one exact candidate, and execute fresh full hosted CI/native runs. Inspect actual container, SQL, all 21 browser, restore and worker receipts; repeat confirmed failures on a new SHA. Preserve source, artifact and runtime identities separately.
2. Resume only the project/environment in [RAILWAY_STAGING.md](RAILWAY_STAGING.md). Prepare the Railway Dockerfile variant, exact tested source pin and explicit service references for shared configuration. The original patch was accepted before 20:55:09Z; the correction now requires provider dashboard 2FA and remains unapplied. User authorization persists within scope. After dashboard application, read back configuration/cutoff and verify private DB/API terminal success/readiness, then connect and start worker from the same tested source SHA.
3. Create the reviewed staging marker only after terminal API and worker deployment SUCCESS. The prepared [live workflow](../.github/workflows/staging.yml) checks actual HTTPS SHA/assets and real recipient-private WEB worker delivery before 21 browser cases (20 actual backend/UI and one explicit mocked AI-draft transport fixture); traces/tokens are excluded and receipts retain 7 days. This workflow has **not run against Railway**.
4. Record actual consumption/cost and cutoff behavior without changing shared workspace controls. Permanent hosting, offsite backup/retention/RPO/RTO and permitted alert recipients need their own measured acceptance.
5. Resolve the [single external prerequisite list](EXTERNAL_PREREQUISITES.md): company ownership/key/signing custody, physical native/privacy tests, applicable legal/accounting documents and approved providers. No real messages, procurement, payments or production GPS were generated.
6. Transfer controlled repository/domain/hosting/Meta/data/signing/recovery assets through the approved secure channel, record company acceptance and revoke temporary access.

Read [architecture](ARCHITECTURE.md), [data model](DATA_MODEL.md), [API contracts](API_CONTRACTS.md), [roles](ROLE_MATRIX.md), [user guide](USER_GUIDE_DE.md), [bot guide](BOT_ADMIN_GUIDE.md), [mobile guide](MOBILE.md), [legal checklist](legal/LEGAL_CHECKLIST_DE.md), [PROJECT_MEMORY](../PROJECT_MEMORY.md) and [verification ledger](TEST_EVIDENCE.md). No code, marker, commit, merge or Railway mutation was performed by this documentation update.
