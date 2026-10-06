# Railway synthetic staging — actual state

Status observed 2026-10-06 after the user confirmed buying a Railway plan. Project creation succeeded; the historical Free capacity error is resolved. No application deployment has run. Evidence: [platform snapshot](evidence/railway-staging-preparation.json).

| Resource | Actual identifier / state |
| --- | --- |
| Workspace | `85e4b27a-40ed-4495-984f-af342ce8e24f` |
| Project | `knaba-de-staging`, `5701136e-0b7c-48e8-a0c6-5c5a01c4330b` |
| Environment | `staging`, `8ce0753b-b0b6-45f4-b655-6a9f9299ced2` |
| Postgres | `9157c2ec-e786-4afc-a5f5-792d8dd84571`; empty service, no image or volume |
| API / web | `003f1015-f5f6-43ca-b7e1-db72c6bafb7e`; empty service, no code source |
| Worker | `5c3c6e92-eefe-49f1-a81b-733c66f526cd`; empty service, no code source |
| Allocated application address | `https://api-staging-a476.up.railway.app`; domain allocated, application readiness NOT_RUN |
| Dashboard | `https://railway.com/project/5701136e-0b7c-48e8-a0c6-5c5a01c4330b?environmentId=8ce0753b-b0b6-45f4-b655-6a9f9299ced2` |

All three services have one configured replica in `europe-west4`. CPU/RAM limits are Postgres 0.25vCPU/250MB, API 0.5vCPU/375MB, worker 0.25vCPU/250MB. These are configured ceilings; no running replica or measured resource use is implied. No existing project was modified, no paid compute or storage deployment was launched.

## Applied configuration

API and worker use `infra/Dockerfile`. API start is `node dist/server.mjs`, readiness `/api/v1/ready`, timeout300s. Its pre-deploy command is a single array entry: `node scripts/environment-check.mjs && npm run migrate && npm run seed`, timeout300s. Worker start is `node dist/worker.mjs`. Connect/start worker only after API bootstrap and readiness succeed; worker does not migrate or seed. Keep one replica and the same exact release/image SHA on API and worker.

Environment shared settings were applied with deploys skipped: `APP_MODE=DEMO`, `COMPANY_ID=knaba-demo`, `NODE_ENV=production`, `PUBLIC_ORIGIN=https://api-staging-a476.up.railway.app`, `LIVE_SEND_ALLOWED=false`, `AI_SYNTHETIC_ONLY=true`, `WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED=false`. API `PORT=3000` was applied. Secrets, database URL and final deploy SHA are not yet supplied. No real provider credentials were requested or transferred.

Direct MCP configuration is authoritative. An initial multi-entry pre-deploy command was rejected; the single-entry command above was accepted and read back. Railway also rejected `railwayConfigFile` because JSON/TOML Config as Code is deprecated; no invalid configuration file was created. Use the current MCP configuration or reviewed Railway Infrastructure as Code rather than an obsolete config file.

## Remaining source-transfer prerequisite

There is no Git remote or connected dedicated KNABA DE repository. The callable GitHub tools support files, blobs, trees, commits and refs in an existing repository, but do not support repository creation. The actual authorized `gh api --method POST /user/repos` attempt failed before contacting GitHub with `proxyconnect tcp: ... socket: operation not permitted`. This does not establish that the GitHub credential itself is invalid. No repository was created by that command.

Once an empty private KNABA DE repository is accessible to the ChatGPT GitHub connection and Railway, upload all committed source through GitHub tools, verify tree contents, record the resulting remote SHA, and connect the source pinned to that exact SHA. Do not silently substitute another project's repository. Set build/runtime `GIT_SHA` to the actual deployed source SHA; an earlier local SHA must not identify a different remote commit.

Railway source tools accept GitHub repositories or public Docker images. The CLI is absent and local outbound sockets are denied. Railway Functions allow one Bun file up to96KB; the existing Node24 API bundle exceeds2MB plus external dependencies and a separate worker, so a Function does not deploy this product. These are observed capability limits, not missing user authorization.

## Billing boundary

Authorized budget remains EUR10/month. Exact active plan, current workspace usage, taxes/currency and effective hard stop are NOT_VERIFIED. The connector exposes service metrics, not workspace billing controls. Railway's [cost controls](https://docs.railway.com/pricing/cost-control) have a minimum USD10 compute hard limit and stop every workload in the workspace; existing stored data may continue to incur storage charges. Do not change a shared hard limit under authorization for this isolated project.

RAM is billed at USD10/GB-month: the configured ceilings total0.875GB, or USD8.75/month at continuous full memory consumption before CPU, volume, egress or applicable tax. Hobby's USD5 includes USD5 resource usage; do not add that fee twice. Estimates and service ceilings do not guarantee an invoice cap. Verify or obtain a specific billing-control decision before activating compute/storage. Preserve other projects.

## Activation and actual checks

After source and billing prerequisites are satisfied, configure private fresh PostgreSQL17.6 with a persistent volume in the same EU region and no public TCP proxy. Generate credentials directly into approved secret storage, use private `DATABASE_URL`, and preserve `AUTH_ENCRYPTION_KEY` securely. Attach tested API source/image with exact SHA, run staging-only non-destructive pre-deploy migration/seed, wait for terminal deployment SUCCESS and actual readiness, then start worker from the same SHA.

Run the37 real PostgreSQL cases against a separate synthetic QA database, the13 browser scenarios against the seeded delivery database, encrypted backup/tamper rejection/restore into a distinct empty database, and actual worker processing/restart/heartbeat checks. Record real command results, HTTPS responses, runtime SHA, image digest when available and resource metrics. Until those runs occur, application/live/restore status remains NOT_RUN.
