-- KNABA 0010. Private owner profile is not public company copy or login authority.
-- The one true login owner identity remains the protected OWNER_EMAIL configuration.
CREATE TABLE IF NOT EXISTS vps_owner_details (
  owner_id TEXT PRIMARY KEY NOT NULL REFERENCES vps_users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  company_phone TEXT NOT NULL DEFAULT '',
  company_address TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>=1),
  updated_at TEXT NOT NULL
);
