ALTER TABLE `assistant_conversations` ADD `token_expires_at` text;--> statement-breakpoint
ALTER TABLE `assistant_conversations` ADD `token_revoked_at` text;--> statement-breakpoint
-- A fixed seven-day lifetime is the implementation policy. Do not renew on migration.
-- Existing writers used Date.toISOString(); noncanonical/invalid legacy dates fail closed.
UPDATE `assistant_conversations`
SET `token_expires_at` = CASE
  WHEN strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) = `created_at`
  THEN strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`, '+7 days')
  ELSE NULL
END;--> statement-breakpoint
CREATE TRIGGER `assistant_capability_expiry_immutable`
BEFORE UPDATE OF `created_at`, `token_expires_at` ON `assistant_conversations`
WHEN NEW.`created_at` IS NOT OLD.`created_at`
  OR NEW.`token_expires_at` IS NOT OLD.`token_expires_at`
BEGIN
  SELECT RAISE(ABORT, 'assistant_capability_expiry_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `assistant_capability_revocation_immutable`
BEFORE UPDATE OF `token_revoked_at` ON `assistant_conversations`
WHEN OLD.`token_revoked_at` IS NOT NULL
  AND NEW.`token_revoked_at` IS NOT OLD.`token_revoked_at`
BEGIN
  SELECT RAISE(ABORT, 'assistant_capability_revocation_immutable');
END;
