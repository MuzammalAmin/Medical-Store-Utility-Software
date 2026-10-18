import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { BillError, buildBill, type BillItem } from '../../../shared/domain/bill';
import { discountShareBp } from '../../../shared/domain/cart';
import { todayIso } from '../../../shared/domain/dates';
import {
  itemDisplayName,
  unitAmount,
  unitFinalPrice,
  type StoredPrice,
} from '../../../shared/domain/items';
import { computePrice } from '../../../shared/domain/gst';
import { divRound } from '../../../shared/domain/money';
import {
  availableUnits,
  SALE_UNITS,
  unitFactor,
  type SaleUnit,
} from '../../../shared/domain/units';
import type { SessionUser } from '../../../shared/ipc/contract';
import type {
  CartDraft,
  CheckoutInput,
  HeldBill,
  PosBatch,
  PosItem,
  SaleDetail,
  SaleRow,
} from '../../../shared/ipc/schemas/sales';
import type { PosSettings } from '../../../shared/settings';
import type { Db } from '../db/connection';
import { batches, heldBills, returnLines, returns, saleLines, sales, users } from '../db/schema';
import { fail } from '../errors';
import { writeAudit } from './audit';
import type { AuthService } from './auth.service';
import { batchStatus, type ItemsService, type RawItemRow } from './items.service';
import { moveStock } from './stock';

/** Start of a local calendar day in ms, and the start of the next day. */
export function dayBounds(from: string, to: string): [number, number] {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return [new Date(fy!, fm! - 1, fd).getTime(), new Date(ty!, tm! - 1, td! + 1).getTime()];
}

export class SalesService {
  constructor(
    private readonly db: Db,
    private readonly items: ItemsService,
    private readonly auth: AuthService,
    private readonly settings: () => { pos: PosSettings; expiryWarningDays: number },
    private readonly now: () => number = Date.now,
  ) {}

  // ── POS lookup ──────────────────────────────────────────────────────────

  search(query: string): PosItem[] {
    return this.toPosItems(this.items.search(query));
  }

  posItems(ids: number[]): PosItem[] {
    return this.toPosItems(this.items.rawByIds(ids).filter((r) => r.active));
  }

  private toPosItems(rows: RawItemRow[]): PosItem[] {
    if (rows.length === 0) return [];
    const today = todayIso(this.now());
    const warnDays = this.settings().expiryWarningDays;
    const sellable = this.db
      .select()
      .from(batches)
      .where(
        and(
          inArray(
            batches.itemId,
            rows.map((r) => r.id),
          ),
          sql`${batches.qty} > 0`,
          sql`${batches.expiry} >= ${today}`,
        ),
      )
      .orderBy(batches.expiry, batches.id)
      .all();

    return rows.map((r) => {
      const pack = { tabsPerStrip: r.tabsPerStrip, stripsPerBox: r.stripsPerBox };
      const itemBatches: PosBatch[] = sellable
        .filter((b) => b.itemId === r.id)
        .map((b) => {
          const price: StoredPrice = b;
          // Manual strip/tablet prices apply only while the batch uses the item's price mode.
          const overrides =
            b.priceMode === r.priceMode
              ? { strip: r.stripPriceOverridePaisa, tab: r.tabPriceOverridePaisa }
              : { strip: null, tab: null };
          const amounts = Object.fromEntries(
            SALE_UNITS.map((u) => [u, unitAmount(price, u, pack, overrides)]),
          ) as Record<SaleUnit, number>;
          return {
            id: b.id,
            batchNo: b.batchNo,
            expiry: b.expiry,
            qty: b.qty,
            priceMode: b.priceMode,
            gstRateBp: b.gstRateBp,
            unitAmounts: amounts,
            unitFinal: Object.fromEntries(
              SALE_UNITS.map((u) => [u, unitFinalPrice(price, amounts[u])]),
            ) as Record<SaleUnit, number>,
            nearExpiry: batchStatus(b.expiry, today, warnDays) === 'near',
          };
        });
      return {
        id: r.id,
        name: itemDisplayName(r),
        genericNames: r.genericNames ? r.genericNames.split('|') : [],
        rack: r.rack,
        rxRequired: Boolean(r.rxRequired),
        tabsPerStrip: r.tabsPerStrip,
        stripsPerBox: r.stripsPerBox,
        units: availableUnits(pack),
        stockTabs: itemBatches.reduce((s, b) => s + b.qty, 0),
        batches: itemBatches,
      };
    });
  }

  // ── Checkout ────────────────────────────────────────────────────────────

  checkout(input: CheckoutInput, user: SessionUser): SaleDetail {
    const { pos } = this.settings();
    const saleId = this.db.transaction((tx) => {
      const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
      const posItems = this.posItems(itemIds);
      const map = new Map<number, BillItem>(posItems.map((i) => [i.id, i]));

      let bill;
      try {
        bill = buildBill(input.lines, map, input.billDiscount);
      } catch (error) {
        if (error instanceof BillError) throw fail.conflict(error.message);
        throw fail.validation(error instanceof Error ? error.message : 'The bill is not valid');
      }

      if (
        !user.permissions.includes('prices.edit') &&
        discountShareBp(bill.cart) > pos.staffMaxDiscountBp
      ) {
        throw fail.forbidden(
          `Staff can give at most ${pos.staffMaxDiscountBp / 100}% discount. Ask the Owner`,
        );
      }

      const total = bill.cart.totalPaisa;
      const cash = input.payment.method === 'cash';
      if (cash && input.payment.paidPaisa < total) {
        throw fail.validation('The cash received is less than the total');
      }
      const paidPaisa = cash ? input.payment.paidPaisa : total;

      const costs = bill.parts.map((p) => {
        const batch = tx.select().from(batches).where(eq(batches.id, p.batch.id)).get()!;
        const item = map.get(p.itemId)!;
        return divRound(batch.costPriceBoxPaisa * p.qtyTabs, unitFactor('box', item));
      });

      const invoiceNo =
        (tx.get<{ n: number | null }>(sql`SELECT max(invoice_no) AS n FROM sales`).n ?? 0) + 1;
      const sale = tx
        .insert(sales)
        .values({
          invoiceNo,
          userId: user.id,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          doctorName: input.doctorName,
          subtotalPaisa: bill.cart.subtotalPaisa,
          discountPaisa: bill.cart.discountPaisa,
          gstPaisa: bill.cart.gstPaisa,
          totalPaisa: total,
          costPaisa: costs.reduce((a, b) => a + b, 0),
          paymentMethod: input.payment.method,
          paidPaisa,
          changePaisa: paidPaisa - total,
        })
        .returning({ id: sales.id })
        .get();

      bill.parts.forEach((p, i) => {
        tx.insert(saleLines)
          .values({
            saleId: sale.id,
            itemId: p.itemId,
            batchId: p.batch.id,
            itemName: p.itemName,
            batchNo: p.batch.batchNo,
            expiry: p.batch.expiry,
            unit: p.unit,
            qty: p.qty,
            qtyTabs: p.qtyTabs,
            priceMode: p.batch.priceMode,
            gstRateBp: p.batch.gstRateBp,
            unitAmountPaisa: p.batch.unitAmounts[p.unit],
            subtotalPaisa: p.priced.subtotalPaisa,
            discountPaisa: p.priced.discountPaisa,
            gstPaisa: p.priced.gstPaisa,
            totalPaisa: p.priced.totalPaisa,
            costPaisa: costs[i]!,
          })
          .run();
        moveStock(tx, {
          batchId: p.batch.id,
          qtyChange: -p.qtyTabs,
          type: 'sale',
          refType: 'sale',
          refId: sale.id,
          userId: user.id,
        });
      });

      if (input.heldBillId !== null)
        tx.delete(heldBills).where(eq(heldBills.id, input.heldBillId)).run();
      writeAudit(tx, {
        userId: user.id,
        action: 'sale.create',
        entity: 'sale',
        entityId: invoiceNo,
        details: { total, method: input.payment.method, lines: bill.parts.length },
      });
      return sale.id;
    });
    return this.detail(saleId);
  }

  // ── Invoices ────────────────────────────────────────────────────────────

  getByInvoice(invoiceNo: number): SaleDetail {
    const sale = this.db
      .select({ id: sales.id })
      .from(sales)
      .where(eq(sales.invoiceNo, invoiceNo))
      .get();
    if (!sale) throw fail.notFound(`Invoice #${invoiceNo}`);
    return this.detail(sale.id);
  }

  detail(id: number): SaleDetail {
    const sale = this.db
      .select({ s: sales, cashierName: users.fullName })
      .from(sales)
      .innerJoin(users, eq(users.id, sales.userId))
      .where(eq(sales.id, id))
      .get();
    if (!sale) throw fail.notFound('Invoice');
    const lines = this.db
      .select()
      .from(saleLines)
      .where(eq(saleLines.saleId, id))
      .orderBy(saleLines.id)
      .all();
    const returned = new Map(
      this.db
        .select({ saleLineId: returnLines.saleLineId, qty: sql<number>`sum(${returnLines.qty})` })
        .from(returnLines)
        .innerJoin(returns, eq(returns.id, returnLines.returnId))
        .where(eq(returns.saleId, id))
        .groupBy(returnLines.saleLineId)
        .all()
        .map((r) => [r.saleLineId, r.qty]),
    );
    const refunded =
      this.db.get<{ n: number | null }>(
        sql`SELECT sum(refund_paisa) AS n FROM returns WHERE sale_id = ${id}`,
      ).n ?? 0;
    const s = sale.s;
    return {
      id: s.id,
      invoiceNo: s.invoiceNo,
      at: s.at,
      cashierName: sale.cashierName,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      doctorName: s.doctorName,
      subtotalPaisa: s.subtotalPaisa,
      discountPaisa: s.discountPaisa,
      gstPaisa: s.gstPaisa,
      totalPaisa: s.totalPaisa,
      paymentMethod: s.paymentMethod,
      paidPaisa: s.paidPaisa,
      changePaisa: s.changePaisa,
      status: s.status,
      voidedAt: s.voidedAt,
      voidReason: s.voidReason,
      refundedPaisa: refunded,
      lines: lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        itemName: l.itemName,
        batchNo: l.batchNo,
        expiry: l.expiry,
        unit: l.unit,
        qty: l.qty,
        qtyTabs: l.qtyTabs,
        gstRateBp: l.gstRateBp,
        unitFinalPaisa: computePrice(l.priceMode, l.unitAmountPaisa, l.gstRateBp).finalPaisa,
        subtotalPaisa: l.subtotalPaisa,
        discountPaisa: l.discountPaisa,
        gstPaisa: l.gstPaisa,
        totalPaisa: l.totalPaisa,
        returnedQty: returned.get(l.id) ?? 0,
      })),
    };
  }

  list(q: { from: string; to: string; invoiceNo: number | null; page: number; pageSize: number }): {
    rows: SaleRow[];
    total: number;
  } {
    const [start, end] = dayBounds(q.from, q.to);
    const where =
      q.invoiceNo !== null
        ? eq(sales.invoiceNo, q.invoiceNo)
        : and(sql`${sales.at} >= ${start}`, sql`${sales.at} < ${end}`);
    const total = this.db
      .select({ n: sql<number>`count(*)` })
      .from(sales)
      .where(where)
      .get()!.n;
    const rows = this.db
      .select({
        id: sales.id,
        invoiceNo: sales.invoiceNo,
        at: sales.at,
        cashierName: users.fullName,
        customerName: sales.customerName,
        lineCount: sql<number>`(SELECT count(*) FROM sale_lines l WHERE l.sale_id = ${sales.id})`,
        totalPaisa: sales.totalPaisa,
        refundedPaisa: sql<number>`(SELECT coalesce(sum(r.refund_paisa), 0) FROM returns r WHERE r.sale_id = ${sales.id})`,
        paymentMethod: sales.paymentMethod,
        status: sales.status,
      })
      .from(sales)
      .innerJoin(users, eq(users.id, sales.userId))
      .where(where)
      .orderBy(desc(sales.invoiceNo))
      .limit(q.pageSize)
      .offset(q.page * q.pageSize)
      .all();
    return { rows, total };
  }

  /** Cancels an invoice with an Owner's PIN and puts the unreturned stock back (PRD §3.5). */
  async void(
    saleId: number,
    reason: string,
    approverPin: string,
    user: SessionUser,
  ): Promise<SaleDetail> {
    const approvedBy = await this.auth.approveAsOwner(approverPin, 'sale.void', user.id);
    this.db.transaction((tx) => {
      const sale = tx.select().from(sales).where(eq(sales.id, saleId)).get();
      if (!sale) throw fail.notFound('Invoice');
      if (sale.status === 'void') throw fail.conflict('This invoice is already void');
      const detail = this.detail(saleId);
      for (const line of detail.lines) {
        const returnedTabs = (line.returnedQty * line.qtyTabs) / line.qty;
        const back = line.qtyTabs - returnedTabs;
        const batchId = tx
          .select({ b: saleLines.batchId })
          .from(saleLines)
          .where(eq(saleLines.id, line.id))
          .get()!.b;
        if (back > 0) {
          moveStock(tx, {
            batchId,
            qtyChange: back,
            type: 'void',
            refType: 'sale',
            refId: saleId,
            userId: user.id,
          });
        }
      }
      tx.update(sales)
        .set({ status: 'void', voidedAt: this.now(), voidedBy: approvedBy, voidReason: reason })
        .where(eq(sales.id, saleId))
        .run();
      writeAudit(tx, {
        userId: user.id,
        action: 'sale.void',
        entity: 'sale',
        entityId: sale.invoiceNo,
        details: { reason, approvedBy, total: sale.totalPaisa },
      });
    });
    return this.detail(saleId);
  }

  // ── Held bills ──────────────────────────────────────────────────────────

  hold(label: string, cart: CartDraft, user: SessionUser): HeldBill {
    if (cart.lines.length === 0) throw fail.validation('The bill is empty');
    const row = this.db
      .insert(heldBills)
      .values({
        userId: user.id,
        label: label || `Bill of ${new Date(this.now()).toLocaleTimeString('en-PK')}`,
        cart,
      })
      .returning()
      .get();
    return { id: row.id, at: row.at, label: row.label, cashierName: user.fullName, cart };
  }

  heldList(): HeldBill[] {
    return this.db
      .select({ h: heldBills, cashierName: users.fullName })
      .from(heldBills)
      .innerJoin(users, eq(users.id, heldBills.userId))
      .orderBy(heldBills.at)
      .all()
      .map(({ h, cashierName }) => ({
        id: h.id,
        at: h.at,
        label: h.label,
        cashierName,
        cart: h.cart as CartDraft,
      }));
  }

  deleteHeld(id: number): void {
    const result = this.db.delete(heldBills).where(eq(heldBills.id, id)).run();
    if (result.changes === 0) throw fail.notFound('Held bill');
  }
}
