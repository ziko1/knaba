# KNABA Owner Email Enrollment — Implementation and Safe Handover

> **For agentic workers:** Execute the plan task by task, record exact SHA/backup, independently review security and do not invent an owner identity or credit balance.

**Goal:** Enable the authorized KNABA owner to claim Studio access using the address published on the business site, without sharing a reusable password through ChatGPT or email.

**Architecture:** Reuse the existing first-party VPS/SQLite login, owner role, cookie, CSRF and Studio APIs. Add one isolated migration holding SHA-256 hashes of one-use email invitations, an operator-only CLI for issuing them, and a first-party password-set page using a URL fragment to keep the invitation out of server URL logs. Keep existing accounts and sessions unchanged.

**Tech Stack:** Node.js 24, SQLite WAL, existing KNABA VPS server, Astro assets, native browser form and Playwright. No new third-party dependencies or email API keys.

## Global Constraints
- Project is KNABA, not AVENQO. Official business page publishes kontakt@knaba.de; inbox control is not automatically established by seeing a public contact address.
- The invitation grants zero access until the mailbox recipient opens the one-use 256-bit link, attests business authorization, and creates their own 16+ character passphrase over HTTPS.
- No working password or activation capability may be printed in chat, pasted in source files, included in CI evidence or sent as a reusable email password.
- Target is the development host kneba.vsp.rest; knaba.de official host/DNS remain untouched.
- Existing Studio/CRM access uses vps_users, ownerEmail scoped env, scrypt, HttpOnly SameSite cookies; no identity bypass.
- Do not perform live migration or deployment while active release provenance is unknown, independent security review is pending or storage warning is unresolved.
- Keep server-only secrets, company env settings and all backups intact.

---

### Task 1: One-use owner invitation data and CLI
**Files:** `drizzle/0006_owner_invite.sql`, `vps/owner-invite.mjs`, `vps/manage.mjs`, `vps/owner-invite.test.mjs`.
**Interfaces:** `issueOwnerInvite(db,email, {now}?)` returns a two-hour 256-bit bearer token once; DB stores only a hash. `activateOwnerInvite(db,{token,email,password,confirmed,attested,now})` performs a single SQLite transaction that inserts the actual owner only after successful validation. Operator-only `node vps/manage.mjs invite-owner` emits a one-use activation URL for authorized private mail dispatch.
- [x] Test RED for missing issuance and safe consume behavior; observe failure.
- [x] Implement hash-only storage, one-time use, latest-invite revocation, expiry, business-email binding and rollback-on-error; retest GREEN.
- [x] Test blocked foreign HTTPS origin and no user creation before claim; verify no old role/session tables modified.
- [ ] Independent review of mailbox ownership process and authorization policy.

### Task 2: First-party activation form with CSRF
**Files:** `vps/server.mjs`, `vps/owner-onboarding.test.mjs`, `tests/owner-activation-browser.cjs`.
**Interfaces:** GET `/activate-owner/` returns no-store/noindex/unframeable HTML; JS reads `#token=...` and immediately removes fragment. POST has same-origin CSRF check, bounded four-field form, password confirmation, attestation, an atomic token consume + owner creation, and 303 redirect to first-party login. No automatic admin session from GET.
- [x] HTTP RED: missing route 404; GREEN: landing 200, forbidden Origin 403, bad token 401, correct claim 303, replay blocked.
- [x] Browser RED: Referrer-Policy no-referrer produced Origin null and blocked a genuine POST. GREEN: same-origin policy preserves correct Origin without leaking URL fragments; real synthetic Chromium owner → Studio PASS.
- [x] 390 px Chromium screenshot/accessibility relevant live form check; no client exceptions and no horizontal overflow observed.
- [ ] Full independent OWASP review and physical-device UAT.

### Task 3: Production-safe preparation and communication
**Files:** `vps/manage.mjs`, existing `config/site.env` on the user's VPS, current Docker Compose and protected SQLite state. No new domain or email services.
- [x] Verified official website and code agree on intended business contact email; real owner user count=0 and configured OWNER_EMAIL is currently blank; /readyz=503.
- [x] Node24 isolated full source check, Vitest, 103 HTML build/static verifier, 21 VPS tests, browser synthetic claim/login.
- [ ] Resolve active VPS release code identity: latest live runtime SHA not yet retrievable as a GitHub commit; reconcile independent concurrent changes before integration.
- [ ] Review disk budget (~96–97% used), verify existing backup, rehearse migration on disposable real-data clone, maintain immutable release rollback. Do not disable storage release checks.
- [ ] After review, deploy only development-host code, backup & apply one additive migration 0005, set only OWNER_EMAIL=kontakt@knaba.de in root-protected KNABA site.env, verify /readyz remains 503 before mailbox claim.
- [ ] Issue exactly one two-hour invite through protected CLI; send once to verified business inbox using a connected authorized sender. Never put token in chat, source tree or logs.
- [ ] Authorized business inbox recipient sets their own password; verify /readyz=200, first-party login, Studio and CRM UAT, disabled/failed sign-in and post-claim email notification.
- [ ] Only after evidence, independent review and customer acceptance consider official launch. Email sending request success is not evidence of delivery or of recipient action.

## Unresolved release decisions
- Control of the public business inbox and whether it is a shared mailbox; owner role must be approved by a real company representative.
- Exact live release/repo SHA reconciliation and 90%-disk release gate.
- Whether to enable MFA/passkeys for the real owner login, recommended before final acceptance.
- Owner approval of the one-time invitation and real customer GDPR/backup/rollback acceptance.

**Local source status:** tests and browser synthetic user passed. Real owner is NOT provisioned and email-based invite cannot be considered delivered until verified on current deployment.

> Integration note (2026-10-26): This is the combined PR #58 + PR #67 candidate. The original PR #58 used 0005 before the assistant ERP bridge claimed that number; use 0006 here. Source-only; inspect migration ledger/backup before live use.
