# KNABA site → ERP: безпечне перенесення заявок (source-only)

**Стан 25.10.2026:** розробка у відокремленій Draft-гілці поверх актуального сайту PR #65. НЕ production, НЕ об’єднаний CRM, НЕ автоматична передача даних. Інший кандидат — ERP/Telegram Draft PR #41, кодова база `683c09d0346fd05e0f2cd323da640bbb176c5c47`. Не зливати гілки одна в одну: зберегти зміни сайту PR #64/#65 і паралельного дизайну PR #66.

## Єдині джерела істини

- Сайт/VPS або Cloudflare D1: `cleaning_requests` і вже наявний owner CRM. Ці дані не переносити й не видаляти автоматично.
- ERP/PostgreSQL: затверджені `integration_config`, `integration_event`, `integration_record` і `lead`; жодної другої ERP/CRM БД. Вже існуючий `POST /api/v1/integrations/knaba_site/events`, `acceptIntegrationEvent` і схеми `integrationEnvelopeSchema`/`integrationLeadPayloadSchema`.
- Додаткова міграція `drizzle/0006_knaba_erp_lead_outbox.sql`: лише `request_id`, тип, стан, спроби, час, lease-token, SHA256 envelope, без email/телефону/тексту або платіжних/GPS даних. `ON DELETE CASCADE` на оригінальну заявку обмежує нерозіслані залишки під час локального видалення.
- `worker/api.ts`: `INSERT cleaning_requests`, audit і reference-only `site_erp_outbox` зберігаються одним `DB.batch` у SQLite/D1. Якщо outbox падає, форма **не** повертає фальшивий успіх.
- `vps/erp-bridge.mjs`: окрема операторська команда `node vps/erp-bridge.mjs --once` обробляє не більше одного елемента і **ніколи не запускається автоматично** від форми, cron, HTTP або імпорту модуля.

## Вимоги перед живим увімкненням

Не встановлювати показані нижче прапори в production і не запускати CLI, поки немає письмового дозволу компанії, затвердженої редакції Datenschutz, контролю доступу до PostgreSQL, зіставлення лише чинних офіційних послуг, перевіреної квоти й незалежного тесту реальних одержувачів. Приклади `example.test` — **виключно синтетичні, не чинні адреси**.

| Secret manager / runtime env | Правило |
|---|---|
| `KNABA_ERP_BRIDGE_ENABLED` | Має дорівнювати `true`, інакше CLI відмовляє ДО читання SQLite |
| `KNABA_ERP_TRANSFER_APPROVED` | Окремий `true` лише після реально зафіксованого GDPR/owner-review; сам прапор не є доказом схвалення |
| `KNABA_ERP_APPROVED_PRIVACY_VERSION` | Точний версійний `YYYY-MM-DD`, зіставляється зі збереженим `privacy_version` заявки |
| `KNABA_ERP_URL` | Тільки HTTPS URL з exact path `/api/v1/integrations/knaba_site/events`, без credentials/query/fragment і redirect |
| `KNABA_ERP_ALLOWED_ORIGIN` | Окремо затверджений EXACT origin ERP; `localhost`/IP literals не допускаються |
| `KNABA_ERP_KEY_ID` | Заздалегідь затверджений ERP integration key ID |
| `KNABA_ERP_SECRET` | HMAC-SHA256 secret 32+ символи, ТІЛЬКИ secret manager, не GitHub/чат/URL |
| `KNABA_ERP_SERVICE_MAP_JSON` | Явне `site_service_slug → approved ERP serviceId`; немаплена послуга блокується |
| `KNABA_DB_PATH` | Абсолютний шлях до дозволеної SQLite копії/джерела |

ERP окремо має мати `INTEGRATION_CREDENTIALS_JSON` для `source=knaba_site` і `keyId`, активовану власником компанії конфігурацію `integration_config`, затверджені `allowedServiceIds`, актуальні юридичні та операційні умови. Site CLI **не активує** ERP owner/config. Не плутати OAuth/WhatsApp/Telegram keys із HMAC site bridge.

## Контракт і властивості

1. Event `schema_version='1'`, `event_type='lead.upsert'`, `source='knaba_site'`, `event_id=external_id=request_id`, `occurred_at=cleaning_requests.created_at`. Зміст `payload` тільки `contact`, `serviceIds`, `language='DE'` як source default, обмежені customer-stated факти: тип об'єкта, поштовий індекс/адреса, площа, частота. Оригінальний вільний текст заявки і `privacyAccepted` НЕ копіюються. У ERP `marketingConsent` за замовчуванням false.
2. Знак `x-knaba-signature: sha256=<HMAC_SHA256(secret,timestamp+'.'+raw_json_bytes)>`; разом `x-knaba-key-id`/`x-knaba-timestamp`. Body fingerprint SHA256 зберігається перед зовнішнім запитом; зміна мапінгу при повторі блокує відправлення. Вікно ERP HMAC — 300 секунд, кожна спроба підписується новим timestamp без зміни event ID/body.
3. Відповідь `status=APPLIED` з тим самим event_id і actual effect_id переводить локальне джерело в `APPLIED`. ERP `QUARANTINED` означає `REVIEW`; HTTP 4xx (крім 429) — `BLOCKED`. Timeout, 429, 5xx або незрозуміла відповідь — bounded `PENDING` з незмінним event і digest, до 5 спроб, а НЕ фальшиве підтвердження.
4. `LEASED` з унікальним токеном і часом забезпечує конкурентний захист; crash може відновитися після expiry, бо ERP має атомарний ідемпотентний `integration_event`. Після відмови зміни source/mapping — **не** сліпо повторювати.
5. Перший інкремент переносить лише **нові заявки** після створення таблиці. Історичні заявки, відповіді власника, worker allocations, комерційні ціни, платежі, фото, Telegram і WhatsApp сюди НЕ імпортуються. Backfill потребує окремої перевіреної згоди/DSAR і плану. Cloudflare D1 outbox записується, але без окремого дозволеного dispatcher Cloudflare-кандидат також НЕ надсилає дані.

## QA, ризики, приймання

- На site source `83021d609484468ff7ca9ac1682abbed94f3fc1b` 2/2 portal red/green тести PASS: атомарна черга, replay, rollback, без PII snapshot.
- На site source `41ac7d0d27cb8a83c83e0bb61db418e93c5fe4ee` 9/9 publisher Node24 QA PASS (pure fake HTTPS transport): disabled mode, HMAC, mapping, consent, unknown outcome/dedup, quarantine, SHA conflict, erasure cascade, lease expiry, forged ack.
- Ізольований **реальний SQLite → реальний PostgreSQL17** contract test: source site `41ac7d0d27cb8a83c83e0bb61db418e93c5fe4ee`, ERP `683c09d0346fd05e0f2cd323da640bbb176c5c47`: 1/1 PASS. Test created synthetic owner, service, owner-approved ERP `integration_config`, signed HMAC bytes via site publisher; first HTTP acknowledgment artificially lost AFTER ERP ACID commit, second delivery accepted as `duplicate=true` with one lead/one integration_event and marketingConsent=false. Transport was an in-process exact ERP adapter — не реальний HTTPS/KNABA client.
- Незавершене: actual deployed SQLite/D1 migration/backup, production credentials, owner UAT, GDPR/DSAR cross-system erase, independent security review, WAF/HTTP reverse-proxy, operational monitoring, full integration test on real physical clients, release artifact attestation. Тести isolated ≠ LIVE.

**Rollback:** вимкнути bridge env/dispatcher; зберегти оригінальні `cleaning_requests`, аудит, відправлені event IDs і майбутній outbox. Не видаляти записи ERP або site без перевіреного двостороннього DSAR. Видалення лише синтетичних тимчасових QA-контейнерів допустиме після перевірки.

**Бюджет:** нові платні AI/WhatsApp/Telegram/ERP providers — 0 € активовано в цьому інкременті. Реальні тарифи, залишок квот і live-провайдери UNKNOWN. Без окремої перевірки/погодження ніяких розсилок.
