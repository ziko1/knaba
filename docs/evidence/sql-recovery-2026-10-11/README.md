# KNABA DE — SQL/runtime recovery, 2026-10-11

**This development increment passed its actual hosted checks. The complete product remains NOT_READY.**

Executable: `3f4370c3b3ba66941a42f6840db0f25ae57fca65`. Git tree: `464057c0a7cea50a7a55eb1d5f88fb95f3203225`. Branch: `codex/knaba-v4-sql-recovery-20261011`. [Draft PR #5](https://github.com/ziko1/knaba/pull/5). The following documentation commit preserves these executable bytes and has a separate Git identity.

## Actual results

| Scope | Actual result | Evidence |
| --- | --- | --- |
| Full application unit suite | **2228/2228 PASS, 0 FAIL, 0 SKIP**, 89 test files | [Raw Vitest](release-live-unit.json), [verified classification](verification.json) |
| Genuine PostgreSQL | **407/407 PASS**; CPU/document/explicit doubles **1821/1821 PASS** | [Application CI 38097796239](https://github.com/ziko1/knaba/actions/runs/38097796239) |
| Added PostgreSQL regressions | **51/51 PASS**: 29 exact answer-authority, 16 worker/runtime, 6 load-seed | [Exact source and case evidence](verification.json) |
| Historical failure recovery | **40/40** failed baseline identities now pass, with two explicit V4 digest replacements; both residual 1cb failures also pass | [Per-case mapping](verification.json), [first failed checkpoint](historical-1cb/verification.json) |
| Persisted application/browser | **27/27 PASS**, 0 failed/skipped/flaky; 26 actual backend/UI and one explicit HTTP fixture | [Raw Playwright](browser-result.json) |
| Build and runtime | TypeScript/build, 14 built-file hashes and hosted Docker/source-worker guard PASS | [Built-file attestation](built-artifacts.json), [independent byte checks](verification.json) |
| Recovery and worker | Encrypted backup, modified-backup rejection, distinct empty DB/private-blob restore and actual two-process worker heartbeat/restart PASS | [Live stages](live-isolated-verification.json), [worker](bundled-worker-restart.json) |
| Android | **66 host Java PASS**, debug APK build/signature verification PASS; lint **0 errors, 10 warnings** | [Native evidence](native-summary.json), [CI 38097796144](https://github.com/ziko1/knaba/actions/runs/38097796144) |
| iOS | **19 actual XCTest PASS**, 0 fail/skip, iPhone 16 / iOS 18.5 Simulator; compiled app and 45 bundle-file hashes verified | [Actual XCTest report](native/ios-xctest-summary.json), [native evidence](native-summary.json) |
| Local execution | **1821 CPU/document/explicit-double PASS; 407 PostgreSQL NOT_RUN locally**, TypeScript PASS | [Local summary](local-summary.json), [raw report](local-unit.json) |

The application workflow completed successfully, including hosted packaging. Independently downloaded application evidence has 8163623 bytes and SHA256 `076e43dea4943dee0b304cc1854ee04df8289d6de6cb246557ea454d0d4bcacf`; metadata, ZIP CRC, exact source/tree and all 14 built-file bytes match. Native artifact sizes, hashes, CRC, payload/source bindings and actual simulator identity are in the native receipt. The execution index matches every case and all 304 recorded source files.

## What changed

The Engine permits an AI answer only under the canonical service account and its current, matching SQL job/lease, config, channel and original message. It checks current requester authority and three exact entity versions before returning an existing receipt. The narrow config guard does not grant general administrative config access.

The worker rechecks persisted job identity, service/source permissions, lease and current configuration before provider work, tool use and sending. Historical revoked membership cannot be silently restored. A known provider outcome is accounted for using recorded usage and the configured estimate after authority/lease loss; cancellation before the first provider request releases the unused reservation, while an unknown started outcome keeps the reservation. These synthetic cases do not verify actual provider billing.

Changed payload under a reused idempotency key returns V4 `IDEMPOTENCY_CONFLICT`. Synthetic integration fixtures preserve explicit permissions, immutable accepted originals and linked REWORK/review facts, current pagination/cursor rules and persisted SQL history timestamps. The remaining handoff fixture now separately proves missing-lease rejection and queued-channel AI suppression under a genuine matching lease; notification assertions use recipient identity instead of random UUID order. Neither fix broadens runtime authorization.

The load seed explicitly casts `$4::text` inside `jsonb_build_object`. Six actual PostgreSQL cases cover the small seed transaction, duplicate rollback and synthetic provenance gates.

## History and remaining gates

Baseline source `7d8a0e92c083ca22e4f93595bd084031f7272599` had 40 actual SQL failures. First recovery source `1cbdbdcacb69a03f2fd9e9ad44c3bb358ac619f6` remained **FAILED: 2226/2228 PASS, 405/407 PG PASS**. Its raw report and native result remain under [historical-1cb](historical-1cb/verification.json); the two residual fixture assumptions were repaired in the successor and actually rerun.

All 72 compound V4 criteria retain their own NOT_RUN assessment; neither they nor the historical 475 V3 criteria are accepted by a global test count. D07 per-person offers, remaining published scope and late material-readiness behavior need further implementation/acceptance. The full 900-second KNB-23 workload, 100 sessions, 100000 TimeSegments, latency/SLO, offsite RPO/RTO and recurring cost remain NOT_RUN. Small seed/restore cases do not measure those targets.

External AI/provider transports are explicit synthetic doubles. Android vectors are host Java tests; iOS is a simulator. Company signing, physical GPS/background/battery, real provider/legal/UAT and production deployment retain their separate gates. The expired staging cutoff `2026-10-07T20:11:52Z` and existing EUR10/month authorization boundary are unchanged. Current source/runtime packaging succeeded in CI; a complete independently downloaded runtime handover is outside this increment.
