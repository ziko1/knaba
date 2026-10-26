# KNABA — єдина інтеграція сайту, Control Center, Assistant → ERP та owner activation

Дата: 2026-10-26. **Draft, source-only; не розгорнуто в production.** Цей документ описує лише незалежний інтеграційний кандидат і не підмінює чинні PROJECT_MEMORY/ROADMAP/BACKLOG/BUDGET, а також оригінальні QA receipts.

## Доведене REUSE-FIRST поєднання

- Вихідна функціональна база — Draft PR #70 (включно з #69 Control Center і #67 Assistant → ERP). Без нового входу, CMS, CRM, бази даних клієнтів чи провайдера.
- Публічна лінія Draft PR #73 (включно з #72 логотип, #71 п'ять партнерів, #68 усунення дублювань і #66 локалізовані гайди): єдина система DE/EN/UK/RU; одна галерея на чотирьох URL.
- Invitation з Draft PR #58 додається до існуючої VPS авторизації. Стара #58 сама по собі використовувала `0005_owner_invite.sql`; ця інтеграція зберігає існуючу ERP `0005_assistant_erp_bridge.sql` і **новий, раніше не випущений** owner SQL `0006_owner_invite.sql`. Повторне присвоєння номерів уже застосованим live міграціям заборонене.
- Конфлікти між PR вирішені без переписування історії вихідних PR. Preserve `/admin/*` private noindex/no-store, editorial routes 92 у sitemap, але без index для приватних шляхів.
- Виправлено серверний native Node import `siteConfig` (розширення і безпечний доступ до env), CSS contrast-parser медіаправил та хибні лічильники сторінок / route inventory.

## Локальні докази, source-пінінг

Tested executable local Git commit (including the latest PR #73 503-owner distinction): `0d0c91a2f71b1e221c8e7ca434dea9268ac7f189`. Previous green candidate: `67d8db64397779b6680643aefe62c9d663d1941c`. Before incorporating its final 3-file concurrent increment, the first green executable revision was `88c7c853bc9d1c87e5b5cd94840d177b04f3386d`. Це локальна commit identity на scratch VPS, а не remote PR SHA і не активний реліз. Якщо remote commit SHA відрізнятиметься, підтвердити рівність tree/файлів і повторити команди перед релізом.

Ізольоване джерело; офіційний Node.js `24.22.1` download, SHA256 архіву перевірено за upstream SHASUMS256; незалежне `npm ci --ignore-scripts --no-audit --no-fund` (508 пакетів). `KNABA_RELEASE_MODE=vsp`. Fresh commands:

| Контроль | Результат |
| --- | --- |
| `npm run check` | PASS, exit 0 |
| `npm test` | PASS, Vitest 228/228; Node 39/39, 14/14 та 7/7 HTTP synthetic |
| `node --test vps/*.test.mjs` | PASS, 26/26 |
| `npm run build` | PASS, 122 HTML |
| `npm run verify:build` | PASS, 92 published locale URL у sitemap, 8 locale home/catalogue ordinal tests |
| `git diff --check` | PASS |
| `node --test tests/migration-sequence.test.mjs` | PASS, унікальні 0000..0006 |
| 4 built home page partners (DE/EN/UK/RU) | 5 `data-partner-id` у кожній; 0 legacy `href="https://knaba.de` |

Останній перевірений вивід `verify:build` повідомив artifact SHA256 `e5f1ccbd6f7f5cba363738d55922d65237f7891dc86aea8aa40c0916704f9c05`; це **локальний** artifact, не live.

RED до виправлень: 2 route-inventory tests; 121→122 build page count; 3 VPS module import failures; CSS contrast test; duplicate migration prefix 0005. GREEN після точкових виправлень: результати вище. Не послаблено контраст 4.5:1 чи захист приватних маршрутів.

## Реальний VPS, read-only (на момент окремої перевірки)

`kneba.vsp.rest`: `/`, `/en/`, `/uk/`, `/ru/`, `/admin/` та `/healthz` HTTP 200; `/galerie/` HTTP 404; `/readyz` HTTP 503 — очікування реальної активації owner. Поточний релізний symlink має окреме ім'я; без source/artifact mapping **не доказ** цього інтеграційного SHA. На сервері приблизно 15–16 GiB вільного місця (92–93% зайнято); QA scratch нічого не змінював в активній release DB.

## Незакриті release gates

- Owner/customer approval для KNABA і відповідних авторських прав/зовнішнього CDN п'яти логотипів, актуальності контенту, GDPR/privacy; жодних вигаданих ліцензій.
- Independent security/code/UI review, реальні owner sign-up/UAT, ізольований DB міграційний rehearsal з **фактичною live таблицею checksum ledger**, перевірена резервна копія та rollback.
- Real-device 320/390/768/1440, зум, screen reader та HTTPS браузерна перевірка: **NOT_RUN/BLOCKED** (Opera Connector від'єднаний, Playwright і браузерні engines недоступні в цьому isolated host), ніяких PASS.
- Підтвердження точного live Git/artifact hash і повторне dry-run порівняння 92 routes, API/SSO/CSRF/tenant guards на актуальній ізольованій копії. Клієнтський /readyz 503 не маскувати.
- Жодного merge в main, зміни офіційного `knaba.de`, продакшен DNS, DB migration, реального email запрошення, зовнішніх ERP/WhatsApp/AI dispatch чи платного API без окремих release gates і власницького підтвердження.

## Повторна процедура QA перед дозволеним релізом

```bash
cd corporate-site
npm ci --ignore-scripts
KNABA_RELEASE_MODE=vsp npm run check
KNABA_RELEASE_MODE=vsp npm test
KNABA_RELEASE_MODE=vsp npm run build
KNABA_RELEASE_MODE=vsp npm run verify:build
KNABA_RELEASE_MODE=vsp node --test vps/*.test.mjs
```

## Concurrent PR #73 reconciliation (source candidate)

Перед створенням інтеграційного Draft PR PR #73 змінився до `c5662f6716fc14087c227b8b52c61ec4a489b485`: додано read-only `verify:live`, 7 synthetic fail-closed HTTP tests, та нову npm-команду. Це взято з актуального remote SHA, не перезаписано попереднім manifest. Доступність сайту окремо від artifact QA й фізичного браузера. Новий повний `npm test` виконано після узгодження: 228/228 Vitest, 39/39+14/14+7/7 Node, exit 0. Новий `npm run check` exit 0, `node --test vps/*.test.mjs` 26/26, після нової HEAD-збірки `npm run build` 122 сторінки та `npm run verify:build` PASS.


## Fresh read-only real HTTP audit (26.10.2026; live artifact still older)

`npm run verify:live` на реальному `https://kneba.vsp.rest`: **FAIL, exit 1** (expected until separately authorized release). У всіх 4 home DE/EN/UK/RU HTTP 200, але `LEGACY_OUTBOUND_LINK`, `PARTNERS_NOT_FIVE_IN_ORDER` та `GALLERY_NAV_MISSING`; українська home також `INTERNAL_RESEARCH_NOTICE`. Усі 4 gallery URLs HTTP 404. `/healthz` HTTP 200/PASS, `/readyz` HTTP 503/FAIL. Це окрема перевірка фактично запущеного старого релізу; результати нового source HTML коду: 5 partner IDs у кожному з чотирьох локалізованих home та 0 старих outbound links у кожному. Не змішувати synthetic PASS і live FAIL.

Потрібні незалежний security/code review, owner/legal acceptance, реальний браузер/device QA, підтвердження live source artifact/SHA, verified backup/rollback і окремий дозвіл на deployment. Ніяких production змін чи DB migration у межах цієї інтеграції.


### Latest upstream PR #73 incremental revision (source parity)

Після читання Remote PR #73 HEAD `6fb1dbda61c0fe18fd66fadf3bfe57386e4d32c1` інтегровано його зміни до `verify-public-live.mjs` і 7 тестів. HTTP 503 + тіло `owner enrollment required` тепер окремо позначається `OWNER_ENROLLMENT_REQUIRED` (разом з `HTTP_503`), а не помилково трактується як загальний outage або PASS. Fresh source `npm test` 228 Vitest + 39/14/7 Node PASS, `node --test vps/*.test.mjs` 26/26 PASS; реальний `npm run verify:live` EXIT 1, `/readyz` 503 (`HTTP_503`, `OWNER_ENROLLMENT_REQUIRED`). Source tree тестувався до цього документаційного доповнення.
