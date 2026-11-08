-- VPS owner onboarding: one-use capability; no changes to users, sessions or historical data.
CREATE TABLE IF NOT EXISTS vps_owner_invites (
  token_hash TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER DEFAULT NULL,
  CHECK (expires_at > issued_at)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS vps_owner_invites_email ON vps_owner_invites(email,expires_at);
