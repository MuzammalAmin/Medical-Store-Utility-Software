import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { PRICE_MODES } from '../../../shared/domain/gst';
import { ROLES } from '../../../shared/domain/permissions';
import { ITEM_FORMS } from '../../../shared/import/template';
import { PAYMENT_METHODS } from '../../../shared/ipc/schemas/sales';

/**
 * Database schema (PRD §7). Conventions:
 * - money in integer paisa (`*_paisa`), GST rates in basis points (`*_bp`)
 * - stock quantities in the smallest unit (tablets)
 * - timestamps as Unix milliseconds
 * - `audit_log` and `stock_movements` are append-only (enforced by triggers in a migration)
 */
const createdAt = () =>
  integer('created_at')
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);
const updatedAt = () =>
  integer('updated_at')
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const STOCK_MOVEMENT_TYPES = [
  'opening',
  'import',
  'sale',
  'return',
  'purchase',
  'purchase_return',
  'adjustment',
  'write_off',
  'void',
] as const;

// ── System ────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  fullName: text('full_name').notNull(),
  role: text('role', { enum: ROLES }).notNull(),
  pinHash: text('pin_hash').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: integer('locked_until'),
  lastLoginAt: integer('last_login_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const settings = sqliteTable('settings', {
  group: text('group').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: updatedAt(),
  updatedBy: integer('updated_by').references(() => users.id),
});

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: createdAt(),
    userId: integer('user_id').references(() => users.id),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    details: text('details', { mode: 'json' }),
  },
  (t) => [
    index('audit_log_at_idx').on(t.at),
    index('audit_log_entity_idx').on(t.entity, t.entityId),
  ],
);

// ── Catalogue ─────────────────────────────────────────────────────────────

export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const generics = sqliteTable('generics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const items = sqliteTable(
  'items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    brandName: text('brand_name').notNull(),
    strength: text('strength').notNull().default(''),
    form: text('form', { enum: ITEM_FORMS }).notNull().default('tablet'),
    companyId: integer('company_id').references(() => companies.id),
    category: text('category').notNull().default(''),
    rack: text('rack').notNull().default(''),
    tabsPerStrip: integer('tabs_per_strip').notNull().default(1),
    stripsPerBox: integer('strips_per_box').notNull().default(1),
    priceMode: text('price_mode', { enum: PRICE_MODES }).notNull(),
    gstRateBp: integer('gst_rate_bp').notNull(),
    basePriceBoxPaisa: integer('base_price_box_paisa').notNull(),
    finalPriceBoxPaisa: integer('final_price_box_paisa').notNull(),
    stripPriceOverridePaisa: integer('strip_price_override_paisa'),
    tabPriceOverridePaisa: integer('tab_price_override_paisa'),
    reorderLevelTabs: integer('reorder_level_tabs').notNull().default(0),
    rxRequired: integer('rx_required', { mode: 'boolean' }).notNull().default(false),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('items_brand_idx').on(t.brandName),
    index('items_identity_idx').on(t.brandName, t.strength, t.form),
  ],
);

export const itemBarcodes = sqliteTable(
  'item_barcodes',
  {
    barcode: text('barcode').primaryKey(),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
  },
  (t) => [index('item_barcodes_item_idx').on(t.itemId)],
);

export const itemGenerics = sqliteTable(
  'item_generics',
  {
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    genericId: integer('generic_id')
      .notNull()
      .references(() => generics.id),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.genericId] }),
    index('item_generics_generic_idx').on(t.genericId),
  ],
);

// ── Stock ─────────────────────────────────────────────────────────────────

export const batches = sqliteTable(
  'batches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    batchNo: text('batch_no').notNull(),
    /** ISO date (YYYY-MM-DD); MM/YYYY entries use the last day of that month. */
    expiry: text('expiry').notNull(),
    costPriceBoxPaisa: integer('cost_price_box_paisa').notNull().default(0),
    priceMode: text('price_mode', { enum: PRICE_MODES }).notNull(),
    gstRateBp: integer('gst_rate_bp').notNull(),
    basePriceBoxPaisa: integer('base_price_box_paisa').notNull(),
    finalPriceBoxPaisa: integer('final_price_box_paisa').notNull(),
    /** Cached sum of stock_movements.qty_change, updated in the same transaction. */
    qty: integer('qty').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('batches_item_batch_expiry_uq').on(t.itemId, t.batchNo, t.expiry),
    index('batches_expiry_idx').on(t.expiry),
  ],
);

export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    batchId: integer('batch_id')
      .notNull()
      .references(() => batches.id),
    qtyChange: integer('qty_change').notNull(),
    type: text('type', { enum: STOCK_MOVEMENT_TYPES }).notNull(),
    refType: text('ref_type'),
    refId: integer('ref_id'),
    userId: integer('user_id').references(() => users.id),
    note: text('note'),
    at: createdAt(),
  },
  (t) => [
    index('stock_movements_batch_idx').on(t.batchId),
    index('stock_movements_at_idx').on(t.at),
  ],
);

// ── Sales ─────────────────────────────────────────────────────────────────

export const SALE_UNITS_DB = ['box', 'strip', 'tab'] as const;

export const sales = sqliteTable(
  'sales',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Sequential, never edited or reused (PRD §3.5). */
    invoiceNo: integer('invoice_no').notNull().unique(),
    at: createdAt(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    customerName: text('customer_name').notNull().default(''),
    customerPhone: text('customer_phone').notNull().default(''),
    doctorName: text('doctor_name').notNull().default(''),
    subtotalPaisa: integer('subtotal_paisa').notNull(),
    discountPaisa: integer('discount_paisa').notNull(),
    gstPaisa: integer('gst_paisa').notNull(),
    totalPaisa: integer('total_paisa').notNull(),
    costPaisa: integer('cost_paisa').notNull(),
    paymentMethod: text('payment_method', { enum: PAYMENT_METHODS }).notNull(),
    paidPaisa: integer('paid_paisa').notNull(),
    changePaisa: integer('change_paisa').notNull(),
    status: text('status', { enum: ['completed', 'void'] })
      .notNull()
      .default('completed'),
    voidedAt: integer('voided_at'),
    voidedBy: integer('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    // Reserved for the optional FBR module (PRD §3.11).
    fbrInvoiceNo: text('fbr_invoice_no'),
    fbrStatus: text('fbr_status'),
    fbrSyncedAt: integer('fbr_synced_at'),
  },
  (t) => [index('sales_at_idx').on(t.at)],
);

export const saleLines = sqliteTable(
  'sale_lines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    saleId: integer('sale_id')
      .notNull()
      .references(() => sales.id),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    batchId: integer('batch_id')
      .notNull()
      .references(() => batches.id),
    /** Snapshot of what was printed, so later item edits never change old invoices. */
    itemName: text('item_name').notNull(),
    batchNo: text('batch_no').notNull(),
    expiry: text('expiry').notNull(),
    unit: text('unit', { enum: SALE_UNITS_DB }).notNull(),
    qty: integer('qty').notNull(),
    qtyTabs: integer('qty_tabs').notNull(),
    priceMode: text('price_mode', { enum: PRICE_MODES }).notNull(),
    gstRateBp: integer('gst_rate_bp').notNull(),
    unitAmountPaisa: integer('unit_amount_paisa').notNull(),
    subtotalPaisa: integer('subtotal_paisa').notNull(),
    discountPaisa: integer('discount_paisa').notNull(),
    gstPaisa: integer('gst_paisa').notNull(),
    totalPaisa: integer('total_paisa').notNull(),
    costPaisa: integer('cost_paisa').notNull(),
  },
  (t) => [index('sale_lines_sale_idx').on(t.saleId), index('sale_lines_item_idx').on(t.itemId)],
);

export const heldBills = sqliteTable('held_bills', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: createdAt(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  label: text('label').notNull(),
  cart: text('cart', { mode: 'json' }).notNull(),
});

export const returns = sqliteTable(
  'returns',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    returnNo: integer('return_no').notNull().unique(),
    saleId: integer('sale_id')
      .notNull()
      .references(() => sales.id),
    at: createdAt(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    approvedBy: integer('approved_by').references(() => users.id),
    reason: text('reason').notNull().default(''),
    refundPaisa: integer('refund_paisa').notNull(),
    gstPaisa: integer('gst_paisa').notNull(),
    costPaisa: integer('cost_paisa').notNull(),
    refundMethod: text('refund_method', { enum: PAYMENT_METHODS }).notNull(),
  },
  (t) => [index('returns_sale_idx').on(t.saleId), index('returns_at_idx').on(t.at)],
);

export const returnLines = sqliteTable(
  'return_lines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    returnId: integer('return_id')
      .notNull()
      .references(() => returns.id),
    saleLineId: integer('sale_line_id')
      .notNull()
      .references(() => saleLines.id),
    qty: integer('qty').notNull(),
    qtyTabs: integer('qty_tabs').notNull(),
    restocked: integer('restocked', { mode: 'boolean' }).notNull(),
    refundPaisa: integer('refund_paisa').notNull(),
    gstPaisa: integer('gst_paisa').notNull(),
    costPaisa: integer('cost_paisa').notNull(),
  },
  (t) => [index('return_lines_sale_line_idx').on(t.saleLineId)],
);
