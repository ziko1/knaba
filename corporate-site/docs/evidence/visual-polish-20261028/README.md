# KnaBa visual presentation candidate — 2026-10-28

## Scope and source

Base: `9127b1d3424517ea061df2eea2ecc820a6bcfbde`. The concurrent PublicReviews fix is preserved. The visual layer brightens existing brand surfaces, strengthens card/CTA depth, and adds bounded entrances and pointer-only hover feedback. Existing copy, routes, forms, roles, data and provider behavior are preserved. This is a source candidate; **no deployment was performed**.

The change adds `visual-polish.css` and `visual-motion.ts` through the shared Layout. Motion leaves content visible without JavaScript, avoids forms/live regions/authenticated tools, skips focused content, cleans up on Astro navigation and honors reduced motion. The CSS reserves forced-colors behavior. Only proven unused legacy presentation selectors were pruned to stay within the existing budget; the proposed duplicate-declaration pass was not applied.

## Actual verification

| Check | Result |
| --- | --- |
| Root `npm test` | PASS; 25 native assertions confirmed |
| Corporate `npm run check` | PASS; 0 errors, 0 warnings; 6 existing Astro hints |
| Corporate `npm test` | PASS; 263 Vitest tests across 41 files and 77 native assertions |
| Build and existing build/i18n/icon/CTA gates | PASS; 130 HTML pages, 4 published locales, 95 planned locales |
| Original content contract | PASS; all 130 routes, 15,184 text fragments, 6,098 links and 938 controls unchanged |
| Browser acceptance | BLOCKED; see limitations below |
| VPS suite | PASS; 90/90 tests after the completed standalone build |
| Deployment / field Core Web Vitals | NOT_RUN |

Native assertion counts were confirmed with the same test files and `--test-isolation=none --test-reporter=tap`; standard npm commands also exited successfully. No new tests or test exceptions were introduced.

Validated artifact: `c62fee61eed4d203f0078e797ad0307152c406d85ee00bde44586f26001131d4`.
Aggregate emitted CSS: **39,767 bytes gzip**, below the unchanged **40,960-byte** gate. Aggregate emitted client JS: **193,036 bytes gzip**, below the unchanged **225,280-byte** gate. These are artifact totals, not observed page transfers or field performance. The i18n source audit reports 28 routes and 1,053 units.

The final build ran with managed preview stopped. An earlier simultaneous preview/build run produced a duplicate Layout CSS artifact; the standalone final build resolves that artifact-writer conflict. An earlier VPS run overlapped build cleanup and lacked `dist/vps/render-page.mjs`; that failed run is not acceptance evidence.

## Preservation and independent review

`preservation.json` records the reproduced HTMLParser comparison. It skips script/style data, collapses whitespace per text fragment, preserves link `href`/`aria-label`/`target`/`rel`, and compares every control attribute except `class`, `style`, `src` and `data-astro-*`.

Independent review corrected the carousel active indicator to target its `::before` dot rather than its 44px button, and changed the FAQ background to `#e9f9fa` to protect the existing small-heading contrast. The review also darkened three slide accent colors and bounded the decorative hero pseudo-element with `inset: 0`.

## Limitations and release boundary

The managed `terminal.local` browser preview returned `ERR_HTTP_RESPONSE_CODE_FAILURE`; the subsequent error URL was refused by browser policy. It was not retried or bypassed. Visual, responsive, keyboard, mobile/device, zoom and screen-reader acceptance therefore remain **BLOCKED / NOT_RUN**, not PASS. Authenticated owner/provider UAT and live field performance are not established by source tests.

No production/staging deployment, DNS change, live-data mutation, official-domain migration or paid-provider activation was performed. The post-build VPS rerun passed 90/90 tests. Final source persistence and any separately authorized release remain with the owning task. `verification.json` binds the current source-file hashes, observed checks and artifact.
