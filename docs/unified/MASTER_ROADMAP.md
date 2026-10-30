# KnaBa — master roadmap до передачі замовнику

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
