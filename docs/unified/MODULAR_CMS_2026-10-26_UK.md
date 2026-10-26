# KNABA — модульна CMS та ERP: інтеграційний checkpoint 26.10.2026

**Статус: SOURCE-ASSEMBLED / RUNTIME-INTEGRATION-NOT-ACCEPTED.** Не production-реліз і не дозвіл змінювати реальні БД, DNS, платежі чи надсилати повідомлення.

## Перевірено перед реалізацією

- Новий source base: чинний Draft PR #93 `5196af9f9781312dc2d26e5afb74da31c7daa9eb`, `corporate-site/` Git tree `ea95724d33a6fbf4acdf55c4b7729597b02187ef`. Сайт, Studio, CRM, Assistant, customer Portal і чинна public-архітектура зберігаються.
- ERP імпортовано як незмінене Git tree `d7022fdce70548ff64f0ce3e27b8408baa24bdb9` із перевіреної гілки PR #86 (`8d2ae8aa30dfa70c1c5aabddf6f7cd6657dc53b1`). Його `erp/AGENTS.md`, V3/V4 вимоги, Android/iOS, API, worker, PostgreSQL і deploy assets не змінено.
- Правила та документи `docs/unified/`, `scripts/`, кореневі `AGENTS.md` і `package.json` імпортовано адитивно. Історичні source/CI receipts не стали новим acceptance.
- Незакомічені файли нової авторизації з VPS збережено окремо в Draft PR #95 (`47169b1ffbe9cac9f7a25cc93345ec7e7b07b4be`). Вони ще не безпечно інтегровані, і їх не можна застосовувати старою базою поверх нової.

## Єдина оболонка, без другої CMS

- **Mounted у поточному вебсайті:** Operations (існуючий Portal), CRM (CrmConsole), owner Messages (AssistantInbox), owner CMS (SiteStudio). Модулі перевикористовують існуючі компоненти, session API і server-side RBAC; реєстр модулів — лише для інтерфейсу.
- **ERP source-only:** ERP Core, HRM/зміни, ресурси/склад, фінанси, аналітика. Всі вихідні модулі наявні у `erp/` та продовжують підтримувати власні API, базу, міграції, тести. Публічний shell явно позначає, що runtime-інтеграція не активована. Жодного `iframe`, підставного SSO, неавторизованого `/erp` або дублювання CRM-таблиць.
- Незалежна версія і статус кожного модуля: `state=mounted` лише коли фактичний компонент є частиною веб runtime; `state=source-only` не створює кнопок переходу чи фіктивних прав. Сервер НЕ читає client module registry для authorisation.
- Масштабування: додавати нові модулі в `corporate-site/src/lib/admin-module-registry.ts`, підключати ліниво завантажуваний компонент у `AdminControlCenter.tsx` **лише після** серверних contracts і security gates. Не створювати другий state/store/router/автентифікацію без підстав.

## Розгортання ізоляцією

1. **Збірка без запуску:** Node 24, `npm run check:site && npm run test:site`, `npm run check:erp && npm run test:erp`, модульні browser/e2e тести. Дані — лише synthetic/test; релізні receipts прив'язати до exact SHA та artifact hash.
2. **Сайт:** залишити чинний VPS Worker/SQLite/D1 adapter, зберегти існуючий `corporate-site/vps` deployment і атомарний CAS+lock поточного symlink; не замінювати активну схему.
3. **ERP:** окремо через чинний `erp/infra/compose.yml` із PostgreSQL17, API, worker та bootstrap. Для TEST потрібні приватні `DATABASE_URL`, `AUTH_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, exact `GIT_SHA`; ніяких provider secrets у git чи нових платних ресурсів без дозволу. Production seed вимкнений існуючим contract. Не запускати `compose up` на live DB без резервної копії, restore drill, staged migration preview і дозволу.
4. **Два runtime:** до авторизованого bridge це **один monorepo / одна навігаційна концепція, але не єдина бізнес-БД чи SSO**. Потрібна стабільна server-issued identity + company/site mapping, не email або браузерний role claim.
5. **Versioned bridge:** використовувати `docs/unified/INTEGRATION_CONTRACT.md` тільки як PROPOSED. Потрібні scoped outbox/inbox, unique event ID/idempotency, bounded retries + DLQ, replay protection, 403/404 tenant isolation, GDPR, міграційний dry-run і rollback. Заборонено повторно імпортувати lead або переносити гроші по непідтверджених подіях.
6. **Blocker:** у різних гілках було два різних `0005`-міграційних призначення — ERP bridge та public reviews. Нічого не застосовувати до спільної чинної бази до ledger reconciliation; site D1/SQLite і ERP PostgreSQL мають незалежні схеми.

## Приймальний статус

- **Source preservation:** перевіряється Git tree/binary equality; без видалення чинних файлів.
- **Navigation registry:** unit tests мають довести точні admin/owner role visibility, відсутність tenant-claim на клієнті, відсутність непідключених ERP-маршрутів.
- **Node24 full site + ERP suites, браузер 320/390/768/1440, physical mobile, P95, SSO/bridge Postgres, real delivery UAT, backup/restore, legal/rights, provider/quotas:** відкриті до отримання фактичних доказів на одному build/commit.
- `npm run audit:release` fail-closed. **Жодного merge в main, офіційного knaba.de cutover або production-активації** з цього checkpoint.

Наступна залежна задача: порт незалитого AuthHub після виправлення відсутнього CSS та незалежної перевірки CSRF/OTP/signup/owner-role; потім ERP BFF/bridge зі staged PostgreSQL і тестами. Не обривати активні незалежні роботи інших гілок.

## Корекція source-audit після компонування

Чинний preview-сайт перейшов з `PublicAssistant.tsx` на `KnabaAssistant.tsx`; історичний імпорт зберігається через незмінний `IMPORT_COMMIT`/`IMPORT_TREES`. Root provenance validator перевіряє **фактичний поточний** компонент `KnabaAssistant.tsx` замість більше неіснуючого path. Це не скасування жодного QA або правового gate.
