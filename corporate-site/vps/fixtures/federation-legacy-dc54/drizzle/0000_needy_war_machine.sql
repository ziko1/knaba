CREATE TABLE `portal_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`requested_role` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`privacy_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_mutation` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portal_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cleaning_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`service` text NOT NULL,
	`object_type` text NOT NULL,
	`postcode` text NOT NULL,
	`area` text NOT NULL,
	`frequency` text NOT NULL,
	`message` text NOT NULL,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`assigned_worker_id` text,
	`scheduled_at` text,
	`checklist` text DEFAULT '[]' NOT NULL,
	`worker_note` text DEFAULT '' NOT NULL,
	`customer_feedback` text DEFAULT '' NOT NULL,
	`admin_reply` text DEFAULT '' NOT NULL,
	`dedupe_scope` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`privacy_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_mutation` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_worker_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_idempotency` ON `cleaning_requests` (`dedupe_scope`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `request_client` ON `cleaning_requests` (`client_id`);--> statement-breakpoint
CREATE INDEX `request_worker` ON `cleaning_requests` (`assigned_worker_id`);