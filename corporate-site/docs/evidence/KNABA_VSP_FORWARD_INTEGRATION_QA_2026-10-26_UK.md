# KNABA — forward integration поверх живого VSP релізу (26.10.2026)

## Межа змін та походження

- Активний на початок перевірки `kneba.vsp.rest`: source/release `83ff0ba402b38209a39d96325fa1c3f9cfed5a86`; чотири галереї ще повертали 404. Дійсний активний SHA слід звіряти повторно перед cutover, бо інші авторизовані операції можуть його змінити.
- Інтеграція спирається на `83ff0ba...` + збережений off-host checkpoint `6e63411bcda93c7407783cc5ee9b12db7e9ea659`. Базовий інтеграційний коміт `3f5d68f35f550938571b956c3416a7d45cfaf54b`; тестовані подальші UI/QA виправлення зберігаються в тій самій гілці `fix/knaba-vsp-forward-integration-20261026`.
- REUSE-FIRST: тільки наявний `Partners.astro`, жодного другого `PartnersSection`; п'ять локальних логотипів, сім різних WebP для каруселі 02–08, старий SVG першого слайда, чотири locale gallery routes, п'ять контрастних градієнтів головних карток та кольорові картки каталогу без зміни логіки.
- Публічний каталог та сторінки: **122 built HTML**; Studio public-page inventory **92**; i18n 99 target / **4 published** DE/EN/UK/RU / 95 pending; актуальний DE extraction 26 routes/948 deduplicated units.
- Збережено серверну поведінку активного релізу: `vps/server.mjs`, `vps/database.mjs`, login/CRM/Studio/reviews і forward-only шість SQL migration files, включно з `0005_public_reviews.sql`. Змін до live customer DB не робили.

## Відтворювані перевірки кандидатної збірки

- Ізольований `node:24-bookworm-slim` без мережі та без привілеїв: `npm ci --offline`, `npm run check` — **0 помилок** Astro/Vue/Svelte.
- `npm test`: **196/196 Vitest**, native Node **16/16 + 27/27 + 9/9 PASS**; `node --test tests/marketing-contrast.test.mjs` — **8/8 PASS**, усі CSS-палітри на перевірених токенах WCAG AA ≥4.5:1.
- `npm run build` — **122 HTML**. `npm run i18n:extract`, `npm run verify:build` — PASS. Client artifact SHA-256: `3d6d510f16abc6c96b458442bdc42da8911d19bf1e97a283d41ccec5030cc113`. I18N source catalog SHA-256: `f77eab5b5e319f1213244701b37fd70c51ab49329c923b07b65b7285f953fe97`; source digest: `5f6f3d20442df835d4da32b75fb559180250ced76b467698638785ff34e7d579`.
- `npm run test:vps` — **24/24 PASS**, включно з ORM-модельованою owner moderation, idempotency, scoped auth, SEO renderer, migration-readonly, HTTPS і storage guards.
- Ізольований loopback Node24/VPS HTTP на **окремій SQLite**, з точними 6 міграціями й `PRAGMA integrity_check=ok`: DE/EN/UK/RU home 4×200, gallery 4×200, `/healthz` 200, local JPG/WebP assets 200, owner login page 200. Кожна з чотирьох homepage має 5 partner-card IDs і 7 WebP scenes. `/readyz` в ізольованій БД **503** через навмисно відсутнє owner enrollment; це не показник live readiness і не bypass.
- Реальний Chromium у контейнері через GET/HEAD-only loopback QA proxy, який не знімає Host/HTTPS checks: 16/16 logo cases, 24 локалізовані visual/nav/pages, 6 CSS-width reflow/keyboard cases, 16/16 guide-route браузерних перевірок, 6 guide reflow cases PASS; перевірені декодування п'яти локальних партнерських медіа та семи WebP. Виправлено outdated CSS gradient і застарілі браузерні guide assertions на актуальні 4 секції/5 checkbox. Скриншоти збережені в приватному QA-каталозі, не є доказом реального пристрою.
- Немає мережевих AI-dispatch, оплат, змін Cloudflare/DNS, production merge, зміни public symlink або міграцій customer DB.

## Release gates — OPEN

1. **RIGHTS/FACTS HOLD:** логотипи й твердження про чинних партнерів потребують перевіреної згоди компанії / правовласника і остаточного UAT клієнта. Наявність файлу на старому офіційному сайті не означає право на стороннє розповсюдження.
2. **DEVICE/INDEPENDENT REVIEW HOLD:** фізичний телефон/Safari/Firefox, справжній browser zoom, screen-reader, external legal review і field Core Web Vitals не підтверджені. CSS-width emulation не підміняє ці перевірки.
3. **CUTOVER HOLD:** до публічної заміни `/srv/knaba/vps/current` потрібні свіжий current/source/manifest comparison, off-host backup і перевірене restore даних/release, версійний irreversible-safe rollback, окреме погодження публікації, атомарне перемикання, `verify:live` на чотирьох мовах, 12 зображень, health/ready та перевірка точного SHA. Не торкатися офіційного `knaba.de`.
4. Тимчасові `/tmp` QA-каталоги **не є** архівами; код зберігати в GitHub, докази/restore off-host за окремим безпечним процесом. Не очищати неперевірені `volumes`, `uploads`, `DB`, `secrets` і `source-recovery.bundle`.

**Статус:** інтеграційний source candidate і isolated VPS QA підтверджені. Публічний VSP live cutover **не виконано**. Це не release PASS і не customer acceptance.

## Concurrent VSP release drift — 26.10.2026
- Після проходження QA active symlink змінився з 83ff0ba на `21a56934f3c3266d31285bb89e0a4ca0c0f755a4` стороннім/паралельним процесом. Новий live HTML / відповідає HTTP 200, /galerie/ досі HTTP 404, /readyz HTTP 200.
- Маніфест нового релізу містить `readyForRelease: 0`, `storageGateCutoverAllowed: false`, `status: STAGED_DO_NOT_CUTOVER_DISK_WARNING`. Це НЕ релізне схвалення. Не робити додаткового cutover чи автоматичного rollback без узгодження реального стану.
- Новий SHA не знайдений у GitHub, але у відповідному immutable release є перевірений `source-recovery.bundle`, SHA256 `dd0ba5568c7192738c937b7cc08eab25744ed75d2580ff1ae158d1a81cddf98b`; git bundle verify PASS, повна історія.
- Порівняння з 83ff0ba: один source commit, 20 i18n-99-only files (динамічний каталог, 10 review-only language drafts, QA/документація). Декларовано `runtimeIdenticalToParent=true`, `schemaChanged=false`, лише 4/99 мови опубліковані. Окремий translation-review потік не є частиною нашої інтеграції, має власний privacy/public-source gate.
- Перед публікацією повторно перевірити current, source ancestry/lease та backup, права/owner UAT і безпечне перенесення чернеток, не викладати приватний bundle у public GitHub без дозволу.
