import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { ITEM_IMPORT_COLUMNS } from '../../../shared/import/template';

/**
 * Builds item spreadsheets in the import-template layout. Used for the
 * template download, the rejected-rows file and the sample-data script.
 * Pure Node (no Electron), so the script can use it too.
 */
export interface ExtraColumn {
  key: string;
  header: string;
  width: number;
}

export type SheetRow = Partial<Record<string, string | number>>;

export function buildItemsWorkbook(rows: SheetRow[], extra: ExtraColumn[] = []): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ayyaz Pharmacy Manager';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Items', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    ...ITEM_IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width })),
    ...extra,
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  ITEM_IMPORT_COLUMNS.forEach((c, i) => {
    sheet.getCell(1, i + 1).note = `${c.required ? 'Required. ' : ''}${c.description}`;
  });
  // Keep barcodes, batches and expiries as text so Excel does not turn them into numbers or dates.
  for (const key of ['barcode', 'expiry', 'batch_no'] as const) sheet.getColumn(key).numFmt = '@';
  sheet.addRows(rows.map(escapeFormulas));

  const help = workbook.addWorksheet('Instructions');
  help.columns = [
    { header: 'Column', key: 'header', width: 18 },
    { header: 'Required', key: 'required', width: 10 },
    { header: 'Description', key: 'description', width: 70 },
    { header: 'Example', key: 'example', width: 18 },
  ];
  help.getRow(1).font = { bold: true };
  help.addRows(ITEM_IMPORT_COLUMNS.map((c) => ({ ...c, required: c.required ? 'yes' : '' })));
  return workbook;
}

export function templateExampleRow(): SheetRow {
  return Object.fromEntries(ITEM_IMPORT_COLUMNS.map((c) => [c.key, c.example]));
}

/** A cell that starts like a formula is prefixed with ' so Excel shows it as text (CSV/formula injection). */
export function escapeCell(value: unknown): unknown {
  return typeof value === 'string' && /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value)
    ? `'${value}`
    : value;
}

function escapeFormulas(row: SheetRow): SheetRow {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, escapeCell(v) as string | number]),
  );
}

export function toCsv(rows: SheetRow[], columns: string[]): string {
  return `\uFEFF${Papa.unparse(rows.map(escapeFormulas), { columns })}\r\n`;
}
