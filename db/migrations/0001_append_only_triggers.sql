-- The audit log and stock movements are permanent records (PRD §6.2, §7):
-- rows can be added but never changed or deleted.
CREATE TRIGGER `audit_log_no_update` BEFORE UPDATE ON `audit_log`
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_log_no_delete` BEFORE DELETE ON `audit_log`
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `stock_movements_no_update` BEFORE UPDATE ON `stock_movements`
BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `stock_movements_no_delete` BEFORE DELETE ON `stock_movements`
BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;
--> statement-breakpoint
-- Company and generic names are unique regardless of letter case ("Getz Pharma" = "getz pharma").
CREATE UNIQUE INDEX `companies_name_nocase_uq` ON `companies` (`name` COLLATE NOCASE);
--> statement-breakpoint
CREATE UNIQUE INDEX `generics_name_nocase_uq` ON `generics` (`name` COLLATE NOCASE);
