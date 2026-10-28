# KNABA Mobile — виконуваний майстер-промпт (Android + iOS + мобільний вебкабінет)
**Проєкт:** KNABA DE, репозиторій \`ziko1/knaba\`. **Модуль:** KNABA Mobile. **Мова звіту:** українська.
**Статус:** інструкція для продовження реалізації; сама по собі не підтверджує виконання acceptance чи публікацію.

## 0. Роль команди й межі
Дій як Principal Software Architect, Android/Kotlin Engineer, iOS/SwiftUI Engineer, Senior Full-stack Engineer, Security Engineer, DBA, Performance Engineer, QA Lead, Product Designer. Залучай ai-team-orchestrator, якщо є реальна авторизація. Не створюй нових PR/гілок без необхідності: робоча гілка \`feat/knaba-android-ios-workspace-20261028\` (один Draft PR на \`feat/knaba-customer-release-20261028\`). Не зливай у \`main\` і не запускай production, платні сервіси чи GPS без окремих release/legal gates.

Перед будь-якою дією зафіксуй Git HEAD/tree, брудні файли, віддалені PR/гілки, розгортання, точні тести й джерела, актуальні контракти. Прочитай \`AGENTS.md\`, \`erp/AGENTS.md\`, \`erp/KNABA_DE_TARGET_SPEC.md\`, \`erp/PROJECT_MEMORY.md\`, \`erp/MASTER_ROADMAP.md\`, \`erp/docs/planning/DEVELOPMENT_BACKLOG.json\`, \`corporate-site/PROJECT_MEMORY.md\`, \`corporate-site/ROADMAP.md\`, \`docs/unified/INTEGRATION_CONTRACT.md\`, \`docs/unified/PROJECT_MEMORY.md\`, \`docs/unified/BACKLOG.md\`. Застосовуй REUSE-FIRST, FINISH-ACTIVE-LEAF-FIRST, PERSIST–VERIFY–PUBLISH–REVERIFY; зберігай вихідні правила.

## 1. Перевірені архітектурні факти, не замінювати припущеннями
- \`corporate-site\` — Astro+Solid/VPS+Worker/D1, авторизація через власні захищені cookie-сесії. \`/konto/\` — кабінет порталу; \`/admin/\` — Control Center; \`/api/portal/session\` повертає серверну роль; нові реєстрації й запрошення затверджує власник.
- \`erp\` — окрема система з PostgreSQL authority, своїм API \`/api/v1/me\`, командами/ролями/правами, \`/console\` та іншою сесією. \`docs/unified/INTEGRATION_CONTRACT.md\` описує **proposed**, а не готовий спільний identity/lead bridge.
- Android: \`erp/apps/mobile-android\`, Kotlin, \`de.knaba.mobile\`, штатний облік часу/GPS, Android Keystore, офлайн-черга; iOS: \`erp/apps/mobile-ios\`, SwiftUI, Keychain та локально зашифрована черга. Зберегти політику явного GPS дозволу й приватних пауз.
- Існуючі різні адміністративні акаунти owner/developer працюють за відкличним серверним grant у кандидаті PR #110. Не підмінюй grant локальною роллю.
- Поточні native app уже мають власне одноразове прив’язування пристрою для обліку часу. Воно **не** є веблогіном; реєстрація, соцлогін і доступ до ERP не повинні вимагати змішування двох типів секретів.

## 2. Продуктова модель і ролі
Після входу показуй **саме той** кабінет, який сервер визначив за поточною сесією. Ніколи не довіряй ролі/tenantId/companyId, надісланій мобільним клієнтом.
- **Анонімний:** каталог будівельного клінінгу та BauService, запит послуги, контакт із компанією, реєстрація/вхід.
- **Клієнт:** профіль, нове замовлення (послуга, об’єкт, фото за дозволом, контакт), список своїх заявок, статуси/дати, безпечний контакт із менеджером, документи/підтвердження за фактично існуючим API.
- **Працівник:** лише призначені об’єкти/зміни/завдання, чеклісти, підтвердження/звіт, дозволені повідомлення; time/travel/offline синхронізація; геолокація тільки після явної активації, чинного lease та законної політики, OFF для пауз і завершення.
- **Партнер:** окремий профіль організації й заявки/співпраця, обмежений список власних договорів/об’єктів після наявності контракту; **не бачить чужих клієнтів або призначення**.
- **Власник, розробник із чинним grant, адміністратор:** керування заявками та статусами, призначення працівників, об’єкти, графіки, підприємства-партнери, сервісні налаштування, права доступу, audit. Дозволи різняться для окремих модулів; "developer" не означає обхід серверної авторизації.
- **Pending/suspended/revoked:** відповідний стан без доступу до даних і команд, повторна перевірка після кожного авторизованого переходу.

Реєстрація: public client/partner intent -> pending approval; worker/admin/owner — тільки захищене одноразове запрошення та затвердження відповідального оператора, без масового самопризначення ролей. Після схвалення/відкликання наявна сесія має оновити права. OAuth Google/Microsoft тільки за коректної конфігурації на реальному HTTPS origin + PKCE/state/nonce/redirect URI; email збіг не підвищує привілеї.

## 3. Сценарії та повний операційний цикл
**Lead → замовлення → планування → виконавець → виконання → контроль → закриття.**
1. Анонімний або авторизований клієнт формує послугу з чітким consent/privacy; ідемпотентність заявок, перевірка повторів.
2. Власник отримує реальну заявку в контрольованому кабінеті, перевіряє її, планує дату/об’єкт, призначає лише доступного й схваленого працівника. Всі рішення мають audit trail.
3. Працівник бачить тільки свої призначення, може прийняти завдання/почати й завершити його за існуючими API і RBAC, додати звіт/фото з лімітами, синхронізувати офлайн-дії і конфлікти.
4. Клієнт бачить коректні статуси, не отримує приватні дані працівників. Власник бачить зведення виконання без вигаданої GPS-присутності або розрахунку зарплати.
5. Партнер має окремий погоджений workflow співпраці. Рахунки, payroll, ціни, статуси затвердження і sensitive HR — **лише authoritative ERP PostgreSQL**; не копіюй їх у site D1.
6. Повідомлення клієнт↔власник потребують **реального двостороннього backend persistence і прав**, а не UI-імітації; зовнішній WhatsApp/голос/AI — після окремих API, consent, quota, budget і UAT.

## 4. Принцип інтеграції платформи
**Негайна практична основа:** одна мобільна вебточка \`/app/\` (DE/EN/UK/RU) як installable PWA entry; нативні Android/iOS відкривають її через системний браузер, не вбудований WebView. Входити можна з будь-якого пристрою через існуючий веблогін; серверна роль скеровує до дозволеного \`/konto/\` або \`/admin/\`. ERP \`/console\` використовує інший конфігурований HTTPS origin і **поки що окремий логін**. Existing native work-time/GPS/queue залишаються окремим захищеним інструментом і не змішуються з web-авторизацією.

**Майбутній повний native parity:** побудувати після узгодженого \`/mobile/v1/*\` або версіонованого shared auth exchange; без багатократних API/roles implementations. Для browser→native auth потрібен дозволений System Browser OAuth + PKCE, app/universal link ownership, одноразовий authorization code, перевірка server state/nonce і platform-bound tokens; no embedded shared-cookie leakage. Пріоритет server-controlled session refresh/revoke та tenant isolation. Доступні модулі видаються серверним capabilities catalog, а не інтерфейсною таблицею самопризначених прав.

**Хостинг:** всі origin URLs конфігуруються після переходу на сервер клієнта. Не фіксуй IP/domain/secrets в APK/IPA. За зміни ERP origin revoke/re-enroll native device та збереження/безпечна синхронізація queue. OAuth redirect URIs, CORS/CSRF, APNs/FCM і Universal/App Links мають бути окремо перевірені на новому домені.

## 5. Безпека, приватність, надійність
- RBAC/ABAC, ACL із \`companyId\`, \`siteId\`, \`customerId\`, member status на **кожному** read/write; default deny; жодного розкриття чужих заявок, працівників чи партнерських контактів.
- Secure cookies (HttpOnly/Secure/SameSite), CSRF+Origin для вебмутацій, Authorization Code+PKCE для native login, device-safe token store (Keystore/Keychain), logout revocation/generation fence.
- Усі команди перевіряти schemas, body-size, idempotency, optimistic locking, timeouts, bounded retries, rate limits, audit/outbox, conflict UI. Жодних credentials чи PII в URL, логи, crash dumps, manifest, HTML чи JS bundle.
- GPS зазвичай OFF; відстеження тільки за політикою, реальним consent/lease, видимими індикаторами, пауза зупиняє негайно; no passive attendance determination; privacy/DSAR/retention/legal approvals окремо.
- Offline тільки для явно дозволених команд; queue durable/encrypted, identity-bound, retains failed receipts and original IDs/order; ніяких прихованих повторах платежів/призначень або прихованої геолокації.
- PWA service worker **не кешує** приватні API, cookies, відповіді кабінету, PII. Анонімний/install shell не називати повноцінним offline ERP.

## 6. UX/UI та міжнародність
Мобільний premium SaaS: навігація 320–1440 px; keyboard, screen reader, accessibility 44 pt targets, safe areas, dark/light readability, loading/empty/offline/error/retry/pending/forbidden states; AA contrast; перевірені DE/EN/RU/UK. Нативні employee screens уже мають DE/UK/RU/PL/LT/EN і повинні зберегти всі 6 локалізацій. У кожному кабінеті: overview, швидка дія, статуси, список задач/замовлень, контакт і власний профіль. Не показувати кнопки без працюючого backend. PDF/file attachments — лише через авторизовані short-lived scoped download URLs.

## 7. Порядок реалізації (одна завершувана листова задача за раз)
**Фаза A — candidate цього PR:** перевірити source й acceptance; додати KNABA \`/app/\` PWA entry, HTTPS-safe distribution UI, сайту в footer; native Android/iOS browser entry із налаштовуваним origin; мобільні translations; тести й ручну інструкцію. \`app\` може бути встановлений як вебсайт; signed APK/IPA/TestFlight **не вигадувати**.
**Фаза B — інтегрована авторизація:** backend owner-approved mobile OAuth/PKCE та identity bridge між сайтом і ERP (якщо справді потрібен один логін); migration tests, security review, token revoke. До цього ERP auth separate.
**Фаза C — паритет API:** typed API/RBAC контракт і client orders/messages → owner dispatch → worker acceptance; Postgres/Worker bridge, audit/idempotency/tenant isolation, negative tests, migration+rollback. Партнерська модель тільки після даних/прав.
**Фаза D — рідні екрани:** native role overview, assigned workers/jobs, profiles, messages, team and partner controls, owner settings, push as opt-in; offline explicit scope.
**Фаза E — реліз/переїзд:** verified data backup+restore, secrets/env, HTTPS/HSTS, domains/redirects, genuine OAuth+email, Android signed AAB/APK, iOS signed IPA/TestFlight, Play/AppStore privacy policies, фізичні пристрої, UAT owner, release notes, crash analytics opt-in, staged rollout й rollback.

## 8. Доказова матриця та definition of done
Для кожного acceptance: \`source SHA + build artifact hash + test type + test output + status + reviewer + risk + rollback\`. Обов’язкові негативні тести: гостю заборонено читати заявки; client не бачить іншого client/worker; partner не має HR/CRM; revoked owner/developer не керує; зміна ролі в POST не працює; legacy cookies не пересилаються як device bearer; auth timeout/revoke; replay/no duplicate order; offline reorder/identity change; server host migration invalid endpoints; GPS revoke/pause; PWA offline never leaks.
Release gates: 0 TS/build/runtime failures, Android actual compilation+emulator/device checks, iOS Xcode simulator/XCTest+physical device, accessibility/320–1440 responsive, GDPR/site legal, real authenticated UAT й окреме рішення власника щодо production. Якщо середовище Linux без Xcode/JDK/SDK — записати **BLOCKED/NOT_RUN**, не заявляти PASS.

## 9. Контрольний звіт кожного проходу
Видавай: **Зроблено**, **Перевірено** з exact SHA/командами, **Не підтверджено**, **Блокери**, **Наступна єдина задача**, посилання на один PR і артефакти. Повністю завершені зміни — тільки після off-host push і reverify. Не плутай поточний PWA/launcher MVP із готовим native ERP, не публікуй непідписані збірки як реліз, не обіцяй фонову роботу "до 12".
