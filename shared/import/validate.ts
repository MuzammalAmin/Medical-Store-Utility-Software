import { addDays, parseExpiry, type IsoDate } from '../domain/dates';
import {
  computePrice,
  parsePercent,
  PRICE_MODES,
  type BasisPoints,
  type PriceMode,
} from '../domain/gst';
import { MoneyError, parseRupees, type Paisa } from '../domain/money';
import { SALE_UNITS, toSmallestUnits, type SaleUnit } from '../domain/units';
import { ITEM_FORMS, type ItemForm, type ItemImportKey } from './template';

/**
 * Validation of one import row (PRD §3.4). Pure: checks against the database
 * (existing items, duplicates within the file) are added by the import service.
 */
export type RawRow = Partial<Record<ItemImportKey, unknown>>;

export interface StockDraft {
  batchNo: string;
  expiry: IsoDate;
  qtyTabs: number;
  costBoxPaisa: Paisa;
}

export interface ItemDraft {
  brandName: string;
  genericNames: string[];
  strength: string;
  form: ItemForm;
  company: string;
  category: string;
  barcode: string | null;
  rack: string;
  tabsPerStrip: number;
  stripsPerBox: number;
  priceMode: PriceMode;
  gstRateBp: BasisPoints;
  amountBoxPaisa: Paisa;
  reorderLevelTabs: number;
  rxRequired: boolean;
  stock: StockDraft | null;
}

export interface RowIssue {
  level: 'error' | 'warning';
  field?: ItemImportKey;
  message: string;
}

export type RowStatus = 'ok' | 'warning' | 'error';

export interface ValidatedRow {
  draft: ItemDraft | null;
  issues: RowIssue[];
  status: RowStatus;
}

export interface ValidationContext {
  defaultPriceMode: PriceMode;
  defaultGstRateBp: BasisPoints;
  today: IsoDate;
  expiryWarningDays: number;
}

const FORM_ALIASES: Record<string, ItemForm> = {
  tab: 'tablet',
  tabs: 'tablet',
  tablets: 'tablet',
  cap: 'capsule',
  caps: 'capsule',
  capsules: 'capsule',
  syp: 'syrup',
  susp: 'suspension',
  inj: 'injection',
  oint: 'ointment',
  drop: 'drops',
  sachets: 'sachet',
};

const TRUE_WORDS = new Set(['yes', 'y', 'true', '1']);
const FALSE_WORDS = new Set(['no', 'n', 'false', '0', '']);

/** Spreadsheet cell as text; anything that isn't text or a number counts as blank. */
export function cellString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

export function statusOf(issues: RowIssue[]): RowStatus {
  if (issues.some((i) => i.level === 'error')) return 'error';
  return issues.length > 0 ? 'warning' : 'ok';
}

export function validateImportRow(raw: RawRow, ctx: ValidationContext): ValidatedRow {
  const issues: RowIssue[] = [];
  const error = (field: ItemImportKey, message: string) =>
    issues.push({ level: 'error', field, message });
  const warn = (field: ItemImportKey, message: string) =>
    issues.push({ level: 'warning', field, message });
  const isBlank = (key: ItemImportKey) => cellString(raw[key]).trim() === '';

  const text = (key: ItemImportKey, max = 120): string => {
    const value = cellString(raw[key]).replace(/\s+/g, ' ').trim();
    if (/^[=+@]/.test(value)) {
      error(key, 'Looks like a spreadsheet formula. Type the plain text instead');
      return '';
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(value)) {
      error(key, 'Contains hidden control characters');
      return '';
    }
    if (value.length > max) {
      error(key, `Too long (max ${max} characters)`);
      return value.slice(0, max);
    }
    return value;
  };

  const int = (key: ItemImportKey, fallback: number, min: number, label: string): number => {
    if (isBlank(key)) return fallback;
    const value = Number(String(raw[key]).trim());
    if (!Number.isInteger(value) || value < min || value > 1_000_000) {
      error(key, `${label} must be a whole number${min > 0 ? ` of at least ${min}` : ''}`);
      return fallback;
    }
    return value;
  };

  const money = (key: ItemImportKey, label: string): Paisa | null => {
    const value = raw[key];
    try {
      const paisa = parseRupees(typeof value === 'number' ? value : cellString(value));
      if (paisa < 0) {
        error(key, `${label} cannot be negative`);
        return null;
      }
      return paisa;
    } catch (e) {
      if (!(e instanceof MoneyError)) throw e;
      error(key, `${label} is not a valid amount`);
      return null;
    }
  };

  // ── Item ──────────────────────────────────────────────────────────────
  const brandName = text('brand_name', 80);
  if (!brandName && !issues.some((i) => i.field === 'brand_name'))
    error('brand_name', 'Brand name is required');

  const genericNames = text('generic_name', 200)
    .split('+')
    .map((g) => g.trim())
    .filter(Boolean);

  const formText = text('form', 30).toLowerCase();
  let form: ItemForm = 'tablet';
  if (formText) {
    const known = (ITEM_FORMS as readonly string[]).includes(formText)
      ? (formText as ItemForm)
      : FORM_ALIASES[formText];
    if (known) form = known;
    else {
      form = 'other';
      warn('form', `Unknown form "${formText}", saved as "other"`);
    }
  }

  const barcodeText = text('barcode', 20).replace(/\.0$/, '');
  let barcode: string | null = null;
  if (barcodeText) {
    if (/^\d{6,14}$/.test(barcodeText)) barcode = barcodeText;
    else error('barcode', 'Barcode must be 6 to 14 digits');
  }

  const tabsPerStrip = int('tabs_per_strip', 1, 1, 'Tablets per strip');
  const stripsPerBox = int('strips_per_box', 1, 1, 'Strips per box');
  const pack = { tabsPerStrip, stripsPerBox };

  let amountBoxPaisa: Paisa | null = null;
  if (isBlank('sale_price_box')) error('sale_price_box', 'Sale price is required');
  else amountBoxPaisa = money('sale_price_box', 'Sale price');
  if (amountBoxPaisa === 0) error('sale_price_box', 'Sale price must be more than 0');

  const modeText = text('gst_mode', 20).toLowerCase();
  let priceMode = ctx.defaultPriceMode;
  if (modeText) {
    if ((PRICE_MODES as readonly string[]).includes(modeText)) priceMode = modeText as PriceMode;
    else error('gst_mode', 'gst_mode must be add_gst or price_only');
  }

  let gstRateBp = ctx.defaultGstRateBp;
  if (!isBlank('gst_rate')) {
    try {
      gstRateBp = parsePercent(String(raw.gst_rate));
    } catch {
      error('gst_rate', 'GST rate must be between 0 and 100');
    }
  }

  const reorderBoxes = int('reorder_level', 0, 0, 'Reorder level');
  const rxText = text('rx_required', 10).toLowerCase();
  let rxRequired = false;
  if (TRUE_WORDS.has(rxText)) rxRequired = true;
  else if (!FALSE_WORDS.has(rxText)) error('rx_required', 'rx_required must be yes or no');

  // ── Opening stock (optional) ──────────────────────────────────────────
  let stock: StockDraft | null = null;
  const stockKeys: ItemImportKey[] = ['batch_no', 'expiry', 'qty', 'cost_price_box'];
  if (stockKeys.some((k) => !isBlank(k))) {
    const batchNo = text('batch_no', 40);
    if (!batchNo) error('batch_no', 'Batch number is required for opening stock');

    const expiry = parseExpiry(raw.expiry);
    if (!expiry) error('expiry', 'Expiry must be MM/YYYY or DD/MM/YYYY');
    else if (expiry < ctx.today) error('expiry', 'This batch has already expired');
    else if (expiry <= addDays(ctx.today, ctx.expiryWarningDays)) {
      warn('expiry', `Expires within ${ctx.expiryWarningDays} days`);
    }

    const unitText = (text('qty_unit', 10) || 'box').toLowerCase();
    const unit = (SALE_UNITS as readonly string[]).includes(unitText)
      ? (unitText as SaleUnit)
      : null;
    if (!unit) error('qty_unit', 'qty_unit must be box, strip or tab');

    const qty = int('qty', 0, 0, 'Quantity');
    if (isBlank('qty')) error('qty', 'Quantity is required for opening stock');

    const cost = isBlank('cost_price_box') ? 0 : (money('cost_price_box', 'Cost price') ?? 0);
    if (amountBoxPaisa && cost > 0 && !issues.some((i) => i.field === 'gst_rate')) {
      const finalSale = computePrice(priceMode, amountBoxPaisa, gstRateBp).finalPaisa;
      if (cost > finalSale) warn('cost_price_box', 'Cost price is higher than the sale price');
    }

    if (batchNo && expiry && unit) {
      stock = { batchNo, expiry, qtyTabs: toSmallestUnits(qty, unit, pack), costBoxPaisa: cost };
    }
  }

  const draft: ItemDraft = {
    brandName,
    genericNames,
    strength: text('strength', 40),
    form,
    company: text('company', 80),
    category: text('category', 60),
    barcode,
    rack: text('rack', 20),
    tabsPerStrip,
    stripsPerBox,
    priceMode,
    gstRateBp,
    amountBoxPaisa: amountBoxPaisa ?? 0,
    reorderLevelTabs: toSmallestUnits(reorderBoxes, 'box', pack),
    rxRequired,
    stock,
  };
  const status = statusOf(issues);
  return { draft: status === 'error' ? null : draft, issues, status };
}

/** Guesses which spreadsheet column holds which field, from the header names. */
export function suggestMapping(
  headers: string[],
  keys: readonly ItemImportKey[],
): Partial<Record<ItemImportKey, number>> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases: Partial<Record<ItemImportKey, string[]>> = {
    brand_name: ['brand', 'name', 'itemname', 'medicine', 'product', 'productname'],
    generic_name: ['generic', 'salt', 'formula'],
    sale_price_box: ['saleprice', 'price', 'mrp', 'retailprice', 'tp'],
    cost_price_box: ['cost', 'costprice', 'purchaseprice'],
    tabs_per_strip: ['tabsperstrip', 'tabletsperstrip'],
    strips_per_box: ['stripsperbox', 'packsize'],
    qty: ['quantity', 'stock', 'qty'],
    expiry: ['expiry', 'exp', 'expirydate', 'expdate'],
    batch_no: ['batch', 'batchno', 'batchnumber', 'lot'],
    company: ['company', 'manufacturer', 'mfg'],
  };
  const result: Partial<Record<ItemImportKey, number>> = {};
  const taken = new Set<number>();
  for (const key of keys) {
    const candidates = [norm(key), ...(aliases[key] ?? [])];
    const index = headers.findIndex((h, i) => !taken.has(i) && candidates.includes(norm(h)));
    if (index !== -1) {
      result[key] = index;
      taken.add(index);
    }
  }
  return result;
}
