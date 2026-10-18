import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Multi-line input for typing a recovery key; not spell-checked or autocompleted. */
export function RecoveryKeyInput({
  value,
  onChange,
  className,
  ...props
}: Omit<ComponentProps<'textarea'>, 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      rows={3}
      spellCheck={false}
      autoComplete="off"
      autoCapitalize="characters"
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      placeholder="XXXX-XXXX-XXXX-…"
      className={cn(
        'w-full rounded-md border bg-surface px-3 py-2 font-mono text-sm tracking-wider uppercase placeholder:text-muted-foreground aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}
