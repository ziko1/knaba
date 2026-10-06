# KNABA DE handover and actual readiness

Checkpoint: **2026-10-06**. **Public staging is NOT_READY; company production is not accepted.** Latest executed source `9d94babd2fde620c018b81ca6d83d8e77a9b0c3e` passed **1367/1367 tests (1205 CPU/explicit doubles, 162 genuine PostgreSQL)** and all **20 actual backend/UI browser cases**. The separate mocked customer-draft transport case failed during teardown, so application workflow 37537880427 remains **FAILED, 20/21 browser**. Docker/source-worker verification, encrypted backup/tamper rejection, restore of 17 tables with 7 blob checks and bundled-worker restart passed. Native 37537880382 passed Android 52 host vectors/lint0 errors / 8 warnings and iOS simulator/15 XCTest; downloaded payloads and signatures/hashes were independently checked.

Subsequent **uncommitted** source implements mandatory operational digests, own activity/unread notifications and real client-photo masks/redaction. Its **24 authored browser cases (23 actual backend/UI, one explicit transport fixture)**, full genuine SQL and exact release acceptance are **FINAL_CI_PENDING / NOT_RUN** at the next SHA. Local CPU checks do not certify PostgreSQL or deployed operation. The [ledger](TEST_EVIDENCE.md) and exact [application](evidence/ci-run-37537880427-summary.json)/[native](evidence/native-run-37537880382-summary.json) receipts retain these distinctions.

Railway correction patch `6aa92092-b449-4e17-8161-b0b4bc8c47eb` has **28 staged non-destructive changes, unapplied** behind provider Dashboard MFA/2FA. The first application at 20:55:09Z failed API build and crashed PostgreSQL; no corrected terminal success, runtime SHA or readiness is observed. [Exact isolated continuation](RAILWAY_STAGING.md) preserves the original cutoff and budget.

## Release identity and access

| Item | Actual state |
| --- | --- |
| Separate repository | `/workspace/knaba-de`, independent of AVENQO; public [ziko1/knaba](https://github.com/ziko1/knaba), branch `knaba-staging` |
| Review | [PR1](https://github.com/ziko1/knaba/pull/1) remains draft; main unchanged, no merge approval inferred |
| Master specification | [KNABA_DE_MASTER_SPEC.md](../KNABA_DE_MASTER_SPEC.md), byte-preserved V3 SHA256 `bc506661b5ee013f9948ead7ac2ff98c00fb77d3d00af1de61a2851516cdc683` |
| Latest executed source/tree | `9d94babd2fde620c018b81ca6d83d8e77a9b0c3e` / `29abe07885dcd54479a102ac795b3e615e2bcb63`; current uncommitted source supersedes it |
| Application CI | [37537880427](https://github.com/ziko1/knaba/actions/runs/37537880427), job 112523382809:1367/1367 PASS, 20 actual browsers PASS, one mocked teardownFAIL; overallFAILED |
| Native CI | [37537880382](https://github.com/ziko1/knaba/actions/runs/37537880382), both jobs PASS; debug/simulator and independent cryptographic checks only |
| Staging address | [https://api-staging-a476.up.railway.app](https://api-staging-a476.up.railway.app), allocated **NOT_READY**, not a verified working product URL |
| Railway | Initial API 4356abfe…FAILED/PG f7192f59…CRASHED, worker OFFLINE; 28 staged corrections require Dashboard 2FA and remain NOT_APPLIED |
| Staging boundary | SyntheticDEMO only, absolute cutoff **2026-10-07T20:11:52Z**, authorized EUR10/month; bounded trial is not permanent cost acceptance |
| Production/company controls | Company owner/MFA/key/domain/provider/legal/accounting/signing/physical acceptance unresolved in the [single list](EXTERNAL_PREREQUISITES.md) |
| Artifacts/runtime | Each manifest describes its own exact source. Old source/runtime bundles and local dist are not proof of a newly deployed runtime |

## Verified exact-source artifacts

| Historical9d94 artifact | Independently verified bytes / limit |
| --- | --- |
| Application evidence | [11447019537](https://github.com/ziko1/knaba/actions/runs/37537880427/artifacts/11447019537), 5, 126, 378 bytes SHA256 `05bd9aef842280ee93a449e6e8eca696eb4782fdefbb1228cccd5c5e6192de40`; CRC/all 14 built hashes checked. Final source/runtime/docs packaging was skipped after browser teardown failure |
| Android debug | [11447096350](https://github.com/ziko1/knaba/actions/runs/37537880382/artifacts/11447096350), outer935, 814 bytes SHA256 `d08a7137b33e37f40230480b72e4e74a715e1da560c93c205a038aee0d13376f`; APK940, 080 bytes SHA256 `2a4ad659e7159a27d4faaebc6b5acc71f504291903862789fa9c141ab2c4711c`. Actual debug assemble/lint passed; APKv2 RSA content/signature verified with ephemeral debug certificate |
| iOS simulator | [11447771132](https://github.com/ziko1/knaba/actions/runs/37537880382/artifacts/11447771132), outer5, 561, 769 bytes SHA256 `2d40aeb334a0badc231f4e7d0215239bbb3bba286801a883d9a0a9bbffbf5788`; inner5, 505, 381 bytes SHA256 `79bf37114af23550b4abacb8d800ffd862a4d88e6fb1af955bb3e94ca0000b98`. All45 bundle files, CRC and arm64 simulator Mach-O signature pages checked; 15 XCTest passed. Ad-hoc linker only, no company team/provisioning/signed IPA |
| Hosted Railway-compatible image | `sha256:5e587fdd5482d2d5853e0c207342d789be2844460f132ca149cf3a023233f4d7`, exact 9d94 source-worker gate PASS; Gitless `PINNED_CONTAINER_CONTEXT`, `source_dirty:null`. No Railway build/start acceptance implied |

No artifact above establishes stable company signing, phone installation, physical GPS/battery or production distribution. The actual native receipt explicitly preserves those NOT_RUN boundaries. Current source changes require their own exact-SHA artifact acceptance.

## Module readiness

Production acceptance remains **PARTIAL** until applicable company/external gates are satisfied. These module summaries do not mark whole requirement criteria PASSED from a single test.

| Module | Implemented / executed boundary | Remaining acceptance |
| --- | --- | --- |
| Identity/API | Fresh session/CSRF/MFA/scoped roles, delegation and customer/device authority; 9d94 genuine SQL and actual browser checks passed | New-source repeat, company owner/key/recovery and deployed negatives |
| Commerce/dispatch/Issues | Exact quotes/accepted changes, reservations/context/rework/continuations and private customer workflows; synthetic execution | New-source repeat and real commercial/crew/representative/legal decisions |
| Sites/tasks/import/quality | Revisioned acyclic locations, CSV/XLSX reviewed commit, team quantities, review/rework and calendar/automation access; 9d94 actual UI passed | Current deployed scope/field conventions. Multiple agreed circles satisfy spec491; polygon remains optional |
| Time/trips/GPS | Contiguous UTC facts, independent presence/activity/timesheet, approved corrections, coordinate-free receipts/deletable raw GPS and TTL/hold safeguards; 9d94 genuine SQL passed | Current repeat plus company GPS/legal/physical/privacy/pay policy; no automatic deductions |
| Communications/operator handoff | Fresh memberships/history/media ACL, durable router/callback/wizard; 9d94 actual guest claim/original/reply and private reads passed | Current repeat, real Meta capability/template/recipient and provider acceptance |
| AI governance/internal drafts | Pure SIMULATED playground, safe usage/category budgets, own-original leased private drafts and explicit fresh confirmation; 9d94 genuine SQL passed, including fixes for prior fc6 failures | New-source repeat; real transfer/key/model evaluation remains external. Customer transport mock is not inference proof |
| Inventory/procurement | Integer ledger/custody/use/reservations/conversion/shortage/review/receipt implemented and synthetically tested | Real supplier/order/material/physical stock acceptance |
| Payroll/payout | Approved-time preliminary amounts, separate accountant document and actual payment statements/corrections implemented | Accountant/tax/tariff/company pay rules and real transfer proof |
| Media/reports/exports | Private original/client copies, immutable reports and actual PDF/CSV/XLSX; 9d94 browser exports/blob restore passed | New real mask/redaction flow is IMPLEMENTED / full SQL+rendered NOT_RUN; approved storage/scanner/invoice/Abnahme conditions remain external |
| Web/PWA/map/advisory | Six-language console/portal, scoped SVG, readonly working-time guidance and bounded original-key manual queue; all 20 actual 9d94 browsers passed, including offline acknowledgment | Current 24-case repeat; SVG is not physical GPS, advisory not legal certification, and queue not a full offline database |
| Activity/unread panel | Own notification/delivery status, fresh versioned acknowledgment and authorized unread-channel opening implemented | Current-source genuine SQL and rendered acceptance NOT_RUN |
| Operational digests | Scoped configurable morning/day/week schedule, readonly projected preview, immutable owner-private snapshots and leased/deduplicated worker pipeline implemented | New 16 authored real PG cases and actual rendered scenario are NOT_RUN at next SHA; no provider/finance/privacy bypass claimed |
| Native companions | Kotlin/SwiftUI, six languages, privacy leases/encrypted queue; 9d94 Android 52 host / lint0 errors / 8 warnings and iOS15 XCTest passed; payload crypto verified | Company stable signing/provisioning, phone install and physical background/offline/GPS/battery acceptance |
| Automation/worker/privacy | Fresh rule/run/receipt/human-owner/lease authority, bounded Berlin daily/weekly schedules, calendar and scoped erasure; 9d94 SQL/automation browser/restart passed | Current repeat and independent DSAR/provider/device/backups fulfillment; arbitrary cron optional |
| Infrastructure/recovery | Exact build/image gates, encrypted backup/tamper/restored copy of 17 tables with 7 blob checks and actual worker restart passed at 9d94 | NewSHA acceptance, Dashboard 2FA apply28 corrections, actual DB/API/worker ready URLs and measured cost/offsite recovery/alerts/RPO/RTO |

## Historical evidence

[fc6 application](evidence/ci-run-37534825577-summary.json) remains FAILED 1221/1225 with4PG failures/browser19/20; [fc6 native](evidence/native-run-37534825214-summary.json) records iOS15 PASS and Android lint failure. Their corrections passed only at the later9d94 source described above. [3c85 application](evidence/ci-run-37529346179-summary.json)/[native](evidence/native-run-37529346218-summary.json) preserve802tests/94PG and11/14browser overallFAIL with both native jobs PASS. [942b application](evidence/ci-run-37525960411-summary.json)/[native](evidence/native-run-37525960129-summary.json) preserve439tests/39PG and6/13browser overallFAIL. Old APK/simulator/source/runtime/doc examples retain their original hashes and identities; they are never relabelled current.

## Required continuation

1. Freeze/publish the current three-module source plus transport teardown correction; execute exact full SQL/build/container/native-as-changed and all 24 browser cases. Preserve the 9d94 failed workflow as historical evidence; do not infer new acceptance from local CPU checks.
2. Pin that testedSHA and matching GIT_SHA in the complete isolated Railway correction. Existing task authorization persists, but provider Dashboard 2FA must apply the28 staged changes. Read back original cutoff and private DB/API terminal success/readiness, then worker at the same tested source.
3. Create the staging marker only after API and worker terminalSUCCESS/ready. The [live workflow](../.github/workflows/staging.yml) checks exact HTTPS SHA/assets and real recipient-private WEB worker delivery before24 browser cases; traces/cookies/tokens excluded, receipts retained 7days. It has **not run against Railway**.
4. Observe cost/cutoff/recovery/alert operation without changing unrelated projects or shared billing controls. Resolve the [single external prerequisite list](EXTERNAL_PREREQUISITES.md), record company asset-control acceptance and securely revoke temporary access.

Read [architecture](ARCHITECTURE.md), [data model](DATA_MODEL.md), [API](API_CONTRACTS.md), [roles](ROLE_MATRIX.md), [user guide](USER_GUIDE_DE.md), [bot guide](BOT_ADMIN_GUIDE.md), [mobile](MOBILE.md), [legal checklist](legal/LEGAL_CHECKLIST_DE.md), [memory](../PROJECT_MEMORY.md) and [roadmap](../MASTER_ROADMAP.md). This documentation update performs no source/marker/commit/merge or Railway mutation.
