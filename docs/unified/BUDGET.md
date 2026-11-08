# KnaBa — окремий бюджет і квоти

## 08.11.2026 — native reconciliation і KN-C08-B reservation

Consolidation прийнято на bb223af67af9eae5f11e7ca225f89ddf97a8e4e2: repository push42486323278 і PR42486326925 SUCCESS; native PR42486326902, Android та iOS SUCCESS. Використано один source checkpoint, два automatic repository runs та один native run; unchanged manual rerun не проводився. Фактичні Android lint warnings20 збережено.

KN-C08-B: один source checkpoint і максимум один correction для конкретного failure; не більше чотирьох automatic existing standard public Ubuntu repository runs, чинні timeouts. Native inputs/workflow paths не змінюються; зайвий native run не планується. Public access і офіційний стандартний public-runner тариф перевірені 08.11.2026: https://docs.github.com/en/actions/concepts/billing-and-usage. Новий paid activation EUR0; реальний model/account balance і quotas UNKNOWN. Provider calls, signing/stores, production і live data не активуються.

## 2026-11-08 native/backend consolidation reservation

C08 PR run 42483792274 and duplicate push 42483788861 are SUCCESS and independently accepted at e747fd94e219e09faffea96c2f9f84be15a6def1. Historical iOS 0.5.1 job in run 42467913707 accepted 67 XCTest; its Android peer failed before compilation on dependency HTTP504 and remains recorded as such. No unchanged manual rerun is requested.

Repository visibility was freshly verified public with write access. GitHub's official billing page was read again on 2026-11-08: standard hosted runners for public repositories are free (https://docs.github.com/en/actions/concepts/billing-and-usage). Reserve one consolidation source checkpoint and at most one corrective source checkpoint for a concrete failure: at most four automatic existing repository runs and two native PR runs. Native runner ceiling remains 160 runner-minutes total (per attempt Ubuntu 30 + macOS 50); existing timeouts and one-day artifact retention remain unchanged. Eligible standard public-runner charge reserved: EUR 0. No larger runners, paid activation, external model calls, signing/store upload or production action. Availability is established by actual job results; model/account balances remain UNKNOWN.

## KN-C08 explicit runtime mode reservation — 08.11.2026

F4-B implementation push/PR42480802391/42480841055 retained the one upgrade-fixture failure; corrective push/PR42481611087/42481614075 both SUCCESS, all four mandatory jobs accepted at e740ef969e2a6a261f0e7ba613b741ed889ec0fe. That reservation is reconciled. Reserve one KN-C08 source checkpoint and at most one corrective checkpoint, at most four automatically triggered existing standard public Ubuntu repository runs within unchanged timeouts. Scope: explicit API/worker/preflight/staging-wrapper mode, injected worker-engine consistency, focused tests and current evidence. Native files, providers, production activation, new infrastructure and paid services are excluded. New paid activation EUR0; actual model/account balances and quotas UNKNOWN.

## F4-B federated session authority reservation — 08.11.2026

Implementation ef1242d triggered push42480802391 / PR42480841055. PR mandatory ERP2832, site732+90+297 and root30 PASS; bridge81/82 FAIL only because new upgrade fixture compared undecoded name[] to a JS array. Use the already reserved single correction for explicit text[] decoding; no runtime/schema change, no unchanged manual rerun, no additional provider activation. Corrected source still requires all mandatory CI jobs.

F4-A PR run42475824054 at513351 completed all4 mandatory jobs; push42475797237 is still running at reservation time and requires reconciliation, no manual rerun. Reserve one F4-B source checkpoint and at most one corrective checkpoint, at most four automatically triggered existing public standard Ubuntu repository runs within unchanged timeouts. Scope: default-off federated session reader/storage, current site introspection and revocation, synthetic HTTP/PostgreSQL/SQLite acceptance. Browser issuance, real configuration, native files, production and paid services are outside this checkpoint. New paid activation EUR0; actual model/account balances and provider quotas UNKNOWN.

Reconciliation before F4-B publication: push42475797237 completed CANCELLED; ERP job128716766886 cancelled, other3 mandatory jobs SUCCESS. The accepted PR run42475824054 remains the complete four-job source-pinned acceptance. No manual rerun/cancel or paid runner was requested.

## F4-A local session authority reservation — 08.11.2026

F2 reservation reconciled: implementation push/PR runs42472334327/42472337064 (bridge fixture failure), corrective push/PR42472937996/42472941316; corrective PR run completed all4 mandatory jobs successfully. No unchanged rerun or production activation. Reserve one F4-A local session/device fence checkpoint and at most one corrective checkpoint, maximum four automatically triggered standard public Ubuntu repository runs using existing timeouts. Native files and paid providers are outside this slice. New external paid activation remains EUR0; real model balance/quotas unknown. Local SQL remains NOT_RUN until hosted execution; no paid fallback, staging extension or device readiness claim.

## F2 dual-session source continuation — 08.11.2026

F1 executable run42464719363 and documentation run42465549463 completed all four mandatory jobs. Reserve one F2 implementation checkpoint and at most one corrective checkpoint on the existing isolated identity branch: standard public Ubuntu repository jobs only, at most four automatic push/PR runs, existing timeouts unchanged. Local HTTP, SQLite and synthetic PostgreSQL fixtures use no real accounts or providers. New external paid activation remains EUR0; actual model credits/balances unknown. Browser policy, expired staging window, production/merge, signing and real recipient gates remain unchanged. No production federation configuration or credential is created by synthetic development.

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

## F1 identity foundation — 08.11.2026

Reserved: one implementation and one corrective source checkpoint on an isolated stacked branch; existing standard public GitHub Ubuntu workflows only, no larger runners, paid providers or runtime activation. Maximum four automatically triggered repository runs (push + PR per checkpoint), within existing per-job timeouts. Current public-repository access was verified through the authenticated GitHub connector; the native fb4be719 candidate used one successful native attempt. This is a EUR 0 new-spend reservation under public standard-runner billing, not a claim of unlimited quotas or known account balance. Reconcile actual run IDs before another checkpoint.

## Native documentation-head infrastructure retry reservation

Run 42464567819 on documentation-only d9cb200 failed Android during setup-gradle with an observed HTTP 504 before application compilation. Reserve one retry of failed jobs only, standard public Ubuntu runner, maximum 30 runner-minutes and EUR 0 new paid activation; do not rerun successful iOS jobs. Repository access remains public in the authenticated run metadata. This bounded retry is additional to the two initial native attempts and will be reconciled with its real outcome; source/artifact acceptance at fb4be719 remains separately preserved.

## Reconciled F1 and native retry outcome

F1 runtime checkpoint: repository runs 42464696490 (push) and 42464719363 (PR); the mandatory PR run succeeded. Documentation/native run 42464567819 retry attempted only failed Android; it again failed before compilation with HTTP 504 while provisioning Gradle 8.13. Independent probes of services.gradle.org, downloads.gradle.org and the official Gradle GitHub release asset returned HTTP 504. Stop further unchanged retries; no paid fallback or toolchain/version downgrade. Original native source fb4be719 and its artifacts retain their successful exact-source run 42463090142; d9cb documentation-head Android replay remains externally blocked. The remaining reserved F1 documentation checkpoint uses the existing public Ubuntu CI only.
