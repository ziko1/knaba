# KNABA — спільна локалізація бренду, 26.10.2026

## Обсяг
Окрема зміна від поточного приватного VPS preview source f3b1c69dcd09824dc91101142c9d593ebdc7ad39. Без зміни графічної геометрії, кольорів та юридичних тверджень. Джерело істини для узгоджених чотирьох слоганів, SVG-описів та alt-текстів — src/data/brand-messages.json; існуючий генератор 3D-логотипа та загальний Astro layout використовують спільний словник. Соціальні метадані тепер вибирають фактично локалізований header SVG замість старого німецького зображення. Публічні DE/EN/UK/RU маршрути, авторизація, БД, API, конфіденційні дані, ERP, платежі не змінюються.

## Правдивий стан 99 мов
- 99 — цільовий каталог BCP47; 4 підтримувані й опубліковані переклади: de, en, uk, ru.
- 95 не готові: не генерувати фальшиві HTML/hreflang/sitemap-посилання, не обіцяти готової локалізації.
- Для нової мови необхідні узгоджена термінологія, всі сторінки/форми/помилки/SEO/Assistant, legal review, RTL/a11y/device/browser QA, native reviewer, окремий evidence-gated release.
- Без зовнішніх витрат. Нових залежностей немає.

## Ізольовані перевірки (Node 24, offline Docker)
- Генератор 3D SVG: 19/19.
- npm run check, npm test (187 Vitest та наявні Node сценарії), npm run build (118 HTML), npm run verify:build — PASS.
- Серверні node --test vps/*.test.mjs: 24/24 PASS.
- Новий release gate: 24 HTML на 4 мовах, 16 SVG, каталог 99/4/95, lang/hreflang/OG/alt/desktop/mobile і заборона фальшивих мовних URL. PASS.
- Client artifact SHA256 за existing verifier: 1c466595f5d7c0b05f182bf2b3bcad19d6e5dafddc84c9abcc3d309c3216fde6.
- Фізичні пристрої, screen-reader, native legal review, owner /readyz, Web Vitals — NOT_VERIFIED.
- Loopback Playwright: BLOCKED / NO_USABLE_BROWSER, не PASS. Тест оновлено для мовних SVG; реальний браузер залишається acceptance.
- Офіційний knaba.de не змінювати. Приватні sources не пушити в публічний GitHub. Не робити міграцій та не вмикати провайдери.

## Preview deployment
Для dev-only kneba.vsp.rest: exact-source compare, static/HTTP smoke, SQLite online backup SHA256, попередній immutable release і швидкий rollback. Source SHA та post-deploy результат зберігати в окремому deploy receipt.
