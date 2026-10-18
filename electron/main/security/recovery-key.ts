import { createHash, randomBytes } from 'node:crypto';

/**
 * The recovery key is the 32-byte database key written in a form a person can
 * print and type back: Crockford Base32 (no I, L, O, U) with a 3-byte SHA-256
 * checksum, in 14 groups of 4 characters, e.g. `7K2Q-…-M9TZ` (PRD §6.2).
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const KEY_BYTES = 32;
const CHECKSUM_BYTES = 3;
const GROUP = 4;

export class RecoveryKeyError extends Error {
  override name = 'RecoveryKeyError';
}

export function generateDatabaseKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

function checksum(key: Buffer): Buffer {
  return createHash('sha256').update(key).digest().subarray(0, CHECKSUM_BYTES);
}

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET.charAt((value << (5 - bits)) & 31);
  return out;
}

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new RecoveryKeyError(`Invalid character "${char}" in recovery key`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function formatRecoveryKey(key: Buffer): string {
  if (key.length !== KEY_BYTES) throw new RecoveryKeyError('Database key must be 32 bytes');
  const encoded = base32Encode(Buffer.concat([key, checksum(key)]));
  return encoded.match(new RegExp(`.{1,${GROUP}}`, 'g'))!.join('-');
}

/** Accepts the key in any case, with or without dashes/spaces; maps look-alike characters. */
export function parseRecoveryKey(input: string): Buffer {
  const normalised = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  const bytes = base32Decode(normalised);
  if (bytes.length !== KEY_BYTES + CHECKSUM_BYTES) {
    throw new RecoveryKeyError('Recovery key has the wrong length');
  }
  const key = bytes.subarray(0, KEY_BYTES);
  if (!checksum(key).equals(bytes.subarray(KEY_BYTES))) {
    throw new RecoveryKeyError('Recovery key is not valid. Check for typing mistakes');
  }
  return Buffer.from(key);
}

/** The groups the Owner must type back during setup to prove the key was saved. */
export function confirmationGroups(formatted: string): { indexes: number[]; expected: string } {
  const groups = formatted.split('-');
  const indexes = [2, 7, groups.length - 1];
  return { indexes, expected: indexes.map((i) => groups[i]).join('-') };
}
