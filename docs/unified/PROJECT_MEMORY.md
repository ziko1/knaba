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

## 2026-10-24 — fail-closed delivery gate
- Added `scripts/release-readiness.mjs`, CLI and 5 policy tests, and `docs/unified/RELEASE_READINESS.json`. Syntax/structure QA 5/5 PASS on isolated Node18 interpreter (policy is pure JS). Gate intentionally BLOCKED with missing source-specific release evidence, owner approval and handover. This is NOT Node24 ERP/site runtime testing.
- Opened unmerged Draft PR #12 https://github.com/ziko1/knaba/pull/12 for unified source; new branch count 15 (original inventory of 14 preserved as historical snapshot). No source-modifying CI/production changes.

## 2026-10-24 — KN-U03/KN-U04 local owner conversation checkpoint
- На незлитій integration branch реалізовано `corporate-site/worker/assistant-threads.ts`, локальну D1 migration 0001, guest + owner UI, private capability за заголовком, idempotency, audit, owner-only permission, IP-bucket rate-limit, routing до Cloudflare Worker.
- TDD red/green: 404→201; rate-limit 201→429; відсутній CF-IP 201→503; worker Assets missing `/api/assistant/*`→fixed. Локальні тестові журнали у VPS temporary folder; точний commit SHA додається до PR після GitHub write/verify.
- Гарантованого live owner identity, production D1, полів GDPR retention, A11Y/devices, delivery notifications чи ERP synchronization поки немає. Existing information assistant зберігся, real generative AI НЕ підключено. Release guard block залишається.
- Деталі: `docs/unified/KNABA_ASSISTANT_IMPLEMENTATION_2026-10-24.md`. Original `erp/` Git tree не змінювати.
- 2026-10-24 later QA: exact GitHub source SHA `f6b95f9b26d39bf246e307f3f00255da3f116ea7` ran 76/76 Vitest +8/8 inquiry, typechecks/build and static 51-page checks PASS. Astro hydration island `uid` HTML is not byte-deterministic across builds: preserve actual per-build artifact, not fake reproducibility. New verifier regression prevents rewriting tracked historical report. Code checkpoint for the verifier fix requires separate SHA and rerun.

## 2026-10-24 — exact code checkpoint and local HTTP end-to-end
- Verified **code SHA** `d803f42cc5ac007181d0dc77fb1c9c3fa017d27b`: clean checkout, ERP tree `a242ddb1a8b6395cafbc3cacbc0ce510f0be3c43`, corporate tree `24da512923a3ac96558698c1d5903f1a70985f6f`.
- Node24.21.0: Astro/Vue/Svelte 0 errors/warnings, 76/76 Vitest + 8/8 inquiry cases PASS; static build 51 pages, routing/noindex verifier and one evidence-nonmutation regression PASS. SHA256 of **one** built static artifact: `7143b6c18874a5d9b957e2d168ab7c0f160c4efd2e462173257882fc89ad3f79`. HTML Astro hydration UIDs cause nondeterministic byte hashes between builds. Do not relabel this hash as another build.
- Real **local** Wrangler Worker using synthetic D1 and artificial owner identity: guest POST 201, owner inbox GET 200, owner reply POST 201, guest message GET 200, mismatched owner 403. No real Sites Auth, real D1 production, real WhatsApp/email or user acceptance.
- Release safety gate remains intentionally blocked (exit 1; 25 required conditions) and the PR is Draft/unmerged. Source-linked local checkpoint: `docs/evidence/knaba-unified/assistant-chat-local-20261024.json`.
- Security blocker: verify that production Sites trusted identity headers are injected/sanitized and cannot be supplied by arbitrary browsers/direct-origin requests before any provider deployment. Also approve GDPR message retention, erasure, vendor AVV and operator access policy. No production changes or paid activation performed.


## 2026-10-24 — KNABA public site QA candidate (f9cb4f8da0bda3efe14dc8c578b109ee8b1bd221)
- Офіційний замовник https://knaba.de підтверджений користувачем; головні реквізити вже були правильні, Bauhelfer додано в PR #20, після справжнього failing regression виправлено подвоєний RU префікс.
- Гілка `codex/knaba-release-site-candidate-20261024` агрегує 2D з PR17, мобільний dropdown PR15, наявний owner thread/portal PR12 та lazy floating info/chat Assistant; не переписує ERP tree або DB.
- Node24: 88/88 Vitest + 8/8 Node, Astro/Vue/Svelte checks, build 51 pages, static links/SEO, npm production audit 0 reported; 16/16 ізольованих Chromium ширин/мов PASS. Exact tested source `f9cb4f8da0bda3efe14dc8c578b109ee8b1bd221`, site tree `ab61fb45b8ce3b5e2ea87def8ae568d07cf2cb81`, локальний build digest `1fb4dd3cb1b1e809b114a5a01cb6780f6fb3aa0cc51196c92d34f44061549281`.
- Live `kneba.vsp.rest` як і раніше old version, немає підключеного Sites publish/backup/rollback. PR19 notification recovery, реальні зовнішні провайдери та повний ERP UAT не прийнято. Status SITE_CANDIDATE_LOCAL_PASS / RELEASE_NOT_DEPLOYED.
- Документ по цьому checkout: `docs/unified/KNABA_SITE_RELEASE_CANDIDATE_2026-10-24.md`. Історичні source receipts залишаються незмінними.
