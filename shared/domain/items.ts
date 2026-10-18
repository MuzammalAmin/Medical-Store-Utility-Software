import type { ItemForm } from '../import/template';
import { computePrice, type BasisPoints, type PriceMode } from './gst';
import type { Paisa } from './money';
import { derivedUnitPrice, type PackSize, type SaleUnit } from './units';

const FORM_SHORT: Record<ItemForm, string> = {
  tablet: 'Tab',
  capsule: 'Cap',
  syrup: 'Syp',
  suspension: 'Susp',
  injection: 'Inj',
  cream: 'Cream',
  ointment: 'Oint',
  drops: 'Drops',
  inhaler: 'Inhaler',
  sachet: 'Sachet',
  other: '',
};

/** "Panadol 500mg Tab" — the name printed on receipts and shown at the POS. */
export function itemDisplayName(item: {
  brandName: string;
  strength: string;
  form: ItemForm;
}): string {
  return [item.brandName, item.strength, FORM_SHORT[item.form]].filter(Boolean).join(' ');
}

/** "10 × 20" style pack label, or "1 pack" for items sold whole. */
export function packLabel(pack: PackSize): string {
  if (pack.stripsPerBox === 1 && pack.tabsPerStrip === 1) return 'Single unit';
  if (pack.stripsPerBox === 1) return `${pack.tabsPerStrip} per pack`;
  return `${pack.stripsPerBox} strips × ${pack.tabsPerStrip}`;
}

/** Human quantity from a count of smallest units, e.g. 245 tabs of 10×10 → "2 box 4 strip 5 tab". */
export function describeQty(tabs: number, pack: PackSize): string {
  const perBox = pack.tabsPerStrip * pack.stripsPerBox;
  if (perBox === 1) return `${tabs}`;
  const sign = tabs < 0 ? '−' : '';
  let rest = Math.abs(tabs);
  const boxes = Math.floor(rest / perBox);
  rest -= boxes * perBox;
  const strips = pack.stripsPerBox > 1 ? Math.floor(rest / pack.tabsPerStrip) : 0;
  rest -= strips * pack.tabsPerStrip;
  const parts = [
    boxes ? `${boxes} box` : '',
    strips ? `${strips} strip` : '',
    rest ? `${rest} tab` : '',
  ].filter(Boolean);
  return sign + (parts.join(' ') || '0');
}

export interface StoredPrice {
  priceMode: PriceMode;
  gstRateBp: BasisPoints;
  basePriceBoxPaisa: Paisa;
  finalPriceBoxPaisa: Paisa;
}

/** Turns the amount the Owner typed (in the chosen mode) into the stored base and final box prices. */
export function storedPrice(
  priceMode: PriceMode,
  gstRateBp: BasisPoints,
  amountBoxPaisa: Paisa,
): StoredPrice {
  const p = computePrice(priceMode, amountBoxPaisa, gstRateBp);
  return { priceMode, gstRateBp, basePriceBoxPaisa: p.basePaisa, finalPriceBoxPaisa: p.finalPaisa };
}

/** The box amount in the price's own mode (base for add_gst, final for price_only). */
export function boxAmount(price: StoredPrice): Paisa {
  return price.priceMode === 'add_gst' ? price.basePriceBoxPaisa : price.finalPriceBoxPaisa;
}

/**
 * Amount for one unit in the price's mode. Strip and tablet prices come from
 * the box price unless the item has a manual override (stored in the same mode).
 */
export function unitAmount(
  price: StoredPrice,
  unit: SaleUnit,
  pack: PackSize,
  overrides: { strip: Paisa | null; tab: Paisa | null } = { strip: null, tab: null },
): Paisa {
  if (unit === 'strip' && overrides.strip !== null) return overrides.strip;
  if (unit === 'tab' && overrides.tab !== null) return overrides.tab;
  return derivedUnitPrice(boxAmount(price), unit, pack);
}

/** Final (GST-inclusive) price of one unit, as shown to the customer. */
export function unitFinalPrice(price: StoredPrice, amount: Paisa): Paisa {
  return computePrice(price.priceMode, amount, price.gstRateBp).finalPaisa;
}
