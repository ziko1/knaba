# KNABA 3D logo — source-only QA checkpoint, 2026-10-25

## Scope and exact parent
Parent source commit: `2d4011911101f0ce896771c2a820d829c8f30597`, PR #71 (official five-partner restoration). No unrelated branches merged. New assets and shared responsive branding only; no database, auth, billing, DNS, official knaba.de, production deployment, or existing files removed.

## Approved brand interpretation
User-approved motif: the original 3-chevron-building silhouette, KNABA gold first A, teal #102F38/#13B8B4 and gold #FDBE38, and slogan "Unser Ziel ist Ihre Wertschöpfung". Light background #FBFCF7, footer dark #102E36. These are deterministic first-party scalable SVG **vector adaptations**, not pixel-identical prior 3D PNG exports. Each SVG is under 15 KB, with transparent canvas and no external loads, scripts, or SVG filters.

One shared `Layout.astro` supplies header/footer for DE/EN/UK/RU and route variants, with responsive `picture` sources at 700px. Header eagerly prioritized, footer lazy. Mobile removes microscopic slogan. Existing social OG logo and favicon remain until a separate social/icon review.

## QA and remaining gates
- Local isolated SVG/CairoSVG visual rasterization on paper and footer palette: reviewed.
- Source assertions added for 4 variants, exact palette, structural paths, localization, responsive source switches, file size and transparent backgrounds.
- Full Vitest/Astro/Node suite, built candidate, real browser responsive UX (320/390/768/1440), zoom 200%, physical device, WCAG assessment and independent review: **NOT_RUN on this commit**. User-requested source-only candidate, not release acceptance.
- Run `cd corporate-site && npm ci && npm run check && npm test && npm run build && npm run verify:build` with pinned compatible Node24 in a separate safe worktree; verify asset HTTP and cache update before deployment. Record exact new artifact SHA.
- No actual deployment, no migration. Rollback: discard this PR; previous site/assets intact. Host storage ~95% occupied at last external audit; do not install dependencies/build on live VPS without storage and safety review.
