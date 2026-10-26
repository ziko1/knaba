# KNABA — офіційний сайт / аудит функцій, посилань і прав, 26.10.2026

## Перевірені публічні джерела
- https://knaba.de/ — головна сторінка; форма запиту Name, Telefon, E-Mail, Nachricht; п'ять логотипів під UNSERE PARTNER.
- https://knaba.de/leistungen — Bauhelfer, Baustellensicherheit, Kernbohrungen, Montagen, Abbrucharbeiten; Baureinigung, Grundreinigung, Unterhalts-, Büro-, Glas-, Treppenreinigung тощо.
- https://knaba.de/ber — відомості про компанію.
- https://knaba.de/galerie — галерея з шістьма зображеннями і темами Lean-management, Baustellenvorbereitung, Prinzip.
- https://knaba.de/jobs — вакансії, деталі та форма Bewerbung; актуальний набір і зміст умов потрібно затвердити з роботодавцем.
- https://knaba.de/kontakt — контакти і форма.
- https://knaba.de/impressum — Alexander Knaus / KNABA Bauhelfer, опубліковані контакти/VAT, Urheberrecht, старе повідомлення про Bildquellen Fotolia/Pixabay/ONE.com.
- Публічний вміст не доводить окремих професійних ліцензій, ISO-сертифікатів, передачі прав на стокові фото або права повторно розмістити сторонні логотипи на новому домені. Кореневий `LICENSE` у GitHub — Apache License 2.0 на кодову базу, **не** ліцензія на бізнес-діяльність і **не** дозвіл на конкретні фото.

## REUSE-FIRST — що вже було в кандидаті
- Беремо Draft PR #72 (HEAD `472c71f505a892895f91264cc5da5b36724bc0c5`) як основу. Він включає Draft PR #71 — п'ять логотипів в одному `PartnersSection`; і Draft PR #68 — прибирання дубльованих блоків, вихідних посилань на старий сайт й охорона build HTML.
- Контакт: наявний `ConstructionContact` / `Inquiry`. Послуги: `constructionOffers`, `ConstructionDetail`, `ConstructionPlanner`. Про компанію: `ConstructionInfo`. Вакансії: `/karriere/`; реальне HR-збереження та умови наймання **не додавати** без затвердження.
- KNABA Assistant, ERP, акаунти, Studio, Turnstile, CRM не розмножувати й не перемикати, доки їх власні release gates не закриті.

## Внесено в source-only гілку
1. **Галерея:** одна `ConstructionGallery.astro` + чотири locale routes `/galerie/`, `/en/galerie/`, `/uk/galerie/`, `/ru/galerie/`. Використано власні існуючі SVG, чітко названі *ілюстраціями*, не чужими фотографіями. Навігація, Studio, sitemap і reciprocal hreflang беруть галерею зі спільних інвентарів. Очікування: 92 публічні маршрути замість 88, 121 згенерована сторінка замість 117.
2. **Зайві переходи:** Owner Studio у VSP-режимі тепер дозволяє абсолютний URL тільки поточного `siteConfig.origin`. Внутрішні `/kontakt/` і `/galerie/` працюють. Existing full-build checks далі забороняють клікабельні URL старого knaba.de в customer HTML.
3. **Партнери:** не дубльовані; 5 зображень, як у PR #71. Прибрані user-visible повідомлення про походження списку та дату перевірки.
4. **QA security blocker:** виправлена суперечність `verify-build.mjs`: раніше заборонялись усі remote img, хоча п'ять партнерських логотипів завантажувалися з `impro.usercontent.one`. Тепер зовнішні scripts і будь-які інші image-source заборонені; перевіряються порядок IDs та конкретна CDN-папка. Звіт більш не стверджує `NONE_IN_HTML`.
5. **Юридичні сторінки:** DE/RU Impressum — відомості про права на зображення й позначення, без вигаданих сертифікатів. Прибрана user-visible «дата звірки джерела». DE/RU Datenschutz — додано факт передавання запитів CDN при відображенні логотипів, навіть без кліку. Потрібен owner/legal review.
6. **Постійне правило** доповнено у `corporate-site/AGENTS.md`: офіційний сайт лише як джерело фактів, відсутність дублювання, захист посилань, документи на ліцензії, чотиримовний QA.

## Не дороблено / релізні блокери
- Фотографії з оригінальної галереї не скопійовані: їхній статус прав не підтверджено. Якщо власник надасть правомірні файли, підмінити тільки локальні `/illustrations/` через чинні механізми Studio/media, без ще одного media CMS. Правовласники партнерських логотипів та договір/обробка IP в image CDN також вимагають перевірки перед зовнішнім релізом.
- Реальні вакансії/посадові ставки не републіковані через неоднозначну актуальність на офіційній сторінці. Посилання на Facebook вакансію й Google Maps не скопійовані в клієнтську навігацію: користувач не має покидати шаблон без окремої потреби.
- Full Node build/check/test/verify:build, image-CDN HTTP, preview/live/browser/device QA й незалежний review на точному commit SHA **NOT_RUN** в обмеженому інтеграційному середовищі; попередні PR PASS не доводять готовності цієї гілки.
- Точний staging VPS release SHA і rollback backup не прочитані; preview `kneba.vsp.rest` не відкрився через доступний вебчитач. Opera Connector повернув Browser not connected. Не називати будь-який source-only контроль live PASS.
- Після доступної Node24 збірки: `cd corporate-site && npm ci && npm run check && npm test && npm run build && npm run verify:build`. Окремо перевірка `KNABA_RELEASE_MODE=vsp`, всі 4 мови, 320/390/768/1440, privacy/CDN/CSP, фокус/клавіатура, Studio href validation, sitemap 92 і реальний smoke. До підтвердження оператором ніякого main/production merge/deploy.
