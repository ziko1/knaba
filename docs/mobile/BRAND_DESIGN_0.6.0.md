# KNABA native visual contract — 8 November 2026

Source audited: `bb223af67af9eae5f11e7ca225f89ddf97a8e4e2` (PR133). Read-only audit by `/root/brand_design_audit`. No site source, deployment, account or device state changed. This is a contract extracted from the current committed website and mobile code; a customer-selected live Studio preset was not observed.

## Direction

The current KNABA identity is deep teal, lime, pale paper and pastel information cards. Use the native equivalent of the website's authenticated workspace: generous spacing, strong headings, a compact branded dark header, clear white/semantic surface cards, high-contrast teal primary actions and lime selected states. Public landing-page decoration is a secondary reference only: `Layout.astro` explicitly excludes authenticated tools and `/app/` from `data-public-design="vivid"`.

Do not reintroduce the historical orange accent as the primary brand. Orange/amber remains available for genuine warning states. Keep native SwiftUI and Android Views; typography should use the native system font and dynamic scaling. The website's Inter declaration falls back to Helvetica Neue/Arial; no shipped Inter font asset was found, so a new external font dependency is unnecessary.

## Shared tokens

| Role | Exact source value | Source |
| --- | --- | --- |
| Ink | `#102f38` | `corporate-site/src/styles/global.css`, root tokens |
| Main text | `#14343b` | global root tokens, portal root |
| Muted text | `#556b6d` | global root tokens |
| Deep surface | `#11323b` | `portal.css`, sidebar |
| Teal action/link | `#075f63` | `public-vivid.css`, active links/token |
| Selected accent | `#d8f779` | global lime and portal active tab |
| Selected foreground | `#18383c` | portal active tab |
| Paper | `#fbfcf7` | global root tokens |
| Card | `#ffffff` | portal cards/shell |
| Decorative border | `#d8e0db` | global line; portal uses `#dce6e0` |
| Soft fill | `#eff3ea` | global root tokens |
| Metric green | `#e3efde` | portal metric |
| Metric lilac | `#e8e2f8` | portal metric |
| Metric coral | `#f7e3d8` | portal metric |
| Card radius | 16 pt/dp; 18 for main grouping | portal cards; global radius18 |
| Header/large panel radius | 24–26 pt/dp | portal shell26, welcome28 |

Spacing adaptation: 4/8/12/16/24/32 pt/dp, screen inset16–20, controls minimum44pt iOS and48dp Android. Keep 16–17sp/pt input/body size, medium weight labels and substantially larger page headings; do not copy the website's tiny desktop captions to a phone. Dark mode needs explicit semantic foreground/surface pairs and retains the teal/lime identity. The light website itself is not evidence that dark-mode native output has passed review.

## Logo and deterministic reuse

The active logo references are in `corporate-site/src/layouts/Layout.astro`:

- Compact wordmark: `corporate-site/public/images/knaba-3d-mobile-header.svg`, viewBox1140×280; three geometric buildings, KNABA wordmark, no slogan.
- Desktop wordmark: `knaba-3d-header.svg`, viewBox1140×350, includes the localized slogan.
- App glyph: `corporate-site/public/favicon.svg`, viewBox−16 −65 448 448, opaque white background and exact three-building teal/lime geometry.
- The old `knaba-construction-logo.svg` is not the current Layout header asset.

Both existing app icons were visually inspected and already match the canonical app glyph. Keep them. Android `knaba_launcher_foreground.png` includes the deliberate adaptive-icon safe area (1080canvas,660source,210inset each side); using it unmodified in a header makes the symbol unnecessarily small.

Preferred header resource is a deterministic PNG export of the **existing compact wordmark SVG**, preserving geometry and aspect ratio, on a light panel. Use the existing `sharp` dependency and the pattern in `scripts/mobile/generate-brand-assets.mjs`; it already uses the ERP lockfile and records renderer/source/output hashes in `docs/mobile/BRAND_ASSETS.json`. At a 280dp/pt wordmark width, a1140×280PNG provides approximately4× density with no new artwork or fonts. For a small square header mark, export the canonical favicon directly (no adaptive safe-zone padding) and place it in a white rounded container. No logo recreation or synthetic company imagery is needed.

## Screen hierarchy

1. **Sign in:** compact canonical wordmark, localized workspace heading/subtitle, language selector, grouped server/account fields, one visually primary sign-in button, visible inline error/progress. Keep explicit server validation and password/OTP handling unchanged. The Android demo is a distinct secondary action with its existing conspicuous synthetic-data notice.
2. **Overview:** identity and authorized role information, actual server metrics in pastel cards, module entries as clear native rows or adaptive cards with icon/title/chevron. A second column is allowed only when labels fit; narrow width and large text collapse to one column. Avoid inventing metric values or a green connected state before server verification.
3. **Navigation:** current tab receives lime fill and dark text, with visible label/icon and semantic selected state. Four long localized tab labels must scroll, wrap or adapt at320dp/pt and large fonts; do not squeeze four fixed segments to unreadable text. Preserve route/back behavior and all server-permission module filtering.
4. **Records/actions:** consistent white/semantic cards, clear status text, localized labels, a distinct dangerous-action treatment and the existing confirmation. Preserve record identity/version and stale-session guards. Separate metadata from main content visually without hiding essential fields.
5. **Messages:** calm surfaced thread and readable message bodies; draft/composer stays accessible with keyboard. Do not lose draft preservation or pending-command gating.
6. **Shift/location:** same brand header/cards, clear shift time hierarchy and full privacy/enrollment/offline states. GPS remains explicit opt-in and visually states OFF until actually active. Keep pending/reconciliation notices visible and distinct from success.

## Measured source-palette contrast

Calculated using standard sRGB relative luminance on the exact listed opaque hex values (not a rendered/device audit):

| Pair | Ratio |
| --- | ---: |
| Ink / paper | 13.71:1 |
| Muted / paper | 5.49:1 |
| White / teal action | 7.43:1 |
| Ink / lime | 11.78:1 |
| Lime / deep sidebar | 11.34:1 |
| Muted / white | 5.66:1 |
| Ink / pastel metrics | 11.22–11.89:1 |
| White / lime | 1.20:1 — unsuitable for text |
| Decorative line / paper | 1.31:1 — decorative only |

Control focus, selected/disabled state and input boundaries must not depend on the faint decorative line alone. Use teal or another separately measured control border/focus treatment. Disabled controls should remain distinguishable and labeled; no semantic status depends only on color. Keep visible text descriptions and native accessibility roles. Decorative logos/icons next to equivalent text should not duplicate announcements.

## Required scoped acceptance

- Render sign-in, overview, records/action, message empty/error/retry, and shift screens at the actual final candidate.
- Android narrow320dp, representative411dp, tablet800dp and largefont1.5–2.0; iOS small/narrow phone plus accessibility Dynamic Type. Check clipping, reachable controls, keyboard insets and content scrolling. A Robolectric bitmap is host-rendered evidence, not physical installation or screen-reader acceptance.
- Check DE and UK plus the longest actual PL/LT/RU labels. Six-language coverage remains `de,en,pl,lt,ru,uk` with German default.
- Verify light/dark state pairs if the native implementation supports dark mode. Test loading, unavailable/offline, expired identity, unknown mutation and denied permission while preserving existing transport/idempotency/session behavior.
- Actual functional regression suites and native build/package evidence bind to the final source/artifact. Keep simulator/emulator/device/live labels separate. An unsigned iOS simulator package cannot satisfy customer iPhone installation.

## Source fingerprints

| File | SHA-256 |
| --- | --- |
| `Layout.astro` | `4cbde39fb2a7bd65f07642d2a957664eede32bdc90cc7d2a3be7229d257aaf39` |
| `global.css` | `57996a27bdd2b632d42d340562a5f12f913e1daccaf3e25ce5ad797b9e986fd8` |
| `public-vivid.css` | `cea659aa1b171b8bd93b4eae7eb2d30b6a0506f547f9898e4f9bff5eccfe07b0` |
| `portal.css` | `f6a54bc76b0be43037ae92661cf2bbf290aa1542486f16f04516d667c6ce4eb5` |
| `workspace.css` | `c99236d6e163c2474d6e8bdedf804455bf5d051f30f6f9104b1b6946302ea94f` |
| `knaba-3d-mobile-header.svg` | `cb660f68f72f14b3b3fa3e4f9a735a8f68cd6dfd2e63da9d9ead05cae549e0e6` |
| `favicon.svg` | `82ee65781ea7835747a4eb3613fa2415c459097aa3e7ce1d91b7d081a9afd0b8` |

Guidance read: `ecc-frontend-mobile` main skill, `design-system/GUIDE.md` and `accessibility/GUIDE.md`. Audit preserves existing AGENTS, canonical memory/roadmap and native business/security contracts. No unrelated competitor research, new font, service, provider or live browser session was required.
