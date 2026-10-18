/**
 * Column definitions for the item / opening-stock import template (PRD §3.4).
 * Shared by the template download, the importer and the sample-data generator
 * so the three can never disagree about column names.
 */
export interface TemplateColumn {
  key: string;
  header: string;
  required: boolean;
  description: string;
  example: string | number;
  width: number;
}

export const ITEM_IMPORT_COLUMNS = [
  {
    key: 'brand_name',
    header: 'brand_name',
    required: true,
    description: 'Brand / trade name',
    example: 'Panadol',
    width: 22,
  },
  {
    key: 'generic_name',
    header: 'generic_name',
    required: false,
    description: 'Generic / salt; separate several with +',
    example: 'Paracetamol',
    width: 26,
  },
  {
    key: 'strength',
    header: 'strength',
    required: false,
    description: 'e.g. 500mg, 120mg/5ml',
    example: '500mg',
    width: 14,
  },
  {
    key: 'form',
    header: 'form',
    required: false,
    description: 'tablet, capsule, syrup, injection, cream, drops, inhaler, sachet, other',
    example: 'tablet',
    width: 12,
  },
  {
    key: 'company',
    header: 'company',
    required: false,
    description: 'Manufacturer',
    example: 'Haleon',
    width: 18,
  },
  {
    key: 'category',
    header: 'category',
    required: false,
    description: 'Free text, e.g. Analgesic',
    example: 'Analgesic',
    width: 16,
  },
  {
    key: 'barcode',
    header: 'barcode',
    required: false,
    description: 'Box barcode (digits only)',
    example: '8961100000017',
    width: 16,
  },
  {
    key: 'rack',
    header: 'rack',
    required: false,
    description: 'Shelf location',
    example: 'A1',
    width: 8,
  },
  {
    key: 'tabs_per_strip',
    header: 'tabs_per_strip',
    required: false,
    description: 'Default 1',
    example: 10,
    width: 14,
  },
  {
    key: 'strips_per_box',
    header: 'strips_per_box',
    required: false,
    description: 'Default 1',
    example: 20,
    width: 14,
  },
  {
    key: 'sale_price_box',
    header: 'sale_price_box',
    required: true,
    description: 'Price per box in rupees (base price if add_gst, final price if price_only)',
    example: 360,
    width: 15,
  },
  {
    key: 'gst_mode',
    header: 'gst_mode',
    required: false,
    description: 'add_gst = add GST on top; price_only = GST already included',
    example: 'price_only',
    width: 12,
  },
  {
    key: 'gst_rate',
    header: 'gst_rate',
    required: false,
    description: 'Percent, e.g. 18 (0 = exempt)',
    example: 18,
    width: 10,
  },
  {
    key: 'reorder_level',
    header: 'reorder_level',
    required: false,
    description: 'Low-stock alert level, in boxes',
    example: 5,
    width: 13,
  },
  {
    key: 'rx_required',
    header: 'rx_required',
    required: false,
    description: 'yes / no',
    example: 'no',
    width: 11,
  },
  {
    key: 'batch_no',
    header: 'batch_no',
    required: false,
    description: 'Opening stock: batch number',
    example: 'PN2611',
    width: 12,
  },
  {
    key: 'expiry',
    header: 'expiry',
    required: false,
    description: 'Opening stock: MM/YYYY or DD/MM/YYYY',
    example: '11/2027',
    width: 11,
  },
  {
    key: 'qty',
    header: 'qty',
    required: false,
    description: 'Opening stock quantity',
    example: 12,
    width: 8,
  },
  {
    key: 'qty_unit',
    header: 'qty_unit',
    required: false,
    description: 'box, strip or tab (default box)',
    example: 'box',
    width: 10,
  },
  {
    key: 'cost_price_box',
    header: 'cost_price_box',
    required: false,
    description: 'Purchase cost per box in rupees',
    example: 300,
    width: 15,
  },
] as const satisfies readonly TemplateColumn[];

export type ItemImportKey = (typeof ITEM_IMPORT_COLUMNS)[number]['key'];
export type ItemImportRow = Partial<Record<ItemImportKey, string | number>>;

export const ITEM_FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'suspension',
  'injection',
  'cream',
  'ointment',
  'drops',
  'inhaler',
  'sachet',
  'other',
] as const;
export type ItemForm = (typeof ITEM_FORMS)[number];
