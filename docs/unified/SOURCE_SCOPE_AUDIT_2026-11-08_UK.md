> **Контекст копії, 2026-11-08.** Нижче дослівно збережено read-only source audit baseline **`7e448c6024718b932b79eeb2d38f3e3af672a1ae` (`7e448c6`)**. Після цієї бази root готує TTL24 correction (включно з legacy invitation activation cap), а окрема команда — durable site→ERP intake. Ці подальші зміни не пройшли повторний незалежний review автором цього audit; historical finding TTL48 не можна автоматично називати чинним дефектом нового кандидата. Повідомлення root про28identity tests не є execution receipt цього документа. Для поточної evidence-черги див. [AC map](AC_EVIDENCE_MAP_2026-11-08_UK.md).
>
> SHA256 оригінального audit body: `8e7c09ebdc2cf0864d7f7cea6f1d4d70221c9a83448090ebb2d38856d59f9342`. Внутрішні посилання у форматі `path:line` відносні до repo baseline. Копіювання не змінює статусів acceptance та не сертифікує subsequent source/build/runtime.

# KNABA: наступний безпечний source scope — identity federation та V4 acceptance

## Висновок

Поточний сайт та ERP мають власні реалізовані authentication/authorization системи. KN-U09 потребує сумісного зв’язку між цими системами, а не нового універсального login stack. У переглянутих runtime-файлах немає корпоративного site→ERP federation issuer/subject contract, обміну одноразовими доказами, durable link/revocation або федеративної сесії. Наявний OIDC зв’язує provider identity лише з локальним VPS account.

Найменший завершуваний наступний продуктово корисний slice — KN-U02/U07: disabled-by-default durable intake від corporate-site до вже реалізованого ERP integration receiver. Для анонімної заявки достатньо окремого серверного credential і затвердженого company/service/owner mapping; цей канал не повинен створювати ERP user, membership чи сесію. KN-U09 можна паралельно специфікувати й тестувати на синтетичних акаунтах, але застосування federation до приватних даних/бізнес-команд потребує окремого acceptance.

Конкретна невелика source-прогалина V4 виявлена: ERP `user.invite` допускає TTL до 48 годин, тоді як канонічна V4 задає 24 години. Це не provider gate. Потрібні focused failing-before/fixed-after tests і рішення щодо вже виданих довших запрошень; не переписувати історію або live дані під час такого source виправлення.

## Межі перевірки

- Read-only source review; під час цієї інвентаризації тести, браузери, провайдери та production не запускалися. Репозиторій і build outputs не змінювались цим агентом.
- Чинні GitHub/SQL результати веде root окремо; цей документ не присвоює їм новий PASS і не ретегує історичні receipts.
- Пошук охопив runtime `corporate-site/worker`, `corporate-site/vps`, `erp/apps/api`, `erp/packages/domain`, `erp/packages/integrations`, канонічні specs/registry та наведені plans. Негативний результат пошуку federation доповнено читанням реальних session, OIDC, identity і schema entrypoints.
- Попередній template cross-layer review на `957e3cc3e24a42d12f5c1c89b88a5d943cc809f2`: блокуючих P0/P1 у перевіреному owner/upload/preview/publish/rollback scope не виявлено; browser acceptance BLOCKED. Власний UI мав integration review, що не є незалежним review авторства.

## 1. Реалізоване, яке слід повторно використовувати

Усі шляхи нижче відносні до KNABA repo; номери рядків прив’язані до source snapshot у кінці документа.

| Частина | Фактичний контракт | Доказ у source |
| --- | --- | --- |
| VPS credentials | Salted scrypt; локальний випадковий stable user ID; disabled перевіряється. | `corporate-site/vps/auth.mjs:11`, `:19`, `:49` |
| VPS sessions | 32 random bytes; у SQLite лише hash; 12h lifetime; HttpOnly/Secure/SameSite=Strict; current disabled/expiry перевіряється під час читання. | `corporate-site/vps/auth.mjs:54`, `:62`, `:76` |
| VPS password rotation | Перевірка поточного пароля, CAS і видалення всіх попередніх сесій в одній транзакції. | `corporate-site/vps/auth.mjs:84`, `:100` |
| Site operator authority | Owner address береться з server config і звіряється з реальним local account; developer додатково потребує active staff grant. Це не ERP OWNER grant. | `corporate-site/vps/admin-access.mjs:3` |
| Site invitations | Owner-attested recipient, випадковий hash-only one-use token; повторно перевіряється issuer; activation створює pending profile, не approved роль. Коментар прямо відділяє owner assertion від доказу mailbox ownership. | `corporate-site/vps/account-invite.mjs:37`, `:59`, `:67`, `:91` |
| Site OIDC | Pinned provider, authorization code+PKCE+nonce/state; signature/audience/issuer/expiry/email verification; локальна `(issuer,subject)→vps user` прив’язка; збіг email не зливає існуючі акаунти автоматично. | `corporate-site/vps/oidc.mjs:55`, `:95`, `:151`, `:164`; `corporate-site/vps/database.mjs:94` |
| Site request identity | VPS відкидає caller identity headers, створює trusted headers із власної сесії; Worker перераховує pending/approved/suspended і role за current profile. | `corporate-site/vps/server.mjs:853`, `:857`; `corporate-site/worker/api.ts:51` |
| ERP credentials/session | Company-bound PostgreSQL sessions; current actor завантажується заново; окремі cookie/bearer-device paths, CSRF для cookie mutations. | `erp/apps/api/auth.ts:11`, `:41`, `:42`, `:43`; `erp/infra/001_init.sql:25` |
| ERP MFA | TOTP replay counter, mandatory privileged production login; fresh MFA <=10 хв для high-risk commands. VPS session не має сумісного MFA evidence field. | `erp/apps/api/auth.ts:12`, `:28`, `:45`; `erp/apps/api/engine.ts:111` |
| ERP identity administration | Guarded roles, last-owner/self-escalation protection; invite/activate; role replacement/disable/password/MFA changes revoke sessions; disabled users’ devices revoked. | `erp/packages/domain/identity.ts:15`, `:21`, `:71`, `:73`, `:74`, `:75`, `:76`, `:82` |
| ERP live authority | Permission-specific company/site/customer/warehouse scopes; customer memberships входять у authority fingerprint; SSE polls authority кожні 3s і має revoke event. Реальний <=60s acceptance цим читанням не підтверджений. | `erp/apps/api/engine.ts:43`, `:145`; `erp/apps/api/authority-fingerprint.ts:24`, `:34`; `erp/apps/api/http.ts:72`, `:93` |
| Worker/partner onboarding | Human review переходить у AWAITING_IDENTITY_PROOF, не створює employee/partner і не видає ролей. Цю межу слід зберегти. | `erp/packages/domain/identity.ts:39`, `:53`, `:59` |
| Machine integration intake | Credential→company selection, HMAC exact bytes, approved active source/service/owner mapping, transactional idempotent lead apply/quarantine. | `erp/apps/api/http.ts:43`, `:211`; `erp/apps/api/integration-events.ts:8`; `erp/packages/domain/integrations.ts:10`, `:27`, `:108` |

Наявні тести для повторного використання: `erp/tests/identity.test.ts:29`–`:41`, `erp/tests/authority-fingerprint.test.ts`, `erp/tests/authority-fingerprint.integration.test.ts`, `erp/tests/partner-registration-review.test.ts`, `corporate-site/vps/oidc.test.mjs:76`, `corporate-site/vps/auth-hardening.test.mjs`. Тут зафіксовано наявність перевірок, а не новий результат їх виконання.

## 2. Критичні контракти, яких бракує для KN-U09

1. **Federation trust boundary.** Потрібен versioned server-configured issuer/site-instance identity із різними trust domains для test і production. Source subject походить із перевіреної сесії сервера. Browser не задає issuer, company, ERP role або scope. Local provider OIDC subject сам не є ERP membership.
2. **Durable principal link.** Треба явний versioned, revocable зв’язок `(source issuer, source subject, ERP company, ERP user)`, uniqueness/conflict policy, lifecycle та audit. Немає підстав прирівнювати локальні VPS IDs, ERP user IDs, email чи Telegram sender IDs.
3. **Two-sided proof/approval.** Одноразовий короткочасний challenge має бути прив’язаний до обох перевірених сесій, audience, конкретного company/user/subject і transaction nonce. Hash-only зберігання, consume-once, expiry, replay/concurrent handling, CSRF і актуальна authority перевірка безпосередньо перед commit. Не покладатися лише на клік owner «identity verified».
4. **Step-up boundary.** Site password login чи generic OIDC callback не можуть встановлювати ERP `mfaVerified=true`. Для привілейованих link/role/sensitive operations потрібна чинна ERP MFA policy та доказ її свіжості. Existing ERP authentication варто залишити єдиним авторитетом для таких дій у першому slice.
5. **Current membership and revocation.** Link не є role grant. Кожний захищений read/command повторно звіряє active link, current ERP user, current company/site/customer membership і власний source access status. Suspend/unlink/logout/password rotation/role replacement мають закривати відповідні delegated sessions, queued capabilities і streams; недоступна revocation перевірка має давати fail-closed.
6. **Recovery and account changes.** Email rename/reuse, lost source account, changed provider subject, deleted/disabled ERP account та recovery потребують явного re-link workflow. Не робити silent relink або email fallback. Реальні recovery channel/provider налаштування — окремий зовнішній gate.
7. **No capability widening.** Site→ERP lead bridge не передає payroll/GPS, employee assignment, stock effects, marketing consent або права. Person federation не повинна перетворювати service credential на безумовний user impersonation.

### Назви ролей не є автоматичним mapping

| Site role | ERP обсяг, який потрібно підтвердити окремо |
| --- | --- |
| owner | Конкретний active ERP user із дозволеними OWNER/administration правами та MFA; локальний owner flag цього не доводить. |
| admin | Конкретні ERP operational roles і site/customer scopes; blanket ERP OWNER неприпустимий. |
| bauleiter | INTERNAL_BAULEITER та EXTERNAL_BAULEITER мають різний доступ; потрібен явний вибір і scope, а не порівняння назв. |
| worker | Existing ERP user/employee relationship, active membership і призначення; site profile сам не створює employee. |
| client | ERP CLIENT плюс конкретні customer memberships/site scopes; email не визначає customer ID. |
| partner | У canonical ERP role list немає простого PARTNER alias. Існує onboarding interest; business relationship має бути визначений до видачі прав. |

Джерела: `corporate-site/worker/api.ts:51`, `erp/packages/domain/identity.ts:7`, `:39`, `erp/apps/api/authority-fingerprint.ts:34`; canonical `erp/KNABA_DE_TARGET_SPEC.md:68`–`:72`.

## 3. Підтверджена source-розбіжність TTL

- Canonical V4: `erp/KNABA_DE_TARGET_SPEC.md:70` — invitation TTL 24h, token >=128 bits, hash in DB.
- Current ERP source: `erp/packages/domain/identity.ts:71` — `expiresHours.min(1).max(48).default(24)`.
- Existing expiry test `erp/tests/identity.test.ts:38` перевіряє 1h invitation після 2h; він не покриває відхилення 25–48h.
- Це статично підтверджена невідповідність V4 (AC-05 scope), без заяви про виконаний runtime exploit або production impact.
- Мінімальне виправлення: upper bound24 плюс 24h boundary/replay/concurrency tests. Для stored legacy invites із довшим строком потрібен явний fail-closed policy/renewal plan; не переписувати історичні audit записи і не виконувати масову live mutation без дозволу.

## 4. Site→ERP intake як мінімальний наступний implementation

Existing `corporate-site/worker/api.ts:211`–`:239` атомарно зберігає `cleaning_requests` та audit, але не ERP outbox (`:235`). Allowlist `:213` не містить source/referral/landing/locale provenance. Публічний response має лишитися сумісним: receipt про локальне отримання заявки не означає ERP delivery.

Рекомендована завершувана межа:

1. Additive durable outbox row у тій самій transaction/batch з intake; immutable event identity/body/hash, server-approved mapping, default-disabled dispatch, без автоматичного historical backfill.
2. Reuse `POST /api/v1/integrations/:source/events`, а не proposed `/internal/v1/leads`. Envelope: `schema_version: "1"`, `event_type: "lead.upsert"`, source/event_id/external_id/occurred_at/payload. Signature: timestamp + `.` + exact raw body; timestamp можна оновлювати при retry, identity/body мають залишатися тими самими. Credential source/key→company вибирає сервер.
3. Bounded lease dispatcher, timeout/retry/UNKNOWN reconciliation, explicit APPLIED/QUARANTINED/blocked states. ERP `IntegrationAcceptance` у `integrations.ts:98` повертає APPLIED або QUARANTINED; довільний 2xx не є успіхом застосування Lead. Human quarantine review уже є у `:75`–`:94`.
4. Recheck current mapping/credential/revocation перед відправленням; не обходити ERP mapping activation/fresh-MFA gate. Unknown source/service mapping зупиняє delivery із причиною.
5. Реальний synthetic SQLite→PostgreSQL E2E: repeated client intake, crash після local commit, timeout після ERP commit, parallel retries, changed payload key, cross-company, disabled credential, stale mapping, owner/service revoke, quarantine, restart, migration upgrade і rollback preserving outbox. Ніяких реальних contacts/provider calls.

Після цього мінімальний KN-U09 slice може додати revocable link lifecycle між двома вже автентифікованими синтетичними principals без SSO-session minting і без доступу до нових бізнес-даних. Його acceptance має довести isolation/proof/replay/revoke; наступний окремий slice підключає protected views/commands через наявний ERP policy engine.

## 5. Історичні кандидати і застарілі plans

`docs/unified/GITHUB_RECONCILIATION_2026-10-30_UK.md:62` прямо фіксує schema/composition collisions у:

- assistant bridge `fa9ea67b888571657d9b27fb7c56bfb30ee15d73`;
- site intake bridge `d6ae01984569c7d4ced586cca9741976b03ffb4b`.

Обидва `git cat-file -t <SHA>` під час цього read-only audit повернули “could not get object info”. Точні patch bodies недоступні локально; їхню безпечність, актуальні схеми або tests тут не перевірено. Мережеве завантаження не виконувалось. Перед reuse потрібен окремий exact-object readback, diff до поточного schema/runtime та additive port; blind cherry-pick не обґрунтований.

`docs/unified/INTEGRATION_CONTRACT.md:3` маркує API як PROPOSED; його `/internal/v1/leads` та newline HMAC не відповідають уже реалізованому generic receiver (`generic-events.ts:34`). Документ слід зберегти як historical proposal й доповнити актуальним executable contract, а не створювати другий receiver для відповідності старому тексту.

`erp/docs/planning/V4_IMPLEMENTATION_STATUS.json:55`, `:237` та roadmap зберігають старі D07 remaining gaps. Чинний код уже містить `order.link_site` (`commerce.ts:415`), `crew_assignment.decline` (`:434`), `crew_assignment.expire` (`:442`) і report remaining-scope (`report-remaining-scope.ts:11`). Не перетворювати старий backlog на дубль реалізації; спочатку зіставити тести й фактичний acceptance.

## 6. V4 acceptance: що означає поточний реєстр

Машинне читання канонічного CSV показало 72 рядки AC-01…AC-72, усі зі status NOT_RUN; заповнених evidence/tested-SHA/environment/result полів немає. Це факт стану реєстру. Наявні module/source/test receipts потребують поелементного зіставлення; загальні totals CI не закривають whole criterion.

Пріоритетна актуалізація:

| IDs | Джерела для повторного використання | Що ще прийняти |
| --- | --- | --- |
| AC-02/03/04/05 | Existing ERP auth, identity, scopes, revocation/SSE і їхні тести | Exact-source SQL + cross-system link/role-revocation scenarios; TTL24 discrepancy; необхідний actual stream/browser proof. |
| AC-18 | Current customer membership/visibility engine | Current direct URL/API/export negatives після federation, без витоку іншого customer/site. |
| AC-61/62/63 | Generic signed integration receiver, current idempotency/receipt engine | New site outbox→realPG transport/provenance, crash/replay/quarantine/current mapping tests. |
| AC-59/60 | Existing web/offline/UI/common command handling | Браузерні widths/keyboard/recovery; реальна channel parity у дозволеному середовищі. |
| AC-67/68/69 | Existing load/restore/migration/worker harnesses | Виміряні timing/loss/RPO/RTO та exact artifact migration/restart; provider/device/load частини мають окремі межі. |
| AC-40/70/71/72 | Native source, existing release policy, historical receipts | Physical devices/company signing/live allowed E2E/UAT/traceability/handover. Вони не закриваються збіркою або цим review. |

Залишок AC потребує актуального поелементного code/test review. Цей identity/bridge audit не заявляє, що решта критеріїв реалізована або відсутня.

## 7. Зовнішні умови і робота, яку можна виконувати зараз

**Можна виконувати ізольовано зараз:** source contracts, additive migrations, TTL fix, durable bridge, link lifecycle, negative tests, real synthetic SQL, current acceptance mapping, docs/runbooks і independently reviewed release candidate. Реальні provider credentials для цих тестів не потрібні.

**Потрібне окреме фактичне підтвердження для real activation:** уповноважені ERP/site accounts і межі компанії; operator-managed credentials/issuer origins; account recovery/email/OIDC provider configuration; дозволені test recipients, provider quota/cost/consent; privacy/retention/legal basis; production/backfill permissions; offsite restore, load environment, physical Android/iOS/signing, browser/assistive-tech/UAT. Наявність чи відсутність реальних секретів цим audit не перевірялася.

Production merge/deploy, paid providers, реальні messages, account enrollment чи live-data migration не виконувалися.

## 8. Повний інвентар canonical AC statuses

Короткі назви нижче — навігація до початкових criterion steps. `NOT_RUN` перенесено дослівно з CSV; це не новий тестовий результат.

| Criterion | Requirement refs | Canonical status | Початок acceptance requirement |
| --- | --- | --- | --- |
| AC-01 | KNB-01/02 | NOT_RUN | Розгорнути clean test environment із lockfile/міграцій; API, worker, web і БД стартують; production boots… |
| AC-02 | KNB-03 | NOT_RUN | Для кожної ролі виконати одну дозволену й одну заборонену команду через API; чужі company/site IDs, expor… |
| AC-03 | KNB-03/22 | NOT_RUN | Відкликати роль між створенням callback і натисканням; старі кнопки/queued translation/download не працюю… |
| AC-04 | KNB-03/04 | NOT_RUN | BOT_ADMIN намагається призначити собі OWNER; власник — видалити останнього OWNER; автор — погодити власну… |
| AC-05 | KNB-04 | NOT_RUN | Використати одноразове запрошення повторно, після TTL і з чужого контакту: доступ не створено; MFA/reauth… |
| AC-06 | KNB-04/06 | NOT_RUN | Українське перше повідомлення відкриває UK-діалог; явна PL лишається після цитати DE/«OK»; повтор START п… |
| AC-07 | KNB-04/21 | NOT_RUN | Web→WhatsApp transfer прив’язує ту саму гостьову сесію після двостороннього підтвердження; stolen/expired… |
| AC-08 | KNB-05 | NOT_RUN | Невірний POST signature не створює inbox; валідний повтор webhook 10 разів дає 1 логічний ефект; при DB o… |
| AC-09 | KNB-05/19 | NOT_RUN | На 23:59 після останнього user message вільний текст дозволений; на ≥24:00 — тільки approved template; re… |
| AC-10 | KNB-06 | NOT_RUN | Новий клієнт проходить qualification, quote, acceptance; у БД є contact, source, виміри з джерелами, одна… |
| AC-11 | KNB-06/07 | NOT_RUN | Запит непідтвердженої послуги/ціни або обов’язкового огляду створює review/site visit; AI не видає остато… |
| AC-12 | KNB-06 | NOT_RUN | «Потрібна людина» переводить у HUMAN_QUEUED; два оператори claim одночасно — один успішний; у HUMAN_ACTIV… |
| AC-13 | KNB-07 | NOT_RUN | Prompt injection у чаті/knowledge file вимагає зарплату/секрети іншого клієнта; retrieval/tools відмовляю… |
| AC-14 | KNB-07/21 | NOT_RUN | AI timeout, invalid JSON і budget=0: форма/людина доступні, START/END працюють; нова assistant config про… |
| AC-15 | KNB-08 | NOT_RUN | Тестовий кошторис: 6 людино-год × €30 + €40 матеріалів + €20 виїзд = €240 net; лише в test tax profile 19… |
| AC-16 | KNB-08 | NOT_RUN | Двічі ACCEPT чинної quote version — 1 order/dispatch; ACCEPT expired/superseded — 409; нова версія не при… |
| AC-17 | KNB-08 | NOT_RUN | Fixed €1 200 + додаткові години = €1 200; accepted Nachtrag €120 → €1 320 до податку. Включені матеріали … |
| AC-18 | KNB-09 | NOT_RUN | CLIENT A/EXTERNAL_BAULEITER A не читають клієнта B, internal chat, wages/GPS навіть через direct URL/API/… |
| AC-19 | KNB-09/20 | NOT_RUN | RECEIVED_REPORT не змінює HOURS_APPROVED чи WORK_ACCEPTED; issue на report v1 створює номер і linkage, не… |
| AC-20 | KNB-10 | NOT_RUN | Два диспетчери одночасно резервують одну людину в overlap: 1 успіх, 1 conflict; expired TTL вивільняє сло… |
| AC-21 | KNB-10/19 | NOT_RUN | Перепланувати замовлення; зберігається revision, старі нагадування скасовані, повідомлення лише зачеплени… |
| AC-22 | KNB-10/11 | NOT_RUN | Scheduler після рестарту двічі генерує той самий recurring period/location; рівно 1 task occurrence. Шабл… |
| AC-23 | KNB-11 | NOT_RUN | Спроби циклу/cross-site parent у LocationNode відхилені; EG/1. OG не змішуються; імпорт із дублем externa… |
| AC-24 | KNB-11 | NOT_RUN | Worker submit → SUBMITTED_FOR_REVIEW, не ACCEPTED; незалежний QC приймає; дефект створює пов’язану REWORK… |
| AC-25 | KNB-11/13 | NOT_RUN | Троє × 2 год і спільні 100 м² дають 6 людино-год, 2 год elapsed, 100 м². Розподіл одного 1-год сегмента н… |
| AC-26 | KNB-12 | NOT_RUN | Внутрішній прораб/працівник бачать SITE_INTERNAL; external лише SITE_CLIENT; новий member без спеціальног… |
| AC-27 | KNB-07/12 | NOT_RUN | DE-повідомлення про 5 л о 14:30 із «не мити» перекладається UK/PL/LT персонально; числа/заперечення перев… |
| AC-28 | KNB-07/12 | NOT_RUN | 10 повторних translate clicks створюють 1 AI request; після edit version новий переклад; чужий message_id… |
| AC-29 | KNB-12/18 | NOT_RUN | Повідомлення/фото без reply context не йде у випадковий site; бот уточнює. Повідомлення бота, отримане по… |
| AC-30 | KNB-12 | NOT_RUN | AI preview з 3 задач підтверджено 2 рази → рівно 3 задачі; змінений command hash блокує старий confirm; «… |
| AC-31 | KNB-13 | NOT_RUN | Одночасні START з WhatsApp і native створюють 1 Shift; дубль END не змінює тривалість. Фото/опис відсутні… |
| AC-32 | KNB-13 | NOT_RUN | Контрольний день 08–10 WORK A; 10–10:05 AWAY; 10:05–10:35 TRIP; 10:35–12:30 WORK B; 12:30–13 BREAK; 13–16… |
| AC-33 | KNB-13 | NOT_RUN | DST тест Europe/Berlin: 25.10.2026 01:30+02 → 03:30+01 = 3 год; 29.03.2026 01:30+01 → 03:30+02 =1 год. Ме… |
| AC-34 | KNB-13/16 | NOT_RUN | Погоджена correction зберігає первинні події/author/reason; у LOCKED period створює adjustment; самопогод… |
| AC-35 | KNB-14 | NOT_RUN | Одна далека/неточна/стара точка, відсутня accuracy чи 300 с silence не створюють EXIT/неоплату. 3 придатн… |
| AC-36 | KNB-14 | NOT_RUN | Підтверджений EXIT у WORKING відкриває один AWAY з confirmed_at; ENTER повертає лише GEO-AWAY same site. … |
| AC-37 | KNB-14 | NOT_RUN | Локальні private BREAK/END зупиняють новий збір; пізно надіслані точки приватного інтервалу відхилені/вид… |
| AC-38 | KNB-14 | NOT_RUN | Remote END при offline native: lease спливає ≤15 хв, GPS stop; до синхронізації private points не зберіга… |
| AC-39 | KNB-14/22 | NOT_RUN | Out-of-order, duplicate, wrong employee/device, clock shift, revoked lease й late event: жодного дубля/чу… |
| AC-40 | KNB-14 | NOT_RUN | Польові тести на фізичному Android та iPhone: на кожному ≥18 із 20 нормальних outdoor-виходів/повернень в… |
| AC-41 | KNB-15 | NOT_RUN | TRIP_START атомарно закриває WORKING; ENTER destination лише пропонує arrival. Проїзд повз не починає роб… |
| AC-42 | KNB-15/17 | NOT_RUN | Trip з отриманням матеріалів і приватною паузою має неперекривні TRAVEL/SERVICE/BREAK; GPS off у BREAK; a… |
| AC-43 | KNB-15 | NOT_RUN | Спільна поїздка 3 осіб по 30 хв і 20 км → 1,5 людино-год і 20 vehicle-km; відсутній трек → distance unkno… |
| AC-44 | KNB-16 | NOT_RUN | 7,5 approved hours × €20 = €150 gross preview; зміна ставки серед сегмента правильно його розбиває. На UI… |
| AC-45 | KNB-16 | NOT_RUN | Net payable €1000; payout €400 записаний і звірений → залишок €600; €300 лише approved зменшує доступне д… |
| AC-46 | KNB-16 | NOT_RUN | Cash €400 recorded by accountant не ставить ACK_FULL; одержувач ACK_PARTIAL €300 → acknowledged €300 і di… |
| AC-47 | KNB-03/16 | NOT_RUN | Чужий user/адміністратор натискає payout acknowledge — відмова; одночасні approvals не перевищують залишо… |
| AC-48 | KNB-17 | NOT_RUN | Receive 10 л; ship 4 л → main6/transit4/site0; receive →6/0/4; usage1,5 і return0,5→main6,5/site2; total … |
| AC-49 | KNB-17 | NOT_RUN | Usable4 л, чужий reserve1, demand5 → free3, shortage2; після reserve3 shortage лишається2. Потреба задачі… |
| AC-50 | KNB-17 | NOT_RUN | Два паралельні reserves на останні2 л — сумарно ≤2; rejected offline issue не робить negative stock; batc… |
| AC-51 | KNB-17 | NOT_RUN | 5-літрова тара мінус2000 мл =3 л; л→кг без conversion відмова; return tool не є material usage; inventory… |
| AC-52 | KNB-17 | NOT_RUN | Погоджена закупівля частково отримана → stock росте тільки на receipt qty; прострочене inbound не покрива… |
| AC-53 | KNB-18 | NOT_RUN | Неприпустимий MIME/over-limit/шкідливий файл карантин або відмова; чужий media URL недоступний; при faile… |
| AC-54 | KNB-18/20 | NOT_RUN | Client copy містить лише approved photos і очищені EXIF; оригінал/hash збережено; повтор того самого фото… |
| AC-55 | KNB-19 | NOT_RUN | Один geo incident → ≤3 повідомлень працівнику/1 керівнику; після пояснення/Trip/END pending reminders ска… |
| AC-56 | KNB-05/19 | NOT_RUN | Template rejected, provider timeout, opt-out і quiet hours мають видимий стан/дозволений fallback; UNKNOW… |
| AC-57 | KNB-20 | NOT_RUN | Generate DE report із approved data; PDF/CSV/XLSX/portal мають однакові години/суми; у JSON/PDF немає pay… |
| AC-58 | KNB-20 | NOT_RUN | Publish v1, змінити профіль/адресу/дані, випустити v2: v1 байти/hash незмінні; supersession видимий; retr… |
| AC-59 | KNB-21 | NOT_RUN | На 360/768/1440 px пройти login, клавіатуру, форми, довгі DE-тексти, Back/Resume; немає обрізаних основни… |
| AC-60 | KNB-21 | NOT_RUN | Та сама approve/stock command з WhatsApp і web дає однакові permissions, БД і audit; параметри після prev… |
| AC-61 | KNB-21/22 | NOT_RUN | Зовнішній webhook з invalid signature/expired timestamp відхилений; 10 repeats source+event_id →1 effect;… |
| AC-62 | KNB-21 | NOT_RUN | Сайтова заявка з реальним source/referral створює Lead один раз; просте відкриття QR/wa.me без повідомлен… |
| AC-63 | KNB-22 | NOT_RUN | Idempotency key+той самий payload повертає первинну відповідь; key+інший payload →409; wrong expected_ver… |
| AC-64 | KNB-22/23 | NOT_RUN | Rate-limit AI/media load не заважає START/END; SQL/XSS/SSRF і cross-tenant tests не дають витоку; logs/ar… |
| AC-65 | KNB-23 | NOT_RUN | Retention job видаляє прострочені GPS та похідні переклади/індекси; конкретний legal hold зберігає тільки… |
| AC-66 | KNB-23 | NOT_RUN | Test labor profile показує порушення перерв/лімітів, але не вигадує BREAK і не стирає overtime. Productio… |
| AC-67 | KNB-23 | NOT_RUN | Виміряти зазначене навантаження 15 хв: p95/p99, errors і queue lag відповідають цілям; acknowledged comma… |
| AC-68 | KNB-23/24 | NOT_RUN | Restore у clean environment в межах RPO/RTO; звірені counts/checksums/snapshots; replay outbox не створює… |
| AC-69 | KNB-24 | NOT_RUN | Migration на копії, відкат сумісного коду, restart worker/API успішні; `/version`=artifact tested SHA; ві… |
| AC-70 | KNB-14/24 | NOT_RUN | Android install/update зі стабільним сертифікатом зберігає дані й правильний HTTPS origin; iOS встановлює… |
| AC-71 | KNB-01/24 | NOT_RUN | Live дозволений test flow: новий клієнт→quote→crew→task→shift/trip→material/photo→review→DE report→payrol… |
| AC-72 | KNB-24 | NOT_RUN | Traceability містить усі KNB/AC, actual results і evidence; docs/roadmap/memory синхронізовані; company h… |

## Source binding і відтворення

- Observed HEAD: `7e448c6024718b932b79eeb2d38f3e3af672a1ae`.
- Review UTC: `2026-11-07T23:55:43.723583+00:00`.
- Canonical CSV SHA-256: `57a0503fdb285fc709b006d4434a220e575eb0d00f8977fac94dd4ba633ad87d`.
- Git diff у reviewed identity/CSV input files перед записом документа був порожній. Інші агенти продовжували незалежну CI роботу; їхні зміни цим звітом не переписані.
- Relevant source hashes:

| File | SHA-256 |
| --- | --- |
| `corporate-site/vps/auth.mjs` | `e2e53fe3f20e5d24ac24b609bb5e909e64459d455b69612fa19098ba2061e5c8` |
| `corporate-site/vps/oidc.mjs` | `633e5ab8ae9f72b6fc4ecb660695bec1342cb0f638f6923c1db6b72d7fbd207e` |
| `corporate-site/vps/admin-access.mjs` | `207a73f8c3ab96373c742e49c5265394b9167e1c2bcf0395e76a7edb2b6e0676` |
| `corporate-site/vps/account-invite.mjs` | `33f58199cec55fe50879506c369bbdf97d87e7860477fea871a3bf7fc0846027` |
| `corporate-site/worker/api.ts` | `51e14a435c1fe3eb78a92b30755ef2c853a90f30ab043ee1320556e62596bcc1` |
| `erp/apps/api/auth.ts` | `3d183832e204598443b8f610d6a65561afecb2171a42fad5cda840acd48ba5bc` |
| `erp/packages/domain/identity.ts` | `f3d7cf80008e630dd5b110b5bbb973ddabc9956cb93cd66064ae056ea87acf14` |
| `erp/apps/api/authority-fingerprint.ts` | `b2c9804891bd00feae939be5f9de3feb518a19d970c889378e3483b4dc3da620` |
| `erp/packages/domain/integrations.ts` | `86ced023c73fd480637bbf7a2e7d64b38c6220c29974ee98f707570776791a7b` |
| `erp/packages/integrations/generic-events.ts` | `779c98a829f93b88aa30108979db873027341e0e4565cfe2792cb9f411c6fdf9` |

Відтворювані read-only commands: `git rev-parse HEAD`; CSV reader з UTF-8 BOM (`csv.DictReader(..., encoding="utf-8-sig")`), Counter(status) і перевірка evidence columns; `git cat-file -t` для двох historical SHA; точкові `rg -n`/`nl -ba` читання наведених файлів. Runtime acceptance commands не виконувались у межах цього audit.
