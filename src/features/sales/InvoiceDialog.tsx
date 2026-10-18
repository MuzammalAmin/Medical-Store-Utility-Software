import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Printer, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatExpiry } from '@shared/domain/dates';
import { formatRupees } from '@shared/domain/money';
import { PAYMENT_LABELS } from '@shared/ipc/schemas/sales';
import { queryKeys } from '@/app/queries';
import { ReceiptPreview } from '@/components/receipt/ReceiptPreview';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, PinInput } from '@/components/ui/input';
import { docNo } from '@/lib/format';
import { errorMessage, ipc } from '@/lib/ipc';
import { formatDateTime } from '@/lib/utils';

/** One invoice: lines, totals, reprint and void with the Owner's PIN (PRD §3.5). */
export function InvoiceDialog({ invoiceNo, onClose }: { invoiceNo: number; onClose: () => void }) {
  const client = useQueryClient();
  const [preview, setPreview] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const { data: sale, error } = useQuery({
    queryKey: [...queryKeys.sales, 'invoice', invoiceNo],
    queryFn: () => ipc('sales:get', { invoiceNo }),
  });
  const print = useMutation({
    mutationFn: () => ipc('receipt:print', { kind: 'sale', id: sale!.id, copy: true }),
    onSuccess: () => toast.success('Sent to the printer'),
  });
  const voidSale = useMutation({
    mutationFn: () => ipc('sales:void', { saleId: sale!.id, reason, approverPin: pin }),
    onSuccess: () => {
      for (const key of [
        queryKeys.sales,
        queryKeys.items,
        queryKeys.inventory,
        queryKeys.dashboard,
        queryKeys.reports,
      ]) {
        void client.invalidateQueries({ queryKey: key });
      }
      toast.success(`Invoice ${docNo(invoiceNo)} voided and stock returned`);
      setVoiding(false);
    },
    onError: () => setPin(''),
  });

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        title={`Invoice ${docNo(invoiceNo)}`}
        className="max-w-3xl"
      >
        {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
        {sale && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
              <span>{formatDateTime(sale.at)}</span>
              <span>Cashier: {sale.cashierName}</span>
              <span>{PAYMENT_LABELS[sale.paymentMethod]}</span>
              {sale.customerName && <span>Customer: {sale.customerName}</span>}
              {sale.status === 'void' ? (
                <Badge tone="danger">Void: {sale.voidReason}</Badge>
              ) : (
                <Badge tone="success">Completed</Badge>
              )}
              {sale.refundedPaisa > 0 && (
                <Badge tone="warning">Refunded {formatRupees(sale.refundedPaisa)}</Badge>
              )}
            </div>
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
                  {
                    key: 'batch',
                    header: 'Batch',
                    cell: (l) => `${l.batchNo} · ${formatExpiry(l.expiry)}`,
                  },
                  {
                    key: 'qty',
                    header: 'Qty',
                    cell: (l) =>
                      `${l.qty} ${l.unit}${l.returnedQty ? ` (${l.returnedQty} returned)` : ''}`,
                  },
                  {
                    key: 'rate',
                    header: 'Rate',
                    align: 'right',
                    cell: (l) => formatRupees(l.unitFinalPaisa),
                  },
                  {
                    key: 'total',
                    header: 'Amount',
                    align: 'right',
                    cell: (l) => formatRupees(l.totalPaisa),
                  },
                ]}
              />
            </div>
            <dl className="ml-auto grid w-64 grid-cols-2 gap-1 text-sm tabular-nums">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="text-right">{formatRupees(sale.subtotalPaisa)}</dd>
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="text-right">−{formatRupees(sale.discountPaisa)}</dd>
              <dt className="text-muted-foreground">GST</dt>
              <dd className="text-right">{formatRupees(sale.gstPaisa)}</dd>
              <dt className="font-semibold">Total</dt>
              <dd className="text-right font-semibold">{formatRupees(sale.totalPaisa)}</dd>
            </dl>

            {voiding ? (
              <div className="flex flex-col gap-3 rounded-md border border-danger/40 p-4">
                <p className="text-sm font-medium">
                  Void this invoice? Stock that wasn't returned goes back on the shelf. This can't
                  be undone.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Reason">
                    <Input
                      autoFocus
                      value={reason}
                      maxLength={200}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </Field>
                  <Field label="Owner PIN">
                    <PinInput
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    />
                  </Field>
                </div>
                {voidSale.error && <Alert tone="danger">{errorMessage(voidSale.error)}</Alert>}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setVoiding(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => voidSale.mutate()}
                    loading={voidSale.isPending}
                    disabled={reason.trim().length < 3 || pin.length < 4}
                  >
                    Void invoice
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                {print.error && <Alert tone="danger">{errorMessage(print.error)}</Alert>}
                <Button variant="secondary" onClick={() => setPreview(true)}>
                  <ReceiptText /> View receipt
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => print.mutate()}
                  loading={print.isPending}
                >
                  <Printer /> Reprint
                </Button>
                {sale.status === 'completed' && (
                  <Button variant="danger" onClick={() => setVoiding(true)}>
                    <Ban /> Void
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>
      <ReceiptPreview
        receipt={preview && sale ? { kind: 'sale', id: sale.id, copy: true } : null}
        onClose={() => setPreview(false)}
      />
    </>
  );
}
