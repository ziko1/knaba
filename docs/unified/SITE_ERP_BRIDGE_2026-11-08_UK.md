# Передача заявок сайту до ERP — кандидат 08.11.2026

**Реалізовано в джерелах; автоматична доставка вимкнена. Не активовано на production.** Сайт і ERP продовжують мати окремі облікові записи. Цей модуль не є SSO, повною синхронізацією CRM або каналом WhatsApp.

## Контракт і межі

Нова заявка через `POST /api/leads` записується разом з аудитом і посиланням `site_erp_outbox` одним D1 batch / локальною SQLite-транзакцією. Ідентичний повтор не створює іншої події. Старі заявки не додаються в чергу автоматично. Існуючі міграції 0000–0012 збережено; нова **0013_site_erp_outbox.sql** лише додає таблицю та індекси.

Окремий VPS dispatcher викликає існуючий `POST /api/v1/integrations/knaba_site/events`. Envelope: `schema_version:'1'`, `event_type:'lead.upsert'`, `source:'knaba_site'`, стабільні `event_id`/`external_id`, час заявки і `payload`. Авторизація: `x-knaba-key-id`, `x-knaba-timestamp`, `x-knaba-signature: sha256=<HMAC-SHA256(timestamp+'.'+rawBody)>`. Компанію визначає серверна конфігурація ERP-ключа; browser tenant/role не приймається.

Передаються ім'я, email, необов'язковий телефон, відображення послуги в ERP service ID, мова, тип об'єкта, площа/адреса/період і обмежена атрибуція. Довільний текст повідомлення, приватна переписка, оплата, GPS і призначення працівників не копіюються. Мова та landing page беруться лише із same-origin Referer; його query/hash не зберігаються, окремі campaign/ref допускають обмежений набір символів. Мови: DE/EN/PL/LT/RU/UK; відсутній або зовнішній Referer дає DE і порожню атрибуцію. Це недовірена атрибуція, а не доказ особи.

SQLite зберігає посилання на первинну заявку, контрольну суму envelope та призначення, стан/спроби/підтвердження. Повтор використовує ті самі байти й event ID. ERP має власну транзакційну дедуплікацію inbox. Одночасні локальні виклики отримують lease; прострочена відповідь не перезаписує новий результат.

## Перед дозволеним увімкненням

Спершу погодити lawful transfer/privacy, service mapping, компанію ERP, виділити окремий ключ і перевірити весь шлях у TEST. На боці ERP потрібні захищені `INTEGRATION_CREDENTIALS_JSON` та рівно одна ACTIVE `integration_config`, створена, preview-перевірена й активована чинними командами з узгодженими source/key/owner/services. Самого site key недостатньо: без активної конфігурації перша доставка відхиляється і стає BLOCKED. Secrets налаштовує оператор через захищене середовище, без запису в Git, журнали чи браузер.

| Змінна | Вимога |
|---|---|
| `KNABA_ERP_BRIDGE_ENABLED` | Рівно `true`, інакше навіть БД не відкривається CLI |
| `KNABA_ERP_TRANSFER_APPROVED` | Рівно `true` лише після фактичного погодження |
| `KNABA_ERP_URL` | Погоджений HTTPS endpoint із точним шляхом `/api/v1/integrations/knaba_site/events`; без credentials/query/hash |
| `KNABA_ERP_ALLOWED_ORIGIN` | Точний origin цього endpoint; localhost/IP literal заборонені |
| `KNABA_ERP_KEY_ID`, `KNABA_ERP_SECRET` | Server-only; secret ≥32 символів, ключ прив'язаний до правильної компанії ERP |
| `KNABA_ERP_APPROVED_PRIVACY_VERSION` | Версія погодженої privacy для заявки; нинішній site source використовує `2026-10-28`, саме число не означає юридичне погодження |
| `KNABA_ERP_SERVICE_MAP_JSON` | JSON object: чинний site slug → перевірений service ID в цій компанії ERP |
| `KNABA_DB_PATH` | Абсолютний шлях саме TEST або погодженої site SQLite, уже з міграцією 0013 |

Команда з каталогу `corporate-site/`: `node vps/erp-bridge.mjs --once`. Вона обробляє не більш як одну готову подію. Немає scheduler, background loop або прихованого auto-send. CLI сам не застосовує міграції. Повернення `IDLE` не доводить, що ERP прийняла всі заявки.

## Стани та невизначена відповідь

| Стан | Значення / дія оператора |
|---|---|
| PENDING | Очікує ручного запуску / повтору після bounded backoff |
| LEASED | Один процес обробляє подію; lease 60 секунд |
| APPLIED | Перевірений ERP receipt з відповідним event ID та effect ID |
| REVIEW | ERP поклала подію в quarantine; потрібна перевірка в ERP |
| BLOCKED | Дані/конфігурація не дозволяють першу передачу або перша спроба точно відхилена 4xx, крім429 |
| UNKNOWN | Можливий уже виконаний ERP commit; **не створювати новий event ID і не робити blind replay** |

Timeout — 10 секунд; receipt ≤8 KiB; максимум 5 спроб, backoff обмежений. Lost ack після commit повторюється тим самим ID. Зміна контакту/байтів, endpoint, key ID, **самого secret навіть з тим самим key ID** або privacy після невідомого результату зупиняє передачу. Перед ротацією ключа звірити всі незавершені події з ERP inbox; рядок не скидати SQL-командою лише заради повтору. Повторна 4xx після невизначеного результату не доводить відсутність попереднього commit.

Owner-only `/api/crm/bridge-status` і CRM показують локальні лічильники, без персональних даних чи сирої відповіді ERP. `automaticDelivery:false` стосується цього модуля, не є заявою про зовнішні невідомі scheduler.

## Перевірка і відкат

Докази з exact SHA: `evidence/completion-20261108/verification.json`. Dispatcher тести використовують справжню SQLite та HTTP double; окремий ERP integration suite — справжні SQLite/PostgreSQL і вбудований transport до ERP domain handler. Це не зовнішня TLS/мережа чи live-компанія.

Перед production: backup→restore rehearsal, additive migration на копії, реальний HTTP endpoint/RBAC, owner-approved privacy/service mapping, quarantine/reconciliation UI, метрики й сповіщення, керований backfill за потреби. Фінальна production активація потребує погодження конкретного артефакту.

Відкат передачі: зупинити dispatcher/прибрати enabled, залишити таблицю й receipts. **Старий runtime до0013 відхилить новий migration ledger: просте повернення старого artifact з новою БД не працює.** Перевага — перевірений сумісний forward fix. Повернення БД до premigration backup потребує окремого погодження, зупинки записів, збереження та звірки всіх нових заявок/receipts і remote ERP effects; це ще не відрепетируваний production rollback. Не DROP, не очищати ERP inbox і не видаляти заявки. Зупинка не відкочує вже прийняті ERP effects; їх виправляє уповноважена бізнес-команда з аудитом.
