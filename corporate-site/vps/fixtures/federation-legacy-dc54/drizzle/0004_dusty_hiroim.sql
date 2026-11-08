CREATE TABLE `crm_contact_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_key` text NOT NULL,
	`body` text NOT NULL,
	`actor_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_note_idempotency` ON `crm_contact_notes` (`contact_key`,`actor_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `crm_note_contact_recent` ON `crm_contact_notes` (`contact_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `crm_contact_state` (
	`contact_key` text PRIMARY KEY NOT NULL,
	`stage` text DEFAULT 'new' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_mutation` text NOT NULL
);
