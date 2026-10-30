# KNABA I18N-99 — status and staged release plan · 2026-10-25

> Historical plan. The user superseded this target inventory on 2026-10-28 with exactly German, English, Polish, Lithuanian, Russian and Ukrainian, in that order; German remains default. The current route-specific contract is in `i18n/README.md` and `src/lib/locale-catalog.ts`. Historical test receipts below are retained as evidence of their original source only.

## Clarification
The previously reported 99 means **99 built HTML pages**, not 99 localized languages. At the start of this work KNABA had **4 published locales**: DE, EN, UK, RU. Some detailed/legal content within these still needs native review.

## Implemented in this isolated source branch
- 99 unique canonical BCP47 targets in `src/lib/locale-catalog.ts`, ICU-derived names, RTL direction.
- Shared-header search/list in four UI languages; four published links remain functional; 95 not-yet-translated languages visible but **NOT selectable**.
- Public read-only `/languages.json` manifest with actual translation status. No invented public translated routes or hreflang tags; no application schema, ERP enum, account/CRM/Studio access or customer records changed.
- No billable AI provider, external translator, or translation job activated.

## Remaining work — NOT_DONE
95 full language packs, human/native QA, form texts, service/contract terms, legal policy, accessibility/RTL and field validation. Do not claim full 99-language localization until each language has proof. Keep the published HTML lang truthful, locale URL only for complete reviewed content.

Translation acceptance per locale:
1. Owner-approved company terminology (Baureinigung, Bauhelfer, concrete core drilling as **enquiry only**); verified service permissions and partner scope.
2. Versioned public copy only, with source SHA, glossary, coverage map, translation/reviewer stamps, plain content (no customer PII or CRM prompts). Respect scoped authorizations and GDPR.
3. At least all public routes, metadata, nav, planner, quote forms, Assistant texts, account sign-in and all errors covered. No API enum or stored business data translation.
4. Native-language review; RTL mobile 320/390, desktop, keyboard, screen readers, text expansion, 200% zoom and synthetic submission/security test.
5. Publish explicit locale route + reciprocal hreflang + locale sitemap only after tests, owner approval and release receipt.
6. Progressive release in batches; no 99x fanout build while VPS disk is at ~95%. Observe baseline p95/Web Vitals before optimization.
7. Verify quota, price, privacy/DPA and owner's approval before using any external AI or translation service; budget cap initially EUR0.

## Owner sign-in
Known URLs: `/login/?return_to=%2Fstudio%2F`, `/studio/`, `/crm/`, `/postfach/`, `/konto/`. On VPS before this branch: `/healthz` returned 200, `/readyz` 503 (real owner enrollment still needed). DO NOT enroll a public company address or developer by guessing owner identity; provision only after explicit authorized owner email and unique secret supplied over protected stdin. Until then test authentication/Studio publish in an isolated disposable DB with synthetic owner, never live customer data.

**Status:** language inventory/UI candidate; 4 live translations, 95 pending; real owner sign-in pending, no live deployment by this branch. Budget for external translation EUR0. Separate KNABA memory, roadmap and backlog are authoritative.


## Exact-source QA + performance checkpoint
- Base live/source `fe78624f4263d5f410b9fa29a2329c8ac19a6a74`; optimized executable source SHA `b1ef6e9a51b6ee6163fe12fd058d90cb5da5f65e`; independent regression test appended at `8a7d5c926d435ea69fcde5ba6b657fed1a41c587`.
- Docker Node24.22.1, pinned npm dependencies, non-production isolated clone: typecheck Astro/Vue/Svelte 0 errors/warnings; 121/121 Vitest, 8/8 inquiry Node, 14/14 VPS Node, 99 built Astro HTML routes; static verifier PASS. Last test-only commit: VPS HTTP server suite 2/2 PASS.
- `dist/client` build verification SHA256 `f7d49a5df28494fa06a6917ff6452120e97b7fe7ca4c14342ad92856622eb69d`.
- HTTP `GET /languages.json` served by synthetic local VPS test, `targets=99`, `published=4`, `pending=95`. Base 99-page release kept immutable; no current live domain deployment of this branch.
- Baseline `index.html`: 33,975 B raw, 6,297 B gzip; rejected eager I18N menu: 63,783 B raw, 10,299 B gzip; optimized lazy menu: 37,644 B raw, 7,786 B gzip. Incremental HTML cost vs base: +1,489 B gzip; compared to eager version: −2,513 B gzip. No field/Web Vitals metrics measured. Lazy list only fetched after opening language details and explicitly handles failed fetch, cached static manifest, textContent escaping, origin-only fetch, RTL labels and 4-language no-JS fallback.
- Status: full 99-language localization NOT_DONE; only target registry is ready. Browser input simulation, live owner, device QA, independent reviewer and public deployment remain gated.
