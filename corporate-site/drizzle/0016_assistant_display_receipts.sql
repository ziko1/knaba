ALTER TABLE `assistant_messages` ADD `guest_displayed_at` text;--> statement-breakpoint
-- Historical messages remain unconfirmed. A receipt describes client-reported display only.
CREATE TRIGGER `assistant_display_receipt_insert_guard`
BEFORE INSERT ON `assistant_messages`
WHEN NEW.`guest_displayed_at` IS NOT NULL
  AND (NEW.`sender` != 'owner'
    OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`guest_displayed_at`) IS NOT NEW.`guest_displayed_at`)
BEGIN
  SELECT RAISE(ABORT, 'assistant_display_receipt_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `assistant_display_receipt_update_guard`
BEFORE UPDATE OF `guest_displayed_at`, `sender` ON `assistant_messages`
WHEN NEW.`guest_displayed_at` IS NOT NULL
  AND (NEW.`sender` != 'owner'
    OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.`guest_displayed_at`) IS NOT NEW.`guest_displayed_at`)
BEGIN
  SELECT RAISE(ABORT, 'assistant_display_receipt_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `assistant_display_receipt_immutable`
BEFORE UPDATE OF `guest_displayed_at`, `id`, `conversation_id` ON `assistant_messages`
WHEN OLD.`guest_displayed_at` IS NOT NULL
  AND (NEW.`guest_displayed_at` IS NOT OLD.`guest_displayed_at`
    OR NEW.`id` IS NOT OLD.`id`
    OR NEW.`conversation_id` IS NOT OLD.`conversation_id`)
BEGIN
  SELECT RAISE(ABORT, 'assistant_display_receipt_immutable');
END;
