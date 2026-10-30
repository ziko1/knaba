# KNABA — інтеграція PR #114 і #115, 28.10.2026

Scope: чинна гілка PR #114 та наявний TEST. Production, DNS, секрети, реальні записи й платні провайдери не змінюються. PR залишається Draft. Дата 29 жовтня у PR #110 — план проєкту, не підтверджене приймання замовника.

## Вихідний код і відмінності

Початкові SHA #114 `89e979963bedffb720016577984a3da3f4ea942f`, #115 `7ab3ba152d9eaa268ce1c68cafbd834d1a135022`; спільна база `75c599b0c89bbb0c800e04839af5de6a323d62f3`. GitHub підтвердив 4 ahead / 3 behind. TEST v8 мав native source `ca2d68e19b659603e253462466359b827f8bb8fb`.

| Покращення | TEST v8 до інтеграції | Рішення |
| --- | --- | --- |
| Бірюзові/лаймові акценти, кольорові картки, hover/focus | Уже присутні у visual-polish.css | Замінено одним public-vivid.css з #115; два шари не завантажуються |
| Новий hero, темний перший слайд, послідовне оформлення публічних секцій | Саме реалізації #115 не було | Перенесено без зміни текстів, маршрутів, даних або компонентної структури |
| Одноразові entrance-анімації | Присутні, але включали hero та простіший lifecycle | Один public-motion: нерухомий перший екран, pause/cleanup, focus, reduced motion, Astro navigation, Studio guard; без opacity fade, з окремим translate як у #114 |
| Коротке мобільне меню | Нової max-height/scroll поведінки #115 не було | Перенесено CSS; 320×480 має прокручування до останніх пунктів |
| Карусель | Уже ручна: 8 слайдів, клавіатура, попередня/наступна | Збережено компонент і JS; додано ширші індикатори, focus, два ряди controls і видимий лічильник на вузькому екрані |
| CSS budget optimizer | #114 видалив частину невикористаних правил у source | Збережено global.css #114, додано наявний консервативний optimizer #115 та HTML guard; ліміт не збільшено |
| Чернетка/повтори форми, Sites/VPS auth, social PNG, privacy, Worker-first HTML noindex | Виправлення #114 відсутні у #115 | Збережено byte-for-byte відповідні модулі #114; Layout змінено вибірково, метадані social збережено |
| Mobile promo і /app/ ×4 | Уже є в обох | Збережено; scoped CSS лишає світлу кнопку на темній промосекції; standalone /app/ та приватні tools виключено з vivid |

Не виконувалося wholesale merge старшої реалізації #115. Старі visual-polish.css і visual-motion.ts видалено; нових паралельних компонентів немає. Пізнішу локальну fix/knaba-usability-20261028 не змінено й не включено в цей обмежений scope.

## Перевірений source

- Local tested runtime SHA: `eae6669c136490b1a94594e493b65c46f1f7f403`.
- GitHub runtime SHA: `5d182161aeb53281693f324b3c583c2c7d09fc4d`.
- Повні Git trees обох тотожні: `9eb293e0d8b07e9a3400932ba203ac3374871383`. Застосовано API fast-forward з expected head; main не змінено.
- 420 runtime/config/test/asset/migration файлів native checkout збігаються з canonical source.
- Фінальна повторна звірка 419 tracked файлів у src/worker/public/vps/drizzle/scripts/tests та основних configs: 0 відмінностей. Native source публікації: `05534fd88e9c53ffc03a933d3c688284cdb48ea3`. Від попереднього native checkpoint `d5da26b211436f82196da00e48efc2cca417948e` відрізняється лише evidence JSON про перевірку пакета.

## Фактичні перевірки

| Перевірка | Результат |
| --- | --- |
| Node 24.22.1 Astro/Vue/Svelte | PASS: 0 errors, 0 warnings, 7 hints |
| Vitest | PASS: 357/357, 49 файлів |
| Node suites у npm test | PASS: 32 + 27 + 10 + 8 = 77 |
| VPS реальний HTTP/SQLite з синтетичними даними | PASS: 90/90, TAP повний, без skipped |
| HTML delivery adapter fixtures | PASS: 9/9 |
| Root source/release policy tests | PASS: 28/28 |
| VPS і native build / i18n / links / CTA / icons | PASS: 134 HTML, 4 published / 95 pending locales |
| CSS | PASS: 39 443 / 40 960 B gzip; первісний integration candidate 41 221 B відхилено budget gate |
| Збереження v8 HTML-контрактів | PASS: 134/134, без змін 15 762 text segments, 6 406 links, 582 controls, 376 images |
| Браузер desktop | PASS у зазначеному scope: carousel next/Home/End, FAQ, inquiry review→home→Back, UK→EN draft/consent reset, Assistant Escape/focus, /app/ |
| Адаптивні кадри Chromium | PASS: 4 локалі ×320/390/700/768/1440 px; no overflow, один tel, індикатори 26×44 на mobile, видимий counter; menu320×480 scroll і no-JS FAQ/menu |
| GitHub CI exact runtime SHA | UNKNOWN: workflow_runs=[]; не оголошується зеленим CI |
| Clean committed source / historical import | PASS на `d337c479ada2f48fee5b3688dff703bc8fbb59e6`; combined ERP runtime acceptance NOT_RUN |
| TEST v10 фактичний HTTPS | PASS: 134/134 точних HTML hashes, 134 meta noindex, 134 HTTP noindex, захисні заголовки; 9 ресурсів, 3 indexing/config, 13 API, 5 protocol checks |
| TEST v10 браузер | PASS: carousel next/Home/End, FAQ, inquiry review/home/Back, UK→EN draft та consent reset, Assistant Escape/focus, /app/, анонімний кабінет і його UK-мова; 4 home locales без overflow/broken loaded images |

Браузерні сценарії виконано через керований Chromium. Responsive — same-origin iframes зі справжнім артефактом, не фізичний телефон або touch-emulation; ширина клієнтської області менша на 15px через scrollbar. No-JS — sandbox iframe без allow-scripts. 67 історичних перевірок #115 не додаються до цього прогону. Reduced-motion lifecycle перевірено unit-тестами, OS-level toggle, forced-colors і 200% text scale у цьому прогоні NOT_RUN. Не надсилали заявку/чат/email; використовували синтетичну незбережену чернетку. Чистий preview запустився після завершення останньої локальної D1 міграції; remote D1 не мігрували.

## TEST publication та rollback

PASS: опубліковано **TEST v10** 28 жовтня 2026, **20:17:03 UTC**, deployment `appgdep_6ae2582e8aa88191970ddb2c51996b33`, status `succeeded`.

- URL: https://kneba-temporary-preview.just-fawn-8470.chatgpt.site/uk/
- Native source: `05534fd88e9c53ffc03a933d3c688284cdb48ea3`.
- Worker SHA256: `c996994bed59b2735ccdee4252fab44e99b326a084f605e37f11317dd5b03610`.
- Saved archive: `sha256:38a47ca059dd8f810933d9a7195f5c7dd7e6aafd13d05e266b3f742bfa890909`, 7 086 080 bytes, 131 files, 0 static HTML. Усі 134 HTML обслуговує перевірений Worker.
- Audience public, D1 DB, environment revision 1 збережено. Remote D1 міграції не запитувалися; customer data не змінювалися.

Version 9 збережено, але **не розгорнуто**: передпублікаційна перевірка знайшла 134 зайві byte-identical static HTML copies, які могли обійти Worker headers. Копії вилучено лише з generated output, prepared-artifact gate повторно пройшов. Оскільки save API повторно повертає версію того самого source SHA, окремий evidence-only native commit створив виправлену v10. Не використовувати v9 для rollback.

Перший HTTP-прогін одразу після deploy: 74/134 точних bodies; 60 сторінок ще мали попередні body/ETag, проте усі 134 зберігали meta+HTTP noindex. Після спостереження нового hash на звичайному GET виконано повний повторний прогін: **134/134 exact, 0 findings**. Початковий результат збережено як `hosted-immediate-rollout.json.gz`, остаточний — `hosted-test.json`. Це спостережена перехідна поведінка rollout, а не видалені невдалі результати.

Старий v8 лишається точкою rollback: `appgprj_6adc346d6f8881918b73ac79ebc5d759~appgver_2e03382694948191b0ad5816dc11fd61`. Відкат — повторно опублікувати цю збережену v8 без міграцій/видалення БД; не відкотити production чи DNS. Receipt: `test-publication.json`, browser evidence: `browser-local.json` і `browser-live.json`, screenshot: `desktop-test-v10.jpg`.

## Передача замовнику

Обмежена UI-інтеграція і TEST read-back: **PASS**. Загальне приймання продукту: **NOT_READY / окремі gates відкриті**. GitHub connector не повернув PR-triggered workflows для exact runtime SHA, тому CI залишається UNKNOWN. CAPTCHA у чинному TEST вимкнена — це збережений стан середовища, не готовність захищених provider submissions. Owner/admin/Studio authenticated UAT, реальні OAuth/provider flows, ERP integration, підписані native builds, фізичні пристрої, field CWV, legal/media approval залишаються OPEN/NOT_RUN. Production не дозволений цим звітом. Наступні canonical commits після runtime checkpoint змінюють лише ROADMAP/PROJECT_MEMORY/docs/evidence; повний diff підтверджує відсутність runtime/config/test змін.
