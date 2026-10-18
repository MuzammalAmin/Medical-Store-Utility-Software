import { assertPaisa, divRound, MoneyError, type Paisa } from './money';

/**
 * How the Owner entered a selling price (PRD §3.2):
 * - `add_gst`    — the amount is the base price; GST is added on top.
 * - `price_only` — the amount is the final sale price; GST is already included.
 */
export const PRICE_MODES = ['add_gst', 'price_only'] as const;
export type PriceMode = (typeof PRICE_MODES)[number];

/** GST rates are stored in basis points: 1800 = 18.00%. */
export type BasisPoints = number;

export const DEFAULT_GST_RATE_BP: BasisPoints = 1800;
export const MAX_GST_RATE_BP: BasisPoints = 10_000;

export interface PriceBreakdown {
  basePaisa: Paisa;
  gstPaisa: Paisa;
  finalPaisa: Paisa;
}

export function assertRate(rateBp: number): asserts rateBp is BasisPoints {
  if (!Number.isSafeInteger(rateBp) || rateBp < 0 || rateBp > MAX_GST_RATE_BP) {
    throw new MoneyError(`GST rate must be between 0% and 100%, got ${rateBp / 100}%`);
  }
}

/**
 * Splits an entered amount into base, GST and final price.
 * In `price_only` mode the final price is exactly what was entered;
 * any paisa rounding goes into the base/GST split, never into the total.
 */
export function computePrice(
  mode: PriceMode,
  amountPaisa: Paisa,
  rateBp: BasisPoints,
): PriceBreakdown {
  assertPaisa(amountPaisa);
  assertRate(rateBp);
  if (amountPaisa < 0) throw new MoneyError('Price cannot be negative');

  if (mode === 'add_gst') {
    const gstPaisa = divRound(amountPaisa * rateBp, 10_000);
    return { basePaisa: amountPaisa, gstPaisa, finalPaisa: amountPaisa + gstPaisa };
  }
  const gstPaisa = divRound(amountPaisa * rateBp, 10_000 + rateBp);
  return { basePaisa: amountPaisa - gstPaisa, gstPaisa, finalPaisa: amountPaisa };
}

/** Parses "18", "17.5" or "18%" into basis points. */
export function parsePercent(input: string | number): BasisPoints {
  const text = String(input).trim().replace(/%$/, '').trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) {
    throw new MoneyError(`Invalid GST rate: "${String(input)}"`);
  }
  const [whole = '0', fraction = ''] = text.split('.');
  const rateBp = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  assertRate(rateBp);
  return rateBp;
}

export function formatPercent(rateBp: BasisPoints): string {
  const value = rateBp / 100;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(/0$/, '')}%`;
}
