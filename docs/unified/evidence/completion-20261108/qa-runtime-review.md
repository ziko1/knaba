# KNABA independent QA preparation — 2026-11-08 Europe/Berlin

Reviewer: `/root/qa_runtime`. Candidate base `557838e23356cb463f273803099ab6321e675019`; shared working tree is still changing, no overall acceptance claimed.

## Recovery source review

- Reviewed `company.ts`, shared Layout/footer and favicon/generator/test diffs. Contact/brand recovery is narrowly additive; current Assistant contact route retained, no old hardcoded landline restored.
- Exact byte equality against recovered server `1292a2a1d1f6b13cf6d3cbea04635749e55f391b` for company.ts; recovered `fdceea162fee2461c1f3954a1e139be1d3d1f713` for favicon.svg/png/ico and generate-favicons.mjs.
- `node --test tests/contact-ui-dedup.test.mjs`: 12 PASS, exit0. `npx vitest run tests/construction-brand.test.ts tests/company-profile.test.ts`: 4 PASS in1 actual file, exit0; company-profile file absent and did not run. This is current source behavior, not live/browser readiness.
- Remaining gates: integrated build/HTML/strict budgets and current browser rendering. No blocking finding in reviewed recovery source.

## Real PostgreSQL runner discovery

- Connected SentinelX host identity `knaba` verified; existing cached image `sha256:c28822481b78f5a917cb269bec78e43f62923117b35a53e32cc9dcf53a85fe75` exposes Node24.21.0/npm11.19.0, no ERP npm dependencies, Python or pdftotext.
- PostgreSQL cached image `sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab`. No image downloaded. One probe of an absent shortened image tag caused Docker default pull attempt, which immediately failed; all subsequent probes require --pull=never.
- Existing company services/data were not modified. Temporary read-only network-none image probes exited and were removed automatically.
- No usable ERP dependency cache found in permitted known paths. Current corporate-site npm cache is not substituted for ERP dependencies.
- Intended verification: exact candidate via incremental Git bundle + existing public base, clean npm ci within temporary container, private internal network, no published ports, synthetic PostgreSQL on tmpfs, bounded CPU/RAM/PIDs, cleanup only exact named task containers/network. All source assertions and SQL-specific outcomes must retain exact source/tree and raw log hashes.
- Python-dependent resources.test.ts and native-ios-simulator.test.ts need helper tooling or explicitly separate local evidence. Root local suite already exercised these; do not mark skipped remote files PASS.

No final PostgreSQL run yet; awaiting frozen source.

## Updated preparation and bridge review

- Verified PostgreSQL17.11 image `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`; the earlier0cefa image is PostgreSQL16.15 and will not be used.
- Fresh remote clone `/tmp/knaba-completion-qa-20261108-vqwmfqou/source` is detached at the exact base. Initial dependency installation inherited image production mode and omitted dev packages; caught by an actual esbuild import probe before test execution. Corrected with `env -i` and `npm ci --include=dev --ignore-scripts --no-audit --no-fund`;285 packages, exit0. Corrected dependency log SHA256 `790865a4eb3ab90a233713f65ed0d0d1ab13b6b328d5236891d50d2db597375b`.
- Runtime probe then passed for Node24.22.1, pg.Pool, sharp0.35.5/vips8.18.7 and an esbuild TypeScript transform. Prepared frozen-source runner is `/workspace/scratch/fe1b7c871eec/qa-frozen-runner.py`; syntax checked, no final suite run yet.
- Independently read website SQLite dispatcher, outbox schema, atomic intake enqueue and four new actual-PG integration tests. No blocker found in disabled-by-default gates, source/privacy/service mapping, request HMAC, immutable envelope/destination binding, lease CAS, bounded response/timeout, deterministic retries and uncertain-outcome holds. API transport injection is explicitly not HTTPS/deployed-runtime proof.
