import { and, eq, sql } from 'drizzle-orm';
import { addDays, todayIso } from '../../../shared/domain/dates';
import { storedPrice } from '../../../shared/domain/items';
import { toSmallestUnits } from '../../../shared/domain/units';
import type { AddBatchInput, AdjustInput, BatchRow } from '../../../shared/ipc/schemas/catalog';
import type { BATCH_FILTERS } from '../../../shared/ipc/schemas/catalog';
import type { Db } from '../db/connection';
import { batches, items } from '../db/schema';
import { fail } from '../errors';
import { writeAudit } from './audit';
import { likePattern, type ItemsService } from './items.service';
import { moveStock } from './stock';

type BatchFilter = (typeof BATCH_FILTERS)[number];

export class InventoryService {
  constructor(
    private readonly db: Db,
    private readonly items: ItemsService,
    private readonly expiryWarningDays: () => number,
    private readonly now: () => number = Date.now,
  ) {}

  list(
    q: { query: string; filter: BatchFilter; page: number; pageSize: number },
    canSeeCost: boolean,
  ): { rows: BatchRow[]; total: number } {
    const today = todayIso(this.now());
    const conditions = [sql`i.active = 1`];
    if (q.filter !== 'all') conditions.push(sql`b.qty > 0`);
    if (q.filter === 'near') {
      conditions.push(
        sql`b.expiry >= ${today} AND b.expiry <= ${addDays(today, this.expiryWarningDays())}`,
      );
    }
    if (q.filter === 'expired') conditions.push(sql`b.expiry < ${today}`);
    if (q.query) {
      conditions.push(
        sql`(i.brand_name LIKE ${likePattern(q.query)} ESCAPE '\\' OR b.batch_no = ${q.query})`,
      );
    }
    const where = sql.join(conditions, sql` AND `);
    const total = this.db.get<{ n: number }>(
      sql`SELECT count(*) AS n FROM batches b JOIN items i ON i.id = b.item_id WHERE ${where}`,
    ).n;
    const page = this.db.all<{ id: number; itemId: number }>(
      sql`SELECT b.id, b.item_id AS itemId FROM batches b JOIN items i ON i.id = b.item_id
          WHERE ${where} ORDER BY b.expiry, i.brand_name COLLATE NOCASE
          LIMIT ${q.pageSize} OFFSET ${q.page * q.pageSize}`,
    );
    const ids = new Set(page.map((p) => p.id));
    const rows = this.items
      .batchesForItems([...new Set(page.map((p) => p.itemId))], canSeeCost, { includeEmpty: true })
      .filter((b) => ids.has(b.id));
    return { rows, total };
  }

  /** Opening stock or a manual stock entry. Adds to the batch if it already exists. */
  addBatch(input: AddBatchInput, userId: number): BatchRow {
    if (input.expiry < todayIso(this.now()))
      throw fail.validation('This batch has already expired');
    const batchId = this.db.transaction((tx) => {
      const item = tx.select().from(items).where(eq(items.id, input.itemId)).get();
      if (!item) throw fail.notFound('Item');
      const pack = { tabsPerStrip: item.tabsPerStrip, stripsPerBox: item.stripsPerBox };
      const price = input.price
        ? storedPrice(input.price.priceMode, input.price.gstRateBp, input.price.amountBoxPaisa)
        : {
            priceMode: item.priceMode,
            gstRateBp: item.gstRateBp,
            basePriceBoxPaisa: item.basePriceBoxPaisa,
            finalPriceBoxPaisa: item.finalPriceBoxPaisa,
          };

      const existing = tx
        .select({ id: batches.id })
        .from(batches)
        .where(
          and(
            eq(batches.itemId, input.itemId),
            eq(batches.batchNo, input.batchNo),
            eq(batches.expiry, input.expiry),
          ),
        )
        .get();
      const id =
        existing?.id ??
        tx
          .insert(batches)
          .values({
            itemId: input.itemId,
            batchNo: input.batchNo,
            expiry: input.expiry,
            costPriceBoxPaisa: input.costBoxPaisa,
            ...price,
          })
          .returning({ id: batches.id })
          .get().id;
      if (existing) {
        tx.update(batches)
          .set({ costPriceBoxPaisa: input.costBoxPaisa, ...price })
          .where(eq(batches.id, id))
          .run();
      }
      moveStock(tx, {
        batchId: id,
        qtyChange: toSmallestUnits(input.qty, input.unit, pack),
        type: 'opening',
        refType: 'manual',
        userId,
      });
      writeAudit(tx, {
        userId,
        action: 'stock.add_batch',
        entity: 'batch',
        entityId: id,
        details: { ...input },
      });
      return id;
    });
    return this.batchById(batchId, true);
  }

  /** Stock correction by the Owner: damage, loss, count correction or expiry write-off (PRD §3.3). */
  adjust(input: AdjustInput, userId: number): BatchRow {
    this.db.transaction((tx) => {
      moveStock(tx, {
        batchId: input.batchId,
        qtyChange: input.qtyChange,
        type: input.reason === 'expired' || input.reason === 'damaged' ? 'write_off' : 'adjustment',
        refType: input.reason,
        userId,
        note: input.note,
      });
      writeAudit(tx, {
        userId,
        action: 'stock.adjust',
        entity: 'batch',
        entityId: input.batchId,
        details: { ...input },
      });
    });
    return this.batchById(input.batchId, true);
  }

  private batchById(id: number, canSeeCost: boolean): BatchRow {
    const batch = this.db
      .select({ itemId: batches.itemId })
      .from(batches)
      .where(eq(batches.id, id))
      .get();
    if (!batch) throw fail.notFound('Batch');
    const row = this.items
      .batchesForItems([batch.itemId], canSeeCost, { includeEmpty: true })
      .find((b) => b.id === id);
    return row!;
  }
}
