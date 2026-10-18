import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <D.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-surface shadow-lg',
            className,
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b px-6 py-4">
            <div className="flex flex-col gap-1">
              <D.Title className="text-base font-semibold">{title}</D.Title>
              {description ? (
                <D.Description className="text-sm text-muted-foreground">
                  {description}
                </D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close
              className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted"
              aria-label="Close"
            >
              <X className="size-4" />
            </D.Close>
          </header>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <footer className="flex justify-end gap-2 border-t px-6 py-4">{footer}</footer>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
