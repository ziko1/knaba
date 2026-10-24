# KNABA · кандидат релізу: мовний dropdown + Assistant + безпечні сповіщення

**Стан:** SOURCE/LOCAL QA PASS · ChatGPT Sites preview release NOT_DEPLOYED. Дата 24.10.2026. Продукт KNABA, окремий від AVENQO.

## Джерело та межі змін
- Репозиторій `ziko1/knaba`.
- Базова гілка `codex/knaba-assistant-notifications-20261024` / PR #18, точний вихідний SHA `0730a2159e8b0577fab780ab2496ab287b11c259`.
- Перенесено тільки UI/тестовий патч з PR #15 у `src/layouts/Layout.astro`, `src/styles/global.css`, `tests/verify-build.mjs`; незмінні API Worker, Drizzle schema, секрети й механіка provider outbox/restore PR #18.
- Фінальний candidate commit SHA слід прочитати з GitHub після запису комітів; не використовувати SHA базової гілки як код релізу.
- Середовище: Node 24, Astro 7.4.2, Vite 8.3.5; lockfile PR #15 == PR #18 Git blob `28e1e31e7887e6fd53401032d82f41f184f75c35`; без нових production-залежностей.

## Evidence, виконано на VPS у контейнерах без зовнішнього доступу
1. **PASS** `npm run check`: Astro 84 files 0 errors/warnings/hints; Vue/Svelte 0 errors/warnings.
2. **PASS** `npm test`: 63/63 Vitest та 8/8 Node, загалом 71.
3. **PASS** `npm run build`, `npm run verify:build`: 49 HTML, metadata/internal links, noindex, всі чотири мови і один активний dropdown. Локальний static artifact SHA256 `f4347c542314283c88a39fa35c43c85c52186ea250af36f35b13d8f0971bdc33`. Combined gzip CSS 19 355 B, JS 139 774 B (не є page load metrics).
4. **PASS** headless Chromium offline local HTTP: 60 локалізованих сценаріїв (DE/EN/UK/RU × 15 viewport widths від 320 до 1440), правильна мова, відкриття/закриття, Escape/Tab/Enter, вибрана послуга при DE→RU, не перекриває мобільну шапку; збільшення CSS тексту до 200% на 640 CSS px. Це не фізичний пристрій / screen reader / native browser zoom.
5. **PASS** `node:sqlite` ізольовані міграції `0000→0001→0002`: 7 попередніх sqlite_master об'єктів незмінні, старий клієнт і повідомлення збережені, 4 assistant таблиці, FK й uniqueness outbox PASS, live D1 NOT_TOUCHED.
6. **PASS** локальний Wrangler Worker + D1, `--local` та `Docker --network none`: 201 create, 422 без згоди, 404 без гостьового токена, 200 обмін повідомленнями/передача власнику, 403 доступ гостя до owner API. Сповіщення не ввімкнені; реальних email немає.
7. **PASS** наскрізний браузер+локальний Wrangler/D1: на 320/390/1280 px створено розмову, отримано відповідь, відхилено неправильний recovery code, відновлено ту саму розмову за приватним кодом. Секрети не друкувалися.
8. **PASS** live gateway *read-only probe* 24.10.2026: GET `https://kneba.vsp.rest/api/portal/session` анонімно та з вигаданими `oai-authenticated-user-*` заголовками обидва повернули `role:"anonymous"` HTTP 200. Це підтверджує їх ігнорування для двох конкретних анонімних запитів на *поточному R3 live*; НЕ доводить trusted identity contract майбутнього Worker або real owner UAT.
9. `git diff --check`: exit 0. Код за межами трьох UI/test-файлів у цьому кандидатові не змінювався, за винятком цих QA/docs/runbook файлів.

## Релізний сценарій — виконувати лише за наявності фактичного доступу до Sites та backup
1. Відкрити **існуючий** ChatGPT Sites проєкт `appgprj_6adc346d6f8881918b73ac79ebc5d759`, який володіє `kneba.vsp.rest`. AppDeploy — інша платформа, там цей застосунок не знайдено. Не створювати нову базу/хост під тим самим доменом і не міняти Cloudflare DNS.
2. Перед будь-якою міграцією зчитати поточну Sites version/deployment, binding D1, таблицю міграцій, резервну копію даних й `OWNER_EMAIL` (не виводити секрети). Верифікувати restore шляхом контрольованого тесту на копії. Якщо backup недоступний — STOP.
3. Перевірити, що Sites приймає точний кандидат source, зберігає native sign-in gateway та не пропускає клієнтські `oai-authenticated-user-*` як довірені. Owner login/owner inbox та анонімний користувач із різними сесіями повинні пройти реальні E2E; без цього — STOP.
4. Провести адитивні D1 `0001_lazy_angel` та `0002_tense_mother_askani` лише якщо вони не застосовані, після backup; не виконувати `DROP` або очистку/пересоздання D1. Доставку Resend і scheduled Cron залишити **disabled** до окремої перевірки квот/домену, прав на передачу даних та consent/retention.
5. Зібрати candidate у Sites, зафіксувати source SHA, build/digest/deployment ID, оновити **лише** тимчасовий site preview після green preflight, без `knaba.de` або DNS.
6. Перевірити реальні GET /DE /RU, локалізацію/ARIA, публічний lead receipt і дані в D1, захищеність owner inbox, гостьовий чат і handoff/owner-reply, 320/390/desktop, HTTP headers/noindex/canonicals, error logs, статус у Sites.
7. При FAIL: зупинити трафік на новий runtime, повернути раніше збережену Sites version **без відкату/видалення користувацьких D1-записів**, звірити доступність lead/portal і логувати подію. До успішної перевірки не оголошувати release-ready.

## Невиконані acceptance gates
- **BLOCKED — Sites control**: у поточному з'єднанні немає доступної операції читання, публікації або відкату версій ChatGPT Sites. Opera Connector повертає `Browser not connected`. Підключений AppDeploy показує 0 apps і не керує Sites.
- **NOT_RUN**: реальні session owner/worker/client на оновленому live Worker; зовнішній Resend API; WhatsApp, генеративна модель, аудит privacy/retention, реальний backup restore, фізичний Android, скринридер, field CWV і клієнтський UAT.
- **RESOURCE WARNING**: VPS / ~93% диска заповнено, близько 15 ГБ вільно. Не видаляти бекапи, старі source-дерева та production-файли автоматично.

**Release verdict:** локальний QA green, **live production-ready UNKNOWN / NOT_DEPLOYED**. Надані користувачем дозволи не замінюють фактичний доступ до платформи та перевірки збереження даних.
