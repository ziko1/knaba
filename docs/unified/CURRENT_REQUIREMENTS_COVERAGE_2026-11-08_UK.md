# KNABA — актуальне зіставлення повного scope

## 2026-11-08 — Assistant→заявка: інтегрований source та локальні перевірки

Локальний кандидат `6708578bc4c326f727bcde3e84389775b00541fe`, tree
`64dd56f01ec85b98eb9f1bc83ae52e534a8cdd49`, об'єднує reviewed conversion
і дві корекції попереднього CI. Усі52 feature files збігаються з незалежно
перевіреними manifests. UI/root та backend/coverage reviews ACCEPT у source
і зазначеному SQLite обсязі; compound AC не підвищено.

Після явної дії у віджеті гість заповнює структуровану форму й окремо
погоджує передавання зазначених полів. Origin/consent/request/audit/existing
outbox атомарні; retry після втрати відповіді зберігає body/key. Owner бачить
зв'язок із діалогом. Скасування не стирає вже переданий ERP результат.
Історія чату, capability і вільний текст не передаються в ERP envelope;
assistant street address відхиляється, чинний public/portal контракт збережено.

Точний local source: root29, site900Vitest+92Node, VPS281 PASS; check499files,
0errors/0warnings/6existing hints. Чиста official збірка в окремому Git
checkout:161pages, JS222640B/CSS40832B gzip, незмінені бюджети225280/40960,
verify/source catalogue/i18n PASS. Перша workspace збірка мала зайві старі
hashed chunks і FAIL бюджету; їхній producer не встановлено. Окрема чиста
збірка з власними кешами — конкретний перевірений результат, не заява про
усунення невідомої причини. Shared caches/config/budgets не змінено.

Нові2 actualPG bridge cases (11total) та rendered assistant scenario написано,
але локально NOT_RUN; потрібен зарезервований об'єднаний CI checkpoint.
Попередній remote `395993f` з native/ERP proofs зафіксований окремо нижче.
F2 federation залишається ізольованим source; F3 не розпочато. NOT_READY,
merge/production/providers/physical-device acceptance не виконано.

Докази: `evidence/full-completion-20261108/assistant-request-source-review.json`
і `assistant-request-local-build.json`. Traceability KNB-06/21 оновлено тільки
paths/evidence/next action; усі нормативні критерії та статуси збережено.

### Історія першого інтегрованого кандидата

Дата історичного checkpoint: 2026-11-08. Тодішній опублікований source:
**`5d6eeae0862e52cc693c1766f0c6fba964b12aa5`**, [PR129](https://github.com/ziko1/knaba/pull/129).
Його tree **`7de0c8019ae5ab6959930225996a0c978859deba`** точно дорівнює tree
локально перевіреного `4b1e3538e3b2c39b7bfdd0ed028cf598e6f9cb26`. Поточний
checkout прийняв remote `5d6eeae`; подальший local fixture-only commit —
`b1951236f06d32cfd687460e3826c8453265bc63`. `4b1e353` збережено як локальну історію,
а не заявлено опублікованим commit. Загальний статус: **NOT_READY_FOR_CLIENT_DELIVERY**.
Цей документ є індексом поточного коду, прогалин і наступних доказів; він не
замінює специфікацій та не переносить історичні PASS на новий реліз.

### Історичний CI checkpoint 5d6eeae і межі доказу

[Application CI 42472254239](https://github.com/ziko1/knaba/actions/runs/42472254239)
на опублікованому `5d6eeae`: root job **SUCCESS**; site job **FAILED** —
7/834 Vitest cases, `ReferenceError: receipts is not defined` у handler-only
VM fixture. Окремий local fixture-only commit
`b1951236f06d32cfd687460e3826c8453265bc63` підключає справжній receipt
controller; product runtime та всі 16 cases/assertions незмінні.
Independent source review ACCEPT; локально **834 Vitest + 92 Node PASS**.
Це не переписує failure `5d6eeae`; потрібен новий exact-source CI.

ERP job **FAILED: 3016 PASS / 8 FAIL із 3024 tests**, failures у трьох
файлах. У job `128705591810`, який загалом FAILED, крок bridge виконав
actual SQLite→HTTP→PostgreSQL **9/9 PASS / 0 SKIP**; потім actual Chrome 156 / Playwright 1.55.1 role run
виконав 98 checks і завершився locator timeout на прихованій request card
у `completedCabinetCases`. Display receipt, languages, public viewport та
ERP rendered cases не досягнуті. Browser receipt `errors:[]`, `engines:[]`:
це locator FAIL, не sandbox/policy BLOCKED. `inputsUnchanged:true`; manifest
`6978647c6ec28b3cea682af4af9669b408fd9f293d032c83ad6d8c915cb4043f`
прив'язує client/worker/VPS/ERP-dist до exact source.

[Android 42472254246](https://github.com/ziko1/knaba/actions/runs/42472254246)
**SUCCESS**. [iOS 42472234257](https://github.com/ziko1/knaba/actions/runs/42472234257)
**FAILED**: 60-second `simctl list devices` timeout до Swift compile;
цей run не доводить компіляцію застосунку чи виконання XCTest. Native artifact readback,
physical acceptance та повний bridge/product criterion залишаються окремими.
Докази, raw log excerpts, job IDs та artifact hashes:
[initial-aggregate-ci.json](evidence/full-completion-20261108/initial-aggregate-ci.json).
Поточний CI Android APK має інший runner debug signer; він не підміняє
попередній локальний APK у ланцюжку встановлення/оновлення.

Окремі scoped PASS з exact `5d6eeae` ERP raw log: request-authority
36 CPU + 7 PostgreSQL; conversation-transfer 10 PostgreSQL + 39 security +
17 consent + 16 HTTP + 2 core; F1 site-identity-bindings 16 PostgreSQL +
site-identity-trust 27 CPU. Вони не додаються до overlapping local/root/author
runs, не закривають повні AC та не приховують 8 failures загального ERP run.

Root local suite: **29 PASS / 0 FAIL / 0 SKIP** на `4b1e353`; clean source
audit на `5d6eeae` PASS із явним `combined runtime acceptance NOT_RUN`.
Transfer root review: **74 PASS / 10 PostgreSQL SKIP / 0 FAIL**, CPU/domain
та справжній Nest/Express HTTP з явними persistence doubles. [Точний receipt](evidence/full-completion-20261108/erp-transfer-review.json)
не називає ці HTTP fixtures реальним PostgreSQL і не додає авторські
overlapping прогони до root count.

F1 має окремий [upstream proof](evidence/full-completion-20261108/identity-foundation-ci-excerpt.json):
`0fede54f80895a425e72df1d921a643b40a4eaf0`, [run 42464719363 / job 128681448826](https://github.com/ziko1/knaba/actions/runs/42464719363/job/128681448826),
16 F1 PostgreSQL cases та 27 CPU; тодішній повний ERP run 2782 PASS у 120
файлах без SKIP. Це доказ upstream source, не нового агрегованого кандидата.

Попередній документальний checkpoint `422c292b426ff8f4bf8c249e643d9bdb5b11871e`
описував Assistant lifecycle та ще незавершені ERP/native slices. Його
датований запис збережено в `PROJECT_MEMORY.md`; нижче наведено оновлений
інвентар, а не повторення тодішніх тверджень про відсутній source.

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
| Session/device authority | `erp/apps/api/request-authority.ts`, interceptor, auth/device/media/privacy integrations | Current fences reviewed; exact 5d6 authority 36 CPU/7 PG PASS. Full ERP FAILED; whole role/tenant acceptance окремо |
| F1 identity storage | `erp/apps/api/site-identity-bindings.ts`, additive SQL у `erp/infra/001_init.sql` | Internal storage/resolver; exact 5d6 16 PG/27 CPU PASS та окремий upstream proof. F2–F4 і спільний login не реалізовані |
| Site profile/password/email/sessions | `corporate-site/vps/account-settings.mjs`, `USER_SETTINGS_2026-11-08_UK.md` | Self-service source інтегрований. Actual mail, target restore і спільна ERP identity окремо |
| Assistant capability lifecycle | `corporate-site/worker/assistant.ts`, migration 0015, UI | Commit `422c292…`, локальні regressions/SQLite/HTTP і незалежний root review; expiry/revoke закрито в source, повний KN-C05 ще ні |
| Assistant inbox | `corporate-site/src/components/AssistantInbox.tsx`, `assistant.ts`, six JSON packs | Keyset pages з current-owner fence, load-more/poll serialization, шість мов; initial SSR pack + окремі JSON assets без усіх словників у JS. Actual browser/operator acceptance ще потрібний |
| Guest display receipt | `corporate-site/src/lib/assistant-display-receipts.ts`, `KnabaAssistant.tsx`, migration 0016 | Перший immutable timestamp показу конкретної owner message; поточний guest capability, visible widget/page, late-response fence. Це не human-read або business acceptance |
| ERP guest→WhatsApp / AC-07 | `erp/apps/api/conversation-transfer.ts`, `whatsapp-ingress.ts`, worker/domain transfer, web UI | Issue/signed claim/original-session exact-sender confirm, hash-only TTL 10 хв і scoped consent реалізовано. Exact 5d6 10 PG / 39 security / 17 consent / 16 HTTP / 2 core PASS; full ERP FAILED, rendered/provider/whole AC OPEN |
| Shared vehicle trip / AC-43 | `erp/packages/domain/vehicle-trips.ts`, `VehicleTripSummary.tsx`, vehicle-trip tests | Commands, membership, summary та web UI додано до кандидата. Повний AC-43 ще `NOT_RUN` |
| Site→ERP public form intake | `corporate-site/worker/erp-lead-outbox.ts`, migration 0014, ERP integration inbox | Реальний source контракт/outbox; не є conversation bridge або спільним login. Live transfer не ввімкнено |
| Templates / TPL-01–18 | `corporate-site/worker/site-templates.ts`, package/UI/API/HTTP tests | Реалізація v1 наявна. Actual browser/оператор, performance/restore та повний TPL acceptance відкриті |
| Partners / footer | Partner site/portal source, `StudioCredit` і Layout wiring | Partner flow та footer інтегровано; [незалежний footer review](evidence/full-completion-20261108/studio-credit-independent-review.json). Actual responsive/role journey та business acceptance окремі |
| Android / iOS | `erp/apps/mobile-android`, `erp/apps/mobile-ios`, `docs/mobile` | Android 83327e debug APK/AAB реально існують, 59 native inputs збігаються; iOS selective 07bf3b0 source інтегровано, 128 contract tests. Current CI, Xcode та фізичне приймання окремі |

Історичні локальні докази Assistant lifecycle наведені в
`corporate-site/docs/ASSISTANT_ACCESS_LIFECYCLE_UK.md`: 72 цільові тести,
23 migration/upgrade перевірки, 4 HTTP-сценарії; `npm run check` без помилок.
До зміни відтворено 6 runtime та 4 UI regressions. Root окремо перевірив
SQLite/HTTP slice перед commit. Ці результати не означають PASS усього KNB-06,
KNB-21, AC чи релізу.

Поточні source review receipts: [inbox](evidence/full-completion-20261108/assistant-inbox-source-review.json),
[display/locale](evidence/full-completion-20261108/site-display-and-locale-review.json),
[ERP authority/vehicle](evidence/full-completion-20261108/erp-source-review.json),
[privacy](evidence/full-completion-20261108/channel-privacy-review.json).
Display/locale checkpoint містить measured clean build: JS 222036 B при
незміненому budget 225280 B, CSS 40832 B при budget 40960 B; це його artifact,
не Web Vitals чи автоматичний PASS нового CI build. Нові browser suites
потребують installed sandboxed Chrome і source/artifact manifest; actual
SQLite/worker display cases та ERP HTTP-fixture UI мають різні межі.
[Runner review](evidence/full-completion-20261108/browser-runner-review.json).
Історичний `fddd160…` CI та його результати залишаються прив'язаними до
власного source; поточний site failure не приховується попередніми PASS.

## 4. Конкретні відкриті прогалини

| Пріоритет / вимога | Фактична прогалина | Наступний перевірюваний результат |
|---|---|---|
| P0, current CI | Site 7/834 FAIL; ERP 8/3024 FAIL; browser hidden-card timeout після 98 checks; iOS simctl timeout до compile | Site fixture-only b195123 local 834 Vitest + 92 Node PASS reviewed; виправити інші підтверджені причини, new exact-source CI; зберегти всі первісні failures |
| P0, KN-C04 / KN-U09 | F1 internal storage є; F2 dual-session workflow, F3 exchange і F4 authoritative federation revocation/privacy не реалізовані | Dual-session proof/UI, server-owned subject/company mapping, незалежні entitlements, replay/revoke/concurrent negatives; SSO лишається NOT_IMPLEMENTED |
| P0, AC-07 / KNB-04/21 | ERP transfer і scoped current PG/CPU/HTTP proof є, весь критерій не прийнятий | Після corrections підтвердити exact-source CI; rendered fixture окремо від live WhatsApp; зберегти original-session/expiry/scope negatives; privacy retention та owner UAT |
| P0, KN-C05 | Pagination, усі 6 мов та display receipt є; actual browser/owner journey ще не прийнятий | Visible/closed/offscreen/reset receipt cases на точному artifact, owner inbox pagination/locale/RBAC UAT; жодного human-read claim |
| P0, KN-C05 / KN-U04 | D1 conversation→ERP source-preserving conversion залишається OPEN | Явна згода, стабільне conversation/tenant mapping без role grant через IDs/email, ідемпотентна історія; ERP AC-07 не замінює цей bridge |
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
| Інсталяція та фірмова іконка | Android 0.5.0-test/code 8, package `de.knaba.mobile.test`, APK/AAB побудовано на `83327e5fe1b966ee8244f89988c6713264cef1be`; 59 native inputs збігаються. [Artifact proof](evidence/full-completion-20261108/android-artifact-review.json) | DEBUG_EVALUATION_ONLY; це не збірка на 5d6, release signing/Play/physical install/upgrade/live ERP/GPS не прийняті |
| Повний Android/iOS функціонал | 40-module navigation, contextual commands, six-locale copy/recovery інтегровані. iOS selective 07bf3b0 зберігає recovery/nullable contract; [128 contract PASS/source review](evidence/full-completion-20261108/ios-record-actions-review.json) | Functional parity не доведена. Android CI SUCCESS; iOS simctl timeout до compile, Xcode/XCTest не доведені. IPA/signing/device/role/ERP UAT окремі |
| Partners та footer | Source обох інтегровано, footer незалежно reviewed; немає непідтвердженої залежності від стороннього worktree | Actual responsive/role journey та бізнес-погодження партнерських сценаріїв |
| Release center / доставка | У checkout є `ReleaseChannels.astro` та mobile distribution docs | Повний зовнішній release center не перевірявся цим аудитом; наявність download panel не доводить його або signed/native delivery |

Окремий APK із CI на `5d6eeae`: SHA-256
`c1f4debbe228fcc9b065af2cc6c986ea0ec10c3808a2d6c49c896806df2732a3`,
certificate SHA-256 `73cabb7e8df288368071f693dcd25db79d98402323c21c0224aea8e95b809237`.
Це runner debug artifact, не заміна локального APK із його іншим signer.
Локальний Android 0.5.0 APK SHA-256: `894ef2283784e1b69e79ab39beb37b929d7883892559290b629778cff3b5a069`;
AAB SHA-256: `5713a62858ddd136c31eda40367b9179d7953a6547167d5fe70bef214ff6a7c6`.
Попередній APK 0.4.3/code 7 з source `679abe6c2fd9560a3b074a42aef6842ee8f6d0b3`
та SHA-256 `6fde65ed863e50397876ee7a7f6b1a82b2b8cfd24eb5845bd6b09c7a6584929b`
залишається історичним artifact і не перейменовується на новий реліз.

## 6. Послідовність закриття

1. Виправити підтверджений site fixture failure, завершити current CI та
   повторити необхідні gates на новому exact-source candidate; зберегти всі failure receipts.
2. Продовжити KN-C05 D1 conversation conversion і залежні F2–F4 identity
   інкременти; не повторювати вже реалізовані pagination/locale/display slices.
3. Прив'язати native/SQL/browser artifacts до їхнього source; пройти Xcode,
   physical-device та owner journeys. Старий debug APK не є новим signed релізом.
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
