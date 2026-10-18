import { app, BrowserWindow, dialog } from 'electron';
import { createHandlers } from './ipc/handlers';
import { registerIpc } from './ipc/router';
import { initLogging } from './log';
import { logger } from './logger';
import { resolvePaths } from './paths';
import { handleAppProtocol, registerAppSchemePrivileges } from './protocol';
import { Runtime } from './runtime';
import { applyAppHardening, isTrustedSender } from './security/hardening';
import { KeyStore } from './security/keystore';
import { createMainWindow, preloadPath, rendererDir } from './window';

// One instance only: two copies writing the same SQLite file would be unsafe.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerAppSchemePrivileges();
  void start();
}

async function start(): Promise<void> {
  // Development and automated tests only: keep test data out of the real AppData folder.
  const devUserData = process.env['AYYAZ_USER_DATA'];
  if (!app.isPackaged && devUserData) app.setPath('userData', devUserData);

  await app.whenReady();
  const paths = resolvePaths({
    userData: app.getPath('userData'),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appRoot: app.getAppPath(),
  });
  initLogging(paths.logs);
  logger.info(`Starting Ayyaz Pharmacy Manager ${app.getVersion()}`);

  applyAppHardening();
  handleAppProtocol(rendererDir());

  const runtime = new Runtime(
    paths,
    new KeyStore(paths.keystore),
    app.getVersion(),
    app.isPackaged,
  );
  try {
    runtime.boot();
  } catch (error) {
    logger.error('Start-up failed', error);
    dialog.showErrorBox('Ayyaz Pharmacy Manager', `The app could not start.\n\n${String(error)}`);
    app.exit(1);
    return;
  }
  registerIpc(runtime, createHandlers(runtime), isTrustedSender);

  let mainWindow = createMainWindow(preloadPath());

  app.on('second-instance', () => {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow(preloadPath());
  });
  app.on('window-all-closed', () => app.quit());

  let shutDown = false;
  app.on('before-quit', () => {
    if (shutDown) return;
    shutDown = true;
    runtime.shutdown();
    logger.info('Shut down cleanly');
  });
}
