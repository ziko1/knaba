# KNABA: marketing design and SEO readiness — 2026-10-25

Scope: KnaBa only, repo ziko1/knaba. Candidate at kneba.vsp.rest. NO merge, production deployment, billing, credentials activation, IndexNow submission, or deindex policy change in this PR.

## Read-only live audit evidence (25 Oct 2026)
- Homepage /: HTTP 200; X-Robots-Tag noindex, follow; restrictive CSP. Staging noindex is intentional until owner approval.
- Sampled /, /en/, /uk/, /ru/, /leistungen/, /uk/leistungen/, /bauleistungen/baureinigung/, /uk/bauleistungen/kernbohrungen/, /kontakt/, /impressum/: HTTP 200, one h1, description, self canonical, hreflang, JSON-LD present. This sample is not a 100% site crawl.
- /faq/: HTTP 404 in the early live audit, but **HTTP 200 on independent VPS recheck at about 11:56 UTC, 25 Oct**. The deployment changed separately; do not attribute this live fix to this draft PR.
- /de/: HTTP 404 by design; canonical German homepage is /.
- /sitemap.xml: HTTP 200 and ZERO loc elements during noindex. Public release is expected to generate 72 URL entries, 4 localizations x 18 service/navigation URLs. Do not submit noindex sitemap.
- VPS disk: 197 GiB total, ~8.5 GiB free (96% used). New heavyweight installs, CI caches and production deployments are not justified without disk review.

## Implemented source changes (candidate)
- Distinctive coral/aqua/lilac/yellow/green palette, asymmetric service grid, compact B2B editorial with verified-contract language, 3 contrasting process steps.
- Unique catalog and construction-detail treatments, related-service internal links; no office cleaning in active marketing routes; no fake reviews, prices or 24/7 promises.
- LocalBusiness + WebSite metadata, Service URL and stable ID, existing BreadcrumbList, Open Graph/Twitter text fields.
- Reciprocal hreflang for verified DE/EN/UK/RU and x-default in both HTML head and XML sitemap, suppressed when site is noindex.
- Optional Google and Bing ownership meta tags sourced from validated build-time KNABA_GOOGLE_SITE_VERIFICATION and KNABA_BING_SITE_VERIFICATION; not populated until owner verifies the destination.
- Optional IndexNow CLI: dry run by default, real push gated by approved release, manual flag, proof-of-domain key and owner permission. Google Search does NOT participate in IndexNow.

## Recommended external tools: status and next steps

| Priority | Tool | Next owner-approved action | Limitation |
| --- | --- | --- | --- |
| P0 | Google Search Console / URL Inspection | Verify domain and submit sitemap after indexable release | No authenticated Search Console data, index count or ranking baseline |
| P0 | Bing Webmaster Tools / IndexNow | Verify domain; publish IndexNow key file; explicitly approve batch send | No key, quota or Bing property verified |
| P0 | Google Rich Results Test, Schema Markup Validator | Validate LocalBusiness, WebSite, BreadcrumbList and Service with published pages | Structured data never guarantees snippets |
| P0 | Lighthouse, PageSpeed Insights, CrUX, Search Console CWV | Collect mobile LCP, INP and CLS field baseline, compare after release | No field p75 measurement or release-performance claim |
| P1 | Google Business Profile | Confirm ownership, accurate business category, scope, contact details, region and real services | Do not invent reviews, hours or certifications |
| P1 | GA4/GTM or Matomo/Plausible | Define call_click, service_view, planner_start and qualified_enquiry events | Do not load analytics/ads trackers without lawful consent and configured credentials |
| P1 | SEO dashboard | Review actual impressions, clicks, CTR, indexed URLs, requests, qualified B2B leads | Metrics and attribution are UNKNOWN until connected |
| P2 | Ahrefs, Semrush, Screaming Frog | Run verified competitor/backlink/redirect/template crawl | Paid subscriptions and API credits are NOT authorized |
| P2 | 99-language i18n registry | Only expose reviewed real translations and supported routes | Bulk translated thin pages risk SEO quality |

Keyword *hypotheses*, not measured search volume: Baureinigung Berlin, Baugrobreinigung Berlin, Bauzwischenreinigung Berlin, Bauendreinigung Berlin, Bauhelfer Berlin, Baustellenvorbereitung Berlin, Baureinigung Brandenburg. Technical special work (Kernbohrungen Beton, Wanddurchbrueche) must always say only on request and after technical/contractual checks; do not imply guaranteed direct execution.

## Safe operational sequence
1. Verify approved business/legal marketing copy and release SHA. Run Node >=22.23.4: npm run check, npm test, npm run build, npm run verify:build, plus node --test tests/indexnow-submit.test.mjs.
2. Compare public and noindex builds: canonical, meta noindex, robots, reciprocal sitemap, actual requests on all four locales and eight construction service URLs; do not index /portal/, /studio/, /konto/, /api/.
3. Browser QA 320/390/768/980/1440px, 200% zoom, keyboard navigation, reduced motion, overflow, touch carousel, Contact CTA and internal links.
4. Recheck /faq/ HTTP response after synchronizing authorized candidate to VPS. Confirm no CMS Studio published override makes SEO metadata inconsistent.
5. When owner approves indexable official release: verify Google and Bing properties, submit sitemap (Google) and optionally use IndexNow (Bing & partners). Unchanged noindex preview must not submit.
6. Keep previous immutable build for rollback. No CRM/D1/ERP deletion, no external model or paid marketing activation.

## IndexNow CLI manual run
Run from corporate-site only after a public release build is staged:
- node scripts/indexnow-submit.mjs --dry-run (local URLs only, no network)
- For explicit owner-approved batch send: set KNABA_RELEASE_MODE=official (or vsp plus KNABA_VSP_INDEX_APPROVED=1), KNABA_INDEXNOW_APPROVED=1, KNABA_INDEXNOW_KEY, and KNABA_INDEXNOW_KEY_LOCATION (HTTPS key file published on the same host), then run node scripts/indexnow-submit.mjs --submit.
- HTTP 200 or 202 means submitted for processing, not indexed. Never print the key in logs or put private credentials in source. IndexNow's proof key file itself is public by its protocol.

## Authoritative documentation
- Google Search Essentials: https://developers.google.com/search/docs/essentials
- SEO Starter Guide: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- LocalBusiness: https://developers.google.com/search/docs/appearance/structured-data/local-business
- Sitemaps: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- CWV: https://developers.google.com/search/docs/appearance/core-web-vitals
- Search Console: https://developers.google.com/search/docs/monitor-debug/search-console-start
- Bing IndexNow: https://www.bing.com/indexnow/getstarted
- Consent mode v2: https://developers.google.com/tag-platform/security/guides/consent

## 25 Oct continued QA and release checkpoint

**Tested source SHA:** `4988e2012142f1b710ef78d3c658d13a211241cc`. **Artifact SHA-256 (preview):** `6090d8516bd8f9ff7b1e9f082be00a7b7f32716c38521772abfb6626c1900623`.

- Docker Node 24.22.1, offline npm ci, `npm run check`, `npm test`, `npm run build`, `npm run verify:build`: PASS. Vitest 136/136, inquiry 8/8, IndexNow 3/3, new Studio SEO regressions 4/4.
- Additional `node --test vps/server.test.mjs`: 2/2 PASS in synthetic SQLite/auth/Studio publish/restore environment, no real tenant data.
- Preview static build: 103 pages, 30,423 bytes aggregate CSS gzip, 165,326 bytes aggregate emitted JS gzip; **not field transfer or Core Web Vitals**.
- Synthetic official build only: 72 sitemap URL entries, 360 `xhtml:link` alternates; title/canonical/index and dummy Google/Bing site verification tags PASS. Not published, no indexing or submissions.
- Isolated Chromium with cached image and no network: 24/24 localized cases PASS, 320/390/768/980/1440px coverage per the browser test, six visually distinct card backgrounds, no horizontal overflow, eight carousel slides and accessible initial skip-link hidden state. Screenshot evidence and SHA-256 checksums are in [source-pinned QA receipt](evidence/knaba-color-seo-qa-2026-10-25.json).
- The initial screenshot contained a fixed skip-link artefact because capture happened after programmatic carousel scrolling; moving capture before interaction removed the artefact. No production CSS bypass.
- No merge, no production deploy, no alteration to live database or analytics/paid provider activation. `kneba.vsp.rest` remains noindex. Last observed VPS disk was ~96% full; evaluate disk headroom before deployment.

**Remaining acceptance**: independent code/security review, field/mobile device and 200% zoom/accessibility tests, owner content/legal review, current-site source reconciliation, release+rollback approval, Search Console/Bing property proof and noindex release decision.
