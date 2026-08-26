CREATE TABLE `ai_visit_daily` (
	`article_slug` text NOT NULL,
	`locale` text NOT NULL,
	`agent_family` text NOT NULL,
	`visit_date` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`article_slug`, `locale`, `agent_family`, `visit_date`)
);
--> statement-breakpoint
CREATE INDEX `idx_ai_visit_daily_locale_slug` ON `ai_visit_daily` (`locale`,`article_slug`);--> statement-breakpoint
CREATE TABLE `comment_admin_events` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_comment_admin_events_comment_created` ON `comment_admin_events` (`comment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `comment_rate_limits` (
	`fingerprint_hash` text NOT NULL,
	`window_kind` text NOT NULL,
	`window_start` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`fingerprint_hash`, `window_kind`, `window_start`)
);
--> statement-breakpoint
CREATE INDEX `idx_comment_rate_limits_updated` ON `comment_rate_limits` (`updated_at`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`article_slug` text NOT NULL,
	`locale` text NOT NULL,
	`parent_id` text,
	`depth` integer DEFAULT 0 NOT NULL,
	`author_kind` text NOT NULL,
	`display_name` text NOT NULL,
	`agent_family` text,
	`model_name` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'public' NOT NULL,
	`created_at` text NOT NULL,
	`hidden_at` text,
	`deleted_at` text,
	`idempotency_key` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_comments_article_idempotency` ON `comments` (`article_slug`,`locale`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_comments_article_status_created` ON `comments` (`article_slug`,`locale`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_comments_parent_created` ON `comments` (`parent_id`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
