# Railway synthetic staging — actual state

## Current read-only continuation — 2026-10-08

[Actual provider snapshot](evidence/railway-resume-2026-10-08.json), 19:32:01UTC: **API OFFLINE, Worker OFFLINE, PostgreSQL CRASHED with 0 running replicas; patch6aa92092 remains 37 changes STAGED/unapplied.** No configuration or billing mutation. The original cutoff **2026-10-07T20:11:52Z is EXPIRED_NOT_EXTENDED**. Applying historical 37 changes alone encounters the expired process guard; it is no longer a valid launch action.

Follow [PLAN-04–08](../FULL_PRODUCT_DEVELOPMENT_PLAN_UK.md): concrete authorized renewed bounded window within unchanged EUR10/month scope; reviewed updated patch/source pins/references/cost guards; account-owner Dashboard MFA application. Existing project deployment authorization persists. API/MCP cannot perform the provider's required two-factor verification; alternate-tool bypass is prohibited. Never silently extend cutoff or infer permanent affordability from caps. Read back the actual updated patch count; historical 37 does not promise a new count. Observe all terminal SUCCESS/readiness/exact SHA before live marker/browser/worker verification.

The 06.10 checkpoint below is preserved historical preparation/evidence. Its “apply37” instructions applied within the original window; current continuation takes precedence.

Checkpoint **2026-10-06**: **exact ca9 source/build/SQL/browser/native and independent artifact delivery PASSED; the application is not live.** Final correction patch has **37 non-destructive staged changes, reviewed but unapplied**, awaiting provider Dashboard MFA/2FA. API/worker sources and shared GIT_SHA are pinned to `ca9ed79ff4c0429223eb60754289ee1132088361`. One concrete application request is pending. Initial deployments at 20:55:09Z failed API/crashed PG; worker remained OFFLINE. No corrected terminal SUCCESS, actual ready URL or public runtime SHA is observed. [Exact redacted37-change review](evidence/railway-final-staged-ca9ed79.json) records source pins,resource limits,budget/cutoff and unapplied status.

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
| Pending correction | Patch `6aa92092-b449-4e17-8161-b0b4bc8c47eb`:37 reviewed non-destructive changes, NOT_APPLIED; API+worker/shared GIT_SHA exact ca9, strict-TLS Dockerfile/references/cutoff/start/predeploy ready for one Dashboard MFA application |

The [initial platform snapshot](evidence/railway-staging-preparation.json) records project creation and prepared configuration at19:49Z. The successful acceptance before 20:55:09Z supersedes its unapplied/source-transfer status. Accepted configuration and triggered deployment do not establish running database, application, persistent-volume recovery or live readiness.

## Confirmed deployment failures and correction

At20:55:15.039645289Z the API builder reported: `dockerfile invalid: flag '--mount=type=secret,id=proxy_ca,required=false' is missing a type=cache argument (other mount types are not supported) at Line 6`. [infra/Dockerfile.railway](../infra/Dockerfile.railway) preserves the original pinned multi-stage image and replaces only that dependency-install block with standard strict-TLS `npm ci`. The original corporate BuildKit Dockerfile is unchanged. Static contract comparison **PASSED**; the replacement has **not been built by Railway**.

Read-only service and rendered-variable checks found no `KNABA_STAGING_STOP_EPOCH` on PostgreSQL. Its accepted startup guard exits78 without logging when that variable is missing, matching the crash before PostgreSQL application logs. API rendered variables contained only `PORT` and Railway system variables; shared application configuration was absent. [Railway documents](https://docs.railway.com/variables#use-a-shared-variable) that sharing creates explicit service reference variables. Attach every required application variable to API/worker and the existing cutoff to all three services; do not print private values or replace existing keys.

The correction acceptance returned: **“These staged changes require two-factor verification, which isn't available over an API/MCP token. Apply them from the Railway dashboard.”** The provider did not apply those changes. This is a platform 2FA boundary, not an automatic approval-review rejection. Prepare one concrete reviewed correction batch with the Railway Dockerfile, exact tested source pin, all service references and unchanged budget/cutoff; then apply it through the isolated staging dashboard. No token-based bypass is authorized.

## Source and current checks

The user supplied the dedicated public repository [ziko1/knaba](https://github.com/ziko1/knaba). Complete source is on `knaba-staging`; [PR1](https://github.com/ziko1/knaba/pull/1) remains **draft**, and `main` is unchanged. Repository creation/source transfer is resolved; no merge or production release is implied.

| Identity / check | Observed state |
| --- | --- |
| Latest tested/delivered source | `ca9ed79ff4c0429223eb60754289ee1132088361`, 339 tracked files; source/runtime/docs independently verified |
| Exact tested tree | `8144d5bc90fcefe9bcdb26255d55287e96f2a170` |
| [Application CI37544413379](https://github.com/ziko1/knaba/actions/runs/37544413379) |SUCCESS: 1513/1513 (1307 CPU/206 genuine PG,0 SKIP),24/24 browser (23 actual+1 fixture), build/runtime/packaging PASS |
| Actual hosted Railway-compatible image |Exact ca9 hostedbuild/worker guard PASSED;`PINNED_CONTAINER_CONTEXT`, no Railway deploymentSUCCESS implied |
| [Native CI37544413386](https://github.com/ziko1/knaba/actions/runs/37544413386) |Both jobs SUCCESS: 52 Java/lint 0 errors / 8 warnings,15 actual XCTest/45 hashes, independent debug/simulator verification; company signing/physical NOT_RUN |
| Actual Railway runtime SHA | NOT_VERIFIED; no running application deployment |

[Application receipt](evidence/ci-run-37544413379-summary.json) records exact ca9 full 1513/24-browser/build/Docker/backup/tamper/distinct17-table/10-blob restore/two-worker-phase PASS and independent accepted source/runtime/docs packaging. [Native receipt](evidence/native-run-37544413386-summary.json) records 52 Java/15 XCTest and exact artifacts/signature limits. [Verified artifact table](HANDOVER.md) supplies actual source/docs/runtime parts/native URLs and inner hashes. Historical [c1](evidence/ci-run-37542362975-summary.json),[61a](evidence/ci-run-37540400048-summary.json) and 9d94 failures remain bound to their own sources. These hosted checks do not establish Railway/provider/physical acceptance.

The published ca9 source includes the **19-cause automatic work-notification bridge**, six-language activity text, current-cause/recipient authorization, leased/deduplicated default WEB delivery, canonical commercial approval events and human `approvedBy` ownership. Its 13 notification PostgreSQL cases passed within the 206 actual SQL cases. This does not prove every real business flow or activate unconfigured timed REMIND policies, real WhatsApp sends or money changes; actual company recipient/role/reminder configuration remains required. The Playwright metadata producer correction passed with the sensitive-evidence guard enabled. Current amendments record these verified receipts; they do not relabel an older source or a public runtime.

Historical [fc6 application](evidence/ci-run-37534825577-summary.json)/[native](evidence/native-run-37534825214-summary.json) retain four PG / one browser failure and Android lint failure; their corrected 9d94 execution above does not erase those receipts.

Earlier 3c85 [application](evidence/ci-run-37529346179-summary.json)/[native](evidence/native-run-37529346218-summary.json) receipts retain802 tests PASS/94 genuine PG/browser11 of 14 overallFAIL and both native jobs PASS; earlier 942b receipts remain historical. No old source/build receipt proves current corrected code.

## Prepared configuration and budget boundary

Applied preparation uses one replica per service in `europe-west4`. Configured ceilings are PostgreSQL0.25vCPU/250MB, API0.5vCPU/375MB and worker0.25vCPU/250MB; they are configuration limits, not observed consumption or a billing guarantee. The base application settings are synthetic `APP_MODE=DEMO`, `COMPANY_ID=knaba-demo`, `NODE_ENV=production`, the allocated HTTPS `PUBLIC_ORIGIN`, `LIVE_SEND_ALLOWED=false`, `AI_SYNTHETIC_ONLY=true` and unverified WhatsApp capabilities. Provider credentials and legal GPS activation are excluded from this staging.

The accepted lifecycle commands have an **absolute cutoff 2026-10-07T20:11:52Z**. This is a bounded 24-hour synthetic test window, not authorization for permanent compute or proof that EUR10/month is sufficient. The cutoff does not move when a deployment starts late. Re-check its remaining time before further deployment work; do not extend it implicitly. Runtime guard behavior still needs observation after services start.

Exact invoice usage, taxes/currency and permanent cost acceptance remain unverified. No shared workspace hard limit was changed; such a limit could stop unrelated projects. Volume/storage charges can outlive process shutdown. Retain protected recovery evidence and verify actual usage before any separately approved long-running deployment.

The failed API deployment used `infra/Dockerfile`; the pending correction must select `infra/Dockerfile.railway` for API and worker. Lifecycle commands must keep the cutoff on every startup/pre-deploy command. The reviewed predeploy configuration rejects missing/expired cutoff and limits environment-check→migrate→synthetic-seed to min(300 seconds, remaining cutoff time), retaining preDeployTimeoutSeconds300; stage it as configuration in the same final tested-source batch. API performs the reviewed environment check, non-destructive migrations and explicit synthetic seed before readiness; worker uses the same tested source SHA and starts only after API/database readiness. Read back accepted configuration and rendered variable names rather than copying obsolete commands or assuming shared-variable inheritance. Keep private database URLs and encryption keys in platform secret storage.

## Historical exact continuation — original bounded window

1. Apply the concrete 37-change reviewed patch through the isolated staging Dashboard MFA/2FA. API/worker/shared GIT_SHA are already pinned to tested ca9; existing user scope persists but provider verification must be completed. No token bypass is authorized.
2. Read back applied configuration/source pins/cutoff and private provisioning within this project/environment. Preserve all other projects and absolute cutoff; configuration acceptance alone is not runtime readiness.
3. Verify private PostgreSQL provisioning and key custody, then the replacement API deployment's terminal SUCCESS and actual `/api/v1/ready`, `/api/v1/version` and public DEMO configuration. Record the actual deployed SHA. Attach the worker to that same tested SHA; it currently has no source. Wait for its terminal deployment result and real consumption evidence.
4. Only after API and worker deployment SUCCESS, create `docs/evidence/staging-target.json` with exactly `origin`, `expectedSha`, `companyId: "knaba-demo"` and `mode: "DEMO"`. `expectedSha` is the actual deployed 40-character SHA, not the later marker commit. The marker is **not created yet**.
5. A marker push on `knaba-staging` triggers [.github/workflows/staging.yml](../.github/workflows/staging.yml). [verify-staging.mjs](../scripts/verify-staging.mjs) verifies bounded HTTPS/exact SHA/closed providers/synthetic company and real worker-created `DELIVERED` WEB status through the recipient's own session. Then execute 24 browser cases: 23 actual backend/UI and one explicit customer-draft transport fixture. Playground remains SIMULATED and keyless internal requests have no inferred provider/business effects. Traces/private cookies/tokens are excluded; receipts retain 7 days.
6. Read the resulting actual HTTPS/browser/worker receipts and resource metrics. Until that workflow executes successfully, **Railway live acceptance remains NOT_RUN**. Company production, real WhatsApp/AI, signing and physical GPS/battery/legal acceptance remain separate entries in the [external prerequisites](EXTERNAL_PREREQUISITES.md).

No marker, deployment, source mutation or approval was performed by this documentation update.
