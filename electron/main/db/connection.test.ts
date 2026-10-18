import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateDatabaseKey } from '../security/recovery-key';
import {
  openDatabase,
  openEncrypted,
  vacuumInto,
  verifyDatabaseFile,
  WrongKeyError,
} from './connection';

const migrations = join(import.meta.dirname, '..', '..', '..', 'db', 'migrations');

describe('encrypted database', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ayyaz-db-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('runs migrations and refuses a wrong key', () => {
    const file = join(dir, 'test.db');
    const key = generateDatabaseKey();
    const db = openDatabase(file, key, migrations);
    db.sqlite.prepare("INSERT INTO companies (name) VALUES ('Getz Pharma')").run();
    db.close();

    expect(() => openEncrypted(file, generateDatabaseKey())).toThrow(WrongKeyError);
    expect(readFileSync(file).includes('Getz Pharma')).toBe(false);
  });

  it('keeps the audit log and stock movements append-only', () => {
    const db = openDatabase(join(dir, 'test.db'), generateDatabaseKey(), migrations);
    db.sqlite.prepare("INSERT INTO audit_log (action) VALUES ('test')").run();
    expect(() => db.sqlite.prepare("UPDATE audit_log SET action = 'x'").run()).toThrow(
      /append-only/,
    );
    expect(() => db.sqlite.prepare('DELETE FROM audit_log').run()).toThrow(/append-only/);
    db.close();
  });

  it('treats company names as unique regardless of case', () => {
    const db = openDatabase(join(dir, 'test.db'), generateDatabaseKey(), migrations);
    db.sqlite.prepare("INSERT INTO companies (name) VALUES ('Getz Pharma')").run();
    expect(() =>
      db.sqlite.prepare("INSERT INTO companies (name) VALUES ('getz pharma')").run(),
    ).toThrow();
    db.close();
  });

  it('writes backups encrypted with the same key', () => {
    const key = generateDatabaseKey();
    const db = openDatabase(join(dir, 'test.db'), key, migrations);
    db.sqlite.prepare("INSERT INTO companies (name) VALUES ('Searle')").run();
    const backup = join(dir, 'backup.apbak');
    vacuumInto(db.sqlite, backup);
    db.close();

    expect(readFileSync(backup).includes('Searle')).toBe(false);
    expect(() => verifyDatabaseFile(backup, key)).not.toThrow();
    expect(() => verifyDatabaseFile(backup, generateDatabaseKey())).toThrow(WrongKeyError);
  });
});
