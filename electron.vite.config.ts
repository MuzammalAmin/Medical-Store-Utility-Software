import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const root = import.meta.dirname;
const alias = {
  '@': resolve(root, 'src'),
  '@shared': resolve(root, 'shared'),
};

/**
 * Production CSP is declared in src/index.html. Vite's dev server needs inline
 * scripts (React refresh) and a websocket, so loosen it only while serving.
 */
function devCsp(): Plugin {
  return {
    name: 'ayyaz:dev-csp',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws://localhost:* http://localhost:*"),
  };
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rolldownOptions: { input: { index: resolve(root, 'electron/main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      rolldownOptions: {
        input: { index: resolve(root, 'electron/preload/index.ts') },
        // Sandboxed preload scripts must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(root, 'src'),
    resolve: { alias },
    plugins: [react(), tailwindcss(), devCsp()],
    build: {
      rolldownOptions: { input: { index: resolve(root, 'src/index.html') } },
    },
  },
});
