import 'dotenv/config';

import { z } from 'zod';

const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://'),
  DATABASE_DIRECT_URL: z.string().startsWith('postgresql://').optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
});

export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;

export const readDatabaseEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseEnvironment => databaseEnvironmentSchema.parse(environment);
