-- VPS ONLY: opt-in schema for Google OAuth, not Cloudflare D1.
-- Run via reviewed 'node vps/manage.mjs migrate-google-auth' AFTER verified SQLite backup.
CREATE TABLE IF NOT EXISTS vps_google_states (
  state_hash TEXT PRIMARY KEY NOT NULL,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS vps_google_states_expiry ON vps_google_states(expires_at);
CREATE TABLE IF NOT EXISTS vps_google_identities (
  google_sub TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES vps_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vps_google_only_users (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES vps_users(id) ON DELETE CASCADE
);
