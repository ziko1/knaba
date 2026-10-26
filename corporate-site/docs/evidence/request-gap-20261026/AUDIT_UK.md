# KNABA: запити → код → сайт, 26.10.2026

## Scope і джерела
Користувач: «зістав памʼять чату і всі запити і репозиторій … з наявним на сайті … додай … окремо згенеруй і додай відгуки … щоб не було порожнім».
Проєкт тільки ziko1/knaba / kneba.vsp.rest. Доступна памʼять і два цільові Personal Context пошуки за 23–26.10; це не повний експорт усіх чатів. Вересневий KNABA Cleaning/Android/Railway, перейменований AVENQO, не переносився в цей scope. Старі звіти перевірялися за кодом і live.

Baseline API 26.10: GET /api/reviews → {reviews:[],total:0}. Хмарний Chrome фактично показав порожній блок українською. Opera Connector UNAVAILABLE. Сторінка містить 8 слайдів, 6 карток01–06, додаткові роботи, процес, компанію, 5 партнерів, відгуки, FAQ і фінальну заявку. PR88 додає порядок, вже присутній у PR89 та current release, тому не cherry-picked.

Початкове дослідження PR89 2ad00f69af447c76952f772292672165b1029b3d. Після виявлення фактичного live cecb321ac41106c7a4f6da2d4a98308508852b38 власний patch перенесений на нього: збережено поточні planner/enquiry/Assistant виправлення; не відкотили їх паралельною PR89. API/migrations/DB/config не змінюються.

## Матриця вимог
| ID | Джерело / вимога | Поточний стан / доказ |
|---|---|---|
| MEM-01 | 26.10: зіставити історію, код і live | Виконано в межах доступної історії, таблиця нижче; не стверджуємо повноту недоступних чатів |
| HOME-01 | 25–26.10: 01–03 послуги,04 планер,05 допомога,06 розчищення; без /KnaBa | Уже в construction-grid.ts, ConstructionHome і live; збережено |
| HOME-02 | 26.10: повернути блоки та порядок | Уже в current; PR88 не містить додаткових пропущених секцій |
| HOME-03 | 24–25.10: яскраві 2D, бренд, мови, компактний Assistant | Уже в ServiceCarousel,ConstructionBrand,Layout,KnabaAssistant; збережено |
| NAV-01 | 26.10: без дубльованих телефонів/кнопок | Чинний built verifier: один tel на кожній сторінці; повторні CTA не повернуті |
| PARTNER-01 | 24.10 21:16Z: блок і сторінки партнерів з описами | Блок був, описів/профілів не було. Додано /partner/×4,5 профілів з anchors,20 локалізованих описів; переходи з чинних логотипів у тому ж вікні |
| REVIEW-01 | 24.10: відгуки та справжня можливість додавання | Чинні PublicReviews,API,moderation,consent,CAPTCHA; не переписані |
| REVIEW-02 | Поточний: згенерувати природні відгуки,не порожній блок | 3 приклади×4 мови. Помітна вигаданість кожної картки + загальне пояснення. Без імен,дат,рейтингу,Review schema чи записів БД. Лише після успішного порожнього API; справжні відгуки витісняють приклади,помилки не маскуються |
| GALLERY-01 | 25–26.10: галерея/змістовні ілюстрації | /galerie/×4 уже є; реальні фото/кейси та права залишаються owner input, не вигадуються |
| CONTENT-01 | 24–25.10: Bauhelfer,клінінг,B2B,буріння/спецроботи,FAQ,поради | Уже в construction-offers,guidance,faq,guides. Поточні офіси не повернуті як напрям |
| SEO-01 | 24–26.10: повʼязані сторінки/SEO/мови | Нові partner routes внесені в Studio,sitemap,hreflang,breadcrumbs; source catalogue оновлюється після build; польові CWV/Google index не доведені |
| STUDIO-01 | 24.10: повний AI+ручний редактор | Studio частково є. Повний block composer,upload,AI provider потрібні окремим задачам; credentials/quota не підтверджені |
| VOICE-01 | 24–25.10: AI-розмови,дзвінки з сайта/WhatsApp,оператор | Rule-based чат і browser dictation/TTS є; повноцінні голосові provider calls/operator transfer НЕ прийняті. Потрібні авторизація/канал/квота/вартість і E2E,не замінювати фальшивою кнопкою |
| ERP-01 | 24.10: єдиний ERP,ролі/кабінети,notifications | Модулі/окремі PR існують; інтегровані PostgreSQL/provider/owner E2E НЕ доведені. Реальні листи/повідомлення не надсилались |
| PAY-01 | 24.10: оплата та функціонал основного сайта | Провайдер,merchant account,умови й реальний платіж НЕ підтверджені; платний сервіс не активувався |
| I18N-01 | 24–26.10: топмови/99 target | 4 опубліковані мови,95 pending. Не створено фальшивих перекладів або hreflang |
| RELEASE-01 | 26.10: актуальні зміни на поточному домені | Ціль kneba.vsp.rest, source persistence+QA+CAS+storage+backup+rollback+live recheck. main/knaba.de не змінювати |

## Команда й приймання
Runtime root: coordinator/review examples/integration/QA. Runtime requirements_audit: read-only requirement gap audit, partner implementation, незалежний review коду прикладів. Root окремо прочитав і перевірив партнерські зміни. Team plan — декларативний preset; фактичних виконавців лише двоє. Зовнішні платні AI dispatch не запускались; баланс невідомий.

Acceptance: локалізовані приклади лише порожньому стану,жодних підроблених published records; усі20 partner links ведуть на5 існуючих anchors чотирма мовами; sitemap/Studio/lang parity; повні repository gates; independent review; deployment і live окремими receipts.

## Джерела описів партнерів
- https://www.goldbeck.de/unternehmen
- https://www.bonava.de/ueber-uns
- https://www.stromkreis.de/ueber-uns/
- https://www.gewobag.de/ueber-uns/ueber-die-gewobag/
- HIT: https://www.hit-immobilien.de/wp-content/uploads/2024/03/20240308-hit.-Unternehmensgruppe-Pressemitteilung-Insolvenzantraege-HP.pdf
HIT має історичну заяву про insolvency2024,тому опис нейтральний/історичний без заяви про активний поточний контракт. Нових партнерів не додано,використано наявні5 логотипів. Права/чинність відносин потребують owner sign-off. knaba.de не відкрився через research tool цього запуску; нові непідтверджені послуги не додані.

## QA і залишок
Точні результати та release receipt доповнюються після завершення gates. Перший verifier виявив CSS41077B>40960B: прибрано невикористані стилі старого порожнього блоку,ліміт не збільшували. Початковий studio-pages test92 відхилив96 маршрутів; очікування оновлене разом з assertions для нових реальних маршрутів. Перехід base вимагає повторної перевірки,старі результати не приписуються новому SHA.

### Final source validation before publication
After moving patch to actual current cecb321: Node24 check0 errors/0 warnings;216 Vitest,28+27+9 Node PASS; VPS24/24 PASS. VSP build126HTML,96 sitemap/Studio paths; i18n27 DE routes/963units; verifier link/CTA/phone/icon/locale gates PASS. CSS40959B gzip within40960B, no budget change. Local real server8/8 new/affected routes: oneH1,correct lang,unique IDs,one phone,all5 partner targets. Runtime artifact digest7698331081e7a193e6bf23feb566ab9a8979c5c1033afae5056c1ead0c8bfc7c. Local browser suite BLOCKED: installed Playwright has no engine executables. Cloud Chrome baseline works; post-publication checks separate.
Unused QA dependencies only: two node_modules under /tmp/knaba-pr82-mobile-ux-20261026 and /tmp/knaba-pr83-exact-verify-20261026 removed after checking process cwd/open files/container mounts and retained lockfiles. Reclaimed1392844800B; strict VPS doctor then healthy,cutoverAllowed=true,89.95% used. No source/data/backup removal.
