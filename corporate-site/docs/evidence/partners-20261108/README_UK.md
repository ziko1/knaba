# KNABA — TM Ausbau та Brüninghoff Group, 08.11.2026

На прямий запит користувача два підтверджені ним партнери додані після п’яти чинних компаній. Власні профілі, назви, описи DE/EN/UK/RU, локальні оригінальні логотипи й посилання на офіційні сайти використовують наявні компоненти головної сторінки, «Про компанію» та каталогу партнерів. CSS, залежності, ERP, авторизація та дані не змінені.

## Джерела

| Компанія | Офіційний сайт | Оригінальний SVG |
| --- | --- | --- |
| TM Ausbau | https://www.tm-ausbau.eu/ | https://www.tm-ausbau.eu/typo3conf/ext/tm_ausbau/Resources/Public/Images/Layout/logo.svg |
| Brüninghoff Group | https://www.brueninghoff.de/ | https://www.brueninghoff.de/_assets/890e204c6968c16be2193475e52284b8/Images/Layout/logo-brueninghoff-group.svg |

Обидва логотипи отримано 08.11.2026 з HTTP 200, image/svg+xml і збережено без зміни байтів. TM Ausbau: 2015 bytes, SHA256 `1465198b3f9af38ed0838f539274fd824ec122bc564c72a0642f5f8e55d1195d`. Brüninghoff Group: 2512 bytes, SHA256 `2f399486d61b23eb57a843d359ddf78c324197d7be4f7f84192cf61f104cc373`. XML перевірено: немає scripts, foreignObject, event handlers або зовнішніх references. HTML img dimensions TM округлені до 220×37, SVG зберігає оригінальний viewBox, чинний object-fit: contain зберігає пропорції.

Офіційні сторінки є джерелами назв і описів діяльності. Джерело відомості про співпрацю з KNABA — доручення користувача; конкретні проєкти, відгуки, рекомендації та юридичний контрагент усередині групи не вигадувалися.

## Перевірки й межі

Точні команди, результати, artifact hash, виправлені знахідки та початкові невдалі запуски містяться у `verification.json`. `source-manifest.json` прив’язує перевірки до точних змінених файлів; `built-pages.json` фіксує 12 перевірених HTML-файлів. Поточні PL/LT regional pages не мають цього компонента партнерів; нові маршрути або мови в цій правці не додавалися.

Незалежний reviewer `/root/partner_verification` прийняв фінальний source diff; окремо повторив 12/12 HTTP-verifier tests. Каталог перекладу містить 11 нових units без видалення чи зміни старих. Браузерна перевірка BLOCKED через відсутні локальні рушії; screenshot, physical-device, live та field Web Vitals не заявляються.

Статус: source candidate для Draft PR на поточну інтеграційну гілку PR #123. Final remote commit/tree і CI прив’язані у PR. Merge, production, DNS та live data не виконувалися. Rollback — revert цього контентного commit без міграцій.
