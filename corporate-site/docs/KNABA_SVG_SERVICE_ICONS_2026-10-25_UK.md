# KNABA — SVG design-system and mobile title correction, 2026-10-25

Scope: developer preview kneba.vsp.rest; **not** official knaba.de production.

## Code identity and work completed

- Baseline of active private KNABA preview: `30cdeb75c46ad90e1fb921e78c9928235f3ac29a`.
- Exact executable/test code SHA: `57ccd417cb918cf351f280173050915883f63158`, tree `f7fb50833d5b6ef820ad801003dcd59a3df0bfe6`.
- Nine fixed decorative first-party SVGs: eight real BauService offers plus one independent project CTA (not a ninth service); strictly typed mapping, built into Astro, no remote icon fonts or client JS.
- Unified icon art on homepage/catalogue/technical extras, seven non-illustration hero slides and 32 localized service detail pages, DE/EN/UK/RU. Card grid maintains 01–03 real cleaning, 04 planner, 05 Bauhelfer, 06 clearance. Hero-carousel retains its existing eight-service sequence. No change to CRM codes, company services, ERP, identity, APIs or database.
- Mobile Bauhelfer detail heading: no isolated last-character line; separate accessible page-intro kicker. Other page titles/global CSS not changed.

## Verified testing of exact code

- Offline Node v24.22.1, no network, source with lockfile-matched read-only npm dependencies. Capped 2 CPU, 2.7GB RAM and 250 PIDs.
- `npm run check`: 0 errors/warnings; prior advisory hints remain.
- `npm test`: 180/180 Vitest and 16/16 Node PASS; verified RED import failure before registry implementation.
- `node --test vps/*.test.mjs`: 23/23 PASS.
- `KNABA_RELEASE_MODE=vsp KNABA_VSP_INDEX_APPROVED=1 npm run build && npm run verify:build`: 117 generated pages, 8 DE/EN/UK/RU core-grid links/orders and 52 localized SVG group/detail verifications PASS.
- Exact built client artifact SHA256: `35f4d2cf9503950e898c8fd88982d6fd92735c042be27a39ef537bd111c70976`.
- Isolated Chromium: 32/32 (4 locales × home/catalogue × 320/390/768/1280px), 32/32 BauService details at 390px, 7 hero SVGs and navigation, 8/8 Bauhelfer mobile headline cases at 320/390px, no overflow within checked scopes. Selected screenshots reviewed.
- Scoped Git diff review: nine executable/test files; no auth, runtime server, migrations, secrets or package installations changed.
- Physical devices, Safari/Firefox, real 200% browser zoom, screen reader, live p95/CWV and genuine owner UAT **NOT_RUN**.

## Measured payload comparison from source baseline

| Asset | Prior | New | Delta |
| --- | ---: | ---: | ---: |
| Homepage HTML gzip | 13,356 B | 13,968 B | +612 B |
| Catalogue HTML gzip | 6,128 B | 6,693 B | +565 B |
| Bauhelfer HTML gzip | 5,911 B | 6,058 B | +147 B |
| All 34 JS assets gzip | 180,182 B | 180,182 B | 0 B |
| All 13 CSS assets gzip | 37,910 B | 38,032 B | +122 B |

VPS renderer and Worker hashes identical to baseline. These are transfer sizes, not field latency metrics.

## Release and security gates

- Immutable versioned developer-preview release only after exact artifact verification, prior-release check under lock, online SQLite backup, targeted live route smoke and tested rollback path.
- Real KNABA owner remains unenrolled (`/readyz`=503); never fabricate credentials or bypass role/tenant isolation. Owner onboarding PR #58 and Control Center PR #69 require separate identity, migration and human acceptance gates.
- Previously rejected public GitHub source publication is not silently retried; preserve private bundle and exact source identity on VPS.
- Official knaba.de, customer datasets, production merge, paid AI/WhatsApp/email provider activation are out of scope.
