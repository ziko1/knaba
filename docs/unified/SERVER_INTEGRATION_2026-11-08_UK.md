# KNABA DE — зведення реалізацій і серверний пакет, 08.11.2026

## Обсяг і повноваження

Поточний запит користувача: продовжити KNABA DE, звірити зроблене й незроблене,
впровадити функції та завантажити виконане на сервер. Це дозвіл на серверну
доставку цього кандидата. Він не підтверджує невиконані company/device/provider
acceptance і не дає підстав обходити права доступу чи змінювати чинні захисні
перевірки. Окремого merge у `main` не виконано.

Робоча база — `131e582f1ffa50a89a5898742cf7f22b5b43efa7` (privacy/F4-C1).
Спільна гілка — `feat/knaba-server-integration-20261108`. `main` містить старіший
стан; його не використано для заміни чинних функцій. Exact-source CI, artifact
hash і фактичний результат завантаження записуються окремими receipts.

## Що зведено в коді

| Частина | Походження та реалізація | Межі приймання |
|---|---|---|
| Акаунт сайту | `26b23a55a36ce389adb8bf9aba9c168583e1494a` + `3b009e1f697d1b3cfd831d4aaba9e5124732fd39`: власні ім'я, телефон, компанія, адреса, мова, часовий пояс, optimistic version; пароль, список і відкликання сесій; одноразові reset/email proofs | SQLite/HTTP і source перевірки; mail default off, реальний провайдер і browser acceptance окремі |
| Доступ до чату | `7e9c946c0078171e747965d8cae2cdb43e5d3141`: fixed7-day expiry, owner revoke, atomic audit, SQL guest/current-owner fences; additive Drizzle0015 | Вузькі SQLite/HTTP source checks; owner revoke UI, pagination, display/request pipeline окремі |
| Lead Agent | Вибірковий перенос `6d76404` без альтернативної federation з PR129: профілі пошуку, публічні TED/Berlin adapters, фільтри, чернетки, CRM handoff, history/archives | Worker public search default off; немає автоматичної відправки, платного AI, входу в MyHammer чи обіцянки фактичних заявок |
| Поїздки | Backend з `a6324a0e6dbc2e5c70757df7d9db6a5c97cae3e6`: спільна поїздка, учасники, scoped access, окремий час людей і один пробіг автомобіля | GPS/оплата/правила праці не активовані; live приймання окреме |
| Native Android/iOS | Вибіркове зведення PR135/137 через `78fac2260293160aff0d0405d6128f909cbdcdcb`: бренд, читабельні ролі шістьма мовами, origin discovery, безпечне поводження із секретними командами | Обидві декларації `0.6.0`, build `10`, більше за обидва спостережені build9; signing, оновлення та фізичні пристрої не підтверджено |
| Партнери | Окремий commit PR124: чинні TM Ausbau і Brüninghoff assets/посилання та regression checks | Юридичне підтвердження партнерства не виводиться з наявності логотипа |
| Резервні копії | Перенесено private backup fix з PR138: 0700/0600, exclusive creation, symlink/inode guards, integrity/FK/hash verification | Синтетичні SQLite CLI tests; live backup/restore ще не прочитані |
| Міграційний guard | `knabactl.py` враховує і `drizzle/`, і VPS SQL міграції; routine activation/rollback з відмінним schema manifest відхиляється до backup/switch | Installed controller на фізичному сервері не прочитано; source fix не означає його установку |

Чинні F2/F4 request authority, separate federated namespace, C08 explicit mode,
company/origin guards та F4-C1 privacy export збережено. CUSTOMER media доступ
вже був захищений у базі131; цього разу додано/adapted regression, а не
приписано собі повторне виправлення runtime.

## Налаштування акаунта: дані та відкат

Додається VPS auth migration `002_account_settings` після незмінної
`001_site_identity_consents`. SHA-256 SQL:
`95c31d637694a1519f83e7534ec43997e6444d3f45acb850bf5e4a41fa1a0295`.
До Drizzle додається лише `0015_assistant_access.sql` (SHA-256
`8acaa07b692d0830e5e635816be8a834dcfa9251b98f51753be08ae3b4eb78fb`);
байти попередніх0000–0014 не переписуються. Старі noncanonical chat dates
дають NULL expiry і закривають guest access; expiry не продовжується.
Drizzle history не переписується. Невідомі receipts, змінені checksum,
невраховані tables іншої lineage або відсутні guards блокують startup/migrate.
Перед міграцією CLI створює перевірену приватну backup-копію.

Старий runtime131 відхиляє receipt002. Звичайний відкат коду на нього після
міграції недопустимий. Потрібен сумісний із002 runtime або виправлення вперед.
Відновлення snapshot, зробленого до нових password/session changes, може
повернути старі credentials та сесії. Воно потребує окремого узгодженого плану
збереження або відкликання поточного security state; видалення receipt чи
послаблення reader guards не є планом відкату.

Email adapter вимагає явних server-owned enabled/config/ліміту й працює лише
із дозволеним endpoint. Capability зберігається як hash; fragment переноситься
в POST form і прибирається з history. Немає автоматичної активації провайдера
або відправки листів під час цієї інтеграції.

## Знайдені неточності backlog

TPL-01–18 раніше всі позначені `NOT_STARTED`. У чинному131 вже є Original,
Business, Modern, bounded ZIP з `template.json`, owner API upload/select/preview/
activate/rollback та SQLite history. Це часткова реалізація declarative presets;
повний структурний template engine, stable block IDs, package asset lifecycle,
ізольовані browser/restore/performance acceptance лишаються відкритими.
Матриця уточнює часткову реалізацію; TPL-17 лишається `NOT_STARTED`,
TPL-18 — `NOT_RUN`. Немає масового PASS 72 V4 або 475 V3 критеріїв.

## Фактичний серверний стан

Read-only audit фізичного `knaba` від08.11.2026 зафіксував `/healthz` і `/readyz`
200, анонімний CRM401, testing за Cloudflare Access. Runtime identity агента —
`sentinelx`, uid999/gid983; traversal до `/srv/knaba` і підкаталогів відхилено,
`file_ops.writable_paths` порожній. Доступного привілейованого KNABA deployment
helper не виявлено. Старий вимкнений `avenqo-sferahost` не використовується.

Підтверджений механізм доставки — приватний upload-каталог SentinelX. Пакет
потрібно завантажити з перевіркою SHA-256 і повторним hash-readback на сервері.
Це не переключає чинний сайт. Activation, фактичний installed SHA, schema
receipts, live restore та testing acceptance залишаються `BLOCKED_ACCESS` або
`UNKNOWN`, доки власник доступу не надасть штатний deployment шлях.

## Повторний dependency audit

08.11.2026 `npm audit --omit=dev` повернув ERP2 HIGH records для Zod і
залежного zod-to-json-schema (один GHSA-mrhx-c7xc-m3w5) та site3 LOW records
у ланцюжку deepmerge/Svelte (один GHSA-gcqx-w48m-w2h4). Існуюча
application-boundary mitigation перевірена повторно:19/19 validation-budget
cases. Це не виправляє upstream dependency і не є security PASS всього
продукту. Зберігається OPEN_WITH_MITIGATION; окремий Zod major upgrade має
підтвердити parity command/OpenAPI/UI/tool schemas. Audit не приховано,
lockfiles не змінено для косметичного зеленого статусу.

## Відкриті функції та наступна черга

1. F3 issuance/login exchange та решта F4 retention/erasure/background policy.
2. Повний assistant conversation→ERP mapping і capability lifecycle з відповідної
   паралельної lineage; не змішувати її federation з поточними F2/F4.
3. Структурні шаблони та їх повний assets/backup/browser lifecycle.
4. Real PostgreSQL і bridge на точному зведеному SHA; actual browser journeys,
   load baseline, native simulator/build, signing та фізичне оновлення.
5. Testing deployment з reviewed migration/restore і незмінними approval guards,
   потім production activation через авторизований серверний доступ.

Whole product: `NOT_READY`. Source implementation, тести, завантаження пакета,
активація сервісу і клієнтське приймання — окремі факти, кожен із власним доказом.
