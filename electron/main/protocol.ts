import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { APP_SCHEME } from './security/hardening';

/**
 * Serves the built UI from `app://ayyaz/…` instead of `file://`, as Electron's
 * security guide recommends. Requests are confined to the renderer folder.
 */
export function registerAppSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

export function handleAppProtocol(rendererDir: string): void {
  const root = resolve(rendererDir);
  protocol.handle(APP_SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const requested = resolve(root, `.${decodeURIComponent(pathname)}`);
    const rel = relative(root, requested);
    // Outside the renderer folder (or on another drive, where `relative` returns an absolute path).
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return new Response('Not found', { status: 404 });
    }
    // Client-side routes (no file extension) all load index.html.
    const file = /\.[a-z0-9]+$/i.test(requested) ? requested : resolve(root, 'index.html');
    return net.fetch(pathToFileURL(file).toString());
  });
}
