import { createServer } from 'node:http';

import type { DatabasePool } from '@skillbridge/database';

export const createHealthServer = (pool: DatabasePool, rabbitReady: () => boolean) =>
  createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/health/live') {
      response.writeHead(200).end(JSON.stringify({ service: 'skillbridge-worker', status: 'ok' }));
      return;
    }
    if (request.url === '/health/ready') {
      try {
        await pool.query('SELECT 1');
        if (!rabbitReady()) throw new Error('RabbitMQ unavailable');
        response.writeHead(200).end(
          JSON.stringify({
            dependencies: { database: 'ready', rabbitmq: 'ready' },
            service: 'skillbridge-worker',
            status: 'ok',
          }),
        );
      } catch {
        response
          .writeHead(503)
          .end(JSON.stringify({ service: 'skillbridge-worker', status: 'unavailable' }));
      }
      return;
    }
    response.writeHead(404).end(JSON.stringify({ status: 'not-found' }));
  });
