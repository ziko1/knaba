# Delivery roadmap

## Responsive web acceptance on the V4 target — 2026-10-09

V4 source `7d8a0e92c083ca22e4f93595bd084031f7272599`, tree `d841afad8b71546d5fc7589d434b8f3bc056e5a2`, passed **54/54 responsive browser scenarios** (27 Chromium + 27 WebKit) and **27/27 application browser scenarios** (26 actual backend/UI + one explicit transport fixture), with zero failures/skips/flakes in those browser suites. Phone/tablet/desktop layout, the full German keyboard/focus sequence and the unchanged photo-mask review/approval scenario passed. The final matrix PNGs and successful 360px masking editor were verified and reviewed.

**The full V4 release remains NOT_READY:** 2,137/2,177 unit/SQL assertions passed: all 1,821 CPU/document/explicit doubles and 316 genuine PostgreSQL cases; 40 PostgreSQL cases failed. All original 39 failures from staging `366c30b` repeated, plus the audit-keyset case also observed at `3c31e94`; no failures changed between `3c31e94` and this test-only successor. Final native Android passed 66 host Java assertions/debug/lint, while iOS simulator preparation exceeded 60 seconds before any XCTest. Prior `3c31e94` native passed 66 Java/19 actual XCTest; application/native inputs are unchanged by the one-file test successor. No SQL/native retries or business-contract edits were added to this design task.

[Design contract](docs/RESPONSIVE_DESIGN.md), [exact V4 receipt](docs/evidence/responsive-2026-10-08/v4-receipt.json), [source bindings](docs/evidence/responsive-2026-10-08/source-binding.json) and [visual review](docs/evidence/responsive-2026-10-08/visual-review.json) record the actual scope. [PR #4](https://github.com/ziko1/knaba/pull/4) applies only the responsive UI and required harness to the authoritative V4 base. [PR #3](https://github.com/ziko1/knaba/pull/3) separately preserves the fully passing product-completion design; its accepted source remains `4ec7076`. The broader eight-conflict business merge, all 72 V4 / 475 whole criteria, company/physical/provider acceptance and deployment remain separate. The expired staging window was not extended.

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
