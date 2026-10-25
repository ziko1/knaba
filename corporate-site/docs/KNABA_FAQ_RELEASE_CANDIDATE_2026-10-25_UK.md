# KnaBa — Construction FAQ release candidate (2026-10-25)

## Intent and scope
Extend the existing KnaBa construction-site marketing FAQ without replacing the unified CRM, Site Studio, assistant or legacy service IDs.

- Source branch: `feat/knaba-construction-faq-20261025`.
- Parent public candidate: `fix/knaba-ux-square-turnstile-20261025`, originally pinned at `89b1ad4fb22f665863196040ea9e696119fb0690`.
- PR: https://github.com/ziko1/knaba/pull/44 (DRAFT).
- Added `ConstructionFaq.astro` and `construction-faq.ts`.
- 42 question/answer records: 6 service-category groups × 7, fully translated in DE, EN, UK, RU (168 pairs).
- New routes: `/faq/`, `/en/faq/`, `/uk/faq/`, `/ru/faq/`.
- Homepage renders six compact question cards; all questions accessible on the category-filterable FAQ page. Footer, `site-i18n`, sitemap and static verifier updated.
- No fabricated quotes, licenses, subcontracting guarantees, pricing or confirmation of direct core-drilling execution.
- No changes to backend, database, session/auth, AI providers, paid services or existing service enums.

## Source-pinned verification

**Executable source tested:** `abec14b51cae7648253cdd13798e3e1d258de73b`.

**Environment:** SentinelX VSP host, isolated temporary RAM-backed Git clone and npm cache under `/dev/shm`, Node `v24.22.1` and npm `11.19.1`. Source HEAD checked against the expected commit. Temporary workspace removed on completion; public VPS deployment was NOT changed.

Commands and observed results:

1. `npm ci --no-audit --no-fund --prefer-offline` — **PASS**.
2. `npm run check` — **PASS**, 0 errors, 0 warnings, 4 informational TypeScript hints.
3. `npm test` — **PASS**, 129/129 Vitest and 8/8 Node enquiry tests.
4. `npm run build` — **PASS**, 103 generated pages (four more than the baseline 99).
5. `npm run verify:build` — **PASS**, generated pages, links, language metadata, sitemap/noindex and emitted asset budgets checked.

**Reported artifact SHA256**: `91226666d03a254087126edabd2532e620a2e5fa56122716a3e7c34cb05a5582`.

Initial run at source `d5cbf9233c916d26f0c7ae281962c9a6b4fa75e4` failed the build verifier only because the Russian page count was fixed at the former 30+1 and sitemap count at 68. Corrected the verifier to account for one new page per locale (31 public RU, 32 total RU, 72 indexed sitemap URLs). The complete suite was rerun at the exact source SHA above and all five steps completed with exit code 0.

**Source-level QA**: 42 distinct FAQ IDs, full 168 question/answer translations, scope-safe technical wording, native keyboard-accessible details, search/filter hooks, 4 routes and internal references verified by a second read from the remote branch.

## Remaining release gates

- **NOT_RUN**: real mobile browser/physical device, 200% zoom, keyboard/screen reader and FAQ filter behavior in a deployed browser.
- **NOT_RUN**: field performance or production Web Vitals.
- **NOT_DEPLOYED**: VPS test domain `https://kneba.vsp.rest/` continues to serve its prior release. Do not claim these four FAQ pages are live.
- **BLOCKED**: Current SentinelX host user `sentinelx` has no Docker socket permission nor write access to the guarded release symlink and Git worktrees. No sudo, bypass or elevated write was attempted.

After source review, allow an authorized release operator to deploy a reviewed build to the temporary test domain, retain the current release as rollback, smoke-test all four locales at 320/390px and desktop, including filtering, footer/assistant overlays, copy, navigation and form handoff. Confirm owner approval separately before any production/official-domain release.

## Risk, cost and rollback

- No new runtime dependencies; site FAQ is build-time content and minimal progressive enhancement.
- External paid API dispatch and service activation: **none**. VPS hosting spend/billing not measured.
- Indexing should remain gated by existing `KNABA_RELEASE_MODE` and VSP owner approval; creating public URLs must not automatically opt the temporary domain into search indexing.
- Roll back by switching an approved operator to the former validated VSP release; no database migration needed.
