# Delivery roadmap

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
