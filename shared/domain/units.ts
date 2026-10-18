import { assertPaisa, divRound, MoneyError, type Paisa } from './money';

/**
 * Pack structure of an item (PRD §3.1). Stock is always stored in the
 * smallest unit ("tab"); a syrup or cream is simply 1 × 1.
 */
export const SALE_UNITS = ['box', 'strip', 'tab'] as const;
export type SaleUnit = (typeof SALE_UNITS)[number];

export interface PackSize {
  tabsPerStrip: number;
  stripsPerBox: number;
}

export function assertPackSize(pack: PackSize): void {
  // Check only the pack fields: callers often pass a whole item.
  for (const key of ['tabsPerStrip', 'stripsPerBox'] as const) {
    const value = pack[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
      throw new MoneyError(`${key} must be a whole number between 1 and 10000`);
    }
  }
}

/** How many smallest units make up one of `unit`. */
export function unitFactor(unit: SaleUnit, pack: PackSize): number {
  assertPackSize(pack);
  switch (unit) {
    case 'box':
      return pack.tabsPerStrip * pack.stripsPerBox;
    case 'strip':
      return pack.tabsPerStrip;
    case 'tab':
      return 1;
  }
}

/** Units that make sense to sell for this pack (no "strip" when a box has one strip, etc.). */
export function availableUnits(pack: PackSize): SaleUnit[] {
  const units: SaleUnit[] = ['box'];
  if (pack.stripsPerBox > 1) units.push('strip');
  if (pack.tabsPerStrip > 1) units.push('tab');
  return units;
}

export function toSmallestUnits(qty: number, unit: SaleUnit, pack: PackSize): number {
  if (!Number.isSafeInteger(qty)) throw new MoneyError('Quantity must be a whole number');
  return qty * unitFactor(unit, pack);
}

/** Derives the price of one strip or tablet from the box price, rounded to the paisa. */
export function derivedUnitPrice(boxPricePaisa: Paisa, unit: SaleUnit, pack: PackSize): Paisa {
  assertPaisa(boxPricePaisa);
  const boxFactor = unitFactor('box', pack);
  return divRound(boxPricePaisa * unitFactor(unit, pack), boxFactor);
}

/** The next unit in the list, wrapping around (F5 at the POS). */
export function nextUnit(current: SaleUnit, units: readonly SaleUnit[]): SaleUnit {
  const index = units.indexOf(current);
  return units[(index + 1) % units.length] ?? current;
}
