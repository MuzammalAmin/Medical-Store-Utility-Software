import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border bg-surface px-3 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground disabled:opacity-50 aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

/** Numeric PIN entry: masked, digits only, no autocomplete. */
export function PinInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <Input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={8}
      pattern="\d*"
      {...props}
      className={cn('font-mono tracking-[0.4em]', props.className)}
    />
  );
}
