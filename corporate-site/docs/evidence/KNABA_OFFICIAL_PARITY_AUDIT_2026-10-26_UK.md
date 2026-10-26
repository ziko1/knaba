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

## Фактична read-only перевірка VPS 26.10.2026 (SentinelX, host vsp)
- Підключення наявне; жодних root/sudo чи службових мутацій не виконано.
- `df -h /`: 197G total, 171G used, 17G free, 92% usage. Масове перевстановлення залежностей або другий довготривалий build без перевірки ресурсів не запускали.
- Поточний preview symlink: `/srv/knaba/vps/current -> releases/7f6bba5e1108ea78afbe687e276b74c6fc6f37f2` (це **ім'я каталогу релізу**, не доказ вихідного GitHub SHA). Директорія самого релізу непрочитувана для агента, тому точний artifact hash не верифіковано; sudo escalation заборонена в межах аудиту.
- HTTPS: `/`, `/en/`, `/uk/`, `/ru/` повертають **200**, а `/galerie/` повертає **404**.
- HTML кожної з чотирьох живих головних сторінок містить **0** входжень `data-partner-id`, які має нова `PartnersSection`. Це не доводить кількість старих логотипів — лише відсутність нової розмітки.
- Українська live-сторінка `/uk/`: одне входження `Переглянути партнерів на knaba.de`, одне `Джерело перевірено`, три текстові входження `https://knaba.de` (не всі є клікабельними посиланнями). Проблему на скриншоті відтворено незалежно від кешу користувача.
- Це докази поточного старого **live** артефакту, НЕ тестування нової гілки PR #73. Deployment після повних релізних перевірок і окремого дозволу; жодного прямого редагування `current` чи nginx.

## PUBLIC-HTTP-RELEASE-GATE-2026-10-26 — evidence after official-parity audit

- Code candidate: `bdac0b4d8ec05c3e099d496db41f1576db013e3a` in the existing Draft PR #73; main/production unchanged. New reusable `npm run verify:live` checks exactly 10 real read-only HTTPS probes with bounded responses/timeouts, four locales, homepage five-partner order, four new gallery pages, historic-domain links/research notes, /healthz and /readyz. It **does not** claim release SHA, legal image rights, true browser/device or customer READY.
- VPS source-only Node v18.19.1: new verifier **7/7 targeted synthetic tests PASS**, syntax PASS. This is not a replacement for full app Node >=22.23.4 `npm ci/check/test/build/verify:build` and independent review (**NOT_RUN**). GitHub remote exact readback was verified.
- Actual `https://kneba.vsp.rest` returned **9 FAIL, 1 PASS** at 26.10.2026: DE/EN/UK/RU home HTTP200 but 3/5 partners (missing original positions 1 and 2); new gallery routes all 404; four old-site outbound links/old sections, including research notice on UK. /healthz HTTP200; /readyz HTTP503 with explicit body `owner enrollment required`. Server source confirms readiness intentionally requires an existing, enabled owner email/account. Do **not** suppress readiness or impersonate the customer: finish rightsholder-controlled owner enrollment via separately verified invite flow (Draft PR #58) and re-run owner/auth QA.
- **New confirmed pre-release image defect:** all five originally authored partner CDN URLs returned HTTP500 `sharp: ignoreAspectRatio() operation must follow resize`. A minimal correction reorders the existing `resize` and `ignoreAspectRatio` parameters (no asset/brand substitution). Verified final exact GitHub source five assets, HTTPS **5/5 HTTP200**, MIME/signature and intrinsic output dimensions: 149×121 JPEG (2502 B); 150×104 JPEG (2190 B); 149×149 PNG (5481 B); 210×42 PNG (9526 B); 168×51 PNG (7446 B). Existing partner Vitest now prevents a repeat by asserting image transform ordering. Actual Vitest/full build on exact new commit **NOT_RUN**. Publisher/logo usage rights and client-IP transfer to third-party CDN still REQUIRE owner/legal approval.
- VPS disk `/dev/vda1` 197 GB, 171 GB used, 16 GB available (92%) on inspection; avoid unbounded parallel builds and cleanup of unknown data. Opera connector disconnected; Chromium administrator block must not be bypassed; full mobile/visual acceptance BLOCKED until authorized browser/device QA.
- **Promotion = HOLD** while fail-closed live gate, owner enrollment, media legal approval, artifact verification, full Node24 build and independent browser review remain open. No GitHub merge, DNS/main/prod deploy, account changes or payments executed.
