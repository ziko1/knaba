# KNABA — перевірена інтеграція візуальних змін / release gate
Дата: 26 жовтня 2026 року (Europe/Berlin).

## Scope і джерела
- Репозиторій `ziko1/knaba`; інтеграційна гілка `fix/knaba-unified-visual-qa-20261026`.
- Виконуваний перевірений коміт: `d80811a51b983a44ef7df33a61cb07711f476730`.
- База — Draft PR #73, HEAD `15f44511a57add6f3c058c7b8ca2158da4cf6403`. З Draft PR #74 (`367e6e91710831808e4289c0be720cc0b17c8778`) повторно використано лише 7 існуючих WebP blob + `ServiceCarousel.astro` + тест. Локальні логотипи вже присутні в PR #73 з попередньої інтеграції PR #75; **не додано другого компоненту партнерів**.
- Новий тестовий контракт: `scripts/image-alt-gate.mjs`, дев’ять Node regression tests і корекція `tests/verify-build.mjs`. Декоративні зображення з `alt=""` допускаються лише всередині явного `aria-hidden="true"`, інші зображення потребують підпису і додатних width/height. Підтверджено RED старого verifier на WebP і GREEN після виправлення; окремий RED→GREEN цикл підтвердив перевірку зображень у `<noscript>` (HTML parser `scriptingEnabled: false`).
- Жодного merge в `main`, release cutover, міграції БД, активації платних сервісів або змін облікових записів.

## Команди та фактичний QA на Node v24.21.0
Проведено на VPS у **окремій тимчасовій робочій копії**, git HEAD `4bfc745223544a3add71a55a7332cb347d0c441d`:
- `npm run check` — exit 0, Astro/Vue/Svelte 0 errors, 0 warnings, 7 non-blocking hints.
- `npm test` — exit 0: **165 Vitest**, **36 Node core/static**, **27 logo/browser-policy**, **20 image-alt + public-HTTP contract** = **246 tests PASS**.
- `KNABA_RELEASE_MODE=vsp KNABA_VSP_INDEX_APPROVED=1 npm run build` — exit 0, **121 HTML pages**; перехід до `indexable` тут — лише параметр локального build, не зміна публічного сайта.
- `npm run verify:build` — exit 0, including **18 VPS tests PASS**; **загалом 266 автоматизованих тестів**.
- Перевірений статичний client artifact SHA-256: `e631c2db43d73f72019b03de9ad6d61dde79a5da9759bac4430cb1357cb87004`.
- Увесь згенерований CSS: 34 624 байти gzip, увесь згенерований JS: 182 737 байтів gzip. Це **суми build-артефактів**, не розмір завантаження окремої сторінки, не Web Vitals.

## Незалежна read-only перевірка сайтів/URL
- Чинний VSP preview: `https://kneba.vsp.rest`, останній перевірений активний реліз `/srv/knaba/vps/releases/83ff0ba402b38209a39d96325fa1c3f9cfed5a86`.
- Чинний опублікований sitemap: **88 URL**, усі 88 відповідали HTTP 200 у попередньому live-аудиті; **4 галереї на live іще повертають HTTP 404**. Є старі переходи на `knaba.de`. Live не змінено.
- Локальний candidate sitemap: **92 URL**; **0 втрачених старих**, **4 додані**: `/galerie/`, `/en/galerie/`, `/uk/galerie/`, `/ru/galerie/`.
- Незалежний тимчасовий loopback HTTP GET: **104/104 200** (92 публічні маршрути + 7 WebP + 5 локальних логотипів). Збірка кожної галереї містить 4 картки, головна кожної локалі — 5 карток партнерів. У 4 локалізованих головних HTML — **0 посилань на legacy knaba.de**.
- 7 WebP відкрито візуально, сюжети різні та відповідають заявленим напрямам послуг.
- Лише DE/EN/UK/RU готові як опубліковані локалі; 95 інших — backlog, **не 99 релізних перекладів**.

## Незакриті release/customer acceptance
1. Browser gate на реальній взаємодії: в доступному SentinelX QA середовищі немає встановлених Chromium/Firefox/Playwright/WebKit; скриншоти попереднього live-аудиту не є QA цього candidate. Не встановлювати браузери/не обходити administrator policy без окремого дозволу; потрібен окремий дозволений browser/device QA (320/390/768/1440 px, keyboard/tab, 200% zoom, focus, floating Assistant overlap).
2. Real lead workflow: end-to-end запит/валідація/receipt/owner handoff; перевірка `/konto/`, `/admin/` role auth і tenant isolation на власних тестових облікових записах. HTTP 200 публічного shell або unit-mock **не закриває** ці acceptance.
3. Юридичні дані, права на оригінальні партнерські логотипи, підтвердження від замовника. Не вигадувати партнерські статуси/сертифікати.
4. Офіційний site migration, production deployment і пошукова індексація потребують окремого owner approval та перевіреного rollback. Field CWV/LCP/INP/CLS поки NOT_RUN.
5. Лише після дозволеного preview cutover запускати `npm run verify:live` із `KNABA_RELEASE_MODE=vsp`: усі 4 галереї HTTP 200, 5 перших логотипів завантажуються, legacy CTA відсутні, `healthz`/`readyz` доступні, immutable artifact SHA збігається. Після cutover повторити карту всіх 92 сторінок та мобільний browser QA.

**Висновок:** кандидат проходить static/build/contract/loopback gates; статус **DRAFT / LIVE NOT DEPLOYED / CUSTOMER-READY NOT CONFIRMED**. Незавершене заведено у чинний Issue #54, без дублювання правок інших PR.
