# KNABA — узгоджені PR #73, #74, #75 (26.10.2026)

## Походження й архітектура
- За основу взято Draft PR #73 на SHA f0d2f6f0207473e605409090d46bb3b209fb7fdf. Дві зміни PR #74 (c6941de, 367e6e9) перенесені поверх нового HEAD, а не замість інших актуальних виправлень PR #73.
- Єдиний компонент PartnersSection.astro та єдина колекція src/data/partners.ts для всіх чотирьох мов; ConstructionPartners.astro не додавався. П'ять локальних зображень із PR #75 відповідають порядку GOLDBECK, BONAVA, HIT, Stromkreis, Gewobag. Візуальна сітка PR #73 збережена.
- 01: наявний SVG. 02–08: сім різних оптимізованих WebP 960x550 загалом 421428 B (з PR #74). Декоративне alt="" дозволено виключно у прихованих для assistive tech контейнерах, текст послуг лишається читабельним.
- CSP і build-верифікатор дозволяють тільки локальні партнерські зображення; не відправляємо IP користувачів у зовнішній image CDN. Оновлена інформація Datenschutzerklaerung DE/RU. Навігаційні переходи на старий сайт заборонені.

## Перевірки, лише ізольована збірка
- node:24-bookworm-slim (Node 24.22.1), npm ci, Astro/Vue/Svelte check — PASS; Vitest 165/165 PASS; native Node groups 36/36, 27/27, 11/11 PASS; Astro/VPS build PASS.
- verify:build PASS, 121 вбудована сторінка, перевірка SEO, internal link targets і семантики; збірковий artifact SHA256: 35c3a7d77de782a4f2694815276be6938fc0e1abc77c7d02575e74644bea6e74.
- Ізольований localhost: 121/121 HTML-сторінок HTTP200 та без клікабельних knaba.de URL; 12/12 нових локальних зображень HTTP200 і точна відповідність байтів.
- Виправлено застарілу перевірку Studio 88 -> 92 (додані чотири сторінки галереї). Source QA НЕ підтверджує live-host або реальні пристрої. Браузерна перевірка має окремі артефакти.

## Незакриті публікаційні критерії
- **RIGHTS HOLD.** Те, що логотип видно на knaba.de, не надає автоматично права повторно його хостити й публічно повідомляти про чинні партнерські відносини. Потрібне документоване погодження власника KNABA / належного правовласника; не копіюємо чужі фото і не додаємо бездоказових сертифікацій.
- **READINESS HOLD.** Попередній /readyz 503 owner enrollment required означає безпечний блокер запрошення власника. Не обходити автентифікацію/ERP/БД.
- **QA HOLD.** Потрібні остаточний незалежний review, реальна browser/mobile keyboard/accessibility/zoom перевірка, власницька перевірка перекладів і підтвердження прав.
- **DEPLOY HOLD.** Сайт kneba.vsp.rest лишається без змін. До майбутнього дозволеного cutover: off-host backup Git і стану/файлів/DB/volumes; перевірений rollback; CAS-заміна release; postdeploy verify:live на всіх локалях, 12 media, exact commit + artifact. Main, DNS, knaba.de НЕ чіпати.

QA-команди для відокремленого build checkout: npm ci --no-audit --no-fund, npm run check, npm test, npm run build, KNABA_RELEASE_MODE=vsp npm run verify:build. Браузерні npm run test:logo:browser, test:visual, test:reflow тільки на loopback KNABA_TEST_URL.

## Latest-source QA receipt — 26.10.2026

- Updated PR #73 baseline: SHA 15f44511a57add6f3c058c7b8ca2158da4cf6403; candidate source checkpoint SHA 5cdec8cd48167cc07a9a4bac12a86ff92763798b, prior to these evidence-only document edits. New upstream updates to partner-card sizing, privacy-copy removal and Studio release contracts were preserved.
- Node 24.22.1 final source: clean offline npm ci, check, Vitest 165/165, native 36/36 + 27/27 + 12/12, build and verify:build — PASS. Built client artifact SHA256 bf1bfa09bf3a38862a3b2ec8bdebfa236f307333b009c0ba1fa879abb22d49e2. Tests are scoped to source-built isolated candidate, NOT to live VPS release.
- Loopback browser/HTTP on this code: 121/121 static HTML routes, 12/12 local media byte equality PASS; no clickable outbound knaba.de links. Chromium browser screenshots/test logs are stored in an isolated QA workspace; browser device status must be reported only on final browser job success.
- Live kneba.vsp.rest independently returned gallery 404, readyz 200 on this date and had an active release symlink updated concurrently by another process. Treat live SHA as independent; no release cutover performed here.
- Mark local screenshots as QA evidence, not publication of partner marks; rightsholder/customer approval still OPEN. CDN privacy dependency removed; release checklist and rollback still OPEN.

## Final browser evidence, same 15f-based source snapshot

- Containerized Chromium with a confirmed existing browser binary: 16/16 localized 3D-logo viewport cases PASS, 24/24 four-locale visual/SEO/service cases PASS, and 6/6 CSS-width 200%/400% reflow+keyboard cases PASS. All five real local partner images were scrolled into view and decoded, and seven 2D WebP carousel artworks were decoded on UK 390px. Screenshots: knaba-de-desktop-1440.png, knaba-uk-mobile-390.png, knaba-uk-partners-390.png; workspace /tmp/knaba-unified-visual-20261026 on authorized QA VPS. Real device/actual browser zoom and external legal QA remain NOT_VERIFIED.
- Latest candidate verified at git SHA 5cdec8cd48167cc07a9a4bac12a86ff92763798b, before evidence-only metadata commit, and built artifact SHA256 bf1bfa09bf3a38862a3b2ec8bdebfa236f307333b009c0ba1fa879abb22d49e2. Recheck exact remote tree after GitHub publish.
