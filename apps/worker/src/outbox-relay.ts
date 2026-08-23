import { once } from 'node:events';

import type { IntegrationEventEnvelope } from '@skillbridge/contracts';
import type { DatabasePool } from '@skillbridge/database';
import type { ConfirmChannel } from 'amqplib';

import { topology, type MessagingTopology } from './topology.js';

interface PendingOutboxEvent {
  attempts: number;
  correlationId: string;
  eventType: string;
  eventVersion: 1;
  id: string;
  occurredAt: Date;
  payload: unknown;
  routingKey: string;
}

export class OutboxRelay {
  constructor(
    private readonly pool: DatabasePool,
    private readonly channel: ConfirmChannel,
    private readonly batchSize: number,
    private readonly correlationPrefix?: string,
    private readonly messaging: MessagingTopology = topology,
  ) {}

  async runOnce() {
    const client = await this.pool.connect();
    let published = 0;
    try {
      await client.query('BEGIN');
      const pending = await client.query<PendingOutboxEvent>(
        `SELECT id, event_type AS "eventType", event_version AS "eventVersion",
                routing_key AS "routingKey", payload, correlation_id AS "correlationId",
                attempts, occurred_at AS "occurredAt"
         FROM outbox_events
         WHERE published_at IS NULL AND next_attempt_at <= now()
           AND ($2::text IS NULL OR correlation_id LIKE $2 || '%')
         ORDER BY occurred_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT $1`,
        [this.batchSize, this.correlationPrefix ?? null],
      );

      for (const event of pending.rows) {
        const envelope: IntegrationEventEnvelope<string, unknown> = {
          correlationId: event.correlationId,
          data: event.payload,
          id: event.id,
          occurredAt: event.occurredAt.toISOString(),
          type: event.eventType,
          version: event.eventVersion,
        };
        try {
          if (
            !this.channel.publish(
              this.messaging.eventExchange,
              event.routingKey,
              Buffer.from(JSON.stringify(envelope)),
              {
                contentType: 'application/json',
                correlationId: event.correlationId,
                deliveryMode: 2,
                messageId: event.id,
                timestamp: event.occurredAt.getTime(),
                type: event.eventType,
              },
            )
          ) {
            await once(this.channel, 'drain');
          }
          await this.channel.waitForConfirms();
          await client.query(
            `UPDATE outbox_events
             SET published_at = now(), attempts = attempts + 1, last_error = NULL
             WHERE id = $1`,
            [event.id],
          );
          published += 1;
        } catch (error) {
          const delaySeconds = Math.min(60, 2 ** Math.min(event.attempts, 6));
          await client.query(
            `UPDATE outbox_events
             SET attempts = attempts + 1,
                 next_attempt_at = now() + make_interval(secs => $2),
                 last_error = left($3, 2000)
             WHERE id = $1`,
            [event.id, delaySeconds, error instanceof Error ? error.message : String(error)],
          );
          break;
        }
      }
      await client.query('COMMIT');
      return published;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
