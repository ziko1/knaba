# KNABA Assistant 360 — Telegram-канал (кандидат, без live-активації)

**Проєкт:** KNABA DE, окремий від AVENQO. **Стан:** SOURCE_ONLY / NOT_RELEASED.
Кодова інтеграція цього каналу належить до Draft PR #41 і залежить від незлитого PR #38 та первинної ERP V4. Поточний VPS-сайт `kneba.vsp.rest` не змінювався. Весь V3/V4 acceptance, `erp/AGENTS.md`, `erp/KNABA_DE_TARGET_SPEC.md` та наявні правила безпеки й бюджетів залишаються головними.

## Контракти та потоки

- `packages/integrations/telegram.ts`: Telegram Bot API `Update` parser, тільки приватні повідомлення 1:1; текст, фото, документ, голосове повідомлення і callback класифікуються окремо. Групи, канали й непідтримувані update-типи ігноруються. Чат-ідентифікатор **не надає** ролей KNABA.
- `POST /webhooks/telegram` / `/api/v1/webhooks/telegram`: валідований `X-Telegram-Bot-Api-Secret-Token`; це Telegram shared header, **не HMAC-підпис тіла**. Обмеження 64 KiB, перевірка перед JSON, приватних chat/from IDs і повторних event IDs. Достовірний HTTPS перед webhook є обов'язковим.
- `apps/api/telegram-ingress.ts`: існуюча `webhook_inbox(provider='TELEGRAM',event_id='TELEGRAM:<update_id>')` плюс `telegram.inbound` у тій самій транзакції PostgreSQL. HTTP 2xx означає **тільки записане приймання**.
- `apps/worker/runner.ts`: поточний leased worker приймає `telegram.inbound`, створює окремого анонімного `GUEST` із `customerVerified:false`, `PRIVATE_CUSTOMER_ASSISTANT` channel, source `TELEGRAM`, та текстове повідомлення canonical `message.send`. Клієнт не може довільним текстом виконати ERP-команду або відкрити дані інших користувачів. Медіа та callbacks лишаються `MANUAL_REVIEW`, без автоматичного завантаження чи виконання.
- `apps/worker/telegram-delivery.ts`: **лише** повідомлення уповноваженого оператора після `handoff.take` (стан `HUMAN_ACTIVE`) можуть створити один `telegram_delivery` і подію `telegram.outbound_requested`. Перед викликом Bot API заново перевіряються ролі, власник діалогу, актуальна версія повідомлення, приватне членство, активна Telegram identity, явна згода, відписка та затверджена версія тексту згоди.
- Delivery receipt: `PENDING → SENDING → API_ACCEPTED / FAILED / BLOCKED / UNKNOWN`. Перед provider I/O фіксується `SENDING` із lease-guard, після невідомого результату запис стає `UNKNOWN` і **не пересилається вдруге автоматично**. `API_ACCEPTED` не дорівнює `DELIVERED`, `READ`, прийняттю комерційної пропозиції або виконанню ERP-команди.

## Безумовні відмови / релізні блокери

1. У `workerOptions` Telegram Bot API **не активується автоматично** від наявності ключа: `WorkerOptions.telegram` — опційний, за замовчуванням відсутній. `TELEGRAM_WEBHOOK_SECRET` окремо активує тільки захищене приймання, не outbound. На поточному live він не налаштований.
2. `telegram_delivery` надсилається лише за дійсного `notification_setting.telegram_consent=true`, `telegram_opted_out!==true`, поточного `telegram_consent_version`, який збігається з `telegramApprovedConsentVersion` у перевіреному runtime. Реальної клієнтської форми opt-in та легально погодженого тексту згоди поки немає. Синтетичні записи тестів не підтверджують юридичну згоду.
3. Для реальних повідомлень потрібні KNABA BotFather ownership/token, секретний HTTPS webhook, офіційне повідомлення Datenschutz, дозволений тестовий одержувач, підтвердження operator identity і scope, політика retention/erasure/backups, ліміт витрат, незалежний аудит, а також real Bot API roundtrip з delivery receipt. Невідомі акаунти/тарифи/квоти позначати `BLOCKED_EXTERNAL`.
4. Telegram Bot API voice note — це **не** live Telegram phone call. Поточний inbound аудіофайл відправляється на ручну перевірку, а не у невідомий STT provider. WebRTC / WhatsApp Calling — інші ізольовані компоненти з окремими дозволами.
5. Сайт-кандидат (VPS SQLite) та ERP PostgreSQL не є одним production data store. Не створювати дубль CRM, не зливати D1 зі старого хостингу без backup/mapping і перевіреного idempotent bridge.

## Технічні acceptance (синтетичні дані)

- NODE 24.22.1 `cd erp && npm run typecheck`: PASS на кодовому SHA `8d7f5530067ddead1164b26ff4cc7a45f65e6e04`.
- Реальний PostgreSQL 17.11, тимчасова ізольована Docker network і tmpfs, `cd erp && vitest run tests/telegram.integration.test.ts`: **5/5 PASS** на цьому SHA. Перевіряє одного guest/channel/message після replay, неможливість cross-company, людське `handoff.take`, один ticket, поточний consent, revoked identity, unknown outcome, недублювання зовнішнього виклику; зовнішній Bot API замінено явним HTTP double.
- Standalone `node --experimental-strip-types --test tests/telegram.boundary.node-cases.ts tests/telegram.ingress.node-cases.ts`: 14/14 раніше PASS; оновлений source/build acceptance виконати перед релізом.
- Усі legacy ERP Vitest + PostgreSQL, real web/Telegram UAT, independent security/privacy review, microphone/device/voice, operation rollback і company acceptance — окремі gates. Результат локального тестування не замінює їх.

## Дії адміністратора після перевірених дозволів (не запускати зараз)

1. Власник KNABA підтверджує фактичний BotFather bot, права керування, дозволену схему обробки, квоту та реальних одержувачів. Token і 32–64 символьний випадковий webhook-secret — **лише secret manager**, без URL/git/logs/чатів.
2. Конфігурувати HTTPS `setWebhook` на затверджений endpoint з `allowed_updates=["message","callback_query"]`, `secret_token`, `drop_pending_updates=false`; перевірити `getWebhookInfo`. Не переконфігурувати чужого бота чи стару webhook підписку без підтвердження контролю.
3. Провести узгоджений opt-in з версією Datenschutzhinweis і відписку, перевірити дозволеного тестового клієнта. Додати оператору доступ у чинному порталі через серверний `handoff.take`, не через Telegram-повідомлення «я власник».
4. Провести реальний inbound/outbound/status/error/timeout/revoke тест на дозволених акаунтах, перевірити фактичні витрати, error-rate та журнал. Лише після відновлення backup, затвердження замовником і release gate погоджувати production deploy.

**Відкат:** вимкнути outbound і webhook routing у керованій конфігурації, зберегти inbox/outbox, не видаляти клієнтські дані та не робити destructive SQL down migration.

## Оновлення 2026-10-25 — opt-out, тести та локальний запуск

- Приватні повідомлення з текстом `STOP` або `/stop` (без урахування регістру/зайвих пробілів) обробляються як відписка: в одній PostgreSQL-транзакції позначається `notification_setting.telegram_consent=false`, `telegram_opted_out=true`, зберігається UTC-час та стан `conversation_input=PROCESSED`. Команду не пересилають у людський чат; повтор того самого Telegram update не дублює операції.
- `/start` **НЕ** відновлює згоду автоматично: майбутній opt-in потребує окремого погодженого UX і версійованого Datenschutzhinweis. Підтвердження відписки через реальний Bot API без дозволу не надсилалося. Можливість конкурентних STOP та вже розпочатого provider send потребує окремого production threat-model/UAT.
- Цільові STOP-тести були RED, потім GREEN після патча, загальний локальний QA — **2300/2300 PASS** на реальному PostgreSQL17.11, Node24.22.1, source `7c79bca070c782c6a95a5c4e42b9776d9efd9991`. Верифіковані `dist/server.mjs`, `dist/worker.mjs` та статичні web assets мають власні SHA256 у `docs/evidence/knaba-assistant-360/telegram-build-smoke-2026-10-25.json`.
- Бінарний локальний smoke: /health 200, /version SHA exact, /ready 503 при неналаштованій тестовій компанії, /webhooks/telegram 503 без секрету; worker стартував і створив heartbeat. Вебхук у живому KNABA не налаштовано, компанію й реального власника не авторизовано, production залишається BLOCKED. Поточні правила Telegram Bot API щодо secret header та HTTPS: https://core.telegram.org/bots/api.

## 25.10.2026 — security hardening: guest identity and operator revocation

- Telegram `from.id`, навіть отриманий через HTTPS із секретом `X-Telegram-Bot-Api-Secret-Token`, **не** є доказом входу в обліковий запис KNABA. Раніше повторне використання `contact_identity` дозволяло авторизувати повідомлення як `DIRECTOR` — тест реальної PostgreSQL підтвердив дефект. Тепер такі прив’язки не дають доступу: worker приймає лише окремого активного `GUEST` із дозволеними ERP-правами цієї ролі та без клієнтських/об’єктних/складських scope. Робочі ролі не переносяться до Telegram.
- Окремі employee/client/owner функції можливі тільки після перевіреної авторизації через чинний KNABA портал, одноразового прив’язування, відповідного MFA, версійованої згоди та scoped серверних команд. Цю функцію **ще не реалізовано**; не вигадувати працівничі права за іменем Telegram або номером.
- `telegram.outbound_requested` перевіряє, що заявлений оператор досі є активним не зовнішнім учасником конкретного каналу; перевірка проводиться і на постановці, і перед відправленням. Якщо доступ відкликано вже до dispatch, status `BLOCKED` і фактичних provider HTTP calls = 0. Відкликання під час уже розпочатого зовнішнього запиту — окрема race-boundary, яка потребує реального UAT; статус `API_ACCEPTED` не гарантує доставку.
- Тестова кодова база: `683c09d0346fd05e0f2cd323da640bbb176c5c47`. TypeScript PASS, Telegram genuine PG 10/10 PASS, повний ERP genuine PG 2303/2303 PASS без пропусків. Ніякого merge, production deploy, відправлення тестовим користувачам або платного provider call немає. Незалежний security reviewer і real device/provider/UAT залишаються обов’язковими.
