# Delivery roadmap

## Responsive web acceptance — 2026-10-08

Product-completion source `4ec7076f967d0dbe9fb5d413709ff493005c207e`, tree `b7506a6d62508067fc0c48a6aee564be1b7300c2`, passed **54/54 responsive browser scenarios** (27 Chromium, 27 WebKit; zero failures/skips/flakes), with direct downloaded PNG review. The application workflow passed **1,580/1,580** tests (1,356 CPU/document/explicit doubles + 224 genuine PostgreSQL) and **26/26** browser cases (23 actual backend/UI + 3 explicit transport fixtures), plus build, Docker, encrypted backup/tamper rejection, 17-table/10-blob restore, actual worker restart and packaging. Same-source native CI passed 52 host Java assertions and 15 actual simulator XCTest; physical-device acceptance remains separate.

[Responsive design](docs/RESPONSIVE_DESIGN.md), [exact product receipt](docs/evidence/responsive-2026-10-08/product-receipt.json), [source bindings](docs/evidence/responsive-2026-10-08/source-binding.json) and [reviewed screenshots](docs/evidence/responsive-2026-10-08/visual-review.json) preserve the tested code identity. [PR #3](https://github.com/ziko1/knaba/pull/3) targets the preserved product-completion line. The separate authoritative V4 port is [PR #4](https://github.com/ziko1/knaba/pull/4); its snapshot records 54 responsive passes, repaired photo masking, 39 repeated pre-existing SQL failures plus one additional observed audit-keyset failure, and a subsequent test-only retained-query setup correction awaiting its own run. See [the V4 snapshot](docs/evidence/responsive-2026-10-08/v4-receipt.json). These focused PRs do not merge the two business lines or certify all 72 V4 / 475 whole criteria. No deployment or expired staging-window extension was performed.

**V4 target approved 08.10.2026:** [target specification](KNABA_DE_TARGET_SPEC.md) and [ADR-0002](docs/adr/0002-v4-target-and-preserved-runtime.md) preserve the working NestJS/PostgreSQL SQL/outbox stack. All 72 V4 application criteria remain NOT_RUN; non-conflicting V3 functionality/history is retained. Public Railway is still NOT_READY.

Current plan, verified **2026-10-08**: [full development-to-product plan in Ukrainian](FULL_PRODUCT_DEVELOPMENT_PLAN_UK.md) and [28-package dependency backlog](docs/planning/DEVELOPMENT_BACKLOG.json). [MASTER_ROADMAP.md](MASTER_ROADMAP.md) records implemented workstreams; [PROJECT_MEMORY.md](PROJECT_MEMORY.md), the [432-requirement / 475-criterion matrix](docs/requirements/requirements.json) and [test ledger](docs/TEST_EVIDENCE.md) retain exact source/evidence history.

- [x] Separate repository and complete master specification
- [x] Architecture, default-deny scopes, transactional commands, immutable audit and durable worker
- [x] Domain modules, responsive web, adapters and native client source
- [x] Exact ca9 TypeScript/build and **1513/1513** checks, including **206 genuine PostgreSQL**; no skipped cases in hosted acceptance
- [x] **24/24** browser checks: 23 actual backend/UI + 1 explicit HTTP fixture
- [x] Actual Docker/worker, encrypted backup/tamper rejection, distinct **17-table / 10-private-blob** restore, independent source/runtime/docs verification
- [x] Android debug/52 Java and iOS simulator/15 actual XCTest plus independent native artifact integrity proof
- [ ] Current criterion-by-criterion assessment of all **475** whole acceptance criteria; preserve historical results
- [ ] Renew the **expired** bounded staging window through a concrete authorized decision; review updated patch and provider Dashboard MFA application
- [ ] Observe isolated PG/API/Worker SUCCESS, genuine HTTPS/runtime SHA/worker/browser acceptance and measured budget/load
- [ ] Company configuration/UAT, genuine providers, applicable conditional adapters and production offsite/privacy/operating controls
- [ ] Company-signed native releases and physical Android/iPhone permissions/GPS/background/offline/battery acceptance
- [ ] Final applicable V3 acceptance, authorized production release and documented ownership/handover

Code proof remains `ca9ed79ff4c0429223eb60754289ee1132088361`; documentation commits do not replace tested code identity. **No working public deployment is claimed.** Read-only Railway status on 08.10: API and Worker OFFLINE, PostgreSQL CRASHED, 37 changes STAGED/unapplied. Original cutoff `2026-10-07T20:11:52Z` has expired and has not been extended. Applying that old patch alone is no longer a valid live-launch procedure. See [actual snapshot](docs/evidence/railway-resume-2026-10-08.json).
