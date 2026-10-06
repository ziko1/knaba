# KNABA DE

A separate KNABA DE operations product: customer enquiries and quotes, crew dispatch, sites and tasks, working time and travel, company chat and translation, inventory and procurement, remuneration and payout records, customer reports, assistant administration and audit. It has no dependency on AVENQO.

The [full V3 specification](KNABA_DE_MASTER_SPEC.md) is the authoritative scope. The application is implemented across the API, web console, PostgreSQL domain and durable worker. **Production acceptance is outstanding.** The user activated a Railway plan and an isolated `knaba-de-staging` project now exists with configured empty API, worker and PostgreSQL services. Code transfer and billing verification remain blocked; no verified public application URL exists yet. See [actual Railway staging state](docs/RAILWAY_STAGING.md). Real WhatsApp, AI processing, GPS and company legal/financial processes need the recorded prerequisites below. Source code and a green build do not establish those external results.

- [Readiness and handover](docs/HANDOVER.md), [remaining work](MASTER_ROADMAP.md), [single external prerequisite list](docs/EXTERNAL_PREREQUISITES.md)
- [Architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), [API contracts and command inventory](docs/API_CONTRACTS.md), [exact role permissions](docs/ROLE_MATRIX.md)
- [German user guide](docs/USER_GUIDE_DE.md), [bot administration guide](docs/BOT_ADMIN_GUIDE.md), [legal review checklist](docs/legal/LEGAL_CHECKLIST_DE.md)
- [Requirements matrix](docs/requirements/REQUIREMENTS_TRACEABILITY.md), [acceptance catalogue](docs/requirements/ACCEPTANCE_TEST_CATALOG.md), [risk invariants](docs/requirements/RISK_INVARIANTS.md), [machine-readable evidence](docs/evidence/)
- [Persistent project memory](PROJECT_MEMORY.md), [engineering rules](AGENTS.md), [change log](CHANGELOG.md)

## Run the isolated local application

Use Node **24.19.0**, the committed `package-lock.json`, and a dedicated PostgreSQL database. The schema is tested against the locally available PostgreSQL; the deployment image pins PostgreSQL **17.6**. Put configuration in a private, ignored environment file or the platform's secret manager. Never paste secret values into a command transcript or commit them.

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

`npm test` exercises domain, security, provider-adapter and PostgreSQL integration scenarios when the test database is configured. `npm run test:e2e` requires the browser test runner and a running isolated target. [Evidence](docs/evidence/) is authoritative for which checks actually ran, their timestamps and failures. The latest aggregate run passed 367 cases and skipped 37 real PostgreSQL cases; focused commerce passed 49 cases, including customer Issue lifecycle and knowledge ACL checks. These are scoped checks, not full-product acceptance. The [verification ledger](docs/TEST_EVIDENCE.md) records aggregate results, PostgreSQL/browser skips and historical failures. Final exact source/artifact hashes belong to `artifacts/RELEASE_MANIFEST.json`; use its status rather than a previous build after source changes.

Media uses private PostgreSQL `media_blobs` by default or the implemented private S3 adapter when `S3_BUCKET` is configured; provider failures do not silently switch storage. Both preserve checksums and separate sanitized client copies. Published report snapshots produce real PDF/XLSX/CSV exports, archived once per immutable version and format. PDF uploads require a configured clean ClamAV result; the unconfigured endpoint currently closes this path. Validated XRechnung/ZUGFeRD and accountant-specific integration remain outstanding. Payroll calculations are preliminary until an accountant verifies an official document. Recording a payout or purchase order does not execute a bank transfer or supplier order. Both Android and iOS native sources exist; APK/IPA compilation, signing and physical testing have separate unresolved gates. Default local sockets currently fail EPERM, blocking final API/PostgreSQL/browser/restore execution; CPU checks continue and EXT-22 records the concrete execution prerequisite. See [the roadmap](MASTER_ROADMAP.md) and [external prerequisites](docs/EXTERNAL_PREREQUISITES.md) before any production release.
