# KNABA — production, testing і Cloudflare замовника

## Фактичний статус цього пакета

**29.10.2026: `INTERNAL_ENVS_RUNNING_PUBLIC_NOT_READY`.** Доступ до фізичного `knaba` відновився. Перевірений пакет із коміту `4863aa70982df2b6af52682c761d9d32a89cdd08` збережено на сервері в `/srv/knaba/customer-setup-staging/20261029-4863aa70982d`. Preflight завершився о 01:00:18 за Берліном (00:00:18 UTC), bootstrap — о 01:01:01 (00:01:01 UTC). Створені окремі внутрішні production/testing і testing gateway. Попередній збій доступу 28.10.2026 є історичним, а не поточним блокером. Особисті VPS, акаунти й інші проєкти не змінювалися.

Джерело `knaba-physical-preview` у `/srv/knaba/restored-preview-20261028/` збережено. Перевірений повний runtime містить 411 файлів, SHA256 `d1ff8e64f38f4d55bbf936b6d070d9578200e233d7f1d86a157b8a1ea4fd3b21`. Production `/healthz` і `/readyz` повернули 200; testing health — 200, readiness — 503, оскільки окремий testing owner ще не створений. Домашня, EN/UK/RU та login сторінки повернули 200 в обох середовищах; анонімний CRM — 401. Gateway повернув 503 із noindex, як і має бути без customer Access. Це перевірка внутрішнього runtime, не прийняття нового дизайну, реального входу чи всієї ERP. Docker label не є доказом source Git provenance.

Створено початковий SQLite online backup 364544 байти, integrity OK і 0 foreign-key errors, а також щоденний production backup timer. О 01:01:47 за Берліном (00:01:47 UTC) підтверджено окремі DB inode, non-root UID995/994, read-only rootfs і лише loopback bindings. Backup service вручну завершився з Result=success/ExecMainStatus=0 та створив окремий scheduled backup; timer enabled/active. Receipt: `/srv/knaba/customer/receipts/host-verification-20261029.json`. Це не перевірка автоматичного запуску за розкладом, restart після перезавантаження чи restore drill. Cloudflare-конектор усе ще показує лише акаунт розробника; доступ замовника не підключено. Публічні DNS, чинний сайт і пошта не перемикалися. Домен підключається після підготовки й перевірки.

## Модель власності

| Ресурс | Власник | Доступ розробника |
|---|---|---|
| Чинна реєстрація `knaba.de` | Наявний власник реєстрації; цей етап його не змінює | Погоджена зміна nameservers після підготовки |
| Окремий Cloudflare account KNABA, зона/DNS, Tunnel, Access, Turnstile | Замовник | Права лише на KNABA, окремо для DNS/тунелю/testing |
| Чинні GitHub акаунти, репозиторій KNABA й релізи | Наявний власник; акаунти й репозиторії Івана залишаються в нього | Продовження розробки через наявні гілки/PR і дозволений доступ |
| Фізичний сервер, VPS акаунти й адміністрування | Наявний власник; передачі власності цей етап не виконує | Робота на фізичному `knaba` в межах наданих прав |
| Production дані й дозволені provider credentials | Наявна погоджена модель прав; ключі окремі для KNABA | Лише погоджені операції, без автоматичного перенесення акаунтів |
| Testing дані й ключі | Окреме середовище KNABA | Робочий доступ без production даних і ключів |
| Усі інші сайти, VPS, домени й акаунти Івана | Іван | Без змін |

Уточнення користувача від 29.10.2026 замінює попередню загальну вимогу перенесення: **усі чинні акаунти Івана залишаються його; на Cloudflare замовника налаштовуються зона `knaba.de`, DNS, KNABA Tunnel/Access/Turnstile.** GitHub замовника або передача репозиторію не є передумовою цієї роботи. Перенесення інших акаунтів, репозиторіїв або власності потребує окремої прямої вказівки.

Замовник зберігає відновлення, MFA, billing і роль Super Administrator свого Cloudflare. Доступ розробника надається іменним запрошенням. Пароль замовника, MFA-коди та Global API Key у чат не передавати. Асистент працює лише в межах доступу поточної сесії; це не окремий постійний системний адміністратор.

## Межі середовищ

| Параметр | Production | Testing |
|---|---|---|
| Домен після погодженого підключення | `knaba.de`, `www.knaba.de` → apex | `testing.knaba.de` |
| Каталог | `/srv/knaba/customer/production` | `/srv/knaba/customer/testing` |
| База | Перевірений online backup наявної KNABA бази | Нова порожня база, без клієнтських записів і паролів |
| Системний runtime user | `knaba-prod` | `knaba-test` |
| Docker project/network | `knaba-customer-production` | `knaba-customer-testing` |
| Застосунок на loopback сервера | `127.0.0.1:19120` | `127.0.0.1:19121` |
| Дозволений origin для Cloudflare | `http://127.0.0.1:19120` | Тільки gateway `http://127.0.0.1:19131` |
| Зовнішній доступ | Після перевірки та підключення домену | Тільки через Cloudflare Access для визначених людей |
| Оновлення | Окрема команда + дві зафіксовані згоди | Окрема команда розгортання тестової версії |

`19120`, `19121` і `19131` ніколи не відкриваються на LAN/WAN. У роутері не потрібні DMZ, UPnP, Exposed Host або вхідний port forwarding для HTTP/SSH. Тунель встановлює вихідне з'єднання. Docker-сервіси мають окремі networks і UID, read-only filesystem, без capabilities, без Docker socket і без загального sudo. Це ізоляція застосунків на одному сервері; root та Docker administrator залишаються довіреними адміністраторами.

Production і testing можуть читати той самий незмінний реліз, але завжди мають різні бази й конфігурації. Зміна testing не переписує production pointer або production state. У цій версії немає GitHub Actions із секретом production, autodeploy із push чи cron для оновлення коду.

## Що робить `knabactl.py`

- `preflight`: read-only перевірка правильного сервера, Docker Compose, вільного місця, зайнятості портів, фактичних mount-ів джерела, здоров'я відновленого контейнера й SHA256 усіх файлів runtime.
- `bootstrap`: одноразово створює окремі середовища. Відмовляється перезаписувати вже наявне або частково підготовлене встановлення. Зберігає вихідну відновлену версію. Використовує SQLite online backup з integrity/foreign-key перевіркою, а не копіювання відкритого WAL-файла. Для testing запускає CLI міграцій із цього самого runtime на власній новій базі.
- `stage`: зберігає новий артефакт за повним SHA256, без активації. Дозволені тільки `dist/`, `vps/`, `drizzle/`, `package.json`. Symlinks, state, config і секрети не входять у пакет.
- `activate testing`: перемикає лише testing на підготовлений артефакт із незмінною схемою; спочатку створює резервну копію testing.
- `activate production`: перевіряє приватний запис згоди користувача і замовника, точний артефакт, поточну версію й конфігурацію; створює online backup production; перемикає тільки код. При невдалій перевірці здоров'я повертає попередній код, зберігаючи production базу.
- `backup`: окремий перевірений online backup. Після успішного bootstrap створюється systemd timer щодня о 03:15 UTC із випадковою затримкою до 5 хвилин. Автоматичного видалення резервних копій немає. Копія на тому самому диску не замінює off-site backup.
- `status`: показує точні хеші й HTTP health/readiness, без паролів, env values, JWT або рядків бази.

Контролер не застосовує нову production SQL schema автоматично. Зміна міграцій потребує окремого узгодженого плану. Rollback коду не є відновленням старої бази; її відновлення може втратити нові записи й має бути окремим рішенням.

## Встановлення: виконаний початковий етап

Наведений нижче порядок збережено як процедуру початкового встановлення. На поточному `knaba` bootstrap уже виконано: **не запускати його повторно**. Для перевірки наявних середовищ використати команду `status`. Пакет працює лише на фізичному `knaba`, ім'я сервера перевіряється контролером.

```bash
sudo python3 ./knabactl.py preflight
```

Із фактичного результату взяти `source_artifact`, перевірити, що джерело — правильна відновлена версія, і запустити:

```bash
sudo python3 ./knabactl.py bootstrap --source-artifact <SHA256_З_ПЕРЕВІРКИ>
sudo python3 /srv/knaba/customer/ops/knabactl.py status
```

Не підставляти SHA Git-коміту чи Docker image замість SHA256 повного runtime. Не запускати повторний bootstrap для виправлення частково завершеного встановлення: спочатку переглянути приватний failure receipt та збережений стан.

Очікувані перевірки: обидва `/healthz` = 200; домашні й мовні сторінки доступні всередині; неправильний Host = 421; анонімний CRM = 401/403. Testing `/readyz` може законно бути 503 до створення окремого підтвердженого оператора. Це не потрібно маскувати. Збережені production identity bindings переносяться, паролі не перепризначаються.

Особисті Turnstile/OAuth/email/AI credentials не копіюються автоматично. Production отримує лише наявні `OWNER_EMAIL` і `KNABA_DEVELOPER_EMAIL`; testing починається без операторів. Потрібно окремо налаштувати дозволені для KNABA provider credentials, перевірені email та onboarding; Cloudflare Turnstile належатиме customer account. Це не вимога передати особисті OAuth/email/AI акаунти замовнику. Відсутній Turnstile може блокувати форми, які вимагають challenge. Не позначати такі сценарії робочими до реального тесту.

## Захист testing від стороннього доступу й індексації

`preview-gateway.mjs` перевіряє справжній Cloudflare Access application JWT: RS256 підпис, точний issuer замовника, application audience, строк дії та тип токена. Публічні signing keys беруться тільки з фіксованого HTTPS endpoint налаштованого issuer. Кеш, розмір відповіді, таймаути, кількість одночасних запитів та розмір request body обмежені.

Порожній `{}` у `testing/config/access.json` означає **503 для всього testing gateway**, а не пропуск авторизації. Після підключення акаунта замовника файл має виглядати так:

```json
{
  "issuer": "https://CUSTOMER_TEAM.cloudflareaccess.com",
  "audience": "EXACT_CUSTOMER_TESTING_APPLICATION_AUD"
}
```

Файл залишається приватним, не symlink, read-only у контейнері. `issuer` та AUD беруться зі створеного застосунка в акаунті замовника; не використовувати особисту Zero Trust організацію розробника. Gateway читає конфігурацію під час запиту. Якщо файл атомарно замінено на хості, потрібно відтворити gateway container, бо bind mount окремого файла може зберегти старий inode.

Для кожної відповіді, включно з API, assets, помилками, 401/403/404/503 і parser errors, gateway додає:

```text
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
Cache-Control: private, no-store
Referrer-Policy: strict-origin
```

Після успішної авторизації `/robots.txt` повертає `Disallow: /`, sitemap повертає 404. До авторизації ці шляхи теж закриті. Прикладний `Authorization: Bearer` і власні cookies застосунка зберігаються, тому не ламається існуючий Assistant. Вхідні підроблені identity/IP/Cloudflare headers не стають identity застосунка.

`robots.txt` сам по собі не приховує сайт: приватність забезпечує авторизація. Існування URL у сторонньому посиланні або раніше збереженому індексі неможливо абсолютно заборонити; запропонована схема не віддає вміст тестової системи неавторизованому crawler.

## Підключення Cloudflare замовника

### Перший крок для замовника

У своєму Cloudflare відкрити **Manage Account → Members → Invite members** і запросити `<EMAIL_РОЗРОБНИКА>` — фактичний email чинного підключення узгодити поза публічним репозиторієм. Для окремого акаунта лише KNABA підійде **Administrator**: повне технічне керування, включно зі зміною підписок, без керування учасниками та платіжним профілем. Власник залишається **Super Administrator**. Якщо в акаунті є сторонні проєкти, спочатку додати `knaba.de` без зміни NS і надати **Domain Administrator** лише для цього домену, плюс **Cloudflare Access** для Tunnel/Access і **Turnstile**, якщо він використовується. Останні ролі мають account scope; окремий акаунт KNABA краще відділяє інші ресурси замовника.

Створити permission policy, надіслати запрошення й дочекатися прийняття розробником. У **Members → ⋯ → Manage member settings** дозволити **API access for this member → Allow access**. Після цього перевірити, що клієнтський account ID справді доступний чинному конектору; саме запрошення ще не доводить API-доступ. Якщо початковий Zero Trust onboarding просить платіжні дані, їх вводить сам замовник; це може вимагатися й при виборі Free.

Англійські назви вище взяті з документації Cloudflare. Для орієнтації німецькою: Members — «Mitglieder», Invite members — «Mitglieder einladen», Allow access — «Zugriff erlauben»; це переклади, а не перевірені назви поточних кнопок. Потрібні account ID/назва, прийняте запрошення та email дозволених тестувальників. Не потрібна передача особистих акаунтів Івана або репозиторію.

Джерела: [учасники та API access](https://developers.cloudflare.com/fundamentals/manage-members/manage/), [ролі](https://developers.cloudflare.com/fundamentals/manage-members/roles/), [Zero Trust onboarding](https://developers.cloudflare.com/cloudflare-one/setup/).

### Після появи делегованого доступу

1. Перевірити customer account, додати `knaba.de`, якщо зони ще немає, зберігши Super Administrator за замовником. DNS ще не перемикати. Pending-зона дозволяє підготовку; вона не означає готовий публічний proxy. Free pending zone потребує активації протягом 28 днів, інакше її видаляють автоматично.
2. Перевірити права поточного підключення саме на цьому account. Створити окремі customer-owned tunnels `knaba-production` і `knaba-testing`; різні connector tokens. Розробнику, коли доступні гранулярні права, делегувати testing tunnel окремо. Надто широкі account roles можуть перекривати вузьке обмеження.
3. Створити Access self-hosted application для **всього** `testing.knaba.de`, а не лише `/admin`. Allow тільки підтвердженим email/group; вимагати MFA через налаштований IdP для привілейованого доступу. Без `Bypass`, `Everyone`, wildcard email або загального service token. Невизначені користувачі не допускаються.
4. Testing tunnel веде лише на `http://127.0.0.1:19131`. У його origin parameters увімкнути `access.required: true`, правильні `teamName` і `audTag`. У gateway задати той самий issuer/AUD. Ніколи не направляти testing hostname прямо на 19121 чи production 19120.
5. Production tunnel веде на 19120. Правильний Host — `knaba.de`; для `www.knaba.de` зберегти `www.knaba.de`, щоб сам застосунок повернув canonical redirect. Не публікувати SSH/RDP/DB як відкриті порти або публічний HTTP route.
6. Встановити шаблон `cloudflared-knaba-customer@.service` тільки після отримання правильних customer tunnel tokens. Файли `/etc/knaba-customer/production.token` і `testing.token` — root0600, каталог root0700; передавати token через захищений stdin, не CLI arguments, Git або чат.
7. Файли `production.env` і `testing.env` містять тільки `KNABA_METRICS=127.0.0.1:20242` та відповідно `127.0.0.1:20243`. Увімкнути окремі systemd instances `cloudflared-knaba-customer@production` і `@testing`, перевірити connector healthy, рестарт і журнал без секретів.
8. Для testing установити cache bypass; не віддавати приватний вміст із загального cache. Перевірити позитивний вхід дозволеного користувача, відмову іншому користувачу, відсутньому/підробленому JWT, noindex на всіх шляхах і fail-closed при неправильному AUD.

Наявний developer-owned `knaba-home` не перейменовується у «клієнтський»: після перевірки заміни його слід окремо вивести з експлуатації. Не видаляти чужі/інші тунелі й не змінювати account-wide settings особистого акаунта.

## Перед підключенням основного домену

Поточний артефакт міг бути зібраний для `kneba.vsp.rest`. Зміна runtime origin **не переписує** вбудовані canonical/hreflang/JSON-LD/sitemap. Bootstrap свідомо зберігає вихідні байти і режим `customer-candidate` із noindex. Це безпечний внутрішній production candidate, не готовність до індексованого публічного релізу.

Перед cutover потрібна точна відновлена source history, перевірена збірка для `knaba.de`, а для подальших testing build — конфігурація `testing.knaba.de`. Не підміняти відновлений runtime новішою непогодженою гілкою. Потрібні реальні browser login/logout, ролі, форми/Turnstile, CMS/CRM, backup/restore і доменні metadata checks. Після підтвердження офіційного артефакта production `KNABA_RELEASE_MODE` змінюється на `official` в перевіреній конфігурації, яка входить у запис погодження.

DNS переносити повністю, з MX/SPF/DKIM/DMARC та іншими чинними записами; не змінювати пошту через зміну web hosting. Якщо старий DNSSEC DS активний, узгодити його зняття/TTL і наступне ввімкнення DNSSEC за процедурою провайдера. Потрібні nameservers **нової зони замовника**, а не пари, раніше виданої для зони в особистому Cloudflare. Реєстратор one.com може залишитися реєстратором; передача реєстрації та зміна DNS hosting — різні операції.

Користувач також попросив пошту домену на сервері. Це окрема незавершена частина: Cloudflare DNS і web tunnel самі не створюють SMTP/IMAP скриньки. Чинні one.com MX та поштові записи зберігати до перевіреної готовності заміни, адрес скриньок і перенесення листів. До зміни MX перевірити шлях приймання SMTP, обмеження провайдера/порту25, PTR, SPF/DKIM/DMARC, TLS, захист від relay та резервні копії. Пошта не вважається налаштованою через успішний web health.

## Подальша розробка й production-реліз

Структура в наявному репозиторії зі збереженням його власника: робочі feature branches → reviewed `testing` → перевірений immutable artifact → окреме погодження production. Наявний `ziko1/knaba/main` містить документацію; його не можна автоматично прийняти за робочу production-гілку. Зберігати branch/PR/source receipts і приватну відновлену історію. Передача репозиторію замовнику не входить у цей етап і не є умовою налаштування Cloudflare.

```bash
# Stage перевіреного збірочного каталогу — без активації:
sudo python3 /srv/knaba/customer/ops/knabactl.py stage /private/reviewed-runtime --artifact <FULL_SHA256>

# Оновлюється тільки testing:
sudo python3 /srv/knaba/customer/ops/knabactl.py activate testing --artifact <FULL_SHA256>

# Лише після вашого дозволу та підтвердження замовника:
sudo python3 /srv/knaba/customer/ops/knabactl.py activate production \
  --artifact <FULL_SHA256> \
  --approval /srv/knaba/customer/approvals/<RELEASE>.json
```

`approval.example.json` навмисно непридатний до використання, доки немає справжніх підтверджень. Запис має бути root-owned0600, прив'язаний до цільового домену, нового та поточного runtime digest і config digest. Строк — не більше 48 годин, після успішного застосування повторне використання блокується. Посилання на підтвердження заповнює оператор тільки після фактичної згоди; JSON не є криптографічним підписом замовника. Root/власник Docker має технічну можливість змінити сервер, тому такі повноваження не надаються звичайному development account.

GitHub deployment protection можна додати після перевірки фактичного тарифу й видимості наявного репозиторію, без передачі його власності. На Free/Pro/Team required reviewers доступні для public repository; не робити клієнтський код публічним заради цього. Також перелік із двох required reviewers у GitHub сам по собі не означає дві згоди: для стандартного механізму достатньо одного. Потрібний окремий customer approval плюс ваш ручний production dispatch або підтримуваний незалежний deployment gate.

## Що ще не можна вважати завершеним

- Пакет і внутрішні середовища встановлені на `knaba`, backup service перевірений; restart/reboot та restore acceptance ще потребують власних receipts.
- Customer Cloudflare membership/account ID, Tunnel/Access/Turnstile та справжній testing Access login — ще не налаштовані. GitHub замовника не є блокером.
- Домен і пошта — не перемикалися; mail server не встановлений цим пакетом, публічний cutover окремий.
- Повна відновлена source provenance, canonical/SEO нового домену, реальний owner/developer UAT — потребують продовження.
- ERP PostgreSQL bridge, реальні email/WhatsApp/OIDC/provider workflows — не стають прийнятими через успішний HTTP health сайту.
- Off-site backup та human restore rehearsal — окремий крок із погодженим сховищем; він не передає власність на чинні акаунти.

## Локальна перевірка пакета

```bash
python3 -m unittest discover -s corporate-site/vps/customer-environments -p 'test_*.py' -v
node --test corporate-site/vps/customer-environments/preview-gateway.test.mjs
node --test scripts/*.test.mjs
git diff --check
```

Python перевіряє незмінність джерела, реальний SQLite WAL backup, заборону перезапису, відокремлені volumes/UID/networks, pin образу та подвійне погодження. Node перевіряє реальні HTTP запити з синтетичними RSA ключами, auth failures, headers, JWT expiry/rotation, помилки, таймаути й native form forwarding. Це локальні тести інфраструктури, не production acceptance і не повний тест застосунка.

## Офіційні джерела для продовження

- https://developers.cloudflare.com/tunnel/get-started/
- https://developers.cloudflare.com/tunnel/reference/origin-parameters/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
- https://developers.cloudflare.com/fundamentals/manage-members/roles/
- https://developers.cloudflare.com/fundamentals/manage-members/manage/
- https://developers.cloudflare.com/cloudflare-one/setup/
- https://developers.cloudflare.com/fundamentals/manage-domains/move-domain/
- https://developers.cloudflare.com/dns/zone-setups/reference/domain-status/
- https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/
- https://developers.cloudflare.com/dns/dnssec/
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- https://developers.google.com/search/docs/crawling-indexing/control-what-you-share
