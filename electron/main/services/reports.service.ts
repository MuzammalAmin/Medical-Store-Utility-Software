import { sql } from 'drizzle-orm';
import { addDays, todayIso } from '../../../shared/domain/dates';
import { describeQty, itemDisplayName } from '../../../shared/domain/items';
import { divRound } from '../../../shared/domain/money';
import type { ItemForm } from '../../../shared/import/template';
import type {
  ReportTable,
  SalesSummary,
  StockReportKind,
} from '../../../shared/ipc/schemas/reports';
import type { PaymentMethod } from '../../../shared/ipc/schemas/sales';
import type { Db } from '../db/connection';
import { dayBounds } from './sales.service';

const toLocalDate = (ms: number) => todayIso(ms);

export class ReportsService {
  constructor(
    private readonly db: Db,
    private readonly expiryWarningDays: () => number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Sales, refunds, GST and profit for a date range (PRD §3.9). Voided
   * invoices are excluded; returns count on the day they were made.
   * Profit = (sales − GST) − cost − (refunds − refund GST) + cost of restocked returns.
   */
  salesSummary(from: string, to: string, canSeeCost: boolean): SalesSummary {
    const [start, end] = dayBounds(from, to);
    const saleRows = this.db.all<{
      at: number;
      subtotal: number;
      discount: number;
      gst: number;
      total: number;
      cost: number;
      method: PaymentMethod;
      status: string;
    }>(sql`SELECT created_at AS at, subtotal_paisa AS subtotal, discount_paisa AS discount,
             gst_paisa AS gst, total_paisa AS total, cost_paisa AS cost, payment_method AS method, status
           FROM sales WHERE created_at >= ${start} AND created_at < ${end}`);
    const returnRows = this.db.all<{
      at: number;
      refund: number;
      gst: number;
      cost: number;
      method: PaymentMethod;
    }>(
      sql`SELECT created_at AS at, refund_paisa AS refund, gst_paisa AS gst, cost_paisa AS cost,
            refund_method AS method
          FROM returns WHERE created_at >= ${start} AND created_at < ${end}`,
    );

    const valid = saleRows.filter((s) => s.status === 'completed');
    const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);
    const total = sum(valid, (s) => s.total);
    const gst = sum(valid, (s) => s.gst);
    const refunds = sum(returnRows, (r) => r.refund);
    const refundGst = sum(returnRows, (r) => r.gst);
    const cost = sum(valid, (s) => s.cost) - sum(returnRows, (r) => r.cost);

    const byMethod = new Map<PaymentMethod, number>();
    for (const s of valid) byMethod.set(s.method, (byMethod.get(s.method) ?? 0) + s.total);
    for (const r of returnRows) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) - r.refund);

    const byDay = new Map<string, { invoices: number; totalPaisa: number; refundsPaisa: number }>();
    const day = (date: string) => {
      const entry = byDay.get(date) ?? { invoices: 0, totalPaisa: 0, refundsPaisa: 0 };
      byDay.set(date, entry);
      return entry;
    };
    for (const s of valid) {
      const d = day(toLocalDate(s.at));
      d.invoices += 1;
      d.totalPaisa += s.total;
    }
    for (const r of returnRows) day(toLocalDate(r.at)).refundsPaisa += r.refund;

    const net = total - refunds;
    const netGst = gst - refundGst;
    return {
      invoices: valid.length,
      voided: saleRows.length - valid.length,
      subtotalPaisa: sum(valid, (s) => s.subtotal),
      discountPaisa: sum(valid, (s) => s.discount),
      gstPaisa: gst,
      totalPaisa: total,
      refundsPaisa: refunds,
      refundGstPaisa: refundGst,
      netPaisa: net,
      netGstPaisa: netGst,
      costPaisa: canSeeCost ? cost : null,
      profitPaisa: canSeeCost ? net - netGst - cost : null,
      byMethod: [...byMethod].map(([method, totalPaisa]) => ({ method, totalPaisa })),
      byDay: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    };
  }

  /** Today's invoice count and takings for the dashboard. */
  today(): { invoices: number; totalPaisa: number } {
    const today = todayIso(this.now());
    const s = this.salesSummary(today, today, false);
    return { invoices: s.invoices, totalPaisa: s.netPaisa };
  }

  stock(kind: StockReportKind, canSeeCost: boolean): ReportTable {
    const today = todayIso(this.now());
    const warnUntil = addDays(today, this.expiryWarningDays());
    type Row = {
      brandName: string;
      strength: string;
      form: ItemForm;
      tabsPerStrip: number;
      stripsPerBox: number;
      batchNo: string;
      expiry: string;
      qty: number;
      cost: number;
      price: number;
      reorder: number;
    };
    const base = sql`SELECT i.brand_name AS brandName, i.strength, i.form, i.tabs_per_strip AS tabsPerStrip,
        i.strips_per_box AS stripsPerBox, b.batch_no AS batchNo, b.expiry, b.qty,
        b.cost_price_box_paisa AS cost, b.final_price_box_paisa AS price, i.reorder_level_tabs AS reorder
      FROM batches b JOIN items i ON i.id = b.item_id WHERE i.active = 1 AND b.qty > 0`;
    const valueOf = (r: Row, perBox: number) =>
      divRound(perBox * r.qty, r.tabsPerStrip * r.stripsPerBox);
    const name = (r: Row) => itemDisplayName(r);
    const qtyLabel = (r: Row) => describeQty(r.qty, r);

    if (kind === 'low') {
      const rows = this.db.all<{
        brandName: string;
        strength: string;
        form: ItemForm;
        tabsPerStrip: number;
        stripsPerBox: number;
        stock: number;
        reorder: number;
      }>(sql`SELECT * FROM (SELECT i.brand_name AS brandName, i.strength, i.form, i.tabs_per_strip AS tabsPerStrip,
          i.strips_per_box AS stripsPerBox, i.reorder_level_tabs AS reorder,
          (SELECT coalesce(sum(b.qty), 0) FROM batches b WHERE b.item_id = i.id AND b.expiry >= ${today}) AS stock
        FROM items i WHERE i.active = 1 AND i.reorder_level_tabs > 0) WHERE stock <= reorder
        ORDER BY brandName COLLATE NOCASE`);
      return {
        title: 'Low stock',
        columns: [
          { key: 'item', label: 'Item', kind: 'text' },
          { key: 'stock', label: 'In stock', kind: 'text' },
          { key: 'reorder', label: 'Reorder level', kind: 'text' },
        ],
        rows: rows.map((r) => ({
          item: itemDisplayName(r),
          stock: describeQty(r.stock, r),
          reorder: describeQty(r.reorder, r),
        })),
        totals: null,
      };
    }

    const filter =
      kind === 'near_expiry'
        ? sql` AND b.expiry >= ${today} AND b.expiry <= ${warnUntil}`
        : kind === 'expired'
          ? sql` AND b.expiry < ${today}`
          : sql` AND b.expiry >= ${today}`;
    const rows = this.db.all<Row>(
      sql`${base}${filter} ORDER BY b.expiry, i.brand_name COLLATE NOCASE`,
    );
    const columns: ReportTable['columns'] = [
      { key: 'item', label: 'Item', kind: 'text' },
      { key: 'batch', label: 'Batch', kind: 'text' },
      { key: 'expiry', label: 'Expiry', kind: 'date' },
      { key: 'qty', label: 'Quantity', kind: 'text' },
      ...(canSeeCost ? [{ key: 'cost', label: 'Cost value', kind: 'money' as const }] : []),
      { key: 'value', label: 'Sale value', kind: 'money' },
    ];
    const tableRows = rows.map((r) => ({
      item: name(r),
      batch: r.batchNo,
      expiry: r.expiry,
      qty: qtyLabel(r),
      ...(canSeeCost ? { cost: valueOf(r, r.cost) } : {}),
      value: valueOf(r, r.price),
    }));
    const titles: Record<StockReportKind, string> = {
      value: 'Stock value',
      near_expiry: 'Expiring soon',
      expired: 'Expired stock',
      low: 'Low stock',
    };
    return {
      title: titles[kind],
      columns,
      rows: tableRows,
      totals: {
        item: `${rows.length} batches`,
        ...(canSeeCost ? { cost: tableRows.reduce((a, r) => a + (r.cost ?? 0), 0) } : {}),
        value: tableRows.reduce((a, r) => a + r.value, 0),
      },
    };
  }
}
