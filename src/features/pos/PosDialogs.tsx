import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Printer, ReceiptText, Trash2 } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import type { Discount } from '@shared/domain/cart';
import { formatExpiry } from '@shared/domain/dates';
import { parsePercent } from '@shared/domain/gst';
import { describeQty } from '@shared/domain/items';
import { formatRupees, type Paisa } from '@shared/domain/money';
import {
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  type HeldBill,
  type PaymentMethod,
  type PosItem,
  type SaleDetail,
} from '@shared/ipc/schemas/sales';
import { queryKeys } from '@/app/queries';
import { ReceiptPreview } from '@/components/receipt/ReceiptPreview';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput, paisaToText, rupeesToPaisa } from '@/components/ui/money-input';
import { docNo } from '@/lib/format';
import { errorMessage, ipc } from '@/lib/ipc';
import { cn } from '@/lib/utils';
import { AlternativesTable } from '../items/ItemDetailDialog';

// ── Payment (F12) ──────────────────────────────────────────────────────────

export function PaymentDialog({
  total,
  pending,
  error,
  onPay,
  onClose,
}: {
  total: Paisa;
  pending: boolean;
  error: unknown;
  onPay: (method: PaymentMethod, paid: Paisa) => void;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [received, setReceived] = useState(paisaToText(total));
  const paid = method === 'cash' ? rupeesToPaisa(received) : total;
  const short = paid === null || paid < total;
  const quick = [...new Set([total, ...[50_000, 100_000, 500_000].filter((n) => n > total)])].slice(
    0,
    4,
  );

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (paid !== null && paid >= total) onPay(method, paid);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Payment" className="max-w-lg">
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <div className="rounded-lg bg-surface-muted p-4 text-center">
          <p className="text-sm text-muted-foreground">Total to pay</p>
          <p className="text-4xl font-bold tabular-nums">{formatRupees(total)}</p>
        </div>
        <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={cn(
                'rounded-md border px-3 py-2 text-sm font-medium',
                method === m
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'hover:bg-surface-muted',
              )}
            >
              {PAYMENT_LABELS[m]}
            </button>
          ))}
        </div>
        {method === 'cash' ? (
          <>
            <Field label="Cash received">
              <MoneyInput
                autoFocus
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
            </Field>
            <div className="flex gap-2">
              {quick.map((q) => (
                <Button
                  key={q}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setReceived(paisaToText(q))}
                >
                  {q === total ? 'Exact' : formatRupees(q)}
                </Button>
              ))}
            </div>
            <div
              className={cn(
                'rounded-lg p-4 text-center',
                short ? 'bg-danger-soft' : 'bg-success-soft',
              )}
            >
              <p className="text-sm text-muted-foreground">
                {short ? 'Not enough' : 'Change to give'}
              </p>
              <p className="text-3xl font-bold tabular-nums">
                {paid === null ? '—' : formatRupees(Math.abs(paid - total))}
              </p>
            </div>
          </>
        ) : (
          <Alert tone="info">
            Record the {PAYMENT_LABELS[method]} payment of {formatRupees(total)}. The app doesn't
            connect to the provider.
          </Alert>
        )}
        {error ? <Alert tone="danger">{errorMessage(error)}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="lg" loading={pending} disabled={short}>
            Complete sale (Enter)
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Sale complete ──────────────────────────────────────────────────────────

export function SaleCompleteDialog({
  sale,
  autoPrint,
  onNext,
}: {
  sale: SaleDetail;
  autoPrint: boolean;
  onNext: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const print = useMutation({
    mutationFn: () => ipc('receipt:print', { kind: 'sale', id: sale.id }),
    onSuccess: () => toast.success('Receipt sent to the printer'),
  });
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => !open && onNext()}
        title={`Sale complete · Invoice ${docNo(sale.invoiceNo)}`}
        className="max-w-md"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="size-14 text-success" aria-hidden />
          <div>
            <p className="text-sm text-muted-foreground">Total {formatRupees(sale.totalPaisa)}</p>
            {sale.changePaisa > 0 && (
              <p className="text-3xl font-bold tabular-nums">
                Change {formatRupees(sale.changePaisa)}
              </p>
            )}
          </div>
          {autoPrint && <p className="text-sm text-muted-foreground">The receipt is printing.</p>}
          {print.error && <Alert tone="danger">{errorMessage(print.error)}</Alert>}
          <div className="flex w-full flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => setPreview(true)}>
              <ReceiptText /> View receipt
            </Button>
            <Button variant="secondary" onClick={() => print.mutate()} loading={print.isPending}>
              <Printer /> {autoPrint ? 'Print again' : 'Print'}
            </Button>
            <Button autoFocus size="lg" onClick={onNext} className="w-full">
              New sale (Enter)
            </Button>
          </div>
        </div>
      </Dialog>
      <ReceiptPreview
        receipt={preview ? { kind: 'sale', id: sale.id } : null}
        onClose={() => setPreview(false)}
        title={`Invoice ${docNo(sale.invoiceNo)}`}
      />
    </>
  );
}

// ── Discount (F4) ──────────────────────────────────────────────────────────

export function DiscountDialog({
  title,
  current,
  maxHint,
  onApply,
  onClose,
}: {
  title: string;
  current: Discount | null;
  maxHint: string | null;
  onApply: (d: Discount | null) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<'percent' | 'amount'>(current?.kind ?? 'percent');
  const [value, setValue] = useState(
    current
      ? current.kind === 'percent'
        ? String(current.bp / 100)
        : paisaToText(current.paisa)
      : '',
  );
  const [error, setError] = useState<string>();

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (value.trim() === '') {
      onApply(null);
      return;
    }
    if (kind === 'percent') {
      try {
        const bp = parsePercent(value);
        onApply(bp === 0 ? null : { kind: 'percent', bp });
      } catch {
        setError('Enter a percentage between 0 and 100');
      }
    } else {
      const paisa = rupeesToPaisa(value);
      if (paisa === null) setError('Enter an amount in rupees');
      else onApply(paisa === 0 ? null : { kind: 'amount', paisa });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={maxHint ?? undefined}
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div role="radiogroup" className="grid grid-cols-2 gap-2">
          {(['percent', 'amount'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                'rounded-md border px-3 py-2 text-sm font-medium',
                kind === k
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'hover:bg-surface-muted',
              )}
            >
              {k === 'percent' ? 'Percent (%)' : 'Amount (Rs)'}
            </button>
          ))}
        </div>
        <Field label={kind === 'percent' ? 'Discount %' : 'Discount in rupees'} error={error}>
          <Input
            autoFocus
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => onApply(null)}>
            Remove discount
          </Button>
          <Button type="submit">Apply</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Batch (F8) ─────────────────────────────────────────────────────────────

export function BatchDialog({
  item,
  current,
  onPick,
  onClose,
}: {
  item: PosItem;
  current: number | null;
  onPick: (batchId: number | null) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Choose batch: ${item.name}`}
      description="Expired batches are never offered."
    >
      <div className="flex flex-col gap-2">
        <BatchOption
          selected={current === null}
          onClick={() => onPick(null)}
          title="Automatic (first expiry, first out)"
          detail="Recommended"
        />
        {item.batches.map((b) => (
          <BatchOption
            key={b.id}
            selected={current === b.id}
            onClick={() => onPick(b.id)}
            title={`Batch ${b.batchNo} · exp ${formatExpiry(b.expiry)}${b.nearExpiry ? ' ⚠ expiring soon' : ''}`}
            detail={`${describeQty(b.qty, item)} in stock · ${formatRupees(b.unitFinal.box)} / box`}
          />
        ))}
      </div>
    </Dialog>
  );
}

function BatchOption({
  selected,
  onClick,
  title,
  detail,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border p-3 text-left',
        selected ? 'border-primary bg-primary-soft/50' : 'hover:bg-surface-muted',
      )}
    >
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </button>
  );
}

// ── Held bills (F6 / F7) ───────────────────────────────────────────────────

export function HeldBillsDialog({
  onRecall,
  onClose,
}: {
  onRecall: (bill: HeldBill) => void;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const { data: bills = [], error } = useQuery({
    queryKey: queryKeys.held,
    queryFn: () => ipc('pos:heldList'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => ipc('pos:heldDelete', { id }),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.held }),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Held bills"
      className="max-w-2xl"
    >
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
      <div className="rounded-md border">
        <DataTable
          rows={bills}
          rowKey={(b) => b.id}
          onRowClick={onRecall}
          empty="No bills on hold."
          columns={[
            {
              key: 'label',
              header: 'Bill',
              cell: (b) => <span className="font-medium">{b.label}</span>,
            },
            { key: 'lines', header: 'Items', cell: (b) => b.cart.lines.length },
            { key: 'by', header: 'Held by', cell: (b) => b.cashierName },
            {
              key: 'at',
              header: 'Time',
              cell: (b) =>
                new Date(b.at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            },
            {
              key: 'del',
              header: '',
              align: 'right',
              cell: (b) => (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${b.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(b.id);
                  }}
                >
                  <Trash2 />
                </Button>
              ),
            },
          ]}
        />
      </div>
    </Dialog>
  );
}

export function HoldDialog({
  onHold,
  onClose,
  pending,
}: {
  onHold: (label: string) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [label, setLabel] = useState('');
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Hold this bill"
      description="Serve the next customer and recall this bill later with F7."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onHold(label);
        }}
      >
        <Field label="Name for the bill" hint="Optional, e.g. the customer's name">
          <Input
            autoFocus
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Hold bill
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Alternatives (F3) ──────────────────────────────────────────────────────

export function AlternativesDialog({
  item,
  onAdd,
  onClose,
}: {
  item: { id: number; name: string };
  onAdd: (id: number) => void;
  onClose: () => void;
}) {
  const {
    data = [],
    error,
    isPending,
  } = useQuery({
    queryKey: [...queryKeys.items, 'alternatives', item.id],
    queryFn: () => ipc('items:alternatives', { id: item.id }),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Alternatives to ${item.name}`}
      description="Same generic and strength. Click one to add it to the bill."
      className="max-w-3xl"
    >
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
      <div className="rounded-md border">
        {!isPending && <AlternativesTable rows={data} onOpen={onAdd} />}
      </div>
    </Dialog>
  );
}
