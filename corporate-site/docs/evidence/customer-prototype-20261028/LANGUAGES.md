# Six-language prototype checkpoint — 2026-10-28

## Current scope

The user's current request supersedes the old broad language target inventory. The selectable order is **Deutsch → English → Polski → Lietuvių → Русский → Українська** (`de,en,pl,lt,ru,uk`). German remains the default. Public UI no longer advertises the former target-language count.

The existing four detailed public trees are preserved. Polish and Lithuanian have genuine translated home, services overview, contact, planner, FAQ and company pages; all six languages also have app, WhatsApp and Telegram entry pages. Detailed specialist, gallery and legal destinations without a PL/LT translation link to German with a visible **DE** label. The language menu and `hreflang` use the actual equivalent-route inventory; `/languages.json` lists actual paths and reports six published entry languages, zero pending targets. There are 112 public Studio pages; app and messenger entry pages remain outside the public editorial sitemap.

PL/LT include the shared shell and localized SVG branding, existing public inquiry form, service finder, checklist, catalogue, access dialog, server-rendered sign-in/access requests, portal, workspace conversations and administration shell. API enums, stored business data, ownership and server authorization do not change when choosing a language. Existing specialist CRM/Studio/assistant-inbox submodules retain their earlier localization scope; this checkpoint does not certify every historical editor screen as translated.

## Language delivery and packaging

Portal copy is held in six source JSON packs, each with 204 portal keys, 44 workspace keys and 29 administration keys. German is available immediately. Other packs are emitted as content-addressed first-party JSON and fetched only for the selected language. Exact-key validation, duplicate-request suppression and timeout/retry behavior prevent partial data from replacing the active language. A failed selection keeps the prior language and reports the connection problem; selecting a language never changes access rights.

The first build exposed two real packaging problems: Astro's internal `.prerender` directory duplicated CSS in the public output, and eagerly bundled six-language text exceeded the existing JavaScript cap. The intermediate directory is now removed only from the generated Astro output before Vite copies public assets. Selected-language data files remove the need to parse every language's portal text. The original CSS and JavaScript budget assertions remain unchanged.

## Completed verification

The machine receipt is `languages-verification.json`; `site-source-manifest.json` pins the tested working tree independently of its then-current Git HEAD. The code was not yet committed when these checks completed. A later integration commit must bind the same source hashes or repeat affected checks.

| Check | Actual result |
| --- | --- |
| Node | v24.22.1 |
| `npm run check` | PASS; 380 files, 0 errors, 0 warnings, 7 existing hints; Vue/Svelte checks pass |
| `npm test` | PASS; 343 Vitest tests in 49 files, plus 9 successful native Node file invocations |
| `KNABA_RELEASE_MODE=vsp npm run build` | PASS, exit 0; 160 HTML pages, worker and VPS renderer |
| `npm run i18n:extract` and source verification | PASS; 28 German routes, 1,063 static text units |
| `KNABA_RELEASE_MODE=vsp npm run verify:build` | PASS; all internal static links, metadata, route count, asset copies, language inventory, SVGs and retained original-page contracts |
| `npm run test:vps` | PASS; 121 actual tests, no failures/skips, isolated synthetic SQLite and loopback HTTP |
| CSS budget | 40,197 gzip bytes; cap unchanged at 40,960 |
| All emitted client JavaScript budget | 222,254 gzip bytes; cap unchanged at 225,280 |
| Client artifact SHA256 | `5edbc520516650042994033fc8844111dc5fa131b999bb51339d095af0d0181b` |
| German source digest | `d36fd17fc7a975dacb6dd4e754e771c9b309f3d6528f4a017525b696b28acfbd` |

The native test counts above distinguish file invocations from actual individual assertions. The VPS suite ran with scoped loopback permission after the default sandbox refused local `listen` with `EPERM`; it did not operate on a live database. Wrangler could not write its optional log under the read-only runtime configuration directory, but the build completed with exit 0 and all generated artifacts passed independent verification.

## Remaining acceptance

Real-browser verification of this exact artifact is delegated to the root release task, using its already installed isolated Chromium environment. No browser PASS is claimed here; local Playwright modules had no installed browser executables. Native-language review, real-owner/customer acceptance, physical Android/iOS devices, other browsers, screen readers, field performance and actual provider delivery remain separate evidence requirements. Previous four-language browser receipts do not establish acceptance of this new six-language artifact.

This checkpoint is a prototype source/build verification. It does not itself deploy customer production, activate provider accounts or change owner records. Subsequent release/download metadata or binary additions change the artifact hash and need their own final release pin.
