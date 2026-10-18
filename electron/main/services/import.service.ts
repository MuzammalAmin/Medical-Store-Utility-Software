import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { and, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { todayIso } from '../../../shared/domain/dates';
import { itemDisplayName, storedPrice } from '../../../shared/domain/items';
import { ITEM_IMPORT_COLUMNS, type ItemImportKey } from '../../../shared/import/template';
import {
  statusOf,
  suggestMapping,
  validateImportRow,
  type ItemDraft,
  type RawRow,
} from '../../../shared/import/validate';
import type {
  ImportOpen,
  ImportOptions,
  ImportPreview,
  ImportPreviewRow,
  ImportResult,
} from '../../../shared/ipc/schemas/import';
import type { Db } from '../db/connection';
import { batches, itemBarcodes, itemGenerics, items } from '../db/schema';
import { fail } from '../errors';
import { buildItemsWorkbook, type SheetRow } from '../import/workbook';
import { logger } from '../logger';
import { writeAudit } from './audit';
import { findOrCreate } from './items.service';
import { moveStock } from './stock';

/** CSV / Excel import of items and opening stock (PRD §3.4). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 50_000;
const KEYS = ITEM_IMPORT_COLUMNS.map((c) => c.key);

type Cell = string | number | Date | null;

interface ImportJob {
  fileName: string;
  headers: string[];
  rows: Cell[][];
}

interface EvaluatedRow {
  rowNo: number;
  raw: RawRow;
  values: Partial<Record<ItemImportKey, string>>;
  preview: ImportPreviewRow;
  draft: ItemDraft | null;
  existingItemId: number | null;
}

/**
 * Reads an exceljs cell value as plain data. Formulas are never evaluated:
 * only the value Excel last saved for them is used (PRD §3.4).
 */
function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (value instanceof Date) return value;
  if ('richText' in value) return value.richText.map((t) => t.text).join('');
  if ('text' in value && typeof value.text === 'string') return value.text;
  if ('result' in value) {
    const result = value.result;
    return result instanceof Date || typeof result === 'string' || typeof result === 'number'
      ? result
      : null;
  }
  return null;
}

function display(cell: unknown): string {
  if (cell instanceof Date) {
    return `${String(cell.getUTCDate()).padStart(2, '0')}/${String(cell.getUTCMonth() + 1).padStart(2, '0')}/${cell.getUTCFullYear()}`;
  }
  return typeof cell === 'string' || typeof cell === 'number' ? String(cell) : '';
}

export async function readSpreadsheet(
  file: string,
): Promise<{ headers: string[]; rows: Cell[][] }> {
  const ext = extname(file).toLowerCase();
  if (ext !== '.csv' && ext !== '.xlsx') throw fail.validation('Choose a .csv or .xlsx file');
  if (statSync(file).size > MAX_FILE_BYTES) throw fail.validation('The file is larger than 10 MB');

  let table: Cell[][];
  if (ext === '.csv') {
    const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
    table = parsed.data;
  } else {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.readFile(file);
    } catch (error) {
      logger.warn('Could not read workbook', error);
      throw fail.validation('This Excel file could not be read. Save it again as .xlsx and retry');
    }
    const sheet = workbook.getWorksheet('Items') ?? workbook.worksheets[0];
    if (!sheet) throw fail.validation('The workbook has no sheets');
    table = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: Cell[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) cells.push(cellValue(row.getCell(c).value));
      table.push(cells);
    });
  }
  const [headerRow, ...rows] = table;
  if (!headerRow) throw fail.validation('The file is empty');
  const nonEmpty = rows.filter((r) => r.some((c) => display(c).trim() !== ''));
  if (nonEmpty.length > MAX_ROWS) throw fail.validation(`The file has more than ${MAX_ROWS} rows`);
  return { headers: headerRow.map((h) => display(h).trim()), rows: nonEmpty };
}

export class ImportService {
  private readonly jobs = new Map<string, ImportJob>();

  constructor(
    private readonly db: Db,
    private readonly expiryWarningDays: () => number,
    private readonly now: () => number = Date.now,
  ) {}

  async open(file: string): Promise<ImportOpen> {
    const { headers, rows } = await readSpreadsheet(file);
    const jobId = randomUUID();
    // Keep only the latest few files in memory.
    if (this.jobs.size >= 3) this.jobs.delete(this.jobs.keys().next().value!);
    this.jobs.set(jobId, { fileName: basename(file), headers, rows });
    return {
      jobId,
      fileName: basename(file),
      headers,
      rowCount: rows.length,
      sample: rows.slice(0, 5).map((r) => r.map(display)),
      suggested: suggestMapping(headers, KEYS),
    };
  }

  preview(options: ImportOptions): ImportPreview {
    const rows = this.evaluate(options).map((r) => r.preview);
    const counts = { ok: 0, warning: 0, error: 0, skipped: 0 };
    for (const r of rows) counts[r.status] += 1;
    return { rows, counts };
  }

  /** Rejected rows (errors) as a spreadsheet the Owner can fix and import again. */
  errorWorkbook(options: ImportOptions): ExcelJS.Workbook {
    const rejected = this.evaluate(options).filter((r) => r.preview.status === 'error');
    const rows: SheetRow[] = rejected.map((r) => ({
      ...r.values,
      row: r.rowNo,
      problems: r.preview.issues
        .filter((i) => i.level === 'error')
        .map((i) => `${i.field ?? ''}: ${i.message}`)
        .join('; '),
    }));
    return buildItemsWorkbook(rows, [
      { key: 'row', header: 'original_row', width: 12 },
      { key: 'problems', header: 'problems', width: 70 },
    ]);
  }

  /** Saves every valid row in one transaction: all or nothing. The caller makes a backup first. */
  commit(options: ImportOptions, userId: number, backupFile: string): ImportResult {
    const evaluated = this.evaluate(options);
    const job = this.job(options.jobId);
    const result: ImportResult = {
      added: 0,
      updated: 0,
      skipped: 0,
      rejected: 0,
      batches: 0,
      backupFile,
    };

    this.db.transaction((tx) => {
      // Items created earlier in this file, so later duplicate rows add to them.
      const createdByBarcode = new Map<string, number>();
      const createdByIdentity = new Map<string, number>();

      for (const row of evaluated) {
        if (row.preview.status === 'skipped') {
          result.skipped += 1;
          continue;
        }
        if (row.preview.status === 'error' || !row.draft) {
          result.rejected += 1;
          continue;
        }
        const draft = row.draft;
        const identity = identityKey(draft);
        let itemId =
          row.existingItemId ??
          (draft.barcode ? createdByBarcode.get(draft.barcode) : undefined) ??
          createdByIdentity.get(identity) ??
          null;

        if (row.existingItemId !== null && options.duplicateAction === 'skip') {
          result.skipped += 1;
          continue;
        }
        if (row.existingItemId !== null && options.duplicateAction === 'new') itemId = null;

        if (itemId === null) {
          itemId = insertItem(tx, draft, createdByBarcode);
          createdByIdentity.set(identity, itemId);
          result.added += 1;
        } else if (row.existingItemId !== null) {
          updateItem(tx, itemId, draft);
          result.updated += 1;
        }

        if (draft.stock && draft.stock.qtyTabs > 0) {
          addStock(tx, itemId, draft, userId);
          result.batches += 1;
        }
      }
      writeAudit(tx, {
        userId,
        action: 'import.commit',
        entity: 'import',
        entityId: job.fileName,
        details: { ...result, duplicateAction: options.duplicateAction },
      });
    });
    this.jobs.delete(options.jobId);
    return result;
  }

  private job(jobId: string): ImportJob {
    const job = this.jobs.get(jobId);
    if (!job) throw fail.notFound('The opened file (please choose it again)');
    return job;
  }

  private evaluate(options: ImportOptions): EvaluatedRow[] {
    const job = this.job(options.jobId);
    const ctx = {
      defaultPriceMode: options.defaultPriceMode,
      defaultGstRateBp: options.defaultGstRateBp,
      today: todayIso(this.now()),
      expiryWarningDays: this.expiryWarningDays(),
    };
    if (options.mapping.brand_name === undefined || options.mapping.sale_price_box === undefined) {
      throw fail.validation('Choose the columns for brand name and sale price');
    }
    const skip = new Set(options.skipRows);
    const seenBarcodes = new Map<string, number>();
    const seenIdentities = new Map<string, number>();
    const existing = this.existingIndex();

    return job.rows.map((cells, index) => {
      const rowNo = index + 2; // spreadsheet row number (row 1 is the header)
      const raw: RawRow = {};
      for (const key of KEYS) {
        const col = options.mapping[key];
        if (col !== undefined) raw[key] = cells[col] ?? '';
      }
      Object.assign(raw, options.overrides[String(rowNo)] ?? {});
      const values = Object.fromEntries(KEYS.map((k) => [k, display(raw[k])])) as Partial<
        Record<ItemImportKey, string>
      >;

      if (skip.has(rowNo)) {
        return {
          rowNo,
          raw,
          values,
          draft: null,
          existingItemId: null,
          preview: {
            rowNo,
            status: 'skipped',
            issues: [],
            values,
            match: 'none',
            matchedItemName: null,
          },
        };
      }

      const validated = validateImportRow(raw, ctx);
      const issues = [...validated.issues];
      let match: ImportPreviewRow['match'] = 'none';
      let matchedItemName: string | null = null;
      let existingItemId: number | null = null;
      const draft = validated.draft;
      if (draft) {
        const identity = identityKey(draft);
        const found =
          (draft.barcode ? existing.byBarcode.get(draft.barcode) : undefined) ??
          existing.byIdentity.get(identity);
        if (found) {
          existingItemId = found.id;
          match = 'existing';
          matchedItemName = found.name;
          const action = {
            skip: 'will be skipped',
            update: 'will be updated',
            new: 'will be added as a new item',
          }[options.duplicateAction];
          issues.push({
            level: 'warning',
            message: `Matches existing item "${found.name}" and ${action}`,
          });
        } else {
          const earlier =
            (draft.barcode ? seenBarcodes.get(draft.barcode) : undefined) ??
            seenIdentities.get(identity);
          if (earlier !== undefined) {
            match = 'in_file';
            issues.push({
              level: 'warning',
              message: `Same item as row ${earlier}; its stock will be added to it`,
            });
          }
        }
        if (draft.barcode && !seenBarcodes.has(draft.barcode))
          seenBarcodes.set(draft.barcode, rowNo);
        if (!seenIdentities.has(identity)) seenIdentities.set(identity, rowNo);
      }
      return {
        rowNo,
        raw,
        values,
        draft,
        existingItemId,
        preview: { rowNo, status: statusOf(issues), issues, values, match, matchedItemName },
      };
    });
  }

  private existingIndex() {
    const rows = this.db
      .select({
        id: items.id,
        brandName: items.brandName,
        strength: items.strength,
        form: items.form,
      })
      .from(items)
      .all();
    const byIdentity = new Map(
      rows.map((r) => [identityKey(r), { id: r.id, name: itemDisplayName(r) }] as const),
    );
    const byId = new Map(rows.map((r) => [r.id, itemDisplayName(r)]));
    const byBarcode = new Map(
      this.db
        .select()
        .from(itemBarcodes)
        .all()
        .map((b) => [b.barcode, { id: b.itemId, name: byId.get(b.itemId) ?? '' }] as const),
    );
    return { byIdentity, byBarcode };
  }
}

function identityKey(i: { brandName: string; strength: string; form: string }): string {
  return `${i.brandName.toLowerCase()}|${i.strength.toLowerCase()}|${i.form}`;
}

function itemValues(tx: Db, draft: ItemDraft) {
  return {
    brandName: draft.brandName,
    strength: draft.strength,
    form: draft.form,
    companyId: draft.company ? findOrCreate(tx, 'company', draft.company) : null,
    category: draft.category,
    rack: draft.rack,
    tabsPerStrip: draft.tabsPerStrip,
    stripsPerBox: draft.stripsPerBox,
    ...storedPrice(draft.priceMode, draft.gstRateBp, draft.amountBoxPaisa),
    reorderLevelTabs: draft.reorderLevelTabs,
    rxRequired: draft.rxRequired,
  };
}

function setGenerics(tx: Db, itemId: number, names: string[]): void {
  if (names.length === 0) return;
  tx.delete(itemGenerics).where(eq(itemGenerics.itemId, itemId)).run();
  for (const name of new Set(names)) {
    tx.insert(itemGenerics)
      .values({ itemId, genericId: findOrCreate(tx, 'generic', name) })
      .onConflictDoNothing()
      .run();
  }
}

function addBarcode(tx: Db, itemId: number, barcode: string | null): void {
  if (!barcode) return;
  tx.insert(itemBarcodes).values({ barcode, itemId }).onConflictDoNothing().run();
}

function insertItem(tx: Db, draft: ItemDraft, createdByBarcode: Map<string, number>): number {
  const id = tx.insert(items).values(itemValues(tx, draft)).returning({ id: items.id }).get().id;
  setGenerics(tx, id, draft.genericNames);
  addBarcode(tx, id, draft.barcode);
  if (draft.barcode) createdByBarcode.set(draft.barcode, id);
  return id;
}

function updateItem(tx: Db, itemId: number, draft: ItemDraft): void {
  tx.update(items)
    .set({ ...itemValues(tx, draft), updatedAt: Date.now() })
    .where(eq(items.id, itemId))
    .run();
  setGenerics(tx, itemId, draft.genericNames);
  addBarcode(tx, itemId, draft.barcode);
}

function addStock(tx: Db, itemId: number, draft: ItemDraft, userId: number): void {
  const stock = draft.stock!;
  const price = storedPrice(draft.priceMode, draft.gstRateBp, draft.amountBoxPaisa);
  const existing = tx
    .select({ id: batches.id })
    .from(batches)
    .where(
      and(
        eq(batches.itemId, itemId),
        eq(batches.batchNo, stock.batchNo),
        eq(batches.expiry, stock.expiry),
      ),
    )
    .get();
  const batchId =
    existing?.id ??
    tx
      .insert(batches)
      .values({
        itemId,
        batchNo: stock.batchNo,
        expiry: stock.expiry,
        costPriceBoxPaisa: stock.costBoxPaisa,
        ...price,
      })
      .returning({ id: batches.id })
      .get().id;
  moveStock(tx, { batchId, qtyChange: stock.qtyTabs, type: 'import', refType: 'import', userId });
}
