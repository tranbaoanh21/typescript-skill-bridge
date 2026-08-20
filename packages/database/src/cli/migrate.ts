import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { readDatabaseEnvironment } from '../config.js';

const environment = readDatabaseEnvironment();
const pool = new Pool({
  connectionString: environment.DATABASE_DIRECT_URL ?? environment.DATABASE_URL,
  max: 1,
});

try {
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: resolve(import.meta.dirname, '../../drizzle'),
  });
  console.info('Database migrations completed.');
} finally {
  await pool.end();
}
