# Поточна реалізація V4

## Поточний checkpoint — 11.10.2026

Вихідний код: **`a10e70911fb519ec7d8199fa66141cd12b462926`**, дерево **`c62487ef71a88352df52bf5d396ce2b27f0bbd6c`**. Стан перевірки: **TECHNICAL_SCOPE_VERIFIED_PRODUCT_NOT_READY**. [PR #6](https://github.com/ziko1/knaba/pull/6) продовжує PR #5; його виправлення SQL fixtures збережено. Фактичні результати й історія: [recovery receipt](../evidence/assistant-replay-20261011/verification.json).

Реалізовано відновлення вже збереженої AI-відповіді без дубля, повторного виклику провайдера або хибного handoff. Повтор дозволено лише для одного підтвердженого невиконаного запиту з нульовими сумами; історія резерву зберігається. Перед викликом провайдера фіксується консервативний маркер початку, а старий lease не може обнулити резерв нового виконавця. Невідомий результат залишає резерв невирішеним. Додано 13 справжніх PostgreSQL replay-сценаріїв і один сценарій історичних ACCEPT/REOPEN показників без зміни прийнятого оригіналу.

[Application CI 38098204054](https://github.com/ziko1/knaba/actions/runs/38098204054) завершено **SUCCESS**: **2 242/2 242 PASS, 0 FAIL, 0 SKIP**, з них **1 821 CPU/document/explicit-double** і **421 справжній PostgreSQL**. Пройшли всі 40 історичних failure mappings, 65 нових PostgreSQL cases та три залишкові сценарії попередніх кандидатів; це підмножини загальної кількості. Усі **27/27 браузерних сценаріїв** пройшли з першої спроби: 26 actual backend/UI й один явний HTTP fixture. TypeScript/build/Docker та сім acceptance stages — PASS, включно з відновленням 17 таблиць і 12 private blobs та двома незалежними worker процесами. Локальний SQL результат окремо лишається NOT_RUN.

[Native CI 38098204040](https://github.com/ziko1/knaba/actions/runs/38098204040): обидва jobs SUCCESS; **66 host Java** і **19 actual iOS Simulator XCTest PASS**, lint **0 errors / 10 warnings**. Незалежно перевірено native архіви й 45 iOS bundle hashes. Фізичні пристрої та підпис компанії цим не прийняті.

Пакети вихідного коду, документації й обидві runtime частини завантажено та звірено за довжиною, SHA-256 і ZIP CRC. **454 source files**, **113 спільних runtime source files** і **14 build files** збігаються з exact source; runtime відновлено до **45 024 537 bytes** з правильним повним хешем. [Повний індекс доказів](../evidence/assistant-replay-20261011/README.md) містить збережений стиснений оригінал звіту про всі 2 242 тести.

Це окремий технічний обсяг. Всі 72 compound V4 критерії та реальні company/provider/physical/load/offsite gates не закриваються сумою тестів. Нижче збережено історичний checkpoint 08.10.2026; його фрази про відсутність candidate SHA та невиконані SQL перевірки стосуються тієї дати. Незавершені D07 контракти й зовнішні передумови залишаються в канонічному реєстрі.

Стан на **11.10.2026 UTC**: **поточні SQL/runtime виправлення пройшли фактичні hosted-перевірки; повний продукт NOT_READY**. Ціль V4 і збереження NestJS/PostgreSQL SQL/outbox затверджені користувачем через ADR-0002. Оригінальний V3 master та історичні докази збережені.

Опублікований повний план: `2fb35d4219d637b1e1c8742459c8f352b31b469d`. Остання повністю перевірена й передана історична executable-база: `ca9ed79ff4c0429223eb60754289ee1132088361`; її докази не приймають поточні зміни V4.

## Поточний candidate і фактичне виконання

Executable SHA **`3f4370c3b3ba66941a42f6840db0f25ae57fca65`**, Git tree `464057c0a7cea50a7a55eb1d5f88fb95f3203225`, гілка `codex/knaba-v4-sql-recovery-20261011`, [draft PR #5](https://github.com/ziko1/knaba/pull/5). Документаційне оновлення не змінює tested code SHA.

| Перевірка | Фактичний результат і межі |
| --- | --- |
| Поточний локальний прогін | **1 821 CPU/document/explicit-double PASS, 0 FAIL; 407 genuine PostgreSQL SKIP/NOT_RUN**. Разом 2 228 точних case identities у 89 файлах; TypeScript PASS. |
| Поточний application CI | [38097796239](https://github.com/ziko1/knaba/actions/runs/38097796239), job `114347231650`, source `3f4370c3b3ba66941a42f6840db0f25ae57fca65`: **SUCCESS**, завершений стан підтверджено **11.10.2026 00:29:15 UTC**. **2 228/2 228 PASS, 0 FAIL, 0 SKIP**, 89 файлів: **1 821 CPU/document/explicit-double та 407 genuine PostgreSQL PASS**. |
| Поточні browser-перевірки | **27/27 PASS**, 0 FAIL/SKIP/FLAKY: 26 сценаріїв зі справжнім backend/UI та одна явна HTTP-імітація. |
| Поточні build/recovery/Worker/packaging | TypeScript/build, Docker/source-worker guard, encrypted backup, відхилення підміни backup, restore в окрему порожню DB/private blobs, дві фактичні Worker-фази та hosted packaging **PASS**. |
| Поточний native CI | [38097796144](https://github.com/ziko1/knaba/actions/runs/38097796144), той самий source: **SUCCESS**. Android **66 host Java PASS**, debug APK, lint **0 errors / 10 warnings**; iOS **19 actual XCTest PASS**, 0 FAIL/SKIP на iPhone 16 / iOS 18.5 Simulator. Завантажені native artifacts, payload hashes, 45 iOS bundle-файлів і відповідність фактичного підготовленого simulator перевірені незалежно. |
| Попередній hosted checkpoint | `1cbdbdcacb69a03f2fd9e9ad44c3bb358ac619f6`, [run 38096631407](https://github.com/ziko1/knaba/actions/runs/38096631407): **FAILED**, 2 226/2 228 PASS, 2 FAIL, 0 SKIP; 1 821 CPU PASS та **405/407 genuine PostgreSQL PASS**. Усі **51 новий PG case PASS**, 27/27 browser PASS, restore і справжні Worker-перевірки PASS. Ці результати належать лише цьому checkpoint. |

Поточний [execution index PR #5](https://github.com/ziko1/knaba/blob/3f4370c3b3ba66941a42f6840db0f25ae57fca65/docs/evidence/offline-execution-scope.json) має SHA256 `fd14d358f51cb471fcc1061e51602cb03e74f5755d1b172dffa87049c170003a`; executable source manifest SHA256 `0b9e6bdbc6fd82983e1017933e4b8f521f5a97d90b6a0f12c7e8d32c274161d4`. Він зберігає точні case identities/classes, дві явні семантичні заміни digest і чотири попередні заміни; `sourceChangedAfterReport` порожній. Локальна класифікація не є виконанням PostgreSQL.

Фактичні докази: [підсумок виконання](../evidence/sql-recovery-2026-10-11/README.md), [точна перевірка source/cases/stages](../evidence/sql-recovery-2026-10-11/verification.json), [native receipt](../evidence/sql-recovery-2026-10-11/native-summary.json). Незалежно завантажений application evidence artifact `11686537370`: **8 163 623 bytes**, SHA256 `076e43dea4943dee0b304cc1854ee04df8289d6de6cb246557ea454d0d4bcacf`; CRC усіх 113 ZIP entries, exact source/tree та всі 14 built-file hashes перевірені. Повна незалежна передача всього runtime лишається окремим кроком.

На `1cbdbdc` відновлено 39 із 40 раніше невдалих SQL-сценаріїв. Дві помилки всього прогону залишилися у fixtures handoff-calendar та work-notifications: запит AI без SQL lease очікував помилку стану каналу; порівняння адресатів сповіщення залежало від порядку рядків. У `3f4370c` fixtures виправлено: handoff окремо перевіряє відмову без lease та `AI_SUPPRESSED` з чинним job/lease і трьома source guards, використовує збережений час членства та перевіряє видимість; адресати звіряються без випадкової залежності від порядку. **Обидва залишкові кейси пройшли; усі 40 зіставлень історичних SQL-помилок мають поточний PASS**, включно з двома явними V4 REWORK replacements. [Історичний FAILED `1cbdbdc`](../evidence/sql-recovery-2026-10-11/historical-1cb/verification.json) збережений окремо.

## Реалізовані зміни та нові регресії

Engine/Worker прив'язують відповідь асистента до справжнього поточного SQL job, його type/data і lease, canonical service account, конфігурації, каналу та вхідного повідомлення. Перевірки діють до повернення cached receipt, викликів provider/tools і фінальної відповіді. Вузький доступ до конкретного assistant config не надає загального права читати конфігурації; відкликане або завершене членство service account автоматично не відновлюється. [Engine](../../apps/api/engine.ts), [Worker](../../apps/worker/runner.ts).

Відомий provider outcome обліковується у `finally` навіть після втрати lease/повноважень; скасування до першого виклику звільняє резерв з нульовою вартістю, а невідомий результат зберігає резерв. Це **облік за налаштованою оцінкою вартості**; зовнішні AI/provider transports у цих тестах є явними імітаціями, фактичні рахунки провайдера не перевірені. Повторне використання idempotency key зі зміненим payload повертає V4 `IDEMPOTENCY_CONFLICT`. Fixtures узгоджені з явними поточними правами, canonical IDs та незмінністю прийнятих business facts; відмови й відсутність побічних записів перевіряються явно.

Додано **51 genuine PostgreSQL regression case**: [29 перевірок answer authority](../../tests/assistant-answer-authority.integration.test.ts), [16 перевірок runtime](../../tests/assistant-runtime.integration.test.ts) та [6 перевірок load seed](../../tests/v4-load-seed.integration.test.ts). Seed CTE у [load runner](../../scripts/v4-load.mts) має явний `$4::text`. **Усі 51 пройшли на поточному `3f4370c`**; їхній попередній PASS на `1cbdbdc` також збережений. Шість малих seed-сценаріїв не є вимірюванням повного навантаження.

## Збережений обсяг реалізації V4

Реалізовано вихідний код: точні десяткові ставки/розбиття часу, 10-хвилинну MFA, незалежний Lead review і внутрішню верифікацію вимірів, незмінний опублікований кошторис/acceptance, збереження прийнятого завдання з окремою переробкою, GEOFENCE_V1/видані сервером lease/boot/monotonic/reconciliation, native 72-годинну GPS-чергу, незалежне payroll/payout погодження та reconciliation/нові заяви, ліміти фото10/PDF20MiB, quiet20–07/retry1–5–15/обмежені geo reminders, generic signed inbound/quarantine/minimized approved outbound, іменовані REST та opaque keyset pagination, повторювані atomic-PG uploads, approved-retention production gate. Форми мають контекстні довідники, явний null і конфіденційний PDF.

Календар оператора, guards замовлення, багаторядкові матеріальні заявки, серверний device batch, current-source сповіщення та форми canonical employee ID підключені до серверу/Worker/UI. Scope/replay регресії включені до поточного прогону; SQL/browser/native докази прив'язуються до фактично виконаної SHA, а повне load-вимірювання лишається окремим кроком. Детальний 22-delta реєстр: [V4_IMPLEMENTATION_STATUS.json](V4_IMPLEMENTATION_STATUS.json).

## Межі готовності та відкриті кроки

**Усі 72 compound V4 критерії залишаються NOT_RUN.** PLAN-03 має виконання **IN_PROGRESS**; scoped SQL/runtime перевірки **PASS** не закривають складені критерії чи весь пакет. Історичні статуси 475 V3 критеріїв збережені; їхнє поточне повне приймання також не виводиться із кількості тестів. Exact-SHA hosted SQL/browser/build/restore/Worker/native/packaging пройдено в наведеному обсязі; незалежна перевірка завантажених application evidence/native artifacts не є повною передачею всього runtime. Company signing, фізичні пристрої, справжні providers, company UAT і production мають окремі відкриті gates.

Railway URL залишається NOT_READY. Попередній cutoff сплив; reviewable tested patch, конкретне поновлене вікно та Dashboard MFA потрібні для запуску. Погоджений ліміт €10/місяць не змінений; recurring cost ще не виміряна. Єдиний зовнішній список: [EXTERNAL_PREREQUISITES.md](../EXTERNAL_PREREQUISITES.md).

Явні незавершені source-контракти D07: персональні offer DECLINED/EXPIRED та їх UI; окреме поле залишку у published report; узгоджений state-preserving callback пізнього матеріального забезпечення для IN_PROGRESS. Для D20 / PLAN-27 core load runner, окремий CI job і seed regression cases створені; **повний 900-секундний прогін зі 100 одночасними сесіями та 100 000 TimeSegments, latency/SLO, RPO/RTO і фактична вартість NOT_RUN**. Наявні restore/seed докази не вимірюють ці цільові показники.

## Історичні локальні checkpoints — 08.10.2026

Проміжний локальний integration прогін 08.10: **1 648 PASS, 0 FAIL, 295 genuine PostgreSQL NOT_RUN**. Вихідний код після нього продовжував змінюватися; цей snapshot не є поточним exact-SHA release proof.

Заморожений локальний прогін 08.10: **1 821 CPU/document/explicit-double PASS, 0 FAIL; 356 PostgreSQL NOT_RUN**, 87 файлів / 2 177 точних case identities. TypeScript PASS; classifier/packager EXACT_INDEX_VALIDATED, 4 явні V4 заміни застарілих кейсів. Executable source manifest SHA256 `b5e3505381fb3e2f07b36733af74e037b04ec44ef9778d4eb3bd7d0910f6ffd9`. [Історичний доказ](../evidence/v4-source-freeze-local-summary.json) збережений з його початковими результатами; поточний inventory і статус CI наведені вище.
