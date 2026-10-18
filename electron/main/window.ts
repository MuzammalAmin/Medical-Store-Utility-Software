import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { APP_ORIGIN, devServerUrl } from './security/hardening';

export function createMainWindow(preloadPath: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#F8FAFC',
    title: 'Ayyaz Pharmacy Manager',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  win.removeMenu();
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  const dev = devServerUrl();
  void (dev ? win.loadURL(dev) : win.loadURL(`${APP_ORIGIN}/index.html`));
  return win;
}

export const preloadPath = () => join(import.meta.dirname, '../preload/index.cjs');
export const rendererDir = () => join(import.meta.dirname, '../renderer');
