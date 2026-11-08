# KNABA — поточна authority спільних сесій (F4-B)

База: прийнятий F4-A `5133519984b6b50676393a7c4c4e541677d2cefa`, tree `4f0115028e6677a788b1579a18507f045e2c0070`, [actual CI42475824054](https://github.com/ziko1/knaba/actions/runs/42475824054). Його2820 ERP/31 bridge/732+90+268 site/30 root tests не є прийманням нового коду F4-B.

**Цей кандидат додає перевірку й відкликання federated sessions, але не створює browser login/token-exchange routes або session issuer.** `SITE_IDENTITY_SESSIONS_ENABLED` за замовчуванням вимкнений. Synthetic provisioned session rows у тестах не є реалізованим SSO. Продукт і F3–F5 лишаються NOT_READY до власних наступних критеріїв.

## Причина та rollback

Попередній AuthService вважає чинний рядок `auth_sessions` локальним cookie proof. Якщо записати туди новий federated token і лише додати sidecar, повернення на старий runtime прибере зовнішні перевірки. Тому нові токени існують тільки в окремій `site_auth_sessions`. Cookie `knaba_session`, CSRF і actor/company idempotency contracts збережені; старий reader такого token hash не знайде.

Адитивна migration `005_site_session_authority` не змінює старих рядків або frozen migration fixtures. Нова таблиця містить hash токена, company/user, exact binding id/version/generation, site issuer/audience/subject, hash первинної site session, profile version/fingerprint, trust/transport fingerprints, початкові строки та явно зафіксовані факти ERP MFA. Raw site cookie, raw ERP bearer, email та ім’я не зберігаються в ній. Provenance не можна змінювати; revocation terminal. Строк обмежено початковим site expiry та максимум8год від створення. Видалення ephemeral session record лише зменшує доступ; binding tombstones мають свій окремий lifecycle.

Фіксуються також ERP user version та fingerprint password/TOTP credential. Якщо старий runtime під час rollback змінить пароль/MFA/ролі, але не знає нової таблиці, повернення нового reader не відновить старої authority. Нова версія все одно перечитує ці початкові значення, поточного user і binding.

F4-B містить byte-exact frozen AuthService та SQL від513351 для тестів сумісності. Перевірка старого reader і replay старого SQL у synthetic schema не є повним production rollback/restore rehearsal. Реальні backup, cutover, erasure/retention policy та підключення нової identity metadata до privacy workflows потребують окремого приймання до реальної видачі сесій.

## Джерела довіри

ERP залишається джерелом ролей, permissions, customer memberships і site scopes. Прив’язка імен або email не виконується. Site role не переноситься в ERP Actor. `GUEST`, `SERVICE_ACCOUNT`, `DEVELOPER_SUPPORT`, inactive/guest ERP users не використовуються як federated principals.

VPS перевіряє саме початковий session digest: чинний строк, enabled account, approved profile, точні profile version/fingerprint, owner pin і developer exclusions. Новий вхід того самого site user не замінює старий session digest. Зміна профілю або peer key/config не оновлює snapshot у старій ERP-сесії.

Новий signed POST `/auth/site-identity/introspect-session` має окремий дозволений MAC path у чинному purpose-bound протоколі. Exact request містить9полів: `companyId`, `issuer`, `audience`, `subject`, `sessionDigest`, `profileVersion`, `profileFingerprint`, `trustFingerprint`, `transportFingerprint`. Успішна відповідь містить ці самі9полів і лише `active:true`, `expiresAt`, `checkedAt`. Вона не містить email, display name, ролей, password, raw cookie або consent grant.

Зберігаються configured origins, exact request/response bytes, окремий nonce кожного peer call, no redirects, bounded body/deadline і перевірка відповіді. Read-only replay чинного signed request у дозволеному часовому вікні знову читає SQLite. Це не одноразовий authorization code; старий response не підтверджує новий nonce/path. F2 consent grant не є session credential.

Introspection має власний authenticated per-session limiter600/min зі спільною bounded map5000ключів. Він не витрачає F2 peer quota40/min і не кешує успішну authority. Ліміти є конфігураційним рішенням цього коду, не виміряною production capacity.

## ERP request boundaries

`SiteSessionAuthority` читає окрему таблицю і використовує `SiteIdentityBindings.resolveIn()` у наявній company transaction. Вкладених `resolve()`/`getActor()` company locks немає. Original proof і його verifier зберігаються лише в request context; immutable descriptor не входить до Actor, JSON, outbox або command-receipt key.

Чинні credentials перевіряються до роботи, після async business work перед COMMIT, та через F4-A final response guards перед JSON/file/SSE. Локальні перевірки перечитують exact row, binding, generation, user/version і credential fingerprint. Зовнішня перевірка виконує новий signed HTTP call; успішний попередній результат не дає безстрокового дозволу. ERP звіряє мінімальну структуру, exact snapshots, expiry і bounded `checkedAt`.

**Точка зовнішньої авторизації — остання успішна signed introspection.** Site revocation, завершений до неї, відхиляє запит. Відкликання після цієї точки є наступною подією в іншій БД; PostgreSQL і SQLite не утворюють distributed atomic transaction. Код не обіцяє скасувати вже комітований ефект. Наступний запит знову звертається до site authority. Private-file та SSE races мають власні actual acceptance cases.

Для перевірки після async роботи bounded network call відбувається під існуючим company lock. Це свідомий correctness tradeoff цього кандидата: локальний F4-A не потребує таких викликів, а federated path має додаткову затримку та залежність від сайту. Production p95/throughput і нормативний load test ще не виміряно. Не називати цей slice performance acceptance або підставою змінити чинні бюджети.

## Відкликання та recovery

`user.roles`, `user.disable`, `user.password.rotate` та `user.mfa.configure` відкликають обидва session namespaces у тій самій PostgreSQL transaction. Unlink відкликає exact binding і його federated sessions; наступне binding generation не оживляє стару session. Primary ERP password/MFA flow для F2 збережений. Federated cookie сам не є fresh local proof для link/unlink; майбутній F3 UI має забезпечити явний локальний reauthentication шлях.

Logout має вузький server-only reduction path: exact local federated row + cookie CSRF, без залежності від reachable/enabled site. Він не повертає Actor або приватних даних. Request guard допускає лише точний committed `{ok:true}` після реального відкликання; довільний read/write result, неправильний reduction kind або rollback не створює ACK. Logout не перетворює federated token на локальну сесію.

Для password/MFA rotation зберігається мінімальний `{ok:true,reauthenticationRequired:true}`. Втрата HTTP-відповіді після commit не змінює ключ виконаної business command. Новий локальний вхід того самого користувача компанії може відновити чинний exact receipt після актуальної перевірки permissions. Інший user/company, стара revoked session або змінена авторизація не отримують цей результат.

Чинний `dispatch.assign` може додати об’єкт до `siteIds` самого керівника, якщо він одночасно є призначеним працівником. Через pinned `user_version` звичайна перевірка відхилила б цю дозволену зміну. Для цього одного сценарію Engine захоплює фактичного користувача до handler; після збереження receipt verifier доводить збільшення version рівно на1 та повну незмінність решти user snapshot, крім точного додавання одного `siteId`. Base permissions уже повинні містити `scope.company` і `dispatch.manage`; самі роль, назва команди чи browser field не надають винятку. Делегований `dispatch.manage` прибирає company scope, тому не відкриває цей шлях додавання нового власного об’єкта.

Окремий server-only capability прив’язаний до exact command/key/input hash, повних фактично збережених `order` і `crew_assignment`, власного активного employee, точного нового user snapshot і конкретного моменту відкликання. Усі чинні federated sessions цього ERP user відкликаються атомарно. Private `{order,assignment}` перевіряється за exact hash до COMMIT та перед відповіддю; додаткове поле, інший result/receipt або подальша зміна snapshot відхиляються. Тут **немає** outage-safe `allowRevoked` early return: binding, password/TOTP, конфігурація та свіжа signed site introspection обов’язкові. Внутрішній response-only frame обгортає лише read-only verifier transaction; наступна звичайна business transaction зі старою сесією отримує `NEEDS_REAUTH`. Свіжий локальний вхід може відновити receipt за вже чинною після операції авторизацією.

Після кожного async authority await request guard повторно перевіряє, чи HTTP-запит не закрито. Розрив з’єднання під час останньої перевірки до COMMIT відхиляє transaction. Це не обіцянка відкотити ефект, який уже встиг закомітитися до розриву.

Невалідний signed transport/unsigned site refusal повертає `DEPENDENCY_UNAVAILABLE`, оскільки body непідписаної відмови не є довіреною authority відповіддю. Це відмова в доступі, а не fallback до local cookie. Чинні explicit ERP metadata/session denials мають власний `NEEDS_REAUTH`; native unknown-write recovery має зберігати результат як невідомий, якщо ACK не отримано.

## Увімкнення та докази

Лише exact environment value `'true'` вмикає reader/introspection; undefined/null/empty/`'false'` вимикає. Інші значення відхиляються. Сам `peer.active` для F2 не вмикає F4-B. Enabled конфігурація потребує active exact peer і актуальної schema readiness. У цьому дорученні реальні flags/credentials не встановлюються.

Потрібні незалежний source review, exact-source build та actual Node/Nest HTTP + PostgreSQL + SQLite acceptance, включно з позитивними контролями, stale/session/config/role races, outage reduction, foreign scopes, old-reader denial, SQL compatibility та receipt recovery. CPU doubles мають окремі позначки. Наявність нової таблиці або зелений typecheck не закриває F3 issuance, решту F4 privacy/background policy, browser/Strict-cookie/device/UAT або весь KNABA DE.

Upgrade acceptance застосовує frozen old SQL та current SQL у власній PostgreSQL schema однієї transaction без `public` у search path: старі user/credentials/local sessions/binding tombstones повинні лишитися побайтово еквівалентними за повними рядками; нова таблиця починається порожньою, FK ведуть лише до власної schema. Rollback цього synthetic test не є production backup/restore rehearsal.
