# Перевірки GitHub Actions для об'єднаного репозиторію KNABA

Дата: 2026-11-07. Статус налаштування: **LOCAL_CONFIGURATION_VERIFIED / REMOTE_CI_NOT_RUN**.
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

Повний ERP suite запускається з `DATABASE_URL`, двома Vitest workers і JSON reporter. Наступний крок вимагає `success=true`, ненульової кількості тестів, `passed=total`, `failed=pending=todo=0`. Якщо PostgreSQL відсутній або suite має SKIP, CI не може помилково прийняти CPU-only результат як SQL PASS.

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
| Remote GitHub Actions | NOT_RUN | Потрібен запуск нового кореневого workflow на опублікованому commit |

Локальні document tests працювали з наявними Python readers `openpyxl 3.1.5` / `Pillow 13.0.0` і `pdftotext`; CI використовує попередньо визначені QA-версії `3.1.5` / `11.3.0`. Не приписувати локальному прогону версії майбутнього hosted runner.

ERP build повідомив попередження про JS chunk понад 500 kB: `index-BTCFjyGZ.js` — **667.57 kB**, gzip **212.48 kB**; CSS — **93.08 kB**, gzip **18.72 kB** (десяткові розміри Vite). Це виміряні розміри артефакту, не Web Vitals чи p95. Попередження не приховано; поділ клієнтського коду потребує окремої вимірюваної оптимізації.

## Після публікації кандидата

1. Дочекатися всіх трьох jobs на точному опублікованому SHA; зберегти URL/run ID та фактичні результати.
2. Якщо тест упаде — виправити причину і повторити перевірки; не прибирати SQL gate або failing cases заради green CI.
3. Окремо виконати необхідні browser/live, native/device, backup/restore, provider та клієнтські acceptance перевірки. Цей workflow не відновлює автоматично всі сценарії історичних ERP release workflows.
4. Перед готовністю до передачі виконати чинний `npm run audit:release` з потрібними доказами. Поточний release gate свідомо залишається BLOCKED без цих доказів та підтверджень.
