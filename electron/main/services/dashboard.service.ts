import { sql } from 'drizzle-orm';
import type { Db } from '../db/connection';

function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class DashboardService {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts for the dashboard alert cards (PRD §3.3). */
  summary(expiryWarningDays: number) {
    const today = isoDate(this.now());
    const warnUntil = isoDate(this.now() + expiryWarningDays * 86_400_000);
    const row = this.db.get<{
      itemCount: number;
      lowStockCount: number;
      nearExpiryCount: number;
      expiredCount: number;
    }>(sql`
      SELECT
        (SELECT count(*) FROM items WHERE active = 1) AS itemCount,
        (SELECT count(*) FROM items i
           WHERE i.active = 1 AND i.reorder_level_tabs > 0
             AND (SELECT coalesce(sum(b.qty), 0) FROM batches b
                    WHERE b.item_id = i.id AND b.expiry >= ${today}) <= i.reorder_level_tabs
        ) AS lowStockCount,
        (SELECT count(*) FROM batches WHERE qty > 0 AND expiry >= ${today} AND expiry <= ${warnUntil}) AS nearExpiryCount,
        (SELECT count(*) FROM batches WHERE qty > 0 AND expiry < ${today}) AS expiredCount
    `);
    return row;
  }
}
