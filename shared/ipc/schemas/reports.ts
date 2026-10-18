import { z } from 'zod';
import { PAYMENT_METHODS } from './sales';

/** Reports and exports (PRD §3.9). */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const dateRangeSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((r) => r.from <= r.to, 'The start date must be before the end date');

export const salesSummarySchema = z.object({
  invoices: z.int(),
  voided: z.int(),
  subtotalPaisa: z.int(),
  discountPaisa: z.int(),
  gstPaisa: z.int(),
  totalPaisa: z.int(),
  refundsPaisa: z.int(),
  refundGstPaisa: z.int(),
  netPaisa: z.int(),
  netGstPaisa: z.int(),
  /** Null for users who may not see cost prices. */
  costPaisa: z.int().nullable(),
  profitPaisa: z.int().nullable(),
  byMethod: z.array(z.object({ method: z.enum(PAYMENT_METHODS), totalPaisa: z.int() })),
  byDay: z.array(
    z.object({ date: z.string(), invoices: z.int(), totalPaisa: z.int(), refundsPaisa: z.int() }),
  ),
});
export type SalesSummary = z.infer<typeof salesSummarySchema>;

export const STOCK_REPORTS = ['value', 'near_expiry', 'expired', 'low'] as const;
export type StockReportKind = (typeof STOCK_REPORTS)[number];

export const COLUMN_KINDS = ['text', 'money', 'number', 'date'] as const;
export const tableColumnSchema = z.object({
  key: z.string().max(40),
  label: z.string().max(60),
  kind: z.enum(COLUMN_KINDS),
});
export type TableColumn = z.infer<typeof tableColumnSchema>;

const cell = z.union([z.string().max(300), z.number(), z.null()]);

export const reportTableSchema = z.object({
  title: z.string().max(100),
  columns: z.array(tableColumnSchema).max(20),
  rows: z.array(z.record(z.string(), cell)).max(100_000),
  totals: z.record(z.string(), cell).nullable(),
});
export type ReportTable = z.infer<typeof reportTableSchema>;

export const EXPORT_FORMATS = ['xlsx', 'csv', 'pdf'] as const;
export const exportInputSchema = z.object({
  table: reportTableSchema,
  subtitle: z.string().max(200),
  format: z.enum(EXPORT_FORMATS),
});
