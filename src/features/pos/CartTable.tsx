import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatExpiry } from '@shared/domain/dates';
import { formatRupees } from '@shared/domain/money';
import type { SaleUnit } from '@shared/domain/units';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PosCart } from './usePosCart';

/** The bill being built. Click or ↑/↓ selects a line; shortcuts act on the selected line. */
export function CartTable({ cart, onRemove }: { cart: PosCart; onRemove: (key: number) => void }) {
  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <p className="text-lg">The bill is empty</p>
        <p className="text-sm">Scan a barcode or type a medicine name above.</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-muted text-left text-muted-foreground">
          <tr>
            <th className="w-10 px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="w-28 px-3 py-2 font-medium">Unit</th>
            <th className="w-36 px-3 py-2 font-medium">Qty</th>
            <th className="px-3 py-2 text-right font-medium">Rate</th>
            <th className="px-3 py-2 text-right font-medium">Disc.</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {cart.lines.map((line, i) => {
            const parts = cart.bill?.parts.filter((p) => p.lineIndex === i) ?? [];
            const totals = cart.bill?.lineTotals[i];
            const batch =
              line.batchId === null
                ? line.item.batches[0]
                : line.item.batches.find((b) => b.id === line.batchId);
            const rate = batch?.unitFinal[line.unit];
            const selected = cart.selected === line.key;
            return (
              <tr
                key={line.key}
                onClick={() => cart.setSelected(line.key)}
                aria-selected={selected}
                className={cn(
                  'cursor-pointer border-b',
                  selected && 'bg-primary-soft/50 outline-2 -outline-offset-2 outline-primary',
                )}
              >
                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">
                    {line.item.name} {line.item.rxRequired && <Badge tone="warning">Rx</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(parts.length > 0 ? parts.map((p) => p.batch) : batch ? [batch] : [])
                      .map(
                        (b) =>
                          `${b.batchNo} · exp ${formatExpiry(b.expiry)}${b.id === line.batchId ? ' (chosen)' : ''}`,
                      )
                      .join('  |  ') || 'No stock'}
                    {(parts.length > 0
                      ? parts.some((p) => isNear(line, p.batch.id))
                      : batch?.nearExpiry) && (
                      <Badge tone="warning" className="ml-2">
                        Expiring soon
                      </Badge>
                    )}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <select
                    aria-label="Unit"
                    value={line.unit}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => cart.update(line.key, { unit: e.target.value as SaleUnit })}
                    className="h-8 rounded-md border bg-surface px-2"
                  >
                    {line.item.units.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      aria-label="One less"
                      className="grid size-8 place-items-center rounded-md border hover:bg-surface-muted"
                      onClick={() => line.qty > 1 && cart.update(line.key, { qty: line.qty - 1 })}
                    >
                      <Minus className="size-4" />
                    </button>
                    <input
                      aria-label="Quantity"
                      inputMode="numeric"
                      value={line.qty}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/\D/g, ''));
                        if (n >= 1 && n <= 100_000) cart.update(line.key, { qty: n });
                      }}
                      className="h-8 w-14 rounded-md border bg-surface text-center tabular-nums"
                    />
                    <button
                      type="button"
                      aria-label="One more"
                      className="grid size-8 place-items-center rounded-md border hover:bg-surface-muted"
                      onClick={() => cart.update(line.key, { qty: line.qty + 1 })}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {rate !== undefined ? formatRupees(rate) : '—'}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                  {totals?.discountPaisa ? `−${formatRupees(totals.discountPaisa)}` : ''}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {totals ? formatRupees(totals.totalPaisa) : '—'}
                </td>
                <td className="px-2">
                  <button
                    type="button"
                    aria-label={`Remove ${line.item.name}`}
                    className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(line.key);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function isNear(line: PosCart['lines'][number], batchId: number): boolean {
  return line.item.batches.find((b) => b.id === batchId)?.nearExpiry ?? false;
}
