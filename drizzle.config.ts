import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside the Nest DI container, so it reads (and checks)
// DATABASE_URL itself rather than going through src/common/config.
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL is not set — see .env.example.');
}

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
