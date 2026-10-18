CREATE TABLE `held_bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`user_id` integer NOT NULL,
	`label` text NOT NULL,
	`cart` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `return_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`return_id` integer NOT NULL,
	`sale_line_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`qty_tabs` integer NOT NULL,
	`restocked` integer NOT NULL,
	`refund_paisa` integer NOT NULL,
	`gst_paisa` integer NOT NULL,
	`cost_paisa` integer NOT NULL,
	FOREIGN KEY (`return_id`) REFERENCES `returns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_line_id`) REFERENCES `sale_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `return_lines_sale_line_idx` ON `return_lines` (`sale_line_id`);--> statement-breakpoint
CREATE TABLE `returns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`return_no` integer NOT NULL,
	`sale_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`user_id` integer NOT NULL,
	`approved_by` integer,
	`reason` text DEFAULT '' NOT NULL,
	`refund_paisa` integer NOT NULL,
	`gst_paisa` integer NOT NULL,
	`cost_paisa` integer NOT NULL,
	`refund_method` text NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `returns_return_no_unique` ON `returns` (`return_no`);--> statement-breakpoint
CREATE INDEX `returns_sale_idx` ON `returns` (`sale_id`);--> statement-breakpoint
CREATE INDEX `returns_at_idx` ON `returns` (`created_at`);--> statement-breakpoint
CREATE TABLE `sale_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`item_name` text NOT NULL,
	`batch_no` text NOT NULL,
	`expiry` text NOT NULL,
	`unit` text NOT NULL,
	`qty` integer NOT NULL,
	`qty_tabs` integer NOT NULL,
	`price_mode` text NOT NULL,
	`gst_rate_bp` integer NOT NULL,
	`unit_amount_paisa` integer NOT NULL,
	`subtotal_paisa` integer NOT NULL,
	`discount_paisa` integer NOT NULL,
	`gst_paisa` integer NOT NULL,
	`total_paisa` integer NOT NULL,
	`cost_paisa` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sale_lines_sale_idx` ON `sale_lines` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sale_lines_item_idx` ON `sale_lines` (`item_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_no` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`user_id` integer NOT NULL,
	`customer_name` text DEFAULT '' NOT NULL,
	`customer_phone` text DEFAULT '' NOT NULL,
	`doctor_name` text DEFAULT '' NOT NULL,
	`subtotal_paisa` integer NOT NULL,
	`discount_paisa` integer NOT NULL,
	`gst_paisa` integer NOT NULL,
	`total_paisa` integer NOT NULL,
	`cost_paisa` integer NOT NULL,
	`payment_method` text NOT NULL,
	`paid_paisa` integer NOT NULL,
	`change_paisa` integer NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`voided_at` integer,
	`voided_by` integer,
	`void_reason` text,
	`fbr_invoice_no` text,
	`fbr_status` text,
	`fbr_synced_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_invoice_no_unique` ON `sales` (`invoice_no`);--> statement-breakpoint
CREATE INDEX `sales_at_idx` ON `sales` (`created_at`);