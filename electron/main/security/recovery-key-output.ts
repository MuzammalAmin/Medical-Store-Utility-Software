import { writeFileSync } from 'node:fs';
import { app, BrowserWindow, dialog } from 'electron';

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function instructions(shopName: string, recoveryKey: string): string[] {
  return [
    `${shopName} | Ayyaz Pharmacy Manager`,
    'DATABASE RECOVERY KEY',
    '',
    recoveryKey,
    '',
    'Keep this key somewhere safe and private, away from the shop computer.',
    'You need it to restore a backup on a new or reinstalled computer.',
    'Without this key, the encrypted backups CANNOT be opened by anyone.',
    `Saved on: ${new Date().toLocaleString('en-PK')}`,
  ];
}

/** Asks where to save the key as a text file (e.g. on a USB drive). Returns false if cancelled. */
export async function saveRecoveryKeyFile(
  parent: BrowserWindow | null,
  shopName: string,
  recoveryKey: string,
): Promise<boolean> {
  const options = {
    title: 'Save recovery key',
    defaultPath: 'Ayyaz-Pharmacy-Recovery-Key.txt',
    filters: [{ name: 'Text file', extensions: ['txt'] }],
  };
  // Automated end-to-end tests can't click a native dialog, so in development
  // they may name the target file instead. Ignored in the packaged app.
  const testTarget = app.isPackaged ? undefined : process.env['AYYAZ_E2E_SAVE_PATH'];
  const filePath = testTarget ?? (await showSaveDialog(parent, options));
  if (!filePath) return false;
  writeFileSync(filePath, `${instructions(shopName, recoveryKey).join('\r\n')}\r\n`, 'utf8');
  return true;
}

async function showSaveDialog(
  parent: BrowserWindow | null,
  options: Electron.SaveDialogOptions,
): Promise<string | undefined> {
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options);
  return result.canceled ? undefined : result.filePath;
}

/** Prints the key on the normal (A4) printer through the system print dialog. */
/** Returns false when the print dialog was cancelled. */
export async function printRecoveryKey(shopName: string, recoveryKey: string): Promise<boolean> {
  const lines = instructions(shopName, recoveryKey).map(escapeHtml);
  const html = `<!doctype html><meta charset="utf-8"><title>Recovery key</title>
<style>body{font:14px system-ui,sans-serif;margin:48px;color:#000}h1{font-size:20px}
.key{font:bold 20px ui-monospace,Consolas,monospace;letter-spacing:1px;border:2px solid #000;padding:16px;margin:24px 0;word-break:break-all}</style>
<h1>${lines[0]}</h1><h2>${lines[1]}</h2><div class="key">${lines[3]}</div>${lines
    .slice(5)
    .map((line) => `<p>${line}</p>`)
    .join('')}`;

  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await new Promise<boolean>((resolve, reject) => {
      win.webContents.print({ silent: false, printBackground: true }, (success, reason) =>
        success || /cancel/i.test(reason) ? resolve(success) : reject(new Error(reason)),
      );
    });
  } finally {
    win.destroy();
  }
}
