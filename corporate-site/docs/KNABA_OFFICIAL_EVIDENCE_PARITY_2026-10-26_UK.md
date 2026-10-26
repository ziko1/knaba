# KNABA — official company parity and independent review evidence (26 Oct 2026)

## Scope / canonical state
- **New public-site source baseline:** `15cfe1e15ec2bb78c0b85ccb59e5221024a9bae8`, stacked on Draft PR #98 (`feat/knaba-home-seo-guides-20261026`), which is itself stacked on PR #89. Do not replace the parallel modular CMS/ERP recovery in PR #97.
- Official company: https://knaba.de/ ; official service catalogue: https://knaba.de/leistungen ; company overview: https://knaba.de/ber ; legal: https://knaba.de/impressum.
- This is a **source-only additive candidate**, not a production deployment or legal sign-off. Preserve existing company, partners, guides, 8 construction offers, moderated review API, CMS/CRM/ERP branches and all other modules.

## What official sources actually establish
- Official legal operator Alexander Knaus / KNABA Bauhelfer; Im Achterkastell 39, 10315 Berlin; published VAT ID DE263654022. Existing `src/data/company.ts` and `impressum.astro` already have these details; **reuse rather than duplicate**.
- **VAT ID and German Steuernummer are tax identifiers, not evidence of an operating, trade, construction or specialist permit.** No separate publicly verifiable certificate/license was observed in the reviewed official pages. **Do not display a fake license or claim specialist authorization.** Request exact certificate, issuer, registry, expiry and permission to display from business owner before publication. Technical core drilling/structural openings/regulated tasks remain enquiry-only subject to checks.
- Official construction support: Baustellensicherheit, Bauhilfsgewerke, Baustellenvorbereitung, Winterdienst, Betonbearbeitung, Kernbohrungen, Montagen, Abbrucharbeiten; only promote specialist activities under qualified-contractor/permit checks.
- Official cleaning: Baugrob-/Baufein-/Bauendreinigung, Grund-/Sonderreinigung, Unterhaltsreinigung, Büroreinigung, Glasreinigung, Treppenreinigung. Industry references include schools, sports halls, childcare centres, car parks, retail, hospitality and property management.
- Official homepage contains five partner images; current frontend already has five local partner assets, avoiding duplicates. Logos do not independently establish current contracts, technical certification or endorsement.
- The official source has outdated TMG/OS dispute boilerplate and stock-image attributions; **never copy outdated legal or images without a license**. Existing new DDG imprint and first-party illustrative art remain.
- Advertised services are not proof of current availability, prices, a response-time SLA or special qualifications. Existing customer enquiry and quote pathways remain individually negotiated.

## External rating provenance and disclosure
- **Independent source profile:** https://www.provenexpert.com/knaba-dienstleistungen-bau-und-gebaeudereinigung/ .
- It identifies KNABA by company name, Berlin street address and `knaba.de` and reported **5.00/5 from two aggregated Google Maps ratings**, historical source snapshot dated **22 August 2025**; profile last update is dated 22 August 2025. Public source rechecked by search on 26 Oct 2026, but a fresh live Google rating/individual review text was not established.
- Display the number as **explicitly historical**, link to the third-party provenance and show source date; no invented identities, user quotes, current-count guarantee, endorsement or local `AggregateRating` / `Review` structured-data inflation.
- The current website `/api/reviews` remains the sole source for **consented, owner-moderated site reviews**, preserves safe form submissions, rejection/retries, owner inbox and moderation. When its list is empty, remove fictional example reviews from UI and show a neutral invitation instead. Do not erase client records or change the DB.

## Visitor journey / placement
- Keep Hero → six canonical service cards → approved extras → project steps → the three published practical guides → company profile.
- Place **Why KNABA** directly after company profile and **before five partner cards**, with three balanced points (site phase cleaning, scoped Bauhilfe, direct regional discussion) and one compact reference to other cleaning services. No new phone/email or duplicate CTA.
- Then the **historical third-party rating** and moderated reviews, FAQ, and existing closing enquiry. Component has zero new JS/hydration/dependencies; active existing public reviews remain a single island.
- Responsive targets: 320/390/768/1440px + zoom 200%, focus/keyboard and four locales DE/EN/UK/RU.

## Verification and release gate
- Run with **Node >=22.23.4 (prefer 24)** from `corporate-site`: `npm ci && npm run check && npm test && npm run build && npm run i18n:extract && npm run verify:build && npm run test:vps`.
- **Important:** `i18n/source-de.json` is a generated full HTML catalogue. Adding German homepage paragraphs changes its deterministic digest; regenerate with pinned build output and commit the generated file only after exact-source Node24 validation. Without it, `verify:build` is expected to fail. Never pretend a source-only check equals a successful build.
- Browser: `KNABA_TEST_URL=http://127.0.0.1:4321 node tests/review-examples-browser.cjs` (or approved local loopback), and the wider `tests/reviews-browser.mjs` isolated SQLite flow. Browser may return BLOCKED in admin-restricted environments: do not bypass sandbox/policy.
- Full live contact/owner legal & marketing sign-off, screenshot parity, image ownership, exact historical rating right to display, license proof, PR #97 later integration, and device QA remain gates. No merge/deploy on this source-only draft.

## Continuation: reproducible isolated QA and live/non-live separation (26 Oct 2026)

- Starting Git HEAD: 2385e4c9a46cb2cf5ae45cbfc932b7615fd5df15 (Draft PR #101); isolated VPS checkout /tmp/knaba-evidence-qa-20261026. This QA does **not** establish deployment from this branch.
- Actual isolated runtime: cached node:24-bookworm-slim (Node v24.22.1), UID/GID bind mount of only corporate-site/, Docker --network none and CPU/memory/pid caps, KNABA_RELEASE_MODE=vsp; no dependency install, external provider API, database change, paid model dispatch or production activity.
- Fresh npm run build: **PASS, 130 generated HTML pages**. npm run i18n:extract: **PASS, 28 German public routes / 1021 units**, source digest 5e0335d144f5f0d56cb7de56ebbd387b44215cd9dd94389973609dd7e1b4852f; tracked i18n/source-de.json regenerated.
- Initial npm run verify:build failure exposed the strict cumulative 40 KiB gzip CSS budget, not raised. Fixed by simplifying new evidence CSS, deleting six orphan example-review rules and pruning **67 orphan legacy service-card / plan-preview rules** from global.css after confirming no references in current source. Existing bau-card and live selectors retained. Fresh verify:build: **PASS, 40,659 gzip bytes** (strict limit <40,960); HTML route and ordering assertions passed.
- npm run test:vps: **41/41 PASS**; npm run check: **0 errors** (historical nonblocking hints retained); npm test: **256 Vitest + 32 + 27 + 9 Node tests PASS**. Source/runtime evidence does not prove real mobile/browser QA.
- Read-only live HTTPS from the VPS returned HTTP 200 for https://kneba.vsp.rest/, /en/, /uk/, /ru/, /galerie/, /healthz and /readyz at check time, with five partner cards on the homepages. **Live does not yet include the WhyKnaBa section or dated ProvenExpert block of this PR.** Older gallery 404 / readyz 503 are superseded for these read-only probes, not a source/deployed SHA receipt.
- **Browser QA on the built candidate:** cached mcr.microsoft.com/playwright/mcp:latest container (Node v24.21.0), explicit path to its already-installed Chromium, a read-only site bind mount, no network access, isolated loopback static HTTP 200 and the existing browser-policy gate. The real tests/review-examples-browser.cjs suite **PASS, Chromium, 18 cases**: DE/EN/UK/RU at 320/390/768/1440 px, 200% text at 320 px, no horizontal scroll, historical source/date, synthetic moderated-review fixture, API error empty state and keyboard form focus. This is not an authenticated owner, full-site screenshot or real-device test.
- **Remaining / blocked:** complete screenshot-based visual/keyboard/zoom review of all public and authorized portal routes, actual owner UAT and physical devices; Opera Browser Connector remains disconnected, but the isolated Chromium candidate check passed. Image/logo rights, individual rating text rights, license/permit evidence, operator/legal customer approval and independent review remain open. The VAT ID is not a business license.
- Candidate stays Draft. Before any authorized rollout: independent review, immutable artifact hash and deployed SHA readback, backup/rollback rehearsal and owner acceptance. No merge or production deployment.
