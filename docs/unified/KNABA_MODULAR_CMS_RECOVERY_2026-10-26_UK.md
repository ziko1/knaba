# KNABA — модульна CMS/ERP: recovery checkpoint 2026-10-26

**Статус:** source-only Draft candidate. Не merged `main`, не production deploy, не customer-ready.

## Походження / no overwrite

- Початковий тестовий VPS: `/srv/knaba/vps/current` → source `0721d55c6673b1e4324c68daf41a82b4a7a7ee2e`; runtime manifest `customerReady:false`, 130 HTML pages.
- Ізольована гілка `feat/knaba-modular-cms-erp-source-20261026` базується на exact live source. ERP взято тільки з PR #86: HEAD `8d2ae8aa30dfa70c1c5aabddf6f7cd6657dc53b1`, immutable `erp/` tree `d7022fdce70548ff64f0ce3e27b8408baa24bdb9`.
- Імпортовано 562 нових Git-файли: ERP, canonical rules, package, scripts, integrated docs. Жодного видалення чи перезаписування `corporate-site/` при імпорті.
- Existing CMS/CRM/inbox/portal, Worker, D1-style SQLite and schema/journal, PostgreSQL ERP source, secrets, uploads, versions, backups and VPS deployment pointers залишені без руйнівних змін.
- На VPS виявлено близько 100 старих KNABA checkout з деякими uncommitted/staged changes. Вони не очищалися, не force-push-илися і не змішувалися без Git ancestry/test review. Work-only cloud filesystem недоступний через цей конектор, тож невидимі Work changes не вважати відновленими.

## Реальні модулі, права, зворотна сумісність

`src/lib/admin-modules.ts` містить типізований реєстр, `admin-access.ts` — існуючий import-compatibility контракт, `src/components/AdminModuleOutlet.tsx` — тонкий lazy adapter без нового backend. Керування йде через вже наявну `/admin/` оболонку.

| Site module | Admin view | Стара адреса | Ролі | Статус |
|---|---|---|---|---|
| Portal operations (не повний ERP V4) | operations | `/konto/` | owner/admin | bundled site |
| CRM & contacts | crm | `/crm/` | owner/admin | bundled site |
| Assistant owner inbox | messages | `/postfach/` | owner | bundled site |
| Site Studio CMS | studio | `/studio/` | owner | bundled site |
| ERP V4 | **немає** | **немає** | окремий auth | source-only, НЕ integrated |

API авторизація/tenant isolation залишається **серверною**. Навігаційний реєстр не видає привілеї. Заборонено підключати ERP через browser-origin токен/фальшивий owner login. Майбутній модуль: додати manifest → lazy adapter → i18n labels → серверні role/tenant scope → тести; старі маршрути залишити.

## Можливість розгортання без дублювання хостингу

- `deploy/knaba-modules.json`: machine-readable preview-only inventory (4 bundled same-origin + 1 disconnected ERP source). `npm run verify:modules` — read-only fail-closed validator із negative tests; НЕ виконує deploy/міграцію.
- Для site використовувати чинний Node24/Astro build і наявні `corporate-site/vps/docker-compose.yml`, `corporate-site/vps/RELEASE_AND_CUTOVER_UK.md` та immutable releases under `/srv/knaba/vps/releases/<sha>`; не створювати другу CMS/SQLite, новий production route або незворотну міграцію.
- ERP V4 зі своїм NestJS/PostgreSQL API має окремий lifecycle, release gates, identity і дані; full bridge тільки після versioned signed outbox/inbox, exact tenant mapping, Postgres tests, rollback.
- Перед будь-яким test-site rollout: новий source/artifact SHA, clean repo, no concurrent current pointer change (CAS + 2 locks), достатньо місця (<90% used), verified SQLite online backup + окреме restore, schema ledger, unchanged persistent volumes, exact previous release pointer, HTTPS route/health/ready, backup/off-host receipt. Якщо gate FAIL/BLOCKED — тільки Draft PR, без deploy.
- `npm run audit:release` має fail-closed вихід до проходження повного KNABA G8–G10. Ні GitHub push, ні unit test PASS не доводять готовність до релізу.
- `knaba.de`, One.com, SEO indexability, owner/private datasets, production merge, paid AI/WhatsApp/voice/GPS providers не змінювалися. Work/provider credit balance UNKNOWN.

## Next acceptance: не позначати готовим без доказів

1. KN-U07 D1↔Postgres bridge; source PR #67/#87, reconcile historical SQL 0005 collisions, no live ledger rewrite.
2. Full ERP V3/V4 actual SQL/API/native/device tests and role/site/company authorization, real owner/client UAT.
3. Verified company consent, employee/owner inbox delivery, privacy/retention, physical responsive/a11y/200% zoom, p95/CWV.
4. Independent code & security review, off-host restore, staged preview and reversible smoke, then explicit official release approval.

Публікувати тільки у новому Draft PR, з точними PASS/FAIL/BLOCKED тестами на конкретному SHA, без claims про виконаний production deploy.
