import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type OpenDatabase } from '../db/connection';
import { generateDatabaseKey } from '../security/recovery-key';

const MIGRATIONS = join(import.meta.dirname, '..', '..', '..', 'db', 'migrations');

export interface TestDb extends OpenDatabase {
  dir: string;
  key: Buffer;
  dispose(): void;
}

/** A fresh, migrated, encrypted database in a temp folder, for service tests. */
export function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'ayyaz-test-'));
  const key = generateDatabaseKey();
  const database = openDatabase(join(dir, 'test.db'), key, MIGRATIONS);
  return {
    ...database,
    dir,
    key,
    dispose() {
      database.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
