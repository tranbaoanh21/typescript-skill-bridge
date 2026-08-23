import { resolve } from 'node:path';

import { createDatabaseClient, seedDatabase } from '@skillbridge/database';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const defaultTestDatabaseUrl =
  'postgresql://skillbridge:skillbridge@127.0.0.1:5434/skillbridge_test';

export default async () => {
  const databaseUrl = process.env['E2E_DATABASE_URL'] ?? defaultTestDatabaseUrl;
  if (new URL(databaseUrl).pathname.slice(1) !== 'skillbridge_test') {
    throw new Error(
      'Playwright setup refuses to migrate or seed a database not named skillbridge_test.',
    );
  }

  const migrationPool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle({ client: migrationPool }), {
      migrationsFolder: resolve(process.cwd(), 'packages/database/drizzle'),
    });
  } finally {
    await migrationPool.end();
  }

  const { database, pool } = createDatabaseClient({
    DATABASE_POOL_MAX: 2,
    DATABASE_URL: databaseUrl,
  });
  try {
    await seedDatabase(database);
  } finally {
    await pool.end();
  }
};
