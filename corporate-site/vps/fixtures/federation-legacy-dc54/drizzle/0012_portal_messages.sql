-- Authenticated portal conversations; never copy anonymous Assistant or ERP data.
CREATE TABLE `portal_conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `participant_id` text NOT NULL REFERENCES `profiles`(`id`),
  `participant_role` text NOT NULL,
  `request_id` text REFERENCES `cleaning_requests`(`id`),
  `scope_key` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `portal_conversation_role` CHECK (`participant_role` IN ('client','partner','worker')),
  CONSTRAINT `portal_conversation_scope_key` CHECK ((`request_id` IS NULL AND `scope_key`='direct') OR (`request_id` IS NOT NULL AND `scope_key`='request:' || `request_id`))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_conversation_scope` ON `portal_conversations` (`participant_id`,`participant_role`,`scope_key`);
--> statement-breakpoint
CREATE INDEX `portal_conversation_updated` ON `portal_conversations` (`updated_at`,`id`);
--> statement-breakpoint
CREATE TABLE `portal_messages` (
  `sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `id` text NOT NULL,
  `conversation_id` text NOT NULL REFERENCES `portal_conversations`(`id`),
  `author_id` text NOT NULL,
  `author_name` text NOT NULL,
  `author_role` text NOT NULL,
  `body` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `payload_hash` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `portal_message_role` CHECK (`author_role` IN ('client','partner','worker','bauleiter','admin','owner')),
  CONSTRAINT `portal_message_length` CHECK (length(`body`) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_message_id` ON `portal_messages` (`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_message_retry` ON `portal_messages` (`conversation_id`,`author_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `portal_message_thread` ON `portal_messages` (`conversation_id`,`sequence`);
