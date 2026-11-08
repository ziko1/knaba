CREATE TABLE `studio_ai_budget` (
	`day` text NOT NULL,
	`scope` text NOT NULL,
	`reserved_cents` integer DEFAULT 0 NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `scope`)
);
--> statement-breakpoint
CREATE TABLE `studio_pages` (
	`page_path` text PRIMARY KEY NOT NULL,
	`draft_json` text DEFAULT '[]' NOT NULL,
	`draft_version` integer DEFAULT 0 NOT NULL,
	`published_json` text DEFAULT '[]' NOT NULL,
	`published_version` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`page_path` text NOT NULL,
	`version` integer NOT NULL,
	`action` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`page_path`) REFERENCES `studio_pages`(`page_path`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `studio_revision_history` ON `studio_revisions` (`page_path`,`created_at`);