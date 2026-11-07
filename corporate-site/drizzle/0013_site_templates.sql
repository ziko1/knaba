CREATE TABLE `studio_template_history` (
	`revision` integer PRIMARY KEY NOT NULL,
	`digest` text,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	`mutation_key` text NOT NULL,
	`request_hash` text NOT NULL,
	CONSTRAINT "studio_template_action" CHECK("studio_template_history"."action" IN ('select','activate','rollback'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_template_mutation` ON `studio_template_history` (`mutation_key`);--> statement-breakpoint
CREATE TABLE `studio_template_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`active_digest` text,
	`draft_digest` text,
	`version` integer DEFAULT 0 NOT NULL,
	`last_mutation` text DEFAULT '' NOT NULL,
	CONSTRAINT "studio_template_singleton" CHECK("studio_template_state"."id"=1)
);
--> statement-breakpoint
CREATE TABLE `studio_templates` (
	`digest` text PRIMARY KEY NOT NULL,
	`manifest_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);

--> statement-breakpoint
INSERT INTO studio_template_state (id,version,last_mutation) VALUES (1,0,'');
