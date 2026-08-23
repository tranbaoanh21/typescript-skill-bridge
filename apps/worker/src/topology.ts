import { routingKeys } from '@skillbridge/contracts';
import type { Channel } from 'amqplib';

export const createTopology = (namespace = 'skillbridge') => ({
  deadExchange: `${namespace}.dlx.v1`,
  deadQueue: `${namespace}.notifications.dead.v1`,
  deadRoutingKey: 'notification.dead',
  eventExchange: `${namespace}.events.v1`,
  notificationQueue: `${namespace}.notifications.v1`,
  retryQueue: `${namespace}.notifications.retry.v1`,
});

export type MessagingTopology = ReturnType<typeof createTopology>;
export const topology = createTopology();

const quorum = { 'x-queue-type': 'quorum' };

export const assertTopology = async (channel: Channel, selected = topology) => {
  await channel.assertExchange(selected.eventExchange, 'topic', { durable: true });
  await channel.assertExchange(selected.deadExchange, 'direct', { durable: true });
  await channel.assertQueue(selected.notificationQueue, {
    arguments: {
      ...quorum,
      'x-dead-letter-exchange': selected.deadExchange,
      'x-dead-letter-routing-key': selected.deadRoutingKey,
    },
    durable: true,
  });
  await channel.bindQueue(
    selected.notificationQueue,
    selected.eventExchange,
    routingKeys.applicationAccepted,
  );
  await channel.assertQueue(selected.retryQueue, {
    arguments: {
      ...quorum,
      'x-dead-letter-exchange': selected.eventExchange,
      'x-dead-letter-routing-key': routingKeys.applicationAccepted,
    },
    durable: true,
  });
  await channel.assertQueue(selected.deadQueue, { arguments: quorum, durable: true });
  await channel.bindQueue(selected.deadQueue, selected.deadExchange, selected.deadRoutingKey);
};
