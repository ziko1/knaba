# KNABA unified login and registration — October 25, 2026

## Reuse-first implementation
Astro ClientRouter is the navigation owner. All first-party internal pages use the same tab; no document reload for the login-to-registration transition. Public unversioned HTML is served with no-cache, private account pages with no-store and noindex; content-hashed /_astro scripts and CSS remain immutable. After deployment, the HTML points to the new fingerprinted bundle.

The responsive first-party Astro/Solid AuthHub has DE, EN, UK, RU and mobile roles: new client, invited worker, business partner. The legacy HTML POST login still exists for no-JavaScript users. The modern login/logout uses verified same-origin JSON and the existing HttpOnly cookie/session; no second auth identity.

## Backend safety
Only a validated, verified email creates an account. A code of eight digits expires in ten minutes and is stored hashed with HMAC under a private server pepper. Wrong guesses are capped at five; replay and concurrent invitation reuse are prevented transactionally. Passwords use existing salted scrypt, never plaintext email or SMS.

Workers need a 24-character manager-issued invitation, one-time, seven days, then await owner approval. Partners include company name, remain pending, and only later receive customer-style scoped request access; their role never inherits admin access. New users cannot register an owner/admin role. Signup limits: three per email/hour, 30 globally/hour, 100 globally/day; manager staff-invites at most 20/day and 500 active.

Schemas live in optional VPS SQL files, outside historical numbered D1 migrations. Commands require explicit approval flags, independent backup, integrity check, SHA256 and no silent live migration.

## OAuth, email and verification scope
Google OIDC code reuses KNABA PR63 verified JWT/JWKS, PKCE, nonce, one-use state and protected provider subject. It remains off unless Google Cloud credentials, reviewed optional schema and a private env flag exist. Facebook, Apple, Microsoft and phone SMS are NOT FUNCTIONAL: no approved identities/providers or pricing. Never create fake social login buttons. Google name/avatar import, employee/partner OAuth registration and safe password-account linking remain separate tasks; email identity alone never upgrades privileges.

Resend account discovery returned only an unrelated, partially failed sender domain, not a verified KNABA sender; therefore new email OTP dispatch remains disabled. Do not send KNABA emails from the unrelated domain. USER_EMAIL signup, real owner enrollment, provider authorization and payment/data-processing approval require future explicit gates. Passwords are not sent by SMS or email.

## Release
Use latest KNABA preview live SHA, not public default GitHub branch. Keep private source tree and customer backups off public GitHub. Verify Node24 typecheck, all tests, local SQLite HTTP, synthetic browser 320/390/768/1440, static artifact integrity, noindex/sitemap exclusion, release locks, healthy storage, backup/rollback and live preview HTTPS. Official knaba.de and GitHub main stay unchanged. Product READY is blocked until actual owner onboarding and live provider QA.
