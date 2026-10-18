import { defineConfig } from 'drizzle-kit';

// Used only to generate SQL migrations from the schema; the app applies them at start-up.
export default defineConfig({
  dialect: 'sqlite',
  schema: './electron/main/db/schema.ts',
  out: './db/migrations',
});
