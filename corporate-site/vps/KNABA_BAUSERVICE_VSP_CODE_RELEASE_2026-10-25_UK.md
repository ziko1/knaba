# KNABA — оновлений BauService VPS-реліз (25.10.2026)

**Стан:** DEVELOPMENT_SITE_CODE_DEPLOYED / CUSTOMER_HANDOVER_BLOCKED.
**Ціль:** лише https://kneba.vsp.rest/. Офіційний knaba.de (One.com), AVENQO, AI Team та пошта не змінювалися.

## Що реально розгорнуто

- Git source commit: 87b6fb49a658e60781d35c44f2667d720dfcf6ac на окремій Draft-гілці codex/knaba-baureinigung-vps-release-20261025, над PR #34 (база d571832fde7a10b19936ca9321b0de4c661ebf7d).
- Git source зберігає поточний будівельний бренд, послуги, Baureinigung, BauService, чотири мови, 99 статичних HTML, Portal, KNABA Assistant, SSR Site Studio + CRM. Це **не** попередня 51-сторінкова версія.
- Діючий каталог: /srv/knaba/vps/releases/87b6fb49a658e60781d35c44f2667d720dfcf6ac. Конфігурація docker-compose.yml змінена **не була** (SHA256 6883e120f521cf9251cf3221027cd8b82e609ab0d028511484ac32688f722604), тому підтримано поточний Let's Encrypt, localhost binding, Traefik HTTPS, постійний HTTP->HTTPS redirect і HSTS 7 днів. Єдиний сервіс, який recreate: knaba-vps-internal.
- Точний build artifact dist/client tree SHA256: a956d0e0ac8bdd4243733087b089958df361dd2dbb331311c12e51f291eef4b9; перевірений режим KNABA_RELEASE_MODE=vsp і KNABA_VSP_INDEX_APPROVED не заданий — VSP_PENDING_APPROVAL.
- Запобіжник пошуку: meta noindex, HTTP X-Robots-Tag noindex/follow, порожній sitemap; повернення індексації тільки після юридичного/власницького погодження і окремого owner-approved build-time KNABA_VSP_INDEX_APPROVED=1. Синтетичний тест із прапорцем 1 згенерував 68 URL, але **не встановлювався на VPS**.

## Докази, перевірені на exact candidate і live

- На Node24.22.1 (no-network Docker): Astro+Vue+Svelte 141 files, 0 errors/0 warnings, 4 hints. Vitest 106/106, Node inquiry 8/8, VPS Node tests 14/14 PASS. Build 99 HTML та verify:build PASS.
- Ізольований Node Docker --network none, no published ports, на копії live SQLite: DE/EN/UK/RU, BauService, Studio/CRM, favicon/logo, строгий Host/TLS/HSTS, випадок підробленої ролі, noindex і 401 для анонімного CRM — PASS; реальні provider запити: 0.
- Після публічного перемикання: HTTPS verify=0, /, /healthz, /en, /uk, /ru, /bauleistungen/kernbohrungen, /uk/bauleistungen/durchbrueche, /studio, /crm, logo: 200; HTTP -> same-host HTTPS постійний redirect (під час перевірок міг бути 301 або 308); X-Robots-Tag noindex/follow і Strict-Transport-Security max-age=604800; sitemap 0, CRM без сесії 401.
- Live Chromium на 320, 390, 768, 1280 px: 24/24 маршрути пройшли, без горизонтального переповнення та JS pageerror. Сторінки входу 4/4 також доступні. Це не UAT із реальним власником або тест фізичного телефона.
- Docker health = healthy. /readyz = 503 (справжній KnaBa owner ще не зареєстрований); не підміняти synthetic owner.
- Фактична SQLite цілісна: PRAGMA integrity_check=ok, counts для vps_users, cleaning_requests, assistant_messages, studio_pages збігаються з predeploy backup. Не було DB-міграцій, обнулення чи перезапису клієнтських даних.

## Backup і rollback

- Protected SQLite online backup: /srv/knaba/vps/state/backups/pre-baureinigung-vsp-87b6fb49a658-20261025T011357Z.sqlite, SHA256 5ae559b5966ec3d31edfe71838046fb72e4a6db3d2e0a91dfde576feba4e0b43; mode 0600.
- Protected Docker Compose rollback-copy + попередній реліз d571832fde7a10b19936ca9321b0de4c661ebf7d збережено. Операторська технічна квитанція: /srv/knaba/vps/rollbacks/deployed-87b6fb49a658e60781d35c44f2667d720dfcf6ac.json.
- Два обережні попередні rollback в цьому сеансі: перший через помилкову тестову shell-перевірку порожнього sitemap (grep/pipefail), другий через надто суворе припущення HTTP redirect 308 замість фактичного 301. Після кожного source symlink повернуто й старий здоровий контейнер перевірено. Третє перемикання пройшло із перевіркою exact HTTPS Location, SSL і всіх P0 маршрутів. Ніякого відновлення старого SQLite поверх живого не робилося.
- Відкат коду: лише після нових перевірок переключити /srv/knaba/vps/current на збережений d571... і recreate **тільки** knaba-vps-internal з незмінним Compose; ніколи не замінювати базу автоматично. DNS не змінювати без окремого погодження.

## Невиконані критерії клієнтського релізу

1. Стара ChatGPT Sites D1 із заявками, профілями, чатами, consent/історією не експортована й не відновлена в незалежному середовищі. Старий Sites проєкт **не видалено**.
2. Відсутні перевірений реальний owner password/account, ролі staff/client/admin, погоджена функціональність будівельних робіт, юридичні тексти та GDPR AVV/retention.
3. Немає незалежного security reviewer, повного реального owner/customer UAT, польових Web Vitals або підтвердженого відповідального за всі заявлені додаткові будівельні послуги. Email/WhatsApp/генеративний AI OFF.

**Висновок:** live розгортання коду успішне, але production-ready handover не підтверджений.
