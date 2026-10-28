# KNABA — customer-approved design preservation gate

## Scope
The customer-approved corporate design is immutable for this increment. Extend content without redesigning, replacing, reordering, or deleting existing sections. Existing logo, hero, carousel, navigation, colors, typography, cards, footer, assistant and responsive conventions stay in place.

## Actual change
- Existing `ConstructionHome.astro`: one additional `ProjectScopeGuide` between `MarketingStories` and `CompanyProfile`; all pre-existing sections retained in their previous order.
- Existing `ProjectScopeGuide.astro`: four published locales (DE/EN/UK/RU), four explanatory factors, existing planner CTA.
- Existing global `bau-card-grid`, `bau-card`, `bau-ordinal`, `bau-heading`, `bau-kicker`, `button button-dark` reused. Only minimal local grid/reflow CSS, no new palette or fonts.
- No new service claims, prices, fictional reviews, authentication, database changes or paid provider.

## Required acceptance before test-domain release
1. Compare exact live source against this candidate and concurrent PR #98/#100/#101 and later work. Preserve existing blocks and latest fixes.
2. Verify component markup and four-locale links; Astro/TypeScript, Node24 Vitest/Node/VPS, build/static link/i18n tests.
3. Browser screenshot diff of homepage at 320/390/768/1440 widths and 200% text. Assert all old sections, old order, zero overflow, accessible headings/keyboard, footer and Assistant unobstructed.
4. Check performance baseline against same release: HTML/CSS/JS gzip and field CWV when available.
5. Under existing release locks: fresh storage gate, current SHA CAS, verified SQLite backup+restore, immutable artifact and rollback. Only then deploy to `kneba.vsp.rest`, verify strict TLS and live routes.
6. Keep official `knaba.de`, `main`, customer data, billing and production deployment unchanged.

## Status
Source change saved in draft branch. Full QA, independent review and live release **NOT_RUN** in this commit. Do not claim deployment or customer acceptance.
