# KnaBa integration workspace rules

This is a **candidate integration branch** of the KnaBa project, NOT the production release. KnaBa and AVENQO are different projects.

## Canonical instructions and precedence
- For `erp/**`, first read and obey `erp/AGENTS.md`, `erp/KNABA_DE_TARGET_SPEC.md`, `erp/PROJECT_MEMORY.md`, `erp/MASTER_ROADMAP.md`, and `erp/docs/planning/DEVELOPMENT_BACKLOG.json`. The V4 target and preserved V3 requirements are NOT superseded by this wrapper.
- For `corporate-site/**`, read and obey `corporate-site/PROJECT_MEMORY.md`, `corporate-site/ROADMAP.md` and the existing UX, SEO, legal, translation, and security contracts.
- For cross-boundary features, read `docs/unified/PROJECT_MEMORY.md`, `docs/unified/INTEGRATION_CONTRACT.md`, and `docs/unified/BACKLOG.md`. Its proposed APIs are NOT implemented until tests and code prove them.
- Never treat old test receipts as acceptance of a new source SHA or an integrated application.

## Boundaries
- Existing code is imported byte-for-byte as immutable baseline under `erp/` and `corporate-site/`. The first integration verification checks Git tree identity, NOT behavior.
- Source of truth for operational jobs, money, employee records, orders and permissions remains ERP PostgreSQL; D1 is public intake data. A versioned, idempotent, scoped bridge must be implemented and verified before calling them unified at runtime.
- No refactor or moving executable files between projects without focused failing tests, measured baseline, independent review, rollback and a source-pinned evidence record.
- Default-deny tenant/company/site/customer authorization; no new secret in git; no PII in logs; never let AI authorize, set binding prices, modify payroll or activate GPS.
- Do not merge PRs into `main`, production-deploy, mutate live datasets, extend the expired staging cutoff, or activate paid providers without specific owner confirmation.
- A real owner-to-visitor message flow, email, WhatsApp Business integration, generative AI and company acceptance are NOT certified. Preserve disabled-by-default provider behavior and require verified actual quotas before paid calls.

## Verification
- Before beginning KNABA work, reconcile accessible authorized prior-chat requirements, the exact remote GitHub PR/HEAD, concurrent VPS worktrees and deployment, AGENTS/project memory/backlog and verified QA evidence. Reuse already implemented modules, avoid duplicate branches/PRs, and leave unverified external gates explicit.
Run `node scripts/verify-snapshot.mjs` on Node24 to verify the immutable historical import anchor and a clean, committed current source. Committed ERP/site changes are reported as `FEATURE CHANGE`, never mislabeled as identical imports or accepted runtime. Do not update historical hashes to bless new work. Run `npm test` for root source/release policy regressions; then run module tests **within the appropriate directory** using engines described by their own `package.json`. Only report test PASS from actual complete output at exact SHA. Use PASS/FAIL/NOT_RUN/BLOCKED labels, artifact hashes, and rollback.
