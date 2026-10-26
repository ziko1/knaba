# KNABA — SEO / змістовність головної сторінки / Work-reconciliation, 26.10.2026

## Межі й перевірений вихідний стан
- Тільки `ziko1/knaba`, активний публічний тестовий сайт `https://kneba.vsp.rest/`; офіційний `knaba.de` і `main` не змінюються.
- Source base: `fix/knaba-cloud-ux-audit-20261026` @ `0721d55c6673b1e4324c68daf41a82b4a7a7ee2e`. VPS `/srv/knaba/vps/current` вказував на реліз того самого SHA під час intake. GitHub PR89 (уже чинні planner/hydration/UX/security), PR93 (практичні guide/Finder/Assistant), PR94 (5 профілів партнерів та явно марковані **вигадані** приклади) звірено до зміни. Жоден із цих блоків не створюється повторно.
- Чинний інтерфейс уже має hero, carousel, 6 карток, договірні додаткові роботи, процес, компанію, партнерів, відгуки, FAQ і контакт. **Підтверджена прогалина:** немає контекстного блока-переходу до наявних спеціалізованих порадників із головної поза глобальним меню.
- KNABA позиціонується на дев-сайті як BauService / Baureinigung. Історичні офісні сторінки раніше навмисно виведено з публічного маркетингу. Широкі види Reinigung з офіційного `knaba.de` **не додаються** без окремого узгодження позиціювання замовником. Не вигадуються кейси, ліцензії, ціни, відгуки чи сертифікати.

## Зовнішній і технічний SEO-аудит (26.10)
- Firecrawl live scrape (HTML, markdown, links): `/` та офіційний `https://www.knaba.de/`; перевірено head/canonical/hreflang/robots/JSON-LD та фактичний набір послуг.
- Незалежний Python HTTP+HTMLParser crawler через VPS: **100/100 індексованих sitemap URL повернули HTTP 200**, 0 дубльованих title, 0 дубльованих meta description, усі canonical єдиний self URL, усі HTML містять lang, один H1, 4+ hreflang, коректний JSON-LD. `/robots.txt` HTTP 200, sitemap вказаний.
- На 4 головних є 7 `alt=""` для декоративних ілюстрацій каруселі; підписи до послуг присутні. Це **не** підтверджена accessibility/SEO-помилка: свідомо залишено, щоб не дублювати текст для screen readers.
- Sitemap навмисно не включає юридичні/noindex та приватні URL: їх не можна трактувати як биті посилання через відсутність у sitemap. Повноцінний external broken-link crawl, CWV, мобільний Lighthouse, Search Console impressions/queries/clicks, позиції, crawl budget, індексація Google, backlink profile і конверсії **не виміряні**.

## Реалізація — мінімальна і без дублювання
- `src/components/HomeGuides.astro`: окрема семантична секція з темним контрастним оформленням, DE/EN/UK/RU оригінальним вступом, доступними `h2`, `nav`, `ol`, видимим keyboard focus, адаптивним grid. Жодного клієнтського JavaScript, зовнішніх зображень чи додаткових пакетів.
- Посилання напряму на чинні `baureinigung-phasen`, `baureinigung-kosten-planen`, `bauuebergabe-checkliste`; загальний індекс `ratgeber/`. Назви/описи цільових статей беремо із canonical `construction-guides`; missing slug руйнує build раніше за реліз. Без нових статей-дублікатів і повторних CTA до каталогу.
- `ConstructionHome.astro`: підключено **один** блок після процесу, перед компанією/партнерами. Усі старі секції, CTA, телефони й анкети збережені.
- `tests/verify-build.mjs`: 4-мовні assertions про єдину секцію, три коректні тематичні посилання. Інші build gates залишені.
- CSS виконується як невеликий inline critical homepage-only стиль у 4 HTML, тому спільний глобальний CSS budget `<40 KiB gzip` не збільшується; це не глобальний CSS і не залежність. HTML-size і Web Vitals не плутати.

## Свіжі перевірки у відокремленому checkout
- Node `24.22.1`, пакети з кешованої **ідентичної** lockfile.
- `KNABA_RELEASE_MODE=vsp npm run check` → **PASS**, Astro/Vue/Svelte 0 errors/0 warnings; 4 давні TS hints.
- `KNABA_RELEASE_MODE=vsp npm test` → **252/252 Vitest** + **32/32, 27/27, 9/9 Node**, 320 test cases total.
- `KNABA_RELEASE_MODE=vsp npm run build` → **PASS**, 130 HTML, зібраний artifact SHA256 `9fd5ae7977cd2f6e61f1cad753d16e5cbd075c2620c17de4012488e19ceac658`.
- Перша `verify:build` закономірно відхилила застарілий source catalog: `SOURCE_CATALOG_STALE_RUN_EXTRACT`. Після `npm run i18n:extract` штатно оновлено `i18n/source-de.json`; 28 German source routes, 1006 units; повторна `npm run verify:build` → **PASS**. Всі 4 мовні homepage guide paths, internal links, headings, phone/CTA, localization/icon/metadata gates PASS.
- `KNABA_RELEASE_MODE=vsp npm run test:vps` → **41/41 PASS**. Разом **361** автоматичних тестів (252+68+41).
- `cssGzip=40949B`, ліміт `<40960B` збережений (**11B** запас); allEmittedJsGzip потрібно брати тільки з точного JSON звіту, не з estimated transfer.
- Ці результати привʼязані до вихідного дерева локального checkout; кодова гілка та PR — окрема publish-перевірка. Віддалена робоча сесія ChatGPT Work напряму недоступна, але її перевірні GitHub commits/PR/deployment receipts звірено. Opera Connector `list_tabs` повернув `Browser not connected`; приватні Work tabs/чернетки/невідправлені коміти відновити через цей інтерфейс неможливо.

## Чесні незакриті gates
- **Код/UX:** фізичний Android/iOS, реальний browser screenshot на новому артефакті, 200% zoom, screen reader, поле CWV, Search Console, незалежний людський SEO/content review — не виконані.
- **Бізнес:** реальні owner-заявки, UAT Studio/CRM/ERP/Voice, затвердження юридичних/партнерських тверджень, справжні відгуки, права на кейси/фото — окремо.
- **SEO-пріоритети:** погодити чи `kneba.vsp.rest` має індексуватися паралельно з офіційним `knaba.de` (перед перенесенням — cross-domain canonical/redirect strategy без ризику зміни офіційного DNS); додати перевірене raster OG preview; підключити дозволену GSC аналітику і виміряти search clicks/CTR та переходи до заявки. Не купувати backlinks, не генерувати doorway pages/масові однотипні тексти.
- Без продакшн-merge, офіційного DNS, оплат, видалень або запуску зовнішніх AI/WhatsApp провайдерів. Тестове розгортання — лише за незалежних release gates: source remote SHA, build/check, current CAS, обидва locks, verified backup+restore, storage doctor, immutable rollback, після cutover actual HTTP + HTML checks.

## Контроль продовження роботи
Відкривши цей checkpoint, звірити `git rev-parse HEAD`, `git status`, поточний GitHub PR/head, точний `/srv/knaba/vps/current`; не запускати повторний rollout, якщо release змінився, поки нові зміни не інтегровані. Наступним незалежним етапом — browser QA нового staged artifact і підключення реального вимірювання SEO/конверсій після згоди власника. 
