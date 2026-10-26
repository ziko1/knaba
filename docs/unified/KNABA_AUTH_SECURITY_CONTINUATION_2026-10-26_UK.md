# KNABA Auth backend — security continuation, 2026-10-26

Status: SOURCE QA / Draft PR #107, not deployed or merged.
Exact prior HEAD: a7a6a1cbef9c96837eda7dee008c98be182543b2. Original ERP code and migration SQL unchanged.

## Verified state and reuse
Existing Node VPS login, scrypt credential store, HttpOnly same-site sessions, owner invitation, client/worker pending roles and owner approval reused. Current corporate-site/Worker/ERP run as separate deployable systems; cross-system subject/tenant membership NOT integrated. No second identity stack created.

## Implemented
- Added durable fallback budget 60 login attempts per 15 minutes for the source TCP address, beyond existing 5 attempts/email+source, reusing vps_login_limits. A rate limit keyed by a shared Traefik proxy IP may aggregate ALL end users and is NOT per real visitor. Do not trust unvalidated X-Forwarded/CF headers. Proxy IP provenance and realistic load acceptance before public rollout remain P0.
- Owner can explicitly revoke unused account invitations: revokeAccountInvite validates authenticated owner issuer+email, exact recipient and unexpired state, consumes token atomically and adds a privacy-bounded audit. POST /invite-user/revoke/ requires owner cookie, Origin/CSRF, strict fields and bounded body; integrated a compact revoke form on existing owner invite page.
- GET/POST /account/password/ allows a signed-in user to rotate their own credential only after presenting the current one. Salted scrypt, 16–256 char new secret and confirmation, limiter 5/15min, SQLite compare-and-swap + deletion of ALL old sessions + audit atomic. Existing Portal UI adds a localised DE/EN/UK/RU entry; server form is German and requires no JS.
- New source-only implementation uses no SQL/schema migration, no new dependencies and no external provider calls. Existing 0000–0007 migration chain, ERP source and CMS/CRM/Assistant preserved.

## Red/Green TDD evidence
1. Password-spraying across different emails from one TCP source: observed RED (21st allowed), GREEN after limiter. Proxy-safe default 60 also RED (21st denied) then GREEN (60 permitted, 61st denied), independent source succeeds.
2. Invite revocation: unit RED missing method then GREEN, real local HTTP RED 405 then GREEN 200, worker 403, invalid Origin 403, unknown fields 422, token marked consumed.
3. Password rotation: unit RED missing method then GREEN, both old sessions revoked and new credential usable; negative existing-secret mismatch preserves session. Authenticated HTTP GET route RED 404 then GREEN 200.
4. Creation of extra full HTTP POST credential-change integration test blocked by external tool safety gate; such black-box POST result is NOT_RUN/NOT VERIFIED, regardless of other passing tests.

## Verified local Node24.22.1 synthetic QA
- KNABA_RELEASE_MODE=vsp npm run test:vps: 59/59 PASS.
- Corporate site npm test: 256 Vitest + 32+27+9 native Node PASS.
- npm run check: 0 errors / 0 warnings / 4 existing hints.
- KNABA_RELEASE_MODE=vsp npm run build: exit 0, 130 pages.
- KNABA_RELEASE_MODE=vsp npm run verify:build: PASS.
- Root npm test: 25/25 PASS. All results are local source checks, NOT live release receipts.

## External and release HOLD
- Resend read-only lookup: NO verified KNABA sender. Only a different project's partially failed sender is connected; do not use it for this company. No real emails, OTP, SMS, OAuth or paid API used.
- Public self-service email sign-up, forgotten-password recovery without signed-in session, partner registration, email/OIDC claims and real mail provider authorization remain OPEN.
- Real owner identity/UAT, source-bound independent code/security review, trusted proxy config, live backup/restore and DB ledger review, GDPR/legal sender rights, browser/mobile/a11y, true PostgreSQL-ERP scoped identity bridge, staging deployment and product release remain NOT_RUN.
- No main merge, production deploy, real data migration or destructive cleanup. Before rollout verify backups, CAS/current artifact, rollback and obtain specific release authorization. If no deployment, revert the Draft changes only.
