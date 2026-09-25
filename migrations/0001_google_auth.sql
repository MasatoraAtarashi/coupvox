ALTER TABLE `members` ADD `google_sub` text;--> statement-breakpoint
ALTER TABLE `members` ADD `claimed_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `members_google_sub_unique` ON `members` (`google_sub`);