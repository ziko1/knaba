# KNABA — безпечне відновлення розмови після закриття вкладки (2026-10-24)

**Проєкт:** KNABA/kneba.vsp.rest для компанії https://www.knaba.de. Окремий від AVENQO.
**Статус:** `CODE_LOCAL_QA_PASS` / `LIVE_NOT_DEPLOYED` / `OWNER_UAT_NOT_RUN`.

## Що збережено та реалізовано

- **Основне джерело:** PR #24, HEAD `1200e9b7dc8749079b09b04a35fcfc57c56fb30e`, CMS/CRM/Portal і наявний guest→owner D1 чат не переписані.
- **Точно протестований source SHA:** `3cd7ba796753dba8d4701925d4c5f70fb82038ba`, `corporate-site` Git tree `ac344d1e4d322dde2194a9428bd7064386037286`.
- **ERP tree незмінний** `a242ddb1a8b6395cafbc3cacbc0ce510f0be3c43`.
- Новий `assistant-recovery.ts`: versioned `KNABA2:<uuid>:<43-character-base64url-capability>`. Token case-sensitive, наявні 256-bit криптографічні можливості, сувора перевірка ID/токена, відкидання невірних/надмірних даних. **Несумісний із KNABA1 hex форматами** з іншого неінтегрованого PR #19: це усвідомлена відмова від неправильної міграції.
- `OwnerConversation.tsx`: показ коду **лише після натискання**; копіювання виключно за дією користувача з fallback на ручне виділення; повернення з приватним кодом в іншій вкладці/браузері; перед відновленням Worker/D1 автентифікує bearer credential, тільки потім запис до поточного `sessionStorage` вкладки. Порожні/прострочені/помилкові коди дають загальну помилку, без витоку існування чатів.
- DE/EN/UK/RU тексти, захищений ввід `type=password`, responsive UI. Немає ключів у URL, query string, логах або persistent localStorage.
- **Не вводилися** нові D1/PG-таблиці, міграції, маршрути, зовнішня відправка email, WhatsApp або платні AI API. Попередня логіка повідомлень/owner inbox лишилася чинною.

## QA: реальні команди на VPS, ізольовані дані

| Gate | Результат |
| --- | --- |
| TDD RED | `vitest run tests/assistant-recovery.test.ts` до реалізації → FAIL: missing module `assistant-recovery`; записано у VPS `/tmp/knaba-recovery-red-qa-20261024.log` |
| TDD GREEN | Після реалізації 3 recovery + 3 client cases PASS на exact SHA |
| Types | `npm run check`: Astro **98 files** 0 errors/warnings/hints, Vue і Svelte clean |
| Full tests | `npm test`: **107/107 Vitest (13 suites) + 8/8 Node PASS** |
| Build | `npm run build` PASS: **52** static pages + Worker; `npm run verify:build` PASS |
| Dependency audit | `npm audit --omit=dev --audit-level=moderate` → exit 0, **0 reported vulnerabilities**, Node DEP0169 warning залишився |
| Isolated D1 | Wrangler `--local` міграції 0000→0001→0002 у **новому** `/tmp/knaba-recovery-local-d1`: PASS, без live D1 |
| Browser E2E | Playwright Chromium у Docker `--network none`, synthetic owner identity і local Wrangler: новий гість→повідомлення в D1→private code reveal→synthetic owner reply→невірний code DENY→нова ізольована browser context→відновлення того самого чату на 320px→обидва повідомлення видимі, токена немає в URL, JS exceptions 0. PASS |
| Git | `git status --porcelain` порожній, `git diff --check` 0 |

**One built artifact** `dist/client` SHA256: `eefc670e9d1346ccbc1bc4b41a05db0cb97da01d75eeeae3d152a15b4ea8dee3`, CSS gzip 23 245 bytes, all-emitted JS gzip 143 326 bytes; *не field Web Vitals*. Astro UID можуть міняти digest між повторними збірками.

## Загрози та відкриті acceptance

- Bearer code забезпечує читання і написання від імені того самого відвідувача. Це **секрет**; якщо його передати сторонній особі, стороння особа зможе читати листування. Потрібні власникові політики retention/erasure/GDPR і повідомлення клієнтів; не зберігати код у чатах підтримки чи аналітиці.
- Для продакшену **НЕ підтверджено** trusted native Sites identity, signed-in owner/worker/client UAT, справжній chat retention, D1 backup+restore, фізичні пристрої, screen reader/zoom, зовнішні повідомлення, незалежний security review.
- Увесь runtime живого `https://kneba.vsp.rest` залишається старим ChatGPT Sites, native project `appgprj_6adc346d6f8881918b73ac79ebc5d759` не має підключеної publish/backup/rollback операції; Opera Browser Connector повертає Browser not connected. **NO LIVE DEPLOY**.
- PR #19 містить іншу архітектуру assistant та notification table; PR #22 містить альтернативний Studio backend. Не переносити SQL чи API поверх PR #24 без окремого dependency/authorization тестування.
- VPS заповнений ~96%, вільно ~9.3 GiB під час фінальної перевірки: уникати нових великих кешів і не видаляти дані чи бекапи іншого проєкту без аудиту.

## Перевірений порядок випуску
1. Native Sites project access/version ID, read-only D1 inventory, backup та успішний restore на копії.
2. Доказ stripping `oai-authenticated-*` з браузерного запиту на live new Worker, role UAT; user consent/retention/erasure.
3. Публікувати тільки після незалежного review та owner approval, перевірити live guest restore, real owner reply, mobile layout, accessible controls і логування без secrets.
4. При FAIL повернути попередню Sites-версію; **не видаляти D1 user records**.

**Висновок:** recovery feature locally tested; production і customer sign-off не підтверджено.
