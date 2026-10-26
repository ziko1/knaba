# KNABA — серверна перевірка і тестове розгортання, 26.10.2026

## Зроблено

Тестовий домен `https://kneba.vsp.rest` переведено на точний опублікований commit `73755d154f5e551daa53db848d46f12be15459d4` (Git tree `4e1f58304ebfbfef8f042eadc421a592412146c6`). Перемикання завершено **2026-10-26 14:51:45 UTC / 15:51:45 Europe/Berlin**. Офіційний `knaba.de`, main, DNS, Traefik, конфігурація, облікові дані та платні провайдери не змінювалися.

Попередній реліз `cecb321ac41106c7a4f6da2d4a98308508852b38` збережено. Новий каталог: `/srv/knaba/vps/releases/73755d154f5e551daa53db848d46f12be15459d4`; `current` посилається саме на нього. Перевідтворено лише Compose-сервіс `web`.

Серверний артефакт з незалежної збірки: **`f687ce5c39f2f677ecfcc6d79a7a86dad852d09307b01ea07b535ccd9df0c950`**, 220 файлів клієнта / 122 HTML. Це окрема збірка; її hash не підмінено hash локальної збірки.

## Перевірено

- Чистий Git checkout опублікованого SHA; package.json і lockfile збігаються з перевіреними кешованими залежностями.
- Node 24.22.1 у контейнері без мережі: nonroot uid998, readonly root/dependencies, усі capabilities скинуті, 1 CPU, 2 GiB RAM, V8 heap 1536 MiB, core dumps вимкнені.
- `npm run check`: 0 errors, 0 warnings, **4 hints**. Vue/Svelte без помилок.
- VSP build і `npm run verify:build`: exit 0; 122 HTML, внутрішні посилання/метадані, 26 вихідних маршрутів / 944 units, 4 опубліковані мови / 95 pending, нумерація і SVG перевірені.
- `npm run test:vps`: **41/41 PASS**, 0 skipped/failed.
- Під двома чинними lock-файлами виконано CAS очікуваного `cecb…`, strict storage check, повторну перевірку SQLite ledger та homepage overlays.
- Ledger: 6 SQL / 6 застосованих міграцій, усі checksum збігаються, невідомих і pending міграцій немає; SQL та journal збережено. Для `/`, `/en/`, `/uk/`, `/ru/` Studio rows=0 до і після перемикання. Міграції схеми не виконувалися.
- Перед перемиканням створено online SQLite backup: `/srv/knaba/vps/state/backups/knaba-2026-10-26T14-51-37-712Z.sqlite`, 233472 bytes, SHA256 `7549611309deb63cec95f56796aac7b7cd28863544ffc9a89e885114c0a3455d`, `PRAGMA integrity_check=ok`.
- Очікування завершувалося лише після **Docker healthy + внутрішніх і публічних health/ready HTTP 200**.
- **127/127 внутрішніх HTTP перевірок**: 122 згенеровані HTML-сценарії (404 перевірено через відсутній URL; два legacy redirects очікувані) плюс health, ready, robots, sitemap, languages.
- **10/10 публічних HTTPS smoke checks**: чотири homepage-мови, контакт, планувальник, галерея, health, ready та очікувана 404.
- Hash фактично змонтованих server/database/migration-guard/worker/home/planner файлів збігається з кандидатом. Compose SHA256 залишився `6883e120f521cf9251cf3221027cd8b82e609ab0d028511484ac32688f722604`.
- Активний manifest оновлено правдивим статусом `DEPLOYED_TEST_DOMAIN_VERIFIED`; це зміна службових метаданих, без зміни перевірених runtime bytes.
- Повторна read-only перевірка о 15:00:26 UTC: поточний SHA і manifest збережені, Docker healthy; повна `sqlite_master` schema та migration ledger точно збігаються з перевіреним predeploy backup.

## Реальні проміжні збої та відновлення

Ці події не приховано і не зараховано як PASS:

1. Початкова QA збірка `2ad00f69…` зупинилася через невідповідність uid1000/998, потім через недостатній V8 heap у контейнері 900 MiB. Виправлено лише ресурси/UID ізоляції; перевірки не послаблювалися.
2. CAS зупинив перше розгортання: інша сесія вже встановила `cecb…`. Її код не перезаписували. Координатор інтегрував обидві лінії в `73755d15…`.
3. Strict storage gate короткочасно відхилив спробу через заповнення біля 90%. Видалено лише підтверджені невикористовувані відновлювані `node_modules`: перед видаленням перевірено realpath, вік, source/lock, процеси та Docker mounts. Джерела, релізи, БД і backups збережено. Поріг не змінено. Перед фінальним switch: 89.62%, 21925482496 bytes доступно.
4. Перша спроба `73755d15…` мала 127/127 внутрішніх PASS, але публічний Traefik ще повертав 503 до завершення Docker health transition. Виконано реальний автоматичний rollback коду до `cecb…`; відновлення БД не виконували. Потім rollout gate доповнено обмеженим очікуванням Docker health та публічної readiness. Повторна спроба завершилася 127/127 внутрішніх і 10/10 публічних PASS. Точну тривалість проміжної публічної 503 не вимірювали.

## Докази й межі

- [SERVER_DEPLOYMENT.json](SERVER_DEPLOYMENT.json) — остаточний receipt з усіма 127 маршрутами, backup та runtime hashes.
- [SERVER_RELEASE_MANIFEST.json](SERVER_RELEASE_MANIFEST.json) — read-back активного manifest; SHA256 `22186b3c418ebc6a9af80919f818081d7e7c27c2938fd8ff7eca9266e05f5ce5`.
- [SERVER_QA_73755d15.log](SERVER_QA_73755d15.log) — незмінений сирий QA log; SHA256 `81cb4f890449d5d1b5f426b79b9fe1fce7b4266473bdba93f3d06254a3f85dcd`.
- [SERVER_RELEASE_ATTEMPTS.json](SERVER_RELEASE_ATTEMPTS.json) — cache receipts, CAS/storage блокування та фактичний 503/rollback.
- [SERVER_POST_DEPLOY.json](SERVER_POST_DEPLOY.json) — повторна перевірка активного SHA, healthy та незмінності повної схеми/ledger після rollout.
- [SERVER_QA_2ad00f69.json](SERVER_QA_2ad00f69.json) — попередній перевірений, але не розгорнутий кандидат.

Це підтвердження тестового серверного випуску. Підсумковий хмарний браузерний огляд виконує координатор окремо. Off-host restore, фізичні пристрої, screen reader, справжнє owner/customer UAT, доставка зовнішнім AI/WhatsApp/поштовим провайдерам та готовність усього ERP не підтверджені цим receipt.

Виконавець: Codex runtime `/root/release_audit`. Подальший rollback коду: під обома locks перевірити поточний SHA, атомарно повернути `current` на збережений `cecb…`, перевідтворити лише `web`, дочекатися Docker + public readiness і повторити smoke. БД автоматично не відновлювати.
