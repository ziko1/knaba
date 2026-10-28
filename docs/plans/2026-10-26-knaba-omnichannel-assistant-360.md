# KNABA Assistant 360 — WhatsApp, Telegram, сайт, ERP та голосові звернення
Дата: 2026-10-26. Проєкт: виключно `ziko1/knaba`. Статус: **source-only Draft; NOT LIVE / NOT CUSTOMER READY**.

## 0. Reconciliation / REUSE-FIRST
- База: Draft PR #97 `feat/knaba-modular-cms-erp-source-20261026`, початковий точний SHA `dec30a3f2f261845a0ad93e167e429026b3b4940`. `main` — specification branch, не production runtime.
- НЕ дублювати: `erp/packages/integrations/telegram.ts` + `apps/api/telegram-ingress.ts` + `apps/worker/telegram-delivery.ts` з PR #41; `whatsapp-router.ts` + signed Meta ingress + worker outbox; canonical `commerce.ts:automation_rule.*`; `identity.ts:user.invite`; `corporate-site/KnabaAssistant.tsx`; сайт `/konto/`, `/postfach/`, `/crm/`, `/studio/`, `/admin/`.
- Інтеграція ERP зі старим сайтом НЕ дорівнює імпорту коду: `corporate-site` використовує D1/worker, ERP — PostgreSQL. Збереження існуючого CMS, ERP, чатів, повідомлень, контактів, секретів і PR обов'язкове. D1/SQL bridge із PR #67/87 не перенесено автоматично через конфлікти й ризик.
- `telegramInbound` **лише guest**; Telegram chat ID/phone не дає права директора/працівника. Чат не є входом у KNABA.
- WhatsApp existing router уже виконує ті ж canonical команди, що ERP Engine, з повторним authorization, receipt/TTL/версіями. AI не має дозволу обійти їх.

## 1. Доставлено цим Draft, без активації зовнішніх провайдерів
1. `bot-module-catalog.ts`: 26 незмінних доступних пунктів, 6 мов для WhatsApp; `PUBLIC` / перевірені `STAFF` / `OWNER`, status `SITE_LINK` / `WHATSAPP_COMMAND` / `SOURCE_ONLY`. ERP source-only функції не створюють фальшиві URL.
2. WhatsApp `/MODULES`: перевірені поточні права й роль, підписані durable callback choices, пагінація, сайт-контакти та чинні робочі команди. Portal login/MFA для адміністративних дій залишається необхідним.
3. WhatsApp `/AUTOMATIONS`: лише підтверджений ERP `OWNER` з `scope.company`, `automation.manage`, `decision.manage`. Шаблони `lead.created` та `material_request.submitted` → `CREATE_DECISION`. Прев'ю + чітке підтвердження створює тільки **DRAFT** через `automation_rule.create` і ERP receipt. `automation_rule.preview` та `automation_rule.activate` відбуваються окремо, поза чатом, після чинних перевірок ERP/MFA. Без нових провайдерів, виконання cron чи auto-approval.
4. `telegram-public-navigation.ts`: allowlist приватних гостьових `/start [website]`, `/menu`, `/help`, `/services`, `/request`, `/register`, `/worker`, `/call`, `/human`, `/privacy`. Worker зберігає намір разом з **оригінальним** повідомленням у чинній черзі людини. Немає outbound-повідомлення або реєстрації працівника від команди Telegram, поки provider/legal gates не виконані.
5. `corporate-site/src/lib/messenger-links.ts` + `Layout.astro`: клієнтські click-to-chat посилання на `wa.me`/`t.me` лише після внесення **підтвердженого** WhatsApp Business номера і BotFather username у **build-only** змінні. Телефон `tel:` уже існує — це не WebRTC/AI call. Жодні PII, ticket, текст розмов чи секрети не входять у URL.
6. Мови: меню Telegram наразі read-only для DE/UK/RU/EN/PL/LT; двосторонні live AI відповіді потрібують інший consent/provider gate. Web chat KNABA Assistant нині DE/EN/UK/RU. Оператори повинні мати оригінал повідомлення, переклад — додатковий шар.

## 2. Ролі та повний каталог функціональності
| Актор | Пункт | Команда або шлях | Статус |
|---|---|---|---|
| Будь-хто | Послуги, консультація, планувальник, телефон, заявка, портал, Datenschutz | `/leistungen/`, `/kontakt/`, `/planer/`, `/konto/` | SITE_LINK; форми/права сайту — окремо |
| Працівник (тільки authenticated ERP contact → WhatsApp) | Зміна, робочі години, переїзд | SHIFT/HOURS/TRAVEL | EXISTING ERP COMMANDS |
| Працівник | Завдання, матеріали, чат команди, підтвердження виплати, пристрій | TASKS/MATERIALS/CHATS/PAYROLL/GPS | EXISTING ERP COMMANDS; GPS не активується |
| Власник/керівництво | Postfach, CRM, Studio/CMS, адміністрування | `/postfach/`, `/crm/`, `/studio/`, `/admin/` | SITE_LINK; портал перевіряє доступ окремо |
| Власник з ERP `automation.manage` та `decision.manage` | Чернетки погоджуваних правил | /AUTOMATIONS | DRAFT only |
| Персонал з відповідними ERP-правами | Фінанси, склади, procurement, звіти, акти, замовлення, HR, QA, графіки | ERP V4 модулі | SOURCE_ONLY, поки немає перевіреного D1↔PG bridge |
| Telegram невідомий відправник | Запит послуг, реєстрація, дзвінок, передача людині | /request /register /call /human | guest HUMAN_QUEUED, не ERP-команда |

Принцип **no ghost actions**: коли модуль `SOURCE_ONLY`, повідомити про недоступність, не малювати fake-кнопку чи неіснуюче погодження.

## 3. Залишок для повної реалізації, послідовні acceptance gates

### A. Єдина ідентичність і worker onboarding — P0
- Мінімальна схема: `registration_intent` із site intake id, provider+event id, purpose, consent version, created_at, explicit worker-subject status; **не** створювати другий HR master. Пов'язування з ERP `user.invite` / існуючим порталом робити тільки після bridge.
- Telegram/WhatsApp чат може почати заявку, показати офіційне повідомлення конфіденційності, зібрати мінімальні дані через approved website step-up, видати **PENDING_OWNER_REVIEW**. Ніколи не просити посвідчення/пароль у чаті.
- Довести домен до `REQUESTED → IDENTITY_VERIFIED → OWNER_REVIEW → INVITED → ACCEPTED → ACTIVE`, з `REJECTED`, `EXPIRED`, `REVOKED`, `CANCELLED`. Окремий захищений власниковий inbox, один owner decision у межах company, MFA/step-up, версіонування й аудит з reason.
- Verified challenge: прив'язка actor↔provider identity у захищеному сайті, nonce CSPRNG (хеш у БД), 5–10 хв TTL, single-use, challenge context company/role/contact, CSRF, rate limit, no self-approval/replay, no scope copying.
- Acceptance: підміна phone/Telegram id, зміна company, повторний код, race 2 owner replies, replay webhook, revoked owner, expired challenge, restored database, denial після відкликання. Реальні worker+owner UAT окремо. Не активувати employee без owner step-up.

### B. Реальна переписка Telegram та WhatsApp ↔ KNABA Assistant/site — P0
- Уніфікувати `channel_identity`, `conversation_input`, `message`, `delivery`, `handoff`, `contact_identity` на канонічних ERP IDs (або підтвердженому bridge), не на одному номері телефону. Публічний сайт/D1 має scoped idempotent signed outbox→PG bridge, retries з лімітами, inbox dedup, dead-letter+replay через аудит.
- KNABA Assistant: багатомовні консультації про **реальні** послуги; зв'язок із власником через human handoff; кваліфікація заявки, адреса/тип/площа/час за згодою, клієнтське підтвердження. AI ніколи не видає остаточну ціну, юридичну згоду, доступність бригади, відсутню ліцензію.
- Telegram Bot API outbound після BotFather ownership, versioned privacy notice, explicit recipient opt-in, revocation, allowlist та confirmed send receipt. Існуючий outbound human-only не розширювати без окремого threat model; повідомлення з невідомим provider outcome **не пересилати** автоматично.
- WhatsApp Cloud API офіційний WABA/webhook з підписом, правила 24-годинного вікна та затверджені templates, rate limit, opt-out, delivery receipts. Не вважати 2xx або API_ACCEPTED доставкою користувачу.
- Acceptance: реальний roundtrip у 2 провайдерах із consent, customer ↔ owner; дублікати/replay, втрата worker lease, обрив мережі, tenant isolation, DELIVERED/READ від провайдера, erasure/retention.

### C. Дзвінки із сайту та маршрутизація розмов — P1
- **Наявне:** `tel:` запускає телефонний виклик на підтверджений публічний номер; форма callback та site text Assistant існують. Вебдиктування/озвучення браузера ≠ приймання телефонних дзвінків.
- **Майбутнє:** окремий `VoiceGateway` (WebRTC ↔ авторизований SIP/PSTN/WhatsApp Calling тільки за фактично доступним API). Consent на мікрофон, call state `REQUESTED → CONNECTING → HUMAN/AI → TRANSFER → ENDED/FAILED`; зрозумілий fallback телефон/callback; triage DE/EN/RU, за потреби UK; явне повідомлення, що говорить AI.
- Не записувати аудіо за замовчуванням. Для запису/STT/TTS потрібні legal basis, AVV/DPA, строки retention, ціна/квота і owner permit. AI відразу переводить до оператора за запитом чи при невпевненості; ніякого автоматичного підтвердження контракту.
- Acceptance: mobile browser mic decline, network drop, transfer оператору, unreachable owner/callback, inactivity timeout, GDPR erasure, платіжний ліміт, телефонна інтеграція в реальному обладнанні. НЕ видавати демо за справжній дзвінок.

### D. Автоматизації із бота з погодженням власника — P0/P1
- Зберегти канонічні `automation_rule.create/preview/activate/run` і `authorizeAutomationRule`; не вводити `eval`/довільний shell/LLM як executor.
- Майбутній wizard підтримує вибір з allowlist тригерів (`lead.created`, `material_request.submitted`, `task.assigned`, `shift.ended`), фільтр тільки на authorized site/customer, дію тільки із approved action catalogue, timezone Europe/Berlin, cooldown/rate cap, dry-run, monthly budget, retry policy.
- Стани: `DRAFT → VALIDATED → PREVIEWED → OWNER_APPROVAL_PENDING → ACTIVE → PAUSED/RETIRED`; sensitive activation тільки owner reauth/MFA на сайті; чат може показати одноразовий **approval link** із коротким TTL, а не виконати MFA за користувача. Multi-company CAS, immutable owner actor, exact proposal version, no self-approval.
- Після ввімкнення: аудит кожного trigger/event, idempotency key, dry-run vs executed receipt, pause/rollback, no uncontrolled cascade, bounded recursion, prevention of expensive loops, opt-out per recipient.
- Acceptance: no action before approval; duplicate and changed preview rejected; revoked scope; unsupported AI request safely rejected; stop/pause; crash recovery; real report and notification receipt. Дозволяти live лише після owner UAT.

### E. CMS/ERP coverage, UX, безпека, витрати — P0/P1
- Стандартизувати модульний реєстр навігації на фактичних route definitions в обох deployable units; після bridge додавати ACTIVE_COMMAND тільки з реальним Engine handler і acceptance; інакше SOURCE_ONLY. Без копіювання доменної логіки в месенджери.
- DE/EN/RU/UK end-to-end, наявні PL/LT меню без обіцянки повної локалізації бізнес-процесів; A11Y клавіатура/screen reader/zoom, світлі/темні стани, мобільні.
- Security: verified Meta signature/Telegram secret header, TLS, no phone-based owner roles, JWT scope/tenant, CSRF, XSS, LLM prompt injection, private media quarantine, anti-spam CAPTCHA for website, PII minimization, retention/erasure with backup review. Every owner action is audited.
- Budget: новий платний AI, SIP/PSTN, WhatsApp Calling, cloud integration `0 EUR` авторизовано; реальні квоти, вартість, ліцензії, secrets, WABA/BotFather доступ невідомі. Не активувати платне автоматично.
- Testing per exact commit+artifact: TypeScript, unit, SQL/Postgres under real isolation, website build/route checks, webhook signature/duplicates, Android/iOS manual calls, synthetic test receipts, provider sandbox real delivery after consent, stage end-to-end, human review, independent security gate, restore/rollback. Production лише після explicit owner acceptance.

## 4. Черга / team v3 / статуси
| Order | Workstream | DoD | Current |
|---|---|---|---|
| B0 | Inventory / shared module menu / site links | Typed source, no new secrets, tests | IMPLEMENTED_IN_DRAFT; requires integration review |
| B1 | Worker registration + owner review in canonical identity | Site↔ERP bridge, invite-only, MFA, verified worker UAT | PENDING, depends KN-U07, KN-U09 |
| B2 | Telegram/WhatsApp customer two-way automatic legal replies | Consents, signed provider transport, receipts, real conversation UAT | BLOCKED_EXTERNAL / PENDING |
| B3 | Bot-defined broad automation | Explicit DSL catalog, preview, owner step-up, queue tests | PARTIAL: 2 draft templates; live blocked |
| B4 | Real website voice call | Explicit provider/access/price, WebRTC, transfer & device QA | NOT_IMPLEMENTED |
| B5 | Multi-module runtime / delivery evidence | PG+site bridge, mobile browser/provider tests, owner UAT | NOT_READY |
Командні ролі: architect/integration, ERP/security, site/UX, provider+voice, QA/data privacy. Це призначення напрямків, **не** твердження про запущених агентів. Нові ідеї не перебивають активні вже дозволені завдання.

## 5. Відкат
Draft PR не чіпає `main`, VPS live, production webhooks, WABA/BotFather, secrets, DB, D1 або старі PR. Для rollback відкинути тільки цю feature branch / не merge. Наявні provider adapters, site, ERP source та customer data зберігаються. Будь-який майбутній provider rollout робити окремо з feature flag OFF за замовчуванням; при проблемі вимикати outbound, зберігати незавершений durable inbox, не робити destructive SQL down.

## 6. Друга реалізаційна ітерація (2026-10-26) — додатково до чинних ботів
- **WhatsApp:** команда `/REGISTER` записує `worker_registration_interest` для справжнього гостя, один детермінований company/provider/identity key без створення employee/roles; `/WORKERS` показує лише безпечний перелік відкритих заявок із захищеними деталями поточному OWNER/уповноваженому менеджеру. Усі старі START/TRAVEL/MATERIALS/PAYROLL/CHATS команди і durable confirmations зберігаються.
- **Telegram:** `/register` не підміняє роль ідентичністю чату; у чинному guest channel зберігається заявка. `/start`, `/services`, `/request`, `/register`, `/call`, `/human` мають безпечний визначений текст (без AI), але **відправлення можливе тільки після наявної явної versioned consent, перевіреного Bot API, поточного recipient і дозволеного сайту**. Source та outbound ticket потрапляють в існуючий outbox атомарно; `PENDING → SENDING → API_ACCEPTED/UNKNOWN/BLOCKED`, повтори не дублюють невідомий provider send. `/lang de|en|ru|uk|pl|lt` змінює тільки мовні налаштування, не opt-in.
- **ERP:** `worker_registration_interest.inbox` — рольова, tenant-scoped безпечна вибірка без PII; `worker_registration_interest.review` — MFA, expected_version, `REQUESTED → AWAITING_IDENTITY_PROOF/REJECTED` із аудитом, без автоматичного invite, employee, GPS, payroll або tenant rights. Пізніше — реальна звірка особи в існуючому порталі та canonical `user.invite`.
- **Автоматизації:** базовий OWNER може створити **лише DRAFT** через `automation.manage`; `automation.approve` і `automation.execute` цьому розширенню не надаються. Публічне меню не показує власникову чернетку DIRECTOR/BOT_ADMIN без owner policy. Зміна власникових прав під час виконання автоматизації все одно блокує завершальну транзакцію; оновлено й заново перевірено adversarial тест.
- **Без власникового узгодження під час розробки:** зовнішнє бізнес-погодження ролей/текстів згоди, тарифи й приймання компанією **переміщені у фінальний G9/UAT етап безпосередньо перед G10 перенесенням на сервер власника**. Технічна MFA, deny-by-default, GDPR/provider release gates не вимикаються. Розробка на існуючому VPS із синтетичними даними дозволена, реальний provider dispatch/production не активований.
- Результат і незакриті ворота: `docs/evidence/knaba-omnichannel-20261026/verification-phase-2.md`. Якщо немає перевіреного ERP API/owner→D1 identity bridge — не позначати registration/owner chat як live. Голосові дзвінки через WhatsApp Calling/WebRTC потребують окремого підтвердженого transport/AI/telephony provider.
