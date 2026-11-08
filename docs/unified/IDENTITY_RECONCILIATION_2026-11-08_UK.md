# KNABA: авторизація сайту та ERP, виправлення і контракт спільної ідентичності

Дата: 08.11.2026, Europe/Berlin. Чинне доручення: продовжити Draft PR123, зіставити фактичну авторизацію, виправити підтверджені розриви, перевірити регресії на ізольованих даних. Без merge, production, DNS, реальних даних або нових платних сервісів.

База аналізу: **d03e72b8c5030390c635f3aac9133d977078dedf**, гілка **feat/knaba-integrated-completion-20261108**. Історичний GitHub run42430003249 належить попередньому executable09e267d, не цьому патчу. Актуальні source/test/evidence identities фіксуються у підсумковому checkpoint.

**Рішення:** виправити наявні шляхи автентифікації та відкликання; зафіксувати перевірюваний контракт федерації. Новий незавершений login gateway або другий intake outbox не створюється. **Спільний site↔ERP login/SSO залишається NOT_IMPLEMENTED; весь продукт NOT_READY.**

## 1. Простежуваність доручення

Це продовження KN-C04 / KN-U09, а не новий проєкт або паралельна черга.

| ID | Критерій | Власник і доказ |
|---|---|---|
| AUTH-01 | Звірити remote PR123/HEAD та фактичні contracts, identities, roles, sessions | root; GitHub metadata, чистий checkout d03, таблиця нижче |
| AUTH-02 | OIDC linking не завершується після відкликання початкової сесії; одна email не підвищує pending до owner | site_identity_audit; SQLite/OIDC та HTTP регресії |
| AUTH-03 | Відкликання сесії під час приймання HTTP body/SQL не дозволяє захищеної операції | site_identity_audit; request-scoped DB fence та loopback HTTP |
| AUTH-04 | Нечинний proof/device не дає ERP-доступу; scoped manager не змінює чужі customer/site grants | erp_identity_audit; негативні тести, незалежне відтворення reviewer |
| AUTH-05 | Старий пароль/MFA не створює нову сесію після rotation; TOTP і session атомарні | root; CPU RED/GREEN, окремі PostgreSQL cases |
| AUTH-06 | Customer membership читається однаково з чинною компанією, користувачем, строками й відкликанням | erp_identity_audit; цільові API/domain/read regressions |
| AUTH-07 | Точний майбутній протокол stable subjects, company/role scopes, dual proof і revocation; статус реалізації чесний | root; розділи 4–6, незалежний review |
| AUTH-08 | Є конкретний diff, source-bound evidence, canonical memory/roadmap і перелік меж | root + test_environment; результати локальних checks/CI, без перенесення старих PASS |

Нових зовнішніх paid calls не передбачено. Фактичний залишок модельних/GitHub квот не вимірювався; це не заява про необмежений безкоштовний runtime.

## 2. Що працює насправді

| Межа | Корпоративний сайт | ERP | Наслідок для об'єднання |
|---|---|---|---|
| Користувач | На VPS: випадковий opaque ID у vps_users; profiles.id прив'язаний до цього ID. На Sites: identity з довірених oai-authenticated-* headers | PostgreSQL aggregate user; ключ companyId + userId | Email, website profile ID та ERP user ID не є взаємозамінними |
| Вхід | VPS scrypt, __Host-knaba-session; опційний Google/Microsoft OIDC code + PKCE + nonce. Sites використовує hosting identity boundary | Власний scrypt login, knaba_session, TOTP; окремі device bearer tokens | Спільного cookie, provider session або token exchange немає |
| Строки | VPS session12год; OIDC state10хв; owner invitation має власний bounded flow | ERP session8год; guest24год; чутлива MFA10хв; invitation максимум24год | Не переносити строк чи proof одного механізму в інший |
| Компанія | Поточний portal фактично одна інсталяція з конфігурацією owner. profiles не є багатокомпанійною ERP membership table | Company із довіреної конфігурації API; транзакції й запити scoped company_id | Навіть верифікований site subject сам не визначає company |
| Ролі | owner/admin/client/worker/partner/bauleiter; pending/suspended — стани доступу; developer має окремий контрольований шлях | OWNER, DIRECTOR, OPERATIONS_MANAGER, INTERNAL_BAULEITER, EXTERNAL_BAULEITER, EMPLOYEE, CLIENT та інші permissions | Автоматичного словника «одна назва = ті самі права» бути не може |
| Клієнт | cleaning_requests.client_id та призначені worker/Bauleiter IDs | customer_membership із customerId, siteIds, окремими VIEW/ACCEPT_QUOTE/... capabilities | Профіль client не дає доступу до всіх customers чи їхніх об'єктів |
| Поточна авторизація | Profile status/role та transactional guards; додано повторну перевірку VPS session біля actual SQL | Engine повторно читає user/roles/delegations/customer memberships під company lock | Довгоживуча копія site roles у ERP небезпечна |
| Відкликання | Logout/password rotation видаляють sessions; disabled account і suspended profile блокують доступ; OIDC state тепер прив'язаний до початкової сесії | Roles/password/MFA/disable відкликають sessions; disable вимикає devices; SSE переавторизується | Між системами немає спільного каналу відкликання |
| Наявне linking | vps_oidc_links містить issuer+subject→site user; same-email existing account не auto-link | Invitation відхиляє вже наявний email, створює нову обмежену identity; customer grants посилаються на explicit proof ID | Наявні механізми слід розвивати; рівність email не створює доказ володіння |
| Передача заявок | Один site_erp_outbox і shared dispatcher | Чинний signed integration endpoint та inbox/ACID application | Це machine-to-machine intake, не login/SSO і не user delegation |

Первинні джерела:

- [site worker session та permissions](../../corporate-site/worker/api.ts), [VPS credentials/session](../../corporate-site/vps/auth.mjs), [VPS request adapter](../../corporate-site/vps/server.mjs), [OIDC](../../corporate-site/vps/oidc.mjs), [hosting trust boundary](../../corporate-site/src/lib/hosting-auth.ts).
- [ERP auth](../../erp/apps/api/auth.ts), [identity commands](../../erp/packages/domain/identity.ts), [Engine](../../erp/apps/api/engine.ts), [company-scoped database](../../erp/apps/api/database.ts), [permissions](../../erp/packages/domain/permissions.ts), [customer membership](../../erp/packages/domain/commerce.ts).
- [Нормативна ERP специфікація KNB-03/04](../../erp/KNABA_DE_TARGET_SPEC.md), [чинний intake contract](INTEGRATION_CONTRACT.md).

## 3. Виправлення підтверджених розривів

### Сайт: binding і відкликання

**OIDC linking.** Раніше state зберігав link_user_id, але не початкову сесію; logout або password rotation під час provider I/O не скасовували прив'язку. Новий nullable link_session_hash у VPS auth state містить лише hash, не bearer token. Перед provider exchange, у SQLite transaction перед linking і ще раз у transaction безпосередньо перед створенням нової session перевіряються саме початкова session, її user, expiry та enabled account. Остання перевірка закриває асинхронну паузу під час cleanup відповіді провайдера. Callback не залежить від наявності Strict-cookie при поверненні із зовнішнього провайдера. Legacy unbound linking state відхиляється; звичайний незв'язаний signup не отримує нових повноважень.

**Owner.** VPS owner прив'язується до заздалегідь provisioned account ID; callback не може створити pending social account із protected owner/developer email і використати його як bootstrap owner. Автоматичний VPS pin за provisioned email живе лише до завершення процесу; явний OWNER_USER_ID потрібен для стабільної прив’язки між перезапусками. Лише email у legacy Sites deployment залишається окремою конфігураційною межею: перед федерацією потрібен явний stable subject pin, а не припущення про live-конфігурацію.

**Запит у процесі виконання.** Account cookie перевіряється після асинхронного читання тіла; приватні SQL read/write/batch прив'язані до поточної session і authority. Existing Studio publication lock збережений. Для відкликання під час Worker/SQL-обробки authenticated API-запиту збережено403/forbidden; відсутня автентифікація на вході або втрата session під час приймання body повертає401. Захищена API-операція та її поточна відповідь не спираються лише на cached request identity після logout/disable/revocation; усі зовнішні file/delivery/browser paths потребують окремого приймання.

### ERP: proof, scopes і session issue

**Contact proof.** Membership grant перевіряє exact company/user, verified true, допустимий active, усі задані часові границі та revocation markers. Цільовий user має існувати в тій самій компанії й бути активним. Збіг email із чужим contact_identity не підходить.

**Scope адміністратора.** Manager без scope.company може grant/revoke лише непорожній набір призначених йому sites. Порожній siteIds означає доступ до всього customer і вимагає scope.company. Перевіряється також весь existing membership перед replacement/revoke, щоб вузький новий payload не дозволив змінити чужий широкий grant. Пошук existing grant враховує legacy user_id; конфлікт aliases або кілька кандидатів відхиляються, а валідний одиничний запис оновлюється без залишення другого активного grant.

**Customer portal.** Actual Engine regression відтворив читання чужого customer та непризначених sites для OPERATIONS_MANAGER без scope.company. Portal тепер обмежує sites/orders/published reports призначеними об’єктами; company-wide читання потребує і customer.read, і explicit scope.company. External або mixed internal+external roles далі проходять current customer membership. Це узгоджено з [ROLE_MATRIX](../../erp/docs/ROLE_MATRIX.md), permission+scope/default-deny у V4; сама назва ролі не є wildcard.

**Device.** Generic API більше не приймає disabled/revoked device або токен без валідного майбутнього expiry. Actor повторно звіряється з exact device employee і company; device не набуває MFA.

**Login race.** Дорога scrypt-перевірка лишається поза company lock. Фіналізація перечитує user/email/password_hash/totp_secret та актуальні ролі всередині чинної company transaction; TOTP update і session insert комітяться атомарно. Cookie видається після commit. Rotation, що завершився раніше, відхиляє старий login; rotation після issuance бачить і відкликає нову session. Незмінні login routes та response fields збережено.

**Membership reads.** Новий currentCustomerMembership використовується в Engine, commerce, communications, governance, resources, work notifications, assistant tools та authority fingerprints. Він звіряє company, однозначний userId/user_id, active===true, обидва revocation markers, усі наявні start/expiry aliases та форму scopes/capabilities. Explicit malformed marker false/0/empty не означає «не відкликано». Валідні legacy untimed/null fields збережено; privacy-erasure history discovery не фільтрується як current authorization. Fingerprints враховують зміну чинності навіть без зміни customerIds або запису до БД, тому cached receipt не повертає дані після expiry. Proof grant та current membership — різні перевірки, жодна не підміняє іншу.

## 4. Конкретний контракт спільної ідентичності — PROPOSED

Цей розділ визначає наступний implementation slice; він не описує створені в цьому патчі таблиці чи endpoints.

### Джерела істини

1. ERP PostgreSQL залишається джерелом user/company/role/customer/site entitlements. Користувач існуючого ERP акаунта не копіюється через signup сайту.
2. Site local user зберігає власний immutable ID. Для password-only site account federation issuer задає довірена конфігурація site authority, а subject — незмінний site_user_id; OIDC provider binding лишається його способом автентифікації. Для OIDC береться верифікована пара issuer+subject; довірена конфігурація задає issuer/audience/client ID. Заголовок Host, введений email чи browser companyId цього не визначають.
3. Binding у межах компанії: company_id + issuer + subject → existing ERP user_id, з site_user_id, status, version, proof reference, created/revoked timestamps та audit actor. Uniqueness і транзакція забороняють паралельну прив'язку одного principal до різних ERP users.
4. Email, ім'я, телефон — змінювані контактні атрибути. Їхня рівність не виконує join і не створює membership. Pairwise OIDC subjects між різними client IDs також не слід вважати автоматично однаковими людьми.
5. Revoked binding зберігається як audit/tombstone. Передача його іншому ERP user потребує окремої перевірки та явного нового погодження; повторна реєстрація email не відновлює доступ.

OIDC Core визначає стабільну ідентичність через issuer і subject, а інші claims не гарантують такої стабільності: [OpenID Connect Core §5.7](https://openid.net/specs/openid-connect-core-1_0.html#ClaimStability). Для нового redirect-based flow потрібні чинні OAuth security countermeasures: [RFC9700](https://www.rfc-editor.org/rfc/rfc9700.html).

### Прив'язка двох існуючих акаунтів

1. ERP створює одноразовий challenge лише з чинної authenticated session, same-origin CSRF і свіжої reauthentication. У challenge фіксуються exact ERP user, company, intended issuer/audience, випадковий nonce, expiry не більше5хв і session/security epoch; у БД лише hash секретного proof.
2. Користувач явно підтверджує прив'язку у вже authenticated site account. Сайт визначає subject сам, не приймає target role/user із browser assertion. UI показує обидва акаунти й компанію до підтвердження.
3. Callback/обмін перевіряє signature, exact issuer/audience, nonce, time bounds, challenge owner і обидві чинні sessions. Підписаний proof після logout/suspension не є достатнім; потрібна актуальна перевірка джерела.
4. ERP повторно завантажує користувача та entitlements, атомарно споживає challenge й створює binding. Concurrent confirm/replay не створюють двох bindings. Existing different-user binding повертає однакову безпечну помилку.
5. Прив'язка не створює OWNER/admin/worker/client grant. Onboarding без ERP account проходить чинне invitation/owner approval, а не silent account merge.
6. Токени з призначенням lead intake, guest conversation або device telemetry не приймаються як federation proof. Нові keys/audiences мають окремі scopes; existing intake secret не розширюється до user impersonation.

### Правила ролей

| Роль сайту | Можливий ERP контекст після окремого погодження | Обов'язкова умова |
|---|---|---|
| client | CLIENT | Active ERP user + конкретний customer_membership/capabilities/site scope |
| worker | EMPLOYEE або інша явно призначена ERP роль | Існуюча employee identity та призначені sites; без автоматичного device/GPS grant |
| bauleiter | INTERNAL_BAULEITER або EXTERNAL_BAULEITER | Явний вибір внутрішнього працівника або представника customer; права істотно різні |
| partner | Автоматичного ERP еквівалента немає | Owner-review окремого партнерського процесу; не маскувати під CLIENT або OWNER |
| admin | Явний операційний/технічний ERP permission set | Не надавати OWNER, finance чи payroll за назвою сайту |
| owner | Окремо provisioned ERP OWNER | Exact immutable account binding, fresh MFA, чинний owner/bootstrap control |
| developer | Тимчасовий DEVELOPER_SUPPORT за потреби | Scope, expiry, audit та окреме погодження; без прихованого superuser |
| pending / suspended | Жодного доступу | Default deny; existing binding не обходить статус |

## 5. Відкликання і межі клієнтів у майбутньому протоколі

- Кожний ERP-запит отримує поточні company/user/permissions/customer/site scopes. Binding доводить, хто це; membership визначає, до яких даних можна звернутися.
- Session, binding та membership мають окремі lifecycle/version. Logout завершує відповідну session; unlink відкликає binding; disable блокує user; role/customer revoke змінює entitlements. Жодне з цих рішень не можна виводити лише з email чи строку JWT.
- Вибрати один серверний механізм актуальності: online introspection або authoritative local revocation ledger з гарантованим порядком та bounded freshness. При недоступному/застарілому authority — deny, без безстрокового cached allow.
- Для чинної специфікації наступний API/callback/search/file/delivery має бачити відкликання; активні subscriptions закриваються не пізніше60с. Короткий TTL token сам по собі не доводить виконання цього критерію.
- Доставки, фонові завдання, приватні файли, пошук і кеші повторно перевіряють subject+company+current authorization. Cache key включає binding/authz version; worker не успадковує browser claims.
- Не розширювати існуючі anonymous leads до «власних» ERP orders за email. Перенесення історії заявок/guest chat потребує окремого перевіреного ownership transfer; machine intake залишається чинним.

## 6. Порядок реалізації та acceptance

| Етап | Зміна | Доказ до наступного етапу |
|---|---|---|
| F1 | Trusted issuer/company mapping; additive binding schema, uniqueness, expiry, audit/tombstone | PostgreSQL migration на synthetic copy; same-email/foreign-company/duplicate-subject rejection; rollback rehearsal |
| F2 | Повний dual-session link/unlink flow і обидва UI | Реальні локальні HTTP + SQL journeys: two valid sessions, CSRF, substitution, replay, simultaneous confirm, expiry, logout/rotation під час callback |
| F3 | Company-scoped session/token exchange або BFF; ERP current permissions | Site/client/worker/internal+external Bauleiter/owner matrix; foreign customer/site/file/search denial; no role escalation |
| F4 | Спільне відкликання, background delivery і subscription fences | Race tests; unavailable-authority deny; next-request revocation; stream closure ≤60с; no credential/token leak |
| F5 | Ізольоване staging/browser/device і поступове підключення | Exact artifact/config, backup+restore, two-company data, browser OIDC/Strict-cookie behavior, owner UAT |

У кожному етапі непроведене приймання лишається NOT_RUN/BLOCKED. Цей документ не створює source/SQL/SSO acceptance і не змінює72 AC або475 збережених V3 критеріїв на PASS.

## 7. Сумісність, міграція та відновлення поточного патча

- Public login/portal/ERP command URLs, credential hashing, cookies, invitation contracts і existing intake outbox/inbox збережені.
- ERP patch не змінює SQL schema і не перепризначає користувачів/ролі. Нечинні proofs або malformed memberships починають відхилятися; це навмисне посилення authorization.
- VPS auth schema отримує additive nullable OIDC state/session binding; startup із забороненими migrations має відмовити перед зміною БД. Перед реальним upgrade потрібні backup і відновлення на копії. Старі unbound link states не можна автоматично «довірити» новій сесії.
- Existing cookie sessions не імпортуються між системами. OIDC key/provider activation, нові DNS або production environment values не виконуються цим source change.
- Зворотний runtime rollback не повинен знову дозволити незв'язаний OIDC callback: при поверненні старого runtime спочатку вимкнути OIDC linking за окремою operational процедурою, зберегти additive column і audit. Поточний патч не видаляє бізнес-даних.
- Немає виміряного production p95 або навантажувального результату. Scrypt не перенесено під company lock; нові current-session guards додають bounded локальні перевірки. Продуктивність під production load потребує окремого вимірювання.

## 8. Межі доказів

Локально доступні Node24.22.1, Vitest та справжня ізольована SQLite; PostgreSQL/Docker локально відсутні. Чинний GitHub CI має окремі PostgreSQL17.6 services для ERP і bridge, не має deployment steps і відхиляє skipped ERP/bridge tests.

Загальний ERP HTTP command path перевіряє session перед окремою бізнес-транзакцією, яка перечитує поточні entitlements; цей патч не додає універсального session-proof fence для скасування вже автентифікованих ERP-запитів у процесі виконання. Це окрема частина F4, не результат login race fix.

Synthetic OIDC responses перевіряють наш протокол, а не доступність живих Google/Microsoft акаунтів. Loopback HTTP не підтверджує production reverse proxy або браузерну поведінку. Browser/physical device/owner/provider/UAT та спільний SSO залишаються окремими відкритими gates.

Підсумкові counts, sanitized assertion index, raw-log digests, exact source binding та незалежне review: [verification.json](evidence/identity-20261108/verification.json). Історичні RED та проміжні результати збережені окремо; synthetic bearer/CSRF values із failure payloads не публікуються. Остаточний PostgreSQL/aggregate CI результат додається лише після фактичного виконання на відповідному commit; попередній run не замінює цей gate.
