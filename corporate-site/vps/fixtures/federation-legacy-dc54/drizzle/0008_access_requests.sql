-- KNABA VPS public request to ask the verified owner for a personal invitation.
-- Never provisions credentials, role, session or ERP membership.
-- No FK to Node-only vps_users: this migration is also portable to D1.
CREATE TABLE IF NOT EXISTS vps_access_requests (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  intent TEXT NOT NULL CHECK (intent IN ('client','worker')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','handled')),
  privacy_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT,
  CHECK (expires_at > created_at),
  CHECK ((status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
      OR (status = 'handled' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS vps_access_requests_owner_queue ON vps_access_requests(status,created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS vps_access_requests_email_status ON vps_access_requests(email,status);
