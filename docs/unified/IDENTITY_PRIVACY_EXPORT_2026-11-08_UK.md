# KNABA — версійований експорт власної identity metadata (F4-C1)

## Мета і поточний стан

Це продовження F4 privacy prerequisites у наявному KNABA DE. База — прийнятий C08-C commit `4e6ac0990ddd73bed142ab05b5f7579d8ed3048a`, tree `3d7f7615ac4cf21b9dd2a6f5cfa12c1cf958105c`, [PR136](https://github.com/ziko1/knaba/pull/136), [CI42491574791](https://github.com/ziko1/knaba/actions/runs/42491574791). Новий source має окреме приймання.

Статус: **IMPLEMENTED_CANDIDATE**. Фінальні36 CPU cases і62 чинні governance cases пройшли локально:98/98 у2 файлах; TypeScript exit0 і root30 PASS. Незалежний runtime/CPU review ACCEPT; root прийняв12 окремо написаних PostgreSQL cases на рівні source. Actual PostgreSQL acceptance нового source ще **NOT_RUN**; staged evidence review і committed-source CI очікуються. SQL/HTTP doubles не замінюють ці gates.

Поточний експортер `knaba-dsar-v1` не включає окремі SQL-таблиці прив’язок, consent challenges і federated sessions. Крім того, початковий actual-builder RED підтвердив, що зміна revision запису погодження не блокувала export старого approved request. Це виправлення перевіряє точну reviewed revision та додає окремо погоджувану проєкцію `knaba-dsar-v2`.

Цей slice не видає сесій, не задає юридичних строків і не виконує видалення. F3 issuance, решта F4 retention/erasure/restore/background policy, F5 і весь продукт лишаються **NOT_READY**. Original72 V4/475 V3 не перепозначено.

## Явний вибір проєкції

1. Новий `privacy.review / APPROVE_EXPORT` перевіряє конкретний approved legal record і записує `exportProjectionVersion` разом із його `legalApprovalVersion`.
2. Уже approved legacy request без `exportProjectionVersion` лишається v1. Поле, явно задане як null або невідоме значення, не є legacy default.
3. Зміна legal record на v2 не розширює раніше approved request. Старий pending request може отримати v2 лише через новий явний review.
4. Перед формуванням нового файла повторно перевіряються чинність legal approval, точна reviewed revision, точна проєкція і запитані категорії. Drift відхиляється до створення artifact/event.
5. V2 читає identity history лише для категорії PROFILE. V1 і запити без PROFILE не звертаються до reader. У V2 PROFILE відсутній transactional adapter є помилкою, а не порожнім успішним експортом.

Клієнт не може додати `exportProjectionVersion` до `privacy.request`: чинна strict input schema збережена. Це рішення явного review, прив’язане до затвердженої версії опису експорту.

## Дані в новій проєкції

`identity` містить exact company/subject envelope та три масиви. Вибірка не залежить від поточної доступності site peer і не відкидає минулу історію після expiry/revocation.

| Джерело | Поля експорту |
|---|---|
| `site_identity_bindings` | id, issuer, audience, subject, status, version, generation, createdAt, expiresAt, revokedAt |
| `site_auth_sessions` | id, bindingId, createdAt, expiresAt, revokedAt |
| `site_identity_challenges` | id, status, createdAt, expiresAt, completedAt |

Bindings включають збережені generations/tombstones. Stored ACTIVE у binding є історичним полем; це не результат online authorization. Sessions не отримують обчисленого `active` прапорця: `revoked_at=NULL` саме по собі не доводить чинну authority.

Не читаються та не експортуються token/session/proof/nonce/security/transport/profile hashes, passwords, TOTP secrets, raw bearer tokens або unconfirmed site preview subject/name/email. Preview іншого акаунта до завершення dual consent не перетворюється на власні підтверджені персональні дані. Дані самого зовнішнього сайту, його credentials, повний audit та інші особи не входять до цього ERP export. Ці межі явно відображені в v2 omissions; `fullLegalDsarFulfillment` лишається false.

## Межі транзакції та перевірки

API adapter приймає тільки поточний `PgTransaction`; його company та actor мають збігатися з export subject. Кожна з трьох SELECT має фіксовані `company_id=$1 AND user_id=$2`, allowlisted columns та `ORDER BY created_at,id`. Зовнішнього network call або вкладеної company transaction немає.

Сумарна межа —25000 records, узгоджена з чинним bounded privacy inventory. Кожен query запитує не більше25001 рядка; надлишок завершується явною відмовою. Успішного тихого обрізання, часткового файла або fallback до порожньої identity немає. Це технічна межа кандидата, не твердження про повне юридичне виконання будь-якого обсягу DSAR.

Reader отримує окрему копію scope; його зміна аргументу не змінює приватний expected envelope. Після reader domain boundary знову перевіряє exact company/user envelope, strict поля, унікальність IDs у кожному масиві, канонічні UTC timestamps, часові зв’язки lifecycle та same-subject binding для кожної session. Дата, lineage або зайве поле, що не відповідає контракту, відхиляє весь новий export. Результат стабільно впорядковано; reader input не змінюється.

| Відмова | Код |
|---|---|
| Непогоджена проєкція, revision drift або нечинне погодження | NEEDS_APPROVAL |
| Відсутній v2 PROFILE reader | MISSING_CONFIGURATION |
| Чужа company/subject envelope | ACCESS_DENIED |
| Overflow, malformed metadata, duplicate IDs або чужий session binding | VALIDATION_ERROR |

## Збереження і сумісність

`createPrivacyExportCommand` використовується і default domain registry, і Engine. Engine передає transactional SQL reader; domain-only invocation без нього не може непомітно видати v2 PROFILE.

Canonical v1 snapshot/omissions і байти старого формату збережені. Artifact отримує версію з побудованої проєкції, контрольну суму й immutable snapshot. Command result лишається metadata-only: exportId/fileName/sha256/byteSize/status/securedDownloadRequired. Ідентичності або докази автентифікації не повертаються у цьому ACK.

Наявні command receipt/idempotency, private download, ownership, checksum і current request-authority boundaries збережено. Зміна identity rows після успішного export не переписує вже збережений файл. Це також означає, що видалення live identity metadata не можна прирівнювати до видалення раніше створених export copies; їхня retention/erasure політика потребує окремого погодження.

Нових API routes, permissions, UI/native command schemas або SQL migration немає. Adapter не змінює жодного identity row/tombstone. Перевірки F4-C1 використовують синтетичні approvals; вони не є затвердженням реальної компанії.

## Докази до приймання

- Відтворений RED: old builder повертав export після зміни legal revision;1 FAIL, один тест deselected фільтром назви.
- Перший focused run:97 PASS. Незалежний review виявив mutable scope argument у внутрішньому adapter contract; regression відтворив1 FAIL/35 deselected. Reader тепер отримує копію scope. Фінальний run:36 нових domain cases +62 governance cases =98 PASS. Legacy canonical bytes, version drift, explicit review, missing reader, own scope, omissions, malformed rows, overflow і збережені artifact bytes перевірені як CPU/domain behavior.
- Окремий PostgreSQL suite має перевірити actual Engine request→review→export, two-company/two-user isolation, історичні SQL lifecycle rows, canaries, overflow rollback і незмінність source tables. Direct synthetic provisioning цих history rows не є справжнім SSO issuance.
- Final TypeScript після scope correction:exit0; root30 PASS,0 fail/skip/cancel/todo. Independent runtime/CPU source ACCEPT; root окремо перевірив12 SQL cases. Exact committed-source CI ще NOT_RUN. [Source-bound inputs і raw-log descriptors](evidence/identity-privacy-export-20261108/verification.json).

## Бюджет і rollback

Резерв цього source slice: один checkpoint і максимум одна обґрунтована correction; до4 automatic repository runs,0 запланованих native runs. Наявні public runners без активації paid/larger runners; баланс моделей невідомий. Локально виконуються вузькі перевірки змінених контрактів. Unchanged native artifacts та паралельний branding PR135 не переприв’язуються до цього source.

Rollback source до4e6ac099 не потребує видалення таблиць/рядків. Old runtime не створює v2 export за v2 approval, але наявний generic private download може повернути вже створений immutable v2 файл його чинному власнику. Відкат також повертає стару відсутність exact approval-revision guard; це відомий недолік, а не безпечне приймання production rollback.

До реального F3 увімкнення лишаються окремими gates погоджені identity retention/erasure classes, backup/restore reconciliation, external-copy policy, чинна конфігурація, browser/device/UAT. Публікація draft source не активує їх.
