import type { OpenDatabase } from '../db/connection';
import { formatRecoveryKey } from '../security/recovery-key';
import { AuthService } from './auth.service';
import { BackupScheduler, BackupService } from './backup.service';
import { DashboardService } from './dashboard.service';
import { ImportService } from './import.service';
import { InventoryService } from './inventory.service';
import { ItemsService } from './items.service';
import { ReportsService } from './reports.service';
import { ReturnsService } from './returns.service';
import { SalesService } from './sales.service';
import { SettingsService } from './settings.service';
import { SetupService } from './setup.service';
import { UsersService } from './users.service';

export interface Services {
  settings: SettingsService;
  auth: AuthService;
  users: UsersService;
  setup: SetupService;
  backups: BackupService;
  backupScheduler: BackupScheduler;
  dashboard: DashboardService;
  items: ItemsService;
  inventory: InventoryService;
  sales: SalesService;
  returns: ReturnsService;
  reports: ReportsService;
  imports: ImportService;
}

/** Wires every service to one open database. Rebuilt whenever the database is reopened. */
export function createServices(
  database: OpenDatabase,
  key: Buffer,
  backupFolder: string,
  now: () => number = Date.now,
): Services {
  const { db, sqlite } = database;
  const settings = new SettingsService(db);
  const users = new UsersService(db);
  const auth = new AuthService(db, now);
  const warningDays = () => settings.get('inventory').expiryWarningDays;
  const backups = new BackupService({
    sqlite,
    key,
    folder: backupFolder,
    settings: () => settings.get('backup'),
  });
  const items = new ItemsService(db, warningDays, now);
  const sales = new SalesService(
    db,
    items,
    auth,
    () => ({ pos: settings.get('pos'), expiryWarningDays: warningDays() }),
    now,
  );
  return {
    settings,
    users,
    auth,
    setup: new SetupService(users, settings, formatRecoveryKey(key)),
    backups,
    backupScheduler: new BackupScheduler(backups, () => settings.get('backup')),
    dashboard: new DashboardService(db),
    items,
    inventory: new InventoryService(db, items, warningDays, now),
    sales,
    returns: new ReturnsService(db, sales, auth, () => settings.get('pos'), now),
    reports: new ReportsService(db, warningDays, now),
    imports: new ImportService(db, warningDays, now),
  };
}
