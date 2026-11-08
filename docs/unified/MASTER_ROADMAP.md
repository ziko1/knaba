# KnaBa — master roadmap до передачі замовнику

## 2026-11-08 — F2 technical dependency satisfied

Exact `e03d2be0d0ea1ae7ced90f50631c7b81cd34c5b5` / tree
`7dd5cf0868b6774e80712324cf692c1f18a24342`: main42485949823 має4 required
SUCCESS; ERP3127,24 F2 PG,7 actual F2 pair та9 rendered HTTP-fixture cases PASS.
Незалежне artifact/source review — `ACCEPT_F2_TECHNICAL_PASSWORD_BASED_CONTRACT`.
F3 contract design тепер дозволений; його session issuance і dependent F4,
privacy/native/provider/device/operational acceptance залишаються відкритими.
Native media source розробляється окремо; старі native artifacts не доводять
нові inputs. Whole product NOT_READY, усі compound AC без підвищення.
Деталі й межі: [поточне покриття](CURRENT_REQUIREMENTS_COVERAGE_2026-11-08_UK.md)
та `evidence/full-completion-20261108/federation-aggregate-ci.json`.

## 2026-11-08 — F2 source та локальний gate

F2 password-based dual-session link/unlink і source revocation coordinator
інтегровано у20fbbb; CI/fixture continuation019458c зберігає виконуваний код.
Незалежний source review і локальний330-case VPS gate прийняті у своєму scope.
До F3 потрібні фактичні24 PostgreSQL,7 runtime-pair і9 rendered fixture cases
на одному candidate. F3 session exchange, dependent F4 delivery, privacy
нових metadata та зовнішнє приймання залишаються відкритими. Current details
і докази: [coverage](CURRENT_REQUIREMENTS_COVERAGE_2026-11-08_UK.md).
Жоден whole-product AC не підвищено; наступний combined checkpoint уже
зарезервовано в чинному BUDGET.md, без нових jobs або paid activation.

## Поточний checkpoint — 08.11.2026, PR129 / початкові CI failures

[PR129](https://github.com/ziko1/knaba/pull/129) опублікував source
`5d6eeae0862e52cc693c1766f0c6fba964b12aa5`. Його tree
`7de0c8019ae5ab6959930225996a0c978859deba` дорівнює tree локально
перевіреного `4b1e3538e3b2c39b7bfdd0ed028cf598e6f9cb26`; саме `5d6eeae`
є опублікованим candidate. Подальший local fixture-only commit —
`b1951236f06d32cfd687460e3826c8453265bc63`; local commits не позначати remote.
[Application CI 42472254239](https://github.com/ziko1/knaba/actions/runs/42472254239)
на опублікованому `5d6eeae`: root job **SUCCESS**; site job **FAILED** —
7/834 Vitest cases, `ReferenceError: receipts is not defined` у handler-only
VM fixture. Окремий local fixture-only commit
`b1951236f06d32cfd687460e3826c8453265bc63` підключає справжній receipt
controller; product runtime та всі 16 cases/assertions незмінні.
Independent source review ACCEPT; локально **834 Vitest + 92 Node PASS**.
Це не переписує failure `5d6eeae`; потрібен новий exact-source CI.

ERP job **FAILED: 3016 PASS / 8 FAIL із 3024 tests**, failures у трьох
файлах. У job `128705591810`, який загалом FAILED, крок bridge виконав
actual SQLite→HTTP→PostgreSQL **9/9 PASS / 0 SKIP**; потім actual Chrome 156 / Playwright 1.55.1 role run
виконав 98 checks і завершився locator timeout на прихованій request card
у `completedCabinetCases`. Display receipt, languages, public viewport та
ERP rendered cases не досягнуті. Browser receipt `errors:[]`, `engines:[]`:
це locator FAIL, не sandbox/policy BLOCKED. `inputsUnchanged:true`; manifest
`6978647c6ec28b3cea682af4af9669b408fd9f293d032c83ad6d8c915cb4043f`
прив'язує client/worker/VPS/ERP-dist до exact source.

[Android 42472254246](https://github.com/ziko1/knaba/actions/runs/42472254246)
**SUCCESS**. [iOS 42472234257](https://github.com/ziko1/knaba/actions/runs/42472234257)
**FAILED**: 60-second `simctl list devices` timeout до Swift compile;
цей run не доводить компіляцію застосунку чи виконання XCTest. Native artifact readback,
physical acceptance та повний bridge/product criterion залишаються окремими.
Докази, raw log excerpts, job IDs та artifact hashes:
[initial-aggregate-ci.json](evidence/full-completion-20261108/initial-aggregate-ci.json).
Поточний CI Android APK має інший runner debug signer; він не підміняє
попередній локальний APK у ланцюжку встановлення/оновлення.

| Напрям | Реалізований поточний source | Наступний критерій виходу |
|---|---|---|
| Сайт / KN-C05 | 7-day capability expiry/revoke, keyset inbox, шість мов, технічний guest display receipt; 0015/0016 та current-authority fences | Actual rendered receipt/role/locale acceptance на точному artifact; owner UAT; retention/erasure |
| ERP AC-07 | ERP guest → WhatsApp dual-channel transfer, hash-only TTL 10 хв, canonical conversation-only consent і перевірка перед dispatch | 10 current PostgreSQL transfer cases PASS; далі rendered fixture CI та окремий real-provider acceptance; повний AC-07 NOT_RUN |
| Identity / KN-C04, KN-U09 | Current session/device authority; F1 storage/resolver. Scoped 5d6 CI: authority 36 CPU/7 PG, F1 16 PG/27 CPU PASS, весь ERP run FAILED | Усунути current CI failures; F2 dual-session UI/proof → F3 scoped session → F4 revocation/privacy → F5 acceptance. SSO NOT_IMPLEMENTED |
| Assistant→ERP | Form-lead outbox існує; D1 conversation і ERP conversation залишаються окремими | Source-preserving conversion з явною згодою та належним identity/tenant contract; історія не копіюється через AC-07 |
| Native | Android 0.5.0-test/code 8 debug APK/AAB на `83327e5`, 59 unchanged native inputs; selective iOS actions/recovery source, 128 contract tests | Exact-source native CI, Xcode/XCTest, signing та actual device/role/GPS journeys; старі artifacts не перевидаються під новим SHA |
| ERP domain / templates | Shared vehicle-trip summary/UI, 18 TPL v1 source, account settings, partners/footer та locale payload correction інтегровані | Повні V4/V3 бізнес-сценарії, template operator/restore/quota, current budgets/load та production-like restore |

Поточна послідовність: отримати й перевірити artifact/source-bound CI;
закрити виявлені регресії; виконати залежні identity/assistant conversion
інкременти; пройти повні критерії у потрібних середовищах; лише після цього
погоджений handover. Локальні root 29 PASS, transfer root 74 PASS / 10 PG SKIP
та upstream F1 proof мають різні межі й не утворюють сумарного acceptance.
Посилання на докази: [актуальний scope](CURRENT_REQUIREMENTS_COVERAGE_2026-11-08_UK.md),
[transfer review](evidence/full-completion-20261108/erp-transfer-review.json),
[F1 upstream excerpt](evidence/full-completion-20261108/identity-foundation-ci-excerpt.json).

Матриця залишається **114 unique rows / 42 IN_PROGRESS / 72 AC NOT_RUN**;
збережені V3 432 requirements / 475 acceptance / 34 модулі. Загальний статус
**NOT_READY_FOR_CLIENT_DELIVERY**. Цей checkpoint не виконує merge,
production activation чи paid provider operation. Нижчі датовані записи
описують попередні source і не підвищують поточний кандидат до PASS.

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

## 08.11.2026 — F3 і native media, source checkpoint до actual CI

Чинний технічний baseline — actual F2 e03d2be/run42485949823. Наступний спільний candidate додає source-reviewed F3 server/web і native media; actual aggregate acceptance PENDING. [Checkpoint і залежності](F3_NATIVE_MEDIA_CHECKPOINT_2026-11-08_UK.md). Native F3 implementation починається лише після actual PostgreSQL/pair/browser PASS та independent acceptance. Product NOT_READY; normative V4/V3 scope й compound AC збережені.
