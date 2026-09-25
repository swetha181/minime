CREATE TABLE `prototype_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`helpful_feature` text NOT NULL,
	`feedback` text DEFAULT '' NOT NULL,
	`preorder_interest` text NOT NULL,
	`contribution_amount` integer,
	`consent` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
