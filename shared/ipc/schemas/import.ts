import { z } from 'zod';
import { MAX_GST_RATE_BP, PRICE_MODES } from '../../domain/gst';
import { ITEM_IMPORT_COLUMNS, type ItemImportKey } from '../../import/template';

/** CSV / Excel import wizard (PRD §3.4). */
const KEYS = ITEM_IMPORT_COLUMNS.map((c) => c.key) as [ItemImportKey, ...ItemImportKey[]];
export const importKeySchema = z.enum(KEYS);

export const DUPLICATE_ACTIONS = ['skip', 'update', 'new'] as const;
export type DuplicateAction = (typeof DUPLICATE_ACTIONS)[number];

export const importOpenSchema = z.object({
  jobId: z.string(),
  fileName: z.string(),
  headers: z.array(z.string()),
  rowCount: z.int(),
  sample: z.array(z.array(z.string())),
  suggested: z.partialRecord(importKeySchema, z.int()),
});
export type ImportOpen = z.infer<typeof importOpenSchema>;

export const importOptionsSchema = z.object({
  jobId: z.string().max(64),
  mapping: z.partialRecord(importKeySchema, z.int().min(0).max(500)),
  defaultPriceMode: z.enum(PRICE_MODES),
  defaultGstRateBp: z.int().min(0).max(MAX_GST_RATE_BP),
  duplicateAction: z.enum(DUPLICATE_ACTIONS),
  /** Cell values corrected in the preview, by spreadsheet row number. */
  overrides: z.record(
    z.string().regex(/^\d+$/),
    z.partialRecord(importKeySchema, z.string().max(200)),
  ),
  skipRows: z.array(z.int()).max(100_000),
});
export type ImportOptions = z.infer<typeof importOptionsSchema>;

export const importIssueSchema = z.object({
  level: z.enum(['error', 'warning']),
  field: importKeySchema.optional(),
  message: z.string(),
});

export const importPreviewRowSchema = z.object({
  rowNo: z.int(),
  status: z.enum(['ok', 'warning', 'error', 'skipped']),
  issues: z.array(importIssueSchema),
  values: z.partialRecord(importKeySchema, z.string()),
  match: z.enum(['none', 'existing', 'in_file']),
  matchedItemName: z.string().nullable(),
});
export type ImportPreviewRow = z.infer<typeof importPreviewRowSchema>;

export const importPreviewSchema = z.object({
  rows: z.array(importPreviewRowSchema),
  counts: z.object({ ok: z.int(), warning: z.int(), error: z.int(), skipped: z.int() }),
});
export type ImportPreview = z.infer<typeof importPreviewSchema>;

export const importResultSchema = z.object({
  added: z.int(),
  updated: z.int(),
  skipped: z.int(),
  rejected: z.int(),
  batches: z.int(),
  backupFile: z.string(),
});
export type ImportResult = z.infer<typeof importResultSchema>;
