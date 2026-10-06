# KNABA DE deployment

This repository and all resources are separate from AVENQO. The runnable local default is **DEMO**, company **knaba-demo**, using synthetic records only. Production seeding is forbidden. Every image requires a real 40-character Git SHA identifying its tested source.

Current checkpoint: Latest tested and delivered source `ca9ed79ff4c0429223eb60754289ee1132088361`, tree `8144d5bc90fcefe9bcdb26255d55287e96f2a170`: **1513/1513 PASS (1307 CPU/explicit doubles, 206 genuine PostgreSQL), zero failures or skips; 24/24 browser PASS (23 actual backend/UI, one explicit HTTP fixture)**. Application run **37544413379 SUCCESS** includes strict TypeScript/build, 14 independently verified built files, actual hosted Docker/source-worker guard, encrypted backup/tamper rejection, distinct restore of **17 tables / 10 private blobs** and two real worker-process phases. Source, documentation and the reconstructed **44,611,431-byte Linux x64 runtime** were fully downloaded and independently verified; sensitive-evidence packaging checks passed. Native run **37544413386 SUCCESS**: Android 52 host Java cases/debug assemble/lint 0 errors / 8 warnings; iOS 15 actual XCTest on the prepared Booted 18.5 simulator, 45 bundle files and executable hashes. Downloaded APK/simulator bytes, signatures/page hashes and actual-content tamper negatives were independently checked. Company production signing, signed IPA/phone installation and physical GPS/background/battery remain NOT_RUN. See exact [application](evidence/ci-run-37544413379-summary.json)/[native](evidence/native-run-37544413386-summary.json) and [artifact table](HANDOVER.md). The published ca9 source includes the **19-cause automatic work-notification bridge**, six-language activity text, current-cause/recipient authorization, leased/deduplicated default WEB delivery, canonical commercial approval events and human `approvedBy` ownership. Its 13 notification PostgreSQL cases passed within the 206 actual SQL cases. This does not prove every real business flow or activate unconfigured timed REMIND policies, real WhatsApp sends or money changes; actual company recipient/role/reminder configuration remains required. The Playwright metadata producer correction passed with the sensitive-evidence guard enabled. Current amendments record these verified receipts; they do not relabel an older source or a public runtime.

Railway remains **NOT_READY / live acceptance NOT_RUN**. The final **37 non-destructive source-pinned changes** for API/worker/shared `GIT_SHA` ca9 are staged and reviewed, awaiting the provider-required Dashboard MFA/2FA application. One concrete application request is pending; no corrected running deployment or public runtime SHA is observed. Original cutoff **2026-10-07T20:11:52Z**, EUR10/month authorization and all unrelated projects/shared billing stay unchanged. Allocated `https://api-staging-a476.up.railway.app` is not a verified working product URL; the reviewed patch pins exact ca9 API/worker/shared GIT_SHA. Existing synthetic task authorization persists; provider MFA must not be bypassed.

## Runtime contracts

| Setting | Consumer and purpose |
| --- | --- |
| `APP_MODE` | API/worker/bootstrap: `DEMO`, `TEST` or explicitly authorised `PRODUCTION` |
| `DATABASE_URL` | Authoritative PostgreSQL connection; Compose uses hostname `postgres` |
| `COMPANY_ID` | Company scope; DEMO defaults to `knaba-demo`; production must be explicitly supplied |
| `AUTH_ENCRYPTION_KEY` | Private random value of at least 32 characters used to encrypt TOTP secrets; preserve securely for recovery |
| `PUBLIC_ORIGIN` | Exact browser origin; production requires HTTPS |
| `GIT_SHA` | Exact tested release SHA; placeholders and the all-zero sentinel fail configuration checks |
| `PORT` | API listen port; Compose internal port is 3000, host port is `API_PORT` |
| `WIDGET_ALLOWED_ORIGINS` | Comma-separated confirmed company origins permitted by CSP to embed the contact widget |
| `WORKER_HEARTBEAT_FILE` | Worker successful-cycle heartbeat; Compose health checks its freshness |

The old `SESSION_SECRET`, `BOOTSTRAP_*` and `PUBLIC_BASE_URL` variables are not application contracts. `.env.example` contains no runnable shared secret. Provider values are optional and do not themselves record legal approval or grant permission to send.

## Reproducible isolated local DEMO

Requirements: Git, Node 24, OpenSSL, Docker/Compose v2 and a clean committed checkout of the tested release. Use the lockfile and pinned Node/PostgreSQL versions. The helper does not alter existing configuration or commit source changes.

```bash
bash scripts/bootstrap-local.sh
```

The helper creates a private mode-0600 `.env.local` only if absent, generates database/encryption credentials without printing them, validates runtime configuration and checks the SHA against the checkout. It clears inherited application variables so another project's shell credentials cannot override the private KNABA configuration. Its sequence is:

1. Build `knaba-de-api:<exact-sha>`.
2. Start PostgreSQL and wait for `pg_isready`.
3. Run one-shot bootstrap: configuration validation, migration and DEMO/TEST-only synthetic seed.
4. Start API only after bootstrap exits successfully.
5. Start worker only after bootstrap completion and actual API readiness.
6. Verify healthy services, web entry, `/health` and exact `/version` SHA.

The API health check uses `/api/v1/ready`, including database, company and production-owner configuration. The worker health check requires a successful-cycle heartbeat newer than 30 seconds; a running PID alone is insufficient. PostgreSQL contains business aggregates, outbox, immutable audit, uploaded originals and client copies. The Compose database volume survives container recreation. No fake S3 persistence is declared.

```bash
docker compose --env-file .env.local -f infra/compose.yml ps
docker compose --env-file .env.local -f infra/compose.yml logs --tail 100 api worker
docker compose --env-file .env.local -f infra/compose.yml stop
```

Stopping preserves data. Deleting the database volume is a destructive action and is outside normal update/rollback instructions. Demo role login is visible only because the server explicitly enables DEMO; synthetic customer identities and legal documents are not production evidence.

The image also serves the worker; there is no second dependency installation. The optional `infra/worker.Dockerfile` derives a worker from an explicitly supplied exact API image using `--build-arg API_IMAGE=knaba-de-api:<exact-sha>`.

## Native Node/PostgreSQL operation

Use a separate private `.env.native` with the same contract and a localhost database hostname, rather than copying the Compose `postgres` hostname blindly. Start the database independently, then run in order:

```bash
node --env-file=.env.native scripts/environment-check.mjs
node --env-file=.env.native --run migrate
node --env-file=.env.native --run seed
node --env-file=.env.native --run build
node --env-file=.env.native dist/server.mjs
```

Start `node --env-file=.env.native dist/worker.mjs` in a second supervised process. The seed command accepts only explicit DEMO/TEST. The API and worker do not silently migrate or create production identities on startup.

`bash scripts/doctor.sh` checks available tooling and configured runtime/database access when the private environment is supplied by the supervisor. `bash scripts/verify.sh` runs configuration, typecheck, domain and frontend security tests and the complete build. Add `--live` with the actual authorised `KNABA_BASE_URL`; browser checks require `RUN_E2E=1` and the configured authorised test target. The scripts distinguish requested checks from `NOT_RUN` external/device checks.

## Authorised staging release

The authoritative permission record is `infra/DEPLOYMENT_AUTHORIZATION.json`. Current authorisation permits a **new Railway synthetic staging project** with a **EUR 10/month maximum**, non-destructive staging migration and smoke tests. It excludes production release, customer messages, domain changes, bank payments and real procurement.

Before publishing, record the exact commit, successful test evidence, database backup/restore evidence, target project, environment and current provider billing controls. Build from that commit, set matching `GIT_SHA`, migrate and synthetic-seed staging before routing public traffic, then check web/login, authorised commands, role isolation, persisted data and worker behaviour through the actual HTTPS URL. Store the real URL and runtime `/version` result in release evidence; do not substitute a planned domain.

The original `infra/Dockerfile` supports an optional BuildKit `proxy_ca` PEM secret for corporate TLS trust. Supply it only through BuildKit secret mounting; certificate verification stays enabled and the PEM is not copied into the image. No token belongs in image build arguments, logs or Git.

Railway Metal uses `infra/Dockerfile.railway`. It differs only in the dependency-install block: standard `npm ci --ignore-scripts --strict-ssl=true`, without the optional secret mount. The original Dockerfile remains the local/corporate BuildKit path. Actual API deployment `4356abfe-7c57-4a4b-aad5-9fa5a73bae5e` failed at 2026-10-06T20:55:15Z because Metal rejected `--mount=type=secret` at line6. The variant has passed the static comparison/strict-TLS contract check; a successful Railway image build from it is **NOT_RUN**.

Hosted CI `37544413379` passed actual `infra/Dockerfile.railway` image `sha256:3f855e841a28edb536df6e5d7286f0ca82a7857003b892502bd1747cc3c59bb7` with exact `GIT_SHA=ca9ed79ff4c0429223eb60754289ee1132088361` and worker release verifier. Gitless context is `PINNED_CONTAINER_CONTEXT`; unknown Git state is not a clean-worktree claim. Actual source/docs/reconstructed 44,611,431-byte runtime packaging passed with strict sensitive-evidence checks. It requires Linux x64 glibc/Node 24/PostgreSQL 17/private configuration/POSIX extraction and preserves relative bin links/modes; 253 dependency closure and Node/tsx/esbuild/sharp CPU probes passed. Hosted acceptance does not apply Railway corrections or prove the allocated URL ready. Historical c1 packaging rejection and older image identities remain in the ledger.

Railway shared variables require explicit service reference variables, such as `KNABA_STAGING_STOP_EPOCH=${{shared.KNABA_STAGING_STOP_EPOCH}}`; defining a project shared variable alone does not inject it. PostgreSQL deployment `f7192f59-eec3-41ef-9acf-b8ab9652b874` crashed at 20:55:35Z without application logs. Read-back showed the cutoff absent from rendered service variables; its startup guard exits78 in that case. API rendered variables also lacked the shared application configuration. See [Railway variable documentation](https://docs.railway.com/variables#use-a-shared-variable) and [actual staging continuation](RAILWAY_STAGING.md).

The first user-confirmed staging patch was applied before deployment creation at 20:55:09Z. A subsequent attempt to apply the cutoff-reference correction returned the provider's two-factor requirement: API/MCP tokens cannot complete it, so the reviewed pending changes must be applied through Railway dashboard. The provider did not apply the correction; after the final tested source/Dockerfile/start/shared-reference batch is ready, one dashboard 2FA application is needed. Preserve the existing absolute cutoff 2026-10-07T20:11:52Z, resource ceilings and synthetic-only scope; do not extend the test window or infer live readiness from accepted configuration.

## Budget and billing boundary

The EUR 10/month ceiling is an authorisation limit, not a guarantee enforced by Docker. Compose sets explicit CPU/memory limits and loopback-only exposed ports; these bound resource allocation but do not cap a provider invoice. Paid infrastructure, persistent database/storage, network egress, backups and external AI/message charges must all fit the authorised total.

A provider alert or estimate is not a hard spend cap. Verify the connected provider's effective hard-stop behaviour and current usage before creating paid resources. If the available controls cannot guarantee the authorised ceiling, retain the tested local product, report that deployment action as blocked and obtain a concrete revised budget/control decision. Do not state that EUR 10/month is guaranteed from these files. Stop or remove newly created staging compute through the authorised provider workflow if continued operation would exceed the limit; preserve approved backups and avoid destroying company data.

## Production gate and rollback

Production requires a separate explicit release authorisation, verified company ID/requisites, verified owner identity and protected offline owner bootstrap, HTTPS origin, private encryption key, legal configuration, permitted hosting/transfer regions, backup/restore evidence and external prerequisites listed in `docs/EXTERNAL_PREREQUISITES.md`. The offline owner bootstrap closes after the initial authorised owner. Public self-registration cannot assign a staff role. Compose never runs synthetic seed in production, and readiness fails when the verified company/owner is missing.

Real WhatsApp delivery additionally requires verified Cloud API capability/version, approved templates/window/recipient policy, the recorded allowed recipients and `LIVE_SEND_ALLOWED=true`. AI transfer additionally requires approved provider/configuration, region and transfer approval. GPS requires approved native device/policy plus actual physical testing. A configured credential does not mark these workflows passed.

For an application rollback, retain the database, restore the previous tested immutable image SHA, keep compatible environment/contracts and rerun readiness/role checks. Migration rollback and database restoration require the repository's dedicated backup/restore procedure and evidence; do not reset or drop the live database to obtain a green deployment.

## Verification status of this document

Native run **37544413386 SUCCESS**: Android 52 host Java cases/debug assemble/lint 0 errors / 8 warnings; iOS 15 actual XCTest on the prepared Booted 18.5 simulator, 45 bundle files and executable hashes. Downloaded APK/simulator bytes, signatures/page hashes and actual-content tamper negatives were independently checked. Company production signing, signed IPA/phone installation and physical GPS/background/battery remain NOT_RUN. Actual pinned Xcode 16.4/iOS 18.5 preparation and XCTest succeeded; runtime download was NOT_NEEDED, not an install claim. APK/simulator URLs/hashes are in [handover](HANDOVER.md). Company stable signing/provisioning and physical tracking remain external.

File/syntax/configuration checks can validate these contracts independently. A complete Docker build, container bootstrap, actual worker heartbeat, staging URLs, provider billing controls and production/physical checks require their own recorded execution evidence. This document does not mark those actions completed merely because their commands exist.

Production first-owner bootstrap is an offline command, not an HTTP endpoint: `node --env-file=.env.production --import tsx scripts/bootstrap-owner.mts .local/bootstrap.json`. The private JSON must be mode0600 and contain verified `company` legalName/address/registration/evidenceReference plus `owner` email/name/password/totpSecret/evidence. It records supplied external authority, creates no synthetic data, requires HTTPS/company/encryption configuration, and closes once an OWNER exists. Never put the private file or credentials into git, logs, chat or a public build. Company evidence and its legal adequacy remain external prerequisites; the script does not certify them.
