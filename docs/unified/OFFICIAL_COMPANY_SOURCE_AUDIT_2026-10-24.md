# KnaBa — офіційна компанія-замовник і source-of-truth (24.10.2026)

**Контекст:** Користувач прямо підтвердив, що проєкт `ziko1/knaba` створюється **для компанії з https://www.knaba.de/**. KNABA DE — окремий проєкт від AVENQO. Джерела звірено 24.10.2026; офіційний сайт залишається власністю оператора, міграція/DNS не санкціоновані.

## Підтверджені публічні реквізити

| Поле | Значення / джерело |
| --- | --- |
| Торговий бренд | KnaBa / KNABA |
| Anbieter у Impressum | Alexander Knaus, KNABA Bauhelfer |
| Адреса | Im Achterkastell 39, 10315 Berlin, Deutschland |
| Телефон | +49 (30) 679 33054 / `tel:+493067933054` |
| Email | `kontakt@knaba.de` |
| USt-IdNr. | DE 263654022 (як опубліковано власником) |
| Регіон послуг | Berlin und Brandenburg |
| Головні джерела | https://www.knaba.de/ ; https://www.knaba.de/leistungen ; https://www.knaba.de/ber ; https://www.knaba.de/impressum |

**Примітка про актуальність:** на деяких сторінках головним акцентом є Gebäudereinigung, на інших (зокрема Impressum/Über) — KNABA Bauhelfer та Bauhilfsarbeiten. Не трактувати це як дві різні компанії без власникового підтвердження. Під час офіційного релізу власник має підтвердити точне торгове найменування та пріоритет пропозиції.

## Реальні послуги

Офіційний перелік містить Baureinigung (Baugrob-, Baufein-, Bauendreinigung), Grund-/Sonderreinigung, Unterhaltsreinigung, Büroreinigung, Glasreinigung, Treppenreinigung; робота зі школами, спортзалами, дитсадками, паркінгами, торговими площами. Сайт також згадує Glas-/Fassadenreinigung та **Baustellenvorbereitung/Bauhilfsarbeiten/Bauhelfer**. Не вигадувати ціни, терміни, гарантії, сертифікати, кількість працівників чи права на логотип/галерею/партнерські знаки.

## Звірка з поточним інтеграційним кандидатом

- Уже збігаються: `corporate-site/src/data/company.ts` (власник/контакти/адреса/USt-IdNr./регіон), `src/pages/impressum.astro`, `src/pages/kontakt.astro`, `src/data/site.ts` (офіційний `knaba.de`, preview `kneba.vsp.rest`).
- Реальна прогалина: домашні сторінки та rule-based `KnaBa Assistent` не відображали окремо **Bauhelfer/Bauhilfsarbeiten**, хоча напрям прямо є у джерелі.
- Безпечна корекція у гілці `codex/knaba-official-company-alignment-20261024`: секції для DE/RU/EN/UK; відповідь помічника на запити про Bauhelfer на чотирьох мовах; цільове регресійне тестування. Запит скеровує до чинної контактної форми **без** включення непідтвердженого виду робіт до шести cleaning enum, тарифів, ERP-каталогу чи автоматичного контракту.
- Схеми Postgres/D1, міграції, auth/permissions, платні API та deployment не змінюються.

## Незакриті приймальні критерії

1. Власник компанії підтвердив позиціювання «Gebäudereinigung + Bauhelfer», точну номенклатуру робіт, права на логотип і зображення, актуальні юридичні реквізити.
2. Запущено повний build + Vitest + доступність/de/device browser на **точному source SHA**, перевірено, що немає зламаних локалізацій/посилань, справді збережено звернення через D1.
3. Погоджено оновлені юридичні тексти/GDPR і приватність; сторінка чинного `knaba.de` містить старі посилання на TMG та EU ODR і **не є юридично перевіреним шаблоном**.
4. Узгоджено, як окремі Bauhelfer-заявки стануть типом послуги в ERP, з owner-controlled цінами і версіонованими idempotent D1→Postgres контрактами (окреме завдання, НЕ частина текстової корекції).
5. Офіційний перехід `knaba.de`, DNS, SEO redirects, Search Console, live user-role UAT і реліз дозволяються лише після окремого рішення власника.

**Статус корекції:** SOURCE_UPDATED / TESTS_NOT_RUN / DEPLOY_NOT_RUN / CUSTOMER_ACCEPTANCE_NOT_RUN. Історичні результати PR #9/#12 належать іншим SHA, не є доказом для цього commit. Жодних merge, live mutation чи paid activation.
