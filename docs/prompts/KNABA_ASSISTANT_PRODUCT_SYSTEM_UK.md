# KNABA Assistant — єдиний продукт і системний майстер-промпт (28.10.2026)

> **Нормативний запит власника розробки.** Це доповнення, а не заміна `AGENTS.md`, `erp/KNABA_DE_TARGET_SPEC.md` (V4), збережених вимог V3, `PROJECT_MEMORY.md`, `MASTER_ROADMAP.md`, `docs/unified/INTEGRATION_CONTRACT.md` та приймальних критеріїв. Статус функцій визначається лише кодом і свіжими доказами, а не цим описом.

## 1. Безумовний результат

Створити **одну робочу систему KNABA**: ERP PostgreSQL, корпоративний сайт/CRM, рольовий web/PWA кабінет і мобільні застосунки, WhatsApp Business Cloud API, Telegram Bot API, асистент сайту, операторський inbox, голосовий диспетчер після дозволу. Одна компанія KNABA у першому релізі, але всі записи мають `company_id`. Жодних паралельних ботів, баз працівників, дубльованих CRM, альтернативного OAuth чи фальшивих «підтверджено».

**Заборона на нові назви із «demo»:** будь-які нові клієнтські назви, сценарії, каталоги, кнопки, проєкти й релізні шляхи є частиною одного KNABA-продукту. Історичні `APP_MODE=DEMO` та інші стабільні тестові контракти залишити до сумісної запланованої міграції, не ламати наявне оточення. Внутрішні офлайн-перевірки називати selfcheck/verification, не пропонувати їх клієнту як функціонального бота.

**REUSE-FIRST / FINISH-ACTIVE-LEAF-FIRST:** перед кодом читати реальний repo/HEAD, поточний PR/гілку, AGENTS, V4/V3, існуючі обробники, таблиці, тести, site auth/ERP; після зміни — негативні та позитивні тести, збережений коміт, незалежний огляд, source+artifact+live checks, відкат. Не відкривати паралельний PR без реальної конфліктної необхідності. Нові ідеї вчинному backlog, не обривати active task. Тільки доказово підтверджувати «готово».

## 2. Єдина модель повноважень

- **OWNER** — фінальне слово щодо ролей, допуску працівників/партнерів, автоматизації, ризикових бізнес-операцій і підключення каналів. **DEVELOPER_SUPPORT** — відокремлений технічний доступ, виданий і відкличний власником, не має жодних бізнесових ролей за замовчуванням.
- **DIRECTOR/OPERATIONS_MANAGER/DISPATCHER** — лише фактичні scope-права ERP; конкретний список дій задає policy власника. **TEAM_LEADER/EMPLOYEE** — лише призначені об’єкти, робота, час, матеріали, підтвердження; **CLIENT/PARTNER** — лише власні клієнтські/партнерські об’єкти та узгоджені процеси.
- WhatsApp `wa_id`, Telegram `from.id`, номер телефону, нікнейм, email та голос **не доводять** роль KNABA. Новий відправник = **GUEST**, без доступу до персоналу, фінансів, GPS, рахунків, списків клієнтів чи рішень.
- Для прив'язування месенджера до вже авторизованого owner/employee/client: авторизований портал + одноразовий обмежений challenge, строк дії, прив'язка до компанії/користувача/каналу/пристрою, CSRF/state, MFA за ризиком, відкликання, аудит, повторне підтвердження при зміні контактів. Ніякої прив'язки «цей номер схожий на власника».
- **Рішення через бот**: показати мінімальний pending ID/суть, відкрити перевірений захищений процес із порталу; після одноразового server-side owner step-up/MFA і CAS за `version` викликати **той самий** ERP command, що й застосунок. До впровадження канального step-up кнопка в боті **не може** фінально видавати роль.
- Власник чи директор може делегувати робочі рішення лише наявним scoped permissions через `user.invite` / `user.roles` та політики ERP, без wildcard. Не дозволяти самопідвищення та втрату останнього власника.

## 3. Контакт із новими клієнтами

1. Вхід із сайту/WhatsApp/Telegram/голосу — лише автентичний webhook (Meta HMAC по сирих bytes / Telegram secret header + HTTPS), bounded body, allowed account/phone number ID, rate limit і dedupe по provider event ID.
2. Спілкування DE/EN/RU (зберігати UK, PL, LT в існуючій архітектурі) — показувати справжні KNABA послуги Bauhelfer/Bauhilfsarbeiten, Baureinigung, умови без вигаданих цін/сертифікатів/термінів.
3. З’ясувати вид послуги, локацію/час, зворотний зв’язок і згоду; не вимагати PII для інформаційного FAQ. Якщо користувач хоче пропозицію — сформувати запит, а не підписаний договір чи обов’язкову ціну.
4. Єдиний потік `webhook_inbox → scoped conversation_input → human inbox/lead → owner/operator → ERP CRM`; пріоритет явної людської передачі. Доставку повідомлень відрізняти від запису у БД, `API_ACCEPTED` від `DELIVERED`/`READ`.
5. Повтор, timeout, мертвий webhook, перевірка провайдера, Telegram STOP/WhatsApp opt-out та GDPR erasure обробляти з журналом станів. UNKNOWN provider outcome — не пересилати всліпу вдруге.

## 4. Контакт із існуючим клієнтом

- Бот може дати загальну довідку без login; особисті замовлення, графік, звіти, пропозиції, матеріали, документи, чат та статуси — лише після захищеної прив'язки ERP identity та перевірки customer/site scope.
- Клієнт бачить тільки власні запити, унікальні записи, узгоджені звіти; будь-яка зміна ціни/договору — preview → підтвердження у захищеному кабінеті → canonical receipt.
- Операторська передача, черга без обіцянки часу відповіді, захищений журнал і notification receipt; fallback — форма/телефон, але не удавати, що AI-дзвінок уже встановлений.

## 5. Працівники

- Від будь-якого каналу приймати **заявку**, окремий opaque receipt, без надання ролі й автоматичного створення штатного акаунта. Стани: REQUESTED → AWAITING_IDENTITY_PROOF → INVITED → ACTIVATED / REJECTED / CANCELLED.
- Власник бачить редаговану чергу через захищений застосунок/ERP і в боті **лише неперсональний ідентифікатор заявки**. Review/Reject require signed-in owner, fresh MFA, company scope, `expected_version`, reason, audit. Review ≠ employee created.
- Після portal identity verification: однократне запрошення, строк дії, точні робочі ролі/об’єкти/склад, запрошення/відкликання, активація працівника, наказ/договір в окремому бізнес-процесі. Заборонено перетворювати Telegram/WA username на власника.
- Для вже авторизованого робітника через бот+app: меню зміни, перерви, подорожі, об’єкти, завдання, матеріали, фото, timesheets, відсутності, підтвердження графіка; усе через поточні ERP commands, з перевіркою часу, GPS policy, версії об’єкта/завдання, idempotency/lease, без доступу до чужих робочих даних. GPS — тільки після законних дозволів і лише потрібні координати.

## 6. Партнери

- Аналогічна, але **окрема** заявка: партнер ≠ працівник, не змішувати заявки і не давати employee permissions. `PARTNER` через WA і `/partner` через Telegram → `partner_registration_interest`, dedupe, owner audit.
- OWNER/MFA review/decline через той самий API, що й веб-/мобільний застосунок; подальша юридична перевірка, перевірка особи компанії, контракт/умови, одноразове запрошення ролі партнера й scoped доступ — **окремі залежні етапи**.
- Жодне повідомлення/натискання в боті не укладає партнерський договір, не активує фінансові розрахунки і не відкриває ERP без портального доказу.

## 7. Керування компанією через бота й застосунок

**Забезпечити однакові команди, не новий другий backend.** Командна матриця повинна включати: людський inbox/черга, персонал та об’єкти, робочі зміни/табелі, завдання та бригади, матеріали/закупівлі, графік і транспорт, CRM leads, quote/approval, звіти й повідомлення, статистика, автоматизації й налаштування. Гостьовий бот показує лише public intent. Для високоризикових дій (ролі, гроші, payroll, GPS, юридичні рішення, provider activation, масові повідомлення) вимагати окремий step-up/MFA, preview, server-side source+scope+version checks, audit. Меню не є доказом реалізованого права: незв’язані модулі мають бути позначені як pending, а не працюючі.

## 8. Переваги власника / політики каналів

Єдина серверна модель `bot.channel.preferences.read/configure` (не дублювати `integration_config`):
- `channel` WA/TG, default language, intake worker/partner on/off, `HUMAN_FIRST` / `RULE_BASED`, обов’язковий людський handoff.
- Фактичні message routes мають споживати політику, а не лише показувати збережені прапорці. Human-first для довільних звернень, explicit public-команди можна відповісти з policy-контролем; будь-яка автоматична відповідь лише із поточною згодою/вікном.
- Власник/технічний розробник з явним делегуванням можуть змінювати технічні параметри в адмінці з чинною сесією/MFA й optimistic CAS. Історія зміни без PII, можливість паузи, повернення до останнього підтвердженого config.
- **Ніяких raw API keys, webhook secrets, access token/chat ID у JSON response, Git, frontend bundle, браузерній пам’яті, документації, телеметрії чи email.** У `bot_config` дозволені лише non-secret preferences. Токени вводяться під час deployment у захищеному secret store / env (наявні `erp/.env.example` і `workerOptions`), без реальної активації до провайдерської перевірки.
- Пізніше адмінська ротація secret: окремий encrypted-at-rest vault із server-only KMS/master key, fresh MFA, owner/developer grant, write-only UI, mask/readback=never, test endpoint без PII, atomic rotate, revoke, old-key grace, restart/reconcile; **відкласти**, доки нема затвердженого server encryption/key-rotation контракта. Ніколи не видавати звичайний token input у публічний UI.

## 9. Автоматизація

Власник задає правила: new lead → inbox/decision; заявка працівника/партнера → review queue; зміна графіка → запит підтвердження робітника; пропущене підтвердження → диспетчер; матеріали низькі → закупівельна пропозиція; клієнтський запит → follow-up; завершене завдання → перевірка/звіт.
Шаблони не активуються без preview, current owner authority, MFA за scope, effectiveFrom, quota, recursion depth, idempotency, transactional outbox, bounded retries/lease, quiet hours, unsubscribe та owner pause/rollback. Без автоматичної зміни payroll/банківського платежу, ціни, юридичного погодження або GPS.

## 10. Голос DE/EN/RU

Веб-/WhatsApp-дзвінки — окремі контрактні адаптери. Після дозволу: з’єднання, перша фраза представлення KNABA, вибір мови, визначення запиту, handoff owner/operator, availability, failed transfer, fallback callback/tel, запис тільки за згодою, секрети й ліміти. Не плутати web speech диктування або Telegram voice note з реальним телефонним викликом. Реальні SIP/PSTN/WebRTC/STT/TTS мають підрядників, ціни, законні регіони й квоти — наразі BLOCKED_EXTERNAL.

## 11. Безпека, дані, продуктивність

Default deny: компанія, роль, customer, site, warehouse, channel membership, device binding; tenant ID не з webhook body. Provider HMAC/body signature freshness, Telegram header+TLS, bounded payload, anti-replay, no privilege from contact, no raw PII logs. Secrets outside source, stored encrypted, separate production/staging, CSRF, login MFA, password hashing, risk-scoped auth. SQL параметризований, outbox/inbox atomic, idempotency with consistent hash + conflict handling, no blind retry when outcome unknown. Media allowlist, quarantine, private storage, size/mime/hash, malware scanning; GDPR retention/delete/export/backup evidence. Для швидкодії — після вимірювання p95, queue depth, failure rate, VPS disk/RAM, DB query, avoid all-record list where possible, bounded pagination, headless browser/Android/iOS QA and Web Vitals.

## 12. Композиція site ↔ ERP ↔ native

Сайт приймає public заявки в D1/SQLite, ERP PostgreSQL — master business records, явний idempotent bridge і versioned identity mapping. **Не припускати, що PR #110 реєстрації, PR #112 mobile, PR #41 Telegram та поточний PR #103 вже інтегровані або доставлені.** Звірити exact HEAD/touched-files/migration ledger/rollbacks, port only needed code after conflict analysis. Вебпортал та Android/iOS вказують на canonical ERP API, не копіюють бізнес-правила й не виконують рішення offline без server ack. Переносити data/ключі при server launch лише з encrypted backup, checksum, mapping, diff, restore test.

## 13. Доказовий acceptance / DoD

| ID | Критерій | Приймальна перевірка | Стан початкового запиту |
|---|---|---|---|
| BOT-A01 | Вхідні WA/TG з окремою перевіркою signature | реальний тестовий провайдер, duplicate/replay/invalid/swap tenant | Код частково; provider NOT_RUN |
| BOT-A02 | Guest → human consultation, відповіді DE/EN/RU | ERP PG+worker/site+provider+mobile E2E, decline/reconnect | PARTIAL |
| BOT-A03 | Existing client trusted link | MFA portal proof, cross-client isolation, account revocation | NOT_ACCEPTED |
| BOT-A04 | Worker intent, owner queue+review, no rights before invite | TDD + PG + auth/MFA/CAS + owner app + channel QA | Частково реалізовано |
| BOT-A05 | Partner intent, own queue+review, no worker rights | TDD + PG + auth/MFA/CAS + owner app + channel QA | Розробка цієї гілки |
| BOT-A06 | Bot owner registration approval | time-limited linked identity + explicit MFA + replay/revoke tests | NOT_IMPLEMENTED; portal link only |
| BOT-A07 | Role-locked employee operations | shift/time/material/crew via canonical commands + negative tenant tests | Існуючі WA-модулі, full E2E NOT_RUN |
| BOT-A08 | Owner preferences persist and affect both channels | update/CAS/rollback, MFA, provider remains off, device | Частково реалізовано |
| BOT-A09 | Server secrets / rotation | env/secret path, no raw token response, actual WABA/TG ownership, rotation UAT | Server env supported; UI vault NOT_IMPLEMENTED |
| BOT-A10 | Owner automation rules | DRAFT→PREVIEW→MFA APPROVE→EXECUTE with audit + revoke | Частково |
| BOT-A11 | Calls + 3-language routing | live authorized phone/device, consent, transfer/timeout | BLOCKED_EXTERNAL |
| BOT-A12 | Unified web+ERP+Android/iOS and real production | exact SHA, build, SQL, backup/restore, GDPR, provider receipts, independent review and company UAT | NOT_ACCEPTED |

Ніколи не рахувати source-only tests як підтвердження реальної розмови чи provider delivery. Всі статуси можуть змінитися **тільки після свіжих тестів на точному SHA**.

## 14. Технічна черга без розпорошення

1. Перевірити чинний PR103, контракт і уже внесені зміни. Закрити реальний захищений канал preferences та owner review із тестами, без дублювання існуючого `identity.ts`.
2. Інтегрувати PR110 site registration тільки після аудиту SQL/roles; canonical verified invite/activate і partner domain. Забезпечити owner UI і application UI, звірити реально на сервері.
3. Authenticated channel binding, audited bot approval challenge/MFA (тоді бот зможе виконувати затвердження, але лише як transport для canonical command); додати реальні клієнтські діалоги й adapter receipts.
4. Consent/Datenschutz/provider tests/voice (після бюджетного, юридичного й акаунтного підтвердження), worker+client routing, керування бригадами/автоматизаціями, native E2E.
5. Whole-product QA+security+performance на точному релізному артефакті, reversible deploy, owner UAT, незалежний review. Лише після gates — customer release/main merge/production.

## 15. Бюджет і межі дій

Додатково авторизовані платні WABA/SIP/PSTN/STT/TTS/LLM: **0 EUR** до підтвердження реального провайдера/ціни/квоти/згоди. VPS уже існує, але ресурси спільні; не чистити чужі Docker/БД/volumes, не відкривати Telegram endpoint назовні без secret. Відсутність токена, власника акаунта, законної згоди, вибраного provider або дозволу — **BLOCKED_EXTERNAL для цієї операції**, не глобальний STOP для незалежного коду.

**Продуктовий принцип:** власник управляє реальною компанією через бот і застосунок **лише в обсязі своїх поточних перевірених прав**; необмежений автоматичний голос/AI/бот ніколи не є власником, касиром, юристом або адміністратором сам по собі.
