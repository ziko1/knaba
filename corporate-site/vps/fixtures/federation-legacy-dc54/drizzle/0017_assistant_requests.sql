-- Explicit guest-approved conversion reuses cleaning_requests and its ERP outbox.
-- The deferred request FK lets the capability-fenced origin be inserted first:
-- either the complete request/audit/outbox batch commits, or no origin survives.
CREATE TABLE assistant_request_links (
  request_id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consent_fields_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES cleaning_requests(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (conversation_id) REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  CONSTRAINT assistant_request_consent_version CHECK (length(consent_version) BETWEEN 1 AND 100),
  CONSTRAINT assistant_request_consent_fields CHECK (json_valid(consent_fields_json) AND json_type(consent_fields_json)='array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX assistant_request_retry ON assistant_request_links(conversation_id,request_key);
--> statement-breakpoint
CREATE INDEX assistant_request_conversation_page ON assistant_request_links(conversation_id,created_at,request_id);
--> statement-breakpoint
CREATE TRIGGER assistant_request_origin_immutable
BEFORE UPDATE ON assistant_request_links
BEGIN
  SELECT RAISE(ABORT,'Assistant request origin and consent are immutable');
END;
