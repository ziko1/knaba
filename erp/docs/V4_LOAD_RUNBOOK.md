# V4 isolated load measurement

## SQL fixture recovery — 2026-10-11

Candidate `a10e70911fb519ec7d8199fa66141cd12b462926` includes the explicitly typed `$4::text` audit parameter and an importable `insertFixtureBatch` entry point. Six genuine PostgreSQL seed cases exercise actual batched aggregate/revision/audit writes and rollback; their exact executed result is in [the recovery receipt](evidence/assistant-replay-20261011/verification.json). This narrow regression coverage does not measure the 900-second workload, 100 active sessions, latency, webhook/provider/PDF concurrency, RPO/RTO or cost. Those targets remain NOT_RUN until their separate measurement protocols run. The workflow and thresholds below are unchanged.

The runner exists; no load has been executed merely by adding it. `scripts/v4-load.mts` measures the core HTTP workload. Webhook latency, enqueue-to-provider latency, three PDF jobs and native device transport remain separate `NOT_RUN` results. A successful core run is `PARTIAL_MEASURED_CORE_ONLY`, never a whole AC-67 pass.

Use Node24 and the pinned installation (`npm ci`). Run from an exact committed checkout; `EXPECTED_GIT_SHA` must equal its40-character Git SHA, with no tracked modifications or untracked files. The runner compares `/api/v1/version` before and after measurement and stores SHA256 hashes of its actual source dependencies. Build and attest `dist/release.json` against that same SHA before starting the API. A SHA string alone does not attest an unrelated binary.

The API and PostgreSQL must be dedicated synthetic TEST/DEMO resources. The runner never provisions infrastructure, changes a Railway plan, starts a worker, activates a provider, sends a real message or modifies another tenant. A new isolated GitHub PostgreSQL service is suitable; ordinary CI acceptance and Railway are unnecessary for this measurement. A provider-hosted run requires the existing company budget/window authorization separately.

Create an ignored private environment file, mode0600, with these exact variables. Replace the SHA and private PostgreSQL connection with the actual isolated values; do not publish that file.

```dotenv
APP_MODE=TEST
COMPANY_ID=knaba-v4-load-synthetic-fixture
KNABA_LOAD_COMPANY_ID=knaba-v4-load-synthetic-fixture
GIT_SHA=<exact committed40hex SHA>
EXPECTED_GIT_SHA=<same exact40hex SHA>
DATABASE_URL=<private connection to the dedicated isolated PostgreSQL17 database>
PORT=3000
PUBLIC_ORIGIN=http://127.0.0.1:3000
KNABA_LOAD_BASE_URL=http://127.0.0.1:3000
KNABA_LOAD_ALLOWED_ORIGINS=http://127.0.0.1:3000
KNABA_LOAD_ACK=SYNTHETIC_ISOLATED_DATABASE
LIVE_SEND_ALLOWED=false
LIVE_INTEGRATION_SEND_ALLOWED=false
```

Leave `WHATSAPP_ACCESS_TOKEN`, `DEEPSEEK_API_KEY` and `INTEGRATION_CREDENTIALS_JSON` unset. Do not run a worker with external credentials. Only exact allowlisted origins are accepted, without credentials/path/query/fragment; remote origins require HTTPS. Redirects are rejected. The company ID must start `knaba-v4-load-` and identify an otherwise empty tenant. Existing company data is rejected rather than replaced.

After `npm run build`, start the isolated migrated API using that private configuration:

```bash
node --env-file=.env.load --import tsx infra/migrate.ts
node --env-file=.env.load dist/server.mjs
```

The API may initially report not ready because its company does not exist. Its version endpoint must already expose the expected SHA and TEST mode. In a second terminal, the actual measurement is:

```bash
node --env-file=.env.load --import tsx scripts/v4-load.mts --run --profile full --output .local/v4-load-result.json
```

Without `--run`, the script writes a `NOT_RUN` template and touches no API/database. `--help` prints usage. `--profile smoke` runs15seconds and reports partial smoke measurements; it cannot pass the15-minute target. A measurement is not silently appended to normal CI.

The full fixture contains100 active employee users plus100 employee records,20 active sites,100 assigned internal tasks,2,000 closed synthetic historical shifts and exactly100,000 TimeSegments. Seed writes use batches of at most1,000 aggregates, each with revision/audit rows in the same actual SQL transaction. An explicit `load_fixture` records source hashes and counts. These fixture inserts do not prove product-command creation or physical working time. Seeding has a five-minute deadline and bounded SQL calls. The runner requires100 genuine AuthService sessions and confirms each through the actual `/me` API against the same company/database; login/password throughput is not measured.

For900seconds,100 independent cookie-session readers query `/me` and bounded TimeSegment pages every five seconds. A monotonic timer offers10 actual `task.worklog` commands per second, distributed over all employees/sites. Requests have a ten-second timeout and a512KiB response cap; command concurrency is capped at100, scheduling lag and dropped offers are reported. No failed/unknown command is blindly retried. SIGINT/SIGTERM stop offering work; bounded in-flight requests drain and the run reports aborted. Raw response bodies, cookie tokens, CSRF values, database URLs, employee names and keys are never written to evidence.

Core results include nearest-rank p95/p99 across all measured requests, successful/non-success/transport/5xx counts, the strict `<1%`5xx ratio, separate read/command metrics and observed HTTP concurrency. The workload must offer all9,000 commands and retain100 active sessions on the actual fixture. At least8,911 valid acknowledgements are required so a fast429-only service cannot pass as accepted throughput. Every acknowledged result is checked by returned ID against its actual tenant/actor/input hash/receipt, worklog facts, immutable revision, command audit and `worklog.created` outbox row. Missing/mismatched evidence counts as lost acknowledgement. Twenty deterministic acknowledged samples replay the original keys and must return their original IDs without adding a worklog. Unknown unacknowledged outcomes are stated separately rather than claimed reconciled to quiescence.

The file is written atomically below ignored `.local/`, mode0600. It contains exact source identity, fixture counts, gates, percentile/error measurements and hashes of acknowledged IDs; no raw session or server log is required. `FAILED`, `ABORTED` and refused configuration exit nonzero. Auth sessions are revoked after measurement. Fixture data and immutable audit/revisions remain for review; dispose of the dedicated database/volume only after retaining the redacted report. The runner does not delete business history.

A standalone optional hosted job can use a fresh PostgreSQL17.6 service bound to127.0.0.1, checkout the exact triggering Git SHA, install/build/migrate, start only the TEST API, run the command above and upload only `.local/v4-load-result.json`. A30-minute job budget covers installation/build, bounded fixture setup,15-minute traffic, drain and verification. Current ordinary `ci.yml` already has a30-minute verification budget; keep this workload in a separate explicitly selected workflow. Do not upload the private env file, raw cookies or API logs. If setup exceeds that budget, keep the actual failure receipt and review it before another run.

To complete AC-67, independently measure a source-pinned signed inbound webhook workload with actual durable inbox acknowledgement; instrument actual enqueue and provider-request timestamps using an approved isolated synthetic transport; and create an actual immutable published report containing50 task entries and20 optimized synthetic photo bytes, then measure three simultaneous PDF jobs while core traffic remains active. Retain each workload's source/fixture/transport scope, measurements and failure cases. This runner records those targets as `NOT_RUN` until such protocols are actually executed. End delivery and physical native acceptance are distinct evidence.
