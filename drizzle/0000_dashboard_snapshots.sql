CREATE TABLE IF NOT EXISTS `dashboard_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`generated_at` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL
);
