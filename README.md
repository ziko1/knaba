# KNABA DE

A separate KNABA DE operations product: customer enquiries and quotes, crew dispatch, sites and tasks, working time and travel, company chat and translation, inventory and procurement, remuneration and payout records, customer reports, assistant administration and audit. It has no dependency on AVENQO.

The [full V3 specification](KNABA_DE_MASTER_SPEC.md) is the authoritative scope. The API, web console, PostgreSQL domain and durable worker are implemented. Tested code is **`ca9ed79ff4c0429223eb60754289ee1132088361`**, complete tree `8144d5bc90fcefe9bcdb26255d55287e96f2a170`. Hosted SQL/browser/container/recovery/worker acceptance and independently downloaded source, documentation, runtime, Android debug and iOS simulator artifacts passed. **Public Railway acceptance and company production acceptance remain outstanding.** The isolated `knaba-de-staging` environment has 37 reviewed changes staged with API/Worker pins at the tested SHA; Railway requires their application through Dashboard two-factor verification. The allocated domain has no verified ready application yet. See [actual staging state](docs/RAILWAY_STAGING.md), [current release proof](docs/evidence/ci-run-37544413379-summary.json) and [native proof](docs/evidence/native-run-37544413386-summary.json).

- [Readiness and handover](docs/HANDOVER.md), [remaining work](MASTER_ROADMAP.md), [single external prerequisite list](docs/EXTERNAL_PREREQUISITES.md)
- [Architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), [API contracts and command inventory](docs/API_CONTRACTS.md), [exact role permissions](docs/ROLE_MATRIX.md)
- [German user guide](docs/USER_GUIDE_DE.md), [bot administration guide](docs/BOT_ADMIN_GUIDE.md), [legal review checklist](docs/legal/LEGAL_CHECKLIST_DE.md)
- [34-module readiness](docs/requirements/MODULE_READINESS.md), [Requirements matrix](docs/requirements/REQUIREMENTS_TRACEABILITY.md), [acceptance catalogue](docs/requirements/ACCEPTANCE_TEST_CATALOG.md), [risk invariants](docs/requirements/RISK_INVARIANTS.md), [machine-readable evidence](docs/evidence/)
- [Persistent project memory](PROJECT_MEMORY.md), [engineering rules](AGENTS.md), [change log](CHANGELOG.md)

## Run the isolated local application

Use Node **24.19.0**, the committed `package-lock.json`, and a dedicated PostgreSQL database. Actual hosted integration and recovery tests use PostgreSQL **17.6**, matching the pinned deployment image. Put configuration in a private, ignored environment file or the platform's secret manager. Never paste secret values into a command transcript or commit them.

The core runtime configuration is `DATABASE_URL`, `APP_MODE=DEMO`, `COMPANY_ID=knaba-demo`, a private `AUTH_ENCRYPTION_KEY` of at least 32 characters, the exact tested `GIT_SHA`, and `PUBLIC_ORIGIN` matching the actual browser origin. Set the **same** `COMPANY_ID`, mode, encryption key and database on API, worker and seed. DEMO/TEST seed data are labeled synthetic.

```sh
npm ci
node --env-file=.env.local --import tsx infra/migrate.ts
node --env-file=.env.local --import tsx infra/seed.ts
node --env-file=.env.local --import tsx apps/api/main.ts
```

In a separate process using the same environment:

```sh
node --env-file=.env.local --import tsx apps/worker/main.ts
```

For web development, run `npx vite --config apps/web/vite.config.ts --host 0.0.0.0`; it proxies `/api` to port 3000. For a packaged release:

```sh
npm run typecheck
npm test
npm run build
node --env-file=.env.local dist/server.mjs
node --env-file=.env.local dist/worker.mjs
```

The default application address is `http://localhost:3000`; this is a local address, not a deployed staging URL. Root `/health`, `/ready` and `/version` expose process/database/build checks. `/api/v1/ready` additionally checks initialized company data and the owner in PRODUCTION. Use `/api/v1/me`, authorized command schemas and authenticated business tests to establish application behavior; a health response alone is insufficient.

The [Dockerfiles](infra/Dockerfile) and [Compose definition](infra/compose.yml) provide container deployment. Validate the effective environment with `docker compose --env-file=.env.local -f infra/compose.yml config --quiet` before use. [Deployment authorization](infra/DEPLOYMENT_AUTHORIZATION.json) permits a new isolated synthetic Railway staging project within EUR 10/month; it does not permit an agent to purchase a plan, message real customers, move money or release company production.

## Verification and limits

`npm test` exercises domain, security, provider-adapter and PostgreSQL integration scenarios when the dedicated test database is configured. `npm run test:e2e` requires the browser runner and a running isolated target. The [verification ledger](docs/TEST_EVIDENCE.md) records exact execution scope and historical failures. Actual release [37544413379](https://github.com/ziko1/knaba/actions/runs/37544413379) passed **1513/1513** cases: **1307 CPU/document/explicit-double** and **206 real PostgreSQL**, zero failures/skips. All **24 browser** scenarios passed: **23 actual backend/UI** and **one explicit transport fixture**. Strict TypeScript/build, 14 built-file hashes, the actual Railway image, encrypted backup/tamper rejection, distinct 17-table/10-private-blob restoration and two worker process phases passed. Independently verified runtime uses Node24.19/Linuxx64; the current release receipt records exact manifest/archive checksums. Documentation updates have a separate Git identity and do not retag the tested runtime. These results do not certify every compound company/physical acceptance criterion.

Media uses private PostgreSQL `media_blobs` by default or the implemented private S3 adapter when `S3_BUCKET` is configured; provider failures do not silently switch storage. Both preserve checksums and separate sanitized client copies. Published report snapshots produce real PDF/XLSX/CSV exports, archived once per immutable version and format. PDF uploads require a configured clean ClamAV result; the unconfigured endpoint currently closes this path. Validated XRechnung/ZUGFeRD and accountant-specific integration remain outstanding. Payroll calculations are preliminary until an accountant verifies an official document. Recording a payout or purchase order does not execute a bank transfer or supplier order. Actual native run [37544413386](https://github.com/ziko1/knaba/actions/runs/37544413386) passed 52 Java tests, Android lint with zero errors/eight warnings, a verified debug APK and 15 XCTest cases on an exact iOS18.5 simulator. Downloaded APK signature/content and simulator archive hashes were independently verified. Company release signing, installable signed IPA and physical background/GPS/battery/device checks remain outstanding. Local sockets fail EPERM; actual hosted SQL/browser/restore execution resolves runner availability, while public Railway readiness still requires Dashboard application and separate live verification. See [the roadmap](MASTER_ROADMAP.md) and [external prerequisites](docs/EXTERNAL_PREREQUISITES.md) before any production release.
