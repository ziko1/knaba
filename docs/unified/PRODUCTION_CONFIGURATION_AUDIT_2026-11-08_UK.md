# KNABA — аудит наступного конфігураційного інкременту

Дата: 08.11.2026. Read-only аудит `/root/knaba_prompt_review` на `e747fd94e219e09faffea96c2f9f84be15a6def1`. Статус **KN-C08-B: OPEN, реалізація й тести NOT_RUN**. Активний інкремент — зведення native/backend джерел; цей аудит зберігає наступну роботу в черзі.

## Підтверджені розриви

API main та workerOptions підставляють `knaba-demo` за відсутнього COMPANY_ID навіть у PRODUCTION. Передані startWorker options також оминають перевірку company. Operator preflight вже перевіряє bounded identifier і забороняє production IDs `knaba-demo` та `knaba-de-demo`.

API перевіряє URL-форму PUBLIC_ORIGIN, але не застосовує чинні preflight обмеження HTTPS та чистого origin. Контейнерні entrypoints запускають bundles без обов’язкового environment-check. Це authority input для CSRF, site identity peer та session reader.

Peer config зберігає canonical `URL.origin`, а API порівнює його з raw PUBLIC_ORIGIN. Дозволений фінальний `/` може спричинити помилкову невідповідність. API authority comparisons мають використовувати parsed origin, зберігаючи відмову для іншого scheme, host або port.

Джерела: `erp/apps/api/main.ts`, `erp/apps/worker/main.ts`, `erp/apps/api/auth.ts`, `erp/apps/worker/runner.ts`, `erp/scripts/environment-check.mjs`, container Dockerfiles. Вони звірені на зазначеному commit; нової реалізації цей документ не створює.

## Мінімальний сумісний контракт

Використати чинний pattern `^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$`. Відсутній environment company може зберігати demo fallback лише для явних DEMO/TEST. Явні значення мають бути валідними; у PRODUCTION додатково відхиляються обидва demo IDs. Injected startWorker options потребують явного валідного company без підстановки з environment. Company ID не trim/case-fold. Engine не має власного company binding, тому нову вигадану перевірку engine.companyId не додавати.

API PRODUCTION потребує HTTPS origin без credentials, non-root path, query чи fragment до створення Database. DEMO/TEST зберігають optional origin; задане значення має бути HTTP(S) origin, локальний HTTP лишається дозволеним. Повніші вимоги operator preflight не послаблювати. Помилка називає поле й не друкує URL із можливими credentials.

Worker jobs без public links не отримують нових обов’язкових PUBLIC_ORIGIN, AUTH_ENCRYPTION_KEY чи GIT_SHA. Перевіряти лише задані origins до adapters і повторно для injected options до startup. Зберегти BOT_WEBSITE_ORIGIN priority/HTTPS gate та Telegram opt-in. Не нормалізувати raw worker origin: Telegram tickets зберігають і повторно перевіряють exact public_origin. Чинна WhatsAppRouter заборона HTTP поза non-production loopback лишається окремим guard.

## Окремий consumer gap

WorkerRunner template delivery підставляє `https://knaba.example.invalid` за відсутнього origin. Можливе окреме виправлення — відхиляти саме template delivery до SENDING/provider call, зберігши text/manual jobs без public URL. Цей audit не визначає legal retention periods, provider authorization, DNS ownership або нові hostname allowlists.

## Необхідні докази наступної реалізації

Потрібні production company/origin negative matrices, DEMO/TEST compatibility, injected worker boundaries, positive PG_POOL controls, еквівалентність дозволеного root origin з `/` і без нього та відмова для чужого origin, raw Telegram ticket compatibility, preflight parity й чинні C08/provider regressions. Використати вже прийнятий compiled-main стенд із явними traps. Після цього — exact-source hosted tests та незалежний review. Конфігураційна перевірка не є доказом права на компанію або готовності production.
