# RabbitMQ outbox and notification worker

Phase 12 moves durable asynchronous work out of the API request lifecycle. PostgreSQL records the business change and integration event atomically; a separate worker relays the event through RabbitMQ and creates the in-app notification plus a simulated email delivery record.

## Why transactional outbox

Publishing directly from `POST /applications/{id}/decision` creates a dual-write problem: PostgreSQL could commit while RabbitMQ publish fails, or RabbitMQ could receive an event for a transaction that later rolls back. The outbox makes the database commit the only decision point.

```mermaid
sequenceDiagram
    actor Owner
    participant API
    participant DB as PostgreSQL
    participant Relay as Outbox relay
    participant MQ as RabbitMQ
    participant Consumer as Notification consumer

    Owner->>API: Accept application (x-request-id)
    API->>DB: BEGIN
    API->>DB: UPDATE application + INSERT membership
    API->>DB: INSERT outbox event + correlation ID
    API->>DB: COMMIT
    API-->>Owner: 200 accepted
    Relay->>DB: SELECT pending FOR UPDATE SKIP LOCKED
    Relay->>MQ: persistent publish
    MQ-->>Relay: publisher confirm
    Relay->>DB: mark published
    MQ->>Consumer: manual-ack delivery
    Consumer->>DB: inbox claim + notification + email delivery
    Consumer->>MQ: ACK after DB commit
```

If RabbitMQ is unavailable, accepting an application still succeeds and leaves a pending outbox row. The relay retries later. A confirmed publish may still be delivered more than once if the relay crashes before marking the row published, so consumers must remain idempotent.

## Event envelope

Shared TypeScript types live in `@skillbridge/contracts`. RabbitMQ messages use JSON and persistent delivery mode:

```json
{
  "id": "outbox-event-uuid",
  "type": "application.accepted",
  "version": 1,
  "occurredAt": "2026-08-24T00:00:00.000Z",
  "correlationId": "request-id-from-api",
  "data": {
    "applicationId": "uuid",
    "applicantId": "uuid",
    "managerId": "uuid",
    "projectId": "uuid",
    "projectTitle": "HCMUT SkillBridge",
    "recipientEmail": "student@hcmut.edu.vn"
  }
}
```

The event UUID is also the AMQP `messageId` and the idempotency key in `consumer_inbox`. The API request ID flows through the outbox row, message property, event envelope, and worker log as the correlation ID.

## Topology

```mermaid
flowchart LR
    Outbox[(outbox_events)] --> Relay[Confirm publisher]
    Relay -->|notification.application.accepted| Events{{skillbridge.events.v1 topic}}
    Events --> Main[[skillbridge.notifications.v1 quorum queue]]
    Main --> Consumer[Notification worker]
    Consumer -->|temporary failure| Retry[[retry quorum queue]]
    Retry -->|TTL / dead-letter| Events
    Main -->|poison or exhausted| DLX{{skillbridge.dlx.v1}}
    DLX --> Dead[[skillbridge.notifications.dead.v1 DLQ]]
```

| Resource                             | Durability/reliability                                             |
| ------------------------------------ | ------------------------------------------------------------------ |
| `skillbridge.events.v1`              | Durable topic exchange                                             |
| `skillbridge.notifications.v1`       | Durable quorum queue, manual ack, DLX configured                   |
| `skillbridge.notifications.retry.v1` | Durable quorum queue, persistent messages, per-message backoff TTL |
| `skillbridge.dlx.v1`                 | Durable direct dead-letter exchange                                |
| `skillbridge.notifications.dead.v1`  | Durable quorum DLQ for inspection/replay decisions                 |

The relay uses a confirm channel and marks `published_at` only after `waitForConfirms()`. Consumers use configurable `prefetch` (default 10) so one process cannot reserve an unbounded number of messages.

## Retry, idempotency, and poison messages

- A valid event whose database side effect fails is republished to the retry queue with `x-skillbridge-attempt` and increasing delay.
- The retry queue dead-letters it back to the event exchange after the TTL.
- When the configured attempt limit is reached, the original queue rejects it without requeue and RabbitMQ routes it to the DLQ.
- Invalid JSON or an invalid version/schema is poison and goes directly to the DLQ.
- `consumer_inbox (consumer_name, message_id)` is claimed in the same PostgreSQL transaction as notification creation. Duplicate delivery commits no additional side effect.
- `notifications.source_event_id` and `(notification_id, channel)` add defense-in-depth unique constraints.

The email adapter is intentionally `SIMULATED` in this learning phase: the worker creates an auditable `notification_deliveries` record with a stable provider ID rather than contacting a real person. A later provider can replace this adapter while retaining event IDs and idempotency rules.

## Failure matrix

| Failure point                                   | Result                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| API transaction rolls back                      | Membership and outbox both disappear; no event exists            |
| RabbitMQ unavailable                            | API business transaction remains committed; outbox stays pending |
| Publisher crashes before confirm                | Outbox remains pending and publishes later                       |
| Publisher crashes after confirm, before DB mark | Duplicate publish is possible; inbox makes it harmless           |
| Worker crashes before DB commit                 | RabbitMQ redelivers because no ack was sent                      |
| Worker crashes after DB commit, before ack      | RabbitMQ redelivers; inbox recognizes duplicate                  |
| Poison event                                    | Rejected to DLQ for observation, never loops forever             |

## Local operation

The full stack starts API and worker as separate non-root production containers:

```bash
npm run docker:up
docker compose -f infrastructure/docker/compose.yaml logs -f worker
```

RabbitMQ Management is available at `http://localhost:15672` with credentials from `infrastructure/docker/.env`. Worker readiness checks both PostgreSQL and RabbitMQ internally on port 3001.

Run the complete integration topology:

```bash
TEST_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test \
REDIS_URL=redis://:skillbridge-redis@localhost:6379 \
RABBITMQ_URL=amqp://skillbridge:skillbridge-rabbit@localhost:5672/skillbridge \
npm run test:integration
```

Tests close the publishing connection before starting a consumer to prove queue durability, deliver the same event twice to prove idempotency, and verify retry exhaustion plus malformed payloads reach the DLQ.
