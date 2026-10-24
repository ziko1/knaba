# KnaBa corporate-site memory

- User request: audit current cleaning-company website, offer modern fast stack choices, write detailed plan/prompt and implement the corporate website.
- The user explicitly confirmed `knaba.de` / KnaBa after initial `kneba.de` typo.
- Repository `ziko1/knaba`; isolated candidate branch `codex/knaba-corporate-astro-20261024`, base `ff748a2e5731e973883344ed28f3e82cf8a3bc06` (`main`, specification-only).
- Existing application branches and KNABA V4 specification are preserved. Corporate website is independently buildable under `corporate-site/`; it does not claim completion of ERP acceptance.
- Team: `/root` architecture/UI/integration/QA; `/root/site_audit` evidence/plan and independent review; `/root/inquiry` bounded Solid wizard and validation tests.
- Architecture: Astro 7.4.2 static output, SolidJS 1.9.17 inquiry island, TypeScript 5.9.3, Node 24.19.0 locally. No database/Redis/server added for static content.
- Content: confirmed service categories, Berlin/Brandenburg, public telephone/email/address; no fabricated testimonials, prices, certifications or response guarantees.
- Local costs: no paid provider, cloud runtime or hosting activation; native runtime billing is UNKNOWN. Paid external budget reserved: EUR0. No scheduled/background worker was created.
- Form: email draft only, current-window state; no automatic message sending. Server delivery, customer portal and real Lead persistence remain separate.
- State: local implementation/build/test/browser checks complete in the bounded scope recorded in docs/evidence/qa-results.json; field CWV, physical devices, screen reader and 200% zoom remain NOT_RUN. Independent review corrections applied and accepted. Final remote identity is recorded in the PR; runtime files are bound by docs/evidence/source-sha256.json.
- Revision1 release boundary: no deployment was performed in that turn. Superseded for the exact temporary target by user authorization in revision2 below.

## Revision 2 checkpoint

- User explicitly authorizes a more colorful/function-rich temporary public website at kneba.vsp.rest; future official migration is separate. Canonical requirement matrix: docs/REVISION_2_PLAN_UK.md.
- Source worktree /workspace/sites/knaba-preview-v2, local branch codex/knaba-color-preview-20261024, base5ca7dbfdb11603151b48fd78a9524927b57b99a6. Shared-file scopes separated; old staged checkout preserved.
- Team: /root integration/browser/release; /root/design Layout/index/CSS/favicon; /root/features planner components/contracts/tests; /root/hosting read-only hosting discovery and independent review. Review found stale build report and plural-selection copy; both corrected before final build.
- Astro static16 HTML pages, existing Solid inquiry, Vue/Pinia finder, Svelte checklist, Zustand vanilla shared validated service, TanStack Solid Query real local catalogue, Tailwind4/Vite, TypeScript and Vitest. SvelteKit/Turbopack deliberately not installed as alternative routers/builders.
- No new external paid subscription or runtime worker. No analytics, PII persistence or automatic message sending. Original SVG replaces uncertain-photo assets.
- Local evidence: 11 Vitest +8 existing inquiry tests, Astro/Vue/Svelte checks/build/static verifier; npm audit production dependencies reports0. Browser: desktop visual; iframe320/390/768 across home/planner/contact/glass route no horizontal overflow; menu Escape; Vue→Svelte and Solid→shared selection; checklist reset on service change; selected Baureinigung handoff and full synthetic mailto summary. Error displayed when catalogue route temporarily removed with cache-busted URL; fixture changes restored, reload recovery observed. Manual retry-success in same instance NOT_RUN because dev HMR reloads on route restoration.
- Sites project appgprj_6adc346d6f8881918b73ac79ebc5d759 created independently; public access explicitly requested. Hosting and DNS receipt must be appended after actual deployment. No vsp.rest apex/official knaba.de changes.
- Runtime queue scratch-only /workspace/scratch/2991559f892c/knaba-r2-team.sqlite. No background daemon or automatic removal job.
- Remaining official-release gates: real Lead endpoint; final operator/legal approval; human UAT/field CWV; physical device/screen-reader/zoom. No legal certification or production conversion uplift claimed.

- Final temporary deployment VERIFIED: https://kneba.vsp.rest/; custom-domain/provider/TLS active at2026-10-24T04:43:47Z. Live browser confirmed final design/noindex/canonical, Vue→Svelte→Solid inquiry preselect and catalogue shared selection. Source commit in Sites repo35103e5ee177f593951f52b451ad94a59b3efe13; deployment appgdep_6adc36dc9030819184b7d0ea8d2eba22; archive/dist identities in docs/TEMPORARY_HOSTING.md. Runtime source41files matched exact hosted source. GitHub documentation commit will be linked in PR9.
- Final emitted JS79,525bytes gzip, CSS12,548bytes gzip. These are all-file sizes, not page transfer or measured field CWV. Homepage has zero framework islands. Temporary scope implemented and live-checked; official-release backlog remains open.


## R3 intake — 24.10.2026

User requested extensive German SEO content, competitor audit, registration/owner-approved admin/worker/client dashboards, no-reload navigation, legal/privacy pages and continuation of temporary site. Verified GitHub base a4854e1e4933b26ec9f029237c0dabb07db25e75 and Sites source35103e5ee177f593951f52b451ad94a59b3efe13. Owner and public audience re-read through Sites. Worktree /workspace/sites/knaba-portal-v3, branch codex/knaba-portal-seo-20261024. Three initial delegated workers use exclusive scopes; root integrates. No paid spend, external campaigns or official-domain migration authorized. See docs/REVISION_3_PLAN_UK.md.

## R3 implementation checkpoint

- Corporate site now25 HTML pages, six expanded German services, Berlin landing page, four guides, competitor audit and keyword/intent mapping. EN/UK overview and portal translations, German detailed content/legal.
- Astro ClientRouter, real D1 leads and server-authorized portal. Native ChatGPT sign-in; every nonowner starts pending. Owner identity is server secret configured from verified Site ownership, never client-supplied or first-user bootstrap.
- Worker + DB manifest and Drizzle migrations; role-isolated client/worker/admin workflows, owner approvals/audit, rate limits/idempotency/version checks. No email notifications, CRM integration or automatic retention/deletion. Latest200 records shown with limit notice.
-44 tests PASS, all type checks/build/static verification PASS; production audit0. All emitted clientJS107136bytes gzip, CSS17131bytes. These are total artifacts, not per-page transfer or field measurements.
- Browser found and fixed insecure-context randomUUID failure and prehydration form selection race. Public synthetic local request persisted and received receipt. Mobile homepage/anonymous portal reviewed, no horizontal overflow at320px harness. Live identity lifecycle remains for owner UAT; no test accounts or auth bypass shipped.
- Temporary noindex,follow with crawl permitted; private routes disallowed. Official build switch separately tested, restored to temporary mode. No search index submission, external campaigns, fake reviews or traffic/ranking guarantees.
- Publication receipt is separate because deployment ID exists only after publishing. Exact application sources will be compared between GitHub candidate and Sites checkout.

R3 published successfully: Sites source a91edbcf989fe342cf342fa8741f0eec8a5b5488, deployment appgdep_6adc415e5c2c8191b4c2f0133d9bef27, envrevision1. https://kneba.vsp.rest/ rendered in browser; API health ready:true; public synthetic request persisted in live D1 and matched receipt. Four application tables created. Native login reaches official OpenAI sign-in; authenticated owner role UAT remains NOT_RUN because this browser has no session.64 runtime source files identical to published checkout. Hosted CSS17137bytes gzip vs local17131 from emitted order; all clientJS107136. Exact hosted report in revision3-deployed-build.json.

## R4 checkpoint — 24.10.2026

Продовжено PR #9 у самій гілці `codex/knaba-corporate-astro-20261024` від перевіреного R3 head `4a4d0d3baec0cb28a0dc79fd905549b51ee245cc`. Локальний checkout на VPS `/tmp/knaba-pr9-review-20261024` ізольований; OS системні сервіси й live-сайт без змін. Node 24.19.0 отримано з офіційного архіву та перевірено за SHA256. Виявлено, відтворено і виправлено повернення ID призначеного працівника у клієнтській ролі. Додано GET пагінацію запитів і власницьких профілів із server-scoped RBAC та фронтенд догрузку 50/сторінку; жодної нової авторизації/міграції. Контекст та пріоритетні release gates див. `docs/evidence/R4_RELEASE_CANDIDATE_UK.md`. Усі результати тестів залежать від наступної повної перевірки коду кандидата; не переносити PASS попередніх R3 релізів автоматично.
