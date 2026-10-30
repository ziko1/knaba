# Complete web cabinets — 30 October 2026

## Scope and source

User requested completion of the existing role cabinets and deployment to the physical KNABA server. Branch `feat/knaba-complete-cabinets-20261030`, base `045fc00e6e9b5a069416285f619e5cdc202778d8`. Final source, artifact and server receipts are appended after execution. This change does not certify ERP, native applications or external-provider delivery.

- Client/partner: own requests, persistent request history, loss-safe retry and request-linked conversations.
- Worker/Bauleiter: assigned work, upcoming/overdue agenda, workflow/checklist, contextual conversations.
- Owner/admin: scoped pagination and totals, searchable people/recipients, assignments and persistent messaging.
- Existing owner-only role administration and isolated developer workspace remain server-authorized.
- Request/profile/thread pagination retains current identity/role/assignment guards on every page. Invalid dates and concurrent identity changes fail closed. No schema/dependency changes.

## Verification

Independent source reviewers `cabinet_backend` and `cabinet_release_audit` found no outstanding correctness/security blocker in their reviewed changes. The recipient-retry finding was fixed. Frozen request retries, stale-page rejection, whole-window revalidation and keyed editor preservation received independent source review. Source review is not browser acceptance.

Final Node24 check, full site/root/VPS suites, official build/budgets/i18n and compiled HTTPS/SQLite acceptance are required on the final source. `tests/cabinets-http.mjs` uses only disposable synthetic accounts/data and covers nine password-authenticated roles, request deduplication/isolation, assignment, invalid dates, two-way chat, completion/checklist and feedback. Final counts and hashes are recorded in receipts, not inferred from prior deployments.

Browser acceptance is **BLOCKED**, not PASS: local Chromium skipped after the known policy block; no usable installed WebKit/Firefox. The existing server QA Chromium image also reported no usable sandbox. Private cloud-browser QA stops at Cloudflare Access authentication. No policy/security gate was bypassed, no browser installed and no paid provider activated. Added browser scenarios remain NOT_RUN.

## Deployment boundary

Production before this task: `71fd88c71f67e13f81ecacb5340b1b19eebcdb90bd35217efc75cc42bf20b383`; configuration `b660fd7b8b7cc9df3ef6bb255cdec8d63de06a71c02a64cb565c58dbd7b2488e`. Testing before this task: `0d544250e45917a78e9b2a981ed09b898aaad039d602144915c56c349c94c531`. Production health/readiness200; testing health200/readiness503 (operator onboarding missing); testing gateway anonymous401/noindex.

The authorized server controller `/srv/knaba/customer/ops/knabactl.py` (SHA256 `0c08f9e3a426adb15fd8fce9504d8128ffa7cbaec29ef9e10260f074672c7202`) requires a genuine user AND customer confirmation bound to candidate/current/configuration before production activation. The user's current deployment request supplies user authorization, but no fresh candidate-specific customer confirmation was supplied. Do not fabricate approval or reuse an expired receipt.

Stage an immutable artifact; testing activation uses a verified online backup and schema equality check. Controller failure rollback switches code back without restoring/deleting state. A later rollback is a separate controller activation of the preserved previous artifact; production still requires its matching approval. New browser acceptance and customer confirmation remain required before production promotion.
