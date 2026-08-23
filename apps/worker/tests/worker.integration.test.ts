import { randomUUID } from 'node:crypto';

import {
  eventTypes,
  routingKeys,
  type ApplicationAcceptedData,
  type SkillBridgeEvent,
} from '@skillbridge/contracts';
import { createDatabaseClient } from '@skillbridge/database';
import amqp, { type ChannelModel } from 'amqplib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { NotificationConsumer } from '../src/notification-consumer.js';
import { OutboxRelay } from '../src/outbox-relay.js';
import { assertTopology, createTopology } from '../src/topology.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const rabbitUrl = process.env['RABBITMQ_URL'];

if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for worker tests.');
if (new URL(testDatabaseUrl).pathname.slice(1) !== 'skillbridge_test') {
  throw new Error('Refusing to run worker tests outside skillbridge_test.');
}
if (!rabbitUrl) throw new Error('RABBITMQ_URL is required for worker tests.');

const { pool } = createDatabaseClient({ DATABASE_POOL_MAX: 6, DATABASE_URL: testDatabaseUrl });
const topology = createTopology('skillbridge.test');
const connections: ChannelModel[] = [];
const eventIds: string[] = [];
const userIds: string[] = [];
let administrationConnection: ChannelModel;

const connect = async () => {
  const connection = await amqp.connect(rabbitUrl);
  connections.push(connection);
  return connection;
};

const eventually = async <T>(operation: () => Promise<T | undefined>, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await operation();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for asynchronous worker result.');
};

const createRecipient = async () => {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, '!worker-integration-login-disabled!') RETURNING id`,
    [`worker-${randomUUID()}@example.com`],
  );
  userIds.push(result.rows[0]!.id);
  return result.rows[0]!.id;
};

const createEvent = async (recipientId: string) => {
  const correlationId = `worker-test-${randomUUID()}`;
  const data: ApplicationAcceptedData = {
    applicantId: recipientId,
    applicationId: randomUUID(),
    managerId: randomUUID(),
    projectId: randomUUID(),
    projectTitle: 'Durable RabbitMQ project',
    recipientEmail: `worker-${randomUUID()}@example.com`,
  };
  const inserted = await pool.query<{ id: string; occurredAt: Date }>(
    `INSERT INTO outbox_events
       (aggregate_type, aggregate_id, event_type, routing_key, payload, correlation_id)
     VALUES ('PROJECT_APPLICATION', $1, $2, $3, $4::jsonb, $5)
     RETURNING id, occurred_at AS "occurredAt"`,
    [
      data.applicationId,
      eventTypes.applicationAccepted,
      routingKeys.applicationAccepted,
      JSON.stringify(data),
      correlationId,
    ],
  );
  const row = inserted.rows[0]!;
  eventIds.push(row.id);
  const event: SkillBridgeEvent = {
    correlationId,
    data,
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    type: eventTypes.applicationAccepted,
    version: 1,
  };
  return event;
};

beforeAll(async () => {
  await pool.query('SELECT 1 FROM outbox_events LIMIT 1');
  administrationConnection = await amqp.connect(rabbitUrl);
  const channel = await administrationConnection.createChannel();
  await assertTopology(channel, topology);
  await channel.close();
});

beforeEach(async () => {
  const channel = await administrationConnection.createChannel();
  for (const queue of [topology.notificationQueue, topology.retryQueue, topology.deadQueue]) {
    await channel.purgeQueue(queue);
  }
  await channel.close();
});

afterEach(async () => {
  while (connections.length > 0) await connections.pop()!.close();
  if (eventIds.length > 0) {
    const ids = eventIds.splice(0);
    await pool.query('DELETE FROM consumer_inbox WHERE message_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM outbox_events WHERE id = ANY($1::uuid[])', [ids]);
  }
  if (userIds.length > 0) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds.splice(0)]);
  }
});

afterAll(async () => {
  await administrationConnection.close();
  await pool.end();
});

describe('RabbitMQ outbox worker', () => {
  it('survives a publisher restart and deduplicates repeated delivery', async () => {
    const recipientId = await createRecipient();
    const expectedEvent = await createEvent(recipientId);

    const publisherConnection = await connect();
    const publisherChannel = await publisherConnection.createConfirmChannel();
    await assertTopology(publisherChannel, topology);
    const relay = new OutboxRelay(pool, publisherChannel, 10, 'worker-test-', topology);
    await expect(relay.runOnce()).resolves.toBe(1);
    await publisherConnection.close();
    connections.splice(connections.indexOf(publisherConnection), 1);

    const restartedConnection = await connect();
    const consumerChannel = await restartedConnection.createConfirmChannel();
    await assertTopology(consumerChannel, topology);
    const consumer = new NotificationConsumer(
      pool,
      consumerChannel,
      {
        maxAttempts: 2,
        prefetch: 1,
        retryDelayMs: 100,
      },
      topology,
    );
    await consumer.start();

    const notificationId = await eventually(async () => {
      const result = await pool.query<{ id: string }>(
        'SELECT id FROM notifications WHERE source_event_id = $1',
        [expectedEvent.id],
      );
      return result.rows[0]?.id;
    });
    expect(notificationId).toEqual(expect.any(String));

    await expect(consumer.process(expectedEvent)).resolves.toEqual({ duplicate: true });
    const counts = await pool.query<{ deliveries: number; inbox: number; notifications: number }>(
      `SELECT
         (SELECT count(*)::int FROM notifications WHERE source_event_id = $1) AS notifications,
         (SELECT count(*)::int FROM consumer_inbox WHERE message_id = $1) AS inbox,
         (SELECT count(*)::int FROM notification_deliveries WHERE notification_id = $2) AS deliveries`,
      [expectedEvent.id, notificationId],
    );
    expect(counts.rows[0]).toEqual({ deliveries: 1, inbox: 1, notifications: 1 });
  });

  it('rejects a poison message to the dead-letter queue', async () => {
    const connection = await connect();
    const channel = await connection.createConfirmChannel();
    await assertTopology(channel, topology);
    const consumer = new NotificationConsumer(
      pool,
      channel,
      {
        maxAttempts: 1,
        prefetch: 1,
        retryDelayMs: 100,
      },
      topology,
    );
    await consumer.start();
    channel.publish(topology.eventExchange, routingKeys.applicationAccepted, Buffer.from('{bad'), {
      deliveryMode: 2,
      messageId: randomUUID(),
    });
    await channel.waitForConfirms();

    await eventually(async () => {
      const state = await channel.checkQueue(topology.deadQueue);
      return state.messageCount > 0 ? state.messageCount : undefined;
    });
    const dead = await channel.get(topology.deadQueue, { noAck: false });
    expect(dead).not.toBe(false);
    if (dead) channel.ack(dead);
  });

  it('retries a transient consumer failure with backoff before dead-lettering', async () => {
    const recipientId = await createRecipient();
    const event = await createEvent(recipientId);
    await pool.query('DELETE FROM users WHERE id = $1', [recipientId]);

    const connection = await connect();
    const channel = await connection.createConfirmChannel();
    await assertTopology(channel, topology);
    const consumer = new NotificationConsumer(
      pool,
      channel,
      {
        maxAttempts: 1,
        prefetch: 1,
        retryDelayMs: 100,
      },
      topology,
    );
    await consumer.start();
    channel.publish(
      topology.eventExchange,
      routingKeys.applicationAccepted,
      Buffer.from(JSON.stringify(event)),
      { deliveryMode: 2, messageId: event.id },
    );
    await channel.waitForConfirms();

    await eventually(async () => {
      const state = await channel.checkQueue(topology.deadQueue);
      return state.messageCount > 0 ? state.messageCount : undefined;
    });
    const dead = await channel.get(topology.deadQueue, { noAck: false });
    expect(dead).not.toBe(false);
    if (dead) {
      expect(dead.properties.headers?.['x-skillbridge-attempt']).toBe(1);
      channel.ack(dead);
    }
  });
});
