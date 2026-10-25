# Незалежна перевірка GUIDE-04

База `60361c9385dec42c46b942fc093357f7d31b0a13`, робочий кандидат. Автор перевірки `/root/guide_qa`; source-файли не змінював, build/deploy не запускав.

## RED: початковий стан

25.10.2026 12:33:55 UTC, реальні HTTPS GET без заявки:

- `/ratgeber/bauendreinigung-vorbereiten/`: 200, generic migration placeholder, noindex, заголовок зі старим service marker S08.
- `/uk/ratgeber/bauendreinigung-vorbereiten/`: 404.
- Доказ: `baseline.json`.

## Перевірка джерела

- Всі чотири статті відрізняються за користю: підготовка об’єкта, етапи, зіставлення обсягу/витрат, післяклінінговий обхід.
- 4 розділи та 5 пунктів чекліста на статтю, усі DE/EN/UK/RU значення непорожні. Орієнтовно 391–486 слів на локалізовану статтю разом із metadata/headings; це опис обсягу, не SEO-поріг.
- Немає вигаданих цін, кейсів, кваліфікацій чи відгуків. Небезпечні/невідомі речовини передаються на окреме професійне оцінювання; техніки поводження з ними не описуються. Вивезення погоджується окремо; здача клінінгу не видається за приймання будівельних робіт.
- Компонент SSR без додаткового клієнтського JS, fail-closed перевірка core service, allowlisted CTA, локалізовані навігація та кнопки. JSON-LD проходить наявне екранування Layout. Чотири нові картки зберігають п’ять швидких розділів на індексі.
- Нова lightweight route metadata запобігає імпорту повних статей у клієнтський Studio. DE/RU маршрути об’єднують старі й нові slugs без дублів; EN/UK публікують лише реально перекладені статті.

## Знайдений integration edge: Studio → Article

До додаткового виправлення `vps/render-page.mjs` і `seo.mjs` оновлюють видимий H1 та meta-description, але зберігають старі Article.headline/description. Відтворено локально на справжній `renderPublishedPage` функції з дозволеним published row, без live owner/БД:

| Поле | Після валідного редагування |
|---|---|
| Видимий H1 | Updated heading |
| Meta description | Updated description |
| Article.headline | Old heading |
| Article.description | Old description |

Передано координатору для вузького виправлення або явного статусу обмеження. Перевірка нового renderer буде окремо після інтеграції.

## Запланований браузерний scope

`browser-guides.cjs`: 16 article +4 index pages, schema/canonical/hreflang/H1, 4 CTA→локалізована форма без відправлення, 4 перемикання мови, 4 keyboard anchor activations, 24 width cases (320/768/1440 ×4 locales ×index/article) +4 випадки 200% root text. Артефакт хешується до/після з лексичним сортуванням рядків шляхів. POST блоковано. Physical device, screen reader, human CAPTCHA, реальне отримання заявки та owner acceptance не підміняються цими перевірками.

## GREEN: Studio → Article виправлення

Координатор додав вузьке узгодження вже наявного canonical Article вузла з фінальним видимим H1/meta-description. Незалежний source review PASS: JSON-LD серіалізується з екрануванням `<`; URL, publisher, language та інші graph nodes не змінюються. Не застосовується до draft/invalid row, невідомих HTML-вузлів чи чужих Article URL. Порожній/неоднозначний H1 або malformed JSON залишають schema без змін. Публічний title не підмінює видимий headline. Повторне застосування ідемпотентне.

Незалежно виконано `node --test corporate-site/vps/render-article.test.mjs`: 4/4 PASS. Це working-tree source перевірка до фінального commit/build; повний точний SHA має прив’язати координатор. Реальну owner-authenticated публікацію на живому сайті цей unit/integration fixture не доводить.

## Генерація без застарілих артефактів

Після знайденої координатором помилки послідовних preview→VSP builds переглянуто `scripts/clean-build.mjs` та prefix package build. Фіксовані URL відносно самого script видаляють тільки generated `.astro-static/` та `dist/`; немає довільного cwd чи env/path interpolation. Незалежний fixture запускав байт-ідентичний скрипт з `/tmp` і підтвердив видалення тільки двох generated trees зі збереженням `.wrangler/state`, `src` і `node_modules` sentinels. Repo build/dist QA-агент не змінював. Scope review PASS; повторну послідовну збірку виконує координатор.

## Браузер кандидата 5c8b23b

UTC `2026-10-25T12:51:14.641Z`, source `5c8b23bb90676662971183a3ff141bd40c66a3c4`, immutable client tree `0e13a38b701856bb83f6e5d912054dd7b3fb8455ab29727c21e31d048ed1f5ab` (177 files). Before/after hashes identical.

PASS: 20 HTML pages (16 articles +4 indexes), 4 localized article→contact flows to prefilled step3, 4 actual language changes DE→EN→UK→RU→DE preserving article, 4 keyboard anchor activations, 28 reflow/text cases. Zero failures, JS page errors, horizontal overflow or POST attempts. All articles have oneH1, publicindex, selfcanonical,5hreflang, validcontents,4sections,5checklistitems,3relatedarticles; indexes have4newcards and5retainedquickguide sections.

Оглянуто article-uk-320.png і guide-index-de-1440.png: композиція відповідає сайту, текст/посилання/картки не обрізані. Невелике зауваження: ordered-list marker дублює вже пронумерований title у змісті; передано координатору. Це не блокувало сценарії. Фізичні пристрої/скринридер/реальне отримання заявки не перевірені. Після паралельного visual-card deployment потрібна нова інтегрована збірка та цільова регресія; цей результат не слід приписувати новому SHA без перевірки.

## Фінальний інтегрований кандидат із паралельним contrast hotfix

UTC `2026-10-25T12:55:26.322Z`; exact source `5b5261e56ad4ae5122495cf3e9b0f87ea7f2d70c`; before/after client tree `855a7c938166f9e4c1507641ad9c59392b81ebe4552680e80c451f81518ef95d`, 177 files.

PASS: 20 article/index pages, 4 contact flows to prefilled step3 without sending, 4 language switches, 4 keyboard anchor activations, 28 reflow/text cases, plus 16 homepage checks at320/390/768/1280 acrossfourlocales. No horizontal overflow, JS page errors, failures or POST attempts. Contents numbering is no longer duplicated; native ordered list retained. Existing parallel contrast hotfix preserved: six cards, lightgradient on finalcard, correct locale planner link.

Оглянуто browser-final-card-uk-390.png і browser-final-guide-index-de-1440.png. Контраст тексту щодо трьох кольорів gradient: заголовок мінімум11.26:1, основний текст6.17:1, ordinal5.59:1, CTA5.85:1; це вузький розрахунок, не повна WCAG-сертифікація. У лабораторному Chromium декоративний clipboard emoji показаний missing-glyph прямокутником; поточний підхід використовував emoji раніше, фактичне відтворення на фізичному телефоні UNKNOWN. Функціональних блокерів нових статей не виявлено.

## Реальна перевірка після deployment

UTC `2026-10-25T13:01:41.035Z`, live source `5b5261e56ad4ae5122495cf3e9b0f87ea7f2d70c` підтверджено symlink guard до й після браузера. Cached VPS Chromium, strictTLS, readonly container1CPU/768MiB/160PIDs, тимчасові tmpfs для профілю; без mount секретів/БД, container видалено після завершення.

PASS: 8 наскрізних перевірок (4 мови ×320/390): головна зі збереженою контрастною карткою → індекс із4статтями → стаття з4розділами/5чеклістпунктами → CTA → локалізований вибраний напрям на кроці3 заявки. 4 перемикання мови зберігають адресу статті. Всі публічні сторінки200/index, одинH1, без переповнення абоJS pageerrors; нова нумерація змісту без дублювання. 0 спробPOST, справжніх заявок не надіслано. Доказ browser-live.json.

Спочатку локальний Chromium не мав доступу до live HTTPS (ERR_EMPTY_RESPONSE), тому використано наявний кешований VPS browser. У cached image немає headless-shell, використано наявний повний Chromium; readonly profile потребував bounded tmpfs /home/node. Ці два launch failures були обмеженнями QA-середовища до виконання тестів, не дефектами сайту. Final live run завершився0failures. HumanCAPTCHA/owner acceptance/справжня доставка заявки/фізичний пристрій лишаються NOT_RUN.
