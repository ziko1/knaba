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


## 2026-10-25 — KNABA Assistant 360 voice/dispatch candidate
- Child feature branch: feat/knaba-assistant-360-voice-20261025 based on integration Draft PR #12 HEAD 1c15e5a4451ef26d080863ba3ddcaeaefbf7b0d4. Full plan: docs/plans/2026-10-25-knaba-assistant-360-voice.md.
- Public-only DE/EN/RU/UK intent routing, role selector, click-to-listen browser Web Speech STT/TTS, stop/reset/locale cleanup, owner form handoff and discoverable site navigation in existing Astro/Solid UI. No backend auth, D1, ERP or old contract modified; worker/customer roles remain server protected.
- Local Node 24.22.1 candidate checks: Vitest 96/96, Node inquiry 8/8, Astro/Vue/Svelte diagnostics clean, build/static verifier PASS before the final nav copy amendment; rerun on final SHA before claiming final proof. Browser-native microphone/vendor voices and actual live WhatsApp calling NOT_RUN.
- No real WhatsApp Business account eligibility, phone/media provider, owner softphone, D1↔ERP bridge or legal/UAT acceptance confirmed. All external calls/providers remain off. No merge, production deploy or new paid activation. VPS disk ~95% used, capacity constrained.
- Prior source pins and historical receipts remain unchanged; independent review and release gates remain open. Follow the new plan, not a claimed full product acceptance.

## 2026-10-25 — Telegram channel checkpoint (development branch)
- Draft source is stacked on KNABA Assistant 360 PR #38, not the live `kneba.vsp.rest` VPS release. Reuses existing ERP PostgreSQL `webhook_inbox` and worker; no new database or dependency. Adds private-only Telegram webhook parsing, secret-header protection, idempotent atomic inbox acceptance, unlinked guest private conversations/human queue, manual media/callback review, disabled-by-default outbound helper.
- Local standalone Node22 `--experimental-strip-types --test` 14/14 Node built-in tests PASS for parser, policy, synthetic provider and fake DB inbox. **Node24 runtime/typecheck/full Vitest/actual PostgreSQL/worker integration, live Telegram account, external costs, owner/physical UAT and source/artifact acceptance NOT_RUN**. Full release guard remains blocked. No merge, VPS deploy, paid usage or real data change.
- New Telegram approval/delivery and environment requirements are additive to, not replacements for, canonical ERP/KNABA rules and old provider migration blockers. Plan: `docs/plans/2026-10-25-knaba-assistant-360-telegram.md`.

## 2026-10-25 — KN-U19/KN-U20 Telegram ↔ operator stage, genuine SQL checkpoint

- Source code SHA `8d7f5530067ddead1164b26ff4cc7a45f65e6e04`, isolated Draft PR #41 stacked on Draft #38; no merge or live VPS change. New `erp/apps/worker/telegram-delivery.ts` stages exactly one human operator reply to a Telegram-sourced private thread after `handoff.take`, and revalidates role, membership, active contact identity, revocation, consent/version/opt-out and message version before any allowed outbound. A missing provider is `BLOCKED`; uncertain network outcome is `UNKNOWN`, never blind resend. Original records remain in ERP Postgres; no new SQL migration/CRM/database.
- Isolated existing cached Node 24.22.1 image and source-matched package-lock dependencies: TypeScript `npm run typecheck` **PASS**. Genuine PostgreSQL 17.11 in a no-host-port private Docker network/tmpfs: `vitest run tests/telegram.integration.test.ts` **5/5 PASS**, including provider HTTP double (never live API), post-stage revocation and timeout/replay. This corrected a genuine earlier bug: an incorrectly escaped Telegram sender regex had yielded `ACCESS_DENIED`; red at initial code, green after `288a485...`, then delivery RED→GREEN at `dae7051...`. These test counts prove only their exact scope.
- Broad Node24 no-PG Vitest at code SHA `8d7f553...`: **1858 PASS, 6 FAIL**, 434 SKIPPED (6 unrelated `tests/resources.test.ts` cases require `openpyxl`, absent from ephemeral Python3.12 image). Do not describe whole suite PASS; missing real PostgreSQL suites are skipped in that run. New permanent production Python requirement has NOT been added.
- New external paid AI/WhatsApp/Telegram spend 0 activated; current provider cost/quota unknown. Real Telegram BotFather/WABA, human owner account, consent/privacy processing/DPA, old Sites dataset/ERP bridge, backups, actual sending/read receipt, physical browser/voice and full product release gates remain `BLOCKED_EXTERNAL / NOT_RUN`. Site PR #36/#37 code/live deployment is a separate history; do not claim this Telegram PR is deployed.
- Detailed contract: `erp/docs/TELEGRAM_CHANNEL_UK.md`; implementation plan `docs/plans/2026-10-25-knaba-assistant-360-telegram.md`.
