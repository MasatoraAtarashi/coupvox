CREATE TABLE `answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`response_id` text NOT NULL,
	`item_key` text NOT NULL,
	`value` integer NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `responses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answers_response_item_unique` ON `answers` (`response_id`,`item_key`);--> statement-breakpoint
CREATE TABLE `couples` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cadence_days` integer DEFAULT 14 NOT NULL,
	`window_days` integer DEFAULT 7 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`opened_at` text DEFAULT (datetime('now')) NOT NULL,
	`closes_at` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cycles_couple_idx` ON `cycles` (`couple_id`,`opened_at`);--> statement-breakpoint
CREATE TABLE `insights` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `insights_cycle_idx` ON `insights` (`cycle_id`,`kind`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`token` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_token_unique` ON `members` (`token`);--> statement-breakpoint
CREATE INDEX `members_couple_idx` ON `members` (`couple_id`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`member_id` text NOT NULL,
	`comment` text,
	`share_comment` integer DEFAULT false NOT NULL,
	`submitted_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `responses_cycle_member_unique` ON `responses` (`cycle_id`,`member_id`);