# KNABA — пошукова індексація, Studio і ревізія PR
Дата: 2026-10-25. Статус: **Draft/source only; NOT_DEPLOYED, NOT_MERGED, NOT_READY**.

## База та історія
- Поточна робоча гілка: PR #49 `feat/knaba-studio-pro-livebase-20261025` source parent `386602d468a8aa04977eab44d642bde7c7ad7c28`, не `main`.
- PR #50 head `d5c90db6bfe2a81180bc9c1d473e9ffde46d2702`: інша, розбіжна гілка SEO/FAQ/візуального дизайну. Не зливати без вибіркового review.
- PR #1: окрема V3 KNABA DE Node/Postgres; PR #12: об'єднана структура `corporate-site/` + `erp/` + `docs/unified/`, але D1↔Postgres міст не готовий. `main` містить нормативну специфікацію; потрібна перевірка всіх попередніх PR #1–#50 та acceptance, а не автоматичне злиття.
- Preserve-first: `AGENTS.md` (де існує), `KNABA_DE_MASTER_SPEC.md`, `PROJECT_MEMORY.md`, `ROADMAP.md`, `docs/unified/*`, бекенд, міграції, тести і rollback receipts.

## Реалізація за етапами
1. У збірках `KNABA_RELEASE_MODE=vsp|official` індексація **лише публічних** сторінок дозволена; тимчасова preview-збірка без визначеного режиму залишається noindex. Публічний root заголовок `X-Robots-Tag: noindex, follow` не формується. Закриті маршрути Studio/CRM/кабінет/пошта/вхід залишаються noindex/nofollow; жодних секретів або даних користувачів у sitemap.
2. `sitemap.xml` формується лише з існуючого `studioPages` (72 DE/EN/UK/RU статичних публічних сторінок, включно з FAQ), містить канонічний origin і взаємні `hreflang` + x-default, без неіснуючих 95 мов. `robots.txt` не блокує публічні сторінки.
3. У Studio owner-only `@title` і `@description` уже застосовуються на VPS до серверного HTML/OG **лише після PUBLISH**. Додати підказки SEO та уніфікований список URL; створення нових маршрутів Studio поки NOT_IMPLEMENTED — потрібні справжня сторінка, контент, посилання, локалізації, canonical, schema, sitemap і QA. Не видавати редагування наявної сторінки за створення нової.
4. Google AI Overviews / AI Mode не вимагають спеціального `llms.txt` чи особливої AI-схеми; базовий SEO, читабельний контент, перевірені структуровані дані і доступні robots. Документація: https://developers.google.com/search/docs/appearance/ai-features .
5. OpenAI `OAI-SearchBot` не заборонено стандартним robots; це не гарантує появи в ChatGPT-пошуку: https://developers.openai.com/api/docs/bots . IndexNow для Bing-подібних партнерів є тільки в PR #50, без dispatch. Google — через Search Console / sitemap, не IndexNow.
6. Сторонні аналітики/маркетингова автоматизація, AI-provider calls і акаунти власника — тільки після авторизації, GDPR/CMP review, свіжих тарифів, квот і бюджету. Без фальшивих відгуків, keyword stuffing або вигаданого трафіку.

## Перед завершенням
- Node >=22.23.4: `npm ci && npm run check && npm test && npm run build && npm run verify:build` для `vsp` і preview режимів; Node24: `node --test vps/*.test.mjs`.
- Верифікувати GET/HEAD headers public/private/404, canonical, hreflang, XML, HTTP status, auth/session, UAT і 320/390/768/980/1440px, 200% text scaling; measured p75 CWV baseline.
- Review реальних послуг і текстів knaba.de, copyright, Impressum/Datenschutz; official owner approval, verified Search Console/Bing property and sitemap submit NOT_RUN.
- Live PR49 раніше свідчив `/readyz=503` і використання VPS ~96%; свіжого runtime доказу немає. Backup/restore/owner + independent security QA до релізу обов'язкові.
- Ніяких merge, VPS deploy, DNS, SQL, видалень або платних API до окремого release gate. Відкат — останній незмінений VPS release + snapshot БД.

## Scoped login + UI increment (source only)
- Server `/login/` accepts `Accept: application/json` from same-origin portal, returns generic error 401 or 200 with existing HttpOnly session cookie; existing HTML POST 303 fallback preserved. Auth, origins, rate limits and owner approval remain server-side.
- Solid portal uses client-side login then rechecks authenticated session without reloading. Registration is **not anonymous open sign-up**: after authenticated identity, a user without profile submits a pending approval. For first-time visitors `Request access` links to the company's contact form.
- Header and mobile menu now have explicit access entry; quiet footer link to `https://vsp.rest/`; Studio SEO panel clarifies publish boundary and new-route limitation.
- Runtime/Chromium/device checks not yet executed. No staging or production code deployment.

## 42 FAQ / PR #51 selectively integrated
- PR #51 head `c3563b07c9ea2e9134fdce3ad7a0f7d4b5f618b0` is exactly one commit ahead of PR #49 and has 12 isolated changed paths.
- Copy only its safe FAQ data/component, DE/EN/UK/RU routes, home cards, locale path rules and FAQ regression test. Preserve the new auth/layout/SEO code in this branch.
- Extended the central public `studioPages` to **72** built routes (4 FAQ locales) and automatic sitemap/hreflang. 4 FAQ pages can be edited/published in Studio.
- Its PR source states **TESTS IN PROGRESS**; after this cross-feature integration tests/build/review remain NOT_RUN. No merged PR, no live deployment.

## Fresh isolated QA / live read-only measurements — 2026-10-25
- Application source: `d7267ce2d3a2b3700e71b0cf53ad059a2555eb3b`.
- Node24 Docker `npm ci`, check, 23 Vitest files / 144 tests, VSP+preview build and verify-build, VPS Node tests all return 0.
- VSP CSS gzip 30426 bytes, all emitted JS gzip 169751 bytes; VSP artifact `f3c9e0c3dce43c82d10f8d523f5013113d453c22d8c39809a636d0461269808d`, preview `0a2b7da7ed4913837108bed8bc6313680a1c1691a2e002c20be75ded3285d358`.
- Live 72/72 HTTP200 current release (independent of tested source), root still `noindex`, VPS container `KNABA_RELEASE_MODE=unset`. 95% disk. No release performed. Full details: `docs/evidence/KNABA_PR52_QA_2026-10-25.md`.
