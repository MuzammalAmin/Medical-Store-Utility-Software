CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity` text,
	`entity_id` text,
	`details` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`batch_no` text NOT NULL,
	`expiry` text NOT NULL,
	`cost_price_box_paisa` integer DEFAULT 0 NOT NULL,
	`price_mode` text NOT NULL,
	`gst_rate_bp` integer NOT NULL,
	`base_price_box_paisa` integer NOT NULL,
	`final_price_box_paisa` integer NOT NULL,
	`qty` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `batches_item_batch_expiry_uq` ON `batches` (`item_id`,`batch_no`,`expiry`);--> statement-breakpoint
CREATE INDEX `batches_expiry_idx` ON `batches` (`expiry`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_name_unique` ON `companies` (`name`);--> statement-breakpoint
CREATE TABLE `generics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generics_name_unique` ON `generics` (`name`);--> statement-breakpoint
CREATE TABLE `item_barcodes` (
	`barcode` text PRIMARY KEY NOT NULL,
	`item_id` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_barcodes_item_idx` ON `item_barcodes` (`item_id`);--> statement-breakpoint
CREATE TABLE `item_generics` (
	`item_id` integer NOT NULL,
	`generic_id` integer NOT NULL,
	PRIMARY KEY(`item_id`, `generic_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generic_id`) REFERENCES `generics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `item_generics_generic_idx` ON `item_generics` (`generic_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brand_name` text NOT NULL,
	`strength` text DEFAULT '' NOT NULL,
	`form` text DEFAULT 'tablet' NOT NULL,
	`company_id` integer,
	`category` text DEFAULT '' NOT NULL,
	`rack` text DEFAULT '' NOT NULL,
	`tabs_per_strip` integer DEFAULT 1 NOT NULL,
	`strips_per_box` integer DEFAULT 1 NOT NULL,
	`price_mode` text NOT NULL,
	`gst_rate_bp` integer NOT NULL,
	`base_price_box_paisa` integer NOT NULL,
	`final_price_box_paisa` integer NOT NULL,
	`strip_price_override_paisa` integer,
	`tab_price_override_paisa` integer,
	`reorder_level_tabs` integer DEFAULT 0 NOT NULL,
	`rx_required` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `items_brand_idx` ON `items` (`brand_name`);--> statement-breakpoint
CREATE INDEX `items_identity_idx` ON `items` (`brand_name`,`strength`,`form`);--> statement-breakpoint
CREATE TABLE `settings` (
	`group` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_by` integer,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`qty_change` integer NOT NULL,
	`type` text NOT NULL,
	`ref_type` text,
	`ref_id` integer,
	`user_id` integer,
	`note` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_movements_batch_idx` ON `stock_movements` (`batch_id`);--> statement-breakpoint
CREATE INDEX `stock_movements_at_idx` ON `stock_movements` (`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`full_name` text NOT NULL,
	`role` text NOT NULL,
	`pin_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_login_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);