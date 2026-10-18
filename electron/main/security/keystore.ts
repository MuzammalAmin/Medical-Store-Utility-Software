import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { safeStorage } from 'electron';

/**
 * Keeps the 32-byte database key on disk, encrypted with Windows DPAPI through
 * Electron's safeStorage, so only this Windows user on this PC can read it
 * (PRD §6.2). Moving the data folder to another PC therefore needs the
 * recovery key.
 */
export class KeyStore {
  constructor(private readonly file: string) {}

  exists(): boolean {
    return existsSync(this.file);
  }

  load(): Buffer {
    this.assertAvailable();
    const hex = safeStorage.decryptString(readFileSync(this.file));
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('Key store is corrupt');
    return Buffer.from(hex, 'hex');
  }

  save(key: Buffer): void {
    this.assertAvailable();
    if (key.length !== 32) throw new Error('Database key must be 32 bytes');
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, safeStorage.encryptString(key.toString('hex')));
    renameSync(tmp, this.file);
  }

  private assertAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'Windows data protection is not available, so the database key cannot be stored',
      );
    }
  }
}
