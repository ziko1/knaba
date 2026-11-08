# Строк дії та відкликання доступу до діалогу Assistant

Дата: 2026-11-08. Статус: локальний кандидат на незалежне review; не production receipt.

## Контракт

`docs/unified/INTEGRATION_CONTRACT.md` вимагає для анонімного діалогу
високоентропійний секрет із хешем на сервері, expiry, revocation та rate limits.
`docs/unified/COMPLETION_PLAN_2026-11-08_UK.md` окремо залишав lifecycle
відвідувацьких capabilities незавершеним.

**Сім діб від `created_at` — рішення реалізації цього кандидата.** Початковий
контракт не визначав числового строку. Це не десятихвилинний web→WhatsApp
transfer token і не запрошення чи відновлення облікового запису.

- Строк абсолютний: 7 × 24 години UTC. Читання, повідомлення, handoff,
  рішення щодо пропозиції, закриття й повторне відкриття його не продовжують.
- Відсутній, чужий, відкликаний, прострочений або некоректний ключ дає
  однакову відповідь `404 not_found` для гостя. Строк має бути строго пізнішим
  за поточний час SQLite; дата створення в майбутньому також не дає доступу.
- Закриття діалогу зберігає читання до закінчення строку, але зупиняє записи.
  Відкликання — окрема, незворотна дія власника. Повторне відкриття діалогу
  не повертає відкликаний доступ.
- Історія, контакти, повідомлення й пропозиції залишаються доступними чинному
  власнику після expiry/revoke. Строк доступу не є політикою видалення даних.
- Формат існуючого 64-символьного секрету та recovery code `KNABA1` збережено.
  Секрет передається в `X-KnaBa-Conversation`, ніколи в URL. У БД зберігається
  SHA-256; DTO історії та inbox не видають секрет чи його хеш.

## API й межі авторизації

Створення `POST /api/assistant/conversations` додатково повертає `expiresAt`.
Власник викликає `POST /api/assistant/owner/conversations/:id/access/revoke`
із JSON `{}` та звичайним same-origin/CSRF контрактом. Повторний запит
ідемпотентний; відповідь містить історію та `conversation.revokedAt`.
Подія `assistant.access.revoke` у `portal_audit` створюється один раз, у тій
самій транзакції. Токен очищається, час відкликання фіксується.

Гостьові SELECT, INSERT та UPDATE містять умову актуального хешу, строку й
відсутності revocation у SQL. Перевірка виконується разом із конкретним
доступом до даних; збережений раніше об'єкт діалогу не є дозволом.
Перед відповіддю з історією дозвіл перечитується. Зміна стану, повідомлення
та мінімальні outbox-події записуються транзакційно.

Для owner routes VPS передає довірену функцію перевірки поточної сесії та
owner role. Request-local `LocalD1.withAuthorization` звіряє цей дозвіл
під SQL-lock на читанні й записі; сервер перевіряє його знову перед
HTTP-відповіддю. Browser headers не можуть встановити цю функцію чи owner role.
Worker також перевіряє її перед читаннями, мутаціями та видачею приватних DTO.
Це перевірено локально для VPS; live Cloudflare identity/provider sessions тут
не перевірялися.

## Міграція 0015

`0015_assistant_access.sql` лише додає `token_expires_at`, `token_revoked_at`
і захисні тригери. Стара історія та попередні migration receipts зберігаються.
Для наявного канонічного ISO UTC `created_at` expiry дорівнює початковій даті
плюс сім діб, а не часу міграції. Некоректна чи неканонічна дата дає `NULL`
expiry, тобто відмову гостьового доступу. Власник зберігає історію такого діалогу.

Тригери не дозволяють змінити дату створення, продовжити зафіксований expiry
або прибрати вже встановлене відкликання. Новий Drizzle snapshot зберігає
також чинні `vps_access_requests` і `vps_owner_details`; їх видалення не входить
до міграції. Генератор виявив попередню розбіжність ORM/snapshot для цих двох
таблиць, тому його початкові DROP statements були відкинуті до виконання.

Production loader з `allowMigrations:false` відмовляє в запуску за наявності
pending 0015. Застосування на production потребує звичайного погодженого
backup/migrate/restart процесу. **Повернення до старого runtime, який ігнорує
expiry, може знову відкрити прострочену історію.** Для rollback зберігати нову
перевірку доступу або вимкнути Assistant до виправлення; історію не видаляти.

## Інтерфейс

Підтверджений гостьовий `404` під час poll/send/handoff/decision прибирає
з екрана приватну історію, поточний ticket і його `sessionStorage`, скасовує
застарілі запити та зупиняє polling цього ticket. Ненадісланий текст
зберігається; новий діалог потребує нового підтвердження privacy/captcha.
Використано наявне повідомлення про недійсний/прострочений код шістьма мовами.
Мережеві помилки та `5xx` зберігають ticket і текст для повторної спроби.

У чинному owner inbox додано окрему дію відкликання з підтвердженням,
дату expiry та стан revoked/expired. Застосовано його чинні DE/RU локалі;
це не закриває окрему вимогу повної локалізації всього inbox шістьма мовами.

## Локальні докази та межі

- До виправлення SQL-backed `assistant-capability.test.ts` відтворив шість
  помилок: відсутній revoke endpoint і видачу/запис приватних даних після
  revocation на межах read/write/response. Після виправлення проходять.
- До виправлення UI чотири поведінкові перевірки відтворили збереження
  приватного кешу після `404` у poll/send/handoff/decision. Після виправлення
  перевірено cleanup, draft preservation, припинення старого polling і retry
  для `5xx`, а також owner revoke handler.
- Вузький набір Assistant: 72 тести у 7 файлах. Міграція/upgrade: 23 тести.
  Локальний VPS HTTP: 4 тести, worker збирається з поточних sources у temp.
  `npm run check` завершився без помилок; наявні зауваження поза цим slice
  не перетворено на claims про повну чистоту проєкту.
- Перевірки виконано на робочому кандидатові до commit. Поточний Git SHA
  сам по собі не є receipt для цих незакомічених змін. Потрібні незалежне
  review, фінальна збірка та повторні інтеграційні gates на зафіксованому SHA.
- Цей документ не підтверджує live/provider/browser/device готовність,
  ERP bridge діалогу, WhatsApp transfer, пагінацію inbox чи весь V3/V4 scope.

## 08.11.2026 — явне створення заявки з поточного діалогу

Джерело обсягу: KNB-06/KNB-21 і пункт11 доручення про повне завершення KNABA.
Ця зміна додає зв'язок web Assistant→наявна заявка→чинна ERP intake queue.
Вона не надає ERP identity, роль, cookie чи доступ за збігом email.

Користувач явно обирає створення заявки в поточному діалозі. Перехід веде на
локалізований `/kontakt/?intent=assistant`: у page URL немає ticket, token,
контактів або chat text. Один лише параметр intent не захоплює поточний ticket.
Форма використовує збережений при явному переході точний ticket/generation;
reset, зміна ticket чи його відкликання не можуть підставити інший діалог.
Загальна публічна чернетка й чернетка цього діалогу розділені.

Форма дозволяє перевірити та змінити власні контактні дані й параметри робіт.
Вона не вигадує ім'я, адресу чи послугу з тексту бота. Підтвердження передавання
спочатку не позначене; зміна контексту/мови скидає згоду. Мова ERP envelope береться
зі збереженої conversation, показується у review і не приймається з довільного
поля браузера. Конкретний будівельний offer/topic лишається в локальному тексті
заявки; поточний ERP контракт отримує налаштовану групу послуг `baureinigung`.

### Серверний контракт

| Endpoint | Дія й повноваження |
|---|---|
| GET `/api/assistant/conversations/:id/request-context` | Поточна guest capability; контакти свого діалогу й до20safe request summaries, keyset cursor |
| POST `/api/assistant/conversations/:id/requests` | Поточна writable guest capability, `privacyAccepted:true`, `transferAccepted:true`, валідні поля чинної Inquiry та idempotency key |
| POST `/api/assistant/conversations/:id/requests/:requestId/cancel` | Та сама guest capability та поточна version; лише власна `new`/`reviewing` заявка |
| GET `/api/assistant/owner/conversations/:id/request-context` | Чинна серверна owner authority, повторно перевірена перед відповіддю |

Гостьовий заголовок `X-Knaba-Conversation` обов'язковий і не замінюється owner
cookie. Закритий чат дозволяє читання/скасування раніше створеної заявки за
живою capability, але не нове створення. Expired/revoked/foreign capability
повертає404 без приватних даних. Зміна version/state дає409; UI оновлює стан
перед новим явним рішенням. Після відмови assistant endpoint форма не переходить
непомітно на public `/api/leads` і не створює другу заявку.

Один SQLite/D1 batch зберігає capability-fenced origin+consent, заявку,
audit та чинний outbox. Deferred FK не дозволяє залишити origin без заявки.
UNIQUE `(conversation_id,request_key)` і чинний request idempotency constraint
не допускають дублювання при паралельних повторах; інший payload з тим самим
ключем дає409. Перевірки доступу діють у SQL і перед видачею результату.

Consent version `assistant-request-v1/2026-11-08` фіксує перелік полів чинного
envelope: contact name/email/optional phone, mapped service IDs, мову, тип
об'єкта, optional площу, індекс у `facts.address` та відому періодичність.
Окреме поле street address відсутнє у цій формі/DTO і відхиляється assistant API;
чинний public/portal address контракт збережено. Chat history,
локальний вільний текст, conversation ID/token і campaign attribution в ERP
не передаються. `source` для цієї конверсії порожній. Налаштування company,
service mapping, ключі й увімкнення bridge залишаються виключно серверними.

### Стани, скасування й відновлення

`received:true` означає збереження на сайті. Лише `APPLIED` означає прийнятий
ERP effect у чинному bridge; `PENDING/LEASED/REVIEW/BLOCKED/UNKNOWN` показуються
окремо. За вимкненого bridge початковий локальний стан — PENDING без pinned
mapping; черговий maintenance переводить його в BLOCKED/MAPPING_NOT_PINNED
без мережевої доставки. Це не обіцянка доставки або дозволена активація сервісу.
Safe summary містить тільки site request ID, status, version,
createdAt і transfer status, без ERP effect ID, контактів або error payload.

Скасування локальної заявки не є видаленням уже переданого ERP запису.
До першої спроби чинний dispatcher блокує відправку; коли відправка вже
почалася, він зберігає UNKNOWN/можливу доставку для звірки. Уже APPLIED
receipt зберігається. Закриття або reset діалогу самі по собі не скасовують
попередню явну згоду на створену заявку; для цього є окрема дія скасування.
Immutable origin лишається після очищення outbox attribution і restart.

Міграція0017 додає тільки `assistant_request_links`,2indexes і immutable
trigger; старі заявки не приєднуються до діалогів за email або іншою евристикою.
Усі22 попередні metadata definitions збережено. Нова definition отримана з
встановленого Drizzle generator в ізольованому каталозі; чинні VPS-only tables
не видаляються через відому відмінність ORM і повного історичного snapshot.

Після0017 старий runtime з коротшим migration ledger відмовляє в запуску.
Звичайний відкат бінарника тому не заявляється працездатним. Для інциденту
зупинити новий intake/dispatch і виконати reviewed forward fix зі збереженням
схеми/даних. Передміграційний backup відновлює тільки стан до cutover; він
не містить наступні заявки. Заміна live DB таким backup без окремого плану
звірки нових записів не дозволена. Локальний synthetic restore перевіряє
обидва snapshots у різних файлах, не змінюючи production.

### Межі доказів цього доповнення

Локальний API/SQLite набір до двох review-regressions:36PASS (25conversion+11existing assistant).
Міграції:26PASS у targeted suite та окремий portal-history restore1PASS.
Охоплено п'ять паралельних повторів, конфлікт payload, expiry/revoke, відмову
outbox із повним rollback, CAS, paging та зміну повноважень перед відповіддю.
Це результати робочого snapshot, а не незмінного release SHA. Source review,
остаточна збірка й інтегрований CI мають окремий evidence receipt.

Додано2actual VPS→signedHTTP→PostgreSQL cases до чинного bridge suite
(11загалом); нові cases тут NOT_RUN через відсутність локального PostgreSQL.
Browser case та6мовний UI також потребують actual browser run. Live provider,
цільовий сервер, physical devices, privacy/retention approval і весь compound
KNB-06/21 acceptance цим доповненням не закрито.
