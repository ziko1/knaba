# KNABA integrated VPS candidate — source-bound QA and release hold
Date: 2026-10-25 Europe/Berlin.

## Source provenance and scope
- Repository: ziko1/knaba; separate branch codex/knaba-vps-integrated-20261025.
- Tested code/merge HEAD: 095c6c1e5fb1a2018aec0fec5986b3661af5edb6.
- Corresponding Git tree: 609897b31c40b96b813ecea97745ae1727da9471.
- Integration started from public VPS PR #29 base SHA 52c00e3d60626a5ca104054fbc94431b3b5e8213 (live installed app source was 695a58077cf119096301c268c017d0d392712b71).
- Merged server-rendered Studio / SEO / disk guard PR #30 at db28dbde9fd439b4c09f0de0a3eecbbf68702807.
- Merged dedicated VSP release mode / strict Host / language + legal source PR #28 at 74452d1999beb260fae75c371f958fbb38dfb579.
- Conflict resolution was explicit: preserved actual first-party VPS privacy/legal source text from PR #29 in both German and Russian, never restored old ChatGPT Sites authentication language. Build-report writing retains PR #30 explicit path override while adding PR #28 VSP-specific receipt.
- Preserves pre-existing CRM, Studio, existing Node worker/D1-compatible SQLite and Docker runtime. No new alternative CMS, task queue or provider Gateway.

## Recorded checks on exact code
The test execution ran on this exact worktree before the code was committed; the final committed tree was verified clean with the same file contents and a pinned head. This evidence is not a production artifact install.
- Fresh pinned npm ci (508 packages), Node 24.22.1 in Docker, no package-lock drift or paid AI requests.
- VSP explicit release mode: npm run check: 111 Astro files, 0 errors, 0 warnings and 4 hints; Vue/Svelte diagnostics clean.
- npm test: 102/102 Vitest PASS, 8/8 Node inquiry tests PASS.
- npm run build: 51 static HTML pages plus existing Vite Worker and bundled server-side HTML renderer (about 180 KiB), no build failure.
- npm run verify:build: PASS links, localized menu, public canonical, no preview banner, assets, source metadata. IndexMode=VSP_PUBLIC; sitemap=44 public loc entries.
- node --test vps/*.test.mjs: 14/14 PASS, including actual owner login/CRM, private drafts, publish/restart/restore, server-side body and SEO output, escaping/XSS blocking, strict domain/TLS, DB read-only audit and disk guard.
- Separate official mode fallback: 51 HTML, build verifier PASS, 14/14 VPS tests PASS with official canonical knaba.de; this is regression testing only and NOT authority to release the official domain.
- Local Playwright Chromium 390x844 within no-network Docker with synthetic HTTPS and disposable SQLite: anonymous editor denied, synthetic owner password login, Secure/HttpOnly session, real Studio select/edit/save/publish, server-rendered edited text and SEO HTML visible, SVG-icon link edit, zero browser JS errors, zero horizontal overflow; PASS. Neither production owner nor customer data were touched.
- Production dependency npm audit --omit=dev --audit-level=high: 0 advisories observed, exit 0. Not a substitute for independent security review.
- VSP dist/client artifact SHA256: 03039bcb1e793bf9e55761eb7473fb883fa3361748bcfb7b84283ac4948195fb (one emitted build, not general reproducibility).
- CSS gzip total: 23278 bytes; emitted JS gzip total: 154701 bytes; not field page payload/CWV.
- All tests scoped to source/staging. No real provider API request, production release, customer data mutation, D1 migration or live account activation.

## Live environment read-only baseline (separate from candidate)
- kneba.vsp.rest TLS is trusted (HTTP 200), hosted at VPS 51.77.35.6 via existing Traefik/Node container from PR #29. The current installed SHA differs from this candidate.
- Public /readyz=503 because real owner enrollment is missing. Existing VPS SQLite integrity OK; 0 counted vps_users, assistant_messages and cleaning_requests in inspected tables, NOT evidence of zero legacy Sites data.
- Live HTML is still noindex, follow and has temporary preview banner; live sitemap has zero loc entries. New candidate is indexable but must NOT be deployed or submitted for indexing without site owner acceptance and legal review.
- Original ChatGPT Sites project appgprj_6adc346d6f8881918b73ac79ebc5d759 has no verified supported data-export / backup / deletion interface from this session. A directly connected AppDeploy account listed 0 apps and is not that project's storage. Opera browser is connected but visiting chatgpt.com/sites reached the sign-in page, no authenticated Sites dashboard.
- To preserve GDPR data, first get legitimate Site owner/editor access, inspect actual original database through Sites, export ALL leads, users, chats, offers, consent and migrations through supported, authorized controls, verify schema/row counts and restore into a disposable copy. Never assume restoring a prior Site version restores its database. Do not delete original project before these checks.

## Release gates
1. Owner of KnaBa must approve branding, copy, Datenschutz/Impressum (including actual hosting processor, retention/erasure, processor contracts), client data export and owner user account. Configure OWNER_EMAIL and password only through secure terminal; no account seeded from guesses.
2. Import and independently reconcile prior Sites/D1 data with new SQLite schema, owner/client/worker permissions, consent records and rollback. PR #26/#27 migrations must be rebased/reconciled separately instead of automatically layered onto this SQLite lineage.
3. Verify real trusted proxy, secure cookies, request parsing, role-scoped live submissions, owner notifications (currently disabled), backup+restore, measured p95/Web Vitals on target devices, keyboard/screen-reader UAT and independent human security code review.
4. Only after all gates: owner-approved staging/release on exact source+artifact identities and optional activation of public indexing. No merge, live deployment, source overwrite, paid LLM, service restart or Sites deletion performed in this continuation.
5. AI Team Gateway PR #69 / test PR #79 remains Draft; KNABA project registered but providers and paid budget grants are zero; do not wire unrelated containers through a shared-UID Unix socket.

## Safe rollback
Retain original release and VPS SQLite snapshots in separate directories; retain historical Sites/D1 project until restored copy is verified. Production rollback requires approved operator and new checks. A DNS reversal to old Sites is NOT an assured rollback: old CNAME already previously returned HTTP 403 before cutover.

**Decision: INTEGRATED_SCOPED_QA_PASS / PUBLIC_DEPLOY_HOLD / CUSTOMER_DATA_EXPORT_BLOCKED / OWNER_AUTH_REQUIRED / INDEPENDENT_REVIEW_NOT_RUN.**


## 2026-10-25 continuation — fail-closed VSP SEO release approval

- Executable source/test code SHA: 198f606f5101314d2d3019b047580c7fe18b0ddb; Git tree: 9cf2d77db1cd5230637c8b9d989463d7d310dd64. A documentation-only commit follows after this tested source. The historical indexed artifact above must NOT be assumed deployed.
- Scope: no second CMS/queue, no customer-data/provider change, no public deployment. Added an explicit build-time owner-approved indexing gate (KNABA_VSP_INDEX_APPROVED=1) for KNABA_RELEASE_MODE=vsp.
- VSP without any flag: canonical https://kneba.vsp.rest/, no preview banner, HTML meta noindex/follow, static _headers global X-Robots-Tag noindex/follow, actual Node24 public HTML HTTP header X-Robots-Tag noindex/follow, empty sitemap, no robots Sitemap line. Private Studio retains stronger noindex/nofollow.
- RED TDD evidence: updated static acceptance failed for original automatically indexed VSP source, exit 1. Separate public Node HTTP header test failed on original code with missing X-Robots-Tag, exit 1. Minimal production source fixes then made each focused test GREEN.
- Default VSP after fix generated 51 HTML pages and verify:build PASS; indexMode VSP_PENDING_APPROVAL; one artifact SHA256 2170b09bac840720df023f8b2f7e8485bdf09b09342884017f61ebde7235cbfc. Invalid literal yes also remained fail-closed; only EXACT flag value 1 produced a synthetic VSP_PUBLIC build with 44 sitemap addresses and artifact SHA256 03039bcb1e793bf9e55761eb7473fb883fa3361748bcfb7b84283ac4948195fb. This is only a test of the release flag, NOT owner approval and NOT deployed.
- Backwards compatibility: KNABA_RELEASE_MODE=official remained OFFICIAL with 51 pages, original canonical https://knaba.de/ and 14/14 VPS tests PASS; never deployed.
- Latest fail-closed source QA on exact code: Node24.22.1 no-network Docker; npm run check 111 Astro files, 0 errors, 0 warnings, 4 hints; Vue/Svelte clean. npm test 102/102 Vitest + 8/8 Node inquiry PASS; npm run build 51 HTML + existing Worker + SSR renderer PASS; npm run verify:build PASS; node --test vps/*.test.mjs 14/14 PASS; git diff --check PASS.
- Independent synthetic browser E2E (no network, temporary SQLite and TLS): Chromium 390x844, synthetic owner Secure/HttpOnly login, Studio edit/save/publish, new body and SEO served by Node, icon link edit, zero horizontal overflow/JS errors PASS. New acceptance checks Studio publishing never lifts unapproved noindex.
- Indexing gate is build-time only: modifying container environment later does not rewrite compiled HTML/robots/sitemap. Formal site-owner/legal/data approval and release acceptance are prerequisites before any indexed deployment. Production RELEASE=HOLD; OLD SITES DELETE=BLOCKED.
