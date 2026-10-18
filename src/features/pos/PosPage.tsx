import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { discountShareBp } from '@shared/domain/cart';
import { formatRupees } from '@shared/domain/money';
import { nextUnit } from '@shared/domain/units';
import type { HeldBill, PaymentMethod, PosItem, SaleDetail } from '@shared/ipc/schemas/sales';
import { queryKeys, useAppState, useLogout, useSettings } from '@/app/queries';
import { useCan, useSessionUser } from '@/app/session';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage, ipc } from '@/lib/ipc';
import { CartTable } from './CartTable';
import {
  AlternativesDialog,
  BatchDialog,
  DiscountDialog,
  HeldBillsDialog,
  HoldDialog,
  PaymentDialog,
  SaleCompleteDialog,
} from './PosDialogs';
import { ProductSearch } from './ProductSearch';
import { usePosCart } from './usePosCart';

type DialogState =
  | { kind: 'pay' }
  | { kind: 'discount'; target: 'line' | 'bill' }
  | { kind: 'batch' }
  | { kind: 'hold' }
  | { kind: 'held' }
  | { kind: 'alternatives'; item: { id: number; name: string } }
  | { kind: 'done'; sale: SaleDetail }
  | null;

const SHORTCUTS = [
  ['F2', 'Search'],
  ['F3', 'Alternatives'],
  ['F4', 'Discount'],
  ['F5', 'Unit'],
  ['F6', 'Hold'],
  ['F7', 'Recall'],
  ['F8', 'Batch'],
  ['F9', 'Return'],
  ['F12', 'Pay'],
] as const;

/** Full-screen, keyboard-first point of sale (PRD §3.5, §5.3–5.4). */
export function PosPage() {
  const user = useSessionUser();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { data: state } = useAppState();
  const { data: settings } = useSettings();
  const logout = useLogout();
  const isOwner = useCan('prices.edit');
  const cart = usePosCart();
  const searchRef = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [highlighted, setHighlighted] = useState<PosItem | null>(null);

  const selectedLine = cart.lines.find((l) => l.key === cart.selected) ?? null;
  const total = cart.bill?.cart.totalPaisa ?? 0;
  const maxDiscountBp = settings?.pos.staffMaxDiscountBp ?? 1000;
  const overLimit =
    !isOwner && cart.bill !== null && discountShareBp(cart.bill.cart) > maxDiscountBp;

  const focusSearch = () => requestAnimationFrame(() => searchRef.current?.focus());
  const close = () => {
    setDialog(null);
    focusSearch();
  };

  const checkout = useMutation({
    mutationFn: ({ method, paid }: { method: PaymentMethod; paid: number }) =>
      ipc('pos:checkout', {
        ...cart.draft(),
        payment: { method, paidPaisa: paid },
        heldBillId: cart.heldBillId,
      }),
    onSuccess: (sale) => {
      setDialog({ kind: 'done', sale });
      cart.clear();
      for (const key of [
        ['pos'],
        queryKeys.items,
        queryKeys.inventory,
        queryKeys.dashboard,
        queryKeys.held,
        queryKeys.sales,
      ]) {
        void client.invalidateQueries({ queryKey: key });
      }
    },
  });

  const hold = useMutation({
    mutationFn: (label: string) => ipc('pos:hold', { label, cart: cart.draft() }),
    onSuccess: (bill) => {
      // Recalling a held bill and holding it again replaces the old copy.
      if (cart.heldBillId !== null)
        void ipc('pos:heldDelete', { id: cart.heldBillId }).catch(() => undefined);
      cart.clear();
      void client.invalidateQueries({ queryKey: queryKeys.held });
      toast.success(`Held “${bill.label}”. Recall it with F7`);
      close();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const addById = async (id: number) => {
    const [item] = await ipc('pos:items', { ids: [id] });
    if (item) addItem(item);
    close();
  };

  function addItem(item: PosItem) {
    if (item.stockTabs === 0) {
      toast.error(`${item.name} is out of stock`, {
        action: {
          label: 'Alternatives (F3)',
          onClick: () => setDialog({ kind: 'alternatives', item }),
        },
      });
      return;
    }
    cart.add(item);
    if (item.rxRequired) toast.warning(`${item.name} needs a prescription`);
  }

  function removeLine(key: number) {
    const line = cart.remove(key);
    if (line) {
      toast(`Removed ${line.item.name}`, {
        action: { label: 'Undo', onClick: () => cart.restore(line) },
      });
    }
  }

  async function recall(bill: HeldBill) {
    if (cart.lines.length > 0) {
      toast.error('Finish or hold the current bill first');
      return;
    }
    const items = await ipc('pos:items', {
      ids: [...new Set(bill.cart.lines.map((l) => l.itemId))],
    });
    const dropped = cart.load(bill.cart, items, bill.id);
    if (dropped > 0) toast.warning(`${dropped} item(s) on the held bill are no longer available`);
    close();
  }

  // Keyboard map (PRD §5.4). Only when no dialog is open; dialogs handle their own keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (dialog) return;
      const inField =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
      const lineIndex = cart.lines.findIndex((l) => l.key === cart.selected);
      const actions: Record<string, (() => void) | undefined> = {
        F2: focusSearch,
        F3: () => {
          const target = highlighted ?? selectedLine?.item;
          if (target) setDialog({ kind: 'alternatives', item: target });
        },
        F4: () => setDialog({ kind: 'discount', target: selectedLine ? 'line' : 'bill' }),
        F5: () =>
          selectedLine &&
          cart.update(selectedLine.key, {
            unit: nextUnit(selectedLine.unit, selectedLine.item.units),
          }),
        F6: () => cart.lines.length > 0 && setDialog({ kind: 'hold' }),
        F7: () => setDialog({ kind: 'held' }),
        F8: () => selectedLine && setDialog({ kind: 'batch' }),
        F9: () => void navigate({ to: '/returns' }),
        F12: () => cart.bill && !cart.error && !overLimit && setDialog({ kind: 'pay' }),
      };
      if (!inField) {
        Object.assign(actions, {
          ArrowDown: () =>
            cart.lines[lineIndex + 1] && cart.setSelected(cart.lines[lineIndex + 1]!.key),
          ArrowUp: () =>
            cart.lines[lineIndex - 1] && cart.setSelected(cart.lines[lineIndex - 1]!.key),
          Delete: () => selectedLine && removeLine(selectedLine.key),
          '+': () => selectedLine && cart.update(selectedLine.key, { qty: selectedLine.qty + 1 }),
          '-': () =>
            selectedLine &&
            selectedLine.qty > 1 &&
            cart.update(selectedLine.key, { qty: selectedLine.qty - 1 }),
        });
      }
      const action = actions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-surface px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" asChild>
            <Link to="/">
              <ArrowLeft /> Back
            </Link>
          </Button>
          <p className="font-semibold">{state?.shopName} · POS</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Cashier: {user.fullName}</span>
          <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: 'held' })}>
            Held bills (F7)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => logout.mutate()}
            title="Lock (Ctrl+L)"
          >
            <Lock /> Lock
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <ProductSearch ref={searchRef} onPick={addItem} onHighlight={setHighlighted} />
          {cart.heldBillId !== null && <Alert tone="info">Working on a recalled held bill.</Alert>}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-surface">
            <CartTable cart={cart} onRemove={removeLine} />
          </div>
        </section>

        <aside className="flex w-96 shrink-0 flex-col gap-4 border-l bg-surface p-4">
          <div className="grid gap-2">
            <Input
              placeholder="Customer name (optional)"
              aria-label="Customer name"
              value={cart.customer.customerName}
              onChange={(e) => cart.setCustomer({ ...cart.customer, customerName: e.target.value })}
            />
            <Input
              placeholder="Customer phone (optional)"
              aria-label="Customer phone"
              inputMode="tel"
              value={cart.customer.customerPhone}
              onChange={(e) =>
                cart.setCustomer({ ...cart.customer, customerPhone: e.target.value })
              }
            />
            <Input
              placeholder="Doctor (optional)"
              aria-label="Doctor"
              value={cart.customer.doctorName}
              onChange={(e) => cart.setCustomer({ ...cart.customer, doctorName: e.target.value })}
            />
          </div>

          <dl className="mt-auto flex flex-col gap-2 text-sm">
            <Row label="Items">{cart.lines.length}</Row>
            <Row label="Subtotal">{formatRupees(cart.bill?.cart.subtotalPaisa ?? 0)}</Row>
            <Row label="Discount">
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => setDialog({ kind: 'discount', target: 'bill' })}
              >
                {cart.bill?.cart.discountPaisa
                  ? `−${formatRupees(cart.bill.cart.discountPaisa)}`
                  : 'Add (F4)'}
              </button>
            </Row>
            <Row label="GST">{formatRupees(cart.bill?.cart.gstPaisa ?? 0)}</Row>
            <div className="mt-2 border-t pt-3">
              <p className="text-sm text-muted-foreground">TOTAL</p>
              <p
                className="text-5xl font-bold tracking-tight tabular-nums"
                role="status"
                aria-label="Bill total"
              >
                {formatRupees(total)}
              </p>
            </div>
          </dl>

          {cart.error && <Alert tone="danger">{cart.error}</Alert>}
          {overLimit && (
            <Alert tone="warning">
              Discount is above the {maxDiscountBp / 100}% staff limit. Ask the Owner.
            </Alert>
          )}
          <Button
            size="lg"
            className="h-16 text-lg"
            disabled={!cart.bill || overLimit}
            onClick={() => setDialog({ kind: 'pay' })}
          >
            Pay (F12)
          </Button>
        </aside>
      </div>

      <footer className="flex shrink-0 flex-wrap gap-x-5 gap-y-1 border-t bg-surface px-4 py-2 text-xs text-muted-foreground">
        {SHORTCUTS.map(([key, label]) => (
          <span key={key}>
            <kbd className="rounded border bg-surface-muted px-1.5 py-0.5 font-mono text-foreground">
              {key}
            </kbd>{' '}
            {label}
          </span>
        ))}
        <span>
          <kbd className="rounded border bg-surface-muted px-1.5 py-0.5 font-mono text-foreground">
            ↑ ↓
          </kbd>{' '}
          Select line ·{' '}
          <kbd className="rounded border bg-surface-muted px-1.5 py-0.5 font-mono text-foreground">
            + −
          </kbd>{' '}
          Qty ·{' '}
          <kbd className="rounded border bg-surface-muted px-1.5 py-0.5 font-mono text-foreground">
            Del
          </kbd>{' '}
          Remove
        </span>
      </footer>

      {dialog?.kind === 'pay' && (
        <PaymentDialog
          total={total}
          pending={checkout.isPending}
          error={checkout.error}
          onPay={(method, paid) => checkout.mutate({ method, paid })}
          onClose={() => {
            checkout.reset();
            close();
          }}
        />
      )}
      {dialog?.kind === 'done' && (
        <SaleCompleteDialog
          sale={dialog.sale}
          autoPrint={Boolean(settings?.pos.autoPrint && settings.pos.receiptPrinter)}
          onNext={() => {
            checkout.reset();
            close();
          }}
        />
      )}
      {dialog?.kind === 'discount' && (
        <DiscountDialog
          title={
            dialog.target === 'line' && selectedLine
              ? `Discount on ${selectedLine.item.name}`
              : 'Discount on the whole bill'
          }
          current={dialog.target === 'line' ? (selectedLine?.discount ?? null) : cart.billDiscount}
          maxHint={isOwner ? null : `Staff can give up to ${maxDiscountBp / 100}% in total.`}
          onApply={(d) => {
            if (dialog.target === 'line' && selectedLine)
              cart.update(selectedLine.key, { discount: d });
            else cart.setBillDiscount(d);
            close();
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'batch' && selectedLine && (
        <BatchDialog
          item={selectedLine.item}
          current={selectedLine.batchId}
          onPick={(batchId) => {
            cart.update(selectedLine.key, { batchId });
            close();
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'hold' && (
        <HoldDialog
          pending={hold.isPending}
          onHold={(label) => hold.mutate(label)}
          onClose={close}
        />
      )}
      {dialog?.kind === 'held' && (
        <HeldBillsDialog onRecall={(b) => void recall(b)} onClose={close} />
      )}
      {dialog?.kind === 'alternatives' && (
        <AlternativesDialog item={dialog.item} onAdd={(id) => void addById(id)} onClose={close} />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}
