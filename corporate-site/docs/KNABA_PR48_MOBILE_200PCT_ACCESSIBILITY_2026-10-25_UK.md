# KNABA — 200% mobile text reflow and language-picker keyboard accessibility

**Дата:** 25.10.2026. **Тільки** тестовий VPS `https://kneba.vsp.rest/`.
**PR:** https://github.com/ziko1/knaba/pull/48 (Draft, stacked on PR #46).
**Source baseline:** current development PR #46 code `403c33a95b29311817c9c53910b07011c4cfa81b`; corresponding PR46 documentation HEAD `4ba7dfd9d2e8b490aeb6d4791da4906cbe573436`.
**Exact verified and deployed executable source SHA:** `77c2a96a870d1ba0e5a0bf766dee1aca541ada8a`.

## RED факти
- У shared header 320px CSS viewport при `html { font-size:200% }`: horizontal scroll overflow 27–28px; mobile nav partially off-screen.
- При збільшеному тексті `.skip-link` із незмінним `top:-80px` виходив у клікабельну область меню, хоч мав бути прихований. Playwright hit testing показав, що `.skip-link` intercepts pointer events. Фокусований skip-link теж блокував меню через неконтрольовану ширину.
- Пошук мов у `<input type=search>` міг споживати Escape, залишаючи dropdown відкритим.

## Зміни
Рівно **три** файли поверх PR #46:
1. `src/styles/global.css`: header gap=8px на <=700px, summary min-width44px, компактний SVG-brand на <=340px; skip-link приховати за власну висоту `transform:translateY(calc(-100% - 28px))` і `pointer-events:none` до focus, при focus обмежити ширину на вузьких екранах, не перекриваючи меню.
2. `src/components/LocaleCatalog.astro`: Escape з фокусованого input закриває меню, очищує пошук, повертає focus на summary. Кешований список з 95 pending не завантажується повторно.
3. `tests/locale-catalog-browser.cjs`: нові keyboard/reflow regressions зберігають всі попередні сценарії.

Не змінено CSS уже перевіреного footer-clearance, 8-slide carousel, шостий CTA, Cloudflare Turnstile/privacy, CRM/Studio, API, auth, Workers, package/lock, D1/SQLite migrations, VPS compose, DNS чи `knaba.de`.

## Fresh QA на exact SHA
- Підключений VPS, ізольований Node24.22.1 Docker `--network none`, уже наявний npm cache, без додаткових залежностей.
- `npm run check && npm test && npm run build && npm run verify:build && node --test vps/*.test.mjs`: всі exit 0, Vitest **20 test files** passed, Astro побудував **99 HTML**. Не видаємо це за фізичний пристрій/клієнтський UAT.
- Локальний Chromium із зібраним сайтом: **16** вихідних locale width cases + **12** розширених font200 width/skip/menu/Escape cases + manifest 503 fallback + same-window uk→de navigation — PASS.
- Browser відтворення RED/GREEN у DE/EN/UK/RU при width320/360/390. Existing PR46 Turnstile/99-language tests збережені.
- Noindex build залишається `VSP_PENDING_APPROVAL` — 95 pending мов не публікуються як перекладені.

## Dev VPS release receipt
- Root-owned immutable release `/srv/knaba/vps/releases/77c2a96a870d1ba0e5a0bf766dee1aca541ada8a`; `current` symlink переключено атомарно з `403c33a95b29311817c9c53910b07011c4cfa81b`.
- Staged build перевірено з тим самим Git source SHA; ідентичні `drizzle/`, `vps/server.mjs`, `package.json`, перевірено `docker compose config --quiet`. Немає DB-міграції.
- `dist/client`: 153 файли, 2,435,888 байтів; детермінований tree digest SHA256 `138d46df30a294d1371a3d8d5a3737f0cd32235817eb31538a1d18f7a8c06a6d`, метод: відсортований relative path + NUL + SHA256 file bytes (не tar hash).
- Compose SHA256 без зміни `6883e120f521cf9251cf3221027cd8b82e609ab0d028511484ac32688f722604`.
- Native SQLite online **pre-switch backup** (0600): `/srv/knaba/vps/state/backups/pre-pr48-77c2a96a870d1ba0e5a0bf766dee1aca541ada8a-20261025T043507Z.sqlite`; SHA256 `1029a5d38baa3682dbe3438d3c369020526b503a10c4e9b25aadca5450945a92`, 217,088 bytes. SQLite integrity_check=ok **до та після**.
- Docker `knaba-vps-internal` healthy. System CA HTTPS200: /, /en/, /uk/, /ru/, /languages.json (99 targets, 4 published, 95 pending), /favicon.svg, /images/knaba-construction-logo.svg, /api/assistant/captcha (enabled, no secret output), /healthz. HSTS max-age=604800 та HTTP noindex збережено. `/readyz` очікувано **503** — реальний owner ще не enrolled.
- **Live post-deploy Chromium**: 12/12 locale search + Escape scenarios, 12/12 font200 reflow, focusable skip, clickable menu. Офіційний сайт/інші VPS-проєкти не чіпалися.
- Після релізу диск shared VPS ~96% used, ~9.1GiB available; жодне чужe сховище не очищувалося.

## Rollback та незакриті гейти
- Попередній immutable app release `403c33a95b29311817c9c53910b07011c4cfa81b` збережено. Для code-only rollback атомарно повернути `current` symlink на old release, recreate **тільки** `knaba-vps-internal` через поточний compose; не відновлювати стару SQLite поверх чинної бази автоматично. Backup доступний лише уповноваженому оператору.
- Фізичний Android/iOS UAT, реальний screen reader/WCAG audit, браузерний genuine 200% zoom (перевірено CSS root text size, а не всі browser-zoom modes), real-human Turnstile challenge, genuine owner enrollment, old Sites/D1 export reconciliation, field CWV/p95, GDPR/owner legal sign-off і customer handover залишаються **NOT_RUN / BLOCKED**.
- PR Draft: **не merge в main** і не переносити на офіційний knaba.de до окремого acceptance/approval.
