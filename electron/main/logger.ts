/**
 * Logger used by services. It defaults to the console so services can run in
 * plain Node tests; the app swaps in electron-log at start-up (see log.ts).
 */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export let logger: Logger = console;

export function setLogger(next: Logger): void {
  logger = next;
}

const SECRET_KEYS = /pin|key|password|secret|hash/i;

/** Replaces any value whose key looks secret, so PINs and keys never reach logs or the audit trail. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      SECRET_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1),
    ]),
  );
}
