import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import type { BackupInfo, BackupStatus } from '../../../shared/ipc/contract';
import type { BackupSettings } from '../../../shared/settings';
import { vacuumInto, verifyDatabaseFile, type Sqlite } from '../db/connection';
import { fail } from '../errors';
import { logger } from '../logger';

/**
 * Encrypted backups (PRD §3.12). Each backup is a `VACUUM INTO` copy encrypted
 * with the same key, verified with an integrity check before it counts, and
 * stored with a SHA-256 checksum file next to it.
 */
export const BACKUP_REASONS = [
  'manual',
  'daily',
  'close',
  'setup',
  'pre-import',
  'pre-restore',
] as const;
export type BackupReason = (typeof BACKUP_REASONS)[number];

const EXTENSION = '.apbak';
const NAME_PATTERN = /^ayyaz-(\d{8})-(\d{9})-([a-z-]+)\.apbak$/;

export interface BackupDeps {
  sqlite: Sqlite;
  key: Buffer;
  folder: string;
  settings: () => BackupSettings;
  now?: () => number;
}

function stamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Reads the creation time from the file name, which survives copying (unlike the file's modified date). */
function parseStamp(date: string, time: string): number {
  const n = (text: string, from: number, to: number) => Number(text.slice(from, to));
  return new Date(
    n(date, 0, 4),
    n(date, 4, 6) - 1,
    n(date, 6, 8),
    n(time, 0, 2),
    n(time, 2, 4),
    n(time, 4, 6),
    n(time, 6, 9),
  ).getTime();
}

function listFolder(folder: string): BackupInfo[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .map((fileName) => ({ fileName, match: NAME_PATTERN.exec(fileName) }))
    .filter((entry): entry is { fileName: string; match: RegExpExecArray } => entry.match !== null)
    .map(({ fileName, match }) => ({
      fileName,
      createdAt: parseStamp(match[1]!, match[2]!),
      sizeBytes: statSync(join(folder, fileName)).size,
      reason: match[3]!,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export class BackupService {
  private readonly now: () => number;

  constructor(private readonly deps: BackupDeps) {
    this.now = deps.now ?? Date.now;
  }

  create(reason: BackupReason): BackupInfo {
    const { folder, sqlite, key } = this.deps;
    const fileName = `ayyaz-${stamp(this.now())}-${reason}${EXTENSION}`;
    const target = join(folder, fileName);
    const tmp = `${target}.tmp`;
    try {
      vacuumInto(sqlite, tmp);
      verifyDatabaseFile(tmp, key);
      const checksum = sha256(tmp);
      renameSync(tmp, target);
      writeFileSync(`${target}.sha256`, `${checksum}  ${fileName}\n`);
    } catch (error) {
      rmSync(tmp, { force: true });
      throw error;
    }
    logger.info(`Backup created: ${fileName}`);
    this.prune(folder);
    this.copyToUsb(target);
    return listFolder(folder).find((b) => b.fileName === fileName)!;
  }

  list(): BackupInfo[] {
    return listFolder(this.deps.folder);
  }

  lastBackupAt(): number | null {
    return this.list()[0]?.createdAt ?? null;
  }

  status(): BackupStatus {
    const usbFolder = this.deps.settings().usbFolder;
    const usbAvailable = usbFolder !== '' && existsSync(usbFolder);
    return {
      folder: this.deps.folder,
      lastBackupAt: this.lastBackupAt(),
      lastUsbCopyAt: usbAvailable ? (listFolder(usbFolder)[0]?.createdAt ?? null) : null,
      usbAvailable,
      backups: this.list(),
    };
  }

  /**
   * Returns the full path of a backup in the backup folder after checking its
   * name, checksum and that it opens with the current key. The file name comes
   * from the UI, so it must match the backup naming pattern exactly.
   */
  verifiedPath(fileName: string): string {
    if (basename(fileName) !== fileName || !NAME_PATTERN.test(fileName)) {
      throw fail.validation('Unknown backup file');
    }
    const file = join(this.deps.folder, fileName);
    if (!existsSync(file)) throw fail.notFound('Backup');
    verifyBackupFile(file, this.deps.key);
    return file;
  }

  private copyToUsb(file: string): void {
    const usbFolder = this.deps.settings().usbFolder;
    if (!usbFolder || !existsSync(usbFolder)) return;
    try {
      const target = join(usbFolder, basename(file));
      copyFileSync(file, target);
      copyFileSync(`${file}.sha256`, `${target}.sha256`);
      this.prune(usbFolder);
    } catch (error) {
      logger.warn('Copying the backup to USB failed', error);
    }
  }

  private prune(folder: string): void {
    const keep = this.deps.settings().keepCount;
    for (const old of listFolder(folder).slice(keep)) {
      rmSync(join(folder, old.fileName), { force: true });
      rmSync(join(folder, `${old.fileName}.sha256`), { force: true });
    }
  }
}

/** Checks a backup's checksum file (when present) and that it opens with `key`. */
export function verifyBackupFile(file: string, key: Buffer): void {
  const checksumFile = `${file}.sha256`;
  if (existsSync(checksumFile)) {
    const expected = readFileSync(checksumFile, 'utf8').split(/\s+/)[0];
    if (expected !== sha256(file))
      throw fail.validation('This backup file is damaged (checksum mismatch)');
  }
  verifyDatabaseFile(file, key);
}

/**
 * Runs the daily backup once the configured time has passed, if no backup has
 * been made since then. Checked every few minutes and at start-up.
 */
export class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly backups: BackupService,
    private readonly settings: () => BackupSettings,
    private readonly now: () => number = Date.now,
  ) {}

  start(intervalMs = 5 * 60_000): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick(): void {
    const [hours = 21, minutes = 0] = this.settings().dailyTime.split(':').map(Number);
    const due = new Date(this.now());
    due.setHours(hours, minutes, 0, 0);
    const last = this.backups.lastBackupAt();
    if (this.now() >= due.getTime() && (last === null || last < due.getTime())) {
      try {
        this.backups.create('daily');
      } catch (error) {
        logger.error('Daily backup failed', error);
      }
    }
  }
}
