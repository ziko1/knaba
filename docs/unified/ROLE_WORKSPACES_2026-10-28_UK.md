# KNABA: кабінети ролей, розмови та ізольоване тестування

**Стан 28.10.2026: SCOPED_DEPLOYMENT_COMPLETED на kneba.vsp.rest.** Прийнятий runtime — `76f96f6f83d22403a1aa255e8bf2b98311807985`; browser QA і дозволений rollout завершені. Developer invitation — **PREPARED / USER_ACTIVATION_REQUIRED**; активація користувачем і authenticated live UAT залишаються **PENDING**. Пізніший commit документації не є новою версією розгорнутого runtime.

## Доручення / KN-ROLE-WORKSPACES-20261028

Джерело: поточна розмова власника, 28.10.2026. Ціль — **kneba.vsp.rest**, репозиторій **ziko1/knaba**. Власник прямо доручив перевірити вже наявні кабінети, доповнити відсутнє, забезпечити замовлення для нового/чинного користувача, спілкування працівника з керівником, автоматичний перехід після входу та доступ розробника до **власних тестових даних**, реалізувати і розгорнути на цьому домені. Попереднє доручення: зручні дії в одному вікні без примусових нових вкладок, живий зрозумілий інтерфейс і недублювання інших робіт.

## Робочий prompt

Продовжити чинні Portal, AdminControlCenter, авторизацію і cleaning_requests. Використати реальні ролі та серверні дозволи. Завершити перевірювані сценарії: відвідувач надсилає заявку; схвалений клієнт/партнер створює та відстежує власну заявку; адміністратор планує й призначає працівника; працівник бачить тільки свої роботи, оновлює виконання і спілкується з керівником; керівник відповідає в тому самому робочому вікні. Нове запрошене членство залишається pending до схвалення. Розробник із чинним серверним grant отримує окрему тестову базу й перемикає тільки серверні тестові персони. Реальні записи не копіювати в тестову базу. Не змінювати чужі акаунти, ролі або записи заради QA. Перевірити основні й заборонені сценарії, зберегти source/evidence, виконати дозволений rollout з чинним pointer CAS, backup/restore та rollback і перевірити live.

## Відновлений стан і рішення

- Source до задачі: PR #113 `75c599b0c89bbb0c800e04839af5de6a323d62f3`; live pointer при початковій перевірці: `e2ab9b1883bcac8559dd34939d75bb3e9676dd69` (його предок).
- Додатково відновлено попередню незалиту роботу `b49acd7b1121a90d460355fb06606925cf97ecc3` з перевіреного Git bundle: вхід у спливному вікні, адаптивність і роль бауляйтера. Її інтегровано зі збереженням обох гілок історії. **KN-ROLE-UX-20261028 консолідовано в цю задачу**: наступним чатам продовжувати поточну гілку, а не повторювати реалізацію чи створювати паралельний release. Байти попередніх SQL 0000–0011 збережені, нові повідомлення отримали номер **0012**. Непридатний для цього кандидата старий браузерний PASS не переноситься на новий код.
- Паралельний незакомічений owner-settings checkout знайдено в `/srv/knaba/ops/knaba-access-overlay-20261028` на базі `ab6533a`; його файли й робочий стан не змінюються. Зарезервована ним міграція 0010 збережена. Попередню відмову автоматичної перевірки щодо публічного GitHub push зафіксовано; іншим каналом публікація не обходиться.
- Візуальні зміни PR #114 `13de14a339231fb1f3ad43f3195d01133acf2099` інтегровані через Git merge в окрему гілку `feat/knaba-role-workspaces-20261028`; не повторювати їх.
- Поточний Portal уже має клієнтські/партнерські заявки, призначення працівників і статуси. AdminControlCenter уже монтує Portal/CRM/AssistantInbox/Studio в одному вікні.
- Приватні workerNote/customerFeedback/adminReply зберігають свої межі; двосторонні розмови — окремий, явно авторизований контракт.
- Developer grant раніше був еквівалентом owner. Для цієї вимоги всі його прикладні API та зміни публікації спрямовуються в окремий тестовий SQLite. Жодного перемикача на справжнього клієнта.
- Повна історія інших чатів недоступна (`Personal context is unavailable for this conversation`). Звіряються GitHub, canonical memory та доступні worktrees; це не повне читання чатів.
- Чинний ERP/PostgreSQL лишається джерелом операційних даних ERP. Сайт приймає заявки; нові екрани не заявляють неіснуючого ERP bridge, оплати чи зовнішньої доставки повідомлень.

## План і критерії приймання

| ID | Поведінка | Власник | Потрібні докази | Стан |
| --- | --- | --- | --- | --- |
| RW-01 | Збережені поточні auth/Portal/CRM/Studio, PR114 і паралельні правки | root + context_check | ancestry/diff; owner-settings checkout не змінено | COMPLETED |
| RW-02 | Після password/OIDC входу роль отримує свій кабінет; лише дозволені same-origin deep links | root | HTTP role matrix, invalid/cross-role redirects; browser password flow PASS; реальний OIDC provider UAT окремо | DEPLOYED / SYNTHETIC_QA_PASS |
| RW-03 | Новий відвідувач/очікуючий і схвалений клієнт/партнер можуть надіслати заявку; власні статуси та повтори без дублів | workspace_ui + root | real HTTP/SQLite і browser flow, включно з anonymous intake HTTP 201; чужі записи недоступні | DEPLOYED / SYNTHETIC_QA_PASS |
| RW-04 | Працівник/клієнт/партнер спілкується з керівником; ревокація/перепризначення не відкриває чужу розмову | portal_messages + workspace_ui | persistence/idempotency/CSRF/scope tests та browser reply PASS | DEPLOYED / SYNTHETIC_QA_PASS |
| RW-05 | Кабінети/адмінка працюють у поточному вікні, зрозумілі стани й Back; зміни не губляться при тимчасовому offline | workspace_ui | Chromium viewport/keyboard/draft/navigation/error cases PASS | DEPLOYED / SYNTHETIC_QA_PASS |
| RW-06 | Developer тестує owner/admin/client/partner/worker/bauleiter/pending/suspended тільки на власній окремій базі | root | isolation API tests, 36 browser checks і незмінні primary-data fingerprints PASS; одноразове запрошення підготовлене, live активація ще потрібна | DEPLOYED / USER_ACTIVATION_REQUIRED |
| RW-07 | Інтегрований source проходить gates та незалежний code review у межах test-domain release | root + незалежні автори/reviewers | exact runtime/test/receipt binding; review, Node/build та browser evidence | PASS_SCOPED_RELEASE |
| RW-08 | Той самий артефакт розгорнутий на kneba.vsp.rest, відновлення перевірено, live smoke підтверджено | root | CAS, backup/restored-copy rehearsal, 360 runtime hashes, 13-route live smoke; authenticated live role/order/chat UAT очікує активації | DEPLOYED / AUTHENTICATED_UAT_PENDING |

Команда runtime ChatGPT: root — auth/isolation/integration і rollout; context_check — concurrency audit, синтетичні browser fixtures, review release script і continuity docs; portal_messages — API/migration і review developer invitation; workspace_ui — UI/build. Спільні файли мають одного автора. Додаткових платних сервісів не активувати.

## Відновлення та межі

Міграція повідомлень additive; старі SQL не переписувати. Відновлена 0011 переносить таблиці запрошень/звернень транзакційно для допустимої ролі бауляйтера; upgrade і відновлення мають зберегти всі рядки. Попередній артефакт зберегти. Rollback старого runtime може використовувати окремий артефакт з поточною перевіреною директорією міграцій; необхідно також відключити тестового developer у старому runtime, який ще не має ізоляції. Не відновлювати стару базу поверх нових заявок/повідомлень. На live перевіряти тільки синтетичний developer workspace; реальні секрети, листування, customer DB або приватні адреси не потрапляють у Git/логи.

Перевірка live перед rollout: owner існує, але developer email/grant/акаунт відсутні. Початкове перевищення 90% диска усунено оборотним архівуванням **7 неактивних KNABA QA `node_modules`**. Перед прибиранням кожного кешу перевірені всі байти файлів, режими та symlink; приватний receipt містить `archiveBytes`, `archiveSha256`, кількість перевірених записів і точну команду відновлення: `/srv/knaba/ops/knaba-qa-dependency-archives-20261028-role-workspaces/receipt.json`. Source, бази, backups, evidence та чужі проєкти не прибиралися. Зафіксований storage checkpoint: **89.9024104%**, доступно **21,333,299,200 B**, **PASS** за незміненим правилом `<90%` і щонайменше 10 GiB вільного місця. Gate перевіряється повторно перед cutover.

## Попередня контрольна точка QA — 28.10.2026, до фінального приймання

Повні локальні прогони Node24 завершилися без помилок: **319 Vitest + 77 native website assertions**, **108 VPS tests**, root `npm test` — **4 file wrappers PASS**. Логи: `/tmp/knaba-role-final-site-tests.log`, `/tmp/knaba-role-final-vps-tests.log`, `/tmp/knaba-role-final-root-tests.log`. Попередній UI check: **332 файли, 0 errors / 0 warnings**; попередня збірка — **134 HTML сторінки**, DE/EN/UK/RU та незмінені payload budgets пройдені. Це окремі фактичні результати, а не приймання нового фінального артефакту.

Реальний ізольований browser QA попереднього кандидата з префіксом client SHA256 `03eb582` виявив дефект: Astro ClientRouter перехоплював кліки Solid-вкладок, порушуючи фокус і Back. На цій проміжній точці виправлення через `data-astro-reload` ще потребувало нової збірки й повного browser прогону; тоді browser/live PASS не заявлялися. Проблему виправлено й перевірено фінальними receipts нижче. Старі 87/87 з KN-ROLE-UX не використовувалися для приймання нового кандидата.

## Фінальне приймання і дозволений rollout — 28.10.2026

**Browser PASS:** фінальний role suite — **98/98**, developer suite — **36/36**, Chromium **155.0.8059.12**, обидва без JavaScript errors. Перевірено реальні HTTPS/SQLite сценарії на синтетичних даних: автоматичний вхід у відповідний кабінет у тій самій вкладці, role restrictions, заявки та призначення, повідомлення, фокус/Back і збереження чернеток. Developer receipt підтверджує `primaryData.unchanged=true`. Фінальний role suite повторно виконано на source `76f96f6f83d22403a1aa255e8bf2b98311807985`; HTTP status 201 записується окремо від статусу перевірки PASS. Runtime, тести й receipts пов'язані release attestation.

**DEPLOYED:** `/srv/knaba/vps/current` вказує на `/srv/knaba/vps/releases/76f96f6f83d22403a1aa255e8bf2b98311807985`. Client SHA256 — `8dccc07f54aa2ebd789567409053895f2c11d3ba055165319c03363b1a139ac0`; image — `sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205`. Runtime healthy, UID **1000**; **360 runtime hashes** збігаються з прийнятим артефактом. Після розгортання **13-route live smoke PASS**, SQLite integrity чиста, кількості наявних business rows збережені.

У ledger **13 міграцій**: історичні SQL **0000–0011** збережені, нова **0012** додана. На послідовному SQLite backup перевірено збереження всіх fingerprints наявних рядків і колонок після міграції. Ізольована репетиція rollback **старий runtime + поточна схема PASS**; це репетиція, а не факт live відкату. Live backup, CAS і незмінені storage gates пройдені; стару базу не відновлювали поверх нових записів. Повне порівняння рядків стосується ізольованої копії, а live перевірка — integrity і збереження business counts.

Фінальні докази: `corporate-site/docs/evidence/role-workspaces-20261028/acceptance-report.md`, `deployment-receipt.json`, `browser-receipt.json` та `developer-browser-receipt.json` у тій самій директорії. Runtime SHA вище лишається deployment pin; наступний docs/evidence commit зберігає документи й не означає повторне розгортання. Публічного GitHub push або merge у main не було; попередню відмову автоматичної перевірки публікації не обходили. Паралельний owner-settings overlay не змінено.

**Developer invitation: PREPARED / USER_ACTIVATION_REQUIRED.** Підтверджений receipt `READY_FOR_OWNER_HANDOFF` від **2026-10-28 11:08:08 UTC**: одноразове запрошення для синтетичного тестового доступу підготовлене на runtime76f, TTL **7,200,000 ms**, історичний строк дії — **2026-10-28 13:08:08.382 UTC**. Це обмежене в часі запрошення, не постійно чинний доступ; перед майбутньою передачею перевірити строк і стан. `primaryApplicationDataUnchanged=true`, `preexistingInvitationsUnchanged=true`, `acceptedRuntimeVerified=true`; після конфігурації той самий runtime/image/UID healthy. `primaryDeveloperAccountCreated=false`, `passwordGenerated=false`, `emailSent=false`, `activationRequired=true`. Токен і URL активації не зберігаються в канонічних документах; користувач сам задає пароль під час активації.

**Залишилось: USER_ACTIVATION_PENDING / AUTHENTICATED_LIVE_UAT_PENDING.** Підготовлене запрошення не є активованим акаунтом; live замовлення/перемикання ролей/розмову під справжньою активованою тестовою сесією ще не прийнято. ERP bridge, реальна provider delivery/OIDC, фізичні пристрої, інші браузери, screen reader та реальний owner UAT залишаються окремими непідтвердженими сценаріями. Повного доступу до інших чатів немає; continuity спирається на доступні source, memory та worktrees.

## Продовження 30.10.2026 — повноцінні кабінети на фізичному KNABA

Пряме доручення користувача: «зроби повноцини кабинети и залий на серве повнисттю повноцини».
Продовжується чинний web scope RW-01–08: клієнт, партнер, працівник, Bauleiter, owner/admin та ізольований developer workspace. Окремі ERP, payroll/GPS, нативні застосунки й платні зовнішні канали не підміняються кабінетами сайту.

База GitHub `045fc00e6e9b5a069416285f619e5cdc202778d8`, кандидат `feat/knaba-complete-cabinets-20261030`. Фактичний production до змін: artifact `71fd88c71f67e13f81ecacb5340b1b19eebcdb90bd35217efc75cc42bf20b383`; його дані не використовуються у синтетичних тестах. Чинне доручення дозволяє user-directed server deployment; окремий customer approval controller, QA і відновлення не підробляються.

| ID | Критерій | Виконавець | Стан |
|---|---|---|---|
| RW-09 | Кожна роль бачить свої заявки/людей за межами перших200; пагінація зберігає серверний scope та редаговані форми | cabinet_backend + cabinet_frontend | IMPLEMENTED / FINAL_VERIFICATION_PENDING |
| RW-10 | Адміністратор знаходить дозволених клієнтів/партнерів/працівників для нової розмови; Bauleiter бачить тільки свій об'єкт; приватні email не видаються | root | IMPLEMENTED / FINAL_VERIFICATION_PENDING |
| RW-11 | Огляд показує найближчі роботи й дії; пошук/фільтр людей; перехід із заявки до її розмови в тому самому вікні | cabinet_frontend + root | IMPLEMENTED / FINAL_VERIFICATION_PENDING |
| RW-12 | Невідома відповідь створення заявки повторює той самий payload/key, без дубля; явну помилку можна виправити | cabinet_frontend | IMPLEMENTED / FINAL_VERIFICATION_PENDING |
| RW-13 | Неможливі календарні дати відхиляються; конкурентна зміна identity не дозволяє запису заявки/аудиту | cabinet_backend | IMPLEMENTED / FINAL_VERIFICATION_PENDING |
| RW-14 | Exact-source Node24/site/VPS/build/security, справжні HTTPS/SQLite рольові сценарії та доступний browser/mobile QA, незалежний review | root + cabinet_release_audit | PENDING |
| RW-15 | Незмінний артефакт staged на сервері; backup/restore, штатна активація та live business smoke за чинними gates | root + cabinet_release_audit | PENDING |

Зовнішні платні витрати: EUR0, нові провайдери не активуються. Фактичні результати додаються після виконання; попередні PASS не переносяться на цей кандидат.
