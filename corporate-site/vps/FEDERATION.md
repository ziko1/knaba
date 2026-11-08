# F2: добровільний зв’язок акаунтів VPS і ERP

Це source-кандидат для password-based VPS runtime. Він пов’язує два вже наявні
акаунти після явної згоди; не видає ERP-сесію, не об’єднує акаунти за email і не
додає ролей. Обмін сесіями F3 залишається окремим закритим етапом.

Нормативний wire-контракт і ERP-власник даних:
`../../docs/unified/IDENTITY_RECONCILIATION_2026-11-08_UK.md`, секція F2.

## Конфігурація й runtime

За замовчуванням нова інсталяція не завантажує coordinator і не виконує F2-запитів.
Для окремо погодженого runtime потрібні:

- `KNABA_FEDERATION_ENABLED=approved`;
- `KNABA_FEDERATION_AUTHORITIES`: JSON-масив 1–8 перевірених authority-конфігурацій;
- точний стабільний `OWNER_USER_ID`, якщо власник бере участь у зв’язуванні;
- відповідна server-owned authority-конфігурація в ERP.

Кожна authority має `authorityId`, `companyId`, канонічний HTTPS `issuer`,
`siteOrigin`, `erpOrigin`, `siteAudience`, `erpAudience`, `policyVersion`,
`siteToErp:{kid,secret}` і `erpToSite:{kid,secret}`. Два ключі незалежні, кожен
щонайменше 256 біт, base64url. Вони належать цьому протоколу і не можуть бути
ключами intake, гостьового чату, cookies чи пристрою. У БД зберігається лише
fingerprint конфігурації. Ключі не потрапляють до HTML, transport payload або
receipt. Додавання конфігурації саме собою не підтверджує live-придатність.

Список усіх довірених destination зберігають поза відновлюваною auth-БД.
Вилучення раніше зареєстрованого destination або вимкнення F2 при збереженому
registry блокує запуск. Потрібні окреме узгоджене відкликання й reconciliation;
порожня конфігурація не є способом обійти revocation. Hosted Sites не отримує
цього VPS coordinator: його optional worker capability встановлює лише
довірений локальний сервер, а не заголовок чи клієнтський параметр.

`npm run build` збирає `vps/federation-entry.mjs` у `dist/vps/federation.mjs` разом
зі спільним ERP protocol helper. Production loader використовує цей bundle і
не потребує сусіднього ERP checkout. Інші server/auth modules залишаються у
наявному VPS package. Source, bundle і каталог міграцій постачають одним
узгодженим артефактом.

## Потік користувача

1. Користувач входить до свого ERP і створює одноразовий код після свіжого
   password/MFA-підтвердження. Строк коду — не більше п’яти хвилин.
2. У власному поточному акаунті сайту він відкриває `/account/erp-link/`, обирає
   налаштовану authority і вставляє код у POST-форму. Секрет не входить до URL.
3. Сайт показує обидва акаунти та компанію ERP. Користувач явно підтверджує
   вибір і повторно вводить чинний пароль сайту. Inspection прив’язаний до
   точного immutable user ID, cookie-сесії та актуального source witness.
4. Claim фіксує тільки запит. Остаточне підтвердження виконує початкова ERP-сесія
   після свіжої signed introspection сайту та перевірки PG ledger.
5. Сайт показує власний поточний статус. Відкликання зв’язку відкриває звичайну
   ERP-сторінку `/account/site-links`; ERP повторно перевіряє свою поточну сесію
   і пароль/MFA. Terminal unlink не дозволяє непомітного relink.

Підписи акаунтів є лише текстом для людини. Transport label обрізається до
120 UTF-16 units без розриву surrogate pair; profile name і immutable ID не
змінюються. Наявні шість мов використовують серверні форми та чинні стилі.
OIDC-only federation і додавання нового OIDC-провайдера до вже пов’язаного
акаунта відхиляються до реалізації окремого fresh-provider proof contract.

## Відкликання та зміни безпеки

Єдина послідовність — **P → L → C**:

- **P:** SQLite атомарно записує `PENDING_DENY` до першого outbound lookup або
  fence. Поточні affected sessions уже не проходять локальну авторизацію.
- **L:** усі налаштовані компанії підтверджують dedicated signed PG ledger fence.
  Невідомі та `REGISTERING` session refs теж охоплені. Idempotent retry зберігає
  operation ID і digest, але завжди має новий transport nonce.
- **C:** локальний синхронний commit перевіряє точний source CAS та актуальну
  bounded авторизацію ініціатора. Між SQLite locks і network немає overlap.
  Для principal change потрібна наступна окрема активація дозволеної epoch.

Ця межа діє для logout, усіх/інших/обраної сесії, пароля, reset та email-token
redemption, owner setRole/status, створення сесії та OIDC live-link checks.
Вона прив’язана до affected principal, а не до того, чи федеративна сесія у
самого адміністратора. Offline `update-owner`/`revoke-developer` відхиляють
enrolled target з `FEDERATION_COORDINATOR_REQUIRED`; непов’язані targets
зберігають звичайну поведінку. Trigger failure відкочує всю локальну транзакцію.
Permit належить одному connection, target, intent і синхронній транзакції.

Немає автоматичного повтору credential/grant mutation. Заміна password verifier
і grant candidate існують тільки в RAM запиту. Durable intent містить лише
ідентифікатори, обсяг, digest, witness і строк первинної авторизації ≤5 хвилин.

## Відмова, повтор і відновлення

`FEDERATION_PENDING` означає локальну заборону та непідтверджений глобальний
результат. Logout може очистити cookie, але повертає 503 з явним pending-станом.
Відсутність ACK, outage або перезапуск не перетворюють PENDING на success.
Сервіс може завершити раніше дозволене чисте відкликання без браузера.

Якщо після L втрачено RAM candidate, минув строк авторизації або не пройшов CAS,
старі локальні сесії відкликаються, PG tombstones зберігаються, а intent стає
`ABORTED_FENCED / REENTRY_REQUIRED`. Зміна пароля/ролі **не застосована**.
Повторний login з валідним старим паролем повідомляє `REENTRY_REQUIRED`.
Новий bounded proof, наприклад чинний наявний password-reset capability,
може дозволити окрему нову зміну. Тоді старий intent лишає правдивий результат
`CHANGE_NOT_APPLIED`; його втрачений candidate не відновлюється. Mail recovery
залежить від окремо налаштованого чинного account-mail runtime; F2 його не вмикає.

До першого outbound REGISTER локальна залежність уже має стан `REGISTERING`.
Після невідомого результату maintenance читає поточний ledger. Якщо ref досі
невідомий, він створює terminal fence і відкликає локальну сесію, а не повторює
втрачене надання доступу.

Кожен enabled startup підвищує authority generation, збирає повний підписаний
snapshot і переходить в ACTIVE лише після завершеного exact-revision обходу.
Старий локальний backup не може відновити terminal PG session ref: ref
детермінований від issuer, immutable user ID і high-entropy stored token hash.
Невідповідність відновлених credentials/grants актуальному PG fingerprint
залишається `RECOVERY_REQUIRED`. Цей synthetic source contract не замінює
окремої перевірки реального backup/restore і конфігурації всіх destination.

## Міграція й rollback

Canonical `0018_federation_runtime_barrier.sql` виконує тільки `SELECT 1`.
Її незмінний ledger receipt примушує точний pre-F2 VPS package з каталогом до
Assistant0017 відхилити запуск до читання cookies. Snapshot зберігає всі
23 попередні table definitions. VPS-only federation metadata додаються окремо;
історичні receipts, assistant-origin data, користувачі й ролі не переписуються.

Production startup не застосовує pending migration автоматично. Потрібні
reviewed migration/backup процедури наявного VPS CLI. Після 0018 rollback
дозволений тільки на сумісний binary або окремо перевірений backup із повним
authority reconciliation. Видалення marker/receipt чи змішування старого
binary з новими migration-файлами заборонене як неперевірений rollback.

## Перевірка

Локальні цільові тести:

```sh
node --test vps/federation-guards.test.mjs vps/federation-source.test.mjs vps/federation-rollback.test.mjs
node --test vps/federation.http.test.mjs
```

HTTP suite потребує актуальних Node bundles стандартного build. У core/HTTP
тестах SQLite та HTTP/signatures справжні; ERP ledger fixture синтетичний.
Окремий `tests/bridge/federation.test.mjs` використовує packaged VPS і built ERP
з actual PostgreSQL handlers. Його gate, browser, live/provider і restore
операційні підтвердження обліковуються окремо; локальні tests не оголошують їх PASS.
