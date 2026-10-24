# KnaBa 2D illustrations — isolated QA receipt (24 October 2026)

**Exact tested commit:** `46015da12f0e77fac1669915ed1b8ca309ab652d` on branch `codex/knaba-vibrant-cleaning-illustrations-20261024`. Corporate source under `corporate-site/`; KnaBa only, AVENQO not touched. The subsequent QA documentation changes do not modify executable files or SVGs.

## Environment

- SentinelX host `vsp` (operational, isolated scratch checkout under `/tmp/knaba-visuals-pr17-qa-20261024`); no writes to live release paths.
- Cached `node:24-bookworm-slim` Docker image, Node 24.22.1; bounded 2 CPUs, 3 GiB RAM. Runtime tests and build had `--network none`; installation used public registry, no paid services or application credentials.
- `npm ci --no-audit --no-fund` exited 0 (508 packages); npm warned about unapproved dependency install scripts. No new package lock changes.

## Executed quality gates

| Gate | Evidence | Status |
|---|---|---|
| `npm run check` | Astro 83 files, 0 errors/warnings/hints; Vue and Svelte checks 0 errors | PASS |
| `npm test` | Vitest 71/71 (includes 8 new artwork tests) and Node inquiry tests 8/8 | PASS |
| `npm run build` | Astro static 51 pages; Vite server/client build returned 0 | PASS |
| `npm run verify:build` | 51 pages, internal links PASS, metadata PASS, no external image/script requests detected in HTML | PASS |
| Build artifact SHA-256 | `70cfc42bc038620ef8cb46951924ac96d5e50fd2c785f8ece4d5ea9981306f7d` | RECORDED |
| SVG syntax and origin | 7/7 files, balanced elements and no inline scripts/foreign resources | PASS (source level) |

First `npm run check` run under a mismatched UID failed creating `.astro`, and first `npm test` run could not write `node_modules/.vitest-cache`; both were runner file-permission issues. The final check and test executions above exited 0 in an isolated container; no application code was changed to hide these failures.

## Local Chromium smoke test (not physical device / not deployed site)

A cached Playwright Chromium browser served `dist/client` only on a container localhost. Results: `/` at 1440 and 390px, `/ru/` at 390px, `/leistungen/` at 320px and `/ru/leistungen/` at 768px: HTTP 200, no missing image loads, no page JavaScript exceptions, `scrollWidth === viewportWidth` at all five sizes. The homepages displayed the team hero and 6 individual service artworks; DE/RU catalogue pages each displayed 6 artworks.

Local screenshot SHA-256, made in this scratch QA run:

- Desktop 1440px: `6e2c7dc7650d28d330577795aa527eba6aab509737c73aa669ac1499766b9336`.
- Mobile 390px: `b59a18858e21fd35b3e9844e86fc377ec238968b85868aead95bcff5a5f330d0`.
- Russian mobile 390px: `e0e6c0431f7fb28f4dcaf7249948a140fdeb082096ee92b37527f76798c92e04`.

Screenshots are local scratch files, not uploaded as customer photographs or publicly hosted artifacts. They are synthetic browser captures, not field Web Vitals.

## Remaining gates

Independent human design/brand approval, detailed accessibility including screen readers and 200% zoom, hardware/mobile device QA, production CWV, legal/operator UAT, official-hosting release are **NOT_RUN/BLOCKED**. Official/live deployment, DNS and integration PR #12 are unchanged. Do not merge or deploy without owner approval. Known environment limitation: VPS root filesystem 92% full (17 GiB available at QA start); scratch workspace should be cleaned after preserving required evidence.
