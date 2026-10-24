# KNABA responsive web design

## Layout contract

The public entry, login, activation, customer portal and staff console use the same responsive layer in `apps/web/src/responsive.css`, imported after the established product stylesheet. The forest green palette, typography, role landings and existing business flows remain in place. The layer changes how available space is used; it does not calculate money, authorize commands, send messages or activate device tracking.

The layout reflows continuously. Content can shrink, grow and wrap, including long German and Ukrainian names. Page gutters use `clamp()`, card grids use zero-safe flexible tracks, and the console content has an 1800px reading-width limit on wide displays. The document does not use horizontal overflow suppression to conceal sizing errors. Wide data tables and task boards retain their information in named, keyboard-focusable local scroll regions.

| Available viewport | Behavior |
| --- | --- |
| Above 1200px | Overview panels may sit beside one another; cards distribute across the available content width. |
| 1025–1200px | Persistent navigation remains available; overview panels stack before their contents become crowded. |
| Up to 1024px | Navigation opens as a modal drawer; chat channels become a horizontal local strip above the conversation; form inputs use at least 16px text. |
| Up to 760px | Public/login sections, form fields and record details stack; dialog gutters shrink; location-tree indentation is reduced. |
| Up to 480px | Header actions get their own row, filters and small summary grids stack, and action rows wrap. |
| Height up to 500px | Dialogs align at the top; message history becomes shorter; compact navigation keeps the scrollable links and profile reachable. |

The viewport meta tag permits normal browser zoom and enables safe-area insets. Dynamic viewport units handle changing browser chrome. Dialogs also follow actual `VisualViewport` height and offset changes, preserving access to their own vertical scroll area when the visible browser area changes. This implementation support is separate from physical keyboard/device acceptance.

## Navigation and dialogs

`useResponsiveNavigation.ts` shares the 1024px breakpoint with the stylesheet. A closed compact drawer is inert. Opening it makes the background inert, locks background scrolling and focuses its close control after the rendered state change. Visibility changes immediately; only the horizontal transform animates, so an invisible control never receives a premature focus attempt. Tab and Shift+Tab stay within the drawer; Escape closes it and restores usable focus. Rotating or resizing into the persistent-navigation layout removes the overlay and scroll lock. Opening global search from the drawer transfers focus to the search dialog. Current session revocation closes the drawer as it clears private console state.

Shared dialogs retain their existing review/confirm behavior and focus trap. They capture the opening element during their initial render, before React commits autofocus on a child field, and return focus only while that original element remains connected. Each dialog is conditionally mounted when opened; autofocus itself is preserved. Their header remains reachable while long forms scroll vertically. The mobile form grid uses one column; nested objects, repeated fields, long labels, validation messages and action footers can wrap. Header controls, icon actions and primary touch controls have 44px targets. Native text inputs remain editable. Native selects keep their full option labels and browser appearance; `contain: layout` prevents WebKit from propagating the internal width of long options into dialog scroll areas. The short-phone form scenario verifies native End/Home selection and focus as well as real rendered bounds.

Tables keep horizontal scrolling inside the table region. Task boards use individual columns with local scrolling and proximity snapping. Short status badges remain on one line inside the table region. Deep location trees reduce indentation on phones, retain the existing hierarchy labels and let names wrap. Chat messages wrap long original text, channel icons keep their width beside long titles, and the send control retains its label on wider screens while keeping an accessible label on compact layouts.

The photo masking editor keeps its existing pixel-coordinate validation, stale-image guard, explicit review and separate publication approval. Its image identity includes the asset revision and client-copy revision. A pre-paint state reset and a fresh image lifecycle keep the canvas attached when an approval refresh changes the record while the cached image URL remains the same. The unchanged persisted browser scenario exercises numeric masks, pointer masks, server-generated opaque output and explicit publication approval.

The actual `widget.js` entry opens the same public chat application in an iframe. The responsive suite checks that both the host frame and the real chat dialog fit phone and short landscape viewports.

## Reproducible verification

The current source-bound outcome is recorded in the responsive evidence receipt linked from `TEST_EVIDENCE.md`. A test inventory or a passing older commit is not acceptance of a later source.

```bash
npm ci --ignore-scripts --strict-ssl=true
npx tsc --noEmit --project apps/web/tsconfig.json
npx tsc --noEmit
npx vite build --config apps/web/vite.config.ts
npx playwright install --with-deps chromium webkit
npx playwright test --config playwright.responsive.config.ts
```

The dedicated workflow checks out the exact PR head or push SHA, builds the actual React application and serves that output with Vite preview. Its separate HTTP fixtures use the real Engine command registry, including digest, internal-draft and redaction extensions. A rejecting database adapter ensures those UI fixtures cannot silently execute SQL or claim backend acceptance. Unknown fixture requests and JavaScript errors fail the scenarios. The unchanged release workflow separately exercises real PostgreSQL, persisted browser flows, recovery and packaging.

The responsive matrix contains 54 scenarios: 27 in Chromium and 27 in WebKit with a mobile viewport, touch and 2x device scale emulation. The public entry and request form are exercised in DE, UK, RU, PL, LT and EN at 320×568, 360×800, 390×844, 430×932, 600×960, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440, 667×375 and 844×390. Console traversal covers the visible modules, Activity and Operations digests at 320, 768, 1440 and 2560px. Additional scenarios cover task review/confirmation, keyboard table scrolling, boards, deep trees, drawer focus, rotation, shift/chat controls, customer issues, login/activation, enlarged root text, reduced motion and the embedded widget.

Assertions inspect actual rendered document/dialog bounds and overflow, focus, target sizes and user-visible results. They do not replace browser layout measurements. Screenshots are attached from the actual pages after finite animations finish; failures retain traces. A bounded failure count and global timeout preserve useful diagnostics, and a stopped or incomplete run cannot receive PASSED status. A clean run must finish all 54 scenarios with zero failures, skips or flakes.

## Scope and integration

The V4 specification is authoritative for target contracts. Two active implementation lines exist, so the responsive change has two focused review branches:

| Review | Exact base | Purpose |
| --- | --- | --- |
| [PR #3](https://github.com/ziko1/knaba/pull/3) into `codex/knaba-product-completion` | `83d0d18e2310d2e7b1642cd38d1af992cc086484` | Preserve the full product-completion line, including its tested session/chat/price/accounting fixes, while improving its web layout. |
| [PR #4](https://github.com/ziko1/knaba/pull/4) into `knaba-staging` | `366c30b137951749bac7ec22ad35278300f93a4a` | Apply the responsive UI/hook/viewport changes directly to the approved V4 implementation, with its own source-bound browser run. |

The initial product-completion base was used to preserve the completed product work while staging was compared. Repository governance identifies V4 as the target, so a selector comparison alone was insufficient for delivery; the separate V4 port supplies the actual design there. The port retains V4 business changes and its existing browser scenarios, adjusts the compact-session helper, and adds the same dedicated responsive harness. The V4 keyboard regression asserts the intentionally retained search query and selects all before typing at each viewport, preserving every original value, focus, target-size and overflow assertion.

A non-mutating merge comparison found the same eight conflicts between product-completion and V4 before and after the responsive changes: the staging workflow, `AGENTS.md`, API HTTP, web App/API, offline execution scope receipt, staging verifier and commerce test. Responsive changes added no new conflict files. These broader business/workflow conflicts are not merged or resolved by this design task. Each focused PR is assessed against its own base and exact source; neither is evidence of a combined business runtime.

Browser emulation covers the specified rendering scenarios. It does not establish physical Android/iPhone keyboard behavior, browser chrome, safe-area hardware, background operation, native layout, production deployment or company UAT. The responsive branch does not change native application code or the expired Railway deployment window.
