CREATE TABLE `site_erp_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`kind` text DEFAULT 'lead.upsert' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`locale` text DEFAULT 'DE' NOT NULL,
	`source_json` text DEFAULT '{}' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`envelope_sha256` text,
	`delivery_scope_sha256` text,
	`last_error` text DEFAULT '' NOT NULL,
	`last_http_status` integer,
	`erp_effect_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`request_id`) REFERENCES `cleaning_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_erp_kind" CHECK("site_erp_outbox"."kind"='lead.upsert'),
	CONSTRAINT "site_erp_status" CHECK("site_erp_outbox"."status" IN ('PENDING','LEASED','APPLIED','REVIEW','BLOCKED','UNKNOWN')),
	CONSTRAINT "site_erp_locale" CHECK("site_erp_outbox"."locale" IN ('DE','EN','PL','LT','RU','UK')),
	CONSTRAINT "site_erp_attempts" CHECK("site_erp_outbox"."attempts" BETWEEN 0 AND 5),
	CONSTRAINT "site_erp_digest" CHECK("site_erp_outbox"."envelope_sha256" IS NULL OR (length("site_erp_outbox"."envelope_sha256")=64 AND "site_erp_outbox"."envelope_sha256" NOT GLOB '*[^0-9a-f]*')),
	CONSTRAINT "site_erp_delivery_scope" CHECK("site_erp_outbox"."delivery_scope_sha256" IS NULL OR (length("site_erp_outbox"."delivery_scope_sha256")=64 AND "site_erp_outbox"."delivery_scope_sha256" NOT GLOB '*[^0-9a-f]*'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_erp_request` ON `site_erp_outbox` (`request_id`);--> statement-breakpoint
CREATE INDEX `site_erp_outbox_due` ON `site_erp_outbox` (`status`,`next_attempt_at`,`lease_until`);
