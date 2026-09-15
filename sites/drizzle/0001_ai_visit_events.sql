CREATE TABLE `ai_visit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`article_slug` text NOT NULL,
	`locale` text NOT NULL,
	`agent_family` text NOT NULL,
	`agent_name` text NOT NULL,
	`detection_source` text NOT NULL,
	`visited_at` text NOT NULL,
	`visit_date` text NOT NULL,
	`request_kind` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_visit_events_article_time` ON `ai_visit_events` (`locale`,`article_slug`,`visited_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_ai_visit_events_daily` ON `ai_visit_events` (`locale`,`article_slug`,`agent_family`,`visit_date`);
--> statement-breakpoint
PRAGMA optimize;
