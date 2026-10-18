import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface AppPaths {
  dataDir: string;
  database: string;
  keystore: string;
  backups: string;
  logs: string;
  migrations: string;
}

/**
 * All files live under Electron's per-user data folder
 * (%APPDATA%\Ayyaz Pharmacy Manager). Migrations ship inside the app:
 * `resources/migrations` when packaged, `db/migrations` in development.
 */
export function resolvePaths(options: {
  userData: string;
  isPackaged: boolean;
  resourcesPath: string;
  appRoot: string;
}): AppPaths {
  const dataDir = join(options.userData, 'data');
  const paths: AppPaths = {
    dataDir,
    database: join(dataDir, 'ayyaz-pharmacy.db'),
    keystore: join(dataDir, 'database.keystore'),
    backups: join(options.userData, 'backups'),
    logs: join(options.userData, 'logs'),
    migrations: options.isPackaged
      ? join(options.resourcesPath, 'migrations')
      : join(options.appRoot, 'db', 'migrations'),
  };
  for (const dir of [paths.dataDir, paths.backups, paths.logs]) mkdirSync(dir, { recursive: true });
  return paths;
}
