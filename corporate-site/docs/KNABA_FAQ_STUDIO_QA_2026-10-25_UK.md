# KnaBa FAQ + Site Studio — окремий QA/release gate (25.10.2026)

## Verified baseline / scope
- Base of this candidate: PR #51 c3563b07c9ea2e9134fdce3ad7a0f7d4b5f618b0 (stacked on PR #49).
- Previously deployed development domain kneba.vsp.rest runtime 24dd7fc826ff50c3fab9273ce9e654fbee2095b6 as observed at scope start.
- Existing carousel, Turnstile, footer, i18n99, Studio Pro, CRM/portal and Node VPS state are reused, never replaced with older PR #44 sources.

## Included improvements
- All 42 construction-cleaning FAQs in six groups and four actually published languages DE/EN/UK/RU from reviewed PR #51; four standalone FAQ pages, six mini-teaser cards on each language home, responsive search and native accordion.
- Added FAQ route to shared owner-editable studioPages inventory in all four published languages. Count increases from 68 to 72 public, validated routes. No private/account/retired service paths added; existing owner-only API and source-safe editor contract unchanged.
- Added durable Playwright FAQ search/category/zero-results/home->FAQ client-navigation suite in tests/faq-browser.cjs.
- No new npm dependency, DB migrations, API credential, webhook, token, provider calls, prices or claimed new construction services.

## Actual development QA evidence
- RED: focused Studio route inventory test failed before adding FAQ to owner page options: four new routes were missing.
- GREEN: after implementing page option, exact isolated Node24.22.1 no-network Docker run: npm run check 0 errors / 0 warnings; npm test 144 Vitest and 8 inquiry tests PASS; npm run build 103 static HTML pages; npm run verify:build PASS; tests/check-project-cta.mjs PASS; Node VPS suite 16/16 PASS.
- Built candidate artifact digest SHA256 77e730e639c7ceb33ef501832e00ffeead75dd0e5daa6bb75cfcf8d7282647ed (for final candidate source; replay if files change).
- Chromium static HTML: 4 languages × 320,390,768,1280px = 16/16 FAQ browser cases, 42 questions per page, 7 per group filter, dynamic zero-results, reset and keyboard-accessible native accordions, horizontal overflow <=1px. Ukrainian home->FAQ navigation via Astro ClientRouter PASS.
- These are code/browser QA; real owner sign-in and published Studio editing are NOT_RUN.

## Deployment/readiness gates
- Verify current VPS release exact SHA before staging. If it moved, do not overwrite, rebase/retest instead.
- Verify pinned build files and DB migrations unchanged. Save fresh online SQLite backup, read back SHA256 and integrity, retain previous immutable code release. Never restore stale data on rollback.
- Deploy only kneba.vsp.rest and web service; check HTTPS, all public HTML pages, new FAQ, Turnstile public config without exposing secret, CRM forbidden 401, /readyz truthfully 503 if owner not enrolled.
- Include post-deploy real Chromium FAQ in four languages; mark official knaba.de, main merge, missing owner enrollment, physical-device UAT, human Turnstile completion, legal signoff, offsite backup and D1 migration as blocked.
- Disk ~95% used; /tmp dominated by QA branches and Docker metadata has misleading reclaimable estimates. No arbitrary deletion/prune or shared-process interruption.
