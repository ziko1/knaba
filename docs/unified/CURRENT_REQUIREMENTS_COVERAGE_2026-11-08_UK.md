# KNABA — актуальне зіставлення повного scope

Дата: 2026-11-08. Перевірений документальний checkpoint: локальний commit
`422c292b426ff8f4bf8c249e643d9bdb5b11871e` плюс явно незавершені паралельні
зміни ERP/native у робочому кандидатові. Загальний статус: **NOT_READY_FOR_CLIENT_DELIVERY**.
Цей документ є індексом поточного коду, прогалин і наступних доказів; він не
замінює специфікацій та не переносить історичні PASS на новий реліз.

## 1. Повний обсяг і правила підрахунку

| Джерело | Фактичний обсяг | Поточна інтерпретація |
|---|---:|---|
| `KNABA_DE_MASTER_SPEC.md` у корені / `erp/KNABA_DE_TARGET_SPEC.md` | V4: 24 KNB, 72 AC | Чинна ціль; усі 72 повні acceptance залишено `NOT_RUN` |
| `erp/KNABA_DE_MASTER_SPEC.md` і `erp/docs/requirements/requirements.json` | Збережена V3: 432 вимоги, 475 acceptance, 34 модулі | Неперекреслені вимоги зберігаються; V4 не означає їх автоматичне видалення |
| `REQUIREMENTS_TRACEABILITY.csv` | 114 унікальних рядків: 24 KNB + 72 AC + 18 TPL | KNB — `IN_PROGRESS`; TPL виправлено на `IN_PROGRESS`; AC — `NOT_RUN` |
| Контекстні доповнення користувача | Профіль/пароль/email/сесії, мобільна конфігурація/інсталяція/іконка, партнери/footer, release delivery | Окремо зіставлені нижче; не вигадані нові номери канонічних AC |

72, 432, 475 і 18 не можна додавати як незалежні «виконані задачі»: вони
частково описують той самий продукт на різних рівнях. Наявність функції,
наявність тесту, локальний результат, runtime artifact та повне приймання —
окремі факти. Відсоток «готовності всього продукту» тут не обчислюється.

У V3 JSON зберігаються **4 історичні `PASSED` requirements та 10 `PASSED`
acceptance tests**, явно обмежені `WHOLE_CRITERION_EXACT_3C85_SOURCE_ONLY`.
Решта: 428 вимог і 465 acceptance мають `NOT_RUN`; 35 із цих тестів позначені
частковим coverage. Історичний module execution index посилається на `ca9ed79…`.
Жодна з цих позначок не є PASS для поточного інтегрованого кандидата.
Історичні записи не змінено.

Усі **60 унікальних implementation-path references** з V3 JSON існують у
поточному checkout. Це доказ збереження source mappings, а не виконання
432 повних вимог. Серед 475 тестів є окремі physical-device, provider-live,
legal, restore, handover та artifact-validation класи; source/unit запуск
не замінює цих середовищ.

## 2. Що в матриці було застарілим

Попередні 18 TPL рядків стверджували, що каталог, ZIP import і lifecycle
відсутні. Фактично є `worker/site-templates.ts`, `worker/template-zip.ts`,
`worker/site-template-read.ts`, contract/render modules, `/studio/templates/`,
UI actions, шість language packs та цільові package/API/UI/HTTP tests.
Матрицю виправлено, не зараховуючи повний browser/operator acceptance.

Шаблони v1 мають явні межі, зафіксовані в
`corporate-site/docs/SITE_TEMPLATES_UK.md`: три довірені оформлення та їхні
декларативні варіанти, до 40 immutable packages. Довільні HTML/JS/CSS/assets
та сторонні runtime archives не є дозволеним форматом. Delete API v1 немає.
Для TPL-17 треба окремо звірити retention/cleanup і поведінку quota з повним
критерієм; відсутність видалення не можна приховувати загальним «усі шаблони готові».

Також виправлено поточні посилання KNB-01/06/15/21/23 та AC-07/43.
`COMPLETION_PLAN_2026-11-08_UK.md` і старі evidence maps залишаються датованими
checkpoints; їх твердження про відсутні templates чи recovery не слід читати
як актуальний інвентар після інтегрованих змін.

## 3. Реалізація і межі поточного доказу

| Область | Поточний source | Доведено / залишається |
|---|---|---|
| API/worker mode | `erp/apps/api/main.ts`, `erp/apps/worker/main.ts`, `erp/tests/runtime-mode.test.ts` | Прибрано неявний DEMO default. Чистий TEST/PRODUCTION bootstrap і весь AC-01/71 окремо |
| Session/device authority | `erp/apps/api/request-authority.ts`, interceptor, auth/device/media/privacy integrations | Поточний паралельний implementation/review; не переносити старі результати PR123 на нові байти |
| Site profile/password/email/sessions | `corporate-site/vps/account-settings.mjs`, `USER_SETTINGS_2026-11-08_UK.md` | Self-service source інтегрований. Actual mail, target restore і спільна ERP identity окремо |
| Assistant capability lifecycle | `corporate-site/worker/assistant.ts`, migration 0015, UI | Commit `422c292…`, локальні regressions/SQLite/HTTP і незалежний root review; expiry/revoke закрито в source, повний KN-C05 ще ні |
| Assistant inbox | `corporate-site/src/components/AssistantInbox.tsx`, `assistant.ts` | Поки `LIMIT 100`, без cursor; лише DE/RU для всього inbox. Наступний доступний KN-C05 slice |
| Shared vehicle trip / AC-43 | `erp/packages/domain/vehicle-trips.ts`, `VehicleTripSummary.tsx`, vehicle-trip tests | Commands, membership, summary та web UI додано до кандидата. Повний AC-43 ще `NOT_RUN` |
| Site→ERP public form intake | `corporate-site/worker/erp-lead-outbox.ts`, migration 0014, ERP integration inbox | Реальний source контракт/outbox; не є conversation bridge або спільним login. Live transfer не ввімкнено |
| Templates / TPL-01–18 | `corporate-site/worker/site-templates.ts`, package/UI/API/HTTP tests | Реалізація v1 наявна. Actual browser/оператор, performance/restore та повний TPL acceptance відкриті |
| Partners | Інтегрований partner site/portal source, partner contract/regression tests | Наявність partner flow не є доказом усіх business cases або зовнішнього погодження умов |
| Android / iOS | `erp/apps/mobile-android`, `erp/apps/mobile-ios`, `docs/mobile` | Є source та окремі старші artifacts; новий інтегрований artifact і фізичне приймання окремі |

Локальні докази Assistant наведені в
`corporate-site/docs/ASSISTANT_ACCESS_LIFECYCLE_UK.md`: 72 цільові тести,
23 migration/upgrade перевірки, 4 HTTP-сценарії; `npm run check` без помилок.
До зміни відтворено 6 runtime та 4 UI regressions. Root окремо перевірив
SQLite/HTTP slice перед commit. Ці результати не означають PASS усього KNB-06,
KNB-21, AC чи релізу.

Історичний CI checkpoint `fddd160…` з попереднього `PROJECT_MEMORY.md`
залишається доказом його source. Поточні зміни потребують нового кінцевого
CI run, source/artifact hashes і незалежного review.

## 4. Конкретні відкриті прогалини

| Пріоритет / вимога | Фактична прогалина | Наступний перевірюваний результат |
|---|---|---|
| P0, KN-C04 / KN-U09 | Site VPS users і ERP users не мають завершеного stable cross-system binding/SSO та shared revocation | Контракт dual-session proof, server-owned subject/company mapping, незалежні entitlements, replay/revoke/concurrent negatives |
| P0, AC-07 / KNB-04/21 | `transfer_token` є лише у read ACL Engine; issue/двоканальний confirm/consume flow не знайдено | Hashed, one-use token TTL 10 хв; proof обох каналів; чинний target membership; чужий/прострочений token не відкриває історію |
| P0, KN-C05 | Понад 100 owner conversations недоступні з inbox; повної шести-мовної локалізації немає | Keyset pages із current-owner fence на кожній сторінці, UI load-more/poll race tests, шість locale packs |
| P0, KN-C05 / KN-U04 | Гостьовий conversation→ERP mapping і явний visitor receipt не доведені кінцевим сценарієм | Source-preserving bridge без надання ERP прав через IDs/email; owner reply→visitor acknowledgement з ідемпотентним retry |
| P0, AC-43 / KNB-15 | Новий shared vehicle source ще не пройшов повний критерій на кінцевому кандидатові | 3×30 хв = 1,5 людино-години; один облік 20 км автомобіля; UNKNOWN не стає measured; актуальні scope/crew і кінцевий UI/API |
| P0, AC-68/70/71/72 | Немає сукупного production-like install, restore/load, device/UAT та handover receipt для всього кандидата | Зафіксований SHA/artifact, належні середовища, реальні роли/дані, owner acceptance та незалежний reviewer |
| P1, TPL-03/14/15/16/17/18 | Повний browser/operator, budgets/load, restore/cache та retention/quota acceptance не закриті source tests | Виконати критерії на точному кінцевому template artifact; не обходити environment policy block |
| P1, KNB-05/07/14/15/23 | Live WhatsApp/voice/mail/AI/Maps/GPS/legal/privacy gates не є локальними unit доказами | Перевірені credentials/consent/quota/поточні contracts, фактичні provider/device результати; outbound лишається вимкненим до дозволу |

Функціональні модулі ERP для замовлень, задач, часу, зарплати, складу,
media, reports та approvals не оголошуються відсутніми через `NOT_RUN`.
Їх треба приймати сценаріями зі специфікацій на одному кандидатові, з
реальними authority/tenant/data dependencies та негативними випадками.

## 5. Доповнення поточного контексту користувача

Ці рядки — допоміжний інвентар, а не нова нумерація офіційних AC.

| Запит | Source / актуальний стан | Незакритий доказ |
|---|---|---|
| Власний профіль, пароль, email, сесії | KN-US01–US08 у `USER_SETTINGS_2026-11-08_UK.md`, VPS account settings інтегровано | Current integrated UI/mail/restore; ці identities не автоматично ERP/native identities |
| Автоматична конфігурація Android | `docs/mobile/AUTOMATIC_SYNC_2026-11-08_UK.md`, release discovery і `/ready` перевіряються до передачі пароля | Перевірка власного deployment/tenant на пристрої та нового кінцевого artifact |
| Інсталяція та фірмова іконка | Окремий APK 0.4.3-test/code 7 має source `679abe6c2fd9560a3b074a42aef6842ee8f6d0b3`, artifact SHA-256 `6fde65ed863e50397876ee7a7f6b1a82b2b8cfd24eb5845bd6b09c7a6584929b` | Це попередній artifact: наступні lifecycle fixes і 0.5.0/code 8 source не роблять його новим релізом; фізичний install/device acceptance відкритий |
| Повний Android/iOS функціонал | Module navigation, contextual commands, six-locale copy та recovery робляться в окремому native slice | Linux не дає Xcode/Apple archive/device receipt; нові APK/AAB/IPA мають власні source hashes і device gates |
| Partners та footer | Partner source інтегрований; public footer attribution треба звірити з паралельною footer роботою | Не оголошувати зовнішній footer worktree інтегрованим; actual responsive/role journey |
| Release center / доставка | У checkout є `ReleaseChannels.astro` та mobile distribution docs | Повний зовнішній release center не перевірявся цим аудитом; наявність download panel не доводить його або signed/native delivery |

## 6. Послідовність закриття

1. Зберегти цей coverage checkpoint і виправлені 114 рядків без нових PASS.
2. Закрити наступний локально доступний KN-C05: pagination та шість мов inbox,
   з meaningful failing regressions і перевірками current authority.
3. Завершити й незалежно переглянути ERP/native зміни, побудувати нові
   artifacts; не переносити результати старих APK чи старих CI на них.
4. Виконати повні V4 AC та збережені V3 сценарії за класом середовища,
   додати source/artifact/target/evidence/reviewer до кожного прийнятого критерію.
5. Після технічних gates — фактичні provider/device/restore/load/owner UAT і
   погоджений handover. Production deployment та main merge цим checkpoint
   не виконувалися.

## 7. Збережена V3 — кількість вимог за модулями

Нижче наведено механічний підрахунок `requirements.json`; усі модулі
залишаються в scope. Це не таблиця поточного acceptance PASS.

| Модуль V3 | Вимог |
|---|---:|
| `acceptance/quality` | 22 |
| `approvals/automations` | 6 |
| `architecture` | 8 |
| `assistant-config/knowledge` | 11 |
| `bot-admin` | 24 |
| `channels/conversation-router` | 11 |
| `client-portal` | 8 |
| `delivery/autonomy` | 9 |
| `delivery/documentation` | 11 |
| `delivery/product` | 7 |
| `delivery/specification` | 4 |
| `dispatch/scheduling` | 8 |
| `domain/contracts` | 17 |
| `geolocation/geofences/travel/native` | 44 |
| `handover` | 9 |
| `identity/rbac` | 21 |
| `infra/deployment` | 18 |
| `integrations/whatsapp` | 9 |
| `inventory/procurement` | 30 |
| `leads/handoff` | 10 |
| `legal/policies` | 13 |
| `media` | 7 |
| `messaging/translation` | 17 |
| `notifications/automations` | 10 |
| `payroll/payouts` | 8 |
| `pricing/quotations` | 10 |
| `privacy/ai` | 7 |
| `reporting/documents` | 12 |
| `reporting/statistics` | 10 |
| `security/resilience` | 11 |
| `sites/site-locations` | 8 |
| `tasks/quality/rework` | 17 |
| `timekeeping` | 7 |
| `web/pwa/widget/native` | 8 |
| **Разом** | **432** |
