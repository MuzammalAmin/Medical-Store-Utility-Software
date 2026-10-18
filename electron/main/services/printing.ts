import { BrowserWindow, webContents } from 'electron';
import { logger } from '../logger';

/**
 * Prints a self-contained HTML page (receipts, reports) through a hidden,
 * script-free window. With a printer name it prints silently (counter use);
 * without one it shows the Windows print dialog.
 */
export async function printHtml(html: string, deviceName: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: deviceName !== '',
          ...(deviceName ? { deviceName } : {}),
          printBackground: true,
          margins: { marginType: 'none' },
        },
        (success, reason) => {
          // Windows reports a closed print dialog as "Print job canceled".
          if (success || /cancel/i.test(reason)) resolve();
          else reject(new Error(`Printing failed: ${reason}`));
        },
      );
    });
  } catch (error) {
    logger.error('Printing failed', error);
    throw error;
  } finally {
    win.destroy();
  }
}

/** Renders HTML to a PDF buffer (A4) for report exports. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
  } finally {
    win.destroy();
  }
}

export async function listPrinters(): Promise<{ name: string; displayName: string }[]> {
  const contents = webContents.getAllWebContents()[0];
  if (!contents) return [];
  const printers = await contents.getPrintersAsync();
  return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name }));
}
