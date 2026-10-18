import { useMutation, useQuery } from '@tanstack/react-query';
import { Printer, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatPercent, parsePercent } from '@shared/domain/gst';
import type { Settings } from '@shared/settings';
import { ReceiptPreview } from '@/components/receipt/ReceiptPreview';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput, paisaToText, rupeesToPaisa } from '@/components/ui/money-input';
import { Select } from '@/components/ui/select';
import { errorMessage, ipc } from '@/lib/ipc';
import { useSaveSettings } from '../useSaveSettings';

/** Counter rules and the 80mm receipt printer (PRD §3.5–3.6, §3.10). */
export function PosTab({ settings }: { settings: Settings }) {
  const save = useSaveSettings();
  const pos = settings.pos;
  const [discount, setDiscount] = useState(formatPercent(pos.staffMaxDiscountBp).replace('%', ''));
  const [windowDays, setWindowDays] = useState(String(pos.returnWindowDays));
  const [approval, setApproval] = useState(paisaToText(pos.refundApprovalPaisa));
  const [printer, setPrinter] = useState(pos.receiptPrinter);
  const [autoPrint, setAutoPrint] = useState(pos.autoPrint);
  const [preview, setPreview] = useState(false);
  const { data: printers = [], error: printersError } = useQuery({
    queryKey: ['printers'],
    queryFn: () => ipc('printers:list'),
  });
  const testPrint = useMutation({
    mutationFn: async () => {
      // Save the printer choice first so the test uses it.
      if (printer !== pos.receiptPrinter)
        await ipc('settings:update', { group: 'pos', value: { ...pos, receiptPrinter: printer } });
      return ipc('receipt:print', { kind: 'test', id: 0 });
    },
    onSuccess: () => toast.success('Test receipt sent'),
  });

  let discountBp: number | null = null;
  try {
    discountBp = parsePercent(discount);
  } catch {
    discountBp = null;
  }
  const days = Number(windowDays);
  const approvalPaisa = rupeesToPaisa(approval);
  const valid =
    discountBp !== null &&
    Number.isInteger(days) &&
    days >= 0 &&
    days <= 365 &&
    approvalPaisa !== null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Counter rules</CardTitle>
          <CardDescription>Limits for staff. The Owner is never limited.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Max staff discount (%)"
            error={discountBp === null ? 'Enter 0 to 100' : undefined}
          >
            <Input
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </Field>
          <Field
            label="Return window (days)"
            hint="Older sales need the Owner PIN"
            error={Number.isInteger(days) && days >= 0 ? undefined : 'Whole number of days'}
          >
            <Input
              inputMode="numeric"
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
            />
          </Field>
          <Field
            label="Refunds needing Owner PIN above"
            error={approvalPaisa === null ? 'Enter an amount' : undefined}
          >
            <MoneyInput value={approval} onChange={(e) => setApproval(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipt printer (80mm)</CardTitle>
          <CardDescription>
            With a printer chosen, receipts print straight away without a dialog.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Printer">
            <Select value={printer} onChange={(e) => setPrinter(e.target.value)}>
              <option value="">Ask each time (print dialog)</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={(e) => setAutoPrint(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            Print the receipt automatically after every sale and refund (needs a printer chosen
            above)
          </label>
          {(printersError ?? testPrint.error) && (
            <Alert tone="danger">{errorMessage(printersError ?? testPrint.error)}</Alert>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPreview(true)}>
              <ReceiptText /> Preview receipt
            </Button>
            <Button
              variant="secondary"
              onClick={() => testPrint.mutate()}
              loading={testPrint.isPending}
            >
              <Printer /> Test print
            </Button>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            disabled={!valid}
            loading={save.isPending}
            onClick={() =>
              valid &&
              save.mutate({
                group: 'pos',
                value: {
                  staffMaxDiscountBp: discountBp!,
                  returnWindowDays: days,
                  refundApprovalPaisa: approvalPaisa,
                  receiptPrinter: printer,
                  autoPrint,
                },
              })
            }
          >
            Save
          </Button>
        </CardFooter>
      </Card>
      {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
      <ReceiptPreview
        receipt={preview ? { kind: 'test', id: 0 } : null}
        onClose={() => setPreview(false)}
        title="Test receipt"
      />
    </div>
  );
}
