# KnaBa — перевірений кандидат сайту 24.10.2026

**Статус:** SOURCE_LOCAL_QA_PASS / HOSTING_DEPLOY_BLOCKED. Це НЕ підтверджений live release чи готовий клієнтський handover.

## Прив’язка до джерела
- Репозиторій: https://github.com/ziko1/knaba
- Вихідна гілка: `codex/knaba-official-company-alignment-20261024` (PR #20; виправлений locale bug `2c05dbd1b2d4eccb0330502bad801ea287fbd4be`).
- Точний перевірений код: `f9cb4f8da0bda3efe14dc8c578b109ee8b1bd221`; corporate-site tree: `ab61fb45b8ce3b5e2ea87def8ae568d07cf2cb81`.
- ERP Git tree ЗАЛИШАЄТЬСЯ `a242ddb1a8b6395cafbc3cacbc0ce510f0be3c43`, без переписування правил/даних/SQL.
- Джерела функцій: офіційний бренд та Bauhelfer PR #20; оригінальні сім 2D-SVG із PR #17; доступний header dropdown із PR #15; функціонал локального owner↔visitor D1 чату, успадкований від PR #12. Всі імпорти адаптовано до цього source, не зливали гілки сліпо.
- PR #19 (notification outbox/recovery) лишається **іншим, незлитим кандидатним графом**. Його нові email/recovery функції тут НЕ заявляються включеними й не випускаються без contract/DB reconcilliation.

## Зміни в corporate-site
1. DE/RU/EN/UK згадки про Bauhelfer/Bauhilfsarbeiten та підготовку будмайданчика; запит переадресований до наявної форми, без неузгодженої ціни/ERP service enum.
2. Сім власних локальних SVG та сервісні 2D-сцени; без сторонніх зображень, недоведених логотипів чи рекламних обіцянок.
3. Одне мовне dropdown-меню в header замість повноширинної верхньої смуги та дубля в footer; Escape/click outside, mobile.
4. Компактний плаваючий віджет помічника з `<details>`; `PublicAssistant client:visible` відкладено до відкриття; на `/assistent/`, `/konto/`, `/portal/` та RU аналогах він вимкнений, щоб не дублювати поля.
5. Static build gate перевіряє чотири мови, відсутність старих смуг, маршрут віджета, SEO/noindex та Cloudflare worker-first API.

## Фактичне тестування (VPS SentinelX, локальний окремий checkout)
- `npm ci` — exit 0 (Node 24.22.1, системний npm 9.2.0 видав engine warning про потрібний npm >=9.6.5; це *не* повністю supported npm/toolchain preflight).
- `npm run check` — PASS: Astro 0 errors/warnings/hints, Vue/Svelte clean.
- `npm test` — **88/88 Vitest + 8/8 Node PASS**.
- `npm run build` — PASS, 51 статична HTML сторінка + Worker.
- `npm run verify:build` — PASS, 51 HTML, внутрішні посилання, metadata, i18n, noindex, Worker routes.
- `npm audit --omit=dev --audit-level=moderate` — exit 0, **0 reported vulnerabilities** (під час сканування зафіксовано попередження Node DEP0169 url.parse).
- `git diff --check` — exit 0; робоче дерево чисте, site tree/ERP tree exact.
- Local docker Playwright headless Chromium `mcr.microsoft.com/playwright/mcp:latest`, `--network none`, межі 2 CPU/2GiB: **16/16** DE/EN/UK/RU × viewport 320/390/768/1280 PASS. Перевірено dropdown, Escape, lazy floating assistant, локальні SVG, desktop/mobile width, RU Bauhelfer відповідь, `/ru/kontakt/` без подвоєння, відсутність JS exceptions, відсутність дублювання на /assistent і /portal.
- Локальний **один** static artifact `dist/client` SHA-256: `1fb4dd3cb1b1e809b114a5a01cb6780f6fb3aa0cc51196c92d34f44061549281`. Це хеш саме цієї збірки, не детермінований між усіма повторними збірками через Astro island UIDs.
- Логи QA на VPS: `/tmp/knaba-floating-*-2031.log`, `/tmp/knaba-release-browser-2031.log`, `/tmp/knaba-release-audit-2031.log`. Ці тимчасові логи **не є** постійним customer evidence store.

## Деплой та ризики
- `https://kneba.vsp.rest/` на 24.10.2026 доступний HTTP 200, але це старий live build з `site-language-bar`, нова branch **НЕ DEPLOYED**.
- Existing ChatGPT Sites project `appgprj_6adc346d6f8881918b73ac79ebc5d759` з live D1 НЕ має керованого native publish/backup/rollback інструмента в поточному діалозі. Opera Browser Connector: `Browser not connected`. Wix підключено до двох сайтів VSP, **не** до KNABA. AppDeploy є іншою платформою; не змінювати DNS, не переносити живу D1, не створювати друге джерело даних.
- Наявне сховище VPS 197 GiB, ~14 GiB доступно (93% використано); не видаляти чужі source snapshots/бекапи без інвентарю.
- **NOT_RUN / BLOCKED:** Sites source publish, live binding D1 backup+restore, trust boundary real authenticated owner/worker/client, actual request and owner reply post-deploy, consent/GDPR retention and erasure, physical devices, screen reader, field CWV, independent security/design review, компанійний UAT, official `knaba.de` owner approval.
- Жодних production DB міграцій, DNS cutover, merge main, real email/WhatsApp, paid AI API чи нових витрат не виконано.

## Безпечний release/rollback після появи реального Sites control
1. Прочитати native project appgprj_…, поточні D1 bindings та deployment version; виконати provider backup і перевірити відновлення на копії. Без backup STOP.
2. Перевірити trusted owner identity headers і серверний authorization; no guest impersonation, tenant/account isolation. Під час deployment не активувати оплатні зовнішні provider flows.
3. Підтвердити міграції D1 з чинного live state перед additive-only застосуванням; не додавати 0002 із PR #19 автоматично.
4. Залити точно перевірений source/code та отримати native Sites deployment ID; перевірити metadata, link, services, language, 320/390 viewport, consented live lead receipt, owner↔visitor UAT; не публікувати `knaba.de`.
5. При FAIL виконати rollback до записаної раніше Sites version, **не** відкочувати або видаляти наявні D1 user records. Звірити маршрути, інцидент, error telemetry й consented test rows.

**Висновок:** локальний код перевірено, live release/передача замовнику поки BLOCKED_PLATFORM + P0 owner/business/legal gates. Публікацію не вигадувати.
