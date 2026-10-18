import { describe, expect, it } from 'vitest';
import {
  formatRecoveryKey,
  generateDatabaseKey,
  parseRecoveryKey,
  RecoveryKeyError,
} from './recovery-key';

describe('recovery key', () => {
  it('round-trips a database key', () => {
    const key = generateDatabaseKey();
    const formatted = formatRecoveryKey(key);
    expect(formatted).toMatch(/^([0-9A-Z]{4}-){13}[0-9A-Z]{4}$/);
    expect(parseRecoveryKey(formatted).equals(key)).toBe(true);
  });

  it('accepts lower case, spaces and look-alike characters', () => {
    const key = generateDatabaseKey();
    const typed = formatRecoveryKey(key).toLowerCase().replace(/-/g, ' ').replace(/1/g, 'l');
    expect(parseRecoveryKey(typed).equals(key)).toBe(true);
  });

  it('detects a typing mistake through the checksum', () => {
    const formatted = formatRecoveryKey(generateDatabaseKey());
    const first = formatted[0] === 'A' ? 'B' : 'A';
    expect(() => parseRecoveryKey(first + formatted.slice(1))).toThrow(RecoveryKeyError);
  });

  it('rejects the wrong length', () => {
    expect(() => parseRecoveryKey('ABCD-EFGH')).toThrow(RecoveryKeyError);
  });
});
