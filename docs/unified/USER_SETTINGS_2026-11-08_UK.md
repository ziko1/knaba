# KNABA — налаштування власного облікового запису

## Доручення і межі

Запит користувача 08.11.2026: доповнити KNABA DE налаштуваннями користувача,
редагуванням власних даних, зміною та відновленням пароля. Project `ziko1/knaba`;
base `9ff77d7b0161a4dde84314f2df327e4594e0eb0c` (чинний PR123 звірено через GitHub).
Окрема гілка `feat/knaba-user-settings-20261108` зберігає паралельні checkout.

Модуль доповнює чинну VPS-авторизацію вебкабінетів. Пароль ChatGPT у hosted Sites
та окрема ERP/native identity не стають локальними паролями сайту. Спільний SSO
залишається в наявному KN-C04/KN-U09, цей модуль його не підміняє.

## Приймання

| ID | Вимога та спостережуваний результат | Перевірка | Поточний стан |
| --- | --- | --- | --- |
| US01 | Налаштування доступні з кабінетів; власні ім'я, телефон, контактна компанія/адреса, мова та часовий пояс зберігаються | HTTP → SQLite → повторне читання/reopen, owner без profiles | SOURCE_PASS; browser OPEN |
| US02 | Редагування self-only, allowlist, CAS; роль/статус не змінюються | IDOR/CSRF/duplicate/oversize/stale-version/session revocation | SOURCE_PASS |
| US03 | Зміна пароля вимагає чинного пароля та завершує попередні сесії/посилання | Реальний scrypt + login old/new, transaction rollback | SOURCE_PASS |
| US04 | Відновлення через короткочасне одноразове посилання без розкриття існування акаунта | Expiry/replay/purpose/fingerprint; uniform HTTP; fake transport | SOURCE_PASS; delivery NOT_RUN |
| US05 | Зміна email лише після current-password + new-mailbox proof; stable id/role зберігаються | Atomic credential/profile update; occupied/protected/OIDC rejection | SOURCE_PASS; delivery NOT_RUN |
| US06 | Список власних сесій, завершення вибраної, інших або всіх | Чужий handle відхиляється; raw token/hash не виходить у UI | SOURCE_PASS |
| US07 | Адаптивні доступні форми DE/EN/PL/LT/RU/UK, success/error і disabled-mail states | Parse5 HTML + controlled JS VM + i18n; actual browser відсутній | SOURCE_PASS; browser BLOCKED |
| US08 | Additive auth schema, explicit migration gate; перевірений reviewable source | Synthetic existing-db upgrade/transaction rollback, регресії, незалежне review | SOURCE_PASS; target restore/deploy NOT_RUN |

## Команда та бюджет

- `/root`: контракти, server HTTP, навігація, інтеграційні тести, документація.
- `/root/account_backend`: core/mail/SQLite auth schema та предметні тести.
- `/root/account_ui`: окремий SSR renderer та шість локалей.
- `/root/account_audit`: незалежний read-only аудит і фінальне review.
- Runtime: наявна команда ChatGPT, 4 slots; нові платні сервіси не активуються.
  Зовнішні email/AI calls: EUR0 дозволених витрат у цьому дорученні.
- Застосовано `ai-team-orchestrator`, `coding-autopilot`,
  `ecc-backend-patterns/backend-patterns`, `ecc-frontend-mobile/frontend-a11y`.

## Технічні рішення

SSR-форми користуються чинними HttpOnly сесіями, same-origin захистом і SQLite.
Немає другого login engine або нових runtime dependencies. Довільні ролі,
tenant ID, права доступу та службові статуси не є полями профілю.
Контактні company/address не змінюють роботодавця чи юридичну компанію ERP.

Recovery/email capabilities мають SHA-256 у БД, короткий TTL, purpose, credential
fingerprint, current-user binding, атомарне одноразове споживання. Email-change
також прив'язаний до початкової чинної сесії. Посилання містить секрет лише у
fragment; GET не змінює акаунт. Власник/розробник та OIDC-linked identity мають
окреме пояснення щодо захищеної адреси входу. Password reset не надає ролей.

Поштовий адаптер вимкнений за замовчуванням; synthetic transport доводить контракт,
але не фактичну доставку. Reset HTTP не чекає зовнішнього провайдера: bounded
in-process send без plaintext outbox, без автоматичного retry. Збій процесу може
вимагати повторного запиту; успіх сторінки не стверджує доставку листа.

## Випуск і відновлення

Production, DNS, live дані, merge та платні провайдери не змінюються цим дорученням.
Перед дозволеним встановленням потрібні backup/restore, explicit migrate CLI,
перевірений поштовий домен/квота/одержувач і живі сценарії користувача.
Відкат source — попередній reviewed runtime; нові additive auth таблиці не
видаляти автоматично, після зміни пароля старі секрети не відновлювати.

## Перевірений код і результати

Опублікований runtime/test commit: `a6e1d582a5a22219625257a354f6abc66921d40e`.
Його Git tree `1bbca25631132e1a241a1b277f77efd828f505a0` точно збігається з
локально перевіреним commit `5a1b582c52fd302c54588d6c752da23239586a4e`.
Відмінність SHA спричинена метаданими commit при публікації через GitHub API,
не вмістом файлів. Наступний commit документації не змінює runtime/test inputs.

Усі локальні перевірки — Node `v24.22.1`, на ізольованих synthetic даних:

| Перевірка | Фактичний результат |
| --- | --- |
| `npm run check` у corporate-site | PASS: 0 errors, 0 warnings, 6 hints; Svelte 0/0 |
| `npm test` у corporate-site | PASS: 732 Vitest у 72 files + 90 Node; 0 fail/skip |
| `node --test --test-concurrency=4 vps/*.test.mjs` | PASS: 261/261, 0 fail/skip |
| `KNABA_RELEASE_MODE=official npm run build` | PASS; нові SSR account сторінки генеруються VPS runtime |
| `KNABA_RELEASE_MODE=official npm run verify:build` | PASS: 161 static HTML, source/output i18n, links, metadata, CTA/SVG |
| Root `npm test`, `npm run verify:modules` | PASS: 28/28 policy/source regression cases, чинний manifest збережено |
| Незалежний review `/root/account_audit` | ACCEPT у web/VPS scope; 20 цільових повторів PASS, входять до наведених suite totals |

64 нові VPS cases — core 21, mail 10, UI 18, HTTP 15 — уже входять до 261.
HTTP використовує справжні SQLite, scrypt і server routes з synthetic identity та
ін'єктованим поштовим transport; це не перевірка доставки реального листа.

Підсумковий `dist/client` artifact SHA256:
`c0a1a906031534cb399dfe97b79cd890a30a30f826579d7169b3f20d0e8f12c4`.
All-emitted JS — **225252/225280 B gzip**, CSS — **40930/40960 B gzip** за
незміненими порогами й Node gzip default. Початкове дублювання recovery labels
перевищувало JS gate; його прибрано повторним використанням чинних локалей.
Запас JS 28 B і CSS 30 B малий; майбутні додатки потребують скорочення payload.
Польові Web Vitals, p95 та network transfer не вимірювались.

Незалежно закрито R1–R4: точні CSP hashes для focus script; browser-native
перевірка збігу паролів без втрати fragment capability; порядок rate limits
source → address → global; збережена мова як default з explicit-lang override.
Також пояснено обмеження списку 100 сесій і показано точну загальну кількість.

Історія виправлень не прихована: перший HTTP тест мав неправильне очікування
422 замість контрактного 409 для чужого opaque handle; перший UI тест очікував
не той формат `Intl('en')`; перший verifier був запущений без official env.
Крім того, один independent HTTP import перервав concurrent clean-build; після
відновлення dist усі потрібні 9 HTTP cases пройдено. Фінальні результати вище
належать завершеним повторним прогонам, а не цим невдалим спробам.

Файлові hashes, команди та excerpts:
[verification.json](evidence/user-settings-20261108/verification.json).
Правила запуску, точні mail env, чинні CLI migration/backup та rollback:
[ACCOUNT_SETTINGS_OPERATIONS_UK](../../corporate-site/docs/ACCOUNT_SETTINGS_OPERATIONS_UK.md).

## Неперевірене та наступний крок

Локальні Chromium/WebKit/Firefox executables відсутні; browser/viewport/keyboard
acceptance — BLOCKED. Дозволи браузера не обходились, браузери не завантажувались.
Реальна пошта, sender verification/квота, live migration/restore, physical devices,
production і company UAT — NOT_RUN/UNKNOWN. Shared ERP/native SSO не реалізовано
цією задачею. Ці межі зберігаються попри source PASS.

Наступний крок — exact-head CI у Draft PR, далі дозволена ізольована staging
перевірка за operational matrix. До фактичного browser/provider/restore acceptance
і release confirmation модуль не видається за live-ready. Поточні production,
DNS, акаунти, платні підписки й main merge цією задачею не змінювались.
