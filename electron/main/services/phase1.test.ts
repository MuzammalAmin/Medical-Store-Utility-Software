import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { permissionsFor } from '../../../shared/domain/permissions';
import type { SessionUser } from '../../../shared/ipc/contract';
import type { ImportOptions } from '../../../shared/ipc/schemas/import';
import { AppError } from '../errors';
import { readSpreadsheet } from './import.service';
import { createServices, type Services } from './index';
import { createTestDb, type TestDb } from './test-db';

const SAMPLES = join(import.meta.dirname, '..', '..', '..', 'samples');
const NOW = new Date(2026, 9, 18, 12, 0).getTime();

let t: TestDb;
let s: Services;
let owner: SessionUser;
let staff: SessionUser;

beforeEach(async () => {
  t = createTestDb();
  const backups = join(t.dir, 'backups');
  mkdirSync(backups);
  s = createServices(t, t.key, backups, () => NOW);
  const o = await s.users.create(
    { fullName: 'Ayyaz Ahmed', username: 'ayyaz', role: 'owner', pin: '482915' },
    null,
  );
  const st = await s.users.create(
    { fullName: 'Ali Raza', username: 'ali', role: 'staff', pin: '1357' },
    o.id,
  );
  owner = { ...o, permissions: permissionsFor('owner') };
  staff = { ...st, permissions: permissionsFor('staff') };
});
afterEach(() => t.dispose());

async function importSample(file: string, extra: Partial<ImportOptions> = {}) {
  const opened = await s.imports.open(join(SAMPLES, file));
  const options: ImportOptions = {
    jobId: opened.jobId,
    mapping: opened.suggested,
    defaultPriceMode: 'add_gst',
    defaultGstRateBp: 1800,
    duplicateAction: 'update',
    overrides: {},
    skipRows: [],
    ...extra,
  };
  return { opened, options };
}

async function expectCode(fn: () => unknown, code: string) {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

const panadolId = () =>
  s.items
    .list({ query: 'Panadol', filter: 'all', page: 0, pageSize: 10 })
    .rows.find((r) => r.name === 'Panadol 500mg Tab')!.id;

describe('import', () => {
  it('imports the clean sample file in one go', async () => {
    const { opened, options } = await importSample('sample-items.xlsx');
    expect(opened.rowCount).toBe(48);
    expect(Object.keys(opened.suggested)).toHaveLength(20);
    const preview = s.imports.preview(options);
    expect(preview.counts.error).toBe(0);
    const result = s.imports.commit(options, owner.id, 'backup.apbak');
    expect(result).toMatchObject({ added: 48, batches: 48, rejected: 0 });
    expect(s.items.list({ query: '', filter: 'all', page: 0, pageSize: 100 }).total).toBe(48);
  });

  it('flags every deliberate mistake in the errors sample', async () => {
    const { options } = await importSample('sample-items.xlsx');
    s.imports.commit(options, owner.id, 'b');
    const bad = await importSample('sample-items-with-errors.xlsx');
    expect(bad.opened.rowCount).toBe(25);
    const preview = s.imports.preview(bad.options);
    // Compare each row with the _expect column written by the sample generator.
    const { headers, rows } = await readSpreadsheet(join(SAMPLES, 'sample-items-with-errors.xlsx'));
    const expectCol = headers.indexOf('_expect');
    for (const row of preview.rows) {
      const expected = String(rows[row.rowNo - 2]![expectCol]);
      if (expected.startsWith('ERROR'))
        expect(row.status, `row ${row.rowNo}: ${expected}`).toBe('error');
      else if (expected.startsWith('WARNING'))
        expect(row.status, `row ${row.rowNo}: ${expected}`).toBe('warning');
      // "OK" rows may still warn here because the clean file was imported first (existing items).
      else expect(row.status, `row ${row.rowNo}: ${expected}`).not.toBe('error');
    }
  });

  it('lets the Owner fix a row in the preview and skip another', async () => {
    const { options } = await importSample('sample-items-with-errors.xlsx');
    const fixed = s.imports.preview({
      ...options,
      overrides: { '3': { brand_name: 'Panadol Extra' } },
      skipRows: [4],
    });
    expect(fixed.rows.find((r) => r.rowNo === 3)!.status).not.toBe('error');
    expect(fixed.rows.find((r) => r.rowNo === 4)!.status).toBe('skipped');
  });
});

describe('selling', () => {
  beforeEach(async () => {
    const { options } = await importSample('sample-items.xlsx');
    s.imports.commit(options, owner.id, 'b');
  });

  it('sells by strip, prices it, and takes the stock', () => {
    const id = panadolId();
    const sale = s.sales.checkout(
      {
        lines: [{ itemId: id, batchId: null, unit: 'strip', qty: 2, discount: null }],
        billDiscount: null,
        customerName: '',
        customerPhone: '',
        doctorName: '',
        payment: { method: 'cash', paidPaisa: 10_000 },
        heldBillId: null,
      },
      staff,
    );
    // Panadol: Rs 360 per box of 20 strips, GST-exempt → Rs 18 per strip.
    expect(sale).toMatchObject({
      invoiceNo: 1,
      totalPaisa: 3_600,
      changePaisa: 6_400,
      gstPaisa: 0,
    });
    expect(s.items.get(id, true).stockTabs).toBe(2400 - 20);
  });

  it('enforces the staff discount limit but lets the Owner go further', async () => {
    const id = panadolId();
    const input = {
      lines: [{ itemId: id, batchId: null, unit: 'box' as const, qty: 1, discount: null }],
      billDiscount: { kind: 'percent' as const, bp: 2000 },
      customerName: '',
      customerPhone: '',
      doctorName: '',
      payment: { method: 'card' as const, paidPaisa: 0 },
      heldBillId: null,
    };
    await expectCode(() => s.sales.checkout(input, staff), 'FORBIDDEN');
    expect(s.sales.checkout(input, owner).totalPaisa).toBe(28_800);
  });

  it('refuses to sell more than is in stock and refuses short cash', async () => {
    const id = panadolId();
    const base = {
      billDiscount: null,
      customerName: '',
      customerPhone: '',
      doctorName: '',
      heldBillId: null,
    };
    await expectCode(
      () =>
        s.sales.checkout(
          {
            ...base,
            lines: [{ itemId: id, batchId: null, unit: 'box', qty: 13, discount: null }],
            payment: { method: 'card', paidPaisa: 0 },
          },
          staff,
        ),
      'CONFLICT',
    );
    await expectCode(
      () =>
        s.sales.checkout(
          {
            ...base,
            lines: [{ itemId: id, batchId: null, unit: 'box', qty: 1, discount: null }],
            payment: { method: 'cash', paidPaisa: 100 },
          },
          staff,
        ),
      'VALIDATION',
    );
  });

  it('voids with an Owner PIN and returns the stock', async () => {
    const id = panadolId();
    const sale = s.sales.checkout(
      {
        lines: [{ itemId: id, batchId: null, unit: 'box', qty: 2, discount: null }],
        billDiscount: null,
        customerName: '',
        customerPhone: '',
        doctorName: '',
        payment: { method: 'card', paidPaisa: 0 },
        heldBillId: null,
      },
      staff,
    );
    await expectCode(() => s.sales.void(sale.id, 'Wrong item', '1357', staff), 'UNAUTHENTICATED');
    const voided = await s.sales.void(sale.id, 'Wrong item', '482915', staff);
    expect(voided.status).toBe('void');
    expect(s.items.get(id, true).stockTabs).toBe(2400);
    await expectCode(() => s.sales.void(sale.id, 'again', '482915', staff), 'CONFLICT');
  });

  it('takes partial returns, refunds exactly, and reports net sales', async () => {
    const id = panadolId();
    const sale = s.sales.checkout(
      {
        lines: [
          {
            itemId: id,
            batchId: null,
            unit: 'strip',
            qty: 3,
            discount: { kind: 'amount', paisa: 100 },
          },
        ],
        billDiscount: null,
        customerName: 'Bilal',
        customerPhone: '',
        doctorName: '',
        payment: { method: 'cash', paidPaisa: 6_000 },
        heldBillId: null,
      },
      staff,
    );
    const lineId = sale.lines[0]!.id;
    const r1 = await s.returns.create(
      {
        saleId: sale.id,
        lines: [{ saleLineId: lineId, qty: 1, restock: true }],
        reason: '',
        refundMethod: 'cash',
        approverPin: null,
      },
      staff,
    );
    const r2 = await s.returns.create(
      {
        saleId: sale.id,
        lines: [{ saleLineId: lineId, qty: 2, restock: false }],
        reason: 'damaged',
        refundMethod: 'cash',
        approverPin: null,
      },
      staff,
    );
    expect(r1.refundPaisa + r2.refundPaisa).toBe(sale.totalPaisa);
    await expectCode(
      () =>
        s.returns.create(
          {
            saleId: sale.id,
            lines: [{ saleLineId: lineId, qty: 1, restock: true }],
            reason: '',
            refundMethod: 'cash',
            approverPin: null,
          },
          staff,
        ),
      'VALIDATION',
    );
    // 1 strip went back on the shelf, 2 were written off.
    expect(s.items.get(id, true).stockTabs).toBe(2400 - 30 + 10);

    const today = '2026-10-18';
    const summary = s.reports.salesSummary(today, today, true);
    expect(summary).toMatchObject({
      invoices: 1,
      totalPaisa: sale.totalPaisa,
      refundsPaisa: sale.totalPaisa,
      netPaisa: 0,
    });
  });

  it('needs an Owner PIN for staff refunds above the limit', async () => {
    const id = s.items.list({ query: 'Klaricid', filter: 'all', page: 0, pageSize: 5 }).rows[0]!.id;
    const sale = s.sales.checkout(
      {
        lines: [{ itemId: id, batchId: null, unit: 'box', qty: 2, discount: null }],
        billDiscount: null,
        customerName: '',
        customerPhone: '',
        doctorName: '',
        payment: { method: 'card', paidPaisa: 0 },
        heldBillId: null,
      },
      staff,
    );
    const input = {
      saleId: sale.id,
      lines: [{ saleLineId: sale.lines[0]!.id, qty: 2, restock: true }],
      reason: '',
      refundMethod: 'card' as const,
      approverPin: null,
    };
    await expectCode(() => s.returns.create(input, staff), 'FORBIDDEN');
    const ret = await s.returns.create({ ...input, approverPin: '482915' }, staff);
    expect(ret.refundPaisa).toBe(sale.totalPaisa);
  });

  it('builds stock reports and hides cost from staff', () => {
    const value = s.reports.stock('value', true);
    expect(value.rows).toHaveLength(48 - 0);
    expect(value.columns.some((c) => c.key === 'cost')).toBe(true);
    expect(s.reports.stock('value', false).columns.some((c) => c.key === 'cost')).toBe(false);
    expect(s.items.get(panadolId(), false).batches[0]!.costBoxPaisa).toBeNull();
  });

  it('finds alternatives with the same generic and strength', () => {
    const risek = s.items
      .list({ query: 'Risek', filter: 'all', page: 0, pageSize: 5 })
      .rows.find((r) => r.strength === '20mg')!;
    expect(s.items.alternatives(risek.id)).toEqual([]);
    const glucophage = s.items.list({ query: 'Glucophage', filter: 'all', page: 0, pageSize: 5 })
      .rows[0]!;
    expect(
      s.items.alternatives(glucophage.id).every((a) => a.genericNames.includes('Metformin')),
    ).toBe(true);
  });

  it('searches by brand, generic and barcode', () => {
    expect(s.sales.search('8961100000012')[0]!.name).toBe('Panadol 500mg Tab');
    expect(s.sales.search('metformin').length).toBe(2);
    expect(s.sales.search('pana')[0]!.name.startsWith('Panadol')).toBe(true);
  });
});
