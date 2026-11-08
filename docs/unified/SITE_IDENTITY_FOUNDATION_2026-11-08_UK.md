# KNABA — F1: зберігання прив’язок сайту та ERP

## 08.11.2026 — F1 actual PostgreSQL acceptance

Exact runtime/test source `0fede54f80895a425e72df1d921a643b40a4eaf0`, [CI 42464719363](https://github.com/ziko1/knaba/actions/runs/42464719363): all 4 mandatory jobs PASS; ERP 2782 tests in 120 files, including 16 new real PostgreSQL 17.6 cases and 27 CPU trust cases; bridge 9; no failed/skipped acceptance tests. Synthetic previous-schema upgrade, repeated migration and old-runtime rollback preserve users, bindings and audit. Independent source review accepted the exact inputs. [Evidence](evidence/site-identity-foundation-20261108/verification.json). F1 storage is verified; F2–F5 and shared SSO remain unimplemented/open, full product NOT_READY. No production migration or deployment.

Це продовження F1 з `IDENTITY_RECONCILIATION_2026-11-08_UK.md`, KN-C04 / KN-U09 та MOBILE-003. Зміни виконуються в ізольованій гілці `feat/knaba-identity-foundation-20261108` від мобільного кандидата `fb4be719fc6f777138cb93837fc41729f9104c09`.

**Статус на момент підготовки:** код та 27 CPU tests перевірено; PostgreSQL acceptance ще NOT_RUN до фактичного CI. Спільний вхід залишається NOT_IMPLEMENTED; продукт NOT_READY. F1 створює внутрішнє сховище й перевірюваний контракт, а не маршрут login або готову федерацію.

## Зафіксовані рішення

1. Canonical principal — exact issuer довіреної site authority та незмінний `site_user_id`. Для F1 `subject` дорівнює `site_user_id`. Google/Microsoft issuer/sub залишаються методами входу всередині чинного `vps_oidc_links`; ERP їх не зливає й не порівнює між client IDs. Email не використовується для пошуку target чи автоматичного об’єднання.
2. Issuer визначає namespace стабільних IDs. Це не введений користувачем Host і не автоматично поточний frontend URL. Перенесення hosting або зміна схеми IDs потребує окремого versioned рішення, без мовчазного повторного використання старого issuer.
3. Company, trust registry, audience, namespace, version та policy expiry задає сервер. Default registry порожній. Fingerprint обчислюється всередині коду з канонічного масиву всіх security-relevant полів; caller не може передати свій fingerprint як authority. Зміна fingerprint/version робить старий binding непридатним для resolve.
4. Binding за замовчуванням не має автоматичного lifetime expiry. `expires_at` задається тільки явно; lookup звіряє його за годинником PostgreSQL, зокрема після асинхронних читань. Максимум п’ять хвилин для link challenge лишається окремою вимогою F2.
5. Прив’язується існуючий ERP user тієї самої company з явним `active=true`. Це нова умова federation storage; legacy password/session/device paths не змінено. Ні роль, ні membership, ні MFA, ні session не створюються.

## Зміни та інваріанти

`erp/apps/api/site-identity-bindings.ts` містить immutable trusted configuration, внутрішній repository та resolver. Company закрита в server-owned instance. У principal дозволені тільки issuer/audience/subject; зайві email/company/fingerprint fields відхиляються. Рядки порівнюються точно, без зміни регістру або URL aliases.

`recordVerifiedLinkIn(tx, ...)` навмисно приймає вже відкриту `PgTransaction`. Майбутній F2 має перевірити обидві чинні сесії та атомарно спожити proof в цій самій transaction. `proofReference` тут — лише hash/reference для історії; цей метод сам не перевіряє підпис, browser session чи network assertion. Жоден public endpoint, middleware або generic command catalog його не викликає.

Additive SQL table `site_identity_bindings` має:

- Unique `(company_id, issuer, subject)` для всіх станів, включно з expired/revoked.
- Composite foreign key `(company_id, user_kind='user', user_id)` на чинний aggregate namespace.
- Immutable principal, target, trust fingerprint, proof reference, creation та optional expiry.
- Перехід `ACTIVE → REVOKED` із CAS version та обов’язковими actor/time. UPDATE target, повторна активація та DELETE tombstone відхиляються SQL guard.
- Атомарний запис binding/revocation разом з append-only `audit_log`; SQL помилка audit повертає всю transaction назад.

У F1 revocation terminal. Relink/retarget після нього не підтримується й не повинен з’явитися через видалення рядка. Майбутній окремо перевірений versioned workflow має зберегти попередню історію та вимагати новий dual proof.

## Міграція і відновлення

Чинні source та bundled runtime loaders читають `infra/001_init.sql`, тому новий блок додано саме до нього. Існуючу частину SQL не змінено. Marker `003_site_identity_foundation` записується лише всередині успішної міграційної transaction. Нові індекси не змінюють існуючі бізнес-таблиці.

До fixture `erp/tests/fixtures/site-identity-pre-f1.sql` збережено точні bytes попередньої схеми з `fb4be719`, SHA-256 `3a0e72d7da6531a8e8f9e3e732c38c12936f405a7ee342f2bf0ce42b9dc29dc4`. SQL acceptance створює окрему synthetic schema, застосовує цей baseline, зберігає старого user, виконує upgrade двічі, створює й відкликає binding, а потім виконує попередню migration як rollback rehearsal. Additive table, user та audit мають зберегтися.

Перед будь-яким реальним застосуванням потрібні чинна deployment authorization, backup/restore та погоджене середовище. Цей source change не виконує production migration. Повернення попереднього runtime має зберігати таблиці й tombstones; видалення історії не є rollback.

## Перевірки

CPU trust tests перевіряють default deny, exact namespace/company/audience, immutable config, детермінований fingerprint, version/policy changes, disabled/expired mapping, strict input/URL/byte bounds та відмову для зайвих caller fields.

PostgreSQL tests охоплюють explicit target без email merge; дві company з однаковими user IDs/email; різні case/issuer; concurrent duplicate principal; missing/disabled/pending user; stale config; зміну trust під час transaction; справжню SQL помилку audit; CAS та terminal revoke; lookup під час revoke; direct SQL mutation/null actor; expiry; composite FK; revocation після вимкнення trust; baseline upgrade/repeat/rollback. Відсутність DATABASE_URL означає NOT_RUN; CPU fixtures не замінюють SQL доказ.

## Межі наступних етапів

F2 має завершити dual-session challenge/confirm/unlink та обидва UI, CSRF, одноразовий proof, expiry, logout/rotation races і versioned relink. F3 має видавати company-scoped сесію лише після чинних proof та ERP entitlements. F4 має забезпечити актуальне відкликання, delivery/subscription fences, політику зберігання/видалення та інтеграцію нового identity storage з існуючими privacy workflows. Resolver F1 не є cached authorization чи доказом freshness зовнішньої authority.

Production activation потребує фактичної identity authority, issuer/audience pins, дозволеного середовища та owner acceptance. Відсутність цих значень не замінюється тестовими доменами. Фізичні Android/iPhone, store signing, live provider та повний mobile lifecycle залишаються окремими gates.
