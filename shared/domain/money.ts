/**
 * Money is always handled as an integer number of paisa (1 rupee = 100 paisa).
 * Floating-point rupee values never enter calculations.
 */
export type Paisa = number;

export class MoneyError extends Error {
  override name = 'MoneyError';
}

export function assertPaisa(value: number, label = 'amount'): asserts value is Paisa {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a whole number of paisa, got ${value}`);
  }
}

/**
 * Integer division rounded half away from zero (e.g. 2.5 → 3, −2.5 → −3).
 * Used for every money calculation that can produce a fraction of a paisa.
 */
export function divRound(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new MoneyError('divRound expects safe integers');
  }
  if (denominator === 0) throw new MoneyError('Division by zero');
  const sign = Math.sign(numerator) * Math.sign(denominator);
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  const q = Math.floor(n / d);
  const r = n - q * d;
  return sign * (r * 2 >= d ? q + 1 : q);
}

const RUPEE_PATTERN = /^-?\d+(\.\d{1,2})?$/;

/**
 * Parses a rupee amount typed by a user or read from a spreadsheet
 * ("1,234.50", "Rs 99", "12.5") into paisa. Throws on anything ambiguous.
 */
export function parseRupees(input: string | number): Paisa {
  let text: string;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new MoneyError(`Invalid amount: ${input}`);
    // Numbers from spreadsheets can arrive as 12.499999999, so round them to 2 decimals.
    text = input.toFixed(2);
  } else {
    text = input
      .trim()
      .replace(/^rs\.?\s*/i, '')
      .replace(/,/g, '');
  }
  if (!RUPEE_PATTERN.test(text)) {
    throw new MoneyError(`Invalid amount: "${String(input)}"`);
  }
  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = text.replace('-', '').split('.');
  const paisa = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  assertPaisa(paisa);
  return negative ? -paisa : paisa;
}

const groupFormatter = new Intl.NumberFormat('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats paisa as "Rs 1,234.50" (negative: "−Rs 20.00"). */
export function formatRupees(paisa: Paisa): string {
  assertPaisa(paisa);
  const formatted = groupFormatter.format(Math.abs(paisa) / 100);
  return paisa < 0 ? `−Rs ${formatted}` : `Rs ${formatted}`;
}
