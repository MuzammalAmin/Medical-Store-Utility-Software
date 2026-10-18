import { describe, expect, it } from 'vitest';
import {
  allocate,
  discountShareBp,
  priceCart,
  proportionalShare,
  type CartLineInput,
} from './cart';
import { MoneyError } from './money';

const addGst: CartLineInput = {
  priceMode: 'add_gst',
  gstRateBp: 1800,
  unitAmountPaisa: 10_000,
  qty: 1,
};
const inclusive: CartLineInput = {
  priceMode: 'price_only',
  gstRateBp: 1800,
  unitAmountPaisa: 11_800,
  qty: 1,
};
const exempt: CartLineInput = {
  priceMode: 'price_only',
  gstRateBp: 0,
  unitAmountPaisa: 36_000,
  qty: 2,
};

describe('priceCart', () => {
  it('prices both GST modes the same way for the same final price', () => {
    const cart = priceCart([addGst, inclusive]);
    expect(cart.lines[0]).toMatchObject({
      subtotalPaisa: 10_000,
      gstPaisa: 1_800,
      totalPaisa: 11_800,
    });
    expect(cart.lines[1]).toMatchObject({
      subtotalPaisa: 10_000,
      gstPaisa: 1_800,
      totalPaisa: 11_800,
    });
    expect(cart.totalPaisa).toBe(23_600);
  });

  it('applies discounts before GST', () => {
    const cart = priceCart([{ ...addGst, discount: { kind: 'percent', bp: 1000 } }]);
    // Rs 100 − 10% = Rs 90, GST 18% = Rs 16.20
    expect(cart.lines[0]).toMatchObject({
      discountPaisa: 1_000,
      gstPaisa: 1_620,
      totalPaisa: 10_620,
    });
  });

  it('keeps subtotal − discount + GST = total for every line and the bill', () => {
    const cart = priceCart(
      [
        { ...addGst, qty: 3, discount: { kind: 'amount', paisa: 777 } },
        { ...inclusive, qty: 7 },
        exempt,
      ],
      { kind: 'percent', bp: 333 },
    );
    for (const l of cart.lines)
      expect(l.subtotalPaisa - l.discountPaisa + l.gstPaisa).toBe(l.totalPaisa);
    expect(cart.subtotalPaisa - cart.discountPaisa + cart.gstPaisa).toBe(cart.totalPaisa);
  });

  it('shares a bill discount in proportion to line amounts', () => {
    const cart = priceCart([exempt, { ...exempt, qty: 1 }], { kind: 'amount', paisa: 3_000 });
    expect(cart.lines.map((l) => l.discountAmountPaisa)).toEqual([2_000, 1_000]);
    expect(cart.totalPaisa).toBe(108_000 - 3_000);
  });

  it('rejects impossible discounts and quantities', () => {
    expect(() => priceCart([{ ...addGst, discount: { kind: 'amount', paisa: 20_000 } }])).toThrow(
      MoneyError,
    );
    expect(() => priceCart([{ ...addGst, qty: 0 }])).toThrow(MoneyError);
    expect(() => priceCart([addGst], { kind: 'percent', bp: 10_001 })).toThrow(MoneyError);
  });

  it('reports the discount share for the staff limit', () => {
    expect(discountShareBp(priceCart([addGst], { kind: 'percent', bp: 1000 }))).toBe(1000);
  });
});

describe('allocate', () => {
  it('always adds up to the total', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [0, 0])).toEqual([0, 0]);
  });
});

describe('proportionalShare', () => {
  it('refunds exactly the line total over several partial returns', () => {
    const total = 10_000;
    const first = proportionalShare(total, 0, 3, 0, 1);
    const second = proportionalShare(total, first, 3, 1, 1);
    const last = proportionalShare(total, first + second, 3, 2, 1);
    expect(first + second + last).toBe(total);
    expect(() => proportionalShare(total, 0, 3, 2, 2)).toThrow(MoneyError);
  });
});
