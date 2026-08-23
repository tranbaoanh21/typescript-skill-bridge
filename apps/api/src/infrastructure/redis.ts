import { createClient, type RedisClientType } from 'redis';

export interface RedisInfrastructure {
  command: RedisClientType;
  publisher: RedisClientType;
  subscriber: RedisClientType;
}

const quietlyDestroy = (client: RedisClientType) => {
  if (client.isOpen) client.destroy();
};

const withStartupTimeout = async (connections: Promise<unknown>) => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Redis startup connection timed out.')), 2_000);
    timer.unref();
  });
  try {
    await Promise.race([connections, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const connectRedisInfrastructure = async (
  url: string | undefined,
): Promise<RedisInfrastructure | undefined> => {
  if (!url) return undefined;

  const command = createClient({
    socket: {
      connectTimeout: 1_500,
      reconnectStrategy: (retries) => Math.min(100 + retries * 100, 2_000),
    },
    url,
  });
  const publisher = command.duplicate();
  const subscriber = command.duplicate();
  const clients = [command, publisher, subscriber];

  for (const client of clients) {
    client.on('error', (error) => console.warn('Redis client error; continuing fail-open.', error));
  }

  try {
    await withStartupTimeout(Promise.all(clients.map((client) => client.connect())));
    return { command, publisher, subscriber };
  } catch (error) {
    for (const client of clients) quietlyDestroy(client);
    console.warn(
      'Redis is unavailable; cache, distributed presence, and Pub/Sub are disabled.',
      error,
    );
    return undefined;
  }
};

export const closeRedisInfrastructure = async (infrastructure: RedisInfrastructure | undefined) => {
  if (!infrastructure) return;
  for (const client of [
    infrastructure.subscriber,
    infrastructure.publisher,
    infrastructure.command,
  ]) {
    if (client.isOpen) await client.close();
  }
};
