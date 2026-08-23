import amqp from 'amqplib';
import { createDatabaseClient } from '@skillbridge/database';

import { readWorkerEnvironment } from './config.js';
import { createHealthServer } from './health.js';
import { NotificationConsumer } from './notification-consumer.js';
import { OutboxRelay } from './outbox-relay.js';
import { assertTopology } from './topology.js';

const environment = readWorkerEnvironment();
const { pool } = createDatabaseClient(environment);
const connection = await amqp.connect(environment.RABBITMQ_URL);
let rabbitReady = true;
let shuttingDown = false;
connection.on('error', (error) => console.error('RabbitMQ connection error.', error));
connection.on('close', () => {
  rabbitReady = false;
  if (!shuttingDown) {
    console.error('RabbitMQ connection closed; worker will exit for supervisor restart.');
    process.exit(1);
  }
});

const publisherChannel = await connection.createConfirmChannel();
const consumerChannel = await connection.createConfirmChannel();
await assertTopology(publisherChannel);
await assertTopology(consumerChannel);
const relay = new OutboxRelay(pool, publisherChannel, environment.OUTBOX_BATCH_SIZE);
const consumer = new NotificationConsumer(pool, consumerChannel, {
  maxAttempts: environment.RETRY_MAX_ATTEMPTS,
  prefetch: environment.RABBITMQ_PREFETCH,
  retryDelayMs: environment.RETRY_DELAY_MS,
});
await consumer.start();

let relayRunning = false;
const poll = async () => {
  if (relayRunning) return;
  relayRunning = true;
  try {
    await relay.runOnce();
  } catch (error) {
    console.error('Outbox relay poll failed.', error);
  } finally {
    relayRunning = false;
  }
};
await poll();
const pollTimer = setInterval(() => void poll(), environment.OUTBOX_POLL_INTERVAL_MS);
pollTimer.unref();

const healthServer = createHealthServer(pool, () => rabbitReady);
healthServer.listen(environment.WORKER_HEALTH_PORT, '0.0.0.0', () => {
  console.info(`SkillBridge worker health listening on :${environment.WORKER_HEALTH_PORT}`);
});

const shutdown = async (signal: NodeJS.Signals) => {
  shuttingDown = true;
  console.info(`${signal} received. Closing worker.`);
  clearInterval(pollTimer);
  await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  rabbitReady = false;
  await consumerChannel.close();
  await publisherChannel.close();
  await connection.close();
  await pool.end();
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
