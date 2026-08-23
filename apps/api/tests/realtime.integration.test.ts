import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import type {
  ClientToServerEvents,
  ProjectMessage,
  ServerToClientEvents,
} from '@skillbridge/contracts';
import { createDatabaseClient } from '@skillbridge/database';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { DomainEventBus } from '../src/modules/domain/domain.events.js';
import { DomainService } from '../src/modules/domain/domain.service.js';
import { attachRealtimeServer } from '../src/modules/realtime/realtime.server.js';
import { RealtimeService } from '../src/modules/realtime/realtime.service.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];

if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for realtime tests.');
if (new URL(testDatabaseUrl).pathname.slice(1) !== 'skillbridge_test') {
  throw new Error('Refusing to run realtime tests outside skillbridge_test.');
}

type RealtimeClient = Socket<ServerToClientEvents, ClientToServerEvents>;

const { database, pool } = createDatabaseClient({
  DATABASE_POOL_MAX: 8,
  DATABASE_URL: testDatabaseUrl,
});
const tokenService = new TokenService({
  accessTokenTtlSeconds: 900,
  audience: 'realtime-test-clients',
  issuer: 'skillbridge-realtime-tests',
  refreshTokenTtlDays: 30,
  secret: 'realtime-integration-secret-with-at-least-32-characters',
});
const domainEvents = new DomainEventBus();
const realtimeService = new RealtimeService(pool);
const app = createApp({
  auth: {
    service: new AuthService(new AuthRepository(database), tokenService),
    tokenService,
  },
  corsOrigin: 'http://localhost:5173',
  domain: { service: new DomainService(pool, domainEvents), tokenService },
  enableRequestLogging: false,
  realtime: { service: realtimeService, tokenService },
});
const httpServer = createServer(app);
const realtimeServer = attachRealtimeServer({
  corsOrigin: 'http://localhost:5173',
  domainEvents,
  httpServer,
  pool,
  presenceTtlMs: 60,
  tokenService,
  typingTtlMs: 60,
});
const createdEmails: string[] = [];
const clients = new Set<RealtimeClient>();
const password = 'correct-horse-battery-staple';
let realtimeUrl = '';

const bearer = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });

const registerUser = async (label: string) => {
  const email = `realtime-${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const response = await request(app).post('/api/v1/auth/register').send({
    displayName: label,
    email,
    password,
  });
  expect(response.status).toBe(201);
  return {
    accessToken: response.body.data.tokens.accessToken as string,
    id: response.body.data.user.id as string,
  };
};

const connectClient = (accessToken?: string) => {
  const client: RealtimeClient = createSocketClient(realtimeUrl, {
    auth: accessToken ? { token: accessToken } : {},
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  clients.add(client);
  return client;
};

const waitForConnection = (client: RealtimeClient) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connection timed out.')), 3_000);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    client.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

beforeAll(async () => {
  await pool.query('SELECT 1 FROM drizzle.__drizzle_migrations LIMIT 1');
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const address = httpServer.address();
  if (!address || typeof address === 'string')
    throw new Error('Realtime test server did not bind.');
  realtimeUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  for (const client of clients) client.disconnect();
  clients.clear();
  if (createdEmails.length === 0) return;
  const emails = createdEmails.splice(0);
  await pool.query(
    'DELETE FROM projects WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))',
    [emails],
  );
  await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
});

afterAll(async () => {
  await new Promise<void>((resolve) => realtimeServer.close(() => resolve()));
  await pool.end();
});

describe('Socket.IO realtime collaboration', () => {
  it('rejects a socket without a valid access token', async () => {
    const client = connectClient();
    const error = await new Promise<Error>((resolve) => client.once('connect_error', resolve));
    expect(error.message).toBe('AUTHENTICATION_REQUIRED');
  });

  it('authorizes rooms, persists before broadcast, recovers missed events, and relays tasks', async () => {
    const owner = await registerUser('Realtime Owner');
    const member = await registerUser('Realtime Member');
    const outsider = await registerUser('Realtime Outsider');
    const project = await request(app)
      .post('/api/v1/projects')
      .set(bearer(owner.accessToken))
      .send({
        capacity: 4,
        description: 'A realtime integration project with durable messages and task events.',
        slug: `realtime-${randomUUID()}`,
        title: 'Realtime Integration Project',
      });
    expect(project.status).toBe(201);
    const projectId = project.body.data.project.id as string;
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, project_role) VALUES ($1, $2, 'MEMBER')",
      [projectId, member.id],
    );

    const ownerClient = connectClient(owner.accessToken);
    const memberClient = connectClient(member.accessToken);
    const outsiderClient = connectClient(outsider.accessToken);
    await Promise.all([
      waitForConnection(ownerClient),
      waitForConnection(memberClient),
      waitForConnection(outsiderClient),
    ]);

    const outsiderJoin = await outsiderClient.emitWithAck('project:join', { projectId });
    expect(outsiderJoin).toMatchObject({
      error: { code: 'PROJECT_MEMBERSHIP_REQUIRED' },
      ok: false,
    });

    const ownerJoin = await ownerClient.emitWithAck('project:join', { projectId });
    expect(ownerJoin).toMatchObject({ ok: true });
    const memberJoin = await memberClient.emitWithAck('project:join', { projectId });
    expect(memberJoin.ok && memberJoin.data.onlineUserIds.sort()).toEqual(
      [owner.id, member.id].sort(),
    );

    const persistedBroadcast = new Promise<{ count: number; message: ProjectMessage }>(
      (resolve) => {
        memberClient.once('message:created', async (message) => {
          const persisted = await pool.query<{ count: number }>(
            'SELECT count(*)::int AS count FROM project_messages WHERE id = $1',
            [message.id],
          );
          resolve({ count: persisted.rows[0]!.count, message });
        });
      },
    );
    const clientMessageId = randomUUID();
    const sent = await ownerClient.emitWithAck('message:send', {
      body: 'Persist this decision before anyone receives it.',
      clientMessageId,
      projectId,
    });
    expect(sent.ok).toBe(true);
    const firstDelivery = await persistedBroadcast;
    expect(firstDelivery.count).toBe(1);
    expect(firstDelivery.message.body).toContain('Persist this decision');

    const duplicate = await ownerClient.emitWithAck('message:send', {
      body: 'A retry must return the original durable message.',
      clientMessageId,
      projectId,
    });
    if (!sent.ok || !duplicate.ok) throw new Error('Message acknowledgements should succeed.');
    expect(duplicate.data.message.id).toBe(sent.data.message.id);
    const duplicateCount = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM project_messages WHERE sender_id = $1 AND client_message_id = $2',
      [owner.id, clientMessageId],
    );
    expect(duplicateCount.rows[0]!.count).toBe(1);

    memberClient.disconnect();
    clients.delete(memberClient);
    const missed = await ownerClient.emitWithAck('message:send', {
      body: 'This message is sent while the member is reconnecting.',
      clientMessageId: randomUUID(),
      projectId,
    });
    expect(missed.ok).toBe(true);

    const reconnectedMember = connectClient(member.accessToken);
    await waitForConnection(reconnectedMember);
    const recovered = await reconnectedMember.emitWithAck('project:join', {
      afterMessageId: firstDelivery.message.id,
      projectId,
    });
    expect(recovered.ok && recovered.data.messages.map((message) => message.id)).toContain(
      missed.ok ? missed.data.message.id : '',
    );

    const typingEvents: boolean[] = [];
    const typingExpired = new Promise<void>((resolve) => {
      reconnectedMember.on('typing:changed', (event) => {
        if (event.userId !== owner.id) return;
        typingEvents.push(event.active);
        if (!event.active) resolve();
      });
    });
    const typingAck = await ownerClient.emitWithAck('typing:set', { active: true, projectId });
    expect(typingAck.ok).toBe(true);
    await typingExpired;
    expect(typingEvents).toEqual([true, false]);

    const taskChanged = new Promise<{ action: string; taskId: string }>((resolve) => {
      reconnectedMember.once('task:changed', async (event) => {
        const persisted = await pool.query('SELECT 1 FROM tasks WHERE id = $1', [event.task.id]);
        expect(persisted.rows[0]).toBeTruthy();
        resolve({ action: event.action, taskId: event.task.id });
      });
    });
    const task = await request(app)
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set(bearer(owner.accessToken))
      .send({ assigneeIds: [member.id], priority: 'HIGH', title: 'Broadcast after commit' });
    expect(task.status).toBe(201);
    await expect(taskChanged).resolves.toEqual({
      action: 'CREATED',
      taskId: task.body.data.task.id,
    });

    const restRecovery = await request(app)
      .get(`/api/v1/projects/${projectId}/messages`)
      .query({ afterMessageId: firstDelivery.message.id })
      .set(bearer(member.accessToken));
    expect(restRecovery.status).toBe(200);
    expect(restRecovery.body.data.messages).toHaveLength(1);
  });
});
