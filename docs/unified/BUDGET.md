# KnaBa — окремий бюджет і квоти

## Фактичний інкремент — 08.11.2026

Нові платні сервіси/AI/канали не активовано, зовнішній дозволений бюджет0 EUR. Використано існуюче середовище Work, локальний Node24/Android toolchain і наявний фізичний сервер із cached QA image та PostgreSQL17.11. QA: isolated internal network, no published ports, synthetic tmpfs DB,CPU2/RAM3GiB/PIDs512; cleanup лише власних тимчасових ресурсів. Реальні ChatGPT кредити, provider quotas і загальна вартість hosting невідомі; число0 не є заявою про безкоштовність чинних ресурсів. Немає нових CI/paid runners або зовнішніх модельних викликів.

Дата 2026-10-24; бюджет тільки KnaBa, не AVENQO / ShiftLedger / ai-team.

| Категорія | Авторизовано цим етапом | Виміряно | Правило |
|---|---:|---|---|
| Новий paid cloud / LLM / email / WhatsApp | 0 EUR | Нових підписок не активовано | Дозвіл + перевірений реальний тариф/квота до виклику |
| GitHub / Codemagic CI | 0 EUR нових | Доступні хвилини/кредити UNKNOWN | Локальні цільові тести; не дублювати CI; PASS тільки за журналами |
| Тимчасове хостинг середовище | Діючий сайт, без нової активації | Поточні фактичні витрати UNKNOWN | Не змінювати платіжний профіль без згоди |
| ERP Railway staging | Історична межа EUR10/month із ERP rules | Історичний cutoff expired | Не продовжувати/активувати без нової конкретної авторизації |
| VPS | Вже наявний; нові сервіси не створювати | ~24 GiB free / 88% used 2026-10-24 | Targeted worktree, очищення лише після перевірки власності і rollback |

Перед кожним платним provider call: підтвердити авторизацію, data boundaries, ціну, fresh quota і зарезервувати верхню оцінку в budget ledger; при невідомому списанні звірити usage/billing. Free fallback лише з підтвердженим правом і квотою, без silently enabled services.


## 2026-10-25 — KNABA Assistant 360 authorization fence
- New payable AI/voice/WhatsApp provider activation authorized in this stage: EUR 0; providers NOT activated, tokens NOT added. Fresh WABA calling eligibility, balance, model credits, PSTN/SIP prices and actual monthly runtime cost UNKNOWN.
- Local development used existing VPS, npm public dependencies and isolated checkout; no spending API activated. Shared disk observed 197 GiB total, 176 GiB used, ~11 GiB free (~95% used) during build; no deletion of shared caches/volumes/backups without owner verification.
- Voice Web Speech availability and browser-vendor processing is device-dependent; no assertion of zero vendor data-processing charges or universal browser support. Before any provider call confirm lawful region/contract, permissions, price, fresh quota and reserve project budget. Production/merge require separate approval.

## Telegram Assistant 360 incremental budget 2026-10-25
- New Telegram Bot API / outbound AI / WhatsApp Calling activation: **0 EUR authorized and 0 provider requests made in this code development**. Fresh real provider balance, tariffs and quotas UNKNOWN; no assumptions of free production use.
- Project source-only local tests reused installed Node22; required Node24 repo build/SQL acceptance pending environment and quota. Do not activate `TELEGRAM_WEBHOOK_SECRET` or real outbound without company permission, data/privacy agreement, allowed recipients and budget reservation. Shared VPS remains under disk-pressure caution.

## 2026-10-25 — Telegram source-only validation budget

- Outbound Bot API is deliberately absent from default `workerOptions`. No real Telegram/AI/WhatsApp calls, new subscriptions, provider tokens, or paid compute authorization initiated by this work. All provider balances/tariffs/quota **UNKNOWN**; new external spending authorization stays 0 EUR.
- QA reused cached Docker Node 24, PostgreSQL 17 and synthetic temporary tmpfs database/network. VPS at last read 95% used (~11 GiB free), so no new persistent PG service, production migration, arbitrary prune, paid runner or destructive cleanup. Product development and blocked external release gates remain separate.

## 2026-10-25 — Telegram QA runtime evidence, no new provider activation

- Reused cached VPS Node24/PostgreSQL images; installed free software `openpyxl==3.1.5`, `Pillow==11.3.0`, `poppler-utils` **only in isolated QA Docker layers**, not production. Measured full ERP real-Postgres test ~98s; isolated web/server/worker build ~314s. These are runtime durations, NOT billed AI usage or price estimates.
- No Meta/Telegram/LLM outbound calls, customer-data uploads, paid service activation or new external spending authorization. Real quotas, Telegram provider eligibility/tariffs, hosting cost and account balances UNKNOWN; approved new paid-provider ceiling remains 0 EUR.
- Shared VPS had ~9–10 GiB free / 95% used before final artifact checks. Maintain no-destructive-prune policy and cap QA CPU/RAM/PIDs. Source-only QA and tiny synthetic DB/network must not be confused with real company production deployment.

## Telegram security QA — 25.10.2026

- Additional targeted PostgreSQL tests, 2303-case full suite (~96s), Node24 build (~315s) and isolated binary startup reused the user's existing VPS and cached Docker images. Real new infrastructure/proprietary AI/Telegram/WhatsApp provider spend remained **0 activated**; actual hosting plan bill, remaining quotas and external provider rates remain UNKNOWN.
- Last read `/srv/knaba` filesystem ~93% full (~14 GiB free); no destructive prune or deletion of backups, data or other projects. Keep model/provider dispatch disabled until explicit company scope, pricing/quota, privacy review and reserved budget are confirmed.

## Modular CMS recovery — 2026-10-26
Existing VPS, GitHub connector and cached Node24 dependencies only; new paid provider/AI service activations: NONE. ChatGPT Work credits/provider remaining quotas UNKNOWN. VPS observed 197G with ~21G free (~90% used); no destructive cleanup, new DB, production deploy or owner data changes. Remain below the 90% release gate before future cutover.

## KNABA user onboarding QA — 26.10.2026
Local synthetic tests only on isolated VPS, verified official Node24 tar and public npm dependencies, no new billable provider dispatch. KNABA email/OIDC/WhatsApp/SMS/LLM not activated, no production DB/secret changes, no paid service authorization. Actual hosting/network/quota/balance remains UNKNOWN; existing budget rules preserved.

## Auth hardening 26.10.2026
Verified existing local Node24/VPS code and synthetic tests only. Read-only mail sender discovery found no verified KNABA domain; no paid OTP/SMTP/OIDC/LLM provider invoked, no KNABA mail sent, no production SQL or data modified. Real provider usage/pricing and credits UNKNOWN; previous budget and spending policy unchanged.

## 2026-10-26 · G2 access request work
No new provider subscriptions or sends, using existing VPS. Brevo: no sending domain; Resend: only another project domain partially failed. KNABA sender, budget, quota and pricing remain UNKNOWN; new external spend is not authorized.

## 2026-10-27 · owner invitation attestation
Existing isolated VPS Node24 runtime reused, zero new external email/OIDC/AI/paid-provider calls or subscriptions activated. KNABA delivery domain not verified, external budget and quota UNKNOWN. No production deploy or main merge without separate release gates.


## 2026-11-08 — account settings extension

Використано наявні локальні Node24 залежності й поточну команду ChatGPT з4слотами;
жодного нового платного провайдера або підписки не активовано, реальних листів
не надсилали. Зовнішній email/AI budget цього доручення —0EUR дозволених витрат;
фактичні ChatGPT credits, provider balance/ціни та квоти UNKNOWN. Account mail
opt-in залишається disabled до окремої перевірки прав/квоти/бюджету; UI відображає
недоступність доставки. Локальний daily cap1–100 не підтверджує провайдерську квоту.

## F1 identity foundation — 08.11.2026

Reserved: one implementation and one corrective source checkpoint on an isolated stacked branch; existing standard public GitHub Ubuntu workflows only, no larger runners, paid providers or runtime activation. Maximum four automatically triggered repository runs (push + PR per checkpoint), within existing per-job timeouts. Current public-repository access was verified through the authenticated GitHub connector; the native fb4be719 candidate used one successful native attempt. This is a EUR 0 new-spend reservation under public standard-runner billing, not a claim of unlimited quotas or known account balance. Reconcile actual run IDs before another checkpoint.


## Full-completion integration verification — 08.11.2026

Reserved for the current integrated candidate: one initial verification checkpoint and at most one corrective checkpoint using the existing standard Ubuntu24.04/macOS26 workflows, existing per-job timeouts and one-day artifact retention. No larger runner, new subscription, paid provider, production service or external model call is enabled. Repository public visibility and write access were verified through the GitHub connector; current official billing documentation confirms free standard hosted-runner use in public repositories (https://docs.github.com/en/actions/concepts/billing-and-usage, checked2026-11-08). This reserves EUR0 of new paid activation; it does not state an account balance, remaining provider quota or total existing service cost. Actual run IDs and outcomes must be reconciled before another checkpoint. Local npm/Android checks reuse installed dependencies/toolchains.

### Initial checkpoint reconciliation — source `5d6eeae0862e52cc693c1766f0c6fba964b12aa5`

Existing runs: main PR `42472254239` FAILED (root passed, site/ERP/browser failures); main push `42472234205` CANCELLED by same-SHA concurrency; Android PR `42472254246` SUCCESS; iOS push `42472234257` FAILED during final post-boot simulator inventory, before app compilation; same-repository iOS PR `42472254274` SKIPPED by the existing push-reuse condition. Actual bridge step passed all9 synthetic SQLite/HTTP/PostgreSQL cases. Detailed scoped outcomes: [initial-aggregate-ci.json](evidence/full-completion-20261108/initial-aggregate-ci.json).

The reserved corrective checkpoint is still unused at this entry. Its purpose is to verify the diagnosed fixture/browser/simulator preparation corrections together, after local checks and independent review. No additional paid activation, runner tier, workflow dispatch or provider request is introduced. Runner success does not measure account balance or authorize production/device publication.

### Corrective checkpoint reconciliation — source `adfa64b45179fcb2b59cd723351695a57d35652a`

Both originally reserved checkpoints are now USED. Main PR `42474047295` FAILED: ERP3029/3029 and root job passed; site834 Vitest+92 Node passed before stale source-catalog validation; bridge9/9, roles107 and languages32 passed before preview readiness crashed inside Node Undici. Main push `42474043053` CANCELLED by same-SHA concurrency. iOS push `42474043048` FAILED after actual compilation and92 XCTest (90pass/2fail); iOS PR `42474047297` SKIPPED by existing push reuse. Android PR `42474047188` FAILED resolving the existing pinned Kotlin compiler JAR: redirected download read timeout, no new successful artifact. See `corrective-aggregate-ci.json` for scoped outcomes.

Reserve one additional bounded corrective source checkpoint, after local verification and independent review, for the diagnosed catalog, browser-readiness and iOS acknowledgement fixes. It uses only the existing standard public-repository Ubuntu24.04/macOS26 workflows, their existing timeout limits and artifact retention. At most the existing push/PR-triggered run set; no manual rerun, larger runner, new paid activation or provider request. New paid activation ceiling remains EUR0; real account balances and total existing service costs UNKNOWN. Reconcile its actual IDs and outcomes before reserving any later feature checkpoint. This is necessary verification of observed failures, not an unlimited retry allowance.

### Additional corrective checkpoint reconciliation — source `395993f9f6f38141507b5f7e4fd470e953b5c99c`

The additional reservation is USED. Main PR `42476582495` FAILED: root and ERP3029 passed; site834Vitest+92Node, build and verify passed before the historical migration-fixture failure (VPS275/276); bridge9/9, roles107, language32 and public24viewports passed before4 ERP transfer UI locale failures. Main push `42476578098` CANCELLED. iOS push `42476578253` SUCCESS with93/93XCTest, simulator install/launch and verified artifact; iOS PR `42476582459` SKIPPED by reuse. Android PR `42476582462` SUCCESS. No unchanged manual rerun or new paid provider call. `second-corrective-aggregate-ci.json` records the exact scopes and remaining failures.

Reserve one combined feature checkpoint for the independently reviewed Assistant→request implementation and the now-diagnosed ERP locale/migration-fixture fixes. Existing standard public-repository workflow set/timeouts/retention only; no separate CI-only push, larger runner, manual dispatch, deployment or paid activation. New paid activation ceiling EUR0; account balances, total existing costs and external provider quotas remain UNKNOWN. Reconcile this checkpoint before another reservation. F2 federation is still isolated source work and requires its own reviewed acceptance checkpoint after this result is known.

### Assistant checkpoint reconciliation — source `dc54f109c52e3b8f8a2e506821a6eb322b5417c4`

The combined feature reservation is USED. Main PR `42481181297` FAILED only at two of four ERP transfer rendered HTTP-fixture cases; root, site900Vitest+92Node/281VPS/check/build/verify, ERP3035 and actual SQLite→HTTP→PostgreSQL11 passed. Roles111, language32 and public24viewport checks passed. Main push `42481177774` CANCELLED by same-source concurrency. Android PR `42481181147` SUCCESS. iOS PR `42481181376` SKIPPED by the existing same-repository policy; no new iOS push run because native inputs did not change. Previous simulator evidence remains tied to395993f. No manual rerun, new runner tier or paid provider request. Exact scoped history is in `assistant-checkpoint-aggregate-ci.json`.

Reserve one next combined F2 source checkpoint after independent review, including the diagnosed nested-URL browser fixture correction. It must execute the actual ERP PostgreSQL cases, the new actual VPS SQLite↔ERP HTTP/PostgreSQL pair, and rendered fixture cases before any dependent F3 work. Only existing standard public-repository Ubuntu/macOS workflow definitions, timeouts and retention; no additional service, workflow dispatch or larger runner. New paid activation ceiling remains EUR0; account balances, total existing cost and external quotas UNKNOWN. Reconcile that exact run set before any later reservation; no unlimited reruns are authorized.

### F2 checkpoint reconciliation — source `e03d2be0d0ea1ae7ced90f50631c7b81cd34c5b5`

The F2 reservation is USED. Main PR42485949823 SUCCESS: four required jobs; ERP3127 including24 F2 PostgreSQL, bridge18 including7 actual F2 runtime-pair cases,9 rendered fixture cases, site900Vitest+92Node+330VPS and existing browser suites passed. Android PR42485949838 SUCCESS. iOS PR42485949819 SKIPPED by existing policy, no new iOS push because native inputs did not change. Repository push42485946401 CANCELLED by same-source concurrency. Actual archives/job metadata/source evidence independently reviewed; F2 technical dependency before F3 is SATISFIED. No manual rerun, new runner tier or provider activation.

Reserve one bounded next combined source checkpoint for reviewed native media/API corrections and compatible federation continuation, after contract review and local verification. Use only the existing standard public-repository Ubuntu24.04/macOS26 workflow set, timeout limits and artifact retention; no separate docs-only push, new job, manual dispatch, larger runner or paid service. This is one source publication/run set, not an unlimited retry allowance. Reconcile exact IDs and outcomes before another reservation. New paid activation ceiling EUR0; actual account balances, total existing service costs and external provider quotas remain UNKNOWN.

### F3/native media checkpoint reconciliation — source `af6f84d0b511d186fbbc4c039a082e21e61c788e`

The combined reservation is USED. Repository PR42499230900 FAILED: root29 and site checks passed; ERP3235 PASS/18 F3 FAIL and bridge18 PASS/8 F3 FAIL stopped at LOGIN_INSPECT before downstream assertions. Rendered browser acceptance was NOT_RUN. Android PR42499230893 SUCCESS with72 Gradle test cases; iOS push42499225525 SUCCESS with145 XCTest and simulator install/launch. iOS PR42499231007 SKIPPED by existing reuse; repository push42499225479 CANCELLED by same-source concurrency. Exact source/tree, archives, counts and independent reviews are recorded in the F3 actual-CI checkpoint. No manual rerun or paid provider activation occurred.

Reserve one bounded corrective source checkpoint for the observed ledger dispatch defect and unchanged-assertion diagnostic additions, after source review and local regression verification. This is a single candidate publication using only the existing standard public-repository workflow set, timeouts and one-day artifact retention; native inputs and workflow definitions remain unchanged. No docs-only push, new job, manual dispatch, larger runner, production operation or new paid activation. Reconcile its actual run IDs and outcomes before another reservation. New paid activation ceiling remains EUR0; account balances, remaining external quotas and total existing service costs are UNKNOWN. A reviewed local fix is not actual PostgreSQL, paired-runtime or browser acceptance.

### Dispatcher correction reconciliation — source `a202ddc8d527f90dc7c13a923a11336410623173`

The corrective reservation is USED. Repository PR42502394292 FAILED only at one rendered F3 HTTP-fixture case: ERP3260/3260 including18 F3 PostgreSQL and24 F2 PostgreSQL passed; bridge26/26 including8 F3 passed; root29, site checks, roles111, language32 and public24 passed. Required rendered fixtures executed19:18 PASS/1 FAIL, no skips/retries/flakes. Android PR42502394288 SUCCESS; iOS PR42502394289 SKIPPED, no new iOS push because native inputs stayed unchanged; repository push42502389977 CANCELLED by concurrency. The existing actual iOS artifact remains tied to af6f84d. The browser trace revealed a label-text mismatch and same-site synthetic hosts before the intended cross-site cookie assertion. No manual rerun or new paid activation.

Reserve one bounded source checkpoint for the diagnosed one-file browser fixture correction: exact input/accessibility checks and distinct registrable source/ERP domains while preserving all19 cases and existing security assertions. Local typecheck and test collection plus independent review are required before publication; collection is not browser execution. Existing standard public workflow set/timeouts/retention only. No new job, docs-only push, manual dispatch, larger runner, production or provider operation. New paid activation ceiling EUR0; actual balances, external quotas and total existing costs UNKNOWN. Reconcile the next exact run set before another reservation; no unlimited retry allowance.
