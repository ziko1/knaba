# KNABA Assistant → ERP: кандидат реалізації

## Призначення та межі

Клієнт вводить ім’я, email або телефон, послугу та необов’язкові відомості про стан об’єкта/бажаний період. Сайт показує нормалізоване резюме й окремо просить підтвердити його передавання. Після підтвердження локальна черга доставляє незмінну подію до наявного ERP `lead.upsert`. Просте звернення до людини, прийняття пропозиції або privacy checkbox не створюють ERP lead.

Одна підтверджена заявка належить одній conversation. До першої спроби скасовану заявку можна підготувати заново; після можливої доставки її не можна перезаписати або обійти повторною кнопкою. Нова незалежна заявка потребує нової розмови.

База сайту: PR #65, `3398aefe696d8c317a63b10443457a39af5ed5d3`; збережено новіший порядок карток послуг. Перед публікацією долучено лише нові записи документації PR #65 до `daa925b980d4485774433fe11956b49a47f63a14`; runtime і тести не змінилися. Перевірений ERP: PR #41, `683c09d0346fd05e0f2cd323da640bbb176c5c47`. Зміни останнього ERP HEAD порівняно з контрактом стосуються Telegram; підписаний integration endpoint не змінено. ERP-код цим кандидатом не змінюється.

Цей пакет не реалізує голосові/WhatsApp дзвінки, передачу аудіо, створення ERP channel, двобічний операторський чат або багатокористувацький operator claim. Ці вимоги мають окремий контракт. При handoff збережено захист від пізньої автоматичної відповіді; стан заявки не означає «оператор підключений».

## Дані, доступ та доставка

- Additive міграція `0005_assistant_erp_bridge.sql` додає `assistant_erp_requests`; SQL `0000–0004` не змінено. Наявні messages/offers/privacy/notifications залишаються в канонічній моделі conversations.
- Preview зберігає нормалізовані поля, незмінний envelope, version/hash та scope конфігурації. Строк підтвердження — 10 хвилин. CAS блокує підтвердження старої версії та гонки зі скасуванням/закриттям.
- Guest endpoints зберігають перевірки scoped token, Origin, дозволених полів і rate limits. Публічна конфігурація містить лише доступність та назви дозволених послуг. Внутрішня квитанція й коди причин доступні тільки власнику.
- Endpoint — фіксований HTTPS origin із серверної конфігурації, шлях `/api/v1/integrations/:source/events`; redirects заборонено. Підпис: HMAC-SHA256 від `timestamp + "." + exact body`. Company визначає ERP за credential, а локальна прив’язка site/company/mapping входить у scope.
- Dispatcher бере атомарний lease на 45 секунд, повторно перевіряє повноваження після підпису та перед транспортом; timeout — 10 секунд, максимум 6 спроб. Повтори використовують той самий body/event ID/external ID та новий транспортний timestamp/signature.
- Лише валідна квитанція з відповідним event ID та effect ID дає `APPLIED`. `QUARANTINED`, неправильна/завелика квитанція та невідомий результат не показуються як прийняття. Квитанція обмежена 64 KiB; довільний текст помилки ERP не зберігається.
- Скасування до спроби дає `CANCELLED`. Якщо доставка вже могла початися — `UNKNOWN`, без автоматичного повтору після скасування і без обіцянки видалити ERP lead. Застарілий lease не може перезаписати новіший результат.
- Owner inbox включає підтверджені заявки та сортує за останньою релевантною зміною розмови/заявки, тому нова заявка зі старої відновленої розмови не губиться за лімітом 100.

## Конфігурація для майбутньої активації

За замовчуванням bridge вимкнено. Жодного справжнього credential або прапорця активації не додано до середовищ.

| Private binding | Значення / вимога |
| --- | --- |
| `ASSISTANT_ERP_ENABLED` | Тільки точне `approved` дозволяє dispatcher. |
| `ASSISTANT_ERP_ORIGIN` | Перевірений HTTPS origin ERP без path/query/userinfo. |
| `ASSISTANT_ERP_SOURCE` | Source погодженої ERP integration. |
| `ASSISTANT_ERP_SITE_ID` | Стабільна ідентичність цього сайту/середовища. |
| `ASSISTANT_ERP_COMPANY_ID` | Локальна прив’язка scope; не передається в payload. |
| `ASSISTANT_ERP_KEY_ID` | Погоджений серверний key ID. |
| `ASSISTANT_ERP_SECRET` | Серверний секрет щонайменше 32 символи. |
| `ASSISTANT_ERP_MAPPING_VERSION` | Версія фактично погодженого mapping. |
| `ASSISTANT_ERP_SERVICES_JSON` | Масив `{id,label:{de,en,uk,ru}}` із дозволених ERP service ID. |

Наявність цих полів не доводить активацію ERP mapping або юридичну готовність. VPS копіює лише перелічені bindings; при `approved` викликає scheduled handler раз на 30 секунд без перекриття запусків і чекає завершення під час shutdown. Cloudflare entry також підтримує scheduled handler, але cron/provider infrastructure тут не створюється.

## Міграція та відкат

Для запуску нового коду потрібна міграція 0005 навіть із вимкненим bridge: thread/inbox читають нову таблицю. Production adapter відмовляється запускатися з pending migrations; автоматичного оновлення робочої бази немає.

Майбутня процедура після окремого дозволу: інвентаризація фактичного source/schema → зупинка dispatcher → SQLite online backup та перевірка відновлення на копії → additive міграція → кандидат з вимкненим bridge → перевірка реального mapping/прав/зберігання даних → окрема активація. Не застосовувати SQL старої гілки `assistant_threads` поверх поточної `assistant_messages`.

Для відкату вимкнути dispatcher, дочекатися in-flight роботи й зберегти актуальну базу разом із чергою. Не відновлювати старий backup поверх нових звернень і не видаляти ERP leads. Відкат application artifact до старішої schema-aware версії потребує окремого rehearsal: старий startup migration gate може не приймати нову міграцію. Поточний тест доводить backup/restore черги та disabled restart, а не live cutover до попереднього artifact.

Існування реальної legacy threads бази не встановлено; імпорт, compatibility-token validator та звірка старих записів не виконувалися. Якщо така база існує, MIG-02/MIG-03 залишаються обов’язковими перед її перенесенням.

## Приймання та докази

Машиночитаний підсумок із точним tested code SHA: `evidence/assistant-erp-bridge-qa.json`. Опублікований implementation commit dc279a9fb9148278b86f808394b52371d5cb80ed має те саме Git tree d542a975374caa47b4f08fe607da40fc3e432849, що перевірений локальний commit 551cc1b25e33ce2a3e9f9e62d1b884be6632061a; відрізняються лише метадані commit. Наступний documentation receipt не змінює runtime-код.

Фінальні результати: 211 Vitest + 16 Node + 20 VPS тестів PASS; Astro/Vue/Svelte checks PASS (0 errors, 0 warnings, 4 попередні hints); build і статична перевірка 103 сторінок PASS. Chromium153: 4 клієнтські локалі, 24 перевірки form/preview layout на320/390/1440px, клавіатурне підтвердження, 4 owner-layout перевірки DE/RU; 0 помилок консолі/сторінки та зовнішніх запитів.

ERP: 50 integration tests (0 skipped, включно з4 реальними PostgreSQL cases), 12 груп справжніх Nest HTTP перевірок та4 combined website→ERP checks PASS. Успадкований ERP snapshot verifier окремо повертає exit1 через невідповідність baseline tree (`a242ddb…` проти `d269a8c…`); цю прогалину не виправлено й не приховано. Весь ERP regression suite не запускався. Receipt комбінованого тесту фіксує попередні file hashes: подальші owner diagnostics і виправлення cancel-before-attempt перевірені локальними тестами; самі preview/confirm/payload/dispatcher не змінилися.

| Вимога | Покриття кандидата |
| --- | --- |
| MIG-01 | Застосування 0005 до синтетичної старої схеми: незмінні history/offers/privacy/notifications, foreign-key integrity. |
| MIG-02 / MIG-03 | Умовний legacy import та compatibility access не запускалися: реальне джерело не інвентаризоване. |
| BR-01 | Валідація, мінімальні обов’язкові поля, scope, expiry, explicit confirmation, CAS/закриття/скасування. |
| BR-02 | Справжній Nest HTTP + PostgreSQL на точному ERP SHA; додатково combined website→dispatcher→Nest→PG. Транспорт URL у combined harness замінено на ізольований loopback, тому це не перевірка реального TLS/DNS. |
| BR-03 / BR-04 | Конкурентні claim, загублена відповідь, immutable replay, lease fencing, max attempts, неправильний receipt і quarantine. |
| BR-05 | Скасування до спроби та під час доставки, без хибної обіцянки скасування ERP commit. |
| HND-01 | Пізня AI-відповідь після handoff заблокована. Multi-operator claim/resume не входить у цей пакет. |
| UI-01 | Чотири клієнтські локалі, окрема згода, статуси/скасування та браузерна перевірка; точні результати у receipt. Фізичні пристрої та screen reader не перевірено. |
| RB-01 | Синтетичний SQLite online backup/restore з history/outbox, integrity/FK checks і вимкненим dispatcher. Live old-artifact rollback окремо не виконано. |

До будь-якої активації залишаються погодження власника/реальний owner UAT, перевірені credentials і ERP mapping, строки зберігання/видалення, повідомлення про обробку даних і договори з процесорами, backup/rollback rehearsal у цільовому середовищі. Privacy checkbox і технічна мінімізація не є висновком про відповідність GDPR. У цьому пакеті немає автоматичної retention/deletion policy.

## Рішення про release та бюджет

Статус: кандидат для незалежного перегляду / Draft PR. Merge, dev/production cutover, робоча міграція, справжнє передавання даних і платні провайдери не дозволені цим етапом і не виконувалися. Нових платних сервісів не активовано; додаткові зовнішні закупівлі — EUR 0. Фактична вартість наявного runtime невідома, нульова вартість виконання не стверджується.

Незалежний review: `/root/bridge_security_review` — source candidate погоджено, відкритих зауважень до коду немає. Виправлено сортування старих розмов та скасування під час підпису до першої спроби; додано owner-only diagnostics. Reviewer самостійно виконав59 цільових і2 VPS тести; file hashes та межі погодження збережені в `evidence/assistant-erp-review.json`.
