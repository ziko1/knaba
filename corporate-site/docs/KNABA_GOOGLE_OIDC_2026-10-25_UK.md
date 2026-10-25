# KNABA Google OIDC — source candidate / disabled by default (2026-10-25)

## Relationship to existing project
- Separate from AVENQO; base is exact existing KnaBa PR #55 docs HEAD `9d78123ed407a239d858d83e16f6fc86a6ee4ee1`. Existing PR #52 first-party login, Studio Pro, local tenant/role gates, assistant and all public SEO UI retained.
- Executable Google OIDC candidate checked at source SHA **`2c9103e5df2478b27bcd11e2cf30807cc04c9270`**.
- Provider remains **OFF** in .env.example and absent on live VPS. No Google Cloud client was provisioned, no paid product activated, no secret generated/disclosed, and no real identity used.

## Implemented source design
- Web authorization-code with PKCE S256, 256-bit cryptographic state cookie (HttpOnly, SameSite=Lax, Secure in deployed TLS), 256-bit nonce, server-only short-lived state ledger. Atomic DELETE RETURNING consumption blocks state replay; no tokens stored.
- Google ID-token signature verification with pinned JWKS endpoint, RS256 restriction, `iss`, exact `aud`/`azp`, `exp`/`iat`, nonce, `email_verified`, immutable provider `sub`. All token exchange and key discovery use pinned Google HTTPS endpoints and 6.5-second timeouts.
- Maps Google `sub` to new stable user ID, stores only provider subject and verified email in additive VPS-only SQLite tables. No silent email-based linking to existing password accounts. New identity inherits **pending**, with company owner role disallowed and `kontakt@knaba.de` protected from speculative self-enrollment. If an operator later changes OWNER_EMAIL to match a Google-only account, the trusted identity headers are suppressed rather than elevated.
- Public provider status `GET /auth/providers.json` exposes only availability (never secrets); Google login button appears in four translated locales only after credentials + approved schema + explicit feature flag.
- Existing password login, session cookie, role approval UI, ERP, CRM, assistant, data and migrations remain unchanged. Separate `vps/manage.mjs migrate-google-auth` CLI includes SQLite backup SHA-256, schema checksum/integrity validation and requires **`KNABA_GOOGLE_SCHEMA_APPROVED=1`**. No implicit OAuth schema migration during server startup.

## Pinned source QA (synthetic-only)
- Node.js v24.22.1 verified against published SHASUMS, unprivileged RAM-based checkout.
- `node --test vps/google-oidc.test.mjs`: **5/5 PASS** (RS256, aud/nonce, state replay, PKCE, pending/owner block, provider fail-closed).
- `npm ci --ignore-scripts`, `npm run check`, `npm test`, `npm run build`, `npm run verify:build`: PASS. Astro/Vue/Svelte: **0 errors and 0 warnings**; 8 existing inquiry tests PASS. Build verifier artifact hash `aead6df3bca4f5a7baa269312370ae3c080cc5e9104ea659c858c03b8687f473`.
- `node --test vps/*.test.mjs`: **26/26 PASS**, including two synthetic full HTTP server callback tests. They verify an unconfigured provider returns unavailable, opt-in callback creates PENDING role, replay/mismatched state returns 401, and company contact email cannot become owner.
- Tests used synthetic RSA fixtures and a fake in-process HTTP transport. **No real Google token/owner session, live provider or company account** was used.
- All public SEO and PR55 UI code preserved in separate branch; actual browser regression on this new auth SHA and real mobile external Google redirect UAT remain **NOT_RUN**. PR55 code-only Chrome 60/60 + footer 32/32 tests belong to PR55 executable SHA, not this one.

## Safe activation process (not executed)
1. **Verify genuine KnaBa owner** out-of-band; agree access roles, GDPR/privacy disclosures and identity handling, e-mail validation and owner MFA. Owner account cannot be created from a public Google login or matching email alone.
2. In an owner-controlled Google Cloud project, create an OAuth 2.0 **Web application** with an exact redirect URI for the approved deployment domain: `https://kneba.vsp.rest/auth/google/callback` for preview, or a separately approved official host. Review Google's current policy and consent screen requirements; only `openid email profile` scopes are requested. Client secret must be stored in protected VPS env, not GitHub/client JS/Gmail/chat.
3. Ensure disk budget, independent snapshot + backup/restore rehearsal, test release exact SHA and replace/deploy only on owner approval. Invoke CLI `migrate-google-auth` with its explicit per-action approval variable only on reviewed backup, then set `KNABA_GOOGLE_LOGIN_ENABLED=1`, protected `KNABA_GOOGLE_CLIENT_ID` and `KNABA_GOOGLE_CLIENT_SECRET`. Restart only KnaBa service after reviewed plan and rollback.
4. Complete real provider Chrome/Android/iOS sign-in, email collision, wrong issuer/audience/nonce, token exchange timeout, CSRF replay, account approval, tenant/role isolation, signout and GDPR deletion, and legal/client UAT.
5. Owner Google account linking is **NOT YET SUPPORTED**. First enroll the verified owner with a private passphrase (never send password in email/chat), then build separately audited **session-authenticated owner account linking**. Do not bypass the owner gate via social email matching. Other providers (Apple, Microsoft, Facebook/GitHub) require provider-specific verified contracts and are future independent releases.

## External references
- Google OIDC: https://developers.google.com/identity/openid-connect/openid-connect
- Google OAuth web server: https://developers.google.com/identity/protocols/oauth2/web-server
- Verify ID token: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

**Verdict:** SOURCE_GATED_IDENTITY_FLOW_PASS / GOOGLE_LIVE_NOT_CONFIGURED / OWNER_NOT_PROVISIONED / NOT_DEPLOYED / NO_PRODUCTION_APPROVAL.

## Final source acceptance addendum (subsequent to the initial five-test checkpoint)

**Latest tested executable SHA**: `23a7623d95c2c2d17b94f76e0e2668988d4d3e54`.
An additional classic non-JavaScript login link was added for enabled providers only, with regression assertions that the link is absent when Google is disabled. No code after this source SHA was changed by the receipt commits.

Fresh unprivileged verified Node.js 24.22.1 test run:
- **24/24 Vitest files, 146/146 tests PASS**, inquiry 8/8 PASS.
- Astro/Vue/Svelte typechecks **0 errors, 0 warnings**; full build and static verifier PASS.
- **26/26 VPS tests PASS**, including Google OIDC/JWKS/PKCE/pending-account simulated callback and owner anti-escalation suites.
- Current static artifact verifier SHA256 `d4214e3a168145600171aa2c2fb89cc6819ad256eff7ccd50d2bd0f9f86cc1cb` applies only to this exact built artifact.
- Machine-readable receipt: `corporate-site/docs/evidence/knaba-google-oidc-qa-2026-10-25.json`.
- `git diff --check` for first source generation PASS; exact later code needs independent reviewer before any release.

**Note:** Parallel KnaBa PR #58 adds invitation-based owner enrollment on a different branch and touches related auth contracts. Do not merge/release the two without source-pinned conflict review and runtime QA. No owner invitation or provider activation was performed here.
