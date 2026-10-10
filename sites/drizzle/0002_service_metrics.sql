CREATE TABLE `service_metrics_daily` (
	`metric_date` text NOT NULL,
	`service_id` text NOT NULL,
	`locale` text NOT NULL,
	`event_kind` text NOT NULL,
	`surface` text NOT NULL,
	`source` text NOT NULL,
	`placement` text NOT NULL,
	`request_class` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`metric_date`, `service_id`, `locale`, `event_kind`, `surface`, `source`, `placement`, `request_class`)
);
