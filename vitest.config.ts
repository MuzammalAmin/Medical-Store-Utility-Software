import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      '@shared': resolve(import.meta.dirname, 'shared'),
    },
  },
  test: {
    include: ['shared/**/*.test.ts', 'electron/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Database tests share one native module; run files in separate processes.
    pool: 'forks',
    // PIN hashing is deliberately slow (scrypt), so auth tests need more than the 5 s default.
    testTimeout: 20_000,
  },
});
