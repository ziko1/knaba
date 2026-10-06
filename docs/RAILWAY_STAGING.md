# Railway synthetic staging — actual state

Last observed Railway readback: **2026-10-06T21:34UTC**; documentation/source checkpoint **2026-10-06**. User-confirmed `accept_deploy` returned **SUCCESS**, committed the reviewed staged changes and created PostgreSQL/API deployments at 20:55:09Z. The API deployment is **FAILED** and PostgreSQL is **CRASHED**; **the application is not live**. Worker remains OFFLINE without source. The prior20:52Z Cancelled acceptance applied nothing. The successful acceptance occurred before deployment creation; the earlier20:57Z estimate was incorrect.

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
| Pending correction | Patch `6aa92092-b449-4e17-8161-b0b4bc8c47eb` had 26 non-destructive staged changes at 21:34UTC: Dockerfile paths, worker gate,11 explicit variables per API/worker and PG cutoff. NOT_APPLIED; final tested source/GIT_SHA and cutoff-bounded predeploy must join the batch before provider dashboard 2FA |

The [initial platform snapshot](evidence/railway-staging-preparation.json) records project creation and prepared configuration at19:49Z. The successful acceptance before 20:55:09Z supersedes its unapplied/source-transfer status. Accepted configuration and triggered deployment do not establish running database, application, persistent-volume recovery or live readiness.

## Confirmed deployment failures and correction

At20:55:15.039645289Z the API builder reported: `dockerfile invalid: flag '--mount=type=secret,id=proxy_ca,required=false' is missing a type=cache argument (other mount types are not supported) at Line 6`. [infra/Dockerfile.railway](../infra/Dockerfile.railway) preserves the original pinned multi-stage image and replaces only that dependency-install block with standard strict-TLS `npm ci`. The original corporate BuildKit Dockerfile is unchanged. Static contract comparison **PASSED**; the replacement has **not been built by Railway**.

Read-only service and rendered-variable checks found no `KNABA_STAGING_STOP_EPOCH` on PostgreSQL. Its accepted startup guard exits78 without logging when that variable is missing, matching the crash before PostgreSQL application logs. API rendered variables contained only `PORT` and Railway system variables; shared application configuration was absent. [Railway documents](https://docs.railway.com/variables#use-a-shared-variable) that sharing creates explicit service reference variables. Attach every required application variable to API/worker and the existing cutoff to all three services; do not print private values or replace existing keys.

The correction acceptance returned: **“These staged changes require two-factor verification, which isn't available over an API/MCP token. Apply them from the Railway dashboard.”** The provider did not apply those changes. This is a platform 2FA boundary, not an automatic approval-review rejection. Prepare one concrete reviewed correction batch with the Railway Dockerfile, exact tested source pin, all service references and unchanged budget/cutoff; then apply it through the isolated staging dashboard. No token-based bypass is authorized.

## Source and current checks

The user supplied the dedicated public repository [ziko1/knaba](https://github.com/ziko1/knaba). Complete source is on `knaba-staging`; [PR1](https://github.com/ziko1/knaba/pull/1) remains **draft**, and `main` is unchanged. Repository creation/source transfer is resolved; no merge or production release is implied.

| Identity / check | Observed state |
| --- | --- |
| Latest executed remote candidate (historical) | `fc6c30fc9ff1f6c6c946fe93dd274e0806e3e7d1`; later source changes are FINAL_CI_PENDING |
| Historical matching local SHA/tree | `dd67043d7f3c5a0107f3eabe6275ad2dd60d4abf`, tree `e1fa5ed7ee7ec076f197ca1341c4a1281b079d88` |
| [Application CI 37534825577](https://github.com/ziko1/knaba/actions/runs/37534825577) | FAILED: 1221/1225 PASS, 4 genuine PG failures, 0 skipped; browser 19/20 PASS, 1 ambiguous offline-status locator failure |
| Actual hosted Railway-compatible image | PASSED build/source-worker gate at fc6; `PINNED_CONTAINER_CONTEXT`, `source_dirty:null`. No Railway terminalSUCCESS implied |
| [Native CI 37534825214](https://github.com/ziko1/knaba/actions/runs/37534825214) | Overall FAILED_ANDROID_LINT; iOS simulator / 15 XCTest PASS/45 hashes verified. Android 52 JVM checks PASS but lint 3 errors/7 warnings; fixes need new CI |
| Actual Railway runtime SHA | NOT_VERIFIED; no running application deployment |

[Application receipt](evidence/ci-run-37534825577-summary.json) records actual Docker image ID/source-worker gate, encrypted backup/tamper rejection, empty synthetic PostgreSQL/private-blob restore and bundled worker restart PASS. Outer artifact SHA/CRC and all 14 built hashes were independently verified. [Native receipt](evidence/native-run-37534825214-summary.json) covers exact fc6 iOS bytes only. These are hosted synthetic tests, not live Railway, real provider or physical acceptance.

Current source remains in progress / **FINAL_CI_PENDING** after fc6: canonical JSONB/cache fixes, additional operations policy checks, bounded validated daily/weekly Europe/Berlin cron/access and Android lint corrections. **21 browser scenarios are authored (20 actual backend/UI plus one existing explicit customer AI-draft transport fixture)**; current full SQL/browser/native acceptance is pending. Arbitrary cron and server polygons are optional; multiple agreed circle sections implement the stated geofence alternative.

Earlier 3c85 [application](evidence/ci-run-37529346179-summary.json)/[native](evidence/native-run-37529346218-summary.json) receipts retain802 tests PASS/94 genuine PG/browser11 of 14 overallFAIL and both native jobs PASS; earlier 942b receipts remain historical. No old source/build receipt proves current corrected code.

## Prepared configuration and budget boundary

Applied preparation uses one replica per service in `europe-west4`. Configured ceilings are PostgreSQL0.25vCPU/250MB, API0.5vCPU/375MB and worker0.25vCPU/250MB; they are configuration limits, not observed consumption or a billing guarantee. The base application settings are synthetic `APP_MODE=DEMO`, `COMPANY_ID=knaba-demo`, `NODE_ENV=production`, the allocated HTTPS `PUBLIC_ORIGIN`, `LIVE_SEND_ALLOWED=false`, `AI_SYNTHETIC_ONLY=true` and unverified WhatsApp capabilities. Provider credentials and legal GPS activation are excluded from this staging.

The accepted lifecycle commands have an **absolute cutoff 2026-10-07T20:11:52Z**. This is a bounded 24-hour synthetic test window, not authorization for permanent compute or proof that EUR10/month is sufficient. The cutoff does not move when a deployment starts late. Re-check its remaining time before further deployment work; do not extend it implicitly. Runtime guard behavior still needs observation after services start.

Exact invoice usage, taxes/currency and permanent cost acceptance remain unverified. No shared workspace hard limit was changed; such a limit could stop unrelated projects. Volume/storage charges can outlive process shutdown. Retain protected recovery evidence and verify actual usage before any separately approved long-running deployment.

The failed API deployment used `infra/Dockerfile`; the pending correction must select `infra/Dockerfile.railway` for API and worker. Lifecycle commands must keep the cutoff on every startup/pre-deploy command. The reviewed predeploy configuration rejects missing/expired cutoff and limits environment-check→migrate→synthetic-seed to min(300 seconds, remaining cutoff time), retaining preDeployTimeoutSeconds300; stage it as configuration in the same final tested-source batch. API performs the reviewed environment check, non-destructive migrations and explicit synthetic seed before readiness; worker uses the same tested source SHA and starts only after API/database readiness. Read back accepted configuration and rendered variable names rather than copying obsolete commands or assuming shared-variable inheritance. Keep private database URLs and encryption keys in platform secret storage.

## Exact continuation

1. Complete current security tests, freeze/publish one new exact source, then execute fresh full hosted application/container/native CI. Inspect SQL, all 21 browser results, restore and worker receipts; fix confirmed failures and repeat at a new SHA. Historical fc6 completion/failures do not prove later corrected-source acceptance.
2. Finish the concrete correction batch: Railway Dockerfile/source pin and explicit required service references. Existing user confirmation persists within the exact synthetic staging/budget scope, but the provider's 2FA requirement needs dashboard application. After that application, read back only this project/environment's accepted configuration, source pin and rendered cutoff presence. Preserve existing projects and the original cutoff.
3. Verify private PostgreSQL provisioning and key custody, then the replacement API deployment's terminal SUCCESS and actual `/api/v1/ready`, `/api/v1/version` and public DEMO configuration. Record the actual deployed SHA. Attach the worker to that same tested SHA; it currently has no source. Wait for its terminal deployment result and real consumption evidence.
4. Only after API and worker deployment SUCCESS, create `docs/evidence/staging-target.json` with exactly `origin`, `expectedSha`, `companyId: "knaba-demo"` and `mode: "DEMO"`. `expectedSha` is the actual deployed 40-character SHA, not the later marker commit. The marker is **not created yet**.
5. A marker push on `knaba-staging` triggers [.github/workflows/staging.yml](../.github/workflows/staging.yml). [verify-staging.mjs](../scripts/verify-staging.mjs) bounds HTTPS checks, verifies exact runtime SHA/closed provider gates/synthetic company, and observes a real worker-created `DELIVERED` WEB row through the recipient's own session. It never fabricates delivery status. Then execute 21 browser cases: 20 actual backend/UI scenarios and one explicitly mocked customer AI draft transport case. The actual playground asserts pure SIMULATED/no-provider behavior; the internal request persists PENDING or PROVIDER_DISABLED without business changes. Traces are disabled; private cookies/tokens are excluded; run-specific receipts retain 7 days.
6. Read the resulting actual HTTPS/browser/worker receipts and resource metrics. Until that workflow executes successfully, **Railway live acceptance remains NOT_RUN**. Company production, real WhatsApp/AI, signing and physical GPS/battery/legal acceptance remain separate entries in the [external prerequisites](EXTERNAL_PREREQUISITES.md).

No marker, deployment, source mutation or approval was performed by this documentation update.
