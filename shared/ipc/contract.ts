import { z } from 'zod';
import { PERMISSIONS, ROLES, type Permission } from '../domain/permissions';
import { settingsSchemas, type SettingsGroup } from '../settings';
import type { IpcChannelName } from './channels';
import {
  addBatchInputSchema,
  adjustInputSchema,
  batchListQuerySchema,
  batchRowSchema,
  itemDetailSchema,
  itemInputSchema,
  itemListQuerySchema,
  itemRowSchema,
  pagedSchema,
} from './schemas/catalog';
import {
  importOpenSchema,
  importOptionsSchema,
  importPreviewSchema,
  importResultSchema,
} from './schemas/import';
import {
  dateRangeSchema,
  exportInputSchema,
  reportTableSchema,
  salesSummarySchema,
  STOCK_REPORTS,
} from './schemas/reports';
import {
  cartDraftSchema,
  checkoutInputSchema,
  createReturnInputSchema,
  heldBillSchema,
  posItemSchema,
  receiptRefSchema,
  returnDetailSchema,
  returnLookupSchema,
  saleDetailSchema,
  saleListQuerySchema,
  saleRowSchema,
} from './schemas/sales';

/**
 * The single typed contract between the UI (renderer) and the back end (main
 * process). Every channel declares its input and output schema and who may call it.
 * The main process validates every call against this table (PRD §6.2), and the
 * preload script only forwards channel names that appear here.
 *
 * Access levels:
 * - `setup`   — only while the first-run setup is not finished
 * - `public`  — no login needed (login screen)
 * - `session` — any logged-in user
 * - a Permission — a logged-in user whose role has that permission
 */
export type Access = 'setup' | 'public' | 'session' | Permission;

interface ChannelDef<I extends z.ZodType, O extends z.ZodType> {
  input: I;
  output: O;
  access: Access;
}

const channel = <I extends z.ZodType, O extends z.ZodType>(def: ChannelDef<I, O>) => def;

// ── Shared field schemas ──────────────────────────────────────────────────

export const pinSchema = z.string().regex(/^\d{4,8}$/, 'PIN must be 4 to 8 digits');
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, 'Use 3–30 letters, numbers, dot, dash or underscore');
export const fullNameSchema = z.string().trim().min(2).max(60);
export const recoveryKeySchema = z.string().trim().min(10).max(120);

export const sessionUserSchema = z.object({
  id: z.int(),
  username: z.string(),
  fullName: z.string(),
  role: z.enum(ROLES),
  permissions: z.array(z.enum(PERMISSIONS)),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const userRowSchema = z.object({
  id: z.int(),
  username: z.string(),
  fullName: z.string(),
  role: z.enum(ROLES),
  active: z.boolean(),
  lastLoginAt: z.int().nullable(),
});
export type UserRow = z.infer<typeof userRowSchema>;

/**
 * - `setup`   — first run: no owner account yet
 * - `recover` — a database exists but this PC cannot read its key (e.g. Windows was reinstalled)
 * - `login`   — waiting for a user to log in (also after auto-lock)
 * - `ready`   — a user is logged in
 */
export const APP_PHASES = ['setup', 'recover', 'login', 'ready'] as const;
export type AppPhase = (typeof APP_PHASES)[number];

export const appStateSchema = z.object({
  phase: z.enum(APP_PHASES),
  user: sessionUserSchema.nullable(),
  shopName: z.string(),
  version: z.string(),
  autoLockMinutes: z.int(),
});
export type AppState = z.infer<typeof appStateSchema>;

export const settingsPayloadSchema = z.object(settingsSchemas);

const settingsUpdate = <G extends SettingsGroup>(group: G) =>
  z.object({ group: z.literal(group), value: settingsSchemas[group] });

const settingsUpdateSchema = z.discriminatedUnion('group', [
  settingsUpdate('shop'),
  settingsUpdate('tax'),
  settingsUpdate('security'),
  settingsUpdate('inventory'),
  settingsUpdate('backup'),
  settingsUpdate('pos'),
]);

export const backupInfoSchema = z.object({
  fileName: z.string(),
  createdAt: z.int(),
  sizeBytes: z.int(),
  reason: z.string(),
});
export type BackupInfo = z.infer<typeof backupInfoSchema>;

export const backupStatusSchema = z.object({
  folder: z.string(),
  lastBackupAt: z.int().nullable(),
  lastUsbCopyAt: z.int().nullable(),
  usbAvailable: z.boolean(),
  backups: z.array(backupInfoSchema),
});
export type BackupStatus = z.infer<typeof backupStatusSchema>;

const ok = z.object({ ok: z.literal(true) });

// ── Channels ──────────────────────────────────────────────────────────────

export const ipcContract = {
  'app:state': channel({ input: z.void(), output: appStateSchema, access: 'public' }),

  'setup:recoveryKey': channel({
    input: z.void(),
    output: z.object({ recoveryKey: z.string(), confirmIndexes: z.array(z.int()) }),
    access: 'setup',
  }),
  'setup:saveRecoveryKey': channel({
    input: z.void(),
    output: z.object({ saved: z.boolean() }),
    access: 'setup',
  }),
  'setup:printRecoveryKey': channel({
    input: z.void(),
    output: z.object({ printed: z.boolean() }),
    access: 'setup',
  }),
  'setup:complete': channel({
    input: z.object({
      shop: settingsSchemas.shop,
      owner: z.object({ fullName: fullNameSchema, username: usernameSchema, pin: pinSchema }),
      confirmation: z.string().trim().max(40),
    }),
    output: appStateSchema,
    access: 'setup',
  }),
  'setup:restore': channel({
    input: z.object({ recoveryKey: recoveryKeySchema }),
    output: z.object({ restored: z.boolean() }),
    access: 'setup',
  }),
  'setup:unlock': channel({
    input: z.object({ recoveryKey: recoveryKeySchema }),
    output: appStateSchema,
    access: 'setup',
  }),

  'auth:loginUsers': channel({
    input: z.void(),
    output: z.array(z.object({ username: z.string(), fullName: z.string() })),
    access: 'public',
  }),
  'auth:login': channel({
    input: z.object({ username: usernameSchema, pin: pinSchema }),
    output: appStateSchema,
    access: 'public',
  }),
  'auth:logout': channel({ input: z.void(), output: ok, access: 'session' }),
  'auth:changeOwnPin': channel({
    input: z.object({ currentPin: pinSchema, newPin: pinSchema }),
    output: ok,
    access: 'session',
  }),

  'settings:get': channel({ input: z.void(), output: settingsPayloadSchema, access: 'session' }),
  'settings:update': channel({
    input: settingsUpdateSchema,
    output: settingsPayloadSchema,
    access: 'settings.manage',
  }),

  'users:list': channel({
    input: z.void(),
    output: z.array(userRowSchema),
    access: 'users.manage',
  }),
  'users:create': channel({
    input: z.object({
      fullName: fullNameSchema,
      username: usernameSchema,
      role: z.enum(ROLES),
      pin: pinSchema,
    }),
    output: userRowSchema,
    access: 'users.manage',
  }),
  'users:update': channel({
    input: z.object({
      id: z.int(),
      fullName: fullNameSchema.optional(),
      role: z.enum(ROLES).optional(),
      active: z.boolean().optional(),
    }),
    output: userRowSchema,
    access: 'users.manage',
  }),
  'users:resetPin': channel({
    input: z.object({ id: z.int(), pin: pinSchema }),
    output: ok,
    access: 'users.manage',
  }),

  'backup:status': channel({
    input: z.void(),
    output: backupStatusSchema,
    access: 'backup.manage',
  }),
  'backup:create': channel({
    input: z.void(),
    output: backupStatusSchema,
    access: 'backup.manage',
  }),
  'backup:chooseUsbFolder': channel({
    input: z.void(),
    output: settingsPayloadSchema,
    access: 'backup.manage',
  }),
  'backup:restore': channel({
    input: z.object({ fileName: z.string().max(200), ownerPin: pinSchema }),
    output: ok,
    access: 'backup.manage',
  }),

  'security:recoveryKey': channel({
    input: z.object({ pin: pinSchema, action: z.enum(['view', 'print', 'save']) }),
    output: z.object({ recoveryKey: z.string().nullable() }),
    access: 'backup.manage',
  }),

  'dashboard:summary': channel({
    input: z.void(),
    output: z.object({
      itemCount: z.int(),
      lowStockCount: z.int(),
      nearExpiryCount: z.int(),
      expiredCount: z.int(),
      lastBackupAt: z.int().nullable(),
      /** Null for users who may not see sales totals. */
      todaySalesPaisa: z.int().nullable(),
      todayInvoices: z.int().nullable(),
    }),
    access: 'session',
  }),

  // ── Items & stock (PRD §3.1–3.3) ─────────────────────────────────────────
  'items:list': channel({
    input: itemListQuerySchema,
    output: pagedSchema(itemRowSchema),
    access: 'items.view',
  }),
  'items:get': channel({
    input: z.object({ id: z.int() }),
    output: itemDetailSchema,
    access: 'items.view',
  }),
  'items:save': channel({ input: itemInputSchema, output: itemDetailSchema, access: 'items.edit' }),
  'items:setActive': channel({
    input: z.object({ id: z.int(), active: z.boolean() }),
    output: itemDetailSchema,
    access: 'items.edit',
  }),
  'items:alternatives': channel({
    input: z.object({ id: z.int() }),
    output: z.array(itemRowSchema),
    access: 'items.view',
  }),
  'inventory:batches': channel({
    input: batchListQuerySchema,
    output: pagedSchema(batchRowSchema),
    access: 'stock.view',
  }),
  'inventory:addBatch': channel({
    input: addBatchInputSchema,
    output: batchRowSchema,
    access: 'stock.adjust',
  }),
  'inventory:adjust': channel({
    input: adjustInputSchema,
    output: batchRowSchema,
    access: 'stock.adjust',
  }),

  // ── Point of sale (PRD §3.5) ────────────────────────────────────────────
  'pos:search': channel({
    input: z.object({ query: z.string().trim().min(1).max(80) }),
    output: z.array(posItemSchema),
    access: 'pos.sell',
  }),
  'pos:items': channel({
    input: z.object({ ids: z.array(z.int()).max(200) }),
    output: z.array(posItemSchema),
    access: 'pos.sell',
  }),
  'pos:checkout': channel({
    input: checkoutInputSchema,
    output: saleDetailSchema,
    access: 'pos.sell',
  }),
  'pos:hold': channel({
    input: z.object({ label: z.string().trim().max(60), cart: cartDraftSchema }),
    output: heldBillSchema,
    access: 'pos.sell',
  }),
  'pos:heldList': channel({
    input: z.void(),
    output: z.array(heldBillSchema),
    access: 'pos.sell',
  }),
  'pos:heldDelete': channel({ input: z.object({ id: z.int() }), output: ok, access: 'pos.sell' }),

  'sales:list': channel({
    input: saleListQuerySchema,
    output: pagedSchema(saleRowSchema),
    access: 'pos.sell',
  }),
  'sales:get': channel({
    input: z.object({ invoiceNo: z.int() }),
    output: saleDetailSchema,
    access: 'pos.sell',
  }),
  'sales:void': channel({
    input: z.object({
      saleId: z.int(),
      reason: z.string().trim().min(3, 'Give a short reason').max(200),
      approverPin: pinSchema,
    }),
    output: saleDetailSchema,
    access: 'pos.sell',
  }),

  // ── Returns (PRD §3.6) ──────────────────────────────────────────────────
  'returns:lookup': channel({
    input: z.object({ invoiceNo: z.int() }),
    output: returnLookupSchema,
    access: 'returns.create',
  }),
  'returns:create': channel({
    input: createReturnInputSchema,
    output: returnDetailSchema,
    access: 'returns.create',
  }),

  // ── Receipts (80mm) ─────────────────────────────────────────────────────
  'receipt:html': channel({
    input: receiptRefSchema,
    output: z.object({ html: z.string() }),
    access: 'pos.sell',
  }),
  'receipt:print': channel({ input: receiptRefSchema, output: ok, access: 'pos.sell' }),
  'printers:list': channel({
    input: z.void(),
    output: z.array(z.object({ name: z.string(), displayName: z.string() })),
    access: 'settings.manage',
  }),

  // ── Reports (PRD §3.9) ──────────────────────────────────────────────────
  'reports:salesSummary': channel({
    input: dateRangeSchema,
    output: salesSummarySchema,
    access: 'reports.view',
  }),
  'reports:stock': channel({
    input: z.object({ kind: z.enum(STOCK_REPORTS) }),
    output: reportTableSchema,
    access: 'reports.view',
  }),
  'reports:export': channel({
    input: exportInputSchema,
    output: z.object({ saved: z.boolean() }),
    access: 'reports.view',
  }),

  // ── Import (PRD §3.4) ───────────────────────────────────────────────────
  'import:template': channel({
    input: z.object({ format: z.enum(['xlsx', 'csv']) }),
    output: z.object({ saved: z.boolean() }),
    access: 'import.run',
  }),
  'import:open': channel({
    input: z.void(),
    output: importOpenSchema.nullable(),
    access: 'import.run',
  }),
  'import:preview': channel({
    input: importOptionsSchema,
    output: importPreviewSchema,
    access: 'import.run',
  }),
  'import:commit': channel({
    input: importOptionsSchema,
    output: importResultSchema,
    access: 'import.run',
  }),
  'import:errorFile': channel({
    input: importOptionsSchema,
    output: z.object({ saved: z.boolean() }),
    access: 'import.run',
  }),
} as const satisfies Record<IpcChannelName, ChannelDef<z.ZodType, z.ZodType>>;

export type IpcContract = typeof ipcContract;
export type IpcChannel = IpcChannelName;
export type IpcInput<C extends IpcChannel> = z.input<IpcContract[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.output<IpcContract[C]['output']>;

// ── Result envelope ───────────────────────────────────────────────────────

export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'LOCKED_OUT',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface IpcError {
  code: ErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };
