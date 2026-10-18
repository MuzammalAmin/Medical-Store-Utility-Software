import { describe, expect, it } from 'vitest';
import { describeQty, itemDisplayName, storedPrice, unitAmount, unitFinalPrice } from './items';

const pack = { tabsPerStrip: 10, stripsPerBox: 10 };

describe('items', () => {
  it('builds display names', () => {
    expect(itemDisplayName({ brandName: 'Panadol', strength: '500mg', form: 'tablet' })).toBe(
      'Panadol 500mg Tab',
    );
    expect(itemDisplayName({ brandName: 'Dettol', strength: '', form: 'other' })).toBe('Dettol');
  });

  it('describes quantities in boxes, strips and tablets', () => {
    expect(describeQty(245, pack)).toBe('2 box 4 strip 5 tab');
    expect(describeQty(0, pack)).toBe('0');
    expect(describeQty(7, { tabsPerStrip: 1, stripsPerBox: 1 })).toBe('7');
  });

  it('derives unit prices in the price mode, with overrides', () => {
    const addGst = storedPrice('add_gst', 1800, 10_000);
    expect(addGst.finalPriceBoxPaisa).toBe(11_800);
    expect(unitAmount(addGst, 'strip', pack)).toBe(1_000);
    expect(unitFinalPrice(addGst, unitAmount(addGst, 'strip', pack))).toBe(1_180);

    const inclusive = storedPrice('price_only', 1800, 11_800);
    expect(inclusive.basePriceBoxPaisa).toBe(10_000);
    expect(unitAmount(inclusive, 'tab', pack)).toBe(118);
    expect(unitAmount(inclusive, 'tab', pack, { strip: null, tab: 150 })).toBe(150);
  });
});
