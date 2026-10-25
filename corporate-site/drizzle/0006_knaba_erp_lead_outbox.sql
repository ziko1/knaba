-- KNABA site -> ERP source-only bridge.
-- No credentials, no automatic transfers, no duplication of customer PII.
-- A mutable lead remains in cleaning_requests; only a reference and digest live here.
CREATE TABLE site_erp_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE REFERENCES cleaning_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'lead.upsert' CHECK (kind='lead.upsert'),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','LEASED','APPLIED','REVIEW','BLOCKED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts>=0 AND attempts<=8),
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  envelope_sha256 TEXT CHECK (envelope_sha256 IS NULL OR (length(envelope_sha256)=64 AND envelope_sha256 NOT GLOB '*[^0-9a-f]*')),
  last_error TEXT NOT NULL DEFAULT '',
  last_http_status INTEGER,
  erp_effect_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
--> statement-breakpoint
CREATE INDEX site_erp_outbox_due ON site_erp_outbox (status,next_attempt_at,lease_until);
