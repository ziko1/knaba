-- Additive, human-delivered, owner-issued account invitations.
-- Never modifies existing users/profiles/roles. Not a public sign-up endpoint.
-- Source is shared by Cloudflare D1 and Node VPS; D1 has no vps_users table.
-- Thus enforce owner/user existence in VPS auth module, not cross-DB FKs.
CREATE TABLE IF NOT EXISTS vps_account_invites (
  token_hash TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  requested_role TEXT NOT NULL CHECK (requested_role IN ('client','worker')),
  issued_by TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER DEFAULT NULL,
  used_by TEXT DEFAULT NULL,
  CHECK (expires_at > issued_at),
  CHECK (used_at IS NULL OR used_at >= issued_at)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS vps_account_invites_issuer_time ON vps_account_invites(issued_by,issued_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS vps_account_invites_email_open ON vps_account_invites(email,used_at);
