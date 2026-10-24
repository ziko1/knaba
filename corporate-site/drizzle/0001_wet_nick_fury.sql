CREATE TABLE `assistant_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_mutation` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `assistant_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_message_dedupe` ON `assistant_messages` (`thread_id`,`author`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `assistant_message_thread` ON `assistant_messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `assistant_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`capability_hash` text NOT NULL,
	`opening_hash` text NOT NULL,
	`opening_key` text NOT NULL,
	`locale` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`consent_version` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_message_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_threads_capability_hash_unique` ON `assistant_threads` (`capability_hash`);--> statement-breakpoint
CREATE INDEX `assistant_threads_recent` ON `assistant_threads` (`last_message_at`);