# KNABA — UI/SEO continuation and live read-only crawl (2026-10-25)

## Scope and provenance

- Repository: `ziko1/knaba`; parent Draft PR #52 head `1a85b01be9947176c501eaa8acaf610afe0c21b2`.
- Development branch: `fix/knaba-seo-mobile-studio-20261025`.
- Tested GitHub source *module blobs*:
  - `corporate-site/vps/seo.mjs`: `a759d63d93fe6bd90635caaf44612be848896851`
  - `corporate-site/vps/seo-standalone.test.mjs`: `08f3d260daf2d1ff67a7fd9bbe0206727fb604d3`
- Changes are **source-only**. No main merge, payment/provider activation, release, DNS, production data, migrations, owner enrollment or credential distribution.

## Source changes

1. Shared KnaBa home and catalogue planner cards use a light lilac brand treatment and accessible dark foreground, without changing routes or conversion semantics.
2. Grid/card intrinsic width constraints and single-column mobile reflow at 760 CSS px.
3. Eight construction service topics × four actually published locales = **32** original explanatory guidance blocks (including necessary enquiry details and technical work limitations); injected once in `ConstructionDetail.astro`.
4. Static page `title`, `og:title`, `og:site_name`, `twitter:title` and `twitter:description` are aligned.
5. Studio server-side published metadata uses proper RegExp whitespace escaping; `og:*` and Twitter metadata update together or fail closed if expected fields are missing.
6. New Vitest content contract, Node standalone SSR/XSS regression and explicit local/staging browser test suite.

## Verified in this continuation

- GitHub read-back: branch is 10 file-change commits ahead, zero behind parent at source diff check, scoped to corporate-site. `main`, ERP, worker API/DB and provider configurations unchanged.
- Node.js 22.16.0 **autonomous, dependency-free** SEO test: **3/3 PASS** after correcting a wrong fixture expectation. Exact test and module content hash match the GitHub blob IDs above. This is NOT Node >=22.23.4 full acceptance.
- Earlier isolated patch fixtures: **8/8 PASS** for UI/SEO transform semantics, not a full runtime certification.
- Chromium **isolated CSS/card fixture** on a local runner: 320/390/760/768/1280 CSS px, base and 200% root font size: **10/10 reflow/overflow scenarios PASS**. This is not a complete live-site/browser acceptance.
- Branch content read-back: 32 localized entries with unique headings, complete description/enquiry/question/answer and no empty answers. Vitest tests committed but NOT_RUN.

## Live VPS crawl is a baseline, NOT the new PR

2026-10-25 read-only checks via connected SentinelX host `vsp`:

- Active release symlink was `/srv/knaba/vps/current -> releases/7e774c32863ad6b9f90a95288b5bd3495d941a51`. This is *not* this PR's head or an accessible verified GitHub source receipt; do not equate it with source tested here.
- Public TLS site `https://kneba.vsp.rest/`, `/faq/`, and `/uk/bauleistungen/baureinigung/`: **HTTP 200** with HSTS and CSP. The official `knaba.de` site is separate.
- Sitemap contains **72** public URLs: 18 DE, 18 EN, 18 UK, 18 RU; **72/72 HTTP 200** on a bounded read-only crawl.
- Missing canonical/description/OG/Twitter card, duplicate page titles or descriptions, H1 count mismatch, too few hreflang links, noindex tag, abnormal metadata lengths: **zero failures under the crawler's defined checks**.
- `LocalBusiness` structured data detected on all 72 pages, `WebSite` on all 72, `Service` and `BreadcrumbList` on 32 service details each; **zero JSON-LD parsing errors** in that scan.
- No `img` elements missing an `alt` attribute in those 72 HTML documents; 78 unique local link destinations, 6 extra non-sitemap destinations checked, **zero HTTP 4xx/5xx among these extra targets**.
- Private `/konto/` and `/studio/` responses have `X-Robots-Tag: noindex, nofollow`; live `/readyz` returned **503** (owner identity not provisioned/ready).
- Server disk: **197 GiB, 178 GiB used, 9.4 GiB free (~95% usage)**. Do not install large toolchains or prune other services until capacity and backup are reviewed.

**Interpretation:** these are limited static-crawl checks, not Google Search Console coverage, ranking, indexing-confirmation, real human QA or Core Web Vitals. Current VSP robots.txt actively advertises its public sitemap; do not infer official domain cutover.

## Known risks / gates

- PR #52 already imports FAQ and in-place first-party login; this branch deliberately does not duplicate or replace those features.
- PR #50 has separate color/SEO features on a divergent chain. Reconcile via scoped comparison before merging; do not deploy it over active Studio Pro.
- The original `knaba.de` website still advertises office/general cleaning, while the new public project is intentionally construction/BauService-centric. **Owner must approve the service claims** and single-domain indexing/migration plan to avoid conflicting public offers and competing URLs.
- Search Console/Bing/GA4 access and exact rankings/CTR/conversion/CWV data remain UNKNOWN; GSC Wizard trial ended, no paid subscription activated.
- Full `npm ci && npm run check && npm test && npm run build && npm run verify:build && node --test vps/*.test.mjs` on Node >=22.23.4 **NOT_RUN** on this branch. Avoid treating the parent PR #49 receipts as evidence for this commit.
- Full DE/EN/UK/RU Playwright browser run including screen readers, zoom, whole-site/mobile cards/Studio publish, Google OIDC or other social auth real-provider flows and owner UAT **NOT_RUN**.
- Existing `/readyz=503` means real owner registration is blocked. Do not create/print/email passwords or promote users to owner from frontend claims.

## External identity follow-up (source plan; NOT shipped)

- Google OIDC authorization-code + PKCE S256, cryptographic state and nonce; server-side exact issuer/audience/JWKS/expiration/email_verified checks with bounded timeouts and no token-in-URL/logs.
- Provider subject mapping must be unique by `(provider, sub)`; matching email alone is insufficient for linking privileges. First-time sign-in gets PENDING role without Studio, CRM, ERP, or tenant permissions.
- Owner-only invitation/approval, MFA, safe revocation, CSRF/session rotation and audit; provider OAuth client creation, approved redirect URI, verified contact address, GDPR/DPA decisions and test accounts are external prerequisites.
- Owner receives a short-lived one-time activation path to establish their password, **never a reusable password via chat or email**. No unverified identity provisioning.

## Next checkpoint

1. Independent review of draft branch diff, confirm service copy and ownership/branding.
2. Run dependency-correct full build+tests and verify generated sitemap/hreflang/canonical/SEO metadata on exact build artifact SHA.
3. Full browser and physical device checks including 200% text resize; log concrete failures.
4. Set approved index canonical strategy and registration/OIDC contract with verified owner.
5. Only then stage site-only deployment with independent database/Compose backup, capacity check, explicit release approval and rollback rehearsal.

**Product verdict:** PATCH_SOURCE_COMMITTED / STATIC_LIVE_CRAWL_PASS_ON_DIFFERENT_RUNTIME / SEO_STANDALONE_3_OF_3_PASS / FULL_BUILD_NOT_RUN / OWNER_NOT_READY / NOT_CUSTOMER_READY.

## Additional 2026-10-25 exact-source full QA (supersedes earlier NOT_RUN for this code only)

**Tested executable SHA:** `07dbf5c8c0ba9771de50e183fbaf7ddd8bd611e0`. Source was cloned by exact 40-char SHA before execution; no runtime source changes after this test. Separate evidence-only commit does not change executable source.

- Official Node.js `v24.22.1` tar SHA-256 passed verification against NodeJS-published SHASUMS.
- In unprivileged `sentinelx` ephemeral RAM directory with new npm cache and `--ignore-scripts`: `npm ci` PASS, `npm run check` PASS (**0 errors, 0 warnings, 4 hints**), `npm test` PASS (8/8 inquiry tests; Vitest count not captured), `npm run build` PASS, `npm run verify:build` PASS; artifact content SHA-256 from verifier `f5997c650aa31fbb2d0feb6cbe036f59008964c20a6929e20e8cfecdfad43705`; `node --test vps/*.test.mjs` **19/19 PASS**, `node --test vps/seo-standalone.test.mjs` **3/3 PASS**.
- Pinned Chrome for Testing **156.0.8078.47**, download SHA-256 `e6c94490f0b6b337225aeb2d2a5034858516b7017356980ba94f5176d8774a50`: complete **60/60** local static-browser cases on construction home, catalogue and service details in DE/EN/UK/RU (320/390/760/1280 widths plus 200%-root-font checks at 390); **32/32** footer legal-link/assistant overlap checks PASS.
- Source was NOT deployed by this test. The active `kneba.vsp.rest` release is different, and customer/device/browser-reader UAT remains **NOT_RUN**. No root or Docker access, no use of production secrets, services, data or database.
- Google/other social provider OAuth client verification and secure role mapping remain **NOT_IMPLEMENTED**, and owner enrollment is still unverified (`/readyz` 503).
- No Web Vitals field scores, official-domain Search Console evidence or index coverage results were produced. PageSpeed API returned 429 quota exhausted; do not requery or infer a score.
- Evidence is stored at `docs/evidence/knaba-pr55-source-qa-2026-10-25.json`.

**New readiness statement:** CODE_BUILD_TYPE_UNIT_BROWSER_PASS on the pinned executable SHA, but OWNER_AUTH/GDPR/REAL_DEVICE/DEPLOY/EXTERNAL SEO gates remain open. This does NOT make KNABA production- or customer-ready.
