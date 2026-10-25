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
