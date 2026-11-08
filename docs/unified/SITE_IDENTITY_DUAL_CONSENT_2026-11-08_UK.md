# KNABA — підтверджена прив’язка акаунтів сайту та ERP (F2)

Продовження KN-C04 / KN-U09 і [контракту F1–F5](IDENTITY_RECONCILIATION_2026-11-08_UK.md), в існуючому Draft PR128. База цього інкременту: `a670ff0be70abd1bb8f07065e237b5e3de8a7a84`; F1 executable proof лишається `0fede54f80895a425e72df1d921a643b40a4eaf0`. Це окремий source checkpoint; попередній F1 CI не приймає нові HTTP/UI/SQL шляхи.

**Поточний стан: код F2 реалізовано, локальні перевірки та незалежний source review пройдено; actual PostgreSQL acceptance нового інкременту очікує точний committed source у CI. Спільний вхід/SSO F3–F5 і весь продукт NOT_READY.** Не створено production credentials, не виконано live migration, merge, deployment або store upload.

## Поведінка для користувача

1. У своєму ERP-кабінеті користувач відкриває «Прив’язка акаунтів». Він повторно вводить поточний ERP-пароль; налаштована MFA перевіряється новим одноразовим кодом. Для привілейованих ролей, чутливих permissions або `mfaRequired` MFA обов’язкова.
2. ERP створює запит на строк не довше п’яти хвилин, прив’язаний до конкретних компанії, користувача та початкової cookie session. Browser input не визначає цільового користувача чи компанію.
3. На сайті показуються чинний site account, ERP account і компанія. Потрібна явна згода; profile має бути approved, user/session — активними. Developer, емуляція workspace, pending і suspended не допускаються. Owner без звичайного профілю потребує явного стабільного `OWNER_USER_ID`/peer pin.
4. ERP показує підтверджений сайтом account і просить остаточне підтвердження. Binding, consumed challenge і ERP audit комітяться атомарно. Права та customer/site memberships не копіюються й не створюються.
5. Власник ERP-акаунта може відкликати свою прив’язку з повторним паролем/MFA та `expectedVersion`. Відкликання доступне і при вимкненій або недоступній site authority.

UI має DE/EN/UK/RU/PL/LT, підписані поля, клавіатурні кнопки, expiry, busy/error/empty states. Підтверджена операція лишається підтвердженою, якщо наступне оновлення списку не вдалося. Після невідомої відповіді можна перевірити результат первинного запиту без повторного створення binding. Source/HTTP перевірки не підтверджують rendered browser, VoiceOver або фізичний пристрій.

## Межі довіри та протокол

Основний site principal — exact configured issuer + immutable `vps_users.id`. Email використовується лише для показу двох акаунтів. Збіг email не об’єднує ERP users; ролі сайту не перетворюються на ERP permissions.

`SITE_IDENTITY_PEER_JSON` зберігається тільки у захищеній конфігурації обох серверів. Без нього створення прив’язок вимкнене. Поля: `companyId`, `issuer`, `audience`, positive `version`, `active`, optional canonical ISO `expiresAt`, exact `erpOrigin`, `siteOrigin`, `keyId`, `secret`, optional stable `ownerUserId`. Origins мають бути різними HTTPS origins без path/query/credentials; issuer — HTTPS namespace. Ключ має власний prefix `knaba-federation-` і 32 випадкові bytes у canonical base64url; це окрема federation credential, не intake/device/guest secret. Test-only loopback HTTP доступний тільки через явний `localTest` у тестовому конструкторі. Production env parser його не вмикає.

HMAC-SHA256 покриває domain/version, trust і transport fingerprints, напрямок REQUEST/RESPONSE, method, exact allowlisted path, випадковий nonce, timestamp, status і hash raw bytes. Response прив’язаний до конкретного request nonce. Peer обирає серверна конфігурація, не Host або browser URL. Один запит має timeout 1.5s, забороняє redirects і обмежує request/response до 8KiB; signed timestamp перевіряється в межах 15s. Зміна trust/key/origin/pin або expiry під час операції відхиляє її. Невідомий результат не дає cached allow.

Browser transfer codes передаються тільки у fragment. Нейтральний GET не читає приватний account і не виконує mutation; клієнт одразу прибирає fragment з URL і використовує same-origin JSON requests із cookie/CSRF. Коди не потрапляють у query, server access log, storage або referrer. Strict cookies збережено. Якщо потрібен вхід, він відкривається окремою вкладкою; початкова сесія challenge не підмінюється новим login. Site previewProof зв’язує показані обидва акаунти, company/challenge і поточний site session/profile snapshot до явної згоди.

## Транзакції, повтори й час

ERP scrypt виконується поза company lock. Усередині чинної SERIALIZABLE transaction перечитуються та блокуються початкова session і credentials; перевіряються exact password/TOTP-secret revision, active human і поточні MFA requirements. TOTP counter витрачається атомарно з challenge або unlink. Guest token, перейменований у ERP session cookie, та device bearer не стають human proof.

Під час preview/confirm ERP утримує company/session/challenge guards і робить один bounded online виклик до site authority. На сайті consent/redeem — синхронна SQLite transaction; жодних ERP/network calls під SQLite lock немає. Цей порядок не утворює взаємного очікування ERP↔SQLite locks. Загальний ERP deadline для preview/confirm — 7s з чинними bounded database retries. Це correctness/timeout budget, не виміряний production p95.

Site redemption і ERP commit — **дві окремі точки фіксації**, не distributed atomic transaction. Згода сайту авторизує exact immutable target у момент успішного online redemption. Logout/rotation/suspend, які відбулися раніше, відхиляють операцію. Logout після валідного redemption є наступною session подією; F2 не прирівнює його до unlink і не видає federated session. Постійна актуальність майбутніх federated запитів належить F3/F4.

Якщо ERP transaction відкочується після site redemption, дозволено повторити лише той самий grant/challenge/company/target/nonce. Сайт повторно перевіряє початкову session, profile version/fingerprint і current config, а audit redemption залишається один. PostgreSQL повторює чинну transaction, не створюючи інший grant. Відомі absolute challenge/site-grant expiry перевіряються перед binding і фінальним return; SQL окремо вимагає `completed_at < site_expires_at`.

## Відкликання й повторна прив’язка

F1 revoked row залишається terminal tombstone. Нова прив’язка після revoke створює наступне покоління з новим dual-session proof і `predecessor_id`; попередній запис не реактивується й не видаляється. Дозволений лише той самий ERP user у тій самій company/issuer/audience/subject. Перенесення до іншого ERP user потребує окремого майбутнього процесу перевірки; автоматичного retarget немає.

Unique generation та partial unique ACTIVE index забезпечують один активний binding для principal. Successor trigger перевіряє попередню revoked generation і consumed exact F2 challenge. Окремий F2 immutable trigger захищає generation/predecessor/challenge receipt навіть після повторного запуску старого F1 SQL, який перевизначає попередню F1 guard function.

## Шляхи та пакування

| Сторона | Шлях | Контракт |
|---|---|---|
| ERP | GET `/account/site-link/`, `/site-identity-ui.js` | Нейтральна сторінка й локальний script |
| ERP | GET `/api/v1/auth/site-links` | Власні accounts/bindings і recent challenge statuses |
| ERP | POST `…/challenges` | Fresh password/MFA, початкова cookie session |
| ERP | POST `…/preview`, `…/confirm` | CSRF, immutable challenge/grant, explicit consent |
| ERP | POST `…/status` | Recovery для exact consumed challenge/grant і первинної ERP session; без нового доступу |
| ERP | POST `…/unlink` | Fresh password/MFA, own binding, CAS; без залежності від peer |
| ERP | POST `…/inspect-challenge` | Тільки окремий signed server-to-server request |
| VPS | GET `/account/erp/`, `/auth/site-identity-ui.js` | Нейтральна сторінка й локальний script |
| VPS | GET `/auth/site-identity/session` | Поточний account та CSRF |
| VPS | POST `/auth/site-identity/preview`, `…/consent` | Same-origin + CSRF + original session/profile + previewProof |
| VPS | POST `/auth/site-identity/inspect`, `…/redeem` | Signed backchannel та authoritative SQLite checks |

ERP Docker context і VPS artifact лишаються незалежними. Canonical self-contained protocol/UI — `corporate-site/vps/site-identity-{protocol,ui}.mjs`; ERP містить mechanically generated byte-identical distribution copies та declarations. `node scripts/sync-site-identity.mjs --check`/обов’язковий root test відхиляє drift. Немає runtime import за межі ERP container, другого intake dispatcher або зміни business command registry.

## Міграція й rollback

ERP має additive `site_identity_challenges`, generation/receipt columns, indexes і guards. Frozen pre-F2 SQL з `a670ff0` збережено у `erp/tests/fixtures/site-identity-pre-f2.sql`, SHA256 `4c7f7bfc396baf87ba21cbdbb79f54ec7539ede080140bcf45989626efeabf4f`. Actual PostgreSQL тест перевіряє повтор старого SQL та точну відмову окремого F2 guard.

VPS має `vps_site_identity_consents` і окремий checksum receipt `vps_auth_migrations`. Legacy Drizzle SQL/ledger не переписано. Startup з `allowMigrations=false` відхиляє pending auth migration до записів; невідомі/checksum-drifted receipts, missing table/guard або unrecorded preexisting F2 schema відхиляються. Upgrade відбувається лише reviewed migrate CLI після backup. Локально перевірено additive upgrade, повторний reopen, незмінність старих account IDs/receipts, відмову без дозволу на migration та SQLite backup/restore.

При rollback спочатку вимкнути F2 routes/config на обох сторонах, зберегти additive storage/audit/tombstones і exact source/config receipt. Старий F1 runtime не отримує implicit session issuer. Production backup/restore, retention/erasure для identity ledger, операторський rollback і наступні F3/F4 revoked-session guarantees потребують окремого приймання до активації; тест synthetic copy не є дозволом змінювати live database.

## Перевірки та межі приймання

Перший exact-source run [42472337064](https://github.com/ziko1/knaba/actions/runs/42472337064) на `40e31acede2b3d9b55ecfb02fec33aa4cb0d5ab1`: root30, site732 Vitest +90 Node +268 VPS та ERP2782/120 files зі справжньою PostgreSQL — PASS. Bridge9 старих intake cases PASS; усі22 нові F2 cases зупинились до journey через відсутній обов’язковий `profiles.last_mutation` у synthetic fixture. Це FAIL, не F2 acceptance. Корекція заповнює поле у тесті без зміни production schema/runtime; exact INSERT перевірено на actual migrated VPS SQLite з обома email fixtures. Повторний hosted run потрібен для приймання F2.

Локально Node24.22.1: TypeScript/build ERP; Astro/Vue/Svelte check і site build; 114 цільових ERP CPU cases; 38 consent SQLite + 8 protocol actual HTTP + 20 site-handler HTTP + 5 auth migration cases; повний root suite30, включно з2 distribution/neutral-page cases. Повний VPS прогін до останнього уточнення displayed authority expiry: 267/267; уточнений HTTP suite20/20 пройдено окремо, а final aggregate належить майбутньому exact-source CI. Повторювані/перекривні totals не підсумовуються як нові assertions.

Початковий локальний site build verification мав невідповідність environment: official artifact перевірявся як staging. Повторний запуск із тим самим `KNABA_RELEASE_MODE=official`, що й build/CI, завершився з exit0; test guard не послаблено. `tsx` CLI IPC був заблокований середовищем; стандартний Node loader без окремого IPC виконав реальний Nest HTTP bootstrap. Це не заміна PostgreSQL journey.

Додано 22 cases до чинного bridge job: real Nest + PostgreSQL + full VPS/SQLite + signed loopback HTTP, dual consent, immutable target/company, exact auth errors, fresh MFA, password revision race, logout/suspend, concurrent confirm, audit rollback, injected actual PostgreSQL SQLSTATE40001 retry, subsecond/site-session expiry, key rotation, lost HTTP acknowledgement, disabled-peer unlink, same-user relink, F1 rollback і two-company isolation. Injected40001 не називається природним MVCC conflict. Local PostgreSQL NOT_RUN; CI мусить завершити всі discovered bridge/ERP cases без skip.

Незалежний reviewer перевірив consent implementation, protocol, SQL/current-session guards, UI/HTTP boundary, packaging copies і самі integration tests. Виправлено limits для site metadata, final site expiry, rollback guard, валідацію trusted preview до показу та ACK-versus-refresh UI state. Source acceptance не підміняє actual SQL/browser/device/provider/UAT.

**F3 session exchange, F4 continuous revocation/background/files/streams, F5 browser/device/live configuration та company UAT залишаються відкритими. F2 binding сам не автентифікує користувача в іншій системі.**
