import { createDatabaseClient } from '../client.js';
import { readDatabaseEnvironment } from '../config.js';

const environment = readDatabaseEnvironment();
const { pool } = createDatabaseClient(environment);

try {
  const result = await pool.query<{ 'QUERY PLAN': unknown }>(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT p.id, p.slug, p.title, p.created_at
    FROM projects AS p
    WHERE p.status = 'RECRUITING'
    ORDER BY p.created_at DESC
    LIMIT 20
  `);

  console.info(JSON.stringify(result.rows[0]?.['QUERY PLAN'] ?? null, null, 2));
} finally {
  await pool.end();
}
