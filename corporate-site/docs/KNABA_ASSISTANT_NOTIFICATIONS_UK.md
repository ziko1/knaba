# KNABA Assistant — продовження після Draft PR #13

Джерельний базовий коміт: `5b5f1dca323eca371a7c3f160e1614ac46e7c41b` (`ziko1/knaba`, PR #13). Цей пакет є окремим Draft поверх нього; **не розгортати / не зливати автоматично**.

## Реалізовано

- Адитивна D1 міграція `0002_tense_mother_askani.sql`: outbox `assistant_notifications`, унікальний `event_key` та індекс черги. Події `owner_handoff`, `customer_message` (коли спілкування з власником), `offer_decision`. Метадані містять лише внутрішні UUID і тип події, **жодного змісту чату, email або телефону**.
- Атомарне створення повідомлення й події в D1 для ручних розмов. Повторне надсилання з ідентичним `idempotencyKey` не генерує повторне повідомлення власнику.
- Відкладена email-доставка через конфігурований Resend, вимкнена за замовчуванням: до трьох подій за один запуск, до п'яти спроб на подію з backoff, ліміт добових спроб, idempotency key при API, перевірка `id` у відповіді API, таймаут 5 с. Email містить лише тип події й посилання на захищений кабінет `/postfach/?conversation=UUID`, без гостьового токена. HTTP accepted **не є доказом доставки в скриньку**.
- Інтерфейс власника показує стан email і чергу. Доступ до API повідомлень тільки owner після серверної авторизації. Посилання `conversation=UUID` відкриває розмову лише після owner-перевірки.
- Відвідувач може зберегти секретний recovery code `KNABA1:<conversation UUID>:<256-bit token>` вручну та відновити розмову в новій сесії. Код не додається до URL та перевіряється сервером перед відновленням. Це bearer secret: хто володіє ним — може читати розмову, тому є попередження не розголошувати.

## Передумови ввімкнення сповіщень

**НЕ активовано.** Вимагає окремих підтверджень власника: верифікована адреса отримувача/відправника, авторизований Resend account, перевірений тариф і доступний бюджет/квота, явна згода на передачу метаданих зовнішньому email-сервісу, GDPR/privacy текст і retention policy, live endpoint з перевіреним trusted identity gateway, наявна D1 після backup/rollback rehearsal.

Тільки серверні змінні/secret bindings (ніколи не додавайте ключ у Git):

- `ASSISTANT_NOTIFICATIONS_ENABLED=approved` — **ставити тільки після виконання release gates**;
- `RESEND_API_KEY` — секрет у hosting secret store;
- `ASSISTANT_NOTIFY_FROM` — підтверджений відправник;
- `ASSISTANT_NOTIFY_TO` — власник;
- `ASSISTANT_PUBLIC_ORIGIN` — перевірений canonical HTTPS origin;
- `ASSISTANT_EMAIL_DAILY_LIMIT` — ціле число 1–100: кількість спроб на UTC добу (включно з retry).

Вимкнення: прибрати `ASSISTANT_NOTIFICATIONS_ENABLED=approved` або ключ; це припинить нові зовнішні відправлення, **не видаляючи D1 дані**. Cron можна конфігурувати пізніше для повторів; тут лише опційний Worker `scheduled` handler, жодного live cron не створено.

## API / Ізоляція

`GET /api/assistant/owner/notifications`: тільки owner, статус та кількість подій; `POST /api/assistant/owner/notifications/dispatch`: тільки owner, захищений Origin і anti-CSRF header, тригер обробки outbox. Гостьові ID не дають доступ до owner inbox. Не відкривати Worker напряму на довірі до довільно переданих `oai-authenticated-user-*` заголовків: в production обов'язково перевірити, що gateway їх перезаписує/відкидає від клієнта.

## QA / Безпека / Недовиконані ворота

- TDD RED → GREEN: відсутня таблиця подій, відсутня функція email-drain, відсутній scheduling ctx, відсутній recovery parser, хибне прийняття HTTP 200 без provider ID.
- Тести Node 24 в ізольованій Docker-копії репозиторію, без мережі та зовнішніх API. Додатковий локальний Wrangler/D1 HTTP smoke перевіряє 201/200/404/403. Точні свіжі кількості, результати й артефакт hash вказуються у Draft PR після останнього QA.
- Не перевірено: реальний власник у ChatGPT Sites auth, live домен, реальна Resend email доставка, external AI-provider, WhatsApp, фізичний Android, screen reader, повна privacy/data-retention policy та GDPR-видалення.
- Rollback коду: скасувати цей Draft / revert окремий коміт; на live нічого не мігрувалося. Якщо міграцію колись застосують до production, таблицю безпечно залишити невикористовуваною при code rollback. Ніколи не запускати DROP/очищення без backup і окремого підтвердження.
- Генеративний AI все ще **не підключений**. Базовий асистент відповідає на основі перевіреної довідки. Для зовнішнього AI потрібні квота, бюджет, explicit approval, захист PII, відмова від вигаданих цін/дат.

## Фактичний QA з цього пакета

- Node 24 Docker із забороненим зовнішнім network: `npm test` (після останньої зміни слід виконати повторно), `npm run check`, `npm run build`, `npm run verify:build`.
- Локальний Wrangler / D1 HTTP smoke, справжня SQLite міграція (у scratch): `POST /api/assistant/conversations` → 201; гість без токена → 404; handoff → 200; гість із токеном → 200; anonymous GET owner notifications → 403.
- Chromium (встановлений Playwright browser, ізольований локальний Worker): перевірено RU гостьова розмова, handoff, явне копіювання recovery code, нова розмова, імпорт коду, відновлення повідомлення на ширинах 1280 px і 320 px. Після сценарію перевірено відсутність *додаткового* горизонтального overflow. На 320 px базова сторінка вже має scrollWidth на 4 px більший за viewport **до** відкриття асистента; після сценарію залишалося ті самі +4 px. Це окрема проблема макета корпоративного сайту, не виправлена тут (паралельні PR для navigation).
- Реальний зовнішній email transport для тестів **замоканий**, ключі та live відправки не використовувалися. Незалежний security-review ще не виконано.
