# KNABA Owner Invite · Scoped Port 2026-10-26

**Source-only, disabled for real customers until reviewed deployment and owner identity proof.** Stacked on KNABA Draft PR #97, not main or production. This restores the proven owner invitation primitive from Draft PR #87, without importing its older public page/ERP database schema.

- Preserved current `0005_public_reviews.sql` exactly. Added new forward-only `0006_owner_invite.sql` and a chained schema snapshot based on the current public review snapshot; historical SQL 0000–0005 is untouched. Existing VPS migration ledger must be inventoried and independently backed up before any application. A historical deployed `0005_owner_invite` remains a **hard HOLD** pending manual reconciliation.
- Reused `vps/owner-invite.mjs` core from PR #87: 256-bit token, SHA256 stored only, 2h expiry, one-time activation, confirmed password, explicit operator attestation, transaction rollback on failure, invalidation of previous invitation.
- Source-only routes/CLI must keep all current `/login/` and `/logout/` behavior. Public activation must not reveal the configured owner email. Token must appear in URL fragment only and be removed from history; no token in query, Referer, server log, GitHub or chat.
- Operator CLI `invite-owner` requires an existing migrated DB, verified `OWNER_EMAIL`, exact approved KNABA HTTPS origin, and writes a mode 0600 private file under the private DB state directory. Output to stdout contains only non-secret private file path and expiry metadata. **No email/SMS dispatch.**
- Worktree recovery PR #95 (`AuthHub`, worker invitation and optional OTP/OIDC) contains an incomplete frontend and missing CSS/dependencies, so it is **not** silently activated or pasted over the newer site. No account registration/worker invitation is live in this source-only increment.
- A normal CLI call alone is not authorization to impersonate KNABA owner; verified company approval and private delivery are external gates. The existing admin/site role APIs remain authoritative, with no browser-derived privileges.
- Gate: Node24 source tests, unique migrations + journal, one-use/expiry/replay, wrong-Origin and GET no-store HTTP, preservation of existing users and reviews, root source proof. Full site compile/ERP SQL/browser and off-host backup remain release HOLD until actually executed.

Original KNABA canonical `AGENTS.md`, memory, roadmap, V3/V4 and the PR97 source manifest are preserved. No existing files are deleted.
