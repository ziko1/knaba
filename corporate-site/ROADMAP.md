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
