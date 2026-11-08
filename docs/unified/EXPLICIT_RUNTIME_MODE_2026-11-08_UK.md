# KNABA — явний режим API та worker (KN-C08)

База: прийнятий F4-B `e740ef969e2a6a261f0e7ba613b741ed889ec0fe`, tree `7df9516f9efa51482489f1c39dcf44c77e8fcc9b`, [PR131](https://github.com/ziko1/knaba/pull/131), [CI42481614075](https://github.com/ziko1/knaba/actions/runs/42481614075). Його результати належать F4-B; цей новий patch має пройти власну перевірку.

## Підтверджена проблема

API environment schema мала default `DEMO`; workerOptions підставляв `DEMO` за відсутнього APP_MODE. Режим впливає на production MFA та synthetic/provider policies, тому відсутня конфігурація могла обрати слабші правила без явного рішення оператора.

Передані безпосередньо в startWorker options оминали workerOptions. Переданий Engine також оминав constructor validation нового Engine. Так могли одночасно існувати різні режими в WorkerRunner та Engine. Окремі environment preflight і Railway staging helper також підставляли DEMO.

## Контракт

- API потребує точного APP_MODE: `DEMO`, `TEST` або `PRODUCTION`. Відсутнє, порожнє, lowercase чи інше значення відхиляється до створення Database.
- workerOptions перевіряє режим першим, до конструювання adapters та опрацювання provider configuration.
- startWorker повторює перевірку до Database/WorkerRunner незалежно від того, чи options передано явно. Режим переданого Engine повинен точно дорівнювати options.appMode.
- Environment preflight перевіряє явне значення й не замінює missing/empty режим на DEMO.
- Railway waitForExpectedApi приймає лише явно передані DEMO або TEST, як передбачено його staging-контрактом. Його declaration також робить mode обов’язковим. Помилковий режим відхиляється до HTTP-очікування. Це не розширює дозволений staging cutoff чи production authorization.
- Seed зберігає вже чинний контракт: тільки explicit DEMO/TEST; PRODUCTION відхиляється.

Глобальний constructor default Engine та внутрішні domain fixtures не переписуються. Нових залежностей, каналів чи provider calls немає. Існуючі production credential/readiness gates діють і після вибору валідного режиму; сам APP_MODE=PRODUCTION не означає готовності до production.

## Перевірка й межі

Потрібні негативні startup-сценарії, які доводять відмову до DB/provider/initialize/timer boundaries, позитивні контроли для явних режимів і відмову при невідповідності injected Engine. Процеси з явними DB/network traps мають бути позначені як boundary tests, а не SQL або live acceptance. Existing provider opt-in та staging tests повинні зберегти свій зміст із явним TEST/DEMO у synthetic fixtures.

Після source review потрібні exact-commit збірка та обов’язкові repository jobs. Прибирання default не дозволяє вимкнути production перевірки для проходження тестів. У середовищах, які раніше залежали від default, оператор повинен явно вказати правильний режим; автоматична підстановка при міграції заборонена.

Окремими відкритими питаннями залишаються COMPANY_ID fallback і різниця між перевіркою production origin у main та preflight. KN-C08 не змінює ці контракти без окремого аналізу й перевірки. F3 issuance, решта F4 privacy/background policy, фізичні пристрої, store signing, UAT і весь продукт залишаються відкритими.

## Локальне приймання candidate

Незалежний runtime review п’яти файлів — ACCEPT; root окремо перевірив сім змінених test/fixture inputs. Усі 13 review hashes збіглися. [Source inputs, команди, журнали та межі](evidence/explicit-runtime-mode-20261108/verification.json).

Фінальний focused прогін: 123/123 PASS у шести файлах — 38 worker, 19 compiled entrypoint, 22 Telegram configuration, 21 Railway gate, 16 preflight і 7 seed. TypeScript після зміни declaration завершився exit 0; root policy tests — 30/30 PASS. Окремо перевірено одну змінену integration fixture; інші 78 cases цього цільового запуску свідомо не обиралися й не зараховуються до acceptance.

Entrypoint fixture компілює справжні API/worker main через pinned esbuild із Node24 target, external packages та createRequire banner. Plain Node виконує їх із явними PG Pool/network/interval traps. Це candidate boundary bundle без release metadata/assets banner, не production artifact, не повний startup і не SQL/live PASS. Перший tsx-loader стенд зафіксував 19 FAIL через власний локальний IPC завантажувача; журнал збережено, усі traps залишено активними після переходу на compiled entrypoints. Проміжні та seed перевірки перекриваються з фінальними 123 і повторно не додаються.

Exact committed source ще потребує обов’язкових hosted jobs та незалежної звірки raw logs. Нових DB migrations немає. Source rollback до прийнятої бази можливий лише зі збереженим перевіреним явним APP_MODE у конфігурації; це не дозвіл на production операції або відновлення implicit DEMO.
