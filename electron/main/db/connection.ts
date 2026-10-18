import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

/**
 * Encrypted SQLite (SQLCipher v4 format, AES-256) through
 * better-sqlite3-multiple-ciphers, installed under the `better-sqlite3` alias
 * so Drizzle uses it directly. Verified behaviour (see db/connection.test.ts):
 * a wrong key fails with SQLITE_NOTADB, and `VACUUM INTO` writes backups
 * encrypted with the same key.
 */
/** The database or a transaction on it: services accept either. */
export type Db = BaseSQLiteDatabase<'sync', Database.RunResult, typeof schema>;
export type Sqlite = Database.Database;

export interface OpenDatabase {
  sqlite: Sqlite;
  db: Db;
  close(): void;
}

export class WrongKeyError extends Error {
  override name = 'WrongKeyError';
  constructor() {
    super('The database could not be opened with this key');
  }
}

function createDrizzle(sqlite: Sqlite) {
  return drizzle({ client: sqlite, schema });
}

function applyKey(sqlite: Sqlite, key: Buffer): void {
  const hex = key.toString('hex');
  // The key is interpolated into a PRAGMA, so only ever accept exactly 64 hex characters.
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('Database key must be 32 bytes');
  sqlite.pragma(`cipher='sqlcipher'`);
  sqlite.pragma('legacy=4');
  sqlite.pragma(`hexkey='${hex}'`);
}

/** Opens a file with the key and proves the key is right by reading the schema. */
export function openEncrypted(
  file: string,
  key: Buffer,
  options: { readonly?: boolean } = {},
): Sqlite {
  const sqlite = new Database(file, {
    readonly: options.readonly ?? false,
    fileMustExist: options.readonly ?? false,
  });
  try {
    applyKey(sqlite, key);
    sqlite.prepare('SELECT count(*) FROM sqlite_master').get();
    return sqlite;
  } catch (error) {
    sqlite.close();
    if ((error as { code?: string }).code === 'SQLITE_NOTADB') throw new WrongKeyError();
    throw error;
  }
}

export function openDatabase(file: string, key: Buffer, migrationsFolder: string): OpenDatabase {
  const sqlite = openEncrypted(file, key);
  sqlite.pragma('journal_mode = WAL');
  // FULL sync in WAL mode keeps committed sales safe through a power cut (load-shedding).
  sqlite.pragma('synchronous = FULL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = createDrizzle(sqlite);
  migrate(db, { migrationsFolder });
  return {
    sqlite,
    db,
    close() {
      if (!sqlite.open) return;
      sqlite.pragma('wal_checkpoint(TRUNCATE)');
      sqlite.close();
    },
  };
}

/** Throws unless `file` opens with `key` and passes SQLite's integrity check. */
export function verifyDatabaseFile(file: string, key: Buffer): void {
  const sqlite = openEncrypted(file, key, { readonly: true });
  try {
    const result = sqlite.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error(`Integrity check failed: ${String(result)}`);
  } finally {
    sqlite.close();
  }
}

/** Writes a compact, encrypted copy of the open database to `target` (same key). */
export function vacuumInto(sqlite: Sqlite, target: string): void {
  sqlite.prepare('VACUUM INTO ?').run(target);
}
