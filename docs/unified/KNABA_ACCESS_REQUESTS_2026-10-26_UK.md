# KNABA · продовження реєстрації та роботи із заявками (26.10.2026)

Source: продовження вже наявного PR #109 (parent SHA 5a75473120bf3c4452430a7ab7795ea05c9cda2c). Без production merge і без нового identity stack.

## Реалізовано
- Відвідувач без персонального запрошення може подати заявку на доступ клієнта чи працівника через /join/ (DE/UK/EN/RU), але це НЕ автоматичний акаунт. Видима /register/ лишається для захищених owner-issued одноразових запрошень.
- Backend приймає тільки ПІБ, email, тип client|worker, згоду на приватність. Same-Origin, max 4096 bytes, honeypot, валідація, rate limiting, один pending запит на email, загальна відповідь 202 без персональних даних і без створення vps_users, profiles чи ролей.
- Публічна заявка зберігається в окремій таблиці vps_access_requests, 30-day expiry, статус pending/handled. При нових запитах прострочені записи таблиці підлягають очищенню; немає зміни акаунтів чи бізнес-замовлень.
- /access-requests/ — owner-only inbox із no-store/noindex/CSP, екрануванням даних; тільки власник через існуючий /invite-user/ може створити запрошення після незалежного підтвердження особи. Позначка handled вимагає CSRF, власницької сесії та чекбокса.
- /forgot-password/ надає інструкції контакту та зміну пароля за вже чинною сесією, але не робить ризиковане скидання без email-верифікації.
- Усі нові запити на роль не можуть підвищити права до admin/owner. Роль із персонального запрошення спершу pending, потім затверджується власником у чинному Portal API.

## Database і сумісність
- Forward-only SQL 0008_access_requests + 0008 snapshot і доданий journal entry. Початкові 0000-0007 не переписуються. Node-only паролі/scrypt, сесії і user table незмінні.
- Rollback старого runtime після міграції має використовувати старий backend із розширеним 9-entry migration ledger; ніколи не видаляти таблицю для відкату.
- Перед test cutover: перевірка Git source SHA/артефактів, backup, SHA256, PRAGMA integrity/foreign key, snapshot test migration 8→9 та boot обох кандидатів на копії БД.

## QA
- TDD RED: GET /join/?lang=uk повертав 404; очікували 200.
- Node24.22.1 VPS unit/HTTP suite: 62/62 PASS на новому source-кандидаті; публічна заявка не створює user; CSRF/role forgery/consent/owner-only перевірені.
- Сайт: 39 Vitest files, 256 tests, Node subsets 32+27+9 PASS; npm run check 0 errors/warnings та 4 hints; build+verify exit 0.
- Root tests у Node18-host середовищі 25/25 PASS; чистий Node24 контейнер без git не виконав ці source-gate tests, тому Node24 root gate має уточнений environment scope.
- Реальний браузер/пристрій, owner UAT, production та незалежний reviewer НЕ підтверджені. Немає verified KNABA sender, тому відкритий self-service signup і reset email залишаються BLOCKED_EXTERNAL.

## Обмеження / наступний крок
KNABA verified email/OIDC/OTP, proof of email, privacy/legal retention/DSAR cleanup, trusted proxy/WAF/Captcha, verified owner UAT, ERP tenant-isolated subject mapping, незалежний review та production release. Не використовувати домен чи ключі AVENQO для KNABA та не створювати платних інтеграцій без тарифів/квот/дозволів.
