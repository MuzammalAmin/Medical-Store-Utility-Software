import { z } from 'zod';
import { DEFAULT_GST_RATE_BP, MAX_GST_RATE_BP, PRICE_MODES } from './domain/gst';

/**
 * Typed application settings (PRD §3.10). Each group is stored as one JSON row
 * in the `settings` table and always parsed through these schemas, so missing
 * or older values fall back to the defaults.
 */
const text = (max: number) => z.string().trim().max(max);

export const shopSettingsSchema = z.object({
  name: text(80).min(1).default('Ayyaz Pharmacy'),
  address: text(200).default(''),
  phone: text(40).default(''),
  licenceNo: text(60).default(''),
  ntn: text(30).default(''),
  strn: text(30).default(''),
  receiptFooter: text(200).default('Thank you for your visit. Get well soon!'),
});

export const taxSettingsSchema = z.object({
  defaultPriceMode: z.enum(PRICE_MODES).default('add_gst'),
  defaultGstRateBp: z.int().min(0).max(MAX_GST_RATE_BP).default(DEFAULT_GST_RATE_BP),
});

export const securitySettingsSchema = z.object({
  autoLockMinutes: z.int().min(1).max(120).default(10),
});

export const inventorySettingsSchema = z.object({
  expiryWarningDays: z.int().min(1).max(730).default(90),
});

export const backupSettingsSchema = z.object({
  dailyTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)')
    .default('21:00'),
  usbFolder: text(260).default(''),
  keepCount: z.int().min(5).max(365).default(30),
});

export const posSettingsSchema = z.object({
  /** Largest total discount staff may give on a bill, in basis points (1000 = 10%). */
  staffMaxDiscountBp: z.int().min(0).max(10_000).default(1000),
  /** Days after a sale during which staff may take a return without the Owner's PIN. */
  returnWindowDays: z.int().min(0).max(365).default(7),
  /** Refunds above this amount (paisa) need the Owner's PIN when taken by staff. */
  refundApprovalPaisa: z.int().min(0).default(200_000),
  /** Windows printer name for receipts; empty = ask with the print dialog. */
  receiptPrinter: text(200).default(''),
  /** Print the receipt automatically after each sale (only once a receipt printer is chosen). */
  autoPrint: z.boolean().default(true),
});

export const settingsSchemas = {
  shop: shopSettingsSchema,
  tax: taxSettingsSchema,
  security: securitySettingsSchema,
  inventory: inventorySettingsSchema,
  backup: backupSettingsSchema,
  pos: posSettingsSchema,
} as const;

export type SettingsGroup = keyof typeof settingsSchemas;
export const SETTINGS_GROUPS = Object.keys(settingsSchemas) as SettingsGroup[];

export type Settings = { [K in SettingsGroup]: z.infer<(typeof settingsSchemas)[K]> };
export type ShopSettings = Settings['shop'];
export type TaxSettings = Settings['tax'];
export type BackupSettings = Settings['backup'];
export type PosSettings = Settings['pos'];
