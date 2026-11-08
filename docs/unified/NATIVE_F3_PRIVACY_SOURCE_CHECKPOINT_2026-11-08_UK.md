# Native F3 і privacy v2: інтегрований source checkpoint

**Статус: SOURCE_REVIEWED, ACTUAL_NEW_CI_PENDING; весь KNABA DE — NOT_READY.** Цей запис фіксує підготовку одного спільного кандидата після прийнятого F3 technical gate на `6a395bb73501455371a0e281debf81a6c18c6329`, tree `e81d6947e96038174d9ec8e2741250713b804396`. Нові зміни ще не мають власного clean committed CI acceptance. Старий PASS не переприв’язується до нового коду.

## Що інтегровано

Рівно **59 перевірених implementation/test/feature-documentation inputs** скопійовано з незалежно розглянутих manifests: Android 21, iOS 19, privacy backend 7 та web/UI 12. Спільний SHA-256 від упорядкованих пар path/hash: `8cb9bc8d43f72f848cb73e0a1c10aae00418b3386c9d9830cb1aa09f5338d0fa`. Перелік, розміри, hashes, component manifests і reviews містить [preparation receipt](evidence/full-completion-20261108/native-f3/source-preparation/receipt.json). Git documentation/evidence wrappers не входять у ці 59 source inputs.

### Вхід через сайт у мобільних TEST-застосунках

Android використовує `knaba-android-test-v1` і `de.knaba.mobile.test:/auth/federation/callback`; iOS — `knaba-ios-test-v1` і `de.knaba.mobile.ios.test:/auth/federation/callback`. Потрібні точний compiled Debug registry, свіжий ERP mode TEST та серверна реєстрація. Production/DEMO не дозволяють цей шлях. Android Release не має callback Activity; iOS Release source/configuration не має TEST registry чи scheme. Production verified links і signing ownership залишаються окремою вимогою.

Обидва клієнти використовують системний браузер, S256/state, точний issuer/callback та новий KF3 cookie. Token exchange не отримує старого app cookie. Якщо тіло успішної token-відповіді втрачено, доступна лише явна перевірка `/me` з новим cookie-кандидатом. Старий `/me` не підтверджує новий вхід; повторного автоматичного token POST немає. Локальне recovery вікно обмежене 120 секундами, monotonic clock і відомими expiry. Secrets залишаються в RAM; втрата процесу потребує нового входу.

Перевірений мережею кандидат залишається приватним до фінального переходу на UI thread/MainActor. Перехід повторно перевіряє початкову сесію, поточні права, cancellation, expiry, foreground/presentation та доступність журналу. Лише після цього нові client/cookie/actor/CSRF встановлюються разом. Старий transport назавжди retired; його запізнілі дії не отримують нові credentials. Помилка або скасування до переходу зберігає старий акаунт. Valid historical/UNKNOWN recovery залишається окремо, без автоматичного повторення команд або видалення журналів. Employee device/GPS transport не змінюється.

### Privacy v2

ACCESS-запит може явно обрати projection v2. Відсутній version зберігає legacy v1; явні некоректні значення не перетворюються на v1. ERASURE не отримує нового version або нової політики видалення. Після подання version і категорії незмінні; чинний незалежний legal review залишається обов’язковим.

PROFILE v2 додає дозволені own-user federation metadata через шість обмежених SQL groups із перевіркою ownership перед LIMIT. Загальна межа — 25000 raw records перед aggregation. Secrets, proofs, PKCE, raw audit/operation JSON і непідтверджена site identity не експортуються. Malformed owned data, overflow або недоступний loader атомарно відхиляють export. Same-key replay повертає початкові bytes; saved download звіряє owner/company/version/scope та збережений artifact. Web UI перевіряє fresh catalog, immutable ACK, idempotency, company boundaries та late responses. Докладний контракт і rollback: [privacy source checkpoint](PRIVACY_V2_SOURCE_CHECKPOINT_2026-11-08_UK.md).

## Фактичні локальні докази

| Обсяг | Виконано | Межа доказу |
|---|---|---|
| Android compile/Robolectric | 81 PASS: 72 чинні + 9 F3; 0 failure/error/skip | JVM/Android simulation; фізичний пристрій і системний браузер не перевірені |
| Android lint | 0 errors, 20 warnings | Warnings збережені; це не нуль зауважень |
| Android manifests | Actual AGP Debug callback присутній; Release callback відсутній | Merged manifests, не Release APK або store acceptance |
| Android protocol | 901 assertions PASS | Explicit connection/journal doubles; не 901 незалежний test case |
| Android HTTP | 74 assertions у 4 actual loopback scenarios PASS | Контрольована HTTP fixture з origin remapping; не live ERP/browser |
| Android baseline host contracts | Transport 76 / media 71 / media IO 17 / credential 30 / discovery 109 assertions PASS | Окремі групи, не загальний підсумок test cases |
| iOS portable config | 8 tests PASS; source plist/config, shell syntax, whitespace PASS | Swift compilation і XCTest execution NOT_RUN locally |
| iOS XCTest inventory | 65 нових authored + 145 незмінених = 210 | Це inventory, а не виконаний PASS |
| Privacy backend | Авторські 204 CPU PASS; незалежні 27 є підмножиною 204 | Actual PostgreSQL/HTTP 15 NOT_RUN locally |
| Privacy UI | Final model 30 independently PASS; scoped contract/report guards перевірені | Rendered privacy 11 / aggregate 30 лише зібрано, execution NOT_RUN locally |
| ERP build | Corrected TypeScript/Vite/server/worker build exit0 | Dirty worktree на base6a; початковий exit2 збережено; нового clean artifact acceptance немає |

Curated native evidence містить 51 byte-identical text/JSON/XML file плюс preparation receipt. [Android source/evidence review](evidence/full-completion-20261108/native-f3/source-preparation/android/independent-corrected-review.json), [незалежний Android UI review](evidence/full-completion-20261108/native-f3/source-preparation/android/independent-ui-review.json), [iOS source review](evidence/full-completion-20261108/native-f3/source-preparation/ios/independent-review.json) та [privacy documentation review](evidence/full-completion-20261108/privacy-v2/source-checkpoint-review.json) обмежені зазначеними scopes. Raw browser images/reports не додані.

## Виявлені й виправлені дефекти

Android має збережені behavioral RED→GREEN докази для передчасного adoption при paused main loop, повернення credentials у старий transport, помилки strict media-journal preparation та відкладеного старого dialog callback після зміни акаунта. Для останнього старий код змінював screen із 7 на 8; виправлений case проходить. Перші помилки самого fixture (Integer/Long та недренований UI message) позначені окремо й не використовуються як доказ дефекту. Регресію render-time button guard також збережено; виправлення залишає screen guard і exact intent-time transport fences.

Незалежний iOS review виявив Task cancellation між VERIFIED і MainActor commit. V2 додає cancellation checks до/після bounded journal recheck та відповідний authored regression. Без локального Swift compiler цей випадок ще не є фактичним RED→GREEN. Початковий review і frozen-v1 manifest збережені, 65 нових XCTest очікують CI.

Privacy review виправив порівняння неочищеного reason із серверним trimmed ACK і недостатню перевірку explicit companyId. Initial findings, focused RED, corrected review та початковий невдалий build збережені. Виправлений final model і build прийняті в локальному source scope.

## Наступний обов’язковий gate

Опублікувати один clean reviewed candidate у чинну feature branch/draft PR 129 після root source/module/release-policy checks. Використати лише наявний стандартний workflow set і вже зарезервований checkpoint у [BUDGET](BUDGET.md): без нових jobs, більших runners/timeouts, manual dispatch або docs-only push.

Потрібні всі required repository jobs, **15 actual privacy PostgreSQL/HTTP cases**, збережені F3/F2 SQL/runtime checks, **30 rendered cases у 4 файлах**, включно з 11 новими privacy cases і 19 попередніми, без skip/retry/flake. Для Android потрібні нові CI tests/lint та фактичні APK/AAB receipts. Для iOS потрібні actual compiler, **210 XCTest без skip**, resolved Debug/Release configuration evidence, compiled Debug plist, simulator install/launch і source-pinned artifact. Generated Release settings не підмінюють Release compilation або підписаний iPhone build.

Нові APK/AAB ще не створені цим checkpoint. Version/identifiers/minimum OS/signing settings не змінені. CI debug certificate не оголошується сумісним із раніше переданим local APK; для local update candidate треба зберегти попередній signer і перевірити actual package. Physical install/upgrade/data retention та iPhone distribution залишаються NOT_RUN.

## Rollback і незакритий обсяг

Цей checkpoint не додає міграцій схеми БД/індексів або нових серверних RPC/HTTP endpoints. Чинний privacy command DTO явно розширено projectionVersion зі збереженням legacy-відсутності поля. Retention TTL, destructive purge і політику erasure не змінено. Для privacy після появи stored v2 requests неприпустимий blind rollback до v1-only handlers: потрібен version-aware compatibility build або припинення відповідних mutations. Не relabel v2 у v1, не перераховувати checksum і не видаляти дані для сумісності. Джерельні worktrees, preimages і failure evidence збережені.

Native remote push залишається наступною source-задачею. Read-only contract review окремо перевіряє всі WEB availability producers, parent-session lineage, consent/revoke/account-switch та provider/address family. Provider activation і нова privacy disposition не виконані. Zod advisory залишається OPEN_WITH_MITIGATION до окремого source-pinned рішення. Повні 72 V4 / 475 V3 criteria, current trace statuses, legal/UAT/load/restore/device/provider/production gates не підвищуються. Expired staging cutoff не продовжено. Main merge, production/DNS/live-data mutation, paid activation, store upload і customer handover не виконувались.
