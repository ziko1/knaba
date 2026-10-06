# KNABA DE handover and actual readiness

Documentation checkpoint: **2026-10-06**. **Public staging is NOT_READY; company production is not accepted.** Latest historical hosted source `3c85adc228ddd5c6078e7bbc05e4d5570625c978` passed 802/802 tests including 94 genuine PostgreSQL cases, but browser 11/14 passed and its application workflow FAILED. Both native jobs passed at that exact SHA. The subsequent working tree is **FINAL_CI_PENDING**, including 20 authored browser cases, new native localization/cards and security fences.

The last observed Railway state remains the failed first application: user-confirmed acceptance returnedSUCCESS before API/PostgreSQL deployment creation at 2026-10-06T20:55:09Z. Metal rejected the API's optional BuildKit secret mount; PostgreSQL CRASHED with its cutoff absent from rendered variables. Worker was OFFLINE without source. Applying prepared corrections returned provider TWO_FACTOR requiring dashboard 2FA; no corrected deployment success, runtime SHA or ready response is observed.

The [full V3 specification](../KNABA_DE_MASTER_SPEC.md), [roadmap](../MASTER_ROADMAP.md), [requirements matrix](requirements/REQUIREMENTS_TRACEABILITY.md) and [single external prerequisite list](EXTERNAL_PREREQUISITES.md) retain unresolved acceptance. Historical execution never certifies later source changes.

## Release identity and access

| Item | Actual state |
| --- | --- |
| Separate repository | Local `/workspace/knaba-de`, independent of AVENQO; user-provided public [ziko1/knaba](https://github.com/ziko1/knaba), branch `knaba-staging` |
| Review | [PR1](https://github.com/ziko1/knaba/pull/1) is **draft**; `main` unchanged |
| Full specification | Preserved `KNABA_DE_MASTER_SPEC.md`, SHA256 `bc506661b5ee013f9948ead7ac2ff98c00fb77d3d00af1de61a2851516cdc683` |
| Latest executed remote source (historical) | `3c85adc228ddd5c6078e7bbc05e4d5570625c978`; later working-tree source is not yet a tested release |
| Historical matching local source | `118a11bb43fb784a7ab760fb13a1dc23ba21e08e`, tree `9dc49a7daf09e1f05805e604d0b1cf168f09e2c4`; substantial later code changes supersede both |
| Latest executed application CI | [37529346179](https://github.com/ziko1/knaba/actions/runs/37529346179), **FAILED**:802 tests PASS, browser 11/14PASS, 3FAIL; exact historical 3c85 source |
| Latest executed native CI | [37529346218](https://github.com/ziko1/knaba/actions/runs/37529346218), Android and iOS **PASSED** at 3c85; subsequent localized native source not yet compiled |
| Allocated staging address | [https://api-staging-a476.up.railway.app](https://api-staging-a476.up.railway.app); **not verified live**, no readiness or runtime SHA observed |
| Railway | Initial `accept_deploy` **SUCCESS** committed 13 compacted changes from patch beginning `24e7a116` before 20:55:09Z. API deployment `4356abfe…` **FAILED**; PostgreSQL `f7192f59…` **CRASHED**; worker OFFLINE with no source. Subsequent correction acceptance requires Railway dashboard **2FA**, so the correction is **NOT_APPLIED**. [Exact continuation](RAILWAY_STAGING.md) |
| Staging boundary | Synthetic DEMO only; absolute cutoff **2026-10-07T20:11:52Z** on staged lifecycle commands. Bounded 24-hour test, not a permanent EUR10/month deployment guarantee |
| Production URL / identities | Not established; production owner/keys/domain/Meta/provider/legal/accounting acceptance outstanding |
| Artifact/runtime identity | `artifacts/RELEASE_MANIFEST.json` and `dist/release.json` identify the artifacts they actually describe. Compare each to its exact source SHA; a prior manifest or local bundle is not proof of the current remote runtime |
| Secrets | Platform/company-controlled secret storage only; no credentials in this document or downloadable evidence |

## Actual executed evidence

Latest historical source `3c85adc228ddd5c6078e7bbc05e4d5570625c978` has [application CI 37529346179](https://github.com/ziko1/knaba/actions/runs/37529346179): typecheck/build and **802/802 tests PASSED**, comprising 708 CPU/explicit transport-fixture cases and 94 genuine PostgreSQL cases, zero skipped. Actual encrypted backup, tamper rejection, distinct empty-database restoration of 17 tables/seven private-blob checksum checks and bundled worker heartbeat/restart passed. **Browser 11/14 passed, 3 failed; overall CI FAILED.** [Exact receipt](evidence/ci-run-37529346179-summary.json) and [per-case index](requirements/EXECUTION_INDEX_3C85ADC.json) identify scope and assertions. External AI and S3 transport fixtures remain identified as such; the restore used explicit isolated synthetic data without later-erasure history.

The last full local offline run is **1013 CPU/fixture PASSED,0 failed,139 genuine PostgreSQL SKIPPED of 1152**, recorded in `.local/final-release-offline-tests.json`. It is not a final source freeze: later cache ACL, SSE authority fingerprint and browser-revocation fences require their own tests and a new full hosted run. Current source is **FINAL_CI_PENDING**, rather than current SQL/browserPASS. Twenty rendered scenarios are authored/discovered:19 actual backend/UI and one explicitly mocked customer AI draft transport fixture. New actual cases cover private handoff/claim/reply, original-key offline manual retry, scoped360px map, own read-only time advisory, pure SIMULATED usage/playground and an actual internal draft request that remains PENDING or FAILED PROVIDER_DISABLED with no business effects. Railway HTTPS/browser/worker acceptance remains **NOT_RUN**.

Historical [native CI 37529346218](https://github.com/ziko1/knaba/actions/runs/37529346218) completed both jobs at 3c85: Android compile/lint/debug signature and 16 JVM vectors; unsigned iOS simulator compile/plist and 4 XCTest on iPhone 16/iOS 18.5. Payloads, outer archives and all 39 iOS bundle-file hashes were independently verified. [Exact receipt](evidence/native-run-37529346218-summary.json). Later Android source has six languages / 91 keys,36 Java locale/projection/revocation checks and 16 geo vectors executed on the host; new APK compilation is pending. Later iOS source has six languages / 89 keys and 14 authored XCTest (four previous plus ten new); execution/compilation of this new source is **NOT_RUN**. Static or host checks do not prove Swift/Kotlin compilation, signed installation or physical GPS/battery behavior.

Earlier 942b application/native receipts remain separately preserved: [439-test application run](evidence/ci-run-37525960411-summary.json), browser 6/13 overallFAILED, and [debug/simulator native run](evidence/native-run-37525960129-summary.json). Those bytes are historical and do not certify later code.

## Module readiness

All modules below remain **PARTIAL for company production acceptance**; this table distinguishes implemented behavior from actually executed evidence.

| Module | Implemented / verified boundary | Remaining acceptance |
| --- | --- | --- |
| Identity/API | Password/session/CSRF/MFA, fresh scoped roles/delegation, invitations, guest/device identity. Historical 3c85 includes genuine authorization SQL; later cache/SSE/revocation changes need rerun | Current deployed negative tests, company owner/MFA/key recovery |
| Commerce/dispatch/Issues | Deterministic prices/quotes/changes, reservations, customer memberships, contextual private Issues and canonical rework/continuation links; synthetic domain execution recorded | Current deployed complete workflows and company commercial/crew/legal decisions |
| Sites/tasks/import/quality | Acyclic locations, exact team quantities/allocations, bounded CSV/XLSX preview/commit, review/rework and templates. New calendar planner and atomic catch-up integrated | New-source browser/SQL repeat and company floor conventions/field workflows; historical cases identify their exact source |
| Time/trips/GPS | UTC half-open intervals, separate activity/presence/timesheet states, approved corrections, event-time route gates, deletable raw GPS, exact TTL and hold-aware purge. Historical 3c85 genuinePG includes GPS lifecycle cases | New SQL repeat, native/physical privacy and company legal policy; no automatic wage deductions or physical presence claim |
| Chat/translation/WhatsApp/router | Fresh memberships/history/media ACL, durable signed official inbox, callbacks/replies, encrypted bounded native queue and persistent manual wizard | Current router/runtime SQL/business execution; real Meta account/version/template/recipient acceptance |
| AI governance/internal drafts | Scoped catalog/knowledge/price lookup, category budgets, safe cost telemetry, pure SIMULATED playground; own-original internal request, minimized references and explicit canonical draft confirmation | New actual UI/genuinePG acceptance and approved real provider transfer; PENDING/PROVIDER_DISABLED never confirms business work; mocked customer draft case proves UI gating only |
| Inventory/procurement | Integer stock ledger, custody/transit/use, reservations, shortage, review/receipt and exact conversion; synthetic execution | Real supplier/order/physical stock acceptance |
| Payroll/payout | Approved-time preliminary amounts, separate accountant document and actual payment/employee statement; synthetic execution | Accountant/legal calculation acceptance, real bank/payment evidence |
| Media/reports/exports | Verified originals/private sanitized copies, immutable snapshots and actual PDF/CSV/XLSX bytes; private storage/scanner adapter tests | Current browser exports/Issues, real approved S3/scanner/offsite operation and applicable invoice requirements |
| Web/PWA/maps/advisory | Six languages, scoped console/portal/forms, importer, private chat/media, operator inbox, SVG route view, read-only time guidance and bounded tab-memory nonsensitive queue/manual retry |20 current cases need actual execution; queue cannot show success before matching server acknowledgment. No external map provider, legal compliance, sensitive persistence or full offline app claim |
| Native companions | Kotlin/SwiftUI leases/privacy stop/encrypted queues; historical 3c85 Android APK/iOS simulator verified. New six-language shift cards and revocation fences source-complete | New Android/iOS hosted compile/XCTest pending; stable company signing, installation and physical OS/GPS/battery/offline acceptance |
| Automation/worker/privacy | Durable leased outbox/fencing, typed limited rules, calendar transactions and reviewed scoped CHAT/MEDIA erasure with quiescence/retention guards | Current SQL/live worker evidence; full DSAR/provider/device/backups fulfillment remains pending where not evidenced |
| Infrastructure/recovery | Pinned source/builds/migrations and encrypted guarded backup/restore; historical real restore/restart passed. Restore requires separately trusted current erasure ledger. First staging failed; strict-TLS Railway variant static contracts pass, actual new container CI is prepared but not executed | Dashboard2FA apply concrete build/reference corrections, then observe DB/API readiness, connect worker, complete live acceptance, offsite recovery/alerts/RPO/RTO and measured cost |

## Verified downloadable historical native artifacts

These verified artifacts describe **historical 3c85 source**, not the later localized source or company production. Hosted artifacts expire2026-10-20; the named development payloads below remain separately hash-verified.

| Artifact | Verified payload / access |
| --- | --- |
| Android debug APK | [Hosted artifact 11444125616](https://github.com/ziko1/knaba/actions/runs/37529346218/artifacts/11444125616); [KNABA-DE-Android-debug-3c85adc.apk](../artifacts/KNABA-DE-Android-debug-3c85adc.apk),881684 bytes, SHA256 `c741191c1ffd2d7da66a7cc6c1188961fa5ed145671e602eba7079c3802f1712`. Ephemeral debug certificate; no stable company signing/AAB/device proof |
| iOS simulator ZIP | [Hosted artifact 11443743295](https://github.com/ziko1/knaba/actions/runs/37529346218/artifacts/11443743295); [KNABA-DE-iOS-simulator-3c85adc.zip](../artifacts/KNABA-DE-iOS-simulator-3c85adc.zip),5340734 bytes, SHA256 `fddf79e7583af6914e423d654deff875961fce92defea036188c434a5e98589d`. Unsigned arm64 iPhoneSimulator test host, not an installable signed IPA |

Earlier 942b artifacts and hashes are retained in [their original receipt](evidence/native-run-37525960129-summary.json), without relabelling their bytes or source.

The new hosted CI also builds the actual `infra/Dockerfile.railway` image and verifies image source/worker release identity. Its `PINNED_CONTAINER_CONTEXT` has explicit 40-character source SHA and `source_dirty:null` because `.git` is excluded; it is not falsely reported as a clean Git checkout. This image step is **NOT_RUN** until actual CI evidence exists.

Source/runtime archives and synthetic PDF/XLSX/CSV examples listed in `artifacts/RELEASE_MANIFEST.json` retain their recorded hashes and source identities. Verify those identities before using an archive; this document does not relabel historical bytes as a current release.

## Required continuation and secure transfer

1. Complete new security tests, freeze/publish one exact candidate, and execute fresh full hosted CI/native runs. Inspect actual container, SQL, all 20 browser, restore and worker receipts; repeat confirmed failures on a new SHA. Preserve source, artifact and runtime identities separately.
2. Resume only the project/environment in [RAILWAY_STAGING.md](RAILWAY_STAGING.md). Prepare the Railway Dockerfile variant, exact tested source pin and explicit service references for shared configuration. The original patch was accepted before 20:55:09Z; the correction now requires provider dashboard 2FA and remains unapplied. User authorization persists within scope. After dashboard application, read back configuration/cutoff and verify private DB/API terminal success/readiness, then connect and start worker from the same tested source SHA.
3. Create the reviewed staging marker only after terminal API and worker deployment SUCCESS. The prepared [live workflow](../.github/workflows/staging.yml) checks actual HTTPS SHA/assets and real recipient-private WEB worker delivery before 20 browser cases (19 actual backend/UI and one explicit mocked AI-draft transport fixture); traces/tokens are excluded and receipts retain 7 days. This workflow has **not run against Railway**.
4. Record actual consumption/cost and cutoff behavior without changing shared workspace controls. Permanent hosting, offsite backup/retention/RPO/RTO and permitted alert recipients need their own measured acceptance.
5. Resolve the [single external prerequisite list](EXTERNAL_PREREQUISITES.md): company ownership/key/signing custody, physical native/privacy tests, applicable legal/accounting documents and approved providers. No real messages, procurement, payments or production GPS were generated.
6. Transfer controlled repository/domain/hosting/Meta/data/signing/recovery assets through the approved secure channel, record company acceptance and revoke temporary access.

Read [architecture](ARCHITECTURE.md), [data model](DATA_MODEL.md), [API contracts](API_CONTRACTS.md), [roles](ROLE_MATRIX.md), [user guide](USER_GUIDE_DE.md), [bot guide](BOT_ADMIN_GUIDE.md), [mobile guide](MOBILE.md), [legal checklist](legal/LEGAL_CHECKLIST_DE.md), [PROJECT_MEMORY](../PROJECT_MEMORY.md) and [verification ledger](TEST_EVIDENCE.md). No code, marker, commit, merge or Railway mutation was performed by this documentation update.
