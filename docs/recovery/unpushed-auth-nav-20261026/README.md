# KNABA local unpushed worktree recovery — 2026-10-26

**Status:** RECOVERED SOURCE SNAPSHOT / NOT INTEGRATED / NOT TESTED / NOT DEPLOYED.

- Local original checkout: `/srv/knaba/repos/knaba-auth-nav-20261025`.
- Local branch: `feat/knaba-auth-nav-safe-20261025`.
- Original local HEAD: `dadebaa564e553bfaaf398686de7e9e6276feaf7`, not found in remote GitHub commit API.
- Local `origin` references a separate VPS checkout, not GitHub. A detached recovery copy is stored on a new public-repository Draft branch to avoid data loss.
- Exact UTF-8 contents of 18 locally modified tracked code/docs/test files and 5 previously untracked source/docs files are stored in `snapshot/` preserving their relative original paths. Locally generated `corporate-site/docs/build-verification.json` and modified `.env.example` were deliberately excluded pending review. No database, secret, backups or customer data uploaded.
- **DO NOT copy the snapshot wholesale over the current KNABA site.** Its auth and backend changes predate newer published security fixes. Port only missing functionality file-by-file after source reconciliation.
- `AuthHub.tsx` refers to `../styles/auth-hub.css`, absent in the original local checkout. No complete registration acceptance, email/OIDC ownership, database migration or live role authorization is established.
- This save operation does not merge, deploy, enable registration, alter data or change the public main branch.

## Next gates

Review current Site Studio, CRM, Control Center and ERP source; reconcile the missing auth/nav implementation into the modular CMS; run Node24 checks and test with actual protected auth/session, CSRF, rate limits, OTP expiry/replay, role/tenant isolation, accessible 320/390/768/1440 UI, backup/rollback and genuine owner UAT. Keep paid email/Google/WhatsApp off until credentials and budget approval.
