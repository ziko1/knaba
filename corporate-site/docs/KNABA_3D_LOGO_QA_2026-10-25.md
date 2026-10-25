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

## Focused source QA evidence (current candidate)
- Exact four SVG blob SHA-1 values match local generated/art-rendered bytes:
  - header `441ca78c6d1573c89813f32dd1ebb66b1ddccd9b`
  - footer `0fbcd2ec51f9fdb33f8331b857d96188aff28739`
  - mobile header `71235acbfa4fd7670b16d4ca8b16a96084dd66b0`
  - mobile footer `9e2e406c784608af8f01091c8b1e94b065469568`
- Isolated `node --test scripts/check-knaba-3d-assets.mjs`: **8/8 PASS, 0 failed** (Node v22.16.0); generator reproducibility, three-building geometry, 3D colors, transparency, file-size caps and both flat slogan-contrast ratios. These are focused asset checks, **not full Node24 build acceptance**.
- Static connected-source checks of PR Layout/assets/branch: **10/10 PASS**; DOM-compiled full app not tested.
- Attempted browser QA using Chromium via local `file://` and HTTP loopback; both returned `net::ERR_BLOCKED_BY_ADMINISTRATOR` before rendering. Browser QA **BLOCKED/NOT_RUN**; this is not a site defect and is not PASS.
- The SVGs were also rendered in isolated CairoSVG on paper `#FBFCF7` and footer `#102E36` for manual contrast/layout review.

## Browser-policy repeat prevention (source-only checkpoint, 2026-10-25)

- Added isolated `tests/browser-policy-gate.cjs` and a focused `tests/knaba-logo-browser.cjs` acceptance suite. A loopback-only preflight probes each browser engine once (Chromium -> WebKit -> Firefox); it falls back **only** on explicit administrator-policy block or missing executable. HTTP 503, unexpected preview errors, failed assertions and logo/layout defects return `FAIL` immediately rather than being masked by another engine.
- Browser fixture matrix (defined, **not executed here**): 4 published locales × viewport widths 320/390/768/1440 = 16 cases. It checks source switching for header/footer, image decoding and natural dimensions, localized alt, clipping/overflow and a 200% root-font reflow proxy at 320/390. This proxy is not native browser zoom or physical-device QA.
- Reuse prior policy evidence via `KNABA_BROWSER_SKIP=chromium` after the current environment has conclusively blocked Chromium. Never alter or bypass administrator policies. Node runner returns explicit exit codes: 0 PASS; 1 FAIL; 2 BLOCKED.
- **Fresh isolated check:** `node --test tests/browser-policy-gate.test.cjs` under Node 22.16.0: 7/7 PASS (includes simulated `ERR_BLOCKED_BY_ADMINISTRATOR` fallback, all-blocked, executable absent, HTTP 503, product failure, loopback validation, sandbox flags). These are mocked browser-boundary regression tests, **not** real browser results.
- **Real browser status in this session:** `KNABA_TEST_URL=http://127.0.0.1:18769 node tests/knaba-logo-browser.cjs` returned `BLOCKED / PLAYWRIGHT_UNAVAILABLE`, exit 2, in the isolated checker container; Opera Connector `list_tabs` returned `Browser not connected`. Full Astro build and 16-case Playwright/physical device QA remain **NOT_RUN/BLOCKED**. No browser, paid provider or remote production policy was modified.
- Source-only Draft PR #72; no deployment/merge. Full Node24 `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm run verify:build`, real browser and independent review remain release gates. Exact commit must be re-read from GitHub after the QA-only patch.

- Security regression: the new browser gate does not add `--no-sandbox` or browser-policy bypass flags.

## Client export and fresh verification — 2026-10-25
- A/B presentation prepared from repository SVG assets: live/current logo `knaba-construction-logo.svg`, `knaba-construction-logo-footer.svg`; candidate `knaba-3d-header/footer/mobile-*.svg`. The public https://kneba.vsp.rest/ image paths still point to the old/live files. *Customer mockups are NOT screenshots*; A/B previews use CSS theme backgrounds `#FBFCF7` / `#102E36`. Current mobile header resizes the desktop logo rather than shipping a separate SVG.
- All six source vector Git blob SHA-1 identities matched GitHub source, all six client presentation PNG files decoded, eight transparent logo PNGs inspected, and both downloadable archives passed ZIP CRC/dedup validation. These asset-level checks do not prove deployment.
- Repeated isolated test `node --test scripts/check-knaba-3d-assets.mjs`: **6/6 PASS, 0 failed** under locally installed Node 22.16.0 on source-identical four SVGs (same four Git blob SHAs as this PR).
- Repeated isolated test `node --test tests/browser-policy-gate.test.cjs`: **8/8 PASS, 0 failed** on source-identical browser policy implementation/test file (Git blob hashes `f546e349f8eee143f40494edf39fef7d0bda8401` and `6e0ae41d51a838ce20f18d084d65ece72291fbfb`). Synthetic browser policies only; no actual page browser pass.
- Follow-up accessibility fix to `src/layouts/Layout.astro`: **two anchor accessible names localized** with `aria-label={brandAlt}` in addition to two already localized image `alt={brandAlt}` attributes. Added a Vitest assertion for both anchors; checked via GitHub source readback. Entire Vitest suite **NOT_RUN**.
- `node` in file-workbench is 22.16.0, below project declared `>=22.23.4`; pinned compatible Node24+Astro dependency installation and full integration checks **NOT_RUN**. Do not infer full release QA from isolated Node script tests. Real browser remains blocked by current environment; no repeated identical Chromium policy bypass attempted.
- Gate remains unchanged: **Draft only, no merge, no VPS/production deploy; independent review and release approval outstanding.**
