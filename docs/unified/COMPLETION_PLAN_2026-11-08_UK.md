# KNABA DE — фактичний стан і план завершення

## 08.11.2026 — звірка із server integration candidate

Акаунт/password/session settings, guest capability expiry/revoke/current-owner fence, vehicle trips і Lead Agent перенесено на чинну F2/F4 базу. [Scope, докази та невиконані gates](SERVER_INTEGRATION_2026-11-08_UK.md). Нижчі попередні оцінки лишаються історичними; inbox pagination/display/request conversion, F3, повний template engine і live/device/provider acceptance не завершені.

Дата: 08.11.2026, Europe/Berlin. Проєкт: `ziko1/knaba`. Загальний статус: **NOT_READY_FOR_CLIENT_DELIVERY**. Це актуальне доповнення до `MASTER_ROADMAP.md`, а не заміна специфікації чи історичних доказів.

## 1. Висновок аудиту

KNABA вже має значний робочий код: корпоративний сайт, захищені кабінети, CMS, заявки й переписку, ERP з бізнес-командами, складом, табелями, кошторисами, виплатами та звітами; нативні Android/iOS джерела. Однак це ще не одна прийнята компанією система. Наявність модулів, тестового APK або успішної збірки не доводить наскрізну роботу на сервері та телефонах.

Найважливіші розриви: окремі identity сайту й ERP, незавершена інтеграція заявок/асистента, відсутній повний механізм шаблонів сайту, непідтверджені живі зовнішні канали, iOS distribution і фізичні GPS/offline випробування. Низка старих пунктів плану вже реалізована в коді; повторна реалізація таких пунктів лише створить дублікати.

Цей запуск продовжує реалізацію: безпечне тестове наповнення ERP; цілісна публікація Studio; надійне відновлення Android-команди; відновлення актуальних контактів/favicon; інтеграція нових заявок до ERP через чергу. Повні результати й точний кандидат — у [verification.json](evidence/completion-20261108/verification.json).

## Свіжі перевірки завершеного інкременту

Код кандидата: `bc0ffd1c6f7a3098d5420074de8f349524c7dcae`. Подальша публікація evidence/documents не змінює перевірений runtime.

| Перевірка | Фактичний результат | Межа доказу |
|---|---|---|
| Сайт | 525 Vitest +86 Node +163 VPS HTTP/SQLite: PASS | Локальний синтетичний backend; browser/device UAT не виконано |
| Статична збірка |160 сторінок; metadata/links/i18n/icons: PASS | Artifact `a5808bbd52f82ca5497f2f7e24afe60d0b71b6cc569b5c71f8f8d42eb3ad8594`, не production deployment |
| CSS/JS |40 930 /225 182 байти gzip; обидва чинні ліміти збережено | Це сумарні build bytes, не польові Web Vitals. JS після дедуплікації ключів перекладів зменшено на952 байти |
| ERP |Сукупно2 521 випадок підтверджено | Реальний PG:2443 PASS +1 застарілий fixture FAIL; після виправлення лише тесту17/17 PASS; ще77 helper cases локально. Це кілька запусків, а не один повністю зелений запуск нового SHA |
| Новий міст |4/4 SQLite→PostgreSQL regression PASS | Injected transport, а не live HTTPS; source credentials/ACTIVE config і дозвіл на передачу ще потрібні |
| Android0.4.1 |Збірка/підпис,21 Robolectric +74 transport assertions: PASS | Debug evaluation package; фізичний пристрій/live ERP/підпис власника не підтверджено |
| Сумісність БД |13 попередніх site SQL міграцій байт-ідентичні;0013 additive | Старий runtime не відкриє новий ledger; потрібен forward fix або окремо погоджений restore/reconciliation |
| Release gate |BLOCKED очікувано | Єдина identity, template manager, legal/provider/device/browser/restore/customer gates не закриті |

Android тестовий файл передано власнику в чаті; [інструкція](../mobile/TEST_ANDROID_0.4.1_UK.md). Для відтворення перевірок — [verification.json](evidence/completion-20261108/verification.json), журнали, source manifests, незалежні reviews і SHA256SUMS поруч. Усі72 нормативні AC та18 TPL не перепозначені як прийняті частковими перевірками.

## 2. Які джерела зіставлено

| Джерело | Перевірений стан | Значення |
|---|---|---|
| `main` | `ff748a2e5731e973883344ed28f3e82cf8a3bc06` | Специфікація; не повний runtime |
| PR118, робоче джерело | `045fc00e6e9b5a069416285f619e5cdc202778d8` | Зведені site/ERP/operations |
| PR119, кабінети | `87fdba936bb8ed7d9b8c7493c49895c48395250b` | Історія, пагінація, рольові процеси |
| PR120, Android0.4.0 | `557838e23356cb463f273803099ab6321e675019` | База цього кандидата; містить PR119/118 |
| Серверні контакти | `1292a2a1d1f6b13cf6d3cbea04635749e55f391b` | Телефон власника, реквізити й footer; не було в GitHub-базі |
| Серверний favicon | `fdceea162fee2461c1f3954a1e139be1d3d1f713` | Погоджений знак у PNG/ICO/SVG; відновлено з перевіреного Git bundle |
| Збережені bridge-гілки | `feat/knaba-site-erp-intake-bridge-20261025`, `feat/knaba-erp-lead-bridge-forward-20261026` | Використовуються лише потрібні зміни; старі міграції конфліктують із новими акаунтами |

Серверний bundle містить історію іншого дерева. Його не злитo цілком: вибрано правки контактів/favicon, збережено новіші кабінети й захищений контактний перехід асистента. Історичні журнали не перепозначено як тести нового кандидата.

Read-only звернення з поточного середовища до `knaba.de` отримали HTTP403; з фізичного сервера публічний `/api/public/release` відповів HTTP200, але повернув `stage=prototype`, `erpOrigin=null`, Android/iOS/WhatsApp/Telegram `pending`. Цей endpoint не містить exact release SHA. Це підтверджує доступність окремого endpoint, а не готовність авторизації, ERP чи live-версії кандидата.

## 3. Що є і що ще потрібно

| Напрям | Реалізовано в джерелах | Незавершене / необхідна перевірка |
|---|---|---|
| Корпоративний сайт | Astro, послуги, галерея, форми, metadata, sitemap/robots, маршрути; DE/EN/UK/RU, основні PL/LT сторінки | Повні спеціальні й юридичні PL/LT тексти, актуальний browser/device/a11y acceptance, польові Web Vitals |
| Бренд і контакти | Телефон власника, повні реквізити, Facebook/WhatsApp, PNG/ICO/SVG favicon відновлено з джерел сервера | Новий artifact треба перевірити й дозволено випустити; оновлення іконки пошуковиками не гарантовано |
| Вхід і реєстрація | Password login, захищені сесії, запрошення, заявки на доступ, owner approval, зміна пароля | Справжнє self-service recovery, перевірена пошта/OIDC; єдина identity з ERP; реальні owner/MFA journeys |
| Кабінети | Client, Worker, Partner, Bauleiter, Admin, Owner, ізольована підтримка розробника; запити, статуси, розклад, повідомлення, пагінація | Site-ролі не замінюють повну ERP permission-модель; потрібні спільні scopes і реальні рольові сценарії |
| Studio/CMS | Редактор тексту/SEO/медіа/стилів, чернетки, explicit publish, історія/restore, статті | Stable content IDs; повний template lifecycle. Новий guard не розпізнає перестановку однакових за структурою вузлів |
| Шаблони сайту | Наявний CMS можна розширити; перевірка сумісності контентних правок — передумова | Каталог трьох дизайнів, ZIP import/quarantine, schema, safe renderer, isolated preview, activation/rollback/cleanup — ще не реалізовані як повний сценарій |
| Асистент сайту | Збережені діалоги, capability-доступ, handoff, відповіді власника, пропозиції/рішення, recovery code, deterministic FAQ, browser speech | Генеративний AI і живі голосові дзвінки не підтверджені; expiry/revoke capability, inbox pagination понад100, повна локалізація inbox, ERP bridge |
| CRM та нові заявки | Локальна заявка, аудит і owner CRM; у цьому кандидатові додається атомарний ERP outbox | Явне налаштування company/service/privacy, перевірений транспорт, backfill/видалення між системами; scheduler і live sends не активовані |
| ERP права | Company/site/customer/self scopes, перевірка поточної ролі, MFA/reauth механізми, permission registry | Єдина сайтова identity, реальна рольова матриця через HTTP/UI, актуальна ревокація та операторське приймання |
| Кошториси й договори | Versioned quotes, price/tax snapshots, acceptance, допроботи, контроль повторів | Погоджені компанією ставки/податки/шаблони, повний UI→API→DB acceptance |
| Замовлення і бригади | Reservations, crew offers, decline/expire, `order.link_site`, readiness, callback і переходи | Старий D07 backlog оновлюється; свіжі SQL race/вікна/календарі й реальні дані бригад |
| Завдання та якість | Locations, tasks/worklogs, submission, окреме QC, defects/rework, recurring/calendar | Наскрізний процес на одному кандидатові, конфлікти, права і приймання робіт |
| Час, дорога | WORK/TRIP/BREAK/AWAY, START/END, timesheet review, corrections, trip segments | Фізичний offline/reconnect, DST, віддалене END, часові конфлікти між інтерфейсами |
| GPS/offline | Native companion, encrypted outbox, leases, geofence/state logic | Дозволи Android/iOS, OEM kill/reboot, приватні паузи, 72h/7day сценарії, польові пороги та approved privacy |
| Зарплати й виплати | Gross preview, net-import/платіжні записи, approval/receipt/dispute, accounting export | Погоджені ставки/імпорт, реальний employee receipt, concurrency; автоматичні банківські виплати не активовані |
| Склад/закупівлі | Reserve/transit/receipt/usage/return, часткові отримання, одиниці, cutoff | AC48–52 з реальною SQL конкуренцією та повним UI; звірка фактичних залишків компанії |
| Фото й файли | Private uploads, ACL, MIME/limits, scanner/redaction/EXIF/client copy | Реальна конфігурація сховища/сканера, device upload, права й approved-report journey |
| Звіти | DE PDF/CSV/XLSX, immutable versions, customer-safe projections, remainder scope | Тотожність усіх форматів на поточному SHA, відсутність payroll/margin leak, реквізити компанії |
| WhatsApp/Telegram/email | Ingress, durable inbox/outbox, signatures/consent, policy/unknown states, adapters | Підтверджені акаунти, дозволені одержувачі, тарифи/квоти, справжні доставки/receipts, operator UAT |
| Android | Native task/chat консоль, рольові екрани, окремий demo, encrypted GPS queue; новий durable command recovery | Це test build; реальний ERP/ролі, install/update на телефоні, GPS/OEM; повна функціональна parity ще відкрита |
| iOS | SwiftUI console, actor/session, native GPS source | Mac/Xcode/archive/signing, install/update; unknown-write retry та logout race потребують виправлення й XCTest |
| Операції | Customer environments, scoped panel, health/readiness, backup/rollback scripts | Actual offhost restore/RPO/RTO, reboot/PAM/TLS, моніторинг і exact deployment provenance |
| CI і delivery | Джерельні тести, policy gate, історичні receipts, build tooling | Workflow YAML у `erp/.github` не запускається як root Actions; потрібен окремий узгоджений root CI. Не вмикати paid runners чи deploy автоматично |

## 4. Порядок реалізації та критерії виходу

### Фаза 0 — звести джерела й точний обсяг

Виконано перевірку GitHub branch/PR HEAD, історичного import anchor, доступного серверного source bundle, чинних правил і попереднього master prompt. Зберегти оригінальні `KNB-01…24`, `AC-01…72`, V3 requirements та `TPL-01…18`. [Єдина матриця](REQUIREMENTS_TRACEABILITY.csv) містить114 верхньорівневих рядків; V3 деталізація залишається в `erp/docs/requirements/`.

Вихід: немає загублених змін або невідомо обраної бази; кожна вимога має власний наступний крок. Не масово закривати AC за кількістю unit-тестів.

### Фаза 1 — безпека даних і відновлення поточних процесів

1. ERP seed відмовляє без явного `APP_MODE=DEMO|TEST`, до доступу до БД; production bootstrap не створює synthetic users.
2. Studio перевіряє всю пачку правок за поточним trusted HTML до публікації; відсутній/несумісний target не дає часткової публікації. Повторна перевірка VPS owner authority під час commit; конкурентний publish не створює зайву історію.
3. Android спочатку надійно записує команду, після невідомої відповіді чи restart відновлює той самий idempotency key лише після входу того самого користувача компанії на тому самому origin. Немає автоматичного повтору під іншим акаунтом.
4. Зберегти вже погоджені телефон/footer/favicon. Зберегти чинні payload budgets, а не збільшувати їх для проходження тесту.

Вихід: відтворені RED→GREEN дефекти, негативні тести, independent review та спільна регресія. Позначка source verified не означає live/device verified.

### Фаза 2 — нові заявки сайту → ERP

Використати чинний `/api/v1/integrations/knaba_site/events`, а не створювати другий API. `cleaning_requests` + audit + reference-only outbox — одна транзакція. Нова additive migration після0012, без зміни попередніх SQL/hash. Поточні user/email/role transaction guards збережені.

Publisher: exact HTTPS origin/path, HMAC на сирих байтах, server credential→company, service mapping, privacy version, digest/config fence, один event ID, lease, bounded deadline/retry, окремі APPLIED/REVIEW/BLOCKED/UNKNOWN. Receipt не вигадується після timeout. Owner CRM показує лише локальні лічильники; не обіцяє активну зовнішню доставку.

Вихід: реальні SQLite+PostgreSQL у тестовому середовищі; втрата HTTP-ack після commit + повтор = один lead/event; parallel claim, payload/config conflict, revocation/cancellation, max attempts та відсутність PII в логах. Живе включення, scheduler, historical backfill і двостороннє DSAR — окремі кроки.

### Фаза 3 — єдина identity та асистент

Побудувати server-managed stable subject/company/customer/site mappings, із чітким власником кожного поля; рівність email не створює доступ. Погодити contract roles/permissions/revocation та migration/backfill, перевірити concurrent login/revoke. Перенести лише сумісні частини старої assistant-bridge гілки, включно з шістьма мовами та актуальним ledger.

Додати expiry/revoke відвідувацьких capabilities, пагінацію inbox, локалізацію, owner reply→visitor acknowledgement. Відновлення пароля — одноразовий hashed token, строк дії, sender verification, rate limits, session revocation, жодного account enumeration. Provider failures не гублять заявку.

Вихід: новий клієнт → сайтова розмова/заявка → правильний ERP lead → owner response → клієнт; негативні tenant/customer перевірки, реальний browser journey. Пошта/OIDC/AI/канали потребують окремо перевіреної конфігурації та бюджету.

### Фаза 4 — шаблони сайту без другого CMS

1. Стабільні content/block IDs і явне перенесення існуючих Studio selectors; несумісність показується, не зникає мовчки.
2. Три trust-owned дизайни Original/Business/Modern; контент, URLs, SEO, юридичні сторінки, заявки та акаунти відокремлено від дизайну.
3. Versioned declarative package/schema/example ZIP: лише allowlisted blocks/tokens/local assets; жодного завантаженого коду, довільних HTML/CSS/JS або remote refs.
4. Private quarantine, фактичні decompression/CRC/hash/size/count/depth/pixel/time/concurrency limits; reject traversal/symlinks/duplicates/bombs/encryption/nested archives.
5. Owner UI: catalog → upload → validation report → isolated preview на поточному контенті → draft → explicit activation → rollback. Повторна авторизація на кожному етапі.
6. Atomic CAS activation по package digest/content revision; дві одночасні публікації, restart/storage failure і cancel залишають чинний сайт цілісним. Rollback змінює дизайн, зберігає нові заявки/контент.
7. Immutable asset references, scoped cleanup без видалення active/rollback assets, повний backup/restore, шість мов, keyboard/responsive/SEO і чинні бюджети.

Вихід: усі18 TPL зі справжнім UI/API/DB/browser evidence та незалежним користувацьким проходженням. Без цього «завантаження шаблонів готове» заявляти не можна.

### Фаза 5 — закрити бізнес-процес ERP

Почати з коду й чинних тестів, не зі старих checkbox. D07 offers decline/expire, order linking і report remainder уже існують. Послідовно перевірити: qualification→quote→acceptance→crew→task→shift/trip→material/photo→QC/rework→DE report→payroll record→employee receipt. Паралельні conflicts, reversal, stale version, DST, клієнтські обмеження та відсутність самопогодження — обов’язкові.

Вихід: AC02–66 у належних scopes і весь AC71 на тому самому SHA/artifact, через UI+API+БД. Жодних реальних виплат/клієнтських даних у synthetic QA.

### Фаза 6 — native, провайдери й досвід користувача

Android: стабільний test signer/окремий package, install/update/data preservation; real ERP roles; kill/reboot/reconnect/permissions/GPS/private periods. iOS: виправити unknown-write replay/logout, XCTest, archive/export і дозволений підписаний канал. Потрібні реальні пристрої, не лише CPU fixtures.

WhatsApp/Telegram/email/voice: перевірені customer-owned акаунти, webhooks, opt-in, recipient scope, квоти й ціни; явний disabled/blocked/unknown UI. Browser widths360/768/1440, keyboard/zoom/screen reader, довгі DE-тексти, шість мов, порожні/помилкові/offline стани. Не називати Web Speech готовою телефонією.

Вихід: фактичні delivery receipts/device journeys; провайдери не підмінені doubles. Людський UAT окремий від перевірки агентом.

### Фаза 7 — performance, recovery, передавання

На ізольованому staging виконати15-хвилинний нормативний load test із p95/p99/errors/queue lag, core START/END під PDF/media/AI навантаженням. Виміряти baseline, виправити bottleneck; не видавати build sizes за польові Web Vitals.

Відновити application-consistent backup у clean environment, звірити counts/checksums/snapshots та replay effects; перевірити RPO/RTO, migrations/code rollback, API/worker restart. Підготувати immutable source/artifacts, конфігурацію без secrets, інструкції власника DE та розробника UK, known issues, release notes/checksums, матрицю всіх вимог.

Вихід: лише після всіх required checks і independent review — reviewable release packet із точними target/artifact/migrations/risks/rollback. Merge/production/store/pлатні сервіси не виконуються автоматично. Customer acceptance — тільки фактичне підтвердження компанії.

## 5. Зовнішні передумови

| Передумова | Що вона розблоковує | Що можна робити до неї |
|---|---|---|
| Погоджені owner identity, roles, company legal/tax/privacy/rates | Реальна експлуатація, quotes/payroll/GPS, release | Код, synthetic fixtures, negative tests, документація |
| Customer-owned mail/OIDC/WABA/Telegram/voice credentials + дозволені test recipients/квоти | Справжні канали й відновлення пароля | Disabled adapters, contract tests, failure/recovery |
| Mac/Xcode + Apple Team/profile та Android/iPhone | Install/update, iOS export, GPS/OEM/permissions | Джерела, Android local build/Robolectric/CPU tests |
| Дозволений browser runner/Access session | Захищені рольові journeys, keyboard/responsive | Source/API/SQL/build tests |
| Exact artifact production approval | Випуск після QA | Повний кандидат, backup/rollback план, Draft PR |

Не просити секрети в чаті. Відсутність однієї зовнішньої передумови не зупиняє незалежну source-роботу.

## 6. Облік доказів і відновлення роботи

- Поточний evidence index: [verification.json](evidence/completion-20261108/verification.json); exact source та remote publication записуються окремо.
- Збережена вихідна V3 деталізація: `erp/docs/requirements/requirements.json` —432 вимоги/475 критеріїв; вона залишається чинною поряд із V4, її acceptance не замінено новим підсумком.
- Матриця114 рядків: [REQUIREMENTS_TRACEABILITY.csv](REQUIREMENTS_TRACEABILITY.csv). Усі72 AC збережені дослівно; жоден повний сценарій не закрито лише частковими тестами.
- Канонічні roadmap/memory/backlog доповнюються новим checkpoint. Старі датовані receipts зберігаються; актуальний підсумок має пріоритет над старим текстом «pending» або «PASS».
- Команда цього запуску: `/root` — інтеграція/джерела/план; `/root/erp_audit` — ERP/bridge; `/root/web_audit` — Studio; `/root/mobile_audit` — native/operations; `/root/qa_runtime` — окреме SQL QA та review джерел. Це фактично запущені агенти поточного сеансу, не фоновий сервіс.
- Нові paid providers не активувалися; залишки зовнішніх квот і вартість чинного hosting не встановлені. Автоматичний production deploy/merge не налаштовано цим запуском.

Наступний інкремент після приймання поточного кандидата: фазa3 identity/assistant integration і stable content IDs для фази4. Статус усього продукту залишається NOT_READY, доки обов’язкові сценарії та файли передачі не підтверджені.
