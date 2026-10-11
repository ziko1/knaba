# Delivery roadmap

## Поточний SQL/runtime checkpoint — 2026-10-11

Executable `3f4370c3b3ba66941a42f6840db0f25ae57fca65`, tree `464057c0a7cea50a7a55eb1d5f88fb95f3203225`, branch `codex/knaba-v4-sql-recovery-20261011`, [draft PR #5](https://github.com/ziko1/knaba/pull/5). [Application CI 38097796239](https://github.com/ziko1/knaba/actions/runs/38097796239) — **SUCCESS: 2 228/2 228 PASS, 0 FAIL, 0 SKIP**, 89 files, включно з **407 genuine PostgreSQL** та 1 821 CPU/document/explicit-double cases. Локальний результат лишається окремим: 1 821 CPU PASS, 0 FAIL, 407 PostgreSQL NOT_RUN; TypeScript PASS.

Поточний exact source також пройшов **27/27 browser cases** (26 actual backend/UI + один HTTP fixture, 0 FAIL/SKIP/flaky), build/TypeScript/Docker, backup/tamper rejection, distinct database/private-blob restore, two-process Worker heartbeat/restart і hosted packaging. [Native CI 38097796144](https://github.com/ziko1/knaba/actions/runs/38097796144) — **SUCCESS: 66 host Java + 19 actual XCTest PASS**, debug/Simulator scope; lint — 0 errors, 10 warnings. Application artifact і всі 14 built files, native payloads, 45 iOS bundle file hashes та simulator identity незалежно перевірені.

Перше actual CI `1cbdbdc` [38096631407](https://github.com/ziko1/knaba/actions/runs/38096631407) завершилося **FAILED: 2 226/2 228 PASS, 405/407 PG PASS**; нові PG cases — 51/51 PASS, browser — 27/27 PASS, restore та Worker — PASS. Тоді відновлено 39/40 історичних SQL failures. У `3f4370c` обидва залишкові fixture cases підтверджено actual PASS, **40/40 історичних mappings PASS** (включно з двома явними V4 REWORK замінами), **51/51 новий PG case PASS**. [Поточний ledger](docs/evidence/sql-recovery-2026-10-11/verification.json), [межі доказів](docs/evidence/sql-recovery-2026-10-11/README.md) та [native summary](docs/evidence/sql-recovery-2026-10-11/native-summary.json) відокремлюють ці джерела.

- [x] SQL/runtime guards, облік оціночного AI бюджету, V4-compatible fixtures і seed CTE опубліковані як окремий code checkpoint
- [x] Exact-source application і native debug/Simulator CI пройдені; application/native evidence незалежно перевірені
- [ ] Закрити D07 gaps і прийняти відповідні складені критерії; окремо виконати KNB-23 load/recovery/cost та необхідні provider/company/physical/production gates

**SQL/runtime increment пройшов зазначені перевірки; продукт і public deployment NOT_READY.** 72 V4 / 475 V3 критерії не прийняті сумарними технічними тестами. Облік відомих AI outcomes використовує оцінку за налаштованими ставками й не підтверджує фактичні зовнішні списання. Повна незалежна передача runtime handover лишається окремим gate. Expired staging cutoff і €10/місяць не змінені. Наступні датовані записи та ca9 checkboxes зберігають історичні результати.

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

Historical independently delivered code proof remains `ca9ed79ff4c0429223eb60754289ee1132088361`; the current executable checkpoint is `3f4370c3b3ba66941a42f6840db0f25ae57fca65` with the separate CI state above. Documentation commits do not replace tested code identity. **No working public deployment is claimed.** Read-only Railway status on 08.10: API and Worker OFFLINE, PostgreSQL CRASHED, 37 changes STAGED/unapplied. Original cutoff `2026-10-07T20:11:52Z` has expired and has not been extended. Applying that old patch alone is no longer a valid live-launch procedure. See [actual snapshot](docs/evidence/railway-resume-2026-10-08.json).
