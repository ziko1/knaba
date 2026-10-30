# KNABA Control Center — єдиний кабінет адміністратора
Date: 2026-10-25 · Repo: ziko1/knaba · Source-only Draft · NOT_PRODUCTION_READY

## Рішення (reuse-first)
Один приватний URL: `/admin/` на `kneba.vsp.rest` після окремого QA/deploy.
Не створювати нові таблиці, паролі, авторизацію, CRM чи CMS: використати чинні `Portal`, `CrmConsole`, `AssistantInbox`, `SiteStudio`.

| KNABA Control Center | Існуюче джерело функцій | Ролі |
|---|---|---|
| Огляд | `AdminControlCenter` без вигаданих KPI | owner, admin |
| Замовлення, команда, аудит | `Portal` / `/api/portal/*` | owner, admin (Worker scopes) |
| CRM, контакти, внутрішні нотатки | `CrmConsole` / `/api/crm/*` | owner, admin (Worker scopes) |
| KNABA Assistant, діалоги, пропозиції | `AssistantInbox` / `/api/assistant/owner/*` | owner |
| Вміст сайту, чернетки, публікації | `SiteStudio` / `/api/studio/*` | owner |

### Архітектура
- Astro приватна сторінка `src/pages/admin.astro`; існуючий `Layout` та глобальний стиль сайту.
- Один SolidJS shell: `AdminControlCenter.tsx`, адаптивне меню, DE/EN/UK/RU, закладки з `?view=` і `?lang=`; без full reload.
- Lazy imports компонентів для зменшення стартового JS; не монтувати приховані або недозволені модулі.
- Та сама cookie-сесія через `GET /api/portal/session`, існуючий `/login/?return_to=/admin/` і `/logout/`. Жодних облікових даних у frontend.
- UI role filtering — лише UX. Кожен read/write і надалі дозволяється на сервері/Worker; при невідомій ролі або помилці не показувати приватні модулі.
- Чинні `/studio/`, `/crm/`, `/konto/`, `/postfach/` не видаляються та не переадресовуються — старі закладки/контракти залишаються. З порталу є один головний вхід до Control Center.
- `noindex` в Astro meta, `X-Robots-Tag` і `Cache-Control: private, no-store` для VPS та статичних hosting headers, `robots.txt` disallow. `/admin/` не додається до публічного Studio catalog/sitemap.
- Немає міграцій, нових оплачуваних API, активації ERP/AI/WhatsApp, зміни DNS чи production.

### Приймання й незалежне QA (ще не виконане повністю)
1. Node 24: `npm ci --ignore-scripts`, `npm run check`, `npm test`, `npm run build`, `npm run verify:build`, `node --test vps/*.test.mjs` з фіксацією commit SHA та artifact SHA256.
2. Anonymous, pending, worker, client: `/admin/` не відображає дані. Crafting `?view=studio` для admin не дає доступу до Studio. API повертають 401/403 згідно фактичних прав; доступ admin до CRM зберігає row-level перевірку.
3. Owner: усі 4 модулі працюють на єдиній сесії, CRUD/версії/ідімпотентність не регресують. Admin: CRM + operations. Вхід/вихід, протермінування cookie, відкликання прав, refresh/focus мають перевірятися.
4. Response headers HTTPS GET/HEAD `/admin/`: noindex/nofollow і no-store; `/sitemap.xml` ніколи не містить admin. Публічні маршрути/SEO не регресують.
5. Browser: 320/390/768/1440, 200% zoom, i18n DE/EN/UK/RU, фокус/клавіатура/скрінрідер, lazy JS chunks, помилки/порожні стани, Web Vitals baseline.
6. Дійсний власник мусить бути безпечно підтверджений й активований; запрошення власника — **окрема Draft PR #58**, не вважати випущеною. Живі дані/повідомлення/ERP імпорт не тестувати на production без backup/дозволу.
7. Незалежний security/UX review, staged smoke + rollback відтворення перед дозволом на deploy. Публікація, main merge, live backup/DB/schema зміни залишаються окремими approvals.

### Наступне після P0
- Погодити один набір KPI із реальних API (без фіктивних значень), пріоритетні задачі/сповіщення та фільтри ролей.
- Розмістити ERП як окремий дозволений модуль тільки після reconciliation/identity federation D1 ↔ PostgreSQL; не підміняти CRM.
- Підтвердити справжнього власника, пройти invite/activation/UAT, не розсилати пароль у чаті/пошті.
- Замість дублювання навігації поступово переписати застарілі standalone заголовки на посилання в єдиному shell після browser QA.

### Стан
Код доступний лише в окремій GitHub feature-гілці. Реальний full build/e2e/device, running VPS account, production і owner acceptance не підтверджені цим документом.
