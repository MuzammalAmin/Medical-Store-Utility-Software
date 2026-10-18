import { describe, expect, it } from 'vitest';
import { BillError, buildBill, type BillBatch, type BillItem } from './bill';

function batch(id: number, expiry: string, qty: number, boxPaisa: number): BillBatch {
  return {
    id,
    batchNo: `B${id}`,
    expiry,
    qty,
    priceMode: 'price_only',
    gstRateBp: 0,
    unitAmounts: { box: boxPaisa, strip: boxPaisa / 10, tab: boxPaisa / 100 },
    unitFinal: { box: boxPaisa, strip: boxPaisa / 10, tab: boxPaisa / 100 },
  };
}

const panadol: BillItem = {
  id: 1,
  name: 'Panadol 500mg Tab',
  tabsPerStrip: 10,
  stripsPerBox: 10,
  // FEFO order: the older batch is cheaper.
  batches: [batch(10, '2027-01-31', 25, 10_000), batch(11, '2027-06-30', 200, 12_000)],
};
const items = new Map([[1, panadol]]);

describe('buildBill', () => {
  it('takes the earliest expiry first, in whole units, across batches', () => {
    const bill = buildBill(
      [{ itemId: 1, batchId: null, unit: 'strip', qty: 4, discount: null }],
      items,
      null,
    );
    // Batch 10 has 25 tabs = 2 whole strips; the other 2 strips come from batch 11.
    expect(bill.parts.map((p) => [p.batch.id, p.qty])).toEqual([
      [10, 2],
      [11, 2],
    ]);
    expect(bill.lineTotals[0]!.totalPaisa).toBe(2 * 1_000 + 2 * 1_200);
  });

  it('uses only the chosen batch when one is picked', () => {
    const bill = buildBill(
      [{ itemId: 1, batchId: 11, unit: 'tab', qty: 5, discount: null }],
      items,
      null,
    );
    expect(bill.parts).toHaveLength(1);
    expect(bill.parts[0]!.batch.id).toBe(11);
  });

  it('counts stock already used by earlier lines of the same bill', () => {
    expect(() =>
      buildBill(
        [
          { itemId: 1, batchId: null, unit: 'box', qty: 2, discount: null },
          { itemId: 1, batchId: null, unit: 'tab', qty: 30, discount: null },
        ],
        items,
        null,
      ),
    ).toThrow(/Only 25 tabs/);
  });

  it('shares a fixed line discount across the split parts', () => {
    const bill = buildBill(
      [
        {
          itemId: 1,
          batchId: null,
          unit: 'strip',
          qty: 4,
          discount: { kind: 'amount', paisa: 440 },
        },
      ],
      items,
      null,
    );
    expect(bill.lineTotals[0]!.totalPaisa).toBe(4_400 - 440);
  });

  it('explains what is wrong', () => {
    expect(() =>
      buildBill([{ itemId: 2, batchId: null, unit: 'box', qty: 1, discount: null }], items, null),
    ).toThrow(BillError);
    expect(() =>
      buildBill([{ itemId: 1, batchId: 99, unit: 'box', qty: 1, discount: null }], items, null),
    ).toThrow(/chosen batch/);
  });
});
