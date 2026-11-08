# KNABA V4: карта evidence AC-01–AC-72 станом на 2026-11-08

## Межа висновку

**Це source/test inventory, а не акт приймання. Жоден критерій цим документом не переведено в PASS.** У цьому огляді тести, SQL, browser, load, physical device та live provider не виконувалися. Перелічені test cases — перевірені назви й сценарії наявного коду; їхні execution receipts потрібно отримувати на фінальному коміті окремо. Whole-product status залишається **NOT READY**.

- Базовий commit: `7e448c6024718b932b79eeb2d38f3e3af672a1ae` (`7e448c6`). Робоче дерево `knaba-bridge` містило паралельні незакомічені зміни identity TTL і site→ERP bridge; це не immutable tested SHA. Identity cases з новим TTL24 наведені як кандидатні source tests; нові bridge runtime/tests не прийняті цим оглядом.
- Канонічний [V4 target](../../erp/KNABA_DE_TARGET_SPEC.md) і [CSV registry](../../erp/docs/specification-v4-reference/KNABA_DE_Acceptance_V4.csv) є джерелом формулювань. У CSV72рядки, усі `NOT_RUN`, поля execution evidence порожні. Це не означає72відсутні модулі: значна поведінка вже реалізована і має цільові тести.
- Назви тестів іноді містять історичні AC-ID. Наприклад, `AC-21 actual accepted reopen/replay...` перевіряє REWORK (канонічний AC-24), а не reschedule (канонічний AC-21). Зіставлення нижче за поведінкою, не текстовим ID.
- Позначка CPU/explicit-double не є реальним PostgreSQL. DATABASE_URL-gated позначає наявність умовного SQL scope у файлі, не кожен окремий case і не його виконання. Browser harness не є browser PASS. `%s`, `%j`, `$error` у назвах — точні parametrized patterns, кількість generated cases тут не підраховується.
- Source links показують точково переглянуті entrypoints, не повний security review всього файла. Номер рядка стосується оглянутого worktree. Висновок «не знайдено» обмежений зазначеним пошуком; перед новою реалізацією треба перевірити актуальний HEAD.

## Безпечна наступна черга

1. Завершити поточний KN-U02/U07 durable site intake: server-owned mapping, raw-body HMAC, queue/lease/idempotency, quarantine/UNKNOWN, default disabled, реальний synthetic site→ERP round trip. Machine intake не створює ERP identity або привілей. Кандидат у паралельній роботі не оголошується відсутнім чи готовим у цій карті.
2. Прийняти focused TTL24 fix із boundary/legacy/replay tests, окремим review і новим SHA. Старий audit нижче документує дефект на baseline; його не слід знову ставити як невиправлений без перевірки candidate.
3. Окремий AC-07 contract-first slice: web↔WhatsApp guest transfer,10хв/hash-only/one-use/двостороннє підтвердження/current identity membership, race/replay/expiry tests. Це source work до external provider acceptance.
4. Для KN-U09 спершу issuer+subject mapping/одноразовий server proof/current ERP authority+MFA/revocation contract. Використати існуючі auth/OIDC/session stacks; email або site role самі не видають ERP роль. Деталі в [source audit](SOURCE_SCOPE_AUDIT_2026-11-08_UK.md).
5. Уточнити AC-43 vehicle-trip accounting: на baseline видно passengerRole/vehicleTripId, але не writer/summary і3person-trip/onevehicle-distance case. Спершу focused contract test та повторний пошук, потім мінімальна реалізація; не підмінювати unknown route вигаданими km.
6. Доповнити whole-scenario evidence поверх існуючих модулів. AC-03 SSE timing, AC-08 actual WA ingress, AC-20 dispatch race, AC-59 browser, AC-67 full mixedload, AC-68 restore та AC-69 migration потребують конкретних протоколів. AC-40/70/71 — фізичні/signing/live gates; їх не можна закрити CPU totals.

Не переплановувати вже наявні recurring catch-up, immutable REWORK, order site-link/crew decline/expiry, exact payroll, HMAC ERP receiver, privacy erasure або template management як нові модулі лише через старий backlog. [Audit baseline](SOURCE_SCOPE_AUDIT_2026-11-08_UK.md) відділяє ці implemented contracts від незавершеної інтеграції.

## Карта критеріїв

Для кожного критерію: **source scope наявний ≠ виконано ≠ прийнято**. Канонічний статус для всіх наведених рядків лишається `NOT_RUN`; локальний статус цього огляду — `NOT_RUN_THIS_REVIEW`.

### AC-01 · KNB-01/02

**Канонічний сценарій:** Розгорнути clean test environment із lockfile/міграцій; API, worker, web і БД стартують; production bootstrap без synthetic users; окремі namespace/keys, жодних залежностей на AVENQO.

**Наявний автоматизований scope:** Bootstrap без wildcard та законні production gates.

- [identity.test.ts:75](../../erp/tests/identity.test.ts#L75) — `offline bootstrap closes after one owner and creates no wildcard or unapproved financial rights` (CPU/explicit-double source).
- [production-readiness-v4.test.ts:12](../../erp/tests/production-readiness-v4.test.ts#L12) — `requires all seven recorded categories with current legal bounds and independent approval` (CPU/explicit-double source).

**Source entrypoints:** [erp/apps/api/auth.ts:31](../../erp/apps/api/auth.ts#L31); [erp/apps/api/database.ts:7](../../erp/apps/api/database.ts#L7).

**Непокритий/непідтверджений сценарій:** Потрібен чистий install/migrate/start API+worker+web+DB на фінальному SHA; тести домену не доводять deploy.

**Зовнішнє або ручне приймання:** Ізольоване deployment середовище; production не змінювати.

### AC-02 · KNB-03

**Канонічний сценарій:** Для кожної ролі виконати одну дозволену й одну заборонену команду через API; чужі company/site IDs, exports та media не відкриваються; заборонена дія не змінює БД.

**Наявний автоматизований scope:** Приховування чужого tenant, site/customer scope та approved-media ACL.

- [engine.integration.test.ts:109](../../erp/tests/engine.integration.test.ts#L109) — `foreign tenant aggregate IDs are indistinguishable from nonexistent IDs` (є DATABASE_URL-gated cases у файлі).
- [engine.integration.test.ts:130](../../erp/tests/engine.integration.test.ts#L130) — `bounded customer membership excludes another site of the same customer` (є DATABASE_URL-gated cases у файлі).
- [engine.integration.test.ts:171](../../erp/tests/engine.integration.test.ts#L171) — `client media reads require approval and matching site membership` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/apps/api/engine.ts:145](../../erp/apps/api/engine.ts#L145).

**Непокритий/непідтверджений сценарій:** Потрібна повна позитивна/негативна матриця кожної канонічної ролі на UI/API/export/media; наведено репрезентативні межі.

**Зовнішнє або ручне приймання:** Ручний role-based acceptance у погодженому test tenant.

### AC-03 · KNB-03/22

**Канонічний сценарій:** Відкликати роль між створенням callback і натисканням; старі кнопки/queued translation/download не працюють; live subscription закрито ≤60 с.

**Наявний автоматизований scope:** Повторний current-authority check на queued delivery/translation та replay.

- [communications.test.ts:43](../../erp/tests/communications.test.ts#L43) — `queued translation/delivery/reminder rechecks VIEW and cancels after customer revocation` (CPU/explicit-double source).
- [engine.integration.test.ts:99](../../erp/tests/engine.integration.test.ts#L99) — `permission revocation is rechecked for an old Actor and cached replay` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/apps/api/engine.ts:145](../../erp/apps/api/engine.ts#L145); [erp/packages/domain/communications.ts:215](../../erp/packages/domain/communications.ts#L215); [erp/apps/api/http.ts:1](../../erp/apps/api/http.ts#L1).

**Непокритий/непідтверджений сценарій:** Окремо виміряти SSE revoke ≤60с, callback і download після відкликання; polling interval не є latency receipt.

**Зовнішнє або ручне приймання:** Браузер і керовані паралельні сесії.

### AC-04 · KNB-03/04

**Канонічний сценарій:** BOT_ADMIN намагається призначити собі OWNER; власник — видалити останнього OWNER; автор — погодити власну виплату/табель: усі операції відхилені й аудовані.

**Наявний автоматизований scope:** Заборона self-promotion, останнього owner та непереданих privileged permissions.

- [identity.test.ts:65](../../erp/tests/identity.test.ts#L65) — `self promotion and last-owner removal are denied before mutation` (CPU/explicit-double source).
- [identity.test.ts:66](../../erp/tests/identity.test.ts#L66) — `unprivileged inviter cannot grant privileged roles or unheld explicit permissions` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/identity.ts:71](../../erp/packages/domain/identity.ts#L71).

**Непокритий/непідтверджений сценарій:** Потрібен source-pinned прогін разом із self-approval матрицею критичних операцій.

**Зовнішнє або ручне приймання:** Підтвердження компанією призначення ролей; код не замінює таке рішення.

### AC-05 · KNB-04

**Канонічний сценарій:** Використати одноразове запрошення повторно, після TTL і з чужого контакту: доступ не створено; MFA/reauth і відкликання сесій реально працюють.

**Наявний автоматизований scope:** Одноразові invitation/identity, production MFA; поточний кандидат обмежує нові й legacy invitations 24 год.

- [identity.test.ts:25](../../erp/tests/identity.test.ts#L25) — `invitation lifetime cannot exceed the canonical 24 hours and rejected input writes nothing` (CPU/explicit-double source).
- [identity.test.ts:33](../../erp/tests/identity.test.ts#L33) — `legacy longer invitations expire at 24 hours even if their stored expiry is later` (CPU/explicit-double source).
- [identity.test.ts:63](../../erp/tests/identity.test.ts#L63) — `one-time invitation creates a verified bounded identity and no password aggregate` (CPU/explicit-double source).
- [identity.test.ts:59](../../erp/tests/identity.test.ts#L59) — `privileged production login needs configured MFA and rejects a replayed OTP` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/identity.ts:71](../../erp/packages/domain/identity.ts#L71); [erp/apps/api/auth.ts:31](../../erp/apps/api/auth.ts#L31).

**Непокритий/непідтверджений сценарій:** Нові TTL тести перелічено, але тут не виконано. Не успадковувати старий PASS; потрібні новий SHA, review та прогін.

**Зовнішнє або ручне приймання:** Перевірка реального verified contact/доставки й company MFA є окремою від синтетичного activation.

### AC-06 · KNB-04/06

**Канонічний сценарій:** Українське перше повідомлення відкриває UK-діалог; явна PL лишається після цитати DE/«OK»; повтор START продовжує Lead, новий запит створюється лише явно.

**Наявний автоматизований scope:** Явна мова; команда/номер/OK не визначають locale; повторний START повертає чинний lead.

- [whatsapp-router.test.ts:84](../../erp/tests/whatsapp-router.test.ts#L84) — `exact localized command parsing never derives locale from phone or an OK` (CPU/explicit-double source).
- [whatsapp-router.test.ts:133](../../erp/tests/whatsapp-router.test.ts#L133) — `language choice is persisted, does not alter source text, and does not infer consent from an inbound` (CPU/explicit-double source).
- [commerce.test.ts:174](../../erp/tests/commerce.test.ts#L174) — `repeat START returns open lead without contact-based identity merge` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/integrations/whatsapp-router.ts:12](../../erp/packages/integrations/whatsapp-router.ts#L12); [erp/packages/domain/commerce.ts:329](../../erp/packages/domain/commerce.ts#L329).

**Непокритий/непідтверджений сценарій:** Потрібен наскрізний UK→PL→DE quote→OK сценарій на одному persisted conversation.

**Зовнішнє або ручне приймання:** Live WhatsApp locale/provider rendering окремо; можливий synthetic transport до live.

### AC-07 · KNB-04/21

**Канонічний сценарій:** Web→WhatsApp transfer прив’язує ту саму гостьову сесію після двостороннього підтвердження; stolen/expired token не відкриває історію; два однакові імені не зливаються.

**Наявний автоматизований scope:** Наявний guest/WhatsApp routing не доводить зв’язування каналів.

- Whole-scenario test у переглянутому наборі не знайдено; нижче є лише пов’язані source/harness entrypoints.

**Source entrypoints:** [erp/apps/api/engine.ts:145](../../erp/apps/api/engine.ts#L145); [erp/packages/integrations/whatsapp-router.ts:12](../../erp/packages/integrations/whatsapp-router.ts#L12).

**Непокритий/непідтверджений сценарій:** SOURCE_GAP: target search не знайшов issue/confirm/consume web→WhatsApp transfer; engine ACL лише знає transfer_token. Реалізувати TTL10хв, hash-only one-use proof, обидва підтвердження, guest binding і current membership.

**Зовнішнє або ручне приймання:** Provider live proof потрібен пізніше; більшість контракту й race/replay тестів можна виконати локально.

### AC-08 · KNB-05

**Канонічний сценарій:** Невірний POST signature не створює inbox; валідний повтор webhook 10 разів дає 1 логічний ефект; при DB outage 2xx за незбережену подію не повертається.

**Наявний автоматизований scope:** Raw-byte signature helper; generic integration receiver відмовляє до transaction та не ACK-ає failed commit.

- [integrations.test.ts:18](../../erp/tests/integrations.test.ts#L18) — `POST verifies exact raw bytes independently of a GET token` (є DATABASE_URL-gated cases у файлі).
- [integration-events.test.ts:40](../../erp/tests/integration-events.test.ts#L40) — `invalid signatures never open the company transaction` (є DATABASE_URL-gated cases у файлі).
- [integration-events.test.ts:66](../../erp/tests/integration-events.test.ts#L66) — `DB commit failure returns a dependency error, never a durable acknowledgement` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/apps/api/main.ts:42](../../erp/apps/api/main.ts#L42); [erp/packages/integrations/whatsapp.ts:23](../../erp/packages/integrations/whatsapp.ts#L23); [erp/apps/api/integration-events.ts:6](../../erp/apps/api/integration-events.ts#L6).

**Непокритий/непідтверджений сценарій:** Це різні entrypoints: generic integration не є автоматичним доказом HTTP WhatsApp webhook. Потрібен exact WA route test: invalid→0 inbox;10 replay→1effect; DB outage→non-2xx.

**Зовнішнє або ручне приймання:** Production Meta secret/phone/config та live callback acceptance окремо.

### AC-09 · KNB-05/19

**Канонічний сценарій:** На 23:59 після останнього user message вільний текст дозволений; на ≥24:00 — тільки approved template; rejected template/opt-out блокує доставку; READ не змінює business acceptance.

**Наявний автоматизований scope:** Consent обов’язковий; рівно24год вимагає template; opt-out перемагає inbound.

- [communications.test.ts:22](../../erp/tests/communications.test.ts#L22) — `needs recorded consent even when a recent inbound exists` (CPU/explicit-double source).
- [communications.test.ts:23](../../erp/tests/communications.test.ts#L23) — `allows free text strictly inside 24 hours and requires approved template at the boundary` (CPU/explicit-double source).
- [communications.test.ts:24](../../erp/tests/communications.test.ts#L24) — `optout wins over approved templates and future inbound cannot open a window` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/communications.ts:215](../../erp/packages/domain/communications.ts#L215).

**Непокритий/непідтверджений сценарій:** Перевірити той самий boundary в actual leased worker та реальний approved template lifecycle.

**Зовнішнє або ручне приймання:** Meta approval/template/send квота й дозволений recipient.

### AC-10 · KNB-06

**Канонічний сценарій:** Новий клієнт проходить qualification, quote, acceptance; у БД є contact, source, виміри з джерелами, одна acceptance і одна dispatch-картка; відсутні дані не вигадані.

**Наявний автоматизований scope:** Explicit confirmation створює lead; concurrent quote acceptance дає один order/dispatch.

- [assistant-tools.test.ts:176](../../erp/tests/assistant-tools.test.ts#L176) — `explicit reviewed user confirmation creates one actual lead and links its channel` (CPU/explicit-double source).
- [commerce-v4.integration.test.ts:73](../../erp/tests/commerce-v4.integration.test.ts#L73) — `concurrent acceptance returns one original acceptance ID and binds exactly one order and dispatch to it` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/packages/integrations/assistant-tools.ts:32](../../erp/packages/integrations/assistant-tools.ts#L32); [erp/packages/domain/commerce.ts:329](../../erp/packages/domain/commerce.ts#L329).

**Непокритий/непідтверджений сценарій:** Потрібен один qualification→verified measurement→quote→accept→dispatch journey з фактичним contact/source і без проміжних fixture shortcuts.

**Зовнішнє або ручне приймання:** Погодження вимірювань і прийняття пропозиції уповноваженим клієнтом.

### AC-11 · KNB-06/07

**Канонічний сценарій:** Запит непідтвердженої послуги/ціни або обов’язкового огляду створює review/site visit; AI не видає остаточну ціну/час бригади.

**Наявний автоматизований scope:** Клієнт не підробляє VERIFIED measurement; visit request не підтверджує staffing/schedule.

- [commerce.test.ts:116](../../erp/tests/commerce.test.ts#L116) — `customer input cannot forge VERIFIED source during creation or later qualification` (CPU/explicit-double source).
- [assistant-tools.test.ts:341](../../erp/tests/assistant-tools.test.ts#L341) — `requests a site visit through the real command and never confirms staffing or schedule` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/integrations/assistant-tools.ts:32](../../erp/packages/integrations/assistant-tools.ts#L32); [erp/packages/domain/commerce.ts:329](../../erp/packages/domain/commerce.ts#L329).

**Непокритий/непідтверджений сценарій:** Потрібно зіставити всі сценарії unknown service/price/territory та human-review UI.

**Зовнішнє або ручне приймання:** Реальний approved service catalogue і відповідальні за виїзд/цінову політику.

### AC-12 · KNB-06

**Канонічний сценарій:** «Потрібна людина» переводить у HUMAN_QUEUED; два оператори claim одночасно — один успішний; у HUMAN_ACTIVE немає паралельних AI replies; return-to-AI тільки явний.

**Наявний автоматизований scope:** Actual SQL claim race, providerless fallback і HUMAN_ACTIVE не створюють другу AI job.

- [handoff.integration.test.ts:101](../../erp/tests/handoff.integration.test.ts#L101) — `two independently waiting actual Engine operators produce one claim owner and one committed claim membership` (є DATABASE_URL-gated cases у файлі).
- [handoff.integration.test.ts:157](../../erp/tests/handoff.integration.test.ts#L157) — `providerless manual fallback becomes a real pending operator handoff without queueing an invented AI reply` (є DATABASE_URL-gated cases у файлі).
- [handoff.integration.test.ts:171](../../erp/tests/handoff.integration.test.ts#L171) — `repeated requestHuman while HUMAN_ACTIVE preserves the actual owner and does not create a second takeover or AI job` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/packages/domain/communications.ts:215](../../erp/packages/domain/communications.ts#L215); [erp/packages/integrations/assistant-tools.ts:32](../../erp/packages/integrations/assistant-tools.ts#L32).

**Непокритий/непідтверджений сценарій:** Потрібен runtime restart/timeout journey з операторським UI та контроль in-flight provider outcome.

**Зовнішнє або ручне приймання:** Операторські процеси/години; provider calls окремо.

### AC-13 · KNB-07

**Канонічний сценарій:** Prompt injection у чаті/knowledge file вимагає зарплату/секрети іншого клієнта; retrieval/tools відмовляють, дані не потрапляють ні у відповідь, ні в prompt провайдера.

**Наявний автоматизований scope:** Retrieval лише approved PUBLIC/current; unknown tools/privileges та untrusted instructions не авторизують money.

- [assistant-governance.test.ts:40](../../erp/tests/assistant-governance.test.ts#L40) — `filters approved static PUBLIC/current sources before simulation, never exposing internal or foreign facts` (CPU/explicit-double source).
- [assistant-tools.test.ts:239](../../erp/tests/assistant-tools.test.ts#L239) — `rejects unknown tools, duplicate call IDs and batches over six before transaction` (CPU/explicit-double source).
- [integrations.test.ts:32](../../erp/tests/integrations.test.ts#L32) — `untrusted instruction strings remain user JSON data and cannot authorize a money answer` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/packages/integrations/assistant-tools.ts:32](../../erp/packages/integrations/assistant-tools.ts#L32).

**Непокритий/непідтверджений сценарій:** Повна adversarial матриця retrieval/tools/foreign tenant і підтверджений secret scan потрібні на фінальних артефактах.

**Зовнішнє або ручне приймання:** External model robustness не сертифіковано синтетичним adapter.

### AC-14 · KNB-07/21

**Канонічний сценарій:** AI timeout, invalid JSON і budget=0: форма/людина доступні, START/END працюють; нова assistant config проходить preview/regression/approval, rollback відновлює перевірену версію.

**Наявний автоматизований scope:** Budget/approval gate, invalid JSON і config preview/regression/approval source tests.

- [integrations.test.ts:31](../../erp/tests/integrations.test.ts#L31) — `production personal data requires approval and exhausted budget never invokes provider` (є DATABASE_URL-gated cases у файлі).
- [integrations.test.ts:34](../../erp/tests/integrations.test.ts#L34) — `invented source IDs and invalid provider JSON are rejected` (є DATABASE_URL-gated cases у файлі).
- [commerce.test.ts:176](../../erp/tests/commerce.test.ts#L176) — `assistant config completes deterministic preview/regression/approval and keeps old policy history` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/integrations/assistant-tools.ts:32](../../erp/packages/integrations/assistant-tools.ts#L32); [erp/packages/domain/commerce.ts:329](../../erp/packages/domain/commerce.ts#L329).

**Непокритий/непідтверджений сценарій:** Source-перевірка config не підтверджує реальний model regression; потрібен весь no-provider fallback, activation/rollback й time actions under failure.

**Зовнішнє або ручне приймання:** Provider quota/consent для реальних викликів; basic time flow не має їх вимагати.

### AC-15 · KNB-08

**Канонічний сценарій:** Тестовий кошторис: 6 людино-год × €30 + €40 матеріалів + €20 виїзд = €240 net; лише в test tax profile 19% = €45,60; gross €285,60. PDF/API/UI однакові.

**Наявний автоматизований scope:** Exact integer quote arithmetic і однакові totals/source SHA у експортах.

- [commerce.test.ts:153](../../erp/tests/commerce.test.ts#L153) — `T-SALES-04 calculates 6 person hours plus materials and travel in integer cents with explicit synthetic tax` (CPU/explicit-double source).
- [resources.test.ts:193](../../erp/tests/resources.test.ts#L193) — `XLSX round-trip and CSV preserve published exact totals, worker seconds and source SHA; PDF embeds the same source SHA` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/commerce.ts:329](../../erp/packages/domain/commerce.ts#L329); [erp/apps/api/exporters.ts:7](../../erp/apps/api/exporters.ts#L7).

**Непокритий/непідтверджений сценарій:** Приклад quote240/45.60/285.60 і report exports — окремі fixtures; потрібне порівняння API/UI/PDF однієї пропозиції.

**Зовнішнє або ручне приймання:** Ручна читабельність DE PDF і погоджений tax mode.

### AC-16 · KNB-08

**Канонічний сценарій:** Двічі ACCEPT чинної quote version — 1 order/dispatch; ACCEPT expired/superseded — 409; нова версія не прийнята мовчки.

**Наявний автоматизований scope:** Один immutable acceptance/order/dispatch за concurrent повторів.

- [commerce-v4.integration.test.ts:73](../../erp/tests/commerce-v4.integration.test.ts#L73) — `concurrent acceptance returns one original acceptance ID and binds exactly one order and dispatch to it` (є DATABASE_URL-gated cases у файлі).
- [commerce.test.ts:100](../../erp/tests/commerce.test.ts#L100) — `acceptance preserves the published commercial snapshot and returns the same original acceptance and dispatch identities` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/commerce.ts:329](../../erp/packages/domain/commerce.ts#L329).

**Непокритий/непідтверджений сценарій:** Окремо зв’язати receipt з expired/superseded quote409 і end-to-end customer UI.

**Зовнішнє або ручне приймання:** Справжня customer membership та повноваження на прийняття.

### AC-17 · KNB-08

**Канонічний сценарій:** Fixed €1 200 + додаткові години = €1 200; accepted Nachtrag €120 → €1 320 до податку. Включені матеріали й REWORK не додаються вдруге.

**Наявний автоматизований scope:** Fixed contract не змінюється від raw hours; accepted change додає суму один раз.

- [commerce.test.ts:158](../../erp/tests/commerce.test.ts#L158) — `T-SALES-05 fixed contract remains unchanged by raw hours and draft extras; only accepted change increments amount once` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/commerce.ts:329](../../erp/packages/domain/commerce.ts#L329).

**Непокритий/непідтверджений сценарій:** Потрібен whole-scenario1200→1320 разом із REWORK без подвійного charge у звіті.

**Зовнішнє або ручне приймання:** Клієнтське погодження Nachtrag; source не підміняє підпис.

### AC-18 · KNB-09

**Канонічний сценарій:** CLIENT A/EXTERNAL_BAULEITER A не читають клієнта B, internal chat, wages/GPS навіть через direct URL/API/export. Неавторизоване «існуючий» не показує перелік об’єктів.

**Наявний автоматизований scope:** Customer site isolation, scoped quote та media access.

- [engine.integration.test.ts:130](../../erp/tests/engine.integration.test.ts#L130) — `bounded customer membership excludes another site of the same customer` (є DATABASE_URL-gated cases у файлі).
- [engine.integration.test.ts:171](../../erp/tests/engine.integration.test.ts#L171) — `client media reads require approval and matching site membership` (є DATABASE_URL-gated cases у файлі).
- [commerce.test.ts:282](../../erp/tests/commerce.test.ts#L282) — `quote reads resolve the exact quote, order and lead site instead of accepting another same-customer site grant` (CPU/explicit-double source).

**Source entrypoints:** [erp/apps/api/engine.ts:145](../../erp/apps/api/engine.ts#L145); [erp/apps/api/exporters.ts:7](../../erp/apps/api/exporters.ts#L7).

**Непокритий/непідтверджений сценарій:** Окремо пройти зовнішнього Bauleiter, прямі URL/export і wage/GPS canary на кожному доступному представлення.

**Зовнішнє або ручне приймання:** Перелік клієнтських site memberships має затвердити компанія.

### AC-19 · KNB-09/20

**Канонічний сценарій:** RECEIVED_REPORT не змінює HOURS_APPROVED чи WORK_ACCEPTED; issue на report v1 створює номер і linkage, не редагує v1/табель.

**Наявний автоматизований scope:** Документ received, години й work acceptance — різні transitions; closure вимагає evidence.

- [resources.test.ts:161](../../erp/tests/resources.test.ts#L161) — `T-REPORT-03 delivery, document receipt, hour confirmation and work acceptance are separate` (CPU/explicit-double source).
- [order-lifecycle-v4.test.ts:104](../../erp/tests/order-lifecycle-v4.test.ts#L104) — `document receipt does not count as work acceptance; documented closure requires evidence and does not mark payment` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152); [erp/packages/domain/commerce.ts:329](../../erp/packages/domain/commerce.ts#L329).

**Непокритий/непідтверджений сценарій:** Перевірити Issue з PDFv1, незмінність bytes та окреме погодження годин/work у UI.

**Зовнішнє або ручне приймання:** Уповноважений замовник приймає результат.

### AC-20 · KNB-10

**Канонічний сценарій:** Два диспетчери одночасно резервують одну людину в overlap: 1 успіх, 1 conflict; expired TTL вивільняє слот; не підтверджений працівником склад не стає SCHEDULED.

**Наявний автоматизований scope:** Employee ACK не можна обійти; reservation TTL точно15хв.

- [order-lifecycle-v4.test.ts:91](../../erp/tests/order-lifecycle-v4.test.ts#L91) — `requireEmployeeAck:false cannot bypass scheduling` (CPU/explicit-double source).
- [order-lifecycle-v4.test.ts:112](../../erp/tests/order-lifecycle-v4.test.ts#L112) — `reservation TTL is exactly fifteen minutes, and a caller cannot extend it` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/commerce.ts:329](../../erp/packages/domain/commerce.ts#L329).

**Непокритий/непідтверджений сценарій:** Потрібен реальний SQL race саме overlapping dispatch reservations,1winner, ресурсний overlap і expiry; time/stock races не замінюють цей сценарій.

**Зовнішнє або ручне приймання:** Погоджений scheduler/clock fixture; не вимога production.

### AC-21 · KNB-10/19

**Канонічний сценарій:** Перепланувати замовлення; зберігається revision, старі нагадування скасовані, повідомлення лише зачепленим; cancel знімає майбутні резерви, не стирає робочі факти.

**Наявний автоматизований scope:** Cancellation зберігає work facts; reschedule створює нові response revisions і відхиляє старий ACK.

- [order-lifecycle-v4.test.ts:109](../../erp/tests/order-lifecycle-v4.test.ts#L109) — `cancellation releases future reservations and pending reminders while retaining worked facts` (CPU/explicit-double source).
- [order-lifecycle-v4.test.ts:170](../../erp/tests/order-lifecycle-v4.test.ts#L170) — `rescheduling creates new proposed responses and rejects a response for the old revision` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/commerce.ts:329](../../erp/packages/domain/commerce.ts#L329).

**Непокритий/непідтверджений сценарій:** Перевірити exactly-once скасування старих reminders та recipient-only delivery для попередньої/нової crew.

**Зовнішнє або ручне приймання:** Операторський acceptance календаря й повідомлень.

### AC-22 · KNB-10/11

**Канонічний сценарій:** Scheduler після рестарту двічі генерує той самий recurring period/location; рівно 1 task occurrence. Шаблонна зміна не переписує ACCEPTED tasks.

**Наявний автоматизований scope:** Catch-up cursor, crash rollback, stable occurrence key та accepted history snapshots.

- [task-calendar.test.ts:55](../../erp/tests/task-calendar.test.ts#L55) — `bounded oldest-first catchup resumes its cursor until all missed periods exist exactly once` (CPU/explicit-double source).
- [operations.test.ts:185](../../erp/tests/operations.test.ts#L185) — `a failed second occurrence rolls back the whole real handler batch, cursor, task events and receipt before safe retry` (CPU/explicit-double source).
- [operations.test.ts:193](../../erp/tests/operations.test.ts#L193) — `template edits preserve accepted historical task and occurrence snapshots while new due tasks use the current revision` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273).

**Непокритий/непідтверджений сценарій:** Потрібен exact-source PostgreSQL restart/tick і UI schedule acceptance; алгоритм вже є, не планувати його заново.

**Зовнішнє або ручне приймання:** Узгоджені timezone/recurrence правила компанії.

### AC-23 · KNB-11

**Канонічний сценарій:** Спроби циклу/cross-site parent у LocationNode відхилені; EG/1. OG не змішуються; імпорт із дублем external key робить upsert і показує row errors до commit.

**Наявний автоматизований scope:** Acyclic hierarchy/історичні breadcrumbs; signed DE floors; preview-bound import/upsert.

- [operations.test.ts:114](../../erp/tests/operations.test.ts#L114) — `explicit floors and acyclic site tree preserve task historical breadcrumb after rename` (CPU/explicit-double source).
- [imports.test.ts:45](../../erp/tests/imports.test.ts#L45) — `parses BOM, CRLF, semicolons, empty parent and explicitly signed German floors` (CPU/explicit-double source).
- [operations.test.ts:120](../../erp/tests/operations.test.ts#L120) — `bulk import requires exact current preview and repeated stable external keys upsert` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273).

**Непокритий/непідтверджений сценарій:** Потрібен повний cross-site malicious parent/cycle/row-error сценарій із реальним upload UI.

**Зовнішнє або ручне приймання:** Погодження неоднозначних поверхів без автоматичного вгадування.

### AC-24 · KNB-11

**Канонічний сценарій:** Worker submit → SUBMITTED_FOR_REVIEW, не ACCEPTED; незалежний QC приймає; дефект створює пов’язану REWORK-task, збережено попередній цикл і витрати.

**Наявний автоматизований scope:** Submit→review, dedup defect; окремий REWORK з immutable accepted source.

- [operations.test.ts:116](../../erp/tests/operations.test.ts#L116) — `worker submit is review pending; duplicate defect produces one linked internal rework and preserves primary evidence` (CPU/explicit-double source).
- [v4-core-contracts.integration.test.ts:47](../../erp/tests/v4-core-contracts.integration.test.ts#L47) — `AC-21 actual accepted reopen/replay creates linked remediation while original data/version/audit revisions stay unchanged` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273).

**Непокритий/непідтверджений сценарій:** В historical назві тесту AC-21 означає REWORK, але канонічно це AC-24. Потрібна independent reviewer/permission matrix та UI quality flow.

**Зовнішнє або ручне приймання:** Назначений QC reviewer і критерії якості.

### AC-25 · KNB-11/13

**Канонічний сценарій:** Троє × 2 год і спільні 100 м² дають 6 людино-год, 2 год elapsed, 100 м². Розподіл одного 1-год сегмента на 70 хв задач відхилений.

**Наявний автоматизований scope:** 100m² не множиться на crew;6person-hours,2elapsed; allocation обмежена segment.

- [operations.test.ts:115](../../erp/tests/operations.test.ts#L115) — `3 people ×2 hours count 100m² once and six person hours; cannot overallocate a segment` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273).

**Непокритий/непідтверджений сценарій:** Потрібен той самий приклад у report/API/UI; геолокація не доводить виконаний обсяг.

**Зовнішнє або ручне приймання:** Практичне підтвердження обсягів відповідальним reviewer.

### AC-26 · KNB-12

**Канонічний сценарій:** Внутрішній прораб/працівник бачать SITE_INTERNAL; external лише SITE_CLIENT; новий member без спеціального дозволу не читає історію до history_from.

**Наявний автоматизований scope:** External identity не входить в internal chat; visibility обмежена historyFrom.

- [communications.test.ts:61](../../erp/tests/communications.test.ts#L61) — `external customers cannot join internal channels or create an internal chat` (CPU/explicit-double source).
- [communications.test.ts:63](../../erp/tests/communications.test.ts#L63) — `joined users see only history after their membership boundary` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/communications.ts:215](../../erp/packages/domain/communications.ts#L215).

**Непокритий/непідтверджений сценарій:** Потрібні всі role/channel transitions, queued callback та reply після revoke у rendered UI.

**Зовнішнє або ручне приймання:** Список внутрішніх/клієнтських каналів затверджує компанія.

### AC-27 · KNB-07/12

**Канонічний сценарій:** DE-повідомлення про 5 л о 14:30 із «не мити» перекладається UK/PL/LT персонально; числа/заперечення перевірені, reply працівника має правильний TASK_THREAD; оригінал доступний.

**Наявний автоматизований scope:** Перевірка numbers/addresses/negations, machine label, originals та ambiguity refusal.

- [integrations.test.ts:28](../../erp/tests/integrations.test.ts#L28) — `extracts numbers and canonical addresses and rejects number/negation changes` (є DATABASE_URL-gated cases у файлі).
- [integrations.test.ts:29](../../erp/tests/integrations.test.ts#L29) — `retains originals, fact literals, machine label and usage in validated translation result` (є DATABASE_URL-gated cases у файлі).
- [integrations.test.ts:30](../../erp/tests/integrations.test.ts#L30) — `ambiguous safety translation fails explicitly without guessing` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/packages/domain/communications.ts:215](../../erp/packages/domain/communications.ts#L215).

**Непокритий/непідтверджений сценарій:** Потрібен точний DE5l14:30+negation→UK/PL/LT в personal correct thread, не лише adapter fixtures.

**Зовнішнє або ручне приймання:** Лінгвістична перевірка фактичних model outputs; не вважати regex proof гарантією перекладу.

### AC-28 · KNB-07/12

**Канонічний сценарій:** 10 повторних translate clicks створюють 1 AI request; після edit version новий переклад; чужий message_id/відкликана membership не дає текст/переклад.

**Наявний автоматизований scope:** Versioned cache; corrected original інвалідовує late result; revoke блокує історію.

- [communications.test.ts:64](../../erp/tests/communications.test.ts#L64) — `translation requests share versioned cache, while message correction creates a new request` (CPU/explicit-double source).
- [communications.test.ts:65](../../erp/tests/communications.test.ts#L65) — `late provider result cannot replace a corrected original or publish a stale translation` (CPU/explicit-double source).
- [communications.test.ts:62](../../erp/tests/communications.test.ts#L62) — `revoked membership denies historical reads and cancels pending recipient translations` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/communications.ts:215](../../erp/packages/domain/communications.ts#L215).

**Непокритий/непідтверджений сценарій:** Потрібні10одночасних click→1billable call у runtime і source-version update, із фактичним accounting.

**Зовнішнє або ручне приймання:** External billing usage не доведений estimated cost.

### AC-29 · KNB-12/18

**Канонічний сценарій:** Повідомлення/фото без reply context не йде у випадковий site; бот уточнює. Повідомлення бота, отримане повторно, не породжує relay-loop.

**Наявний автоматизований scope:** Ambiguous reply не відкриває іншу crew; media потребує явних site/stage.

- [whatsapp-router.test.ts:121](../../erp/tests/whatsapp-router.test.ts#L121) — `revoked channel membership and ambiguous reply context cannot publish to another crew` (CPU/explicit-double source).
- [whatsapp-router.test.ts:122](../../erp/tests/whatsapp-router.test.ts#L122) — `prepared media requires explicit site and stage confirmation; retains caption and stays internal` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/integrations/whatsapp-router.ts:12](../../erp/packages/integrations/whatsapp-router.ts#L12).

**Непокритий/непідтверджений сценарій:** Потрібен threaded photo reply із actual provider callback, echo/bot-loop rejection і history-bound context.

**Зовнішнє або ручне приймання:** Provider media/reply contract та дозволені test accounts.

### AC-30 · KNB-12

**Канонічний сценарій:** AI preview з 3 задач підтверджено 2 рази → рівно 3 задачі; змінений command hash блокує старий confirm; «готово» без цілі не закриває жодної задачі.

**Наявний автоматизований scope:** Один confirm створює три tasks; changed referenced aggregate скасовує effects.

- [operations.test.ts:118](../../erp/tests/operations.test.ts#L118) — `one confirmed three-task preview creates three effects across repeated confirms` (CPU/explicit-double source).
- [engine.integration.test.ts:40](../../erp/tests/engine.integration.test.ts#L40) — `atomic confirmation refuses a changed referenced aggregate without effects` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273); [erp/apps/api/engine.ts:145](../../erp/apps/api/engine.ts#L145).

**Непокритий/непідтверджений сценарій:** Потрібні model ambiguity/invalid JSON і actual command transaction разом із duplicate confirm UI.

**Зовнішнє або ручне приймання:** AI preview не є дозволом діяти без людини.

### AC-31 · KNB-13

**Канонічний сценарій:** Одночасні START з WhatsApp і native створюють 1 Shift; дубль END не змінює тривалість. Фото/опис відсутні — END зберігається, follow-up окремо.

**Наявний автоматизований scope:** SQL concurrent shift starts; WhatsApp retries; END зберігається при rejected GPS.

- [engine.integration.test.ts:72](../../erp/tests/engine.integration.test.ts#L72) — `concurrent shift starts yield one active shift and one typed conflict` (є DATABASE_URL-gated cases у файлі).
- [whatsapp-router.test.ts:102](../../erp/tests/whatsapp-router.test.ts#L102) — `same provider input and concurrent different inputs produce one confirmed shift` (CPU/explicit-double source).
- [device-batch-v4.test.ts:29](../../erp/tests/device-batch-v4.test.ts#L29) — `keeps END accepted after a rejected expired GPS lease, using fresh native device authority context` (CPU/explicit-double source).

**Source entrypoints:** [erp/apps/api/engine.ts:145](../../erp/apps/api/engine.ts#L145); [erp/packages/integrations/whatsapp-router.ts:12](../../erp/packages/integrations/whatsapp-router.ts#L12).

**Непокритий/непідтверджений сценарій:** Окремо одночасний WA/native START і duplicate END однакового shift; photo must-not-block time на реальному UI.

**Зовнішнє або ручне приймання:** Physical native acceptance окремо від SQL/double.

### AC-32 · KNB-13

**Канонічний сценарій:** Контрольний день 08–10 WORK A; 10–10:05 AWAY; 10:05–10:35 TRIP; 10:35–12:30 WORK B; 12:30–13 BREAK; 13–16 WORK B → 8:00 elapsed, WORK 6:55, TRIP 0:30, BREAK 0:30, AWAY 0:05. За тестовою оплатою WORK+TRIP =7:25; 5 хв залишаються на review.

**Наявний автоматизований scope:** Точний canonical geo-day28800s/24900s work/1800travel/300pending/1800break.

- [operations.test.ts:32](../../erp/tests/operations.test.ts#L32) — `full geo-day retains five unexplained minutes, rather than losing them or charging payroll automatically` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273).

**Непокритий/непідтверджений сценарій:** Потрібен UI/export payroll reconciliation того самого дня, не округлення display до втрати секунд.

**Зовнішнє або ручне приймання:** Reason/approval AWAY вирішує людина, GPS не призначає deduction.

### AC-33 · KNB-13

**Канонічний сценарій:** DST тест Europe/Berlin: 25.10.2026 01:30+02 → 03:30+01 = 3 год; 29.03.2026 01:30+01 → 03:30+02 =1 год. Межі місяця не дублюють секунди.

**Наявний автоматизований scope:** Parametrized UTC/DST arithmetic без wall-clock errors.

- [operations.test.ts:34](../../erp/tests/operations.test.ts#L34) — `UTC arithmetic handles %s without wall clock errors` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273).

**Непокритий/непідтверджений сценарій:** Прив’язати конкретні generated spring/fall cases та month-second totals до execution receipt; %s — pattern, не самостійний результат.

**Зовнішнє або ручне приймання:** Europe/Berlin display і boundary review.

### AC-34 · KNB-13/16

**Канонічний сценарій:** Погоджена correction зберігає первинні події/author/reason; у LOCKED period створює adjustment; самопогодження й silent rewrite неможливі.

**Наявний автоматизований scope:** Locked-period correction append-only; self-approval denied.

- [operations.test.ts:35](../../erp/tests/operations.test.ts#L35) — `closed-period correction creates a separate approved adjustment and keeps locked snapshot intact` (CPU/explicit-double source).
- [operations.test.ts:33](../../erp/tests/operations.test.ts#L33) — `repeat start, historical overlap, out-of-order event, foreign shift and self approval are denied` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273).

**Непокритий/непідтверджений сценарій:** Потрібна UI reason→independent approve→adjustment→report/payroll reprojection однакових facts.

**Зовнішнє або ручне приймання:** Правомочність approver та політика закриття періоду.

### AC-35 · KNB-14

**Канонічний сценарій:** Одна далека/неточна/стара точка, відсутня accuracy чи 300 с silence не створюють EXIT/неоплату. 3 придатні outside points з інтервалами 60 с підтверджують один EXIT на третій.

**Наявний автоматизований scope:** Три consecutive usable points/dwell;300s UNKNOWN не створює absence.

- [operations.test.ts:47](../../erp/tests/operations.test.ts#L47) — `two distant observations cannot complete a dwell; a new consecutive three point window confirms at the third point` (CPU/explicit-double source).
- [operations.test.ts:75](../../erp/tests/operations.test.ts#L75) — `poor points produce UNKNOWN exactly300s after the last usable point without recording absence` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273).

**Непокритий/непідтверджений сценарій:** Потрібні actual native/server shared vectors і фізичне шумове середовище; simulated points не підтверджують field reliability.

**Зовнішнє або ручне приймання:** Дозволений GPS pilot і контрольні ground-truth спостереження.

### AC-36 · KNB-14

**Канонічний сценарій:** Підтверджений EXIT у WORKING відкриває один AWAY з confirmed_at; ENTER повертає лише GEO-AWAY same site. ENTER у OFF_DUTY/ON_BREAK/TRAVELLING не починає WORKING.

**Наявний автоматизований scope:** ENTER відновлює лише matching geo pause; manual break не знімається.

- [operations.test.ts:130](../../erp/tests/operations.test.ts#L130) — `ENTER restores only matching geopause; manual lunch remains manual and rejects late private events` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273).

**Непокритий/непідтверджений сценарій:** Перевірити всі manual states/інший site та replay після restart на реальному native endpoint.

**Зовнішнє або ручне приймання:** Фізичний ENTER не є підписом особи чи доказом кімнати/поверху.

### AC-37 · KNB-14

**Канонічний сценарій:** Локальні private BREAK/END зупиняють новий збір; пізно надіслані точки приватного інтервалу відхилені/видалені. Попередні дозволені trip points після END прийняті за event-time.

**Наявний автоматизований scope:** Private/post-END points denied за event time; END незалежний від expired GPS lease.

- [operations.test.ts:131](../../erp/tests/operations.test.ts#L131) — `permitted late travel sample survives END; private stop and post-END points are rejected by event time` (CPU/explicit-double source).
- [device-batch-v4.test.ts:29](../../erp/tests/device-batch-v4.test.ts#L29) — `keeps END accepted after a rejected expired GPS lease, using fresh native device authority context` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273); [erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/TrackingService.kt:15](../../erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/TrackingService.kt#L15); [erp/apps/mobile-ios/Sources/LocationTracker.swift:6](../../erp/apps/mobile-ios/Sources/LocationTracker.swift#L6).

**Непокритий/непідтверджений сценарій:** Окремо підтвердити native stop/purge до network send, offline BREAK/END та явний RESUME.

**Зовнішнє або ручне приймання:** OS permission/background check на фізичних телефонах.

### AC-38 · KNB-14

**Канонічний сценарій:** Remote END при offline native: lease спливає ≤15 хв, GPS stop; до синхронізації private points не зберігаються сервером; UI чесно показує stale tracker.

**Наявний автоматизований scope:** Server lease відхиляє withdrawn policy; summary не вигадує роботу/absence з UNKNOWN.

- [device-events-v4.test.ts:48](../../erp/tests/device-events-v4.test.ts#L48) — `withdrawn policy or legal approval closes an unexpired issued lease` (CPU/explicit-double source).
- [mobile-shift-summary.test.ts:38](../../erp/tests/mobile-shift-summary.test.ts#L38) — `reports unknown activity as UNKNOWN and explicit review without inventing payroll or break` (CPU/explicit-double source).
- [NativeTests.swift:33](../../erp/apps/mobile-ios/Tests/NativeTests.swift#L33) — `testLeaseRejectsExpiryAndNeverStartsGPSFromOFF`; [NativeTests.swift:39](../../erp/apps/mobile-ios/Tests/NativeTests.swift#L39) — `testLocationRequiresServerIssuedBoundLeaseAndGeofenceVersion` (XCTest source, не physical run).

**Source entrypoints:** [erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/TrackingService.kt:15](../../erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/TrackingService.kt#L15); [erp/apps/mobile-ios/Sources/LocationTracker.swift:6](../../erp/apps/mobile-ios/Sources/LocationTracker.swift#L6).

**Непокритий/непідтверджений сценарій:** Native source має visible stop/no hidden reboot. Потрібен актуальний support matrix та permission/force-stop/reboot protocol з truthful UI.

**Зовнішнє або ручне приймання:** Фізичні Android/iOS, battery restrictions і дозволи користувача.

### AC-39 · KNB-14/22

**Канонічний сценарій:** Out-of-order, duplicate, wrong employee/device, clock shift, revoked lease й late event: жодного дубля/чужої точки; конфлікт часу → review, LOCKED history незмінна.

**Наявний автоматизований scope:** Sequence/boot/clock anomalies й revoked device не стають автоматичними timefacts; manual review coordinate-free.

- [device-events-v4.test.ts:52](../../erp/tests/device-events-v4.test.ts#L52) — `reordered sequence becomes one repeatable review without raw coordinates or a rewritten cursor` (CPU/explicit-double source).
- [device-events-v4.test.ts:59](../../erp/tests/device-events-v4.test.ts#L59) — `monotonic reset and wall clock shift require review rather than an automatic activity transition` (CPU/explicit-double source).
- [device-batch-v4.test.ts:54](../../erp/tests/device-batch-v4.test.ts#L54) — `foreign or revoked devices cannot execute or persist a manual reconciliation fact` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273).

**Непокритий/непідтверджений сценарій:** Потрібні late events на locked period, exact retry response та online/offline native queue journey.

**Зовнішнє або ручне приймання:** Керовані device clocks/network; не live employee data.

### AC-40 · KNB-14

**Канонічний сценарій:** Польові тести на фізичному Android та iPhone: на кожному ≥18 із 20 нормальних outdoor-виходів/повернень виявлено ≤5 хв, 0 хибних пауз за 2 год перебування. Окремо lock screen, permission denial, battery saver, reboot, OS stop, 30 хв offline: результат/затримка/батарея записані, пропуски UNKNOWN; невиконання порога блокує автоматичний режим.

**Наявний автоматизований scope:** Є conservative native vectors/lease guards; вони не є фізичним acceptance.

- Whole-scenario test у переглянутому наборі не знайдено; нижче є лише пов’язані source/harness entrypoints.
- [NativeTests.swift:33](../../erp/apps/mobile-ios/Tests/NativeTests.swift#L33) — `testLeaseRejectsExpiryAndNeverStartsGPSFromOFF`; [NativeTests.swift:39](../../erp/apps/mobile-ios/Tests/NativeTests.swift#L39) — `testLocationRequiresServerIssuedBoundLeaseAndGeofenceVersion` (XCTest source, не physical run).

**Source entrypoints:** [erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/TrackingService.kt:15](../../erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/TrackingService.kt#L15); [erp/apps/mobile-ios/Sources/LocationTracker.swift:6](../../erp/apps/mobile-ios/Sources/LocationTracker.swift#L6).

**Непокритий/непідтверджений сценарій:** FIELD_NOT_RUN:18/20 correct≤5min,0falseEXIT2h, background/kill/reboot/battery потребують виміряного protocol.

**Зовнішнє або ручне приймання:** Фізичні Android/iPhone, legal GPS approval, app/backend SHA та ground truth.

### AC-41 · KNB-15

**Канонічний сценарій:** TRIP_START атомарно закриває WORKING; ENTER destination лише пропонує arrival. Проїзд повз не починає роботу; ETA не потрапляє в timesheet.

**Наявний автоматизований scope:** Явні trip destination/purpose і separate arrival+work confirmation.

- [whatsapp-router.test.ts:120](../../erp/tests/whatsapp-router.test.ts#L120) — `arrival itself does not start work; arrival+work requires its own explicit selected preview` (CPU/explicit-double source).
- [whatsapp-router.test.ts:112](../../erp/tests/whatsapp-router.test.ts#L112) — `an explicit destination and original purpose create canonical travel; break and resume use trip commands` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273); [erp/packages/integrations/whatsapp-router.ts:12](../../erp/packages/integrations/whatsapp-router.ts#L12).

**Непокритий/непідтверджений сценарій:** Перевірити pass-by ENTER не запускає work і TRIP_START закриває previous work в одному full journey.

**Зовнішнє або ручне приймання:** Фізичний pass-by сценарій і працівницький UI.

### AC-42 · KNB-15/17

**Канонічний сценарій:** Trip з отриманням матеріалів і приватною паузою має неперекривні TRAVEL/SERVICE/BREAK; GPS off у BREAK; arrival не змінює stock без receipt.

**Наявний автоматизований scope:** Private break interval не має GPS; stock physical тільки після actual receipt.

- [operations.test.ts:131](../../erp/tests/operations.test.ts#L131) — `permitted late travel sample survives END; private stop and post-END points are rejected by event time` (CPU/explicit-double source).
- [resources.test.ts:87](../../erp/tests/resources.test.ts#L87) — `future orders are not physical and overdue inbound is not guaranteed; partial actual receipt is physical` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273); [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152).

**Непокритий/непідтверджений сценарій:** Потрібен один material-trip→SERVICE_TASK→BREAK→receipt journey; travel сама не створює stock movement.

**Зовнішнє або ручне приймання:** Warehouse receiver й дозволена tracking policy.

### AC-43 · KNB-15

**Канонічний сценарій:** Спільна поїздка 3 осіб по 30 хв і 20 км → 1,5 людино-год і 20 vehicle-km; відсутній трек → distance unknown/estimated, не вигаданий measured.

**Наявний автоматизований scope:** Trip samples без повного треку залишають distanceMeters:null; це чесний UNKNOWN.

- [operations.test.ts:131](../../erp/tests/operations.test.ts#L131) — `permitted late travel sample survives END; private stop and post-END points are rejected by event time` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273).

**Непокритий/непідтверджений сценарій:** SOURCE_GAP_CANDIDATE: знайдено passengerRole/vehicleTripId input, але не знайдено vehicle_trip writer/summary і3×30хв/one20km test у оглянутих domain/tests. Спочатку contract+focusedtest, не вигадувати дистанцію.

**Зовнішнє або ручне приймання:** Валідне джерело vehicle distance та право збирати маршрути; не потрібно для початку pure accounting tests.

### AC-44 · KNB-16

**Канонічний сценарій:** 7,5 approved hours × €20 = €150 gross preview; зміна ставки серед сегмента правильно його розбиває. На UI не названо net salary; імпортований net має source/version.

**Наявний автоматизований scope:** 7.5h×EUR20=150gross; effective-rate split; verified net import з independent approval.

- [payroll-v4.test.ts:28](../../erp/tests/payroll-v4.test.ts#L28) — `AC-44 7.5 approved hours at EUR20 produce EUR150 gross preview and never invent net payroll` (CPU/explicit-double source).
- [payroll-v4.test.ts:31](../../erp/tests/payroll-v4.test.ts#L31) — `splits an approved work segment exactly at a mid-segment effective wage change` (CPU/explicit-double source).
- [payroll-v4.integration.test.ts:45](../../erp/tests/payroll-v4.integration.test.ts#L45) — `verified monthly accountant import stores exact source facts, needs independent approval and survives replay without duplicated official documents` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152).

**Непокритий/непідтверджений сценарій:** Потрібен один API/UI/payroll report сценарій з rate change і authoritative accountant source.

**Зовнішнє або ручне приймання:** Офіційні net payroll дані надає бухгалтер, не AI/local inference.

### AC-45 · KNB-16

**Канонічний сценарій:** Net payable €1000; payout €400 записаний і звірений → залишок €600; €300 лише approved зменшує доступне до нової видачі до €300, але ще не є фактично виплаченим.

**Наявний автоматизований scope:** Payout reserve не overspends net, verified payroll вимагає distinct approver.

- [resources.test.ts:95](../../erp/tests/resources.test.ts#L95) — `concurrent prepared payouts cannot both exceed the period when approved serially` (CPU/explicit-double source).
- [payroll-v4.test.ts:42](../../erp/tests/payroll-v4.test.ts#L42) — `a verified net source still requires a different authorized payroll approver before any payout allocation` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152).

**Непокритий/непідтверджений сценарій:** Потрібен точний1000net−400recorded−300approved=300available у API/UI та concurrent refresh; сусідні amounts не автоматичний whole-AC proof.

**Зовнішнє або ручне приймання:** Підтвердження бухгалтерських net/виплат.

### AC-46 · KNB-16

**Канонічний сценарій:** Cash €400 recorded by accountant не ставить ACK_FULL; одержувач ACK_PARTIAL €300 → acknowledged €300 і disputed €100, без автоматичної повторної видачі. Повтор callback не множить записи.

**Наявний автоматизований scope:** Recorded400/ownstatement300/dispute100, без автоматичної повторної виплати.

- [payroll-v4.integration.test.ts:57](../../erp/tests/payroll-v4.integration.test.ts#L57) — `AC-46 recorded EUR400, own EUR300 statement and controlled reconciliation preserve EUR100 dispute without another payout` (є DATABASE_URL-gated cases у файлі).
- [payroll-v4.test.ts:50](../../erp/tests/payroll-v4.test.ts#L50) — `accountant transfer reconciliation never invents acknowledgment and a later own receipt reopens review` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152).

**Непокритий/непідтверджений сценарій:** Зв’язати signed receipt й UI disagreement; transfer reconciliation не може підміняти employee ACK.

**Зовнішнє або ручне приймання:** Особисте підтвердження employee та контроль reconciler.

### AC-47 · KNB-03/16

**Канонічний сценарій:** Чужий user/адміністратор натискає payout acknowledge — відмова; одночасні approvals не перевищують залишок; correction/reversal зберігає початкову операцію.

**Наявний автоматизований scope:** Actual SQL allocation race; чужий beneficiary ACK denied; reversal зберігає факти.

- [payroll-v4.integration.test.ts:51](../../erp/tests/payroll-v4.integration.test.ts#L51) — `AC-47 concurrent approved allocations cannot reserve EUR1400 from EUR1000 net` (є DATABASE_URL-gated cases у файлі).
- [payroll-v4.integration.test.ts:67](../../erp/tests/payroll-v4.integration.test.ts#L67) — `other employee and finance administrator cannot acknowledge/amend another beneficiary; read ACLs protect all new finance facts` (є DATABASE_URL-gated cases у файлі).
- [payroll-v4.integration.test.ts:73](../../erp/tests/payroll-v4.integration.test.ts#L73) — `a reconciled transfer reversed by a distinct authorized person keeps its original transfer/receipt/reconciliation evidence` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152).

**Непокритий/непідтверджений сценарій:** Потрібен complete correction/revoke/dispute journey із всіма finance ролями.

**Зовнішнє або ручне приймання:** Право approver/reconciler підтверджує компанія.

### AC-48 · KNB-17

**Канонічний сценарій:** Receive 10 л; ship 4 л → main6/transit4/site0; receive →6/0/4; usage1,5 і return0,5→main6,5/site2; total physical8,5, used1,5. Повтори не змінюють числа.

**Наявний автоматизований scope:** Canonical stock ledger receipt→ship→accept→use→return з фізичними/transit balances.

- [resources.test.ts:74](../../erp/tests/resources.test.ts#L74) — `T-STOCK-01 receipt -> ship -> accept -> use -> return preserves physical and transit quantities` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152).

**Непокритий/непідтверджений сценарій:** Потрібен UI/API numeric10→4→1.5→0.5 і SQL concurrency receipt replay на одному fixture.

**Зовнішнє або ручне приймання:** Фізичне приймання товару — окремий контроль.

### AC-49 · KNB-17

**Канонічний сценарій:** Usable4 л, чужий reserve1, demand5 → free3, shortage2; після reserve3 shortage лишається2. Потреба задачі й пов’язана заявка не подвоюються.

**Наявний автоматизований scope:** Partial reservation не рахує demand повторно.

- [resources.test.ts:86](../../erp/tests/resources.test.ts#L86) — `T-STOCK-02 a partial reserve does not count the same demand twice` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152).

**Непокритий/непідтверджений сценарій:** Потрібен exact usable4/other1/demand5/free3/shortage2 у procurement UI; весь stock алгоритм уже не є відсутнім модулем.

**Зовнішнє або ручне приймання:** Погоджена usable/blocked stock classification.

### AC-50 · KNB-17

**Канонічний сценарій:** Два паралельні reserves на останні2 л — сумарно ≤2; rejected offline issue не робить negative stock; batch blocked не входить у usable.

**Наявний автоматизований scope:** Race last stock та блокування expired/banned batches; realPG reservation conflict.

- [resources.test.ts:78](../../erp/tests/resources.test.ts#L78) — `two claims cannot reserve the same last two liters` (CPU/explicit-double source).
- [resources.test.ts:77](../../erp/tests/resources.test.ts#L77) — `blocked and expired batches cannot be reserved or used` (CPU/explicit-double source).
- [engine.integration.test.ts:78](../../erp/tests/engine.integration.test.ts#L78) — `concurrent stock reservations cannot reserve fourteen units from ten` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152).

**Непокритий/непідтверджений сценарій:** Потрібні dual usage/receive races і invariant audit усіх ledger write paths.

**Зовнішнє або ручне приймання:** Ручна inventory acceptance фактичних залишків.

### AC-51 · KNB-17

**Канонічний сценарій:** 5-літрова тара мінус2000 мл =3 л; л→кг без conversion відмова; return tool не є material usage; inventory count враховує рухи після cutoff.

**Наявний автоматизований scope:** Exact partial liters; density rejected; assets≠consumption; count зберігає пізні рухи.

- [resources.test.ts:73](../../erp/tests/resources.test.ts#L73) — `converts package and partial liters exactly, rejects density and fractional base units` (CPU/explicit-double source).
- [resources.test.ts:80](../../erp/tests/resources.test.ts#L80) — `inventory custody is not material consumption` (CPU/explicit-double source).
- [resources.test.ts:81](../../erp/tests/resources.test.ts#L81) — `stock count preserves subsequent movements and supports counted zero` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152).

**Непокритий/непідтверджений сценарій:** Потрібен mass/unit conversion matrix без implicit density плюс count cutoff на realPG.

**Зовнішнє або ручне приймання:** Затверджені одиниці/пакування та інвентаризація.

### AC-52 · KNB-17

**Канонічний сценарій:** Погоджена закупівля частково отримана → stock росте тільки на receipt qty; прострочене inbound не покриває гарантований дефіцит; GPS arrival не є receipt.

**Наявний автоматизований scope:** Partial actual receipt фізичний; overdue expected supply не guaranteed stock.

- [resources.test.ts:87](../../erp/tests/resources.test.ts#L87) — `future orders are not physical and overdue inbound is not guaranteed; partial actual receipt is physical` (CPU/explicit-double source).
- [resources.test.ts:75](../../erp/tests/resources.test.ts#L75) — `partial receive leaves true physical transit and records a discrepancy` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152).

**Непокритий/непідтверджений сценарій:** Потрібен PO→partial receipt→request readiness journey й GPS-no-receipt regression.

**Зовнішнє або ручне приймання:** Warehouse receipt facts і постачальник.

### AC-53 · KNB-18

**Канонічний сценарій:** Неприпустимий MIME/over-limit/шкідливий файл карантин або відмова; чужий media URL недоступний; при failed upload є retry, зміна/час не блокуються.

**Наявний автоматизований scope:** Checksum/MIME mismatch, max ingress та idempotent scoped provider media guard.

- [media-ingest.test.ts:10](../../erp/tests/media-ingest.test.ts#L10) — `refuses checksum mismatch and declared MIME mismatch` (CPU/explicit-double source).
- [v4-core-contracts.integration.test.ts:78](../../erp/tests/v4-core-contracts.integration.test.ts#L78) — `oversized actual controller media ingress writes neither PostgreSQL blobs/uploads nor outbox` (є DATABASE_URL-gated cases у файлі).
- [media-ingest.test.ts:12](../../erp/tests/media-ingest.test.ts#L12) — `retries the signed event as one private upload and refuses missing permission or changed payload` (CPU/explicit-double source).

**Source entrypoints:** [erp/apps/api/http.ts:1](../../erp/apps/api/http.ts#L1).

**Непокритий/непідтверджений сценарій:** Потрібні quarantine workflow, size/type matrix, interrupted upload і паралельний time action без блокування.

**Зовнішнє або ручне приймання:** Реальні camera/file formats та browser network loss acceptance.

### AC-54 · KNB-18/20

**Канонічний сценарій:** Client copy містить лише approved photos і очищені EXIF; оригінал/hash збережено; повтор того самого фото не створює повторний виконаний обсяг.

**Наявний автоматизований scope:** Actual sanitizer strips bytes metadata; approved copies separate; report photos bind immutable hash.

- [media-ingest.test.ts:9](../../erp/tests/media-ingest.test.ts#L9) — `checks provider checksum, decodes actual bytes and produces stripped private JPEG while preserving original` (CPU/explicit-double source).
- [resources.test.ts:164](../../erp/tests/resources.test.ts#L164) — `rejects unverified browser media and approves only a separate sanitized client copy` (CPU/explicit-double source).
- [resources.test.ts:220](../../erp/tests/resources.test.ts#L220) — `approved report photos are bound to immutable byte hashes before embedding` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152); [erp/apps/api/exporters.ts:7](../../erp/apps/api/exporters.ts#L7).

**Непокритий/непідтверджений сценарій:** Потрібні sanitized derivative review, EXIF canary, client redaction й duplicate original across reports на exact artifacts.

**Зовнішнє або ручне приймання:** Людина затверджує client-visible фото/редакцію.

### AC-55 · KNB-19

**Канонічний сценарій:** Один geo incident → ≤3 повідомлень працівнику/1 керівнику; після пояснення/Trip/END pending reminders скасовані; перезапуск scheduler не дублює доставку.

**Наявний автоматизований scope:** Real SQL geo cause створює3employee/1responsible schedules; restart dedup/cancellation.

- [notification-policy.integration.test.ts:64](../../erp/tests/notification-policy.integration.test.ts#L64) — `a canonical syntheticgeo incident produces3employee/1explicitresponsible schedules, deduplicates restart and cancels pending reminders atomically` (є DATABASE_URL-gated cases у файлі).
- [communications.test.ts:71](../../erp/tests/communications.test.ts#L71) — `configured three-attempt override dead-letters safe transient failures and resolution cancels reminders` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/communications.ts:215](../../erp/packages/domain/communications.ts#L215).

**Непокритий/непідтверджений сценарій:** Потрібна фактична timeline доставки й ownership change до/після resolve, без повторних notices.

**Зовнішнє або ручне приймання:** Офіційний відповідальний і allowed recipient/channel.

### AC-56 · KNB-05/19

**Канонічний сценарій:** Template rejected, provider timeout, opt-out і quiet hours мають видимий стан/дозволений fallback; UNKNOWN не показується як delivered; немає нескінченних retries.

**Наявний автоматизований scope:** Bounded1/5/15 retries, UNKNOWNнеповторюється, no fabricated delivery without receipt.

- [notification-policy.test.ts:31](../../erp/tests/notification-policy.test.ts#L31) — `confirmed safe failures retry after1/5/15minutes then dead-letter one logical notice and one decision` (CPU/explicit-double source).
- [notification-policy.test.ts:37](../../erp/tests/notification-policy.test.ts#L37) — `provider acceptance/delivery cannot be fabricated without a provider receipt, and failure classification cannot accompany success` (CPU/explicit-double source).
- [notification-policy.integration.test.ts:53](../../erp/tests/notification-policy.integration.test.ts#L53) — `network uncertainty isUNKNOWN with no retry, and a genuinely leased duplicate cannot reissue the send` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/packages/domain/communications.ts:215](../../erp/packages/domain/communications.ts#L215).

**Непокритий/непідтверджений сценарій:** Потрібен provider test для rejected/template/optout/quiet hours зі справжніми outcomes; mocks лише доводять наш state machine.

**Зовнішнє або ручне приймання:** Approved templates, consent і vendor test numbers/quota.

### AC-57 · KNB-20

**Канонічний сценарій:** Generate DE report із approved data; PDF/CSV/XLSX/portal мають однакові години/суми; у JSON/PDF немає payroll, margin, private reasons/GPS.

**Наявний автоматизований scope:** Report snapshot redacts payroll/GPS; CSV/XLSX exact totals+source SHA, PDF binds same source.

- [resources.test.ts:159](../../erp/tests/resources.test.ts#L159) — `T-REPORT-01 snapshot derives confirmed work/hours and fixed contractual price without payroll or GPS` (CPU/explicit-double source).
- [resources.test.ts:193](../../erp/tests/resources.test.ts#L193) — `XLSX round-trip and CSV preserve published exact totals, worker seconds and source SHA; PDF embeds the same source SHA` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152); [erp/apps/api/exporters.ts:7](../../erp/apps/api/exporters.ts#L7).

**Непокритий/непідтверджений сценарій:** Окремо real rendered portal/PDFDE readability і margin/coord canary у всіх output formats.

**Зовнішнє або ручне приймання:** Підтвердження client-report design та tax/report business policy.

### AC-58 · KNB-20

**Канонічний сценарій:** Publish v1, змінити профіль/адресу/дані, випустити v2: v1 байти/hash незмінні; supersession видимий; retry send не створює новий report number.

**Наявний автоматизований scope:** Published bytes архівуються один раз; correction нова версія, старий checksum збережено.

- [resources.test.ts:160](../../erp/tests/resources.test.ts#L160) — `T-REPORT-02 correction creates a new issued version and preserves old checksum and amount` (CPU/explicit-double source).
- [resources.test.ts:191](../../erp/tests/resources.test.ts#L191) — `each published version and format archives private bytes once and later downloads return identical evidence` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/resources.ts:152](../../erp/packages/domain/resources.ts#L152); [erp/apps/api/exporters.ts:7](../../erp/apps/api/exporters.ts#L7).

**Непокритий/непідтверджений сценарій:** Потрібен repeated send/publish номерів і immutablev1 download післяv2 у actual UI/API.

**Зовнішнє або ручне приймання:** Релізний artifact storage/restore receipt.

### AC-59 · KNB-21

**Канонічний сценарій:** На 360/768/1440 px пройти login, клавіатуру, форми, довгі DE-тексти, Back/Resume; немає обрізаних основних дій; offline/error states дозволяють відновлення.

**Наявний автоматизований scope:** Browser source tests: focus/Escape, long text, short viewport, login/activation/zoom/reduced motion.

- [responsive.spec.ts:230](../../erp/tests/responsive.spec.ts#L230) — `compact navigation traps focus, closes with Escape and recovers after rotation` (browser harness).
- [responsive.spec.ts:311](../../erp/tests/responsive.spec.ts#L311) — `employee chat sends long text and shift form remains reachable with a short viewport` (browser harness).
- [responsive.spec.ts:342](../../erp/tests/responsive.spec.ts#L342) — `login, activation, text enlargement and reduced motion remain usable` (browser harness).

**Source entrypoints:** [erp/apps/web/src/App.tsx:1](../../erp/apps/web/src/App.tsx#L1).

**Непокритий/непідтверджений сценарій:** BROWSER_NOT_RUN_THIS_REVIEW. Потрібно запустити360/768/1440, browser back/resume, offline/errors і новий template manager на finalSHA.

**Зовнішнє або ручне приймання:** Доступний дозволений browser engine; фізичні touch/accessibility checks окремо.

### AC-60 · KNB-21

**Канонічний сценарій:** Та сама approve/stock command з WhatsApp і web дає однакові permissions, БД і audit; параметри після preview змінені → старий confirm відхилено.

**Наявний автоматизований scope:** WA command receipt replay, current permission+snapshot guard; material wizard canonical units.

- [whatsapp-router.test.ts:104](../../erp/tests/whatsapp-router.test.ts#L104) — `lost response after actual command commit retries the same receipt instead of inventing failure or starting twice` (CPU/explicit-double source).
- [whatsapp-router.test.ts:106](../../erp/tests/whatsapp-router.test.ts#L106) — `current permissions/site revoke block an old confirmation` (CPU/explicit-double source).
- [whatsapp-router.test.ts:113](../../erp/tests/whatsapp-router.test.ts#L113) — `material wizard validates exact units, preserves reason, creates draft then explicitly submits` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/integrations/whatsapp-router.ts:12](../../erp/packages/integrations/whatsapp-router.ts#L12); [erp/apps/api/engine.ts:145](../../erp/apps/api/engine.ts#L145).

**Непокритий/непідтверджений сценарій:** Потрібен той самий approval/stock command одночасно через web іWA, із compareDB/audit.

**Зовнішнє або ручне приймання:** Live provider rendering не потрібен для synthetic cross-channel transaction test; live acceptance окремо.

### AC-61 · KNB-21/22

**Канонічний сценарій:** Зовнішній webhook з invalid signature/expired timestamp відхилений; 10 repeats source+event_id →1 effect; conflict mapping quarantine; client payload не задає company.

**Наявний автоматизований scope:** Exact raw HMAC,10replay1effect, company credential isolation й source-bound mapping.

- [integration-events.test.ts:29](../../erp/tests/integration-events.test.ts#L29) — `authenticates exact timestamp and bytes and rejects independent body/timestamp/key tampering` (є DATABASE_URL-gated cases у файлі).
- [integration-events.test.ts:47](../../erp/tests/integration-events.test.ts#L47) — `ten identical events produce one lead, one durable event and one business outbox effect` (є DATABASE_URL-gated cases у файлі).
- [integration-events.test.ts:78](../../erp/tests/integration-events.test.ts#L78) — `identical source/event/external IDs in separately credential-mapped companies cannot collide` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/apps/api/integration-events.ts:6](../../erp/apps/api/integration-events.ts#L6); [erp/packages/integrations/generic-events.ts:5](../../erp/packages/integrations/generic-events.ts#L5).

**Непокритий/непідтверджений сценарій:** Перевірити timestamp boundary/mapping quarantine activation у actual receiver HTTP; client sender сам не визначає company.

**Зовнішнє або ручне приймання:** Credential provisioning/rotation і approved mapping; не можна вбудовувати secrets у fixtures/docs.

### AC-62 · KNB-21

**Канонічний сценарій:** Сайтова заявка з реальним source/referral створює Lead один раз; просте відкриття QR/wa.me без повідомлення не створює вхідну розмову/marketing consent.

**Наявний автоматизований scope:** ERP upsert external identity, original confirmed source, repeated START dedup.

- [integration-events.test.ts:49](../../erp/tests/integration-events.test.ts#L49) — `upserts source/external identity without duplicate leads or changed lifecycle/review/consent` (є DATABASE_URL-gated cases у файлі).
- [assistant-tools.test.ts:194](../../erp/tests/assistant-tools.test.ts#L194) — `preserves the authenticated WhatsApp source recorded with the preview` (CPU/explicit-double source).
- [commerce.test.ts:174](../../erp/tests/commerce.test.ts#L174) — `repeat START returns open lead without contact-based identity merge` (CPU/explicit-double source).

**Source entrypoints:** [corporate-site/worker/api.ts:212](../../corporate-site/worker/api.ts#L212); [erp/apps/api/integration-events.ts:6](../../erp/apps/api/integration-events.ts#L6).

**Непокритий/непідтверджений сценарій:** BASELINE_SOURCE_GAP: site intake не переносив source/referral/locale/landing через durable bridge. Паралельний кандидат KN-U02/U07 ще не включено в proof цієї карти; після review додати справжній site→ERP journey.

**Зовнішнє або ручне приймання:** QR open ≠conversation/consent; реальну marketing consent не виводити з browser click.

### AC-63 · KNB-22

**Канонічний сценарій:** Idempotency key+той самий payload повертає первинну відповідь; key+інший payload →409; wrong expected_version не змінює агрегат; API schemas відповідають реалізації.

**Наявний автоматизований scope:** Atomic receipt, payload-changed409, expectedVersion guard.

- [engine.integration.test.ts:55](../../erp/tests/engine.integration.test.ts#L55) — `replayed command has one aggregate, receipt and outbox effect` (є DATABASE_URL-gated cases у файлі).
- [engine.integration.test.ts:62](../../erp/tests/engine.integration.test.ts#L62) — `reusing idempotency key with another input fails without a second effect` (є DATABASE_URL-gated cases у файлі).
- [engine.integration.test.ts:88](../../erp/tests/engine.integration.test.ts#L88) — `stale expected version changes neither current data nor revision history` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/apps/api/engine.ts:145](../../erp/apps/api/engine.ts#L145).

**Непокритий/непідтверджений сценарій:** Потрібна coverage всіх money/stock/time/approval endpoint schemas і retention receipt contract, не лише один command.

**Зовнішнє або ручне приймання:** Немає обов’язкового provider gate для local/PG regression.

### AC-64 · KNB-22/23

**Канонічний сценарій:** Rate-limit AI/media load не заважає START/END; SQL/XSS/SSRF і cross-tenant tests не дають витоку; logs/artifacts не містять secrets.

**Наявний автоматизований scope:** SSRF address/DNS pinning, credential company guard, AI budgetfailclosed.

- [integration-webhook-runtime.test.ts:45](../../erp/tests/integration-webhook-runtime.test.ts#L45) — `rejects private/reserved/alias address %s` (є DATABASE_URL-gated cases у файлі).
- [integration-webhook-runtime.test.ts:47](../../erp/tests/integration-webhook-runtime.test.ts#L47) — `blocks mixed public/private DNS answers and credential company mismatch before transport` (є DATABASE_URL-gated cases у файлі).
- [assistant-governance.test.ts:83](../../erp/tests/assistant-governance.test.ts#L83) — `fails closed on mismatched currency, corrupt cost or token data` (CPU/explicit-double source).

**Source entrypoints:** [erp/apps/api/http.ts:1](../../erp/apps/api/http.ts#L1); [erp/packages/integrations/generic-events.ts:5](../../erp/packages/integrations/generic-events.ts#L5).

**Непокритий/непідтверджений сценарій:** Потрібні exact-source SQL/XSS/CSRF/SSRF matrix, secret/artifact scans і load isolation AI/media vs time. Ці3тести не є повним pentest.

**Зовнішнє або ручне приймання:** Для authorized security scan/load потрібне ізольоване середовище; production не зачіпати.

### AC-65 · KNB-23

**Канонічний сценарій:** Retention job видаляє прострочені GPS та похідні переклади/індекси; конкретний legal hold зберігає тільки свій scope; subject export не включає чужі дані.

**Наявний автоматизований scope:** Actual erasure current/history/copies; late legalhold gate; raw GPS expiry не знищує authority/history.

- [privacy-erasure.integration.test.ts:58](../../erp/tests/privacy-erasure.integration.test.ts#L58) — `actually removes private bytes and every mapped source/translation/history/receipt/webhook copy atomically while preserving audit and payroll` (є DATABASE_URL-gated cases у файлі).
- [privacy-erasure.integration.test.ts:79](../../erp/tests/privacy-erasure.integration.test.ts#L79) — `revalidates a legal hold committed after preview before any mutation` (є DATABASE_URL-gated cases у файлі).
- [device-gps-privacy-v4.integration.test.ts:56](../../erp/tests/device-gps-privacy-v4.integration.test.ts#L56) — `real dedicated raw-point expiry removes only expired coordinates and preserves lease/review/cursors and immutable metadata history` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/packages/domain/governance.ts:6](../../erp/packages/domain/governance.ts#L6); [erp/scripts/restore-db.mjs:1](../../erp/scripts/restore-db.mjs#L1).

**Непокритий/непідтверджений сценарій:** Повний DSAR включає exports/derivatives/backups/provider/device виконання та lawful retention; repository test не означає всі downstream копії стерто.

**Зовнішнє або ручне приймання:** Legal approvals/holds і незалежний current erasure ledger при restore.

### AC-66 · KNB-23

**Канонічний сценарій:** Test labor profile показує порушення перерв/лімітів, але не вигадує BREAK і не стирає overtime. Production без approved GPS/retention/tax config блокує лише залежні процеси з причиною.

**Наявний автоматизований scope:** Read-only labor advisory, approved locked corrections; production всі required legal categories.

- [working-time-advisory.test.ts:166](../../erp/tests/working-time-advisory.test.ts#L166) — `reads fresh recorded shift facts without writes, private reasons, pay or GPS payloads` (CPU/explicit-double source).
- [working-time-advisory.test.ts:173](../../erp/tests/working-time-advisory.test.ts#L173) — `applies approved locked-period corrections once and keeps raw facts, payroll and adjustment provenance intact` (CPU/explicit-double source).
- [production-readiness-v4.test.ts:12](../../erp/tests/production-readiness-v4.test.ts#L12) — `requires all seven recorded categories with current legal bounds and independent approval` (CPU/explicit-double source).

**Source entrypoints:** [erp/packages/domain/operations.ts:273](../../erp/packages/domain/operations.ts#L273).

**Непокритий/непідтверджений сценарій:** Потрібне юридично підтверджене policy/exception coverage та UI no-invented-break/overtime scenario.

**Зовнішнє або ручне приймання:** Юрист/компанія затверджують законні правила; тест не є legal opinion.

### AC-67 · KNB-23

**Канонічний сценарій:** Виміряти зазначене навантаження 15 хв: p95/p99, errors і queue lag відповідають цілям; acknowledged commands у БД всі; PDF3 concurrent не блокує core API.

**Наявний автоматизований scope:** Load-report verifier рахує tail і відкидає missing acknowledgedeffects/smoke.

- [v4-load-metrics.test.ts:11](../../erp/tests/v4-load-metrics.test.ts#L11) — `permits only a complete full workload satisfying every threshold` (є DATABASE_URL-gated cases у файлі).
- [v4-load-metrics.test.ts:13](../../erp/tests/v4-load-metrics.test.ts#L13) — `one missing acknowledged DB effect fails even with fast HTTP and no5xx` (є DATABASE_URL-gated cases у файлі).
- [v4-load-metrics.test.ts:17](../../erp/tests/v4-load-metrics.test.ts#L17) — `smoke evidence stays partial even if all full-target arithmetic would pass` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/scripts/v4-load.mts:1](../../erp/scripts/v4-load.mts#L1).

**Непокритий/непідтверджений сценарій:** LOAD_NOT_RUN_THIS_REVIEW: окремий15min100sessions10commands/s protocol; runbook прямо залишає signed inbound/provider latency/3PDF під core load окремими. Не видавати metric-test за benchmark.

**Зовнішнє або ручне приймання:** Ізольований ресурсний budget, finalized workload і дозволені synthetic transport/providers.

### AC-68 · KNB-23/24

**Канонічний сценарій:** Restore у clean environment в межах RPO/RTO; звірені counts/checksums/snapshots; replay outbox не створює повторних виплат, рухів або tasks.

**Наявний автоматизований scope:** Restore failsclosed без незалежного erasure ledger/company coverage.

- [worker-retention.test.ts:235](../../erp/tests/worker-retention.test.ts#L235) — `production restoration requires an independent current ledger before touching the empty destination` (є DATABASE_URL-gated cases у файлі).
- [worker-retention.test.ts:249](../../erp/tests/worker-retention.test.ts#L249) — `all restored companies require coverage by the authoritative current ledger` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/scripts/restore-db.mjs:1](../../erp/scripts/restore-db.mjs#L1).

**Непокритий/непідтверджений сценарій:** Потрібен clean restore з hashes/counts, actual RPO/RTO і replay no-double payout/stock/task на final backup artifact.

**Зовнішнє або ручне приймання:** Окреме restore середовище, дозволені backup keys/storage; не production mutation.

### AC-69 · KNB-24

**Канонічний сценарій:** Migration на копії, відкат сумісного коду, restart worker/API успішні; `/version`=artifact tested SHA; відсутність AI не блокує startup ядра.

**Наявний автоматизований scope:** Bootstrap без synthetic owner bypass; unsafe GPSstorage блокує worker start.

- [identity.test.ts:75](../../erp/tests/identity.test.ts#L75) — `offline bootstrap closes after one owner and creates no wildcard or unapproved financial rights` (CPU/explicit-double source).
- [worker-retention.test.ts:92](../../erp/tests/worker-retention.test.ts#L92) — `unsafe legacy GPS storage prevents service account creation and all business writes` (є DATABASE_URL-gated cases у файлі).

**Source entrypoints:** [erp/apps/api/database.ts:7](../../erp/apps/api/database.ts#L7).

**Непокритий/непідтверджений сценарій:** Потрібні копія БД→міграція→backward compatibility/rollback→worker/APIrestart і exactSHA artifacts; source policy tests не є migration drill.

**Зовнішнє або ручне приймання:** Погоджений release window та rollback target, без автоматичного prod deploy.

### AC-70 · KNB-14/24

**Канонічний сценарій:** Android install/update зі стабільним сертифікатом зберігає дані й правильний HTTPS origin; iOS встановлюється дозволеним підписаним каналом; фізичні permissions/sync перевірені.

**Наявний автоматизований scope:** Native simulator wrapper відмовляє без actual XCTest/правильного booted destination.

- [native-ios-simulator.test.ts:20](../../erp/tests/native-ios-simulator.test.ts#L20) — `fails without XCTest after two inventory timeouts` (CPU/explicit-double source).
- [native-ios-simulator.test.ts:32](../../erp/tests/native-ios-simulator.test.ts#L32) — `rejects the wrong UUID or runtime after the final inventory retry` (CPU/explicit-double source).
- [NativeTests.swift:33](../../erp/apps/mobile-ios/Tests/NativeTests.swift#L33) — `testLeaseRejectsExpiryAndNeverStartsGPSFromOFF`; [NativeTests.swift:39](../../erp/apps/mobile-ios/Tests/NativeTests.swift#L39) — `testLocationRequiresServerIssuedBoundLeaseAndGeofenceVersion` (XCTest source, не physical run).

**Source entrypoints:** [erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/TrackingService.kt:15](../../erp/apps/mobile-android/app/src/main/java/de/knaba/mobile/TrackingService.kt#L15); [erp/apps/mobile-ios/Sources/LocationTracker.swift:6](../../erp/apps/mobile-ios/Sources/LocationTracker.swift#L6).

**Непокритий/непідтверджений сценарій:** SIGNED_DEVICE_NOT_RUN: compile/simulator/debug не доводять signed install/update, data retention,origin guard і physical sync.

**Зовнішнє або ручне приймання:** Company Android keystore/Apple team+provisioning, фізичні телефони та release builds.

### AC-71 · KNB-01/24

**Канонічний сценарій:** Live дозволений test flow: новий клієнт→quote→crew→task→shift/trip→material/photo→review→DE report→payroll record→employee receipt. Перевірити UI+API+БД на тому самому SHA; реальні test numbers/devices зазначені без секретів.

**Наявний автоматизований scope:** Жоден isolated unit/PG/browser test не замінює wholecompany live acceptance.

- Whole-scenario test у переглянутому наборі не знайдено; нижче є лише пов’язані source/harness entrypoints.

**Source entrypoints:** [scripts/release-readiness.mjs:2](../../scripts/release-readiness.mjs#L2).

**Непокритий/непідтверджений сценарій:** LIVE_NOT_RUN: той самий app/backendSHA, дозволені numbers/devices, full company scenario з role/source/finance/stock/report evidence.

**Зовнішнє або ручне приймання:** Компанія, test participants, renewed staging authorization/provider MFA/квота; production не запускати без окремого дозволу.

### AC-72 · KNB-24

**Канонічний сценарій:** Traceability містить усі KNB/AC, actual results і evidence; docs/roadmap/memory синхронізовані; company handover підтверджено окремо; FAILED/NOT_RUN/BLOCKED_EXTERNAL не названо PASSED.

**Наявний автоматизований scope:** Release gate і canonical registry відділяють структурну повноту evidence від product acceptance.

- Whole-scenario test у переглянутому наборі не знайдено; нижче є лише пов’язані source/harness entrypoints.
- [release-readiness.test.mjs:20](../../scripts/release-readiness.test.mjs#L20) — `blocked or omitted acceptance remains blocked`; [release-readiness.test.mjs:37](../../scripts/release-readiness.test.mjs#L37) — `complete structurally valid receipt passes syntax policy only` (policy harness, не product acceptance).

**Source entrypoints:** [scripts/release-readiness.mjs:2](../../scripts/release-readiness.mjs#L2).

**Непокритий/непідтверджений сценарій:** DELIVERY_NOT_READY: всі72рядки канонічногоCSV наразіNOT_RUN; заповнювати лише на wholecriterion proof. Повний handover/ZIP/checksums/docs і unresolvedgates потрібні для READY.

**Зовнішнє або ручне приймання:** Приймання замовником та передача секретів окремим захищеним каналом; автоматично замовнику не надсилати.

## Правила заповнення фінальних receipts

Для кожного wholecriterion записати `tested_sha`, artifact/build hash, environment, точні case/protocol IDs, actual result, immutable evidence path+SHA256, UTC timestamp і exit code. Зберігати failed/blocked/notrun окремо. Не прирівнювати кількість unit tests, workflow success або існування artifact до company acceptance. Спочатку independent review змін і execution конкретного scope, потім залежний крок.

Для source-only висновків можна посилатися на цю карту; для PASS потрібні фактичні logs/artifacts. Нові source changes інвалідовують лише відповідний acceptance scope, але потребують явного impact analysis; документація не ретегує старий runtime.

## Provenance цієї інвентаризації

- Canonical CSV SHA256: `57a0503fdb285fc709b006d4434a220e575eb0d00f8977fac94dd4ba633ad87d`.
- Повний baseline source-audit SHA256 до wrapper note: `8e7c09ebdc2cf0864d7f7cea6f1d4d70221c9a83448090ebb2d38856d59f9342`.
- Declaration index створено через TypeScript AST з наявних test sources; literal case titles звірено з поточними файлами під час генерації. Це search aid, не виконання тестів. Динамічні nonliteral назви не означають відсутність відповідних тестів.
- Цей документ не змінює canonical CSV, runtime, build outputs, legal/provider gates або GitHub acceptance. Повний source review наступних паралельних bridge/identity змін належить окремим receipts.
