import { computePrice, type BasisPoints, type PriceMode } from './gst';
import { assertPaisa, divRound, MoneyError, type Paisa } from './money';

/**
 * Bill pricing (PRD §3.5). Rules:
 * - A line's "amount" is in the item's own price mode: the base price for
 *   `add_gst`, the GST-inclusive price for `price_only`.
 * - Discounts reduce that amount, i.e. they are applied before GST.
 * - A bill discount is shared across lines in proportion to their amounts.
 * - For every line and the bill: subtotal − discount + GST = total.
 */
export type Discount = { kind: 'percent'; bp: BasisPoints } | { kind: 'amount'; paisa: Paisa };

export interface CartLineInput {
  priceMode: PriceMode;
  gstRateBp: BasisPoints;
  /** Price of one unit (box, strip or tablet) in the line's price mode. */
  unitAmountPaisa: Paisa;
  qty: number;
  discount?: Discount | null;
}

export interface PricedLine {
  /** Amount before any discount (unit amount × qty). */
  grossAmountPaisa: Paisa;
  /** Discount taken off the amount (line + share of bill discount). */
  discountAmountPaisa: Paisa;
  /** Base price (excluding GST) before discount. */
  subtotalPaisa: Paisa;
  /** Discount in base-price terms, so subtotal − discount + gst = total. */
  discountPaisa: Paisa;
  gstPaisa: Paisa;
  totalPaisa: Paisa;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotalPaisa: Paisa;
  discountPaisa: Paisa;
  gstPaisa: Paisa;
  totalPaisa: Paisa;
}

export function discountOn(amount: Paisa, discount: Discount | null | undefined): Paisa {
  if (!discount) return 0;
  const value =
    discount.kind === 'percent' ? divRound(amount * discount.bp, 10_000) : discount.paisa;
  assertPaisa(value, 'discount');
  if (value < 0) throw new MoneyError('Discount cannot be negative');
  if (discount.kind === 'percent' && discount.bp > 10_000) {
    throw new MoneyError('Discount cannot be more than 100%');
  }
  if (value > amount) throw new MoneyError('Discount cannot be more than the price');
  return value;
}

/** Splits `total` across `weights` in proportion, using largest remainders so the parts add up exactly. */
export function allocate(total: Paisa, weights: number[]): Paisa[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    parts[i]! += 1;
    rest -= 1;
  }
  return parts;
}

function priceOne(line: CartLineInput, discountAmount: Paisa, gross: Paisa): PricedLine {
  const before = computePrice(line.priceMode, gross, line.gstRateBp);
  const after = computePrice(line.priceMode, gross - discountAmount, line.gstRateBp);
  return {
    grossAmountPaisa: gross,
    discountAmountPaisa: discountAmount,
    subtotalPaisa: before.basePaisa,
    discountPaisa: before.basePaisa - after.basePaisa,
    gstPaisa: after.gstPaisa,
    totalPaisa: after.finalPaisa,
  };
}

export function priceCart(lines: CartLineInput[], billDiscount?: Discount | null): PricedCart {
  const grosses = lines.map((line) => {
    if (!Number.isSafeInteger(line.qty) || line.qty < 1) {
      throw new MoneyError('Quantity must be a whole number of at least 1');
    }
    assertPaisa(line.unitAmountPaisa, 'unit price');
    return line.unitAmountPaisa * line.qty;
  });
  const lineDiscounts = lines.map((line, i) => discountOn(grosses[i]!, line.discount));
  const afterLine = grosses.map((g, i) => g - lineDiscounts[i]!);
  const billAmount = discountOn(
    afterLine.reduce((a, b) => a + b, 0),
    billDiscount,
  );
  const shares = allocate(billAmount, afterLine);

  const priced = lines.map((line, i) =>
    priceOne(line, lineDiscounts[i]! + shares[i]!, grosses[i]!),
  );
  const sum = (key: keyof PricedLine) => priced.reduce((a, l) => a + l[key], 0);
  return {
    lines: priced,
    subtotalPaisa: sum('subtotalPaisa'),
    discountPaisa: sum('discountPaisa'),
    gstPaisa: sum('gstPaisa'),
    totalPaisa: sum('totalPaisa'),
  };
}

/** Total discount as a share of the gross amount, in basis points (for the staff discount limit). */
export function discountShareBp(cart: PricedCart): BasisPoints {
  const gross = cart.lines.reduce((a, l) => a + l.grossAmountPaisa, 0);
  const discount = cart.lines.reduce((a, l) => a + l.discountAmountPaisa, 0);
  return gross === 0 ? 0 : Math.ceil((discount * 10_000) / gross);
}

/** Refund for returning `qty` of a sold line, so that returning everything refunds the exact line total. */
export function proportionalShare(
  lineValue: Paisa,
  alreadyReturnedValue: Paisa,
  soldQty: number,
  returnedBefore: number,
  qty: number,
): Paisa {
  if (returnedBefore + qty > soldQty) throw new MoneyError('Cannot return more than was sold');
  if (returnedBefore + qty === soldQty) return lineValue - alreadyReturnedValue;
  return divRound(lineValue * qty, soldQty);
}
