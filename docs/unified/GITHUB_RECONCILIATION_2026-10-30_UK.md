# KNABA — звірка та публікація робочих джерел у GitHub, 30.10.2026

**Статус цього запису:** завершений runtime-кандидат має scoped ERP і site PASS; початкове зведене дерево вже опубліковано, актуальну опубліковану ревізію визначає HEAD draft PR118. Browser journeys залишаються BLOCKED_ENV/NOT_RUN. Це звіт про джерела і конкретні перевірки, не акт production deployment або приймання всієї системи.

## 1. Опублікований результат і межі дозволу

Створено робочу гілку [release/knaba-working-20261030](https://github.com/ziko1/knaba/tree/release/knaba-working-20261030) та [draft PR #118](https://github.com/ziko1/knaba/pull/118). Остання пряма вказівка користувача дозволяє звести й опублікувати завершену роботу в робочій GitHub-гілці. Старі записи про відсутність дозволу на таку source publication залишаються історичними checkpoints.

Цей дозвіл не поширюється автоматично на merge у `main`, deployment, зміну live-даних або production-конфігурації. Для цих дій зберігаються окремі чинні gates; для production — погодження користувача та замовника щодо точного артефакту й конфігурації.

Read-only перевірка GitHub підтвердила, що PR118 відкритий і має ознаку draft. `main` залишається на `ff748a2e5731e973883344ed28f3e82cf8a3bc06`. Наявність гілки чи PR сама по собі не означає розгортання коду.

## 2. Точність джерела та різні Git-історії

| Об’єкт | Ідентичність |
|---|---|
| Збережена локальна база до інтеграції | `d97925dad646e08336e368571618dee49fc7971c` |
| Локальний зведений commit початкової публікації | `25460e7136639d8379f11924deafb361c757b266` |
| Початковий GitHub commit | `fb79ce4aba3e5645eeb8945ecd6849f33c46ccec` |
| Спільне точне дерево початкової публікації | `9b2924cca836eb6bba13048e2d99adbb7de19b2e` |
| Remote parents початкового commit | PR114 `3e47eec20febaf6fa3d4bb7ba48a600db90377c0`; PR116 `ede2ea308dd918b4ade484d3830da6a744cdd8c8` |
| ERP subtree у початковому remote tree | `38c5257cfdd9495ece494e32ef26f714e6dd4dd1` |
| Завершений runtime source після поправок сайту | `a193ffd4f031727ca7f3b9e67f72fbf0bab66fbc` |
| Актуальний опублікований HEAD | [HEAD draft PR118](https://github.com/ziko1/knaba/pull/118); точний readback звіряється з evidence index |

Публікацію виконано через Git Data API зі звіркою точних байтів і Git file modes. Початковий remote commit має те саме повне дерево, що й наведений локальний зведений commit. Відмінність commit SHA пояснюється різною історією та метаданими commit, а не підміною вмісту.

Початкові **25 локальних commit**, виявлені порівняно з PR114, збережені в локальній історії; їхній зведений код увійшов у відтворене дерево. **Ці 25 SHA не заявляються як ancestors remote commit.** Remote parents перевірені окремо й наведені вище. Для відновлення історії та для перевірки опублікованих файлів це два різні докази.

Раніше зафіксовані divergence counts: відносно PR114 — 25 local-only / 3 remote-only; відносно PR116 — 27 local-only / 1 remote-only. Це порівняння з різними базами, тому їх не підсумовують.

## 3. Завершені частини, включені в кандидат

| Частина | Джерело | Що збережено або перенесено |
|---|---|---|
| Поточна локальна реалізація | `d97925da…` | Рольові робочі простори, шестимовне ядро, код native/bot та актуальні proxy/origin межі; новіші спільні файли не замінено старими варіантами. |
| PR114 | `3e47eec20febaf6fa3d4bb7ba48a600db90377c0` | Відсутні remote зміни корпоративного TEST/дизайну та документації інтегровані зі збереженням локальних продовжень. |
| PR116 | `ede2ea308dd918b4ade484d3830da6a744cdd8c8` | Інструменти customer environments і пов’язані перевірки. |
| Приклади заявок із PR106 | `08b03bfe13481d2526b39daba68d86483de2dd94` | П’ять файлів: project-intents data, ConstructionCatalog, project-intents unit/browser tests і verify-construction-icons. Збережено новіший CSS. Є 24 авторські приклади: по шість DE/EN/RU/UK. |
| ArticleStudio | `50dd12a02b87aaad05c682b55f5937b280f16cd5` | Дев’ять нових і шість інтеграційних файлів: draft/edit/publish/unpublish/restore, статті та sitemap на наявних Studio tables. Без старого Layout/footer і без нової SQL migration. |
| Захист асинхронного стану сайту | `7de449b319f57f0d07d2f43b4b6a25e0219c1158` | Helper, regression tests та цільові зміни AssistantInbox/KnabaAssistant: mounted/generation guards, відкидання застарілих callbacks і очищення приватного стану. |
| ERP accounting export і chat isolation | `c083a647d5c842ef71cdd42185b8bb3fc127fa75` | Одинадцять файлів: незмінний перевірений звіт, fresh scoped `report.export`, accountant-review JSON, точні суми, шість перекладів кнопки й захист chat read/send/translation після зміни каналу. |
| ERP browser harness | Кандидат `d4890a5c…` | Додано `web-session-races.spec.ts` до testMatch; Chromium sandbox збережений, небезпечний запуск без sandbox не використовується. |
| Native simulator preparation | `c083a647…`; кандидат `d4890a5c…` | Три файли: typed timeout, один обмежений повтор тільки read-only inventory, окремі attempt logs і дев’ять CPU fixtures. Runtime/device pins та перевірки залишилися чинними. |
| Пізній додаток PR117 | `3a873771bc69947b0db9444d72fb6876e4bf355e` | Усі 13 файлів окремого `ops/sitepanel/`: Cockpit UI, UID-scoped broker/CLI, службові та інсталяційні джерела, документація й тести. Точні байти та modes збережені; site/ERP source не змінюється. |

Accounting JSON містить дані для перевірки бухгалтером; він не видається за юридично підтверджений invoice або сертифікований DATEV/XRechnung/ZUGFeRD adapter. Шестимовне ядро також не означає, що кожен спеціалізований модуль уже має шість повних перекладів: Studio/CRM та зазначений SEO-контент зберігають описану чотиримовну межу.

### Пізня повторна звірка: PR117

Свіжий fetch 30.10.2026 о 02:16 UTC виявив нову гілку `feat/scoped-sitepanel-20261030`, створену під час основної звірки. Початкові public refs не змінилися; збережена локальна база `d97925da…` залишалася чистою. На цей момент було 137 public branches, включно з новою робочою гілкою та PR117; символічний `origin/HEAD` не підраховано як гілку.

[PR117](https://github.com/ziko1/knaba/pull/117) має два commit над `main`: `6aebe87072452a8908d1100d0a6d70b8f68ba2ba` і `3a873771bc69947b0db9444d72fb6876e4bf355e`. Його 13 доданих файлів перенесено точно; subtree `898315c76a1eb2a2751c91db5fd7b0354bb42780`, локальний merge `b25251e50c482d125e659b39af1addd0862fb1e6`. Єдиний executable — `ops/sitepanel/sitepanel` з mode `100755`; решта мають `100644`.

Це окремий пакет керування спільним сервером для облікових записів `knaba` і `vsp`. Незалежний review і фактичний непривілейований запуск підтвердили **34 Python-тести та 18 перевірок DOM/CLI**, усі успішні. Також перевірено Python syntax і точний hash installer helper. Python 3.14 видав нефатальні `ResourceWarning` щодо незакритих SQLite connections у тимчасових test ledgers; нуль попереджень не заявляється.

Інсталяційні та account-policy scripts збережено як джерела. Ця задача не запускала їх і не змінювала PAM, sudo, Polkit, групи, паролі або інші серверні проєкти. Вони містять host-specific операції й мають окрему межу дозволу. Live login, реальна ізоляція хоста, reboot recovery та browser rendering не встановлені цими simulated tests. Докази: [sitepanel validation](../../corporate-site/docs/evidence/github-reconciliation-20261030/sitepanel-validation.json) і [повторна звірка refs](../../corporate-site/docs/evidence/github-reconciliation-20261030/final-source-drift.json).

## 4. Явно незавершене або замінене новішим

- **PR104, `362e196e5918e65234734e3e2fc7abc7b8522caf`:** відповідний first-visit scope вже врахований або замінений у PR114; стару гілку не зливали повторно цілком.
- **Assistant → ERP bridge, `fa9ea67b888571657d9b27fb7c56bfb30ee15d73`, і site intake bridge, `d6ae01984569c7d4ced586cca9741976b03ffb4b`:** попередній спеціалізований review виявив schema/composition collisions і відсутність актуального інтегрованого QA. Вони зберігаються як незавершені джерела; поточна консолідація не засвідчує єдиний site↔ERP runtime.
- Старий `client-address`/proxy код із `e628243d…` не накладається на новішу `client-ip` межу. Перенесено лише незалежний async subset.
- Старі міграції, спільні UI-файли й історичні QA receipts не копіюються поверх новіших реалізацій та не отримують нові source SHA заднім числом.

Початковий filename inventory охоплював 58 remote leaves, 199 повторень «гілка/шлях» і 124 унікальні відсутні шляхи. Це інструмент пошуку прогалин, не доказ того, що 124 файли потрібно повернути: частина назв належить заміненим реалізаціям або історичним harness. Звіт фіксує перевірені включені slices і конкретні незавершені частини; він не видає presence-check за приймання семантики всіх старих гілок.

## 5. Перевірки та їхні точні межі

| Gate | Результат | Джерело/межа |
|---|---|---|
| ERP full suite | **PASS: 2510/2510 тестів, 300 suites** | Source `d4890a5c4ec05a4743ddda9b668d9698be003103`, ERP tree `38c5257cfdd9495ece494e32ef26f714e6dd4dd1`; реальна ізольована PostgreSQL. |
| ERP typecheck/build | **PASS** | Той самий ERP source/tree. Node 24.22.1; PostgreSQL 17.11 на tmpfs; openpyxl 3.1.5, Pillow 11.3.0, pdftotext 26.01. |
| Native preparation CPU fixtures | **PASS: 9/9; включені до 2510** | Wrapper і включення перевірені; не додавати ці дев’ять вдруге. Це command-transport fixtures, не XCTest/native build/physical device. |
| Site check | **PASS: 0 errors, 0 warnings, 9 hints; 419 files** | Runtime source `a193ffd4f031727ca7f3b9e67f72fbf0bab66fbc`. |
| Site Vitest | **PASS: 466 тестів у 61 файлі** | Той самий runtime source; включено сім нових locale regressions. |
| Site Node suites | **PASS: 86 тестів** | Чотири записані групи: 33 + 35 + 10 + 8; той самий runtime source. |
| VPS suites | **PASS: 137** | Той самий runtime source. |
| Site build / verify:build | **PASS: 160 сторінок; strict budgets і перевірки артефакту пройдені** | Selected SSR props/deep copy, чотири Studio JSON assets, links/meta та шість locale outputs перевірені. |
| CSS static review | **PASS у перевіреній межі** | 119 scoped selectors; два переміщені правила з незміненими деклараціями не перетинаються з ними. Це static review, не rendered visual acceptance. |
| Окремий пакет sitepanel | **PASS: 34 Python + 18 DOM/CLI** | Точне subtree PR117; simulated runtime/Cockpit, не browser/live host acceptance; нефатальні SQLite warnings зафіксовано. |
| Root source-policy / clean verification | **PASS: 28/28; clean source і module manifest** | Checkpoint `606e45044a83c83ce41274a71ec27220e8bfb4d0` у `root-validation.json`; наступний commit додає тільки документацію/receipts, без зміни перевірених runtime inputs. |
| Browser sandbox probe | **BLOCKED_ENV — No usable sandbox** | Source `25460e7136639d8379f11924deafb361c757b266`. Реальні journeys не виконані. Повтор із вимкненням sandbox не робився. |
| ERP rendered race journeys | **NOT_RUN / BLOCKED_ENV** | Два передбачені сценарії; CPU suite або наявність spec не є browser PASS. |
| Фізичні пристрої, actual XCTest, підписання застосунків | **NOT_RUN** | Не входили до фактично виконаних перевірок цієї консолідації. |

Перші невдалі спроби ERP QA збережені окремо: паралельний запуск спричиняв migration deadlocks, бракувало Python-залежностей і `pdftotext`. Фінальний PASS отримано з канонічним `vitest --no-file-parallelism` і необхідними ізольованими залежностями. Попередні failure receipts не перетворюються на PASS заднім числом.

Перший фінальний site verifier зупинився на `EACCES` під час запису власного QA report після успішних попередніх assertions. Створено тільки окремий файл звіту з належним власником; той самий verifier повторно завершився з exit 0. Збережені і failure, і retry receipts; assertions та budgets не послаблено.

ERP subtree після site/doc змін залишається `38c5257cfdd9495ece494e32ef26f714e6dd4dd1`. Ця tree-звірка пов’язує scoped ERP PASS із незмінним модулем; ERP run не називається новим full-repository запуском на іншому HEAD. Попередні site counts 459 Vitest/86 Node/137 VPS збережені як попередній checkpoint; остаточний site run має наведені 466 Vitest.

Докази: [ERP validation](../../corporate-site/docs/evidence/github-reconciliation-20261030/erp-validation.json), [site validation](../../corporate-site/docs/evidence/github-reconciliation-20261030/site-validation.json), [browser policy](../../corporate-site/docs/evidence/github-reconciliation-20261030/browser-policy.json), [root validation](../../corporate-site/docs/evidence/github-reconciliation-20261030/root-validation.json).

## 6. Розмір артефакту та фінальні зміни сайту

Наявні strict caps збережені. Фінальний runtime source — `a193ffd4f031727ca7f3b9e67f72fbf0bab66fbc`.

| Метрика | Фактичний результат | Чинна межа |
|---|---|---|
| Сума CSS gzip | **40 958 B — PASS** | Менше 40 × 1024 = 40 960 B |
| Увесь emitted client JS gzip | **222 112 B — PASS** | Менше 220 × 1024 = 225 280 B |
| Згенеровані сторінки | **160** | Фактично перевірений build |
| Source catalog | **28 routes, 1087 units** | Перевірений source catalog цього build |

Selected-locale JSON для Studio, цільові CSS-поправки та PublicReviews selected SSR copy зменшили payload зі збереженням контрактів. Перевірено selected SSR props/deep copy і чотири Studio JSON assets. Проміжні 225 951 B JS перевищували cap; цей проміжний результат не позначено PASS і не використано як остаточний артефакт.

| Ідентифікатор доказу | SHA256 |
|---|---|
| Static build artifact | `c4d2803bc872d8c53900a7cd84bd030c67bac68c5c4905fa5fd77334c48f151a` |
| Source catalog | `9259d5dc3a33ae86e70d783d80182a903d186e6327b3da1148260dc19fc44005` |
| Test/input manifest | `7ee643b41e36d4c89b9c7f3d9a972aea0edbea2eb8b8df441b1ee4fd1d4ca94c` |

Це static artifact, не ідентифікатор production deployment. Цільовий secret/path scan фінального delta із 20 runtime/catalog файлів має 0 findings у перевіреній межі; цей результат не називається загальною гарантією відсутності секретів у всій історії.

Докази: [build-static.json](../../corporate-site/docs/evidence/github-reconciliation-20261030/build-static.json), [site-input-manifest.json](../../corporate-site/docs/evidence/github-reconciliation-20261030/site-input-manifest.json), [source-publication-review.json](../../corporate-site/docs/evidence/github-reconciliation-20261030/source-publication-review.json), [CSS review](../../corporate-site/docs/evidence/github-reconciliation-20261030/css-cascade-review.json), [CSS diff](../../corporate-site/docs/evidence/github-reconciliation-20261030/shared-css-cascade.diff).

## 7. Висновок для продовження роботи

Завершені slices, визначені аудитом, включені у зведений runtime-кандидат. ERP і сайт мають наведені фінальні scoped PASS; browser acceptance лишається BLOCKED_ENV/NOT_RUN. Актуальний опублікований commit визначається через [HEAD draft PR118](https://github.com/ziko1/knaba/pull/118). SHA самого документа не вбудовується в його власний текст: tested runtime, початкова публікація та поточний PR HEAD позначені окремо.

Під час передачі звіряються remote readback, source-lineage та root-validation receipts. Наступні docs-only commit не перейменовують перевірений runtime `a193ffd4…` або ERP tree. Реальні provider flows, повний ERP bridge, company UAT, physical-device acceptance, `main` merge та production release залишаються окремими роботами й gates. Source publication їх не закриває.

## 8. Посилання та evidence index

- [Draft PR118 / актуальний HEAD](https://github.com/ziko1/knaba/pull/118), [початковий remote commit](https://github.com/ziko1/knaba/commit/fb79ce4aba3e5645eeb8945ecd6849f33c46ccec).
- [PR114](https://github.com/ziko1/knaba/pull/114), [PR116](https://github.com/ziko1/knaba/pull/116), [PR106](https://github.com/ziko1/knaba/pull/106), [ArticleStudio source](https://github.com/ziko1/knaba/commit/50dd12a02b87aaad05c682b55f5937b280f16cd5), [PR117](https://github.com/ziko1/knaba/pull/117).
- [Source lineage](../../corporate-site/docs/evidence/github-reconciliation-20261030/source-lineage.json), [branch coverage](../../corporate-site/docs/evidence/github-reconciliation-20261030/branch-coverage.json), [publication review](../../corporate-site/docs/evidence/github-reconciliation-20261030/source-publication-review.json).
- [Site QA](../../corporate-site/docs/evidence/github-reconciliation-20261030/site-validation.json), [build](../../corporate-site/docs/evidence/github-reconciliation-20261030/build-static.json), [input manifest](../../corporate-site/docs/evidence/github-reconciliation-20261030/site-input-manifest.json).
- [ERP QA](../../corporate-site/docs/evidence/github-reconciliation-20261030/erp-validation.json), [browser policy](../../corporate-site/docs/evidence/github-reconciliation-20261030/browser-policy.json), [root QA](../../corporate-site/docs/evidence/github-reconciliation-20261030/root-validation.json).
- [Social assets](../../corporate-site/docs/evidence/github-reconciliation-20261030/social-assets.json), [CSS review](../../corporate-site/docs/evidence/github-reconciliation-20261030/css-cascade-review.json), [CSS diff](../../corporate-site/docs/evidence/github-reconciliation-20261030/shared-css-cascade.diff).
- Канонічні продовження: [PROJECT_MEMORY](PROJECT_MEMORY.md), [MASTER_ROADMAP](MASTER_ROADMAP.md), [BACKLOG](BACKLOG.md); [site memory](../../corporate-site/PROJECT_MEMORY.md) і [site roadmap](../../corporate-site/ROADMAP.md).

У звіт не включено паролів, приватних email, токенів або live-даних.
