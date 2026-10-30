# KnaBa corporate-site roadmap

This scope is the new corporate marketing surface. Existing KNABA V4 roadmap and acceptance history on application branches remain unchanged.

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
## KN-CLOUD-AUDIT-20261026 — current user acceptance request
Source: user requests full kneba.vsp.rest user/browser audit, fixes, repository persistence and test-server rollout. Base/live verified 2164b9505f824486594b2633a05f5fd91aee8c04. Existing canonical scope is retained.
- UX-01: Crawl every discoverable public route in cloud Chrome; verify titles/H1, images, desktop reflow, navigation and core form/planner/assistant/FAQ/gallery flows. Mobile/device/a11y and authenticated owner acceptance tracked separately.
- UX-02: Expose all five core construction choices in the planner using existing marketing topics and unchanged CRM service enum; selected state/checklist/contact topic must agree in DE/EN/UK/RU.
- UX-03: Forward-integrate PR84 section order (process → company/partners → reviews/FAQ → final action), preserving latest labels/brand/components; no duplicate phone after form success.
- API-01: Honor Studio's bounded 32KiB payload allowance while keeping normal 12KiB request cap; streaming/header bypass regressions and persistence proof.
- QA-01: Required check/test/build/i18n/build verifier/VPS gates; independent diff review on exact source.
- OPS-01: Persist tested source off-host, verify fresh source/artifact/DB backup/storage gate, roll out to explicitly authorized development domain only, preserve rollback and reverify browser.
- FULL-01: Record remaining ERP/voice/provider/owner/device/legal/field-performance gaps honestly; no fabricated feature completion, paid providers or main/official-domain release.
Team: root (UI/browser/integration), project_audit (API source), release_audit (server/storage + independent review). External provider spending: none dispatched; account balances unknown.


## 2026-10-26 — Content continuation acceptance
- [x] REUSE-01: retain PR91 and incorporate PR89/90, including the latest live73755d1.
- [x] CONTENT-01: property-specific Finder guidance in DE/EN/UK/RU, correct technical-work separation.
- [x] CONTENT-02: Bauhelfer guide, six-point checklist, service/enquiry routes, sitemap/hreflang/Studio integration.
- [x] CHAT-01: stale/overlapping Assistant request protection and draft preservation;16race regressions. This closes the earlier stale-poll/Finder source gaps.
- [x] QA-01: independent review,359automated tests,126-page build,27-route/982-unit source extraction.
- [ ] OPS-01: persist exact tested source, fresh storage+CAS+backup/restore, authorized test-domain rollout and live readback (receipt will supersede this preparation state).
- [ ] Preserve separate mobile/device/owner/provider/legal/offsite/CWV acceptance; trusted-proxy rate-limit and OG raster remain open.
## KN-REQUEST-GAP-20261026 — memory / site / repository reconciliation
Current task adds explicit fictional review examples (3×DE/EN/UK/RU) to the existing empty review state, never to database/API/ratings, and restores the missed request for localized partner descriptions: /partner/×4 with five anchored profiles linked from existing logo cards. Exact requirement matrix, source provenance, baseline and remaining voice/ERP/payment/Studio/i18n/owner gaps: `docs/evidence/request-gap-20261026/AUDIT_UK.md`. Preserve actual live baseline cecb321ac41106c7a4f6da2d4a98308508852b38; do not overwrite concurrent enquiry/planner/Assistant work with an older divergent branch. Code-only test-domain rollout requires off-host source, current-pointer CAS, both existing locks, storage gate, online backup and live recheck. No new providers, real review submissions, main merge or official-domain change.

- Final forward candidate supersedes preparation counts: concurrent live56adc59 preserved (partner profiles + disclosed fictional review examples); no old-source cutover. Independent review PASS;252Vitest+68native+41VPS=361tests,130HTML,100Studio,28DEroutes/1001units. Client0e769665a337c4f83f2be87b460e2753bdea4ad86d3d8699bc37b782a81def73; CSS40949B/JS194007B gzip. Both locks and new56adc59CAS required. PR93; wider PR92 proxy/auth/migration work remains separate.


## Legal/Datenschutz gate — 28.10.2026

- [x] LEGAL-01: inspect official published Impressum, current preview headers, shared company facts, staged auth/assistant capabilities and old legal audit; identify legal code/documentation gaps (not lawyer-certified).
- [x] LEGAL-02: update existing German + Russian \`impressum.astro\` and \`datenschutz.astro\` without replacing existing policies, preserving central company data and real source behavior; no fictitious permissions, no false cookie/retention assurances.
- [x] LEGAL-03: add direct automated-assistant notice in the existing \`KnabaAssistant.tsx\` for DE/EN/UK/RU and six scoped legal source tests integrated into existing npm test command.
- [x] LEGAL-04: run isolated text regression on SHA \`a62bc91fbc426ce8b830d5cac6ee9e61c35748f2\` => Node 18.19.1, **6/6 PASS**; report not equivalent to full Astro/Node24 E2E QA.
- [ ] LEGAL-05 (BLOCKER, owner + counsel): verify official company/legal/HR/contract facts, §18 HwO/HWK, Gewerbe status, potential AÜG risk, B2C/PAngV/withdrawal and VSBG.
- [ ] LEGAL-06 (BLOCKER, privacy/operations): actual Article 28 processor agreements, global data flow/cookies, Article 30 record, deletion/retention matrix and backup deletion, DSR response procedure, incident plan, security review.
- [ ] LEGAL-07 (BLOCKER, release): independent current-SHA review; full Node >=22.23.4 check/test/build + VPS + 4-language link/cookie/device/browser; operator approval of legal text; safe staged rollout with backup & rollback; validate after official domain migration.
- [ ] LEGAL-08 (future, not authorized yet): if online paid booking, social auth, external AI/WhatsApp voice, recording, analytics or marketing is enabled, create purpose-specific contract/notice/consent/accessibility/consumer-law QA before activation.

Canonical detailed audit and sources: \`docs/LEGAL_AUDIT_UK.md\`. Stacked Draft source candidate, no production merge or deploy.

## 28.10.2026 — пароль 8+ та окремий доступ розробника (KNABA preview)
- [x] Узгодити мінімум 8 символів у VPS/ERP backend та формах DE/EN/UK/RU; старі паролі й захист сесій не змінювати.
- [x] Red/green регресії: новий пароль із 8 символів дозволено, 7 — відхилено, developer grant є відкличним, клієнт/працівник/партнер очікують погодження власника.
- [x] Ізольовані Node24 site check/build/verify/тести та ERP typecheck й CPU-тести зафіксовані в окремих QA-логах. 439 реальних PostgreSQL-кейсів не були запущені в CPU-only прогоні.
- [ ] Окрема server-only email конфігурація та передача тимчасового секрету поза GitHub; завершити реальний live login/logout/role smoke для developer без публікації пароля в документації.
- [ ] Повторити live preview QA на опублікованому точному Git SHA, незалежний review, мобільні пристрої, Google/Microsoft OAuth, ERP/PostgreSQL SQL concurrency та замовницький UAT. Production cutover окремий і не дозволений цими тестами.

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


## 28.10.2026 — visual presentation enhancement

- [x] Preserve all 130 routes and original text/link/control contract while adding the shared brand/motion layer; retain the concurrent PublicReviews fix.
- [x] Independent source review corrections, Node24 checks, 263 Vitest +77 native website and25 root assertions, standalone build/i18n/CTA/icon gates; unchanged CSS/JS budget limits.
- [x] Complete post-build VPS rerun:90/90 PASS,0 failures.
- [ ] Complete source persistence and browser/mobile/keyboard/device acceptance; managed preview currently BLOCKED.
- [ ] Separately authorize and verify any staging publication; customer production/official-domain/provider gates remain separate.
- Evidence: `docs/evidence/visual-polish-20261028/README.md` (base `9127b1d3424517ea061df2eea2ecc820a6bcfbde`, no deployment).


### 28.10.2026 — final motion contrast verification

Final contrast follow-up: removed entrance opacity fading while retaining bounded translation. Rebuilt artifact `9e494d11e30c4e800a0fccb0f70dc7f5837ac9e5e640491b05b91003e36c5d2d`; CSS39,767 and clientJS193,024 gzip. Fresh root25, module263 Vitest/41 files +77 native, check0 errors/0 warnings/6 hints, preservation130 pages and authorized VPS90/90 PASS. Browser acceptance remains BLOCKED; no deployment. This supersedes the earlier visual artifact/JS totals only.

## KN-ROLE-UX-20261028 — current user-directed continuation

- [x] UX-01: homepage narrative order, every previous section retained inDE/EN/UK/RU; reorder content invariant passes. Latest upstream honest-review change preserved.
- [x] UX-02–04: lazy in-page account dialog, all role entries, server-derived cabinet, verified keyboard/focus and failure handling, including stale async completion.
- [x] ROLE-01/02 +DATA-01: assignment-scoped Bauleiter, preserved existing role boundaries and verified12-migration upgrade/retention.
- [x] UX-05/06: responsive portal plus admin control centre, 320–1440px and short landscape in Chromium155.
- [x] QA-01/02 +DOC-01:87 isolated real SQLite/HTTPS browser checks,289Vitest+9native-file invocations,103VPS,3root; build/check/i18n/unchanged budgets; independent reviews and complete prompt/evidence.
- [ ] RELEASE-01: explicit permission to publish candidate to public GitHub after automatic approval rejection; current disk91.47% blocks cutover. No live deployment claimed.
- [ ] LIVE-UAT: fresh backup/restore+locks+CAS, migrated staging readback, physical devices, Safari/Firefox, screen reader and real owner acceptance remain separate.

Canonical execution plan: ../docs/plans/2026-10-28-knaba-homepage-role-cabinets-uk.md. Runtime source b2d443a07942598153ddaab83ed9d135bb0903d3 includes upstream e2ab9b1; artifact3b414f64bdc5660387d9bc5b61324240c5c92b9b46aa349a12ecd9d4085b2962. Evidence:docs/evidence/role-ux-20261028/acceptance.json. Scope is existing website cabinets; full ERP/provider/customer-production gates retain their prior state.

## KN-ROLE-WORKSPACES-20261028 — SCOPED_DEPLOYMENT_COMPLETED / USER_ACTIVATION_REQUIRED

- [x] Consolidate recovered KN-ROLE-UX source and PR #114 into the active workspace task; preserve the concurrent owner-settings worktree. Do not repeat the earlier implementation or transfer its browser PASS to the new artifact.
- [x] Full Node24 source suites: 319 Vitest + 77 native website assertions, 108 VPS tests and four root file wrappers PASS; logs `/tmp/knaba-role-final-{site,vps,root}-tests.log`. Earlier 332-file check had zero errors/warnings; 134-page four-language build and unchanged payload budgets passed.
- [x] Reversibly archive seven inactive KNABA QA dependency caches after complete byte/mode/symlink verification; retain private archive SHA256/size/restore receipts. Storage checkpoint 89.9024104%, 21,333,299,200 B available passes the unchanged <90% / 10 GiB gates.
- [x] Complete the Astro/Solid navigation and Back correction, final rebuild and fresh Chromium155 browser acceptance: role 98/98, developer 36/36 PASS, zero JS errors; developer primary-data fingerprints unchanged. Prior candidate `03eb582` was superseded, not accepted as final.
- [x] Deploy exact runtime `76f96f6f83d22403a1aa255e8bf2b98311807985`, client SHA256 `8dccc07f54aa2ebd789567409053895f2c11d3ba055165319c03363b1a139ac0`, to kneba.vsp.rest with locks/CAS/storage gates, verified backup, full restored-copy preservation and old-runtime/current-schema rollback rehearsal. Healthy UID1000 container, 360 matching runtime hashes, 13 migrations, live 13-route smoke/integrity/business-count checks PASS.
- [x] Developer invitation PREPARED / USER_ACTIVATION_REQUIRED, confirmed by `READY_FOR_OWNER_HANDOFF`: two-hour one-use invitation, primary application data and preexisting invitations unchanged, exact accepted runtime healthy. No active primary developer account, generated password or sent email. Historical expiry: 2026-10-28 13:08:08.382 UTC; recheck before future handoff.
- [ ] User activation and authenticated live role/order/conversation UAT. A prepared invitation is not an activated account or completed live user acceptance.
- [x] Preserve final docs/evidence in a separate Git commit and private `knaba-role-workspaces-final.bundle`; exact documentation HEAD and bundle SHA256 are recorded in `/srv/knaba/ops/knaba-role-workspaces-20261028-76f96f6/source-preservation-receipt.json`. Deployed executable code remains runtime76f.

Canonical status: `../docs/unified/ROLE_WORKSPACES_2026-10-28_UK.md`; release evidence: `docs/evidence/role-workspaces-20261028/acceptance-report.md` and `deployment-receipt.json`. No public push/main merge or owner-settings overlay change; previous publication rejection remains respected. Other-chat history is not fully accessible. ERP bridge, real provider/OIDC flows, physical devices, other browsers/screen reader, real-owner UAT and official-domain release retain their separate gates.

## KN-SIX-LANGUAGES-20261028 — current customer-prototype scope

This current user instruction supersedes the earlier I18N-99 expansion plan; its historical receipts remain historical.

- [x] Exact language order DE, EN, PL, LT, RU, UK; German default; remove old public language-count claims.
- [x] Genuine PL/LT core public pages and interactive forms/planner; localized shared branding, access, portal, conversations and administration shell; preserve the existing four detailed trees.
- [x] Six-language app and separate WhatsApp/Telegram entries integrated with root's release-channel work. Detailed/legal content without a translation remains visibly marked DE; no invented equivalent URLs.
- [x] Selected-language portal JSON packs, complete-copy validation, failure/retry behavior and unchanged CSS/JS budget gates; generated Astro intermediates excluded from public output.
- [x] Actual working-tree check, 343 Vitest/9 native file invocations, build160 pages, source extraction/verification, locale/static/icon/CTA checks and121 VPS tests PASS. Source/artifact hashes and logs: `docs/evidence/customer-prototype-20261028/`.
- [ ] Root integration commit and fresh browser/role acceptance on the final source and artifact; no transfer of old browser receipts.
- [ ] Independent native-language/legal review, customer owner acceptance, physical-device/cross-browser/screen-reader and field-performance checks retain separate status. Existing specialist CRM/Studio/assistant-inbox editor screens are not claimed as fully six-language localized.


## 2026-10-29 — physical customer candidate accepted in private testing

This supersedes the pending build/testing status above. Final runtime artifact8a5a93b212ae78807797c153806a72b14c294e7daf8b67d43c428e5e3500a8d6 (411 files including retained APK), source9ef455887ea339ab2c31f10ec7a407557489e42e, was activated through knabactl in testing at16:07UTC after verified SQLite backup. All24 schema files and13migration entries unchanged; production remainsd1ff8e64f38f4d55bbf936b6d070d9578200e233d7f1d86a157b8a1ea4fd3b21. Isolated official-origin production-clone rehearsal14HTTP outcomes passed; six locale pages return200, canonicalknaba.de, anonymousCRM401, Host/TLS421,www308. Testinghealth200/readiness503 (test owner not enrolled) is explicitly not full readiness.

Fresh Chromium155 role suite98/98 forDE/EN/RU/UK and logo suite24/24 for6locales×4widths passed with0JS errors. QA image required OpenSSL3.0.22; after an initial resource-related browser crash at256PIDs, final bounded768PID run measured peak380PIDs/1403363328bytes, zeroOOM/max events. Earlier failures remain recorded; the previous crash cause cannot be proved retrospectively. Source checks:root28,Vitest343+Node85,VPS121,check0errors0warnings,official160HTML/links/metadata/catalog gates passed. npm audit:3low via build-tool deepmerge chain;0moderate/high/critical; no unsafe major downgrade applied.

Independent reviewer /root/source_review accepted exact source/package/private deployment/synthetic browser scope. /root/runtime_review confirmed existing VSPStudio,DomainFree andAVENQOpublic localHTTP200; AVENQO API remains deferred (media/worker startup constraints). Public release HOLD pending customer-ownedCloudflare/Turnstile/Access, testingowner enrollment, realowner/provider UAT and existing production approval receipts. DNS andmail unchanged; no publicpush/mainmerge. Full evidence:/srv/knaba/customer/receipts/dependencies-20261029. Next:customer account configuration andUAT, then exactproduction promotion, DNS last.


## 2026-10-29 — scoped route completion on the physical customer server

- [x] Reproduce and fix retired-office redirect portability; preserve locale, duplicate query and GET/HEAD-only behavior.
- [x] Source571823a; finalVPS121/121, committedfocused1/1, reused unaffectedroot28; independent technicalreview accepted.
- [x] Stage and activate testing artifact21c88a4148b2191d56d5b3ad9e9cc6929730535f33850cca87d3b74b652d9e23 via unchangedcontroller, with verifiedbackup and unchanged24schemafiles.
- [x] Post-deploy160HTMLpaths,126assets,213linkedpaths,16legacy routes and Host/TLS/privateAPI boundaries PASS. Evidence:docs/evidence/route-migration-20261029/acceptance.json.
- [ ] Customer USER API token entry through installed securetokenmanager; then inventory and configure customer-owned Tunnel/Access/Turnstile.
- [ ] Real testingowner enrollment and customer/provider UAT; configured gateway and captcha remain blocked.
- [ ] Exact final production artifact/config approval and web cutover, external all-route/SEO checks; keep mail unchanged. Publicdomain still oldOne.com at17:32:16UTC.


## 2026-10-29 — official client-origin regression

- [x] Reproduce real client build choosing old preview origin and rejecting official absolute URLs.
- [x] One Astro/Vite release constant; preserve strict URL validation and preview behavior; no new dependencies.
- [x] Source d57c342224c831307c36dec6da9a83463e31f10f: red-before/green-after14case regression; full160page officialbuild, source checks,343Vitest+86native+121VPS+28root; actual generated asset7/7; independent review ACCEPT. Evidence: docs/evidence/client-domain-origin-20261029/.
- [ ] Integrate verified candidate11c01f5db33356a4c7ec7ce196a21743e9ad4f3f270bc8cd864e5d54bf9d04ac into the existing customer release; preserve runtime data and retained artifacts.
- [ ] Real browser editor journey, official production activation, owner tunnel/DNS cutover and external route smoke; mail/private VSP preserved. Source/build verification does not close these live gates.


## 2026-10-29 — P1 trusted proxy visitor quotas

- [x] Reproduce shared visitor bucket on the current physical-customer source; retain all current quota values.
- [x] Implement explicit default-deny proxy IP/CIDR configuration and single validated CF-Connecting-IP resolution for login and Worker; preserve canonical IPv4/mappedIPv6 identity and conservative fallback.
- [x] Focused12, fullVPS133 and root28 tests PASS on Node24.22.1 with disposable production-mode HTTP/SQLite fixtures; unchanged compiled Worker and production CAPTCHA behavior.
- [ ] Independent source review, exact immutable artifact and literal-peer configuration review; verify real Cloudflare ingress strips client spoofing and preserves authenticated client address.
- [ ] Activate only after coordinator acceptance and record final source/artifact/config hashes. P1 is source-fixed, NOT live-closed. Existing owner/provider/production gates remain separate.


P1 integration checkpoint: preserve concurrent official-origin source166e85f/runtime d57c342 and artifact0d544. Earlier proxy-only staged4965 is superseded and must not activate. Fresh integrated focused12/12, VPS133/133 and root28/28 PASS; both source histories retained. Final package/independent clone smoke/ingress acceptance remain open.


## 28.10.2026 — recorded requirements and public-flow follow-up

Accessible recorded corporate-site requirements reconciled against current code; see `docs/KNABA_REQUIREMENTS_RECONCILIATION_2026-10-28_UK.md`. Preserved newer Assistant/Finder/Studio-SSR/privacy fixes and merged four-locale `/app/` source without claiming native distribution or ERP readiness. Closed bounded omissions: localized raster social metadata/assets and transient inquiry draft/retry/navigation protection (no new Storage/provider writes). Focused30/30 across5 files PASS; source/asset/lifecycle independent review ACCEPT after stale-query and Astro fallback corrections. Full build/browser/test-host acceptance belongs to the final integrated release. Structural Studio composer, upload workflow and95 reviewed locales remain real code/content gaps; owner/provider/legal/native/ERP gates remain separate.


## 28.10.2026 — final requirements follow-up and native header correction

Supersedes pending local/public-desktop acceptance in the preceding follow-up entry only. Both canonical/native full builds and verify:build PASS; final Vitest322/322, typechecks0 errors/0 warnings/7 hints. Original130 routes/938 controls preserved in both134-page builds, with disclosed mobile additions and DE/RU privacy differences. TEST v6 served134 exact HTML bodies,9 exact representative assets and13 expected anonymous API/read/auth responses. Coordinator desktop QA at1363×936 verified carousel/FAQ, inquiry review→home→Back restoration/renewed consent, DE→UK content retention, native sign-in gateway, disabled unsigned app downloads and Assistant Escape/focus; no submissions/auth/provider calls.

V6 static HTTP noindex was actually missing despite134 meta noindex tags. Bounded native Worker correction: default staging, all-routes dispatch, private no-store, preserved body/status/HEAD/304/range/API and upstream/scoped crawler restrictions. Focused37/37 PASS and independent ACCEPT; full local gates repeated. Evidence: docs/evidence/requirements-followup-20261028/static-headers-source.json and updated requirements matrix. V7 publication/header readback belongs to the owning release receipt and is not certified by this checkpoint. Structural Studio/media upload/95 locales, owner/role/mobile UAT, ERP/native distribution and provider/legal gates remain open.


## 28.10.2026 — reconcile TEST v8 / PR #114 and #115

Bounded integration on existing PR #114. Local tested runtime `eae6669c136490b1a94594e493b65c46f1f7f403`, identical GitHub tree at `5d182161aeb53281693f324b3c583c2c7d09fc4d`. Reused public-vivid/public-motion/carousel/optimizer from #115, preserved #114 form/auth/privacy/HTML security fixes and no-opacity contrast. Old styling/motion entrypoints removed. 357 Vitest +77 Node +90 VPS +9 HTML +28 root PASS; 134 pages, unchanged content/control contract, 20 responsive iframe layouts plus scoped browser interaction PASS. TEST v10 published 2026-10-28 20:17:03 UTC from native source 05534fd88e9c53ffc03a933d3c688284cdb48ea3. Final HTTPS: 134/134 exact HTML with meta+HTTP noindex/security, 9 resources, 3 index/config, 13 API and 5 protocol checks PASS. Scoped live browser flows repeated successfully. Version9 was rejected before deployment by archive preflight; v8 retained for rollback. GitHub CI remains UNKNOWN; physical device/authenticated owner/provider/whole-product gates remain open. Exact matrix, commands/logs, source and rollback: [integration report](docs/evidence/integration-114-115-20261028/REPORT_UK.md).

## KN-CUSTOMER-ENV-20261028 — production/testing and account ownership

- [x] SOURCE_QA: additive environment controller, immutable full-runtime attestation, independent DB/users/config/network, safe online backup, manual exact-artifact production promotion with both user/customer confirmations.
- [x] SOURCE_QA: Access JWT testing gateway, fail-closed unconfigured state, noindex/private headers, preserve existing app auth. Python12 + gateway14 + root28 tests PASS; meaningful local security review findings corrected.
- [ ] BLOCKED_EXTERNAL: restore active control of physical `knaba`; Free SentinelX slot is occupied by personal VPS. Do not disconnect or change unrelated projects to circumvent the limit.
- [ ] BLOCKED_EXTERNAL: customer Cloudflare membership/accountID, customer GitHub owner/org, owner/developer/tester identities and customer-owned provider credentials. Current connector exposes developer account only.
- [ ] PENDING: re-attest restored runtime/source, install isolated environments, genuine Docker/systemd restart, owner/developer browser workflows, private testing Access allow/deny and same-host restore. Source tests are not this acceptance.
- [ ] PENDING_USER_DOMAIN_STEP: build/verify correct `knaba.de` metadata and future `testing.knaba.de` build origin; customer zone NS, complete DNS/mail export, DNSSEC coordination, then user-directed cutover. Never reuse developer-zone NS as if customer-owned.
- [ ] PENDING: customer repository migration with preserved branch/history/PR evidence, narrowly delegated test development, off-site customer backup and revocation/recovery procedures.
- [ ] CONTINUING RULE: future production deployment only after explicit user instruction plus customer approval tied to the exact artifact. No push-to-production automation.

## Working-source publication and remaining gates — 2026-10-30

- [x] Початковий exact source tree опубліковано в робочій GitHub-гілці; draft PR118 відкритий. Це не main merge чи deployment.
- [x] Включено завершені SEO, ArticleStudio й async slices зі збереженням актуальних shared contracts; unfinished ERP bridges позначено окремо.
- [x] Завершити site repeat на `a193ffd4f031727ca7f3b9e67f72fbf0bab66fbc`:466 Vitest/86 Node/137 VPS,check/build 160 сторінок/verify PASS; зберегти actual receipts.
- [x] Підтвердити незмінені caps: CSS 40 958< 40 960 B; all-emitted client JS 222 112< 225 280 B.
- [x] Початковий remote tree і чистий зведений source checkpoint звірено; актуальний PR118 HEAD і source-lineage/root-validation receipts; не вбудовувати self-hash документа в сам документ.
- [ ] Відновити actual browser acceptance у дозволеному sandbox. Нинішній probe BLOCKED_ENV; journeys/device/company acceptance не прийняті.
- [ ] Зберігати окремі provider/full ERP bridge/customer UAT/production gates; source authorization їх не закриває.

[Повний scoped checkpoint](../docs/unified/GITHUB_RECONCILIATION_2026-10-30_UK.md).

Пізня звірка також включила точний пакет PR117 `ops/sitepanel/` (13 файлів, source `3a873771bc69947b0db9444d72fb6876e4bf355e`): 34 Python + 18 simulated DOM/CLI PASS. SQLite ResourceWarning зафіксовано; install/account-policy scripts не виконувалися, live host/browser acceptance окрема. Додавання пакета не змінило перевірені site/ERP inputs.


## Complete web cabinets — 30 October 2026

Canonical scope: `docs/unified/ROLE_WORKSPACES_2026-10-28_UK.md` RW-09–15. Pagination, actionable overview, searchable people/recipients, request-linked chat, safe retries and date/identity hardening are implemented on `feat/knaba-complete-cabinets-20261030`. Final exact-source verification and server staging/promotion receipts belong in `docs/evidence/complete-cabinets-20261030/acceptance.md`. Browser/mobile acceptance remains BLOCKED until an authorized usable browser is available. Production remains gated by exact-artifact customer confirmation; user authorization to deploy is already present. This entry does not certify the broader ERP/native/provider roadmap.

Final checkpoint: source `2b4190591463d748533b073f2377d1716035bef8`, runtime `198400c15ae399f2e28445c47e12be7534a15c2bfd3366ab66ffd034e3767af3`; 750 automatic tests plus compiled HTTPS role scenarios PASS, official build/budgets/i18n PASS. TESTING_DEPLOYED with verified backup; testing operator onboarding/readiness503 and browser acceptance remain pending. Production unchanged; exact customer confirmation required. See complete-cabinets-20261030/acceptance.md and draft PR119.


## Release continuation — 31 October 2026 (Europe/Berlin)

The renewed user instruction authorizes deployment; do not ask for user approval again. Fresh physical-host status confirms TEST runtime `198400c15ae399f2e28445c47e12be7534a15c2bfd3366ab66ffd034e3767af3` and unchanged production `71fd88c71f67e13f81ecacb5340b1b19eebcdb90bd35217efc75cc42bf20b383`. Source remains `2b4190591463d748533b073f2377d1716035bef8`; this update changes documentation only. Seven compiled HTTPS/SQLite scenario groups for nine synthetic identities passed again on Node22.23.4 (supplemental compatibility check, not a rerun of the prior Node24/750-test receipt). Fresh production backup has integrity ok and zero foreign-key errors. Independent reviewer `/root/release_review` verified manifests, all 24 unchanged schema files and code-only recovery; no new critical source blocker found.

Production health/readiness200 and public login rendering verified; TEST health200/readiness503 still requires owner enrollment. Cloud browser again reaches Cloudflare Access email-code login. Customer confirmation is not present in the checked PR119 email thread or in an unused matching server receipt. Production activation and role/mobile/keyboard browser acceptance are NOT_RUN/BLOCKED, not PASS. Complete the existing operator/Access onboarding, browser acceptance and genuine exact-artifact customer confirmation before normal activation. No production code/configuration/account/DNS changes or provider activation. Full fresh packet: `docs/evidence/complete-cabinets-20261030/release-continuation-20261031.md`.

Cloudflare Access browserAuth request was rejected by automatic approval review before any user prompt/code request because a specific email-account sign-in grant was not established. No workaround attempted. The next browser action requires user approval for tracker.gigamax@gmail.com; this is distinct from the already authorized deployment and from separate customer release confirmation.
