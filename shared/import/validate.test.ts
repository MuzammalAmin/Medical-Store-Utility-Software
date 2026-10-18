import { describe, expect, it } from 'vitest';
import { suggestMapping, validateImportRow, type RawRow } from './validate';
import { ITEM_IMPORT_COLUMNS } from './template';

const ctx = {
  defaultPriceMode: 'add_gst' as const,
  defaultGstRateBp: 1800,
  today: '2026-10-18',
  expiryWarningDays: 90,
};

const good: RawRow = {
  brand_name: 'Panadol',
  generic_name: 'Paracetamol',
  strength: '500mg',
  form: 'tablet',
  company: 'Haleon',
  barcode: '8961100000012',
  tabs_per_strip: 10,
  strips_per_box: 20,
  sale_price_box: 360,
  gst_mode: 'price_only',
  gst_rate: 0,
  reorder_level: 5,
  rx_required: 'no',
  batch_no: 'PA271101',
  expiry: '11/2027',
  qty: 12,
  qty_unit: 'box',
  cost_price_box: 300,
};

const check = (overrides: RawRow) => validateImportRow({ ...good, ...overrides }, ctx);
const fields = (overrides: RawRow) =>
  check(overrides).issues.map((i) => `${i.level}:${i.field ?? ''}`);

describe('validateImportRow', () => {
  it('converts a good row into an item with opening stock', () => {
    const row = check({});
    expect(row.status).toBe('ok');
    expect(row.draft).toMatchObject({
      brandName: 'Panadol',
      genericNames: ['Paracetamol'],
      amountBoxPaisa: 36_000,
      priceMode: 'price_only',
      gstRateBp: 0,
      reorderLevelTabs: 1000,
      stock: { batchNo: 'PA271101', expiry: '2027-11-30', qtyTabs: 2400, costBoxPaisa: 30_000 },
    });
  });

  // One case for each kind of mistake in samples/sample-items-with-errors.xlsx.
  it.each<[string, RawRow, string]>([
    ['missing brand', { brand_name: '' }, 'error:brand_name'],
    ['missing price', { sale_price_box: '' }, 'error:sale_price_box'],
    ['negative price', { sale_price_box: -50 }, 'error:sale_price_box'],
    ['text price', { sale_price_box: 'abc' }, 'error:sale_price_box'],
    ['bad month', { expiry: '13/2027' }, 'error:expiry'],
    ['expired', { expiry: '05/2025' }, 'error:expiry'],
    ['expiring soon', { expiry: '12/2026' }, 'warning:expiry'],
    ['unknown GST mode', { gst_mode: 'inclusive' }, 'error:gst_mode'],
    ['GST over 100%', { gst_rate: 150 }, 'error:gst_rate'],
    ['zero tablets per strip', { tabs_per_strip: 0 }, 'error:tabs_per_strip'],
    ['fractional qty', { qty: 2.5 }, 'error:qty'],
    ['unknown unit', { qty_unit: 'bottle' }, 'error:qty_unit'],
    ['unknown form', { form: 'gel' }, 'warning:form'],
    ['bad barcode', { barcode: '12AB' }, 'error:barcode'],
    ['cost above price', { cost_price_box: 900 }, 'warning:cost_price_box'],
    ['bad rx flag', { rx_required: 'maybe' }, 'error:rx_required'],
    [
      'formula text',
      { brand_name: '=HYPERLINK("http://example.com","Click")' },
      'error:brand_name',
    ],
  ])('flags %s', (_name, overrides, expected) => {
    expect(fields(overrides)).toContain(expected);
  });

  it.each<[string, RawRow]>([
    ['blank GST columns use the wizard default', { gst_mode: '', gst_rate: '' }],
    ['item without opening stock', { batch_no: '', expiry: '', qty: '', cost_price_box: '' }],
    ['DD/MM/YYYY expiry', { expiry: '15/09/2028' }],
    ['price with Rs and comma', { sale_price_box: 'Rs 1,250.00' }],
    ['form alias', { form: 'Tab' }],
  ])('accepts %s', (_name, overrides) => {
    expect(check(overrides).status).toBe('ok');
  });

  it('uses the wizard GST default for blank columns', () => {
    expect(check({ gst_mode: '', gst_rate: '' }).draft).toMatchObject({
      priceMode: 'add_gst',
      gstRateBp: 1800,
    });
  });
});

describe('suggestMapping', () => {
  it('maps template headers exactly and common names loosely', () => {
    const keys = ITEM_IMPORT_COLUMNS.map((c) => c.key);
    expect(suggestMapping(['Medicine', 'MRP', 'Exp Date', 'Batch No'], keys)).toMatchObject({
      brand_name: 0,
      sale_price_box: 1,
      expiry: 2,
      batch_no: 3,
    });
    expect(suggestMapping(keys, keys).cost_price_box).toBe(keys.length - 1);
  });
});
