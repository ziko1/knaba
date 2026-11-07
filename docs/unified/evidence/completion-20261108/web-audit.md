> Інвентар бази до виправлень; актуальний результат кандидата — verification.json і COMPLETION_PLAN_2026-11-08_UK.md. Датовані вихідні findings збережено.

# KNABA — аудит web source, 08.11.2026 Europe/Berlin

Base: `557838e23356cb463f273803099ab6321e675019`, `/root/web_audit`. Результат джерел і ізольованих тестів, не live acceptance.

## Поточні підтверджені можливості

| Модуль | Що є в коді | Обмеження / потрібний доказ |
|---|---|---|
| Публічний сайт | Astro, DE/EN/RU/UK повні дерева і PL/LT основні сторінки, services/guides/gallery, sitemap/robots, canonical, локалізовані форми | Не всі юридичні й спеціальні матеріали PL/LT перекладені; поточний сервер/artifact не звірено |
| Авторизація | VPS password login scrypt, hashed sessions 12h, same-origin mutations, user suspension, rate limits, password change with all-session revocation | forgot-password є сторінкою контактів, не self-service reset. OIDC source існує, real provider configuration/delivery не підтверджені |
| Онбординг | Owner invitation, invited client/worker/partner/Bauleiter, access-request queue та approval, isolated developer workspace | Реальна owner identity, email proof, sender, ERP identity mapping залишаються окремими gates |
| Кабінети | worker/client/partner/Bauleiter/admin/owner, scoped requests, workflow status, schedule, checklist, worker notes/customer feedback; paginated records and profile directories | Web roles не дорівнюють ERP permission model; live role/device journeys потрібні |
| Чат кабінетів | `worker/portal-messages.ts`, member validation, request-scoped contacts/history, pagination | Це окремий site chat, не доказ ERP SITE_INTERNAL/SITE_CLIENT/TASK_THREAD completeness |
| Studio | Owner-only content/SEO/media/styles edit, draft, explicit publish, revisions/restore, restricted values, optimistic versions, article studio | nth-of-type селектори не є stable content slots; відсутній пакетний template engine, upload/catalog/activate/rollback design |
| Assistant | `worker/assistant.ts`: реальні persisted conversations, hashed 256-bit guest capability, owner inbox/reply/offer/decision, handoff, deterministic knowledge answers | Це не generative AI. Inbox максимум 100 без pagination; inbox UI DE/RU; token expiry/revoke відсутні. Voice/device/provider journeys не доведені |
| Email | `worker/notifications.ts`: durable assistant outbox, bounded attempts, DB lease, provider idempotency, receipt check, disabled unless configured/approved | Real delivery, quotas, recipient/retention acceptance відкриті |
| CRM | `worker/crm.ts`: owner/admin scoped contacts and lead workflow | `api.ts:createRequest` пише лише local cleaning_requests + audit; немає durable ERP intake bridge на цій гілці |
| Admin | `src/lib/admin-modules.ts`: operations/CRM/messages/Studio; server enforcement у модулях | Код чесно позначає ERP `integration-required`; спільна навігація не означає інтегрований runtime |

## Свіжі перевірки

Node 24.22.1. Команда з corporate-site:

`npx vitest run tests/portal.test.ts tests/portal-messages.test.ts tests/studio-api.test.ts tests/site-studio-contract.test.ts tests/assistant.test.ts tests/crm.test.ts tests/reviews-api.test.ts tests/assistant-async-state.test.ts`

Exit 0, 8 files / 142 tests PASS (2.49 s). Log `/workspace/scratch/fe1b7c871eec/web-audit-tests.log`. Це ізольований SQLite/API source test, не browser/server UAT.

## Пріоритети

1. P1: замкнути ERP bridge через server-scoped identity + inbox/outbox + schema reconciliation; зберегти усі старі незалежні bridge branches.
2. P1: захистити Studio від часткового застосування застарілих селекторів. Наразі `worker/studio.ts:publish` не читає поточний HTML; `vps/render-page.mjs` та `src/scripts/site-studio-live.ts` silently skip missing/rich targets і застосовують решту. Власник може побачити успішний publish без усіх змін. Реалізація виправлення погоджена з root.
3. P1 TPL-01…18: каталог Original/Business/Modern, stable slots/content mapping, package schema/ZIP quarantine, rights, draft/isolated preview, digest/version activation, rollback without content rollback. Не копіювати існуючий CMS.
4. P1: owner conversation expiry/revocation, inbox pagination, replay-at-capacity handling, UI locale completeness.
5. P1: справжній verified sender/reset і current OIDC/owner UAT; не підміняти contact page reset-процесом.
6. P1: fresh exact-artifact browser role + 6 locales/keyboard/widths, physical devices і customer-owned staging/backups/restore/provider gates.

## Рекомендована архітектура шаблонів

Новий декларативний package контракт поверх існуючого Studio: content records залишаються окремими, trusted renderer/layout blocks мають stable slot IDs; style-only built-ins можуть бути першим сумісним slice. Зберігати immutable package digest + active/draft revision у чинному site DB, append-only activation history; activation transaction compare-and-swap перевіряє поточну роль, package validation і exact content revision. Preview окремим sandboxed origin або без same-origin/session capability, без business API. Private quarantine ZIP має ліміти actual decompression bytes/file count/ratio/path depth, CRC/hash, deny JS/HTML/SVG active content/remote URLs/symlinks/duplicates. Existing nth-of-type edits потрібно explicitly migrate/flag incompatible, не загубити мовчки.

## Застарілі документи

`docs/unified/INTEGRATION_CONTRACT.md` каже, що public assistant не зберігає питання і не є двостороннім owner chat; це вже не відповідає `worker/assistant.ts`. Оновити actual-vs-proposed розділи. Bridge саме лишається запропонованим/незавершеним. Historical PASS не переносити на новий SHA.
