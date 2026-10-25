# KNABA — колізія KNABA Assistant і юридичних посилань футера (25.10.2026)

## Межі роботи
- Лише публічний **development** домен `https://kneba.vsp.rest/`, не офіційний `knaba.de`; без merge `main`.
- Початкова база: PR #36, SHA `05bd49af3f230896d46a9a95c33039269786d0dd`. Перевірений і розгорнутий **code SHA** `f58f6b03780c36e0b89a6c8ba3d851be0a991b84`.
- Без змін ERP, CRM, auth, SQLite migrations, public lead-контрактів, provider dispatch, секретів, Docker Compose, DNS та SSL.

## Виявлено RED
На live сторінці `/uk/leistungen/` у реальному Chromium перед виправленням `[data-knaba-open]` перекривав `Конфіденційність (DE)` на ширинах 360, 390, 480, 600, 760 px, а на 768, 1024, 1440 px — **обидва** юридичні посилання. 320px не мав перетину. `scrollWidth-innerWidth = 0`.

## Реалізовано GREEN
- У `src/styles/global.css` горизонтальна резервація біля останнього рядка футера: 220px для desktop/tablet, 76px до 760px; wrap довгих написів. Це не додає великої порожньої висоти під футером.
- Мінімальна висота мобільних legal links 44px.
- Розширено `tests/mobile-footer-browser.cjs`: 4 локалі × 8 ширин [320,360,390,480,760,768,1024,1440]; перевірки реального футера, горизонтального overflow, фізичного перетину hitbox Assistant і legal, 44px touch targets; 4 наявні synthetic short-page tests збережені.
- До змін випробуваний CSS у live Chromium через injected style: усі перевірені 320–1440px без перекриття. Це був лише дослід, не окреме розгортання.

## Докази точного коду
На `f58f6b03780c36e0b89a6c8ba3d851be0a991b84`:
- Ізольований кеш залежностей, Docker Node `v24.22.1`, network=none: `npm run check && npm test && npm run build && npm run verify:build && node --test vps/*.test.mjs` — усі команди exit 0.
- Static build: 99 HTML; VSP noindex перевірено.
- Live/local static Chromium: 32 localized viewport cases + 4 synthetic short-page cases — exit 0.
- Зібраний `dist/client`: **151 файлів**, 1,941,230 B. Tree SHA256 `20c37b57e8a4ce7161f540ce66c6434a55136cfe7b35bedd57fc06ea49e2c71a` обчислено детерміновано з відносного шляху, NUL та SHA256 вмісту кожного відсортованого файлу. Це **не** tar/ZIP digest.
- Під час тестів tracked `docs/build-verification.json` оновлювався в ізольованому тимчасовому checkout; тимчасові каталоги прибрано. GitHub source branch із цих QA процесів не змінювалася.

## Dev deployment + відкат
- Новий незмінний реліз: `/srv/knaba/vps/releases/f58f6b03780c36e0b89a6c8ba3d851be0a991b84`, активний через `/srv/knaba/vps/current`.
- Попередній реліз `90d3701fb06b5d82e632a3d2db01e983a9ba45f0` збережений, може бути повернутий атомарним code symlink switch та recreate **тільки** Compose service `web`. Не відновлювати SQLite поверх живої БД автоматично.
- Compose SHA256 **без зміни**: `6883e120f521cf9251cf3221027cd8b82e609ab0d028511484ac32688f722604`. Каталоги `drizzle/` старого/нового релізів ідентичні.
- Перед перемиканням: SQLite `integrity_check = ok`, 217,088 bytes. Online backup: `/srv/knaba/vps/state/backups/pre-footer-f58f6b03780c36e0b89a6c8ba3d851be0a991b84-20261025T024604Z.sqlite`, SHA256 `5ae559b5966ec3d31edfe71838046fb72e4a6db3d2e0a91dfde576feba4e0b43`, режим 0600.
- Після перемикання: container `knaba-vps-internal` **healthy**; system-trusted HTTPS 200 на /, /uk/leistungen/, /ru/leistungen/, /en/leistungen/, /favicon.svg, /images/knaba-construction-logo.svg, /api/catalogue.json, /healthz; `noindex` в HTTP header + HTML, Büroreinigung немає в публічному JSON.
- Після deployment live Playwright Chromium: 32/32 locale-width, 4/4 synthetic short-page; SQLite `integrity_check = ok`.
- `/readyz` = **503 очікувано**: справжній owner ще не onboarded; це не сертифікація customer-ready.
- Спільний VPS все ще близько **95%** використаного диска (~11 GiB вільно); жодної автоматичної чистки сторонніх сервісів/даних.

## Залишається відкритим
Physical Android/iOS UAT, 200% browser zoom, real assistive technology, field CWV/p95, незалежний людський review, реальний owner enrollment, GDPR/legal signoff, ChatGPT Sites/D1 data export та production handover. Зовнішні AI/WhatsApp/email провайдери не активувалися, нових платних підписок не створювалося. Усі інші релізні ворота з PR #36 та `vps/BACKLOG.md` залишаються чинними.
