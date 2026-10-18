import ExcelJS from 'exceljs';
import { formatRupees } from '../../../shared/domain/money';
import type { ReportTable } from '../../../shared/ipc/schemas/reports';
import { escapeCell, toCsv } from '../import/workbook';

/**
 * Report exports (PRD §3.9): Excel, CSV and A4 PDF from the same table data.
 * Money cells are paisa in the table and rupees in the files.
 */
type Cell = string | number | null;

function cellText(value: Cell, kind: ReportTable['columns'][number]['kind']): string {
  if (value === null) return '';
  if (kind === 'money' && typeof value === 'number') return formatRupees(value);
  return String(value);
}

export async function tableToXlsx(table: ReportTable, subtitle: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ayyaz Pharmacy Manager';
  const sheet = workbook.addWorksheet(table.title.slice(0, 31));
  sheet.addRow([table.title]).font = { bold: true, size: 14 };
  sheet.addRow([subtitle]);
  sheet.addRow([]);
  const header = sheet.addRow(table.columns.map((c) => c.label));
  header.font = { bold: true };
  const toCell = (row: Record<string, Cell>) =>
    table.columns.map((c) => {
      const v = row[c.key] ?? null;
      return c.kind === 'money' && typeof v === 'number' ? v / 100 : escapeCell(v);
    });
  for (const row of table.rows) sheet.addRow(toCell(row));
  if (table.totals) sheet.addRow(toCell(table.totals)).font = { bold: true };
  table.columns.forEach((c, i) => {
    const column = sheet.getColumn(i + 1);
    column.width = c.kind === 'text' ? 32 : 16;
    if (c.kind === 'money') column.numFmt = '#,##0.00';
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function tableToCsv(table: ReportTable): string {
  const rows = [...table.rows, ...(table.totals ? [table.totals] : [])].map((row) =>
    Object.fromEntries(table.columns.map((c) => [c.label, cellText(row[c.key] ?? null, c.kind)])),
  );
  return toCsv(
    rows,
    table.columns.map((c) => c.label),
  );
}

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function tableToHtml(table: ReportTable, subtitle: string, shopName: string): string {
  const align = (kind: string) => (kind === 'money' || kind === 'number' ? 'right' : 'left');
  const tr = (row: Record<string, Cell>, tag: 'td' | 'th') =>
    `<tr>${table.columns
      .map(
        (c) =>
          `<${tag} style="text-align:${align(c.kind)}">${esc(cellText(row[c.key] ?? null, c.kind))}</${tag}>`,
      )
      .join('')}</tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(table.title)}</title><style>
    @page { size: A4; margin: 14mm; }
    body { font: 11px/1.4 system-ui, sans-serif; color: #000; }
    h1 { font-size: 18px; margin: 0; } p { margin: 2px 0 12px; color: #444; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 4px 6px; border-bottom: 1px solid #ddd; }
    thead th { background: #0f766e; color: #fff; }
    tfoot td { font-weight: 700; border-top: 2px solid #000; }
  </style></head><body>
    <h1>${esc(table.title)}</h1><p>${esc(shopName)} · ${esc(subtitle)}</p>
    <table><thead>${tr(Object.fromEntries(table.columns.map((c) => [c.key, c.label])), 'th')}</thead>
    <tbody>${table.rows.map((r) => tr(r, 'td')).join('')}</tbody>
    ${table.totals ? `<tfoot>${tr(table.totals, 'td')}</tfoot>` : ''}</table>
  </body></html>`;
}
