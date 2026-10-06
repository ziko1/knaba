# KNABA DE handover and actual readiness

Checkpoint: **2026-10-06**. **Public staging is NOT_READY; company production is not accepted.** Latest executed source `61a437e878bc72c958a9f3acab2c4016d979d831`, tree `97f0b929b930d0431cd17c00bbbabf85ae0f90a2`: **1471/1472 PASS, one FAIL, zero SKIP: 1279 CPU/explicit doubles PASS and 192/193 genuine PostgreSQL PASS**. Application run **37540400048** is **FAILED**, including the expired/replaced digest-lease PostgreSQL case (expected one snapshot, observed zero) and **23/24 browser PASS**: 22 actual backend/UI plus the explicit transport fixture passed; the actual digest case failed at its label locator. Strict TypeScript/build, all 14 built-file attestations, hosted Docker/source-worker gate, encrypted backup/tamper rejection, distinct restore of **17 tables / 10 private blobs** and actual bundled-worker restart passed. Final source/runtime/docs packaging was skipped. Native run **37540400013** passed Android 52 host vectors, debug assemble, lint 0 errors / 8 warnings and independent APK cryptographic/content checks. iOS unsigned simulator compile passed, but the exact iOS 18.5/iPhone 16 destination was unavailable: **zero XCTest cases executed, archive/hash stage skipped, native workflow FAILED**. Runtime availability was not diagnosed in that run; SDK availability alone is not a working simulator.

Current **uncommitted** amendments correct the digest browser label/navigation and saved-snapshot viewer, the replaced-lease test retry fixture, and deterministic iOS 18.5 runtime/device preparation. Their exact-source full SQL, all **24 browser cases (23 actual backend/UI, one explicit transport fixture)**, build/container and native acceptance remain **FINAL_CI_PENDING / NOT_RUN** at the next SHA. Local CPU/static checks do not certify PostgreSQL, simulator execution or deployed operation. The [ledger](TEST_EVIDENCE.md) and exact [application](evidence/ci-run-37540400048-summary.json)/[native](evidence/native-run-37540400013-summary.json) receipts preserve executed-source boundaries; the earlier 9d94 receipts remain historical.

Railway correction patch `6aa92092-b449-4e17-8161-b0b4bc8c47eb` has **28 staged non-destructive changes, unapplied** behind provider Dashboard MFA/2FA. The first application at 20:55:09Z failed API build and crashed PostgreSQL; no corrected terminal success, runtime SHA or readiness is observed. [Exact isolated continuation](RAILWAY_STAGING.md) preserves the original cutoff and budget.

## Release identity and access

| Item | Actual state |
| --- | --- |
| Separate repository | `/workspace/knaba-de`, independent of AVENQO; public [ziko1/knaba](https://github.com/ziko1/knaba), branch `knaba-staging` |
| Review | [PR1](https://github.com/ziko1/knaba/pull/1) remains draft; main unchanged, no merge approval inferred |
| Master specification | [KNABA_DE_MASTER_SPEC.md](../KNABA_DE_MASTER_SPEC.md), byte-preserved V3 SHA256 `bc506661b5ee013f9948ead7ac2ff98c00fb77d3d00af1de61a2851516cdc683` |
| Latest executed source/tree | `61a437e878bc72c958a9f3acab2c4016d979d831` / `97f0b929b930d0431cd17c00bbbabf85ae0f90a2`; current uncommitted amendments supersede it |
| Application CI | [37540400048](https://github.com/ziko1/knaba/actions/runs/37540400048), job 112531727859:1471/1472 PASS, one real PG failure; browser23/24, one actual digest label failure; overall FAILED |
| Native CI | [37540400013](https://github.com/ziko1/knaba/actions/runs/37540400013):Android PASS with debug crypto proof; iOS compile PASS but0 XCTest / no archive, overallFAILED |
| Staging address | [https://api-staging-a476.up.railway.app](https://api-staging-a476.up.railway.app), allocated **NOT_READY**, not a verified working product URL |
| Railway | Initial API 4356abfe…FAILED/PG f7192f59…CRASHED, worker OFFLINE; 28 staged corrections require Dashboard 2FA and remain NOT_APPLIED |
| Staging boundary | SyntheticDEMO only, absolute cutoff **2026-10-07T20:11:52Z**, authorized EUR10/month; bounded trial is not permanent cost acceptance |
| Production/company controls | Company owner/MFA/key/domain/provider/legal/accounting/signing/physical acceptance unresolved in the [single list](EXTERNAL_PREREQUISITES.md) |
| Artifacts/runtime | Each manifest describes its own exact source. Old source/runtime bundles and local dist are not proof of a newly deployed runtime |

## Verified exact-source artifacts

| Latest 61a artifact | Independently verified bytes / limit |
| --- | --- |
| Application evidence | [Artifact11448696470](https://github.com/ziko1/knaba/actions/runs/37540400048/artifacts/11448696470): 14,706,455 bytes SHA256 `0208b739a8983af3a5637365ea81b9bb611d301ae044729184579bbdc8a4db5d`; CRC/all 14 built hashes checked. SQL/browser failure remains; final source/runtime/docs packages not produced |
| Android debug | [Artifact11447894641](https://github.com/ziko1/knaba/actions/runs/37540400013/artifacts/11447894641), outer935,814 bytes SHA256 `7c0a8ba89f045ffef8c4197d6c3ab4ba35b2d85f28666957fc2d835734616986`; APK940,080 bytes SHA256 `73b3fb684db3f043cd1e3097583a46b853c5ae4c0c83d3abd06ca9ca8211a445`. APKv2 RSA content/signature and tamper rejection checked; ephemeral debug signing only |
| iOS failed-run evidence | [Artifact11447474576](https://github.com/ziko1/knaba/actions/runs/37540400013/artifacts/11447474576), 15,288 bytes SHA256 `e446efd94f09f88edece683589104201b102d4ba95e40bb248af1241a343443e`;17 ZIP entries CRC checked. CompilePASS,0 XCTest, no simulator app archive or executable-signature proof |

| Historical 9d94 artifact | Independently verified bytes / limit |
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
| Identity/API | Fresh session/CSRF/MFA/scoped roles, delegation and customer/device authority; 61a identity/authorization cases passed | New-source repeat, company owner/key/recovery and deployed negatives |
| Commerce/dispatch/Issues | Exact quotes/accepted changes, reservations/context/rework/continuations and private customer workflows; synthetic execution | New-source repeat and real commercial/crew/representative/legal decisions |
| Sites/tasks/import/quality | Revisioned acyclic locations, CSV/XLSX reviewed commit, team quantities, review/rework and calendar/automation access; 61a actual task/import UI cases passed | Current deployed scope/field conventions. Multiple agreed circles satisfy spec491; polygon remains optional |
| Time/trips/GPS | Contiguous UTC facts, independent presence/activity/timesheet, approved corrections, coordinate-free receipts/deletable raw GPS and TTL/hold safeguards; 61a time/GPS cases passed | Current repeat plus company GPS/legal/physical/privacy/pay policy; no automatic deductions |
| Communications/operator handoff | Fresh memberships/history/media ACL, durable router/callback/wizard; 61a actual guest claim/original/reply and private reads passed | Current repeat, real Meta capability/template/recipient and provider acceptance |
| AI governance/internal drafts | Pure SIMULATED playground, safe usage/category budgets, own-original leased private drafts and explicit fresh confirmation; 61a internal-draft SQL cases passed, including fixes for prior fc6 failures | New-source repeat; real transfer/key/model evaluation remains external. Customer transport mock is not inference proof |
| Inventory/procurement | Integer ledger/custody/use/reservations/conversion/shortage/review/receipt implemented and synthetically tested | Real supplier/order/material/physical stock acceptance |
| Payroll/payout | Approved-time preliminary amounts, separate accountant document and actual payment statements/corrections implemented | Accountant/tax/tariff/company pay rules and real transfer proof |
| Media/reports/exports | Private originals/client copies, immutable reports, real masks/redaction and PDF/CSV/XLSX;61a media SQL/rendered cases and 10-blob restore passed | New-source repeat; approved storage/scanner/invoice/Abnahme conditions remain external |
| Web/PWA/map/advisory | Six-language console/portal, scoped SVG, readonly working-time guidance and bounded original-key manual queue; 61a map/advisory/offline acknowledgment cases passed; aggregate22/23 actual browsers passed | Current 24-case repeat; SVG is not physical GPS, advisory not legal certification, and queue not a full offline database |
| Activity/unread panel | Own notification/delivery status, fresh versioned acknowledgment and authorized unread-channel opening implemented | 61a own-activity 6/6 SQL and rendered case passed; later amendments need repeat |
| Operational digests | Scoped configurable morning/day/week schedule, readonly projected preview, immutable owner-private snapshots and leased/deduplicated worker pipeline implemented | 61a digest 15/16 SQL passed with lease case FAILED; rendered digest label FAILED; retry-fixture/navigation/viewer amendments need next-SHA acceptance. No provider/finance/privacy bypass claimed |
| Native companions | Kotlin/SwiftUI, six languages, privacy leases/encrypted queue; 61a Android 52 / lint 0 errors / 8 warnings/debug crypto PASS; iOS compile-only,0 XCTest / no archive. Historical 9d94 iOS 15 PASS | Company stable signing/provisioning, phone install and physical background/offline/GPS/battery acceptance |
| Automation/worker/privacy | Fresh rule/run/receipt/human-owner/lease authority, bounded Berlin daily/weekly schedules, calendar and scoped erasure; 61a automation/worker/privacy cases and actual restart passed | Current repeat and independent DSAR/provider/device/backups fulfillment; arbitrary cron optional |
| Infrastructure/recovery | Exact build/image gates, encrypted backup/tamper/restored copy of 17 tables /10 private blobs and actual worker restart passed at 61a | New SHA acceptance, Dashboard 2FA apply28 corrections, actual DB/API/worker ready URLs and measured cost/offsite recovery/alerts/RPO/RTO |

## Historical evidence

[9d94 application](evidence/ci-run-37537880427-summary.json) preserves 1367/1367 PASS (1205CPU/162PG), all 20 actual browsers PASS and one mocked teardownFAIL; [9d94 native](evidence/native-run-37537880382-summary.json) preserves Android 52 / lintPASS and iOS 15 XCTest PASS with its own artifacts. [fc6 application](evidence/ci-run-37534825577-summary.json) remains FAILED 1221/1225 with4PG failures/browser19/20; [fc6 native](evidence/native-run-37534825214-summary.json) records iOS 15 PASS and Android lint failure. Their corrections passed only at the later9d94 source described above. [3c85 application](evidence/ci-run-37529346179-summary.json)/[native](evidence/native-run-37529346218-summary.json) preserve802tests/94PG and11/14browser overallFAIL with both native jobs PASS. [942b application](evidence/ci-run-37525960411-summary.json)/[native](evidence/native-run-37525960129-summary.json) preserve439tests/39PG and6/13browser overallFAIL. Old APK/simulator/source/runtime/doc examples retain their original hashes and identities; they are never relabelled current.

## Required continuation

1. Freeze/publish the digest lease-fixture/UI/history-viewer and deterministic iOS simulator amendments; repeat exact full SQL/build/container/native and all 24 browser cases. Preserve 61a's one PG failure, one browser failure and iOS0-XCTest failure as historical evidence; never infer new acceptance from local CPU checks.
2. Pin that testedSHA and matching GIT_SHA in the complete isolated Railway correction. Existing task authorization persists, but provider Dashboard 2FA must apply the28 staged changes. Read back original cutoff and private DB/API terminal success/readiness, then worker at the same tested source.
3. Create the staging marker only after API and worker terminalSUCCESS/ready. The [live workflow](../.github/workflows/staging.yml) checks exact HTTPS SHA/assets and real recipient-private WEB worker delivery before 24 browser cases; traces/cookies/tokens excluded, receipts retained 7days. It has **not run against Railway**.
4. Observe cost/cutoff/recovery/alert operation without changing unrelated projects or shared billing controls. Resolve the [single external prerequisite list](EXTERNAL_PREREQUISITES.md), record company asset-control acceptance and securely revoke temporary access.

Read [architecture](ARCHITECTURE.md), [data model](DATA_MODEL.md), [API](API_CONTRACTS.md), [roles](ROLE_MATRIX.md), [user guide](USER_GUIDE_DE.md), [bot guide](BOT_ADMIN_GUIDE.md), [mobile](MOBILE.md), [legal checklist](legal/LEGAL_CHECKLIST_DE.md), [memory](../PROJECT_MEMORY.md) and [roadmap](../MASTER_ROADMAP.md). This documentation update performs no source/marker/commit/merge or Railway mutation.
