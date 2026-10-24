# KNABA Studio: CMS + CRM + Portal (24.10.2026)

## Верифікована основа

Repo: ziko1/knaba. Новий кандидат: codex/knaba-unified-cms-crm-20261024.
Базова гілка: codex/knaba-official-company-alignment-20261024,
базовий SHA: 2c05dbd1b2d4eccb0330502bad801ea287fbd4be.
Це окремий candidate без merge, без production deployment і без запуску платних сервісів.

Повторно використано раніше створені компоненти редактора із локального
codex/knaba-admin-visual-editor-20261024, а не створено конкурентний редактор.
Оригінальну міграцію старої гілки 0001_skinny_micromacro.sql НЕ перенесено,
щоб не затерти нову міграцію 0001_wet_nick_fury.sql з Assistant.
ERP та її canonical AGENTS/specs лишено без змін.

## Одна панель управління

Шлях: /editor/ (закритий на edge для анонімних користувачів).

* CMS: текстовий візуальний редактор маркетингових h1/h2/h3/p, вибір сторінки,
  чернетка, перегляд, контроль версій, публікація, історія і відновлення
  опублікованої версії у нову чернетку. Ліміт 80 блоків/сторінка,
  1400 символів/блок, 32768 байт/тіло. HTML/CSS/JS, форми, правові,
  login і портал сторінки не редагуються. Відсутні поки asset upload/SEO/template CRUD.
* CRM: дійсні контакти з вже наявних заявок (cleaning_requests).
  Дедупліковано email; доступні пошук, pipeline stages, теги, приватні нотатки,
  версійність, аудит, обмеження authenticated CRM reads/writes. Перші 100 результатів (з індикатором обмеження),
  максимум 40 нотаток. CRM pipeline не змінює автоматично статуси замовлень.
* Operations: без повторного переписування відкривається наявний Solid Portal
  з заявками, ролями, працівниками і owner Assistant inbox.

## Безпека і контракти

Owner/approved admin лише за серверною сесією, інші отримують 401/403
через API, або 404 для /editor/, /editor/index.html та приватного preview.
Операції вимагають same-origin + X-KnaBa-Request: portal-v1, JSON розміру,
серверну роль, параметризовані SQL, optimistic concurrency та audit.
Необхідно переконатися, що реальний Sites identity dispatcher достовірно
видаляє неперевірені client-supplied oai-authenticated-user-* headers.
Локальний тест із синтетичними заголовками ЦЬОГО НЕ ДОВОДИТЬ.

CMS API:
GET /api/editor/page?path=...
PUT /api/editor/draft
POST /api/editor/publish
POST /api/editor/restore

CRM API:
GET /api/crm/contacts?q=...
PUT /api/crm/contacts/:sha256-normalized-email
GET /api/crm/contacts/:id/notes
POST /api/crm/contacts/:id/notes

SQL migration: drizzle/0002_lively_scrambler.sql.
Адитивні таблиці cms_pages, cms_history, crm_contact_state, crm_contact_notes;
збережено раніше існуючі cleaning_requests, portal_* та assistant_*.
SHA256 email — тільки технічний ідентифікатор, НЕ токен доступу.
D1 це intake/website data; ERP PostgreSQL лишається truth for
tenants, employees, jobs, time, billing, invoices, money.
D1->Postgres event bridge із stable tenant ID та outbox/inbox поки НЕ готовий.

## QA, measured locally, NOT production acceptance

VPS vsp, Node 24.21.0 і той самий package-lock SHA256, що й у вже
інстальованих залежностей; без нового npm install.
- npm run check: PASS, Astro 94 файли, 0 errors/warnings; Vue/Svelte 0 errors.
- npm test: PASS, 96/96 Vitest + 8/8 Node, CMS 9, CRM 7.
- npm run build: PASS, 52 HTML-сторінки і Cloudflare Worker bundle.
- npm run verify:build: PASS після оновлення verifier на 52 сторінки,
  noindex Studio і Worker-first protected API route checks.
  Final local dist/client artifact SHA256: 141181dc0e444bf18cb83e072c0d37ceb49a295fbe839f6b3de1127ff60f30c4.
- Wrangler local D1 0000/0001/0002: PASS, fresh sandbox; real D1 NOT_RUN.
- Wrangler local HTTP: anonymous Studio/preview hidden, CMS/CRM 401,
  owner synthetic routes 200; чернетка не віддається публічно,
  після local publish публічна копія оновлена — PASS.
- Browser physical mobile, real owner login, provider edge auth,
  GDPR/export/retention, ERP PG integration, p95/CWV, backup/restore,
  accessibility та незалежний security-review: NOT_RUN.

Локальні журнали: /tmp/knaba-unified-cms-crm-qa-20261024/.
Результати стосуються ізольованого source candidate, не live kneba.vsp.rest.
Нових оплачуваних сервісів не активували. Реальний баланс невідомий.
VPS df при перевірці: 197G size, 173G used, 14G free (93%).

## Безпечне впровадження та відкат

Не виконувати міграцію на live базі до snapshot, dry-run, перевірки
backup/restore, видалення PII і owner UAT. Якщо код треба відкотити,
повернути попередній перевірений Worker + assets; нові таблиці не видаляти
до експорту/відновлення, не змінювати ERP і canonical site content.
Не вмикати платні LLM, email, WhatsApp. Стадійний реліз лише після
перевірки edge-issued identity і згоди замовника.

## Наступний незалежний backlog

P0: verified edge identity and scope, GDPR retention/erase/export,
owner UAT, audit, actual DB migration + rollback and independent review.
P0: D1->PostgreSQL versioned scoped bridge with idempotency and reconciliation.
P1: secure media library/licensing/alt, SEO title/description/structured data,
visual sections/templates/reordering, rich locale publishing review.
P1: CRM customer timeline, activities/tasks/calendar, consented operator
notifications, pipeline analytics, reliable status sync; AI actions only
through reviewed scoped tools and approvals.
P1: real browser+phone, keyboard/screen reader/zoom, frontend/Web Vitals,
performance p95 and caching baseline. Owner handover after every gate.
