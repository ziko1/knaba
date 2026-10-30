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

## Russian localization intake — 24.10.2026

- Project kneba.vsp.rest, GitHub ziko1/knaba PR9; exact Sites opening base a91edbcf989fe342cf342fa8741f0eec8a5b5488, corresponding GitHub head 4a4d0d3baec0cb28a0dc79fd905549b51ee245cc.
- Worktree /workspace/sites/knaba-ru-localization opened with supported Sites helper; public Site owner verified. The current request adds Russian to the existing temporary Site; it does not authorize official-domain migration or GitHub merge.
- Plan/acceptance RU01–RU05 in ROADMAP.md. Existing separate uncommitted R4 checkout preserved. Team: root integration/layout/tests/release, ru_content static copy, ru_forms inquiry/planner, ru_portal cabinet translation. Exclusive scopes, no external model API or new paid spend.
- Russian route prefix /ru/ retains German canonical slugs and backend enum values. Existing DE/EN/UK behavior retained. No auth/role/storage schema changes.

### Russian candidate verification

- RU01–RU04 implemented: full22 RU pages, 191 portal keys, all public inquiry/planner labels/errors/summary, four-language switch with DE↔RU page equivalence and allowed service-selection preservation, reciprocal SEO metadata. Backend/auth/schema/dependencies unchanged.
- Final aggregate checks:50 Vitest +8 Node tests PASS; Astro/Vue/Svelte0 errors/warnings; build/static validation47 pages and all internal links PASS. Source manifest SHA256 9fe00f54358e4dcd527eb0d668e2392b0707c5fe079e45f7d6d4362ad5046b43; artifact SHA256 c91131e706d8eb51d1b27c2567fbb6f428584f9e4465bad8f1799adb7fb6c833.
- Browser observed RU home and construction-plan selection/checklist update. Further transition was rejected by browser URL policy. Submission/responsive/authenticated flows remain NOT_RUN for this candidate; no policy workaround. Source-bound logs/reviews in docs/evidence/russian-localization/. Independent reviews accepted after corrections.
- Temporary preview publication receipt follows separately. Official release and human UAT gates remain open.

### Russian publication receipt

- Temporary Site version3 published successfully: source e708755aabd5a3059c3fa05fd14491cc4e972785, deployment appgdep_6adc4b7dcb348191b781e49e49282b8e at2026-10-24T06:09:18Z; environment revision1, existing public audience/domain retained. HTTP GET https://kneba.vsp.rest/ru/ returns200, lang=ru and self-canonical.
-85 source files match the tested GitHub candidate ea52dd86280c854c42120f331e0fcf8a18dc43ec byte-for-byte; Site identity manifest separately verified. This documentation-only follow-up does not alter runtime/test inputs.
-Local Git push initially rejected by automatic approval review, then additional checks verified public repo1407861296, write permissions and no credential-pattern findings in43 changed files. Retried Git transport had no CLI credentials; use the authenticated GitHub connector for source publication.
-Original separate R4 work must incorporate this RU candidate before future preview deployment to avoid overwriting localization. No GitHub merge performed.


## KNABA Assistant — intake 2026-10-24

- Окрема гілка codex/knaba-assistant-20261024 на базі RU head 412c0c8cfbec69781359be3da44bfa9c2747ab64.
- Assistant public chat -> owner handoff -> owner replies -> customer review of terms. Додано нові схеми без змін чинних таблиць.
- Acceptance: local tests, Astro/Vue/Svelte/type/build, security review. Live auth/guest device UAT, brand/legal/data-retention decision and official release залишаються NOT_RUN.
- Detailed contract, risks and rollback: docs/KNABA_ASSISTANT_INTEGRATION_UK.md. Витрати на платні AI API не активовано.

## Assistant notification continuation (2026-10-24)

- Source-pinned follow-up to PR #13 (`5b5f1dca323eca371a7c3f160e1614ac46e7c41b`), isolated Draft; new D1 notification outbox, disabled Resend adapter with daily rate budget, client recovery code and owner inbox delivery status. Details and release gates in `docs/KNABA_ASSISTANT_NOTIFICATIONS_UK.md`. No live migration/deploy, no paid AI or email activation.

## 24.10.2026 — LANG-NOTIFY integrated candidate

- Окремий кандидат від PR #18 (`0730a2159e8b0577fab780ab2496ab287b11c259`): переносимо рівно три UI/test-файли з PR #15. Збережено assistant recovery, owner outbox/notifications (disabled by default) і локалізації DE/EN/UK/RU; нових API, SQL, production-залежностей немає.
- На source candidate локально: 63 Vitest + 8 Node, 84 Astro files typecheck clean, 49 HTML, 60 Chromium viewport сценаріїв, 3 end-to-end браузер+Wrangler/D1 recovery сценаріїв (320/390/1280), ізольовані міграції 0000→0001→0002 — PASS. Artifact SHA256 `f4347c542314283c88a39fa35c43c85c52186ea250af36f35b13d8f0971bdc33`; цей digest належить локальній збірці й не є deployment receipt.
- ChatGPT Sites target `appgprj_6adc346d6f8881918b73ac79ebc5d759` не доступний для публікації/backup з наявних конекторів. AppDeploy не містить цього проєкту, Opera connector disconnected. Не виконано merge/deploy/migration remote; live owner/role UAT, privacy approval, physical devices NOT_RUN.
- Детальна QA/rollback і межі: `docs/evidence/LANGUAGE_NOTIFICATIONS_RELEASE_2026-10-24_UK.md`. Витрати на зовнішні AI/email API: EUR0 активовано, квоти provider UNKNOWN. VPS диск приблизно 93% використано; без видалень.

## 24.10.2026: KN-STUDIO-01, окремий source candidate

Гілка codex/knaba-site-studio-20261024 на PR #19: owner-only редактор /studio/ поверх чинного /konto/, D1 Worker, без другого CMS. Source SHA 777007bcd0c0a20b306a90ada845c1568b3f9d6f. Чотири локалі UI, текст/link/image-path/color/SEO редагування, preview, undo/redo, drafts, history, explicit publication, restore as draft. AI disabled без реальних quota/budget/credentials. Additive D1 migration 0003.

Точний source в локальному Node24: npm check 0 errors/warnings; Vitest 86/86, Node inquiry 8/8, build 50 pages + verify PASS, one artifact SHA256 d67098d369475ae8c322fec0d7c4b7937bdfb01459f500ac445fa3a657609bf2. Local Wrangler HTTP PASS, stage migration PASS. Live /studio/ 404; Sites publish/backup unavailable, owner UAT, physical devices, SSR SEO, real AI NOT_RUN. Code candidate лише, НЕ live release. Не змішувати з PR #20 Bauhelfer/PR #17 artwork. Runbook: docs/SITE_STUDIO_RELEASE_2026-10-24_UK.md.

GitHub-код після authenticated Git tree mirror: commit 68fed278b3460e554ebb70937002816e4cb6e66c; локальний tested code commit 777007bcd0c0a20b306a90ada845c1568b3f9d6f; повне root tree identity ed091f283b10bda1d1ef2a80a8f14fac13f1a5d7. Документація публікується окремим дочірнім комітом; code input не змінено.

## KNABA VPS official-site internal checkpoint, 24.10.2026

Поточна інтеграційна гілка: codex/knaba-vps-cutover-20261024, перевірений source SHA 638db18f04ed55f2a9452dd0a6db45560dc1540a, source tree 3f527c0542fc033d5bfcf8227203a76beed6dd1b, GitHub mirror commit a4f59ff3b0ac58568d78916c76d8aa5ff0c04ba3, Draft PR #25. Збережено наявний Site Studio (PR22); з PR23 інтегровано тільки CRM без другої CMS; із PR21 7 оригінальних SVG та Bauhelfer-сервіси.

VPS immutable release /srv/knaba/vps/releases/638db18f04ed55f2a9452dd0a6db45560dc1540a встановлений; Docker knaba-vps-internal тільки loopback 127.0.0.1:19110, UID1000, read-only, 1CPU/512MiB; SQLite з 5 перевіреними Drizzle migrations. Typecheck Astro 102 files 0 errors/0 warnings, Vue/Svelte PASS; 101/101 Vitest, 8/8 Node, 1/1 VPS synthetic end-to-end PASS; official mode build 51 pages і static verifier PASS. Backup checksum+independent SQLite restore/migrations/integrity та перезапуск контейнера перевірені. Exact local/source/dist/backup identity receipt: vps/evidence/INTERNAL_DEPLOYMENT_2026-10-24.json, rollback runbook vps/RELEASE_AND_CUTOVER_UK.md.

Доступ до one.com DNS knaba.de відсутній, поточний A 46.30.213.20, замовник та production на one.com не змінювалися. ChatGPT Sites kneba.vsp.rest живий, provider D1 export/backup/delete немає; старі заявки/листування НЕ перенесені, старий проєкт НЕ видалений. Не створений реальний owner account: /readyz 503, реальне owner UAT невідоме; новий сервіс НЕ публічний. Немає оплачених AI/email/WhatsApp запусків. Статус тільки INTERNAL_ONLY_BLOCKED_EXTERNAL, не переданий замовникові.


## 2026-10-25 — KnaBa VSP VPS cutover checkpoint
- `kneba.vsp.rest` moved to existing VPS 51.77.35.6 with independent login and corrected DE/RU hosting disclosures, code commit `695a58077cf119096301c268c017d0d392712b71` and immutable release. Cloudflare DNS A, strict Let's Encrypt HTTPS 200. 101 Vitest+8 Node+1 VPS E2E PASS; 51 static routes HTTP200. Exact evidence: `vps/KNABA_PUBLIC_VPS_CUTOVER_2026-10-25.md`.
- Old provider D1 data not imported, owner not enrolled (/readyz=503), newer PR #26/#27 migration conflicts not reconciled: **PUBLIC_SITE_DEPLOYED / CUSTOMER_HANDOVER_BLOCKED**. Do not delete old data, and do not merge main without review.


## 2026-10-25 — Studio SSR integrated public dev release
- User clarified KNABA site is in development without customers. Current VPS database row counts checked 0 for owner/users, leads, chats and Studio; legacy provider data not independently accessible. Preserve unknown original data and backups.
- Source-pinned merge commit `417f40bba42f26ff88c620edba22a92f58f5213a` deployed on `kneba.vsp.rest`, building on Draft PR #29 + reused PR #30. HTML SSR from published CMS revisions, safe URL/Host, 7-day HSTS. No schema changes, no API fees.
- 102 Vitest + 8 Node inquiry + 14 Node VPS PASS; 51/51 public routes verified HTTP200 using system TLS and real Let's Encrypt cert. Owner setup and real device UAT NOT_RUN, /readyz503. Exact receipt: `vps/KNABA_STUDIO_SSR_LIVE_QA_2026-10-25.md`. No main merge, no offsite backup or official-domain mutation.

## 2026-10-25: Construction-cleaning brand and four-locale site candidate

Owner-directed repositioning of KnaBa on the **development** domain kneba.vsp.rest
from general building/office cleaning to **Baureinigung & BauService**. Shared SVG
building/core-bore brand replaces the three-stripe mark on all public layouts and
favicon. Existing old URLs are replaced with noindex/legacy navigation instead of
deleting historical CRM service keys or silently changing previous request meaning.
New primary offering: Baugrob-, Bauzwischen-, Baufein-, Bauendreinigung,
Baustellenberäumung, Bauhelfer. Requested core drilling, wall/deck penetrations and
other construction work are explicitly **not confirmed capabilities**: technical
review, qualified trade, structural/fire-safety approvals and separate contracts
are prerequisites. No unverified licences, contractors, reviews or prices are shown.

Public page templates/home, catalogue, offer detail, contact, planner, sectors,
about, Berlin, careers and guides now have DE/EN/UK/RU routes. The public inquiry
and new portal request form retain the existing canonical Baureinigung service ID;
a specific additional construction request is preserved in an allowlisted message.
The KNABA Assistant language knowledge and portal new-request entry points were
updated. Old stored portal requests, private auth, SQLite schema/records and ERP
were not modified. Legal pages retain their previously reviewed languages.

Checkpoints: Node 24 container with no network/paid dependencies; Astro check,
Vitest/Node tests, static links, SSR Studio publish/restore, and direct HTTPS smoke
checks required before marking preview ready. Site Studio's old positional CSS
selectors may not map after the design change; published Studio page count was
read-only verified 0 at intake on 2026-10-25. Official knaba.de and the One.com
DNS are OUT OF SCOPE, as are merge to main or release acceptance by the client.


## 2026-10-25 — deployed current BauService VPS development release
- Latest public KnaBa 99-page construction rebrand from PR #34 preserved, not downgraded to prior 51-page PR #32.
- Authorized user requested deploy to kneba.vsp.rest; code-only update SHA 87b6fb49a658e60781d35c44f2667d720dfcf6ac, build a956d0e0ac8bdd4243733087b089958df361dd2dbb331311c12e51f291eef4b9. No new DB migration, keys, paid LLM or DNS changes. Real HTTPS 200, live Chromium 24/24 route checks, protected SQLite backup and rollback receipt.
- Explicit build-time VSP search index approval added; current public site remains noindex, sitemap=0. Node now returns real X-Robots-Tag: noindex/follow, protected Studio keeps noindex/nofollow. Owner /readyz=503 by design, old Sites D1 not exported; do not delete Sites or claim handover ready.
- Complete evidence and failure/rollback/recovery receipts: corporate-site/vps/KNABA_BAUSERVICE_VSP_CODE_RELEASE_2026-10-25_UK.md.

## 2026-10-25 — Owner-directed Bau cleaning/mobile brand finish candidate
- Source baseline `d571832fde7a10b19936ca9321b0de4c661ebf7d`. Isolated branch `fix/knaba-footer-brand-final-20261025`.
- Existing 4-locale Bau/BauService catalog reused. Visual mark updated to building + glass squeegee; public JSON catalogue reduced to Baureinigung (historic CRM enums preserved); old Büroreinigung public routes redirect to catalog; short-page footer flex layout fixed with Playwright red/green at 390×1550.
- QA: Node24 108 Vitest + 8 inquiry + 14 VPS PASS; Astro/Vue/Svelte 0 errors; 99 HTML+Worker PASS, source-pinned artifact `b71e716a8f73016f9be63fe7c523898c7737e172f38d8d317e2b7b4bd749527c`. Full report: `docs/KNABA_BAU_BRANDING_MOBILE_FINISH_2026-10-25.md`.
- Public deployment and real owner UAT separate. No database migration, paid activation, or changes to official `knaba.de`.


## Rebased onto the latest VPS release candidate (PR #35), 2026-10-25
- Preserved current dev source baseline `f06d7fe12c9a87786f6c7765f3528e4dd99b105e` (PR #35 code `87b6fb49a658e60781d35c44f2667d720dfcf6ac` plus docs). This is a **new integrated source snapshot**, not the originally tested `d571832...` candidate.
- Repeated full Node24.22.1 QA **on this integrated source**: Astro/Vue/Svelte 0 errors/0 warnings (4 hints), 108/108 Vitest, 8/8 inquiry Node, 14/14 VPS Node PASS; 99 built HTML routes, static verifier PASS. `KNABA_RELEASE_MODE=vsp` preserves **VSP_PENDING_APPROVAL/noindex** and first-party legal/SSL.
- Fresh actual `dist/client` artifact SHA256 `e07816d0aeb2154dabc483cf2748afc6c6a2951b1b615a011a59c4e8687a60ce`; worker SHA256 `b84a86d458fbae242eadef7b296f5cec8d1f7b9def1149deb8241f846145d105`, bundled renderer `4313a678824926f93b09e417bd65d58844e33bb602952d4c22cfe180f2f7ed64`, homepage `e0496be03a80cf26e4b5b18a4230f3316140e9fc22c9d404d19a820404d5d8d6`.
- Real Chromium on isolated Nginx static build: synthetic short-page footer bottom matches viewport on 320×700, 390×844, 390×1550, 768×1024; horizontal overflow 0. Ukrainian catalog has 10 linked service cards; public JSON serves only `baureinigung`, no office service. No production database mutations in tests.
- Further public deployment still requires strict TLS/live routes, verified backups and rollback. Do not modify external official `knaba.de`, source-provider historical data, owner secrets, or unrelated services.


## Live development VPS rebrand verified — 2026-10-25

- User-authorized dev release code SHA 90d3701fb06b5d82e632a3d2db01e983a9ba45f0 installed under /srv/knaba/vps/releases; previous 87b6fb49a658e60781d35c44f2667d720dfcf6ac preserved for rollback, compose/DNS/SSL unchanged.
- Backup before app upgrade: knaba-2026-10-25T01-24-39-899Z.sqlite, SHA256 d5f4e30851ed8bf0f981d26615910263f786d67095be4b0d387b83f58991ef56, five existing migrations, 217088 bytes. No database schema or user record changes.
- Isolated runtime route tests passed; DE/EN/UK/RU old office paths redirect HTTP308, API catalogue now contains only the stable Baureinigung service. Host spoof refused HTTP421. Development app Docker healthy.
- Public HTTPS with system CA verification: 99 built HTML routes have expected statuses (97 HTTP200 and 2 intentional 308 for the DE/RU legacy office pages), no unexpected errors. Extra EN/UK office URLs also redirect 308. HSTS max-age 604800, header and meta robots noindex/follow; Let's Encrypt SSL unchanged and valid. New squeegee/building SVG is served live.
- Live Chromium automated 320x700, 390x844, 390x1550 and 768x1024 synthetic short-page footer test: bottom matches viewport and horizontal overflow zero.
- Real owner account still unprovisioned (/readyz 503), on-device manual UAT and external-provider data export unverified. No paid providers used, no official knaba.de changes. VPS disk warning about 95 percent usage persists.


## 25.10.2026 — UX/Assistant captcha candidate
- Baseline live e5142f245aac806f4748c1db55a87629c1009bc2, preserving dark footer and assistant legal links; isolated draft for sixth CTA, real Turnstile token verification, bearer header fix.
- Node24 no-network: 117 Vitest, 8 Node inquiry, 14 VPS tests PASS, 99 routes build/verify PASS, 8 localized six-tile checks PASS; artifact digest b1b32d7f95844b69b50888e3e431ddcd1448e1908014202be90126502fff922e.
- Full focused report docs/KNABA_SITE_FOOTER_SQUARE_CAPTCHA_AUDIT_2026-10-25_UK.md. Legal/owner/physical device acceptance open.

- Rebased on newer deployed carousel SHA fe78624f4263d5f410b9fa29a2329c8ac19a6a74; QA re-run: 123 Vitest, 8 inquiry, 14 VPS tests PASS, 99 routes, 32 catalogue mobile-footer widths plus 4 short page widths, 7 carousel scenarios PASS.

## I18N-99 target inventory, isolated verified candidate — 2026-10-25
- Direct live baseline on VSP development release: `fe78624f4263d5f410b9fa29a2329c8ac19a6a74`; 99 static HTML pages across DE/EN/UK/RU. `GET /healthz`=200; `/readyz`=503 (real owner not enrolled). Disk 95% used, ~10 GiB free.
- Separate branch `feat/knaba-i18n-99-catalog-20261025`: code SHA `b1ef6e9a51b6ee6163fe12fd058d90cb5da5f65e`; full Node24.22.1 source QA 121 Vitest, 8 Node inquiry, 14 VPS tests PASS, typechecks 0 errors/warnings, 99 Astro pages, build/static verifier PASS. Artifact SHA256 `f7d49a5df28494fa06a6917ff6452120e97b7fe7ca4c14342ad92856622eb69d`.
- Latest source+test SHA `8a7d5c926d435ea69fcde5ba6b657fed1a41c587` adds an HTTP regression proving `/languages.json` returns 99 targets / 4 published / 95 pending with no 95-item SSR HTML list; that exact SHA Node VPS server tests 2/2 PASS. Full QA was on unchanged executable code SHA b1ef6e9, plus targeted test on latest 8a7d5c9.
- One-page size measured with gzip level9: pre-change live home 33975 B raw / 6297 B gzip; initial eager catalog 63783/10299; final lazy catalog 37644/7786. Only requested language list loads on `<details>` opening, not every page. This is transferred HTML size, NOT Web Vitals or field p95.
- 99 BCP47 codes in machine manifest; **only 4 published locales**, other 95 remain NOT_TRANSLATED. No fake locale URLs, no pending hreflang. No new deps, server/database/auth changes, paid providers or production merge/deploy. Real owner enrollment blocked pending verified owner account; synthetic isolated owner login/Studio draft/publish/restore covered by VPS tests. Native review/physical browser test/field CWV NOT_RUN. Detail: `docs/I18N_99_ROLLOUT_UK.md`.

## 2026-10-25 — I18N99 merged with PR42 candidate
- Four published locales, 95 pending BCP47 targets. Verified 127 Vitest, 8 inquiry, 14 VPS, 99 HTML, 16+2 locale-browser, 7 carousel and 36 footer/browser scenarios. Corrected 320px dropdown overflow. Evidence: docs/I18N99_PR42_INTEGRATION_20261025_UK.md. No claim of 99 completed translations.

## KNABA 2026-10-25 — continuation of PR #42 (hardening checkpoint)
- Baseline exact deployed code: 89b1ad4fb22f665863196040ea9e696119fb0690; current domain kneba.vsp.rest, HTTPS trusted, Docker healthy. Root-only Turnstile server credential exists; not in repo.
- RED evidence: after first opening/closing KNABA Assistant, Solid fallback launcher was 189.67px and covered mobile footer Datenschutz at widths 360, 390, 480, 600 and both legal links at 760. The initial-launcher-only test missed this state.
- Fixed Solid fallback launcher to same 54px mobile circle, checked across 4 locales x 8 widths: 32/32 PASS; initial footer 32/32 + 4 short viewports PASS.
- Production fail-closed if Turnstile keys missing; consent-triggered lazy third-party script, expiry reset, DE/RU factual privacy disclosure, same-tab legal link, corrected Imprint construction illustration.
- Isolated Node24 (network none): Astro/Vue/Svelte check 0 errors / 0 warnings (4 hints), Vitest 126/126, inquiry Node 8/8, VPS Node 14/14, 99 pages/static links/build PASS; 8 six-tile locale checks, 7 hero carousel browser scenarios, 4 browser flows using synthetic provider script (NOT human challenge) PASS.
- Latest static artifact SHA256 3bf9b20eaa22a60adca9843930c4aae82c2f6f42224da452598df9f610974ede. VPS-mounted assets/ live real-human challenge remain separately gated.
- Full 98 public HTML routes on prior live build: Chromium mobile 98/98 PASS basic footer/overflow checks; 7 focused 200% root-font samples no overflow. Not a physical device/real a11y or field CWV proof.

## KNABA I18N99 + latest Turnstile follow-up, 2026-10-25
- Source incorporates 132145f94c53aabfa72645c3cc157d4c07c76ac2; Node24 130 Vitest + 8 inquiry + 14 VPS, 99 HTML pass and 97 Chromium scenario PASS on the combined source. Exact artifact report: docs/evidence/i18n99-pr42-hardening-build-20261025.json. Deploy not yet confirmed.

## 2026-10-25 — I18N99 on live VSP development server
- Executable SHA 403c33a95b29311817c9c53910b07011c4cfa81b, 99 static routes expected HTTP statuses, 54 post-deploy Chromium pass, strict TLS and Turnstile config verified. Backup SHA 9cd3cb3288d2e9e7dba463d38267a325ed20377e150cc3915ad9ea2016d38ab0. 4 published translations, 95 pending. Full receipt docs/I18N99_PR42_INTEGRATION_20261025_UK.md.


## 2026-10-25 KNABA Studio Pro source (live-base candidate)
- Current prior live VPS branch SHA 77c2a96a870d1ba0e5a0bf766dee1aca541ada8a; Studio executable SHA 24dd7fc826ff50c3fab9273ce9e654fbee2095b6 in isolated branch feat/knaba-studio-pro-livebase-20261025. 15 functional files over current PR48, no DB schema/auth-proxy/payment/package changes. Earlier tested branch b056747... was rebased by safe overlay to preserve PR48 200% mobile/keyboard picker hardening and real Turnstile.
- 3 Studio design tokens (background HEX on section, pixel padding presets, font size presets), safe SSR style aggregation, visual/manual JSON modes, deterministic iframe undo, 68 public route picker, bundled file manifest and owner-only AI readiness flags. Existing PUBLISH/rollback/D1 versioning preserved.
- RED→GREEN focused tests run for design SSR, 68-route inventory, AI readiness and local media. Node24 exact integrated SHA QA: 137/137 Vitest across 22 test files, 8/8 inquiry, 16/16 VPS Node tests, Astro/Vue/Svelte checks zero errors/warnings, 99 public HTML pages and static verifier PASS. Build artifact SHA256 80e1242106ebf75ab5dd608da099d896e363661c3fcef9aa1f243a2fa974b511. Synthetic private HTTPS Chromium owner login/Studio edit/undo/manual JSON/SSR/check no console errors PASS (not real owner/device).
- Real VPS at intake ~96% disk used, /readyz=503 because genuine KNABA owner not enrolled. No paid AI credentials or actual quota verified. No external paid inference, no provider activation, no main merge or official knaba.de cutover. Independent reviewer and real owner UAT not certified. Detailed acceptance in docs/plans/2026-10-25-knaba-studio-pro.md.


## KNABA Studio Pro — dev VPS code release receipt, 2026-10-25
- Deployed only the user-authorized VSP development host, verified source SHA 24dd7fc826ff50c3fab9273ce9e654fbee2095b6; prior release 77c2a96a... retained. New JS/HTML renderer/hydration from the tested exact artifact; no schema/migrations, billing/DNS/official-domain changes.
- Real HTTPS smoke: 98 public index paths 96×200, 2×308; 404 page separately, unknown path ultimately 404. Studio/CRM/portal/inbox/media/languages/healthz=200; anonymous owner APIs=401. TLS trust verified and KnaBa container healthy; SQLite integrity=ok and 5 migrations unchanged. Backup checksum and rollback in docs/STUDIO_PRO_DEV_DEPLOY_2026-10-25_UK.md.
- Not full acceptance: live owner not enrolled /readyz=503, disk warning ~96% used, independent reviewer / genuine device UAT and external AI provider budget still missing. Keep draft PR, avoid main merge.


## KNABA FAQ Studio continuation — 25.10.2026
- Verified base live development source 24dd7fc826ff50c3fab9273ce9e654fbee2095b6, current PR51 c3563b07c9ea2e9134fdce3ad7a0f7d4b5f618b0. PR51 preserves current i18n99/Turnstile/Studio Pro; four-language 42-question FAQ not yet deployed when work started.
- New FAQ routes were missing from src/lib/studio-pages.ts (68 entries). RED focused Vitest repro; added four public-only FAQ routes, 72 entries, kept owner-only permissions.
- Isolated Node24 offline check/test/build/static: 144 Vitest, 8 inquiry, 16 VPS tests PASS, 103 HTML pages, 16 FAQ browser viewport/language scenarios + one client-navigation scenario PASS. Built digest 77e730e639c7ceb33ef501832e00ffeead75dd0e5daa6bb75cfcf8d7282647ed.
- Release receipt and remaining risks: docs/KNABA_FAQ_STUDIO_QA_2026-10-25_UK.md. No official-domain cutover, real owner enrolment or AI provider activation.


## Footer localized public-route labels — 25.10.2026
- Exact starting code/development VPS release de94da89794f15fdb05ac2f068df2e4a52a64f4d, 103 public HTML pages.
- Found stale EN/UK footer labels marked (DE) for four destinations that are already fully localized: branchen, ratgeber, berlin, karriere. Actual DE-only legal notices correctly retain (DE).
- RED: real live Chromium with UK/EN footer navigation failed (EN branchen was Your sector (DE) despite EN destination).
- GREEN: changed only eight labels in shared src/layouts/Layout.astro; kept DE/RU copy, legal links, route URLs and private gates intact.
- Isolated networkless Node24 QA: check 0 errors, Vitest 144/144, inquiry 8/8, VPS Node tests 16/16, build/verify 103 HTML PASS. Artifact digest SHA256 c05519f298821574679f1061bf13c3eb20578b85c9c206e7b9433dd9a428cd6d.
- Real Chromium focused footer test on isolated candidate: EN and UK labels map to valid localized pages, German-only legal destinations remain labeled (DE). Physical device remains NOT_RUN.


## Actual live development-domain receipt — 25.10.2026, localized footer
- Verified published code release: 7f886606d5711ac93a88d3d93b54a0a9b5638525 at https://kneba.vsp.rest/. Previous exact code de94da89794f15fdb05ac2f068df2e4a52a64f4d retained for code-only rollback.
- Pre-switch durable online SQLite backup knaba-2026-10-25T05-20-51-748Z.sqlite, SHA256 9cd3cb3288d2e9e7dba463d38267a325ed20377e150cc3915ad9ea2016d38ab0, five migration files unchanged. SQLite integrity_check ok before/after; web container only recreated.
- Post-deploy TLS verify=0, Docker healthy. Public FAQ/Studio/assistant-config HTTP200, no external provider/billing activation. Browser EN/UK link-label-to-destination PASS; 16/16 FAQ locale-width flows + 1 Astro SPA navigation, 32/32 post-close Assistant/footer interactions PASS; complete responsive 102/102 generated HTML route Chromium check PASS.
- Runbook remains dev-only, /readyz=503 due missing verified real owner. No main merge, no official knaba.de cutover, no real owner Studio UAT, no physical device/human Turnstile completion; VPS disk ~95% full, 9.9GiB free, no unreviewed deletion.


## Full-site construction-content audit and development release — 2026-10-25
- Exact deployed executable SHA 7e774c32863ad6b9f90a95288b5bd3495d941a51 at 11:58:10 UTC, previous 7f886606d5711ac93a88d3d93b54a0a9b5638525 retained. 8 service types x4 locales and 24 info/contact pages expanded; localized planner/topic/consent/portal links repaired.
- Public VSP mode now indexable: 72 sitemap URLs and 360 hreflang entries. Preview/private/legacy remain noindex. Stable CRM service enum, runtime/schema/deps unchanged.
- Node24 QA 148 Vitest +8 inquiry +16 VPS PASS, check 0 errors/warnings, 103 HTML static PASS. 102-route candidate browser, 4 conversion flows, 24 reflow cases, exact-source targeted labels and final live four-language mobile smoke PASS. Live GET 102/102 active HTML200; anonymous owner APIs401; Docker healthy.
- Final client tree SHA256 2a7121f731d2d24f59bb34af124f3b57a2346485dc3292f21c8cef211e3a71cf. Fresh SQLite backup integrity ok; 5 migrations unchanged.
- Public GitHub push blocked twice by auto-review requiring explicit public-source publication permission; DO NOT retry/bypass without direct approval. Branch remains local, recoverable patch retained privately in deployed release. No PR/main merge/official-domain change.
- /readyz503 owner enrollment required; real delivery/human CAPTCHA, legal signoff, physical-device a11y/security, field CWV and offsite restore NOT_VERIFIED. Disk about95% used, 9.4GiB free; no cleanup or paid providers. Report: docs/KNABA_FULL_SITE_AUDIT_2026-10-25_UK.md.


## Construction guides continuation — 2026-10-25
- Dev code 5b5261e56ad4ae5122495cf3e9b0f87ea7f2d70c deployed at 12:57:51 UTC. Four full articles in four languages (16 versions; two legacy URLs restored, 14 new), 88 public sitemap URLs / 440 alternates, 117 HTML including 404. Studio, contextual enquiry and locale navigation integrated.
- Independent review caught stale Article JSON-LD after owner edits: canonical Article H1/description synchronization now has four regression tests. Sequential preview→VSP exposed duplicate intermediate CSS; builds now clean only generated output trees.
- Release guard caught parallel visual-card-8668458cb06f-20261025 before writing. Integrated exact source patch 8668458cb06f52a0920b2f90aadd7305d2995b63; preserved its contrast changes. Previous visual release remains available for rollback.
- Exact final SHA: checks zero errors/warnings, 152 Vitest + 8 inquiry + 20 VPS tests PASS. Static 117 HTML PASS. Candidate: 20 guide/index pages, four enquiry flows, four locale switches, four keyboard cases, 28 responsive/200% cases and 16 home cases PASS. Live: eight flows and four locale switches PASS, all POST blocked. HTTP: 114 direct 200 plus two expected retired-office 308→200.
- Client SHA256 855a7c938166f9e4c1507641ad9c59392b81ebe4552680e80c451f81518ef95d, 177 files; compiled renderer d6925dcee8900ddd94ec61463b3e9e0b3a8b98a13d91243e02fcd79f579602c2. Fresh SQLite backup, integrity ok, five migrations unchanged, container healthy. No auth/dependency/payment/main/official-domain changes.
- Public GitHub push still requires explicit authorization after previous automatic rejection; not retried. Private incremental source bundle retained on VPS. Real owner enrollment (/readyz503), genuine delivery/CAPTCHA, legal/device/CWV and offsite restore remain unverified. Details: docs/KNABA_GUIDES_RELEASE_2026-10-25_UK.md.


## Corporate template candidate — 2026-10-25
- Code `addff803dcb537af7272d468ecd3dd4990f626d3`: factual company profile/home link, shared public breadcrumbs and active navigation, localized careers email route, catalog-card consistency. Four locales, no dependencies/data/auth changes.
- 159 Vitest +8 form Node +20 VPS Node, check/build/static117 pages and67 Chromium cases PASS; independent Codex corporate_audit ACCEPT. Evidence: docs/KNABA_CORPORATE_TEMPLATE_2026-10-25_UK.md.
- NOT_DEPLOYED: storage92.88%, cutoverAllowed=false; no public source push (prior rejection remains). Physical device/legal/real owner/UAT/CWV remain NOT_RUN. Next: owner proof content, storage health and source-current reconciliation before authorized dev rollout.

## KN-SVG-01 — 2026-10-25 SVG site-wide pictogram checkpoint

- Active base `30cdeb75c46ad90e1fb921e78c9928235f3ac29a`; code-tested `57ccd417cb918cf351f280173050915883f63158`. First-party eight-service SVG registry plus separate project CTA; same across DE/EN/UK/RU on homepage, catalog, technical offers, hero and detail templates. Scoped mobile long-heading correction.
- Node24 check/180 Vitest/16 Node/23 VPS/117-page build + static icon/order verification PASS; isolated Chromium 32 home/catalog, 32 detail and eight title cases PASS. One actual build artifact SHA256 `35f4d2cf9503950e898c8fd88982d6fd92735c042be27a39ef537bd111c70976`.
- Payload compared with baseline: all emitted JS gzip +0 B, total CSS gzip +122 B, homepage HTML gzip +612 B. Field CWV not measured. Evidence: `docs/KNABA_SVG_SERVICE_ICONS_2026-10-25_UK.md`.
- Actual dev deployment requires an immutable source-pinned release, pre-switch backup and public smoke. Real owner /readyz=503; physical device, native zoom, legal and customer acceptance NOT_RUN. No source-publication permission bypass.


## KNABA Control Center — 25.10.2026 isolated rebase onto preview
- Private latest-preview base: `06c51f0c2bc6aaf6a6c6f26848839fdddecc55b2` (SVG icon refinement), with only 17 scoped admin files from public Draft PR #69 `e0a36713e5a109cdc6e583a33284414fe4a1525b`.
- Actual isolated Node24 check/test/build/verify and 23/23 VPS checks PASS; Chromium synthetic owner/admin/guest reflow 320/390/768/1440 and unsaved-editor guard PASS. Artifact SHA documented in `docs/evidence/knaba-control-center-2026-10-25.json`.
- No real DB migration, paid providers or official knaba.de changes. Live owner remains unactivated; genuine owner UAT, independent human security review, field performance and physical-device tests unknown.
- Earlier backup SHA `1fc9492a9695d98dfd3fd3e41169353d0e98b63232f14fadcfd86e66595eaad8` verified SQLite integrity; source packet is kept private on VPS, never pushed to public GitHub.
- Publish only with current-source lease, storage healthy, verified release packet and automatic rollback gates.

## 2026-10-26 — KNABA multilingual logo, candidate checkpoint
- Keep original DE logo bytes, geometry, 3D lime palette, and slogan. Six SVG desktop variants EN/UK/RU and six corresponding mobile variants generated deterministically by existing `scripts/generate-knaba-3d-assets.mjs` (16 total).
- Visible copy: EN “Our goal is to create value for you.”; UK “Наша мета — створювати цінність для вас.”; RU “Наша цель — создавать ценность для вас.” DE original unchanged. Source suffix per locale handled only in shared Layout.astro; no hard-coded pages or duplicate branding components.
- Isolated Node24 npm ci/check/test/build/verify:build PASS: 184 Vitest +16 extra Node +27 focused logo/browser-boundary tests, 118 generated HTML pages; exact client artifact SHA256 recorded in immutable release manifest upon deployment. Read-only system font mount was required for faithful raster preview; fontless Sharp gave invalid placeholder glyphs and is not a production-site defect.
- Existing Opera Lab GUI screenshot, new tab, text input and mouse click dispatch are confirmed; screenshot alone and DISPATCHED are NOT page navigation. Browser in this chat via native Opera Browser Connector returns Browser not connected; 16-case native Opera UAT, screen-reader/device/zoom and independent human review remain OPEN.
- Public release must use tested source, DB backup + rollback, compare 118 old/new endpoints, preserve private original source, and update public Draft PR via only authorized brand source files; no direct private source dump to public GitHub.

## KN-LOGIN-REFLOW-2026-10-26 (candidate)
- Exact parent preview source c08e58c41ddad287c154fcfc597654e777fa8db6. Narrow login-only CSS fix, code SHA ddf3db88cbce01b50991eb88740ad799fd378f39.
- Mobile browser RED: 390px login page overflow 33px; GREEN: 320/360/390/768 overflow 0px. 184 Vitest, 16 Node, 27 focused and 24 VPS checks PASS; 118-page VSP build PASS. No login/session/owner DB logic changed.
- See docs/KNABA_LOGIN_MOBILE_FIX_2026-10-26_UK.md. Real owner account /readyz=503 remains blocked by identity proof; no temp owner credentials issued.

## KNABA 99 target languages / shared brand (26.10.2026)
- Existing source already had 4 localized live SVG logo suites (DE/EN/UK/RU); 95 target languages remain pending. Preserve truthful 99/4/95 status.
- Shared brand-messages.json consolidates SVG slogans, accessibility labels and Open Graph metadata; no geometry/design/auth/schema change.
- Offline Node24 check/test/build/verify + 24 VPS tests and 24-page/16-SVG audit PASS; real browser BLOCKED, native review/device and real owner pending. See docs/KNABA_BRAND_I18N_RELEASE_2026-10-26_UK.md.

## 2026-10-26 KNABA I18N99 source-to-review worktree
- Isolated translation pipeline based on active fdec254. Canonical 99 target catalogue continues 4 published / 95 pending. Static DE public, legal and account segments are versioned by SHA; draft verification rejects stale HTML, unsafe markup and broken placeholders. Real native/legal/dynamic/RTL/browser acceptance remains required. See docs/KNABA_I18N99_PIPELINE_CHECKPOINT_2026-10-26_UK.md.

## 2026-10-26 VSP forward-integration QA gate
- Rebased current public KNABA preview `83ff0ba402b38209a39d96325fa1c3f9cfed5a86` with saved gallery/partner/WebP work, preserving live reviews, owner login and SQL migration `0005_public_reviews.sql`. Existing `Partners.astro` is the sole section. Working branch `fix/knaba-vsp-forward-integration-20261026` is published separately; this is not a `main` merge.
- Isolated Node24 build 122 HTML pages, 196 Vitest + 52 Node + 24 VPS + 8 contrast checks PASS; actual Chromium 16 logo cases, 24 visual/nav cases, 6 reflow, 16 guide routes + 6 guide reflow PASS. Exact client artifact SHA256 `3d6d510f16abc6c96b458442bdc42da8911d19bf1e97a283d41ccec5030cc113`. I18N99 4 published / 95 pending.
- Private loopback VPS container with isolated migrated SQLite passed 8 public home/gallery HTTP routes; `/readyz` intentionally 503 without owner account. See `docs/evidence/KNABA_VSP_FORWARD_INTEGRATION_QA_2026-10-26_UK.md`. Live symlink and customer DB untouched; logo rights/owner UAT, independent review, real device, verified backup/rollback and separate VSP release approval remain OPEN.

- Concurrent VSP release drift 2026-10-26: active source `21a56934f3c3266d31285bb89e0a4ca0c0f755a4` (not on GitHub), manifest readyForRelease=0/storageGateCutoverAllowed=false. The valid local source-recovery bundle hash `dd0ba5568c7192738c937b7cc08eab25744ed75d2580ff1ae158d1a81cddf98b` contains one review-only i18n dynamic commit on top of 83ff; no runtime/schema change declared. Published cutover remains HOLD, cannot overwrite live without current ancestry/backup CAS.

## 26.10.2026 — KNABA link/phone dedup forward candidate (Draft)
- Based on af58e80af83449a2ee72433c958aedcf0749604f, reuses Draft PR #79 without rewriting gallery/partners/i18n99/career flows. Candidate branch fix/knaba-forward-contact-dedup-20261026.
- One canonical clickable phone on each of 122 source-built pages, no repeated local href within 509 nav containers, contextual email/self-link guards. Node24 check/test/build/verify/VPS PASS on isolated candidate; i18n catalogue regenerated for current German source. Evidence: docs/evidence/KNABA_CONTACT_LINK_DEDUP_FORWARD_2026-10-26_UK.md.
- Still source-only: browser/device/customer UAT, media rights, backup/rollback and owner release approval pending. No merge, public deployment, DNS, paid provider, or customer data mutation.

## 26.10.2026 — Follow-on conversion dedup on PR #82
- Reused Draft PR #80/#81 UX improvements selectively on current forward candidate instead of replacing newer components. Homepage duplicated catalogue CTA and CSS removed; deep link label localized DE/EN/UK/RU; two service enquiry buttons per detail (32 routes) with pricing, telephone and related guides preserved; JS-disabled contact fallback no longer repeats email.
- TDD baseline two new source tests RED, nine older PASS; final 12/12 PASS. Node24 check/test/build/i18n/verify/VPS PASS: 196 Vitest, 28 native main, 27 native policy, 9 native i18n, 24 VPS. 122/122 HTML HTTP200, 122 one-phone pages, 509 clean internal nav groups. Sandboxed Chromium existing 24-page+6-reflow and focused 52-case suites PASS. Artifact SHA256 `e71121f05ce134eabdd56b5cabc69755df3ef704dcb5eb008f1ed6567a9513b2`.
- Public preview still serves older release with duplicate contacts and gallery 404. No merge, public deployment, DNS or owner-data mutation; physical-device/UAT, rights, DB restore and rollback evidence remain OPEN.

## 2026-10-26 — KNABA ordinal forward fix (Draft PR #83)
- Prior Draft PR #77 fixed `04 / KnaBa` but newer forward PR #82 still rendered the suffix. Reused its latest source as the base and changed exactly two shared display templates plus their existing full-label HTML regression test. Draft PR #83 is stacked on PR #82, not on main.
- `i18n/source-de.json` regenerated by canonical extraction: 946→945 units, 26 DE routes stable, one obsolete label removed and no target-language release. Isolated Node24/npm10 clean-install, Astro/Vue/Svelte, 196 Vitest + 61 Node, 122-page build, 8-route ordinal HTML verification, 24 VPS tests all PASS after fixing initial stale-catalog FAIL. Evidence: `docs/evidence/KNABA_ORDINAL_FORWARD_QA_2026-10-26_UK.md`.
- Read-only preview still 8/8 incorrect labels and gallery 404; source PR is NOT deployed. Browser/device/owner/legal/rightsholder/independent review, customer backups/rollback and explicit release approval remain OPEN. Preserve VPS uncommitted concurrent work.
- Forward-synced PR #82 head 64e11b0e32014975393a2d1da728e14b22038e64: upstream contact/UI/AGENTS changes preserved in PR #83; canonical DE catalog from merged build has 945 units/26 routes, new local artifact 6345a20bd5d41ff79ac73e63f0ada156d56e9575300de8225c763da7ff9cec40. Reverify the final remote merge commit before any release.


## 2026-10-26 — User acceptance audit and authorized test release
- Actual base/live at intake: 2164b9505f824486594b2633a05f5fd91aee8c04 (older gallery/contact notes above are historical). Branch fix/knaba-user-acceptance-20261026.
- Added 8 precise construction enquiry topics, 5 synchronized planner cards, dynamic message limits, legacy summary compatibility, ordered homepage trust sections, Assistant keyboard focus/Escape/draft and speech cleanup.
- Runtime code c6277c9; test-only source cecb321ac41106c7a4f6da2d4a98308508852b38 deployed on existing kneba.vsp.rest under lock/CAS, fresh SQLite backup + independent same-host restore, unchanged schema/runtime configuration and preserved 2164b95 rollback.
- Node24 check0/0, 214 Vitest + Node suites28/27/9, build122, i18n26/944, verify and VPS24/24 PASS. 95 baseline public desktop browser pages; live forms/planner/assistant in four locales PASS. HTTPS127/127 and media22/22 PASS.
- Isolated responsive browser BLOCKED: Chromium No usable sandbox; protection retained. Physical device/real owner/provider/rightsholder/offsite acceptance OPEN. Review found no blocker for explicitly authorized test deployment, not production approval.
- Full acceptance/remaining P1-P2 and receipts: docs/KNABA_USER_ACCEPTANCE_2026-10-26_UK.md. No main merge, official-domain change, paid provider activation or real company test message.

- Final read-back: current=cecb321, container healthy, 279 runtime hashes match. Disk subsequently90.236% used /20,628,119,552 B available: WARNING, further cutovers HOLD; no cleanup performed.
## KN-CLOUD-AUDIT-20261026
User-authorized browser audit/fixes/repository persistence/test-domain rollout. Base/live2164b9505f824486594b2633a05f5fd91aee8c04. Cloud Chrome122 route visits; planner/full core choices, topic-specific preparation, PR84 section hierarchy, success-phone dedup, Assistant keyboard focus/Escape, Studio32KiB guard and full migration-ledger preflight implemented. Six SQL files/journal/dependencies unchanged. Evidence and full open gaps: docs/evidence/cloud-ux-audit-20261026/AUDIT_UK.md. Independent API/UI reviews passed; source/build and VPS41/41 accepted in scoped candidate. Public source SHA/deployment receipt appended after publication; no whole-product readiness claim.


## 2026-10-26 — Content refinement and Assistant request lifecycle
- User asks to continue KNABA development and fill gaps. Branch feat/knaba-content-refinement-20261026 reuses PR89/90 and retains PR91, without main merge. Latest observed live73755d1 is included as an ancestor.
- Four-language Bauhelfer preparation guide (5guides/20routes total), property-specific Finder advice, meaningful workflow gallery, and stale Assistant request cancellation/identity guards implemented. New draft text survives an older successful send; consent/auth/CAPTCHA unchanged.
- Independent content/Finder and Assistant reviews: no blockers. Node24 check0/0; Vitest250 +Node32/27/9 +VPS41; build126; DE27/982; artifact6a5fecdda37dbc4f273f03502116bf9b6d7bac6b317f15621c8083276530bbdc. Browser/live/device evidence separate.
- No backend schema/dependency changes versus73755d1, no cache/data deletion or paid-provider activation. Canonical storage89.64% healthy at preparation, must recheck under lock. See docs/KNABA_CONTENT_CONTINUATION_2026-10-26_UK.md for final rollout evidence and remaining gaps.
## KN-REQUEST-GAP-20261026 — memory / site / repository reconciliation
Current task adds explicit fictional review examples (3×DE/EN/UK/RU) to the existing empty review state, never to database/API/ratings, and restores the missed request for localized partner descriptions: /partner/×4 with five anchored profiles linked from existing logo cards. Exact requirement matrix, source provenance, baseline and remaining voice/ERP/payment/Studio/i18n/owner gaps: `docs/evidence/request-gap-20261026/AUDIT_UK.md`. Preserve actual live baseline cecb321ac41106c7a4f6da2d4a98308508852b38; do not overwrite concurrent enquiry/planner/Assistant work with an older divergent branch. Code-only test-domain rollout requires off-host source, current-pointer CAS, both existing locks, storage gate, online backup and live recheck. No new providers, real review submissions, main merge or official-domain change.

- Final forward candidate supersedes preparation counts: concurrent live56adc59 preserved (partner profiles + disclosed fictional review examples); no old-source cutover. Independent review PASS;252Vitest+68native+41VPS=361tests,130HTML,100Studio,28DEroutes/1001units. Client0e769665a337c4f83f2be87b460e2753bdea4ad86d3d8699bc37b782a81def73; CSS40949B/JS194007B gzip. Both locks and new56adc59CAS required. PR93; wider PR92 proxy/auth/migration work remains separate.

## 2026-10-26 modular admin extension
Preserved canonical `/admin/` and old `/studio/`, `/crm/`, `/konto/`, `/postfach/`. Typed same-origin registry and lazy adapters reuse existing real features without parallel CMS/API. ERP V4 source imported at repo root separately, NOT a live connector. More at `../docs/unified/KNABA_MODULAR_CMS_RECOVERY_2026-10-26_UK.md`.


## KNABA legal/Datenschutz checkpoint — 2026-10-28

- Current task: legal risk audit of official knaba.de vs. preview kneba.vsp.rest, improve **existing** DE/RU Impressum/Datenschutzerklärung and visible four-language automated-assistant notice, without fake legal certification or unapproved deployment.
- Preserved base: Draft PR #109, source branch \`feat/knaba-unified-signin-registration-20261026\`, exact starting HEAD \`444a06af0d8f80184291a5fe9600251d0dce96cf\`. Dedicated stacked source branch: \`feat/knaba-legal-gdpr-review-20261028\`. Main and customer domain unchanged.
- Scope: two privacy pages, two imprint pages, existing \`KnabaAssistant.tsx\`, one legal regression test, existing npm test script, existing \`docs/LEGAL_AUDIT_UK.md\`, this memory/roadmap; no auth/provider/data/migration/secret changes. Legal audit appends to prior 24.10.2026 evidence instead of replacing it.
- Evidence: pinned source \`a62bc91fbc426ce8b830d5cac6ee9e61c35748f2\`, isolated \`node --test tests/legal-regression.test.mjs\` and \`node --check\` on six fetched files: **6/6 PASS** with Node 18.19.1; this is not the project's required Node >=22.23.4 complete check/build. Full test/build, customer/independent legal review and live re-verification are NOT_RUN. Full detail: \`docs/LEGAL_AUDIT_UK.md\` appended audit 28.10.2026.
- Current official \`knaba.de/impressum\` still serves historical TMG, closed EU ODR and legacy GA disclosure; cannot infer actual tracking. New legal wording is source candidate only, not deployed.
- BLOCKERS before official release: owner verifies operator & VAT/registry/business status; legal/HR contracts including AÜG risk for Bauhelfer; worker safety/licensing; GDPR AVV/subprocessor/transfers/retention/manual rights workflow/backup deletion; true-cookie/network audit and third-party brand media rights; owner-approved public legal texts, independent legal review, correct owner server deployment and rollback.
- Do not claim an AGB exists; individual contract terms/Widerrufsbelehrung need separate actual paid order-flow inspection. Any future social OAuth, AI telephony, recording, analytics or marketing requires fresh data-flow and notice before activation.

## 28.10.2026 — KNABA password minimum and developer preview onboarding
- User explicitly requested a **minimum of 8 characters** (not a fixed length or mandatory downgrade of existing passwords). Reconciled the same minimum in the existing VPS credential creation, owner/developer one-time activation, invite-only client/worker/partner registration, password rotation and the DE/EN/UK/RU form labels; existing scrypt hashing, rate limits, no privilege self-assignment, MFA/provider gates and existing password hashes stay unchanged.
- The separately preserved KNABA ERP PostgreSQL identity implementation uses the same minimum for hashing, one-use invitations and self-service password rotation, without changing its role permissions or privileged MFA requirements.
- TDD on the original PR #110 source: focused regressions first failed on the previous 16/12 minima, then the new 8-character cases passed. Isolated Node 24 full website check/build/verification and 79 VPS tests passed; ERP typecheck and 1866 offline tests passed (439 PostgreSQL integration cases skipped in this CPU-only run). Source publication, live preview verification and real developer enrollment require separate receipts. Never treat unit tests as physical-device, real OAuth or full PostgreSQL acceptance.
- Privileged developer identity remains bound to a separate private server email and a revocable server-side grant; never place real email, password, token, session, or private SQLite state into this public repository.

## 28.10.2026 — staging release coordinator / noindex correction

User confirmed this session coordinates kneba.vsp.rest only. No customer production, DNS, search submission or public-profile changes. Base ab6533a6a0ff1d17d0e2dab0a86909cbdc9f3760; release/knaba-staging-20261028 is an isolated candidate. Preserve the concurrent owner-settings/access-dialog worktree; no automatic all-PR merge.

Confirmed defect: vsp build made staging indexable. Corrected public HTML, HTTP and static-document headers; isolated official mode retains production SEO. Empty staging sitemap no longer prevents strict translation-catalog verification: reuse existing Studio route registry. Exact checks, initial test-fixture correction and limitations: docs/evidence/staging-release-20261028/indexability-checkpoint.json. Deployment, role browser UAT, ERP integration and provider gates remain unaccepted.


## 28.10.2026 — exact staging verification / privacy correction

Independent verification reused PR #113 staging noindex code instead of repeating it. Base runtime fcce39ca316419417b2eb7d97605bf4006ab5652. Current working-tree change aligns DE/RU privacy with authorized developer/partner/access-request flows and browser language storage; new privacy acknowledgements use 2026-10-28 while historical records remain unchanged. No schema or provider activation.

Fresh Node24.22.1 check 0 errors/0 warnings, 263 Vitest + 77 Node website tests, 88 real SQLite/VPS tests, staging build 130 HTML and verifier PASS. CSS gzip 40949 bytes; artifact digest 7306560cb740f3cfb84e9c05252ea1d08f49a481fb93c5b67c3054a69d445bf1. This is working-tree source QA until the published source/tree and final deployment receipt are bound.

Cloud browser successfully submitted a synthetic enquiry; identical ID and one persisted SQLite record verified read-only. Secure owner sign-in returned failure, so privileged live browser acceptance is BLOCKED. Full ERP integration/provider delivery, physical devices and owner acceptance remain unaccepted. Current service inventory and per-scenario evidence: docs/evidence/staging-release-20261028/DEMO_REGISTER_UK.md. Customer production/DNS/indexing remain PENDING_USER_APPROVAL after demonstration.

## 28.10.2026 — access request retention correction

Removed implicit deletion of expired access requests during a new submission. Expiry restricts processing; deletion remains exclusively in the existing approved retention workflow with backup. A regression first reproduced lost rows, then passed with preserved expired record and unchanged owner/user counts. Updated DE/RU privacy for partner, separate revocable developer access and access requests without account creation. No invented retention approval or EN/UK legal publication. Node24 focused 11/11, legal 6/6, full VPS 89/89 and staging build/catalog/verify PASS. Evidence: docs/evidence/staging-release-20261028/retention-checkpoint.json. This working-tree slice still requires final staging deployment and browser acceptance.

## 28.10.2026 — migration URL correction and isolated production SEO

Observed official /ber and /jobs lacked equivalent new routes; a real HTTP fixture reproduced /ber 303 to an absent page. Added exact 308 company/career and observed canonical trailing-slash mappings for GET/HEAD; unknown URLs remain 404 and POST is rejected. Full relevant VPS suite 90/90 and root suite 25/25 PASS. Production HTML/SEO verified in an isolated official build: 130 HTML, 104 indexable including legal pages, 100 sitemap entries; no indexing submission or production deployment. Six domain literals require the official source catalogue to be extracted before verify; staging catalogue restored afterward. Detailed evidence is in docs/evidence/staging-release-20261028. Final runtime deployment and authenticated cloud acceptance are still required.


## 28.10.2026 — visual presentation source candidate

Base `9127b1d3424517ea061df2eea2ecc820a6bcfbde`, preserving the concurrent PublicReviews fix. Added an isolated vivid brand theme and bounded, reduced-motion-aware entrances; only zero-reference legacy presentation selectors were pruned. No content/routes/forms/roles/data/provider change. Original 130-page HTML contract PASS: 15,184 text fragments, 6,098 links and 938 controls unchanged. Fresh Node24 check 0 errors/0 warnings (6 existing hints), 263 Vitest + 77 native website assertions and 25 root assertions PASS. Standalone build/i18n/CTA/icon gates PASS: CSS39,767 gzip, clientJS193,036 gzip; artifact `c62fee61eed4d203f0078e797ad0307152c406d85ee00bde44586f26001131d4`. Browser preview is BLOCKED by managed preview/error-URL policy; no visual/mobile/device acceptance claimed. VPS post-build rerun PASS90/90 with0 failures. Final source persistence is owned by the release task. No deployment in this work. Evidence: `docs/evidence/visual-polish-20261028/README.md`.


### 28.10.2026 — final motion contrast verification

Final contrast follow-up: removed entrance opacity fading while retaining bounded translation. Rebuilt artifact `9e494d11e30c4e800a0fccb0f70dc7f5837ac9e5e640491b05b91003e36c5d2d`; CSS39,767 and clientJS193,024 gzip. Fresh root25, module263 Vitest/41 files +77 native, check0 errors/0 warnings/6 hints, preservation130 pages and authorized VPS90/90 PASS. Browser acceptance remains BLOCKED; no deployment. This supersedes the earlier visual artifact/JS totals only.

## 28.10.2026 — role entry, homepage order and responsive cabinets (accepted source; deployment held)

Current user request is KN-ROLE-UX-20261028. Pinned base 5cf1f9734c4b140344aa02e584a634a86e310b71 (same tree as previous d9efa74), isolated feature branch feat/knaba-role-entry-responsive-20261028. Live staging observed separately at306feaec00eb78fd620412de12208ed8ee45f029. Preserve the unrelated uncommitted VPS owner-settings worktree. Detailed user prompt, original scope, role contract, source links and acceptance IDs: ../docs/plans/2026-10-28-knaba-homepage-role-cabinets-uk.md.

Completed source: reordered all existing homepage sections without content loss; lazy native in-page account dialog and server-authoritative role routing; separate assignment-scoped Bauleiter with compatible migration; usable mobile portal/admin controls. Existing owner-details SQL is preserved as migration0010; new role migration0011 follows it without importing unfinished owner settings. No ERP identity bridge, production deployment, real account alteration or provider activation is implied.

Final runtime checkpoint b2d443a07942598153ddaab83ed9d135bb0903d3 integrates staging e2ab9b1883bcac8559dd34939d75bb3e9676dd69, preserving its honest review empty state and native-login strict-origin fix. Isolated real HTTPS/SQLite Chromium155 acceptance:87/87, including six approved roles, pending/suspended denial,320–1440px, short landscape, four locales, native-dialog keyboard trap, real admin modules/dirty-editor protection and full client→admin→Bauleiter→worker→client persistence. Build/check/site289Vitest+9native-file invocations/VPS103/root3 pass;309 files,0errors,0warnings,7hints. Client artifact3b414f64bdc5660387d9bc5b61324240c5c92b9b46aa349a12ecd9d4085b2962;130HTML233files;CSS39332B/JS207805B gzip within unchanged budgets. Detailed receipts:docs/evidence/role-ux-20261028/IMPLEMENTATION_UK.md and acceptance.json.

NOT_DEPLOYED: live release at09:22:55UTC is e2ab9b1; storage91.47% used blocks cutover under existing90% rule (18,031,931,392B available). Automatic approval rejected publishing the candidate branch to public GitHub without explicit permission; no alternate public-upload workaround used. Future migration needs approved publication/release, fresh source+CAS, both locks, verified SQLite online backup/restored-copy rehearsal and compatible runtime/database rollback. Older10-migration runtime rejects the new12-entry ledger; symlink-only rollback is invalid. Physical-device/other-browser/screen-reader/live-owner acceptance and separate ERP/provider gates remain open.

## 28.10.2026 — KN-ROLE-WORKSPACES-20261028 / pre-release checkpoint

Owner authorized completion and deployment on kneba.vsp.rest: same-window cabinets/admin, role-derived login redirects, own requests, worker/manager conversations and isolated developer test data. Recovered KN-ROLE-UX-20261028 source and PR #114 are consolidated into `feat/knaba-role-workspaces-20261028`; continue this task rather than repeating their implementation or release. Concurrent owner-settings work remains preserved. Canonical plan: `../docs/unified/ROLE_WORKSPACES_2026-10-28_UK.md`.

Node24 full logs confirm 319 Vitest + 77 native website assertions, 108 VPS tests and root `npm test` four file wrappers PASS, zero failures (`/tmp/knaba-role-final-{site,vps,root}-tests.log`). Earlier UI check: 332 files, zero errors/warnings; 134-page DE/EN/UK/RU build and unchanged payload budgets passed. Actual browser QA of the prior client candidate `03eb582` found Astro routing intercepted Solid tab navigation and broke focus/Back. The `data-astro-reload` correction is rebuilding; fresh complete browser acceptance, final source/artifact pins and deployment remain IN_PROGRESS. Neither the old 87-case receipt nor local tests establish current browser/live PASS.

Seven inactive KNABA QA dependency caches were reversibly archived, with complete byte/mode/symlink comparison and private archive sizes, SHA256 hashes and restore commands in `/srv/knaba/ops/knaba-qa-dependency-archives-20261028-role-workspaces/receipt.json`. Storage checkpoint PASS: 89.9024104% used, 21,333,299,200 B available; original <90% and 10 GiB gates unchanged and must be rechecked. No source, databases, backups, evidence or other projects removed. Public-source push remains blocked by the previous automatic review rejection, with no workaround; root will preserve a private source bundle and append exact release receipts. ERP bridge, providers, physical-device and real-owner acceptance remain separate.

## 28.10.2026 — KN-ROLE-WORKSPACES scoped deployment completed

Authorized kneba.vsp.rest rollout completed with exact runtime `76f96f6f83d22403a1aa255e8bf2b98311807985`, client SHA256 `8dccc07f54aa2ebd789567409053895f2c11d3ba055165319c03363b1a139ac0`. Current pointer selects that immutable release; healthy UID1000 container and all 360 runtime hashes match the accepted artifact. Final Chromium155 receipts: role 98/98 PASS, developer 36/36 PASS, zero JS errors and unchanged developer primary-data fingerprints. Role suite reran on this source, with anonymous intake HTTP201 stored separately from check status. The earlier Astro/Back defect and intermediate acceptance blockers are resolved for this scoped release.

Deployment evidence: `docs/evidence/role-workspaces-20261028/acceptance-report.md` and `deployment-receipt.json`. Consistent-backup migration rehearsal retained all preexisting row/column fingerprints; old-runtime/current-schema rollback rehearsal PASS. Live ledger has 13 migrations with 0000–0011 unchanged; 13-route smoke PASS, clean integrity and existing business row counts retained. Full live row equivalence is not claimed. Subsequent docs/evidence commits are distinct from deployed runtime76f; no public push, main merge, official-domain change or owner-settings overlay edit.

Developer invitation is PREPARED / USER_ACTIVATION_REQUIRED: confirmed `READY_FOR_OWNER_HANDOFF` receipt at 2026-10-28 11:08:08 UTC, two-hour validity ending 13:08:08.382 UTC that day. Primary application data and preexisting invitations unchanged; accepted runtime verified and still healthy. No primary developer account created, password generated or email sent; activation remains required. This is a time-bound historical handoff checkpoint, not permanent access. USER_ACTIVATION / AUTHENTICATED_LIVE_UAT remain PENDING. Recovered KN-ROLE-UX work is consolidated here; continue this task, do not repeat it. Full other-chat history remains unavailable; accessible source/memory/worktrees are the continuity evidence. ERP bridge, real provider/OIDC delivery, physical-device, cross-browser/screen-reader and real-owner acceptance remain separate open gates.

## 28.10.2026 — six-language customer prototype source checkpoint

The current user request supersedes the historical I18N-99 target inventory: exactly `de,en,pl,lt,ru,uk`, displayed Deutsch, English, Polski, Lietuvių, Русский, Українська in that order; German remains default. Removed the old public target-count claims. Genuine PL/LT home, service overview, contact, planner, FAQ, company, app and separate messenger entries coexist with the preserved four detailed language trees. Untranslated specialist/legal destinations visibly retain DE labels; manifest paths and reciprocal alternates reflect actual translations, not an assumed full six-language article inventory.

Complete PL/LT public forms/planner/auth/portal/workspace/administration-shell dictionaries are present. Portal/workspace/admin copy uses selected-language content-addressed JSON packs, with complete-key validation and previous-language preservation on fetch failure. Roles, API enums and stored business records are unchanged. Astro's generated `.prerender` cache is removed before public packaging to avoid duplicate emitted CSS; original payload limits were retained.

Actual working-tree Node24 gates: check380 files/0 errors/0 warnings/7 hints; 343 Vitest tests plus 9 native file invocations; VSP build160 HTML; extract28 German routes/1,063 units; complete static/metadata/i18n/SVG verification; 121 VPS tests with synthetic data PASS. CSS40,197 B and all emitted JS222,254 B gzip pass unchanged40KiB/220KiB caps. Client artifact `5edbc520516650042994033fc8844111dc5fa131b999bb51339d095af0d0181b`, source digest `d36fd17fc7a975dacb6dd4e754e771c9b309f3d6528f4a017525b696b28acfbd`. Evidence and exact working-tree source manifest: `docs/evidence/customer-prototype-20261028/LANGUAGES.md` and adjacent JSON/logs. Integration commit and independent real-browser acceptance are delegated to root; no new browser, native-language, physical-device or customer-production PASS is claimed by this checkpoint.


## 2026-10-29 — physical server dependency and official-origin candidate

Restored full private Git lineage through role-workspaces bundle f57f04f and customer prototype runtime 19fddd270fed39a545dac0fc3b85f725ce631e4d. All 1500 tracked files compared with recovered snapshot; only generated build evidence and ops/customer README differ. Runtime source and all 13 SQL migrations match. Work continues on isolated feat/knaba-physical-customer-20261029; existing development and customer databases preserved. Dependency installation uses committed lockfile and Node24.22.1. Official-origin build and testing deployment are pending fresh receipts under /srv/knaba/customer/receipts/dependencies-20261029. DNS remains last. Root iOS source-contract assertion corrected to require the actual shared preferences argument and observed AppModel binding; native-device acceptance is not implied. No new paid provider or public source publication authorized by this checkpoint.

Fresh physical-server checks at source 060d196d73636c505b2462612eb380c99641bd03: historical source import and clean snapshot PASS; npm ci installed508 lockfile packages; root28/28, site343 Vitest+85 Node, VPS121/121, Astro/Vue/Svelte zero errors/warnings, official-origin build160HTML and source/i18n/links/metadata/payload gates PASS. Source catalog was regenerated for official domain; no runtime source or SQL altered by build. Final official catalog and report are committed separately. Browser, customer provider configuration and real owner UAT remain open; this is not public readiness.


## 2026-10-29 — physical customer candidate accepted in private testing

This supersedes the pending build/testing status above. Final runtime artifact8a5a93b212ae78807797c153806a72b14c294e7daf8b67d43c428e5e3500a8d6 (411 files including retained APK), source9ef455887ea339ab2c31f10ec7a407557489e42e, was activated through knabactl in testing at16:07UTC after verified SQLite backup. All24 schema files and13migration entries unchanged; production remainsd1ff8e64f38f4d55bbf936b6d070d9578200e233d7f1d86a157b8a1ea4fd3b21. Isolated official-origin production-clone rehearsal14HTTP outcomes passed; six locale pages return200, canonicalknaba.de, anonymousCRM401, Host/TLS421,www308. Testinghealth200/readiness503 (test owner not enrolled) is explicitly not full readiness.

Fresh Chromium155 role suite98/98 forDE/EN/RU/UK and logo suite24/24 for6locales×4widths passed with0JS errors. QA image required OpenSSL3.0.22; after an initial resource-related browser crash at256PIDs, final bounded768PID run measured peak380PIDs/1403363328bytes, zeroOOM/max events. Earlier failures remain recorded; the previous crash cause cannot be proved retrospectively. Source checks:root28,Vitest343+Node85,VPS121,check0errors0warnings,official160HTML/links/metadata/catalog gates passed. npm audit:3low via build-tool deepmerge chain;0moderate/high/critical; no unsafe major downgrade applied.

Independent reviewer /root/source_review accepted exact source/package/private deployment/synthetic browser scope. /root/runtime_review confirmed existing VSPStudio,DomainFree andAVENQOpublic localHTTP200; AVENQO API remains deferred (media/worker startup constraints). Public release HOLD pending customer-ownedCloudflare/Turnstile/Access, testingowner enrollment, realowner/provider UAT and existing production approval receipts. DNS andmail unchanged; no publicpush/mainmerge. Full evidence:/srv/knaba/customer/receipts/dependencies-20261029. Next:customer account configuration andUAT, then exactproduction promotion, DNS last.


## 2026-10-29 — customer-domain legacy routes accepted in testing

Source571823a5a04969f391dcc54babcffc2a416ae525 fixes the confirmed retired-office redirect portability bug and preserves duplicate query parameters. Runtime changed only two lines in vps/server.mjs; expanded HTTP regression covers four origins, four existing legacy locales, GET/HEAD308, POST405+Allow, exact targets and unknown404. RED old200 reproduced; finalVPS121/121 and committedfocused1/1 PASS. Priorroot28 is reused unaffected-input evidence, not a later rerun.

Testing now selects immutable411-file artifact21c88a4148b2191d56d5b3ad9e9cc6929730535f33850cca87d3b74b652d9e23, activated17:30:12UTC by unchangedknabactl after integrity-checked onlinebackup. Exactly server.mjs and its test differ from8a5;409files, all24schemafiles and all dist bytes unchanged. Fresh17:31:20UTC HTTP:160/160HTMLpaths (158exact+2intentional308),126/126assets,213/213linkedpaths,16/16legacy mappings; Host/TLS421, unknown404, privateAPI401/403, Studio3/3 correctqueries200. No business writes. Independent technicalreview ACCEPT_SCOPED_TESTING_ROUTES.

Production remains d1ff8e64f38f4d55bbf936b6d070d9578200e233d7f1d86a157b8a1ea4fd3b21 with unchangedconfig. Freshexternal17:32:16UTC still sees oldOne.com publiccontent; ownpreview remainsAccessprotected. Customer zone usesgloria/ed, not the pending personalcopy. Installed tokenmanager stillAUTH_REQUIRED; user prefers customer USER API TOKEN entered via sudo /usr/local/sbin/knaba-cloudflare setup inphysicalterminal/SSHas knaba, notmemberinvitations. Tokennevertothechat. Testingowner/Access/Turnstile/realcustomeracceptance remainopen; readyz/gateway503 are not fixedby routing. No publicpush/mainmerge, DNS/mailwrite or productionapprovalfabrication. Evidence:docs/evidence/route-migration-20261029/ and private /srv/knaba/customer/receipts/routes-20261029/. Next actual prerequisite is customer authentication; continue latestverifiedartifact, not oldercandidate.


## 2026-10-29 — client origin for owner-domain migration

Source fix d57c342224c831307c36dec6da9a83463e31f10f (base0cf80e3) gives Astro site and client validator one explicit nonsecret release mode. Official absolute knaba.de URLs are now accepted and preview/external unsafe URLs rejected in the actual generated asset; preview behavior preserved. New required regression reproduces old failure in a browser-like VM and passes14cases across2modes afterfix. Full official build160HTML, check0errors/0warnings/7existinghints,343Vitest+86native,121VPS,28root passed; independentcode review ACCEPT. Clientartifact11c01f5db33356a4c7ec7ce196a21743e9ad4f3f270bc8cd864e5d54bf9d04ac; actualasset8e3f4119259cfaff49146c5e041a9d05a5dc9f3b544f2a6dce9d6d76b7130288 verified7/7. Evidence: docs/evidence/client-domain-origin-20261029/README_UK.md and existing official-build-verification.json. This isolated source candidate has not changed live production/testing, DNS, mail, helper or tunnels. Owner API access was separately verified in operational context; earlier AUTH_REQUIRED entries are historical, not a reason to request credentials again. Final runtime packaging, real owner/browser/provider acceptance, coordinated official activation and public route checks remain with the existing deployment writer. No public source push/main merge; private source persistence retained.


## 2026-10-29 — P1 trusted proxy IP candidate (not deployed)

Isolated fix/knaba-trusted-proxy-ip-20261029 starts from verified clean source 0cf80e3010d1a52c5147456bce3bf6db5c7ac06d. The prior shared-proxy lead quota was reproduced: after visitor A used 20 requests, visitor B received HTTP429. New server-only client-ip.mjs resolves one canonical visitor IP for both login and the compiled Worker. Empty KNABA_TRUSTED_PROXY_IPS trusts no headers; explicit comma-separated IP/CIDR peers may supply one valid CF-Connecting-IP. Invalid/multiple/missing headers fall back to the canonical socket address; IPv4-mapped IPv6 has the same identity as IPv4. Invalid configuration fails before DB access. No XFF, Forwarded, X-Real-IP or identity-header trust; quotas, CAPTCHA, roles and schema remain unchanged.

The current coordinator-confirmed Cloudflare ingress contract supersedes the historical XFF-chain/exact-only implementation proposal in docs/evidence/cloud-ux-audit-20261026/PROXY_IP_FOLLOWUP.md. Operational configuration remains one verified literal peer, proposed 172.20.0.1, not a subnet. Maximum32 entries/4096characters; wildcards, hostnames and /0 are rejected. Trusted-peer provenance and stable forwarding behavior must be verified before activation; a trusted local gateway also means local host access is within the trusted boundary.

Actual Node24.22.1 evidence: focused12/12 (production-mode disposable HTTP/SQLite + real unchanged compiled Worker), fullVPS133/133, root28/28 PASS; git diff --check PASS. Initial fullVPS attempt lacked parse5 in the isolated worktree; copied the already-installed locked parse5/entities packages and reran the complete suite successfully. Test logs /tmp/knaba-proxy-ip-{red,focused,vps,root}.log. Preserved all legacy-route behavior, six locale artifacts and13 SQL migrations. No frontend/Worker inputs changed and no rebuild performed; dist copied unchanged from the verified base. Source/config/artifact independent review and actual ingress acceptance remain PENDING; production/testing pointers, DNS and services untouched. Rollback: restore the previous approved source/artifact and remove KNABA_TRUSTED_PROXY_IPS (socket-only fallback, shared quotas return).


### P1 integration with the concurrent official-origin candidate

Before any activation, detected that testing had advanced to artifact0d544250e45917a78e9b2a981ed09b898aaad039d602144915c56c349c94c531. The earlier proxy-only artifact4965c5210514944c51e3ecac738b1fe53ee088d532b708438d00633df2d77ee5 remains staged-only and is SUPERSEDED for release; it must not replace the newer frontend.

Verified clean base166e85f3643324bde9fc21713578672979861bb8 (runtime origin fixd57c342224c831307c36dec6da9a83463e31f10f), its package/deployment receipts and all six recorded build/test log hashes. 410 files match committed source or its exact built output; the remaining APK matches the previously approved artifact. Applied proxy commit7b91f43 into a fresh isolated fix/knaba-customer-proxy-integrated-20261029. Only two appended-memory conflicts required resolution; both histories retained and runtime proxy code unchanged. Fresh Node24.22.1 focused12/12, VPS133/133, root28/28 PASS against the current0d544 compiled Worker/frontend. Logs /tmp/knaba-proxy-integrated-{focused,vps,root}.log. This integrated candidate retains official client-origin validation and all existing locale/routes/migrations; no frontend rebuild or original-worktree edit. Final immutable package, independent review and production-clone smoke remain coordinator gates; no pointer/config/DNS/service change is part of this integration.


## 28.10.2026 — recorded requirements and public-flow follow-up

Accessible recorded corporate-site requirements reconciled against current code; see `docs/KNABA_REQUIREMENTS_RECONCILIATION_2026-10-28_UK.md`. Preserved newer Assistant/Finder/Studio-SSR/privacy fixes and merged four-locale `/app/` source without claiming native distribution or ERP readiness. Closed bounded omissions: localized raster social metadata/assets and transient inquiry draft/retry/navigation protection (no new Storage/provider writes). Focused30/30 across5 files PASS; source/asset/lifecycle independent review ACCEPT after stale-query and Astro fallback corrections. Full build/browser/test-host acceptance belongs to the final integrated release. Structural Studio composer, upload workflow and95 reviewed locales remain real code/content gaps; owner/provider/legal/native/ERP gates remain separate.


## 28.10.2026 — final requirements follow-up and native header correction

Supersedes pending local/public-desktop acceptance in the preceding follow-up entry only. Both canonical/native full builds and verify:build PASS; final Vitest322/322, typechecks0 errors/0 warnings/7 hints. Original130 routes/938 controls preserved in both134-page builds, with disclosed mobile additions and DE/RU privacy differences. TEST v6 served134 exact HTML bodies,9 exact representative assets and13 expected anonymous API/read/auth responses. Coordinator desktop QA at1363×936 verified carousel/FAQ, inquiry review→home→Back restoration/renewed consent, DE→UK content retention, native sign-in gateway, disabled unsigned app downloads and Assistant Escape/focus; no submissions/auth/provider calls.

V6 static HTTP noindex was actually missing despite134 meta noindex tags. Bounded native Worker correction: default staging, all-routes dispatch, private no-store, preserved body/status/HEAD/304/range/API and upstream/scoped crawler restrictions. Focused37/37 PASS and independent ACCEPT; full local gates repeated. Evidence: docs/evidence/requirements-followup-20261028/static-headers-source.json and updated requirements matrix. V7 publication/header readback belongs to the owning release receipt and is not certified by this checkpoint. Structural Studio/media upload/95 locales, owner/role/mobile UAT, ERP/native distribution and provider/legal gates remain open.


## 28.10.2026 — reconcile TEST v8 / PR #114 and #115

Bounded integration on existing PR #114. Local tested runtime `eae6669c136490b1a94594e493b65c46f1f7f403`, identical GitHub tree at `5d182161aeb53281693f324b3c583c2c7d09fc4d`. Reused public-vivid/public-motion/carousel/optimizer from #115, preserved #114 form/auth/privacy/HTML security fixes and no-opacity contrast. Old styling/motion entrypoints removed. 357 Vitest +77 Node +90 VPS +9 HTML +28 root PASS; 134 pages, unchanged content/control contract, 20 responsive iframe layouts plus scoped browser interaction PASS. TEST v10 published 2026-10-28 20:17:03 UTC from native source 05534fd88e9c53ffc03a933d3c688284cdb48ea3. Final HTTPS: 134/134 exact HTML with meta+HTTP noindex/security, 9 resources, 3 index/config, 13 API and 5 protocol checks PASS. Scoped live browser flows repeated successfully. Version9 was rejected before deployment by archive preflight; v8 retained for rollback. GitHub CI remains UNKNOWN; physical device/authenticated owner/provider/whole-product gates remain open. Exact matrix, commands/logs, source and rollback: [integration report](docs/evidence/integration-114-115-20261028/REPORT_UK.md).

## 28.10.2026 — customer account boundary and isolated environments

- Latest user instruction supersedes the earlier staging-only destination: prepare the physical `knaba` host for customer-owned `knaba.de` production and private `testing.knaba.de`; keep every other developer project/account/VPS unchanged. The user will connect DNS later. Future production updates require both explicit user instruction and confirmation of customer approval.
- Working branch `feat/knaba-customer-environments-20261028`, source base `75c599b0c89bbb0c800e04839af5de6a323d62f3`. Only additive deployment/gateway tooling and canonical context were changed; the newer branch's application runtime was not deployed over the restored source.
- `vps/customer-environments/` contains a KNABA-host-bound controller: full-runtime hash, immutable staging, distinct UID/state/config/network, production SQLite online-backup clone, clean testing DB, disabled/untransferred developer provider credentials, loopback-only bindings, backups, exact-artifact dual-approval production activation and code rollback. Production schema changes require a separate plan; testing data never becomes production data.
- Testing gateway independently verifies configured customer Access RS256 issuer/audience/signature/expiry, fails closed without configuration, preserves application Bearer/native-form authentication, strips forged identity headers and applies private/noindex headers to every response. Two integration corrections: default upstream19121 instead of production19120; strict-origin response policy preserves native form Origin checks.
- Local infrastructure QA: Python12/12 including real SQLite WAL snapshot; Node24 gateway14/14 real loopback HTTP/synthetic RSA; root28/28 policy/source tests. No real customer Access/browser login, Docker bootstrap, DNS or account transfer accepted from these tests. Whole-product/ERP release gates remain unchanged.
- Physical server was initially available with a restored preview, then disconnected22:01:31UTC. It reconnected but was parked by SentinelX Free one-active-host limit while personal VPS occupied the slot. No plan changes, VPS disconnection or bypass attempted. Installation is BLOCKED_EXTERNAL.
- Fresh Cloudflare GET/accounts returned exactly one developer account; customer account access/name/ID and customer GitHub destination are missing. No ownership transfer, public Git push, domain change, paid provider or production update performed. The source19fddd runtime label was not independently equated to public Git5cf1f973/75c599; reverify the actual restored full artifact and source history after host access returns.
- Runbook, precise customer steps, domain metadata/DNSSEC and acceptance limits: `vps/customer-environments/README_UK.md`. Preserve the existing public site and restored source until customer-owned replacements are validated.

## 29.10.2026 — clarified account boundary and physical environment bootstrap

- Latest explicit clarification: all Ivan's existing accounts, repositories and VPS retain their current ownership. Only the future KNABA Cloudflare account/zone/DNS/Tunnel/Access/Turnstile are to belong to the customer. Customer GitHub ownership or a repository transfer is NOT a requirement for this Cloudflare task; any account/repository ownership transfer needs a separate explicit instruction. This supersedes broader ownership assumptions in the 28.10 checkpoint without rewriting historical receipts.
- Physical `knaba` became operational again. The unchanged controller/gateway package at source `4863aa70982df2b6af52682c761d9d32a89cdd08` was staged in `/srv/knaba/customer-setup-staging/20261029-4863aa70982d`. Read-only preflight PASS at 2026-10-29T00:00:18Z; bootstrap completed at 00:01:01Z (01:01:01 Europe/Berlin). Full restored runtime SHA256 `d1ff8e64f38f4d55bbf936b6d070d9578200e233d7f1d86a157b8a1ea4fd3b21`, 411 files. Source image/labels were not relabeled as independently verified Git provenance.
- Status is **INTERNAL_ENVS_RUNNING_PUBLIC_NOT_READY**. Distinct internal production/testing/gateway were installed under `/srv/knaba/customer`; the existing restored preview and other projects were preserved. Production health/readiness200; testing health200/readiness503 because its separate owner is not enrolled. Home, EN/UK/RU and login200 in both; anonymous CRM401. Gateway503 with noindex/nofollow/noarchive/nosnippet until customer Access is configured. These checks do not certify the new design, real authenticated user workflow, providers or complete ERP.
- Initial online SQLite backup364544bytes passed integrity and foreign-key checks. Follow-up 00:01:47Z verified distinct DB inodes, non-root UID995/994, read-only rootfs, unless-stopped policy and loopback-only ports19120/19121/19131; original preview health200. Manual backup-service execution Result=success/ExecMainStatus=0 produced one scheduled backup; timer enabled/active. Receipt `/srv/knaba/customer/receipts/host-verification-20261029.json`. Scheduled fire, restart/reboot, restore drill and off-host recovery are not inferred from that service run.
- Cloudflare connector still exposes only the developer account. First external step: customer member invitation, accepted identity and appropriate account/domain roles plus allowed API access, followed by verifying the actual customer account ID in this connector. Real private identities stay outside the public repository. Customer domain nameservers, full mail DNS/DNSSEC and testing allow/deny remain pending; no public DNS or existing mail was changed.
- New mail request is recorded, not implemented: preserve one.com MX/mail while establishing authorized mailbox addresses, receiving/sending path, provider limits/PTR/SPF/DKIM/DMARC/TLS, existing-message migration and backup. DNS/Tunnel configuration alone does not provision a mailbox.
- Permanent production rule retained: future production changes require Ivan's explicit instruction AND customer approval tied to the exact artifact/configuration. Continue independently on protected testing; no push-to-production automation. Updated runbook: `vps/customer-environments/README_UK.md`.
