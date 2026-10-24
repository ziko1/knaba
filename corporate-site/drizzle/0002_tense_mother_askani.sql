CREATE TABLE `assistant_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`event_key` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_notification_event` ON `assistant_notifications` (`event_key`);--> statement-breakpoint
CREATE INDEX `assistant_notification_due` ON `assistant_notifications` (`status`,`next_attempt_at`);