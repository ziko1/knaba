# KnaBa — інтегрована пам'ять продукту

**Проєкт:** KnaBa Gebäudereinigung, окремий від AVENQO. **Репозиторій:** https://github.com/ziko1/knaba. **Дата фактичної перевірки:** 2026-10-24.
**Статус:** INTEGRATION_PLANNED / DELIVERY_NOT_READY. Є перевірені окремі модулі та історичні runtime receipts; спільний release SHA/artifact і клієнтський UAT відсутні.

## Непорушні джерела
1. ERP: `KNABA_DE_TARGET_SPEC.md` (V4, на ERP-гілках) є target; `KNABA_DE_MASTER_SPEC.md` — історична V3/специфікація, неперекреслені вимоги зберігати. Root `AGENTS.md`, `PROJECT_MEMORY.md`, `MASTER_ROADMAP.md`, `docs/planning/DEVELOPMENT_BACKLOG.json` на ERP-гілках — **не перезаписувати**.
2. Маркетинг: `corporate-site/PROJECT_MEMORY.md`, `ROADMAP.md`, SEO/legal audits, Russian і PublicAssistant receipts — зберегти в первісному вигляді.
3. Ця інтеграційна пам'ять і `BRANCH_AUDIT_2026-10-24.md` — **індекс**, не підміна вихідних документів. Конфлікти контрактів фіксувати в ADR і закривати окремими перевірками.

## Інвентар стану
- GitHub main `ff748a2e5731e973883344ed28f3e82cf8a3bc06`: не містить повний runtime. 14 гілок і 10 Draft PR (всі unmerged) перевірені, перелік у BRANCH_AUDIT.
- Поточна integration source branch base `db6c514c52d038b6491aa101bca6cd5fa76cc102` — site + RU + публічний інформаційний помічник.
- ERP кандидат `deploy/knaba-vps-20261013` `35b687c400d423966742bac9f1e503032794dbf1`, але не сертифікований як інтегрований production; PR #6 pinned runtime success стосується `a10e70911fb519ec7d8199fa66141cd12b462926`.
- Сайт `kneba.vsp.rest` HTTP 200 2026-10-24; корпоративне джерело `corporate-site/`, Astro 7.4.2 + SolidJS/Vue/Svelte, Worker + D1 для заявок, чат лише на локальному наборі знань. Публічний /konto/ = Assistent, приватний /portal/ = рольовий портал.
- Контакт із власником: заявка через наявний `POST /api/leads` зберігається в D1 і видима уповноваженій адміністрації; ДВОСТОРОННЯ переписка з анонімним відвідувачем, автоматичні повідомлення власника (email/WhatsApp) і LLM-provider — НЕ підтверджені як готові.
- Оркестрація: SentinelX VPS agent відповів pong (версія 0.23.27); ai-team service виявлений в конфігурації управління, але запуск підлеглих агентів/нові модельні кредити не перевірені; **жоден субагент у цьому аудиті не заявляється як запущений**.
- VPS `vsp`: 197 GiB filesystem, 164 GiB used, ~24 GiB available (88% full) станом на перевірку; не розміщувати додаткові CI-кеші без дискового бюджету.
- Можливості локального QA: системний Node v18.19.1 НЕ відповідає `corporate-site/package.json` engines >=22.23.4; Node v22.23.3 знайдено в `/srv/avenqo/toolchains/node22`, але також нижче заявленої patch-версії. Тести на невідповідному runtime не називати релізними.
- Мета: повний handover клієнту **тільки після** технічних, бізнес-, правових, provider/credential, безпекових та людських acceptance gates.

## Рішення архітектури, що зберігають чинний код
- Пропозиція: один репозиторій, дві окремі deployable одиниці на перехідний період: `corporate-site/` (public+role portal+BFF/D1) і `apps/ packages/` (ERP/API/worker/PostgreSQL). Без Big Bang rewrite, без Redis без виміряного bottleneck.
- ERP PostgreSQL — головна система обліку замовлень, працівників, часу, грошей та незмінного аудиту. D1 — edge storage для intake/тимчасових розмов, **не друге джерело ERP-істини**.
- Єдиний lead-to-order contract через versioned authenticated outbox/inbox з idempotency, replay, tenant/company/site scope; не дублювати PII або перерахунок грошей на клієнті.
- Ролі визначаються довіреною серверною identity, а не query/cookie/browser claims. Для ERP↔site потрібен зв'язок stable subject та tenant membership, не лише рівність email.
- "KNABA Assistant" — локальні перевірені відповіді без обману щодо AI; передавання запиту власнику через persisted Lead уже можливо. Діалог real human + AI provider/WhatsApp лише після контракту, прав, consent, audit, бюджетів та наскрізних тестів.

## Безпека і бюджет
- **Нових витрат і активованих платних сервісів в цьому етапі: 0 EUR.** Залишок реальних квот та повна вартість hosting/AI/WhatsApp — UNKNOWN; це не твердження про безкоштовний runtime.
- Нічого не merge, production deploy, не змінювати D1/Postgres дані, не перевидавати secrets без конкретного схвалення. Захищати PII, GDPR права, retention, AVV, провайдерні MFA. Тестувати на synthetic fixtures.
- Зберегти існуючі пороги й Railway authorization EUR10/month із ERP governance; його expired cutoff НЕ продовжується автоматично.

## Продовження
Порядок залежностей, команди, checks і критерії завершення — `MASTER_ROADMAP.md`, `BACKLOG.md`, `INTEGRATION_CONTRACT.md` і `docs/plans/2026-10-24-knaba-integration-handover.md`. Записувати кожний наступний checkpoint з точним source SHA, diff, тестами PASS/FAIL/NOT_RUN та rollback, не змінюючи попередні receipts.

## 2026-10-24 — source tree assembly checkpoint
- Added `erp/` as an unchanged Git tree reference from deploy candidate `35b687c400d423966742bac9f1e503032794dbf1`; tree `a242ddb1a8b6395cafbc3cacbc0ce510f0be3c43`.
- Preserved exact `corporate-site/` tree `6ce56eb811af9733ce9b0b08dab3b636dfaf6371`, all original local memory, inherited tests and original ERP `erp/AGENTS.md`.
- Integration root `AGENTS.md` is a wrapper; ERP original remains authoritative inside `erp/`. New root `package.json` provides intentional per-module scripts with no dependencies; scripts do not certify runtime acceptance.
- Source assembly verification instructions and boundaries: `docs/unified/SOURCE_IMPORT_2026-10-24.md`. Runtime integration **NOT_RUN / NOT_READY**; no merge, deploy or database changes.
