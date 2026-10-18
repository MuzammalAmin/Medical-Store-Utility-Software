/** Dates are stored as ISO calendar dates (YYYY-MM-DD) in local time. */
export type IsoDate = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayIso(now: number = Date.now()): IsoDate {
  return toIsoDate(new Date(now));
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const [y, m, d] = iso.split('-').map(Number);
  return toIsoDate(new Date(y!, m! - 1, d! + days));
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Parses an expiry as written on packs or in spreadsheets: "MM/YYYY",
 * "MM-YY", "DD/MM/YYYY", "YYYY-MM-DD", or a spreadsheet Date. Month-only
 * expiries mean the last day of that month. Returns null if invalid.
 */
export function parseExpiry(input: unknown): IsoDate | null {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime())
      ? null
      : // Spreadsheet dates arrive as UTC midnight.
        `${input.getUTCFullYear()}-${pad(input.getUTCMonth() + 1)}-${pad(input.getUTCDate())}`;
  }
  const text = typeof input === 'string' || typeof input === 'number' ? String(input).trim() : '';
  let day: number | null = null;
  let month: number;
  let year: number;

  let m = /^(\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (m) {
    month = Number(m[1]);
    year = Number(m[2]);
  } else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text))) {
    day = Number(m[1]);
    month = Number(m[2]);
    year = Number(m[3]);
  } else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text))) {
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  } else {
    return null;
  }
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  const last = lastDayOfMonth(year, month);
  if (day === null) day = last;
  if (day < 1 || day > last) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** "2027-11-30" → "11/2027", the way expiries are printed on packs and receipts. */
export function formatExpiry(iso: IsoDate): string {
  const [y, m] = iso.split('-');
  return `${m}/${y}`;
}
