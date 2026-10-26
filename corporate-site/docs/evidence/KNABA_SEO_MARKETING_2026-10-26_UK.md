# KNABA — SEO та маркетинг, перевірка 26.10.2026

Статус: **source-only Draft**, не опубліковано. Проєкт KNABA, **не** AVENQO. Вихідна гілка: `fix/knaba-home-ux-order-20261026` @ `c1a742c2f5a5a1409cc975172ad5a82d93324c50`. Робоча гілка: `feat/knaba-seo-marketing-20261026`.

## 1. Перевірені джерела

- Google Search Central, SEO Starter Guide: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google Search Central, meta descriptions (унікальні, релевантні сторінці): https://developers.google.com/search/docs/appearance/snippet
- Google Search Central, canonical і дублікати: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google Search Central, міжнародні версії та взаємні hreflang: https://developers.google.com/search/docs/specialty/international/localized-versions
- Google Search Central, LocalBusiness schema: https://developers.google.com/search/docs/appearance/structured-data/local-business
- Google Search Central, CWV: https://developers.google.com/search/docs/appearance/core-web-vitals
- Google Business Profile, local ranking: https://support.google.com/business/answer/7091
- Google Ads, EEA consent requirements: https://support.google.com/google-ads/answer/13695607
- Реальний замовник: https://knaba.de/ і https://knaba.de/leistungen; **не підмінювати** офіційні відомості припущеннями.

Наявні на офіційному сайті послуги: Bauhelfer, Baustellenvorbereitung та Baureinigung (зокрема Baugrob-, Baufein-, Bauendreinigung), інші види Reinigung за фактичним каталогом. Контактні дані вже централізовані в `src/data/company.ts`; дублікатів контактів / claims не створювати. Спеціальні технічні роботи в новому сайті — лише після окремої перевірки кваліфікацій і договору.

## 2. REUSE-FIRST: що було в кандидаті до SEO-змін

- Shared `Layout.astro`: унікальні `title`/`description`, canonical, взаємні hreflang DE/EN/UK/RU, Open Graph, LocalBusiness, WebSite, BreadcrumbList.
- `robots.txt.ts` та `sitemap.xml.ts`: публічні URL окремо від owner/CRM/API, 4 реально перекладені мови, без вигаданих 95 локалізацій.
- Існуючі нативні сторінки /bauleistungen/, /berlin/, /ratgeber/ та контактні шляхи; не генерувати сотні порожніх районних doorway-сторінок.
- Раніше PNG `public/images/knaba-social.png` мало старі написи «Gebäudereinigung / Saubere Räume», хоча тепер сайт спеціалізується на Baureinigung і Bauhelfer. Перевірено власне зображення, а не тільки MIME та розміри. Чинні DE/EN/UK/RU 3D SVG логотипи використані для нових social cards.
- Existing `vps/seo.mjs` оновлює title/description в OG та Twitter **тільки якщо відповідні метатеги існують**. В `Layout.astro` Twitter title/description не було.

## 3. Реалізовано у новій Draft-гілці

1. Чотири **локалізовані** first-party PNG `knaba-social.png`, `knaba-social-en.png`, `knaba-social-uk.png`, `knaba-social-ru.png` (1200×630), створені з наявних SVG логотипів через `scripts/generate-social-cards.mjs`; на кожній мові правильний зміст Baureinigung & BauService. На сторінках відповідної локалі OG і Twitter використовують той самий PNG та локалізований alt.
2. `twitter:title` та `twitter:description` — узгоджені зі звичайними і OG-тегами, також після SEO-редагування через наявний Studio SSR шлях.
3. Каталог /leistungen/ має локалізовану назву Берліна в заголовку та регіон у description; детальні /bauleistungen/{slug}/ отримали регіон у description без дублювання видимих CTA чи змін до умов послуг.
4. Розширено **наявний** `tests/verify-build.mjs`: перевірка реальних PNG-байтів/розмірів **усіх чотирьох** файлів, кожної згенерованої HTML сторінки, OG/Twitter parity, image URL відповідної локалі і локального сервісного опису. Оновлено два старих Vitest-тести SVG/брендингу без ослаблення перевірки логотипів. Нових прямих npm-залежностей немає: генератор використовує наявний locked Sharp/Astro.

Переглянута графіка: DE SHA-256 `a0de6a6dd3135ec9d9559b40ed209fa0add02d0935460bd3e1f2f76b82df1365`, EN `aac86e749283c79e8a506ed5951c38d026435cf215bb899bc4ced7f1b7afaf3a`, UK `87f7f6b20e80dfcdbe2f58200d62dddacb6ee2237f70162375337acafc782eea`, RU `98987336c9d6c8edde9f7796385d360f0d16438fd9510fbe9e62b273ed400cff`. SHA-256 перевірені на сервері перед завантаженням; GitHub blob read-back збігся. Це перевірка цілісності вихідних файлів, **не** оцінка їхнього вигляду в соцмережах.

**Важливо:** ці зміни самі по собі не є підтвердженням фактичної індексації, трафіку, заявок, живого CWV чи права на customer production cutover.

## 4. Карта пошукового попиту → фактичні сторінки

| Намір пошуку (DE) | Єдиний відповідний URL (відносний) | Конверсія |
|---|---|---|
| Baureinigung Berlin, Baugrobreinigung | `/bauleistungen/baureinigung/` | контакт з `anliegen=baureinigung` |
| Bauzwischenreinigung Berlin | `/bauleistungen/bauzwischenreinigung/` | запит послуги |
| Baufeinreinigung / Bauendreinigung Berlin | `/bauleistungen/bauendreinigung/` | запит послуги |
| Baustellenberäumung Berlin | `/bauleistungen/baustellenraeumung/` | запит послуги |
| Bauhelfer Berlin / Baustellenvorbereitung | `/bauleistungen/bauhilfe/` | запит послуги |
| Baureinigung Berlin & Brandenburg | `/berlin/` | загальний контакт |
| Leistungsübersicht / BauService | `/leistungen/` | сервіс → контакт / планувальник |
| Дослідницькі питання перед замовленням | `/ratgeber/` та чинні статті | релевантний сервіс → запит |

Не створювати дубльовані `/berlin/bezirk/`, «псевдолокації», відгуки, фото «до/після», ліцензії або 24-годинні SLA без підтвердження замовника. Не канібалізувати ключові слова на різних копіях сторінки.

## 5. Маркетинг без прихованих витрат

**Google Business Profile — дії власника з підтвердженим доступом**: узгодити назву, адресу, телефон, фактичні години та service-area; перевірити/підтвердити профіль, категорії згідно з реальною діяльністю; завантажувати лише дозволені фото реальних робіт, відповідати на справжні відгуки. Не запускати фальшиві або стимульовані відгуки. Аудит відповідності NAP між Business Profile, офіційним сайтом і новою версією.

**Органічний контент (B2B)**: поточні 4 локалізації й статті мають бути корисними для конкретної ситуації клієнта: Bauphase, площа, тип поверхні, строки, доступ, вимоги безпеки, окремі погодження; кожен матеріал спрямовує до доречної послуги. Нові кейси або фото лише за дозволом клієнтів. Мінімізувати загальні обіцянки типу «№1» або «гарантоване 24 години».

**Платна реклама**: бюджет/квоту не затверджено. Лише підготовлені групи high-intent DE: `Baureinigung Berlin`, `Bauendreinigung Berlin`, `Bauhelfer Berlin`, з окремими відповідними лендингами; мінус-терміни типу `kostenlos`, `Ausbildung`, `Jobs` за результатами реальних search terms. НЕ створювати рекламний акаунт/кампанію, НЕ запускати списання. При підключенні вимірювання спершу погодити GDPR/ePrivacy-правову основу, згоду на tracking (EEA) і зберігання лідів.

## 6. Два домени — блокер SEO-релізу

**`knaba.de` є офіційним живим сайтом, `kneba.vsp.rest` — окремим публічним preview**. У поточному source режим `KNABA_RELEASE_MODE=vsp` також індексований за наявним контрактом. Це може розділяти брендовий попит/дублювати контент. Не переписувати цю затверджену release-політику в вузькому SEO-патчі.

Перед маркетинговим запуском власник має визначити canonical публічний домен і дату переходу. Після дозволу: перевірений backup/rollback, відповідність URL, план релевантних 301, Search Console власність, sitemap/robots/canonical/hreflang відповідно до **одного** затвердженого domain-release mode; жодного масового редиректу на головну. Google: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes.

## 7. Acceptance і вимірювання

- На точному PR HEAD: pinned `npm ci`, `npm run check`, `npm test`, `KNABA_RELEASE_MODE=vsp npm run build`, `npm run verify:build`, `npm run test:vps` та source read-back. PASS тільки за фактичним виходом інструмента.
- Кандидат: повний QA 4 локалізацій, наявні CTA/телефон/форми, нуль нових JS/third-party запитів; візуальний browser/device QA лише за доступного авторизованого браузера.
- Після дозволеного релізу: Search Console URL Inspection, валідність schema через Rich Results Test, mobile PageSpeed/CrUX **реальними значеннями**, дані Search Console clicks/impressions по сторінках, перевірені заявки (без PII в аналітиці).
- Google CWV орієнтири p75: LCP ≤ 2,5 с, INP ≤ 200 мс, CLS ≤ 0,1; **не стверджувати PASS без польових даних**.
- Релізний статус до окремого погодження: **HOLD**. Немає дозволу на main merge, production deploy, DNS, Google Ads, Analytics/Consent mode activation або обробку реальних персональних даних.


## 9. Фактичний публічний VSP SEO-аудит 26.10.2026 (read-only з підключеного VPS)

| URL | HTTP | Перевірений фактичний результат |
|---|---|---|
| `https://kneba.vsp.rest/` | 200 | index/follow, self-canonical VSP, старе `og:image` = локалізований SVG |
| `https://kneba.vsp.rest/leistungen/` | 200 | title «Baureinigung. Bauhilfe. Zusatzleistungen. \| KnaBa», старий SVG social image |
| `https://kneba.vsp.rest/en/` | 200 | англійський title, self-canonical і EN SVG social image |
| `https://kneba.vsp.rest/robots.txt` | 200 | `Sitemap: https://kneba.vsp.rest/sitemap.xml` |
| `https://kneba.vsp.rest/sitemap.xml` | 200 | **88** `<loc>` публічних URL |
| `https://kneba.vsp.rest/galerie/` | **404** | помилка живого сайту, **не** помилка локальної SEO-гілки |

Прямий HTTP GET без owner/cookie/POST, без зміни сайту. Кандидат має **92 очікуваних маршрути** (4 локалі × [11 common + 8 construction offers + 4 construction guides]); відсутні live/gallery URL перед наступним релізом треба звірити з артефактом і виконати server smoke. **Важливо:** ця таблиця описує *старий live-деплой*, а не QA-кандидат. Не оголошувати виправлення 404 в інтернеті, доки немає перевіреної публікації.

## 8. Наступні кроки власника

1. Підтвердити preferred canonical домен і дозвіл на VSP release, окремо від `knaba.de`.
2. Підтвердити Google Business Profile право власності й актуальні публічні реквізити.
3. Затвердити права на фото/партнерські знаки та реальні customer claims.
4. Після готового release й Search Console надати baseline (органічні покази/кліки, GSC coverage, реальні запити) для evidence-based маркетингової ітерації.
