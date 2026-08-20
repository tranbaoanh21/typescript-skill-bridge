import { createDatabaseClient } from '../client.js';
import { readDatabaseEnvironment } from '../config.js';
import { seedDatabase } from '../seed.js';

const environment = readDatabaseEnvironment();
const { database, pool } = createDatabaseClient(environment);

try {
  await seedDatabase(database);
  console.info('Database seed completed.');
} finally {
  await pool.end();
}
