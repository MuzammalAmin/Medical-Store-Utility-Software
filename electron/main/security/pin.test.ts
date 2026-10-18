import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from './pin';

describe('PIN hashing', () => {
  it('verifies the right PIN and rejects a wrong one', async () => {
    const stored = await hashPin('482915');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(stored).not.toContain('482915');
    expect(await verifyPin('482915', stored)).toBe(true);
    expect(await verifyPin('482916', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPin('1234')).not.toBe(await hashPin('1234'));
  });

  it('rejects PINs that are not 4–8 digits', async () => {
    await expect(hashPin('12')).rejects.toThrow();
    await expect(hashPin('abcd')).rejects.toThrow();
  });

  it('returns false for malformed stored values', async () => {
    expect(await verifyPin('1234', 'garbage')).toBe(false);
  });
});
