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


## Final executed result — 2026-10-30T21:07:45.039339+00:00

**TESTING_DEPLOYED / PRODUCTION_NOT_UPDATED.** Exact reviewed source: `2b4190591463d748533b073f2377d1716035bef8`; Git tree `00eaeff360ac3030b5c9c0e0cb5287f5cb3cf856`. The official public-source catalog was regenerated for `knaba.de`; the only catalog content changes are the official hostname and guide source URLs. Source code is in [draft PR119](https://github.com/ziko1/knaba/pull/119).

Final physical-server verification on Node24.22.1: check PASS (0 errors, 9 existing hints), 499 Vitest +86 site Node +137 VPS +28 root tests PASS (**750 total**), source provenance/clean tree PASS, official build and all build/i18n gates PASS. Seven compiled HTTPS/SQLite scenario groups covering nine identities PASS. Full receipt: [verification-and-deployment.json](verification-and-deployment.json). Browser/mobile/keyboard acceptance stays BLOCKED/NOT_RUN, never inferred from these tests.

Public assets: 160 pages, JS gzip225192 B <225280, CSS gzip40958 B <40960. Budgets were not raised. The earlier local intermediate-output issue did not reproduce on the physical server; final artifact contains no public `.prerender` directory. No packaging hook was introduced.

Immutable full runtime artifact: `198400c15ae399f2e28445c47e12be7534a15c2bfd3366ab66ffd034e3767af3`, 433 files/7556356 B. This is the controller artifact identity, distinct from the static-client hash in the build receipt. It was staged and activated only in testing through the installed controller. Schema equality verified; pre-activation SQLite online backup integrity `ok`, foreign-key errors0. Previous testing artifact `0d544250e45917a78e9b2a981ed09b898aaad039d602144915c56c349c94c531` remains available for code rollback; activation preserves the testing database.

After activation: testing health200, readiness503 because a testing operator has not yet been activated (unchanged from before deployment), anonymous gateway401/noindex. Protected dashboard/recipient APIs deny anonymous access401. Production artifact/configuration stayed unchanged; production health/readiness200. No production approval receipt was fabricated, no live customer records were used for tests, no main merge or paid provider activation occurred.

Next steps for completion: authenticate the private testing environment, activate its separately verified operator and execute the role/mobile/keyboard browser cases; obtain genuine customer confirmation for artifact `198400c15ae399f2e28445c47e12be7534a15c2bfd3366ab66ffd034e3767af3` and the current production/configuration identified above, then use normal production activation and final live acceptance. The user's instruction already supplies user authorization. This candidate is not represented as fully accepted production.


## Release continuation — 31 October 2026 (Europe/Berlin)

The renewed user instruction authorizes deployment; do not ask for user approval again. Fresh physical-host status confirms TEST runtime `198400c15ae399f2e28445c47e12be7534a15c2bfd3366ab66ffd034e3767af3` and unchanged production `71fd88c71f67e13f81ecacb5340b1b19eebcdb90bd35217efc75cc42bf20b383`. Source remains `2b4190591463d748533b073f2377d1716035bef8`; this update changes documentation only. Seven compiled HTTPS/SQLite scenario groups for nine synthetic identities passed again on Node22.23.4 (supplemental compatibility check, not a rerun of the prior Node24/750-test receipt). Fresh production backup has integrity ok and zero foreign-key errors. Independent reviewer `/root/release_review` verified manifests, all 24 unchanged schema files and code-only recovery; no new critical source blocker found.

Production health/readiness200 and public login rendering verified; TEST health200/readiness503 still requires owner enrollment. Cloud browser again reaches Cloudflare Access email-code login. Customer confirmation is not present in the checked PR119 email thread or in an unused matching server receipt. Production activation and role/mobile/keyboard browser acceptance are NOT_RUN/BLOCKED, not PASS. Complete the existing operator/Access onboarding, browser acceptance and genuine exact-artifact customer confirmation before normal activation. No production code/configuration/account/DNS changes or provider activation. Full fresh packet: `docs/evidence/complete-cabinets-20261030/release-continuation-20261031.md`.

Cloudflare Access browserAuth request was rejected by automatic approval review before any user prompt/code request because a specific email-account sign-in grant was not established. No workaround attempted. The next browser action requires user approval for tracker.gigamax@gmail.com; this is distinct from the already authorized deployment and from separate customer release confirmation.
