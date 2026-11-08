# KNABA frozen-source PostgreSQL verification

Full-suite source: `b9532f041c36862241c9e4d931a02db1a9717ee9`; tree `050d9097083a73dc6e5adfe4eb2509319d94de06`. Corrected test-only source: `79b4ea3fd53dfca112616b697d2865b69a681c65`; tree `a7a77a7c8e8eff028fdf1db1e69f3215d3db87b9`.

Final result: the sole failing historical test is corrected and its complete17-case PostgreSQL file passes. The unchanged2,443 passing full-suite cases, corrected case and parent's77 locally verified helper cases provide composite2,521-case coverage. This is combined evidence from the full run and affected-file rerun, not a claim of one complete green suite invocation at the later commit.

The run used a separate public Git clone, exact detached commit/tree verification, Node24.22.1 and PostgreSQL17.11. PostgreSQL held synthetic fixtures on tmpfs inside a unique internal Docker network with no published ports. Application and database containers were resource limited, ran with dropped capabilities and sanitized environments, and mounted no production data. Only the exact temporary containers/network were removed after execution. The tested checkout remained clean.

## Observed results

| Check | Result | Evidence |
|---|---:|---|
| ERP TypeScript at frozen source | PASS, exit0 | `attempt-1/typecheck.log` |
| First PostgreSQL attempt | Runner configuration failure | `attempt-1/summary.json`; default initdb pg_hba accepted localhost but rejected separate application container |
| Corrected isolated database application preflight | PASS, actual SELECT1 and PostgreSQL17.11 | `attempt-2/postgres-app-preflight.log` |
| ERP suite,108 files | 2,443 passed;1 failed;0 pending | `attempt-2/vitest.json.gz` (lossless gzip), `attempt-2/summary.json` |
| New SQLite→PostgreSQL bridge integration | 4/4 passed | Raw Vitest report: `tests/site-intake-bridge.integration.test.ts` |
| Operations digest PostgreSQL integration | 16/17 passed | One historical test fixture expired beyond production370-day preview bound |
| Corrected operations digest integration at79b4 | 17/17 passed;0 failed/pending | `targeted-79b4/vitest.json`, `targeted-79b4/summary.json` |
| Exact task container/network cleanup | PASS | `attempt-2/cleanup-*.log`, summary exit codes |

Remote exclusions are exactly `tests/resources.test.ts` and `tests/native-ios-simulator.test.ts`, because this cached QA image lacks their Python/PDF helper tooling. Parent verified these77 cases locally at the same frozen source; remote exclusions are not reported as remote PASS.

The initial failing case is `two real worker instances across the repeated Berlin autumn 02:30 slot schedule only one job and readonly preview exposes the correct 25-hour plan day` at `erp/tests/operations-digest.integration.test.ts:175`. Its hardcoded2025-10-26 preview is377 days old on2026-11-07, correctly rejected by `DIGEST_PREVIEW_PERIOD_BOUND` (maximum370 days). The correction pins only JavaScript Date to2025-10-27 around the authenticated readonly preview and restores it in finally. PostgreSQL and asynchronous timers remain real. Both actual workers, the one-job assertion,25-hour day and zero generated digests remain unchanged; production bounds remain unchanged. The corrected file passes17/17 on fresh actual PostgreSQL.

The new bridge tests exercise an actual website SQLite dispatcher and real PostgreSQL adapter/transactions with an explicitly injected in-process transport. They verify post-commit lost acknowledgements, precommit rollback/retry, tampered tenant bytes/HMAC rejection and changed source holds. They do not establish HTTPS, production provider, browser or deployed-runtime readiness.

## Artifact integrity

- Full second-run Vitest JSON:1,087,219 bytes; SHA256 `46e2335d9c8f1f942b61155714be9f2634670b846c1bff62e45e1f351d90e8c7`.
- Second-run summary SHA256 `92af2ee6eaed1ee4fd2b1bed8b5e71d3f7acf0c52c2db60e8bddc85d702b895e`.
- Corrected targeted Vitest JSON SHA256 `90c51d074556b2aee7a6d398d4cdc806166d38ac413559840155e751f879e546`; summary SHA256 `4a201987cc0668f59d56da05d3b7077ff8fa511ebcab465bb69db37f8db15a3e`.
- `source-bindings-b953.json` records exact Git object IDs for ERP runtime trees, package/lock/config, bridge/schema/intake source and affected test.
- `source-bindings-79b4.json` verifies all14 recorded object bindings; exactly the historical test changed, and every recorded runtime binding is identical to the full-suite source. Full Git diff likewise contains exactly that one test file.
- `attempt-2/vitest.json.gz` is a lossless compressed copy of the raw report.
- Remote evidence directory: `/tmp/knaba-completion-qa-20261108-vqwmfqou/results-b9532f041c36-40aae2`.
- Corrected targeted remote evidence: `/tmp/knaba-completion-qa-20261108-vqwmfqou/results-79b4ea3fd53d-02fd1b`. Final temporary application, PostgreSQL and network removal all exited0; final checkout remained clean.

No production deployment, production database mutation, downloaded image, paid service activation or provider message was performed. An initial image-ID probe attempted a default pull, failed immediately and downloaded no image; all actual QA runs used --pull=never.
