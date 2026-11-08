# KNABA Lead Agent — модуль пошуку замовлень

## Призначення та межа цього випуску

Запит власника: реалізувати модуль KNABA, розгорнути на наявному фізичному
сервері та надати піддомен для тестування замовником. Цей запит явно дозволяє
окреме розгортання і DNS для `bot.knaba.de`; він не дозволяє купувати ліди,
активувати платних провайдерів, надсилати клієнтам повідомлення або merge main.
Модуль продовжує існуючий KNABA; AVENQO та сторонні служби не змінюються.

Це тестовий модуль з реальними відкритими джерелами та власною авторизацією.
Повний автоматичний MyHammer/інші закриті платформи, генеративний AI,
зовнішнє листування та спільний site/ERP session SSO не сертифіковані.
Їх не підміняють mock-конекторами, шаблонними текстами чи кнопкою Connected.

## Реалізовані контракти

| ID | Поведінка | Доказ приймання |
|---|---|---|
| LA01 | Вхід через існуючі ERP cookie/CSRF, tenant/owner scope, відкликання доступу | domain/PG/UI tests; live login gate |
| LA02 | UK/DE адаптивна панель: результати, профілі, джерела, чернетки, журнал | 6 helper tests + 4 rendered HTTP-fixture cases; actual target checks separate |
| LA03 | Редаговані джерела, категорії, слова, NUTS, індекси, радіус, бюджет і графік | 20 domain cases include profile/version/authorization/matching |
| LA04 | Berlin Vergabe RSS та TED Search API: реальний read-only збір | 17 adapter cases + observed official HTTP200 payloads; worker live gate |
| LA05 | Пояснення відповідності; невідомі ціна/координати/строк не вигадуються | deterministic matching and malformed-source fixtures |
| LA06 | Фоновий пошук у наявному transactional outbox з lease/fresh authority | 13 real PostgreSQL cases added, results recorded after CI |
| LA07 | Нові результати першими, scoped cursor, versioned filtering | PG cursor/foreign tenant tests + UI fixture |
| LA08 | Німецькі шаблонні чернетки, edit/review/source digest; жодного send | domain stale/edit cases + rendered fixture |
| LA09 | Серверний калькулятор EUR cents, трудовитрати/маржа/ПДВ | deterministic integer-money cases; all estimates non-binding |
| LA10 | Передача вибраного результату до канонічного CRM lead.create | explicit permission, verified contact/services, reference-only replay |
| LA11 | Каталог 14 джерел з окремими read/login/send capability statuses | actual catalog + source URLs; only two implemented public readers |
| LA12 | Окремий TEST bootstrap без demo password чи чужої бази | dedicated guarded script; compose seed override; target SQL gate |
| LA13 | `bot.knaba.de`, TLS, restart, backup/restore, artifact identity | target receipts required; NOT_RUN before deployment |

Наведені кількості не додаються до загальних suite totals повторно. Локальні
43/43 focused assertions — CPU/helper proofs у робочому дереві; вони не є
PostgreSQL, actual-browser або live acceptance. Окремі CI/runtime receipts
мають містити точний commit і artifact hash.

## Реальні джерела та обмеження

Berlin Vergabe RSS:
<https://www.berlin.de/vergabeplattform/veroeffentlichungen/bekanntmachungen/>
та feed.rss за цією адресою. TED Search API:
<https://docs.ted.europa.eu/api/latest/index.html>,
<https://api.ted.europa.eu/v3/notices/search>.

Перевірка 08.11.2026 отримала HTTP200, фактичний RSS з 50 оголошеннями й
JSON TED з publication-number, notice-type та CPV/NUTS. Кількість актуальних
оголошень змінюється. Адаптери обмежують розмір відповіді, час запиту,
кількість сторінок/елементів і зовнішні адреси; не обходять CAPTCHA чи логін.
Вміст оголошень не виконується як інструкції, HTML або команди.

Для MyHammer та Kleinanzeigen автоматичний доступ не активовано: потрібен
підтверджений дозволений канал. Власний логін не замінює дозвіл платформи.
У MyHammer платний контакт може виникати до отримання роботи; поточний модуль
не купує контакти. Умови перевіряються заново перед кожним новим адаптером:
<https://www.my-hammer.de/allgemeine-geschaefts-bedingungen>,
<https://themen.kleinanzeigen.de/nutzungsbedingungen/>.
Інші каталожні джерела позначені NOT_IMPLEMENTED, CONTRACT_REQUIRED або
EXISTING_MODULE відповідно до фактичної можливості, а не обіцяного маркетингу.

Публічні тендери — один сегмент замовлень. Вони не є повною заміною приватним
невеликим роботам MyHammer. Відсутня ціна або географія потребує ручного
уточнення. Тендерна оціночна вартість не прирівнюється до бюджету клієнта.

## Архітектура

React-панель використовує існуючі commands/API, CSRF і session lifecycle.
NestJS Engine виконує tenant-scoped команди. PostgreSQL зберігає профілі,
можливості, запуски, чернетки, audit/revisions та outbox у наявному форматі.
Існуючий Worker збирає лише два дозволені public feeds поза SQL транзакцією;
перевіряє користувача, версію профілю, актуальний lease і скасування перед
мережевим запитом та збереженням. Redis, SQLite для бізнес-даних або новий
фреймворк не вводяться.

`lead_agent.list` повертає свіжі записи першими з tenant/owner-scoped
snapshot cursor. Змінений source digest робить попередній review чернетки
неактуальним. Review означає внутрішню перевірку тексту; дозволу надсилати
повідомлення він не надає. CRM handoff повертає reference, а не чужі CRM дані.

Детермінований template builder не називається LLM. Ставки й гроші рахує
сервер у цілих cents; невідома комісія не стає нулем. Остаточні комерційні
пропозиції залишаються у канонічному ERP workflow.

## План безпечного тестового розгортання

1. Закомітити повний reviewed source, виконати root audit/manifest/test,
   наявний CI з реальним PostgreSQL17.6 і rendered UI. Не послаблювати gates.
2. На наявному KNABA host створити лише `/srv/knaba/lead-agent` і власний
   Compose project `knaba-lead-agent-test`. Не використовувати NAS DB,
   customer production/testing volumes чи чинні tunnel configurations.
3. Зібрати Docker image з exact committed Git archive; записати Git SHA,
   archive SHA256, image ID, release.json і реально використані base digests.
4. Private environment: APP_MODE=TEST, COMPANY_ID=knaba-lead-agent-test,
   PUBLIC_ORIGIN=https://bot.knaba.de, KNABA_MODULE_LANDING=lead-agent,
   LEAD_AGENT_PUBLIC_SEARCH_ENABLED=true, усі outbound/paid gates false.
   Паролі/ключі випадкові, поза git/logs, файли приватні.
5. Застосувати compose.yml разом із compose.lead-agent.yml. PostgreSQL лише
   у приватній мережі, API127.0.0.1:19180. Bootstrap override виконує міграцію,
   НІКОЛИ generic seed. Initial operator додається рівно один раз через
   bootstrap-lead-agent-test.mts, private JSON доступний тільки цьому run.
6. Перевірити рівно одного активного тестового користувача, відсутність demo
   credentials, закритий `/auth/demo`, session/CSRF, readiness/version та
   реальний outbox search. Synthetic company не позначається production.
7. Зробити окремий pg_dump і відновлення в одноразову тестову базу;
   звірити потрібні таблиці/кількості та цілісність. Не відновлювати поверх live.
8. Через штатний owner Cloudflare helper створити окремий tunnel і
   systemd connector з private token через LoadCredential, metrics20253.
   Лише після local acceptance додати CNAME bot.knaba.de до нового tunnel.
9. Перевірити actual HTTPS root→module, login, protected reads/CSRF,
   real source results, restart/health і незмінений health основного KNABA.
   Видати власнику посилання й приватні тестові дані входу для передачі.

Тестова компанія окрема від даних основного сайту. Модуль є частиною codebase,
RBAC, UI та CRM KNABA, але shared site/ERP session SSO ще не введений у live.
Наявний F2 account-linking contract не оголошується session SSO.

## Rollback

Для першої публікації зупинити тільки new connector і own Compose project;
видаляти лише створений нами DNS record після перевірки ID/name/content.
Зберегти приватні файли, release, dump і postgres volume. `down -v`, prune,
перезапис інших тунелів/даних заборонені. Для upgrade — backup до міграції,
immutable prior image/config, перевірка schema compatibility і reviewed
rollback; автоматичного destructive downgrade немає.

## Відкриті залежності повного продукту

| ID | Наступна робота | Умова виконання |
|---|---|---|
| LA14 | MyHammer та закриті джерела | Письмовий дозвіл/API/contract і scoped credentials |
| LA15 | Власні platform accounts | Підтверджені OAuth/session можливості кожного провайдера |
| LA16 | LLM drafting і переговори | Власний provider, дозволені дані, свіжі quota/price, budget reservation |
| LA17 | Зовнішнє надсилання/платний контакт | Scoped consent, per-action preview, spend cap/reservation, idempotency/reconciliation |
| LA18 | Production company та справжні замовлення | Verified company/owner bootstrap, MFA, retention/data rules, UAT |
| LA19 | Єдина live site/ERP сесія | Окремий reviewed federation/session контракт і actual paired acceptance |
| LA20 | Масштаб/retention/доставка | Виміряні baseline, узгоджена retention, provider/runtime receipts |

Чинні master prompts, roadmap, historical acceptance і бюджет інших KNABA
напрямів збережені. Цей документ не закриває весь V4/V3 продукт.
