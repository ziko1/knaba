# KNABA Site Studio — релізний checkpoint, 24 жовтня 2026

Окремий проєкт KNABA, а не AVENQO. Base: GitHub PR #19, codex/knaba-integrated-site-candidate-20261024. Усі кодові зміни знаходяться в corporate-site/; існуючі ERP і чат не переписувалися.

GitHub code commit: 68fed278b3460e554ebb70937002816e4cb6e66c. Local independently tested commit: 777007bcd0c0a20b306a90ada845c1568b3f9d6f. **Кодові Git-дерева збігаються:** ed091f283b10bda1d1ef2a80a8f14fac13f1a5d7, однаковий tree hash підтверджений GitHub та локально. Вихідні файли тотожні, метадані комітів різняться.

## Обсяг виконаної кодової реалізації
- /studio/: сторінка редактора власника з тим самим portal/session, owner-only доступом та переходом із /konto/.
- Візуальний вибір тексту або зображення у локальному iframe, desktop/mobile preview, DE/RU/EN/UK редактор, властивості тексту, alt, src локальних опублікованих медіафайлів, дозволених посилань, HEX-кольору, SEO title/description, undo/redo.
- Server-only API у чинному Cloudflare Worker /api/studio/*, CSRF/origin+body guards, D1 draft/version/history/restore, конкурентні 409, explicit PUBLISH, public endpoint лише для перевірених published entries. Ліміт поля/сторінки/селекторів, без вставлення HTML/скриптів.
- Три additive D1 таблиці, міграція drizzle/0003_absurd_bedlam.sql. Оригінальні 0000–0002 незмінні.
- Ручний AI-виклик для пропозиції тексту, без автоматичного збереження чи публікації. External AI API disabled за замовчуванням. Увімкнення вимагає квоти, дозволу власника, secret та позитивного budget cap. Жодного фактичного зовнішнього AI-запиту чи оплати.

ПОВНОЦІННИЙ production CMS ПОКИ НЕ ГОТОВИЙ. Публічні правки накладаються після завантаження сторінки з API, а не на server-rendered HTML. Тому SEO title/description не є гарантією для crawler; потрібне контрольоване server-side render/publish і перевірка індексації. Не реалізовано додавання/переміщення секцій, drag-and-drop, редагування меню, завантаження медіа/R2, генерацію зображень, підтримку всіх компонентів і шаблонів. Існує лише вибір уже опублікованих локальних картинок за шляхом.

## Fresh exact-source local receipts
- Executable source SHA: 777007bcd0c0a20b306a90ada845c1568b3f9d6f
- Corporate-site Git subtree SHA: 4d3e05529f468c97a53342539d71cce1dd9959ba
- Node24.19.0 npm run check: Astro 91 files, errors 0, warnings 0, hints 0; Vue and Svelte 0 errors.
- npm test: Vitest 86/86 (10 suites), Node inquiry 8/8.
- npm run build: 50 Astro pages and Worker build PASS (future native Vite config-loader warning remains).
- npm run verify:build: PASS, internal links/SEO/noindex/asset budget.
- One exact dist/client artifact SHA256: d67098d369475ae8c322fec0d7c4b7937bdfb01459f500ac445fa3a657609bf2.
- One dist/client/studio/index.html SHA256: 188deb93d3012e36d32eff8a8c6850259c024e9d61ac8f82081e308ba307cdcc.
- Wrangler local migrations 0000/0001/0002/0003: PASS, isolated DB only.
- Actual local Wrangler HTTP: GET /studio/ 200, / 200, public published API 200, anonymous owner page API 401, session API 200 anonymous.
- Live read-only kneba.vsp.rest home HTTP 200; /studio/ HTTP 404. No live deployment.
- Local Chromium/device/screen reader, real owner identity UAT, live D1 backup+restore, AI provider billing/quotas, field CWV, independent review and client acceptance: NOT_RUN/BLOCKED.

Повний згенерований receipt: docs/evidence/site-studio-20261024/build-verification.json. Машинний status: docs/evidence/site-studio-20261024/studio-qa.json. Старі tracked receipts не перезаписані.

## Release plan та rollback
1. Existing host: ChatGPT Sites project appgprj_6adc346d6f8881918b73ac79ebc5d759, kneba.vsp.rest. GitHub push не означає Sites deploy. Connected Opera зараз reported Browser not connected, AppDeploy — інший сервіс; наявний інструментарій не надає саме Sites publish/backup/version API. Не підміняти сайт новим DNS або іншим хостингом.
2. Перш ніж робити Sites deployment, збережіть trusted identity gateway validation: headers oai-authenticated-user-* не можуть бути підроблені з публічного клієнта або direct origin. Перевірити owner, admin, visitor із реальними сесіями та revoked user. Zero-trust до gateway proof.
3. Створіть backup real D1 та окремо перевірте restore у stage. Зіставте попередні дані/schema і застосуйте additive migration 0003 лише в ізольованому stage; не змінюйте поточну live базу до evidence.
4. Проведіть E2E: owner iframe редактор, 4 локалі, межі selector/page, version conflict 409, private draft vs public, explicit PUBLISH, restore, CSRF, XSS, links, real mobile, 200% zoom, keyboard/screen reader, accessibility, field Web Vitals.
5. Узгодьте PR #20 (публічні Bauhelfer послуги) і PR #17 (окрема 2D графіка), офіційний бренд/контакти та юридичну інформацію, перш ніж обирати єдиний release source.
6. Лише за всіх PASS виконайте deploy в ТОМУ САМОМУ Sites проєкті, збережіть exact source, artifact/worker hash, Sites deployment/version id і реальне підтвердження 200 на /studio/.
7. Rollback: повернути попередній immutable Sites artifact; additive D1 таблиці не видаляти автоматично, зберегти всі дані, міграцію відкотити лише після явно погодженої перевірки сумісності та backup.
8. AI external provider enable лише при реально перевірених ключах, quota, тарифах, дозволі owner, privacy/PII та server-only secrets. Фактичний баланс невідомий; поточне зовнішнє витрачання 0.

Status: CODE_CANDIDATE_TESTED, REAL_RELEASE_BLOCKED_NO_SITES_CONTROL. Full handover/release acceptance is open.
