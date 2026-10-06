# Railway synthetic staging — actual state

Last observed Railway snapshot: **2026-10-06T20:58:34Z**; documentation/source checkpoint **2026-10-06**. User-confirmed `accept_deploy` returned **SUCCESS**, committed the reviewed staged changes and created PostgreSQL/API deployments at 20:55:09Z. The API deployment is **FAILED** and PostgreSQL is **CRASHED**; **the application is not live**. Worker remains OFFLINE without source. The prior20:52Z Cancelled acceptance applied nothing. The successful acceptance occurred before deployment creation; the earlier20:57Z estimate was incorrect.

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
| Pending correction | Patch begins `6aa92092`; PostgreSQL cutoff and 11 shared API/worker references staged, **NOT_APPLIED**. Final tested source/Dockerfile/start configuration must join the concrete batch; provider two-factor verification requires Railway dashboard application |

The [initial platform snapshot](evidence/railway-staging-preparation.json) records project creation and prepared configuration at19:49Z. The successful acceptance before 20:55:09Z supersedes its unapplied/source-transfer status. Accepted configuration and triggered deployment do not establish running database, application, persistent-volume recovery or live readiness.

## Confirmed deployment failures and correction

At20:55:15.039645289Z the API builder reported: `dockerfile invalid: flag '--mount=type=secret,id=proxy_ca,required=false' is missing a type=cache argument (other mount types are not supported) at Line 6`. [infra/Dockerfile.railway](../infra/Dockerfile.railway) preserves the original pinned multi-stage image and replaces only that dependency-install block with standard strict-TLS `npm ci`. The original corporate BuildKit Dockerfile is unchanged. Static contract comparison **PASSED**; the replacement has **not been built by Railway**.

Read-only service and rendered-variable checks found no `KNABA_STAGING_STOP_EPOCH` on PostgreSQL. Its accepted startup guard exits78 without logging when that variable is missing, matching the crash before PostgreSQL application logs. API rendered variables contained only `PORT` and Railway system variables; shared application configuration was absent. [Railway documents](https://docs.railway.com/variables#use-a-shared-variable) that sharing creates explicit service reference variables. Attach every required application variable to API/worker and the existing cutoff to all three services; do not print private values or replace existing keys.

The correction acceptance returned: **“These staged changes require two-factor verification, which isn't available over an API/MCP token. Apply them from the Railway dashboard.”** The provider did not apply those changes. This is a platform 2FA boundary, not an automatic approval-review rejection. Prepare one concrete reviewed correction batch with the Railway Dockerfile, exact tested source pin, all service references and unchanged budget/cutoff; then apply it through the isolated staging dashboard. No token-based bypass is authorized.

## Source and current checks

The user supplied the dedicated public repository [ziko1/knaba](https://github.com/ziko1/knaba). Complete source is on `knaba-staging`; [PR1](https://github.com/ziko1/knaba/pull/1) remains **draft**, and `main` is unchanged. Repository creation/source transfer is resolved; no merge or production release is implied.

| Identity / check | Observed state |
| --- | --- |
| Latest executed remote candidate (historical) | `3c85adc228ddd5c6078e7bbc05e4d5570625c978`; later working-tree changes are FINAL_CI_PENDING |
| Historical matching local SHA | `118a11bb43fb784a7ab760fb13a1dc23ba21e08e`; superseded by later code changes |
| Historical identical Git tree | `9dc49a7daf09e1f05805e604d0b1cf168f09e2c4`; source/artifacts identify that exact historical candidate |
| [Application CI 37529346179](https://github.com/ziko1/knaba/actions/runs/37529346179) | **FAILED**:802/802 tests PASS including 94 genuine PG, browser 11/14PASS and 3 FAIL. Backup/restore/worker checks passed at 3c85 only |
| [Native CI 37529346218](https://github.com/ziko1/knaba/actions/runs/37529346218) | Android and iOS **PASSED** at 3c85 ; 16 JVM vectors/4 XCTest. Later six-language native source needs new builds |
| Actual Railway runtime SHA | **NOT_VERIFIED**; no running deployment |

Exact historical 3c85 application and native evidence is in [application receipt](evidence/ci-run-37529346179-summary.json), [native receipt](evidence/native-run-37529346218-summary.json) and [execution index](requirements/EXECUTION_INDEX_3C85ADC.json). Application artifact CRC/all 14 built hashes and native payload hashes/all 39 iOS bundle files were independently checked. Genuine restore covered 17 original tables and 7 private blobs; worker heartbeat/restart executed. These are hosted synthetic checks, not live Railway acceptance or real provider/physical evidence.

Later source implements operator inbox/claim, offline manual retry, scoped SVG map, working-time advisory, AI governance and internal drafts. Last full offline run has 1013 PASS / 139 genuine PG SKIP of 1152; subsequent cacheACL/SSE/revocation security changes require rerun. Current source is **FINAL_CI_PENDING**:20 browser cases are authored/discovered (19 actual backend/UI plus one explicit mocked customer AI-draft transport fixture), and a hosted step is prepared to build the actual Railway image and verify source/worker identity. Gitless image provenance is `PINNED_CONTAINER_CONTEXT`, explicit source SHA and `source_dirty:null`; a static contract check is not an executed image build.

New native source is source-complete but uncompiled: Android six locales / 91 keys has 36 Java regression checks and 16 geometry vectors executed; iOS six locales / 89 keys has 14 XCTest authored, not executed at the new source. Earlier 942b 439-test/browser 6 of 13/native receipts remain separate [history](evidence/ci-run-37525960411-summary.json), [native history](evidence/native-run-37525960129-summary.json).

## Prepared configuration and budget boundary

Applied preparation uses one replica per service in `europe-west4`. Configured ceilings are PostgreSQL0.25vCPU/250MB, API0.5vCPU/375MB and worker0.25vCPU/250MB; they are configuration limits, not observed consumption or a billing guarantee. The base application settings are synthetic `APP_MODE=DEMO`, `COMPANY_ID=knaba-demo`, `NODE_ENV=production`, the allocated HTTPS `PUBLIC_ORIGIN`, `LIVE_SEND_ALLOWED=false`, `AI_SYNTHETIC_ONLY=true` and unverified WhatsApp capabilities. Provider credentials and legal GPS activation are excluded from this staging.

The accepted lifecycle commands have an **absolute cutoff 2026-10-07T20:11:52Z**. This is a bounded 24-hour synthetic test window, not authorization for permanent compute or proof that EUR10/month is sufficient. The cutoff does not move when a deployment starts late. Re-check its remaining time before further deployment work; do not extend it implicitly. Runtime guard behavior still needs observation after services start.

Exact invoice usage, taxes/currency and permanent cost acceptance remain unverified. No shared workspace hard limit was changed; such a limit could stop unrelated projects. Volume/storage charges can outlive process shutdown. Retain protected recovery evidence and verify actual usage before any separately approved long-running deployment.

The failed API deployment used `infra/Dockerfile`; the pending correction must select `infra/Dockerfile.railway` for API and worker. Lifecycle commands must keep the cutoff on every startup/pre-deploy command. API performs the reviewed environment check, non-destructive migrations and explicit synthetic seed before readiness; worker uses the same tested source SHA and starts only after API/database readiness. Read back accepted configuration and rendered variable names rather than copying obsolete commands or assuming shared-variable inheritance. Keep private database URLs and encryption keys in platform secret storage.

## Exact continuation

1. Complete current security tests, freeze/publish one new exact source, then execute fresh full hosted application/container/native CI. Inspect SQL, all 20 browser results, restore and worker receipts; fix confirmed failures and repeat at a new SHA. Historical 3c85 completion does not prove newer source acceptance.
2. Finish the concrete correction batch: Railway Dockerfile/source pin and explicit required service references. Existing user confirmation persists within the exact synthetic staging/budget scope, but the provider's 2FA requirement needs dashboard application. After that application, read back only this project/environment's accepted configuration, source pin and rendered cutoff presence. Preserve existing projects and the original cutoff.
3. Verify private PostgreSQL provisioning and key custody, then the replacement API deployment's terminal SUCCESS and actual `/api/v1/ready`, `/api/v1/version` and public DEMO configuration. Record the actual deployed SHA. Attach the worker to that same tested SHA; it currently has no source. Wait for its terminal deployment result and real consumption evidence.
4. Only after API and worker deployment SUCCESS, create `docs/evidence/staging-target.json` with exactly `origin`, `expectedSha`, `companyId: "knaba-demo"` and `mode: "DEMO"`. `expectedSha` is the actual deployed 40-character SHA, not the later marker commit. The marker is **not created yet**.
5. A marker push on `knaba-staging` triggers [.github/workflows/staging.yml](../.github/workflows/staging.yml). [verify-staging.mjs](../scripts/verify-staging.mjs) bounds HTTPS checks, verifies exact runtime SHA/closed provider gates/synthetic company, and observes a real worker-created `DELIVERED` WEB row through the recipient's own session. It never fabricates delivery status. Then execute 20 browser cases:19 actual backend/UI scenarios and one explicitly mocked customer AI draft transport case. The actual playground asserts pure SIMULATED/no-provider behavior; the internal request persists PENDING or PROVIDER_DISABLED without business changes. Traces are disabled; private cookies/tokens are excluded; run-specific receipts retain 7 days.
6. Read the resulting actual HTTPS/browser/worker receipts and resource metrics. Until that workflow executes successfully, **Railway live acceptance remains NOT_RUN**. Company production, real WhatsApp/AI, signing and physical GPS/battery/legal acceptance remain separate entries in the [external prerequisites](EXTERNAL_PREREQUISITES.md).

No marker, deployment, source mutation or approval was performed by this documentation update.
