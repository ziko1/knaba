# KNABA — DAILY CLIENT ACCEPTANCE / FIRST-PASS QUALITY
Revision: 2026-10-26. Scope: ziko1/knaba, especially corporate-site/ and the developer preview kneba.vsp.rest.

This document supplements, and never replaces, the existing AGENTS.md, PROJECT_MEMORY.md, ROADMAP.md, KNABA_DE_MASTER_SPEC.md, architecture/contracts, budget, QA/security instructions and release permissions. It does not create a scheduler, new AI team, second CMS or second bot.

## 1. Quality principle

Work as though a real KNABA client opens every public route on a phone **every day**. The visible site must convey one trustworthy identity and coherent premium corporate design, without incomplete translations, duplicate CTAs/links/phone numbers, broken pages or images, unverified claims, placeholder copy or developer/source notices. Fix root causes in shared components, not cosmetic patches in every locale. "100% the first time" is the target standard, **not** an unverified status claim. PASS is valid only when proved for a concrete SHA/artifact/environment.

## 2. Mandatory source-of-truth and reuse

1. Inspect latest repo, exact branch/HEAD/PR diffs, local changes, actual VPS release/artifact, tests and current rules BEFORE editing. Compare open overlapping branches and actual deployed code; do not overwrite collaborator work or confuse preview, staging and official production.
2. Read existing project memory, roadmap, specification, contracts, issues and checkpoint. Reuse KNABA shared offers, company facts, one header/footer/nav, one owner/contact flow, one Assistant, one partner/gallery inventory and one multilingual design system. Do not duplicate functions/components/prompts/gates or add paid dependencies without need.
3. knaba.de is a source for *internal fact verification*, not a visitor-facing old-domain navigation target. Validate Bauhelfer/Bauhilfsarbeiten as well as cleaning, Berlin/Brandenburg, actual public contacts and owner-approved terms. Never invent certifications, licenses, partner permission, photos, jobs, prices, testimonials or response guarantees.
4. Compare the exact SHAs of Draft PR #73/#74/#75/#76 (and newer work) before integrating; gallery and logo/photo rights remain separate approvals. Keep KNABA isolated from AVENQO.

## 3. Acceptance gates (all required)

| Gate | Required demonstration |
| --- | --- |
| Correct content | Corporate identity, services, region, clear customer journeys, up-to-date legitimate phone/address/email, owner-verified partners and legal assertions |
| Entire navigation | All public sitemap URLs plus all linked same-origin extra URLs; every local link, anchor fragment, media/srcset/script/stylesheet. No unexpected redirects/4xx/5xx, duplicate destinations in the same UI group, old-domain outbound links or debug/source notices. External destinations reviewed; no unsafe spider crawling them |
| Four localizations | DE/EN/UK/RU actual content and slogan/alt/CTA/menu/footer, valid locale targets, canonical, hreflang, sitemap, unique title/H1/description, structured data. A 99-target language selector is **not** proof of 99 reviewed translations |
| Pixel/UX quality | Shared spacing/typography/colors/buttons/cards; image ratio and crop; icon alignment; responsive 320/390/640/768/1440 CSS px; visible focus and hover, keyboard Tab/Enter/Escape, 200% text reflow, reduced motion and zoom/physical-device separately verified |
| Accessibility | Semantic headings, form labels, image alt, keyboard order, min hit areas, no fixed Assistant overlay blocking phone/footer/contact, WCAG AA text contrast 4.5:1 and meaningful screen-reader flows |
| Working journeys | Catalogue→detail→planning→contact, input invalid/empty/retry/error and confirmed real handoff. If owner/Assistant/ERP/WhatsApp/voice flows are disabled, mark NOT_READY rather than pretending a visual widget sends messages |
| Security/privacy | Scoped auth and tenant isolation, input escaping, CSP, safe external URLs, no secrets in HTML/logs, correct imprint/privacy/data handling/consent; public crawl GET-only and unauthenticated, never live form submissions, logins, DB mutations or payments |
| Performance | Keep existing measured static build limits of 40 KiB total emitted CSS gzip and 220 KiB total emitted JS gzip unless justified with real before/after evidence. Separate emitted total from actual per-page transfer, and do not invent CWV, p95, LCP, INP, CLS or phone-device metrics |
| Reproducible delivery | Node matching package engines; exact dependency lock, check/tests/build/verify; isolated loopback browser, independent reviewer, immutable artifact integrity, current-vs-candidate SHA, verified backup/rollback, owner acceptance, **separate deployment permission** and post-deploy live proof |

## 4. Single efficient execution sequence

1. Identify the actual defect, audience, pages/locales/widths and baseline; read existing implementation and open PRs. Write a small acceptance matrix, no parallel duplicate feature branches.
2. Add a regression test that initially reproduces the issue when feasible; implement the smallest shared fix. Include negative, empty, boundary and degraded/error states when applicable.
3. Validate focused tests, then on the *same exact source SHA* with Node >=22.23.4 run: npm run check; npm test; npm run build; npm run verify:build. Release builds must not force NODE_ENV=development. Cache-reused dependencies require exact package-lock match and must not be described as a fresh npm ci.
4. Run existing isolated browser QA, not a fake DOM simulation. Use loopback HTTP, existing npm test:logo:browser / test:reflow / test:guides-browser / test:visual. Confirm all four locales with mobile/desktop responsive widths and capture evidence for visually changed blocks. Check real clicks, focus, tab order, menu/locale dropdown, fixed Assistant overlap, console and network failures. Report browser-policy failure as BLOCKED, not PASS; no administrator-policy bypass or blanket no-sandbox flags.
5. Run source-built GET-only link audit: KNABA_TEST_URL=http://127.0.0.1:PORT KNABA_EXPECT_SITEMAP_ROUTES=EXPECTED npm run audit:public-links. The crawler discovers sitemap plus same-origin linked pages, fragments and local media. It complements the existing fixed-route script scripts/verify-public-live.mjs and static tests/verify-build.mjs, rather than duplicating their scope.
6. Confirm rights/legal/owner UAT and independent review of code, visual output and metrics. Fix verified failures and repeat affected and dependent gates on the **new SHA**. Never reuse an earlier QA pass on modified code.
7. Only on separately authorized release: check git/unpushed work, disk, immutable backup/rollback; atomically publish the exact verified artifact; compare public release SHA, run npm run verify:live and mobile real-user smoke. No silent main merge, official DNS cutover, customer data destruction, irreversible migrations, external lead delivery or paid model activation.
8. Record an honest checkpoint and customer-facing handoff: changed pages, links, assets, baseline vs new, exact SHA/build hash, tests counts, screenshots, reviewer, deployed version, known blockers and rollback state.

## 5. Failure prevention / no-ephemeral-only

- One defect = one underlying fix, one regression test, one shared integration. Prefer existing component and test. Avoid rewriting stable code and speculative optimization without a baseline.
- Do not equate HTTP 200, source code tests, mock, static build, CSS viewport or an old screenshot with live mobile/device/customer acceptance.
- Do not retry Chromium after unchanged ERR_BLOCKED_BY_ADMINISTRATOR. Use an already authorized isolated browser; if none works record BLOCKED. Never weaken host/browser security to manufacture PASS.
- Never erase temporary/source work before off-host git and appropriate backups of important ignored files, databases, uploads, secrets and checkpoints. VPS cleanup must not erase unreleased changes.
- If an external approval/rights/authorization/budget gate is blocked, continue independent permitted checks, log the precise evidence and hand off a bounded Owner Action. No invented credits, silent expenses or fake 24/7 background operation.

## 6. Reusable master execution prompt

> You are responsible for KNABA as Principal Software Architect, Senior Full-Stack/Performance Engineer, Security Engineer, QA Lead and Product/UI Designer. Treat the corporate website as a product the real customer evaluates daily. Read the canonical existing rules, memory, roadmap, contracts, current KNABA source, live release SHA, all relevant PRs and the official business source. Be REUSE-FIRST and FINISH-FIRST: identify actual gaps, do not create duplicate code, links, components, bots or workflows. Reproduce each issue and record acceptance tests covering DE/EN/UK/RU, mobile and desktop, errors and accessible user journeys. Fix the root cause with the simplest maintainable change. Validate exact source SHA with tests, typecheck, build, static artifact and same-origin sitemap/link/image/fragment audit; validate rendered layout, keyboard, console and network in an authorized browser. Evaluate security, privacy, rights, measured performance, restore/rollback and independent review. Keep separate statuses for code, isolated build, browser, current VPS, real-device and owner acceptance; classify each as PASS/FAIL/BLOCKED/NOT_RUN and never claim 100% on partial evidence. Do not merge, deploy production, modify customer data, activate paid services or bypass policy without separately confirmed authorization. Persist verified work in GitHub and documentation so host cleanup cannot lose it; continue independent tasks on blockers and provide an accurate customer handoff.

## 7. Daily result receipt

Report: **target environment, current live SHA, candidate SHA, changed components, sitemap/public linked URL/asset counts, broken internal or old-domain references, four-locale parity, actual browser widths/screenshots, QA commands and exit codes, measured bundle sizes, rights/legal/security/lead-flow status, independent reviewer, deployment/backup/rollback status, FAIL/BLOCKED/NOT_RUN with follow-up**. A website is not "customer-ready" until all mandatory gates and human/client approval are closed.
