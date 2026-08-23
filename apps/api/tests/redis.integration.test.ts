import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import type { ClientToServerEvents, ServerToClientEvents } from '@skillbridge/contracts';
import { createDatabaseClient } from '@skillbridge/database';
import { createClient, type RedisClientType } from 'redis';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { RedisProjectCache } from '../src/modules/cache/project.cache.js';
import { DomainEventBus } from '../src/modules/domain/domain.events.js';
import { DomainService } from '../src/modules/domain/domain.service.js';
import { RedisPresenceStore } from '../src/modules/realtime/presence.store.js';
import { attachRealtimeServer } from '../src/modules/realtime/realtime.server.js';
import { RealtimeService } from '../src/modules/realtime/realtime.service.js';
import { createAuthRateLimiter } from '../src/modules/security/rate-limit.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const redisUrl = process.env['REDIS_URL'];

if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for Redis integration tests.');
if (new URL(testDatabaseUrl).pathname.slice(1) !== 'skillbridge_test') {
  throw new Error('Refusing to run Redis integration tests outside skillbridge_test.');
}
if (!redisUrl) throw new Error('REDIS_URL is required for Redis integration tests.');

type RealtimeClient = Socket<ServerToClientEvents, ClientToServerEvents>;

const { database, pool } = createDatabaseClient({
  DATABASE_POOL_MAX: 10,
  DATABASE_URL: testDatabaseUrl,
});
const redis = createClient({ url: redisUrl });
const tokenService = new TokenService({
  accessTokenTtlSeconds: 900,
  audience: 'redis-test-clients',
  issuer: 'skillbridge-redis-tests',
  refreshTokenTtlDays: 30,
  secret: 'redis-integration-secret-with-at-least-32-characters',
});
const authService = new AuthService(new AuthRepository(database), tokenService);
const createdEmails: string[] = [];
const clients = new Set<RealtimeClient>();
const servers: HttpServer[] = [];
const socketServers: ReturnType<typeof attachRealtimeServer>[] = [];
const adapterClients: RedisClientType[] = [];

const bearer = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });

const registerUser = async (app: ReturnType<typeof createApp>, label: string) => {
  const email = `redis-${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const response = await request(app).post('/api/v1/auth/register').send({
    displayName: label,
    email,
    password: 'correct-horse-battery-staple',
  });
  expect(response.status).toBe(201);
  return {
    accessToken: response.body.data.tokens.accessToken as string,
    id: response.body.data.user.id as string,
  };
};

const clearNamespace = async () => {
  const keys = await redis.keys('skillbridge:v1:*');
  if (keys.length > 0) await redis.del(keys);
};

const listen = async (server: HttpServer) => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  return `http://127.0.0.1:${address.port}`;
};

const connect = async (url: string, accessToken: string) => {
  const client: RealtimeClient = createSocketClient(url, {
    auth: { token: accessToken },
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  clients.add(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  return client;
};

beforeAll(async () => {
  await redis.connect();
  await pool.query('SELECT 1 FROM drizzle.__drizzle_migrations LIMIT 1');
});

beforeEach(clearNamespace);

afterEach(async () => {
  for (const client of clients) client.disconnect();
  clients.clear();
  while (socketServers.length > 0) {
    const socketServer = socketServers.pop()!;
    await new Promise<void>((resolve) => socketServer.close(() => resolve()));
  }
  servers.length = 0;
  while (adapterClients.length > 0) {
    const client = adapterClients.pop()!;
    if (client.isOpen) await client.close();
  }
  if (createdEmails.length > 0) {
    const emails = createdEmails.splice(0);
    await pool.query(
      'DELETE FROM projects WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))',
      [emails],
    );
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
  }
});

afterAll(async () => {
  await clearNamespace();
  await redis.close();
  await pool.end();
});

describe('Redis acceleration and coordination', () => {
  it('serves cache hits and invalidates discovery immediately after a durable mutation', async () => {
    const cache = new RedisProjectCache(redis, { detailTtlSeconds: 60, listTtlSeconds: 60 });
    const domainEvents = new DomainEventBus();
    const app = createApp({
      auth: { service: authService, tokenService },
      corsOrigin: 'http://localhost:5173',
      domain: { service: new DomainService(pool, domainEvents, cache), tokenService },
      enableRequestLogging: false,
      projectCache: cache,
    });
    const owner = await registerUser(app, 'Cache Owner');
    const slug = `cache-${randomUUID()}`;
    const description = `Cache invalidation integration project ${slug}.`;
    const created = await request(app)
      .post('/api/v1/projects')
      .set(bearer(owner.accessToken))
      .send({
        capacity: 3,
        description,
        slug,
        title: 'Before cache mutation',
      });
    const projectId = created.body.data.project.id as string;
    await request(app)
      .post(`/api/v1/projects/${projectId}/transitions`)
      .set(bearer(owner.accessToken))
      .send({ action: 'PUBLISH', version: 1 });

    const first = await request(app).get('/api/v1/projects').query({ search: slug });
    const second = await request(app).get('/api/v1/projects').query({ search: slug });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(cache.getMetrics()).toMatchObject({ hits: 1, misses: 1 });

    const updated = await request(app)
      .patch(`/api/v1/projects/${projectId}`)
      .set(bearer(owner.accessToken))
      .send({ title: 'After cache mutation', version: 2 });
    expect(updated.status).toBe(200);
    const refreshed = await request(app).get('/api/v1/projects').query({ search: slug });
    expect(refreshed.body.data.items[0].title).toBe('After cache mutation');
    expect(cache.getMetrics()).toMatchObject({ hits: 1, misses: 2 });

    const metrics = await request(app).get('/health/cache');
    expect(metrics.body.cache).toMatchObject({ enabled: true, hits: 1, misses: 2 });
  });

  it('rate-limits authentication atomically and fails open when Redis is absent', async () => {
    const limitedApp = createApp({
      auth: {
        rateLimiter: createAuthRateLimiter(redis, { limit: 2, windowSeconds: 60 }),
        service: authService,
        tokenService,
      },
      corsOrigin: 'http://localhost:5173',
      enableRequestLogging: false,
    });
    const payload = { email: `missing-${randomUUID()}@example.com`, password: 'invalid-password' };
    expect((await request(limitedApp).post('/api/v1/auth/login').send(payload)).status).toBe(401);
    expect((await request(limitedApp).post('/api/v1/auth/login').send(payload)).status).toBe(401);
    const limited = await request(limitedApp).post('/api/v1/auth/login').send(payload);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMIT_EXCEEDED');

    const failOpenApp = createApp({
      auth: {
        rateLimiter: createAuthRateLimiter(undefined, { limit: 1, windowSeconds: 60 }),
        service: authService,
        tokenService,
      },
      corsOrigin: 'http://localhost:5173',
      enableRequestLogging: false,
    });
    expect((await request(failOpenApp).post('/api/v1/auth/login').send(payload)).status).toBe(401);
  });

  it('broadcasts durable messages across two API instances through Redis Pub/Sub', async () => {
    const buses = [new DomainEventBus(), new DomainEventBus()];
    const apps = buses.map((domainEvents) =>
      createApp({
        auth: { service: authService, tokenService },
        corsOrigin: 'http://localhost:5173',
        domain: { service: new DomainService(pool, domainEvents), tokenService },
        enableRequestLogging: false,
        realtime: { service: new RealtimeService(pool), tokenService },
      }),
    );
    const urls: string[] = [];
    for (const [index, app] of apps.entries()) {
      const publisher = redis.duplicate();
      const subscriber = redis.duplicate();
      await Promise.all([publisher.connect(), subscriber.connect()]);
      adapterClients.push(publisher, subscriber);
      const httpServer = createServer(app);
      servers.push(httpServer);
      socketServers.push(
        attachRealtimeServer({
          corsOrigin: 'http://localhost:5173',
          domainEvents: buses[index]!,
          httpServer,
          pool,
          presenceStore: new RedisPresenceStore(redis),
          presenceTtlMs: 1_000,
          redisAdapter: { publisher, subscriber },
          tokenService,
        }),
      );
      urls.push(await listen(httpServer));
    }

    const owner = await registerUser(apps[0]!, 'Instance A Owner');
    const member = await registerUser(apps[0]!, 'Instance B Member');
    const project = await request(apps[0]!)
      .post('/api/v1/projects')
      .set(bearer(owner.accessToken))
      .send({
        capacity: 3,
        description: 'Two API instances share durable realtime events.',
        slug: `multi-${randomUUID()}`,
        title: 'Multi-instance realtime',
      });
    const projectId = project.body.data.project.id as string;
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, project_role) VALUES ($1, $2, 'MEMBER')",
      [projectId, member.id],
    );

    const ownerClient = await connect(urls[0]!, owner.accessToken);
    const memberClient = await connect(urls[1]!, member.accessToken);
    expect((await ownerClient.emitWithAck('project:join', { projectId })).ok).toBe(true);
    expect((await memberClient.emitWithAck('project:join', { projectId })).ok).toBe(true);
    const received = new Promise<string>((resolve) =>
      memberClient.once('message:created', (message) => resolve(message.body)),
    );
    const sent = await ownerClient.emitWithAck('message:send', {
      body: 'Redis carries this event from instance A to instance B.',
      clientMessageId: randomUUID(),
      projectId,
    });
    expect(sent.ok).toBe(true);
    await expect(received).resolves.toContain('instance A to instance B');
    const persisted = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM project_messages WHERE project_id = $1',
      [projectId],
    );
    expect(persisted.rows[0]?.count).toBe(1);
  });
});
