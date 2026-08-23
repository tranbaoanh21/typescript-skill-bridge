import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  REDIS_URL: z.string().startsWith('redis://').optional(),
  CACHE_PROJECT_LIST_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
  CACHE_PROJECT_DETAIL_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(30),
  PRESENCE_TTL_SECONDS: z.coerce.number().int().min(5).max(300).default(30),
  ENABLE_API_DOCS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  AUTH_TOKEN_ISSUER: z.string().min(1).default('skillbridge-api'),
  AUTH_TOKEN_AUDIENCE: z.string().min(1).default('skillbridge-clients'),
});

export type Environment = z.infer<typeof envSchema>;

export const readEnvironment = (environment: NodeJS.ProcessEnv = process.env): Environment =>
  envSchema.parse(environment);
