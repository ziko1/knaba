# KNABA: авторизація сайту та ERP, виправлення і контракт спільної ідентичності

Дата: 08.11.2026, Europe/Berlin. Чинне доручення: продовжити Draft PR123, зіставити фактичну авторизацію, виправити підтверджені розриви, перевірити регресії на ізольованих даних. Без merge, production, DNS, реальних даних або нових платних сервісів.

База аналізу: **d03e72b8c5030390c635f3aac9133d977078dedf**, гілка **feat/knaba-integrated-completion-20261108**. Історичний GitHub run42430003249 належить попередньому executable09e267d, не цьому патчу. Перевірений runtime/test source: **fddd1601d989af3054099706589e1e8ab91ecf40**, [CI 42455220007](https://github.com/ziko1/knaba/actions/runs/42455220007); hashes і результати у [verification.json](evidence/identity-20261108/verification.json).

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

## Exact-source CI checkpoint — 08.11.2026

Runtime/test commit **`fddd1601d989af3054099706589e1e8ab91ecf40`**, tree **`4d413410bc748085b60d679d42586ee86f4d1e8a`**: [run 42455220007](https://github.com/ziko1/knaba/actions/runs/42455220007) завершив усі чотири обов’язкові jobs успішно. ERP **2677/2677** у 117 файлах зі справжньою PostgreSQL17.6 (включно з 8 новими SQL cases), bridge **9/9**, site **732 Vitest + 90 Node + 197 VPS**, root **28/28**; 0 FAIL/SKIP. Typecheck, migrations, clean build identity та site build/budgets пройшли. Попередній локальний SQL NOT_RUN лишається історичним фактом; hosted CI є окремим виконанням.

Поточне доповнення з CI evidence є documentation-only; 34 runtime/test input hashes незмінні. Подальший documentation HEAD не змінює tested executable identity і не доводить browser/device/provider/UAT. **SSO NOT_IMPLEMENTED, продукт NOT_READY.**

## F2 source protocol v1 — 08.11.2026, implementation contract

Цей розділ фіксує узгоджуваний source-контракт окремої гілки `feat/knaba-federation-source-20261108` від `adfa64b45179fcb2b59cd723351695a57d35652a`. Він не оголошує F2/F3/F4 або production завершеними. F1 не дублюється: використовується `SiteIdentityBindings.recordVerifiedLinkIn` та terminal `revokeIn`. F2 не видає ERP session, role, membership чи device grant.

### Authority, transport та schema

Конфігурація за замовчуванням вимкнена. Кожна server-owned authority задає `authorityId`, `companyId`, exact HTTPS `issuer`/`siteOrigin`, `erpOrigin`, `erpAudience`, `siteAudience`, `policyVersion` та окремі `siteToErp`/`erpToSite` ключі `{kid,secret}`. Secret — canonical base64url, щонайменше 32 випадкові bytes. Жоден intake/guest/telemetry ключ не приймається. Loopback HTTP можливий лише в явно налаштованому TEST fixture; redirects заборонені. Transport timeout — 3 s, body — максимум 32 KiB.

Один ERP server endpoint: `POST /api/v1/federation/authority`. Site endpoint: `POST /api/federation/introspect`. Shared Node module `erp/packages/integrations/site-federation-protocol.mjs` визначає byte contract; VPS delivery має включати його через перевірений build bundle, без прихованої вимоги sibling repository у production package.

Strict JSON envelope: `{v:1,companyId,issuer,audience,operationId,action,payload}`; `operationId` — UUID v4. Невідомі поля відхиляються. Exact raw bytes автентифікуються до JSON parsing. Headers: `x-knaba-federation-authority`, `-key`, `-generation`, `-time`, `-nonce`, `-signature`. Час — integer Unix milliseconds, вік не більше 60 s, майбутній skew не більше 5 s; nonce — нові 32 випадкові bytes у base64url. HMAC-SHA256 frame зв’язує REQUEST-v1 domain, налаштовані authority/issuer/audience/company/kid, generation, час, nonce, POST, exact path і SHA256 body. Response використовує окремий RESPONSE-v1 domain, протилежний direction key, original request nonce, час, HTTP status та body digest.

Generation є підписаним transport header; вона не змінює immutable business-operation digest. Retry після невідомого результату використовує той самий operationId/body digest і новий transport nonce. Duplicate operationId з іншим body — conflict. Receipt підтверджує історичний commit; він ніколи не є current authorization. Відповідь окремо містить current generation/revision/state. Nonce, operation receipt, ledger effect та audit фіксуються атомарно.

| Action | Strict payload |
|---|---|
| `BOOTSTRAP_AUTHORITY` | `{instanceId: UUID}`; generation header 0, idempotent operation |
| `RECONCILE_PAGE` | `{cursor: string|null, snapshotRevision: integer|null}`; server page limit 50 records |
| `ACTIVATE_AUTHORITY` | `{snapshotRevision: integer}`; exact current generation |
| `REGISTER_SESSION` | `{subject,sessionRef,epoch,securityFingerprint,sessionExpiresAt,sourcePolicyVersion}` |
| `LOOKUP_PRINCIPAL` | `{subject,sessionRef?:string}`; current generation/config, bounded exact-subject lookup, never a grant |
| `FENCE` SESSION | `{subject,scope:'SESSION',sessionRefs:[...],intentHash}`; 1–256 unique refs |
| `FENCE` PRINCIPAL | `{subject,scope:'PRINCIPAL',throughEpoch,nextEpoch,intentHash}`; `nextEpoch=throughEpoch+1` |
| `ACTIVATE_EPOCH` | `{subject,epoch,securityFingerprint,fenceOperationId,sourcePolicyVersion}` |
| `INSPECT_CHALLENGE` | `{code}`; safe ERP target/company labels only |
| `CLAIM` | `{code,subject,sessionRef,epoch,securityFingerprint,sourcePolicyVersion,reauthAt,siteLabel}` |
| `LINK_STATUS` | `{subject,sessionRef,epoch,securityFingerprint,sourcePolicyVersion}`; лише власні binding/challenge status DTO, без ERP business data |
| Site `INTROSPECT` | `{subject,sessionRef,epoch,securityFingerprint,sourcePolicyVersion,challengeId,purpose:'LINK_CONFIRM'}` |

`subject` — exact immutable site user ID, 1–128 characters без control/whitespace. `sessionRef` — 43 base64url characters, SHA256 of UTF-8 `KNABA-FEDERATION-SESSION-v1\0` + issuer + `\0` + subject + `\0` + stored token_hash. Raw token_hash/cookie не передаються. Epoch/policyVersion — positive safe integers; fingerprints/intentHash — 64 lowercase hex; timestamps — canonical UTC ISO milliseconds. Session registration не продовжує строк існуючої сесії та не змінює її subject/epoch. Tombstone exact sessionRef terminal у всіх generations.

### Security fingerprint

Source обчислює SHA256(domain `KNABA-FEDERATION-SECURITY-v1\0` + canonical JSON). Canonical JSON рекурсивно сортує keys. Snapshot має exact поля:

```text
{v:1,issuer,subject,policyVersion,
 credential:{salt,passwordHash,disabled:boolean},
 email:normalizedEmail,
 profile:null|{id,email:normalizedEmail,role:null|string,status},
 staffGrant:null|{email:normalizedEmail,purpose,active:boolean},
 ownerPolicy:{ownerUserId:null|string,ownerEmail:normalizedEmail,developerEmail:normalizedEmailOrEmpty},
 oidcLinks:[{issuer,subject,userId}] sorted by issuer,subject,userId}
```

Display name і звичайний `profiles.version` не входять: harmless name edit не стає security mutation. Source CAS окремо перевіряє актуальні row/credential versions. Raw snapshot/password verifier/salt ніколи не потрапляють у transport, receipt, audit чи diagnostics; передається тільки fingerprint. Проміжний replacement verifier/salt для rotation допускається лише в protected auth DB, у bounded operation з початковою свіжою authority ≤5 min; очищується при terminal state/expiry. Raw password/cookie/link code зберігаються лише в request/UI memory.

Для enabled federation owner eligibility потрібний explicit stable `ownerUserId`, а не lazy email lookup. Existing approved profile прив’язується за exact immutable ID; site roles не копіюються в ERP. Legacy site auth лишається окремим незміненим контрактом.

### Register, revoke, restore

Перед першим outbound REGISTER/CLAIM source атомарно зберігає REGISTERING dependency для exact principal/session та всіх налаштованих destination authorities. Unknown-session FENCE створює terminal tombstone навіть без попереднього REGISTER. Initial principal epoch — 1. FENCE principal закриває старі epochs, але не активує nextEpoch. ACTIVATE_EPOCH потребує exact попереднього fence та фактично застосованого поточного source state.

Порядок security mutation: local **PENDING_DENY (P)** → durable PG **FENCE (L)** під company lock → source final CAS/commit **C**, потім completed ACK. Network I/O не перебуває всередині SQL locks. Оскільки ERP authorization commit і L серіалізуються одним lock, C перед ERP commit гарантує, що ERP побачить fence. P сам не є completed global logout. При недоступному ledger можна очистити cookie й відмовити локально, але результат лишається PENDING; pending не очищується таймером. Втрата ACK повторює immutable operation із новим nonce. Source finalize failure не відкочує fence; результат `ABORTED_FENCED`/`REENTRY_REQUIRED` відокремлює закриття сесій від незастосованої зміни credentials/grant.

Scope координатора — affected target, не тип сесії ініціатора. Він охоплює logout/all/others/handle, password rotation, unauthenticated reset/email redemption, role/status/disabled changes, OIDC credential attach/remove, staff grant revoke, offline owner/developer maintenance та SQL guards. Synthetic workspace identities не допускаються. Terminal unlink не видаляє F1 tombstone й не дозволяє relink.

BOOTSTRAP_AUTHORITY встановлює нову PG generation і RECONCILING, відхиляючи старі proofs. Source до приймання security mutations/federation proofs читає bounded pages **усіх** subjects/dependencies/tombstones, відновлює local deny guards та перевіряє security fingerprints. Mismatch після restore не можна автоматично прийняти на новому epoch. ACTIVATE_AUTHORITY вимагає ту саму generation/snapshotRevision після local guard commit; concurrent FENCE змінює revision і вимагає bounded restart або fail closed. FENCE дозволений під час reconciliation; REGISTER/CLAIM/confirm — лише ACTIVE.

Configured historical destinations зберігаються поза restoreable auth DB; їх видалення/вимкнення потребує fence acknowledgement. Disabled config не стирає вже відомі obligations. Offline CLI приєднується до перевіреного current DB coordinator/generation або відмовляє; він не bootstrap-ить незалежну generation поверх активного server. Multi-company mutation завершується лише після ACK усіх destinations. Цей контракт не є доказом фактично виконаного restore.

### Browser flow, freshness та помилки

ERP routes: `GET /api/v1/account/site-links`; `POST .../challenge`; `POST .../challenges/:id/confirm`; `POST .../challenges/:id/cancel`; `POST .../bindings/:id/unlink`. Challenge вимагає current ERP web cookie, same-origin CSRF, fresh password та поточний TOTP коли налаштовано/потрібно. Guest/device/service account paths не приймаються. Scrypt поза company lock; exact credentials/session/current user повторно перевіряються перед commit. TTL challenge ≤300 s, 256-bit secret, лише hash у БД, exact original ERP session та trust configuration.

ERP показує одноразовий code для копіювання та звичайне посилання `/account/erp-link/` **без secret у URL**. Source UI після вставлення code показує обидва акаунти/company, виконує fresh password check та explicit confirmation. CLAIM лише закріплює site principal/session. Початкова ERP web session показує site account і окремо підтверджує final link.

ERP final confirm виконує nonce-bound online INTROSPECT поза SQL lock, потім під company lock перевіряє original ERP session/credential witness, expiry, current trust, exact ACTIVE generation/ledger session+epoch, атомарно споживає challenge та викликає F1 `recordVerifiedLinkIn`. Signed proof після logout/pending/suspension не достатній. Source response: `{active,subject,sessionRef,epoch,securityFingerprint,sourcePolicyVersion,generation,reauthAt,sessionExpiresAt,siteLabel}`; inactive response не відкриває приватні поля. Session/epoch/label не беруться з browser claims. Unlink — fresh current ERP self proof + CAS `revokeIn`, без source network dependency; F3 session exchange відсутній.

Site AccountSettings отримує current власний status через signed `LINK_STATUS`. Кнопка unlink відкриває поточний ERP account/self-unlink flow зі свіжою ERP автентифікацією; site не має окремого impersonation/revoke endpoint. Відсутня ERP session означає явний перехід до login, а не завершений unlink. F1 terminal tombstone показується як terminal, без автоматичного relink.

UI розрізняє DISABLED, ISSUED, CLAIMED, CONFIRMED, CANCELLED, EXPIRED, CONFLICT, AUTHORITY_UNAVAILABLE і REAUTH_REQUIRED; mutation невідомого результату спочатку читає status і не replay-ить credentials/code. Pending source revocation показується як незавершена, не як success. Немає offline journal, localStorage чи URL для proofs. Після session rejection приватні labels/code очищуються. Raw request diagnostics не повертаються.

### Acceptance та release gates цього зрізу

Потрібні CPU/actual signed HTTP/реальні PostgreSQL–SQLite regressions: late register після fence, fresh check→fence→commit, commit→fence, unknown ACK retry, concurrent confirm, stale generation/epoch/config, bootstrap page revision change, restored pre-enrollment registry, restored verifier mismatch, direct mutation guards, expired reauth, self-unlink при authority outage та відсутність credentials у durable/log/browser storage. PG/browser/live/device виконання позначається тільки за фактичними результатами exact candidate. Retention/erasure для нових identity/session/proof metadata потребує окремо затвердженої політики; CHAT classification не вигадується. Rollback/disable має лишати obligations fenced та tombstones збереженими, а не повертати boolean-only або pre-federation consumers у чинний потік.

### Локальна перевірка ERP F2 source candidate

Ізольований worktree базується на `adfa64b45179fcb2b59cd723351695a57d35652a`; нові ERP файли ще не є окремим release commit. На цьому candidate 68 CPU tests PASS: transport22, ledger domain12, signed local HTTP11, fresh password/MFA11, UI/DTO contracts12. Окремий суміжний набір F1/request-authority/API дав 111 PASS. `npm run build` завершився exit0: TypeScript, web build та server/worker bundles; `release.json` правильно має `source_dirty:true`, тому base SHA не подається як SHA готового релізу. Vite зберіг warning про великий JS chunk; нове вимірювання production latency чи performance acceptance не заявляється.

24 справжні PostgreSQL cases authored, але локально SKIPPED через відсутність `DATABASE_URL`: ledger12 і signed HTTP dual-session flow12. Вони охоплюють company-lock races, unknown-session tombstones, restore generation/cursor conflicts, original-session logout під час source I/O, source fence перед final commit, SQL deadline після F1 insert, one-use concurrency, tenant isolation та terminal unlink без source availability. Команда на disposable PostgreSQL: `APP_MODE=TEST DATABASE_URL=<test-database> npm test -- tests/site-federation-ledger.integration.test.ts tests/site-identity-link.integration.test.ts`. Міграції викликаються самими integration fixtures. Поки фактичний CI цього candidate не завершився, ці сценарії мають статус **NOT_RUN**, а не PASS.

Playwright collection підтвердила п’ять rendered fixture cases: initial proof/explicit final confirmation, original-session rejection, stale status response, self-unlink при disabled trust та reconnect після unknown issuance outcome. Локального installed Chrome немає, тому browser execution також **NOT_RUN**; SSR/collection не замінюють rendered evidence. Final acceptance потребує незалежного source review, ERP/VPS aggregate PostgreSQL/HTTP/browser gates та узгоджених release settings. Source candidate лишається default-off, F3 session exchange не реалізовано; production/provider/device readiness не заявляється.

### F2 v1 response DTO та реалізовані межі ERP source candidate

Signed success має форму `{ok:true,receipt:{operationId,action,generation,revision,result},current:{generation,revision,phase,policyVersion}}`. `receipt` — незмінний результат первинного commit; `current` — окремий поточний стан PG authority. Історична activation/register/lookup квитанція не є дозволом. Повтор stable operation з новим transport nonce повертає стару квитанцію та поточний стан; змінений digest відхиляється. Відкликання/expiry перевіряються знову в транзакції споживача. Signed failure: `{ok:false,error:{code},current?}`; generation/revision/config conflict —409, current-session failure —401, rate limit —429, недоступність authority —503. Невідома/вимкнена authority не відкриває endpoint і не запускає SQL.

| Action | `receipt.result` |
|---|---|
| `BOOTSTRAP_AUTHORITY` | `{instanceId,generation,snapshotRevision}` |
| `RECONCILE_PAGE` | `{generation,snapshotRevision,records,cursor,done}`; максимум50 записів, весь response максимум32KiB |
| `ACTIVATE_AUTHORITY` | `{activated:true,generation,snapshotRevision}`; потрібен повний server-tracked paged chain тієї самої revision після local guard commit |
| `LOOKUP_PRINCIPAL` | `{subject,hasDependencies,principal,session}`; лише точний subject і необов’язковий exact sessionRef, без credentials/roles; відсутній principal не означає відсутність session tombstones |
| `REGISTER_SESSION` | `{subject,sessionRef,epoch,principalVersion,sessionVersion}` |
| `FENCE` | `{scope,subject,minimumEpoch,sessionCount,fenceOperationId}`; `minimumEpoch:null` для session fence |
| `ACTIVATE_EPOCH` | `{subject,epoch,principalVersion}`; dedicated source authority засвідчує post-C fingerprint і exact latest principal fenceOperationId, без відновлення старої sessionRef |
| `INSPECT_CHALLENGE` | `{challengeId,companyLabel,erpUserLabel,expiresAt}` |
| `CLAIM` | `{challengeId,state:'CLAIMED',expiresAt}`; це ще не link або згода original ERP user |
| `LINK_STATUS` | `{bindings:[{bindingId,state,version}],challenges:[{challengeId,state,expiresAt}]}`; тільки exact current signed source principal/session, максимум8 останніх challenges |

`PRINCIPAL` record: `{kind:'PRINCIPAL',subject,epoch,minimumEpoch,state,securityFingerprint,sourcePolicyVersion,version,fenceOperationId}`. `SESSION` record: `{kind:'SESSION',subject,sessionRef,epoch,securityFingerprint,expiresAt,state,version}`; unknown-session tombstone має null epoch/fingerprint/expiry. Старі ACTIVE session records після principal fence залишаються історичними: epoch нижче principal floor завжди заборонений. `LOOKUP_PRINCIPAL` працює лише в поточній generation/config; nullable principal — snapshot, не дозвіл і не доказ відсутності race. Для fresh lookup потрібен новий operationId; під час enrollment/link commit PG state перевіряється ще раз під company lock. Reconciliation не може пропустити cursor або активувати authority до завершення всіх сторінок. Concurrent fence скидає прогрес та вимагає restart із null cursor.

ERP server configuration — окремий `SITE_FEDERATION_AUTHORITIES_JSON`, absent/empty за замовчуванням вимикає нову federation authority. Усі поля server-owned; максимум8 authorities для configured company. Нова конфігурація/ключі потребують збільшення `policyVersion` при BOOTSTRAP: старий вузол не може відкотити current authority. **F1 bindings зберігають immutable trust version/fingerprint**; зміна policy не переписує їх і не виконує relink. Потрібний окремо reviewed recovery contract для таких старих bindings; цей F2 candidate його не вигадує. Self-unlink працює за current ERP proof навіть коли trust вимкнено або source недоступний.

Код ERP має формат `KNABA-LINK-` +43 base64url символи і hash domain `KNABA-SITE-LINK-v1\0`. Тривалість — не більше300с від fresh ERP reauthentication; issuance максимум3 за10хв на ERP user, inspection максимум10 на challenge, додаткові bounded process limits для fresh auth і signed actions. У raw ingress signature перевіряється до JSON parsing; request/response максимум32KiB, outgoing timeout3с, redirect не виконується. SQL використовує clock_timestamp після company lock. Після source I/O final transaction повторно перевіряє original ERP session, credential/MFA security fingerprint, source generation/epoch/ref/fingerprint/expiry та trust; після F1 insert перевірки часу виконуються знову до commit.

ERP UI route — `/account/site-links`; login зберігає цей return path. Website self-unlink веде на `erpOrigin + '/account/site-links'`. У браузері пароль, OTP і одноразовий код існують лише в пам’яті компонента; dedicated CSRF requests не проходять через generic commands/offline queue. Source CLAIM показує назву та immutable account ID; link вимагає окремого explicit original ERP confirmation. Unknown outcome/reconnect виконує status read, не replay credentials; незбережений raw code не відновлюється. Self-unlink має окрему явну згоду та fresh ERP password/MFA. Шість мов використовують total keyed locale map.

Для локальних HTTP fixtures незмінний F1 HTTPS issuer contract збережено: production-shaped HTTPS authority залишається pinned, а server-owned test fetch adapter відображає лише exact synthetic origin/path на локальний listener. Production main такого adapter не має. Rendered ERP fixture suite — `erp/tests/site-identity-link-ui.spec.ts`, усі API responses синтетичні, невідомі API/external requests abort; реальний сайт/провайдер не відкривається. Потрібні fresh ERP web build і same-origin static preview без `/api` proxy, installed Chrome із `chromiumSandbox:true`; команда: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=<installed-browser> E2E_BASE_URL=<static-preview-origin> npx playwright test tests/site-identity-link-ui.spec.ts`. Наявні regression/PG tests не є доказом production, physical device або live provider activation.
