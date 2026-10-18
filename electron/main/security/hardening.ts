import { app, session, shell, type IpcMainInvokeEvent } from 'electron';
import { logger } from '../logger';

/**
 * App-wide Electron hardening (PRD §6.2), following Electron's security checklist:
 * no permissions, no new windows, no navigation away from the app, and IPC
 * accepted only from the app's own pages.
 */
export const APP_SCHEME = 'app';
const APP_HOST = 'ayyaz';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** Dev server URL from electron-vite, only ever set while developing. */
export const devServerUrl = (): string | undefined =>
  !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined;

export function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Node reports origin "null" for custom schemes, so compare scheme and host instead.
    if (parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST) return true;
    const dev = devServerUrl();
    return dev !== undefined && parsed.origin === new URL(dev).origin;
  } catch {
    return false;
  }
}

export function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  return frame !== null && frame.parent === null && isAppUrl(frame.url);
}

export function applyAppHardening(): void {
  // No camera, microphone, notifications, geolocation… the app needs none of them.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    logger.warn(`Denied permission request: ${permission}`);
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      // Allow only plain https links (e.g. help pages) to open in the real browser.
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url)) {
        event.preventDefault();
        logger.warn(`Blocked navigation to ${url}`);
      }
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}
