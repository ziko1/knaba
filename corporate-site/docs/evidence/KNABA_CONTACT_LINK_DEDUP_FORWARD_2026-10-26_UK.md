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
