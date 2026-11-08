CREATE TABLE `public_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`relationship` text NOT NULL,
	`review_text` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`consent_at` text NOT NULL,
	`consent_version` text NOT NULL,
	`dedupe_scope` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`last_mutation` text NOT NULL,
	CONSTRAINT "public_review_relationship" CHECK("public_reviews"."relationship" IN ('client','partner')),
	CONSTRAINT "public_review_status" CHECK("public_reviews"."status" IN ('pending','published','hidden'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_review_idempotency` ON `public_reviews` (`dedupe_scope`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `public_review_listing` ON `public_reviews` (`status`,`published_at`,`id`);