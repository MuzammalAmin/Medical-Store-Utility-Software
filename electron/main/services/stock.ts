import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/connection';
import type { STOCK_MOVEMENT_TYPES } from '../db/schema';
import { batches, stockMovements } from '../db/schema';
import { fail } from '../errors';

export type MovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export interface Movement {
  batchId: number;
  /** Signed, in the smallest unit: + stock in, − stock out. */
  qtyChange: number;
  type: MovementType;
  refType?: string;
  refId?: number;
  userId: number | null;
  note?: string;
}

/**
 * The only way stock changes (PRD §7): records the movement and updates the
 * cached batch quantity together. Must be called inside a transaction.
 * Stock can never go below zero.
 */
export function moveStock(db: Db, m: Movement): void {
  if (!Number.isSafeInteger(m.qtyChange) || m.qtyChange === 0) {
    throw fail.validation('Quantity must be a whole number other than zero');
  }
  const updated = db
    .update(batches)
    .set({ qty: sql`${batches.qty} + ${m.qtyChange}` })
    .where(
      m.qtyChange < 0
        ? sql`${batches.id} = ${m.batchId} AND ${batches.qty} >= ${-m.qtyChange}`
        : eq(batches.id, m.batchId),
    )
    .run();
  if (updated.changes === 0) {
    throw fail.conflict('Not enough stock in this batch');
  }
  db.insert(stockMovements)
    .values({
      batchId: m.batchId,
      qtyChange: m.qtyChange,
      type: m.type,
      refType: m.refType ?? null,
      refId: m.refId ?? null,
      userId: m.userId,
      note: m.note ?? null,
    })
    .run();
}
