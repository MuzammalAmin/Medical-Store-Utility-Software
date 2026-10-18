import { useId } from 'react';
import { computePrice, formatPercent, parsePercent, type PriceMode } from '@shared/domain/gst';
import { formatRupees, type Paisa } from '@shared/domain/money';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const MODES: { value: PriceMode; label: string; help: string }[] = [
  {
    value: 'add_gst',
    label: 'Add GST',
    help: 'The price you enter is before GST; GST is added on top.',
  },
  {
    value: 'price_only',
    label: 'Sale price only',
    help: 'The price you enter is final and already includes GST.',
  },
];

/** Live breakdown line from PRD §3.2, e.g. "Base Rs 100.00 + GST 18% (Rs 18.00) = Rs 118.00". */
export function priceBreakdownText(mode: PriceMode, amountPaisa: Paisa, rateBp: number): string {
  const p = computePrice(mode, amountPaisa, rateBp);
  if (mode === 'add_gst') {
    return `Base ${formatRupees(p.basePaisa)} + GST ${formatPercent(rateBp)} (${formatRupees(p.gstPaisa)}) = ${formatRupees(p.finalPaisa)}`;
  }
  return `${formatRupees(p.finalPaisa)} (includes GST ${formatPercent(rateBp)} = ${formatRupees(p.gstPaisa)}, base ${formatRupees(p.basePaisa)})`;
}

function safePreview(mode: PriceMode, amountPaisa: Paisa, rate: string): string | null {
  try {
    return priceBreakdownText(mode, amountPaisa, parsePercent(rate));
  } catch {
    return null;
  }
}

interface PriceModeFieldProps {
  mode: PriceMode;
  onModeChange: (mode: PriceMode) => void;
  /** GST rate as typed, in percent (e.g. "18"). */
  rate: string;
  onRateChange: (rate: string) => void;
  /** Amount used for the live preview, in paisa. */
  previewAmountPaisa: Paisa;
  rateError?: string | undefined;
}

/**
 * The "Price & GST" block (PRD §3.2, §5.3). Used wherever a selling price is
 * entered, so the choice always looks and behaves the same.
 */
export function PriceModeField({
  mode,
  onModeChange,
  rate,
  onRateChange,
  previewAmountPaisa,
  rateError,
}: PriceModeFieldProps) {
  const name = useId();
  const preview = safePreview(mode, previewAmountPaisa, rate);

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div role="radiogroup" aria-label="Price mode" className="grid gap-2 sm:grid-cols-2">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-md border p-3 transition-colors',
              mode === m.value ? 'border-primary bg-primary-soft/40' : 'hover:bg-surface-muted',
            )}
          >
            <input
              type="radio"
              name={name}
              value={m.value}
              checked={mode === m.value}
              onChange={() => onModeChange(m.value)}
              className="mt-1 accent-[var(--primary)]"
            />
            <span>
              <span className="block text-sm font-medium">{m.label}</span>
              <span className="text-sm text-muted-foreground">{m.help}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <span className="font-medium">{mode === 'add_gst' ? 'GST rate' : 'GST included'}</span>
        <Input
          className="w-24 text-right"
          inputMode="decimal"
          value={rate}
          onChange={(e) => onRateChange(e.target.value)}
          aria-invalid={rateError ? true : undefined}
        />
        <span>%</span>
        <span className="text-muted-foreground">Use 0% for GST-exempt medicines.</span>
      </label>
      {rateError && <p className="text-sm text-danger">{rateError}</p>}
      <p className="rounded-md bg-surface-muted px-3 py-2 text-sm tabular-nums" aria-live="polite">
        {preview ?? 'Enter a valid GST rate to see the breakdown.'}
      </p>
    </div>
  );
}
