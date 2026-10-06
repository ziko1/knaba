# Railway synthetic staging — actual state

Checkpoint **2026-10-06**: correction patch has **28 staged non-destructive changes, unapplied** behind provider Dashboard MFA/2FA. No corrected deployment or ready runtime is observed. User-confirmed `accept_deploy` previously committed the initial changes and created PostgreSQL/API deployments at 20:55:09Z; API **FAILED**, PostgreSQL **CRASHED**, worker remained OFFLINE. **The application is not live.** The earlier cancelled acceptance applied nothing; the20:57Z time estimate was incorrect. The21:34UTC readback remains historical, not a new live check.

| Resource | Actual identifier / state |
| --- | --- |
| Workspace | `85e4b27a-40ed-4495-984f-af342ce8e24f`; other projects unchanged |
| Project | `knaba-de-staging`, `5701136e-0b7c-48e8-a0c6-5c5a01c4330b` |
| Environment | `staging`, `8ce0753b-b0b6-45f4-b655-6a9f9299ced2` |
| PostgreSQL | `9157c2ec-e786-4afc-a5f5-792d8dd84571`; deployment `f7192f59-eec3-41ef-9acf-b8ab9652b874` **CRASHED**, updated 20:55:35.341Z |
| API / web | `003f1015-f5f6-43ca-b7e1-db72c6bafb7e`; deployment `4356abfe-7c57-4a4b-aad5-9fa5a73bae5e` **FAILED**, updated 20:55:16.844Z; source pinned to `3c85adc228ddd5c6078e7bbc05e4d5570625c978` |
| Worker | `5c3c6e92-eefe-49f1-a81b-733c66f526cd`; OFFLINE; source not connected |
| Allocated address | [https://api-staging-a476.up.railway.app](https://api-staging-a476.up.railway.app); **NOT_READY / not verified live** |
| Dashboard | [Isolated Railway staging](https://railway.com/project/5701136e-0b7c-48e8-a0c6-5c5a01c4330b?environmentId=8ce0753b-b0b6-45f4-b655-6a9f9299ced2) |
| Accepted deployment patch | Identifier begins `24e7a116`; 13 compacted staged changes committed before 20:55:09Z through `workflowcommitChanges/env/24e7a116` |
| Pending correction | Patch `6aa92092-b449-4e17-8161-b0b4bc8c47eb`:28 staged non-destructive corrections, NOT_APPLIED. Dockerfile/start gates, explicit service references, cutoff-bounded predeploy and exact source/GIT_SHA must be reviewed against the next tested source before Dashboard 2FA application |

The [initial platform snapshot](evidence/railway-staging-preparation.json) records project creation and prepared configuration at19:49Z. The successful acceptance before 20:55:09Z supersedes its unapplied/source-transfer status. Accepted configuration and triggered deployment do not establish running database, application, persistent-volume recovery or live readiness.

## Confirmed deployment failures and correction

At20:55:15.039645289Z the API builder reported: `dockerfile invalid: flag '--mount=type=secret,id=proxy_ca,required=false' is missing a type=cache argument (other mount types are not supported) at Line 6`. [infra/Dockerfile.railway](../infra/Dockerfile.railway) preserves the original pinned multi-stage image and replaces only that dependency-install block with standard strict-TLS `npm ci`. The original corporate BuildKit Dockerfile is unchanged. Static contract comparison **PASSED**; the replacement has **not been built by Railway**.

Read-only service and rendered-variable checks found no `KNABA_STAGING_STOP_EPOCH` on PostgreSQL. Its accepted startup guard exits78 without logging when that variable is missing, matching the crash before PostgreSQL application logs. API rendered variables contained only `PORT` and Railway system variables; shared application configuration was absent. [Railway documents](https://docs.railway.com/variables#use-a-shared-variable) that sharing creates explicit service reference variables. Attach every required application variable to API/worker and the existing cutoff to all three services; do not print private values or replace existing keys.

The correction acceptance returned: **“These staged changes require two-factor verification, which isn't available over an API/MCP token. Apply them from the Railway dashboard.”** The provider did not apply those changes. This is a platform 2FA boundary, not an automatic approval-review rejection. Prepare one concrete reviewed correction batch with the Railway Dockerfile, exact tested source pin, all service references and unchanged budget/cutoff; then apply it through the isolated staging dashboard. No token-based bypass is authorized.

## Source and current checks

The user supplied the dedicated public repository [ziko1/knaba](https://github.com/ziko1/knaba). Complete source is on `knaba-staging`; [PR1](https://github.com/ziko1/knaba/pull/1) remains **draft**, and `main` is unchanged. Repository creation/source transfer is resolved; no merge or production release is implied.

| Identity / check | Observed state |
| --- | --- |
| Latest executed remote source | `c1b39120fcfc93659bf72924309a2337ccc92d30`; current uncommitted work-notification/metadata source supersedes it |
| Exact executed tree | `2f7d6c939610c397f344fb39efadaaf580e6753c` |
| [Application CI37542362975](https://github.com/ziko1/knaba/actions/runs/37542362975) |1472/1472 PASS:1279 CPU/193 PG,0SKIP;browser24/24 PASS:23 actual+one explicit fixture. OverallFAILED_PACKAGING because sensitive Git-diff metadata was rejected |
| Actual hosted Railway-compatible image | PASSED exact c1 hosted build/source-worker gate; `PINNED_CONTAINER_CONTEXT`, `source_dirty:null`; no Railway terminalSUCCESS implied |
| [Native CI37542362965](https://github.com/ziko1/knaba/actions/runs/37542362965) |Both jobs PASS:Android 52/lint 0 errors / 8 warnings/debug crypto;iOS 15 actual XCTest/booted exact 18.5 UUID/45 hashes. Company signing/physical NOT_RUN |
| Actual Railway runtime SHA | NOT_VERIFIED; no running application deployment |

[Application receipt](evidence/ci-run-37542362975-summary.json) preserves c1 passing 1472/full 24 browser/build/Docker/backup/tamper/distinct17-table/10-privateblob restore/worker stages and guarded packagingFAIL. Sensitive browser Git-diff diagnostics remain private; no complete accepted source/runtime/docs archive was delivered. [Native receipt](evidence/native-run-37542362965-summary.json) preserves Android 52 and actual iOS 15 XCTest with independently verified debug/simulator bytes. These are hosted synthetic checks, not Railway/provider/physical acceptance. Historical [61a application](evidence/ci-run-37540400048-summary.json)/[native](evidence/native-run-37540400013-summary.json) preserve1471/1472/browser23/24 and iOScompile-only0XCTest; [9d94 application](evidence/ci-run-37537880427-summary.json)/[native](evidence/native-run-37537880382-summary.json) retain their own earlier outcomes/artifacts.

Current **uncommitted** source adds the automatic work-notification bridge for **19 cause types**, six-language activity text, fresh current-source/recipient checks, leased/deduplicated default WEB delivery, three canonical commercial approval events and human `approvedBy` ownership. It also disables Playwright Git-diff metadata capture without weakening the sensitive-evidence guard. Local full-suite evidence is **1307 CPU PASS, 206 genuine PostgreSQL SKIP of 1513 cases / 54 test files**; 13 new notification PostgreSQL cases are authored, NOT_RUN. Exact next-SHA full SQL/build/container/native/artifact and all **24 browser cases (23 actual backend/UI, one explicit fixture)** remain **FINAL_CI_PENDING / NOT_RUN**. These tests do not establish all 19 business flows, activate unconfigured timed reminders, authorize money changes or send real WhatsApp messages. Actual company recipient/role/reminder policies still need supplied configuration; no responsible owner is guessed. Arbitrary cron/polygons remain optional; bounded validated Berlin schedules and agreed circle sections are implemented.

Historical [fc6 application](evidence/ci-run-37534825577-summary.json)/[native](evidence/native-run-37534825214-summary.json) retain four PG / one browser failure and Android lint failure; their corrected 9d94 execution above does not erase those receipts.

Earlier 3c85 [application](evidence/ci-run-37529346179-summary.json)/[native](evidence/native-run-37529346218-summary.json) receipts retain802 tests PASS/94 genuine PG/browser11 of 14 overallFAIL and both native jobs PASS; earlier 942b receipts remain historical. No old source/build receipt proves current corrected code.

## Prepared configuration and budget boundary

Applied preparation uses one replica per service in `europe-west4`. Configured ceilings are PostgreSQL0.25vCPU/250MB, API0.5vCPU/375MB and worker0.25vCPU/250MB; they are configuration limits, not observed consumption or a billing guarantee. The base application settings are synthetic `APP_MODE=DEMO`, `COMPANY_ID=knaba-demo`, `NODE_ENV=production`, the allocated HTTPS `PUBLIC_ORIGIN`, `LIVE_SEND_ALLOWED=false`, `AI_SYNTHETIC_ONLY=true` and unverified WhatsApp capabilities. Provider credentials and legal GPS activation are excluded from this staging.

The accepted lifecycle commands have an **absolute cutoff 2026-10-07T20:11:52Z**. This is a bounded 24-hour synthetic test window, not authorization for permanent compute or proof that EUR10/month is sufficient. The cutoff does not move when a deployment starts late. Re-check its remaining time before further deployment work; do not extend it implicitly. Runtime guard behavior still needs observation after services start.

Exact invoice usage, taxes/currency and permanent cost acceptance remain unverified. No shared workspace hard limit was changed; such a limit could stop unrelated projects. Volume/storage charges can outlive process shutdown. Retain protected recovery evidence and verify actual usage before any separately approved long-running deployment.

The failed API deployment used `infra/Dockerfile`; the pending correction must select `infra/Dockerfile.railway` for API and worker. Lifecycle commands must keep the cutoff on every startup/pre-deploy command. The reviewed predeploy configuration rejects missing/expired cutoff and limits environment-check→migrate→synthetic-seed to min(300 seconds, remaining cutoff time), retaining preDeployTimeoutSeconds300; stage it as configuration in the same final tested-source batch. API performs the reviewed environment check, non-destructive migrations and explicit synthetic seed before readiness; worker uses the same tested source SHA and starts only after API/database readiness. Read back accepted configuration and rendered variable names rather than copying obsolete commands or assuming shared-variable inheritance. Keep private database URLs and encryption keys in platform secret storage.

## Exact continuation

1. Freeze/publish current work-notification bridge and Playwright metadata correction; run next exact-SHA full hosted SQL/build/container/native/24 browser/artifact acceptance. Preserve c1 packaging failure and prior 61a/9d94 receipts. Only a completely accepted next SHA may be pinned for corrected staging.
2. Finish the concrete correction batch: Railway Dockerfile/source pin and explicit required service references. Existing user confirmation persists within the exact synthetic staging/budget scope, but the provider's 2FA requirement needs dashboard application. After that application, read back only this project/environment's accepted configuration, source pin and rendered cutoff presence. Preserve existing projects and the original cutoff.
3. Verify private PostgreSQL provisioning and key custody, then the replacement API deployment's terminal SUCCESS and actual `/api/v1/ready`, `/api/v1/version` and public DEMO configuration. Record the actual deployed SHA. Attach the worker to that same tested SHA; it currently has no source. Wait for its terminal deployment result and real consumption evidence.
4. Only after API and worker deployment SUCCESS, create `docs/evidence/staging-target.json` with exactly `origin`, `expectedSha`, `companyId: "knaba-demo"` and `mode: "DEMO"`. `expectedSha` is the actual deployed 40-character SHA, not the later marker commit. The marker is **not created yet**.
5. A marker push on `knaba-staging` triggers [.github/workflows/staging.yml](../.github/workflows/staging.yml). [verify-staging.mjs](../scripts/verify-staging.mjs) verifies bounded HTTPS/exact SHA/closed providers/synthetic company and real worker-created `DELIVERED` WEB status through the recipient's own session. Then execute 24 browser cases:23 actual backend/UI and one explicit customer-draft transport fixture. Playground remains SIMULATED and keyless internal requests have no inferred provider/business effects. Traces/private cookies/tokens are excluded; receipts retain 7 days.
6. Read the resulting actual HTTPS/browser/worker receipts and resource metrics. Until that workflow executes successfully, **Railway live acceptance remains NOT_RUN**. Company production, real WhatsApp/AI, signing and physical GPS/battery/legal acceptance remain separate entries in the [external prerequisites](EXTERNAL_PREREQUISITES.md).

No marker, deployment, source mutation or approval was performed by this documentation update.
