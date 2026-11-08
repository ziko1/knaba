# KnaBa — master roadmap до передачі замовнику

## 08.11.2026 — C08-C прийнято; F4-C1 identity privacy export

C08-C прийнято на `4e6ac0990ddd73bed142ab05b5f7579d8ed3048a` / [PR136](https://github.com/ziko1/knaba/pull/136), [CI42491574791](https://github.com/ziko1/knaba/actions/runs/42491574791), attempt1: ERP3144/126 файлів, notification-policy PostgreSQL21 включно з7 новими cases, template-origin19; bridge82, site732+37+35+10+8+297, root30. Усі4 mandatory jobs SUCCESS, acceptance skips0, independent source/raw-log ACCEPT. [Receipt](evidence/template-origin-20261108/accepted-4e6ac0.json). Duplicate push42491540824 SUCCESS; correction не знадобилась.

F4-C1 додає окремо погоджуваний `knaba-dsar-v2` для власної ERP-local identity history у PROFILE. Initial actual-builder RED відтворив відсутність exact legal-approval revision guard; новий код перевіряє reviewed revision і збережену request projection. Legacy approved без поля лишається v1; canonical v1 bytes та вже створені artifacts збережено. Reader працює в поточній company transaction, виключає proof/credential hashes і непідтверджені чужі preview identities, відхиляє overflow/invalid lineage до artifact write. Початково97 CPU PASS; після незалежного review scope-mutation RED→GREEN фінальні36 нових +62 governance =98 PASS. Final TypeScript exit0 і root30 PASS;12 незалежно написаних PostgreSQL cases прийняті root на рівні source, локально NOT_RUN. Exact-source CI нового кандидата ще NOT_RUN. [Контракт](IDENTITY_PRIVACY_EXPORT_2026-11-08_UK.md).

F3 issuance, F4 identity retention/erasure/restore/background policy, TPL01–18 та specialist/device/company/provider/load gates залишаються OPEN. Паралельний mobile branding0.6.0 у PR135 має власний source/CI; прийняті bb223af0.5.x packages не називаються найновішими. Whole product NOT_READY; original72 V4/475 V3 не перепозначено.

## 08.11.2026 — KN-C08-B прийнято; template delivery consumer

KN-C08-B прийнято на `d76bb939c83103fcbf4ed4374a48f4ea85b920d2` / [PR134](https://github.com/ziko1/knaba/pull/134), [CI42489218942](https://github.com/ziko1/knaba/actions/runs/42489218942): ERP3118/125 файлів, зокрема всі244 configuration cases; bridge82, site732+90+297, root30. Усі4 required jobs SUCCESS, acceptance skips0; independent source/raw-log ACCEPT. [Receipt](evidence/production-config-20261108/accepted-d76bb9.json). Native artifacts лишаються на окремому accepted bb223af.

KN-C08-C продовжує підтверджений template-origin consumer gap. TEMPLATE без явної валідної адреси має завершуватися FAILED/DEFINITIVE до SENDING/provider call, зі збереженням TEXT/WEB без origin та validated raw URL у claim snapshot. Початковий actual-consumer RED відтворив SENDING/attempts1; після fix237 focused CPU PASS, включно з19 новими cases. Ці SQL/actor/provider doubles не є PostgreSQL або live Meta acceptance. Незалежний runtime/CPU review ACCEPT; root окремо прийняв7 нових actual leased PostgreSQL cases на рівні source. Фінальні TypeScript і root30 PASS. Actual SQL та exact-source CI нового commit ще NOT_RUN. [Контракт](TEMPLATE_ORIGIN_GUARD_2026-11-08_UK.md).

F3 issuance, решта F4 policy/privacy, template catalog і specialist journeys, GIT_SHA adjacent audit та physical/company/provider/load/restore gates лишаються OPEN. Whole product NOT_READY; original72 V4/475 V3 не перепозначено.

## 08.11.2026 — зведений native/backend кандидат прийнято; KN-C08-B

Спільний source `bb223af67af9eae5f11e7ca225f89ddf97a8e4e2` / [PR133](https://github.com/ziko1/knaba/pull/133) прийнято незалежно: [repository CI42486326925](https://github.com/ziko1/knaba/actions/runs/42486326925) — ERP 2969/124 файли, bridge 82, site 732+90+297, root 30; [native CI42486326902](https://github.com/ziko1/knaba/actions/runs/42486326902) — Android 32 JUnit, lint 0 errors/20 warnings, APK/AAB; iOS 67 XCTest на iPhone 16/iOS 18.5 Simulator. Усі required jobs SUCCESS, acceptance skips 0. [Source-bound receipt](../mobile/evidence/native-consolidation-20261108/accepted-bb223af.json). Це debug Android і unsigned iOS simulator; owner signing/device/store gates відкриті.

На цій прийнятій базі ізольовано реалізовано KN-C08-B: explicit production company, strict/canonical API origin, optional raw worker origin, узгоджені BOT/preflight guards і runtime Docker dependency. Локально initial focused 238 PASS; після вузького BOT grammar RED→GREEN — final affected 137 PASS, TypeScript PASS. Ці overlapping runs не підсумовуються. Exact-source hosted acceptance нового source ще PENDING. [Контракт](PRODUCTION_CONFIG_GUARDS_2026-11-08_UK.md), [input evidence](evidence/production-config-20261108/verification.json).

F3 issuer, решта F4 privacy/retention/background policy, template-origin consumer gap, повні specialist/device/company/provider/load/restore acceptance залишаються OPEN. Whole product NOT_READY; вихідні 72 V4 / 475 V3 критерії не перепозначені.

## 08.11.2026 — C08 accepted; current native/backend source consolidation

C08 прийнято на `e747fd94e219e09faffea96c2f9f84be15a6def1`, [PR132](https://github.com/ziko1/knaba/pull/132), [CI42483792274](https://github.com/ziko1/knaba/actions/runs/42483792274): ERP 2905/124 файли, bridge 82, site 732+90+297, root 30, усі required jobs SUCCESS, independent ACCEPT. Ці результати належать саме e747.

Ізольоване зведення переносить прийняті iOS 0.5.1 source changes з `65f341e…` до цієї backend-бази. Android, API/worker та сайт збережені. Локально 126 native registry contracts, TypeScript і 30 root checks PASS; combined exact-source/native CI ще NOT_RUN. [Контракт зведення](NATIVE_CONSOLIDATION_2026-11-08_UK.md). COMPANY_ID/origin audit стоїть окремо в черзі. Whole product NOT_READY; original V4/V3 criteria не перепозначені.

## 08.11.2026 — F4-B accepted; KN-C08 explicit runtime mode

F4-B прийнято на e740ef969e2a6a261f0e7ba613b741ed889ec0fe / [PR131](https://github.com/ziko1/knaba/pull/131) / [CI42481614075](https://github.com/ziko1/knaba/actions/runs/42481614075): ERP — 2832 тести у 122 файлах; bridge — 82 (усі 51 F4-B, upgrade та 17 self-dispatch); site — 732+90+297; root — 30; усі 4 jobs SUCCESS без acceptance skips, незалежний review ACCEPT. Початковий fixture FAIL збережено в [evidence](evidence/federated-session-authority-20261108/verification.json).

Наступна ізольована гілка feat/knaba-explicit-runtime-mode-20261108 виправляє KN-C08: явний APP_MODE до запуску API/worker/preflight, узгодженість injected Engine і worker mode, staging helper без implicit DEMO. [Контракт](EXPLICIT_RUNTIME_MODE_2026-11-08_UK.md). Незалежний source review ACCEPT; локально 123/123 focused, 1 цільова integration fixture, TypeScript і 30/30 root PASS. Exact-source hosted acceptance ще PENDING; F3, решта F4, F5 та whole product NOT_READY.

## 08.11.2026 — F4-B source reviewed; actual acceptance pending

Незалежно прийнято separate federated store/reader та current signed site authority, exact outage-safe logout і вузьке завершення self-dispatch із terminal session revocation. Додано51 actual bridge case; SQL/HTTP acceptance ще NOT_RUN. Локально128 focused CPU (останній guard delta повторно27),95 site checks,30 root, candidate ERP build; ці overlapping proofs не додаються й не замінюють exact-commit CI. [Input hashes, review, local logs і межі](evidence/federated-session-authority-20261108/verification.json). Новий flag defaultoff; F3 issuance, рештаF4 policy/privacy, F5 і весь продукт NOT_READY.

## 08.11.2026 — F2 і local F4-A accepted; F4-B prerequisites до F3

F2 dual-consent binding/unlink accepted at`1a6e837de7a351a67bf4bef3bda00961aed19d83`, [CI42472941316](https://github.com/ziko1/knaba/actions/runs/42472941316). F4-A local ERP request fences accepted at`5133519984b6b50676393a7c4c4e541677d2cefa`, [CI42475824054](https://github.com/ziko1/knaba/actions/runs/42475824054): ERP2820/122 files, bridge31, site732+90+268, root30, independent source/log review ACCEPT. Кожний результат має власне точне джерело; це не приймання нового F4-B.

Порядок реалізації уточнено без зміни вихідних критеріїв: перед видачею F3 потрібні local F4-A і F4-B перевірки current site authority та revocation. Інакше новий session issuer відкрив би доступ раніше, ніж його можна коректно відкликати. F4-B separate store/reader та signed introspection наразі IMPLEMENTED_CANDIDATE / ACTUAL_SQL_NOT_RUN; [контракт](FEDERATED_SESSION_AUTHORITY_2026-11-08_UK.md). Browser issuance, повні privacy/retention/background policy, F5 live/browser/device/company і canonical V3/V4 acceptance залишаються OPEN. Production/signing/store/provider activation не виконані.

## 08.11.2026 — F1 actual PostgreSQL acceptance

Exact runtime/test source `0fede54f80895a425e72df1d921a643b40a4eaf0`, [CI 42464719363](https://github.com/ziko1/knaba/actions/runs/42464719363): all 4 mandatory jobs PASS; ERP 2782 tests in 120 files, including 16 new real PostgreSQL 17.6 cases and 27 CPU trust cases; bridge 9; no failed/skipped acceptance tests. Synthetic previous-schema upgrade, repeated migration and old-runtime rollback preserve users, bindings and audit. Independent source review accepted the exact inputs. [Evidence](evidence/site-identity-foundation-20261108/verification.json). F1 storage is verified; F2–F5 and shared SSO remain unimplemented/open, full product NOT_READY. No production migration or deployment.

## 08.11.2026 — F1 identity storage source candidate

Продовження KN-C04 / KN-U09: canonical site authority + immutable site_user_id, server-owned company/trust mapping, additive binding schema, immutable target і terminal revoked tombstone. Внутрішні bind/revoke operations та audit атомарні; public login/session/catalog не додано. CPU trust tests 27 PASS, TypeScript PASS; реальні SQL acceptance до hosted CI залишаються NOT_RUN. Контракт і обрані рішення: `SITE_IDENTITY_FOUNDATION_2026-11-08_UK.md`. F2–F5, shared login і повний продукт залишаються відкритими; немає production activation або міграції реальних даних.

## Exact-source CI checkpoint — 08.11.2026

Runtime/test commit **`fddd1601d989af3054099706589e1e8ab91ecf40`**, tree **`4d413410bc748085b60d679d42586ee86f4d1e8a`**: [run 42455220007](https://github.com/ziko1/knaba/actions/runs/42455220007) завершив усі чотири обов’язкові jobs успішно. ERP **2677/2677** у 117 файлах зі справжньою PostgreSQL17.6 (включно з 8 новими SQL cases), bridge **9/9**, site **732 Vitest + 90 Node + 197 VPS**, root **28/28**; 0 FAIL/SKIP. Typecheck, migrations, clean build identity та site build/budgets пройшли. Попередній локальний SQL NOT_RUN лишається історичним фактом; hosted CI є окремим виконанням.

Поточне доповнення з CI evidence є documentation-only; 34 runtime/test input hashes незмінні. Подальший documentation HEAD не змінює tested executable identity і не доводить browser/device/provider/UAT. **SSO NOT_IMPLEMENTED, продукт NOT_READY.**

## 08.11.2026 — KN-C04 / KN-U09: поточне посилення авторизації

Підтверджені локальні розриви сайту/ERP виправляються в чинному Draft PR123; [контракт і точні межі](IDENTITY_RECONCILIATION_2026-11-08_UK.md), [перевірки](evidence/identity-20261108/verification.json). Це окремий source-bound checkpoint після d03e72b; попередні результати нижче зберігають власний SHA.

Порядок наступного federation increment: F1 trusted principal/company registry → F2 dual-session link/unlink з обома UI → F3 scoped ERP session exchange → F4 authoritative revocation та file/worker/stream fences → F5 isolated browser/device/company acceptance. Кожний етап потребує негативних tenant/same-email/replay/race сценаріїв і незалежного review до залежного кроку. **SSO не реалізовано; загальний NOT_READY і всі незакриті V3/V4 acceptance збережені.** Чинний lead transport не дублювати.

## Актуальний порядок — 08.11.2026

Детальні залежності й acceptance: [COMPLETION_PLAN_2026-11-08_UK.md](COMPLETION_PLAN_2026-11-08_UK.md). Поточний інкремент: source reconciliation → seed/Studio/Android correctness → сайтова черга та ERP idempotency → exact-source QA. G4 тепер **IMPLEMENTED_CANDIDATE / LIVE_NOT_ACTIVATED**, обмежений новими form leads; історичний рядок NOT_IMPLEMENTED нижче збережено як checkpoint. G5 domain audit виконано на рівні source/tests, повний UI/UAT не закрито.

Далі: stable identity і assistant→ERP, stable content IDs і18 template вимог,72 V4 сценарії плюс збережена V3 матриця, native devices/канали, навантаження/restore/клієнтська передача. Жодна фаза не стає ACCEPTED лише за кількістю unit tests.

**Стратегія:** поетапна композиція вже реалізованого, жодних руйнівних переписувань. Послідовність — після acceptance попереднього gate; паралельно можливі лише незалежні документи/UI/тести з неперетинними файлами.

| Фаза | Результат, критерій виходу | Залежність | Статус |
|---|---|---|---|
| G0 Інвентар | 14 гілок, PR #1–#10, target runtime/budgets, security і historical test matrix перевірені | — | Документовано 2026-10-24; live/HEAD можуть змінитися |
| G1 Governance | Збережено ERP AGENTS, V3/V4 canonical docs, corporate memory; окремі PROJECT_MEMORY/ROADMAP/BACKLOG/BUDGET та інтеграційні ADR, PR | G0 | Документи в інтеграційному кандидаті; acceptance перед merge відкрите |
| G2 Site intake | /api/leads -> D1 receipt -> owner inbox; авторизація owner/admin, безпечне повторення, мобільна і locale поведінка | G1 | Corporate TEST v8 public/read-only evidence PASS; owner identity/roles, реальне intake→owner і mobile UAT OPEN |
| G3 Owner conversation | Контакт без login, по-справжньому двосторонні owner/client повідомлення, consent, token-scoped conversation, audit, idempotency; без надсилання приватної історії AI автоматично | G2 | NOT_ACCEPTED інтегровано: локальна source implementation є; реальний owner↔visitor UAT OPEN |
| G4 ERP bridge | D1 outbox→Postgres inbox/lead, tenant & site scoping, durable retry, дедуплікація, backfill, rollback | G2, ERP pin | NOT_IMPLEMENTED |
| G5 ERP domain reconcile | Порівняти PR #2/#3 з поточним V4 без повтору UI; зберегти fix/replay з #5/#6, пакет #7/ deploy, фінанси й права | G4 або паралельний ізольований review | NEEDS REVIEW |
| G6 AI & channels | Детерміновані FAQ → опційний budget-governed AI; operator override, consent; email/WhatsApp через дозволені owner credentials, outbox/delivery status | G3, G4, зовнішній дозвіл | BLOCKED_EXTERNAL |
| G7 UX/SEO/I18N | DE/RU+EN/UK чесні маршрути, мобільний responsive/focus, гіди, schema, офіційна індексація тільки після міграції; UI gate PVUX | G2–G6 | PARTIAL: corporate TEST v8 HTML/noindex/OG і scoped desktop PASS; full A11Y/CWV/device/human acceptance OPEN |
| G8 Security/QA | RBAC/tenant isolation, CSRF, rate limits, injection, PII erasure, backup→restore, concurrency/idempotency, E2E tests, реальні провайдери, physical Android/iOS | G2–G7 | NOT_RUN інтегровано; scoped corporate TEST v8 QA не є acceptance інтегрованої системи |
| G9 Customer UAT | Тест власником (адмін, заявка, reply, worker job, зміна статусу, фінанси, рахунки), підтверджені логотип/реквізити/юридичні документи, інструкції й доступ | G8 | BLOCKED_EXTERNAL |
| G10 Release/handover | Backups і dry-run rollback, staged rollout, перевірений official domain, exact artifact hashes/metrics та підпис клієнта | G9, explicit deployment approval | Production/handover BLOCKED; окремий дозволений corporate TEST v8 опубліковано |

## Командна черга (AI Team v3; не означає запуск агентів)
- **Architect / integration owner:** ADR, source of truth, API identity, загальний приймальний gate; єдиний власник спільної схеми.
- **Backend/security:** D1/SQL bridge, idempotency/lease, provenance, privacy і restricted roles.
- **Frontend/mobile UX:** public assistant→owner path, portal inbox, responsive, DE/RU/EN/UK та PVUX, без змін backend schema.
- **ERP domain:** reconcile V3→V4 business contracts, money in integer EUR cents, worker/notifications, tests.
- **QA/performance:** reproducible runner, exact-source results, browser devices, p95 baseline, backup restore; незалежний diff review.
- **Content/legal/SEO:** verified company info, translations, legal approval, localized routes, noindex until official.
- **Operations:** no new credentials/service until approval, budget & quotas, rollback, staged deployment. Ролі — план робіт; фактичне призначення агентів і фінансові ліміти перевіряти перед запуском.

## Delivery definition of done
Один конкретний integration SHA і reproducible build; немає критичних RBAC/PII/tenant/data-integrity дефектів; unit+actual SQL+browser+mobile scopes PASS із доказами; real owner↔client chat і notifications UAT; backup/restore і rollback rehearsal; legal/AVV/retention/provider approval; money/invoice flows перевірені; owner прийняв документи і доступи. **Жоден окремий unit PASS не замінює цього переліку.**

## Ітерація G1a — фізичне компонування джерел
`erp/` і `corporate-site/` тепер існують поруч в інтеграційній гілці як незмінні Git дерева; root `AGENTS.md`, `package.json` і source guard додані. G1a не є еквівалентом G2–G10: синхронізації D1↔Postgres, власникового двостороннього чату, billing/WhatsApp/LLM та інтегрованого QA немає. При виконанні плану шлях `apps/` на вихідних ERP-гілках відповідає `erp/apps/` у зібраному кандидатові.

## G8 fail-closed preflight added
Root script `npm run audit:release` fails until each mandatory release gate is independently evidenced on an exact source, owner approval is recorded, and evidence file hashes are verified. `docs/unified/RELEASE_READINESS.json` deliberately has NULL source/artifact and NOT_RUN/BLOCKED_EXTERNAL statuses. This safety code is not production-ready acceptance, and it does not replace the independent reviewer.

## Local G3 increment (2026-10-24)
Source implementation of anonymous owner conversation (KN-U03/KN-U04) is locally testable with additive D1 SQLite schema, UI and owner portal. This is **implementation candidate only**; G3 remains NOT_ACCEPTED until real provider authenticated owner + visitor UAT, privacy/retention, device/UX and independent review. No D1-to-ERP bridge or notification transports. Tracked in `KNABA_ASSISTANT_IMPLEMENTATION_2026-10-24.md`.


## G6 voice/role dispatcher increment — 2026-10-25
A separate Draft PR candidate adds non-provider browser voice DE/EN/RU (+UK), public intent/role routing and explicit owner chat handoff. Dependencies and full implementation phases are in docs/plans/2026-10-25-knaba-assistant-360-voice.md. Actual browser microphones / WhatsApp API voice / operator softphone / ERP lead+worker events / native device acceptance are not yet approved or tested. G4–G10 and fail-closed release gate remain OPEN. Check full source/QA evidence before changing any gate.

## 2026-10-26 — source provenance repair (source-only)

Historical import remains `66b07fb46d23c7110473c51fc23ce58d3c40a1b1`; committed current ERP/site changes are reported separately, with whole-worktree dirty/staged/untracked and tracked canonical-file checks. Node24 root suite 20/20 PASS at `58ddae49ff142aa41c88a3d8afd17717265b7f9b`; source audit PASS; release gate intentionally exit1. Evidence: `docs/evidence/readiness-repair-20261026/verification.json`. No ERP/site runtime file changed. Separate PR67-based migration repair preserves divergent site features; unified runtime and independent review not accepted.

## G1b — 2026-10-26 modular source composition
Latest site and historical ERP V4 sources preserved together without destructive rewrite. Four active same-origin CMS/CRM/Portal/Inbox modules, ERP runtime stays source-only pending KN-U07 tenant-scoped bridge/DB ledger. Preview-only manifest added; G4/G8/G9/G10 and production release HOLD unchanged. See `KNABA_MODULAR_CMS_RECOVERY_2026-10-26_UK.md`.

## G2 auth — 2026-10-26 invitation-only user registration source
Owner-verified user invite, pending client/worker activation, existing session and owner approval have local QA. FULL ACCEPTANCE OPEN until real email identity or private verified handoff, real owner/browser, native device, accessibility, actual migration+backup, independent security review, ERP scoped SSO/BFF and authorized release. Do not close G2/G4/G10. Details: KNABA_AUTH_REGISTRATION_2026-10-26_UK.md.

## G2 auth hardening — 2026-10-26
Source-based tested owner invitation revoke, own secret rotation, aggregate TCP-source login limit. Real cross-user proxy limits, real HTTP POST behavior, owner consent/identity, verified sender, native browser and ERP scoped subject mapping are acceptance blockers. Draft #107 only, no release.


## 2026-10-28 — TEST-V8-20261028: завершена перевірка корпоративного TEST

**Корпоративний public TEST v8 — PASS у recorded scope; unified runtime та production acceptance залишаються OPEN/HOLD.** URL: [https://kneba-temporary-preview.just-fawn-8470.chatgpt.site/uk/](https://kneba-temporary-preview.just-fawn-8470.chatgpt.site/uk/). Canonical code `c35ac616d60bcf9269e53f98d0c483312030b5d7`, native source `ca2d68e19b659603e253462466359b827f8bb8fb`, deployment `appgdep_6ae207db10c081919e32386f0cd902b2` від `2026-10-28T14:34:18.077544+00:00`.

| Завершений підобсяг | Фактичний результат |
| --- | --- |
| Source/local QA |333 Vitest/47 files +native regression chain PASS (9 modules у фінальному runner) +90 VPS HTTP +9 preparation fixtures; Astro/typechecks0 errors/0 warnings/7 hints; обидві verified builds. |
| Hosted artifact |134/134 точних HTML/hash, meta/HTTP noindex і TEST OG refs;9/9 assets,3/3 indexing files,13/13 API/read/anonymous authorization,5/5 HEAD/304/404 protocol checks. |
| Збереження й бюджети |Початкові130 routes/938 controls збережені в134-page артефакті; дозволені mobile/privacy additions описані; CSS39,824gzip, ліміт40KiB не підвищено. |
| Native hosting fixes |Dispatcher bypass вирішено перевіреним HTML finalizer; TEST social origin і generated prerender exclusion прийняті незалежним source review, потім реальним v8 readback. |
| Browser scope |V8 UK visual reload PASS; functional desktop flows на v6 з тими самими client modules для перевірених сценаріїв. Mobile/owner/role/Studio/ERP UAT не заявляються. |

Початковий G3 `NOT_IMPLEMENTED` стосувався історичного інтеграційного інвентарю; наступний Local G3 increment і поточний код доводять source implementation, але не real-owner acceptance. Датовані попередні checkpoints та fail-closed release definition збережено. Новий TEST receipt не закриває G1/G2/G3/G4/G5/G6/G7/G8/G9/G10 як повні інтеграційні gates і не змінює `RELEASE_READINESS.json`.

Наступні справжні задачі: structural Studio composer, controlled media upload/storage/rights/rollback,95 reviewed locales; D1→ERP Postgres scoped bridge і domain reconciliation; owner/role/Studio та physical-device UAT; реальний CAPTCHA/proxy two-client/backup-restore acceptance; provider/merchant/legal/media approvals; native signed app distribution/ERP SSO; production/handover за окремим дозволом. Окремий VSP private TEST v1 має14 HTTPS PASS, але browser owner gate не є product visual acceptance чи доказом KnaBa integration.

Докази: `corporate-site/docs/evidence/requirements-followup-20261028/` і актуальна corporate requirements matrix. Закрито дозволену тестову публікацію вебсайта; решта названих gates не підміняється цим результатом.

## Source reconciliation checkpoint — 2026-10-30

Це уточнення source/QA scope, без масового закриття G4–G10 або whole-product acceptance.

| Напрям | Поточний стан |
|---|---|
| Зведення завершених джерел | Робоча гілка і draft PR118; exact initial tree перевірений. Original local25 не заявляються як remote ancestry. |
| ERP scoped QA | PASS: 2510/2510, 300 suites, typecheck/build; ERP tree `38c5257cfdd9495ece494e32ef26f714e6dd4dd1`. Native CPU 9 включені. |
| Final site runtime a193ffd4 | PASS:466 Vitest/86 Node/137 VPS, check/build 160 сторінок/verify; CSS 40 958 B і all-emitted JS 222 112 B нижче незмінених strict caps. |
| Browser journeys | BLOCKED_ENV через відсутність usable sandbox; actual journeys NOT_RUN. |
| Site↔ERP bridge, provider/company/native-device acceptance | Залишаються відкритими у своїх початкових межах. |
| Source identity / передача | Актуальний HEAD у PR118; exact readback і root clean verification — у source-lineage/root-validation receipts. |
| Main/production/live changes | Окремі gates; source publication не є їхнім дозволом. |

[Повний звіт звірки](GITHUB_RECONCILIATION_2026-10-30_UK.md).

Пізня звірка також включила точний пакет PR117 `ops/sitepanel/` (13 файлів, source `3a873771bc69947b0db9444d72fb6876e4bf355e`): 34 Python + 18 simulated DOM/CLI PASS. SQLite ResourceWarning зафіксовано; install/account-policy scripts не виконувалися, live host/browser acceptance окрема. Додавання пакета не змінило перевірені site/ERP inputs.

## 2026-10-30 — KN-PANEL-LIVE-20261030: scoped host isolation continuation

The existing PR117/PR118 implementation was reused; no second panel, installer rerun, credential change, DNS change, site source deployment or merge occurred. Tested source: `30191734a356b879d6f7005d077657f1fd9dd11d`; all 13 package blobs match PR117 `3a873771bc69947b0db9444d72fb6876e4bf355e`. Independent source checks: 34/34 Python and 18/18 simulated DOM/CLI. Installed broker/UI/service hashes match the corresponding source files.

**Live correction (08:37 Berlin):** an old KNABA graphical session retained adm/sudo/lxd membership despite the restricted account database. The coordinator restarted only the display manager and that user manager, preserving the configured desktop/autologin preference. Independent reviewer `/root/host_security_review` confirmed fresh groups and denial of LXD/Docker, system logs, VSP private roots and temporary artifacts. Two VSP-owned temporary directories were restricted to mode0700; owner data was preserved. All 11 running Docker container IDs/start times and three sampled systemd processes remained unchanged.

**Live verified:** Linux-UID own-site catalogs; foreign-site unsupported-action rejection before action authorization; direct Docker socket denial; PAM account stage accepts knaba/vsp and rejects root/service/unknown accounts; current registry targets/namespaces/mount roots/systemd dependencies do not cross account ownership. Real broker start of already-running own containers succeeded for both accounts without restart; one KNABA-only SQLite online backup succeeded (integrity ok, zero foreign-key errors, root0600). These checks do not prove all stop/restart paths.

**Open gates / HOLD for full panel handover:** authenticated PAM password/browser journeys, hostname-valid trusted VPN TLS, actual post-change host reboot. Current TLS works when explicitly trusting the installed certificate for localhost, but VPN IP hostname validation fails. A staged certificate request was rejected by Tailscale: account does not support getting TLS certificates; no certificate installed or account setting changed. Cloud browser could not reach the private VPN endpoint. Existing VSP application processes still retain old supplementary sudo group; current explicit sudoers deny prevents sudo, and application restarts were deferred to preserve running sites. Some VSP inventory entries remain external/nonoperable; direct production secrets/backups remain administrator-only.

Future source hardening: reject cross-owner duplicate runtime targets, shared Docker namespaces and cross-account systemd dependencies in the broker itself. Current root-owned configuration was inspected separately; synthetic guard gaps are not relabeled as an observed current tenant exploit. Review package and private host receipts are retained outside Git; see [scoped continuation](SITEPANEL_LIVE_CONTINUATION_2026-10-30_UK.md). Unified product/release gates stay open.

## 2026-10-30 09:28 Berlin — KN-PANEL-HARDENING continuation

SP-R1–SP-R3 source hardening implemented and installed in the existing broker: duplicate configured/runtime target aliases, shared Docker namespaces, nonstandard resolved systemd lifecycle relationships, and host-level manager actions are refused. Exact broker SHA256 `74c5b9d0dc6475144e14f115bbb9c8d8b00b437fda00f974d33adacce7e5ee2e`. 47 Python +18 simulated DOM/CLI PASS, with independent source review; 47 Python also passed on the physical host. No installer/account helper rerun.

Broker-only atomic update at 09:26:46–56 Berlin passed, with socket admission fencing, accepted-client drain, pending0, exact backup and rollback guards. Own catalogs and two own already-running-container starts passed; foreign unsupported actions denied. All11 containers and2 VSP app services retained runtime identities/start times;6HTTP probes200; ledger5/pending0. Independent live review at09:27:58 confirmed these facts. Offline restoration of the previously created backup passed exact bytes/logical data/integrity/FK/write-rollback; full application restore remains NOT_RUN.

HTTPS remains BLOCKED_AUTH/CONFIG: current certificate covers localhost only; no active Tailscale admin session, no repeated certificate issuance or network/account changes. Password/PAM browser journeys, recovery login and actual host reboot remain OPEN. Standard root-managed systemd boot primitives/administrator TOCTOU, backup mapping generalization and shared resource isolation remain explicit boundaries. No site source/image/data, credentials, DNS or main merge changed. [Scoped evidence, commands and rollback](SITEPANEL_HARDENING_2026-10-30_UK.md).


## 2026-11-07 — поточний baseline і кореневий CI

[Звіт про завершення](COMPLETION_STATUS_2026-11-07_UK.md) відокремлює реалізований код, реальні локальні докази, незавершені identity/ERP bridge та зовнішні gates. ERP typecheck/build і 2050 CPU assertions PASS; 460 SQL cases у цьому локальному прогоні NOT_RUN. [Кореневий CI](CI_SETUP_2026-11-07_UK.md) підготовлено й перевірено локально, remote execution ще NOT_RUN. Окремі template/native продовження не отримують чужих test receipts. Загальний статус залишається NOT_READY; історичні source/runtime докази збережено.

## 08.11.2026 — integrated completion candidate

Candidate branch `feat/knaba-integrated-completion-20261108` reconciles PR121 (`7e448c6024718b932b79eeb2d38f3e3af672a1ae`) and PR122 (`690a0b9c882f5a3ef5d08e83c043f39091676603`), retaining both histories. Current execution/evidence is tracked in the candidate Draft PR and its exact-head GitHub Actions run; earlier receipt counts are historical, not acceptance of this composition.

Implemented: template ZIP selection/upload/preview/publication/rollback; Studio atomic publication/session fences; Android0.4.1 recovery source; a single reference-only `site_erp_outbox` shared by Worker/VPS/manual CLI, pinned company/mapping/privacy/body hashes, bounded retry/lease/UNKNOWN and owner-only status; ERP signed target-company enforcement; 24-hour invitation cap including legacy tokens. Site template migration0013 stays byte-for-byte; bridge is0014. An existing PR122-only0013 database requires separately reviewed backup/reconciliation, never ledger relabeling. External transmission remains disabled without both explicit gates and complete trusted configuration.

Independent scoped source review ACCEPT. Focused core58, SQLite migrations30, transport45, scheduler3, CLI22, Worker restart1, ERP target-company5 and identity29 cases passed before composition freeze. Full aggregate build/SQL/HTTP CI must pass on the final committed source; do not add these overlapping groups to future suite totals. No browser, physical device, provider delivery, deployment or client acceptance is inferred.

Whole product remains NOT_READY. The canonical72 AC registry is not bulk-updated. Remaining code includes stable site/ERP federation, two-channel guest conversation transfer and vehicle/person trip reconciliation; external gates include browser/device, iOS distribution, provider/owner/legal/restore/load/UAT. Zod advisory remains OPEN_WITH_MITIGATION. See `CONSOLIDATION_2026-11-08_UK.md`, `AC_EVIDENCE_MAP_2026-11-08_UK.md` and `COMPLETION_PLAN_2026-11-08_UK.md`. No main merge, production/DNS/data mutation, paid activation or client handover was performed.

## 08.11.2026 — exact integrated CI checkpoint

Tested source `09e267dad63f1a443ce08f532889b9f0f5d2dca5`, tree `de365326e7fe81a53a38a0bb1bf2c0da1b178305`, [Draft PR123](https://github.com/ziko1/knaba/pull/123), [GitHub Actions42430003249](https://github.com/ziko1/knaba/actions/runs/42430003249): all four required jobs SUCCESS. ERP2549/2549 in112 files (real PostgreSQL17.6 included), actual site-SQLite→ERP-HTTP→PostgreSQL9/9, site730 Vitest+90 Node+172 VPS, root28;0 FAIL/SKIP. Site161HTML, CSS40930B gzip and JS225019B gzip within unchanged budgets. Local ERP release.json matches exact source, source_dirty=false/GIT_WORKTREE; its existing large-JS-chunk warning remains visible.

The first1988090 run had six stale14-migration fixture failures; correction verifies exact ordered SQL/journal filenames without weakening guards. Both independent review and full repeat passed. The4 adapter SQL cases are already included in2549;9 HTTP cases are separate.

Browser on09e267d is BLOCKED: prior Chromium environment restriction is preserved; WebKit/Firefox executables unavailable. Native APK0.4.1 is the previously verified artifact d7d452189331e4b2bfd0f8f0772b297db8cac0bca69825d876a87f01fc6a2b4b, not a newly built/signed release:44 manifest runtime/build/test inputs match and only README differs. Physical devices, iOS distribution, providers, live production, complete restore/load/legal/company UAT remain NOT_RUN/BLOCKED. Whole-product status remains NOT_READY; federation, two-channel guest transfer, trip reconciliation and full compound AC coverage remain open. Zod advisory remains OPEN_WITH_MITIGATION; lockfiles unchanged.

Evidence: `docs/unified/evidence/integrated-20261108/verification.json` and `ci-excerpts.json`. This checkpoint is documentation only after the tested runtime. Do not label a later documentation commit as a newly built APK or ERP artifact. No merge to main, production/DNS/live-data change, paid activation or customer handover. Next: close source gaps by the existing AC evidence map, then authorize isolated target/device/provider/restore acceptance and review the exact release artifact.
