import {
  allocate,
  discountOn,
  priceCart,
  type Discount,
  type PricedCart,
  type PricedLine,
} from './cart';
import type { BasisPoints, PriceMode } from './gst';
import type { Paisa } from './money';
import { availableUnits, unitFactor, type SaleUnit } from './units';

/**
 * Turns cart lines into priced bill parts (PRD §3.3, §3.5). Shared by the POS
 * screen and the main process so both always agree on stock and totals.
 *
 * Stock is taken first-expiry-first-out (FEFO) in whole units of what was
 * sold; a line can be split across batches, each part priced at its own
 * batch's price.
 */
export class BillError extends Error {
  override name = 'BillError';
}

export interface BillBatch {
  id: number;
  batchNo: string;
  expiry: string;
  /** Available stock in smallest units. */
  qty: number;
  priceMode: PriceMode;
  gstRateBp: BasisPoints;
  unitAmounts: Record<SaleUnit, Paisa>;
  unitFinal: Record<SaleUnit, Paisa>;
}

export interface BillItem {
  id: number;
  name: string;
  tabsPerStrip: number;
  stripsPerBox: number;
  /** Sellable batches only (unexpired, in stock), first expiry first. */
  batches: BillBatch[];
}

export interface BillLineInput {
  itemId: number;
  batchId: number | null;
  unit: SaleUnit;
  qty: number;
  discount: Discount | null;
}

export interface BillPart {
  lineIndex: number;
  itemId: number;
  itemName: string;
  batch: BillBatch;
  unit: SaleUnit;
  qty: number;
  qtyTabs: number;
  priced: PricedLine;
}

export interface Bill {
  parts: BillPart[];
  /** Totals per cart line (parts added together), in cart order. */
  lineTotals: Pick<PricedLine, 'subtotalPaisa' | 'discountPaisa' | 'gstPaisa' | 'totalPaisa'>[];
  cart: PricedCart;
}

/** Whole units of `unit` to take from each batch, oldest expiry first. */
export function allocateFefo(
  batches: BillBatch[],
  qty: number,
  factor: number,
): { batch: BillBatch; units: number }[] {
  const result: { batch: BillBatch; units: number }[] = [];
  let remaining = qty;
  for (const batch of batches) {
    if (remaining === 0) break;
    const units = Math.min(Math.floor(batch.qty / factor), remaining);
    if (units > 0) {
      result.push({ batch, units });
      remaining -= units;
    }
  }
  return remaining === 0 ? result : [];
}

function availableWhole(batches: BillBatch[], factor: number): number {
  return batches.reduce((sum, b) => sum + Math.floor(b.qty / factor), 0);
}

export function buildBill(
  lines: BillLineInput[],
  items: ReadonlyMap<number, BillItem>,
  billDiscount: Discount | null,
): Bill {
  // Stock already taken by earlier lines of the same bill.
  const used = new Map<number, number>();
  const remaining = (b: BillBatch): BillBatch => ({ ...b, qty: b.qty - (used.get(b.id) ?? 0) });

  const parts: Omit<BillPart, 'priced'>[] = [];
  const partDiscounts: (Discount | null)[] = [];

  lines.forEach((line, lineIndex) => {
    const item = items.get(line.itemId);
    if (!item) throw new BillError('An item on the bill is no longer available');
    const pack = { tabsPerStrip: item.tabsPerStrip, stripsPerBox: item.stripsPerBox };
    if (!availableUnits(pack).includes(line.unit)) {
      throw new BillError(`${item.name} cannot be sold by the ${line.unit}`);
    }
    const factor = unitFactor(line.unit, pack);
    const candidates = (
      line.batchId === null ? item.batches : item.batches.filter((b) => b.id === line.batchId)
    ).map(remaining);
    if (line.batchId !== null && candidates.length === 0) {
      throw new BillError(`The chosen batch of ${item.name} is expired or out of stock`);
    }
    const allocation = allocateFefo(candidates, line.qty, factor);
    if (allocation.length === 0) {
      const have = availableWhole(candidates, factor);
      throw new BillError(
        `Only ${have} ${line.unit}${have === 1 ? '' : 's'} of ${item.name} in stock${
          line.batchId === null ? '' : ' in this batch'
        }`,
      );
    }

    // Line discounts follow the parts: a percentage applies to each part,
    // a fixed amount is shared in proportion to each part's value.
    const grosses = allocation.map((a) => a.batch.unitAmounts[line.unit] * a.units);
    const gross = grosses.reduce((s, g) => s + g, 0);
    const amountShares =
      line.discount?.kind === 'amount' ? allocate(discountOn(gross, line.discount), grosses) : null;

    allocation.forEach((a, i) => {
      used.set(a.batch.id, (used.get(a.batch.id) ?? 0) + a.units * factor);
      const original = item.batches.find((b) => b.id === a.batch.id)!;
      parts.push({
        lineIndex,
        itemId: item.id,
        itemName: item.name,
        batch: original,
        unit: line.unit,
        qty: a.units,
        qtyTabs: a.units * factor,
      });
      partDiscounts.push(
        amountShares ? { kind: 'amount', paisa: amountShares[i]! } : line.discount,
      );
    });
  });

  const cart = priceCart(
    parts.map((p, i) => ({
      priceMode: p.batch.priceMode,
      gstRateBp: p.batch.gstRateBp,
      unitAmountPaisa: p.batch.unitAmounts[p.unit],
      qty: p.qty,
      discount: partDiscounts[i] ?? null,
    })),
    billDiscount,
  );

  const lineTotals = lines.map(() => ({
    subtotalPaisa: 0,
    discountPaisa: 0,
    gstPaisa: 0,
    totalPaisa: 0,
  }));
  const priced = parts.map((p, i) => {
    const pl = cart.lines[i]!;
    const t = lineTotals[p.lineIndex]!;
    t.subtotalPaisa += pl.subtotalPaisa;
    t.discountPaisa += pl.discountPaisa;
    t.gstPaisa += pl.gstPaisa;
    t.totalPaisa += pl.totalPaisa;
    return { ...p, priced: pl };
  });
  return { parts: priced, lineTotals, cart };
}
