# KNABA preview: invitation-only developer registration

Scope: existing KNABA development host https://kneba.vsp.rest only. Reuse Node24/SQLite users/sessions/scrypt/CSRF, current login and portal/CRM/Studio permission checks. No separate app, hard-coded password, company-owner impersonation, production merge, official domain change or paid provider.

## Design and access control
- Privately configured KNABA_PREVIEW_OWNER_EMAIL is an *authorized developer* mailbox, distinct from the legal company OWNER_EMAIL. This preview-only owner privilege is limited to origin https://kneba.vsp.rest in both the Node proxy and the Worker. It is ineffective on knaba.de.
- Operator-only command: node vps/manage.mjs invite-preview, restricted to the exact KNABA development HTTPS origin, issues a 256-bit single-use capability valid 2 hours. The database stores SHA-256 only; a newer invitation invalidates the old one. Private delivery uses a URL *fragment*, not a query parameter, and never exposes a reusable password.
- GET /register/ serves no-store/noindex/unframeable first-party HTML with no account email or token in page source. Client code transfers fragment token to a hidden form input and removes the fragment from history.
- POST requires exact same Origin/Host, bounded URL-encoded fields, configured email, one-use token, 16–256 character matching password and attestation. Existing scrypt user creation and invite consumption are one SQLite transaction; 10 invalid attempts per 15 minutes per email/socket are bounded through the existing rate-limit table.
- Registration never auto-logs in. Existing /login/ and /logout/ manage HttpOnly/Secure/SameSite=Strict sessions and revocation. API identity headers from incoming callers are never trusted.
- The real legal owner account and /readyz stay separate and are not falsely activated by the developer registration.
- Future handover removes the preview developer allowlist, invalidates its sessions and reviews dependent data before any separately requested deletion. No auto-deletion of business data.

## Migration and QA
- Reused the existing PR #58 one-time owner-invite implementation. Existing applied 0005_public_reviews.sql is untouched; added unique forward-only 0006_owner_invite.sql plus the Drizzle migration journal entry. Never apply the conflicting 0005_owner_invite.sql from PR #58 or 0005 lead bridge from PR #67 without migration reconciliation.
- TDD: route 404->200; missing request throttle 401->429. Isolated Node24 build/check/test/static verification PASS; 187 Vitest, 27 Node frontend-related, 31 VPS tests PASS, including invite issue/reissue/expiry/replay, CSRF, identity spoofing, legal-owner isolation, scoped preview authorization and restored login sessions. Built artifact cannot be treated as live browser/device PASS.
- Source parent fdec2549890dde9cd07ec70a6b96b2e88c8fdc10; live manifest can advance independently and must be checked again before rollout. Existing changing active i18n checkout is not modified.
- Blocking gate: disk at ~96% and <10 GiB available, so inspectStorage().cutoverAllowed=false. No deployment, live migration, invitation issue, customer record mutation or account creation occurred on this candidate.

## Safe rollout and rollback when gates clear
1. Verify off-host branch push, exact current live source/runtime SHA, independent diff/security review, disk healthy (<90% used and >=10 GiB free) and immutable rollback identity.
2. Backup SQLite with its WAL correctly, verify checksums and disposable restore, preserve current config and state. Confirm additive migration checksum and Drizzle journal, then apply only 0006.
3. Stage a source-pinned Node24 build, switch the existing runtime atomically (not a parallel site), verify health/static routes and owner separation.
4. Set only the developer email in protected site.env (0600). Generate one invitation with operator-only CLI and privately deliver it to the authorized developer mailbox; never expose token through Git/CI/public URLs/logs.
5. Developer registers their own password, signs in, and checks Studio/CRM/admin; perform live TLS, mobile, browser, access-policy UAT. Email send acceptance alone is not proof of mailbox claim.
6. On regression restore prior immutable runtime/config; migration is additive, do not drop tables or delete data.

Status: source-only candidate; preview live deployment, real mailbox claim, independent security review and actual browser UAT remain pending.
