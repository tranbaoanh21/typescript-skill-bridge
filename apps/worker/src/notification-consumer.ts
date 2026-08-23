import { once } from 'node:events';

import { eventTypes, type SkillBridgeEvent } from '@skillbridge/contracts';
import type { DatabasePool, DatabasePoolClient } from '@skillbridge/database';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { z } from 'zod';

import { topology, type MessagingTopology } from './topology.js';

const eventSchema = z.object({
  correlationId: z.string().min(1).max(100),
  data: z.object({
    applicantId: z.uuid(),
    applicationId: z.uuid(),
    managerId: z.uuid(),
    projectId: z.uuid(),
    projectTitle: z.string().min(1).max(180),
    recipientEmail: z.email(),
  }),
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  type: z.literal(eventTypes.applicationAccepted),
  version: z.literal(1),
});

export interface NotificationConsumerOptions {
  maxAttempts: number;
  prefetch: number;
  retryDelayMs: number;
}

const consumerName = 'notification-worker-v1';

export class NotificationConsumer {
  constructor(
    private readonly pool: DatabasePool,
    private readonly channel: ConfirmChannel,
    private readonly options: NotificationConsumerOptions,
    private readonly messaging: MessagingTopology = topology,
  ) {}

  async start() {
    await this.channel.prefetch(this.options.prefetch);
    await this.channel.consume(
      this.messaging.notificationQueue,
      (message) => {
        if (message) void this.handle(message);
      },
      { noAck: false },
    );
  }

  async process(event: SkillBridgeEvent) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const claimed = await client.query(
        `INSERT INTO consumer_inbox (consumer_name, message_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING message_id`,
        [consumerName, event.id],
      );
      if (!claimed.rows[0]) {
        await client.query('COMMIT');
        return { duplicate: true };
      }

      const notification = await this.insertNotification(client, event);
      await client.query(
        `INSERT INTO notification_deliveries
           (notification_id, channel, recipient, status, provider_message_id)
         VALUES ($1, 'EMAIL', $2, 'SIMULATED', $3)
         ON CONFLICT (notification_id, channel) DO NOTHING`,
        [notification.id, event.data.recipientEmail, `simulated:${event.id}`],
      );
      await client.query('COMMIT');
      console.info('Notification and simulated email created.', {
        correlationId: event.correlationId,
        eventId: event.id,
        notificationId: notification.id,
      });
      return { duplicate: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async handle(message: ConsumeMessage) {
    let event: SkillBridgeEvent;
    try {
      event = eventSchema.parse(JSON.parse(message.content.toString()));
    } catch (error) {
      console.error('Poison integration event rejected to DLQ.', error);
      this.channel.nack(message, false, false);
      return;
    }

    try {
      await this.process(event);
      this.channel.ack(message);
    } catch (error) {
      const attemptHeader = message.properties.headers?.['x-skillbridge-attempt'];
      const attempt = typeof attemptHeader === 'number' ? attemptHeader : 0;
      if (attempt >= this.options.maxAttempts) {
        console.error('Integration event exhausted retries and is going to DLQ.', error);
        this.channel.nack(message, false, false);
        return;
      }

      try {
        if (
          !this.channel.sendToQueue(this.messaging.retryQueue, message.content, {
            contentType: 'application/json',
            correlationId: event.correlationId,
            deliveryMode: 2,
            expiration: String(this.options.retryDelayMs * (attempt + 1)),
            headers: { 'x-skillbridge-attempt': attempt + 1 },
            messageId: event.id,
            type: event.type,
          })
        ) {
          await once(this.channel, 'drain');
        }
        await this.channel.waitForConfirms();
        this.channel.ack(message);
      } catch (retryError) {
        console.error('Could not confirm retry publication; requeueing original.', retryError);
        this.channel.nack(message, false, true);
      }
    }
  }

  private async insertNotification(client: DatabasePoolClient, event: SkillBridgeEvent) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO notifications
         (source_event_id, recipient_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (source_event_id) DO UPDATE SET source_event_id = EXCLUDED.source_event_id
       RETURNING id`,
      [
        event.id,
        event.data.applicantId,
        event.type,
        'Application accepted',
        `You joined ${event.data.projectTitle}. Open the workspace to meet your team.`,
        JSON.stringify({
          applicationId: event.data.applicationId,
          projectId: event.data.projectId,
        }),
      ],
    );
    return inserted.rows[0]!;
  }
}
