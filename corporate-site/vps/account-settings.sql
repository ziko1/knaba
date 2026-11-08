-- VPS-only account preferences and one-use credential capabilities.
-- Additive migration 002; consent migration 001 remains unchanged.
CREATE TABLE IF NOT EXISTS vps_account_settings (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES vps_users(id) ON DELETE CASCADE,
 name TEXT NOT NULL DEFAULT '',
 phone TEXT NOT NULL DEFAULT '',
 company TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '',
 locale TEXT NOT NULL DEFAULT 'de' CHECK(locale IN ('de','en','pl','lt','ru','uk')),
 time_zone TEXT NOT NULL DEFAULT 'Europe/Berlin',
 version INTEGER NOT NULL CHECK(version>=1),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vps_account_tokens (
 token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64),
 kind TEXT NOT NULL CHECK(kind IN ('password_reset','email_change')),
 user_id TEXT NOT NULL REFERENCES vps_users(id) ON DELETE CASCADE,
 previous_email TEXT NOT NULL COLLATE NOCASE,
 target_email TEXT NOT NULL COLLATE NOCASE,
 credential_hash TEXT NOT NULL CHECK(length(credential_hash)=64),
 session_hash TEXT REFERENCES vps_sessions(token_hash) ON DELETE CASCADE,
 issued_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>issued_at AND expires_at<=issued_at+1800),
 delivery_state TEXT NOT NULL CHECK(delivery_state IN ('pending','sending','accepted','unknown')),
 CHECK((kind='password_reset' AND session_hash IS NULL) OR (kind='email_change' AND session_hash IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS vps_account_tokens_user ON vps_account_tokens(user_id,kind);
CREATE INDEX IF NOT EXISTS vps_account_tokens_expiry ON vps_account_tokens(expires_at);
CREATE TRIGGER IF NOT EXISTS vps_account_tokens_user_revoke
AFTER UPDATE OF email,salt,password_hash,disabled ON vps_users
WHEN NEW.email IS NOT OLD.email OR NEW.salt IS NOT OLD.salt OR
 NEW.password_hash IS NOT OLD.password_hash OR NEW.disabled IS NOT OLD.disabled
BEGIN DELETE FROM vps_account_tokens WHERE user_id=OLD.id; END;
CREATE TRIGGER IF NOT EXISTS vps_account_tokens_profile_revoke
AFTER UPDATE OF email,role,status ON profiles
WHEN NEW.email IS NOT OLD.email OR NEW.role IS NOT OLD.role OR NEW.status IS NOT OLD.status
BEGIN DELETE FROM vps_account_tokens WHERE user_id=OLD.id; END;
CREATE TRIGGER IF NOT EXISTS vps_account_tokens_profile_delete AFTER DELETE ON profiles
BEGIN DELETE FROM vps_account_tokens WHERE user_id=OLD.id; END;
