# KNABA — усунення повторних телефонів та контактних посилань (26.10.2026)

## Фактична основа
- Repo `ziko1/knaba`, base `af58e80af83449a2ee72433c958aedcf0749604f`, candidate branch `fix/knaba-forward-contact-dedup-20261026`. Reuses Draft PR #79 and resolves four semantic integration conflicts without dropping newer features.
- One canonical clickable `tel:+493067933054` per page; homepage/company profile uses contextual contact, legal/service pages retain necessary details, footer provides fallback. JSON-LD phone reuses company data.
- Remove duplicated contact CTAs in informational cards, same-page header/mobile CTAs on contact routes and redundant fallback emails. Footer contact-page CTA leads to the planner. Preserve DE/EN/UK/RU navigation, galleries, partner logos, reviews, careers, Studio, Assistant, ERP, auth and legal disclosures.
- Legal Datenschutz contact emails (four contextual references) remain intact. No database, DNS, secrets, billing, external service, schema, or migration changes.

## Confirmed isolated QA
- Node v24.22.1, fresh npm ci and lockfile, check/test/build/verify: PASS. Nine targeted tests; 196/196 Vitest, native Node suites 25/25 + 27/27 + 9/9, VPS 24/24 PASS with release mode vsp.
- i18n extraction/verification PASS: 26 source routes, 946 units, DE/EN/UK/RU published and 95 pending languages unchanged; no drafts or reviewed translations overwritten.
- Artifact SHA-256: `c4c43e98ef66affeeda431d66602454e902c7206af53de09131b9d311b8c8fca`.
- Independent HTMLParser: 122/122 generated pages with one telephone anchor; 509 navigation groups without duplicate local links, 122/122 isolated loopback HTTP200; regular pages have one mailto link and Datenschutz retains four by legal context. Built-site verification includes self-link regression assertions.
- Exact Git source commit, byte-for-byte read-back and browser/device review must be verified separately; build-only QA does not prove live release.

## Release hold
- During audit public preview `https://kneba.vsp.rest` still served older `21a56934f3c3266d31285bb89e0a4ca0c0f755a4` with duplicate phones. This fix is NOT deployed and does not change the official knaba.de domain.
- Keep PR in Draft; require authorized publisher, rights/privacy review, owner UAT, verified off-host customer-state recovery, staged browser/keyboard/real-device QA, lease-protected cutover and rollback proof. Do not bypass staged release holds.

## Follow-on QA: catalogue and service-detail CTA cleanup (26.10.2026)
- Compared with existing Draft PRs #80/#81 and ported only UX changes to current PR #82; did not copy older components. Gallery, optimized carousel, local partner logos, auth, reviews, Studio, ERP and i18n remain preserved.
- Home DE/EN/UK/RU: one styled hero link to `/leistungen/`, no duplicated full-width CTA beneath six cards, contextual `/leistungen/#zusatzarbeiten` with distinct localized label; removed dead duplicate `.bau-services-more` CSS. Mobile targets >=44 CSS px.
- Every service detail (8 service slugs × 4 locales) renders two enquiry actions (opening and closing), not four, retaining price notes, phone, FAQ, related content, safety disclaimers and guides. JS-disabled contact fallback uses four localized explanatory sentences, not a duplicate email.
- RED/GREEN: two new source tests RED while nine older passed; final 12/12 targeted PASS. Node24.22.1 `npm run check`, `npm test`, `npm run build`, `npm run i18n:extract`, `npm run i18n:verify`, `npm run verify:build`, `npm run test:vps` exit 0 in VSP mode. Vitest 196/196, native main 28/28, policy/assets 27/27, i18n 9/9 and VPS 24/24.
- Independent HTML parser: 122/122 HTML pages HTTP200, 122/122 exactly one clickable telephone, no duplicate local href inside 509 nav groups and 32/32 service details with exactly two request links.
- Real sandboxed Chromium against isolated loopback: 24 design cases, 6 CSS reflow/keyboard cases and 52 changed-CTA cases (16 responsive homepage, 32 service details, 4 JavaScript-disabled contact) all PASS; physical device/browser zoom/screen reader not tested.
- FINAL artifact SHA-256 `e71121f05ce134eabdd56b5cabc69755df3ef704dcb5eb008f1ed6567a9513b2`. Earlier artifact digests in this file are historical; this is the newest candidate.
- Public `kneba.vsp.rest` was not updated. Official `knaba.de` untouched. No merge/deploy, DNS, customer records, migration, secrets or paid APIs. Rights/privacy, off-host DB restore, owner UAT, independent review, real device and immutable rollback remain open.
