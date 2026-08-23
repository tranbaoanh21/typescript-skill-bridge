import 'dotenv/config';

import { z } from 'zod';

const schema = z.object({
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  RABBITMQ_PREFETCH: z.coerce.number().int().min(1).max(100).default(10),
  RABBITMQ_URL: z.string().startsWith('amqp://'),
  RETRY_DELAY_MS: z.coerce.number().int().min(100).max(300_000).default(5_000),
  RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(0).max(20).default(3),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
});

export type WorkerEnvironment = z.infer<typeof schema>;

export const readWorkerEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): WorkerEnvironment => schema.parse(environment);
