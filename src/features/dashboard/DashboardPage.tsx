import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatRupees } from '@shared/domain/money';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CalendarClock,
  DatabaseBackup,
  PackageMinus,
  Pill,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';
import { queryKeys } from '@/app/queries';
import { useCan, useSessionUser } from '@/app/session';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { errorMessage, ipc } from '@/lib/ipc';
import { cn, formatDateTime } from '@/lib/utils';

type Tone = 'neutral' | 'warning' | 'danger';

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  tone: Tone;
}) {
  const active = tone !== 'neutral' && (value ?? 0) > 0;
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div
          className={cn(
            'grid size-11 place-items-center rounded-lg',
            !active && 'bg-surface-muted text-muted-foreground',
            active && tone === 'warning' && 'bg-warning-soft text-warning',
            active && tone === 'danger' && 'bg-danger-soft text-danger',
          )}
        >
          <Icon className="size-5" aria-hidden />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value ?? '—'}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const user = useSessionUser();
  const canSell = useCan('pos.sell');
  const { data, error, dataUpdatedAt } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => ipc('dashboard:summary'),
  });
  // Compared with the time the summary was fetched, so rendering stays pure.
  const backupStale =
    data && (!data.lastBackupAt || dataUpdatedAt - data.lastBackupAt > 36 * 3_600_000);

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.fullName.split(' ')[0]}`}
        description="Today's sales and stock alerts at a glance."
        actions={
          canSell && (
            <Button asChild size="lg">
              <Link to="/pos">
                <ShoppingCart /> Open POS (F1)
              </Link>
            </Button>
          )
        }
      />
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
      {data?.todaySalesPaisa != null && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-baseline gap-x-10 gap-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Today's net sales</p>
              <p className="text-3xl font-bold tabular-nums">
                {formatRupees(data.todaySalesPaisa)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Invoices today</p>
              <p className="text-3xl font-bold tabular-nums">{data.todayInvoices}</p>
            </div>
            <Link
              to="/reports"
              className="ml-auto text-sm text-primary underline-offset-4 hover:underline"
            >
              Full reports →
            </Link>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Items" value={data?.itemCount} icon={Pill} tone="neutral" />
        <StatCard
          label="Low stock"
          value={data?.lowStockCount}
          icon={PackageMinus}
          tone="warning"
        />
        <StatCard
          label="Expiring soon"
          value={data?.nearExpiryCount}
          icon={CalendarClock}
          tone="warning"
        />
        <StatCard
          label="Expired in stock"
          value={data?.expiredCount}
          icon={AlertTriangle}
          tone="danger"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseBackup className="size-4" aria-hidden /> Backups
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              Last backup: <span className="font-medium">{formatDateTime(data?.lastBackupAt)}</span>
            </p>
            {backupStale && (
              <Alert tone="warning">
                No backup in the last 36 hours. An Owner can make one in Settings → Backups.
              </Alert>
            )}
          </CardContent>
        </Card>
        {data?.itemCount === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Getting started</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Your medicine list is empty. Load it from an Excel or CSV sheet on the{' '}
              <Link to="/import" className="text-primary underline-offset-4 hover:underline">
                Import
              </Link>{' '}
              page, or add items one by one on the Items page.
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
