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
