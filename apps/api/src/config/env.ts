import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
});

export type Environment = z.infer<typeof envSchema>;

export const readEnvironment = (environment: NodeJS.ProcessEnv = process.env): Environment =>
  envSchema.parse(environment);
