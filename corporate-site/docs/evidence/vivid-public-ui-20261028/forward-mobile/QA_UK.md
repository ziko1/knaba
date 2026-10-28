# KnaBa — фінальне приймання зі збереженим мобільним розділом

Цей звіт є актуальним прийманням дизайну після узгодження паралельного mobile-оновлення. [Попередній звіт](../QA_UK.md) для 130 сторінок збережено як історичний; його результати не підміняють наведені нижче фінальні перевірки.

## Джерело та результат

- Coordinated staging baseline: `75c599b0c89bbb0c800e04839af5de6a323d62f3`.
- **Перевірений feature source: `0faad8da1551262c0fc4a583fe45ed4e5f43616f`.**
- Source tree: `6a0a13985f68ad862fc2e6d7476c4d0a3561228f`.
- **Client artifact SHA256: `96ea6397c9ea147c30193274fe757b755c83fe1398f9fc2a185892fa6318ce1b`.**
- Node24.22.1; `KNABA_RELEASE_MODE=vsp`; **134 сторінки**.

Upstream додав промосекцію на головній, чотири локалізовані `/app/` та окремі mobile/ERP модулі. Усі ці зміни збережені. Їхні вихідні файли, залежності й правила доступу не переписувалися дизайном; ERP/native runtime не сертифікується цим UI-прийманням.

Автоматичне злиття Layout і build verifier зберегло обидві зміни. Незалежний review знайшов конфлікт специфічності нової теми з кнопкою промосекції: три додаткові CSS-правила зберігають її лаймовий фон, темний текст, hover і золотий focus outline. `/app/` продовжує використовувати початкове оформлення сторінки входу в мобільні можливості, без публічної теми.

## Фінальні перевірки на точному source SHA

| Перевірка | Результат | Доказ |
| --- | --- | --- |
| Astro / TypeScript / Vue / Svelte | PASS, 315 файлів, 0 errors / 0 warnings, 6 наявних hints | `check.log` |
| Vitest | PASS, **292/292**, 44 test files | `website-tests.log` |
| Native Node website suites | PASS, **77/77** | `website-tests.log` |
| Root source/release/mobile-source checks | PASS, **28/28** | `root-tests.log` |
| VPS / SQLite | PASS, **90/90** | `vps-tests.log` |
| Clean source / historical import anchor | PASS; FEATURE CHANGE, не runtime acceptance ERP | `snapshot-source.log` |
| Build / HTML / internal links / budgets | PASS, **134 HTML** | `build.log`, `build-verification.log` |
| I18n verifier | PASS, 28 DE routes / 1065 units; 4 published / 95 pending | `build-verification.log` |
| Logo/responsive browser gate | PASS, **16/16** | `logo-browser.log` |
| Public UI / keyboard / no-JS / motion | PASS, **43/43** | `browser.json`, `public-browser.log` |
| Mobile promo + `/app/` compatibility | PASS, **8/8** | `mobile-integration.json`, `mobile-integration.log` |
| 134-page content preservation | PASS, **0 text/contract differences**, один tel на сторінку | `content-preservation.json` |

Разом: **487 автоматичних тестів** і **67 браузерних сценаріїв**, без зарахування build/static checks як окремих unit tests. Браузер — офіційний Chromium151.0.7922.34; лише loopback `http://127.0.0.1:18770`, без відправлення форм, зовнішніх переходів або зміни browser policy.

Основні 43 сценарії охоплюють DE/EN/UK/RU на 320/390/700/768/1440 px, коротке меню390×320, клавіатуру, manual carousel, фокус, no-JS, reduced motion, 200% root text і реальну одноразову420 ms анімацію нижче першого екрана. Додаткові8 перевіряють чотири локалі на390/700 px, промокнопку, локалізовані app links, manifest, чотири role cards і три download cards. Немає горизонтального overflow. Контраст тексту промокнопки **9,86:1**; золотого фокуса відносно найсвітлішого краю темного фону — **7,10:1**.

## Вміст і розмір

Порівняно саме baseline75c599b0 із source0faad8da, включно з новими mobile-сторінками: **134/134 маршрути, усі нормалізовані текстові вузли, URL/зображення/форми й accessibility attributes збережено**. Script/style та згенеровані stylesheet URL виключено з порівняння вмісту; метод і повні дані — у JSON.

| Вимір Node gzip | Baseline | Candidate |
| --- | ---: | ---: |
| Усі emitted CSS, по14 файлів | 40 949 B | **39 451 B** |
| Незмінений максимальний CSS budget | 40 960 B | **40 960 B** |
| Головна: HTML + прямо підключені CSS/JS | 50 807 B | **50 095 B** |
| Усі emitted JS, по36 файлів | 192 781 B | **192 781 B** |

CSS зменшено на **1 498 B / 3,66%**; головна з прямо підключеними assets — на712 B. Анімаційний модуль вбудований у HTML: незмінні окремі JS-файли не означають відсутності додаткового JavaScript. Це вимір зібраних артефактів; **field Web Vitals і реальний network transfer не вимірювалися**.

## Перегляд

![Desktop 1440×1000](desktop-1440.jpg)

![Український mobile 390×900](mobile-390.jpg)

## Повторення та межі

Команди source/build/browser перевірок наведені в [початковому звіті](../QA_UK.md). Для додаткових8 сценаріїв виконати `mobile-integration.cjs`, задавши `KNABA_PROJECT_ROOT` як root репозиторію, `KNABA_TEST_URL` як loopback origin, `KNABA_PLAYWRIGHT_MODULE` та `KNABA_SCREENSHOT_DIR` як каталог результатів. Збережено саме виконаний harness.

Повний check повторено після стабільної збірки: перший запуск закінчився на Vite dependency optimization без підсумків Astro/Svelte і не зараховувався як PASS. У фінальному `check.log` присутні повні підсумки всіх інструментів.

Наступний evidence-коміт змінює лише документацію, build receipt та скриншоти; runtime/config/tests залишаються byte-identical до0faad8da. Файли й хеші — у `source.json`.

**Не розгорнуто на живому сервері.** Main, production, DNS, бази даних і платні провайдери не змінені. Owner/physical-device UAT, native release, authenticated ERP і field CWV не закриті цим UI-прийманням. Перед rollout потрібні чинні source lease, backup/storage/rollback перевірки й release authorization за AGENTS. Повернення оформлення — зібрати та погоджено розгорнути baseline75c599b0 або reviewed revert лише design-змін, зберігаючи mobile й form-origin fixes; нових schema/data міграцій дизайн не додає.
