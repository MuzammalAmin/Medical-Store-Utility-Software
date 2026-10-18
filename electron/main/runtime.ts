import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import type { AppPhase, AppState } from '../../shared/ipc/contract';
import { openDatabase, WrongKeyError, type OpenDatabase } from './db/connection';
import { fail } from './errors';
import { logger } from './logger';
import type { AppPaths } from './paths';
import type { KeyStore } from './security/keystore';
import {
  formatRecoveryKey,
  generateDatabaseKey,
  parseRecoveryKey,
  RecoveryKeyError,
} from './security/recovery-key';
import { verifyBackupFile } from './services/backup.service';
import { createServices, type Services } from './services';
import { SessionManager } from './services/session';

/**
 * Owns the database lifecycle: first run, normal start, recovery with the
 * recovery key, restoring a backup, and shutdown. Everything else reaches the
 * database only through `services()`.
 */
export class Runtime {
  readonly session: SessionManager;
  private database: OpenDatabase | null = null;
  private key: Buffer | null = null;
  private svc: Services | null = null;

  constructor(
    readonly paths: AppPaths,
    private readonly keystore: KeyStore,
    readonly version: string,
    readonly isPackaged: boolean,
  ) {
    this.session = new SessionManager(
      () => (this.svc?.settings.get('security').autoLockMinutes ?? 10) * 60_000,
    );
  }

  boot(): void {
    if (this.keystore.exists()) {
      try {
        this.open(this.keystore.load());
      } catch (error) {
        logger.error('The stored key could not open the database; recovery key needed', error);
      }
      return;
    }
    if (existsSync(this.paths.database)) {
      logger.warn('Database found without a key store; recovery key needed');
      return;
    }
    const key = generateDatabaseKey();
    this.keystore.save(key);
    this.open(key);
    logger.info('Created a new encrypted database');
  }

  phase(): AppPhase {
    if (!this.svc) return 'recover';
    if (!this.svc.users.hasOwner()) return 'setup';
    return this.session.peek() ? 'ready' : 'login';
  }

  services(): Services {
    if (!this.svc) throw fail.forbidden('The database is locked. Enter the recovery key first');
    return this.svc;
  }

  appState(): AppState {
    const settings = this.svc?.settings.getAll();
    return {
      phase: this.phase(),
      user: this.session.peek(),
      shopName: settings?.shop.name ?? 'Ayyaz Pharmacy',
      version: this.version,
      autoLockMinutes: settings?.security.autoLockMinutes ?? 10,
    };
  }

  recoveryKey(): string {
    if (!this.key) throw fail.forbidden('The database is locked');
    return formatRecoveryKey(this.key);
  }

  /** Called once the owner account exists: first backup and daily schedule. */
  onSetupComplete(): void {
    const svc = this.services();
    svc.backups.create('setup');
    svc.backupScheduler.start();
  }

  /** `recover` phase: unlock the existing database with the recovery key. */
  unlock(recoveryKeyText: string): void {
    const key = parseKey(recoveryKeyText);
    try {
      this.open(key);
    } catch (error) {
      if (error instanceof WrongKeyError)
        throw fail.validation('This recovery key does not match the database on this PC');
      throw error;
    }
    this.keystore.save(key);
    logger.info('Database unlocked with the recovery key');
  }

  /**
   * Replaces the database with a backup file. The current database is kept as
   * `.prev` until the restored copy has opened successfully.
   */
  restoreFrom(file: string, key: Buffer = this.requireKey()): void {
    try {
      verifyBackupFile(file, key);
    } catch (error) {
      if (error instanceof WrongKeyError)
        throw fail.validation('This backup cannot be opened with this recovery key');
      throw error;
    }
    if (this.svc?.users.hasOwner()) this.svc.backups.create('pre-restore');
    this.closeDatabase();

    const db = this.paths.database;
    const previous = `${db}.prev`;
    const incoming = `${db}.incoming`;
    copyFileSync(file, incoming);
    rmSync(previous, { force: true });
    if (existsSync(db)) renameSync(db, previous);
    for (const suffix of ['-wal', '-shm']) rmSync(db + suffix, { force: true });
    renameSync(incoming, db);
    try {
      this.open(key);
    } catch (error) {
      logger.error('Restored database failed to open; rolling back', error);
      rmSync(db, { force: true });
      if (existsSync(previous)) renameSync(previous, db);
      if (this.key) this.open(this.key);
      throw error;
    }
    this.keystore.save(key);
    // The pre-restore backup (when there was data) keeps the old database, so .prev can go.
    rmSync(previous, { force: true });
    this.session.end();
    logger.info(`Database restored from ${file}`);
  }

  parseRecoveryKey(text: string): Buffer {
    return parseKey(text);
  }

  shutdown(): void {
    if (this.svc?.users.hasOwner()) {
      try {
        this.svc.backups.create('close');
      } catch (error) {
        logger.error('Backup on close failed', error);
      }
    }
    this.closeDatabase();
  }

  private open(key: Buffer): void {
    const database = openDatabase(this.paths.database, key, this.paths.migrations);
    this.database = database;
    this.key = key;
    this.svc = createServices(database, key, this.paths.backups);
    if (this.svc.users.hasOwner()) this.svc.backupScheduler.start();
  }

  private closeDatabase(): void {
    this.svc?.backupScheduler.stop();
    this.database?.close();
    this.database = null;
    this.svc = null;
  }

  private requireKey(): Buffer {
    if (!this.key) throw fail.forbidden('The database is locked');
    return this.key;
  }
}

function parseKey(text: string): Buffer {
  try {
    return parseRecoveryKey(text);
  } catch (error) {
    if (error instanceof RecoveryKeyError) throw fail.validation(error.message);
    throw error;
  }
}
