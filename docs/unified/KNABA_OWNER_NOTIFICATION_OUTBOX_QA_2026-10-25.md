# KNABA — атомарна черга подій власнику, без зовнішньої доставки (2026-10-25)

**Продукт:** KNABA / KnaBa для компанії https://www.knaba.de. Окремо від AVENQO.
**Стан:** SOURCE_LOCAL_QA_PASS / NOTIFICATIONS_OUTBOUND_DISABLED / LIVE_NOT_DEPLOYED.

## Provenance

- База — PR #26 `834ca4891d4836da10d660669525e68551e556d7`, яка вже містить unified site/CMS/CRM/Portal/Assistant і приватне відновлення чату.
- Точно протестований **source SHA** `e67061b8a6984282edaaa641eb27b8015f2c1b62`, root tree `6f5ef99e670d94ea0769b9c14c1d3bee05bc082c`, `corporate-site` tree `3c9c9b5e055b53e816941073de159ca6e6b9a8e9`.
- ERP immutable tree: `a242ddb1a8b6395cafbc3cacbc0ce510f0be3c43` (no changes).
- Diff vs base: **9 файлів тільки `corporate-site/`**; zero ERP, external-provider, dependency, secret, auth, CMS/CRM migration rewrites.

## Реалізовано

1. **Нова адитивна D1 міграція** `drizzle/0003_uneven_doctor_strange.sql` та згенеровані `0003_snapshot.json`/journal від `drizzle-kit`. Нова таблиця `assistant_owner_notifications`, зовнішній ключ на thread/message, unique(message_id), bounded статуси й індекс due. Підтверджено `npm run db:generate` після коміту: **No schema changes, nothing to migrate**.
2. Події `new_thread` / `visitor_message` вставляються тільки з фактично створеного `assistant_messages` усередині того самого `D1.batch` transaction. Повторний idempotency key не породжує нову подію; owner replies не породжують подію. Без міграції нові звернення **fail closed**, а транзакція відкочується — не можна удавати успішне отримання.
3. `GET /api/assistant/owner/notifications` — owner-only, не більше 25 останніх подій, без тексту, email, контактів чи bearer token; показує `disabled:true`.
4. У вже наявному `OwnerInbox` відображається кількість pending подій і чесний підпис DE/EN/UK/RU, що **автоматична email-доставка вимкнена**. Збої нового status endpoint не блокують основний список клієнтських розмов.
5. **Жодної** реалізації транспортного надсилання Resend/WhatsApp у цій гілці. Відсутня згода оператора, підтверджена quota/budget і договір обробки даних — тому навіть кнопки dispatch/Cron/auto-send не додано.

## Fresh QA на exact source

| Gate | Фактичний результат |
| --- | --- |
| TDD RED | Перед реалізацією 3 нових тестові випадки FAIL (таблиці немає, запит status не відповідає контракту, rollback не застосовано) |
| Focused GREEN | `vitest run tests/assistant-threads.test.ts`: 13/13 PASS |
| Node24/npm11 | Ізольований `node:24-bookworm-slim` / Node24.22.1 + npm11.19.1; без мережі; `npm run check` PASS (99 Astro 0 errors/warnings/hints, Vue/Svelte clean) |
| Full tests | `npm test`: 110/110 Vitest (13 suites) +8/8 Node inquiry PASS |
| Build & static | `npm run build` PASS 52 HTML + Worker, `npm run verify:build` PASS SEO/i18n/links/private routes |
| Schema | `drizzle-kit generate` після імпорту міграції не виявив schema drift; нічого нового не створено |
| D1 migration | `wrangler d1 migrations apply --local`: 0000→0001→0002→0003 PASS в окремому `/tmp/knaba-outbox-local-d1`, без віддалених операцій |
| D1 snapshot/restore | Локальний SQLite read-only backup→restore на іншому файлі: 6 таблиць/counts збігаються (1 thread, 2 events), `PRAGMA integrity_check=ok` і `foreign_key_check` пусто; **не** є live D1 provider backup |
| Browser E2E | Локальний Wrangler + synthetic owner, Chromium Docker `--network none`: guest створює розмову, owner reply, wrong KNABA2 code DENY, fresh browser context recovery (320px), guest follow-up→друга outbox подія, owner inbox підтверджує disabled send, anonymous outbox 403, no JS errors/token URLs — PASS |
| Dependency audit | `npm audit --omit=dev --audit-level=moderate`: 0 reported vulnerabilities (Node deprecation DEP0169) |
| Git | `git status --porcelain` empty, `git diff --check` exit 0 |

**Одна локальна Docker збірка** SHA256 `dist/client`: `7c67d40ff802fba33ccc5f418273ba13329303c3198e41dd8ef40a9c4cc03789`; це fingerprint саме цієї збірки, не доказ field Web Vitals чи глобальної відтворюваності (Astro UID). CSS gzip 23 245 B, all JS gzip 143 826 B.

## Ризики й обмеження

- `assistant_owner_notifications` **не є доставкою на email/WhatsApp**. Owner повинен відкривати свій захищений кабінет вручну. Pending events накопичуватимуться до затвердженої retention/provider політики. Публічні обіцянки push або 24/7 не робити.
- `0003` доповнює саме граф `0000_needy_war_machine`, `0001_wet_nick_fury`, `0002_lively_scrambler`. Альтернативні PR #19/#22 мають конфліктні migrations/tables/assistant-architecture; **не застосовувати їх** у цей DB. Перед live migration потрібні provider D1 schema inventory, snapshot та успішний restore rehearsal.
- Native ChatGPT Sites `appgprj_6adc346d6f8881918b73ac79ebc5d759` на `kneba.vsp.rest` досі недоступний для authenticated publish, version listing, backup/rollback у цих інструментах; Opera Connector disconnected. Не робити DNS cutover або другу базу.
- Реальна owner identity `oai-authenticated-user-*` trust/stripping, signed-in owner/worker/client UAT, GDPR retention/delete/AVV, contract/pricing, accessibility/native devices, independent security review, field CWV/p95: NOT_RUN або BLOCKED.
- VPS filesystem ~93% used, ~14 GiB available під час перевірки; не видалялися чужі кеші/дані.

## Release/rollback

Реліз лише після дозволеного control connection до *існуючого* Sites project, provider backup+restore, signed-in owner user acceptance та незалежної перевірки trust boundary. Після дозволу — перевірити міграції на копії, додати тільки 0003, зафіксувати exact deployed SHA/digest, перевірити owner inbox на live, а outbound залишити disabled. При FAIL відновити **попередню Sites version** без стирання користувацької D1.

**No merge, no production DB mutation, no live deploy, no paid external provider.**
