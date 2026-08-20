import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { DatabaseEnvironment } from './config.js';
export const createDatabaseClient = (environment: DatabaseEnvironment) => {
  const pool = new Pool({
    connectionString: environment.DATABASE_URL,
    max: environment.DATABASE_POOL_MAX,
  });
  const database = drizzle({ client: pool });

  return { database, pool };
};

export type DatabaseClient = ReturnType<typeof createDatabaseClient>['database'];
