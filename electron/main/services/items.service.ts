import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { addDays, todayIso } from '../../../shared/domain/dates';
import { itemDisplayName, storedPrice } from '../../../shared/domain/items';
import type { ItemForm } from '../../../shared/import/template';
import type { BatchRow, ItemDetail, ItemInput, ItemRow } from '../../../shared/ipc/schemas/catalog';
import type { BATCH_STATUSES, ITEM_FILTERS } from '../../../shared/ipc/schemas/catalog';
import type { Db } from '../db/connection';
import { batches, companies, generics, itemBarcodes, itemGenerics, items } from '../db/schema';
import { fail } from '../errors';
import { writeAudit } from './audit';

type ItemFilter = (typeof ITEM_FILTERS)[number];
type BatchStatus = (typeof BATCH_STATUSES)[number];

/** Escapes LIKE wildcards in user input (used with ESCAPE '\'). */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function batchStatus(expiry: string, today: string, warningDays: number): BatchStatus {
  if (expiry < today) return 'expired';
  return expiry <= addDays(today, warningDays) ? 'near' : 'ok';
}

interface RawItemRow {
  id: number;
  brandName: string;
  strength: string;
  form: ItemForm;
  company: string | null;
  category: string;
  rack: string;
  tabsPerStrip: number;
  stripsPerBox: number;
  priceMode: ItemRow['priceMode'];
  gstRateBp: number;
  basePriceBoxPaisa: number;
  finalPriceBoxPaisa: number;
  stripPriceOverridePaisa: number | null;
  tabPriceOverridePaisa: number | null;
  reorderLevelTabs: number;
  rxRequired: number;
  active: number;
  genericNames: string | null;
  barcodes: string | null;
  stockTabs: number;
  nearestExpiry: string | null;
}

const split = (value: string | null) => (value ? value.split('|') : []);

function toItemRow(r: RawItemRow): ItemRow {
  return {
    id: r.id,
    name: itemDisplayName(r),
    brandName: r.brandName,
    strength: r.strength,
    form: r.form,
    company: r.company ?? '',
    category: r.category,
    rack: r.rack,
    genericNames: split(r.genericNames),
    barcodes: split(r.barcodes),
    tabsPerStrip: r.tabsPerStrip,
    stripsPerBox: r.stripsPerBox,
    priceMode: r.priceMode,
    gstRateBp: r.gstRateBp,
    finalPriceBoxPaisa: r.finalPriceBoxPaisa,
    stockTabs: r.stockTabs,
    nearestExpiry: r.nearestExpiry,
    reorderLevelTabs: r.reorderLevelTabs,
    rxRequired: Boolean(r.rxRequired),
    active: Boolean(r.active),
  };
}

/** Columns shared by every item query; stock counts only unexpired batches. */
function itemSelect(today: string): SQL {
  return sql`
    SELECT i.id, i.brand_name AS brandName, i.strength, i.form, c.name AS company, i.category, i.rack,
      i.tabs_per_strip AS tabsPerStrip, i.strips_per_box AS stripsPerBox,
      i.price_mode AS priceMode, i.gst_rate_bp AS gstRateBp,
      i.base_price_box_paisa AS basePriceBoxPaisa, i.final_price_box_paisa AS finalPriceBoxPaisa,
      i.strip_price_override_paisa AS stripPriceOverridePaisa, i.tab_price_override_paisa AS tabPriceOverridePaisa,
      i.reorder_level_tabs AS reorderLevelTabs, i.rx_required AS rxRequired, i.active,
      (SELECT group_concat(g.name, '|') FROM item_generics ig JOIN generics g ON g.id = ig.generic_id
         WHERE ig.item_id = i.id) AS genericNames,
      (SELECT group_concat(b.barcode, '|') FROM item_barcodes b WHERE b.item_id = i.id) AS barcodes,
      (SELECT coalesce(sum(b.qty), 0) FROM batches b WHERE b.item_id = i.id AND b.expiry >= ${today}) AS stockTabs,
      (SELECT min(b.expiry) FROM batches b WHERE b.item_id = i.id AND b.qty > 0 AND b.expiry >= ${today}) AS nearestExpiry
    FROM items i LEFT JOIN companies c ON c.id = i.company_id`;
}

/** Matches brand (contains), exact barcode, or generic name (contains). */
function searchCondition(query: string): SQL {
  const like = likePattern(query);
  return sql`(i.brand_name LIKE ${like} ESCAPE '\\'
    OR EXISTS (SELECT 1 FROM item_barcodes b WHERE b.item_id = i.id AND b.barcode = ${query})
    OR EXISTS (SELECT 1 FROM item_generics ig JOIN generics g ON g.id = ig.generic_id
               WHERE ig.item_id = i.id AND g.name LIKE ${like} ESCAPE '\\'))`;
}

export class ItemsService {
  constructor(
    private readonly db: Db,
    private readonly expiryWarningDays: () => number,
    private readonly now: () => number = Date.now,
  ) {}

  list(q: { query: string; filter: ItemFilter; page: number; pageSize: number }): {
    rows: ItemRow[];
    total: number;
  } {
    const today = todayIso(this.now());
    const conditions: SQL[] = [q.filter === 'inactive' ? sql`active = 0` : sql`active = 1`];
    if (q.query) conditions.push(sql`(${searchCondition(q.query)})`);
    const where = sql.join(conditions, sql` AND `);
    const inner = sql`${itemSelect(today)} WHERE ${where}`;
    const filtered =
      q.filter === 'low'
        ? sql`SELECT * FROM (${inner}) WHERE reorderLevelTabs > 0 AND stockTabs <= reorderLevelTabs`
        : q.filter === 'out'
          ? sql`SELECT * FROM (${inner}) WHERE stockTabs = 0`
          : sql`SELECT * FROM (${inner})`;
    const total = this.db.get<{ n: number }>(sql`SELECT count(*) AS n FROM (${filtered})`).n;
    const rows = this.db.all<RawItemRow>(
      sql`${filtered} ORDER BY brandName COLLATE NOCASE, strength LIMIT ${q.pageSize} OFFSET ${q.page * q.pageSize}`,
    );
    return { rows: rows.map(toItemRow), total };
  }

  /** Item rows for POS search: exact barcode first, then brand prefix, then the rest. */
  search(query: string, limit = 20): RawItemRow[] {
    const today = todayIso(this.now());
    const prefix = `${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.db.all<RawItemRow>(sql`${itemSelect(today)}
      WHERE i.active = 1 AND ${searchCondition(query)}
      ORDER BY
        CASE WHEN EXISTS (SELECT 1 FROM item_barcodes b WHERE b.item_id = i.id AND b.barcode = ${query}) THEN 0
             WHEN i.brand_name LIKE ${prefix} ESCAPE '\\' THEN 1 ELSE 2 END,
        i.brand_name COLLATE NOCASE, i.strength
      LIMIT ${limit}`);
  }

  rawByIds(ids: number[]): RawItemRow[] {
    if (ids.length === 0) return [];
    const today = todayIso(this.now());
    return this.db.all<RawItemRow>(
      sql`${itemSelect(today)} WHERE i.id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  }

  get(id: number, canSeeCost: boolean): ItemDetail {
    const raw = this.rawByIds([id])[0];
    if (!raw) throw fail.notFound('Item');
    const batchRows = this.batchesForItems([id], canSeeCost, { includeEmpty: false });
    return {
      ...toItemRow(raw),
      basePriceBoxPaisa: raw.basePriceBoxPaisa,
      stripOverridePaisa: raw.stripPriceOverridePaisa,
      tabOverridePaisa: raw.tabPriceOverridePaisa,
      batches: batchRows,
    };
  }

  batchesForItems(
    itemIds: number[],
    canSeeCost: boolean,
    opts: { includeEmpty: boolean },
  ): BatchRow[] {
    if (itemIds.length === 0) return [];
    const today = todayIso(this.now());
    const rows = this.db
      .select({
        id: batches.id,
        itemId: batches.itemId,
        batchNo: batches.batchNo,
        expiry: batches.expiry,
        qty: batches.qty,
        costBoxPaisa: batches.costPriceBoxPaisa,
        priceMode: batches.priceMode,
        gstRateBp: batches.gstRateBp,
        finalPriceBoxPaisa: batches.finalPriceBoxPaisa,
        brandName: items.brandName,
        strength: items.strength,
        form: items.form,
        tabsPerStrip: items.tabsPerStrip,
        stripsPerBox: items.stripsPerBox,
      })
      .from(batches)
      .innerJoin(items, eq(items.id, batches.itemId))
      .where(
        and(
          inArray(batches.itemId, itemIds),
          opts.includeEmpty ? undefined : sql`${batches.qty} > 0`,
        ),
      )
      .orderBy(batches.expiry, batches.id)
      .all();
    return rows.map((r) => ({
      id: r.id,
      itemId: r.itemId,
      itemName: itemDisplayName(r),
      batchNo: r.batchNo,
      expiry: r.expiry,
      qty: r.qty,
      tabsPerStrip: r.tabsPerStrip,
      stripsPerBox: r.stripsPerBox,
      costBoxPaisa: canSeeCost ? r.costBoxPaisa : null,
      priceMode: r.priceMode,
      gstRateBp: r.gstRateBp,
      finalPriceBoxPaisa: r.finalPriceBoxPaisa,
      status: batchStatus(r.expiry, today, this.expiryWarningDays()),
    }));
  }

  /** Other active brands with the same generic(s) and strength (PRD §3.1 alternatives view). */
  alternatives(id: number): ItemRow[] {
    const base = this.rawByIds([id])[0];
    if (!base) throw fail.notFound('Item');
    const genericIds = this.db
      .select({ id: itemGenerics.genericId })
      .from(itemGenerics)
      .where(eq(itemGenerics.itemId, id))
      .all()
      .map((g) => g.id);
    if (genericIds.length === 0) return [];
    const today = todayIso(this.now());
    const ids = sql.join(
      genericIds.map((g) => sql`${g}`),
      sql`, `,
    );
    const rows = this.db.all<RawItemRow>(sql`${itemSelect(today)}
      WHERE i.active = 1 AND i.id <> ${id} AND lower(i.strength) = lower(${base.strength})
        AND (SELECT count(*) FROM item_generics ig WHERE ig.item_id = i.id AND ig.generic_id IN (${ids})) = ${genericIds.length}
        AND (SELECT count(*) FROM item_generics ig WHERE ig.item_id = i.id) = ${genericIds.length}
      ORDER BY stockTabs = 0, i.final_price_box_paisa`);
    return rows.map(toItemRow);
  }

  save(input: ItemInput, userId: number): number {
    return this.db.transaction((tx) => {
      const price = storedPrice(
        input.price.priceMode,
        input.price.gstRateBp,
        input.price.amountBoxPaisa,
      );
      const companyId = input.company ? findOrCreate(tx, 'company', input.company) : null;
      const values = {
        brandName: input.brandName,
        strength: input.strength,
        form: input.form,
        companyId,
        category: input.category,
        rack: input.rack,
        tabsPerStrip: input.tabsPerStrip,
        stripsPerBox: input.stripsPerBox,
        ...price,
        stripPriceOverridePaisa: input.stripsPerBox > 1 ? input.stripOverridePaisa : null,
        tabPriceOverridePaisa: input.tabsPerStrip > 1 ? input.tabOverridePaisa : null,
        reorderLevelTabs: input.reorderLevelTabs,
        rxRequired: input.rxRequired,
        updatedAt: this.now(),
      };

      let id: number;
      if (input.id === undefined) {
        id = tx.insert(items).values(values).returning({ id: items.id }).get().id;
        writeAudit(tx, {
          userId,
          action: 'item.create',
          entity: 'item',
          entityId: id,
          details: { ...values },
        });
      } else {
        const before = tx.select().from(items).where(eq(items.id, input.id)).get();
        if (!before) throw fail.notFound('Item');
        id = input.id;
        tx.update(items).set(values).where(eq(items.id, id)).run();
        const priceChanged =
          before.priceMode !== price.priceMode ||
          before.gstRateBp !== price.gstRateBp ||
          before.finalPriceBoxPaisa !== price.finalPriceBoxPaisa ||
          before.stripPriceOverridePaisa !== values.stripPriceOverridePaisa ||
          before.tabPriceOverridePaisa !== values.tabPriceOverridePaisa;
        writeAudit(tx, {
          userId,
          action: priceChanged ? 'item.price_change' : 'item.update',
          entity: 'item',
          entityId: id,
          details: { before, after: values },
        });
      }

      // Barcodes: each belongs to exactly one item.
      tx.delete(itemBarcodes).where(eq(itemBarcodes.itemId, id)).run();
      for (const barcode of new Set(input.barcodes)) {
        const owner = tx.select().from(itemBarcodes).where(eq(itemBarcodes.barcode, barcode)).get();
        if (owner) {
          const other = this.rawByIdsTx(tx, owner.itemId);
          throw fail.conflict(`Barcode ${barcode} already belongs to ${other ?? 'another item'}`);
        }
        tx.insert(itemBarcodes).values({ barcode, itemId: id }).run();
      }

      tx.delete(itemGenerics).where(eq(itemGenerics.itemId, id)).run();
      for (const name of new Set(input.genericNames)) {
        tx.insert(itemGenerics)
          .values({ itemId: id, genericId: findOrCreate(tx, 'generic', name) })
          .onConflictDoNothing()
          .run();
      }
      return id;
    });
  }

  setActive(id: number, active: boolean, userId: number): void {
    const result = this.db
      .update(items)
      .set({ active, updatedAt: this.now() })
      .where(eq(items.id, id))
      .run();
    if (result.changes === 0) throw fail.notFound('Item');
    writeAudit(this.db, {
      userId,
      action: active ? 'item.activate' : 'item.deactivate',
      entity: 'item',
      entityId: id,
    });
  }

  private rawByIdsTx(tx: Db, id: number): string | null {
    const row = tx
      .select({ brandName: items.brandName, strength: items.strength, form: items.form })
      .from(items)
      .where(eq(items.id, id))
      .get();
    return row ? itemDisplayName(row) : null;
  }
}

/** Finds a company or generic by name (ignoring case), creating it if needed. */
export function findOrCreate(db: Db, kind: 'company' | 'generic', name: string): number {
  const table = kind === 'company' ? companies : generics;
  const existing = db
    .select({ id: table.id })
    .from(table)
    .where(sql`lower(${table.name}) = lower(${name})`)
    .get();
  if (existing) return existing.id;
  return db.insert(table).values({ name }).returning({ id: table.id }).get().id;
}

export type { RawItemRow };
