# KnaBa R5 — захист кабінету й відтворювана перевірка артефактів

Дата: 24.10.2026. Продовження **того самого** Draft PR #9 `ziko1/knaba`, базовий commit `a51cb0432655cc762cae18e09321be54e880d814` (R4). Проєкт окремий від AVENQO. Обсяг: лише corporate-site, без змін власних бізнес-даних, D1-схеми, офіційного домену, публікації або merge.

## Підстава для виправлення

Відповіді чинного тимчасового сайту `https://kneba.vsp.rest/konto/` повертали HTTP 200, але під час перевірки заголовків **не містили** `X-Frame-Options` та `Content-Security-Policy`. На сайті є інтерактивні дії власника (погодження ролей), тому залишати можливість чужого iframe небезпечно (clickjacking). Статичний файл `_headers` уже існував, але реальна відповідь хостингу не показала його захисних заголовків. Cloudflare підтверджує, що `_headers` не застосовується до відповідей, які генерує Worker; статичні маршрути можна вибірково запускати через Worker:

- https://developers.cloudflare.com/workers/static-assets/headers/
- https://developers.cloudflare.com/workers/static-assets/binding/

## Реалізація

- `worker/index.ts`: на `/konto` і `/konto/*` для відповіді з ASSETS встановлено `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`, `nosniff`, реферер і дозволи пристроїв.
- `vite.worker.config.ts`: `run_worker_first` додатково лише для приватного маршруту. **Звичайні маркетингові HTML, CSS і JS лишаються asset-first**; додатковий Worker hop для них не потрібен.
- `tests/portal-headers.test.ts`: перевірки заголовків для нормальних/404 маршрутів, відсутності побічних змін інших URL та вибіркової маршрутизації. Фактичний TDD: **3/3 FAIL до виправлення** (пропущені захисні заголовки і Worker-first path), **3/3 PASS після**.
- `scripts/stable-artifact.mjs` і `tests/verify-build.mjs`: другий SHA-256 для **еквівалентності** збірок, в якому нормалізуються лише instance-значення `uid` у відкривальних `<astro-island>`. `artifactSha256` лишається повним byte-for-byte SHA-256 та зберігається обов'язковим доказом конкретного деплою.
- `tests/stable-artifact.test.ts`: 1 тест спершу FAIL при різних UID, після виправлення 2/2 PASS, перевірка зміни вмісту не маскується.

## Перевірені докази

Toolchain: Node.js 24.19.0, Chrome із наявного образу `mcr.microsoft.com/playwright/mcp:latest` на VPS, локальний Wrangler/D1 на **127.0.0.1**, тестові `example.test`-особи. Жодних запитів на зміну реальної бази/домену.

| Перевірка | Результат |
|---|---|
| `npm run check` | PASS; Astro, Vue, Svelte без errors/warnings |
| `npm test` | **52/52 PASS**: 44 Vitest + 8 Node inquiry |
| `npm run build` + `npm run verify:build` | PASS; 25 HTML, внутрішні посилання/SEO метадані PASS, `TEMPORARY_NOINDEX` |
| `npm audit --omit=dev` | 0 повідомлених уразливостей під час перевірки |
| Bundle бюджети | всі JS 107727 B gzip, CSS 17137 B gzip; це не LCP/INP/p95 або network transfer |
| Live R3 заголовки `/konto/` | Виявлено відсутні X-Frame-Options/CSP |
| Локальний R5 Worker HTTP `/konto/` | 200 + CSP frame-ancestors none + X-Frame-Options DENY + no-store PASS |
| Playwright анонімний портал | 320, 390, 768, 1440 px, 200/без overflow/pageErrors, SPA перехід на контакт без full reload PASS |
| Playwright синтетичні ролі | 4 ролі × 2 ширини (320/1440), видимість очікуваних кабінетів/вкладок/записів, без overflow/pageErrors PASS |
| Перевірка ізоляції D1 (локально) | Клієнт не отримує `assignedWorkerId`, працівник не отримує клієнтський email/phone, запити видимі правильним ролям |
| Точний SHA-256 статичних файлів `dist/client` | `e3045c1d1f0c78300a3e6e170f461057e6ded0a028f0923539466c315b522ff2` |
| Нормалізований SHA-256 статичних файлів | `7afa070f33eec660aeccd2faec11b5bb175441bd86a79bf74fec61565f40af08` |
| Точний SHA-256 Worker bundle `dist/server/index.js` | `0060df14d0ab0656fd88dc917989126120953f522737a4477fbd8d643dd13995` |
| Точний SHA-256 цілого дерева збірки `dist/` | `6f14f31bcaef7b4706abbddfc8943e9869e359ec53b4d69a41c07f98607ea3be` |

`dist/`-контрольна сума включає статичні сторінки, Worker-код, runtime-конфігурацію та пакет міграцій. Після локального role-UAT збірку перегенеровано; тестова змінна власника **не потрапила** до production build config.

Нормалізований хеш окремо обраховано для двох попередніх R4 build output: raw були `e0ae64c7...` та `e3045c1d...`, normalized обидва збігаються. Три змінені HTML-файли відрізнялися лише згенерованими Astro UID. Нормалізований hash R5 також збігається, тому існуючі сторінки й client bundles залишилися еквівалентними R4 у межах нормалізації.

Локальний тимчасовий сервер з окремою тестовою D1-базою зупинено; порт закритий. Повторно використовувані дані цієї локальної перевірки не містять реальних персональних даних.

## Ризики та ворота

- **Live R5 НЕ розгорнуто.** Докази header protection у локальному Wrangler не прирівнюються до поведінки Sites на `kneba.vsp.rest` до окремо авторизованого staging/release test.
- **Реальна авторизація через Sites/ChatGPT та human owner/worker/client UAT NOT_RUN.** Синтетичні заголовки і тестові облікові записи в локальному середовищі — лише функціональна перевірка.
- Незалежний код/security review R5 іншим рев'юером ще не підтверджено; цей аудит поточної сесії не вважається таким.
- Статичні заголовки для інших сторінок на live можуть не застосовуватись хостингом. Host-level policy для official release треба окремо підтвердити без збільшення latency усіх сторінок.
- GDPR/AVV/дані за межі ЄС, retention/export/delete, backup/restore rehearsal, ScreenReader/200% zoom/реальні пристрої, field CWV і p95 API залишаються відкритими.
- Не додавати нові неперевірені фічі, платні сервіси, автоматичні повідомлення, CRM, аналітику, рекламу; жодної гарантії SEO-трафіку.

## Відкат і рішення

Кандидат R5 — лише GitHub Draft PR #9. До deploy жодної міграції/даних/домену не змінено. Якщо незалежний review або живий UAT заблокує R5, відкотити лише R5 diff до R4 `a51cb04`, без втручання в D1. Наявний R3 на `kneba.vsp.rest` залишається незмінним. Релізна рекомендація: **НЕ ГОТОВО до офіційної публікації** без відкритих воріт вище.
