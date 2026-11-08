# KNABA — KN-C08-B: конфігураційні boundaries

Початкова прийнята база: `e747fd94e219e09faffea96c2f9f84be15a6def1`. Після локальної паралельної роботи виконано fast-forward ізольованої гілки до independently accepted `bb223af67af9eae5f11e7ca225f89ddf97a8e4e2` / PR133; усі 14 локальних source/test/contract files побайтно збережено, incoming paths не перетинались. Новий кандидат потребує власного exact-source repository CI; native source/artifacts лишаються на bb.

## Контракт

- API й worker потребують явного non-demo COMPANY_ID у PRODUCTION. Чинний pattern: `^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$`. Для DEMO/TEST відсутній environment ID зберігає `knaba-demo`; явний неправильний ID не замінюється. Injected worker options потребують явного валідного ID.
- API PRODUCTION потребує HTTPS origin без credentials, non-root path, query чи fragment до створення Database. DEMO/TEST зберігають optional origin і HTTP(S). API використовує canonical URL.origin для authority comparisons.
- Worker не потребує public URL або додаткових auth/release secrets для jobs без посилань. Заданий origin перевіряється до adapters та повторно в injected startWorker; raw worker value зберігається для Telegram tickets. BOT_WEBSITE_ORIGIN і Telegram/WhatsApp purpose-specific guards зберігаються.
- Operator preflight використовує той самий company/origin contract та зберігає свої повніші deployment prerequisites. Помилки не друкують credentials-bearing URL.
- C08 mode checks та API production credential prerequisites залишаються. DB schema, domain permissions, native code, issuer/signing/provider activation не змінюються. Окремий template placeholder consumer gap залишається в черзі.

## Докази й бюджет

Спочатку відтворити missing-production-company та insecure-production-origin на справжніх compiled entrypoints із чинними PG/network/interval traps. Після виправлення — негативні й позитивні boundary tests, injected worker, preflight та provider regressions, TypeScript, mandatory exact-source hosted jobs і незалежний review. Ці checks не доводять live/device/company acceptance.

Локальна фаза не викликає providers, не створює сервісів і не змінює deployment. Після прийнятої native consolidation зарезервовано один source checkpoint і максимум один corrective checkpoint: не більше чотирьох автоматичних existing standard public Ubuntu repository runs, незмінні timeouts. Нові native runs цим інкрементом не плануються. Public visibility та official standard-runner pricing перевірені 08.11.2026; нова paid activation EUR 0, фактичні model/account balances UNKNOWN. Бюджет і canonical memory узгоджено з прийнятою bb-базою перед публікацією.

## Реалізація та локальне підтвердження

Спільний pure module `erp/apps/runtime-config.mjs` використано в API, worker і operator preflight; `.d.mts` зберігає TypeScript contract. Origin spelling перевіряється до URL normalization: приховані `/a/..`, encoded dot path, backslash, empty query/fragment/userinfo й control characters не стають дозволеним root. API бере canonical origin; worker зберігає raw string. BOT website проходить цей самий HTTPS guard, чинна `.invalid` заборона й пріоритет website над ERP збережені. Final Docker layers явно копіюють standalone helper; worker image успадковує API image.

Початкові three real-main RED cases (missing production company API/worker та HTTP origin API) доходили до PG_POOL trap; після fix ті самі 3 PASS. Розширені 238 PASS: 60 compiled-entrypoint cases, 70 worker, 47 shared contract, 22 Telegram config, 39 preflight. Після знайденої нормалізації BOT website відтворено окремі 7 FAIL/7 PASS (53 deliberately deselected) й виправлено guard; фінальні affected suites 137/137 PASS: 70 worker, 28 Telegram, 39 preflight. Runs overlap і не додаються як незалежні тести. TypeScript exit0. Незалежний source review ACCEPT після BOT correction; hosted acceptance нового commit ще PENDING і фіксується окремо в evidence.

Compiled-main probes мають явні PG/network/interval traps. Canonical peer comparison використовує лише дозволений GPS query double й зупиняється перед schema query; це не actual PostgreSQL acceptance. Standalone preflight smoke перевіряє два ізольовані final-COPY layouts по трьох scenarios, а не Docker image build. Actual full build/SQL acceptance належить наступному source-pinned CI.

Rollback не потребує міграції даних: повернення source до bb можливе лише зі збереженням явно перевірених APP_MODE, non-demo COMPANY_ID та clean origins у deployment settings; цей документ не дозволяє production rollback/activation. Встановлення валідного company ID не доводить ownership, tenant membership або production readiness.
