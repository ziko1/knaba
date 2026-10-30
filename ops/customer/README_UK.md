# KNABA — комплект сервера замовника

Цей комплект запускає поточний сайт, PostgreSQL, ERP API, фоновий worker та наявні адаптери Assistant/WhatsApp/Telegram. Android/iOS користуються ERP API на окремому HTTPS домені. Сайт і ERP зберігають окремі облікові записи; комплект не підміняє їх неперевіреним SSO.

**Є два різні режими.** `prototype` запускає повний ізольований стенд у `APP_MODE=TEST` із синтетичними записами. У нього не можна вносити реальні персональні, бухгалтерські чи кадрові дані. `production` не додає демонстраційних даних і зберігає всі чинні перевірки фактичного власника, компанії, retention matrix та провайдерів. За відсутності цих передумов ERP не оголошується робочим.

Мовний контракт релізу: **Deutsch → English → Polski → Lietuvių → Русский → Українська**, німецька за замовчуванням. Мобільні двійкові файли, встановлення на телефон, реальні дзвінки та доставка через Meta/Telegram мають окремі результати перевірки у загальному звіті релізу.

**Фактичне мобільне постачання 28.10.2026:** Android `0.3.0` / build `3`, файл
`knaba-android-0.3.0-prototype.apk`, SHA256
`3e62935cafed829430f8f5384f24ac9ea964d2d4b4b680de283de7e7e9a37564`.
APK має перевірений V2 **debug-підпис для оцінювання**, а не виробничий ключ
замовника. Встановлення й оновлення на фізичному пристрої не перевірені.
iOS `0.3.0` у цьому комплекті — **вихідний код для Xcode**; підписаного IPA,
підтвердженого TestFlight/App Store URL і приймання на iPhone немає.
Повна інструкція та окремі native receipts включені до
`docs/mobile/DISTRIBUTION_2026-10-28_UK.md` і
`docs/mobile/evidence/prototype-20261028/`. Реальні компанійні бот-адреси
ще не підтверджені; два локальні входи на сайт працюють зі станом pending.

## 1. Що потрібно взяти до замовника

- Перевірений `knaba-…tar.gz`, відповідний `.sha256` та контрольний SHA256 із довіреної передачі. Архів містить конкретний Git SHA, сайт `dist/client`, Worker `dist/server`, SSR `dist/vps/render-page.mjs`, міграції, вихідний код ERP з lockfile, цей комплект і покладені у `dist/client/downloads/` APK.
- SSH/root-доступ саме до сервера замовника, підтверджений SSH host key, його реальні домени й email власника. Наявність іншого доступного VPS не означає, що це сервер замовника.
- Для мобільних застосунків — HTTPS ERP домен та облікові дані **ERP**. Облікові дані `/konto/` сайту автоматично не переносяться в ERP.
- Для перенесення реального сайту — узгоджений online backup SQLite, окремі необхідні файли/сховища та перевірений SHA256. Робочий `site.sqlite` разом із незавершеним WAL копіювати звичайним `cp` не можна.
- Для реальних ботів — підтверджений WhatsApp Business номер, Meta app/WABA credentials, Telegram bot username/token, webhook secret, дозволені тестові адресати та підтверджені умови/квоти. Публічний `wa.me` або `t.me` сам собою не доводить роботу бота.
- Для iOS на фізичному iPhone — підписана Apple збірка/TestFlight під обліковим записом власника. Simulator `.app` не є встановлюваним `.ipa`.

## 2. Передумови сервера

Linux, Python **3.10+**, Docker Engine та Docker Compose **v2**, щонайменше **10 GiB вільного місця та менше 90% заповнення**. Для одночасної збірки ERP і роботи стеку практично плануйте 4 GiB RAM або більше та запас місця для двох релізів/резервних копій; фактичні витрати залежать від файлів і БД.

Docker/Compose адміністратор встановлює з [офіційної інструкції Docker](https://docs.docker.com/engine/install/). Інсталятор не запускає неперевірений `curl | sudo sh`, не перебудовує firewall, не змінює DNS/MX/TXT і не видаляє старі копії. Для `proxyMode=standalone` потрібні вільні TCP 80/443, DNS A/AAAA двох імен на цей сервер та доступ до ACME. Caddy керує HTTPS після правильного DNS. Якщо на сервері вже є Traefik/Coolify/nginx, оберіть `external` і налаштуйте існуючий proxy на loopback порти з правильним `Host` та `X-Forwarded-Proto: https`.

Додаткові сервіси не отримують Docker socket. PostgreSQL не публікує порт назовні. Сайт/API доступні на хості лише через `127.0.0.1`; зовнішній HTTPS забезпечує вибраний reverse proxy.

## 3. Розпакування та перевірка перед установленням

Назви архіву і його SHA256 беріть з фактичної передачі релізу, а не з прикладу нижче. Файл контрольної суми потрібно звірити з незалежно отриманим значенням: сам файл поряд з архівом не підтверджує його походження.

```bash
umask 077
cd /root
sha256sum -c knaba-prototype.tar.gz.sha256
mkdir -p /root/knaba-installer
tar --no-same-owner --no-same-permissions -xzf knaba-prototype.tar.gz \
  -C /root/knaba-installer ops/customer
cd /root/knaba-installer
```

Прочитайте відомий SHA256 у змінну (це не секрет):

```bash
read -r -p 'SHA256 отриманого KNABA архіву: ' KNABA_BUNDLE_SHA256
python3 ops/customer/knaba.py inspect-archive \
  --archive /root/knaba-prototype.tar.gz \
  --sha256 "$KNABA_BUNDLE_SHA256"
```

`inspect-archive` повторно перевіряє архів і кожен файл за manifest, відхиляє path traversal, symlink/hardlink, спеціальні файли/права, дублікати, зайві або відсутні файли. Пакунок розпаковується лише після перевірки. Зовнішній архів не містить користувацьких БД, credentials, `.git`, `node_modules` чи ключів підписування.

## 4. Знайти наявні копії без їх зміни

```bash
sudo python3 ops/customer/knaba.py inventory \
  --scan /srv/knaba --scan /opt/knaba
```

Вивід містить шляхи KNABA, ознаки Git, фактичний HEAD і стан змін. Перевірка обмежена явно вказаними KNABA каталогами, не переходить за symlink і не читає secrets/БД. Звірте, яка копія є активною, перш ніж переносити дані. Нова інсталяція за замовчуванням — **`/srv/knaba/customer`**. Існуючий `/srv/knaba/vps` захищений від прийняття цим інсталятором. Непорожній каталог без маркера цього комплекту не перезаписується.

## 5. Повний прототип: один запуск установлення

Створіть приватний JSON з **реальними** доменами/email замовника. Нижче — приклад, його значення потрібно замінити:

```bash
install -m 600 ops/customer/settings.prototype.example.json /root/knaba-settings.json
sudoedit /root/knaba-settings.json
```

```json
{
  "mode": "prototype",
  "siteDomain": "preview.your-company.de",
  "erpDomain": "erp-preview.your-company.de",
  "ownerEmail": "owner@your-company.de",
  "developerEmail": "developer@your-company.de",
  "companyId": "knaba-prototype-customer",
  "proxyMode": "standalone",
  "sitePort": 19110,
  "erpPort": 19111,
  "releaseConfig": {}
}
```

`developerEmail` можна залишити порожнім. На контрольованому QA сервері можна додати `--runtime-uid <існуючий non-root UID> --runtime-gid <його primary GID>`: тоді комплект не створює системного користувача і змінює ownership тільки у своїх нових state-каталогах. Обидва значення мають відповідати вже існуючому користувачу; UID/GID 0 заборонені. Якщо порти 80/443 зайняті існуючим proxy, встановіть `proxyMode: "external"`. `companyId` прототипу обов'язково починається з `knaba-prototype-`; режим потім не перемикається в production у цій самій БД.

```bash
sudo python3 ops/customer/knaba.py preflight \
  --settings /root/knaba-settings.json

sudo python3 ops/customer/knaba.py --root /srv/knaba/customer install \
  --mode prototype --synthetic-only \
  --archive /root/knaba-prototype.tar.gz \
  --sha256 "$KNABA_BUNDLE_SHA256" \
  --settings /root/knaba-settings.json
```

Інсталятор перевіряє місце, Docker/Compose і порти; створює окремий системний обліковий запис `knaba-customer` без shell-доступу; генерує випадкові секрети в root-only `config`; перевіряє і ставить незмінний реліз у `releases/<SHA>`; збирає ERP з lockfile; застосовує міграції; створює тільки синтетичні ERP записи; **замінює відомий демонстраційний пароль випадковим**; запускає сайт, PostgreSQL, API і worker; перевіряє маршрути, hashes, версію ERP та heartbeat worker. Постачальники AI/WhatsApp/Telegram не вмикаються автоматично.

На повторному виклику з тим самим перевіреним SHA немає reseed, нових секретів, міграції чи restart. Паралельний оператор блокується lock-файлом. Для іншого SHA потрібна команда `update` з точним `--expect-current`.

**Синтетичний ERP вхід** збережений тільки у:

```text
/srv/knaba/customer/config/prototype-credentials.json
```

Відкрийте файл приватно на сервері через `sudoedit`. Початковий synthetic owner — `demo-owner@example.invalid`; пароль міститься лише в цьому приватному файлі. Інші синтетичні ролі мають свої `demo-…@example.invalid` email і той самий випадковий пароль прототипу. Це не дані реальної компанії. Не пересилайте файл у GitHub, публічний чат або сайт. `APP_MODE=TEST` не відкриває публічний shortcut вибору demo-ролі.

## 6. Призначити першого власника сайту

```bash
sudo python3 ops/customer/knaba.py owner-invite
```

CLI поверне **шлях до приватного файлу** і час дії, а не секретний URL. У приватному JSON є одноразове посилання `/activate-owner/#token=…`; воно діє дві години. Після перевірки особи передайте його власнику захищеним способом. Власник задає власний пароль. Інсталятор не надсилає email автоматично і не створює спільний пароль власника/розробника.

Після активації власника можна окремо виконати:

```bash
sudo python3 ops/customer/knaba.py developer-invite
```

Розробник має окремий вхід і відкличний grant; існуюча ізоляція його тестового кабінету збережена. Власник сайту та синтетичний owner ERP прототипу — різні записи у різних сховищах.

## 7. Змінити дані поточного власника

Для **того самого перевіреного власника** можна змінити email і наявне ім'я профілю без втрати його user ID, пароля, заявок та історії. Це не автоматична передача прав іншій людині.

Створіть приватний `/root/knaba-owner-update.json` у режимі `0600`:

```json
{
  "currentEmail": "old-owner@your-company.de",
  "newEmail": "new-owner-address@your-company.de",
  "name": "Ім'я того самого власника",
  "identityVerified": true
}
```

```bash
sudo python3 ops/customer/knaba.py owner-update \
  --input /root/knaba-owner-update.json
```

Команда перевіряє чинний owner email, відхиляє адресу іншого існуючого користувача або розробника; зупиняє лише сайт; створює перевірену резервну копію; оновлює користувача транзакційно, журнал аудиту та root-only `OWNER_EMAIL`; відкликає всі його сесії, старі OAuth links і невикористані owner invites; запускає сайт. Пароль і user ID зберігаються. ERP-ідентичність не змінюється. Якщо синхронізація env/БД не завершується, інсталятор відновлює попередні налаштування/БД і зберігає невдалу копію для розбору.

Після відключення живлення під час цієї операції журнал зберігається. Не редагуйте його вручну; виконайте:

```bash
sudo python3 ops/customer/knaba.py recover-owner
```

Передача власності **іншій особі**, зміна юридичної компанії та ERP OWNER мають пройти чинний identity/legal workflow; email match не створює такого права.

## 8. Перенести наявний сайт із перевіреної копії

Спершу встановіть новий сайт з `OWNER_EMAIL`, що відповідає вже існуючому власнику. **Не створюйте нового власника і не вводьте заявки до імпорту.** На старому сервері використайте існуючу `node vps/manage.mjs backup` у правильному контейнері/захищеному середовищі. Передайте отриману SQLite online backup через перевірений SSH і незалежно звірте SHA256.

```bash
sudo python3 ops/customer/knaba.py site-import \
  --input /root/verified-site-backup.sqlite \
  --sha256 '<SHA256 переданої SQLite копії>'
```

Імпорт дозволений тільки у порожню вже ініціалізовану БД нового сайту. Чинний власник у копії повинен збігатися з конфігурацією. Команда перевіряє SQLite integrity/foreign keys, створює backup порожньої цілі, зберігає попередній файл, імпортує, виконує чинні checksum-protected міграції та запускає сайт. Дані старого сервера не змінюються. Старі developer sandbox-файли, зовнішні uploads/S3 та інші окремі сховища потрібно інвентаризувати й переносити окремо; копія основного `site.sqlite` не означає повної міграції всіх можливих зовнішніх даних.

## 9. Окремі посилання WhatsApp і Telegram та мобільні завантаження

Усі релізи мають два різні входи:

- `https://<siteDomain>/bots/whatsapp/`
- `https://<siteDomain>/bots/telegram/`

Ці сторінки показують фактичний стан конфігурації; відсутні реквізити не підміняються вигаданим bot username або звичайним номером компанії. Після підтвердження компанією справжніх адрес у приватному `config/site.env` можна задати:

```dotenv
KNABA_VERIFIED_WHATSAPP_NUMBER='491…'
KNABA_VERIFIED_TELEGRAM_BOT='ActualCompanyBot'
KNABA_ERP_PUBLIC_ORIGIN='https://erp-preview.your-company.de'
```

Число — E.164 без `+`, username — без `@`. Не використовуйте приклади як реальні контакти. Для нового install ці значення можна включити у `releaseConfig` JSON. Встановлення реквізитів не вмикає реальні відправлення і не підтверджує приймання webhook.

Метадані завантаження Android мають одночасно містити справжній URL `.apk`, SHA256, версію та вид збірки:

```dotenv
KNABA_ANDROID_APK_URL='https://preview.your-company.de/downloads/knaba-prototype.apk'
KNABA_ANDROID_APK_SHA256='<справжній SHA256 APK>'
KNABA_ANDROID_DISTRIBUTION='prototype'
KNABA_ANDROID_VERSION='<справжня versionName>'
```

Підписаний тестовим ключем APK лишається `prototype`. `release` використовується тільки для перевіреного release signing. iOS install URL приймає лише чинне Apple TestFlight/App Store посилання:

```dotenv
KNABA_IOS_INSTALL_URL='https://testflight.apple.com/join/<реальний код>'
```

Позначку переходу на робочу версію налаштовуйте тільки після реальної перевірки її домену:

```dotenv
KNABA_WORKING_ORIGIN='https://<перевірений робочий домен>'
KNABA_WORKING_ORIGIN_VERIFIED='true'
KNABA_RELEASE_STAGE='prototype'
```

Публічний `GET /api/public/release` повертає тільки allowlisted поля стану, шість мов і посилання; credentials не повертаються. Приватні env мають формат `KEY='value'`; їх не можна виконувати командою `source`/`eval`. Після початкового встановлення використовуйте автоматичну безпечну команду `release-config`, а не зміну owner-конфігурації. Створіть JSON `0600` тільки з ключами цієї секції, наприклад `KNABA_VERIFIED_TELEGRAM_BOT`, `KNABA_ANDROID_APK_URL`, `KNABA_ANDROID_APK_SHA256`, `KNABA_ANDROID_DISTRIBUTION`, `KNABA_ANDROID_VERSION`; потім виконайте:

```bash
sudo python3 ops/customer/knaba.py release-config --input /root/knaba-release-links.json
```

Команда змінює тільки allowlisted public metadata, зберігає поточні owner/secrets, робить приватну копію конфігурації, пересоздає лише сайт і відновлює конфігурацію при помилці. Повторіть `verify`; наявність URL все одно не є доказом інсталяції застосунку чи доставки бота.

## 10. Реальні провайдери Assistant / Telegram / WhatsApp

Адаптери поставляються в ERP API+worker. Для поточної реалізації дивіться `erp/.env.example` у вихідному репозиторії та фактичні `erp/apps/worker/main.ts`, `erp/apps/api/main.ts`; пакет містить ці виконувані файли. Відомі webhook endpoint-и:

| Канал | Вхід ERP | Захист |
|---|---|---|
| WhatsApp | `GET` і `POST /api/v1/webhooks/whatsapp` | verify challenge, Meta HMAC, exact phone-number ID, durable inbox |
| Telegram | `POST /api/v1/webhooks/telegram` | `X-Telegram-Bot-Api-Secret-Token`, bounded parse, durable inbox, guest-only identity |

Потрібні server-only env WhatsApp: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, перевірена `WHATSAPP_API_VERSION`, `WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED`. Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`; відправлення додатково вимагає `TELEGRAM_LIVE_SEND_ALLOWED`, `TELEGRAM_ALLOWED_CHAT_IDS`, `TELEGRAM_APPROVED_CONSENT_VERSION` і загальний `LIVE_SEND_ALLOWED` згідно з поточним worker.

Інсталятор окремо встановлює `PUBLIC_ORIGIN=https://<erpDomain>` для ERP/API
та `BOT_WEBSITE_ORIGIN=https://<siteDomain>` для публічних посилань меню.
Документ `erp/docs/BOT_RUNTIME_ORIGINS_UK.md` входить до архіву. Не ставте
URL послуг сайту на ERP-домен: ці сторінки належать корпоративному сайту.

**Поточний блокер першого Telegram opt-in.** Новий гість створюється з
`telegram_consent=false`, `telegram_opted_out=true`; `/start` і `/lang`
не надають згоди. В актуальному dispatcher `/consent` не активує згоду,
і готового публічного workflow запису погодженої версійованої Telegram-згоди
для нового гостя не підтверджено. `HUMAN_FIRST` також не надсилає
автоматичного меню. Навіть підтверджені token/webhook/URL та зміна політики
на `RULE_BASED` самі не усувають цей блокер. Вхідне звернення може потрапити
в людську чергу, але реальну відповідь новому гостю не можна оголошувати
готовою без підтриманого consent workflow і фактичного приймання доставки.
Не заповнюйте consent напряму в робочій БД за прикладом синтетичного тесту.

### Автоматична конфігурація CAPTCHA та провайдерів

Створіть приватний JSON `0600` з двома необов'язковими об'єктами `site` і `erp`. Наприклад, для першого налаштування Turnstile (підставте реальну пару ключів, зареєстровану для цього домену):

```json
{
  "site": {
    "TURNSTILE_SITE_KEY": "<реальний публічний ключ>",
    "TURNSTILE_SECRET_KEY": "<реальний секретний ключ>"
  }
}
```

```bash
sudo python3 ops/customer/knaba.py provider-config --input /root/knaba-providers.json
sudo python3 ops/customer/knaba.py verify --require-public-forms
```

ERP поля беруться лише з наведеного allowlist; `DATABASE_URL`, `APP_MODE`, `COMPANY_ID`, owner email та довільні env не приймаються. Для ERP потрібен вже підготовлений образ/міграції (`install --prepare-erp`, у прототипі це виконується автоматично). Перед restart команда запускає канонічний `environment-check.mjs` і перевірку `workerOptions` без зовнішніх відправлень. Парні Turnstile/OIDC credentials перевіряються до зупинки сервісів. Secrets не друкуються; зберігається приватна історія конфігурації й журнал відновлення.

Якщо процес перервався під час config-update:

```bash
sudo python3 ops/customer/knaba.py recover-config
```

Це відновлює тільки конфігурацію, не замінює БД і не видаляє нові записи.

Реальні відправлення у prototype заборонені. У production встановлення `LIVE_SEND_ALLOWED=true`/`TELEGRAM_LIVE_SEND_ALLOWED=true` додатково вимагає **`--enable-live-send`** та приватний `approval` з `liveSendingApproved: true`, змістовним `reference` фактичного погодження компанії/провайдера/даних. Paid AI key або зняття synthetic-only вимагає окремого **`--enable-paid-ai`**, `paidAiApproved: true`, `reference` та позитивного `budgetCents`. Це запис оператора, а не незалежна перевірка квоти чи legal approval; чинні серверні approval/consent/permission/budget gates збережені. За замовчуванням новий ERP provider-config залишає всі реальні відправлення вимкненими.

Для незалежної перевірки реквізитів без надсилання повідомлень:

```bash
sudo python3 ops/customer/provider_check.py \
  --env-file /srv/knaba/customer/config/erp.env \
  --site-env-file /srv/knaba/customer/config/site.env --channel telegram
sudo python3 ops/customer/provider_check.py \
  --env-file /srv/knaba/customer/config/erp.env \
  --site-env-file /srv/knaba/customer/config/site.env --channel whatsapp
```

Doctor звіряє фактичну provider identity з публічним номером/username, читає стан webhook і не надсилає повідомлень. Щоб явно зареєструвати Telegram webhook, до Telegram команди додайте `--apply-telegram-webhook`. Якщо переносите вже підключеного бота, додайте також `--replace-webhook-from '<точний попередній URL>'`; невідомий інший webhook не перезаписується, pending updates не видаляються. Provider-config сам webhook не реєструє.

Початково `LIVE_SEND_ALLOWED=false`, AI synthetic-only, відсутні зовнішні credentials. Відсутні реквізити мають давати BLOCKED, а не фальшиве повідомлення «надіслано». Бот-команди/підтвердження, opt-in/opt-out, permissions, людський takeover та фінальні статути доставки перевіряються окремо на дозволених тестових адресатах. До production потрібні підтверджені реквізити компанії, lawful/consent записи, погоджена ціна/квота й поточні provider capabilities. Не можна визначати роль працівника чи власника лише за Telegram ID або повідомленням у чаті.

## 11. Перевірка після запуску

Перший `verify` покаже `siteReady` як BLOCKED, доки власник не активував сайт. Це очікувано, але не завершене приймання.

```bash
sudo python3 ops/customer/knaba.py verify --require-erp
# Після активації власника та налаштування справжнього HTTPS:
sudo python3 ops/customer/knaba.py verify \
  --require-erp --require-owner --require-public-forms --public-https
```

Перевірки охоплюють SHA256 усіх установлених файлів; `/healthz`, `/readyz`, головну сторінку, login, app/download entry, п'ять додаткових мовних входів та два bot entry; ERP `/version` з точним source SHA; ERP `/ready`; healthy worker; опціонально зовнішній HTTPS із перевіркою сертифіката; `/api/assistant/captcha` з явним `BLOCKED_EXTERNAL`, якщо CAPTCHA не сконфігурована. `--require-public-forms` робить її конфігурацію обов'язковою для exit 0. Успішна конфігурація CAPTCHA не підтверджує реальний challenge: він лишається окремим browser/UAT кроком. Невдалий обов'язковий check дає exit **2**. Немає `--insecure` або відключення TLS перевірки.

Окремо проведіть людське приймання: owner login/logout; запрошення клієнта/працівника/партнера; видимість лише власних даних; створення/статус заявки; діалог із власником/оператором; нативний login на фактичному Android/iPhone; мобільні дозволи; webhook дублікати/повтори/помилки та реальне повернення відповіді. Здоровий `/health` не доводить виконання цих сценаріїв.

## 12. Операційні команди, backup, оновлення й відкат

```bash
sudo python3 ops/customer/knaba.py backup
```

Команда зупиняє тільки сайт/API/worker цієї інсталяції на час узгодженого snapshot і відновлює їх. Сайт — SQLite online backup з integrity/foreign-key перевіркою. Синтетичний ERP — PostgreSQL custom dump та файли з hashes; автоматична відновлюваність дозволена тільки за відсутності privacy history. Production ERP — **чинний канонічний encrypted/HMAC backup** з private blobs та privacy ledger через `erp/infra/backup.sh`, а не спрощене копіювання робочої БД. Приватні config-файли в локальному операторському backup потребують захищеного диска/шифрування при off-host передачі; паролі, ключ шифрування та копії потрібно мати також у контрольованому recovery сховищі. Сам локальний backup не є перевіреним off-host recovery.

Оновлення ніколи не перезаписує попередній реліз або змінені секрети:

```bash
sudo python3 ops/customer/knaba.py update \
  --mode prototype --synthetic-only \
  --archive /root/knaba-next.tar.gz --sha256 '<новий SHA256 архіву>' \
  --expect-current '<поточний 40-символьний source SHA>'
```

Міграції починаються тільки після backup. Невдача після зміни схеми зупиняє application services і залишає `operation.pending.json`; старий runtime автоматично не запускається поверх невідомої нової схеми. Деталі помилки команди, якщо доступні, зберігаються тільки в приватному `/srv/knaba/customer/last-command-error.log` (0600), їх не треба публікувати: вони можуть містити службові конфігураційні дані.

Після усунення причини можна продовжити той самий exact-source кандидат:

```bash
sudo python3 ops/customer/knaba.py resume \
  --expect-current '<SHA кандидата з журналу>'
```

Для повернення до попереднього релізу разом із його даними:

```bash
# Після невдалого update:
sudo python3 ops/customer/knaba.py recover \
  --expect-current '<SHA невдалого кандидата>' --accept-data-rollback
# Після вже успішного update, якщо потрібний свідомий відкат:
sudo python3 ops/customer/knaba.py rollback \
  --expect-current '<поточний SHA>' --accept-data-rollback
```

`--accept-data-rollback` — явне підтвердження, що нові записи після snapshot можуть бути замінені. Перед відновленням зберігається також невдалий/новий стан. Для production ERP автоматичний in-place PostgreSQL rollback навмисно відхиляється: потрібно чинне `erp/infra/restore.sh` у **нову порожню БД**, незалежний свіжий erasure ledger і перевірка його відповідності. Це захищає вже видалені персональні дані від воскресіння зі старої копії. Інструкції: `erp/docs/BACKUP_RESTORE.md` у переданому архіві; виконувані `infra/restore.sh` та `scripts/restore-db.mjs` також входять у пакет. Не видаляйте production БД, щоб обійти цей бар'єр.

Для адміністрування **лише цієї інсталяції** використовуйте її конкретний Compose project name з приватного маркера і конкретну директорію релізу. Приклад отримання несекретних параметрів, без виконання env:

```bash
KNABA_CURRENT_SHA=$(sudo python3 -c 'import json; print(json.load(open("/srv/knaba/customer/.knaba-install.json"))["currentSha"])')
KNABA_COMPOSE_PROJECT=$(sudo python3 -c 'import json; print(json.load(open("/srv/knaba/customer/.knaba-install.json"))["projectName"])')
```

Звичайна діагностика — `verify`; не використовуйте загальний `docker system prune`, `compose down -v`, очищення старих каталогів чи видалення чужих контейнерів. Для керованого пересоздання після дозволеної зміни env є `sudo python3 ops/customer/knaba.py restart`; він перевіряє integrity релізу та відсутність pending recovery і працює лише з цим project name. Для повноцінної зміни provider/release налаштувань надавайте перевагу `provider-config`/`release-config`, які роблять backup та recovery автоматично. Подальша автоматизація зміни доменів/юридичної особи потребує власного перевіреного переходу; початкове встановлення й перенесення не надають такого дозволу автоматично.

## 13. Перехід до production

Створіть окрему інсталяцію та окрему реальну БД, використовуючи `settings.production.example.json`. Команда:

```bash
sudo python3 ops/customer/knaba.py --root /srv/knaba/production install \
  --mode production --prepare-erp \
  --archive /root/knaba-release.tar.gz --sha256 '<перевірений SHA256>' \
  --settings /root/knaba-production-settings.json
```

Це запустить сайт і підготує PostgreSQL/міграції/образи ERP. Реального ERP власника bootstrap виконують існуючим захищеним контрактом: company legalName/address/registration/evidenceReference та owner email/name/password/TOTP/evidence у приватному JSON `0600`, без секретів у командному рядку:

```bash
sudo python3 ops/customer/knaba.py --root /srv/knaba/production \
  erp-bootstrap-owner --input /root/verified-erp-owner.json
```

**Відомий обов'язковий guard:** production ERP до старту перевіряє сім категорій retention (`PROFILE`, `TIME`, `PAYROLL`, `GPS`, `CHAT`, `MEDIA`, `AUDIT`), актуальні approved legal evidence та незалежність автора/погоджувача. Bootstrap власника сам їх не створює. Треба перенести вже узгоджені записи або виконати чинний, юридично підтверджений workflow окремо. Команда нижче має чесно відмовити, якщо матриця/власник/компанія не готові:

```bash
sudo python3 ops/customer/knaba.py --root /srv/knaba/production erp-activate
sudo python3 ops/customer/knaba.py --root /srv/knaba/production verify \
  --require-erp --require-owner --public-https
```

Не перетворюйте synthetic/TEST записи на робочі зміною одного env. Не оголошуйте provider delivery, native signing, physical-device UAT чи повну product acceptance завершеними за результатом збірки або health endpoint.

### Домен замовника та індексація

Цей прототип зберігає `noindex`. `KNABA_RELEASE_STAGE=production` змінює
лише публічний статус, а не SEO/crawler режим. У поточній збірці canonical,
OpenGraph та sitemap підготовлені для KNABA (`knaba.de` або `kneba.vsp.rest`
залежно від build-time `KNABA_RELEASE_MODE`). Зміна runtime Host/DNS сама
не переписує ці вбудовані адреси. Для індексованого корпоративного сайту на
іншому домені потрібна окрема перевірена перебудова з вихідного репозиторію,
актуальні юридичні реквізити та перевірка canonical/robots/sitemap.
Поточний customer bundle є готовим до ізольованої технічної перевірки;
він не засвідчує public SEO cutover на довільний домен.

## 14. Як створити наступний передаваний архів

Після фактичних тестів, `corporate-site` build/verify і commit усіх перевірених змін:

```bash
python3 ops/customer/knaba.py package \
  --source /absolute/path/to/knaba \
  --output /private/output/knaba-customer-<SHA>.tar.gz
```

Команда відмовляє для dirty source, не включає `.git`, `node_modules`, ключі/SQLite/secret env, перевіряє потрібні runtime файли, записує Git SHA та SHA256 кожного файла, створює детермінований tar+gzip і повторно перевіряє власний результат. Однакові inputs дають однакові bytes. Архів не є підтвердженням виконання тестів на сервері замовника; exact-source evidence передається разом із загальним release report.

## Межі поточного доказу

Операторські archive/config/SQLite/locking тести та native Node SQLite owner-maintenance тести виконуються локально. У тестах, що перевіряють порядок команд Docker, Docker є явним double; це не контейнерне приймання. Фактичний Docker/Compose run, HTTPS/DNS, migration/rollback на машині замовника, підпис iOS/Android, webhook delivery і людське приймання мають окремі фактичні статуси в кореневому звіті релізу.
