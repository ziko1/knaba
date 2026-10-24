CREATE TABLE `cms_history` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`path`) REFERENCES `cms_pages`(`path`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_history_path_version` ON `cms_history` (`path`,`version`);--> statement-breakpoint
CREATE INDEX `cms_history_path` ON `cms_history` (`path`);--> statement-breakpoint
CREATE TABLE `cms_pages` (
	`path` text PRIMARY KEY NOT NULL,
	`draft_json` text DEFAULT '{}' NOT NULL,
	`published_json` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`published_version` integer DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
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
