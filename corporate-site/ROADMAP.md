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
