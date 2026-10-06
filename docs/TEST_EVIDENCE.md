# Actual verification ledger

Snapshot: **2026-10-06**. Latest executed hosted source **`fc6c30fc9ff1f6c6c946fe93dd274e0806e3e7d1`**, matching local `dd67043d7f3c5a0107f3eabe6275ad2dd60d4abf`, tree `e1fa5ed7ee7ec076f197ca1341c4a1281b079d88`, has **FAILED** application acceptance: **1221/1225 tests passed, 4 genuine PostgreSQL failures, 0 skipped; browser 19/20 passed, 1 failed**. The exact receipt is [CI 37534825577](evidence/ci-run-37534825577-summary.json). Later source corrections do not change that historical result.

Current source is in progress / **FINAL_CI_PENDING**, including PostgreSQL JSONB fingerprint/cache corrections, additional operations policy regressions, bounded validated automation schedule/access integration and Android lint fixes. The suite now has **21 authored browser scenarios: 20 actual backend/UI plus one existing explicit customer AI-draft transport fixture**. There is no new full-suite count or final SQL/browser/native PASS for these later changes.

| Executed fc6 check | Actual result | Evidence / limit |
| --- | --- | --- |
| Strict TypeScript/build/exact runtime | PASSED | [Run37534825577](https://github.com/ziko1/knaba/actions/runs/37534825577), job 112512993282; exact clean Git-worktree build and isolated DEMO `/version` matched fc6 |
| CPU/document/explicit transport-double assertions |1068 PASSED,0 FAILED | Exact artifact classification inventory matched every executed case. Model/S3 fixtures remain fixtures |
| Genuine PostgreSQL assertions |153 PASSED,4 FAILED of 157,0 SKIPPED | Four failures concern own-source cached draft visibility, atomic parallel confirmation, rollback and actual worker preparation. Receipt retains exact case names/codes; canonical JSONB-order handling fixes require rerun |
| Rendered browser |19 PASSED,1 FAILED of20 |18 actual backend/UI plus one explicit mocked customer draft fixture passed. Offline manual retry case stopped at a strict locator matching two status elements; its later retry/acknowledgment checks did not run. This is a test failure, not a completed acceptance claim |
| Actual Railway-compatible Docker image | PASSED hosted Docker build/source-worker gate | Image `sha256:60d62334b1d115abca43f0cfee25cd585767752ae8f1ae282f4f39304ccb8cc5`; explicitfc6 SHA, `PINNED_CONTAINER_CONTEXT`, `source_dirty:null`. This proves the hosted local image, not a Railway deployment |
| Encrypted backup/tamper rejection | PASSED | Actual encrypted delivery archive and rejection of modified bytes; secret backup/key files excluded from public evidence |
| Distinct empty PostgreSQL/private-blob restore | PASSED | Actual hosted isolated synthetic restoration stage; no company offsite recovery or later-erasure replay claim |
| Bundled worker heartbeat/restart | PASSED | Two actual processes, successful heartbeats, graceful exits and durable synthetic no-op probes on the restored copy; Railway consumption remains NOT_RUN |
| Application artifact integrity | PASSED | Artifact 11446158611,8,418,475 bytes; outer SHA256 `d5f2c34aa56422e179ec7b90e601291af5a2b4bd65bcfa9ee6533b32eefb8081`, ZIP CRC and all 14 built-file hashes independently checked. Raw receipt-file digests are preserved |
| iOS simulator build/plist/15 XCTest | PASSED at fc6 | [Native receipt](evidence/native-run-37534825214-summary.json), [run 37534825214](https://github.com/ziko1/knaba/actions/runs/37534825214), job 112512991328. Six OS locales present; all 45 bundle files independently hashed. Simulator only, no signed IPA/device claim |
| Android native checks |52 JVM checks PASSED; lint FAILED |36 locale/projection/generation plus16 geo vectors. Exact failed archive confirms3 lint errors (MissingPermission and UnspecifiedRegisterReceiverFlag) and7 warnings; debug APK bytes were produced but this native runFAILED. Source fixes require new CI |

[Hosted application artifact](https://github.com/ziko1/knaba/actions/runs/37534825577/artifacts/11446158611) and [iOS artifact 11446272184](https://github.com/ziko1/knaba/actions/runs/37534825214/artifacts/11446272184) preserve exact source provenance. iOS outer ZIP:5,562,756 bytes, SHA256 `8ecd2d9ef8de44597b4254ca8ae7bdfbd87f6d912217984c79bd0c8984178e14`; inner simulator ZIP:5,505,381 bytes, SHA256 `e6ef747b9e004c3090416abde39f89f8600f2c22478c232e245a807442cc6c87`. Swift 5 actor-isolation/AppIntents warnings remain recorded. Native run overall **FAILED_ANDROID_LINT** despite successful iOS. Stable company signing, installation, physical GPS/background/battery/privacy-stop and production distribution remain **NOT_RUN**.

## Current source and deployment

| Area | Observed status | Next actual evidence |
| --- | --- | --- |
| Post-fc6 source | IMPLEMENTED / IN_PROGRESS / FINAL_CI_PENDING | Freeze one new exact source and execute fresh build/container/PG/native plus 21 browser cases; focused regressions do not establish full acceptance |
| New automation scenario | AUTHORED / NOT_RUN | Actual rule create→preview with no effects→explicit privileged activation→persisted state plus employee denials. Bounded daily/weekly Europe/Berlin schedule supports an explicit grammar; arbitrary cron is optional |
| Private handoff, map, advisory, AI usage/playground and provider-disabled internal request | Historical fc6 actual browser PASS | Keep exact case limits: empty authorized SVG map is not real GPS; time advisory is unapproved general guidance; playground is SIMULATED; internal request PENDING does not prove configured-provider inference |
| Offline queue end-to-end | Historical fc6 browser FAILED | Locator correction and full actual UNSYNCED→explicit original-key retry→server acknowledgment repeat required |
| Railway address | ALLOCATED / NOT_READY | `https://api-staging-a476.up.railway.app` has no observed ready/runtime SHA; API/worker offline and PostgreSQL crashed in last readback |
| Corrected Railway application | PREPARED / BLOCKED_EXTERNAL | First API failed on Metal secret mount, PG crashed with missing explicit cutoff reference. Concrete source/Dockerfile/shared-reference/lifecycle patch requires provider dashboard 2FA. Successful hosted Docker build does not apply that patch |
| Live HTTPS/worker/browser verification | NOT_RUN | Marker only after actual API/worker terminalSUCCESS/readiness; verifier observes genuine recipient-private WEB delivery and 21 rendered cases |
| Real providers/company/legal/physical | NOT_RUN / BLOCKED_EXTERNAL | [Canonical22 prerequisites](EXTERNAL_PREREQUISITES.md); generated routes, mocks and simulator checks are not external acceptance |

The isolated target remains project `5701136e-0b7c-48e8-a0c6-5c5a01c4330b`, environment `8ce0753b-b0b6-45f4-b655-6a9f9299ced2`. Preserve cutoff **2026-10-07T20:11:52Z**, authorized EUR10/month and all other projects/shared billing. The bounded synthetic trial does not verify permanent cost. [Railway history](RAILWAY_STAGING.md) records actual failures, staged changes and dashboard2FA requirement.

## Earlier exact-source history

[3c85 application](evidence/ci-run-37529346179-summary.json) executed802/802 tests (708 CPU/fixture,94 genuine PG), browser 11/14 and overall FAILED; encrypted backup/restore17 tables / 7 blobs/worker restart passed. [3c85 native](evidence/native-run-37529346218-summary.json) passed Android debug/lint/16 vectors and iOS simulator / 4 XCTest. Its verified Android APK remains [historical 3c85 APK](../artifacts/KNABA-DE-Android-debug-3c85adc.apk), SHA256 `c741191c1ffd2d7da66a7cc6c1188961fa5ed145671e602eba7079c3802f1712`; the older simulator artifact is likewise historical. These results do not certify new source.

[942b application](evidence/ci-run-37525960411-summary.json) executed439/439 including 39 genuine PG, browser 6/13 overall FAILED; [native receipt](evidence/native-run-37525960129-summary.json) records its debug/simulator bytes. Earlier local lease/restore failures, [367-pass offline report](evidence/final-offline-result.json), actual document-reader/ZIP checks and local socket/Chromium EPERM are retained with their own limits. Cancelled requests were CANCELLED/NOT_RUN.

Use exact `built-artifacts.json`, container and live runtime receipts, not an older `release-summary.json` or manifest embedded in an artifact. `dist/release.json` and `artifacts/RELEASE_MANIFEST.json` retain their own source/build identities. Final handover needs a tested new source, matching artifacts/runtime, factual live URLs and independently verified evidence.
