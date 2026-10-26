# KNABA — SEO / змістовність головної сторінки / Work-reconciliation, 26.10.2026

## Межі й перевірений вихідний стан
- Тільки `ziko1/knaba`, активний публічний тестовий сайт `https://kneba.vsp.rest/`; офіційний `knaba.de` і `main` не змінюються.
- Source base: `fix/knaba-cloud-ux-audit-20261026` @ `0721d55c6673b1e4324c68daf41a82b4a7a7ee2e`. VPS `/srv/knaba/vps/current` вказував на реліз того самого SHA під час intake. GitHub PR89 (уже чинні planner/hydration/UX/security), PR93 (практичні guide/Finder/Assistant), PR94 (5 профілів партнерів та явно марковані **вигадані** приклади) звірено до зміни. Жоден із цих блоків не створюється повторно.
- Чинний інтерфейс уже має hero, carousel, 6 карток, договірні додаткові роботи, процес, компанію, партнерів, відгуки, FAQ і контакт. **Підтверджена прогалина:** немає контекстного блока-переходу до наявних спеціалізованих порадників із головної поза глобальним меню.
- KNABA позиціонується на дев-сайті як BauService / Baureinigung. Історичні офісні сторінки раніше навмисно виведено з публічного маркетингу. Широкі види Reinigung з офіційного `knaba.de` **не додаються** без окремого узгодження позиціювання замовником. Не вигадуються кейси, ліцензії, ціни, відгуки чи сертифікати.

## Зовнішній і технічний SEO-аудит (26.10)
- Firecrawl live scrape (HTML, markdown, links): `/` та офіційний `https://www.knaba.de/`; перевірено head/canonical/hreflang/robots/JSON-LD та фактичний набір послуг.
- Незалежний Python HTTP+HTMLParser crawler через VPS: **100/100 публічних URL із sitemap повернули HTTP 200**, 0 дубльованих title, 0 дубльованих meta description, усі canonical єдиний self URL, усі HTML містять lang, один H1, 4+ hreflang, коректний JSON-LD. `/robots.txt` HTTP 200, sitemap вказаний.
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

## Завершальний локальний HTTP-smoke і preflight
- У замкненому `127.0.0.1`-сервері для **того самого** `dist/client` пройшли **16/16** HTTP200: 4 головні + 3 тематичні guide URL ×4 мови; **12/12** тематичних внутрішніх посилань, **4/4** єдині семантичні блоки на головних. Це не browser visual/device acceptance.
- `node vps/doctor.mjs /srv/knaba/vps --strict` лише read-only → `healthy`, `usedPercent=89.78`, `cutoverAllowed=true` на момент перевірки. Цей gate не замінює current-CAS, locks, офіційного дозволу власника, незалежного review, backup+restore та runtime postchecks.
- GitHub Draft PR #98, code+catalog artifact HEAD до цієї документаційної правки `ea1f5866fe2460b9a17e41e34c54081918da8886`; runtime та build не змінено. Стан тестового VPS на момент перевірки — `0721d55c6673b1e4324c68daf41a82b4a7a7ee2e`; нову збірку **не розгорнуто**. Причина: до дозволеного контрольованого тестового перемикання не виконано незалежний code/visual review і root-only state backup/restore з блокуваннями. Не перезаписувати чинний реліз без цих gates.

## Завершено тестове розгортання 17:14 UTC, 26.10.2026

Зберігається **runtime source SHA** `15cfe1e15ec2bb78c0b85ccb59e5221024a9bae8` (два Git-коміти PR #98 до цього документального доповнення), `sourceTreeSha=589d3211cd33ebfc2b56ac99a795e8fa46f0ce05`. GitHub `main` та офіційний `knaba.de` незмінні.

### Захисні перевірки
- Тестова ціль: `https://kneba.vsp.rest`. Два чинні release locks, порівняння expected-current SHA `0721d55...`, перевірка GitHub remote head, storage gate і схема БД перед перемиканням. Код `vps/`, `drizzle/`, `package.json` побайтово не змінені; 6/6 SHA міграцій збігаються, `PRAGMA integrity_check=ok`; нуль `studio_pages` overlay для чотирьох головних.
- Звільнено **3 510 206 464 B** шляхом вилучення тільки п'яти старих дубльованих `node_modules` після перевірки однакових lockfile, власності, змонтованих шляхів, активних процесів і відкритих дескрипторів. Усі Git-дерева, журнали, код, релізи, бази, резервні копії й активний робочий кеш збережено. Storage preflight після цього `healthy`, `89.336%`; не послаблювали правило порога 90%.
- Чистий checkout GitHub `15cfe1e`: Node24.22.1, Astro/Vue/Svelte check 0 errors/0 warnings; 252 Vitest + 68 Node + 41 VPS = **361/361 PASS**, build+verify/i18n PASS, 130 HTML, CSS40 949B gzip, JS194 050B gzip. Збірка має `artifactSha256=63c53820a2f71bf3bdbb6c49e793e4f88b3734e5846014d08fa81e64d9c9dcdc`. SHA відрізняється від попередньої збірки через мінливі Astro island UID у 19 HTML файлах; перевірено, що JS/CSS і всі інші 227(?) шляхи набору dist не мають двох версій. Контрольна сума чистого артефакту **незалежно обчислена** по 228 клієнтських файлах.
- Онлайн `manage.mjs backup` існуючого SQLite: `/srv/knaba/vps/state/backups/knaba-2026-10-26T17-14-01-984Z.sqlite`, **SHA256** `7549611309deb63cec95f56796aac7b7cd28863544ffc9a89e885114c0a3455d`, **233472 B**. Окрема перевірка same-host restore → `PRAGMA integrity_check=ok`, усі шість ledger migrations. **Off-host restore NOT_RUN**. Ніяких schema migrations чи записів клієнтам не виконували.
- Атомарно активовано `/srv/knaba/vps/releases/15cfe1e15ec2bb78c0b85ccb59e5221024a9bae8`; Docker Compose force-recreate лише `web`. Контейнер став healthy; **22/22** HTTP перевірки (DE/EN/UK/RU головні, 12 цільових порадників, 4 partner pages, health/ready), на чотирьох головних HTML **байти в байти** дорівнює обраній збірці, один новий блок у кожній. `readyz=200`, health200. Попередній реліз `0721d55...` збережений для rollback; code rollback не знадобився.
- Справжній root-owned receipt: `/srv/knaba/vps/evidence/seo-home-15cfe1e15ec2/deployment-receipt.json`. Обмежена browser/physical-device/zoom/screen-reader та field CWV приймальна перевірка нового релізу **НЕ виконувалась**. Після cutover спроба додаткового незалежного crawler через SentinelX повернула tool-internal error, а web fetch не зміг повторно відкрити host; цей інструментальний блокер **не прирівнюється** до дефекту сайту або PASS повторного crawler. Основний прямий HTTPS smoke виконаний самим захищеним release script успішно.

### Пошукові джерела
- GSC Wizard `list_sites` відповів `payment_required/subscription_required`: жодних Search Console показників через це підключення; платну підписку не активовано. Поточні clicks/impressions/CTR/Google index, CrUX/Lighthouse, конверсії й органічний ROI — **UNKNOWN/NOT_RUN**.
- Збережено самостійне позиціювання корпоративного тестового домену, без автоматичного переписування canonical на офіційний домен. Перед будь-яким перенесенням `knaba.de` потрібні owner/DNS approval, URL mapping, verified backups, 301 redirects і перевірений Search Console як описано в рекомендаціях Google: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes.

Стан: **DEV TEST DOMAIN DEPLOYED**, Draft PR, не merge в main і не production acceptance. Повноцінний клієнтський приймальний реліз залежить від власника, легальності медіа, реальних заявок/CRM, апаратного тестування, Security/Accessibility/CWV, зовнішнього backup-restore й вирішення 95 мов.
