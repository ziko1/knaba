# KnaBa — master roadmap до передачі замовнику

**Стратегія:** поетапна композиція вже реалізованого, жодних руйнівних переписувань. Послідовність — після acceptance попереднього gate; паралельно можливі лише незалежні документи/UI/тести з неперетинними файлами.

| Фаза | Результат, критерій виходу | Залежність | Статус |
|---|---|---|---|
| G0 Інвентар | 14 гілок, PR #1–#10, target runtime/budgets, security і historical test matrix перевірені | — | Документовано 2026-10-24; live/HEAD можуть змінитися |
| G1 Governance | Збережено ERP AGENTS, V3/V4 canonical docs, corporate memory; окремі PROJECT_MEMORY/ROADMAP/BACKLOG/BUDGET та інтеграційні ADR, PR | G0 | Документи в інтеграційному кандидаті; acceptance перед merge відкрите |
| G2 Site intake | /api/leads -> D1 receipt -> owner inbox; авторизація owner/admin, безпечне повторення, мобільна і locale поведінка | G1 | Історичний окремий модуль; live owner UAT не пройдено |
| G3 Owner conversation | Контакт без login, по-справжньому двосторонні owner/client повідомлення, consent, token-scoped conversation, audit, idempotency; без надсилання приватної історії AI автоматично | G2 | NOT_IMPLEMENTED у перевіреній інтеграційній версії |
| G4 ERP bridge | D1 outbox→Postgres inbox/lead, tenant & site scoping, durable retry, дедуплікація, backfill, rollback | G2, ERP pin | NOT_IMPLEMENTED |
| G5 ERP domain reconcile | Порівняти PR #2/#3 з поточним V4 без повтору UI; зберегти fix/replay з #5/#6, пакет #7/ deploy, фінанси й права | G4 або паралельний ізольований review | NEEDS REVIEW |
| G6 AI & channels | Детерміновані FAQ → опційний budget-governed AI; operator override, consent; email/WhatsApp через дозволені owner credentials, outbox/delivery status | G3, G4, зовнішній дозвіл | BLOCKED_EXTERNAL |
| G7 UX/SEO/I18N | DE/RU+EN/UK чесні маршрути, мобільний responsive/focus, гіди, schema, офіційна індексація тільки після міграції; UI gate PVUX | G2–G6 | PARTIAL; full A11Y/CWV/human не виконано |
| G8 Security/QA | RBAC/tenant isolation, CSRF, rate limits, injection, PII erasure, backup→restore, concurrency/idempotency, E2E tests, реальні провайдери, physical Android/iOS | G2–G7 | NOT_RUN інтегровано |
| G9 Customer UAT | Тест власником (адмін, заявка, reply, worker job, зміна статусу, фінанси, рахунки), підтверджені логотип/реквізити/юридичні документи, інструкції й доступ | G8 | BLOCKED_EXTERNAL |
| G10 Release/handover | Backups і dry-run rollback, staged rollout, перевірений official domain, exact artifact hashes/metrics та підпис клієнта | G9, explicit deployment approval | BLOCKED |

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
