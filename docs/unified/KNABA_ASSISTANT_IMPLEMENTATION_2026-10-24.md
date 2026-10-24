# KnaBa Assistant → власник: технічний інкремент

Дата: 2026-10-24. Scope: Draft PR #12, **не deployed**, **не production-ready**. Це окремий від FAQ модуль спілкування людей, без включення нових AI/WhatsApp/email провайдерів і без зміни чинного сайту/реальних даних.

## Функціональність, фактичні шляхи

- Public UI: `corporate-site/src/components/PublicAssistant.tsx` вбудовує `VisitorOwnerChat`; повідомлення надсилаються лише після явної згоди. Відвідувач зберігає випадковий 256-bit capability у `sessionStorage` поточної вкладки (не URL і не лог), у D1 — лише SHA256. Немає автоматичного записування тексту окремого довідкового FAQ-чату.
- Owner UI: `corporate-site/src/components/Portal.tsx` має вкладку `assistant` лише для ролі `owner`, а `OwnerInbox` читає розмови і відповідає на вибраний діалог. API повторно перевіряє власника. Оновлення вручну, без фонового polling та обіцянок миттєвої доставки.
- `POST /api/assistant/threads` — нова розмова `{capability,idempotencyKey,consentAccepted:true,locale,message}`. Успіх 201 `{id,received:true}`, повтор 200, зміна тексту з тим самим ключем 409.
- `GET /api/assistant/threads/:id` — лише з `X-KnaBa-Thread-Capability` у заголовку. Відсутній/чужий/прострочений секрет повертає 404; ніколи не надсилає capability hash.
- `POST /api/assistant/threads/:id/messages` — наступне повідомлення відвідувача, з тим самим приватним заголовком, consent отримано на старті; запис має idempotency.
- `GET /api/assistant/owner/threads`, `GET /api/assistant/owner/threads/:id`, `POST /api/assistant/owner/threads/:id/messages` — захищений owner-only список, історія та відповіді.
- Зберігання: `assistant_threads`, `assistant_messages` (нові additive SQLite/D1 таблиці), історія повідомлень із серверним UTC часом; `portal_audit` фіксує подію без вмісту повідомлення. SQL statements параметризовані; атомарний batch і dedupe гарантують один логічний ефект повтору за ключем в межах транзакції.
- Мови UI: DE, EN, UK, RU. 80 останніх повідомлень на сторінку читання; більше повідомлень відмічено прапорцем, але курсор пагінації ще не реалізований. Список власника обмежено 50 діалогами; UX для списку понад 50 є незакритим acceptance.
- Доступ відвідувача за секретом діє до 7 діб. **Це час дії ключа, не політика знищення серверних даних!** Кінцевий термін зберігання, DSAR, видалення, retention/backups потребують рішення власника й юридичної перевірки до релізу.

## Захист та умови deployment

- Для всіх записів використано чинний `readBody`: JSON, same-origin, власний anti-CSRF заголовок, ліміт 12 KiB, сувора перевірка полів і 2–1500 символів тексту. HTTPS TLS і server-no-store встановлює існуючий Worker/gateway.
- Нові анонімні розмови потребують **довіреного** заголовка `CF-Connecting-IP` від edge, інакше 503. 15 початків діалогу/IP/годину (IP тільки у SHA256 bucket) плюс 8/кожен capability/годину; у відповідях на вже видану capability також є ліміт. Реальне гарантування upstream header sanitization, WAF/bot defense і abuse pressure tests — ще не перевірене. Не дозволяти прямого публічного доступу до origin в обхід довіреного edge.
- Власник визначається тільки серверним `OWNER_EMAIL` і trusted Sites identity. Перевірка справжності/очищення `oai-authenticated-*` заголовків hosting-provider в реальному середовищі є блокером security UAT; mock header у тесті не є фактом авторизації продакшн.
- Новий Worker routing pattern `/api/assistant/*` додано до `vite.worker.config.ts` і контролюється `tests/verify-build.mjs`; інакше Cloudflare Assets могла повернути 404 перед Worker.
- Листи, WhatsApp, real generative AI, прив’язка до ERP PostgreSQL, погодження комерційних умов, production retention/erasure, фізичний смартфон, людський owner UAT, незалежний безпековий review — **NOT_RUN / BLOCKED_EXTERNAL**.

## Перевірки (локальний VPS, синтетичні дані)

1. RED: невідомі API маршрути давали 404 при очікуваному 201; після реалізації focused реальний SQLite/D1-style test пройшов. Окремі RED/GREEN: rate-limit за IP, reject missing edge-IP, browser Worker route.
2. `npm run check` — Astro/Vue/Svelte, 0 помилок; `npm test` — усі чинні сценарії й нові; `npm run build && npm run verify:build` — 51 HTML сторінка, тимчасовий noindex, Worker routes, JS/CSS budget. Остаточні логи й числа прив’язати до GitHub source SHA після коміту, не до документаційного head.
3. Реальний локальний Wrangler Worker + SQLite/D1 у тимчасовій `.wrangler/state`: HTTP `POST` 201, повтор 200, `GET` власної історії 200, чужий capability 404, owner без налаштування 403. Це **не** live-provider D1 і не real owner session.
4. Попередні suite receipts ERP #5/#6 зберігаються на їх окремих SHAs; реальна D1↔ERP інтеграція не реалізована і не сертифікована.

## Розгортання та rollback (НЕ ВИКОНУВАТИ НА РОБОЧІЙ БД БЕЗ APPROVAL)

- У новому ізольованому test-worktree: встановити Node24/npm per engines, `npm ci --prefix corporate-site`, `npm run build --prefix corporate-site`, `npm run db:migrate:local --prefix corporate-site`, `npm run dev --prefix corporate-site`. Після зупинки локального preview дані лишаються в ізольованій `.wrangler/state`, не в реальній D1.
- Для майбутньої робочої D1: спочатку верифікувати backup/export і дату/таблиці, owner-approved retention policy, provider permissions; лише після цього застосувати additive `drizzle/0001_wet_nick_fury.sql` в staging, перевірити schema version та міграційний rollback. Не видаляти таблиці чи повідомлення для rollback без explicit owner approval.
- Відкат frontend/Worker до минулого deployment не змінює старі дані D1; нові таблиці при відкаті залишаються. Переїзд на офіційний `knaba.de` окремий, тимчасовий `kneba.vsp.rest` залишається noindex.

## Незакриті acceptance

- Гостьовий + власниковий реальний браузер із підтвердженим Sites Auth та D1 provider; user consent і legally approved privacy текст; keyboard/320px/200% zoom; пагінація для inbox і повідомлень; блокування/закриття діалогів, retention/erasure; email/WhatsApp одержувача; E2E зовнішнього CRM/ERP; незалежний review. Без цих доказів release guard залишається `BLOCKED`.
