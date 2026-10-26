# KNABA corporate-site — scoped agent QA policy

This file complements the existing project memory, roadmap, PR instructions and all higher-priority security/release gates. It does not authorize production work.

- For KNABA source/branding browser QA, prefer a **local HTTP loopback preview**, not `file://`, and run `npm run test:logo:browser` with an explicit `KNABA_TEST_URL`. This checks DE/EN/UK/RU at 320/390/768/1440 px.
- On `net::ERR_BLOCKED_BY_ADMINISTRATOR`, classify the failure as an **environment policy block**, not a site bug and not PASS. Do **not** disable or bypass browser administrator policies or keep retrying Chromium in the same environment.
- Use the browser gate: Chromium at most once per invocation, then WebKit, then Firefox **only when already available and authorized**. If Chromium was already policy-blocked in the current task/environment, set `KNABA_BROWSER_SKIP=chromium` for following invocations. Do not install/download browsers or consume paid credits without approved budget and permission.
- Browser gate exit statuses: 0=PASS for completed logo browser checks; 1=FAIL for site/test defects or invalid setup; 2=BLOCKED for no available usable browser. A BLOCKED result must never be presented as passing browser/device/zoom acceptance.
- If all browser engines are blocked/unavailable, continue independent source checks and Node/Astro/build tests where possible. Record exact SHA, test counts, failed/blocked reasons and next QA location. Do not repeat unchanged blockage prose or claim visual/mobile/device readiness.
- Opera Connector is a possible separate browser route only after a fresh `list_tabs` success and user-authorized access. An authenticated website session is not proof of native connector access. Work browser and VPS Opera Lab are separate environments.
- Never merge, deploy to production, edit owner data, change browser policy, disable security gates or activate paid services under this QA fallback rule. Preserve PR Draft until independent review and user release authorization.

## Contact and conversion-link regression (KNABA)
- Before adding public phone, email or enquiry buttons, audit rendered DE/EN/UK/RU HTML across the shared Layout, contextual sections, mobile menu, noscript and legal pages. Exactly one clickable `tel:` per page; contextual contact or footer fallback, never both.
- Retain required Datenschutz regulator/contact disclosures. Repeated destinations across separate functional landmarks can be legitimate; duplicate adjacent CTAs to one catalogue or repeated enquiry CTAs in one service detail are not.
- Homepage: one hero catalogue CTA; no repeated wide button after the six cards; `#zusatzarbeiten` must have a distinct localized label. Details: opening and closing enquiry buttons, with price, phone, guides and legal notes kept.
- Require existing source and built-HTML gates, Node24 check/test/build/i18n/verify/VPS and isolated browser widths+keyboard on exact artifact. Public cutover gates remain separate.

## KNABA official evidence / public trust content (REUSE-FIRST, 2026-10-26)

- Treat https://knaba.de/ as the primary source for verified public KNABA company/service claims; compare against the current template, canonical src/data/company.ts, routes and existing components before additions. Do not duplicate services, contact CTAs, partners, CMS, CRM, ERP or verified copy.
- A USt-ID/Steuernummer, the repository LICENSE for software or a partner logo is **not** a trade permit, specialist qualification, endorsement or media reuse grant. Publish a license/certificate only after validating owner, issuer/registry, validity, legal scope and right to reproduce. Without evidence omit the claim.
- Never write synthetic public reviews as customer testimonials. First-party feedback must use existing consent/moderation/review API; when empty, show honest empty state; preserve submitted customer data.
- Third-party ratings require exact public source, historical source date, count, originating platform and non-live designation unless freshly independently revalidated. No invented review identities, quote text, updated counts, Review/AggregateRating SEO markup or licenses.
- Preserve placement CompanyProfile → WhyKnaBa → Partners → Reviews. Add responsive sections only for confirmed uncovered needs. Verify DE/EN/UK/RU, 320/390/768/1440 px, keyboard/200% zoom, i18n, CSS budget, privacy/legal and links before releasing. No production merge/deploy under this rule.
