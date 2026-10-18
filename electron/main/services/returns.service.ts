import { eq, sql } from 'drizzle-orm';
import { proportionalShare } from '../../../shared/domain/cart';
import { todayIso } from '../../../shared/domain/dates';
import type { SessionUser } from '../../../shared/ipc/contract';
import type {
  CreateReturnInput,
  ReturnDetail,
  ReturnLookup,
} from '../../../shared/ipc/schemas/sales';
import type { PosSettings } from '../../../shared/settings';
import type { Db } from '../db/connection';
import { returnLines, returns, saleLines, users } from '../db/schema';
import { fail } from '../errors';
import { writeAudit } from './audit';
import type { AuthService } from './auth.service';
import type { SalesService } from './sales.service';
import { moveStock } from './stock';

const DAY_MS = 86_400_000;

export class ReturnsService {
  constructor(
    private readonly db: Db,
    private readonly sales: SalesService,
    private readonly auth: AuthService,
    private readonly settings: () => PosSettings,
    private readonly now: () => number = Date.now,
  ) {}

  lookup(invoiceNo: number): ReturnLookup {
    const sale = this.sales.getByInvoice(invoiceNo);
    const { returnWindowDays, refundApprovalPaisa } = this.settings();
    const daysSinceSale = Math.floor((this.now() - sale.at) / DAY_MS);
    return {
      sale,
      daysSinceSale,
      withinWindow: daysSinceSale <= returnWindowDays,
      returnWindowDays,
      refundApprovalPaisa,
    };
  }

  /**
   * Takes items back against the original invoice (PRD §3.6). Refunds use the
   * original line prices; restocked items go back into their batch, expired or
   * damaged ones are written off. Staff need an Owner PIN outside the return
   * window or above the refund limit.
   */
  async create(input: CreateReturnInput, user: SessionUser): Promise<ReturnDetail> {
    const lookup = this.lookup(this.invoiceNoOf(input.saleId));
    const { sale } = lookup;
    if (sale.status === 'void')
      throw fail.conflict('This invoice was voided, so nothing can be returned');

    const today = todayIso(this.now());
    const seen = new Set<number>();
    const planned = input.lines.map((req) => {
      if (seen.has(req.saleLineId)) throw fail.validation('The same item was listed twice');
      seen.add(req.saleLineId);
      const line = sale.lines.find((l) => l.id === req.saleLineId);
      if (!line) throw fail.validation('That item is not on this invoice');
      if (req.qty > line.qty - line.returnedQty) {
        throw fail.validation(
          `Only ${line.qty - line.returnedQty} ${line.unit} of ${line.itemName} can be returned`,
        );
      }
      const record = this.db.select().from(saleLines).where(eq(saleLines.id, line.id)).get()!;
      const before = this.db.get<{
        refund: number | null;
        gst: number | null;
        cost: number | null;
      }>(
        sql`SELECT sum(refund_paisa) AS refund, sum(gst_paisa) AS gst, sum(cost_paisa) AS cost
            FROM return_lines WHERE sale_line_id = ${line.id}`,
      );
      const share = (value: number, already: number | null | undefined) =>
        proportionalShare(value, already ?? 0, line.qty, line.returnedQty, req.qty);
      return {
        line,
        record,
        qty: req.qty,
        qtyTabs: (req.qty * line.qtyTabs) / line.qty,
        // Expired stock never goes back on the shelf.
        restock: req.restock && record.expiry >= today,
        refund: share(line.totalPaisa, before.refund),
        gst: share(line.gstPaisa, before.gst),
        cost: share(record.costPaisa, before.cost),
      };
    });

    const refundPaisa = planned.reduce((s, p) => s + p.refund, 0);
    let approvedBy: number | null = null;
    const needsApproval =
      user.role !== 'owner' && (!lookup.withinWindow || refundPaisa > lookup.refundApprovalPaisa);
    if (needsApproval) {
      if (!input.approverPin) {
        throw fail.forbidden(
          lookup.withinWindow
            ? 'Refunds above the limit need the Owner PIN'
            : `This sale is older than ${lookup.returnWindowDays} days. The Owner PIN is needed`,
        );
      }
      approvedBy = await this.auth.approveAsOwner(input.approverPin, 'return.create', user.id);
    }

    const returnId = this.db.transaction((tx) => {
      const returnNo =
        (tx.get<{ n: number | null }>(sql`SELECT max(return_no) AS n FROM returns`).n ?? 0) + 1;
      const row = tx
        .insert(returns)
        .values({
          returnNo,
          saleId: sale.id,
          userId: user.id,
          approvedBy,
          reason: input.reason,
          refundPaisa,
          gstPaisa: planned.reduce((s, p) => s + p.gst, 0),
          costPaisa: planned.reduce((s, p) => s + (p.restock ? p.cost : 0), 0),
          refundMethod: input.refundMethod,
        })
        .returning({ id: returns.id })
        .get();
      for (const p of planned) {
        tx.insert(returnLines)
          .values({
            returnId: row.id,
            saleLineId: p.line.id,
            qty: p.qty,
            qtyTabs: p.qtyTabs,
            restocked: p.restock,
            refundPaisa: p.refund,
            gstPaisa: p.gst,
            costPaisa: p.cost,
          })
          .run();
        if (p.restock) {
          moveStock(tx, {
            batchId: p.record.batchId,
            qtyChange: p.qtyTabs,
            type: 'return',
            refType: 'return',
            refId: row.id,
            userId: user.id,
          });
        }
      }
      writeAudit(tx, {
        userId: user.id,
        action: 'return.create',
        entity: 'return',
        entityId: returnNo,
        details: { invoiceNo: sale.invoiceNo, refundPaisa, approvedBy },
      });
      return row.id;
    });
    return this.detail(returnId);
  }

  detail(id: number): ReturnDetail {
    const r = this.db
      .select({ r: returns, cashierName: users.fullName })
      .from(returns)
      .innerJoin(users, eq(users.id, returns.userId))
      .where(eq(returns.id, id))
      .get();
    if (!r) throw fail.notFound('Return');
    const lines = this.db
      .select({ rl: returnLines, sl: saleLines })
      .from(returnLines)
      .innerJoin(saleLines, eq(saleLines.id, returnLines.saleLineId))
      .where(eq(returnLines.returnId, id))
      .all();
    return {
      id: r.r.id,
      returnNo: r.r.returnNo,
      at: r.r.at,
      invoiceNo: this.sales.detail(r.r.saleId).invoiceNo,
      cashierName: r.cashierName,
      reason: r.r.reason,
      refundPaisa: r.r.refundPaisa,
      gstPaisa: r.r.gstPaisa,
      refundMethod: r.r.refundMethod,
      lines: lines.map(({ rl, sl }) => ({
        itemName: sl.itemName,
        batchNo: sl.batchNo,
        unit: sl.unit,
        qty: rl.qty,
        refundPaisa: rl.refundPaisa,
        restocked: rl.restocked,
      })),
    };
  }

  private invoiceNoOf(saleId: number): number {
    return this.sales.detail(saleId).invoiceNo;
  }
}
