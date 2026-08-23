import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createDatabaseClient } from '@skillbridge/database';
import newman from 'newman';

import { createApp } from '../src/app.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { DomainService } from '../src/modules/domain/domain.service.js';
import { RealtimeService } from '../src/modules/realtime/realtime.service.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for the Newman contract run.');
}

if (new URL(testDatabaseUrl).pathname.slice(1) !== 'skillbridge_test') {
  throw new Error('Refusing to run the Newman collection outside skillbridge_test.');
}

const { database, pool } = createDatabaseClient({
  DATABASE_POOL_MAX: 4,
  DATABASE_URL: testDatabaseUrl,
});
const tokenService = new TokenService({
  accessTokenTtlSeconds: 900,
  audience: 'postman-contract-clients',
  issuer: 'skillbridge-postman-runner',
  refreshTokenTtlDays: 30,
  secret: 'postman-contract-secret-with-at-least-32-characters',
});
const app = createApp({
  auth: {
    service: new AuthService(new AuthRepository(database), tokenService),
    tokenService,
  },
  checkReadiness: async () => {
    await pool.query('SELECT 1');
  },
  corsOrigin: 'http://localhost:5173',
  domain: { service: new DomainService(pool), tokenService },
  enableApiDocs: true,
  enableRequestLogging: false,
  realtime: { service: new RealtimeService(pool), tokenService },
});
const server = createServer(app);
const testEmail = `postman-${randomUUID()}@example.com`;
const applicantEmail = `postman-applicant-${randomUUID()}@example.com`;
const projectSlug = `postman-${randomUUID()}`;
const collectionPath = fileURLToPath(
  new URL('../../../postman/SkillBridge.postman_collection.json', import.meta.url),
);

const listen = () =>
  new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('The Newman test server did not expose a TCP port.'));
        return;
      }
      resolve(address.port);
    });
  });

const closeServer = () =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

try {
  await pool.query(
    `INSERT INTO skills (id, slug, name)
     VALUES ('00000000-0000-4000-8000-000000000199', 'domain-integration', 'Domain Integration')
     ON CONFLICT (id) DO NOTHING`,
  );
  const port = await listen();

  await new Promise<void>((resolve, reject) => {
    newman.run(
      {
        collection: collectionPath,
        envVar: [
          { key: 'baseUrl', value: `http://127.0.0.1:${port}` },
          { key: 'applicantEmail', value: applicantEmail },
          { key: 'projectSlug', value: projectSlug },
          { key: 'testEmail', value: testEmail },
          { key: 'testPassword', value: 'correct-horse-battery-staple' },
        ],
        reporters: ['cli'],
      },
      (error, summary) => {
        if (error) {
          reject(error);
          return;
        }

        const failures = summary.run.failures;
        if (failures.length > 0) {
          reject(new Error(`Newman reported ${failures.length} contract failure(s).`));
          return;
        }

        resolve();
      },
    );
  });
} finally {
  await pool.query(
    `DELETE FROM outbox_events
     WHERE payload->>'applicantId' IN
       (SELECT id::text FROM users WHERE email = ANY($1::text[]))`,
    [[testEmail, applicantEmail]],
  );
  await pool.query(
    'DELETE FROM projects WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))',
    [[testEmail, applicantEmail]],
  );
  await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [
    [testEmail, applicantEmail],
  ]);
  if (server.listening) {
    await closeServer();
  }
  await pool.end();
}
