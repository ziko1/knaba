# KNABA — site + CMS + CRM + portal інтеграційний QA, 24.10.2026

**Продукт**: KNABA / KnaBa для компанії https://www.knaba.de, окремо від AVENQO.
**Статус**: `SOURCE_LOCAL_QA_PASS` / `LIVE_NOT_DEPLOYED` / `CUSTOMER_HANDOVER_BLOCKED`.

## Source identity і незмінні контракти

- Репозиторій: `ziko1/knaba`, гілка `codex/knaba-studio-site-unified-20261024`.
- Перевірений **точний код SHA**: `9fb3801a9ae8403dde2dc143c04cd6296c065f88`.
- Git tree root: `c7f8707359cf363c5c8a28e3d2f8b2a151cbd1b6`; `corporate-site/` tree: `19b4ee005a464f9bf5ab85c054779c64916a1235`; `erp/` Git tree збережено: `a242ddb1a8b6395cafbc3cacbc0ce510f0be3c43`.
- База: PR #23 `34257b2cc1c81a45d33687ce0b1f3cfbc90de04c` (CMS text revisions, CRM, Portal, server auth guards, D1 0002). Інкремент: 21 перевірений public-site source/art paths з PR #21, плюс 1 responsive route fix і тестове узгодження без послаблення CMS/CRM перевірок. `git compare` показав 22 змінені шляхи, **0** змін у `erp/`, `worker/`, `drizzle/`, `package.json` або `package-lock.json` відносно PR #23.
- Підтверджені компанійні дані, зокрема Bauhelfer/Bauhilfsarbeiten, перенесені з раніше перевіреного PR #20. Доступність/точні послуги й використання бренду фінально схвалює оператор.

## Виконані тести на exact SHA (без живого трафіку)

| Gate | Доказ і результат |
|---|---|
| npm install | `npm ci` exit 0, без нових пакетів або paid API |
| Runtime baseline | VPS Node v24.22.1; додаткова `node:24-bookworm-slim` container QA: **Node v24.22.1, npm v11.19.1** відповідають встановленому engines |
| Static/types | `npm run check` PASS: Astro 96 files, 0 errors/warnings/hints, Vue/Svelte 0 errors |
| Unit/contract | `npm test` PASS: **104/104 Vitest (12 suites) + 8/8 Node inquiry**; повторено в ізольованому Node24/npm11 Docker |
| Build | `npm run build` PASS: **52 HTML** + Worker; `npm run verify:build` PASS: static links, SEO, noindex, i18n, CMS/CRM private route assertions |
| Dependency security | `npm audit --omit=dev --audit-level=moderate` exit 0: 0 reported vulnerabilities (Node runtime emitted deprecation warning DEP0169; не прирівнювати до доказу повної безпеки) |
| UI browser | 16/16 headless Chromium ізольованих DE/EN/UK/RU × viewport 320,390,768,1280: dropdown, Escape, responsive, SVG, floating lazy Assistant, safe RU Bauhelfer link, no JS errors; editor shell at 390 без overflow |
| D1 migrations | `wrangler d1 migrations apply --local`, **0000 → 0001 → 0002 PASS** у `/tmp/knaba-u23-d1-2342`. Це тестова локальна база, не live Cloudflare D1 |
| Local Worker HTTP | **9/9**: GET / and /ru/ 200; /editor/ guest 404; guest CRM 401; guest CMS 401; guest owner inbox 403; session anonymous 200; SVG 200; guest CMS publish 401 |
| CMS/CRM E2E | Ізольований Playwright + реальний локальний Wrangler/D1, **синтетичні** owner headers/OWNER_EMAIL: editor 200, CMS редагування → draft → publish → новий текст у public HTML PASS; CRM+Portal tabs PASS, no runtime errors. Гостьові запити 404/401. **Не є тестом native Sites sign-in** |
| Git | `git status --porcelain` empty, `git diff --check` exit 0 |

### Артефакти окремих збірок
- Host build `dist/client` SHA256: `67d8aef07be85bb4ebbfcfc66ef9ecc7b5337885c535f7a1ea2759cf5e1405ce` (browser 16-variant smoke належить host build перед container rebuild).
- Node24/npm11 container rebuild SHA256: `18bec8c9cfca72ec52d94422d10acb0fead263e506ed985f8d62c0cd774d810d`; локальний синтетичний owner-browser E2E перевірив цей rebuilt artifact. Hash is **per-build**, Astro hydration UIDs можуть змінювати байти між збірками.
- Docker QA загалом: CSS gzip/JS gzip та повний build-report з `dist/evidence/build-verification.json`; Web Vitals / реальний mobile network/p95: **NOT_MEASURED**.
- Тимчасові VPS журнали: `/tmp/knaba-u23-*.log`, `/tmp/knaba-release-browser-2031.log` — не копіювати з них токени/PII, вони не є довготривалим продакшн-доказом.

## Ризики та діючі межі

1. **BLOCKED_PLATFORM**: поточний https://kneba.vsp.rest працює на старому ChatGPT Sites build (HTTP 200, `site-language-bar`). Існуючий Sites project `appgprj_6adc346d6f8881918b73ac79ebc5d759` недоступний для native publish/version/D1 backup/rollback у поточних інтеграціях; Opera Browser Connector `Browser not connected`. Wix/AppDeploy не володіють цим проєктом. Не змінювати DNS і не підміняти hosted D1.
2. **P0 TRUSTED IDENTITY**: `corporate-site/worker/api.ts` очікує Sites `oai-authenticated-user-*` headers. Поточний OLD live Sites gateway анонімно/з підставленими test headers повернув `role:anonymous` (read-only). Для **нового** Worker signed-in owner, stripping/direct-origin gateway, session lifecycle/CSRF не тестовані live. Синтетичні локальні headers навмисно імітують довірений gateway, не доводять production security.
3. **P0 DATA**: перед live застосуванням `0001_wet_nick_fury` і `0002_lively_scrambler` обов’язкові read-only live schema inventory, версіонований D1 backup, restore rehearsal. Зміна DB/cleanup without verified snapshot заборонена. Власникове погодження retention/erasure/AVV, GDPR/privacy, юрданих і дозвіл на оприлюднення — не отримані.
4. **P0 INTEGRATION**: D1→ERP PostgreSQL scoped idempotent lead→order bridge + stable subject mapping, owner/admin/worker/client real role UAT, staging & offsite rollback, independent security/design review: **NOT_RUN/BLOCKED**.
5. PR #19 notification/recovery і PR #22 Site Studio залишаються **окремими незлитими кандидатами**. У них відмінні Drizzle `0002/0003` та інші API. Не запускати старі міграції і не дублювати CMS; переносити лише відсутні функції після версійованого контракту і TDD. Зовнішні Resend/WhatsApp/генеративні AI провайдери **disabled**, баланс, право та вартість UNKNOWN.
6. CMS зараз керує обмеженими текстовими блоками, не повним набором медіа/секцій/SEO. CRM — контакти, stages/tags/notes на базі D1 leads; немає інтегрованого ERP-контролю грошей/замовлень. **Не описувати продукт як production-ready**.
7. VPS 197 GiB filesystem, ~14 GiB free (93% filled). Не видаляти іншi source checkout/backups/дані, не робити масштабних CI-кешів без budget.

## Release gate і rollback

**Випуск заборонено поки** не доступні operator-approved Sites controls, точний native release candidate і D1 backup, restore rehearsal, trusted-header sanitization proof, реальна authenticated owner/client/worker UA/DE мобільна перевірка, локалізації/згоди, незалежний review, письмовий customer acceptance. `scripts/verify-release-readiness.mjs` повинен залишатися fail-closed до source/artifact/operator receipts, і його старий 25-blocker output не можна видавати за новий автоматичний PASS.

Після підтверджених gates: зберегти попередню Sites deployment version + D1 backup, протестувати міграції на копії, виконати staged release **тільки** для `kneba.vsp.rest`, перевірити live CRM/CMS/Assistant/roles і реальний receipt, потім повернути попередню Sites version при FAIL **без відкату чи видалення нових D1 записів**. Офіційний `knaba.de` DNS/cutover — окреме узгодження з власником.

**Ні merge, ні production deploy, ні зміни live D1/DNS, ні платні зовнішні API в цьому етапі не виконувалися.**
