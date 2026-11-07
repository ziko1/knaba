# Перевірки GitHub Actions для об'єднаного репозиторію KNABA

Дата: 2026-11-07. Останній зафіксований hosted результат: **ROOT/SITE PASS; ERP FAIL** на `957e3cc3e24a42d12f5c1c89b88a5d943cc809f2`, [run 42426001415](https://github.com/ziko1/knaba/actions/runs/42426001415). Кандидат виправлення ізоляції SQL test files потребує нового hosted run.
Новіші результати, прив'язані до точного source SHA/run, відстежуються в [Draft PR #121](https://github.com/ziko1/knaba/pull/121); наведений failed checkpoint зберігається як історичний доказ.
Цей запис не є дозволом на реліз і не змінює `NOT_READY` у вимогах передачі замовнику.

## Виправлена причина

Наявні workflows знаходяться в `erp/.github/workflows/` і розраховані на ERP як корінь окремого репозиторію. GitHub Actions відкриває workflows лише в кореневому `.github/workflows/`. Тому додано `.github/workflows/ci.yml` з явними робочими каталогами для обох застосунків. Вкладені історичні workflows збережено.

Джерело правила: [GitHub — Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax). Перевірено 2026-11-07.

## Що запускається

Події: `pull_request`, push до будь-якої гілки та `workflow_dispatch`. Перевіряється точний SHA вершини PR або push; це перевірка кандидата, а не синтетичного merge-коміту. Новий запуск на тій самій ref скасовує попередній.

| Job | Каталог | Реальні перевірки |
|---|---|---|
| `root` | корінь | `audit:source` з повною Git-історією, `verify:modules`, `npm test` |
| `site` | `corporate-site/` | lockfile install, Astro/Vue/Svelte checks, `npm test`, VPS tests, production build, `verify:build` |
| `erp` | `erp/` | lockfile install, документні readers, PostgreSQL preflight, міграція, TypeScript, production build, точна source identity, повний Vitest і заборона пропущених тестів |
| `failure-summary` | тимчасовий каталог runner | лише при помилці: SHA і статуси трьох jobs у невеликому JSON |

Toolchain: Node **24.22.1**, сумісний з `>=24 <25` кореня/ERP і `>=22.23.4` сайту; npm використовує committed lockfiles через `npm ci`. Python **3.12**, `openpyxl==3.1.5`, `Pillow==11.3.0` та Ubuntu `poppler-utils` потрібні для незалежного читання фактичних XLSX/PDF. Це QA-залежності, не нові runtime-пакети ERP.

ERP отримує окремий ephemeral PostgreSQL **17.6-bookworm** з healthcheck, локальним портом і лише синтетичним CI-паролем. `database-check.mjs` перевіряє підключення та мінімальну версію; `npm run migrate` застосовує чинний SQL. База не має доступу до production. Redis не додається: чинний runtime використовує PostgreSQL/outbox, а Redis не є його залежністю.

Повторна перевірка придатності до запуску 2026-11-07: [офіційний Node.js 24.22.1](https://nodejs.org/en/blog/release/v24.22.1) опубліковано 2026-10-21, Linux x64 binary існує в переліку release artifacts. Синтаксис `127.0.0.1:5432:5432` збережено: [GitHub service ports](https://docs.github.com/en/actions/tutorials/use-containerized-services/use-docker-service-containers) передаються Docker через publish, [реалізація actions/runner](https://github.com/actions/runner/blob/main/src/Runner.Worker/Container/DockerCommandManager.cs) додає значення port mapping як `-p`, а [Docker](https://docs.docker.com/engine/network/port-publishing/) підтримує прив'язку до loopback у форматі host-IP:host-port:container-port. Це підтверджує контракт конфігурації, але не замінює перший фактичний hosted run.

Повний ERP suite запускається з `DATABASE_URL`, `--no-file-parallelism` і JSON reporter. Файли виконуються послідовно, оскільки SQL fixtures повторно застосовують DDL до однієї бази; навмисні паралельні транзакції/worker instances усередині тестів збережені. Наступний крок вимагає `success=true`, ненульової кількості тестів, `passed=total`, `failed=pending=todo=0`. Якщо PostgreSQL відсутній або suite має SKIP, CI не може помилково прийняти CPU-only результат як SQL PASS.

Сайт збирається в режимі `KNABA_RELEASE_MODE=official`, що відповідає збереженому `i18n/source-de.json`: тексти Impressum/Datenschutz містять hostname knaba.de. Це лише production-компіляція у CI; сайт нікуди не публікується. Перший hosted run на68b910b з режимом vsp завершився SOURCE_CATALOG_STALE_RUN_EXTRACT через staging hostname; виправлено конфігурацію, gate не вимкнено й каталог не перегенеровано для приховування різниці.

## Межі доступу та витрат

Workflow має лише `contents: read`, checkout не зберігає credentials, `pull_request_target` не використовується. Production secrets, платіжні ключі та live endpoints не передаються. Deploy, merge, повідомлення, native distribution і активація провайдерів відсутні.

Використовується тільки стандартний `ubuntu-24.04`. Для публічних репозиторіїв стандартні GitHub-hosted runners безкоштовні за [офіційною документацією GitHub](https://docs.github.com/en/actions/concepts/billing-and-usage), перевіреною 2026-11-07. Це не дозвіл змінювати тариф, використовувати larger runners або витрачати оплачувані хвилини приватного репозиторію. У разі зміни видимості репозиторію власник має переглянути billing до подальшого запуску.

Dependency cache і архіви успішних збірок не створюються. Єдиний artifact — allowlisted JSON при збої, retention **1 день**: SHA, результати jobs та явна межа CI. До нього не потрапляють raw test reports, stack traces, `.env`, дампи БД, браузерні traces, screenshots, робочий каталог або довільні логи. Стандартні step logs залишаються в самому GitHub Actions.

## Фактичні локальні результати

Перевірена базова версія ERP: Git `87fdba936bb8ed7d9b8c7493c49895c48395250b`, ERP subtree `38c5257cfdd9495ece494e32ef26f714e6dd4dd1`. Під час перевірок були окремі незакомічені зміни сайту/CI; перелічені ERP source-файли не змінювалися. Цей запис не атестує майбутній commit усіх змін.

| Перевірка | Результат | Межа доказу |
|---|---|---|
| Початковий root `npm test` | PASS: 28/28 | До поточних змін CI/сайту |
| Початковий `audit:source` | PASS | Чистий базовий commit; історичний anchor збережений |
| ERP `npm run typecheck` | PASS, exit 0 | TypeScript, не runtime acceptance |
| ERP `npm run build` | PASS, exit 0 | Vite web + bundled server/worker; Vite 6m 7s у цьому середовищі |
| Build source identity | PASS | `code_sha` дорівнює базовому SHA, `source_dirty=false`, `source_provenance=GIT_WORKTREE` |
| ERP `npm test -- --maxWorkers=2 --reporter=json --outputFile=/tmp/knaba-erp-ci-baseline.json` | 2050 PASS, 460 SKIP, 0 FAIL/TODO; 2510 тестових випадків у 108 файлах | PostgreSQL відсутній; 460 SQL cases **NOT_RUN**, не PASS |
| Структура YAML, events, permissions, runner/cwd, відповідність npm scripts | PASS | PyYAML 6.0.3; це не hosted execution |
| Inline Bash/JavaScript/Python | PASS | `bash -n`, `node --check`, Python `compile` |
| Gate проти SKIP | PASS | Точний CI-крок відхилив фактичний локальний JSON з 460 SQL skip |
| `actionlint` | NOT_RUN | У середовищі не встановлено |
| Remote GitHub Actions, run 42426001415 | ROOT/SITE PASS; ERP FAIL | SHA `957e3cc3e24a42d12f5c1c89b88a5d943cc809f2`: 2465 тестових випадків PASS, 6 FAIL, 58 SKIP; 7 suite hooks failed у міграції. Це не приймання нового кандидата. |

Локальні document tests працювали з наявними Python readers `openpyxl 3.1.5` / `Pillow 13.0.0` і `pdftotext`; CI використовує попередньо визначені QA-версії `3.1.5` / `11.3.0`. Не приписувати локальному прогону версії майбутнього hosted runner.

ERP build повідомив попередження про JS chunk понад 500 kB: `index-BTCFjyGZ.js` — **667.57 kB**, gzip **212.48 kB**; CSS — **93.08 kB**, gzip **18.72 kB** (десяткові розміри Vite). Це виміряні розміри артефакту, не Web Vitals чи p95. Попередження не приховано; поділ клієнтського коду потребує окремої вимірюваної оптимізації.

## Hosted SQL failure та виправлення test isolation

[ERP job 128564345401](https://github.com/ziko1/knaba/actions/runs/42426001415/job/128564345401) завершився exit 1: 11 файлів failed / 98 passed, 2529 тестових випадків загалом. Сім failures виникли в `Database.migrate` hooks, три cases отримали PostgreSQL serialization failure, ще три — assistant request count, notification terminal status та operations-digest DST validation. Збережені результати не переписуються як PASS.

`Database.migrate` тримає advisory lock `710324003` між migrations, але business transactions використовують інші company locks. `infra/001_init.sql` повторно виконує DROP/CREATE TRIGGER і ALTER TABLE. Два паралельні test files можуть тому поєднати schema DDL одного fixture з бізнес-транзакціями іншого. Різні synthetic company IDs не ізолюють shared PostgreSQL schema від цих locks. Мінімальний fix у CI — послідовні **файли**, без зміни runtime migration/transaction/retry logic, SQL isolation level, assertions або інвентарю тестів.

Vitest **4.1.11**, установлений з lockfile, прямо документує `--no-file-parallelism` у `--help --fileParallelism`; конфігурацію перевірено YAML parser і Bash syntax check. Навмисні concurrency/replay/worker race tests залишаються в повному suite. Локального PostgreSQL/Docker/psql немає; усунення deadlocks/serialization і решта runtime failures потребують реального hosted повтору. Не збільшувати retry counts і не міняти очікувані business states лише через цей failed run.

Фактично виконано `vitest run tests/validation-budget.test.ts tests/automation-schedule.test.ts --no-file-parallelism`: **78/78 PASS, 0 FAIL/SKIP**, exit 0. Це перевірка CLI та CPU regression із новим режимом файлів; вона не доводить усунення PostgreSQL failures.

## Після публікації кандидата

Окремо виправлено датозалежний DST fixture: дата переходу 2025-10-26 на момент CI 2026-11-07 вийшла за чинне 370-денне вікно preview. Тест використовує явний історичний command clock, актуальну авторизацію та справжню read-only PostgreSQL transaction; HTTP/CSRF перевірки залишаються в інших сценаріях. Новий CPU regression підтверджує і відмову поза вікном, і правильні 25 годин з історичним clock. Production guard не послаблено. Локально focused suite: 33 PASS / 17 SQL SKIP; незалежний review прийнятий. SQL результат очікується від hosted повтору.

1. Повторити jobs на опублікованому кандидатові з виправленою ізоляцією files; зберегти URL/run ID, SHA та фактичні результати у PR/evidence. Новий результат не потребує повторного docs-only commit лише заради зміни історичного запису.
2. Якщо тест упаде — виправити причину і повторити перевірки; не прибирати SQL gate або failing cases заради green CI.
3. Окремо виконати необхідні browser/live, native/device, backup/restore, provider та клієнтські acceptance перевірки. Цей workflow не відновлює автоматично всі сценарії історичних ERP release workflows.
4. Перед готовністю до передачі виконати чинний `npm run audit:release` з потрібними доказами. Поточний release gate свідомо залишається BLOCKED без цих доказів та підтверджень.
