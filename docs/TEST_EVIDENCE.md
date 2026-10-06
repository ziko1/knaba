# Actual verification ledger

Latest source freeze (2026-10-06T21:28:41Z): strict TypeScript PASS; actual offline run1,068CPU/explicit-double PASS,0FAIL,157genuine PostgreSQL SKIP of1,225. This does not establish SQL/native/browser/live acceptance. Per-case classes and current test-file hashes: [classification inventory](evidence/offline-execution-scope.json). Full new hosted CI/native and20 rendered cases remain pending. Historical3c85 results below retain their exact-source limits.

Snapshot: **2026-10-06**. The latest executed hosted application candidate is `3c85adc228ddd5c6078e7bbc05e4d5570625c978` (tree `9dc49a7daf09e1f05805e604d0b1cf168f09e2c4`). Its application workflow **FAILED** because three browser scenarios failed: **802/802 tests passed, including 94 genuine PostgreSQL cases; browser 11/14 passed**. Native compilation of that same SHA passed. These results describe that exact historical source, rather than the subsequent working tree.

The working tree now includes operator handoff/inbox, a bounded tab-memory offline queue, working-time guidance, AI budgets/usage/simulated playground, a scoped SVG route view, internal AI draft requests and new native localization. Its final hosted acceptance is **FINAL_CI_PENDING**. The browser suite contains **20 authored scenarios:19 actual backend/UI scenarios and one explicitly mocked customer AI draft transport scenario**. Discovery/typechecking and deterministic tests do not establish that these twenty rendered scenarios passed.

| Executed check on 3c85adc | Result | Evidence and limit |
| --- | --- | --- |
| Typecheck, build and exact built-server identity | PASSED | [Hosted receipt](evidence/ci-run-37529346179-summary.json), run [37529346179](https://github.com/ziko1/knaba/actions/runs/37529346179), job 112494414772; `/version` matched the exact candidate |
| Application tests |802 PASSED,0 FAILED,0 SKIPPED |708 CPU or explicitly identified transport-fixture cases and 94 genuine PostgreSQL cases. [Per-case execution index](requirements/EXECUTION_INDEX_3C85ADC.json) preserves actual names and classifications |
| Rendered browser scenarios |11 PASSED,3 FAILED of 14 | Overall workflow FAILED; fixes and six additional actual scenarios require new execution. The existing AI draft fixture mocks proposal/confirmation responses and proves UI gating only |
| Encrypted backup and tamper rejection | PASSED | Actual encrypted delivery backup and rejection of modified bytes |
| Restore into a distinct empty database | PASSED |17 original tables and 7 private-blob checksum comparisons. Explicit isolated synthetic restore without privacy history; this does not prove replay of later company erasures or offsite recovery |
| Bundled worker heartbeat/restart | PASSED | Actual built worker process, heartbeat and restart. Railway outbox consumption remains unverified |
| Hosted application artifact | PASSED integrity | Artifact 11444470113,9,266,394 bytes, ZIP CRC and all 14 built-file hashes independently verified. Outer SHA256 `d689dac36fb506745f4181bc2bdabc0b87ca07efb60f377bdaf1a6285c62d68b`; inner hashes are in the receipt |
| Android debug APK | PASSED compile/lint/signature check | [Native receipt](evidence/native-run-37529346218-summary.json), run [37529346218](https://github.com/ziko1/knaba/actions/runs/37529346218); SDK 36/Gradle 8.13,16 synthetic JVM vectors. Lint 0 errors / 12 warnings; ephemeral debug certificate only |
| iOS simulator application | PASSED compile/plist/4 XCTest | Xcode 16.4, iPhone 16 iOS 18.5 arm64 simulator. All 39 bundle-file hashes/CRC verified. Simulator test host includes XCTest frameworks; it is not an installable signed IPA |

Verified native payloads are [Android debug APK](../artifacts/KNABA-DE-Android-debug-3c85adc.apk),881,684 bytes, SHA256 `c741191c1ffd2d7da66a7cc6c1188961fa5ed145671e602eba7079c3802f1712`, and [iOS simulator ZIP](../artifacts/KNABA-DE-iOS-simulator-3c85adc.zip),5,340,734 bytes, SHA256 `fddf79e7583af6914e423d654deff875961fce92defea036188c434a5e98589d`. The receipt includes hosted artifact IDs, outer ZIP digests and source provenance. Both are historical debug/simulator development artifacts; new native source must compile again. Production signing, physical GPS/background/battery/privacy-stop acceptance and distribution are **NOT_RUN**.

## Current source and deployment acceptance

| Current area | Observed status | Required next evidence |
| --- | --- | --- |
| New modules and corrections after 3c85adc | IMPLEMENTED / FINAL_CI_PENDING | Exact new committed source, full build, genuine PostgreSQL suite and twenty browser outcomes. Focused deterministic checks remain module-specific evidence |
| Actual backend browser additions | AUTHORED / NOT_RUN | Private guest handoff/claim/reply, employee offline manual retry, scoped 360px map, read-only working-time advisory, pure SIMULATED playground/usage, internal request PENDING or PROVIDER_DISABLED with no business writes |
| Public staging address | ALLOCATED / NOT_READY | `https://api-staging-a476.up.railway.app` is not a verified working application |
| First Railway deployment | FAILED | Created 2026-10-06T20:55:09Z. API4356abfe… failed because Railway Metal rejects the optional BuildKit secret mount; PostgreSQLf7192f59… crashed with the cutoff absent from rendered service variables |
| Corrected Railway source/configuration | PREPARED / BLOCKED_EXTERNAL | Minimal `infra/Dockerfile.railway` preserves the original BuildKit Dockerfile. Explicit service references to shared values, including the fixed cutoff, are staged. Railway rejected application with provider **TWO_FACTOR**, requiring its dashboard; no successful corrected build/readiness is observed |
| Live staging verification | NOT_RUN | Reviewed HTTPS `/version`/readiness/public config/assets, authenticated worker delivery and 20 rendered scenarios are prepared. Create the target marker only after actual API and worker readiness |
| Real external providers, company policy and legal/physical acceptance | NOT_RUN / BLOCKED_EXTERNAL | [Canonical prerequisites](EXTERNAL_PREREQUISITES.md). AI/S3 fixtures, synthetic travel and simulator tests do not establish real provider or physical acceptance |

The Docker context must identify its provenance: a clean Git checkout records actual SHA/dirty state; the Railway Gitless build uses a pinned source context and explicit SHA, with dirty state unknown rather than falsely clean. New hosted container-build acceptance is prepared but NOT_RUN; deterministic contract checks are not a successful Docker build.

The authorized staging target is the isolated project `5701136e-0b7c-48e8-a0c6-5c5a01c4330b`, environment `8ce0753b-b0b6-45f4-b655-6a9f9299ced2`. Its absolute compute cutoff remains `2026-10-07T20:11:52Z`; this bounded synthetic trial does not establish permanent operation within EUR10/month. [Railway history](RAILWAY_STAGING.md) retains failed deployment IDs and the provider dashboard requirement. No shared billing limit or unrelated project was changed.

## Earlier historical evidence

The [942b3b2 hosted receipt](evidence/ci-run-37525960411-summary.json) records439/439 tests,39 genuine PostgreSQL cases, browser 6/13 and overall FAILED; its [native receipt](evidence/native-run-37525960129-summary.json) records debug/simulator compilation. These are superseded only for corresponding checks by the 3c85adc execution and remain available for audit.

Earlier [367-pass offline result](evidence/final-offline-result.json) and [web isolation checks](evidence/web-offline-result.json) record synthetic arithmetic/ACL/parser/document invariants. Real ZIP/XML/PDF/XLSX bytes and independent readers establish those artifact checks, not company legal acceptance. Historical157-pass/1-fail lease-fencing and fake-media restore failures were followed by the genuine hosted runs above; old reports remain retained. Local TCP/Unix/Chromium EPERM and cancelled tool requests were **CANCELLED / NOT_RUN**, never successes.

`dist/release.json` and `artifacts/RELEASE_MANIFEST.json` belong to the specific builds they identify. Never relabel them with an untested working-tree SHA. Final handover requires one exact tested source, matching build/runtime attestations, real URLs and independently verified artifacts.
