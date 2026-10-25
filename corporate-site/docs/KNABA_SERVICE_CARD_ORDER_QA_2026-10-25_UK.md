# KNABA — service-card order and visual alignment QA (2026-10-25)

## Scope and source identity

- Source branch: `fix/knaba-service-cards-order-20261025` stacked on the source-recovery candidate `fix/knaba-vsp-source-reconcile-faq-20261025`.
- Baseline parent SHA: `6d3ca1193ff98ffc46e7688a74896789fd2fb6a3`.
- **Exact executable/tested commit**: `b40c2e173e505ff9725449c30009fae02f131b3c`.
- Tested git tree: `a303e8d603dc97925f0a6db03d9ade689689d3e7`.
- Tested Astro build artifact SHA-256, as reported by `npm run verify:build`: `4360d614079371cf620ff495f43f0540df09cd129ce4a8b16128840922f99192`.
- Documentation-only commits after the tested commit must not be described as fresh executable test results.

## Implemented

- Shared display order on the homepage and service catalogue for DE/EN/UK/RU: `01 Baureinigung`, `02 Bauzwischenreinigung`, `03 Baufein-/Bauendreinigung`, `04 project planning CTA`, `05 Bauhelfer`, `06 Baustellenberäumung`.
- Planner remains a **call to action, not an additional service**. Service slugs, ServiceCarousel order, and CRM data remain unchanged.
- Dynamic ordinals `01`–`06` derive from the same shared card sequence. Links retain locale-specific prefixes and the planner route.
- Catalogue CTA now matches the existing pastel mint/sage homepage visual treatment; card actions and text-style arrows align. Existing keyboard focus styles retained; responsive one-column behavior retained.

## Isolated verification (PASS)

- Source fetched via GitHub into a separate QA-only path; deployed releases, secrets and live data not mounted.
- Node `v24.22.1` in offline, resource-bounded Docker (`--network none`, 2 CPUs, 2600 MB RAM, 180 PID ceiling, cap-drop, no-new-privileges); shared existing dependencies mounted read-only, isolated writable Vite caches in tmpfs. No new packages or paid services provisioned.
- `npm run check` — exit 0, zero TypeScript/Astro/Vue/Svelte errors; zero final warnings. Advisory hints in pre-existing VPS JavaScript did not fail checks.
- `npm test` — exit 0: **152/152 Vitest** and **16/16 Node** assertions passed.
- `KNABA_RELEASE_MODE=vsp KNABA_VSP_INDEX_APPROVED=1 npm run build` — exit 0; **103 static pages** generated.
- `npm run verify:build` — exit 0; existing checks plus **8/8** DE/EN/UK/RU homepage/catalogue grid route assertions: six cards, `04` project CTA, `05` Bauhelfer, `06` clearance; exact order and localised links.

## Not verified / release boundary

- **NOT_RUN:** pixel-level screenshot review against actual iPhone/Android, screen reader, 200% zoom, field CWV, real-world visual perception and live release smoke.
- Connected Opera browser reported `Browser not connected`. No claim of an Opera/browser QA pass.
- **NOT_DEPLOYED:** no push to a live VSP service, DNS, official domain, no merge into main, no customer data/production database changes.
- Existing 95 pending language targets are not published translations; verification covers all four actually implemented locales only.
- QA used existing cached dependencies (no fresh `npm ci`); perform a clean locked install when the independent release gate allows it.

## Follow-up release acceptance

Independently review the diff, validate iPhone 375/390 and Android 320/360/412 viewports and desktop 1280/1440 for these two sections across the four locales, 200% reflow and contrast, then perform an owner-authorized developer-preview deployment with versioned artifact, pre-switch backup and rollback rehearsal. Customer signoff remains required for official launch.
