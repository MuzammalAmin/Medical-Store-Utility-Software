import { z } from 'zod';
import { MAX_GST_RATE_BP, PRICE_MODES } from '../../domain/gst';
import { SALE_UNITS } from '../../domain/units';
import { ITEM_FORMS } from '../../import/template';

/** Items, batches and stock (PRD §3.1–3.3). */
const text = (max: number) => z.string().trim().max(max);
const paisa = z.int().min(0).max(1_000_000_000);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const priceInputSchema = z.object({
  priceMode: z.enum(PRICE_MODES),
  gstRateBp: z.int().min(0).max(MAX_GST_RATE_BP),
  amountBoxPaisa: paisa.min(1, 'Enter a price above 0'),
});
export type PriceInput = z.infer<typeof priceInputSchema>;

export const itemInputSchema = z.object({
  id: z.int().optional(),
  brandName: text(80).min(1, 'Brand name is required'),
  genericNames: z.array(text(80).min(1)).max(6),
  strength: text(40),
  form: z.enum(ITEM_FORMS),
  company: text(80),
  category: text(60),
  rack: text(20),
  tabsPerStrip: z.int().min(1).max(10_000),
  stripsPerBox: z.int().min(1).max(10_000),
  price: priceInputSchema,
  stripOverridePaisa: paisa.nullable(),
  tabOverridePaisa: paisa.nullable(),
  barcodes: z.array(z.string().regex(/^\d{6,14}$/, 'Barcodes are 6 to 14 digits')).max(5),
  reorderLevelTabs: z.int().min(0).max(10_000_000),
  rxRequired: z.boolean(),
});
export type ItemInput = z.infer<typeof itemInputSchema>;

export const itemRowSchema = z.object({
  id: z.int(),
  name: z.string(),
  brandName: z.string(),
  strength: z.string(),
  form: z.enum(ITEM_FORMS),
  company: z.string(),
  category: z.string(),
  rack: z.string(),
  genericNames: z.array(z.string()),
  barcodes: z.array(z.string()),
  tabsPerStrip: z.int(),
  stripsPerBox: z.int(),
  priceMode: z.enum(PRICE_MODES),
  gstRateBp: z.int(),
  finalPriceBoxPaisa: z.int(),
  stockTabs: z.int(),
  nearestExpiry: z.string().nullable(),
  reorderLevelTabs: z.int(),
  rxRequired: z.boolean(),
  active: z.boolean(),
});
export type ItemRow = z.infer<typeof itemRowSchema>;

export const BATCH_STATUSES = ['ok', 'near', 'expired'] as const;

export const batchRowSchema = z.object({
  id: z.int(),
  itemId: z.int(),
  itemName: z.string(),
  batchNo: z.string(),
  expiry: z.string(),
  qty: z.int(),
  tabsPerStrip: z.int(),
  stripsPerBox: z.int(),
  /** Null for users who may not see cost prices. */
  costBoxPaisa: z.int().nullable(),
  priceMode: z.enum(PRICE_MODES),
  gstRateBp: z.int(),
  finalPriceBoxPaisa: z.int(),
  status: z.enum(BATCH_STATUSES),
});
export type BatchRow = z.infer<typeof batchRowSchema>;

export const itemDetailSchema = itemRowSchema.extend({
  basePriceBoxPaisa: z.int(),
  stripOverridePaisa: z.int().nullable(),
  tabOverridePaisa: z.int().nullable(),
  batches: z.array(batchRowSchema),
});
export type ItemDetail = z.infer<typeof itemDetailSchema>;

export const ITEM_FILTERS = ['all', 'low', 'out', 'inactive'] as const;
export const itemListQuerySchema = z.object({
  query: text(80).default(''),
  filter: z.enum(ITEM_FILTERS).default('all'),
  page: z.int().min(0).default(0),
  pageSize: z.int().min(10).max(200).default(50),
});

export const BATCH_FILTERS = ['in_stock', 'near', 'expired', 'all'] as const;
export const batchListQuerySchema = z.object({
  query: text(80).default(''),
  filter: z.enum(BATCH_FILTERS).default('in_stock'),
  page: z.int().min(0).default(0),
  pageSize: z.int().min(10).max(200).default(50),
});

export const pagedSchema = <T extends z.ZodType>(row: T) =>
  z.object({ rows: z.array(row), total: z.int() });

export const addBatchInputSchema = z.object({
  itemId: z.int(),
  batchNo: text(40).min(1, 'Batch number is required'),
  expiry: isoDateSchema,
  qty: z.int().min(1).max(1_000_000),
  unit: z.enum(SALE_UNITS),
  costBoxPaisa: paisa,
  /** Null = use the item's current price. */
  price: priceInputSchema.nullable(),
});
export type AddBatchInput = z.infer<typeof addBatchInputSchema>;

export const ADJUST_REASONS = ['damaged', 'lost', 'count_correction', 'expired', 'other'] as const;
export const adjustInputSchema = z.object({
  batchId: z.int(),
  /** Signed number of tablets (smallest units). */
  qtyChange: z
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((v) => v !== 0, 'Enter a quantity'),
  reason: z.enum(ADJUST_REASONS),
  note: text(200),
});
export type AdjustInput = z.infer<typeof adjustInputSchema>;
