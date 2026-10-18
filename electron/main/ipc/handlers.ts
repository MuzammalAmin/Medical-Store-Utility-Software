import { writeFileSync } from 'node:fs';
import { BrowserWindow, dialog } from 'electron';
import type { Permission } from '../../../shared/domain/permissions';
import { ITEM_IMPORT_COLUMNS } from '../../../shared/import/template';
import { returnReceiptHtml, saleReceiptHtml, testReceiptHtml } from '../../../shared/receipt';
import { fail } from '../errors';
import { buildItemsWorkbook, templateExampleRow, toCsv } from '../import/workbook';
import { logger } from '../logger';
import type { Runtime } from '../runtime';
import { printRecoveryKey, saveRecoveryKeyFile } from '../security/recovery-key-output';
import { tableToCsv, tableToHtml, tableToXlsx } from '../services/export.service';
import { htmlToPdf, listPrinters, printHtml } from '../services/printing';
import { requireUser, type HandlerContext, type Handlers } from './router';

const windowOf = (ctx: HandlerContext) => BrowserWindow.fromWebContents(ctx.event.sender);

/**
 * Thin adapters from IPC channels to services. Business rules live in the
 * services; handlers only pick the acting user and translate results.
 */
export function createHandlers(runtime: Runtime): Handlers {
  const svc = () => runtime.services();
  const shopName = () => svc().settings.get('shop').name;

  return {
    'app:state': () => runtime.appState(),

    // ── First run ──────────────────────────────────────────────────────
    'setup:recoveryKey': () => svc().setup.recoveryKeyInfo(),
    'setup:saveRecoveryKey': async (_input, ctx) => ({
      saved: await saveRecoveryKeyFile(windowOf(ctx), shopName(), runtime.recoveryKey()),
    }),
    'setup:printRecoveryKey': async () => ({
      printed: await printRecoveryKey(shopName(), runtime.recoveryKey()),
    }),
    'setup:complete': async (input) => {
      const user = await svc().setup.complete(input);
      runtime.onSetupComplete();
      runtime.session.start(user);
      return runtime.appState();
    },
    'setup:restore': async ({ recoveryKey }, ctx) => {
      if (runtime.phase() !== 'setup')
        throw fail.forbidden('Restore from here is only possible during setup');
      const key = runtime.parseRecoveryKey(recoveryKey);
      const win = windowOf(ctx);
      const options = {
        title: 'Choose a backup to restore',
        properties: ['openFile' as const],
        filters: [{ name: 'Ayyaz Pharmacy backup', extensions: ['apbak'] }],
      };
      const picked = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      const file = picked.filePaths[0];
      if (picked.canceled || !file) return { restored: false };
      runtime.restoreFrom(file, key);
      return { restored: true };
    },
    'setup:unlock': ({ recoveryKey }) => {
      if (runtime.phase() !== 'recover') throw fail.forbidden('The database is not locked');
      runtime.unlock(recoveryKey);
      return runtime.appState();
    },

    // ── Login ──────────────────────────────────────────────────────────
    'auth:loginUsers': () => svc().users.loginList(),
    'auth:login': async ({ username, pin }) => {
      const user = await svc().auth.login(username, pin);
      runtime.session.start(user);
      return runtime.appState();
    },
    'auth:logout': (_input, ctx) => {
      svc().auth.logout(requireUser(ctx).id);
      runtime.session.end();
      return { ok: true as const };
    },
    'auth:changeOwnPin': async ({ currentPin, newPin }, ctx) => {
      await svc().auth.changeOwnPin(requireUser(ctx).id, currentPin, newPin);
      return { ok: true as const };
    },

    // ── Settings & users ───────────────────────────────────────────────
    'settings:get': () => svc().settings.getAll(),
    'settings:update': ({ group, value }, ctx) =>
      svc().settings.update(group, value, requireUser(ctx).id),

    'users:list': () => svc().users.list(),
    'users:create': (input, ctx) => svc().users.create(input, requireUser(ctx).id),
    'users:update': ({ id, ...changes }, ctx) =>
      svc().users.update(id, changes, requireUser(ctx).id),
    'users:resetPin': async ({ id, pin }, ctx) => {
      await svc().users.resetPin(id, pin, requireUser(ctx).id);
      return { ok: true as const };
    },

    // ── Backup & recovery ──────────────────────────────────────────────
    'backup:status': () => svc().backups.status(),
    'backup:create': () => {
      svc().backups.create('manual');
      return svc().backups.status();
    },
    'backup:chooseUsbFolder': async (_input, ctx) => {
      const win = windowOf(ctx);
      const options = {
        title: 'Choose the USB backup folder',
        properties: ['openDirectory' as const, 'createDirectory' as const],
      };
      const picked = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      const folder = picked.filePaths[0];
      if (picked.canceled || !folder) return svc().settings.getAll();
      const current = svc().settings.get('backup');
      return svc().settings.update(
        'backup',
        { ...current, usbFolder: folder },
        requireUser(ctx).id,
      );
    },
    'backup:restore': async ({ fileName, ownerPin }, ctx) => {
      const user = requireUser(ctx);
      await svc().auth.confirmPin(user.id, ownerPin, 'backup.restore');
      const file = svc().backups.verifiedPath(fileName);
      runtime.restoreFrom(file);
      return { ok: true as const };
    },

    'security:recoveryKey': async ({ pin, action }, ctx) => {
      const user = requireUser(ctx);
      await svc().auth.confirmPin(user.id, pin, `recovery_key.${action}`);
      const recoveryKey = runtime.recoveryKey();
      if (action === 'print') await printRecoveryKey(shopName(), recoveryKey);
      if (action === 'save') await saveRecoveryKeyFile(windowOf(ctx), shopName(), recoveryKey);
      return { recoveryKey: action === 'view' ? recoveryKey : null };
    },

    'dashboard:summary': (_input, ctx) => {
      const { expiryWarningDays } = svc().settings.get('inventory');
      const today = can(ctx, 'reports.view') ? svc().reports.today() : null;
      return {
        ...svc().dashboard.summary(expiryWarningDays),
        lastBackupAt: svc().backups.lastBackupAt(),
        todaySalesPaisa: today?.totalPaisa ?? null,
        todayInvoices: today?.invoices ?? null,
      };
    },

    // ── Items & stock ──────────────────────────────────────────────────
    'items:list': (q) => svc().items.list(q),
    'items:get': ({ id }, ctx) => svc().items.get(id, can(ctx, 'cost.view')),
    'items:save': (input, ctx) => {
      const user = requireUser(ctx);
      if (!can(ctx, 'prices.edit')) throw fail.forbidden('Only the Owner can set prices');
      const id = svc().items.save(input, user.id);
      return svc().items.get(id, can(ctx, 'cost.view'));
    },
    'items:setActive': ({ id, active }, ctx) => {
      svc().items.setActive(id, active, requireUser(ctx).id);
      return svc().items.get(id, can(ctx, 'cost.view'));
    },
    'items:alternatives': ({ id }) => svc().items.alternatives(id),
    'inventory:batches': (q, ctx) => svc().inventory.list(q, can(ctx, 'cost.view')),
    'inventory:addBatch': (input, ctx) => svc().inventory.addBatch(input, requireUser(ctx).id),
    'inventory:adjust': (input, ctx) => svc().inventory.adjust(input, requireUser(ctx).id),

    // ── Point of sale & invoices ───────────────────────────────────────
    'pos:search': ({ query }) => svc().sales.search(query),
    'pos:items': ({ ids }) => svc().sales.posItems(ids),
    'pos:checkout': (input, ctx) => {
      const sale = svc().sales.checkout(input, requireUser(ctx));
      const pos = svc().settings.get('pos');
      if (pos.autoPrint && pos.receiptPrinter) {
        // A printer problem must never lose the sale; the cashier can reprint.
        printHtml(saleReceiptHtml(svc().settings.get('shop'), sale), pos.receiptPrinter).catch(
          (error: unknown) => logger.warn('Receipt auto-print failed', error),
        );
      }
      return sale;
    },
    'pos:hold': ({ label, cart }, ctx) => svc().sales.hold(label, cart, requireUser(ctx)),
    'pos:heldList': () => svc().sales.heldList(),
    'pos:heldDelete': ({ id }) => {
      svc().sales.deleteHeld(id);
      return { ok: true as const };
    },
    'sales:list': (q) => svc().sales.list(q),
    'sales:get': ({ invoiceNo }) => svc().sales.getByInvoice(invoiceNo),
    'sales:void': ({ saleId, reason, approverPin }, ctx) =>
      svc().sales.void(saleId, reason, approverPin, requireUser(ctx)),

    // ── Returns ────────────────────────────────────────────────────────
    'returns:lookup': ({ invoiceNo }) => svc().returns.lookup(invoiceNo),
    'returns:create': async (input, ctx) => {
      const ret = await svc().returns.create(input, requireUser(ctx));
      const pos = svc().settings.get('pos');
      if (pos.autoPrint && pos.receiptPrinter) {
        printHtml(returnReceiptHtml(svc().settings.get('shop'), ret), pos.receiptPrinter).catch(
          (error: unknown) => logger.warn('Refund receipt auto-print failed', error),
        );
      }
      return ret;
    },

    // ── Receipts ───────────────────────────────────────────────────────
    'receipt:html': (ref) => ({ html: receiptHtml(ref) }),
    'receipt:print': async (ref) => {
      await printHtml(receiptHtml(ref), svc().settings.get('pos').receiptPrinter);
      return { ok: true as const };
    },
    'printers:list': () => listPrinters(),

    // ── Reports ────────────────────────────────────────────────────────
    'reports:salesSummary': ({ from, to }, ctx) =>
      svc().reports.salesSummary(from, to, can(ctx, 'cost.view')),
    'reports:stock': ({ kind }, ctx) => svc().reports.stock(kind, can(ctx, 'cost.view')),
    'reports:export': async ({ table, subtitle, format }, ctx) => {
      const filters = {
        xlsx: { name: 'Excel workbook', extensions: ['xlsx'] },
        csv: { name: 'CSV file', extensions: ['csv'] },
        pdf: { name: 'PDF document', extensions: ['pdf'] },
      };
      const target = await chooseSaveFile(
        windowOf(ctx),
        `${table.title}.${format}`,
        filters[format],
      );
      if (!target) return { saved: false };
      const content =
        format === 'xlsx'
          ? await tableToXlsx(table, subtitle)
          : format === 'csv'
            ? tableToCsv(table)
            : await htmlToPdf(tableToHtml(table, subtitle, shopName()));
      writeFileSync(target, content);
      return { saved: true };
    },

    // ── Import ─────────────────────────────────────────────────────────
    'import:template': async ({ format }, ctx) => {
      const target = await chooseSaveFile(
        windowOf(ctx),
        `ayyaz-import-template.${format}`,
        format === 'xlsx'
          ? { name: 'Excel workbook', extensions: ['xlsx'] }
          : { name: 'CSV file', extensions: ['csv'] },
      );
      if (!target) return { saved: false };
      const example = [templateExampleRow()];
      if (format === 'xlsx') await buildItemsWorkbook(example).xlsx.writeFile(target);
      else
        writeFileSync(
          target,
          toCsv(
            example,
            ITEM_IMPORT_COLUMNS.map((c) => c.key),
          ),
        );
      return { saved: true };
    },
    'import:open': async (_input, ctx) => {
      const win = windowOf(ctx);
      const options = {
        title: 'Choose the medicine list',
        properties: ['openFile' as const],
        filters: [{ name: 'Spreadsheet', extensions: ['xlsx', 'csv'] }],
      };
      const testPath = runtime.isPackaged ? undefined : process.env['AYYAZ_E2E_IMPORT_PATH'];
      const file =
        testPath ??
        (win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options))
          .filePaths[0];
      return file ? svc().imports.open(file) : null;
    },
    'import:preview': (options) => svc().imports.preview(options),
    'import:commit': (options, ctx) => {
      const backup = svc().backups.create('pre-import');
      return svc().imports.commit(options, requireUser(ctx).id, backup.fileName);
    },
    'import:errorFile': async (options, ctx) => {
      const target = await chooseSaveFile(windowOf(ctx), 'rejected-rows.xlsx', {
        name: 'Excel workbook',
        extensions: ['xlsx'],
      });
      if (!target) return { saved: false };
      await svc().imports.errorWorkbook(options).xlsx.writeFile(target);
      return { saved: true };
    },
  };

  function receiptHtml(ref: {
    kind: 'sale' | 'return' | 'test';
    id: number;
    copy: boolean;
  }): string {
    const shop = svc().settings.get('shop');
    if (ref.kind === 'test') return testReceiptHtml(shop);
    if (ref.kind === 'return') return returnReceiptHtml(shop, svc().returns.detail(ref.id));
    return saleReceiptHtml(shop, svc().sales.detail(ref.id), ref.copy);
  }
}

const can = (ctx: HandlerContext, permission: Permission) =>
  ctx.user?.permissions.includes(permission) ?? false;

async function chooseSaveFile(
  win: BrowserWindow | null,
  defaultPath: string,
  filter: { name: string; extensions: string[] },
): Promise<string | undefined> {
  const options = { defaultPath, filters: [filter] };
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  return result.canceled ? undefined : result.filePath;
}
