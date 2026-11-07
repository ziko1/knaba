# KNABA — фактичний стан завершення, 2026-11-07

**Загальний статус: NOT READY FOR CLIENT DELIVERY.** Репозиторій містить окремі модулі та перевірений локально кандидат керування шаблонами; це не доказ приймання єдиного site↔ERP продукту. Оцінка спирається на код, поточні локальні перевірки та збережені source-bound звіти, а не на кількість старих TODO або суму тестів.

База аудиту: `87fdba936bb8ed7d9b8c7493c49895c48395250b`; незмінений ERP subtree: `38c5257cfdd9495ece494e32ef26f714e6dd4dd1`. Результати нижче не присвоюють майбутній Git SHA незакоміченим змінам сайту/CI. Публікація candidate source не означає merge чи deployment.

## Зроблено й реально перевірено

| Обсяг | Фактичний результат і межа |
|---|---|
| Root source policy | Початкові `npm test` **28/28 PASS** і `audit:source` **PASS** на чистій базі; historical import anchor збережений. Після фінального commit потрібна перевірка нового джерела. |
| ERP compile/build | `npm run typecheck` і `npm run build` — **PASS**, exit 0. Побудовані web/API/worker; `release.json` має наведений базовий SHA, `source_dirty=false`, `GIT_WORKTREE`. |
| ERP поточний локальний suite | **2050 PASS, 460 SQL SKIP, 0 FAIL/TODO**, 2510 тестових випадків у 108 файлах. Відсутня локальна QA PostgreSQL; пропущені cases — **NOT_RUN** у цьому прогоні. |
| Збережена історична ERP перевірка | [Звірка 30.10](GITHUB_RECONCILIATION_2026-10-30_UK.md) фіксує 2510/2510 і справжній SQL на тому самому ERP subtree. Її source scope збережено; це не новий SQL-прогін або acceptance нового інтегрованого runtime. |
| GitHub CI | Додано кореневий workflow для root/site/ERP, PostgreSQL service та fail-closed gate проти SKIP. YAML/команди/inline syntax і фактичне відхилення skipped report перевірені. **REMOTE_CI_NOT_RUN**. [Деталі й первинні джерела](CI_SETUP_2026-11-07_UK.md). |
| Шаблони сайту | Поточний source scope: каталог, вибір/preview, завантаження ZIP, зберігання та застосування через Studio. На момент цього baseline-запису зміни ще не були фінальним зафіксованим artifact; їх окремі тести/review не підміняються ERP baseline. |
| Android/iOS | Джерела існують у `erp/apps/mobile-android` та `erp/apps/mobile-ios`. Цей аудит їх не змінював і не запускав Gradle/Xcode/device/signing. Окрему паралельну Android-роботу збережено без втручання; її результат потребує власного SHA, review і доказів. |

ERP Vite повідомив JS **667.57 kB**, gzip **212.48 kB**, CSS **93.08 kB**, gzip **18.72 kB**. Warning про JS chunk понад 500 kB збережений. Це розміри збірки; p95, Web Vitals, startup, CPU/RAM та physical-device показники в цьому аудиті не виміряні.

## Конкретні незавершені частини коду

| Пріоритет | Прогалина | Наступна завершувана частина |
|---|---|---|
| P0 | Немає інтегрованого site→ERP delivery path | `corporate-site/worker/api.ts:createRequest` атомарно записує `cleaning_requests` і audit, але не ERP outbox. Потрібні durable dispatch, bounded retries, idempotency/conflict handling, delivery receipt та контроль backfill/rollback. |
| P0 | Немає узгодженої server-authorized identity federation | Пов'язати стабільні site subjects з ERP company/site/customer scopes, перевіряти відкликання та належність; не використовувати email або Telegram sender як доказ ERP-ролі. |
| P0 | Не завершена композиція попередніх інтеграційних гілок | Збережені bridge-кандидати мають історично виявлені schema/composition collisions. Переносити тільки перевірений сумісний код; не зливати стару схему поверх актуальної. |
| P1 | Повний обсяг V4/V3 не має актуального поелементного приймання | Звіряти чинний код і acceptance IDs. Зокрема crew offers, `order.link_site`, remaining-scope та захист матеріалів після `IN_PROGRESS` уже є в ERP; старі D07 плани не є підставою реалізувати їх удруге. |

Для bridge вже існує ERP endpoint `POST /api/v1/integrations/:source/events`, адаптер `erp/apps/api/integration-events.ts`, валідація/транзакція в `erp/packages/domain/integrations.ts` та signed envelope у `erp/packages/integrations/generic-events.ts`. Повторно використовувати цей контракт: `schema_version: "1"`, `event_type: "lead.upsert"`, signature над `timestamp + "." + rawBody`, server-side company credential і чинний mapping. Не впроваджувати застарілий запропонований `/internal/v1/leads` без окремого рішення та контрактних тестів.

## Блокери перевірки й зовнішнього приймання

Це окремі умови; їхня відсутність не доводить дефект коду, а наявність локального PASS не закриває їх:

- **QA environment:** новий hosted workflow ще має виконатися на точному опублікованому commit; інтегровані PostgreSQL/D1/SQLite, browser journeys, міграції, worker restart і restore потребують актуального artifact та ізольованого середовища.
- **Native/device:** актуальні Android/iOS збірки, signing, встановлення, permissions, offline/online і фізичні пристрої не прийняті цим аудитом. Debug або Simulator не замінює release/device evidence.
- **Identity/providers:** реальний owner enrollment, дозволені test recipients, email ownership/recovery, sender/OIDC, Telegram/WhatsApp delivery і фактичні quotas/consent залишаються окремими gates. Відсутність credentials не усувається заглушкою успіху.
- **Security/legal/UAT:** незалежний review усього інтегрованого scope, GDPR/AVV/retention, customer acceptance, screen reader/cross-browser і чинні company approvals не засвідчені цим записом.
- **Operations:** перевірені off-host backup/restore, rollback, точний deployment artifact, актуальний стан host/storage/TLS і окремий дозвіл на production. Історичні live receipts не є перевіркою сьогоднішнього runtime.
- **Client delivery:** повний узгоджений комплект документації, потрібні інсталяційні файли, manifest/checksums та перевірений `CLIENT_DELIVERY_FINAL.zip` для фінального source ще не підготовлені/не прийняті як ціле.

Чинний [release receipt](RELEASE_READINESS.json) містить 11 незакритих gates, `sourceSha=null`, `artifactSha256=null`, `productionApproval=false`. `npm run audit:release` фактично завершується exit 1 — **BLOCKED**, як і має бути без доказів. Receipt не послаблено.

## Черга до наступного приймання

1. Завершити template source/review та його focused + regression QA; зафіксувати й повторно звірити точний final commit/artifact, виконати remote CI.
2. Закрити scoped identity та durable site→ERP bridge з реальним SQL, authorization/revocation, retry/replay/conflict і rollback acceptance.
3. Звести решту V4/V3 критеріїв з актуальними доказами, виконати дозволені integrated/browser/native/restore перевірки, пройти owner/provider/legal/UAT gates.
4. Лише після цього комплектувати фінальну передачу й переоцінювати `READY FOR CLIENT DELIVERY`. Відсутні докази лишаються NOT_RUN/BLOCKED, а не автоматичним PASS.


## Кандидат цього завершуваного етапу

Реалізовано `/studio/templates/`, формат ZIP v1, три presets, owner-only API, sandbox preview, draft/CAS/idempotency/history/rollback, SQLite migration 0013, збереження публічного контенту та реальну owner HTTP перевірку з restart. Пакети не виконують сторонній код. [Інструкція](../../corporate-site/docs/SITE_TEMPLATES_UK.md). Відкритих P0/P1 у незалежному review **зміненого template scope** не виявлено; це не закриває P0 інтеграції вище.

Після виправлення регресій: site 600 Vitest PASS + 90 Node PASS; VPS 139 PASS; root 28 PASS; Astro/Vue/Svelte 0 errors/0 warnings, 8 наявних hints; production build 161 HTML і verify-build PASS. Фінальні журнали та точний Git SHA прикріплюються до candidate PR/архіву; historical ERP baseline вище не підміняється цими результатами.

Відтворений baseline сайту на 87fdba93: 160 HTML, CSS 40958B gzip, JS 225192B gzip. Кандидат: 161 HTML, CSS 40958B, JS 225064B. Ліміти 40960/225280 не підвищено. Шість locale JSON винесено в окремі assets, завантажується вибраний; додатковий gzip на locale 966–1384B. Це build metrics, не Web Vitals/p95. Vue production composition runtime перевірено реальним compiled ServiceFinder/custom renderer; browser hydration такою перевіркою не засвідчується.

**Browser E2E BLOCKED:** локальні Playwright engines відсутні; спроба хмарного браузера відкрити тимчасовий HTTPS fixture завершилася connection refused. Реальний браузерний harness збережено; у ньому0 прийнятих браузерних перевірок.

**Новий dependency finding:** production npm audit показав site 3 LOW records (один deepmerge advisory і залежний ланцюжок), ERP 2 HIGH records (Zod та залежний zod-to-json-schema). Ключі/токени/PEM за цільовим scan нового diff не знайдені; це обмежений scan, не повний secret/security audit. Major downgrade/upgrade для косметично зеленого audit не виконувався.

ERP отримав bounded validation для HTTP/Engine та bounded provider JSON для DeepSeek/Maps/WhatsApp. Нові 19 regression cases; фінальний CPU suite 2069 PASS, 460 SQL SKIP,0 FAIL. [Security scope, ліміти, ризики та наступна Zod-міграція](../../erp/docs/VALIDATION_RESOURCE_BUDGET_2026-11-07_UK.md). Upstream advisory лишається відкритим після application-boundary mitigation; повна security readiness не присвоєна.

Загальний release receipt залишається BLOCKED. Автоматичних merge/deploy/provider activation або передачі замовнику не виконано. Завантажуваний candidate build призначений для перевірки, а не є `CLIENT_DELIVERY_FINAL.zip`.
