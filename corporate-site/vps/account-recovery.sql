-- Additive VPS auth migration 002. No identity-link or ERP authority schema changes.
CREATE TABLE vps_account_tokens (
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
CREATE INDEX vps_account_tokens_user ON vps_account_tokens(user_id,kind);
CREATE INDEX vps_account_tokens_expiry ON vps_account_tokens(expires_at);
CREATE TRIGGER vps_account_tokens_user_revoke
AFTER UPDATE OF email,salt,password_hash,disabled ON vps_users
WHEN NEW.email IS NOT OLD.email OR NEW.salt IS NOT OLD.salt
  OR NEW.password_hash IS NOT OLD.password_hash OR NEW.disabled IS NOT OLD.disabled
BEGIN
  DELETE FROM vps_account_tokens WHERE user_id=OLD.id;
END;
CREATE TRIGGER vps_account_tokens_profile_revoke
AFTER UPDATE OF email,role,status ON profiles
WHEN NEW.email IS NOT OLD.email OR NEW.role IS NOT OLD.role OR NEW.status IS NOT OLD.status
BEGIN
  DELETE FROM vps_account_tokens WHERE user_id=OLD.id;
END;
CREATE TRIGGER vps_account_tokens_profile_delete
AFTER DELETE ON profiles
BEGIN
  -- Recreating a profile with the same initial version cannot revive a link.
  DELETE FROM vps_account_tokens WHERE user_id=OLD.id;
END;
