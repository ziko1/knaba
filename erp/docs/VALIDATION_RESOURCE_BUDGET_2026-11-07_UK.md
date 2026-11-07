# ERP — обмеження роботи валідатора, GHSA-mrhx-c7xc-m3w5

**Статус: APPLICATION_BOUNDARY_MITIGATION; DEPENDENCY_ADVISORY_OPEN.** Це захист перевірених вхідних меж, а не виправлена версія Zod або загальне security acceptance.

## Причина й сумісність

Production dependency audit виявив `zod@3.25.76` і залежний `zod-to-json-schema@3.24.6`. [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) позначає версії нижче 4.6.6. [Офіційний fix #6652](https://github.com/colinhacks/zod/pull/6652) додає ранню перевірку constrained collections у v4; [issue #6653](https://github.com/colinhacks/zod/issues/6653) для v3 залишається відкритим, а maintainer повідомив про припинення нових v3 releases. Первинні джерела перевірені під час цього аудиту; оцінка тут спирається також на локально відтворену поведінку.

Малий контрольований PoC на встановленій версії: масив із 1001 числового елемента у `z.array(z.object({name:z.string()})).max(10)` створює **1002 issues**. Отже, сама `.max(10)` не припиняє обхід. Початкові три security regression tests фактично впали до правки і пройшли після неї.

ERP використовує Zod3 не тільки для введення: його schemas формують command catalog, OpenAPI, UI command forms та AI tool catalog через `zod-to-json-schema`. Неперевірена major-міграція може змінити ці контракти. Package manifests і lockfile залишено без змін; audit findings не приховано allowlist або зміною номера пакета. Перехід на `zod/v3` всередині нового Zod4 не виправляє цей v3 parse path.

## Реалізований захист

`assertValidationInputBudget` до Zod перевіряє JSON-подібну структуру: максимум **1000** елементів масиву/власних полів об'єкта, **20000** відвіданих nodes, **20** рівнів вкладеності; цикли відхиляються. Завеликий масив відхиляється до читання його елементів. Перевірка не створює окремі issues для кожного елемента і не серіалізує payload. Повторні нециклічні посилання дозволені; значення не мутуються.

- HTTP middleware працює після чинних byte-bounded JSON parsers і до controllers для body/query. Відмова — обмежена відповідь HTTP 400 з `VALIDATION_INPUT_LIMIT_EXCEEDED`, без payload/PII та з `Cache-Control: private, no-store`.
- `Engine.execute` перевіряє envelope до schema parse, hash і PostgreSQL transaction, включно з внутрішніми викликами поза HTTP.
- Спільний `readBoundedProviderJson` читає DeepSeek completion, Maps routes, WhatsApp send receipts і WhatsApp media metadata потоком із верхньою межею **262144 bytes**. Завеликий stream скасовується; відсутність або неправдивий `Content-Length` не обходить підрахунок фактичних bytes. Структура зовнішнього JSON і вкладеного DeepSeek model JSON перевіряється до Zod. Media bytes зберігають окремий наявний cap і не проходять через JSON reader.
- Відмова reader не видається за підтверджену provider-відмову: Maps повертає чинний `UNAVAILABLE`; WhatsApp send зберігає `failure_class: UNKNOWN`, `retryable: false`, щоб не дублювати фактично прийняте повідомлення; DeepSeek повертає `AI_INVALID_JSON` для resource-limit помилок. Auth/consent і provider activation gates збережено.
- Чинні media/CSV/string byte limits, schema field constraints, authentication, permissions, company isolation, command idempotency та JSON-schema exports збережені. Новий structural budget — додаткова transport/validation межа; великі пакетні запити слід розбивати на допустимі частини, а не підвищувати ліміт без оцінки.

## Перевірки й межі приймання

Final focused regression: `validation-budget.test.ts`, `integrations.test.ts`, `internal-assistant-provider.test.ts`, `command-form-v4.test.ts`, `automation-schedule.test.ts` — **204 PASS, 2 SQL SKIP, 0 FAIL**. Дев'ятнадцять нових cases перевіряють pre-Zod/pre-transaction відмову, HTTP body/query, depth/nodes/cycles, shared references, допустимі великі строки, stream cancellation, exact byte boundary/UTF-8 та валідні DeepSeek/Maps/WhatsApp результати. WhatsApp HTTP 200/429 oversized receipts окремо перевіряють UNKNOWN/no-retry. TypeScript після shared-reader розширення — **PASS**.

Повний фінальний suite: **2069 PASS, 460 SQL SKIP, 0 FAIL/TODO**, 2529 assertions у 109 файлах, exit 0. [Evidence з SHA-256 змінених джерел, залежностей і фактичних JSON reports](evidence/validation-budget-2026-11-07.json) зберігає точну межу candidate verification. Base Git SHA не видається за commit незакоміченого patch.

`npm run build` — **PASS**, exit 0; Vite 5m 24s. API/worker sourcemap contents звірено з точними байтами всіх восьми змінених runtime-файлів після code freeze; артефакти захешовано в evidence. `release.json` правильно позначає `source_dirty=true`: це локальна candidate build, а не clean final-SHA release. Frontend JS/CSS hashes і попередження про великий JS chunk не змінилися від baseline.

Незалежний review фінального shared-reader scope — **ACCEPTED**, блокувальних зауважень немає. Reviewer звірив source fingerprints і фактичні focused/full reports, зокрема WhatsApp UNKNOWN/no-retry та worker retry predicate. Це приймання вузького mitigation; upstream advisory залишається **OPEN_WITH_MITIGATION**.

SQL SKIP — це NOT_RUN, а не acceptance. Це CPU/adapter перевірки з явно синтетичним provider fetch, без реального AI запиту або live customer data. Після source review залишається hosted/integrated acceptance на фінальному SHA.

Захист не змінює реалізацію самого Zod, не є універсальним issue-count cap і не покриває довільні майбутні прямі виклики валідатора без цих меж. Потрібні окрема контрольована міграція на підтримуваний Zod, parity command/OpenAPI/UI/tool schemas, повний SQL/browser regression, новий dependency audit та незалежний review. До цього finding лишається відкритим і не дає підстав позначати весь продукт безпечним або готовим до передачі.

Rollback — повернути лише цей scoped patch до попереднього reviewed source; він не має міграцій БД і не змінює persisted data. Відкат поверне попередній ризик неконтрольованого validation work, тому production promotion без окремого рішення не допускається.
