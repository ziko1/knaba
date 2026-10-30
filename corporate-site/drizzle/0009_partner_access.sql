-- 0009: preserve existing invitations and pending requests while adding partner as an owner-assignable role.
-- SQLite/D1 cannot ALTER a CHECK constraint; rebuild BOTH bounded tables in one migration transaction.
CREATE TABLE vps_account_invites_partner (
  token_hash TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  requested_role TEXT NOT NULL CHECK (requested_role IN ('client','worker','partner')),
  issued_by TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER DEFAULT NULL,
  used_by TEXT DEFAULT NULL,
  CHECK (expires_at > issued_at),
  CHECK (used_at IS NULL OR used_at >= issued_at)
);
--> statement-breakpoint
INSERT INTO vps_account_invites_partner
 SELECT * FROM vps_account_invites;
--> statement-breakpoint
DROP TABLE vps_account_invites;
--> statement-breakpoint
ALTER TABLE vps_account_invites_partner RENAME TO vps_account_invites;
--> statement-breakpoint
CREATE INDEX vps_account_invites_issuer_time ON vps_account_invites(issued_by,issued_at);
--> statement-breakpoint
CREATE INDEX vps_account_invites_email_open ON vps_account_invites(email,used_at);
--> statement-breakpoint
CREATE TABLE vps_access_requests_partner (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  intent TEXT NOT NULL CHECK (intent IN ('client','worker','partner')),
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
INSERT INTO vps_access_requests_partner
 SELECT * FROM vps_access_requests;
--> statement-breakpoint
DROP TABLE vps_access_requests;
--> statement-breakpoint
ALTER TABLE vps_access_requests_partner RENAME TO vps_access_requests;
--> statement-breakpoint
CREATE INDEX vps_access_requests_owner_queue ON vps_access_requests(status,created_at);
--> statement-breakpoint
CREATE INDEX vps_access_requests_email_status ON vps_access_requests(email,status);
