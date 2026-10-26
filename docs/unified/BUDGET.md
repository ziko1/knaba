# KnaBa — окремий бюджет і квоти

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
