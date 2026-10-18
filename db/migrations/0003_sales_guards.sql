-- Invoices are permanent records (PRD §3.5): they can be voided, never edited or deleted.
CREATE TRIGGER `sales_no_delete` BEFORE DELETE ON `sales`
BEGIN SELECT RAISE(ABORT, 'sales cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `sales_only_void` BEFORE UPDATE ON `sales`
WHEN OLD.status = 'void'
  OR NEW.invoice_no IS NOT OLD.invoice_no
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.user_id IS NOT OLD.user_id
  OR NEW.subtotal_paisa IS NOT OLD.subtotal_paisa
  OR NEW.discount_paisa IS NOT OLD.discount_paisa
  OR NEW.gst_paisa IS NOT OLD.gst_paisa
  OR NEW.total_paisa IS NOT OLD.total_paisa
  OR NEW.payment_method IS NOT OLD.payment_method
  OR NEW.paid_paisa IS NOT OLD.paid_paisa
BEGIN SELECT RAISE(ABORT, 'an invoice can only be voided, not edited'); END;
--> statement-breakpoint
CREATE TRIGGER `sale_lines_no_update` BEFORE UPDATE ON `sale_lines`
BEGIN SELECT RAISE(ABORT, 'sale_lines are permanent'); END;
--> statement-breakpoint
CREATE TRIGGER `sale_lines_no_delete` BEFORE DELETE ON `sale_lines`
BEGIN SELECT RAISE(ABORT, 'sale_lines are permanent'); END;
--> statement-breakpoint
CREATE TRIGGER `returns_no_change` BEFORE UPDATE ON `returns`
BEGIN SELECT RAISE(ABORT, 'returns are permanent'); END;
--> statement-breakpoint
CREATE TRIGGER `returns_no_delete` BEFORE DELETE ON `returns`
BEGIN SELECT RAISE(ABORT, 'returns are permanent'); END;
--> statement-breakpoint
CREATE TRIGGER `return_lines_no_change` BEFORE UPDATE ON `return_lines`
BEGIN SELECT RAISE(ABORT, 'return_lines are permanent'); END;
--> statement-breakpoint
CREATE TRIGGER `return_lines_no_delete` BEFORE DELETE ON `return_lines`
BEGIN SELECT RAISE(ABORT, 'return_lines are permanent'); END;
--> statement-breakpoint
-- Fast case-insensitive search for the item list and POS.
CREATE INDEX `items_brand_nocase_idx` ON `items` (`brand_name` COLLATE NOCASE);
--> statement-breakpoint
CREATE INDEX `batches_item_idx` ON `batches` (`item_id`);
