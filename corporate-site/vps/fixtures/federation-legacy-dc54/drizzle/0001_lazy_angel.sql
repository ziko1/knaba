CREATE TABLE `assistant_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`locale` text NOT NULL,
	`status` text DEFAULT 'assistant' NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`contact_phone` text DEFAULT '' NOT NULL,
	`privacy_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assistant_conversations_updated` ON `assistant_conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `assistant_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender` text NOT NULL,
	`kind` text DEFAULT 'text' NOT NULL,
	`content` text NOT NULL,
	`request_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_message_retry` ON `assistant_messages` (`conversation_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `assistant_messages_thread` ON `assistant_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `assistant_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`content` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`request_key` text NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_offer_retry` ON `assistant_offers` (`conversation_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `assistant_offers_thread` ON `assistant_offers` (`conversation_id`,`created_at`);