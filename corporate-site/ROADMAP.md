# KnaBa corporate-site roadmap

This scope is the new corporate marketing surface. Existing KNABA V4 roadmap and acceptance history on application branches remain unchanged.

## Current gap audit — 26.10.2026

- [x] Reconcile PR91/90/89/88 and V4/ERP evidence; retain22 groups,24 KNB and72 AC in `docs/evidence/release-gap-20261026/gap-matrix.json`.
- [x] Source candidate: Assistant/inbox races and auth expiry, contextual contact dedup, gallery workflows, Studio32KiB parser, opt-in trusted proxy and atomic migration preflight; independent review and234+68+56 suites.
- [x] Actual live health/ready200,98 desktop navigable pages and126 HTTP endpoints (old deployedcecb321).
- [ ] Candidate mobile/device/screen reader/zoom acceptance; trusted-proxy topology and live two-client negative checks.
- [ ] Storage below90% cutover gate, off-host restore, locked source-pinned test rollout and owner UAT.
- [ ] Integrate latest site into existing PR86 ERP line with reviewed additive reviews/bridge/owner ledger; preserve canonical unified roadmap.
- [ ] Full voice/provider/legal/field performance/95-locales and Studio composer/media gates remain open.

Exact evidence and scope: [release gap audit](docs/KNABA_RELEASE_GAP_AUDIT_2026-10-26_UK.md). Historical entries below retain their original scope and must not override this checkpoint.

| ID | Acceptance | State |
|---|---|---|
| C01 | Audit live source and confirm company/domain with user | Implemented, source documented |
| C02 | Compare compatible modern stacks, choose minimal architecture | Astro + TypeScript + SolidJS selected |
| C03 | Detailed sitemap, implementation plan and reusable prompt | Written; reviewed with route corrections |
| C04 | Corporate pages and honest interactive inquiry path | Implemented; bounded browser flow verified |
| C05 | Checks, build, behavior, size budgets and independent review | Local checks passed in documented scope; broader accessibility/device checks NOT_RUN |
| C06 | Official-domain release with approved legal/brand content | Future release; temporary preview explicitly authorized separately in revision2 |

## Follow-up backlog

1. Confirm image licensing, brand identity, company details and complete hosting-specific legal/privacy text.
2. Integrate real Lead delivery with current KNABA V4 contracts: input validation, abuse control, origin policy, idempotency, delivery receipt and failure handling. Do not close AC-62 using mailto.
3. Approve sitemap and redirects including the former `/ber`, `/jobs`, and `/galerie`; retain historical content until rights and destination are agreed.
4. Release approved artifact to selected host; retain old deployment for rollback. Verify real mobile request and email/CRM delivery.
5. Measure deployed mobile CWV and conversion baseline before optimizing further.
6. Prepare localization architecture and staged 55-language backlog. German is implemented now; each additional locale requires translated content, native-language review, locale SEO and accessibility QA before exposure.

## Revision 2 — authorized temporary preview (24 October 2026)

| ID | Acceptance | State |
|---|---|---|
| R201 | Colorful coherent responsive design | Implemented; desktop screenshot and iframe320/390/768 reviewed |
| R202 | Vue/Pinia finder, Svelte checklist, Zustand selection, Solid Query catalogue and inquiry handoff | Browser flow and 11 Vitest cases passed |
| R203 | Tailwind4/TypeScript/Vite/Vitest actual integration | Checks/build passed; existing 8 inquiry tests retained |
| R204 | Visible temporary notice/noindex/removal and migration plan | Implemented; live meta noindex verified, raw HTTP headers not verified |
| R205 | Public HTTPS kneba.vsp.rest | PASS: domain/provider/TLS active and live browser flow verified |
| R206 | Updated plan, prompt, README, memory, evidence | PASS: plan/prompt/source manifest and live receipts recorded |

Selected Svelte and Vite from the requested slash alternatives. SvelteKit/Turbopack are not installed. No merge or official knaba.de migration. Human UAT, full screen-reader/zoom/physical-device coverage, field CWV, real Lead delivery and final legal/operator approval remain NOT_RUN/future work.


## Revision 3 — SEO і рольовий портал, 24.10.2026

R301–R309 implemented and published in the bounded temporary scope; authenticated owner UAT, full content localization and official-release/operator gates remain open. Повний контракт: [REVISION_3_PLAN_UK.md](docs/REVISION_3_PLAN_UK.md). Base a4854e1e4933b26ec9f029237c0dabb07db25e75; окрема candidate гілка, попередні checkout збережені.

R3 implementation and local verification complete: R301–R308 implemented in the stated language/hosting scope; R309 local checks44 tests PASS, independent backend/content review PASS. Publication receipt follows in docs/evidence/revision3-release.json. This does not close the official-release gates: owner legal/operator review, full translations, real-user/field performance and authenticated human UAT. The original Lead/mailto-only backlog is superseded for the corporate site by the actual D1 endpoint; legacy ERP AC-62 remains independent.

## Russian localization — KNABA-RU (24.10.2026)

User request: «добав росийську локализацию» for kneba.vsp.rest.

| ID | Acceptance | State / owner |
| --- | --- | --- |
| RU01 | Russian public pages, six service articles, four guides and legal translations under /ru/ | Implemented; static translation review PASS / ru_content |
| RU02 | Russian inquiry and planner display, validation, summary; existing API values preserved | Implemented; 5 regression tests + independent review PASS / ru_forms |
| RU03 | Complete Russian portal dictionary and locale-preserving entry | Implemented; 5 locale tests + independent review PASS / ru_portal |
| RU04 | DE/EN/UK/RU switch, reciprocal DE/RU metadata, correct sitemap/noindex | Implemented; route tests + static build PASS / root |
| RU05 | Type/build/tests, browser Russian flow/mobile, independent review and source synchronization | Local checks58/58 PASS; independent review PASS; bounded browser flow observed; further browser actions policy-blocked; version3 published and RU home HTTP200; submission/mobile/authenticated browser checks remain NOT_RUN / root + reviewers |

No new paid provider or service budget: EUR0. Runtime cost is unknown. Existing official-release/UAT gates stay separate. Rollback: redeploy previous temporary Site version without deleting D1 data. Concurrent uncommitted R4 development remains in its separate checkout.


## KNABA Assistant — intake 2026-10-24

- Окрема гілка codex/knaba-assistant-20261024 на базі RU head 412c0c8cfbec69781359be3da44bfa9c2747ab64.
- Assistant public chat -> owner handoff -> owner replies -> customer review of terms. Додано нові схеми без змін чинних таблиць.
- Acceptance: local tests, Astro/Vue/Svelte/type/build, security review. Live auth/guest device UAT, brand/legal/data-retention decision and official release залишаються NOT_RUN.
- Detailed contract, risks and rollback: docs/KNABA_ASSISTANT_INTEGRATION_UK.md. Витрати на платні AI API не активовано.

## KNABA Assistant — наступний безпечний пакет

- [x] Події owner handoff / guest reply / customer offer-decision в D1 outbox, idempotency.
- [x] Вимкнений за замовчуванням Resend adapter, обмеження добових спроб і retry.
- [x] Код відновлення розмови та owner inbox статус повідомлень.
- [ ] Реальна авторизація/квота email провайдера, підтвердження власника, GDPR і тестова email доставка.
- [ ] Незалежний review, live owner/guest/mobile UAT, зняття release-blockers перед production.
- [ ] Окремо: AI-provider із підтвердженою квотою/PII consent, WhatsApp через офіційний бізнес-акаунт.

## LANG-NOTIFY — компактна мова + owner notifications на одній source-гілці, 24.10.2026

| ID | Критерій | Стан |
|---|---|---|
| LANG-N01 | PR #15 dropdown перенесено на PR #18 без зміни D1/Worker логіки | LOCAL_PASS (git patch + type/test/build/static) |
| LANG-N02 | Клавіатура, 4 мови, 320–1440 px, 200% CSS text scale | LOCAL_PASS (60 Chromium комбінацій) |
| LANG-N03 | D1 0000→0001→0002, Worker guest auth, recovery browser E2E | LOCAL_PASS (SQLite/Wrangler/3 Chromium scenarios) |
| LANG-N04 | Зберегти та документувати точний артефакт, rollback і blocker матрицю | DOCUMENTED в `docs/evidence/LANGUAGE_NOTIFICATIONS_RELEASE_2026-10-24_UK.md` |
| LANG-N05 | Live ChatGPT Sites D1 backup+restore rehearsal, trusted identity / owner UAT, release + rollback | BLOCKED_PROVIDER_ACCESS / NOT_RUN |
| LANG-N06 | Зовнішній email/WhatsApp/AI, GDPR retention, approval клієнта | DISABLED / BLOCKED_EXTERNAL |

Не зливати у `main`, не направляти DNS на новий хостинг, не активувати платні API й не публікувати без реалізованих релізних воріт.

## KN-STUDIO owner website editor, 24.10.2026
- [x] Owner role, existing portal+Worker, D1 migrations, manual text/link/local-image/SEO and four-language visual iframe editor, draft/history/restore/manual publishing.
- [x] Source 777007bcd0c0a20b306a90ada845c1568b3f9d6f isolated local QA 86 Vitest + 8 Node, Astro/Vue/Svelte, build 50 pages, static verifier, local Wrangler HTTP + D1.
- [ ] Add block/section drag-drop builder, template/theme/menu/media storage/upload and rights, server-rendered indexable SEO and schema. Current SEO is client-side only.
- [ ] Review PR #17 visuals and PR #20 Bauhelfer facts, brand/legal owner sign-off before merging.
- [ ] Verify real authenticated Sites trusted identity, backup/restore, UAT across physical devices, a11y, field CWV and independent security QA.
- [ ] Real provider AI quota/price consent/budget, external AI tests; disabled without proof.
- [ ] Deploy to existing ChatGPT Sites appgprj_6adc346d6f8881918b73ac79ebc5d759 only with compatible publish/backup interface, record provider rollback receipt. GitHub push alone does not deploy. Current live /studio/ 404.

Code mirror on GitHub: 68fed278b3460e554ebb70937002816e4cb6e66c, exact source tree ed091f283b10bda1d1ef2a80a8f14fac13f1a5d7 matches local validated source. Publish/UAT still BLOCKED.

## KN-VPS-CUTOVER, 24.10.2026
- [x] Єдиний KNABA Site Studio PR22 + CRM (не друга CMS) PR23 + офіційні Bauhelfer і 7 SVG PR21.
- [x] Source SHA 638db18f04ed55f2a9452dd0a6db45560dc1540a: Node24 101 Vitest+8 Node+1 VPS E2E, typecheck 0 errors/warnings, production-mode 51-page build/static verifier.
- [x] Встановлено захищений внутрішній контейнер VPS, SQLite WAL/migrations, checksums, резервування/ізольоване відновлення, restart smoke.
- [ ] Підтвердити доступ і згоду власника one.com DNS, архів поточного офіційного сайту, TLS і поштових DNS.
- [ ] Отримати ChatGPT Sites D1 export/backup, відновити в stage, узгодити власні приватні записи за row-level/count checks, не видаляти Sites до успішного production cutover.
- [ ] Підключити справжню owner identity через protected stdin, перевірити реальні ролі, HTTPS trusted Traefik, field Web Vitals, GDPR/security/legal/browser/physical-device UAT.
- [ ] Публічний apex/www cutover, acceptance та rollback і лише потім окремо перевірене відключення та видалення старого Sites.
- [ ] Розширений blocks/menu/media builder, server-rendered SEO, provider AI квота і бюджет, CRM-to-ERP bridge.

## 2026-10-25 BauService rebrand checkpoint
- [x] New accessible construction/BauService SVG logo, shared layout/favicons.
- [x] New four-language core public routes and construction offer catalogue.
- [x] Contract-qualified drilling, wall/ceiling penetrations and auxiliary inquiries; no false execution promises.
- [x] Legacy marketing links isolated/noindex; historical CRM service codes unchanged.
- [x] Public new request, portal new request and KNABA Assistant updated for construction workflows.
- [ ] External device/browser and owner content review; real lead submission only with approved test record.
- [ ] Confirm official legal service details, permits, specialist subcontractors and image/brand approval before knaba.de release.
- [ ] Human independent design/accessibility review, real CWV and multi-device QA.
- [ ] Translate legal notices only after professional/legal review; do not falsely label German legal text as EN/UK.


## KNABA-UX-CAPTCHA — 2026-10-25
- [x] Preserve shared footer dark rebrand, legal clearance and all four locales
- [x] Sixth planning CTA card on home and service catalogue, 4 languages
- [x] Turnstile client + server and VPS bearer forwarding, Node24 build/unit tests
- [x] Free Turnstile widget and root-only VPS secret provisioned for kneba.vsp.rest; v1 code and browser frame published in Draft PR #42, without human challenge completion
- [ ] Manual captcha completion, privacy/legal, genuine owner onboarding, physical mobile/a11y and field Web Vitals
- [ ] Separate legacy office editorial URLs replacement and redirects with owner-approved content

## KN-I18N-99 — поетапна локалізація (25.10.2026)

| ID | Acceptance / scope | Verified state |
|---|---|---|
| I99-01 | 99 unique canonical BCP47 targets, native names, RTL directions | CODE PASS: 99 catalog, 4 published / 95 pending |
| I99-02 | Searchable compact mobile locale picker without 95 SSR list items | CODE PASS: lazy `/languages.json`, HTML baseline measured |
| I99-03 | No invented `/locale/` pages or hreflang; roles and business enums untouched | CODE TEST PASS (regression + 14 VPS fixtures) |
| I99-04 | Exact Node24 build/static/regression tests | PASS: 121 Vitest + 8 inquiry + 14 VPS, 99 Astro pages; latest test-only SHA 2 VPS PASS |
| I99-05 | Localized copy, forms, errors, assistant, policy per remaining 95 languages | NOT_DONE — translations and independent native review required |
| I99-06 | Verified owner admin credentials + real HTTP Studio save/publish/restore | BLOCKED_OWNER_IDENTITY — only synthetic isolated tests pass |
| I99-07 | Mobile/browser/RTL/a11y/field CWV and owner content review | NOT_RUN |
| I99-08 | VPS dev deployment then official-language SEO indexing with rollback | NOT_DEPLOYED/NOT_APPROVED; disk 95%, current live site untouched |

No automatic provider spending. External translations budget EUR0 reserved until consent, provider quota and rates verified. Bounded glossary-first rollout, no 99x full-site build before disk/performance baseline.

## I18N99 + PR42 scoped continuation, 2026-10-25
- [x] Source integration with 99 target locale registry and honest 4 published / 95 pending state.
- [x] Static/mobile/keyboard/browser/test QA including phone dropdown correction.
- [ ] Deploy to dev VPS with backup and strict TLS, preserve existing Turnstile/Carousel/CRM.
- [ ] Translate 95 remaining languages only with terminology, owner/legal/content review and RTL/device QA.
- [ ] Verify human CAPTCHA, real owner identity and physical mobile UAT.

## KNABA-UX-CAPTCHA-P2 — 25.10.2026, second hardening increment
- [x] Prevent publicly deployed VPS from silently accepting new chats if both Turnstile credentials are missing (503 fail-closed)
- [x] Load challenge only after visitor acknowledges privacy notice; same-tab privacy navigation; show actual provider disclosure in DE/RU
- [x] Refresh expired or timed-out tokens; preserve alternative telephone/e-mail contact
- [x] Fix post-close mobile Assistant launcher covering privacy/legal footer links, add 32 cross-locale viewport regressions
- [x] Replace outdated office illustration reference in Impressum with actual Bau-cleaning site description
- [x] Browser check 98/98 live routes before this increment (no overflow, legal link overlap or broken footer logo); 7 focused 200%-font checks
- [x] Candidate Node24 check/build/tests and synthetic captcha lifecycle + footer/browser regressions
- [ ] Deploy this exact increment on kneba.vsp.rest with immutable code version, pre-switch backup, HTTPS/live route and real widget verification
- [ ] Genuine human on-device Turnstile acceptance, owner account, privacy/legal signoff, field CWV, a11y/screen reader and GDPR data-retention checks

## KN-I18N-99 + latest Turnstile source acceptance (2026-10-25)
- [x] Combined source from latest PR42 and existing PR43, preserving fail-closed Turnstile and mobile/footer fixes.
- [x] Source QA 130 Vitest, 8 inquiry, 14 VPS, static verifier, 97 browser scenarios.
- [ ] Code-only dev deployment with TLS/browser acceptance and rollback.
- [ ] 95 language translations, native review, real CAPTCHA and owner UAT.

## KNABA I18N99 dev deploy verified, 25.10.2026
- [x] Dev VPS code 403c33a deployed with immutable fallback and verified SQLite pre-backup.
- [x] 99 static routes HTTP expected (97x200/2x308), browser 54 live scenarios, noindex, CAPTCHA public config preserved.
- [ ] 95 independently reviewed page/form/legal/assistant translations; do not advertise as available before done.
- [ ] Human Turnstile completion, real owner authorization and Android/iPhone device testing.
- [ ] External offsite backup/restore and disk usage improvement with verified non-destructive candidates.

## STUDIO-PRO implementation and owner acceptance — 2026-10-25
- [x] Owner-scope Studio Pro code: visual/manual JSON, live preview undo, layout design tokens, 68 public pages, curated local media, AI readiness endpoint, original revision/PUBLISH semantics preserved.
- [x] Synthetic owner/auth/SSR/regression + desktop/mobile Chromium isolated test and Node24 source QA; exact code SHA 24dd7fc826ff50c3fab9273ce9e654fbee2095b6.
- [ ] P0 Verified KNABA owner onboarding via protected stdin; real HTTPS login and editor/CRM UAT; /readyz=200 currently NOT DONE.
- [ ] P0 Independent security review, physical mobile+PC accessibility incl 200% text, backup/restore rehearsal, disk warning (96% used), artifact and immutable rollback gating before production acceptance.
- [ ] P1 Full component/block tree editing, reorder/add/delete templates, global header/footer/menu links with scoped published snapshot and review.
- [ ] P1 Signed image upload storage, mime+SVG sanitization, content rights/resize, resource caps, deletion/rollback.
- [ ] P1 Real AI provider authorization with fresh quota, cost cap, transfer/privacy approval; never enable on flags alone.

## Studio Pro dev release follow-up, 25.10.2026
- [x] Deployed code-only Studio candidate to kneba.vsp.rest at SHA 24dd7fc826ff50c3fab9273ce9e654fbee2095b6, 98 public index URLs + one 404 page verified; immutable rollback and SQLite online backup retained.
- [ ] HIGH: verified real owner email + private credentials, restore /readyz 200 and live owner/browser acceptance.
- [ ] HIGH: independent security review, physical device a11y, low-storage doctor, external backup, old D1 record reconcile.
- [ ] HIGH: structured page/section/template composer, multi-page shared nav/footer, authorized media upload, safe AI provider dispatch after actual quota/pricing/cost approval.


## KNABA FAQ + Studio compatibility — 25.10.2026
- [x] Source-based integration on current Studio Pro/Turnstile, not older PR #44
- [x] 42 distinct FAQ items × 4 real languages, native accordion, search, category and empty state
- [x] Four public FAQ URLs, localized home teaser, footer, sitemap and alternates
- [x] Existing owner Studio page selector includes four FAQ URLs, still scoped to validated public pages
- [x] RED/GREEN route-inventory test and offline Node24 QA (144 Vitest + 8 inquiry + 16 VPS)
- [x] Real browser static HTML: four languages × four widths, FAQ search/filter/client nav
- [ ] Exact-source guarded live development-domain rollout, backup/rollback and public route revalidation
- [ ] Owner authenticated Studio actual editing UAT, human Turnstile, GDPR legal review and field CWV remain blocked independently


## EN/UK footer reflow and language-accuracy gate — 25.10.2026
- [x] Red: verify inaccurate DE labels on already translated EN/UK destinations
- [x] Green: repair eight labels through shared Layout; preserve actual German-only legal labeling
- [x] Node24 full tests, 103-page static verifier, route-language browser checks on 390px
- [ ] Source-pinned dev-domain deployment with backup and actual live regression, no production domain/main merge


## Localized footer development release receipt — 25.10.2026
- [x] Published exact 7f886606d5711ac93a88d3d93b54a0a9b5638525 code on kneba.vsp.rest; previous code preserved, fresh SQLite backup and verified integrity
- [x] Post-deploy HTTPS/certificate, Docker health, source SHA, EN/UK footer link semantics, 16 FAQ, 32 Assistant-close, 102 all-route checks
- [ ] Real owner authorizes Studio editing, legal/processors signoff, physical device testing, browser Turnstile human acceptance, verified offsite backup and disk-pressure recovery


## Full-site audit/content release — 25.10.2026
- [x] All 102 active HTML routes audited; 72 public routes checked for unique metadata, canonical, hreflang, H1 and index policy
- [x] 8 service types x4 languages, practical guidance and contact preparation published on kneba.vsp.rest
- [x] Planner topic choice, EN/UK/RU translations, valid privacy/account links and safe locale switching fixed
- [x] Independent content/code review, Node24 checks, browser candidate and live smoke, backup/source-pinned dev rollout at 7e774c3
- [ ] Explicit approval to push source branch to public ziko1/knaba; automatic approval rejected publication, no PR created
- [ ] Real owner and enquiry-delivery UAT, legal signoff, physical devices, field CWV, offsite restore and disk maintenance remain open


## Construction guide rollout — 25.10.2026
- [x] GUIDE-01/02: Four full construction guides in four locales, accessible contents/checklist, contextual enquiry and index cards
- [x] GUIDE-03: 16 article versions, 88 Studio/sitemap routes, reciprocal locale alternates; existing preparation article restored
- [x] GUIDE-05: Article JSON-LD follows published H1/description; drafts, invalid data and foreign nodes protected
- [x] GUIDE-06: Clean repeatable preview→VSP builds; generated duplicates removed without touching persistent state
- [x] GUIDE-04: Independent review, exact 5b5261e QA, guarded dev deployment, backup and live browser/HTTP checks; parallel contrast fix preserved
- [ ] Real owner/editor/lead-delivery UAT and legal/device/CWV/offsite-backup acceptance
- [ ] Explicit public GitHub push permission; coordinate existing auth/Studio PRs without duplicate implementation


## Corporate template increment — 2026-10-25
Source request: inspect what the KNABA corporate website template lacks and implement the useful gaps.
Base: 7590f15db7e1590afe6eaef1388f1963a5042b66; active developer release observed 5b5261e56ad4ae5122495cf3e9b0f87ea7f2d70c.
Root owns implementation; Codex corporate_audit provides independent audit/review; no external paid dispatch.
- CORP-01: factual company profile on company page and discoverable home teaser, DE/EN/UK/RU; existing company data only, no fabricated trust claims.
- CORP-02: shared breadcrumbs on nine public page types and correct desktop/mobile current section, preserve deep-page breadcrumbs and private routing.
- CORP-03: careers actions open localized email intent instead of construction quotation wizard; no automatic sending or new form storage.
- CORP-04: harmonize final catalog tile with homepage and localize timeline kicker; mobile/desktop, keyboard and four-language checks.
- Evidence planned: Node24 check/test/build/verify, navigation regression tests, Chromium route/reflow/CTA checks, independent diff review.
- Publication/deployment separate from code acceptance. Public source publication previously blocked; preserve privately unless authorized.

CORP-01..04 candidate checks complete; independent review ACCEPT; exact source and commands in docs/KNABA_CORPORATE_TEMPLATE_2026-10-25_UK.md. Live publication remains BLOCKED, not marked as deployed.

## Partners and genuine reviews — 2026-10-25
User requests implementation and deployment to existing development site, preserving current work.
- TRUST-01: Five original partner logos explicitly listed on https://knaba.de/, checked 2026-10-25; four-language responsive section and source attribution. No invented endorsements.
- TRUST-02: Public first-party review submission with explicit publication consent, private email, CAPTCHA, idempotency, rate limits, durable storage and owner moderation. No fake seeded testimonials or disclosure of private portal feedback.
- TRUST-03: Owner review controls, public loading/error/empty states, accessibility and four-language copy; publish only approved originals.
- TRUST-04: Preserve current 2c3cccda FAQ editing/artifact verification, corporate improvements and requested six-card order; check exact-source build, actual SQLite API flow, responsive browser and anonymous authorization.
- TRUST-05: Release only after proven cache-only storage recovery, fresh online backup, additive migration verification, current-pointer guard, immutable artifact attestation and live checks. Never prune backups or customer data.
- Root integrates and deploys; delegated partners/frontend/backend implementations and independent rollout inspection. Public GitHub source push remains unavailable after prior automatic review rejection; private source recovery required.

## KN-SVG-01 — shared service icons and mobile title repair (2026-10-25)

- [x] Typed fixed first-party SVG icons (eight real services and separate project planner), four published locales, no external icon SDK, JS or new migration.
- [x] Same icons on home, catalogue, technical offers, hero carousel and detail pages; original service contracts/order preserved.
- [x] Mobile long-title improvement; code SHA `57ccd417cb918cf351f280173050915883f63158`, 180 Vitest + 16 Node + 23 VPS, 117-page build, 32 grid + 32 detail Chromium and 8 title mobile cases PASS. Payload baseline tracked.
- [ ] Version-pinned VSP preview rollout with SQLite backup, rollback and live localized smoke; official domain excluded.
- [ ] Genuine owner enrollment /readyz=503; physical Safari/Firefox/Android, native 200% zoom, screen-reader/field CWV, offsite restore and official sign-off.

## KN-LOGO-I18N-20261026
- [x] Localize DE/EN/UK/RU visible slogan and SVG accessibility descriptions in existing generator; reusable responsive component, no duplicate routes.
- [x] Verify generated source determinism and run pinned Node24 tests/build with 118 locale routes.
- [ ] Recorded live release and independent post-release test receipt, including backup + rollback and asset identity.
- [ ] Native Opera/physical-device/200%-zoom and customer review of translated marketing copy; report BLOCKED separately from PASS.
- [ ] Opera Lab normal-chat native plugin connection, dynamic page-control/accessibility evidence, scoped-cost/browser security gates without TinyFish spending.

## KN-LOGIN-REFLOW-2026-10-26
- [x] Login responsive input card corrected without auth/RBAC modifications; exact code SHA ddf3db88cbce01b50991eb88740ad799fd378f39.
- [x] Red-green focused test, Node24 suite, 118-page static build and isolated Chromium at 320/360/390/768 widths.
- [ ] Owner confirmation of email/identity, safe one-use onboarding, actual login and Studio/CRM UAT, first-login own password, external channel/legal approvals. Do not bypass /readyz owner gate.

## KNABA i18n-99 incremental delivery (26.10.2026)
- [x] Reuse 99-target catalog, truthful 4 published / 95 pending and single approved 4-language 3D brand dictionary.
- [x] Audit published HTML, localized SVG slogan, accessible alt and hreflang as build release gate.
- [ ] Complete 95 native-reviewed language packs, legal wording, form/Assistant messages, RTL/device a11y and page-by-page SEO; never auto-publish partial packs.
- [ ] Real browser/device, legal and owner UAT; release only with exact source/artifact evidence, snapshot and rollback.

## I18N99 language delivery (2026-10-26)
- [x] Stable extractor/catalogue, glossary, draft/gap report and fail-closed source audit, on isolated fdec254 line.
- [ ] Complete 95 native-reviewed dynamic/static language packs, full legal/RTL/mobile/accessibility/brand QA, only then public locale route/SEO release. No unknown-cost cloud dispatch.

## KN-VSP-FORWARD-INTEGRATION-20261026
- [x] Reuse live 83ff0ba source and integrate scoped gallery/5 partners/7 WebP into single existing components without losing reviews/login/Studio/0005 migration.
- [x] Node24 check, 196 Vitest, 52 native, 24 VPS, 8 contrast, 122-page build/indexed sitemap, 99-target (4 published) i18n extraction and independent isolated loopback Chromium QA (logo 16, visual 24, reflow 6, guides 16+6).
- [x] Push exact integration source to `fix/knaba-vsp-forward-integration-20261026` for off-host persistence. No main merge/public cutover.
- [ ] Verify partner trademark usage rights, business claims, actual owner UAT, native device/browser zoom/screen reader and third-party independent security/privacy review.
- [ ] Pre-cutover current-release lease + verified off-host backup/restore and rollback; separate authorized atomic VSP publication; 4-locale live `verify:live` + health and SHA attestation. Official-domain release remains separate.


## 2026-10-26 — User acceptance increment
- [x] Eight enquiry topics, accurate localized summaries and CRM payloads; dynamic message budget and legacy contract regressions.
- [x] Five planner choices, exact topic handoff, Assistant keyboard focus/Escape/draft, homepage sequence.
- [x] Independent review, Node24 source/build/VPS checks, live desktop four-locale scenarios; test-domain deployment cecb321 with backup/restore and 127 HTTPS checks.
- [ ] Finish blocked responsive matrix in a sandbox-capable browser plus physical mobile/a11y/zoom.
- [ ] Real owner/client delivery and role UAT, trusted-proxy rate-limit fix, Assistant stale-poll guard, Finder object-specific guidance.
- [ ] Content rights/legal, social-card compatibility, offsite restore, disk headroom, field CWV and separate ERP/voice/provider acceptance.
- Acceptance and evidence: docs/KNABA_USER_ACCEPTANCE_2026-10-26_UK.md.
