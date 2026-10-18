import type { ComponentProps } from 'react';
import { MoneyError, parseRupees, type Paisa } from '@shared/domain/money';
import { cn } from '@/lib/utils';

/** Rupee amount input. Keeps the typed text; use `rupeesToPaisa` to read it. */
export function MoneyInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
        Rs
      </span>
      <input
        inputMode="decimal"
        autoComplete="off"
        className="h-10 w-full rounded-md border bg-surface pr-3 pl-9 text-right text-sm text-foreground tabular-nums shadow-xs aria-invalid:border-danger"
        {...props}
      />
    </div>
  );
}

/** Parses typed rupees; null when empty or invalid. */
export function rupeesToPaisa(text: string): Paisa | null {
  if (text.trim() === '') return null;
  try {
    return parseRupees(text);
  } catch (error) {
    if (error instanceof MoneyError) return null;
    throw error;
  }
}

/** Paisa → editable rupee text ("118.00" → "118", "11.80" stays). */
export function paisaToText(paisa: Paisa | null): string {
  if (paisa === null) return '';
  return paisa % 100 === 0 ? String(paisa / 100) : (paisa / 100).toFixed(2);
}
