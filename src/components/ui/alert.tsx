import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  info: { icon: Info, className: 'border-info/30 bg-info-soft text-info' },
  success: { icon: CheckCircle2, className: 'border-success/30 bg-success-soft text-success' },
  warning: { icon: AlertTriangle, className: 'border-warning/30 bg-warning-soft text-warning' },
  danger: { icon: XCircle, className: 'border-danger/30 bg-danger-soft text-danger' },
} as const;

/** Status message with an icon, so meaning never depends on colour alone (PRD §5.2). */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: toneClass } = tones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md border p-4', toneClass, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex flex-col gap-1 text-sm text-foreground">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
