# KNABA DE — версійований власний експорт приватних даних

## Стан і джерело

Backend, web UI та обов’язкові verification cases реалізовані й пройшли
незалежний source review. Локальні TypeScript, Vite, server/worker build
завершилися з exit 0. **Actual PostgreSQL і rendered privacy acceptance
потребують наступного CI на новому точному коміті.**

Це 19 змінених source/test/config paths поверх
`6a395bb73501455371a0e281debf81a6c18c6329`.
Їхній об’єднаний source digest:
`3fda751d5217cae4d1c877fddaf6cd3ad400478f59c798b7105683e580cf0b19`.
Локальна збірка чесно має `source_dirty:true` і base SHA; вона не видається
за новий clean committed release. [Preparation receipt і hashes](evidence/full-completion-20261108/privacy-v2/source-preparation/preparation-receipt.json).

## Поведінка

Користувач явно вибирає базовий експорт або експорт із метаданими пов’язаних
акаунтів. Базовий варіант лишається початковим вибором. Серверний каталог
визначає доступні версії; перед запитом і підготовкою файла UI перечитує його.
Якщо вибрана версія більше недоступна, користувач отримує пояснення і сам
змінює вибір. Автоматичного переходу з розширеного експорту на базовий немає.

| Контракт | Збережена або нова поведінка |
|---|---|
| `privacy.request` без `projectionVersion` | Чинний v1; поле не додається до parsed input перед idempotency hash |
| Явний `knaba-dsar-v2` | Лише ACCESS; запит зберігає вибрану версію |
| ERASURE | Версію експорту передавати не можна; чинні CHAT/MEDIA erasure workflows не змінені |
| `privacy.review` | Версія береться зі збереженого запиту; current legal scope повинен відповідати версії й категоріям |
| `privacy.export` | Чинний input `{requestId}`; один незмінний owned artifact |
| V1 ACK та bytes | Чинні ACK keys і canonical bytes збережені |
| V2 ACK | Додано обов’язковий явний `projectionVersion`; snapshot у компактний ACK не додається |
| Download | Чинний захищений endpoint із перевіркою current/original session, request/subject/category/version/company/checksum |

Відсутнє legacy поле відрізняється від явно переданого `null`, невідомого
значення або неправильної версії. Збережений файл не потребує повторного
legal approval лише для завантаження. Нове створення файла перевіряє чинну
згоду й scope. Same-key replay повертає первинний artifact/checksum;
інший ключ для вже експортованого запиту не створює дубль.

## Межі метаданих

Лише v2 з категорією PROFILE читає federation metadata. V1 та v2 без PROFILE
не запускають цей loader. Поточна company transaction читає шість груп:
bindings, link attempts, source principals, source sessions, атрибутовані
login attempts та derived session lineage. SQL спочатку встановлює власника
й точні binding/issuer/audience/subject зв’язки, потім застосовує спільну
межу **25 000 source rows**. Source sessions рахуються до агрегації.

Некоректний запис, який уже можна віднести до цього власника, або перевищення
межі зупиняє весь export без часткового artifact/event/success receipt.
Міжкористувацькі та міжкомпанійні записи не стають частиною projection.
Анонімні login attempts не приписуються користувачу через старий cookie.

У snapshot є лише явно побудовані поля: власні зв’язки, стани й час спроб,
тип/назва клієнта, похідні ERP sessions і агреговані stored source-session
counts. Відкликана історія зберігається як історія. `ACTIVE` у збереженому
записі не оголошується перевіркою чинного акаунта на зовнішньому джерелі.

Tokens, hashes, security proofs, PKCE, epochs, source sessionRef, сирі
operation/audit JSON і непідтверджена site identity не експортуються.
Loader не виконує source RPC. Retention dispositions явно лишаються
`PRESERVE_PENDING_APPROVED_METADATA_CLASS`, `deletionEligible:false`,
`deletionExecuted:false`. Нового TTL або загального механізму видалення немає.
VPS auth storage, backups, provider/device copies і повне юридичне виконання
DSAR не підтверджуються цим файлом.

## Інтерфейс і повтор після невідомого результату

Форма показує вибраний обсяг у preview, списку запитів, independent review
та export modal. Нові пояснення доступні всіма шістьма мовами. Окремий
вертикальний блок із перенесенням тексту підготовлений для mobile viewport;
фактичне відображення перевірить CI.

Передача запиту використовує незмінний перевірений input та один ключ.
Після втрати або некоректного ACK з’являється явний стан невідомого результату
і кнопка повтору того самого запиту. Автоматичного POST retry немає.
Запізніла відповідь закритої форми не відновлює приватні поля нової форми.
Відмова current session очищує private workspace; UI не виконує автоматичного
logout іншої сесії.

Незалежний initial review знайшов дві помилки й вимагав виправлень. Причина
тепер нормалізується через `trim()` до immutable preview/input відповідно
до чинної серверної схеми. Явний чужий/null/undefined companyId відхиляється;
legacy absence дозволена. Відомі foreign-company entities фільтруються до
відображення приватних текстів. Початкові findings та RED результати збережені.

## Фактичні локальні перевірки

| Перевірка | Факт і межа |
|---|---|
| Backend author CPU | 204 PASS: governance 67, нові metadata/adapter 27, чинні erasure 110 |
| Незалежний backend repeat | 27 PASS; це підмножина попередніх 204, SQL doubles |
| Final UI model | Незалежно 30 PASS на остаточних frozen bytes |
| UI/backend contract probes | 51 assertions PASS із actual model/schema/handler та memory transaction |
| UI review regression | Спочатку 4 FAIL і 1 positive PASS; findings усунені |
| CI runner tests | 9 PASS; додатково 11 independent report-guard probes |
| Playwright collection | 30 cases / 4 files, включно з 11 privacy; виконання браузера не відбулося локально |
| Local build | Виправлений source: TypeScript/Vite/server/worker exit 0; existing large-chunk warning збережено |
| Actual privacy PostgreSQL | 15 cases authored/collected, локально NOT_RUN |

Початковий build exit 2 спричинив excess-property typing у новому test
fixture. Виправлення не послабило assertion і не змінило runtime contract;
після нього completed build має exit 0. Попередній combined UI run48
збережений окремо; остаточні model30 та build прив’язані до frozen manifest.
Набори й повторні reviews не додаються до одного total.

Backend review SHA-256:
`39745407fd2cd29c8ba1aaf9011ed98706d0712b8573337170eb7489d852df40`.
UI/test-plan review SHA-256:
`ec4778e243ea8110d37727058258531704cea7b3151c0eb2b097dcc8eb7bc383`.

## Наступний gate і rollback

Новий combined native/privacy candidate має виконати всі 15 actual PG/HTTP
cases та всі 30 rendered fixture cases без skips/retries, разом із чинними
F2/F3 runtime-pair і aggregate перевірками. Existing workflow/job/timeouts,
sandbox і retention policy збережені. Collection, memory doubles та локальна
збірка не замінюють цього прийняття.

Schema/index changes та live data mutations не виконувались. До будь-якого
live використання v2 можна повернути source до попереднього кандидата без
даних нового формату у живій системі. **Після появи збережених v2 requests
сліпий rollback на v1-only handler неприпустимий:** потрібно зберегти
version-aware перевірки в rollback build або припинити відповідні mutations
до сумісного release. Запити/артефакти не перейменовують у v1, checksum не
перераховують і дані не видаляють для сумісності.

Whole product залишається **NOT_READY**; compound AC не підвищуються.
