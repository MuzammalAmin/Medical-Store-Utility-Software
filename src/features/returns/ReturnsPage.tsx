import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Undo2 } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { divRound, formatRupees } from '@shared/domain/money';
import { todayIso } from '@shared/domain/dates';
import {
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
  type ReturnDetail,
  type ReturnLookup,
} from '@shared/ipc/schemas/sales';
import { queryKeys } from '@/app/queries';
import { useSessionUser } from '@/app/session';
import { ReceiptPreview } from '@/components/receipt/ReceiptPreview';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Field } from '@/components/ui/field';
import { Input, PinInput } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { docNo } from '@/lib/format';
import { errorMessage, ipc } from '@/lib/ipc';
import { formatDateTime } from '@/lib/utils';
import { InvoiceDialog } from '../sales/InvoiceDialog';

/** Customer returns against the original invoice (PRD §3.6), plus today's invoices for reprints. */
export function ReturnsPage() {
  const [invoiceText, setInvoiceText] = useState('');
  const [lookup, setLookup] = useState<ReturnLookup | null>(null);
  const [openInvoice, setOpenInvoice] = useState<number | null>(null);
  const [done, setDone] = useState<ReturnDetail | null>(null);
  const today = todayIso();
  const { data: todays } = useQuery({
    queryKey: [...queryKeys.sales, 'today', today],
    queryFn: () =>
      ipc('sales:list', { from: today, to: today, invoiceNo: null, page: 0, pageSize: 100 }),
  });

  const find = useMutation({
    mutationFn: (invoiceNo: number) => ipc('returns:lookup', { invoiceNo }),
    onSuccess: setLookup,
  });
  const search = (event: SyntheticEvent) => {
    event.preventDefault();
    const n = Number(invoiceText.replace(/\D/g, ''));
    if (n > 0) find.mutate(n);
  };

  return (
    <>
      <PageHeader
        title="Returns"
        description="Take back items against the original invoice. Refunds use the original prices."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <form onSubmit={search} className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                autoFocus
                className="pl-9"
                placeholder="Invoice number from the receipt, e.g. 245"
                aria-label="Invoice number"
                inputMode="numeric"
                value={invoiceText}
                onChange={(e) => setInvoiceText(e.target.value)}
              />
            </div>
            <Button type="submit" loading={find.isPending}>
              Find invoice
            </Button>
          </form>
          {find.error && <Alert tone="danger">{errorMessage(find.error)}</Alert>}
          {lookup && (
            <ReturnForm
              key={`${lookup.sale.id}-${lookup.sale.refundedPaisa}`}
              lookup={lookup}
              onDone={(r) => {
                setDone(r);
                find.mutate(lookup.sale.invoiceNo);
              }}
            />
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Today's invoices</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              rows={todays?.rows ?? []}
              rowKey={(r) => r.id}
              onRowClick={(r) => setOpenInvoice(r.invoiceNo)}
              empty="No sales yet today."
              columns={[
                { key: 'no', header: 'Invoice', cell: (r) => docNo(r.invoiceNo) },
                {
                  key: 'time',
                  header: 'Time',
                  cell: (r) =>
                    new Date(r.at).toLocaleTimeString('en-PK', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                },
                {
                  key: 'total',
                  header: 'Total',
                  align: 'right',
                  cell: (r) =>
                    r.status === 'void' ? (
                      <Badge tone="danger">Void</Badge>
                    ) : (
                      formatRupees(r.totalPaisa)
                    ),
                },
                {
                  key: 'return',
                  header: '',
                  align: 'right',
                  cell: (r) =>
                    r.status === 'completed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInvoiceText(String(r.invoiceNo));
                          find.mutate(r.invoiceNo);
                        }}
                      >
                        <Undo2 /> Return
                      </Button>
                    ),
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
      {openInvoice !== null && (
        <InvoiceDialog invoiceNo={openInvoice} onClose={() => setOpenInvoice(null)} />
      )}
      <ReceiptPreview
        receipt={done ? { kind: 'return', id: done.id } : null}
        onClose={() => setDone(null)}
        title={done ? `Refund receipt · Return ${docNo(done.returnNo)}` : ''}
      />
    </>
  );
}

function ReturnForm({
  lookup,
  onDone,
}: {
  lookup: ReturnLookup;
  onDone: (r: ReturnDetail) => void;
}) {
  const client = useQueryClient();
  const user = useSessionUser();
  const { sale } = lookup;
  const today = todayIso();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [restock, setRestock] = useState<Record<number, boolean>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(sale.paymentMethod);
  const [pin, setPin] = useState('');

  const chosen = sale.lines
    .map((l) => ({ line: l, qty: Number(qty[l.id] ?? 0) }))
    .filter(
      (c) => Number.isInteger(c.qty) && c.qty > 0 && c.qty <= c.line.qty - c.line.returnedQty,
    );
  // Estimate only; the main process works out the exact refund.
  const estimate = chosen.reduce((s, c) => s + divRound(c.line.totalPaisa * c.qty, c.line.qty), 0);
  const needsPin =
    user.role !== 'owner' && (!lookup.withinWindow || estimate > lookup.refundApprovalPaisa);

  const create = useMutation({
    mutationFn: () =>
      ipc('returns:create', {
        saleId: sale.id,
        lines: chosen.map((c) => ({
          saleLineId: c.line.id,
          qty: c.qty,
          restock: restock[c.line.id] ?? c.line.expiry >= today,
        })),
        reason,
        refundMethod: method,
        approverPin: needsPin ? pin : null,
      }),
    onSuccess: (r) => {
      for (const key of [
        queryKeys.sales,
        queryKeys.items,
        queryKeys.inventory,
        queryKeys.dashboard,
        queryKeys.reports,
      ]) {
        void client.invalidateQueries({ queryKey: key });
      }
      toast.success(`Refund of ${formatRupees(r.refundPaisa)} recorded`);
      onDone(r);
    },
    onError: () => setPin(''),
  });

  if (sale.status === 'void')
    return (
      <Alert tone="danger">
        Invoice {docNo(sale.invoiceNo)} was voided, so nothing can be returned.
      </Alert>
    );

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>
          Invoice {docNo(sale.invoiceNo)} · {formatDateTime(sale.at)}
        </CardTitle>
        <div className="flex gap-2">
          <Badge>Total {formatRupees(sale.totalPaisa)}</Badge>
          {sale.refundedPaisa > 0 && (
            <Badge tone="warning">Already refunded {formatRupees(sale.refundedPaisa)}</Badge>
          )}
          {lookup.withinWindow ? (
            <Badge tone="success">Within {lookup.returnWindowDays}-day return window</Badge>
          ) : (
            <Badge tone="warning">{lookup.daysSinceSale} days old: Owner approval needed</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-md border">
          <DataTable
            rows={sale.lines}
            rowKey={(l) => l.id}
            columns={[
              {
                key: 'item',
                header: 'Item',
                cell: (l) => <span className="font-medium">{l.itemName}</span>,
              },
              { key: 'sold', header: 'Sold', cell: (l) => `${l.qty} ${l.unit}` },
              { key: 'returned', header: 'Returned', cell: (l) => l.returnedQty || '—' },
              {
                key: 'qty',
                header: 'Return now',
                cell: (l) => {
                  const left = l.qty - l.returnedQty;
                  return left === 0 ? (
                    <span className="text-muted-foreground">All returned</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Quantity of ${l.itemName} to return`}
                        inputMode="numeric"
                        className="h-8 w-16 text-center"
                        value={qty[l.id] ?? ''}
                        placeholder="0"
                        onChange={(e) =>
                          setQty({ ...qty, [l.id]: e.target.value.replace(/\D/g, '') })
                        }
                      />
                      <span className="text-xs text-muted-foreground">
                        of {left} {l.unit}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: 'restock',
                header: 'Back on shelf?',
                cell: (l) =>
                  l.expiry < today ? (
                    <Badge tone="danger">Expired: write off</Badge>
                  ) : (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={restock[l.id] ?? true}
                        onChange={(e) => setRestock({ ...restock, [l.id]: e.target.checked })}
                        className="size-4 accent-[var(--primary)]"
                      />
                      {(restock[l.id] ?? true) ? 'Restock' : 'Damaged: write off'}
                    </label>
                  ),
              },
              {
                key: 'total',
                header: 'Paid',
                align: 'right',
                cell: (l) => formatRupees(l.totalPaisa),
              },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Reason" hint="Optional">
            <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Refund by">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          {needsPin && (
            <Field
              label="Owner PIN"
              hint={
                lookup.withinWindow
                  ? `Refunds over ${formatRupees(lookup.refundApprovalPaisa)} need approval`
                  : 'Outside the return window'
              }
            >
              <PinInput value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </Field>
          )}
        </div>
        {create.error && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
        <div className="flex items-center justify-end gap-4">
          <p className="text-lg">
            Refund about <span className="font-bold tabular-nums">{formatRupees(estimate)}</span>
          </p>
          <Button
            size="lg"
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={chosen.length === 0 || (needsPin && pin.length < 4)}
          >
            <Undo2 /> Make refund
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
