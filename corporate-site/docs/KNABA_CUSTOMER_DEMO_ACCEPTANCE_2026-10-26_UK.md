# KNABA VSP — кандидат для демонстрації замовнику, 26.10.2026

**Стан:** SOURCE QA PASS / BROWSER SCOPED PASS / RELEASE HOLD. Це не підтверджене приймання цілого продукту. Жодного production/main merge, VPS deployment або зміни даних не виконано.

## Перевірена основа
- Репозиторій: `ziko1/knaba`. Початковий Draft PR #101 — `feat/knaba-official-evidence-why-20261026` @ `97e2638d65a4c80ce4ded90bd3c067152ef628e8`, stacked над #98. Його Source уже прибирає вигадані відгуки, зберігає реальну API-модерацію, додає 4-мовний блок переваг і обережний історичний рейтинг із застереженням.
- Поточна зафіксована тестова версія на `kneba.vsp.rest` станом на 17:42 UTC — `/srv/knaba/vps/releases/15cfe1e15ec2bb78c0b85ccb59e5221024a9bae8`. Не плутати її з цією новою збіркою; на сервер ця гілка ще не потрапила.
- Робоча гілка: `feat/knaba-customer-ready-acceptance-20261026`, зі збереженням історичного `AGENTS.md`, існуючих компонентів, ERP/CRM/API та усіх 99 target locale metadata.

## Реальний кодовий результат цього циклу
1. Прибрано лише монтаж `LocaleCatalog` у публічному `Layout.astro`. Готові чотири мовні посилання (DE/EN/UK/RU) залишені. Планові 95 мов, JSON manifest, модуль перекладів та майбутній механізм не видалені; більше немає рекламування незавершених локалізацій відвідувачам.
2. Додано `tests/customer-language-picker.test.ts`, посилено `tests/verify-build.mjs`, актуалізовано `tests/locale-catalog-browser.cjs` і `vps/server.test.mjs`. Перший negative baseline підтвердив проблему, тест після патча пройшов.
3. Регенеровано лише похідні `i18n/source-de.json` і `docs/build-verification.json`. В `source-de.json` 1021 → 1012 одиниць: дев'ять внутрішніх рядків недоступного публічного каталогу видалено з клієнтського extraction, а не з 99-мовного source target.

## Відтворювані перевірки

**Тестова ОС:** ізольований cache-pinned Docker `node:24-bookworm-slim`, Node `v24.22.1`, `npm ci` 508 пакетів, без нових залежностей у lockfile. Контейнер без підвищених Linux capabilities та без network access під час тестів. Початковий env failure Astro `/.config/astro` усунуто штатним `HOME=/tmp`/telemetry-off, без змін security policy.

- `npm run check` — **PASS**: 271 файлів, 0 errors, 0 warnings, 4 existing hints.
- `npm test` — **PASS**: 40 Vitest files / **258/258** та Node тести **32/32 + 27/27 + 9/9**.
- `KNABA_RELEASE_MODE=vsp npm run build` — **PASS**.
- `npm run i18n:extract`, `npm run verify:build` — **PASS**, 28 DE routes / 1012 units; 99 target locales зберігаються лише у manifest. Client artifact SHA256: `8e90d53c875353a1a5f5494cd4d173708a2a9a1d94fcbca5512e43594f07c1fe`.
- `npm run test:vps` — **41/41 PASS** на ізольованій SQLite/server fixture. Перший прогін знайшов і виправив застаріле очікування локалізацій; повторний повний прогін зелений.
- Chromium у вже встановленому `mcr.microsoft.com/playwright/mcp:latest`: `locale-catalog-browser.cjs` — **PASS 16 viewport cases + 12 cases 200% zoom** (320/390/640/768/1280, відповідно до сценаріїв) та manifest-failure/nav; `knaba-logo-browser.cjs` — **PASS 16 desktop/mobile-width cases**, including real SVG decode, alt, responsive source, 200% root text reflow. Це headless desktop emulation на ізольованому статичному build, не фізичний девайс і не реальне production HTTP UAT.
- Браузер: чинний cached Chromium без вимкнення sandbox або політики адміністратора, без завантаження browser engines.

**Логи на існуючому VPS (не продакшн):**
`check.log` SHA256 `c73ed1a24e4fae01bb9bb9a85c53cdf3c95884998fcc1f60da6e13a65ba2718b`;
`test.log` `6c6462ac090297b019b3f36814f6f0fcb159f964f903567d4e3fa5a87b4470c8`;
`build.log` `a2992012e01f7606b34056544495c9651897203f1e95d1a6600bf94534033c8d`;
`i18n.log` `0b85258a3bc3efd7f72edf80c94e3ef5e5f55c46fed10a7d0c61caafd9a5835e`;
`verify.log` `55a30c8a6d08f626e5a3feadb6a6fdd06d43d538c6898484640bfcaa36d1e3ed`;
`vps-rerun.log` `9970fdbf5591fb8b334cb92859f9401e5fa79c106075408c5a1c880fb034d17b`.
`locale-browser-chrome.log` SHA256 `9e2328d0a28682f60e186c85dd3996fc8c5476a0ff21afbe6be48c244a1ec14e`; `brand-browser.log` SHA256 `e6d8fcd5a97f164632d0478a14f0a6f391d817348bf83945713ce0d280ad4145`. Browser screenshot files exist only in the isolated QA evidence directory, not in GitHub.

## Незакриті приймальні критерії
- LIVE `kneba.vsp.rest` deployment нового артефакта: **NOT_RUN**. При перегляді VPS доступно близько 18 GiB / диск зайнятий **91%**; чинний release preflight має storage HOLD. Не обходити release lock/CAS та backup/offsite restore.
- Реальний клієнтський POST із підтвердженим одержанням власником, фактичний owner email/login/roles, а також двосторонній чат із живим власником: **OWNER UAT NOT_RUN** (не проводили тестового запису в живу БД).
- Повна tenant-scoped D1→ERP PostgreSQL синхронізація, WhatsApp/Telegram API, voice dispatcher/calling, провайдерні квоти/рахунки, MFA/consent/delivery receipts: **не інтегровані в цю гілку**; окремі Draft PR #97/#102/#103, не вважати їх live.
- Фізичний Android/iOS, screen reader, реальні Field Web Vitals/SEO, юридична/брендова та медіа-згода, незалежний людський/security-review, off-host backup restore і підпис клієнта: **PENDING**.
- Сторінки `knaba.de`/DNS і `main` не змінені; нових платних провайдерів/розсилок/AI-моделей не активовано. Баланси, поточна загальна ціна VPS/AI і остаточні клієнтські права — **UNKNOWN**.

## Наступний безпечний крок
1. Незалежний review саме цього нового SHA/коду; перевірити актуальний live release за CAS перед будь-яким тестовим розгортанням. У разі новішого релізу — forward integrate, не перезаписувати.
2. Відновити дозволений storage headroom без руйнування наявних даних (тільки об'єкти з підтвердженим власником, backup/rollback) і off-site restore; потім окремо дозволений preview rollout.
3. Owner + клієнт погоджують synthetic end-to-end request→CRM→Assistant reply, реєстрацію/ролі, browser/devices та юридичні тексти. Ніяких автоматичних реальних замовлень, тарифів і WhatsApp/Telegram зовнішніх викликів до цих gates.
