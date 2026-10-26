# KnaBa: source assembly evidence

**Date:** 2026-10-24. **Release status:** NOT_READY. **Scope:** Git tree source import, no running server/database migration or production action.

## Provenance
- Web/RU/public assistant original commit: `db6c514c52d038b6491aa101bca6cd5fa76cc102`; `corporate-site` tree `6ce56eb811af9733ce9b0b08dab3b636dfaf6371`.
- ERP deployment candidate original commit: `35b687c400d423966742bac9f1e503032794dbf1`; complete ERP commit tree `a242ddb1a8b6395cafbc3cacbc0ce510f0be3c43`.
- In integration candidate `erp/` is a direct Git **tree reference**, not a rewritten copy. Inner `erp/AGENTS.md`, target specs, test evidence, workflow files and native sources remain byte-for-byte identical. `corporate-site/` remains unchanged.
- The GitHub feature branch is distinct from `main`, `knaba-staging`, and the existing Draft PRs. No PR merged, no base ref force-pushed.

## Expected verification, no false claims
`node scripts/verify-snapshot.mjs` checks both HEAD tree hashes, worktree status, canonical files and root package. Expected PASS confirms **only source preservation**. Fresh Node24, PostgreSQL, D1, browser, native and deploy/UAT checks are NOT_RUN on this assembled tree. Historic tests remain pinned to their original executable SHAs. No new paid service activated.
Previous `docs/unified/PROJECT_MEMORY.md` plan describes ERP paths by their original root-relative names. In the assembled workspace those paths are `erp/apps/`, `erp/packages/`, `erp/docs/`. Do not mistake prefixing for contract completion.

## Why not an automatic cross-branch merge
PR #2/#3 are a different business/UI history from #4–#7/deploy; merging one over the other blindly can regress concurrency, permissions, and V4 requirements. Source assembly retains both via Git refs and branch audit, imports the more recent deploy candidate as a non-destructive separate unit, and leaves semantic reconciliation for focused tests.
