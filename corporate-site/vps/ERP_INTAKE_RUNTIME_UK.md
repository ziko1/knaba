# Серверний bridge заявок KNABA → ERP

Ця інструкція описує конфігурацію і перевірки компонента. Вона не підтверджує production activation або приймання реального клієнта. За замовчуванням мережеву доставку вимкнено. Секрети не додаються до GitHub, релізних файлів чи браузерної конфігурації.

## Єдиний шлях доставки

Worker, фоновий VPS-планувальник і ручна команда використовують одну реалізацію `drainErpLeads` та таблицю `site_erp_outbox`. Другого диспетчера немає. Черга містить посилання на оригінальну заявку, hashes, стан і обмежені дані атрибуції; копії контакту або тексту заявки в ній немає. Видалення заявки каскадно видаляє посилання. Термінальні переходи очищають атрибуцію.

Лише нова анонімна заявка, отримана при чинній погодженій конфігурації, отримує hashes незмінного підписаного envelope та business binding у тій самій транзакції. Заявки з автентифікованого порталу, legacy та непогоджені записи не отримують автоматичного дозволу: неприкріплений запис переходить у `BLOCKED / MAPPING_NOT_PINNED` без HTTP. Автоматичного backfill, `--pin` чи інтерфейсу переприв'язування немає. Для такого розширення потрібні окремий погоджений процес і перевірки.

`event_id` та `external_id` відповідають UUID заявки. Джерело фіксоване: `knaba_site`. Мінімальний payload містить контакт, дозволений service ID, мову, атрибуцію та явно введені факти. Площа передається як факт з одиницею `m²`; вона не стає billable quantity. Частота задає `recurring` лише для відомих значень і не перетворюється на бажану дату. Вільний текст лишається на сайті. Bridge не створює ERP-сесії і не надає користувачеві ERP-ролей, marketing consent чи notification consent.

## Перед увімкненням

1. Перевірте міграцію сайту в ізольованому середовищі. Перед погодженим production upgrade збережіть і перевірте відновлення резервної копії.
2. У ERP налаштуйте чинний server credential для конкретної company, source `knaba_site` і key ID. Створіть, перегляньте й підтвердіть ACTIVE integration mapping через наявні захищені ERP-команди. Власник і service IDs мають бути активними. Наявність секрету сама не дає бізнес-дозволу.
3. Налаштуйте перевірений HTTPS origin ERP. DNS, TLS і egress policy мають обмежувати відправлення погодженим сервером. Код відхиляє IP/local origin, userinfo, query/hash і redirects; це не самостійний захист від підміни DNS або скомпрометованої мережі.
4. Перевірте синтетичний цикл: сайт → SQLite → підписаний HTTP-запит → PostgreSQL → APPLIED receipt. Окремо перевірте QUARANTINED, дубль після втраченої відповіді, відкликання mapping/key, company mismatch і restart. HTTP 2xx без правильної квитанції не підтверджує створення Lead.

## Серверні змінні

| Змінна | Призначення |
|---|---|
| `KNABA_ERP_BRIDGE_ENABLED` | Лише точне `true` разом з другим gate дозволяє мережеву доставку |
| `KNABA_ERP_TRANSFER_APPROVED` | Окреме точне `true` після погодження передачі даних |
| `KNABA_ERP_URL` | Точний endpoint `https://erp.example.com/api/v1/integrations/knaba_site/events` |
| `KNABA_ERP_ALLOWED_ORIGIN` | Той самий HTTPS origin без path/query/hash |
| `KNABA_ERP_COMPANY_ID` | Очікувана ERP company; входить у binding і підписаний `target_company_id`, receiver звіряє її з credential |
| `KNABA_ERP_KEY_ID` | Чинний ERP key ID; ніколи не browser input |
| `KNABA_ERP_SECRET` | Секрет із захищеного server store, 32–4096 символів |
| `KNABA_ERP_MAPPING_VERSION` | Версія погодженого зіставлення source і сервісів |
| `KNABA_ERP_SERVICE_MAP_JSON` | JSON object: site service slug → один дозволений ERP service ID |
| `KNABA_ERP_APPROVED_PRIVACY_VERSION` | Погоджена версія privacy у форматі YYYY-MM-DD; має точно збігатися із заявкою |
| `KNABA_ERP_KEY_NOT_BEFORE` | Необов'язковий початок дії ключа в ISO UTC |
| `KNABA_ERP_KEY_NOT_AFTER` | Необов'язкова виключна межа дії ключа в ISO UTC |

Приклад без секрету і без активації:

```dotenv
KNABA_ERP_BRIDGE_ENABLED=false
KNABA_ERP_TRANSFER_APPROVED=false
KNABA_ERP_URL=https://erp.example.com/api/v1/integrations/knaba_site/events
KNABA_ERP_ALLOWED_ORIGIN=https://erp.example.com
KNABA_ERP_COMPANY_ID=replace_with_approved_company_id
KNABA_ERP_KEY_ID=replace_with_approved_key_id
KNABA_ERP_MAPPING_VERSION=1
KNABA_ERP_APPROVED_PRIVACY_VERSION=2026-10-28
KNABA_ERP_SERVICE_MAP_JSON={"baureinigung":"replace_with_actual_erp_service_id"}
# KNABA_ERP_SECRET передайте окремо через server secret store.
```

Не використовуйте вигадані service IDs прикладу. Зіставлення і privacy version мають спиратися на фактичний каталог, згоду заявки та чинний ERP mapping. Для ручної команди також потрібен абсолютний `KNABA_DB_PATH`.

## Планувальники й ручний запуск

**Node VPS:** одразу після старту й кожні 30 секунд виконується обмежений batch. Локальна перевірка прострочених, скасованих і неприкріплених посилань працює також при вимкненій доставці; мережа має два окремі gates. Паралельні ticks у процесі не накладаються; між процесами діють SQL lease fences. Змінні читаються з поточного server environment через allowlist. Зміна `process.env` діє на наступній перевірці; зміни у systemd/environment files потребують контрольованого restart. `SIGTERM`/`SIGINT` спиняє нові ticks і чекає поточний batch перед закриттям SQLite. ERP-планувальник примусово вимикає email-канал у своєму виклику. Developer sandbox не отримує production ERP settings.

**Cloudflare Worker:** наявний `scheduled` handler викликає незалежні notification та ERP dispatchers із власними gates. Cron Trigger налаштовується окремо після погодження середовища. Source build сам не створює trigger і не активує provider.

**Ручна команда:** після `npm run build`, із захищено налаштованим server environment:

```sh
cd corporate-site
node vps/erp-bridge.mjs --once
```

Команда перевіряє gates та конфігурацію до відкриття БД, не застосовує міграцій і передає роботу тому самому core з лімітом одного claim. Застарілі записи не переприкріплюються. Вивід містить лише код стану. `STALE` означає, що цей процес не має чинного lease для запису результату; це не підтвердження доставки. За відсутності source bundle треба виконати build, а не запускати інший dispatcher.

Автоматичний batch бере максимум 3 claims, локальне обслуговування — до 50 кандидатів. Lease діє 120 секунд. Один HTTP attempt разом із читанням відповіді обмежений 5 секундами, квитанція — 4096 байтами. Переадресації не виконуються. Максимум 5 attempts протягом 7 днів; повтори використовують той самий event ID і точно ті самі bytes після перевірки source, binding і актуальної конфігурації. Поточний час повторно перевіряється перед записом результату; прострочений lease не приймає пізню квитанцію.

| Стан | Значення |
|---|---|
| `PENDING` | Очікує дозволений attempt/retry; не підтверджує відсутність віддаленого ефекту |
| `LEASED` | Claim належить конкретному lease token до строку дії |
| `APPLIED` | Прийнята точна matching ERP-квитанція |
| `REVIEW` | ERP повернув QUARANTINED; потрібен розгляд оператора |
| `BLOCKED` | Відправлення зупинено до відомого попереднього невизначеного attempt |
| `UNKNOWN` | Можливий уже прийнятий ефект або зміна джерела під час attempt; потрібне звірення ERP |

Власник може прочитати обмежений список станів через `GET /api/portal/erp-intake`. Endpoint не повертає контакти, payload чи секрети; сервер повторно перевіряє ту саму cookie перед відповіддю. Перегляд не запускає доставку.

## Пауза, ротація та відновлення

- Для паузи приберіть `true` хоча б з одного gate, перевірте відсутність нових attempts і виконайте контрольоване зупинення старого процесу за потреби. Уже прийнятий ERP-запит не можна відкликати лише локальною паузою.
- Ротація key ID/secret при незмінному business binding зберігає event ID/body. Погодьте key windows та ACTIVE mapping у ERP перед переключенням. Підписаний company target receiver перевіряє незалежно; ключ іншої компанії не дозволяє імпортувати туди стару заявку.
- Зміна origin/company/service mapping/version/privacy не переприв'язує старі заявки. Вони блокуються або позначаються UNKNOWN після невизначеного attempt; потрібне окреме перевірене рішення.
- Не очищуйте receipt history, щоб приховати помилку. Успішний retry має підтверджуватися квитанцією того самого event ID.
- Rollback старого binary поверх нової schema не є безпечним без перевірки migration guard. Потрібен forward fix або погоджений restore, що зберігає зв'язок site event IDs та ERP receipts.

## Локальні перевірки

```sh
cd corporate-site
npm run build
./node_modules/.bin/vitest run tests/erp-lead-transport.test.ts tests/erp-lead-scheduled.test.ts tests/erp-lead-outbox.test.ts
node --test vps/erp-bridge.test.mjs vps/erp-intake-scheduler.test.mjs vps/erp-intake-owner.test.mjs
```

Перевірки transport включають незалежний HMAC, company binding, актуальні key/config fences, виключну expiry boundary, APPLIED/QUARANTINED, розмір/UTF-8/timeout і справжній loopback HTTP redirect без переходу за Location. Ручні та runtime-тести перевіряють immutable retries, cancellation, lease races, live clock, FK erasure, disabled startup/restart maintenance і graceful stop. HTTP-тест відкликає справжню owner cookie під час читання metadata та очікує відмову перед відповіддю. Ці перевірки не підміняють окремий PostgreSQL E2E, browser/live acceptance або реальні ключі та дані замовника.
