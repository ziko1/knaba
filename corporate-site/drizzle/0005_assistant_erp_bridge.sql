CREATE TABLE `assistant_erp_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`scope_hash` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`envelope_json` text NOT NULL,
	`preview_hash` text NOT NULL,
	`version` integer NOT NULL,
	`state` text DEFAULT 'DRAFT' NOT NULL,
	`preview_expires_at` integer NOT NULL,
	`consent_at` integer,
	`revoked_at` integer,
	`event_id` text NOT NULL,
	`external_id` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`receipt_json` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_erp_conversation` ON `assistant_erp_requests` (`conversation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_erp_event` ON `assistant_erp_requests` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_erp_external` ON `assistant_erp_requests` (`external_id`);--> statement-breakpoint
CREATE INDEX `assistant_erp_due` ON `assistant_erp_requests` (`state`,`next_attempt_at`);