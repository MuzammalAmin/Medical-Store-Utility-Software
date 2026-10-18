import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Centred layout for the screens shown before login: setup, recovery and login. */
export function AuthLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
          AP
        </div>
        <div className="leading-tight">
          <p className="text-lg font-semibold">Ayyaz Pharmacy</p>
          <p className="text-sm text-muted-foreground">Pharmacy Manager</p>
        </div>
      </div>
      <div className={cn('w-full', wide ? 'max-w-3xl' : 'max-w-md')}>{children}</div>
    </div>
  );
}
