import { AlertTriangle, CalendarClock, PackageX } from 'lucide-react';
import { addDays, formatExpiry, todayIso } from '@shared/domain/dates';
import { describeQty } from '@shared/domain/items';
import type { PackSize } from '@shared/domain/units';
import { useSettings } from '@/app/queries';
import { Badge } from '@/components/ui/badge';

/** Expiry with an icon when near or past (status never shown by colour alone). */
export function ExpiryBadge({
  expiry,
  status,
}: {
  expiry: string | null;
  status: 'ok' | 'near' | 'expired';
}) {
  if (!expiry) return <span className="text-muted-foreground">—</span>;
  if (status === 'expired')
    return (
      <Badge tone="danger">
        <AlertTriangle className="size-3" aria-hidden /> Expired {formatExpiry(expiry)}
      </Badge>
    );
  if (status === 'near')
    return (
      <Badge tone="warning">
        <CalendarClock className="size-3" aria-hidden /> {formatExpiry(expiry)}
      </Badge>
    );
  return <span>{formatExpiry(expiry)}</span>;
}

export function StockBadge({
  tabs,
  reorderLevelTabs,
  pack,
}: {
  tabs: number;
  reorderLevelTabs: number;
  pack: PackSize;
}) {
  if (tabs === 0)
    return (
      <Badge tone="danger">
        <PackageX className="size-3" aria-hidden /> Out of stock
      </Badge>
    );
  const low = reorderLevelTabs > 0 && tabs <= reorderLevelTabs;
  return low ? (
    <Badge tone="warning">Low: {describeQty(tabs, pack)}</Badge>
  ) : (
    <span>{describeQty(tabs, pack)}</span>
  );
}

/** Last date that still counts as "expiring soon", from the inventory setting. */
export function useExpirySoonDate(): string {
  const { data } = useSettings();
  return addDays(todayIso(), data?.inventory.expiryWarningDays ?? 90);
}
