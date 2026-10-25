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

## KN-FAQ-STUDIO-LEAF — 25.10.2026
- [x] Reproduce rejected FAQ question/answer selector from current DOM, including failing SSR test (RED).
- [x] Permit native details/summary as ancestors without allowing destructive rich-node replacement or HTML injection.
- [x] Node24, all site tests, full static build, SSR tests and isolated preview select/edit/undo QA (GREEN) at executable SHA `1d58071edecd79870c1f1bcd563e54ed70b35805`.
- [ ] Publish only after the active VPS SHA is source-traceable and owner-scoped authentication/draft/publish/restore UAT is completed with immutable release/rollback.
- [ ] Future FAQ CRUD (add/reorder/delete) requires separate typed contract, revision history, accessibility and locale QA. Do not call current leaf editor a full FAQ CMS.

## Live source recovery gate — 2026-10-25
- [x] Preserve active PR59 card design, apply only audited 7e774c3 recovery patch, run isolated Node24 QA.
- [x] Selectively integrate existing PR60 FAQ Studio leaf editor and source-artifact verifier; 151 Vitest +16 Node +18 VPS tests PASS in isolated CI; no deployment inferred.
- [x] Scoped old QA node_modules cleanup on VPS; source/SQLite/releases preserved.
- [ ] Publish and independently review reconciled Draft PR; verify GitHub commit/tree exactly matches tested application code.
- [ ] Owner invitation and real owner UAT (no automatic owner rights), external security/browser/accessibility review, storage release gate, then separately gated developer site cutover.
- [ ] Official knaba.de DNS, customer migrations and production launch require separate approval.

## KNABA-SEO-GUIDES-88 — 25.10.2026

- [x] Restore four independent, contract-honest construction guide topics with DE/EN/UK/RU text and accessible responsive template.
- [x] Reuse existing eight construction service contracts, keep legacy DE/RU guide links where still valid, provide 16 genuine article routes.
- [x] Update existing `studioPages`, sitemap, HTML hreflang and guide-index internal links, not a duplicate CMS.
- [x] Source-pin isolated Node24 check/test/build/verify: 117 HTML pages, 88 sitemap loc, 440 href alternates, 157 Vitest + 35 Node + 18 VPS PASS.
- [x] Chromium: 16 guide URL routes + 6 reflow scenarios; original 24 marketing scenarios and six reflow tests PASS. Mobile checklist typography/localization corrected.
- [x] Source-candidate sitemap compared with actual captured live sitemap: 88/88, missing=0; current pointer unchanged during parity audit.
- [ ] Independent code/security and qualified DE/EN/UK/RU editorial language review; no invented authorship, services, rankings or warranties.
- [ ] Genuine KNABA owner/legal/GDPR acceptance; test real owner login and protected Studio published SEO/article flows.
- [ ] Physical Android/iOS browser + screen reader + true 200% zoom acceptance and field Web Vitals baseline.
- [ ] Explicit approval then preview-only immutable cutover using shared lock/CAS, protected SQLite online backup and post-deploy SHA+route smoke; preserve rollback. Official knaba.de/main merge require separate approval.
- [ ] Google/Bing Webmaster property verification and planned submit only after owner-controlled publication; no IndexNow send, paid analytics or external model dispatch by default.
