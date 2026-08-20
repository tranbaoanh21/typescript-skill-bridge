import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];

if (!databaseUrl) {
  throw new Error('DATABASE_DIRECT_URL or DATABASE_URL is required for database commands.');
}

export default defineConfig({
  dbCredentials: {
    url: databaseUrl,
  },
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/schema.ts',
  strict: true,
  verbose: true,
});
