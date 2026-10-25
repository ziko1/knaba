# KNABA — final construction-cleaning brand and mobile polish (2026-10-25)

## Source baseline / scope
Based on exact deployed dev code `d571832fde7a10b19936ca9321b0de4c661ebf7d` in `feat/knaba-baureinigung-20261025`. Work in separate `fix/knaba-footer-brand-final-20261025` branch, no merge to `main`. Do not change official `knaba.de` or unrelated VPS apps.

## Owner-directed brand decision / facts
Owner directed KnaBa development site to specialise in **Baureinigung and Bauhelfer**, not office cleaning. As of this check, the independent official website `knaba.de/leistungen` still publicly mentions Büroreinigung; this is an unresolved legacy-content discrepancy, **not** evidence that the official company has no such activity. The development website follows the owner's newer positioning and does not assert unsupported qualifications for core drilling, through-wall services, or electrical installations. Those are enquiries subject to trade qualifications, structural/fire checks and written contracts.

## Implemented
- Bright building + *Fensterabzieher* brand glyph, matching responsive SVG header/footer wordmark, standalone mark and SVG favicon (source files `public/images/knaba-construction-logo.svg`, `...mark.svg`, `public/favicon.svg`). Fully first-party, scalable, no external fonts/images.
- Layout footer fix via a semantic flex-column page shell (`min-height: 100svh`, main flex growth, footer bottom-anchoring). No fixed-spacer/magic-height hacks.
- Old `/leistungen/bueroreinigung/` URLs under DE/EN/UK/RU return **308** to the current locale's service catalog from the trusted VPS router (only on `kneba.vsp.rest`). No CRM-schema change or deletion of historical enum values.
- Public `/api/catalogue.json` now returns current marketed construction-cleaning service only (`baureinigung`) instead of leaking discontinued office service copy. Existing history/service enum retained, and client parser accepts legacy full catalogue or the new reduced response.
- The prior rebrand already implemented the 4-language `/leistungen/` catalogs and eight linked `/bauleistungen/*` pages per locale, including conditional technical construction enquiries. This change reuses those pages; does not create a duplicate CMS.

## Fresh checks (on precommit source candidate)
- TDD red→green: `vps/server.test.mjs` 200→308 office-URL redirect, `tests/construction-brand.test.ts` old drilling→new squeegee identity, `tests/public-construction-catalogue.test.ts` old six records→one public construction offer. All targeted tests turned green.
- Short-page regression test `tests/mobile-footer-browser.cjs`: on the old live site a synthetic short-page viewport 390×1550 ended at 850.59px, leaving ~699px blank; on a separate static server with the new built CSS the footer bottom is 1550px and horizontal overflow zero. Viewports 320×700, 390×844 and 768×1024 also pass.
- Isolated Docker Node24.22.1: `npm ci` from pinned lock; `npm run check` 143 files, 0 errors/warnings (4 hints); `npm test`: **108/108 Vitest + 8/8 Node inquiries**; `npm run build` 99 HTML + Worker + bundled VPS SSR; `npm run verify:build` reports static internal links and metadata PASS, `TEMPORARY_NOINDEX`; `node --test vps/*.test.mjs` **14/14 PASS**; `npm audit --omit=dev` zero reported vulnerabilities.
- Exact built static artifact digest `b71e716a8f73016f9be63fe7c523898c7737e172f38d8d317e2b7b4bd749527c`, worker `b84a86d458fbae242eadef7b296f5cec8d1f7b9def1149deb8241f846145d105`, renderer `4313a678824926f93b09e417bd65d58844e33bb602952d4c22cfe180f2f7ed64`, home HTML `e0496be03a80cf26e4b5b18a4230f3316140e9fc22c9d404d19a820404d5d8d6`.
- Static smoke `/api/catalogue.json` only `baureinigung`, SVG contains expected brand identity. No live database writes in testing.

## Remaining gates / rollback
- Public development VPS deployment and strict TLS/domain/route verification must be recorded separately after actual release. Prior immutable release, compose, DB backups, authentication/SSL must be preserved.
- Real owner enrollment (`/readyz` currently 503), physical phone UI, customer legal accuracy, data reconciliation from historical provider, GDPR retention, independent security assessment and p95/field CWV NOT_RUN. Existing code supports no billable AI/email/WhatsApp sends by default; no new subscription activated.
- Offsite backup and 95% VPS disk usage remain operational follow-ups; do not automatically erase user data or unrelated Docker layers.

## Rebased onto the latest VPS release candidate (PR #35), 2026-10-25
- Preserved current dev source baseline `f06d7fe12c9a87786f6c7765f3528e4dd99b105e` (PR #35 code `87b6fb49a658e60781d35c44f2667d720dfcf6ac` plus docs). This is a **new integrated source snapshot**, not the originally tested `d571832...` candidate.
- Repeated full Node24.22.1 QA **on this integrated source**: Astro/Vue/Svelte 0 errors/0 warnings (4 hints), 108/108 Vitest, 8/8 inquiry Node, 14/14 VPS Node PASS; 99 built HTML routes, static verifier PASS. `KNABA_RELEASE_MODE=vsp` preserves **VSP_PENDING_APPROVAL/noindex** and first-party legal/SSL.
- Fresh actual `dist/client` artifact SHA256 `e07816d0aeb2154dabc483cf2748afc6c6a2951b1b615a011a59c4e8687a60ce`; worker SHA256 `b84a86d458fbae242eadef7b296f5cec8d1f7b9def1149deb8241f846145d105`, bundled renderer `4313a678824926f93b09e417bd65d58844e33bb602952d4c22cfe180f2f7ed64`, homepage `e0496be03a80cf26e4b5b18a4230f3316140e9fc22c9d404d19a820404d5d8d6`.
- Real Chromium on isolated Nginx static build: synthetic short-page footer bottom matches viewport on 320×700, 390×844, 390×1550, 768×1024; horizontal overflow 0. Ukrainian catalog has 10 linked service cards; public JSON serves only `baureinigung`, no office service. No production database mutations in tests.
- Further public deployment still requires strict TLS/live routes, verified backups and rollback. Do not modify external official `knaba.de`, source-provider historical data, owner secrets, or unrelated services.
