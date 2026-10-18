import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { parseExpiry, todayIso } from '@shared/domain/dates';
import { parsePercent } from '@shared/domain/gst';
import { describeQty } from '@shared/domain/items';
import { availableUnits, toSmallestUnits, type SaleUnit } from '@shared/domain/units';
import type { IpcInput } from '@shared/ipc/contract';
import { ADJUST_REASONS, type BatchRow, type ItemDetail } from '@shared/ipc/schemas/catalog';
import { queryKeys } from '@/app/queries';
import { PriceModeField } from '@/components/pricing/PriceModeField';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput, paisaToText, rupeesToPaisa } from '@/components/ui/money-input';
import { Select } from '@/components/ui/select';
import { errorMessage, ipc } from '@/lib/ipc';

function useStockInvalidation() {
  const client = useQueryClient();
  return () => {
    for (const key of [queryKeys.items, queryKeys.inventory, queryKeys.dashboard]) {
      void client.invalidateQueries({ queryKey: key });
    }
  };
}

/** Opening stock / stock received for one item (PRD §3.3). */
export function AddBatchDialog({ item, onClose }: { item: ItemDetail; onClose: () => void }) {
  const invalidate = useStockInvalidation();
  const units = availableUnits(item);
  const [f, setF] = useState({
    batchNo: '',
    expiry: '',
    qty: '',
    unit: 'box' as SaleUnit,
    cost: '',
    newPrice: false,
    priceMode: item.priceMode,
    rate: String(item.gstRateBp / 100),
    amount: paisaToText(
      item.priceMode === 'add_gst' ? item.basePriceBoxPaisa : item.finalPriceBoxPaisa,
    ),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) =>
    setF((p) => ({ ...p, [key]: value }));

  const add = useMutation({
    mutationFn: (input: IpcInput<'inventory:addBatch'>) => ipc('inventory:addBatch', input),
    onSuccess: (batch) => {
      invalidate();
      toast.success(`Added ${describeQty(batch.qty, batch)} to batch ${batch.batchNo}`);
      onClose();
    },
  });

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const e: Record<string, string> = {};
    const expiry = parseExpiry(f.expiry);
    const qty = Number(f.qty);
    const cost = f.cost ? rupeesToPaisa(f.cost) : 0;
    const amount = rupeesToPaisa(f.amount);
    let rateBp = 0;
    if (!f.batchNo.trim()) e['batchNo'] = 'Batch number is required';
    if (!expiry) e['expiry'] = 'Use MM/YYYY or DD/MM/YYYY';
    else if (expiry < todayIso()) e['expiry'] = 'This batch has already expired';
    if (!Number.isInteger(qty) || qty < 1) e['qty'] = 'Whole number, 1 or more';
    if (cost === null) e['cost'] = 'Not a valid amount';
    if (f.newPrice) {
      if (!amount) e['amount'] = 'Enter a price above 0';
      try {
        rateBp = parsePercent(f.rate);
      } catch {
        e['rate'] = 'Enter a rate between 0 and 100';
      }
    }
    setErrors(e);
    if (Object.keys(e).length > 0 || !expiry || cost === null) return;
    add.mutate({
      itemId: item.id,
      batchNo: f.batchNo.trim(),
      expiry,
      qty,
      unit: f.unit,
      costBoxPaisa: cost,
      price:
        f.newPrice && amount
          ? { priceMode: f.priceMode, gstRateBp: rateBp, amountBoxPaisa: amount }
          : null,
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Add stock: ${item.name}`}
      className="max-w-2xl"
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Batch number" error={errors['batchNo']}>
            <Input autoFocus value={f.batchNo} onChange={(e) => set('batchNo', e.target.value)} />
          </Field>
          <Field label="Expiry" hint="MM/YYYY as printed on the pack" error={errors['expiry']}>
            <Input
              placeholder="11/2027"
              value={f.expiry}
              onChange={(e) => set('expiry', e.target.value)}
            />
          </Field>
          <Field label="Quantity" error={errors['qty']}>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                value={f.qty}
                onChange={(e) => set('qty', e.target.value)}
              />
              <Select
                value={f.unit}
                onChange={(e) => set('unit', e.target.value as SaleUnit)}
                className="w-32"
                aria-label="Unit"
              >
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field
            label="Cost price per box"
            hint="What you paid the distributor"
            error={errors['cost']}
          >
            <MoneyInput value={f.cost} onChange={(e) => set('cost', e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={f.newPrice}
            onChange={(e) => set('newPrice', e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          This batch has a different sale price
        </label>
        {f.newPrice && (
          <div className="flex flex-col gap-3">
            <Field label="Price per box" error={errors['amount']} className="max-w-xs">
              <MoneyInput value={f.amount} onChange={(e) => set('amount', e.target.value)} />
            </Field>
            <PriceModeField
              mode={f.priceMode}
              onModeChange={(m) => set('priceMode', m)}
              rate={f.rate}
              onRateChange={(r) => set('rate', r)}
              previewAmountPaisa={rupeesToPaisa(f.amount) ?? 0}
              rateError={errors['rate']}
            />
          </div>
        )}
        {add.error && <Alert tone="danger">{errorMessage(add.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={add.isPending}>
            Add stock
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const REASON_LABELS: Record<(typeof ADJUST_REASONS)[number], string> = {
  damaged: 'Damaged / broken',
  lost: 'Lost / missing',
  count_correction: 'Stock count correction',
  expired: 'Expired: write off',
  other: 'Other',
};

/** Owner-only stock correction for one batch (PRD §3.3). */
export function AdjustDialog({ batch, onClose }: { batch: BatchRow; onClose: () => void }) {
  const invalidate = useStockInvalidation();
  const units = availableUnits(batch);
  const [direction, setDirection] = useState<'remove' | 'add'>('remove');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<SaleUnit>(units[units.length - 1]!);
  const [reason, setReason] = useState<(typeof ADJUST_REASONS)[number]>('damaged');
  const [note, setNote] = useState('');
  const n = Number(qty);
  const valid = Number.isInteger(n) && n > 0;
  const tabs = valid ? toSmallestUnits(n, unit, batch) : 0;

  const adjust = useMutation({
    mutationFn: () =>
      ipc('inventory:adjust', {
        batchId: batch.id,
        qtyChange: direction === 'remove' ? -tabs : tabs,
        reason,
        note,
      }),
    onSuccess: (b) => {
      invalidate();
      toast.success(`Batch ${b.batchNo} now has ${describeQty(b.qty, b)}`);
      onClose();
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Adjust stock: ${batch.itemName}`}
      description={`Batch ${batch.batchNo} · in stock ${describeQty(batch.qty, batch)}`}
    >
      <div className="flex flex-col gap-4">
        <div role="radiogroup" className="grid grid-cols-2 gap-2">
          {(['remove', 'add'] as const).map((d) => (
            <label
              key={d}
              className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm has-checked:border-primary"
            >
              <input
                type="radio"
                checked={direction === d}
                onChange={() => setDirection(d)}
                className="accent-[var(--primary)]"
              />
              {d === 'remove' ? 'Remove stock' : 'Add stock'}
            </label>
          ))}
        </div>
        <Field label="Quantity">
          <div className="flex gap-2">
            <Input
              autoFocus
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <Select
              value={unit}
              onChange={(e) => setUnit(e.target.value as SaleUnit)}
              className="w-32"
              aria-label="Unit"
            >
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
        </Field>
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            {ADJUST_REASONS.map((r) => (
              <option key={r} value={r}>
                {REASON_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note" hint="Optional">
          <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {adjust.error && <Alert tone="danger">{errorMessage(adjust.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => adjust.mutate()}
            loading={adjust.isPending}
            disabled={!valid}
            variant={direction === 'remove' ? 'danger' : 'primary'}
          >
            {direction === 'remove' ? 'Remove' : 'Add'} {valid ? describeQty(tabs, batch) : ''}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
