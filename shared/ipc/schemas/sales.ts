import { z } from 'zod';
import { MAX_GST_RATE_BP, PRICE_MODES } from '../../domain/gst';
import { SALE_UNITS } from '../../domain/units';

/** Point of sale, invoices and returns (PRD §3.5–3.6). */
const text = (max: number) => z.string().trim().max(max);
const paisa = z.int().min(0).max(1_000_000_000);

export const PAYMENT_METHODS = ['cash', 'card', 'jazzcash', 'easypaisa', 'bank'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  bank: 'Bank transfer',
};

export const discountSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('percent'), bp: z.int().min(0).max(10_000) }),
    z.object({ kind: z.literal('amount'), paisa }),
  ])
  .nullable();

const unitPrices = z.object({ box: z.int(), strip: z.int(), tab: z.int() });

export const posBatchSchema = z.object({
  id: z.int(),
  batchNo: z.string(),
  expiry: z.string(),
  qty: z.int(),
  priceMode: z.enum(PRICE_MODES),
  gstRateBp: z.int().min(0).max(MAX_GST_RATE_BP),
  /** Price of one unit in the batch's price mode (used for pricing). */
  unitAmounts: unitPrices,
  /** GST-inclusive price of one unit (shown to the cashier). */
  unitFinal: unitPrices,
  nearExpiry: z.boolean(),
});
export type PosBatch = z.infer<typeof posBatchSchema>;

export const posItemSchema = z.object({
  id: z.int(),
  name: z.string(),
  genericNames: z.array(z.string()),
  rack: z.string(),
  rxRequired: z.boolean(),
  tabsPerStrip: z.int(),
  stripsPerBox: z.int(),
  units: z.array(z.enum(SALE_UNITS)),
  stockTabs: z.int(),
  /** Sellable batches only (not expired, in stock), first-expiry first. */
  batches: z.array(posBatchSchema),
});
export type PosItem = z.infer<typeof posItemSchema>;

export const cartLineSchema = z.object({
  itemId: z.int(),
  /** Null = first expiry, first out across batches. */
  batchId: z.int().nullable(),
  unit: z.enum(SALE_UNITS),
  qty: z.int().min(1).max(100_000),
  discount: discountSchema,
});
export type CartLine = z.infer<typeof cartLineSchema>;

export const cartDraftSchema = z.object({
  lines: z.array(cartLineSchema).max(200),
  billDiscount: discountSchema,
  customerName: text(80),
  customerPhone: text(30),
  doctorName: text(80),
});
export type CartDraft = z.infer<typeof cartDraftSchema>;

export const checkoutInputSchema = cartDraftSchema.extend({
  lines: z.array(cartLineSchema).min(1, 'The bill is empty').max(200),
  payment: z.object({ method: z.enum(PAYMENT_METHODS), paidPaisa: paisa }),
  heldBillId: z.int().nullable(),
});
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

export const saleLineSchema = z.object({
  id: z.int(),
  itemId: z.int(),
  itemName: z.string(),
  batchNo: z.string(),
  expiry: z.string(),
  unit: z.enum(SALE_UNITS),
  qty: z.int(),
  qtyTabs: z.int(),
  gstRateBp: z.int(),
  unitFinalPaisa: z.int(),
  subtotalPaisa: z.int(),
  discountPaisa: z.int(),
  gstPaisa: z.int(),
  totalPaisa: z.int(),
  returnedQty: z.int(),
});
export type SaleLine = z.infer<typeof saleLineSchema>;

export const saleDetailSchema = z.object({
  id: z.int(),
  invoiceNo: z.int(),
  at: z.int(),
  cashierName: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  doctorName: z.string(),
  subtotalPaisa: z.int(),
  discountPaisa: z.int(),
  gstPaisa: z.int(),
  totalPaisa: z.int(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paidPaisa: z.int(),
  changePaisa: z.int(),
  status: z.enum(['completed', 'void']),
  voidedAt: z.int().nullable(),
  voidReason: z.string().nullable(),
  refundedPaisa: z.int(),
  lines: z.array(saleLineSchema),
});
export type SaleDetail = z.infer<typeof saleDetailSchema>;

export const saleRowSchema = z.object({
  id: z.int(),
  invoiceNo: z.int(),
  at: z.int(),
  cashierName: z.string(),
  customerName: z.string(),
  lineCount: z.int(),
  totalPaisa: z.int(),
  refundedPaisa: z.int(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  status: z.enum(['completed', 'void']),
});
export type SaleRow = z.infer<typeof saleRowSchema>;

export const saleListQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invoiceNo: z.int().nullable().default(null),
  page: z.int().min(0).default(0),
  pageSize: z.int().min(10).max(200).default(50),
});

export const heldBillSchema = z.object({
  id: z.int(),
  at: z.int(),
  label: z.string(),
  cashierName: z.string(),
  cart: cartDraftSchema,
});
export type HeldBill = z.infer<typeof heldBillSchema>;

export const returnLookupSchema = z.object({
  sale: saleDetailSchema,
  daysSinceSale: z.int(),
  withinWindow: z.boolean(),
  returnWindowDays: z.int(),
  refundApprovalPaisa: z.int(),
});
export type ReturnLookup = z.infer<typeof returnLookupSchema>;

export const createReturnInputSchema = z.object({
  saleId: z.int(),
  lines: z
    .array(z.object({ saleLineId: z.int(), qty: z.int().min(1), restock: z.boolean() }))
    .min(1, 'Choose at least one item to return'),
  reason: text(200),
  refundMethod: z.enum(PAYMENT_METHODS),
  /** Needed when a staff member's return is outside the window or above the limit. */
  approverPin: z
    .string()
    .regex(/^\d{4,8}$/)
    .nullable(),
});
export type CreateReturnInput = z.infer<typeof createReturnInputSchema>;

export const returnDetailSchema = z.object({
  id: z.int(),
  returnNo: z.int(),
  at: z.int(),
  invoiceNo: z.int(),
  cashierName: z.string(),
  reason: z.string(),
  refundPaisa: z.int(),
  gstPaisa: z.int(),
  refundMethod: z.enum(PAYMENT_METHODS),
  lines: z.array(
    z.object({
      itemName: z.string(),
      batchNo: z.string(),
      unit: z.enum(SALE_UNITS),
      qty: z.int(),
      refundPaisa: z.int(),
      restocked: z.boolean(),
    }),
  ),
});
export type ReturnDetail = z.infer<typeof returnDetailSchema>;

export const RECEIPT_KINDS = ['sale', 'return', 'test'] as const;
export const receiptRefSchema = z.object({
  kind: z.enum(RECEIPT_KINDS),
  id: z.int(),
  /** Reprints from the invoice history are marked COPY. */
  copy: z.boolean().default(false),
});
