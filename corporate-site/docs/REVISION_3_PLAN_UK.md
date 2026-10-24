# KnaBa R3 — органічний пошук і портал

Дата: 24.10.2026. Продовження чинного ziko1/knaba, base a4854e1e4933b26ec9f029237c0dabb07db25e75. Публікація на kneba.vsp.rest дозволена поточним дорученням і попередньою парковкою. Офіційний knaba.de не змінюємо. Нові платні сервіси, рекламу, розсилки не вмикаємо.

## Вимоги та приймання

| ID | Вимога | Критерій | Власник |
|---|---|---|---|
| R301 | SEO/маркетинговий контент і аудит конкурентів | Німецькі сторінки послуг, корисний Ratgeber, карта запитів/намірів/URL, джерела без вигаданих цифр | seo_content |
| R302 | Технічне SEO | Унікальні title/description, schema/breadcrumbs, sitemap/robots, canonical, share-card, індексаційний перемикач для майбутнього офіційного релізу | root |
| R303 | Реєстрація і ролі | Підтверджена хостингом особа; pending за замовчуванням; тільки власник затверджує admin/worker/client; відкликання доступу | portal_backend |
| R304 | Кабінет кожної ролі | Клієнт: заявки/статуси/відгуки; працівник: свої завдання/чеклист/виконання; адмін: заявки/призначення/статуси; власник: погодження ролей й аудит | backend + UI |
| R305 | Заявки без акаунта | Реальне збереження, валідація, захист від повтору/зловживань; зрозумілі помилки; видимість адміністрації | root + backend |
| R306 | Без перезавантажень | Astro ClientRouter для внутрішніх переходів, fetch/TanStack для форм; back/forward та доступність; вхід хостингу потребує окремого захищеного переходу | root + UI |
| R307 | Локалізація | Німецька скрізь за замовчуванням, переклад ключових public/portal flows українською й англійською за наявності завершеного контенту; без неправдивих hreflang | root + UI |
| R308 | Impressum/Datenschutz | Перевірені реквізити офіційного сайту; актуальні посилання; опис фактичних даних/провайдерів; невідомі AVV/retention позначені | legal_audit |
| R309 | Якість і реліз | Тести RBAC/ізоляції/CSRF/персистентності, збірка, перевірка SEO, browser/live основних сценаріїв, незалежний review, конкретний SHA | root + reviewer |

## Архітектурні рішення

Зберегти Astro + Solid/Vue/Svelte/Tailwind/TypeScript/Vite. Статично сформовані сторінки залишають SEO-контент у HTML. Додати Worker API й D1 через наявний Sites, без окремого OAuth/password stack. Sites задає довірену особу; email підтвердженого власника проєкту налаштовується тільки в server secret. Перший відвідувач ніколи не стає адміністратором. Браузер не визначає роль.

Поточний домен тимчасовий: noindex,follow на сторінках з дозволеним crawl, щоб робот міг побачити noindex. Кабінети/API захищаються авторизацією, не robots. Офіційна індексація і перенесення окремим релізом; не обіцяємо трафік, позиції чи продажі без вимірювань.

Performance working budgets before changes: 220 KiB total emitted client JS gzip (all isolated page bundles), 40 KiB CSS gzip, portal API payload bounded. No external tracking/font/image on public load. Existing baseline R2 79,525 bytes all emitted JS gzip and12,548 CSS. Field CWV and human business UAT remain separate measurements.

## Виконання

Shared worktree /workspace/sites/knaba-portal-v3; root owns package, config, Layout, homepage, integration, roadmap/memory. Agents use nonoverlapping scopes. Private queue /workspace/scratch/2991559f892c/knaba-r3-team.sqlite, execution only; this document and existing ROADMAP/PROJECT_MEMORY stay canonical.
