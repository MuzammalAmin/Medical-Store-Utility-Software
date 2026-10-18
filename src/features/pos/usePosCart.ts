import { useMemo, useState } from 'react';
import { BillError, buildBill, type Bill } from '@shared/domain/bill';
import type { Discount } from '@shared/domain/cart';
import type { SaleUnit } from '@shared/domain/units';
import type { CartDraft, PosItem } from '@shared/ipc/schemas/sales';

export interface CartLine {
  key: number;
  item: PosItem;
  /** Null = first expiry, first out. */
  batchId: number | null;
  unit: SaleUnit;
  qty: number;
  discount: Discount | null;
}

export interface Customer {
  customerName: string;
  customerPhone: string;
  doctorName: string;
}

const EMPTY_CUSTOMER: Customer = { customerName: '', customerPhone: '', doctorName: '' };
let nextKey = 1;

/** Default selling unit: a strip where the pack has strips, otherwise the whole pack. */
export function defaultUnit(item: PosItem): SaleUnit {
  return item.units.includes('strip') ? 'strip' : 'box';
}

/**
 * POS cart state. Prices and stock checks come from the same `buildBill` the
 * main process uses at checkout, so the screen always shows the final total.
 */
export function usePosCart() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [billDiscount, setBillDiscount] = useState<Discount | null>(null);
  const [customer, setCustomer] = useState<Customer>(EMPTY_CUSTOMER);
  const [heldBillId, setHeldBillId] = useState<number | null>(null);

  const { bill, error } = useMemo((): { bill: Bill | null; error: string | null } => {
    if (lines.length === 0) return { bill: null, error: null };
    try {
      const items = new Map(lines.map((l) => [l.item.id, l.item]));
      const input = lines.map((l) => ({
        itemId: l.item.id,
        batchId: l.batchId,
        unit: l.unit,
        qty: l.qty,
        discount: l.discount,
      }));
      return { bill: buildBill(input, items, billDiscount), error: null };
    } catch (e) {
      return {
        bill: null,
        error: e instanceof BillError || e instanceof Error ? e.message : 'The bill is not valid',
      };
    }
  }, [lines, billDiscount]);

  const update = (key: number, change: Partial<Omit<CartLine, 'key' | 'item'>>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));

  return {
    lines,
    bill,
    error,
    selected,
    setSelected,
    billDiscount,
    setBillDiscount,
    customer,
    setCustomer,
    heldBillId,

    /** Adds an item, or one more of it when the same item and unit is already on the bill. */
    add(item: PosItem, unit: SaleUnit = defaultUnit(item)) {
      const existing = lines.find(
        (l) => l.item.id === item.id && l.unit === unit && l.batchId === null,
      );
      if (existing) {
        update(existing.key, { qty: existing.qty + 1 });
        setSelected(existing.key);
        return;
      }
      const key = nextKey++;
      setLines((ls) => [...ls, { key, item, batchId: null, unit, qty: 1, discount: null }]);
      setSelected(key);
    },
    update,
    remove(key: number): CartLine | undefined {
      const index = lines.findIndex((l) => l.key === key);
      const line = lines[index];
      setLines((ls) => ls.filter((l) => l.key !== key));
      const next = lines[index + 1] ?? lines[index - 1];
      setSelected(next && next.key !== key ? next.key : null);
      return line;
    },
    restore(line: CartLine) {
      setLines((ls) => [...ls, line]);
      setSelected(line.key);
    },
    clear() {
      setLines([]);
      setSelected(null);
      setBillDiscount(null);
      setCustomer(EMPTY_CUSTOMER);
      setHeldBillId(null);
    },
    /** Snapshot for holding the bill or checking out. */
    draft(): CartDraft {
      return {
        lines: lines.map((l) => ({
          itemId: l.item.id,
          batchId: l.batchId,
          unit: l.unit,
          qty: l.qty,
          discount: l.discount,
        })),
        billDiscount,
        ...customer,
      };
    },
    /** Loads a held bill with fresh item data; lines whose item is gone are dropped. */
    load(draft: CartDraft, items: PosItem[], heldId: number) {
      const byId = new Map(items.map((i) => [i.id, i]));
      const loaded = draft.lines.flatMap((l) => {
        const item = byId.get(l.itemId);
        return item
          ? [
              {
                key: nextKey++,
                item,
                batchId: l.batchId,
                unit: l.unit,
                qty: l.qty,
                discount: l.discount,
              },
            ]
          : [];
      });
      setLines(loaded);
      setSelected(loaded[0]?.key ?? null);
      setBillDiscount(draft.billDiscount);
      setCustomer({
        customerName: draft.customerName,
        customerPhone: draft.customerPhone,
        doctorName: draft.doctorName,
      });
      setHeldBillId(heldId);
      return draft.lines.length - loaded.length;
    },
  };
}

export type PosCart = ReturnType<typeof usePosCart>;
