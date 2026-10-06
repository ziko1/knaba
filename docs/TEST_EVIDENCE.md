# Actual verification ledger

Snapshot: **2026-10-06**. Latest executed source `61a437e878bc72c958a9f3acab2c4016d979d831`, tree `97f0b929b930d0431cd17c00bbbabf85ae0f90a2`: **1471/1472 PASS, one FAIL, zero SKIP: 1279 CPU/explicit doubles PASS and 192/193 genuine PostgreSQL PASS**. Application run **37540400048** is **FAILED**, including the expired/replaced digest-lease PostgreSQL case (expected one snapshot, observed zero) and **23/24 browser PASS**: 22 actual backend/UI plus the explicit transport fixture passed; the actual digest case failed at its label locator. Strict TypeScript/build, all 14 built-file attestations, hosted Docker/source-worker gate, encrypted backup/tamper rejection, distinct restore of **17 tables / 10 private blobs** and actual bundled-worker restart passed. Final source/runtime/docs packaging was skipped. Native run **37540400013** passed Android 52 host vectors, debug assemble, lint 0 errors / 8 warnings and independent APK cryptographic/content checks. iOS unsigned simulator compile passed, but the exact iOS 18.5/iPhone 16 destination was unavailable: **zero XCTest cases executed, archive/hash stage skipped, native workflow FAILED**. Runtime availability was not diagnosed in that run; SDK availability alone is not a working simulator. [Exact application receipt](evidence/ci-run-37540400048-summary.json) and [native receipt](evidence/native-run-37540400013-summary.json) retain actual source/artifact boundaries.

Current **uncommitted** amendments correct the digest browser label/navigation and saved-snapshot viewer, the replaced-lease test retry fixture, and deterministic iOS 18.5 runtime/device preparation. Their exact-source full SQL, all **24 browser cases (23 actual backend/UI, one explicit transport fixture)**, build/container and native acceptance remain **FINAL_CI_PENDING / NOT_RUN** at the next SHA. Local CPU/static checks do not certify PostgreSQL, simulator execution or deployed operation.

| Executed 61a check | Actual result | Evidence / limit |
| --- | --- | --- |
| Strict TypeScript/build/exact local runtime | PASSED | Run37540400048/job112531727859, exact 61a source/runtime and all 14 built files independently verified |
| CPU/document/explicit doubles |1279 PASSED,0 FAILED | Provider/storage/transport fixtures remain explicit fixtures |
| Genuine PostgreSQL |192 PASSED,1 FAILED of 193,0 SKIPPED | Expired/replaced digest-lease test expected1 snapshot, observed0. Later maxAttempts fixture correction is NOT_RUN hosted |
| New mandatory-module PostgreSQL |Activity 6/6 PASS; client redaction 9/9 PASS; digest 15/16 PASS,1 FAIL | Exact raw case classification in the 61a receipt; these passing cases do not mark whole requirement criteria accepted |
| Rendered browser |23/24 PASSED,1 FAILED |22 actual backend/UI plus the one explicit customer-draft fixture passed; actual digest case stopped at label locator. Later Director/navigation/saved-viewer amendment not certified |
| Actual Railway-compatible Docker image | PASSED hosted build/source-worker gate | Exact61a `PINNED_CONTAINER_CONTEXT`, `source_dirty:null`; no Railway deployment inferred |
| Encrypted backup/tamper/empty DB+private blobs | PASSED | Actual distinct synthetic restore 17 tables / 10 private blobs; company offsite recovery is separate |
| Bundled worker heartbeat/restart | PASSED | Actual hosted processes/restored copy; Railway consumption remainsNOT_RUN |
| Application artifact | Independently verified |[Artifact11448696470](https://github.com/ziko1/knaba/actions/runs/37540400048/artifacts/11448696470),14,706,455 bytes SHA256 `0208b739a8983af3a5637365ea81b9bb611d301ae044729184579bbdc8a4db5d`,95 CRC entries/all 14 built hashes checked; final source/runtime/docs packaging skipped |
| Android debug/lint/native vectors | PASSED at 61a |52 host Java checks, lint 0 errors/8 warnings; actual debug APKv2 content/signature/tamper verification, ephemeral debug certificate |
| iOS simulator | COMPILE_PASS / XCTEST_NOT_RUN / workflow FAILED |Exact18.5 destination unavailable,exit70 before any XCTest;0 executed cases,archive step skipped,no app/signature/hash proof |

## Historical 9d94 execution

Historical hosted source **`9d94babd2fde620c018b81ca6d83d8e77a9b0c3e`**, tree `29abe07885dcd54479a102ac795b3e615e2bcb63`, passed **1367/1367 tests: 1205 CPU/document/explicit doubles and 162 genuine PostgreSQL, zero failures or skips**. All **20 actual backend/UI browser scenarios passed**. The one explicitly mocked customer draft transport case failed during route teardown, so [application CI 37537880427](https://github.com/ziko1/knaba/actions/runs/37537880427) remains **FAILED**, with 20/21 browser results. [Exact application receipt](evidence/ci-run-37537880427-summary.json) preserves that boundary; it does not relabel the mock as backend acceptance.

| Executed 9d94 check | Actual result | Evidence / limit |
| --- | --- | --- |
| Strict TypeScript/build/exact local runtime | PASSED | Run37537880427/job 112523382809; all 14 built files independently verified and isolated DEMO runtime matched the exact source |
| CPU/document/explicit doubles |1205 PASSED | Synthetic provider/storage/transport cases retain their fixture boundaries |
| Genuine PostgreSQL |162 PASSED, 0 FAILED, 0 SKIPPED | Actual Engine/worker/authorization execution; earlier fc6 failures are superseded only for their corrected 9d94 source |
| Rendered browser |20/21 PASSED; all 20 actual backend/UI PASSED | One explicit transport fixture failed with `route.fetch` after page/context closure during teardown. Historical workflow remains FAILED; the corrected explicit fixture subsequently passed at 61a |
| Actual Railway-compatible Docker image | PASSED hosted image/source-worker check | Image `sha256:5e587fdd5482d2d5853e0c207342d789be2844460f132ca149cf3a023233f4d7`, exact 9d94 `PINNED_CONTAINER_CONTEXT`, `source_dirty:null`; no Railway deployment inferred |
| Encrypted backup/tamper/empty DB+private blobs | PASSED | Actual synthetic restore verified17 tables/7 private-blob checks; company offsite recovery is separate |
| Bundled worker heartbeat/restart | PASSED | Actual hosted processes/restored copy; public Railway worker acceptance remains NOT_RUN |
| Application artifact | Independently verified | [Artifact11447019537](https://github.com/ziko1/knaba/actions/runs/37537880427/artifacts/11447019537), 5, 126, 378 bytes SHA256 `05bd9aef842280ee93a449e6e8eca696eb4782fdefbb1228cccd5c5e6192de40`, CRC/all 14 built hashes checked; final source/runtime/docs packaging was skipped after browser failure |
| Android debug/lint/native vectors | PASSED at 9d94 | Native 37537880382:52 host vectors, lint 0 errors/8 warnings; APKv2 RSA signature/content cryptographically verified with ephemeral debug key, not company release signing |
| iOS simulator/15 XCTest | PASSED at 9d94 | Same native run:15 passed/0 failed/0 skipped; all 45 bundle files/CRC and Mach-O signature pages verified. Simulator/ad-hoc linker signing only, no signed IPA/device claim |

[Native receipt](evidence/native-run-37537880382-summary.json) records exact cryptographic limits and payload hashes. Android APK940, 080 bytes SHA256 `2a4ad659e7159a27d4faaebc6b5acc71f504291903862789fa9c141ab2c4711c`; iOS simulator archive5, 505, 381 bytes SHA256 `79bf37114af23550b4abacb8d800ffd862a4d88e6fb1af955bb3e94ca0000b98`. [Native run37537880382](https://github.com/ziko1/knaba/actions/runs/37537880382) passed both jobs. Company signing, physical GPS/background/battery/privacy and production distribution remain NOT_RUN.

## Historical fc6 execution

| Executed fc6 check | Actual result | Evidence / limit |
| --- | --- | --- |
| Strict TypeScript/build/exact runtime | PASSED | [Run37534825577](https://github.com/ziko1/knaba/actions/runs/37534825577), job 112512993282; exact clean Git-worktree build and isolated DEMO `/version` matched fc6 |
| CPU/document/explicit transport-double assertions |1068 PASSED, 0 FAILED | Exact artifact classification inventory matched every executed case. Model/S3 fixtures remain fixtures |
| Genuine PostgreSQL assertions |153 PASSED, 4 FAILED of 157, 0 SKIPPED | Four failures concern own-source cached draft visibility, atomic parallel confirmation, rollback and actual worker preparation. Receipt retains exact case names/codes; the corrected cases subsequently passed at 9d94; the original failures remain historical |
| Rendered browser |19 PASSED, 1 FAILED of20 |18 actual backend/UI plus one explicit mocked customer draft fixture passed. Offline manual retry case stopped at a strict locator matching two status elements; its later retry/acknowledgment checks did not run. This is a test failure, not a completed acceptance claim |
| Actual Railway-compatible Docker image | PASSED hosted Docker build/source-worker gate | Image `sha256:60d62334b1d115abca43f0cfee25cd585767752ae8f1ae282f4f39304ccb8cc5`; explicitfc6 SHA, `PINNED_CONTAINER_CONTEXT`, `source_dirty:null`. This proves the hosted local image, not a Railway deployment |
| Encrypted backup/tamper rejection | PASSED | Actual encrypted delivery archive and rejection of modified bytes; secret backup/key files excluded from public evidence |
| Distinct empty PostgreSQL/private-blob restore | PASSED | Actual hosted isolated synthetic restoration stage; no company offsite recovery or later-erasure replay claim |
| Bundled worker heartbeat/restart | PASSED | Two actual processes, successful heartbeats, graceful exits and durable synthetic no-op probes on the restored copy; Railway consumption remains NOT_RUN |
| Application artifact integrity | PASSED | Artifact 11446158611, 8, 418, 475 bytes; outer SHA256 `d5f2c34aa56422e179ec7b90e601291af5a2b4bd65bcfa9ee6533b32eefb8081`, ZIP CRC and all 14 built-file hashes independently checked. Raw receipt-file digests are preserved |
| iOS simulator build/plist/15 XCTest | PASSED at fc6 | [Native receipt](evidence/native-run-37534825214-summary.json), [run 37534825214](https://github.com/ziko1/knaba/actions/runs/37534825214), job 112512991328. Six OS locales present; all 45 bundle files independently hashed. Simulator only, no signed IPA/device claim |
| Android native checks |52 JVM checks PASSED; lint FAILED |36 locale/projection/generation plus16 geo vectors. Exact failed archive confirms3 lint errors (MissingPermission and UnspecifiedRegisterReceiverFlag) and7 warnings; debug APK bytes were produced but this native runFAILED. Those lint fixes subsequently passed at 9d94 |

[Hosted application artifact](https://github.com/ziko1/knaba/actions/runs/37534825577/artifacts/11446158611) and [iOS artifact 11446272184](https://github.com/ziko1/knaba/actions/runs/37534825214/artifacts/11446272184) preserve exact source provenance. iOS outer ZIP:5, 562, 756 bytes, SHA256 `8ecd2d9ef8de44597b4254ca8ae7bdfbd87f6d912217984c79bd0c8984178e14`; inner simulator ZIP:5, 505, 381 bytes, SHA256 `e6ef747b9e004c3090416abde39f89f8600f2c22478c232e245a807442cc6c87`. Swift 5 actor-isolation/AppIntents warnings remain recorded. Native run overall **FAILED_ANDROID_LINT** despite successful iOS. Stable company signing, installation, physical GPS/background/battery/privacy-stop and production distribution remain **NOT_RUN**.

## Current source and deployment

| Area | Observed status | Next actual evidence |
| --- | --- | --- |
| Post-61a amendments | UNCOMMITTED / FINAL_CI_PENDING | Freeze digest lease-fixture/UI/history viewer and simulator preparation; repeat full SQL/build/container/native/all 24 rendered cases at next exact SHA |
| Automation authoring/access | Actual 61a relevant backend/UI cases PASSED | Actual rule create→readonly preview→explicit privileged activation and employee denials. Bounded daily/weekly Europe/Berlin grammar is implemented; arbitrary cron is optional |
| Private handoff, map, advisory, AI usage/playground and provider-disabled internal request | Actual 61a relevant backend/UI cases PASSED | Empty authorized SVG is not physical GPS; advisory is unapproved general guidance; playground is SIMULATED; provider-disabled request does not prove real inference |
| Offline queue end-to-end | Actual 61a relevant backend/UI cases PASSED | UNSYNCED→explicit original-key retry→actual server acknowledgment executed at 61a; later amendments need exact-SHA repeat |
| Railway address | ALLOCATED / NOT_READY | `https://api-staging-a476.up.railway.app` has no observed ready/runtime SHA; API/worker offline and PostgreSQL crashed in last readback |
| Corrected Railway application | PREPARED / BLOCKED_EXTERNAL | First API failed on Metal secret mount, PG crashed with missing explicit cutoff reference. Concrete source/Dockerfile/shared-reference/lifecycle patch requires provider dashboard 2FA. Successful hosted Docker build does not apply that patch |
| Live HTTPS/worker/browser verification | NOT_RUN | Marker only after actual API/worker terminalSUCCESS/readiness; verifier observes genuine recipient-private WEB delivery and 24 rendered cases |
| Real providers/company/legal/physical | NOT_RUN / BLOCKED_EXTERNAL | [Canonical22 prerequisites](EXTERNAL_PREREQUISITES.md); generated routes, mocks and simulator checks are not external acceptance |

The isolated target remains project `5701136e-0b7c-48e8-a0c6-5c5a01c4330b`, environment `8ce0753b-b0b6-45f4-b655-6a9f9299ced2`. Its 28 staged corrections remain unapplied behind provider dashboard MFA/2FA; no runtime readiness is observed. Preserve cutoff **2026-10-07T20:11:52Z**, authorized EUR10/month and all other projects/shared billing. The bounded synthetic trial does not verify permanent cost. [Railway history](RAILWAY_STAGING.md) retains actual failures and staged changes.

## Earlier exact-source history

[3c85 application](evidence/ci-run-37529346179-summary.json) executed802/802 tests (708 CPU/fixture, 94 genuine PG), browser 11/14 and overall FAILED; encrypted backup/restore 17 tables / 7 blobs/worker restart passed. [3c85 native](evidence/native-run-37529346218-summary.json) passed Android debug/lint/16 vectors and iOS simulator / 4 XCTest. Its verified Android APK remains [historical 3c85 APK](../artifacts/KNABA-DE-Android-debug-3c85adc.apk), SHA256 `c741191c1ffd2d7da66a7cc6c1188961fa5ed145671e602eba7079c3802f1712`; the older simulator artifact is likewise historical. These results do not certify new source.

[942b application](evidence/ci-run-37525960411-summary.json) executed439/439 including 39 genuine PG, browser 6/13 overall FAILED; [native receipt](evidence/native-run-37525960129-summary.json) records its debug/simulator bytes. Earlier local lease/restore failures, [367-pass offline report](evidence/final-offline-result.json), actual document-reader/ZIP checks and local socket/Chromium EPERM are retained with their own limits. Cancelled requests were CANCELLED/NOT_RUN.

Use exact `built-artifacts.json`, container and live runtime receipts, not an older `release-summary.json` or manifest embedded in an artifact. `dist/release.json` and `artifacts/RELEASE_MANIFEST.json` retain their own source/build identities. Final handover needs a tested new source, matching artifacts/runtime, factual live URLs and independently verified evidence.
